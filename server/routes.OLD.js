// server/routes.js
const db = require('./db-wrapper.js');
const { upload, path, getFormattedTimestamp, API_URL } = require('./utils.js');
const { runDownloadJob, runUploadJob } = require('./jobs.js');
const { getUserInfo, authenticate } = require('./auth-middleware.js');
const { logInfo, logError, logApiRequest } = require('./cloud-logger.js');

// Determine if running locally (for backward compatibility with file-based logs)
const isLocal = !process.env.VCAP_APPLICATION;

// Helper function to check if user has admin role
function isUserAdmin(userInfo) {
  if (!userInfo || !userInfo.scopes) {
    return false;
  }
  // Check if user has the Admin scope from IntegrationAutomation_Admin role collection
  const adminScope = 'sap-integration-automation.Admin';
  return userInfo.scopes.some(scope => scope === adminScope || scope.endsWith('.Admin'));
}

// This function will define all our routes
function defineRoutes(app) {

  // --- USER INFO ROUTE ---
  app.get('/api/user-info', authenticate, (req, res) => {
    const userInfo = getUserInfo(req);
    const isAdmin = isUserAdmin(userInfo);
    res.json({
      id: userInfo.id,
      name: userInfo.name,
      email: userInfo.email,
      givenName: userInfo.givenName,
      familyName: userInfo.familyName,
      isAdmin: isAdmin,
      scopes: userInfo.scopes || []
    });
  });

  // --- LOGOUT ROUTE ---
  app.get('/logout', (req, res) => {
    // Clear session if any
    if (req.session) {
      req.session.destroy();
    }
    // Redirect to root or show logout success
    res.send('<html><body><h2>Logged out successfully</h2><p><a href="/">Return to application</a></p></body></html>');
  });

  // --- LOGGING ROUTE (Updated for database content storage) ---
  app.post('/api/log', authenticate, async (req, res) => {
    try {
      const { projectName, environment, userName, activityType, logContent, resultContent, executionTimestamp, status } = req.body;

      await db.insertLog({
        projectName,
        environment,
        userName: userName || 'N/A',
        activityType,
        logContent: logContent || null,
        resultContent: resultContent || null,
        timestamp: executionTimestamp ? executionTimestamp : getFormattedTimestamp(new Date()).replace('_', ' '),
        status: status || 'Unknown'
      });

      logInfo('Log entry created in database', { projectName, activityType, status });
      res.status(201).json({ message: 'Log created' });
    } catch (error) {
      logError('Failed to create log entry in database', error);
      logApiRequest(req, 'error', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // --- Get all logs ---
  app.get('/api/logs', authenticate, async (req, res) => {
    try {
      const logs = await db.getAllLogs();
      logApiRequest(req, 'success', { count: logs.length });
      res.json(logs);
    } catch (error) {
      logError('Error fetching logs from database', error);
      logApiRequest(req, 'error', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // --- Download a specific execution log (from database content) ---
  app.get('/api/download/log/:logId', authenticate, async (req, res) => {
    try {
      const { logId } = req.params;
      const log = await db.getLogById(logId);

      if (!log || !log.logContent) {
        logApiRequest(req, 'error', { logId, reason: 'Log content not found' });
        return res.status(404).json({ error: 'Log content not found.' });
      }

      // Generate filename from log data
      const filename = `${log.projectName}_${log.activityType}_${log.timestamp.replace(/[: ]/g, '-')}.log`;

      logApiRequest(req, 'success', { logId, filename });
      // Send log content as downloadable file
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(log.logContent);
    } catch (error) {
      logError(`Error downloading log file for ID ${req.params.logId}`, error);
      logApiRequest(req, 'error', { logId: req.params.logId, error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // --- Download a specific result file (from database content) ---
  app.get('/api/download/result/:logId', authenticate, async (req, res) => {
    try {
      const { logId } = req.params;
      const log = await db.getLogById(logId);

      if (!log || !log.resultContent) {
        logApiRequest(req, 'error', { logId, reason: 'Result content not found' });
        return res.status(404).json({ error: 'Result content not found.' });
      }

      // Generate filename from log data
      const filename = `${log.projectName}_${log.activityType}_results_${log.timestamp.replace(/[: ]/g, '-')}.csv`;

      logApiRequest(req, 'success', { logId, filename });
      // Send result content as downloadable CSV file
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(log.resultContent);
    } catch (error) {
      logError(`Error downloading result file for ID ${req.params.logId}`, error);
      logApiRequest(req, 'error', { logId: req.params.logId, error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // --- DOWNLOAD ROUTES ---
  app.post('/api/v1/start-download-job', authenticate, async (req, res) => {
    try {
      // Extract username from authenticated user
      const userInfo = getUserInfo(req);
      const userName = userInfo.name || userInfo.email || userInfo.id || 'Unknown User';

      // Inject userName into formData
      const formDataWithUser = { ...req.body, userName };
      const jobData = { formData: formDataWithUser };

      const jobId = await db.insertDownloadJob({
        status: 'Pending',
        progress: 0,
        total: 0,
        form_data_json: JSON.stringify(jobData)
      });

      logInfo('Download job created', {
        jobId,
        userName,
        projectName: req.body.projectName,
        environment: req.body.environment
      });
      logApiRequest(req, 'success', { jobId, userName });

      res.status(202).json({ jobId: jobId });
      runDownloadJob(jobId);
    } catch (error) {
      logError('Failed to start download job', error);
      logApiRequest(req, 'error', { error: error.message });
      res.status(500).json({ error: 'Failed to start job.' });
    }
  });

  app.get('/api/v1/download-job-status/:jobId', authenticate, async (req, res) => {
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

  app.get('/api/v1/get-download-result/:jobId', authenticate, async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await db.getDownloadJobById(jobId);

      if (!job) {
        logApiRequest(req, 'error', { jobId, reason: 'Job not found' });
        return res.status(404).json({ error: 'Job not found.' });
      }

      // Get the corresponding log entry with the result content
      const formData = JSON.parse(job.form_data_json).formData;
      const log = await db.getLogByJobInfo(formData.projectName, formData.environment, 'Download');

      if (!log || !log.resultContent) {
        logApiRequest(req, 'error', { jobId, reason: 'Result content not found in database' });
        return res.status(404).json({ error: 'Result file not found.' });
      }

      // Generate filename from log data
      const filename = `${log.projectName}_${log.environment}_configurations_${log.timestamp.replace(/[: ]/g, '-')}.csv`;

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


  // --- UPLOAD ROUTES ---
  app.post('/api/v1/run-upload', authenticate, upload.single('file'), async (req, res) => {
    if (!req.file) {
      logApiRequest(req, 'error', { reason: 'No file uploaded' });
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    try {
      // Extract username from authenticated user
      const userInfo = getUserInfo(req);
      const userName = userInfo.name || userInfo.email || userInfo.id || 'Unknown User';

      // Inject userName into formData
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

  app.get('/api/v1/job-status/:jobId', authenticate, async (req, res) => {
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

  app.get('/api/v1/get-result/:jobId', authenticate, async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await db.getUploadJobById(jobId);

      if (!job) {
        logApiRequest(req, 'error', { jobId, reason: 'Job not found' });
        return res.status(404).json({ error: 'Job not found.' });
      }

      // Get the corresponding log entry with the result content
      const formData = JSON.parse(job.form_data_json).formData;
      const log = await db.getLogByJobInfo(formData.projectName, formData.environment, 'Upload');

      if (!log || !log.resultContent) {
        logApiRequest(req, 'error', { jobId, reason: 'Result content not found in database' });
        return res.status(404).json({ error: 'Result file not found.' });
      }

      // Generate filename from log data
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

  // --- PROJECT MASTER ROUTES ---

  // Debug endpoint to test database connection
  app.get('/api/projects/test-db', authenticate, async (req, res) => {
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
  app.get('/api/projects', authenticate, async (req, res) => {
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
  app.get('/api/projects/:id', authenticate, async (req, res) => {
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
  app.post('/api/projects', authenticate, async (req, res) => {
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
  app.put('/api/projects/:id', authenticate, async (req, res) => {
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
  app.delete('/api/projects/:id', authenticate, async (req, res) => {
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
}

// Export the function
module.exports = {
  defineRoutes
};
