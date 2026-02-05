// server/jobs/shared/auth-helper.js

const axios = require('axios');

/**
 * Acquires OAuth access token using client credentials
 * @param {string} tokenUrl - OAuth token endpoint URL
 * @param {string} clientId - OAuth client ID
 * @param {string} clientSecret - OAuth client secret
 * @param {Object} logger - Winston logger instance
 * @returns {Promise<string>} Access token
 */
async function getOAuthToken(tokenUrl, clientId, clientSecret, logger) {
    logger.info('Getting Auth Token...');
    logger.info(`Token URL: ${tokenUrl}`);
    logger.info(`Client ID length: ${clientId ? clientId.length : 0}`);
    logger.info(`Client Secret length: ${clientSecret ? clientSecret.length : 0}`);

    // Create Basic Auth header manually to handle special characters
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenBody = new URLSearchParams();
    tokenBody.append('grant_type', 'client_credentials');

    try {
        const tokenResponse = await axios.post(tokenUrl, tokenBody, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${credentials}`
            }
        });

        const accessToken = tokenResponse.data.access_token;
        logger.info('Auth Token acquired successfully.');
        return accessToken;
    } catch (tokenError) {
        logger.error('Token acquisition failed:');
        logger.error(`Status: ${tokenError.response?.status}`);
        logger.error(`Response: ${JSON.stringify(tokenError.response?.data)}`);
        throw tokenError;
    }
}

/**
 * Acquires CSRF token for SAP API calls
 * @param {string} cpiBaseUrl - CPI API base URL
 * @param {string} accessToken - OAuth access token
 * @param {Object} logger - Winston logger instance
 * @returns {Promise<string>} CSRF token
 */
async function getCSRFToken(cpiBaseUrl, accessToken, logger) {
    logger.info('Getting CSRF Token...');

    const sapApi = axios.create({
        baseURL: cpiBaseUrl,
        headers: { 'Authorization': `Bearer ${accessToken}` },
        withCredentials: true
    });

    const csrfResponse = await sapApi.get('/', {
        headers: { 'X-CSRF-Token': 'Fetch' }
    });

    const csrfToken = csrfResponse.headers['x-csrf-token'];
    logger.info('CSRF Token acquired.');

    return csrfToken;
}

/**
 * Creates authenticated axios instance for SAP API
 * @param {string} cpiBaseUrl - CPI API base URL
 * @param {string} accessToken - OAuth access token
 * @returns {Object} Configured axios instance
 */
function createAuthenticatedClient(cpiBaseUrl, accessToken) {
    return axios.create({
        baseURL: cpiBaseUrl,
        headers: { 'Authorization': `Bearer ${accessToken}` },
        withCredentials: true
    });
}

module.exports = {
    getOAuthToken,
    getCSRFToken,
    createAuthenticatedClient
};
