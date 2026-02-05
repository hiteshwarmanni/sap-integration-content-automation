// server/routes/index.js
// Main router that combines all modular routes

const authRoutes = require('./auth.routes');
const logsRoutes = require('./logs.routes');
const downloadRoutes = require('./download.routes');
const uploadRoutes = require('./upload.routes');
const deployRoutes = require('./deploy.routes');
const projectRoutes = require('./projects.routes');

function defineRoutes(app) {
    // Auth routes - /api/user-info, /logout
    app.use('/api', authRoutes);
    app.use('/', authRoutes);

    // Logs routes - /api/log, /api/logs, /api/download/log/:id, /api/download/result/:id
    app.use('/api', logsRoutes);

    // Download routes - /api/v1/start-download-job, /api/v1/download-job-status/:id, etc.
    app.use('/api/v1', downloadRoutes);

    // Upload routes - /api/v1/run-upload, /api/v1/job-status/:id, etc.
    app.use('/api/v1', uploadRoutes);

    // Deploy routes - /api/v1/run-deploy, /api/v1/deploy-job-status/:id, etc.
    app.use('/api/v1', deployRoutes);

    // Project routes - /api/projects, /api/projects/:id, etc.
    app.use('/api/projects', projectRoutes);
}

module.exports = {
    defineRoutes
};
