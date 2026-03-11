// server/routes/transport-logs.routes.js
const express = require('express');
const router = express.Router();
const db = require('../db-wrapper.js');
const { logInfo, logError } = require('../cloud-logger.js');
const { authenticate, checkScope } = require('../auth-middleware.js');
const { convertToCSV } = require('../jobs/shared/csv-helper.js');

/**
 * GET /api/transport-logs
 * Retrieve all transport logs
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const logs = await db.getAllTransportLogs();
        logInfo('Transport logs fetched successfully', { count: logs.length });
        res.json(logs);
    } catch (error) {
        logError('Error fetching transport logs', error);
        res.status(500).json({ error: 'Failed to fetch transport logs' });
    }
});

/**
 * GET /api/transport-logs/:id
 * Retrieve a specific transport log by ID
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const log = await db.getTransportLogById(id);

        if (!log) {
            return res.status(404).json({ error: 'Transport log not found' });
        }

        logInfo('Transport log fetched successfully', { id });
        res.json(log);
    } catch (error) {
        logError('Error fetching transport log', error);
        res.status(500).json({ error: 'Failed to fetch transport log' });
    }
});

/**
 * DELETE /api/transport-logs/:id
 * Delete a specific transport log (Admin only)
 */
router.delete('/:id', authenticate, checkScope('Admin'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if log exists
        const log = await db.getTransportLogById(id);
        if (!log) {
            return res.status(404).json({ error: 'Transport log not found' });
        }

        // Delete the log
        await db.deleteTransportLog(id);

        logInfo('Transport log deleted successfully', { id });
        res.json({ message: 'Transport log deleted successfully' });
    } catch (error) {
        logError('Error deleting transport log', error);
        res.status(500).json({ error: 'Failed to delete transport log' });
    }
});

/**
 * POST /api/transport-logs/export
 * Export transport logs to CSV (Admin only)
 */
router.post('/export', authenticate, checkScope('Admin'), async (req, res) => {
    try {
        const logs = await db.getAllTransportLogs();
        
        // Define CSV headers
        const headers = [
            'id',
            'projectName',
            'environment',
            'userName',
            'timestamp',
            'status',
            'sourcePackageId',
            'sourceIflowName',
            'targetPackageId',
            'targetIflowName',
            'sourceIflowId',
            'targetIflowId',
            'timeTakenSeconds'
        ];

        // Convert to CSV
        const csvContent = convertToCSV(logs, headers);

        // Set headers for file download
        const filename = `transport-logs-${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        logInfo('Transport logs exported successfully', { count: logs.length, filename });
        res.send(csvContent);
    } catch (error) {
        logError('Error exporting transport logs', error);
        res.status(500).json({ error: 'Failed to export transport logs' });
    }
});

/**
 * POST /api/transport-logs/bulk-delete
 * Delete multiple transport logs (Admin only)
 * Body: { ids: [1, 2, 3] } or { deleteAll: true }
 */
router.post('/bulk-delete', authenticate, checkScope('Admin'), async (req, res) => {
    try {
        const { ids, deleteAll } = req.body;

        if (deleteAll) {
            // Delete all transport logs
            const logs = await db.getAllTransportLogs();
            let deletedCount = 0;

            for (const log of logs) {
                await db.deleteTransportLog(log.id);
                deletedCount++;
            }

            logInfo('All transport logs deleted', { deletedCount });
            res.json({ 
                message: `Successfully deleted ${deletedCount} transport log(s)`,
                deletedCount 
            });
        } else if (ids && Array.isArray(ids) && ids.length > 0) {
            // Delete specific logs by IDs
            let deletedCount = 0;
            const errors = [];

            for (const id of ids) {
                try {
                    const log = await db.getTransportLogById(id);
                    if (log) {
                        await db.deleteTransportLog(id);
                        deletedCount++;
                    } else {
                        errors.push(`Log ID ${id} not found`);
                    }
                } catch (err) {
                    errors.push(`Failed to delete log ID ${id}: ${err.message}`);
                }
            }

            logInfo('Transport logs bulk deleted', { deletedCount, errors: errors.length });
            
            if (errors.length > 0) {
                res.json({
                    message: `Deleted ${deletedCount} log(s) with ${errors.length} error(s)`,
                    deletedCount,
                    errors
                });
            } else {
                res.json({
                    message: `Successfully deleted ${deletedCount} transport log(s)`,
                    deletedCount
                });
            }
        } else {
            res.status(400).json({ error: 'Please provide either "ids" array or "deleteAll: true"' });
        }
    } catch (error) {
        logError('Error in bulk delete transport logs', error);
        res.status(500).json({ error: 'Failed to delete transport logs' });
    }
});

module.exports = router;
