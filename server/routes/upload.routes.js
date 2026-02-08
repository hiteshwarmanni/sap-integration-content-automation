// server/routes/upload.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, getUserInfo } = require('../auth-middleware');
const db = require('../db-wrapper');
const { upload } = require('../utils');
const { runUploadJob } = require('../jobs');
const { logInfo, logError, logApiRequest } = require('../cloud-logger');

// Start upload job
router.post('/run-upload', authenticate, upload.single('file'), async (req, res) => {
    if (!req.file) {
        logApiRequest(req, 'error', { reason: 'No file uploaded' });
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
        const userInfo = getUserInfo(req);
        const userName = userInfo.email || userInfo.id || 'Unknown User';

        // Validate that credentials are provided
        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret) {
            logApiRequest(req, 'error', { reason: 'Missing credentials' });
            return res.status(400).json({ error: 'Missing required credentials.' });
        }

        const formDataWithUser = { ...req.body, userName };
        const jobData = { formData: formDataWithUser, filePath: req.file.path };

        const jobId = await db.insertUploadJob({
            status: 'Pending',
            progress: 0,
            total: 0,
            temp_upload_path: req.file.path,
            form_data_json: JSON.stringify(jobData)
        });

        logInfo('Upload job created', {
            jobId,
            userName,
            projectName: req.body.projectName,
            environment: req.body.environment,
            fileName: req.file.originalname
        });
        logApiRequest(req, 'success', { jobId, userName, fileName: req.file.originalname });

        res.status(202).json({ jobId: jobId });
        runUploadJob(jobId);
    } catch (error) {
        logError('Failed to start upload job', error);
        logApiRequest(req, 'error', { error: error.message });
        res.status(500).json({ error: 'Failed to start job.' });
    }
});

// Get upload job status
router.get('/job-status/:jobId', authenticate, async (req, res) => {
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
        logError('Error fetching upload job status', error);
        logApiRequest(req, 'error', { jobId: req.params.jobId, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Get upload result
router.get('/get-result/:jobId', authenticate, async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await db.getUploadJobById(jobId);

        if (!job) {
            logApiRequest(req, 'error', { jobId, reason: 'Job not found' });
            return res.status(404).json({ error: 'Job not found.' });
        }

        if (!job.log_id) {
            logApiRequest(req, 'error', { jobId, reason: 'Log ID not found for job' });
            return res.status(404).json({ error: 'Result file not found.' });
        }

        const log = await db.getLogById(job.log_id);

        if (!log || !log.resultContent) {
            logApiRequest(req, 'error', { jobId, reason: 'Result content not found in database' });
            return res.status(404).json({ error: 'Result file not found.' });
        }

        const filename = `${log.projectName}_${log.environment}_results_${log.timestamp.replace(/[: ]/g, '-')}.csv`;

        logApiRequest(req, 'success', { jobId, filename });
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