// server/jobs/index.js
// Main entry point for all job modules

const { runDownloadJob, getPackageDetails } = require('./download-job.js');
const { runUploadJob } = require('./upload-job.js');
const { runDeployJob } = require('./deploy-job.js');
const { runTransportJob, downloadZipFile } = require('./transport-job.js');
const { runTransportPackageJob } = require('./transport-package-job.js');

module.exports = {
    runDownloadJob,
    getPackageDetails,
    runUploadJob,
    runDeployJob,
    runTransportJob,
    downloadZipFile,
    runTransportPackageJob
};
