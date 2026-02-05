// server/jobs/download-job.js

const db = require('../db-wrapper.js');
const { axios, escapeCSV, CPI_API_PATH_SUFFIX } = require('../utils.js');
const { logJobExecution } = require('../cloud-logger.js');
const { getOAuthToken } = require('./shared/auth-helper.js');
const { createJobLogger, createResultsStream } = require('./shared/logger-helper.js');
const { updateProgress, setTotal, updateStatus } = require('./shared/progress-tracker.js');
const { finalizeJob } = require('./shared/job-finalizer.js');
const { DOWNLOAD_CSV_HEADERS } = require('./constants.js');

/**
 * Executes a download job to fetch integration package configurations
 * @param {number} jobId - The download job ID
 * @returns {Promise<void>}
 */
async function runDownloadJob(jobId) {
    // Get job data
    const job = await db.getDownloadJobById(jobId);
    const { formData } = JSON.parse(job.form_data_json);
    let { projectName, environment, userName, cpiBaseUrl, tokenUrl, clientId, clientSecret, packageId } = formData;

    // Automatically append API path suffix to CPI Base URL
    if (cpiBaseUrl && !cpiBaseUrl.endsWith(CPI_API_PATH_SUFFIX)) {
        cpiBaseUrl = cpiBaseUrl.replace(/\/$/, '') + CPI_API_PATH_SUFFIX;
    }

    // Create logger and result file
    const executionTimestamp = new Date(job.created_at);
    const { logger, logFilePath, formattedTimestamp } = createJobLogger(executionTimestamp, 'download');
    const { resultsStream, resultsFilePath } = createResultsStream(
        executionTimestamp,
        DOWNLOAD_CSV_HEADERS,
        `${projectName}_${environment}_configurations`
    );

    let finalStatus = 'Failed';
    let progress = 0;
    const jobStartTime = Date.now(); // Track start time

    // Initialize counters
    let artifactSuccessCount = 0;  // Successfully fetched iFlows
    let artifactTotalCount = 0;    // Total unique iFlows
    let parameterSuccessCount = 0; // Successfully fetched parameters
    let parameterTotalCount = 0;

    // Track unique iFlows
    const processedIFlows = new Set();
    const successfulIFlows = new Set();

    try {
        // Update job to 'Running'
        await updateStatus(jobId, 'download', 'Running');

        // Log job start
        logJobExecution('download', jobId, 'Started', { projectName, environment, userName });

        // Get Auth Token
        const accessToken = await getOAuthToken(tokenUrl, clientId, clientSecret, logger);
        const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

        // Get ALL Packages, then filter
        logger.info('Step 2: Getting ALL Integration Packages...');
        const packagesUrl = `${cpiBaseUrl}/IntegrationPackages`;
        const packagesResponse = await axios.get(packagesUrl, { headers: authHeader });

        // Handle different API response formats
        let allPackages = [];
        if (packagesResponse.data && packagesResponse.data.d && packagesResponse.data.d.results) {
            allPackages = packagesResponse.data.d.results;
        } else if (packagesResponse.data && Array.isArray(packagesResponse.data)) {
            allPackages = packagesResponse.data;
        } else {
            logger.error(`Unexpected API response format: ${JSON.stringify(packagesResponse.data)}`);
            throw new Error('Unable to parse packages from API response. Check API URL and credentials.');
        }

        logger.info(`Fetched ${allPackages.length} total packages.`);

        // Filter packages if specific IDs provided
        let packagesToProcess = [];
        if (packageId && packageId.trim().length > 0) {
            logger.info(`Filtering for specific packages: ${packageId}`);
            const idList = packageId.split(',').map(id => id.trim().toUpperCase());
            packagesToProcess = allPackages.filter(pkg => idList.includes(pkg.Id.toUpperCase()));
            logger.info(`Found ${packagesToProcess.length} matching packages.`);
        } else {
            logger.info('No specific Package IDs provided. Processing all packages.');
            packagesToProcess = allPackages;
        }

        // Set total for progress bar
        await setTotal(jobId, 'download', packagesToProcess.length);

        // Loop through packages and iFlows
        logger.info('Step 3 & 4: Looping packages and iFlows...');
        const version = 'active';

        for (const [index, pkg] of packagesToProcess.entries()) {
            logger.info(`--- Processing Package ${index + 1}/${packagesToProcess.length}: ${pkg.Name} ---`);

            const iFlowsUrl = `${cpiBaseUrl}/IntegrationPackages('${pkg.Id}')/IntegrationDesigntimeArtifacts`;
            let iFlows = [];

            try {
                const iFlowsResponse = await axios.get(iFlowsUrl, { headers: authHeader });
                iFlows = iFlowsResponse.data.d.results;
            } catch (pkgError) {
                logger.error(`Error getting iFlows for package ${pkg.Name}: ${pkgError.message}`);
                continue;
            }

            if (iFlows.length === 0) {
                logger.warn(`No iFlows found for package: ${pkg.Name}`);
                resultsStream.write([
                    escapeCSV(pkg.Name), escapeCSV(pkg.Id), '', '', '', '', ''
                ].join(',') + '\n');
            } else {
                logger.info(`Found ${iFlows.length} iFlows for package: ${pkg.Name}`);

                for (const iflow of iFlows) {
                    // Track unique iFlows
                    processedIFlows.add(iflow.Id);

                    const configsUrl = `${cpiBaseUrl}/IntegrationDesigntimeArtifacts(Id='${iflow.Id}',Version='${version}')/Configurations`;
                    let configurations = [];

                    const baseRow = [
                        escapeCSV(pkg.Name),
                        escapeCSV(pkg.Id),
                        escapeCSV(iflow.Name),
                        escapeCSV(iflow.Id)
                    ];

                    try {
                        const configResponse = await axios.get(configsUrl, { headers: authHeader });
                        configurations = configResponse.data.d.results;
                        parameterTotalCount += configurations.length;
                        parameterSuccessCount += configurations.length; // All params fetched successfully

                        // Mark iFlow as successful
                        successfulIFlows.add(iflow.Id);
                    } catch (iflowError) {
                        logger.error(`Error getting configs for iFlow ${iflow.Name}: ${iflowError.message}`);
                        resultsStream.write([...baseRow, 'ERROR', escapeCSV(iflowError.message), ''].join(',') + '\n');
                        continue;
                    }

                    if (configurations.length === 0) {
                        resultsStream.write([...baseRow, '', '', ''].join(',') + '\n');
                    } else {
                        configurations.forEach(config => {
                            const configRow = [
                                ...baseRow,
                                escapeCSV(config.ParameterKey),
                                escapeCSV(config.ParameterValue),
                                escapeCSV(config.DataType)
                            ];
                            resultsStream.write(configRow.join(',') + '\n');
                        });
                    }
                }
            }

            // Update progress
            progress++;
            await updateProgress(jobId, 'download', progress, packagesToProcess.length);
        }

        // Calculate final counts based on unique iFlows
        artifactTotalCount = processedIFlows.size;
        artifactSuccessCount = successfulIFlows.size;

        logger.info('All data fetched. CSV generated.');
        logger.info(`Total iFlows processed: ${artifactTotalCount}, Successful: ${artifactSuccessCount}`);
        finalStatus = 'Complete';

        // Log successful completion
        logJobExecution('download', jobId, 'Complete', {
            projectName,
            environment,
            userName,
            packagesProcessed: packagesToProcess.length,
            iFlowsProcessed: artifactTotalCount
        });

    } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        logger.error(`FATAL DOWNLOAD ERROR: ${errorMsg}`);
        finalStatus = 'Failed';

        // Log failure
        logJobExecution('download', jobId, 'Failed', {
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
            jobType: 'download',
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
                activityType: 'Download Config Params'
            },
            uploadFilePath: null,
            progress,
            artifactCount: `${artifactSuccessCount}/${artifactTotalCount}`,
            parameterCount: parameterTotalCount > 0 ? `${parameterSuccessCount}/${parameterTotalCount}` : 'N/A',
            timeTakenSeconds
        });
    }
}

module.exports = {
    runDownloadJob
};
