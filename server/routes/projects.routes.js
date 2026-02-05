// server/routes/projects.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, getUserInfo } = require('../auth-middleware');
const db = require('../db-wrapper');
const { logInfo, logError, logApiRequest } = require('../cloud-logger');

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

// Get all projects (member-based access only)
router.get('/', authenticate, async (req, res) => {
    try {
        const userInfo = getUserInfo(req);
        const userId = userInfo.email || userInfo.id;
        const allProjects = await db.getAllProjects();

        // Filter projects based on membership only (no admin override)
        const accessibleProjects = allProjects.map(project => {
            let members = [];
            try {
                members = project.projectMembers ? JSON.parse(project.projectMembers) : [];
            } catch (e) {
                members = [];
            }

            const hasAccess = members.includes(userId);

            return {
                ...project,
                hasAccess,
                // Don't send sensitive data if user doesn't have access
                clientSecret: hasAccess ? project.clientSecret : '***',
                clientId: hasAccess ? project.clientId : '***'
            };
        });

        logInfo('Projects fetched', { userId, accessibleCount: accessibleProjects.filter(p => p.hasAccess).length, totalCount: allProjects.length });
        logApiRequest(req, 'success', { count: accessibleProjects.length, userId });
        res.json(accessibleProjects);
    } catch (error) {
        logError('Error fetching projects', error);
        logApiRequest(req, 'error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Get single project by ID (member-based access only)
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

        // Check membership only
        let members = [];
        try {
            members = project.projectMembers ? JSON.parse(project.projectMembers) : [];
        } catch (e) {
            members = [];
        }

        const hasAccess = members.includes(userId);

        if (!hasAccess) {
            logApiRequest(req, 'error', { projectId: id, userId, reason: 'Access denied - not a member' });
            return res.status(403).json({ error: 'Access denied to this project.' });
        }

        logApiRequest(req, 'success', { projectId: id, userId });
        res.json(project);
    } catch (error) {
        logError(`Error fetching project ${req.params.id}`, error);
        logApiRequest(req, 'error', { projectId: req.params.id, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Create new project
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
            createdBy: userName,
            updatedBy: userName
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

// Update project (only project members)
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userInfo = getUserInfo(req);
        const userId = userInfo.email || userInfo.id;
        const userName = userInfo.name || userId;

        logInfo('Project update initiated', {
            projectId: id,
            userId,
            userName
        });

        const project = await db.getProjectById(id);
        if (!project) {
            logInfo('Project update failed - not found', { projectId: id, userId });
            logApiRequest(req, 'error', { projectId: id, reason: 'Project not found' });
            return res.status(404).json({ error: 'Project not found.' });
        }

        // Check membership only
        let members = [];
        try {
            members = project.projectMembers ? JSON.parse(project.projectMembers) : [];
        } catch (e) {
            members = [];
        }

        const hasAccess = members.includes(userId);
        if (!hasAccess) {
            logInfo('Project update denied - access check failed', {
                projectId: id,
                userId,
                projectName: project.projectName,
                currentMembers: members
            });
            logApiRequest(req, 'error', { projectId: id, userId, reason: 'Access denied - not a member' });
            return res.status(403).json({ error: 'Only project members can update this project.' });
        }

        const { projectName, environment, cpiBaseUrl, tokenUrl, clientId, clientSecret, projectMembers } = req.body;

        const updateData = {};
        const changedFields = [];

        if (projectName !== undefined) { updateData.projectName = projectName; changedFields.push('projectName'); }
        if (environment !== undefined) { updateData.environment = environment; changedFields.push('environment'); }
        if (cpiBaseUrl !== undefined) { updateData.cpiBaseUrl = cpiBaseUrl; changedFields.push('cpiBaseUrl'); }
        if (tokenUrl !== undefined) { updateData.tokenUrl = tokenUrl; changedFields.push('tokenUrl'); }
        if (clientId !== undefined) { updateData.clientId = clientId; changedFields.push('clientId'); }
        if (clientSecret !== undefined) { updateData.clientSecret = '***'; changedFields.push('clientSecret'); }
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

        await db.updateProject(id, updateData, userName);

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

// Delete project (only project members)
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
            logInfo('Project deletion failed - not found', { projectId: id, userId });
            logApiRequest(req, 'error', { projectId: id, reason: 'Project not found' });
            return res.status(404).json({ error: 'Project not found.' });
        }

        // Check membership only
        let members = [];
        try {
            members = project.projectMembers ? JSON.parse(project.projectMembers) : [];
        } catch (e) {
            members = [];
        }

        const hasAccess = members.includes(userId);
        if (!hasAccess) {
            logInfo('Project deletion denied - access check failed', {
                projectId: id,
                userId,
                projectName: project.projectName,
                environment: project.environment,
                currentMembers: members
            });
            logApiRequest(req, 'error', { projectId: id, userId, reason: 'Access denied - not a member' });
            return res.status(403).json({ error: 'Only project members can delete this project.' });
        }

        // Log project details before deletion
        logInfo('Project deletion confirmed - deleting now', {
            projectId: id,
            projectName: project.projectName,
            environment: project.environment,
            createdBy: project.createdBy,
            memberCount: members.length,
            deletedBy: userName,
            userId
        });

        await db.deleteProject(id);

        logInfo('Project deleted successfully', {
            projectId: id,
            projectName: project.projectName,
            environment: project.environment,
            deletedBy: userName,
            userId,
            timestamp: new Date().toISOString()
        });
        logApiRequest(req, 'success', { projectId: id });
        res.json({ message: 'Project deleted successfully' });
    } catch (error) {
        logError(`Error deleting project ${req.params.id}`, error);
        logApiRequest(req, 'error', { projectId: req.params.id, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
