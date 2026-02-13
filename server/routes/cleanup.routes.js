// server/routes/cleanup.routes.js
// API routes for database cleanup operations (Admin only)

const express = require('express');
const router = express.Router();
const db = require('../db-wrapper');
const { authenticate, checkScope, getUserInfo } = require('../auth-middleware');
const { runCleanupJob } = require('../jobs/cleanup-job');
const { logInfo, logError, logApiRequest } = require('../cloud-logger');

// GET /api/cleanup/logs - Get all cleanup logs (Admin only)
// Client-side pagination approach - fetch all logs at once
router.get('/logs', authenticate, checkScope('Admin'), async (req, res) => {
    try {
        // Fetch all cleanup logs (no pagination params)
        const logs = await db.getAllCleanupLogs({ limit: 10000, offset: 0 });

        logApiRequest(req, 'success', { count: logs.length });
        res.json(logs);

    } catch (error) {
        logError('Failed to fetch cleanup logs', error);
        logApiRequest(req, 'error', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch cleanup logs' });
    }
});

// GET /api/cleanup-logs/:id - Get specific cleanup log by ID (Admin only)
router.get('/logs/:id', authenticate, checkScope('Admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const log = await db.getCleanupLogById(parseInt(id));

        if (!log) {
            logApiRequest(req, 'not_found', { id });
            return res.status(404).json({ error: 'Cleanup log not found' });
        }

        logApiRequest(req, 'success', { id });
        res.json(log);

    } catch (error) {
        logError('Failed to fetch cleanup log', error);
        logApiRequest(req, 'error', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch cleanup log' });
    }
});

// POST /api/cleanup/run - Manually trigger cleanup job (Admin only, for testing)
router.post('/run', authenticate, checkScope('Admin'), async (req, res) => {
    try {

        const userInfo = getUserInfo(req);
        const userEmail = userInfo.email || userInfo.id || 'Unknown User';
        // Get user info from request
        // const userEmail = req.user?.email || req.user?.id || 'UNKNOWN_USER';

        logInfo('Manual cleanup job triggered by admin: ', { userEmail });
        logApiRequest(req, 'success', { action: 'Manual cleanup triggered', userEmail });

        // Send immediate response
        res.json({
            message: 'Database cleanup job started. Check /api/cleanup/latest for results.',
            status: 'Running',
            triggeredBy: userEmail
        });

        // Run cleanup job asynchronously with user info
        runCleanupJob(userEmail).catch(error => {
            logError('Manual cleanup job failed', error);
        });

    } catch (error) {
        logError('Failed to start cleanup job', error);
        logApiRequest(req, 'error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;