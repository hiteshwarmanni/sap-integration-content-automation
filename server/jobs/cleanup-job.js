// server/jobs/cleanup-job.js
// Database cleanup job - clears LOG_CONTENT and RESULT_CONTENT for logs older than 1 year

const db = require('../db-wrapper');
const { logInfo, logError } = require('../cloud-logger');

/**
 * Group logs by project and environment
 * @param {Array} logs - Array of log entries
 * @returns {Object} Grouped logs
 */
function groupByProjectEnv(logs) {
    const grouped = {};

    logs.forEach(log => {
        const key = `${log.projectName}|${log.environment}`;
        if (!grouped[key]) {
            grouped[key] = {
                projectName: log.projectName,
                environment: log.environment,
                count: 0
            };
        }
        grouped[key].count++;
    });

    return Object.values(grouped);
}

/**
 * Build cleanup message with project/environment breakdown
 * @param {Array} groupedLogs - Grouped log entries
 * @param {number} totalCount - Total number of logs cleaned
 * @param {number} retentionMonths - Number of months for retention period
 * @returns {string} Formatted message
 */
function buildCleanupMessage(groupedLogs, totalCount, retentionMonths) {
    const retentionDescription = retentionMonths === 12
        ? '1 year'
        : retentionMonths < 12
            ? `${retentionMonths} months`
            : `${retentionMonths} months (${(retentionMonths / 12).toFixed(1)} years)`;

    if (totalCount === 0) {
        return `No logs older than ${retentionDescription} found. Nothing to clean.`;
    }

    let message = `Cleaned ${totalCount} log entries (older than ${retentionDescription}):\n\n`;

    // Sort by count descending
    groupedLogs.sort((a, b) => b.count - a.count);

    // Add project/environment breakdown
    groupedLogs.forEach(item => {
        message += `Project: ${item.projectName}, Environment: ${item.environment} - ${item.count} entries\n`;
    });

    message += `\nTotal entries cleaned: ${totalCount}`;

    return message;
}

/**
 * Main cleanup job function
 * Clears LOG_CONTENT and RESULT_CONTENT for logs older than specified retention period
 * @param {string} executedBy - User email or 'SCHEDULED_JOB' for scheduled executions
 */
async function runCleanupJob(executedBy = 'SCHEDULED_JOB') {
    const executionTimestamp = new Date();

    logInfo('Database cleanup job started: ', { executedBy });

    try {
        // Step 1: Calculate cutoff date based on RETENTION_MONTHS
        // Can be any positive number: 6 (6 months), 12 (1 year), 18 (1.5 years), 24 (2 years), 36 (3 years), etc.
        let retentionMonths = parseInt(process.env.RETENTION_MONTHS || '12', 10);

        // Validate retention months (must be positive number)
        if (isNaN(retentionMonths) || retentionMonths <= 0) {
            logError('Invalid RETENTION_MONTHS value, using default 12 months', {
                providedValue: process.env.RETENTION_MONTHS,
                usingDefault: 12
            });
            retentionMonths = 12;
        }

        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);

        logInfo('Cleanup cutoff date', {
            cutoffDate: cutoffDate.toISOString(),
            retentionMonths: retentionMonths
        });

        // Step 2: Get logs older than 1 year
        const logsToClean = await db.getLogsOlderThan(cutoffDate);

        logInfo('Found logs to clean', { count: logsToClean.length });

        // Step 3: If no logs to clean, save to database and exit
        if (logsToClean.length === 0) {
            const retentionDescription = retentionMonths === 12
                ? '1 year'
                : retentionMonths < 12
                    ? `${retentionMonths} months`
                    : `${retentionMonths} months (${(retentionMonths / 12).toFixed(1)} years)`;
            const message = `No logs older than ${retentionDescription} found. Nothing to clean.`;

            await db.createCleanupLog({
                executionTimestamp,
                status: 'Success',
                logsCleanedCount: 0,
                message,
                executedBy,
                cutoffDate,
                errorMessage: null
            });

            logInfo('Database cleanup completed - nothing to clean: ', { executedBy });
            return;
        }

        // Step 4: Group by project/environment
        const groupedLogs = groupByProjectEnv(logsToClean);

        // Step 5: Clear LOG_CONTENT and RESULT_CONTENT
        const cleanedCount = await db.clearLogContent(cutoffDate);

        logInfo('Cleared log content', { cleanedCount });

        // Step 6: Build message
        const message = buildCleanupMessage(groupedLogs, cleanedCount, retentionMonths);

        // Step 7: Save to database
        await db.createCleanupLog({
            executionTimestamp,
            status: 'Success',
            logsCleanedCount: cleanedCount,
            message,
            executedBy,
            cutoffDate,
            errorMessage: null
        });

        // Step 8: Log to cloud logger for audit trail
        logInfo('Database cleanup completed successfully', {
            cleanedCount,
            executedBy,
            cutoffDate: cutoffDate.toISOString(),
            breakdown: groupedLogs
        });

    } catch (error) {
        logError('Database cleanup job failed', error);

        // Save error to database
        try {
            await db.createCleanupLog({
                executionTimestamp,
                status: 'Failed',
                logsCleanedCount: 0,
                message: `Cleanup failed: ${error.message}`,
                executedBy,
                cutoffDate: new Date(new Date().setFullYear(new Date().getFullYear() - 1)),
                errorMessage: error.message
            });
        } catch (dbError) {
            logError('Failed to save cleanup error to database', dbError);
        }
    }
}

module.exports = {
    runCleanupJob
};