// server/jobs/upload-job.js

const db = require('../db-wrapper.js');
const { escapeCSV, CPI_API_PATH_SUFFIX } = require('../utils.js');
const { logJobExecution } = require('../cloud-logger.js');
const { getOAuthToken, getCSRFToken, createAuthenticatedClient } = require('./shared/auth-helper.js');
const { createJobLogger, createResultsStream } = require('./shared/logger-helper.js');
const { updateProgress, setTotal, updateStatus } = require('./shared/progress-tracker.js');
const { finalizeJob } = require('./shared/job-finalizer.js');
const { parseUploadCSV } = require('./shared/csv-helper.js');
const { UPLOAD_CSV_HEADERS, DEFAULT_VERSION } = require('./constants.js');

/**
 * Executes an upload job to update integration flow configurations
 * @param {number} jobId - The upload job ID
 * @returns {Promise<void>}
 */
async function runUploadJob(jobId) {
    // Get job data
    const job = await db.getUploadJobById(jobId);
    const { formData, filePath } = JSON.parse(job.form_data_json);
    let { projectName, environment, userName, cpiBaseUrl, tokenUrl, clientId, clientSecret, version = DEFAULT_VERSION } = formData;

    // Automatically append API path suffix to CPI Base URL
    if (cpiBaseUrl && !cpiBaseUrl.endsWith(CPI_API_PATH_SUFFIX)) {
        cpiBaseUrl = cpiBaseUrl.replace(/\/$/, '') + CPI_API_PATH_SUFFIX;
    }

    // Create logger and result file
    const executionTimestamp = new Date(job.created_at);
    const { logger, logFilePath, formattedTimestamp } = createJobLogger(executionTimestamp, 'upload');
    const { resultsStream, resultsFilePath } = createResultsStream(
        executionTimestamp,
        UPLOAD_CSV_HEADERS,
        'Results'
    );

    let finalStatus = 'Failed';
    let progress = 0;
    const jobStartTime = Date.now(); // Track start time

    // Initialize counters
    let artifactSuccessCount = 0;  // Successfully updated iFlows
    let artifactTotalCount = 0;
    let parameterSuccessCount = 0; // Successfully updated parameters
    let parameterTotalCount = 0;

    try {
        // Update job to 'Running'
        await updateStatus(jobId, 'upload', 'Running');

        // Log job start
        logJobExecution('upload', jobId, 'Started', { projectName, environment, userName });

        // Get Auth Token
        const accessToken = await getOAuthToken(tokenUrl, clientId, clientSecret, logger);

        // Get CSRF Token
        const csrfToken = await getCSRFToken(cpiBaseUrl, accessToken, logger);

        // Create authenticated API client
        const sapApi = createAuthenticatedClient(cpiBaseUrl, accessToken);

        // Parse CSV file
        const rows = parseUploadCSV(filePath, logger);

        // Set total for progress tracking
        await setTotal(jobId, 'upload', rows.length);

        // Count total artifacts and parameters
        const uniqueArtifacts = new Set();
        rows.forEach(row => {
            if (row.IflowID) {
                uniqueArtifacts.add(row.IflowID);
                if (row.ParameterKey) parameterTotalCount++;
            }
        });
        artifactTotalCount = uniqueArtifacts.size;

        // Track successfully updated artifacts
        const successfulArtifacts = new Set();

        // Loop and process each row
        for (const row of rows) {
            logger.info(`Processing row data: ${JSON.stringify(row)}`);
            const { IflowID, ParameterKey, ParameterValue, DataType } = row;

            if (!IflowID || !ParameterKey || ParameterValue === null || ParameterValue === undefined) {
                logger.warn(`Skipping row: Missing IflowID, ParameterKey, or ParameterValue.`);
                const outputRow = [
                    escapeCSV(row.PackageName), escapeCSV(row.PackageID), escapeCSV(row.IflowName), escapeCSV(row.IflowID),
                    escapeCSV(row.ParameterKey), escapeCSV(row.ParameterValue), escapeCSV(row.DataType),
                    'N/A', 'Failed', 'Missing IflowID/ParameterKey/ParameterValue'
                ];
                resultsStream.write(outputRow.join(',') + '\n');
                progress++;
                continue;
            }

            const updateUrl = `/IntegrationDesigntimeArtifacts(Id='${IflowID}',Version='${version}')/$links/Configurations('${ParameterKey}')`;
            const updateBody = {
                ParameterValue: ParameterValue,
                DataType: DataType || 'xsd:string'
            };

            try {
                const updateResponse = await sapApi.put(updateUrl, updateBody, {
                    headers: {
                        'X-CSRF-Token': csrfToken,
                        'Content-Type': 'application/json'
                    }
                });

                logger.info(`Updated: ${row.IflowName || IflowID} -> ${ParameterKey}`);
                const outputRow = [
                    escapeCSV(row.PackageName), escapeCSV(row.PackageID), escapeCSV(row.IflowName), escapeCSV(row.IflowID),
                    escapeCSV(row.ParameterKey), escapeCSV(row.ParameterValue), escapeCSV(row.DataType),
                    updateResponse.status, 'Success', 'Updated'
                ];
                resultsStream.write(outputRow.join(',') + '\n');

                // Track success
                successfulArtifacts.add(IflowID);
                if (ParameterKey) parameterSuccessCount++;

            } catch (rowError) {
                const statusCode = rowError.response ? rowError.response.status : 'N/A';
                const errorMsg = rowError.response ? JSON.stringify(rowError.response.data) : rowError.message;
                logger.error(`Failed: ${row.IflowName || IflowID} -> ${ParameterKey}. Error: ${errorMsg}`);
                const outputRow = [
                    escapeCSV(row.PackageName), escapeCSV(row.PackageID), escapeCSV(row.IflowName), escapeCSV(row.IflowID),
                    escapeCSV(row.ParameterKey), escapeCSV(row.ParameterValue), escapeCSV(row.DataType),
                    statusCode, 'Failed', escapeCSV(errorMsg)
                ];
                resultsStream.write(outputRow.join(',') + '\n');
            }

            progress++;
            await updateProgress(jobId, 'upload', progress, rows.length);
        }

        // Update artifact success count based on unique successful artifacts
        artifactSuccessCount = successfulArtifacts.size;

        logger.info('Upload processing complete.');
        finalStatus = 'Complete';

        // Log successful completion
        logJobExecution('upload', jobId, 'Complete', {
            projectName,
            environment,
            userName,
            rowsProcessed: rows.length
        });

    } catch (jobError) {
        const errorMsg = jobError.response ? JSON.stringify(jobError.response.data) : jobError.message;
        logger.error(`FATAL UPLOAD ERROR: ${errorMsg}`);
        finalStatus = 'Failed';

        // Log failure
        logJobExecution('upload', jobId, 'Failed', {
            projectName,
            environment,
            userName,
            error: errorMsg
        });

    } finally {
        // Calculate time taken
        const timeTakenSeconds = Math.round((Date.now() - jobStartTime) / 1000);

        // Finalize job - close streams, update DB, store logs
        await finalizeJob({
            jobId,
            jobType: 'upload',
            finalStatus,
            logFilePath,
            resultsFilePath,
            logger,
            resultsStream,
            formattedTimestamp,
            metadata: {
                projectName,
                environment,
                userName,
                activityType: 'Upload Config Params'
            },
            uploadFilePath: filePath,
            progress,
            artifactCount: `${artifactSuccessCount}/${artifactTotalCount}`,
            parameterCount: parameterTotalCount > 0 ? `${parameterSuccessCount}/${parameterTotalCount}` : 'N/A',
            timeTakenSeconds
        });
    }
}

module.exports = {
    runUploadJob
};
