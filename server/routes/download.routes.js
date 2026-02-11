// server/routes/download.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, getUserInfo, checkScope } = require('../auth-middleware');
const db = require('../db-wrapper');
const { runDownloadJob, getPackageDetails } = require('../jobs');
const { logInfo, logError, logApiRequest } = require('../cloud-logger');


// Get Package Name details
router.post('/get-package-details', authenticate, async (req, res) => {
    try {
        const userInfo = getUserInfo(req);
        const userName = userInfo.email || userInfo.id || 'Unknown User';

        // Validate that credentials are provided
        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret) {
            logApiRequest(req, 'error', { reason: 'Missing credentials' });
            return res.status(400).json({ error: 'Missing required credentials.' });
        }

        const formDataWithUser = { ...req.body, userName };
        const jobData = { formData: formDataWithUser };

        // Call getPackageDetails and return the packages
        const packages = await getPackageDetails(JSON.stringify(jobData));

        res.status(200).json({ packages });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to fetch packages.' });
    }
});

// Start download job - requires Execute scope
router.post('/start-download-job', authenticate, async (req, res) => {
    try {
        const userInfo = getUserInfo(req);
        const userName = userInfo.email || userInfo.id || 'Unknown User';

        // Validate that credentials are provided
        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret) {
            logApiRequest(req, 'error', { reason: 'Missing credentials' });
            return res.status(400).json({ error: 'Missing required credentials.' });
        }

        const formDataWithUser = { ...req.body, userName };
        const jobData = { formData: formDataWithUser };

        const jobId = await db.insertDownloadJob({
            status: 'Pending',
            progress: 0,
            total: 0,
            form_data_json: JSON.stringify(jobData)
        });

        res.status(202).json({ jobId: jobId });
        runDownloadJob(jobId);
    } catch (error) {
        logError('Failed to start download job', error);
        logApiRequest(req, 'error', { error: error.message });
        res.status(500).json({ error: 'Failed to start job.' });
    }
});

// Get download job status
router.get('/download-job-status/:jobId', authenticate, async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await db.getDownloadJobById(jobId);

        if (!job) {
            logApiRequest(req, 'error', { jobId, reason: 'Job not found' });
            return res.status(404).json({ error: 'Job not found.' });
        }

        res.json({
            status: job.status,
            progress: job.progress,
            total: job.total,
            resultFile: job.result_file_path
        });
    } catch (error) {
        logError('Error fetching download job status', error);
        logApiRequest(req, 'error', { jobId: req.params.jobId, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Get download result
router.get('/get-download-result/:jobId', authenticate, async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await db.getDownloadJobById(jobId);

        if (!job) {
            logApiRequest(req, 'error', { jobId, reason: 'Job not found' });
            return res.status(404).json({ error: 'Job not found.' });
        }

        if (!job.log_id) {
            return res.status(404).json({ error: 'Result file not found.' });
        }

        const log = await db.getLogById(job.log_id);

        if (!log || !log.resultContent) {
            return res.status(404).json({ error: 'Result file not found.' });
        }

        const filename = `${log.projectName}_${log.environment}_configurations_${log.timestamp.replace(/[: ]/g, '-')}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(log.resultContent);
    } catch (error) {
        logError(`Error downloading result file for job ${req.params.jobId}`, error);
        logApiRequest(req, 'error', { jobId: req.params.jobId, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
