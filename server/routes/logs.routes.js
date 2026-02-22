// server/routes/logs.routes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../auth-middleware');
const { checkLogFileAccess } = require('../middleware/project-access');
const db = require('../db-wrapper');
const { getFormattedTimestamp } = require('../utils');
const { logInfo, logError, logApiRequest } = require('../cloud-logger');

// Create log entry
router.post('/log', authenticate, async (req, res) => {
    try {
        const { projectName, environment, userName, activityType, logContent, resultContent, executionTimestamp, status } = req.body;

        // Format timestamp: Convert YYYY-MM-DD_HH-MM-SS to YYYY-MM-DD HH:MM:SS
        let formattedTimestamp = executionTimestamp;
        if (!formattedTimestamp) {
            formattedTimestamp = getFormattedTimestamp(new Date());
            // Replace underscore with space: YYYY-MM-DD_HH-MM-SS -> YYYY-MM-DD HH-MM-SS
            formattedTimestamp = formattedTimestamp.replace('_', ' ');
            // Replace hyphens in time part (after space) with colons: YYYY-MM-DD HH-MM-SS -> YYYY-MM-DD HH:MM:SS
            const parts = formattedTimestamp.split(' ');
            if (parts.length === 2) {
                formattedTimestamp = parts[0] + ' ' + parts[1].replace(/-/g, ':');
            }
        }

        await db.insertLog({
            projectName,
            environment,
            userName: userName || 'N/A',
            activityType,
            logContent: logContent || null,
            resultContent: resultContent || null,
            timestamp: formattedTimestamp,
            status: status || 'Unknown'
        });

        res.status(201).json({ message: 'Log created' });
    } catch (error) {
        logError('Failed to create log entry in database', error);
        logApiRequest(req, 'error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Get all logs
router.get('/logs', authenticate, async (req, res) => {
    try {
        const logs = await db.getAllLogs();
        res.json(logs);
    } catch (error) {
        logError('Error fetching logs from database', error);
        logApiRequest(req, 'error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Download specific log file (Admin or Project Member only)
router.get('/download/log/:logId', authenticate, checkLogFileAccess(), async (req, res) => {
    try {
        const { logId } = req.params;
        const log = await db.getLogById(logId);

        if (!log || !log.logContent) {
            return res.status(404).json({ error: 'Log content not found.' });
        }

        const filename = `${log.projectName}_${log.activityType}_${log.timestamp.replace(/[: ]/g, '-')}.log`;

        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(log.logContent);
    } catch (error) {
        logError(`Error downloading log file for ID ${req.params.logId}`, error);
        logApiRequest(req, 'error', { logId: req.params.logId, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Download specific result file (Admin or Project Member only)
router.get('/download/result/:logId', authenticate, checkLogFileAccess(), async (req, res) => {
    try {
        const { logId } = req.params;
        const log = await db.getLogById(logId);

        if (!log || !log.resultContent) {
            return res.status(404).json({ error: 'Result content not found.' });
        }

        const filename = `${log.projectName}_${log.activityType}_results_${log.timestamp.replace(/[: ]/g, '-')}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(log.resultContent);
    } catch (error) {
        logError(`Error downloading result file for ID ${req.params.logId}`, error);
        logApiRequest(req, 'error', { logId: req.params.logId, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Check if user has access to download files for a specific log
router.get('/check-access/:logId', authenticate, async (req, res) => {
    try {
        const { logId } = req.params;
        const { isAdmin, isProjectMember } = require('../middleware/project-access');

        const userId = req.user?.email || req.user?.id;

        // Check if Admin
        if (isAdmin(req)) {
            return res.json({ hasAccess: true, isAdmin: true });
        }

        // Get log entry
        const log = await db.getLogById(logId);
        if (!log) {
            return res.status(404).json({ error: 'Log not found' });
        }

        // Check if project member
        const isMember = await isProjectMember(userId, log.projectName, log.environment);

        res.json({ hasAccess: isMember, isAdmin: false, isMember });
    } catch (error) {
        logError('Error checking log access', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete sensitive log content (Admin or Project Member only)
router.delete('/logs/content', authenticate, async (req, res) => {
    try {
        const { logIds } = req.body;
        const userId = req.user?.email || req.user?.id;

        // Validate input
        if (!logIds || !Array.isArray(logIds) || logIds.length !== 1) {
            return res.status(400).json({ error: 'Invalid log ID. Please provide exactly one log ID.' });
        }

        const logId = logIds[0];

        // Get log details
        const log = await db.getLogById(logId);
        if (!log) {
            return res.status(404).json({ error: 'Log not found' });
        }

        // Check access (Admin or Project Member)
        const { isAdmin, isProjectMember } = require('../middleware/project-access');
        const hasAccess = isAdmin(req) || await isProjectMember(userId, log.projectName, log.environment);

        if (!hasAccess) {
            logApiRequest(req, 'error', { logId, error: 'Access denied' });
            return res.status(403).json({ error: 'Access denied. You must be an Admin or project member to delete this log content.' });
        }

        // Delete log content (set LOG_CONTENT and RESULT_CONTENT to null)
        await db.clearLogContentByIds([logId]);

        // Create cleanup log entry for audit trail
        try {
            const executionTime = new Date();
            await db.createCleanupLog({
                executionTimestamp: executionTime,
                status: 'Success',
                logsCleanedCount: 1,
                message: `Manual deletion by user ${userId}\n\n` +
                    `Deleted sensitive content from:\n` +
                    `Project: ${log.projectName}, Environment: ${log.environment} - 1 entry\n` +
                    `- Activity: ${log.activityType}, Timestamp: ${log.timestamp}\n\n` +
                    `Total: 1 log entry cleaned`,
                executedBy: userId,
                cutoffDate: executionTime,
                errorMessage: null
            });
        } catch (cleanupLogError) {
            // Log the error but don't fail the request
            logError('Failed to create cleanup log entry', cleanupLogError);
        }

        logInfo('Manual log content deletion', {
            logId,
            projectName: log.projectName,
            environment: log.environment,
            deletedBy: userId
        });

        res.json({
            success: true,
            deletedCount: 1,
            logId,
            message: 'Log content deleted successfully'
        });

    } catch (error) {
        logError('Failed to delete log content', error);
        logApiRequest(req, 'error', { error: error.message });
        res.status(500).json({ error: 'Failed to delete log content' });
    }
});

module.exports = router;
