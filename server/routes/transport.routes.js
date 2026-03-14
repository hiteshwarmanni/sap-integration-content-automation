// server/routes/transport.routes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticate, getUserInfo, checkScope } = require('../auth-middleware');
const db = require('../db-wrapper');
const { getPackageDetails, runTransportJob, downloadZipFile } = require('../jobs');
const { logInfo, logError, logWarning, logApiRequest } = require('../cloud-logger');
const { getOAuthToken, getCSRFToken } = require('../jobs/shared/auth-helper');
const { createJobLogger, closeLogger } = require('../jobs/shared/logger-helper');
const { escapeCSV, CPI_API_PATH_SUFFIX } = require('../utils');
const { TRANSPORT_CSV_HEADERS } = require('../jobs/constants');
const JSZip = require('jszip');

// Helper function to implement retry logic
const retryOperation = async (operation, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === retries - 1) throw error;
            logInfo(`Retry attempt ${i + 1} failed. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

/**
 * Edits a zip file using JSZip:
 * 1. Renames the .iflw file to match targetIflowId
 * 2. Updates MANIFEST.MF to reflect the new iFlow ID
 *
 * @param {Buffer} zipBuffer - Original zip file content
 * @param {string} sourceIflowId - Original iFlow ID
 * @param {string} targetIflowId - New iFlow ID
 * @returns {Promise<Buffer>} Edited zip file content
 */
const editZipWithJSZip = async (zipBuffer, sourceIflowId, targetIflowId) => {
    logInfo('Starting editZipWithJSZip', { sourceIflowId, targetIflowId });
    const zip = await JSZip.loadAsync(zipBuffer);
    let manifestEdited = false;
    let iflwRenamed = false;

    try {
        for (const [fileName, file] of Object.entries(zip.files)) {
            if (fileName.endsWith('.iflw')) {
                const iflwContent = await file.async('nodebuffer');
                const newIflwPath = fileName.replace(new RegExp(sourceIflowId, 'g'), targetIflowId);
                zip.remove(fileName);
                zip.file(newIflwPath, iflwContent);
                iflwRenamed = true;
                logInfo('Renamed .iflw file', { from: fileName, to: newIflwPath });
            } else if (fileName.endsWith('MANIFEST.MF')) {
                const content = await file.async('string');
                const editedContent = content.replace(new RegExp(sourceIflowId, 'g'), targetIflowId);
                if (content !== editedContent) {
                    manifestEdited = true;
                    zip.file(fileName, editedContent);
                    logInfo('Updated MANIFEST.MF');
                }
            }
        }

        if (!iflwRenamed) {
            throw new Error('Failed to rename .iflw file');
        }
        if (!manifestEdited) {
            logWarning('No MANIFEST.MF changes were made');
        }

        logInfo('Zip editing completed successfully');
        return await zip.generateAsync({ type: 'nodebuffer' });
    } catch (error) {
        logError('Error in editZipWithJSZip', error);
        throw new Error(`Failed to edit zip file: ${error.message}`);
    }
};

// Helper to normalise the CPI base URL
const normaliseCpiUrl = (url) =>
    url.endsWith('/api/v1') ? url : url.replace(/\/$/, '') + '/api/v1';

// ─── GET PACKAGE DETAILS ───────────────────────────────────────────────────────
router.post('/get-package-details', authenticate, async (req, res) => {
    try {
        const userInfo = getUserInfo(req);
        const userName = userInfo.email || userInfo.id || 'Unknown User';

        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret) {
            logApiRequest(req, 'error', { reason: 'Missing credentials' });
            return res.status(400).json({ error: 'Missing required credentials.' });
        }

        const formDataWithUser = { ...req.body, userName };
        const packages = await getPackageDetails(JSON.stringify({ formData: formDataWithUser }));

        res.status(200).json({ packages });
    } catch (error) {
        logError('Error in get-package-details', error);
        res.status(500).json({ error: error.message || 'Failed to fetch packages.' });
    }
});

// ─── CHECK PACKAGE EXISTS ──────────────────────────────────────────────────────
router.post('/check-package-exists', authenticate, async (req, res) => {
    try {
        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret || !req.body.packageId) {
            return res.status(400).json({ error: 'Missing required credentials or package ID.' });
        }

        const { cpiBaseUrl, tokenUrl, clientId, clientSecret, packageId } = req.body;
        const baseUrl = normaliseCpiUrl(cpiBaseUrl);

        const accessToken = await getOAuthToken(tokenUrl, clientId, clientSecret, null);
        const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

        const apiUrl = `${baseUrl}/IntegrationPackages('${packageId}')`;

        try {
            const response = await axios.get(apiUrl, { headers: authHeader });
            if (response.data && response.data.d) {
                const pkg = response.data.d;
                return res.status(200).json({ exists: true, packageName: pkg.Name, packageId: pkg.Id });
            }
            return res.status(200).json({ exists: false, packageId });
        } catch (checkError) {
            if (checkError.response && checkError.response.status === 404) {
                return res.status(200).json({ exists: false, packageId });
            }
            throw checkError;
        }
    } catch (error) {
        logError('Error checking package existence', error);
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        res.status(500).json({ error: `Failed to check package existence: ${errorMsg}` });
    }
});

// ─── GET IFLOW DETAILS ─────────────────────────────────────────────────────────
router.post('/get-iflow-details', authenticate, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret || !req.body.packageId) {
            logApiRequest(req, 'error', { reason: 'Missing credentials or package ID' });
            return res.status(400).json({ error: 'Missing required credentials or package ID.' });
        }

        const { cpiBaseUrl, tokenUrl, clientId, clientSecret, packageId } = req.body;
        const baseUrl = normaliseCpiUrl(cpiBaseUrl);

        const accessToken = await getOAuthToken(tokenUrl, clientId, clientSecret, null);
        const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

        const apiUrl = `${baseUrl}/IntegrationPackages('${packageId}')/IntegrationDesigntimeArtifacts`;
        const response = await axios.get(apiUrl, { headers: authHeader });

        let iFlows = [];
        if (response.data?.d?.results) {
            iFlows = response.data.d.results;
        } else if (Array.isArray(response.data)) {
            iFlows = response.data;
        } else {
            throw new Error('Unable to parse iFlows from API response.');
        }

        const iflows = iFlows.map((iflow) => ({
            id: iflow.Id,
            name: iflow.Name,
            version: iflow.Version || iflow.VersionNumber || 'N/A'
        }));

        res.status(200).json({ iflows });
    } catch (error) {
        logError('Error fetching iFlow details', error);
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        res.status(500).json({ error: `Failed to fetch iFlows: ${errorMsg}` });
    }
});

// ─── TRANSPORT IFLOW (real-time, synchronous) ──────────────────────────────────
router.post('/transport-iflow', authenticate, async (req, res) => {
    const userInfo = getUserInfo(req);
    const userName = userInfo.email || userInfo.id || 'Unknown User';
    const jobStartTime = Date.now();
    let csrfLogger = null;

    try {
        logInfo('Transport iFlow endpoint called', {
            projectName: req.body.projectName,
            environment: req.body.environment,
            sourcePackageId: req.body.sourcePackageId,
            targetPackageId: req.body.targetPackageId,
            sourceIflowId: req.body.sourceIflowId,
            targetIflowId: req.body.targetIflowId
        });

        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret) {
            logApiRequest(req, 'error', { reason: 'Missing credentials' });
            return res.status(400).json({ error: 'Missing required credentials.' });
        }

        const {
            projectName, environment, cpiBaseUrl,
            tokenUrl, clientId, clientSecret,
            sourcePackageId, targetPackageId,
            sourceIflowId, targetIflowId,
            sourceIflowVersion, targetIflowVersion,
            sourceIflowName, targetIflowName
        } = req.body;

        const baseUrl = normaliseCpiUrl(cpiBaseUrl);

        // Step 1: Get OAuth token
        const accessToken = await getOAuthToken(tokenUrl, clientId, clientSecret, null);
        const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

        // Step 2: Get CSRF token
        const { logger } = createJobLogger(new Date(), 'transport_iflow');
        csrfLogger = logger;
        const csrfToken = await getCSRFToken(baseUrl, accessToken, csrfLogger);

        // Step 3: Download source iFlow zip
        logInfo('Downloading source iFlow zip', { sourceIflowId, sourceIflowVersion });
        const sourceIflowZipUrl = `${baseUrl}/IntegrationDesigntimeArtifacts(Id='${sourceIflowId}',Version='${sourceIflowVersion}')/$value`;

        let zipContent;
        try {
            const zipResponse = await retryOperation(() =>
                axios.get(sourceIflowZipUrl, { headers: authHeader, responseType: 'arraybuffer' })
            );
            zipContent = Buffer.from(zipResponse.data);
            logInfo('iFlow zip downloaded', { size: zipContent.length });
        } catch (zipError) {
            const errorMsg = zipError.response ? JSON.stringify(zipError.response.data) : zipError.message;
            throw new Error(`Failed to download iFlow zip file: ${errorMsg}`);
        }

        // Step 4: Edit zip (rename .iflw + update MANIFEST.MF)
        logInfo('Editing zip file', { sourceIflowId, targetIflowId });
        const editedZipContent = await editZipWithJSZip(zipContent, sourceIflowId, targetIflowId);

        // Step 5: Upload edited iFlow to target package
        logInfo('Uploading edited iFlow', { targetIflowId, targetPackageId });
        const base64Content = editedZipContent.toString('base64');
        const putBody = { Name: targetIflowId, ArtifactContent: base64Content };
        const putHeaders = { ...authHeader, 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' };
        const targetIflowPutUrl = `${baseUrl}/IntegrationDesigntimeArtifacts(Id='${targetIflowId}',Version='${targetIflowVersion}')`;

        try {
            await axios.put(targetIflowPutUrl, putBody, { headers: putHeaders });
            logInfo('iFlow uploaded successfully', { targetIflowId });
        } catch (putError) {
            const errorMsg = putError.response ? JSON.stringify(putError.response.data) : putError.message;
            throw new Error(`Failed to upload edited iFlow: ${errorMsg}`);
        }

        const timeTakenSeconds = Math.round((Date.now() - jobStartTime) / 1000);

        // Save transport log
        const transportLogId = await db.insertTransportLog({
            projectName,
            environment,
            userName,
            timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
            status: 'Complete',
            sourcePackageId,
            targetPackageId,
            sourceIflowId,
            targetIflowId,
            sourceIflowName: sourceIflowName || sourceIflowId,
            targetIflowName: targetIflowName || targetIflowId,
            timeTakenSeconds,
            logContent: `Transport completed: ${sourcePackageId}/${sourceIflowId} → ${targetPackageId}/${targetIflowId}`,
            resultContent: `${TRANSPORT_CSV_HEADERS}\n"${sourcePackageId}","${targetPackageId}","${sourceIflowId}","${targetIflowId}","200","Success"`
        });

        logInfo('Transport log saved', { transportLogId });

        res.status(200).json({
            success: true,
            message: `Successfully transported ${sourceIflowName} to ${targetIflowName}`,
            details: {
                sourcePackageId, targetPackageId,
                sourceIflowId, targetIflowId,
                sourceIflowVersion, targetIflowVersion,
                sourceIflowName, targetIflowName,
                transportLogId
            }
        });

    } catch (error) {
        logError('Failed to transport iFlow', error);

        let errorMsg = error.message || 'Unknown error';
        let httpStatus = 'N/A';

        if (error.response) {
            httpStatus = error.response.status;
            const sapError = error.response.data?.error;
            if (sapError?.message?.value) errorMsg = sapError.message.value;
            else if (sapError?.message) errorMsg = JSON.stringify(sapError.message);
            else if (typeof error.response.data === 'string') errorMsg = error.response.data;
        }

        let failedStep = 'Unknown';
        if (errorMsg.includes('OAuth') || errorMsg.includes('authenticate')) failedStep = 'Authentication';
        else if (errorMsg.includes('CSRF')) failedStep = 'CSRF Token';
        else if (errorMsg.includes('download') || errorMsg.includes('zip file')) failedStep = 'Download Zip';
        else if (errorMsg.includes('edit') || errorMsg.includes('JSZip')) failedStep = 'Edit Zip';
        else if (errorMsg.includes('upload') || errorMsg.includes('PUT') || errorMsg.includes('locked')) failedStep = 'Upload iFlow';

        // Save failed transport log
        try {
            await db.insertTransportLog({
                projectName: req.body.projectName,
                environment: req.body.environment,
                userName,
                timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
                status: 'Failed',
                sourcePackageId: req.body.sourcePackageId,
                targetPackageId: req.body.targetPackageId,
                sourceIflowId: req.body.sourceIflowId,
                targetIflowId: req.body.targetIflowId,
                sourceIflowName: req.body.sourceIflowName || req.body.sourceIflowId,
                targetIflowName: req.body.targetIflowName || req.body.targetIflowId,
                timeTakenSeconds: Math.round((Date.now() - jobStartTime) / 1000),
                errorMessage: errorMsg,
                failedStep,
                errorStackTrace: error.stack || null,
                logContent: `Transport failed at step: ${failedStep}\nError: ${errorMsg}`,
                resultContent: `${TRANSPORT_CSV_HEADERS}\n"${req.body.sourcePackageId || ''}","${req.body.targetPackageId || ''}","${req.body.sourceIflowId || ''}","${req.body.targetIflowId || ''}","${httpStatus}","${errorMsg.replace(/"/g, '""')}"`
            });
        } catch (error) {
            logError('Failed to save error transport log', error);
        }

        res.status(500).json({ success: false, error: 'Failed to transport iFlow.', details: errorMsg, failedStep });
    } finally {
        if (csrfLogger) {
            await closeLogger(csrfLogger);
        }
    }
});

// ─── TRANSPORT PACKAGE (async job) ────────────────────────────────────────────
router.post('/transport-package', authenticate, async (req, res) => {
    try {
        logInfo('Transport package endpoint called', {
            projectName: req.body.projectName,
            environment: req.body.environment,
            sourcePackageId: req.body.sourcePackageId,
            targetPackageSuffix: req.body.targetPackageSuffix
        });

        const userInfo = getUserInfo(req);
        const userName = userInfo.email || userInfo.id || 'Unknown User';

        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret) {
            logApiRequest(req, 'error', { reason: 'Missing credentials' });
            return res.status(400).json({ error: 'Missing required credentials.' });
        }

        if (!req.body.sourcePackageId || !req.body.targetPackageSuffix) {
            return res.status(400).json({ error: 'Missing source package ID or target suffix.' });
        }

        const formDataWithUser = { ...req.body, userName };
        const jobId = await db.insertTransportJob({
            status: 'Pending',
            progress: 0,
            total: 0,
            form_data_json: JSON.stringify({ formData: formDataWithUser })
        });

        logInfo('Package transport job created', { jobId });

        res.status(202).json({
            success: true,
            jobId,
            message: 'Package transport job started.'
        });

        const { runTransportPackageJob } = require('../jobs');
        runTransportPackageJob(jobId).catch(error => {
            logError('Package transport job failed', { jobId, error: error.message });
        });

    } catch (error) {
        logError('Failed to start package transport job', error);
        res.status(500).json({ success: false, error: 'Failed to start package transport job.', details: error.message });
    }
});

// ─── DOWNLOAD ZIP FILE ────────────────────────────────────────────────────────
router.post('/download-zip-file', authenticate, async (req, res) => {
    try {
        const { cpiBaseUrl, tokenUrl, clientId, clientSecret, packageId, iflowId } = req.body;

        if (!cpiBaseUrl || !tokenUrl || !clientId || !clientSecret || !packageId || !iflowId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await downloadZipFile({ cpiBaseUrl, tokenUrl, clientId, clientSecret, packageId, iflowId });
        res.json(result);
    } catch (error) {
        logError('Error in download-zip-file route', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── LEGACY: START TRANSPORT JOB (async, single iFlow) ───────────────────────
router.post('/start-transport-job', authenticate, async (req, res) => {
    try {
        const userInfo = getUserInfo(req);
        const userName = userInfo.email || userInfo.id || 'Unknown User';

        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret) {
            logApiRequest(req, 'error', { reason: 'Missing credentials' });
            return res.status(400).json({ error: 'Missing required credentials.' });
        }

        const formDataWithUser = { ...req.body, userName };
        const jobId = await db.insertTransportJob({
            status: 'Pending',
            progress: 0,
            total: 0,
            form_data_json: JSON.stringify({ formData: formDataWithUser })
        });

        logInfo('Transport job created', { jobId });
        res.status(202).json({ jobId });

        runTransportJob(jobId).catch(error => {
            logError('Transport job failed', { jobId, error: error.message });
        });

    } catch (error) {
        logError('Failed to start transport job', error);
        logApiRequest(req, 'error', { error: error.message });
        res.status(500).json({ error: 'Failed to start job.' });
    }
});

// ─── TRANSPORT JOB STATUS ────────────────────────────────────────────────────
router.get('/transport-job-status/:jobId', authenticate, async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await db.getTransportJobById(jobId);

        if (!job) {
            logApiRequest(req, 'error', { jobId, reason: 'Job not found' });
            return res.status(404).json({ error: 'Job not found.' });
        }

        res.json({
            status: job.status,
            progress: job.progress,
            total: job.total,
            progressMessage: job.progress_message || '',
            resultFile: job.result_file_path
        });
    } catch (error) {
        logError('Error fetching transport job status', error);
        logApiRequest(req, 'error', { jobId: req.params.jobId, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// ─── GET TRANSPORT RESULT ─────────────────────────────────────────────────────
router.get('/get-transport-result/:jobId', authenticate, async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await db.getTransportJobById(jobId);

        if (!job) {
            logApiRequest(req, 'error', { jobId, reason: 'Job not found' });
            return res.status(404).json({ error: 'Job not found.' });
        }

        if (!job.log_id) {
            return res.status(404).json({ error: 'Result file not found.' });
        }

        const log = await db.getLogById(job.log_id);

        if (!log || !log.resultContent) {
            return res.status(404).json({ error: 'Result file not found.' });
        }

        const filename = `${log.projectName}_${log.environment}_transport_results_${log.timestamp.replace(/[: ]/g, '-')}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(log.resultContent);
    } catch (error) {
        logError(`Error downloading transport result for job ${req.params.jobId}`, error);
        logApiRequest(req, 'error', { jobId: req.params.jobId, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

module.exports = {
    router,
    editZipWithJSZip
};