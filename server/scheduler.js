// server/scheduler.js
// Cron scheduler for automated jobs

const cron = require('node-cron');
const { runCleanupJob } = require('./jobs/cleanup-job');
const { logInfo, logError } = require('./cloud-logger');

/**
 * Parse cleanup schedule from environment variable
 * Format: "DAILY HH" or "WEEKLY HH" or "MONTHLY HH"
 * @returns {Object} { cronExpression, description }
 */
function parseCleanupSchedule() {
    const scheduleInput = process.env.CLEANUP_SCHEDULE_UTC || 'DAILY 00';

    try {
        const parts = scheduleInput.trim().split(/\s+/);
        if (parts.length !== 2) {
            throw new Error('Invalid format. Expected: <DAILY/WEEKLY/MONTHLY> <HH>');
        }

        const [frequency, hour] = parts;
        const hourNum = parseInt(hour, 10);

        // Validate hour
        if (isNaN(hourNum) || hourNum < 0 || hourNum > 23) {
            throw new Error(`Invalid hour: ${hour}. Must be 00-23`);
        }

        const hourFormatted = hour.padStart(2, '0');
        let cronExpression;
        let description;

        switch (frequency.toUpperCase()) {
            case 'WEEKLY':
                cronExpression = `0 ${hourNum} * * 0`;
                description = `Every Sunday at ${hourFormatted}:00 UTC`;
                break;
            case 'MONTHLY':
                cronExpression = `0 ${hourNum} 1 * *`;
                description = `1st of every month at ${hourFormatted}:00 UTC`;
                break;
            case 'DAILY':
                cronExpression = `0 ${hourNum} * * *`;
                description = `Every day at ${hourFormatted}:00 UTC`;
                break;
            default:
                throw new Error(`Invalid frequency: ${frequency}. Must be DAILY, WEEKLY, or MONTHLY`);
        }

        return { cronExpression, description };
    } catch (error) {
        logError('Failed to parse CLEANUP_SCHEDULE_UTC, using default', error);
        return {
            cronExpression: '0 0 * * *',
            description: 'Every day at 00:00 UTC (default)'
        };
    }
}

/**
 * Initialize all scheduled jobs
 */
function initializeScheduler() {
    const { cronExpression, description } = parseCleanupSchedule();

    try {
        cron.schedule(cronExpression, async () => {
            logInfo('Scheduled database cleanup job triggered');
            try {
                await runCleanupJob();
            } catch (error) {
                logError('Scheduled cleanup job failed', error);
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        });

        logInfo('Scheduler initialized successfully', {
            scheduleInput: process.env.CLEANUP_SCHEDULE_UTC || 'DAILY 00',
            cronExpression,
            description,
            timezone: 'UTC'
        });

    } catch (error) {
        logError('Failed to initialize scheduler', error);
    }
}

module.exports = {
    initializeScheduler
};