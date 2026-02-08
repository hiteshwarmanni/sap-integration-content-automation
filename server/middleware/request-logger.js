// server/middleware/request-logger.js
const { logInfo, logError, generateCorrelationId, timeStart, timeEnd } = require('../cloud-logger');

// Paths to skip logging (health checks, static assets)
const SKIP_PATHS = ['/api/health', '/api/ready', '/favicon.ico'];

/**
 * Request logging middleware
 * Logs all incoming requests and outgoing responses with correlation IDs
 */
function requestLogger(req, res, next) {
    // Skip logging for certain paths
    if (SKIP_PATHS.some(path => req.path.startsWith(path))) {
        return next();
    }

    // Generate or extract correlation ID
    const correlationId = req.get('x-correlation-id') || generateCorrelationId();
    req.correlationId = correlationId;

    // Add correlation ID to response headers
    res.setHeader('x-correlation-id', correlationId);

    // Extract user info if available (set by auth middleware)
    const userId = req.user?.userId || req.user?.id;
    const userName = req.user?.userName || req.user?.name || req.user?.email;

    // Sanitize request body (remove sensitive data)
    const sanitizedBody = sanitizeRequestBody(req.body);

    // Start timer for response time tracking
    const startTime = Date.now();

    // Capture response - only log errors and slow requests
    const originalSend = res.send;
    res.send = function (data) {
        const duration = Date.now() - startTime;

        // Only log errors or slow requests (> 2 seconds)
        if (res.statusCode >= 400 || duration > 2000) {
            const logFunction = res.statusCode >= 400 ? logError : logWarning;
            logFunction(res.statusCode >= 400 ? 'Request failed' : 'Slow request detected', {
                correlationId,
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                duration: `${duration}ms`,
                userId,
                userName
            });
        }

        originalSend.call(this, data);
    };

    // Capture errors
    res.on('error', (error) => {
        logError('Response error', {
            correlationId,
            method: req.method,
            path: req.path,
            error: error.message,
            stack: error.stack,
            userId,
            userName
        });
    });

    next();
}

/**
 * Sanitize request body to remove sensitive fields
 * @param {Object} body - Request body
 * @returns {Object} Sanitized body with only keys (values removed for sensitive fields)
 */
function sanitizeRequestBody(body) {
    if (!body || typeof body !== 'object') {
        return body;
    }

    const sensitiveFields = [
        'password', 'clientSecret', 'token', 'accessToken',
        'refreshToken', 'authorization', 'apiKey', 'secret'
    ];

    const sanitized = {};
    for (const key in body) {
        const lowerKey = key.toLowerCase();
        if (sensitiveFields.some(field => lowerKey.includes(field))) {
            sanitized[key] = '***REDACTED***';
        } else if (typeof body[key] === 'object') {
            sanitized[key] = '[Object]';
        } else {
            sanitized[key] = body[key];
        }
    }

    return sanitized;
}

/**
 * Create correlation ID from request or generate new one
 * Useful for attaching to external API calls
 * @param {Object} req - Express request object
 * @returns {string} Correlation ID
 */
function getCorrelationId(req) {
    return req.correlationId || generateCorrelationId();
}

module.exports = {
    requestLogger,
    getCorrelationId
};