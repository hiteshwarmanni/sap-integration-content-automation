// server/jobs/index.js
// Main entry point for all job modules

const { runDownloadJob } = require('./download-job.js');
const { runUploadJob } = require('./upload-job.js');
const { runDeployJob } = require('./deploy-job.js');

module.exports = {
    runDownloadJob,
    runUploadJob,
    runDeployJob
};
