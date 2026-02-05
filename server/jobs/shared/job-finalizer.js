// server/jobs/shared/job-finalizer.js

const { fs } = require('../../utils.js');
const db = require('../../db-wrapper.js');
const { logInfo, logError: logErrorToCloud } = require('../../cloud-logger.js');
const { closeLogger, closeStream } = require('./logger-helper.js');

/**
 * Finalizes job execution - closes streams, reads files, updates database
 * @param {Object} options - Finalization options
 * @param {number} options.jobId - Job ID
 * @param {string} options.jobType - Type of job (download, upload, deploy, undeploy)
 * @param {string} options.finalStatus - Final status (Complete or Failed)
 * @param {string} options.logFilePath - Path to log file
 * @param {string} options.resultsFilePath - Path to results file
 * @param {Object} options.logger - Winston logger instance
 * @param {Object} options.resultsStream - Results write stream
 * @param {string} options.formattedTimestamp - Formatted timestamp string
 * @param {Object} options.metadata - Metadata to store (projectName, environment, etc.)
 * @param {string} options.uploadFilePath - Path to uploaded CSV (for cleanup)
 * @param {number} options.progress - Current progress count
 * @param {string} options.artifactCount - Artifact count (e.g., "5/10")
 * @param {string} options.parameterCount - Parameter count (e.g., "45/50" or "N/A")
 * @param {number} options.timeTakenSeconds - Time taken in seconds
 * @returns {Promise<void>}
 */
async function finalizeJob(options) {
    const {
        jobId,
        jobType,
        finalStatus,
        logFilePath,
        resultsFilePath,
        logger,
        resultsStream,
        formattedTimestamp,
        metadata,
        uploadFilePath,
        progress,
        artifactCount,
        parameterCount,
        timeTakenSeconds
    } = options;

    // Close streams and wait for completion
    await closeStream(resultsStream);

    // Delete uploaded CSV file if exists
    if (uploadFilePath && fs.existsSync(uploadFilePath)) {
        fs.unlinkSync(uploadFilePath);
    }

    // Close logger and wait for flush
    await closeLogger(logger);

    // Add a small delay to ensure files are fully flushed to disk
    await new Promise(resolve => setTimeout(resolve, 200));

    // Read file contents to store in database
    let logContent = null;
    let resultContent = null;

    try {
        logInfo('Attempting to read log file', { logFilePath, exists: fs.existsSync(logFilePath) });

        if (fs.existsSync(logFilePath)) {
            const stats = fs.statSync(logFilePath);
            logInfo('Log file found', { logFilePath, sizeBytes: stats.size });
            logContent = fs.readFileSync(logFilePath, 'utf8');
            logInfo('Successfully read log file', { logFilePath, contentLength: logContent.length });
        } else {
            logErrorToCloud('Log file does NOT exist', new Error(`File not found: ${logFilePath}`));
        }

        logInfo('Attempting to read result file', { resultsFilePath, exists: fs.existsSync(resultsFilePath) });

        if (fs.existsSync(resultsFilePath)) {
            const stats = fs.statSync(resultsFilePath);
            logInfo('Result file found', { resultsFilePath, sizeBytes: stats.size });
            resultContent = fs.readFileSync(resultsFilePath, 'utf8');
            logInfo('Successfully read result file', { resultsFilePath, contentLength: resultContent.length });
        } else {
            logErrorToCloud('Result file does NOT exist', new Error(`File not found: ${resultsFilePath}`));
        }
    } catch (readError) {
        logErrorToCloud('Error reading log/result files', readError);
    }

    // Log what we're about to store
    logInfo('Preparing to store content in database', {
        logContentSize: logContent ? logContent.length : 0,
        resultContentSize: resultContent ? resultContent.length : 0,
        hasLogContent: !!logContent,
        hasResultContent: !!resultContent
    });

    // Update job status with final progress
    let updatedJob;
    if (jobType === 'download') {
        updatedJob = await db.getDownloadJobById(jobId);
        await db.updateDownloadJob(jobId, {
            status: finalStatus,
            progress: (finalStatus === 'Complete') ? updatedJob.total : progress
        });
    } else {
        updatedJob = await db.getUploadJobById(jobId);
        await db.updateUploadJob(jobId, {
            status: finalStatus,
            progress: (finalStatus === 'Complete') ? updatedJob.total : progress
        });
    }

    // Write the final audit log with content directly to database
    try {
        const logId = await db.insertLog({
            projectName: metadata.projectName,
            environment: metadata.environment,
            userName: metadata.userName,
            activityType: metadata.activityType,
            logContent: logContent,
            resultContent: resultContent,
            timestamp: formattedTimestamp.replace('_', ' '),
            status: finalStatus,
            artifactCount: artifactCount || null,
            parameterCount: parameterCount || null,
            timeTakenSeconds: timeTakenSeconds || null
        });

        // Link the log to the job by storing log_id
        if (jobType === 'download') {
            await db.updateDownloadJob(jobId, { log_id: logId });
        } else {
            await db.updateUploadJob(jobId, { log_id: logId });
        }

        logInfo(`${jobType} job audit log stored in database`, { jobId, logId, finalStatus });
    } catch (logError) {
        logErrorToCloud(`Failed to write final ${jobType} log to database`, logError);
    }
}

module.exports = {
    finalizeJob
};
