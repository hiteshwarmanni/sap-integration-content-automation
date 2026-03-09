// server/routes/transport.routes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { authenticate, getUserInfo, checkScope } = require('../auth-middleware');
const db = require('../db-wrapper');
const { getPackageDetails, runTransportJob, downloadZipFile } = require('../jobs');
const { logInfo, logError, logWarning, logApiRequest } = require('../cloud-logger');
const { getOAuthToken, getCSRFToken } = require('../jobs/shared/auth-helper');
const { escapeCSV, CPI_API_PATH_SUFFIX } = require('../utils');
const { TRANSPORT_CSV_HEADERS } = require('../jobs/constants');
const JSZip = require('jszip');

// Function to log large payloads
const logLargePayload = async (logName, content, metadata = {}) => {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const fileName = `${logName}_${timestamp}.log`;
    const logDir = path.join(__dirname, '..', 'logs');
    const filePath = path.join(logDir, fileName);

    try {
        await fs.mkdir(logDir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify({
            timestamp,
            logName,
            metadata,
            content
        }, null, 2));
        console.log(`Large payload logged to ${filePath}`);
    } catch (error) {
        console.error(`Error logging large payload: ${error.message}`);
    }
};

// Middleware to log requests to /transport-iflow
const logTransportIflowRequests = (req, res, next) => {
  console.log('=== /api/v1/transport-iflow REQUEST ===');
  console.log('Request method:', req.method);
  console.log('Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  next();
};

// Apply the middleware to the /transport-iflow route
router.use('/transport-iflow', logTransportIflowRequests);

// Helper function to implement retry logic
const retryOperation = async (operation, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`Retry attempt ${i + 1} failed. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

/**
 * Helper function to edit zip file using JSZip
 * This function performs two main tasks:
 * 1. Renames the .iflw file to match the target iflow ID
 * 2. Updates the MANIFEST.MF file to reflect the new iflow ID
 *
 * @param {Buffer} zipBuffer - The original zip file content
 * @param {string} sourceIflowId - The original iflow ID
 * @param {string} targetIflowId - The new iflow ID
 * @returns {Promise<Buffer>} - The edited zip file content
 */
const editZipWithJSZip = async (zipBuffer, sourceIflowId, targetIflowId) => {
    logInfo(`Starting editZipWithJSZip: sourceIflowId=${sourceIflowId}, targetIflowId=${targetIflowId}`);
    const zip = await JSZip.loadAsync(zipBuffer);
    let manifestEdited = false;
    let iflwRenamed = false;

    logInfo('Zip file loaded, processing contents...');

    try {
        // Process .iflw file and MANIFEST.MF
        for (const [fileName, file] of Object.entries(zip.files)) {
            logInfo(`Processing file: ${fileName}`);
            if (fileName.endsWith('.iflw')) {
                const iflwContent = await file.async('nodebuffer');
                const newIflwPath = fileName.replace(new RegExp(sourceIflowId, 'g'), targetIflowId);
                zip.remove(fileName);
                zip.file(newIflwPath, iflwContent);
                iflwRenamed = true;
                logInfo(`Renamed .iflw file: ${fileName} to ${newIflwPath}`);
            } else if (fileName.endsWith('MANIFEST.MF')) {
                let content = await file.async('string');
                const editedContent = content.replace(new RegExp(sourceIflowId, 'g'), targetIflowId);
                if (content !== editedContent) {
                    manifestEdited = true;
                    zip.file(fileName, editedContent);
                    logInfo('Updated MANIFEST.MF file');
                } else {
                    logInfo('No changes needed in MANIFEST.MF');
                }
            }
        }

        if (!iflwRenamed) {
            throw new Error('Failed to rename .iflw file');
        }

        if (!manifestEdited) {
            logWarning('No MANIFEST.MF file found or no edits were made');
        }

        logInfo('Zip editing process completed successfully');
        return await zip.generateAsync({ type: 'nodebuffer' });
    } catch (error) {
        logError(`Error in editZipWithJSZip: ${error.message}`, error);
        throw new Error(`Failed to edit zip file: ${error.message}`);
    }
};

// Helper function removed: editZipWithStreamZip

// Helper function to get OAuth token (using auth-helper)
const getOAuthTokenHelper = async (tokenUrl, clientId, clientSecret, logger) => {
    try {
        const { getOAuthToken } = require('../jobs/shared/auth-helper');
        return await getOAuthToken(tokenUrl, clientId, clientSecret, logger);
    } catch (error) {
        console.error('OAuth token request failed:', error);
        if (error.response) {
            console.error('Error response:', {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            });
        }
        throw new Error(`OAuth token request failed: ${error.message}. Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
    }
};

// Get Package Name details
router.post('/get-package-details', authenticate, async (req, res) => {
    try {
        console.log('=== GET-PACKAGE-DETAILS ROUTE CALLED ===');
        console.log('Request headers:', req.headers);
        console.log('Request body:', req.body);
        
        const userInfo = getUserInfo(req);
        const userName = userInfo.email || userInfo.id || 'Unknown User';

        // Validate that credentials are provided
        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret) {
            console.log('Missing credentials in request body:', req.body);
            logApiRequest(req, 'error', { reason: 'Missing credentials' });
            return res.status(400).json({ error: 'Missing required credentials.' });
        }

        console.log('Request body received:', {
            tokenUrl: req.body.tokenUrl ? '***' : 'missing',
            clientId: req.body.clientId ? '***' : 'missing',
            clientSecret: req.body.clientSecret ? '***' : 'missing',
            cpiBaseUrl: req.body.cpiBaseUrl || 'not provided'
        });

        const formDataWithUser = { ...req.body, userName };
        const jobData = { formData: formDataWithUser };

        console.log('Calling getPackageDetails with jobData...');
        const packages = await getPackageDetails(JSON.stringify(jobData));
        console.log('getPackageDetails returned:', packages.length, 'packages');
        console.log('First package in response:', packages[0]);

        res.status(200).json({ packages });
    } catch (error) {
        console.log('Error in get-package-details route:', error.message);
        console.log('Error stack:', error.stack);
        res.status(500).json({ error: error.message || 'Failed to fetch packages.' });
    }
});

// Check if package exists
router.post('/check-package-exists', authenticate, async (req, res) => {
    try {
        console.log('=== CHECK-PACKAGE-EXISTS ROUTE CALLED ===');
        const userInfo = getUserInfo(req);
        
        // Validate that credentials are provided
        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret || !req.body.packageId) {
            console.log('Missing credentials or package ID:', req.body);
            return res.status(400).json({ error: 'Missing required credentials or package ID.' });
        }

        const { cpiBaseUrl, tokenUrl, clientId, clientSecret, packageId } = req.body;
        console.log('Checking package existence:', { packageId });

        // Automatically append API path suffix to CPI Base URL
        const baseUrl = cpiBaseUrl.endsWith('/api/v1') 
            ? cpiBaseUrl 
            : cpiBaseUrl.replace(/\/$/, '') + '/api/v1';

        // Get Auth Token
        const accessToken = await getOAuthToken(tokenUrl, clientId, clientSecret, null);
        const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

        // Check if package exists
        const apiUrl = `${baseUrl}/IntegrationPackages('${packageId}')`;
        console.log('=== PACKAGE EXISTENCE CHECK ===');
        console.log('Package check URL:', apiUrl);
        console.log('Target Package ID:', packageId);
        
        try {
            const response = await axios.get(apiUrl, { headers: authHeader });
            
            console.log('API Response Status:', response.status);
            console.log('API Response Data:', JSON.stringify(response.data, null, 2));
            
            // Package exists
            if (response.data && response.data.d) {
                const packageData = response.data.d;
                console.log('✅ Package EXISTS:', packageData.Name);
                return res.status(200).json({ 
                    exists: true,
                    packageName: packageData.Name,
                    packageId: packageData.Id
                });
            }
            
            // If we get a 200 but no data, consider it as not found
            console.log('⚠️  Got 200 but no package data - treating as not found');
            return res.status(200).json({ 
                exists: false,
                packageId: packageId
            });
            
        } catch (checkError) {
            console.log('=== API ERROR CAUGHT ===');
            console.log('Error Status:', checkError.response?.status);
            console.log('Error Data:', JSON.stringify(checkError.response?.data, null, 2));
            
            // If 404, package doesn't exist (good!)
            if (checkError.response && checkError.response.status === 404) {
                console.log('✅ Package does NOT exist (404) - available for creation');
                return res.status(200).json({ 
                    exists: false,
                    packageId: packageId
                });
            }
            
            // Other errors should be thrown
            console.log('❌ Unexpected error - throwing');
            throw checkError;
        }

    } catch (error) {
        console.error('Error checking package existence:', error);
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        res.status(500).json({ error: `Failed to check package existence: ${errorMsg}` });
    }
});

// Get iFlow details for a specific package
router.get('/get-iflow-details', authenticate, async (req, res) => {
    try {
        console.log('=== GET /get-iflow-details called ===');
        const userInfo = getUserInfo(req);
        const userName = userInfo.email || userInfo.id || 'Unknown User';

        // Disable caching to ensure fresh iFlow data
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Validate that credentials are provided
        if (!req.query.tokenUrl || !req.query.clientId || !req.query.clientSecret || !req.query.packageId) {
            console.log('Missing credentials or package ID:', req.query);
            logApiRequest(req, 'error', { reason: 'Missing credentials or package ID' });
            return res.status(400).json({ error: 'Missing required credentials or package ID.' });
        }

        const { cpiBaseUrl, tokenUrl, clientId, clientSecret, packageId } = req.query;
        console.log('Extracted parameters:', { cpiBaseUrl, tokenUrl, clientId, clientSecret: '***', packageId });

        // Automatically append API path suffix to CPI Base URL
        const baseUrl = cpiBaseUrl.endsWith('/api/v1') 
            ? cpiBaseUrl 
            : cpiBaseUrl.replace(/\/$/, '') + '/api/v1';
        console.log('Constructed base URL:', baseUrl);

        // Get Auth Token
        console.log('Getting OAuth token...');
        const accessToken = await getOAuthToken(tokenUrl, clientId, clientSecret, null);
        console.log('OAuth token received (first 10 chars):', accessToken ? accessToken.substring(0, 10) + '...' : 'null');
        const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

        // Construct the API URL using the exact format specified
        const apiUrl = `${baseUrl}/IntegrationPackages('${packageId}')/IntegrationDesigntimeArtifacts`;
        console.log('Constructed API URL:', apiUrl);
        
        // Make the direct SAP CPI API call
        console.log('Making SAP CPI API call...');
        const response = await axios.get(apiUrl, { headers: authHeader });
        console.log('SAP CPI API call completed successfully');

        // Debug: Log the actual response structure
        console.log('SAP CPI API Response Structure:', JSON.stringify(response.data, null, 2));
        
        // Handle different API response formats
        let iFlows = [];
        if (response.data && response.data.d && response.data.d.results) {
            iFlows = response.data.d.results;
            console.log('Extracted iFlows from response.d.results:', iFlows.length);
        } else if (response.data && Array.isArray(response.data)) {
            iFlows = response.data;
            console.log('Extracted iFlows from response array:', iFlows.length);
        } else {
            throw new Error('Unable to parse iFlows from API response. Check API URL and credentials.');
        }
        
        // Debug: Log the first iFlow to see available fields
        if (iFlows.length > 0) {
            console.log('First iFlow object structure:', JSON.stringify(iFlows[0], null, 2));
        }

        // Transform the response to match expected format
        // Check for different possible version field names in SAP CPI API
        console.log('Transforming iFlows - checking version fields...');
        const iflows = iFlows.map((iflow, index) => {
            console.log(`iFlow ${index} - Available fields:`, Object.keys(iflow));
            console.log(`iFlow ${index} - Version field values:`, {
                Version: iflow.Version,
                version: iflow.version,
                VersionNumber: iflow.VersionNumber,
                versionNumber: iflow.versionNumber,
                'Version': iflow['Version']
            });
            
            const version = iflow.Version || iflow.version || iflow.VersionNumber || iflow.versionNumber || iflow['Version'] || 'N/A';
            console.log(`iFlow ${index} - Final version:`, version);
            
            return {
                id: iflow.Id,
                name: iflow.Name,
                version: version
            };
        });

        res.status(200).json({ iflows });
    } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        res.status(500).json({ error: `Failed to fetch iFlows: ${errorMsg}` });
    }
});

// Real-time transport endpoint - performs transport immediately
router.post('/transport-iflow', authenticate, async (req, res) => {
    // Extract userName before try block so it's accessible in catch block
    const userInfo = getUserInfo(req);
    const userName = userInfo.email || userInfo.id || 'Unknown User';
    
    try {
        logInfo('Transport iFlow endpoint called', {
            projectName: req.body.projectName,
            environment: req.body.environment,
            sourcePackageId: req.body.sourcePackageId,
            targetPackageId: req.body.targetPackageId,
            sourceIflowId: req.body.sourceIflowId,
            targetIflowId: req.body.targetIflowId
        });

        console.log('User info:', { userName });

        // Validate that credentials are provided
        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret) {
            console.log('Missing credentials validation failed');
            logApiRequest(req, 'error', { reason: 'Missing credentials' });
            return res.status(400).json({ error: 'Missing required credentials.' });
        }

        // Extract form data
        const { projectName, environment, cpiBaseUrl, tokenUrl, clientId, clientSecret, sourcePackageId, targetPackageId, sourceIflowId, targetIflowId, sourceIflowVersion, targetIflowVersion, sourceIflowName, targetIflowName } = req.body;

        // Automatically append API path suffix to CPI Base URL
        const baseUrl = cpiBaseUrl.endsWith('/api/v1') 
            ? cpiBaseUrl 
            : cpiBaseUrl.replace(/\/$/, '') + '/api/v1';
        console.log('Constructed base URL:', baseUrl);

        // Get Auth Token
        console.log('Getting OAuth token...');
        console.log('OAuth token parameters:', {
            tokenUrl: tokenUrl ? '***' : 'missing',
            clientId: clientId ? '***' : 'missing', 
            clientSecret: clientSecret ? '***' : 'missing'
        });
        let accessToken;
        try {
            console.log('Calling getOAuthTokenHelper with parameters:', {
                tokenUrl,
                clientId,
                clientSecret: clientSecret ? '***' : 'missing'
            });
            accessToken = await getOAuthTokenHelper(tokenUrl, clientId, clientSecret, console);
            console.log('OAuth token received:', accessToken ? 'YES' : 'NO');
            if (!accessToken) {
                throw new Error('Failed to retrieve OAuth token');
            }
        } catch (oauthError) {
            console.error('OAuth token request failed:', oauthError);
            console.error('OAuth error response:', oauthError.response ? {
                status: oauthError.response.status,
                headers: oauthError.response.headers,
                data: oauthError.response.data
            } : 'No response');
            throw oauthError;
        }
        const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

        // Get CSRF Token (for transport operations)
        console.log('Getting CSRF token...');
        const csrfToken = await getCSRFToken(baseUrl, accessToken, null);

        // Use versions passed from frontend (eliminates Steps 1 and 2)
        console.log('Using versions from frontend:');
        console.log(`Source iFlow Version: ${sourceIflowVersion}`);
        console.log(`Target iFlow Version: ${targetIflowVersion}`);

        // Step 3: Download the source iFlow zip file
        console.log('=== DEBUG POINT 2: Step 3 - Downloading source iFlow zip file ===');
        const sourceIflowZipUrl = `${baseUrl}/IntegrationDesigntimeArtifacts(Id='${sourceIflowId}',Version='${sourceIflowVersion}')/$value`;
        console.log('Zip download URL:', sourceIflowZipUrl);
        console.log('Auth headers for zip download:', {
            Authorization: authHeader.Authorization ? authHeader.Authorization.substring(0, 20) + '...' : 'missing',
            Accept: authHeader.Accept
        });
        
        // Debug breakpoint before making zip download request
        debugger;
        let zipContent = null;

        try {
            console.log('=== DEBUG POINT 3: Making axios request for zip download with retry logic ===');
            const downloadOperation = async () => {
                const zipResponse = await axios.get(sourceIflowZipUrl, { 
                    headers: authHeader,
                    responseType: 'arraybuffer'
                });
                return zipResponse;
            };

            const zipResponse = await retryOperation(downloadOperation);
            console.log('=== DEBUG POINT 4: Zip download response received ===');
            console.log('Response status:', zipResponse.status);
            console.log('Response headers:', zipResponse.headers);
            console.log('Response data type:', typeof zipResponse.data);
            console.log('Response data length:', zipResponse.data ? zipResponse.data.length : 'null');
            
            zipContent = Buffer.from(zipResponse.data);
            console.log(`=== DEBUG POINT 5: Successfully downloaded iFlow zip file (${zipContent.length} bytes) ===`);
            
        // Removed zip file storage steps
            
        logInfo('iFlow zip file downloaded successfully', {
            size: zipContent.length,
            sourceIflowId,
            targetIflowId
        });

        // Additional check: Try to open the zip file with JSZip
        try {
            const jsZip = new JSZip();
            await jsZip.loadAsync(zipContent);
            logInfo('Successfully verified zip file integrity');
        } catch (jsZipError) {
            logError('Failed to verify zip file integrity', jsZipError);
            throw new Error(`Failed to verify zip file integrity: ${jsZipError.message}`);
        }
    } catch (zipError) {
        console.log('=== DEBUG POINT 6: Error downloading iFlow zip file ===');
        console.log('Zip error details:', {
            message: zipError.message,
            status: zipError.response?.status,
            statusText: zipError.response?.statusText,
            data: zipError.response?.data
        });
        const errorMsg = zipError.response ? JSON.stringify(zipError.response.data) : zipError.message;
        console.log(`Error downloading iFlow zip file: ${errorMsg}`);
        
        // Log to browser console via response
        console.log('ZIP_DOWNLOAD_ERROR', {
            url: sourceIflowZipUrl,
            error: errorMsg,
            status: zipError.response?.status
        });
        
        return res.status(500).json({ error: `Failed to download iFlow zip file: ${errorMsg}` });
    }

    // Step 4: Verify and edit the zip file
    console.log('=== DEBUG POINT 7: Step 4 - Verifying and editing iFlow zip file ===');
    
    console.log('First 100 bytes of zip content:', zipContent.slice(0, 100).toString('hex'));
    console.log('Last 100 bytes of zip content:', zipContent.slice(-100).toString('hex'));
    
    // Removed zip structure check as we're no longer storing the file

    const editZipContent = async (zipContent, sourceIflowId, targetIflowId) => {
        try {
            console.log('=== DEBUG POINT 8: Editing zip file with JSZip ===');
            const editedZipContent = await editZipWithJSZip(zipContent, sourceIflowId, targetIflowId);
            console.log(`✅ Successfully edited zip file with JSZip (${editedZipContent.length} bytes)`);

            // Log the first and last few bytes of the edited zip content for debugging
            console.log('First 100 bytes of edited zip content:', editedZipContent.slice(0, 100).toString('hex'));
            console.log('Last 100 bytes of edited zip content:', editedZipContent.slice(-100).toString('hex'));

    console.log('Zip file edited successfully');

            // Log success
            console.log('ZIP_EDIT_SUCCESS', {
                originalSize: zipContent.length,
                editedSize: editedZipContent.length,
                isUnmodified: editedZipContent.length === zipContent.length
            });

            return editedZipContent;
        } catch (editError) {
            console.error(`❌ Error editing iFlow zip file: ${editError.message}`);
            console.error(`Stack trace: ${editError.stack}`);
            
            // Log to browser console via response
            console.log('ZIP_EDIT_ERROR', {
                error: editError.message,
                stack: editError.stack
            });
            
            throw editError; // Re-throw the error to be caught by the outer try-catch
        }
    };

    // Step 5: Upload edited iFlow to target package
    console.log('=== DEBUG POINT 11: Step 5 - Uploading edited iFlow to target package ===');
    
    const editedZipContent = await editZipContent(zipContent, sourceIflowId, targetIflowId);
    
    // Base64 encode the edited zip file
    const base64Content = editedZipContent.toString('base64');
    console.log('=== DEBUG POINT 12: Base64 encoded content length:', base64Content, 'characters ===');

    // Prepare the PUT request body
    const putBody = {
        Name: targetIflowId,
        ArtifactContent: base64Content
    };
    
    // Log the PUT request body for debugging
console.log('=== PUT REQUEST BODY ===');
console.log('Body structure:', {
    Name: putBody.Name,
    ArtifactContent: `[Base64 content with length ${putBody.ArtifactContent}]`
});
console.log('Base64 content length:', putBody.ArtifactContent);
console.log('=== END PUT REQUEST BODY ===');

    // Prepare headers for PUT request
    const putHeaders = {
        ...authHeader,
        'X-CSRF-Token': csrfToken,
        'Content-Type': 'application/json'
    };
    console.log('=== DEBUG POINT 14: PUT request headers prepared ===');

    // Upload the edited iFlow to target package
    const targetIflowPutUrl = `${baseUrl}/IntegrationDesigntimeArtifacts(Id='${targetIflowId}',Version='${targetIflowVersion}')`;
    console.log('=== DEBUG POINT 15: Target iFlow PUT URL:', targetIflowPutUrl, '===');

    // Log the PUT request body using the logLargePayload function
    await logLargePayload('PUT request body', JSON.stringify(putBody), {
        iflowId: targetIflowId,
        contentLength: putBody.ArtifactContent.length,
        targetUrl: targetIflowPutUrl
    });
    console.log('=== DEBUG POINT 16: PUT request body prepared and logged ===');
    
    try {
        console.log('=== DEBUG POINT 17: Making PUT request to upload edited iFlow ===');
        const putResponse = await axios.put(targetIflowPutUrl, putBody, { headers: putHeaders });
        console.log('=== DEBUG POINT 18: PUT response received ===');
        console.log('PUT response status:', putResponse.status);
        console.log('PUT response data:', putResponse.data);
        console.log('✅ Successfully uploaded edited iFlow to target package');
    } catch (putError) {
            console.log('=== DEBUG POINT 18: Error uploading edited iFlow ===');
            console.log('PUT error details:', {
                message: putError.message,
                status: putError.response?.status,
                statusText: putError.response?.statusText,
                data: putError.response?.data
            });
            const errorMsg = putError.response ? JSON.stringify(putError.response.data) : putError.message;
            console.log(`❌ Error uploading edited iFlow: ${errorMsg}`);
            
            // Log to browser console via response
            console.log('PUT_UPLOAD_ERROR', {
                url: targetIflowPutUrl,
                error: errorMsg,
                status: putError.response?.status
            });
            
            throw new Error(`Failed to upload edited iFlow: ${errorMsg}`);
        }

        logInfo('Transport processing complete', {
            projectName,
            environment,
            userName,
            sourcePackageId,
            targetPackageId,
            sourceIflowId,
            targetIflowId,
            sourceIflowVersion,
            targetIflowVersion
        });

        // Save transport log to database
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
            timeTakenSeconds: null,
            logContent: `Transport completed successfully from ${sourcePackageId}/${sourceIflowId} to ${targetPackageId}/${targetIflowId}`,
            resultContent: `${TRANSPORT_CSV_HEADERS}\n"${sourcePackageId}","${targetPackageId}","${sourceIflowId}","${targetIflowId}","200","Success"`
        });

        logInfo('Transport log saved to database', { transportLogId });

        // Return success response
        res.status(200).json({
            success: true,
            message: `Successfully transported ${sourceIflowName} to ${targetIflowName}`,
            details: {
                sourcePackageId,
                targetPackageId,
                sourceIflowId,
                targetIflowId,
                sourceIflowVersion,
                targetIflowVersion,
                sourceIflowName,
                targetIflowName,
                iflwRenamed: true,
                manifestEdited: true,
                transportLogId
            }
        });

    } catch (error) {
        logError('Failed to transport iFlow', error);
        
        // Extract detailed error information
        let errorMsg = error.message || 'Unknown error';
        let httpStatus = 'N/A';
        let apiResponse = 'N/A';
        
        // Check if this is an axios error with response data
        if (error.response) {
            httpStatus = error.response.status;
            apiResponse = error.response.data;
            
            // If the error message is generic, try to get more details from response
            if (errorMsg.includes('Failed to upload edited iFlow') && error.response.data) {
                // Extract the actual error from the response
                if (typeof error.response.data === 'string') {
                    errorMsg = error.response.data;
                } else if (error.response.data.error) {
                    // Handle SAP CPI error format
                    const sapError = error.response.data.error;
                    if (sapError.message && sapError.message.value) {
                        errorMsg = sapError.message.value;
                    } else if (sapError.message) {
                        errorMsg = JSON.stringify(sapError.message);
                    } else {
                        errorMsg = JSON.stringify(sapError);
                    }
                }
            }
        }
        
        // Determine which step failed based on error message
        let failedStep = 'Unknown';
        
        if (errorMsg.includes('OAuth token') || errorMsg.includes('authenticate')) {
            failedStep = 'Authentication';
        } else if (errorMsg.includes('CSRF token')) {
            failedStep = 'CSRF Token';
        } else if (errorMsg.includes('download') || errorMsg.includes('fetch zip')) {
            failedStep = 'Download Zip';
        } else if (errorMsg.includes('edit') || errorMsg.includes('JSZip')) {
            failedStep = 'Edit Zip';
        } else if (errorMsg.includes('upload') || errorMsg.includes('PUT') || errorMsg.includes('locked')) {
            failedStep = 'Upload iFlow';
        }

        // Prepare detailed error information
        const errorDetails = {
            message: errorMsg,
            step: failedStep,
            sourcePackageId: req.body.sourcePackageId || 'N/A',
            targetPackageId: req.body.targetPackageId || 'N/A',
            sourceIflowId: req.body.sourceIflowId || 'N/A',
            targetIflowId: req.body.targetIflowId || 'N/A',
            httpStatus: httpStatus,
            apiResponse: apiResponse,
            timestamp: new Date().toISOString()
        };

        console.error('Transport error details:', JSON.stringify(errorDetails, null, 2));
        console.error('Transport error stack:', error.stack);
        
        // Save failed transport log to database with comprehensive error details
        try {
            // Build the log content with error information
            const logContent = `Transport failed at step: ${failedStep}\n\n` +
                `Error Message: ${errorMsg}\n\n` +
                `Error Details:\n${JSON.stringify(errorDetails, null, 2)}\n\n` +
                `Stack Trace:\n${error.stack || 'Not available'}`;

            // Build the result content in CSV format for consistency
            const resultContent = `${TRANSPORT_CSV_HEADERS}\n` +
                `"${req.body.sourcePackageId || ''}","${req.body.targetPackageId || ''}","${req.body.sourceIflowId || ''}","${req.body.targetIflowId || ''}","${httpStatus}","${errorMsg.replace(/"/g, '""')}"`;

            const transportLogId = await db.insertTransportLog({
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
                timeTakenSeconds: null,
                errorMessage: errorMsg,
                errorDetails: JSON.stringify(errorDetails),
                failedStep: failedStep,
                errorStackTrace: error.stack || null,
                logContent: logContent,
                resultContent: resultContent
            });
            console.log('✅ Failed transport log saved to database with error details');
            console.log('Transport log ID:', transportLogId);
        } catch (logError) {
            console.error('❌ Failed to save error log to database:', logError);
            console.error('Log error details:', logError.message);
            console.error('Log error stack:', logError.stack);
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Failed to transport iFlow.',
            details: errorMsg,
            failedStep: failedStep
        });
    }
});

// Transport Package endpoint - creates new package with suffix and transports all iFlows
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

        // Validate that credentials are provided
        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret) {
            logApiRequest(req, 'error', { reason: 'Missing credentials' });
            return res.status(400).json({ error: 'Missing required credentials.' });
        }

        // Validate package transport specific fields
        if (!req.body.sourcePackageId || !req.body.targetPackageSuffix) {
            return res.status(400).json({ error: 'Missing source package ID or target suffix.' });
        }

        const formDataWithUser = { ...req.body, userName };
        const jobData = { formData: formDataWithUser };

        // Create a job entry
        const jobId = await db.insertDownloadJob({
            status: 'Pending',
            progress: 0,
            total: 0,
            form_data_json: JSON.stringify(jobData)
        });

        logInfo('Package transport job created', { jobId });

        // Return job ID immediately
        res.status(202).json({ 
            success: true,
            jobId: jobId,
            message: 'Package transport job started. This may take several minutes depending on the number of iFlows.'
        });

        // Start the package transport job asynchronously
        const { runTransportPackageJob } = require('../jobs');
        runTransportPackageJob(jobId).catch(error => {
            logError('Package transport job failed', { jobId, error: error.message });
        });

    } catch (error) {
        logError('Failed to start package transport job', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to start package transport job.',
            details: error.message
        });
    }
});

// Helper function to handle errors
const handleError = (res, error, message) => {
    logError(message, error);
    res.status(500).json({
        success: false,
        error: message,
        details: error.message
    });
};

// --- Download Zip File Route ---
router.post('/download-zip-file', authenticate, async (req, res) => {
    try {
        console.log('=== SERVER SIDE DOWNLOAD ZIP ===');
        console.log('Download zip request body:', req.body);

        const {
          cpiBaseUrl,
          tokenUrl,
          clientId,
          clientSecret,
          packageId,
          iflowId
        } = req.body;

        // Validate required fields
        if (!cpiBaseUrl || !tokenUrl || !clientId || !clientSecret || !packageId || !iflowId) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        // Call the download zip job
        const result = await downloadZipFile({
          cpiBaseUrl,
          tokenUrl,
          clientId,
          clientSecret,
          packageId,
          iflowId
        });

        console.log('=== SERVER SIDE DOWNLOAD ZIP SUCCESS ===');
        console.log('Download zip result:', result);

        res.json(result);
    } catch (error) {
        console.log('=== SERVER SIDE DOWNLOAD ZIP ERROR ===');
        console.log('Download zip error details:', error);
        console.log('Download zip error message:', error.message);
        console.log('Download zip error stack:', error.stack);

        res.status(500).json({ error: error.message });
    }
});

// Legacy transport job endpoints (for backward compatibility)
// Start transport job - requires Execute scope
router.post('/start-transport-job', authenticate, async (req, res) => {
    try {
        console.log('=== START TRANSPORT JOB CALLED ===');
        console.log('Request body:', {
            projectName: req.body.projectName,
            environment: req.body.environment,
            cpiBaseUrl: req.body.cpiBaseUrl ? '***' : 'missing',
            tokenUrl: req.body.tokenUrl ? '***' : 'missing',
            clientId: req.body.clientId ? '***' : 'missing',
            clientSecret: req.body.clientSecret ? '***' : 'missing',
            sourcePackageId: req.body.sourcePackageId,
            targetPackageId: req.body.targetPackageId,
            sourceIflowId: req.body.sourceIflowId,
            targetIflowId: req.body.targetIflowId
        });

        const userInfo = getUserInfo(req);
        const userName = userInfo.email || userInfo.id || 'Unknown User';
        console.log('User info:', { userName });

        // Validate that credentials are provided
        if (!req.body.tokenUrl || !req.body.clientId || !req.body.clientSecret) {
            console.log('Missing credentials validation failed');
            logApiRequest(req, 'error', { reason: 'Missing credentials' });
            return res.status(400).json({ error: 'Missing required credentials.' });
        }

        const formDataWithUser = { ...req.body, userName };
        const jobData = { formData: formDataWithUser };
        console.log('Job data prepared:', { hasFormData: !!jobData.formData });

        const jobId = await db.insertDownloadJob({
            status: 'Pending',
            progress: 0,
            total: 0,
            form_data_json: JSON.stringify(jobData)
        });
        console.log('Job created with ID:', jobId);

        res.status(202).json({ jobId: jobId });
        
        // Start the transport job asynchronously
        console.log('=== STARTING TRANSPORT JOB EXECUTION ===');
        console.log('Job ID:', jobId);
        console.log('Calling runTransportJob function...');
        console.log('runTransportJob function reference:', typeof runTransportJob);
        
        try {
            console.log('Attempting to call runTransportJob...');
            const jobPromise = runTransportJob(jobId);
            console.log('runTransportJob called successfully, promise returned:', jobPromise);
            
            jobPromise.catch(error => {
                console.log('=== TRANSPORT JOB ERROR ===');
                console.log('Job ID:', jobId);
                console.log('Error:', error.message);
                console.log('Error stack:', error.stack);
            });
        } catch (startError) {
            console.log('=== TRANSPORT JOB START ERROR ===');
            console.log('Job ID:', jobId);
            console.log('Start error:', startError.message);
            console.log('Start error stack:', startError.stack);
        }
        
    } catch (error) {
        console.log('=== START TRANSPORT JOB ERROR ===');
        console.log('Error:', error.message);
        console.log('Error stack:', error.stack);
        logError('Failed to start transport job', error);
        logApiRequest(req, 'error', { error: error.message });
        res.status(500).json({ error: 'Failed to start job.' });
    }
});

// Get transport job status
router.get('/transport-job-status/:jobId', authenticate, async (req, res) => {
    try {
        const { jobId } = req.params;
        console.log('=== GET /transport-job-status called ===');
        console.log('Job ID:', jobId);
        
        const job = await db.getDownloadJobById(jobId);
        console.log('Job found:', job ? 'YES' : 'NO');

        if (!job) {
            console.log('Job not found in database');
            logApiRequest(req, 'error', { jobId, reason: 'Job not found' });
            return res.status(404).json({ error: 'Job not found.' });
        }

        console.log('Job status response:', {
            status: job.status,
            progress: job.progress,
            total: job.total,
            progressMessage: job.progress_message,
            resultFile: job.result_file_path
        });

        res.json({
            status: job.status,
            progress: job.progress,
            total: job.total,
            progressMessage: job.progress_message || '',
            resultFile: job.result_file_path
        });
    } catch (error) {
        console.log('Error in transport-job-status route:', error.message);
        console.log('Error stack:', error.stack);
        logError('Error fetching transport job status', error);
        logApiRequest(req, 'error', { jobId: req.params.jobId, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Get transport result
router.get('/get-transport-result/:jobId', authenticate, async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await db.getDownloadJobById(jobId);

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
        logError(`Error downloading transport result file for job ${req.params.jobId}`, error);
        logApiRequest(req, 'error', { jobId: req.params.jobId, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

module.exports = {
    router,
    editZipWithJSZip // Export the function for testing
};
