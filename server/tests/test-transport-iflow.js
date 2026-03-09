const axios = require('axios');
require('dotenv').config();
const { logInfo, logError, logWarn } = require('../cloud-logger.js');

const testTransportIflow = async () => {
  try {
    logInfo('Starting transport iFlow test...');

    const payload = {
      projectName: 'TestProject',
      environment: 'DEV',
      cpiBaseUrl: 'https://prc-is-sbx.it-cpi028.cfapps.sa30.hana.ondemand.com',
      tokenUrl: 'https://prc-is-sbx.authentication.sa30.hana.ondemand.com/oauth/token',
      clientId: 'sb-ac86dfa7-fa7f-45fc-9dee-97fd985a3eb5!b7741|it!b188',
      clientSecret: process.env.CPI_CLIENT_SECRET,
      sourcePackageId: 'TestProxy',
      targetPackageId: 'TestProxy',
      sourceIflowId: 'POC1_TESTTransport',
      targetIflowId: 'POC1_TESTTransport.QA',
      sourceIflowVersion: '1.0.0',
      targetIflowVersion: '1.0.1'
    };

    if (!payload.clientSecret) {
      throw new Error('CPI_CLIENT_SECRET environment variable is not set');
    }

    logInfo('Payload prepared', {
      ...payload,
      clientSecret: payload.clientSecret ? '***REDACTED***' : 'missing',
      tokenUrl: payload.tokenUrl,
      clientId: payload.clientId
    });

    const url = 'http://localhost:3001/api/v1/transport-iflow';
    logInfo('Sending request to:', { url });

    // Log the actual values being used for the OAuth token request
    logInfo('OAuth token request parameters:', {
      tokenUrl: payload.tokenUrl,
      clientId: payload.clientId,
      clientSecret: payload.clientSecret ? 'PROVIDED' : 'MISSING'
    });

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    logInfo('Response received', {
      status: response.status,
      headers: response.headers,
      data: response.data
    });
    
    if (response.data.success) {
      logInfo('Transport successful!', response.data.details);
    } else {
      logError('Transport failed.', response.data.error);
    }

    // Additional logging for simplified process
    logInfo('Simplified process completed', {
      iflwRenamed: response.data.details?.iflwRenamed,
      manifestEdited: response.data.details?.manifestEdited
    });

    if (!response.data.details?.manifestEdited) {
      logWarn('MANIFEST.MF was not edited during the transport process');
    }
  } catch (error) {
    logError('Error occurred during the test', error);
    if (error.response) {
      logError('Error response', {
        status: error.response.status,
        headers: error.response.headers,
        data: error.response.data
      });
    } else if (error.request) {
      logError('No response received', { request: error.request });
    } else {
      logError('Error details', { message: error.message });
    }
  }
};

logInfo('Initiating transport iFlow test...');
testTransportIflow()
  .then(() => logInfo('Test completed.'))
  .catch(err => logError('Test failed', err));
