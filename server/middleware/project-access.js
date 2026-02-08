// server/middleware/project-access.js
// Role-based access control for project resources

const db = require('../db-wrapper');
const { logWarning, logError } = require('../cloud-logger');

/**
 * Check if user has Admin scope (full access to all resources)
 * @param {Object} req - Express request
 * @returns {boolean}
 */
function isAdmin(req) {
    // Check if running locally
    const isLocal = !process.env.VCAP_APPLICATION;
    if (isLocal) {
        return true; // Local mode: grant admin access for testing
    }

    // Check req.authInfo for Admin scope
    return req.authInfo &&
        typeof req.authInfo.checkLocalScope === 'function' &&
        req.authInfo.checkLocalScope('Admin');
}

/**
 * Check if user is a project member
 * @param {string} userId - User email/ID
 * @param {string} projectName - Project name
 * @param {string} environment - Environment
 * @returns {Promise<boolean>}
 */
async function isProjectMember(userId, projectName, environment) {
    try {
        const project = await db.getProjectByNameAndEnv(projectName, environment);

        if (!project || !project.projectMembers) {
            return false;
        }

        // Parse project members JSON
        let members = [];
        try {
            members = JSON.parse(project.projectMembers);
        } catch (e) {
            logError('Failed to parse project members', { projectName, environment });
            return false;
        }

        // Check if user is in members list
        return members.includes(userId);

    } catch (error) {
        logError('Error checking project membership', { error: error.message });
        return false;
    }
}

/**
 * Middleware to check if user can download log/result files
 * Authorization: Admin (with Admin scope) OR Project Member
 */
function checkLogFileAccess() {
    return async (req, res, next) => {
        try {
            const logId = req.params.logId;

            if (!logId) {
                return res.status(400).json({ error: 'Log ID is required' });
            }

            // Get user ID
            const userId = req.user?.email || req.user?.id;

            if (!userId) {
                logWarning('User identification failed for log access');
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // Check if user is Admin
            if (isAdmin(req)) {
                req.isAdmin = true;
                return next();
            }

            // Get log details
            const log = await db.getLogById(logId);

            if (!log) {
                return res.status(404).json({ error: 'Log not found' });
            }

            // Check if user is project member
            const isMember = await isProjectMember(userId, log.projectName, log.environment);

            if (!isMember) {
                logWarning('Log file access denied', {
                    userId,
                    logId,
                    projectName: log.projectName,
                    environment: log.environment
                });
                return res.status(403).json({
                    error: 'Access denied. You must be an Admin or project member to download this file.'
                });
            }

            // User is a project member
            req.isProjectMember = true;
            next();

        } catch (error) {
            logError('Error in log file access check', { error: error.message });
            res.status(500).json({ error: 'Failed to verify access' });
        }
    };
}

module.exports = {
    checkLogFileAccess,
    isAdmin,
    isProjectMember
};