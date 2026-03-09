// server/jobs/transport-package-job.js

const db = require('../db-wrapper.js');
const { axios, escapeCSV, CPI_API_PATH_SUFFIX } = require('../utils.js');
const { logJobExecution, logInfo, logError } = require('../cloud-logger.js');
const { getOAuthToken, getCSRFToken } = require('./shared/auth-helper.js');
const { createJobLogger, createResultsStream } = require('./shared/logger-helper.js');
const { updateProgress, setTotal, updateStatus } = require('./shared/progress-tracker.js');
const { TRANSPORT_CSV_HEADERS } = require('./constants.js');
const AdmZip = require('adm-zip');

/**
 * Edits the iFlow zip file by appending suffix to the iFlow ID in MANIFEST.MF and renaming .iflw file
 * @param {Buffer} zipContent - The original zip file content
 * @param {string} iflowId - The iFlow ID
 * @param {string} suffix - The suffix to append
 * @returns {Promise<Buffer>} - The edited zip file content
 */
async function editIflowZipWithSuffix(zipContent, iflowId, suffix) {
    try {
        logInfo('Starting zip file editing with suffix', { iflowId, suffix, zipContentSize: zipContent.length });
        console.log('=== EDITING IFLOW ZIP ===');
        console.log('Original iFlow ID:', iflowId);
        console.log('Suffix to append:', suffix);

        const sourceZip = new AdmZip(Buffer.from(zipContent));
        const newZip = new AdmZip();
        
        const newIflowId = iflowId + suffix;
        const originalIflwFileName = `${iflowId}.iflw`;
        const newIflwFileName = `${newIflowId}.iflw`;
        
        let manifestEdited = false;
        let iflwFileRenamed = false;

        logInfo(`Processing zip file`, { entriesCount: sourceZip.getEntries().length });

        // Process each entry and add to new zip
        for (const entry of sourceZip.getEntries()) {
            let entryName = entry.entryName;
            let entryData = entry.getData();
            
            // Handle .iflw file renaming
            if (entryName.endsWith(originalIflwFileName)) {
                entryName = entryName.replace(originalIflwFileName, newIflwFileName);
                iflwFileRenamed = true;
                logInfo('Renamed .iflw file', { 
                    originalName: entry.entryName,
                    newName: entryName,
                    fileSize: entryData.length
                });
                console.log('✅ Renamed .iflw file:');
                console.log('  From:', entry.entryName);
                console.log('  To:', entryName);
            }
            
            // Handle MANIFEST.MF content update
            if (entryName.endsWith('MANIFEST.MF')) {
                const manifestContent = entryData.toString('utf8');
                const editedManifestContent = manifestContent.replaceAll(iflowId, newIflowId);
                
                if (manifestContent !== editedManifestContent) {
                    entryData = Buffer.from(editedManifestContent, 'utf8');
                    manifestEdited = true;
                    logInfo('Updated MANIFEST.MF file with suffix', { 
                        originalIflowId: iflowId,
                        newIflowId: newIflowId,
                        originalSize: manifestContent.length, 
                        newSize: editedManifestContent.length 
                    });
                    console.log('✅ MANIFEST.MF updated successfully');
                    console.log('  New iFlow ID:', newIflowId);
                    console.log('  Original size:', manifestContent.length, 'bytes');
                    console.log('  New size:', editedManifestContent.length, 'bytes');
                }
            }
            
            // Add entry to new zip (preserving directory structure)
            if (entry.isDirectory) {
                newZip.addFile(entryName, Buffer.alloc(0), '', entry.header.flags);
            } else {
                newZip.addFile(entryName, entryData, '', entry.header.flags);
            }
        }

        if (!iflwFileRenamed) {
            logInfo('No .iflw file found to rename', { searchPattern: originalIflwFileName });
            console.log('⚠️  WARNING: No .iflw file found matching:', originalIflwFileName);
        }

        if (!manifestEdited) {
            logInfo('No changes made to MANIFEST.MF');
            console.log('⚠️  WARNING: No changes made to MANIFEST.MF');
        }

        const newZipContent = newZip.toBuffer();
        logInfo('Generated edited zip file', { 
            size: newZipContent.length,
            iflwFileRenamed,
            manifestEdited 
        });
        console.log('✅ Edited zip generated:');
        console.log('  Size:', newZipContent.length, 'bytes');
        console.log('  .iflw file renamed:', iflwFileRenamed);
        console.log('  MANIFEST.MF updated:', manifestEdited);
        console.log('=========================');

        // Verify the new zip is valid
        new AdmZip(newZipContent);

        return newZipContent;
    } catch (error) {
        logError('Failed to edit iFlow zip file with suffix', error);
        throw new Error(`Failed to edit iFlow zip file: ${error.message}`);
    }
}

/**
 * Executes a package transport job to create a new package with suffix and transport all iFlows
 * @param {number} jobId - The transport job ID
 * @returns {Promise<void>}
 */
async function runTransportPackageJob(jobId) {
    logInfo('Transport package job execution starting', { jobId });
    
    try {
        // Get job data
        const job = await db.getDownloadJobById(jobId);
        logInfo('Job data retrieved', { jobId, status: job.status, hasFormData: !!job.form_data_json });
        
        const { formData } = JSON.parse(job.form_data_json);
        logInfo('Form data parsed', {
            projectName: formData.projectName,
            environment: formData.environment,
            sourcePackageId: formData.sourcePackageId,
            targetPackageSuffix: formData.targetPackageSuffix
        });
        
        let { projectName, environment, userName, cpiBaseUrl, tokenUrl, clientId, clientSecret, sourcePackageId, targetPackageSuffix } = formData;

        // Automatically append API path suffix to CPI Base URL
        if (cpiBaseUrl && !cpiBaseUrl.endsWith(CPI_API_PATH_SUFFIX)) {
            cpiBaseUrl = cpiBaseUrl.replace(/\/$/, '') + CPI_API_PATH_SUFFIX;
        }

        // Create logger and result file
        const executionTimestamp = new Date(job.created_at);
        const { logger, logFilePath, formattedTimestamp } = createJobLogger(executionTimestamp, 'transport_package');
        const { resultsStream, resultsFilePath } = createResultsStream(
            executionTimestamp,
            TRANSPORT_CSV_HEADERS,
            `${projectName}_${environment}_package_transport_results`
        );

        let finalStatus = 'Failed';
        let progress = 0;
        const jobStartTime = Date.now();

        let iflowsTransported = 0;
        let iflowsFailed = 0;
        let targetPackageId = '';
        let targetPackageName = '';

        try {
            // Update job to 'Running'
            console.log('=== TRANSPORT PACKAGE JOB STARTING ===');
            console.log('Job ID:', jobId);
            await updateStatus(jobId, 'transport', 'Running');
            await db.updateDownloadJob(jobId, { progress_message: 'Initializing package transport...' });

            // Get Auth Token
            await db.updateDownloadJob(jobId, { progress_message: 'Authenticating with SAP CPI...' });
            const accessToken = await getOAuthToken(tokenUrl, clientId, clientSecret, logger);
            const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

            // Get CSRF Token (for create/upload operations)
            const csrfToken = await getCSRFToken(cpiBaseUrl, accessToken, logger);

            // Step 1: Get source package details
            await db.updateDownloadJob(jobId, { progress_message: 'Fetching source package details...' });
            logger.info('Step 1: Fetching source package details...');
            const sourcePackageUrl = `${cpiBaseUrl}/IntegrationPackages('${sourcePackageId}')`;
            let sourcePackage = null;

            try {
                const sourcePackageResponse = await axios.get(sourcePackageUrl, { headers: authHeader });
                sourcePackage = sourcePackageResponse.data.d;
                logger.info(`Successfully fetched source package: ${sourcePackage.Name}`);
            } catch (sourceError) {
                const errorMsg = sourceError.response ? JSON.stringify(sourceError.response.data) : sourceError.message;
                logger.error(`Error fetching source package: ${errorMsg}`);
                throw new Error(`Failed to fetch source package: ${errorMsg}`);
            }

            // Step 2: Create target package with suffix
            logger.info('Step 2: Creating target package with suffix...');
            targetPackageId = sourcePackage.Id + targetPackageSuffix;
            targetPackageName = sourcePackage.Name + targetPackageSuffix;

            const targetPackageData = {
                Id: targetPackageId,
                Name: targetPackageName,
                Description: sourcePackage.Description || '',
                ShortText: sourcePackage.ShortText || '',
                Version: sourcePackage.Version || '1.0.0',
                Products: sourcePackage.Products || '',
                Keywords: sourcePackage.Keywords || '',
                Countries: sourcePackage.Countries || '',
                Industries: sourcePackage.Industries || '',
                LineOfBusiness: sourcePackage.LineOfBusiness || ''
            };

            try {
                const createPackageUrl = `${cpiBaseUrl}/IntegrationPackages`;
                await axios.post(createPackageUrl, targetPackageData, {
                    headers: {
                        ...authHeader,
                        'X-CSRF-Token': csrfToken,
                        'Content-Type': 'application/json'
                    }
                });
                logger.info(`Successfully created target package: ${targetPackageName} (${targetPackageId})`);
            } catch (createError) {
                const errorMsg = createError.response ? JSON.stringify(createError.response.data) : createError.message;
                logger.error(`Error creating target package: ${errorMsg}`);
                throw new Error(`Failed to create target package: ${errorMsg}`);
            }

            // Step 3: Get all iFlows in source package
            logger.info('Step 3: Fetching all iFlows in source package...');
            const iflowsUrl = `${cpiBaseUrl}/IntegrationPackages('${sourcePackageId}')/IntegrationDesigntimeArtifacts`;
            let iflows = [];

            try {
                const iflowsResponse = await axios.get(iflowsUrl, { headers: authHeader });
                iflows = iflowsResponse.data.d.results || [];
                logger.info(`Found ${iflows.length} iFlows in source package`);
            } catch (iflowsError) {
                const errorMsg = iflowsError.response ? JSON.stringify(iflowsError.response.data) : iflowsError.message;
                logger.error(`Error fetching iFlows: ${errorMsg}`);
                throw new Error(`Failed to fetch iFlows: ${errorMsg}`);
            }

            if (iflows.length === 0) {
                logger.info('No iFlows found in source package. Package transport complete.');
                finalStatus = 'Complete';
                await setTotal(jobId, 'transport', 1);
                await updateProgress(jobId, 'transport', 1, 1);
            } else {
                // Set total progress (number of iFlows to transport)
                await setTotal(jobId, 'transport', iflows.length);

                // Step 4: Loop through and transport each iFlow
                logger.info(`Step 4: Transporting ${iflows.length} iFlows...`);

                for (let i = 0; i < iflows.length; i++) {
                    const iflow = iflows[i];
                    logger.info(`Processing iFlow ${i + 1}/${iflows.length}: ${iflow.Name} (${iflow.Id})`);
                    await db.updateDownloadJob(jobId, { 
                        progress_message: `Transporting iFlow ${i + 1}/${iflows.length}: ${iflow.Name}` 
                    });

                    try {
                        // Download iFlow zip
                        await db.updateDownloadJob(jobId, { 
                            progress_message: `[${i + 1}/${iflows.length}] Downloading ${iflow.Name}...` 
                        });
                        const downloadUrl = `${cpiBaseUrl}/IntegrationDesigntimeArtifacts(Id='${iflow.Id}',Version='${iflow.Version}')/$value`;
                        const zipResponse = await axios.get(downloadUrl, {
                            headers: authHeader,
                            responseType: 'arraybuffer'
                        });
                        const zipContent = Buffer.from(zipResponse.data);
                        logger.info(`Downloaded iFlow ${iflow.Name} (${zipContent.length} bytes)`);

                        // Edit zip file to append suffix to iFlow ID
                        await db.updateDownloadJob(jobId, { 
                            progress_message: `[${i + 1}/${iflows.length}] Processing ${iflow.Name}...` 
                        });
                        console.log(`\n=== TRANSPORTING IFLOW ${i + 1}/${iflows.length} ===`);
                        console.log('iFlow Name:', iflow.Name);
                        console.log('Original iFlow ID:', iflow.Id);
                        const editedZipContent = await editIflowZipWithSuffix(zipContent, iflow.Id, targetPackageSuffix);

                        // Upload to target package with new ID
                        await db.updateDownloadJob(jobId, { 
                            progress_message: `[${i + 1}/${iflows.length}] Uploading ${iflow.Name}${targetPackageSuffix}...` 
                        });
                        const newIflowId = iflow.Id + targetPackageSuffix;
                        console.log('Target Package ID:', targetPackageId);
                        console.log('New iFlow Name:', iflow.Name + targetPackageSuffix);
                        console.log('Uploading as:', newIflowId);
                        const base64Content = editedZipContent.toString('base64');

                        const uploadUrl = `${cpiBaseUrl}/IntegrationDesigntimeArtifacts`;
                        console.log('Upload URL:', uploadUrl);
                        const uploadBody = {
                            Id: newIflowId,
                            Name: iflow.Name + targetPackageSuffix,
                            PackageId: targetPackageId,
                            ArtifactContent: base64Content
                        };
                        console.log('Upload Body (metadata only):', {
                            Id: uploadBody.Id,
                            Name: uploadBody.Name,
                            PackageId: uploadBody.PackageId,
                            ArtifactContentLength: base64Content
                        });
                        console.log('Sending POST request to upload iFlow...');

                        await axios.post(uploadUrl, uploadBody, {
                            headers: {
                                ...authHeader,
                                'X-CSRF-Token': csrfToken,
                                'Content-Type': 'application/json'
                            }
                        });

                        logger.info(`Successfully transported iFlow: ${iflow.Name} -> ${iflow.Name}${targetPackageSuffix}`);
                        console.log('✅ SUCCESS: iFlow transported successfully');
                        console.log('=====================================\n');
                        
                        // Write success to CSV
                        const resultRow = [
                            escapeCSV(sourcePackageId),
                            escapeCSV(targetPackageId),
                            escapeCSV(iflow.Id),
                            escapeCSV(newIflowId),
                            '200',
                            'Success'
                        ];
                        resultsStream.write(resultRow.join(',') + '\n');

                        // Insert individual transport log entry for this iFlow
                        try {
                            const iflowTransportLogData = {
                                projectName: projectName || 'Unknown',
                                environment: environment || 'Unknown',
                                userName: userName || 'Unknown',
                                timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                                status: 'Complete',
                                sourcePackageId: sourcePackageId || 'N/A',
                                targetPackageId: targetPackageId || 'N/A',
                                sourceIflowId: iflow.Id,
                                targetIflowId: newIflowId,
                                sourceIflowName: iflow.Name,
                                targetIflowName: iflow.Name + targetPackageSuffix,
                                timeTakenSeconds: Math.round((Date.now() - jobStartTime) / 1000)
                            };
                            
                            await db.insertTransportLog(iflowTransportLogData);
                            logger.info(`Transport log created for iFlow: ${iflow.Name}`, { sourceIflowId: iflow.Id, targetIflowId: newIflowId });
                        } catch (logError) {
                            logger.error(`Failed to insert transport log for iFlow ${iflow.Name}:`, logError);
                        }

                        iflowsTransported++;
                    } catch (iflowError) {
                        const errorMsg = iflowError.response ? JSON.stringify(iflowError.response.data) : iflowError.message;
                        logger.error(`Failed to transport iFlow ${iflow.Name}: ${errorMsg}`);
                        
                        // Write error to CSV
                        const errorRow = [
                            escapeCSV(sourcePackageId),
                            escapeCSV(targetPackageId),
                            escapeCSV(iflow.Id),
                            escapeCSV(iflow.Id + targetPackageSuffix),
                            'N/A',
                            escapeCSV(errorMsg)
                        ];
                        resultsStream.write(errorRow.join(',') + '\n');

                        iflowsFailed++;
                        console.log('❌ FAILED: iFlow transport failed');
                        console.log('Error:', errorMsg);
                        console.log('=====================================\n');
                        
                        // Insert individual transport log entry for failed iFlow
                        try {
                            const newIflowId = iflow.Id + targetPackageSuffix;
                            const iflowTransportLogData = {
                                projectName: projectName || 'Unknown',
                                environment: environment || 'Unknown',
                                userName: userName || 'Unknown',
                                timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                                status: 'Failed',
                                sourcePackageId: sourcePackageId || 'N/A',
                                targetPackageId: targetPackageId || 'N/A',
                                sourceIflowId: iflow.Id,
                                targetIflowId: newIflowId,
                                sourceIflowName: iflow.Name,
                                targetIflowName: iflow.Name + targetPackageSuffix,
                                timeTakenSeconds: Math.round((Date.now() - jobStartTime) / 1000)
                            };
                            
                            await db.insertTransportLog(iflowTransportLogData);
                            logger.info(`Transport log created for failed iFlow: ${iflow.Name}`, { sourceIflowId: iflow.Id, error: errorMsg });
                        } catch (logError) {
                            logger.error(`Failed to insert transport log for failed iFlow ${iflow.Name}:`, logError);
                        }
                    }

                    // Update progress
                    progress = i + 1;
                    await updateProgress(jobId, 'transport', progress, iflows.length);
                }

                logger.info('Package transport processing complete.');
                finalStatus = iflowsFailed === 0 ? 'Complete' : 'Partial';
            }

            // Log successful completion
            logJobExecution('transport_package', jobId, finalStatus, {
                projectName,
                environment,
                userName,
                sourcePackageId,
                targetPackageId,
                targetPackageSuffix,
                iFlowsTransported: iflowsTransported,
                iFlowsFailed: iflowsFailed
            });

        } catch (error) {
            const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
            logger.error(`FATAL PACKAGE TRANSPORT ERROR: ${errorMsg}`);
            finalStatus = 'Failed';

            // Log failure
            logJobExecution('transport_package', jobId, 'Failed', {
                projectName,
                environment,
                userName,
                sourcePackageId,
                targetPackageSuffix,
                error: errorMsg
            });

            // Insert transport log entry for package-level failure
            try {
                const packageTransportLogData = {
                    projectName: projectName || 'Unknown',
                    environment: environment || 'Unknown',
                    userName: userName || 'Unknown',
                    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    status: 'Failed',
                    sourcePackageId: sourcePackageId || 'N/A',
                    targetPackageId: targetPackageId || sourcePackageId + targetPackageSuffix || 'N/A',
                    sourceIflowId: 'PACKAGE_LEVEL_ERROR',
                    targetIflowId: 'PACKAGE_LEVEL_ERROR',
                    sourceIflowName: 'Package Transport Failed',
                    targetIflowName: errorMsg,
                    timeTakenSeconds: Math.round((Date.now() - jobStartTime) / 1000)
                };
                
                await db.insertTransportLog(packageTransportLogData);
                logger.info('Transport log created for package-level failure', { error: errorMsg });
            } catch (logError) {
                logger.error('Failed to insert transport log for package-level failure:', logError);
            }

        } finally {
            // Calculate time taken
            const timeTakenSeconds = Math.round((Date.now() - jobStartTime) / 1000);

            // Close streams
            const { closeLogger, closeStream } = require('./shared/logger-helper.js');
            await closeStream(resultsStream);
            await closeLogger(logger);

            // Update job status with final progress
            const updatedJob = await db.getDownloadJobById(jobId);
            await db.updateDownloadJob(jobId, {
                status: finalStatus,
                progress: (finalStatus === 'Complete' || finalStatus === 'Partial') ? updatedJob.total : progress
            });

            // Note: Individual transport logs are now created for each iFlow during the transport loop
            // No summary log entry is needed here
            console.log('=== PACKAGE TRANSPORT COMPLETE ===');
            console.log('Total iFlows transported:', iflowsTransported);
            console.log('Total iFlows failed:', iflowsFailed);
            console.log('Individual transport logs have been created for each iFlow');
        }
    } catch (error) {
        logError('Transport package job execution error', { jobId, error: error.message, stack: error.stack });
        
        try {
            await updateStatus(jobId, 'transport', 'Failed');
        } catch (updateError) {
            logError('Failed to update job status to Failed', { jobId, error: updateError.message });
        }
        
        throw error;
    }
}

module.exports = {
    runTransportPackageJob
};