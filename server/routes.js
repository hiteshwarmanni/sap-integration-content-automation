// server/routes.js
const { knex } = require('./db.js');
const { upload, path, getFormattedTimestamp, API_URL } = require('./utils.js');
const { runDownloadJob, runUploadJob } = require('./jobs.js');

// This function will define all our routes
function defineRoutes(app) {
  
  // --- LOGGING ROUTE ---
  app.post('/api/log', async (req, res) => {
    try {
      const { projectName, environment, userName, activityType, logFile, resultFile, executionTimestamp } = req.body;
      await knex('logs').insert({
        projectName, environment, userName: userName || 'N/A', activityType,
        logFile: logFile || null,
        resultFile: resultFile || null,
        timestamp: executionTimestamp ? executionTimestamp : getFormattedTimestamp(new Date()).replace('_', ' ')
      });
      console.log('✅ Final log entry created:', { projectName, activityType });
      res.status(201).json({ message: 'Log created' });
    } catch (error) {
      console.error('DB Log Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
    // --- 👇 NEW: Get all logs ---
  app.get('/api/logs', async (req, res) => {
    try {
      const logs = await knex('logs').select('*').orderBy('id', 'desc');
      res.json(logs);
    } catch (error) {
      console.error('Error fetching logs:', error);
      res.status(500).json({ error: error.message });
    }
  });
  // --- 👇 NEW: Download a specific execution log file ---
  app.get('/api/download/log/:logId', async (req, res) => {
    try {
      const { logId } = req.params;
      const log = await knex('logs').where({ id: logId }).first();
      
      if (!log || !log.logFile) {
        return res.status(404).json({ error: 'Log file not found.' });
      }
      
      const filePath = path.join(__dirname, log.logFile);
      res.download(filePath);
    } catch (error) {
      console.error(`Error getting log file for ID ${req.params.logId}:`, error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // --- 👇 NEW: Download a specific result file ---
  app.get('/api/download/result/:logId', async (req, res) => {
    try {
      const { logId } = req.params;
      const log = await knex('logs').where({ id: logId }).first();
      
      if (!log || !log.resultFile) {
        return res.status(404).json({ error: 'Result file not found.' });
      }
      
      const filePath = path.join(__dirname, log.resultFile);
      res.download(filePath);
    } catch (error) {
      console.error(`Error getting result file for ID ${req.params.logId}:`, error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // --- DOWNLOAD ROUTES ---
  app.post('/api/v1/start-download-job', async (req, res) => {
    try {
      const jobData = { formData: req.body };
      const [newJob] = await knex('download_jobs').insert({
        status: 'Pending',
        progress: 0,
        total: 0,
        form_data_json: JSON.stringify(jobData)
      }).returning('id');
      const jobId = newJob.id || newJob[0].id || newJob[0];
      console.log(`Download job created with ID: ${jobId}`);
      res.status(202).json({ jobId: jobId });
      runDownloadJob(jobId);
    } catch (error) {
      console.error(`Failed to start download job: ${error.message}`);
      res.status(500).json({ error: 'Failed to start job.' });
    }
  });

  app.get('/api/v1/download-job-status/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await knex('download_jobs').where({ id: jobId }).first();
      if (!job) return res.status(404).json({ error: 'Job not found.' });
      res.json({
        status: job.status,
        progress: job.progress,
        total: job.total,
        resultFile: job.result_file_path
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/v1/get-download-result/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await knex('download_jobs').where({ id: jobId }).first();
      
      // --- THIS IS THE FIX ---
      if (!job || !job.result_file_path) {
        return res.status(404).json({ error: 'Result file not found.' }); // Was 4O4
      }
      // --- END OF FIX ---

      const filePath = path.join(__dirname, job.result_file_path);
      const filename = path.basename(filePath);
      res.download(filePath, filename);
    } catch (error) {
      console.error(`Error getting result file for job ${req.params.jobId}:`, error.message);
      res.status(500).json({ error: error.message });
    }
  });


  // --- UPLOAD ROUTES ---
  app.post('/api/v1/run-upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    try {
      const jobData = { formData: req.body, filePath: req.file.path };
      const [newJob] = await knex('upload_jobs').insert({
        status: 'Pending',
        progress: 0,
        total: 0,
        temp_upload_path: req.file.path,
        form_data_json: JSON.stringify(jobData)
      }).returning('id');
      const jobId = newJob.id || newJob[0].id || newJob[0];
      console.log(`Upload job created with ID: ${jobId}`);
      res.status(202).json({ jobId: jobId });
      runUploadJob(jobId);
    } catch (error) {
      console.error(`Failed to start upload job: ${error.message}`);
      res.status(500).json({ error: 'Failed to start job.' });
    }
  });

  app.get('/api/v1/job-status/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await knex('upload_jobs').where({ id: jobId }).first();
      if (!job) return res.status(404).json({ error: 'Job not found.' });
      res.json({
        status: job.status,
        progress: job.progress,
        total: job.total,
        resultFile: job.result_file_path
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/v1/get-result/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await knex('upload_jobs').where({ id: jobId }).first();
      if (!job || !job.result_file_path) {
        return res.status(404).json({ error: 'Result file not found.' });
      }
      const filePath = path.join(__dirname, job.result_file_path);
      res.download(filePath);
    } catch (error) {
      console.error(`Error getting result file for job ${req.params.jobId}:`, error.message);
      res.status(500).json({ error: error.message });
    }
  });
}

// Export the function
module.exports = {
  defineRoutes
};