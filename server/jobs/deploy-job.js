// server/jobs/deploy-job.js

const db = require('../db-wrapper.js');
const { axios, escapeCSV, CPI_API_PATH_SUFFIX } = require('../utils.js');
const { logJobExecution } = require('../cloud-logger.js');
const { getOAuthToken, getCSRFToken } = require('./shared/auth-helper.js');
const { createJobLogger, createResultsStream } = require('./shared/logger-helper.js');
const { updateProgress, setTotal, updateStatus } = require('./shared/progress-tracker.js');
const { finalizeJob } = require('./shared/job-finalizer.js');
const { parseDeploy_UndeployCSVFile } = require('./shared/csv-helper.js');
const { DEPLOY_CSV_HEADERS, ARTIFACT_TYPES, OPERATIONS } = require('./constants.js');

/**
 * Executes a deploy/undeploy job for integration artifacts
 * @param {number} jobId - The deploy job ID
 * @returns {Promise<void>}
 */
async function runDeployJob(jobId) {
    // Get job data
    const job = await db.getUploadJobById(jobId);
    const { formData, filePath } = JSON.parse(job.form_data_json);
    let { projectName, environment, userName, cpiBaseUrl, tokenUrl, clientId, clientSecret, operation, artifactType } = formData;

    // Automatically append API path suffix to CPI Base URL
    if (cpiBaseUrl && !cpiBaseUrl.endsWith(CPI_API_PATH_SUFFIX)) {
        cpiBaseUrl = cpiBaseUrl.replace(/\/$/, '') + CPI_API_PATH_SUFFIX;
    }

    // Create logger and result file
    const executionTimestamp = new Date(job.created_at);
    const { logger, logFilePath, formattedTimestamp } = createJobLogger(executionTimestamp, operation);
    const { resultsStream, resultsFilePath } = createResultsStream(
        executionTimestamp,
        DEPLOY_CSV_HEADERS,
        `${operation}_Results`
    );

    let finalStatus = 'Failed';
    let progress = 0;
    const jobStartTime = Date.now(); // Track start time

    // Initialize counters
    let artifactSuccessCount = 0;  // Successfully deployed/undeployed artifacts
    let artifactTotalCount = 0;

    try {
        // Update job to 'Running'
        await updateStatus(jobId, 'deploy', 'Running');

        // Log job start
        logJobExecution('deploy', jobId, 'Started', { projectName, environment, userName, operation });

        // Get Auth Token
        const accessToken = await getOAuthToken(tokenUrl, clientId, clientSecret, logger);

        // Get CSRF Token (for deploy operations)
        let csrfToken = null;
        if (operation === OPERATIONS.DEPLOY) {
            csrfToken = await getCSRFToken(cpiBaseUrl, accessToken, logger);
        }

        // Parse CSV file
        const rows = parseDeploy_UndeployCSVFile(filePath, logger);

        // Set total for progress tracking
        await setTotal(jobId, 'deploy', rows.length);
        artifactTotalCount = rows.length;

        // Normalize artifact type from form data
        const normalizedArtifactType = artifactType.trim().toLowerCase();

        // Loop and process each row
        for (const row of rows) {
            logger.info(`Processing row: ArtifactID="${row.artifactId}", ArtifactType="${artifactType}", Version="${row.version}"`);

            const artifactId = row.artifactId;
            const version = row.version || 'active';
            let outputRow = [];

            // Validate required fields
            if (!artifactId) {
                const errorMsg = 'Missing ArtifactID';
                logger.error(errorMsg);
                outputRow = [
                    escapeCSV(artifactId || ''),
                    escapeCSV(version),
                    'N/A',
                    escapeCSV(errorMsg)
                ];
                resultsStream.write(outputRow.join(',') + '\n');
                progress++;
                continue;
            }

            try {
                let deployUrl = '';
                let httpMethod = 'POST';
                let requiresCSRF = true;

                if (operation === OPERATIONS.DEPLOY) {
                    // Handle deployment based on artifact type
                    if (normalizedArtifactType === ARTIFACT_TYPES.INTEGRATION_FLOW) {
                        deployUrl = `${cpiBaseUrl}/DeployIntegrationDesigntimeArtifact?Id='${artifactId}'&Version='${version}'`;
                    } else if (normalizedArtifactType === ARTIFACT_TYPES.SCRIPT_COLLECTION) {
                        deployUrl = `${cpiBaseUrl}/DeployScriptCollectionDesigntimeArtifact?Id='${artifactId}'&Version='${version}'`;
                    } else if (normalizedArtifactType === ARTIFACT_TYPES.VALUE_MAPPING) {
                        deployUrl = `${cpiBaseUrl}/DeployValueMappingDesigntimeArtifact?Id='${artifactId}'&Version='${version}'`;
                    } else {
                        throw new Error(`Unknown artifact type: ${artifactType}`);
                    }
                } else if (operation === OPERATIONS.UNDEPLOY) {
                    // Handle undeployment (only for Integration Flow)
                    if (normalizedArtifactType === ARTIFACT_TYPES.INTEGRATION_FLOW) {
                        deployUrl = `${cpiBaseUrl}/IntegrationRuntimeArtifacts('${artifactId}')`;
                        httpMethod = 'DELETE';
                        requiresCSRF = false;
                    } else {
                        throw new Error(`Undeploy not supported for artifact type: ${artifactType}`);
                    }
                }

                // Make the API call
                const headers = {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                };

                if (requiresCSRF && csrfToken) {
                    headers['X-CSRF-Token'] = csrfToken;
                }

                let response;
                if (httpMethod === 'DELETE') {
                    response = await axios.delete(deployUrl, { headers });
                } else {
                    response = await axios.post(deployUrl, {}, { headers });
                }

                // Log only to results file, not to console
                outputRow = [
                    escapeCSV(artifactId),
                    escapeCSV(version),
                    response.status,
                    'Success'
                ];

                resultsStream.write(outputRow.join(',') + '\n');
                artifactSuccessCount++; // Track successful artifact

            } catch (rowError) {
                const statusCode = rowError.response ? rowError.response.status : 'N/A';
                const errorMsg = rowError.response ? JSON.stringify(rowError.response.data) : rowError.message;
                logger.error(`Failed: ${artifactId}. Error: ${errorMsg}`);

                outputRow = [
                    escapeCSV(artifactId),
                    escapeCSV(version),
                    statusCode,
                    escapeCSV(errorMsg)
                ];

                resultsStream.write(outputRow.join(',') + '\n');
            }

            progress++;

            // Log progress every 10 artifacts only
            if (progress % 10 === 0 || progress === rows.length) {
                logger.info(`Progress: ${progress}/${rows.length} artifacts (${artifactSuccessCount} successful)`);
            }

            await updateProgress(jobId, 'deploy', progress, rows.length);
        }

        logger.info('Deploy processing complete.');
        finalStatus = 'Complete';

        // Log successful completion
        logJobExecution('deploy', jobId, 'Complete', {
            projectName,
            environment,
            userName,
            operation,
            rowsProcessed: rows.length
        });

    } catch (jobError) {
        const errorMsg = jobError.response ? JSON.stringify(jobError.response.data) : jobError.message;
        logger.error(`FATAL DEPLOY ERROR: ${errorMsg}`);
        finalStatus = 'Failed';

        // Log failure
        logJobExecution('deploy', jobId, 'Failed', {
            projectName,
            environment,
            userName,
            operation,
            error: errorMsg
        });

    } finally {
        // Calculate time taken
        const timeTakenSeconds = Math.round((Date.now() - jobStartTime) / 1000);

        // Finalize job - close streams, update DB, store logs
        await finalizeJob({
            jobId,
            jobType: 'deploy',
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
                activityType: `${operation === OPERATIONS.DEPLOY ? 'Deploy' : 'Undeploy'} ${artifactType.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}`
            },
            uploadFilePath: filePath,
            progress,
            artifactCount: `${artifactSuccessCount}/${artifactTotalCount}`,
            parameterCount: 'N/A', // Parameters not applicable for deploy/undeploy
            timeTakenSeconds
        });
    }
}

module.exports = {
    runDeployJob
};
