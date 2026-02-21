// server/routes/projects.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, getUserInfo, checkScope } = require('../auth-middleware');
const db = require('../db-wrapper');
const { logInfo, logError, logWarning, logApiRequest } = require('../cloud-logger');

// Debug endpoint to test database connection
router.get('/test-db', authenticate, async (req, res) => {
    try {
        logInfo('Testing PROJECTS table access');
        const projects = await db.getAllProjects();
        res.json({
            success: true,
            message: 'Database connection successful',
            projectCount: projects.length,
            projects: projects
        });
    } catch (error) {
        logError('Database test failed', error);
        res.status(500).json({
            success: false,
            message: 'Database connection failed',
            error: error.message,
            stack: error.stack
        });
    }
});

// Get all projects - Access logic:
// - Admin (with Delete scope): Can access ALL projects
// - User (without Delete scope): Can only access projects they are a member of
router.get('/', authenticate, async (req, res) => {
    try {
        const userInfo = getUserInfo(req);
        const userId = userInfo.email || userInfo.id;
        const allProjects = await db.getAllProjects();

        // Check if running locally (no auth restrictions)
        const isLocal = !process.env.VCAP_APPLICATION;

        // Check if user has Delete scope (Admin)
        const hasDeleteScope = isLocal || (req.authInfo &&
            typeof req.authInfo.checkLocalScope === 'function' &&
            req.authInfo.checkLocalScope('Delete'));

        // Map projects with access info
        const accessibleProjects = allProjects.map(project => {
            let members = [];
            try {
                members = project.projectMembers ? JSON.parse(project.projectMembers) : [];
            } catch (e) {
                members = [];
            }

            const isMember = members.includes(userId);

            // Admin with Delete scope gets access to ALL projects
            // Regular users only get access to projects they're members of
            const hasAccess = hasDeleteScope || isMember;

            return {
                ...project,
                hasAccess,
                // Don't send sensitive data if user doesn't have access
                clientSecret: hasAccess ? project.clientSecret : '***',
                clientId: hasAccess ? project.clientId : '***'
            };
        });

        logInfo('Projects fetched', {
            userId,
            hasDeleteScope,
            accessibleCount: accessibleProjects.filter(p => p.hasAccess).length,
            totalCount: allProjects.length
        });
        logApiRequest(req, 'success', { count: accessibleProjects.length, userId });
        res.json(accessibleProjects);
    } catch (error) {
        logError('Error fetching projects', error);
        logApiRequest(req, 'error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Get single project by ID - Access logic:
// - Admin (with Delete scope): Can access ANY project
// - User (without Delete scope): Can only access projects they are a member of
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userInfo = getUserInfo(req);
        const userId = userInfo.email || userInfo.id;
        const project = await db.getProjectById(id);

        if (!project) {
            logApiRequest(req, 'error', { projectId: id, reason: 'Project not found' });
            return res.status(404).json({ error: 'Project not found.' });
        }

        // Check if running locally (no auth restrictions)
        const isLocal = !process.env.VCAP_APPLICATION;

        // Check if user has Delete scope (Admin)
        const hasDeleteScope = isLocal || (req.authInfo &&
            typeof req.authInfo.checkLocalScope === 'function' &&
            req.authInfo.checkLocalScope('Delete'));

        // Parse project members
        let members = [];
        try {
            members = project.projectMembers ? JSON.parse(project.projectMembers) : [];
        } catch (e) {
            members = [];
        }

        const isMember = members.includes(userId);

        // Admin with Delete scope gets access to ALL projects
        // Regular users only get access to projects they're members of
        const hasAccess = hasDeleteScope || isMember;

        if (!hasAccess) {
            logApiRequest(req, 'error', { projectId: id, userId, reason: 'Access denied - not a member' });
            return res.status(403).json({ error: 'Access denied to this project.' });
        }

        logApiRequest(req, 'success', { projectId: id, userId, hasDeleteScope, isMember });
        res.json(project);
    } catch (error) {
        logError(`Error fetching project ${req.params.id}`, error);
        logApiRequest(req, 'error', { projectId: req.params.id, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Create new project - requires Write scope (Admin and User can create)
router.post('/', authenticate, async (req, res) => {
    try {
        const userInfo = getUserInfo(req);
        const userId = userInfo.email || userInfo.id;
        const userName = userInfo.name || userId;

        const { projectName, environment, cpiBaseUrl, tokenUrl, clientId, clientSecret, projectMembers } = req.body;

        logInfo('Project creation initiated', {
            userId,
            userName,
            projectName,
            environment,
            providedMembers: projectMembers ? projectMembers.length : 0
        });

        // Validate required fields
        if (!projectName || !environment || !cpiBaseUrl || !tokenUrl || !clientId || !clientSecret) {
            logApiRequest(req, 'error', { reason: 'Missing required fields', userId, projectName });
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check if project already exists
        const existing = await db.getProjectByNameAndEnv(projectName, environment);
        if (existing) {
            logInfo('Project creation failed - duplicate', {
                projectName,
                environment,
                attemptedBy: userId,
                existingProjectId: existing.id
            });
            logApiRequest(req, 'error', { projectName, environment, reason: 'Project already exists' });
            return res.status(409).json({ error: 'Project with this name and environment already exists' });
        }

        // Automatically add creator as member (avoid duplicates)
        let members = projectMembers || [];
        const creatorWasAdded = !members.includes(userId);
        if (creatorWasAdded) {
            members.push(userId);
        }

        logInfo('Project members configured', {
            projectName,
            environment,
            totalMembers: members.length,
            creatorAutoAdded: creatorWasAdded,
            members: members
        });

        // Create project
        const projectId = await db.insertProject({
            projectName,
            environment,
            cpiBaseUrl,
            tokenUrl,
            clientId,
            clientSecret,
            projectMembers: JSON.stringify(members),
            createdBy: userId,  // Use email ID instead of name
            updatedBy: userId   // Use email ID instead of name
        });

        logInfo('Project created successfully', {
            projectId,
            projectName,
            environment,
            createdBy: userName,
            userId,
            memberCount: members.length,
            timestamp: new Date().toISOString()
        });
        logApiRequest(req, 'success', { projectId, projectName, environment });
        res.status(201).json({ id: projectId, message: 'Project created successfully' });
    } catch (error) {
        logError('Error creating project', error);
        logApiRequest(req, 'error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Update project - Authorization logic:
// - Admin (with Delete scope): Can update ANY project
// - User (without Delete scope): Can only update projects they are a member of
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userInfo = getUserInfo(req);
        const userId = userInfo.email || userInfo.id;
        const userName = userInfo.name || userId;

        const project = await db.getProjectById(id);
        if (!project) {
            logApiRequest(req, 'error', { projectId: id, reason: 'Project not found' });
            return res.status(404).json({ error: 'Project not found.' });
        }

        // Check if running locally (no auth restrictions)
        const isLocal = !process.env.VCAP_APPLICATION;

        // Check if user has Delete scope (Admin)
        const hasDeleteScope = isLocal || (req.authInfo &&
            typeof req.authInfo.checkLocalScope === 'function' &&
            req.authInfo.checkLocalScope('Delete'));

        // Parse project members
        let members = [];
        try {
            members = project.projectMembers ? JSON.parse(project.projectMembers) : [];
        } catch (e) {
            members = [];
        }

        const isMember = members.includes(userId);

        // Admin with Delete scope gets access to ALL projects
        // Regular users only get access to projects they're members of
        const hasAccess = hasDeleteScope || isMember;

        if (!hasAccess) {
            logWarning('Project update denied - insufficient permissions', {
                projectId: id,
                userId,
                projectName: project.projectName,
                hasDeleteScope,
                isMember
            });
            logApiRequest(req, 'error', { projectId: id, userId, reason: 'Access denied - not a member and no admin rights' });
            return res.status(403).json({
                error: 'Access denied. You must be a project member or have admin rights to update this project.'
            });
        }

        const { projectName, environment, cpiBaseUrl, tokenUrl, clientId, clientSecret, projectMembers } = req.body;

        const updateData = {};
        const changedFields = [];

        if (projectName !== undefined) { updateData.projectName = projectName; changedFields.push('projectName'); }
        if (environment !== undefined) { updateData.environment = environment; changedFields.push('environment'); }
        if (cpiBaseUrl !== undefined) { updateData.cpiBaseUrl = cpiBaseUrl; changedFields.push('cpiBaseUrl'); }
        if (tokenUrl !== undefined) { updateData.tokenUrl = tokenUrl; changedFields.push('tokenUrl'); }
        if (clientId !== undefined) { updateData.clientId = clientId; changedFields.push('clientId'); }
        if (clientSecret !== undefined) { updateData.clientSecret = clientSecret; changedFields.push('clientSecret'); }
        if (projectMembers !== undefined) {
            updateData.projectMembers = JSON.stringify(projectMembers);
            changedFields.push('projectMembers');
            logInfo('Project members updated', {
                projectId: id,
                oldMemberCount: members.length,
                newMemberCount: projectMembers.length,
                addedMembers: projectMembers.filter(m => !members.includes(m)),
                removedMembers: members.filter(m => !projectMembers.includes(m))
            });
        }

        logInfo('Project update fields', {
            projectId: id,
            changedFields,
            fieldCount: changedFields.length
        });

        await db.updateProject(id, updateData, userId);  // Use email ID instead of name

        logInfo('Project updated successfully', {
            projectId: id,
            projectName: project.projectName,
            updatedBy: userName,
            userId,
            changedFields,
            timestamp: new Date().toISOString()
        });
        logApiRequest(req, 'success', { projectId: id });
        res.json({ message: 'Project updated successfully' });
    } catch (error) {
        logError(`Error updating project ${req.params.id}`, error);
        logApiRequest(req, 'error', { projectId: req.params.id, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Delete project - Authorization logic:
// - Admin (with Delete scope): Can delete ANY project (member or not)
// - User (without Delete scope): Can only delete projects they are a member of
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userInfo = getUserInfo(req);
        const userId = userInfo.email || userInfo.id;
        const userName = userInfo.name || userId;
        logInfo('Project deletion initiated', {
            projectId: id,
            userId,
            userName
        });
        const project = await db.getProjectById(id);
        if (!project) {
            logApiRequest(req, 'error', { projectId: id, reason: 'Project not found' });
            return res.status(404).json({ error: 'Project not found.' });
        }

        // Check if running locally (no auth restrictions)
        const isLocal = !process.env.VCAP_APPLICATION;

        // Check if user has Delete scope (Admin)
        const hasDeleteScope = isLocal || (req.authInfo &&
            typeof req.authInfo.checkLocalScope === 'function' &&
            req.authInfo.checkLocalScope('Delete'));

        // Parse project members
        let members = [];
        try {
            members = project.projectMembers ? JSON.parse(project.projectMembers) : [];
        } catch (e) {
            members = [];
        }

        const isMember = members.includes(userId);

        // Authorization logic:
        // Admin with Delete scope: Can delete any project
        // User without Delete scope: Can only delete if they are a member
        if (!hasDeleteScope && !isMember) {
            logWarning('Project deletion denied - insufficient permissions', {
                projectId: id,
                userId,
                projectName: project.projectName,
                hasDeleteScope,
                isMember
            });
            logApiRequest(req, 'error', { projectId: id, userId, reason: 'Access denied - not a member and no admin rights' });
            return res.status(403).json({
                error: 'Access denied. You must be a project member or have admin rights to delete this project.'
            });
        }

        // Delete the project
        await db.deleteProject(id);

        // Log project deletion in CLEANUP_LOGS table
        try {
            const deletionTimestamp = new Date();
            await db.createCleanupLog({
                executionTimestamp: deletionTimestamp,
                status: 'Project Deleted',
                logsCleanedCount: 1,
                message: `Project deleted: ${project.projectName} - Environment: ${project.environment}`,
                executedBy: userId,
                cutoffDate: deletionTimestamp,
                errorMessage: null
            });
        } catch (logError) {
            logError('Failed to log project deletion in CLEANUP_LOGS', logErr);
        }

        logInfo('Project deleted', {
            projectId: id,
            projectName: project.projectName,
            deletedBy: userName,
            userId,
            hasDeleteScope,
            isMember
        });
        logApiRequest(req, 'success', { projectId: id });
        res.json({ message: 'Project deleted successfully' });
    } catch (error) {
        // Log failed deletion attempt in CLEANUP_LOGS table
        try {
            const deletionTimestamp = new Date();
            await db.createCleanupLog({
                executionTimestamp: deletionTimestamp,
                status: 'Project Deletion Failed',
                logsCleanedCount: 0,
                message: `Failed to delete project: ${project?.projectName || 'Unknown'} - Environment: ${project?.environment || 'Unknown'}`,
                executedBy: userId || 'Unknown',
                cutoffDate: deletionTimestamp,
                errorMessage: error.message
            });
        } catch (logError) {
            logError('Failed to log project deletion error in CLEANUP_LOGS', logError);
        }

        logError(`Error deleting project ${req.params.id}`, error);
        logApiRequest(req, 'error', { projectId: req.params.id, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
