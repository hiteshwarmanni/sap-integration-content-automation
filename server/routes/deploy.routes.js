// server/routes/deploy.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, getUserInfo } = require('../auth-middleware');
const db = require('../db-wrapper');
const { upload } = require('../utils');
const { runDeployJob } = require('../jobs');
const { logInfo, logError, logApiRequest } = require('../cloud-logger');

// Start deploy job
router.post('/run-deploy', authenticate, upload.single('file'), async (req, res) => {
    if (!req.file) {
        logApiRequest(req, 'error', { reason: 'No file uploaded' });
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
        const userInfo = getUserInfo(req);
        const userName = userInfo.email || userInfo.id || 'Unknown User';
        const operation = req.body.operation || 'deploy'; // 'deploy' or 'undeploy'

        // Validate that credentials are provided
        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret) {
            logApiRequest(req, 'error', { reason: 'Missing credentials' });
            return res.status(400).json({ error: 'Missing required credentials.' });
        }

        const formDataWithUser = { ...req.body, userName, operation };
        const jobData = { formData: formDataWithUser, filePath: req.file.path };

        const jobId = await db.insertUploadJob({
            status: 'Pending',
            progress: 0,
            total: 0,
            temp_upload_path: req.file.path,
            form_data_json: JSON.stringify(jobData)
        });

        res.status(202).json({ jobId: jobId });
        runDeployJob(jobId);
    } catch (error) {
        logError('Failed to start deploy job', error);
        logApiRequest(req, 'error', { error: error.message });
        res.status(500).json({ error: 'Failed to start job.' });
    }
});

// Get deploy job status
router.get('/deploy-job-status/:jobId', authenticate, async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await db.getUploadJobById(jobId);

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
        logError('Error fetching deploy job status', error);
        logApiRequest(req, 'error', { jobId: req.params.jobId, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Get deploy result
router.get('/get-deploy-result/:jobId', authenticate, async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await db.getUploadJobById(jobId);

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

        const formData = JSON.parse(job.form_data_json).formData;
        const operation = formData.operation || 'deploy';
        const filename = `${log.projectName}_${log.environment}_${operation}_Results_${log.timestamp.replace(/[: ]/g, '-')}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(log.resultContent);
    } catch (error) {
        logError(`Error downloading deploy result file for job ${req.params.jobId}`, error);
        logApiRequest(req, 'error', { jobId: req.params.jobId, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
