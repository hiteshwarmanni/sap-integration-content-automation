// server/cloud-logger.js
const logging = require('@sap/logging');
const xsenv = require('@sap/xsenv');
const { v4: uuidv4 } = require('uuid');

let cloudLogger = null;
let isCloudLoggingAvailable = false;
const performanceTimers = new Map();

// Configuration from environment variables
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_SANITIZE = process.env.LOG_SANITIZE !== 'false';

// Sensitive fields to redact in logs
const SENSITIVE_FIELDS = [
    'password', 'clientSecret', 'token', 'accessToken',
    'refreshToken', 'authorization', 'cookie', 'apiKey',
    'secret', 'credentials', 'auth'
];

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
 * Sanitize sensitive data from objects
 * @param {Object} data - Data object to sanitize
 * @returns {Object} Sanitized copy of data
 */
function sanitizeData(data) {
    if (!LOG_SANITIZE || !data || typeof data !== 'object') {
        return data;
    }

    const sanitized = Array.isArray(data) ? [...data] : { ...data };

    for (const key in sanitized) {
        const lowerKey = key.toLowerCase();

        // Check if key contains sensitive field names
        if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
            sanitized[key] = '***REDACTED***';
        } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
            // Recursively sanitize nested objects
            sanitized[key] = sanitizeData(sanitized[key]);
        }
    }

    return sanitized;
}

/**
 * Create structured log entry
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 * @returns {Object} Structured log entry
 */
function createLogEntry(level, message, metadata = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...sanitizeData(metadata)
    };

    // Add correlation ID if present
    if (metadata.correlationId) {
        entry.correlationId = metadata.correlationId;
    }

    // Add user context if present
    if (metadata.userId) {
        entry.userId = metadata.userId;
    }
    if (metadata.userName) {
        entry.userName = metadata.userName;
    }

    return entry;
}

/**
 * Generate a new correlation ID
 * @returns {string} UUID v4 correlation ID
 */
function generateCorrelationId() {
    return uuidv4();
}

/**
 * Log information message
 * @param {string} message - The log message
 * @param {Object} metadata - Additional metadata to log
 */
function logInfo(message, metadata = {}) {
    const logEntry = createLogEntry('info', message, metadata);

    if (isCloudLoggingAvailable && cloudLogger) {
        // @sap/logging v9 format: logger.info(message, ...args)
        cloudLogger.info(message, sanitizeData(metadata));
    }

    // Console output for local development
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[INFO] ${message}`, sanitizeData(metadata));
    }
}

/**
 * Log error message
 * @param {string} message - The error message
 * @param {Error|Object} error - The error object or additional metadata
 */
function logError(message, error = {}) {
    const errorData = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
    } : error;

    const logEntry = createLogEntry('error', message, errorData);

    if (isCloudLoggingAvailable && cloudLogger) {
        cloudLogger.error(message, sanitizeData(errorData));
    }

    // Always log errors to console
    console.error(`[ERROR] ${message}`, sanitizeData(errorData));
}

/**
 * Log warning message
 * @param {string} message - The warning message
 * @param {Object} metadata - Additional metadata to log
 */
function logWarning(message, metadata = {}) {
    const logEntry = createLogEntry('warning', message, metadata);

    if (isCloudLoggingAvailable && cloudLogger) {
        cloudLogger.warning(message, sanitizeData(metadata));
    }

    if (process.env.NODE_ENV !== 'production') {
        console.warn(`[WARNING] ${message}`, sanitizeData(metadata));
    }
}

/**
 * Log debug message (only in development)
 * @param {string} message - The debug message
 * @param {Object} metadata - Additional metadata to log
 */
function logDebug(message, metadata = {}) {




    if (LOG_LEVEL === 'debug' || process.env.NODE_ENV !== 'production') {
        const logEntry = createLogEntry('debug', message, metadata);

        if (isCloudLoggingAvailable && cloudLogger) {
            cloudLogger.debug(message, sanitizeData(metadata));
        }

        console.debug(`[DEBUG] ${message}`, sanitizeData(metadata));
    }
}

/**
 * Log job execution (download/upload/deploy)
 * @param {string} jobType - 'download', 'upload', or 'deploy'
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
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage()
    };

    if (isCloudLoggingAvailable && cloudLogger) {
        cloudLogger.error(`[CRITICAL] ${message}`, sanitizeData(criticalData));
    }
    console.error(`[CRITICAL] ${message}`, sanitizeData(criticalData));
}

/**
 * Log API request with correlation ID and user context
 * @param {Object} req - Express request object
 * @param {string} status - Request status
 * @param {Object} additionalData - Additional data to log
 */
function logApiRequest(req, status, additionalData = {}) {
    const logData = {
        method: req.method,
        path: req.path,
        query: req.query,
        status,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('user-agent'),
        correlationId: req.correlationId,
        userId: req.user?.userId,
        userName: req.user?.userName,
        timestamp: new Date().toISOString(),
        ...additionalData
    };

    if (status === 'error' || status === 'failed') {
        logError(`API ${req.method} ${req.path} ${status}`, logData);
    } else {
        logInfo(`API ${req.method} ${req.path} ${status}`, logData);
    }
}

/**
 * Start performance timer
 * @param {string} operationName - Name of the operation to time
 * @param {string} correlationId - Optional correlation ID
 */
function timeStart(operationName, correlationId = null) {
    const key = correlationId ? `${operationName}_${correlationId}` : operationName;
    performanceTimers.set(key, Date.now());
}

/**
 * End performance timer and log duration
 * @param {string} operationName - Name of the operation that was timed
 * @param {string} correlationId - Optional correlation ID
 * @param {Object} metadata - Additional metadata to log
 * @returns {number} Duration in milliseconds
 */
function timeEnd(operationName, correlationId = null, metadata = {}) {
    const key = correlationId ? `${operationName}_${correlationId}` : operationName;
    const startTime = performanceTimers.get(key);

    if (!startTime) {
        logWarning(`Timer not found for operation: ${operationName}`, { correlationId });
        return 0;
    }

    const duration = Date.now() - startTime;
    performanceTimers.delete(key);

    logInfo(`Operation completed: ${operationName}`, {
        duration: `${duration}ms`,
        correlationId,
        ...metadata
    });

    return duration;
}

/**
 * Create a logger instance with pre-bound context
 * @param {Object} context - Context to bind (e.g., correlationId, userId)
 * @returns {Object} Logger instance with context
 */
function withContext(context = {}) {
    return {
        info: (message, metadata = {}) => logInfo(message, { ...context, ...metadata }),
        error: (message, error = {}) => logError(message, { ...context, ...error }),
        warning: (message, metadata = {}) => logWarning(message, { ...context, ...metadata }),
        debug: (message, metadata = {}) => logDebug(message, { ...context, ...metadata }),
        timeStart: (operationName) => timeStart(operationName, context.correlationId),
        timeEnd: (operationName, metadata = {}) => timeEnd(operationName, context.correlationId, { ...context, ...metadata })
    };
}

module.exports = {
    initCloudLogging,
    generateCorrelationId,
    logInfo,
    logError,
    logWarning,
    logDebug,
    logJobExecution,
    logCritical,
    logApiRequest,
    timeStart,
    timeEnd,
    withContext,
    isCloudLoggingAvailable: () => isCloudLoggingAvailable
};