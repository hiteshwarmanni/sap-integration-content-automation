// server/jobs/transport-package-job.js

const db = require('../db-wrapper.js');
const { axios, escapeCSV, CPI_API_PATH_SUFFIX } = require('../utils.js');
const { logJobExecution, logInfo, logError } = require('../cloud-logger.js');
const { getOAuthToken, getCSRFToken } = require('./shared/auth-helper.js');
const { createJobLogger, createResultsStream, closeLogger, closeStream } = require('./shared/logger-helper.js');
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
        const newIflowId = iflowId + suffix;
        const originalIflwFileName = `${iflowId}.iflw`;
        const newIflwFileName = `${newIflowId}.iflw`;

        logInfo('Editing iFlow zip with suffix', { iflowId, newIflowId, zipContentSize: zipContent.length });

        const sourceZip = new AdmZip(Buffer.from(zipContent));
        const newZip = new AdmZip();

        let manifestEdited = false;
        let iflwFileRenamed = false;

        for (const entry of sourceZip.getEntries()) {
            let entryName = entry.entryName;
            let entryData = entry.getData();

            // Rename .iflw file
            if (entryName.endsWith(originalIflwFileName)) {
                entryName = entryName.replace(originalIflwFileName, newIflwFileName);
                iflwFileRenamed = true;
                logInfo('Renamed .iflw file', { from: entry.entryName, to: entryName });
            }

            // Update MANIFEST.MF content
            if (entryName.endsWith('MANIFEST.MF')) {
                const manifestContent = entryData.toString('utf8');
                const editedManifestContent = manifestContent.replaceAll(iflowId, newIflowId);
                if (manifestContent !== editedManifestContent) {
                    entryData = Buffer.from(editedManifestContent, 'utf8');
                    manifestEdited = true;
                    logInfo('Updated MANIFEST.MF', { newIflowId });
                }
            }

            if (entry.isDirectory) {
                newZip.addFile(entryName, Buffer.alloc(0), '', entry.header.flags);
            } else {
                newZip.addFile(entryName, entryData, '', entry.header.flags);
            }
        }

        if (!iflwFileRenamed) {
            logInfo('No .iflw file found to rename', { searchPattern: originalIflwFileName });
        }
        if (!manifestEdited) {
            logInfo('No changes made to MANIFEST.MF');
        }

        const newZipContent = newZip.toBuffer();
        logInfo('Edited zip generated', { size: newZipContent.length, iflwFileRenamed, manifestEdited });

        // Validate the new zip
        new AdmZip(newZipContent);

        return newZipContent;
    } catch (error) {
        logError('Failed to edit iFlow zip file with suffix', error);
        throw new Error(`Failed to edit iFlow zip file: ${error.message}`);
    }
}

/**
 * Executes a package transport job: creates a new package with suffix and transports all iFlows
 * @param {number} jobId - The transport job ID
 * @returns {Promise<void>}
 */
async function runTransportPackageJob(jobId) {
    logInfo('Transport package job starting', { jobId });

    try {
        // Get job data
        const job = await db.getTransportJobById(jobId);
        logInfo('Job data retrieved', { jobId, status: job.status });

        const { formData } = JSON.parse(job.form_data_json);
        logInfo('Form data parsed', {
            projectName: formData.projectName,
            environment: formData.environment,
            sourcePackageId: formData.sourcePackageId,
            targetPackageSuffix: formData.targetPackageSuffix
        });

        let { projectName, environment, userName, cpiBaseUrl, tokenUrl, clientId, clientSecret, sourcePackageId, targetPackageSuffix } = formData;

        // Normalise CPI base URL
        if (cpiBaseUrl && !cpiBaseUrl.endsWith(CPI_API_PATH_SUFFIX)) {
            cpiBaseUrl = cpiBaseUrl.replace(/\/$/, '') + CPI_API_PATH_SUFFIX;
        }

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
            await updateStatus(jobId, 'transport', 'Running');
            await db.updateTransportJob(jobId, { progress_message: 'Initializing package transport...' });

            // Authenticate
            await db.updateTransportJob(jobId, { progress_message: 'Authenticating with SAP CPI...' });
            const accessToken = await getOAuthToken(tokenUrl, clientId, clientSecret, logger);
            const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
            const csrfToken = await getCSRFToken(cpiBaseUrl, accessToken, logger);

            // Step 1: Fetch source package
            await db.updateTransportJob(jobId, { progress_message: 'Fetching source package details...' });
            logger.info('Step 1: Fetching source package details...');

            let sourcePackage = null;
            try {
                const sourcePackageResponse = await axios.get(`${cpiBaseUrl}/IntegrationPackages('${sourcePackageId}')`, { headers: authHeader });
                sourcePackage = sourcePackageResponse.data.d;
                logger.info(`Fetched source package: ${sourcePackage.Name}`);
            } catch (sourceError) {
                const errorMsg = sourceError.response ? JSON.stringify(sourceError.response.data) : sourceError.message;
                throw new Error(`Failed to fetch source package: ${errorMsg}`);
            }

            // Step 2: Create target package
            logger.info('Step 2: Creating target package with suffix...');
            targetPackageId = sourcePackage.Id + targetPackageSuffix;
            targetPackageName = sourcePackage.Name + targetPackageSuffix;

            try {
                await axios.post(`${cpiBaseUrl}/IntegrationPackages`, {
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
                }, {
                    headers: { ...authHeader, 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' }
                });
                logger.info(`Created target package: ${targetPackageName} (${targetPackageId})`);
            } catch (createError) {
                const errorMsg = createError.response ? JSON.stringify(createError.response.data) : createError.message;
                throw new Error(`Failed to create target package: ${errorMsg}`);
            }

            // Step 3: Get all iFlows in source package
            logger.info('Step 3: Fetching iFlows in source package...');
            let iflows = [];
            try {
                const iflowsResponse = await axios.get(
                    `${cpiBaseUrl}/IntegrationPackages('${sourcePackageId}')/IntegrationDesigntimeArtifacts`,
                    { headers: authHeader }
                );
                iflows = iflowsResponse.data.d.results || [];
                logger.info(`Found ${iflows.length} iFlows`);
            } catch (iflowsError) {
                const errorMsg = iflowsError.response ? JSON.stringify(iflowsError.response.data) : iflowsError.message;
                throw new Error(`Failed to fetch iFlows: ${errorMsg}`);
            }

            if (iflows.length === 0) {
                logger.info('No iFlows found. Package transport complete.');
                finalStatus = 'Complete';
                await setTotal(jobId, 'transport', 1);
                await updateProgress(jobId, 'transport', 1, 1);
            } else {
                await setTotal(jobId, 'transport', iflows.length);

                // Step 4: Transport each iFlow
                logger.info(`Step 4: Transporting ${iflows.length} iFlows...`);

                for (let i = 0; i < iflows.length; i++) {
                    const iflow = iflows[i];
                    logger.info(`Processing iFlow ${i + 1}/${iflows.length}: ${iflow.Name} (${iflow.Id})`);
                    await db.updateTransportJob(jobId, {
                        progress_message: `Transporting iFlow ${i + 1}/${iflows.length}: ${iflow.Name}`
                    });

                    try {
                        // Download
                        await db.updateTransportJob(jobId, {
                            progress_message: `[${i + 1}/${iflows.length}] Downloading ${iflow.Name}...`
                        });
                        const zipResponse = await axios.get(
                            `${cpiBaseUrl}/IntegrationDesigntimeArtifacts(Id='${iflow.Id}',Version='${iflow.Version}')/$value`,
                            { headers: authHeader, responseType: 'arraybuffer' }
                        );
                        const zipContent = Buffer.from(zipResponse.data);
                        logger.info(`Downloaded ${iflow.Name} (${zipContent.length} bytes)`);

                        // Edit zip
                        await db.updateTransportJob(jobId, {
                            progress_message: `[${i + 1}/${iflows.length}] Processing ${iflow.Name}...`
                        });
                        const editedZipContent = await editIflowZipWithSuffix(zipContent, iflow.Id, targetPackageSuffix);

                        // Upload
                        await db.updateTransportJob(jobId, {
                            progress_message: `[${i + 1}/${iflows.length}] Uploading ${iflow.Name}${targetPackageSuffix}...`
                        });
                        const newIflowId = iflow.Id + targetPackageSuffix;
                        const base64Content = editedZipContent.toString('base64');

                        logInfo('Uploading iFlow to target package', {
                            Id: newIflowId,
                            Name: iflow.Name + targetPackageSuffix,
                            PackageId: targetPackageId,
                            ArtifactContentLength: base64Content.length
                        });

                        await axios.post(`${cpiBaseUrl}/IntegrationDesigntimeArtifacts`, {
                            Id: newIflowId,
                            Name: iflow.Name + targetPackageSuffix,
                            PackageId: targetPackageId,
                            ArtifactContent: base64Content
                        }, {
                            headers: { ...authHeader, 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' }
                        });

                        logger.info(`Transported iFlow: ${iflow.Name} → ${iflow.Name}${targetPackageSuffix}`);

                        // Write success to CSV
                        resultsStream.write([
                            escapeCSV(sourcePackageId),
                            escapeCSV(targetPackageId),
                            escapeCSV(iflow.Id),
                            escapeCSV(newIflowId),
                            '200',
                            'Success'
                        ].join(',') + '\n');

                        // Insert transport log
                        try {
                            await db.insertTransportLog({
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
                            });
                        } catch (logErr) {
                            logger.error(`Failed to insert transport log for iFlow ${iflow.Name}: ${logErr.message}`);
                        }

                        iflowsTransported++;

                    } catch (iflowError) {
                        const errorMsg = iflowError.response ? JSON.stringify(iflowError.response.data) : iflowError.message;
                        logger.error(`Failed to transport iFlow ${iflow.Name}: ${errorMsg}`);

                        resultsStream.write([
                            escapeCSV(sourcePackageId),
                            escapeCSV(targetPackageId),
                            escapeCSV(iflow.Id),
                            escapeCSV(iflow.Id + targetPackageSuffix),
                            'N/A',
                            escapeCSV(errorMsg)
                        ].join(',') + '\n');

                        // Insert failed transport log
                        try {
                            await db.insertTransportLog({
                                projectName: projectName || 'Unknown',
                                environment: environment || 'Unknown',
                                userName: userName || 'Unknown',
                                timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                                status: 'Failed',
                                sourcePackageId: sourcePackageId || 'N/A',
                                targetPackageId: targetPackageId || 'N/A',
                                sourceIflowId: iflow.Id,
                                targetIflowId: iflow.Id + targetPackageSuffix,
                                sourceIflowName: iflow.Name,
                                targetIflowName: iflow.Name + targetPackageSuffix,
                                timeTakenSeconds: Math.round((Date.now() - jobStartTime) / 1000)
                            });
                        } catch (logErr) {
                            logger.error(`Failed to insert transport log for failed iFlow ${iflow.Name}: ${logErr.message}`);
                        }

                        iflowsFailed++;
                    }

                    progress = i + 1;
                    await updateProgress(jobId, 'transport', progress, iflows.length);
                }

                logger.info('Package transport complete.');
                finalStatus = iflowsFailed === 0 ? 'Complete' : 'Partial';
            }

            logJobExecution('transport_package', jobId, finalStatus, {
                projectName, environment, userName,
                sourcePackageId, targetPackageId, targetPackageSuffix,
                iFlowsTransported: iflowsTransported,
                iFlowsFailed: iflowsFailed
            });

        } catch (error) {
            const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
            logger.error(`FATAL PACKAGE TRANSPORT ERROR: ${errorMsg}`);
            finalStatus = 'Failed';

            logJobExecution('transport_package', jobId, 'Failed', {
                projectName, environment, userName,
                sourcePackageId, targetPackageSuffix, error: errorMsg
            });

            try {
                await db.insertTransportLog({
                    projectName: projectName || 'Unknown',
                    environment: environment || 'Unknown',
                    userName: userName || 'Unknown',
                    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    status: 'Failed',
                    sourcePackageId: sourcePackageId || 'N/A',
                    targetPackageId: targetPackageId || (sourcePackageId + targetPackageSuffix) || 'N/A',
                    sourceIflowId: 'PACKAGE_LEVEL_ERROR',
                    targetIflowId: 'PACKAGE_LEVEL_ERROR',
                    sourceIflowName: 'Package Transport Failed',
                    targetIflowName: errorMsg,
                    timeTakenSeconds: Math.round((Date.now() - jobStartTime) / 1000)
                });
            } catch (logErr) {
                logger.error(`Failed to insert package-level failure log: ${logErr.message}`);
            }

        } finally {
            await closeStream(resultsStream);
            await closeLogger(logger);

            const updatedJob = await db.getTransportJobById(jobId);
            await db.updateTransportJob(jobId, {
                status: finalStatus,
                progress: (finalStatus === 'Complete' || finalStatus === 'Partial') ? updatedJob.total : progress
            });

            logInfo('Package transport job finished', {
                jobId, finalStatus, iflowsTransported, iflowsFailed
            });
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