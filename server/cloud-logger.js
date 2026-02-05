// server/cloud-logger.js
const logging = require('@sap/logging');
const xsenv = require('@sap/xsenv');

let cloudLogger = null;
let isCloudLoggingAvailable = false;

/**
 * Initialize Cloud Logging
 * This should be called once at application startup
 */
function initCloudLogging() {
    try {
        // Check if we're running in Cloud Foundry
        if (process.env.VCAP_APPLICATION) {
            // Get Cloud Logging service credentials
            // First try by service name, then by tag as fallback
            let services;
            try {
                services = xsenv.getServices({ cloudLogging: { name: 'cloud-logging-cloud-logging' } });
            } catch (e) {
                services = xsenv.getServices({ cloudLogging: { tag: 'logging' } });
            }

            if (services.cloudLogging) {
                // Initialize the cloud logger
                cloudLogger = logging.createLogger({
                    name: 'sap-integration-automation',
                    level: 'info'
                });

                isCloudLoggingAvailable = true;
                console.log('✅ Cloud Logging initialized successfully');
            } else {
                console.log('⚠️  Cloud Logging service not found, using console logging');
            }
        } else {
            console.log('ℹ️  Running locally, Cloud Logging not available');
        }
    } catch (error) {
        console.error('❌ Failed to initialize Cloud Logging:', error.message);
        isCloudLoggingAvailable = false;
    }
}

/**
 * Log information message
 * @param {string} message - The log message
 * @param {Object} data - Additional data to log
 */
function logInfo(message, data = {}) {
    if (isCloudLoggingAvailable && cloudLogger) {
        cloudLogger.info(message, data);
    }
    // Always log to console as well
    console.log(`[INFO] ${message}`, data);
}

/**
 * Log error message
 * @param {string} message - The error message
 * @param {Error|Object} error - The error object or additional data
 */
function logError(message, error = {}) {
    const errorData = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
    } : error;

    if (isCloudLoggingAvailable && cloudLogger) {
        cloudLogger.error(message, errorData);
    }
    // Always log to console as well
    console.error(`[ERROR] ${message}`, errorData);
}

/**
 * Log warning message
 * @param {string} message - The warning message
 * @param {Object} data - Additional data to log
 */
function logWarning(message, data = {}) {
    if (isCloudLoggingAvailable && cloudLogger) {
        cloudLogger.warning(message, data);
    }
    // Always log to console as well
    console.warn(`[WARNING] ${message}`, data);
}

/**
 * Log debug message
 * @param {string} message - The debug message
 * @param {Object} data - Additional data to log
 */
function logDebug(message, data = {}) {
    if (isCloudLoggingAvailable && cloudLogger) {
        cloudLogger.debug(message, data);
    }
    // Only log debug in development
    if (process.env.NODE_ENV !== 'production') {
        console.debug(`[DEBUG] ${message}`, data);
    }
}

/**
 * Log job execution (download/upload)
 * @param {string} jobType - 'download' or 'upload'
 * @param {number} jobId - Job ID
 * @param {string} status - Job status
 * @param {Object} details - Job details
 */
function logJobExecution(jobType, jobId, status, details = {}) {
    const logData = {
        jobType,
        jobId,
        status,
        timestamp: new Date().toISOString(),
        ...details
    };

    if (status === 'Failed' || status === 'Error') {
        logError(`Job ${jobType} #${jobId} ${status}`, logData);
    } else {
        logInfo(`Job ${jobType} #${jobId} ${status}`, logData);
    }
}

/**
 * Log application crash or critical error
 * @param {string} message - The crash message
 * @param {Error} error - The error that caused the crash
 */
function logCritical(message, error) {
    const criticalData = {
        message,
        error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
        } : error,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        nodeVersion: process.version
    };

    if (isCloudLoggingAvailable && cloudLogger) {
        cloudLogger.error(`[CRITICAL] ${message}`, criticalData);
    }
    console.error(`[CRITICAL] ${message}`, criticalData);
}

/**
 * Log API request
 * @param {Object} req - Express request object
 * @param {string} status - Request status
 * @param {Object} additionalData - Additional data to log
 */
function logApiRequest(req, status, additionalData = {}) {
    const logData = {
        method: req.method,
        path: req.path,
        status,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString(),
        ...additionalData
    };

    if (status === 'error' || status === 'failed') {
        logError(`API ${req.method} ${req.path} ${status}`, logData);
    } else {
        logInfo(`API ${req.method} ${req.path} ${status}`, logData);
    }
}

module.exports = {
    initCloudLogging,
    logInfo,
    logError,
    logWarning,
    logDebug,
    logJobExecution,
    logCritical,
    logApiRequest,
    isCloudLoggingAvailable: () => isCloudLoggingAvailable
};
