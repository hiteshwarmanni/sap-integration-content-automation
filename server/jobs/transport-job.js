// server/jobs/transport-job.js

const db = require('../db-wrapper.js');
const { axios, escapeCSV, CPI_API_PATH_SUFFIX } = require('../utils.js');
const { logJobExecution, logInfo, logError } = require('../cloud-logger.js');
const { getOAuthToken, getCSRFToken } = require('./shared/auth-helper.js');
const { createJobLogger, createResultsStream } = require('./shared/logger-helper.js');
const { updateProgress, setTotal, updateStatus } = require('./shared/progress-tracker.js');
const { TRANSPORT_CSV_HEADERS } = require('./constants.js');
const AdmZip = require('adm-zip');

/**
 * Downloads a zip file for a specific iFlow from SAP CPI
 * @param {Object} params - Download parameters
 * @param {string} params.cpiBaseUrl - SAP CPI base URL
 * @param {string} params.tokenUrl - OAuth token URL
 * @param {string} params.clientId - OAuth client ID
 * @param {string} params.clientSecret - OAuth client secret
 * @param {string} params.packageId - Package ID
 * @param {string} params.iflowId - iFlow ID
 * @returns {Promise<Object>} Download result
 */
async function downloadZipFile({ cpiBaseUrl, tokenUrl, clientId, clientSecret, packageId, iflowId }) {
    try {
        logInfo('downloadZipFile called', { packageId, iflowId });

        // Automatically append API path suffix to CPI Base URL
        const baseUrl = cpiBaseUrl.endsWith('/api/v1')
            ? cpiBaseUrl
            : cpiBaseUrl.replace(/\/$/, '') + '/api/v1';

        const accessToken = await getOAuthToken(tokenUrl, clientId, clientSecret, null);
        const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

        // Download the iFlow zip file using the 'active' version
        logInfo('Downloading iFlow zip file', { iflowId });
        const iflowZipUrl = `${baseUrl}/IntegrationDesigntimeArtifacts(Id='${iflowId}',Version='active')/$value`;
        let zipContent = null;

        try {
            const zipResponse = await axios.get(iflowZipUrl, {
                headers: authHeader,
                responseType: 'arraybuffer'
            });
            zipContent = Buffer.from(zipResponse.data);
            logInfo('iFlow zip file downloaded', { iflowId, size: zipContent.length });
        } catch (zipError) {
            const errorMsg = zipError.response ? JSON.stringify(zipError.response.data) : zipError.message;
            throw new Error(`Failed to download iFlow zip file: ${errorMsg}`);
        }

        return {
            success: true,
            message: 'Zip file downloaded successfully!',
            details: {
                packageId,
                iflowId,
                fileSize: zipContent.length
            }
        };

    } catch (error) {
        logError('downloadZipFile error', error);
        throw new Error(`Failed to download zip file: ${error.message}`);
    }
}

/**
 * Executes a transport job to move integration flows between packages
 * @param {number} jobId - The transport job ID
 * @returns {Promise<void>}
 */
async function runTransportJob(jobId) {
    logInfo('Transport job execution starting', { jobId });
    
    try {
        // Get job data
        const job = await db.getTransportJobById(jobId);
        logInfo('Job data retrieved', { jobId, status: job.status, hasFormData: !!job.form_data_json });
        
        const { formData } = JSON.parse(job.form_data_json);
        logInfo('Form data parsed', {
            projectName: formData.projectName,
            environment: formData.environment,
            sourcePackageId: formData.sourcePackageId,
            targetPackageId: formData.targetPackageId,
            sourceIflowId: formData.sourceIflowId,
            targetIflowId: formData.targetIflowId
        });
        
        let { projectName, environment, userName, cpiBaseUrl, tokenUrl, clientId, clientSecret, sourcePackageId, targetPackageId, sourceIflowId, targetIflowId } = formData;

        // Automatically append API path suffix to CPI Base URL
        if (cpiBaseUrl && !cpiBaseUrl.endsWith(CPI_API_PATH_SUFFIX)) {
            cpiBaseUrl = cpiBaseUrl.replace(/\/$/, '') + CPI_API_PATH_SUFFIX;
        }

        // Create logger and result file
        const executionTimestamp = new Date(job.created_at);
        const { logger, logFilePath, formattedTimestamp } = createJobLogger(executionTimestamp, 'transport');
        const { resultsStream, resultsFilePath } = createResultsStream(
            executionTimestamp,
            TRANSPORT_CSV_HEADERS,
            `${projectName}_${environment}_transport_results`
        );

        let finalStatus = 'Failed';
        let progress = 0;
        const jobStartTime = Date.now(); // Track start time

        // Initialize counters
        let artifactSuccessCount = 0;  // Successfully transported iFlows
        let artifactTotalCount = 0;    // Total iFlows to transport

        // Initialize variables that need to be accessible in finally block
        let sourceIflowData = null;
        let targetIflowData = null;
        let capturedError = null;  // Capture error for finally block

        try {
            // Update job to 'Running'
            await updateStatus(jobId, 'transport', 'Running');
            logInfo('Job status updated to Running', { jobId });

            // Log job start
            logJobExecution('transport', jobId, 'Started', { projectName, environment, userName, sourcePackageId, targetPackageId, sourceIflowId, targetIflowId });

            // Get Auth Token
            const accessToken = await getOAuthToken(tokenUrl, clientId, clientSecret, logger);
            const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

            // Get CSRF Token (for transport operations)
            const csrfToken = await getCSRFToken(cpiBaseUrl, accessToken, logger);

            // Set total for progress tracking
            await setTotal(jobId, 'transport', 1); // Single iFlow transport
            artifactTotalCount = 1;

            logger.info('Step 1: Fetching source iFlow details...');
            
            // Get source iFlow details to extract version
            // Use the API format that works with the dropdown
            const sourceIflowUrl = `${cpiBaseUrl}/IntegrationPackages('${sourcePackageId}')/IntegrationDesigntimeArtifacts('${sourceIflowId}')`;

            try {
                const sourceIflowResponse = await axios.get(sourceIflowUrl, { headers: authHeader });
                sourceIflowData = sourceIflowResponse.data;
                logger.info(`Successfully fetched source iFlow: ${sourceIflowData.Name}, Version: ${sourceIflowData.Version}`);
            } catch (sourceError) {
                const errorMsg = sourceError.response ? JSON.stringify(sourceError.response.data) : sourceError.message;
                logger.error(`Error fetching source iFlow: ${errorMsg}`);
                logger.error(`Source iFlow URL: ${sourceIflowUrl}`);
                logger.error(`Source iFlow ID: ${sourceIflowId}`);
                logger.error(`Source Package ID: ${sourcePackageId}`);
                throw new Error(`Failed to fetch source iFlow: ${errorMsg}`);
            }

            // Get target iFlow details to extract version
            // Use the API format that works with the dropdown
            const targetIflowUrl = `${cpiBaseUrl}/IntegrationPackages('${targetPackageId}')/IntegrationDesigntimeArtifacts('${targetIflowId}')`;

            try {
                const targetIflowResponse = await axios.get(targetIflowUrl, { headers: authHeader });
                targetIflowData = targetIflowResponse.data;
                logger.info(`Successfully fetched target iFlow: ${targetIflowData.Name}, Version: ${targetIflowData.Version}`);
            } catch (targetError) {
                const errorMsg = targetError.response ? JSON.stringify(targetError.response.data) : targetError.message;
                logger.error(`Error fetching target iFlow: ${errorMsg}`);
                logger.error(`Target iFlow URL: ${targetIflowUrl}`);
                logger.error(`Target iFlow ID: ${targetIflowId}`);
                logger.error(`Target Package ID: ${targetPackageId}`);
                throw new Error(`Failed to fetch target iFlow: ${errorMsg}`);
            }

            logger.info('Step 2: Downloading source iFlow zip file...');
            
            // Download the source iFlow zip file
            const sourceIflowZipUrl = `${cpiBaseUrl}/IntegrationDesigntimeArtifacts(Id='${sourceIflowId}',Version='${sourceIflowData.Version}')/$value`;
            let zipContent = null;

            try {
                const zipResponse = await axios.get(sourceIflowZipUrl, { 
                    headers: authHeader,
                    responseType: 'arraybuffer'
                });
                zipContent = Buffer.from(zipResponse.data);
                logger.info(`Successfully downloaded iFlow zip file (${zipContent.length} bytes)`);
            } catch (zipError) {
                const errorMsg = zipError.response ? JSON.stringify(zipError.response.data) : zipError.message;
                logger.error(`Error downloading iFlow zip file: ${errorMsg}`);
                throw new Error(`Failed to download iFlow zip file: ${errorMsg}`);
            }

            logger.info('Step 3: Editing iFlow zip file...');
            
            // Edit the zip file - replace SourceIflowID with TargetIflowID in MANIFEST.MF
            const editedZipContent = await editIflowZip(zipContent, sourceIflowId, targetIflowId, logger);

            logger.info('Step 4: Uploading edited iFlow to target package...');
            
            // Base64 encode the edited zip file
            const base64Content = editedZipContent.toString('base64');

            // Prepare the PUT request body
            const putBody = {
                Name: targetIflowData.Name,
                ArtifactContent: base64Content
            };
            
            // Log the PUT request body for debugging
            logInfo('PUT request body prepared', {
                bodyName: putBody.Name,
                artifactContentPreview: putBody.ArtifactContent.substring(0, 100) + '...',
                base64ContentLength: putBody.ArtifactContent.length
            });

            // Prepare headers for PUT request
            const putHeaders = {
                ...authHeader,
                'X-CSRF-Token': csrfToken,
                'Content-Type': 'application/json'
            };

            // Upload the edited iFlow to target package
            const targetIflowPutUrl = `${cpiBaseUrl}/IntegrationDesigntimeArtifacts(Id='${targetIflowId}',Version='${targetIflowData.Version}')`;
            
            try {
                const putResponse = await axios.put(targetIflowPutUrl, putBody, { headers: putHeaders });
                logger.info('Successfully uploaded edited iFlow to target package');
            } catch (putError) {
                const errorMsg = putError.response ? JSON.stringify(putError.response.data) : putError.message;
                logger.error(`Error uploading edited iFlow: ${errorMsg}`);
                throw new Error(`Failed to upload edited iFlow: ${errorMsg}`);
            }

            // Write result to CSV
            const resultRow = [
                escapeCSV(sourcePackageId),
                escapeCSV(targetPackageId),
                escapeCSV(sourceIflowId),
                escapeCSV(targetIflowId),
                '200',
                'Success'
            ];
            resultsStream.write(resultRow.join(',') + '\n');

            // Update progress
            progress = 1;
            await updateProgress(jobId, 'transport', progress, 1);
            artifactSuccessCount = 1;

            logger.info('Transport processing complete.');
            finalStatus = 'Complete';

            // Log successful completion
            logJobExecution('transport', jobId, 'Complete', {
                projectName,
                environment,
                userName,
                sourcePackageId,
                targetPackageId,
                sourceIflowId,
                targetIflowId,
                sourceIflowVersion: sourceIflowData.Version,
                targetIflowVersion: targetIflowData.Version,
                iFlowsTransported: 1
            });

        } catch (error) {
            capturedError = error;  // Capture error for finally block
            const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
            logger.error(`FATAL TRANSPORT ERROR: ${errorMsg}`);
            logger.error(`Error stack trace: ${error.stack}`);
            finalStatus = 'Failed';

            // Determine which step failed
            let failedStep = 'Unknown';
            if (errorMsg.includes('Failed to fetch source iFlow')) {
                failedStep = 'Fetch Source iFlow';
            } else if (errorMsg.includes('Failed to fetch target iFlow')) {
                failedStep = 'Fetch Target iFlow';
            } else if (errorMsg.includes('Failed to download iFlow zip')) {
                failedStep = 'Download Zip';
            } else if (errorMsg.includes('Failed to edit iFlow zip')) {
                failedStep = 'Edit Zip';
            } else if (errorMsg.includes('Failed to upload edited iFlow')) {
                failedStep = 'Upload iFlow';
            }

            // Prepare detailed error information
            const errorDetails = {
                message: errorMsg,
                step: failedStep,
                sourcePackageId: sourcePackageId || 'N/A',
                targetPackageId: targetPackageId || 'N/A',
                sourceIflowId: sourceIflowId || 'N/A',
                targetIflowId: targetIflowId || 'N/A',
                httpStatus: error.response?.status || 'N/A',
                apiResponse: error.response?.data || 'N/A'
            };

            logger.error(`Error details: ${JSON.stringify(errorDetails, null, 2)}`);

            // Store error details for later use in finally block
            capturedError.failedStep = failedStep;
            capturedError.errorDetails = errorDetails;

            // Write error result to CSV
            const errorRow = [
                escapeCSV(sourcePackageId || ''),
                escapeCSV(targetPackageId || ''),
                escapeCSV(sourceIflowId || ''),
                escapeCSV(targetIflowId || ''),
                'N/A',
                escapeCSV(errorMsg)
            ];
            resultsStream.write(errorRow.join(',') + '\n');

            // Log failure
            logJobExecution('transport', jobId, 'Failed', {
                projectName,
                environment,
                userName,
                sourcePackageId,
                targetPackageId,
                sourceIflowId,
                targetIflowId,
                error: errorMsg,
                failedStep,
                errorDetails
            });

        } finally {
            // Calculate time taken
            const timeTakenSeconds = Math.round((Date.now() - jobStartTime) / 1000);

            const { closeLogger, closeStream } = require('./shared/logger-helper.js');
            await closeStream(resultsStream);
            await closeLogger(logger);

            // Update job status with final progress
            const updatedJob = await db.getTransportJobById(jobId);
            await db.updateTransportJob(jobId, {
                status: finalStatus,
                progress: (finalStatus === 'Complete') ? updatedJob.total : progress
            });

            // Write to the transport_logs table - Always log, even if failed
            try {
                logInfo('Inserting transport log', { finalStatus, projectName, environment });
                
                const transportLogData = {
                    projectName: projectName || 'Unknown',
                    environment: environment || 'Unknown',
                    userName: userName || 'Unknown',
                    timestamp: formattedTimestamp.replace('_', ' '),
                    status: finalStatus,
                    sourcePackageId: sourcePackageId || 'N/A',
                    targetPackageId: targetPackageId || 'N/A',
                    sourceIflowId: sourceIflowId || 'N/A',
                    targetIflowId: targetIflowId || 'N/A',
                    sourceIflowName: sourceIflowData?.Name || sourceIflowId || 'Unknown',
                    targetIflowName: targetIflowData?.Name || targetIflowId || 'Unknown',
                    timeTakenSeconds
                };

                // Add error details if the job failed
                if (finalStatus === 'Failed' && capturedError) {
                    transportLogData.errorMessage = capturedError.message || 'Unknown error';
                    transportLogData.errorDetails = capturedError.errorDetails ? JSON.stringify(capturedError.errorDetails) : null;
                    transportLogData.failedStep = capturedError.failedStep || 'Unknown';
                    transportLogData.errorStackTrace = capturedError.stack || null;
                }

                const transportLogId = await db.insertTransportLog(transportLogData);

                // Link the transport log to the job
                await db.updateTransportJob(jobId, { log_id: transportLogId });

                logInfo('Transport log stored in database', { jobId, transportLogId, finalStatus });
            } catch (error) {
                logError('Failed to write transport log to database', error);
            }
        }
    } catch (error) {
        logError('Transport job execution error', { jobId, error: error.message, stack: error.stack });
        
        // If the job was created but failed to start, update status to Failed
        try {
            await updateStatus(jobId, 'transport', 'Failed');
        } catch (updateError) {
            logError('Failed to update job status to Failed', { jobId, error: updateError.message });
        }
        
        throw error;
    }
}

/**
 * Edits the iFlow zip file by replacing SourceIflowID with TargetIflowID in MANIFEST.MF
 * @param {Buffer} zipContent - The original zip file content
 * @param {string} sourceIflowId - The source iFlow ID to replace
 * @param {string} targetIflowId - The target iFlow ID to replace with
 * @param {object} logger - Logger instance
 * @returns {Promise<Buffer>} - The edited zip file content
 */
async function editIflowZip(zipContent, sourceIflowId, targetIflowId) {
    try {
        logInfo('Starting zip file editing process', { sourceIflowId, targetIflowId, zipContentSize: zipContent.length });

        const zip = new AdmZip(Buffer.from(zipContent));
        const zipEntries = zip.getEntries();

        logInfo(`Processing zip file`, { entriesCount: zipEntries.length });

        let manifestEdited = false;

        for (const entry of zipEntries) {
            if (entry.entryName.endsWith('MANIFEST.MF')) {
                const manifestContent = entry.getData().toString('utf8');
                const editedManifestContent = manifestContent.replaceAll(sourceIflowId, targetIflowId);

                if (manifestContent !== editedManifestContent) {
                    manifestEdited = true;
                    entry.setData(Buffer.from(editedManifestContent, 'utf8'));
                    logInfo('Updated MANIFEST.MF file', { 
                        originalSize: manifestContent.length, 
                        newSize: editedManifestContent.length 
                    });
                }
            }
        }

        if (!manifestEdited) {
            logInfo('No changes made to MANIFEST.MF');
        }

        const newZipContent = zip.toBuffer();
        logInfo('Generated edited zip file', { size: newZipContent.length });

        // Verify the zip file is valid
        new AdmZip(newZipContent);

        return newZipContent;
    } catch (error) {
        logError('Failed to edit iFlow zip file', error);
        throw new Error(`Failed to edit iFlow zip file: ${error.message}`);
    }
}

module.exports = {
    runTransportJob,
    downloadZipFile
};
