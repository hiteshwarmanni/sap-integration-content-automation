// server/jobs/shared/progress-tracker.js

const db = require('../../db-wrapper.js');

/**
 * Updates job progress in database
 * @param {number} jobId - Job ID
 * @param {string} jobType - Type of job (download, upload, deploy)
 * @param {number} progress - Current progress count
 * @param {number} total - Total items to process
 * @returns {Promise<void>}
 */
async function updateProgress(jobId, jobType, progress, total) {
    // Update every 5 items or on completion
    if (progress % 5 === 0 || progress === total) {
        if (jobType === 'download') {
            await db.updateDownloadJob(jobId, { progress });
        } else if (jobType === 'transport') {
            await db.updateTransportJob(jobId, { progress });
        } else {
            // upload and deploy jobs use the same table
            await db.updateUploadJob(jobId, { progress });
        }
    }
}

/**
 * Sets total count for job
 * @param {number} jobId - Job ID
 * @param {string} jobType - Type of job (download, upload, deploy)
 * @param {number} total - Total items to process
 * @returns {Promise<void>}
 */
async function setTotal(jobId, jobType, total) {
    if (jobType === 'download') {
        await db.updateDownloadJob(jobId, { total });
    } else if (jobType === 'transport') {
        await db.updateTransportJob(jobId, { total });
    } else {
        await db.updateUploadJob(jobId, { total });
    }
}

/**
 * Updates job status
 * @param {number} jobId - Job ID
 * @param {string} jobType - Type of job (download, upload, deploy)
 * @param {string} status - Status to set (Running, Complete, Failed)
 * @returns {Promise<void>}
 */
async function updateStatus(jobId, jobType, status) {
    if (jobType === 'download') {
        await db.updateDownloadJob(jobId, { status });
    } else if (jobType === 'transport') {
        await db.updateTransportJob(jobId, { status });
    } else {
        await db.updateUploadJob(jobId, { status });
    }
}

module.exports = {
    updateProgress,
    setTotal,
    updateStatus
};
