// server/middleware/error-logger.js
const { logError, logCritical } = require('../cloud-logger');

/**
 * Error categories for better error classification
 */
const ErrorCategories = {
    VALIDATION: 'VALIDATION_ERROR',
    DATABASE: 'DATABASE_ERROR',
    EXTERNAL_API: 'EXTERNAL_API_ERROR',
    AUTHENTICATION: 'AUTHENTICATION_ERROR',
    AUTHORIZATION: 'AUTHORIZATION_ERROR',
    NOT_FOUND: 'NOT_FOUND_ERROR',
    INTERNAL: 'INTERNAL_SERVER_ERROR',
    TIMEOUT: 'TIMEOUT_ERROR',
    FILE_SYSTEM: 'FILE_SYSTEM_ERROR'
};

/**
 * Categorize error based on error properties
 * @param {Error} error - Error object
 * @returns {string} Error category
 */
function categorizeError(error) {
    if (error.name === 'ValidationError' || error.code === 'VALIDATION_FAILED') {
        return ErrorCategories.VALIDATION;
    }
    if (error.name === 'SequelizeError' || error.name === 'DatabaseError' || error.code?.startsWith('ER_')) {
        return ErrorCategories.DATABASE;
    }
    if (error.name === 'UnauthorizedError' || error.code === 'UNAUTHORIZED') {
        return ErrorCategories.AUTHENTICATION;
    }
    if (error.name === 'ForbiddenError' || error.code === 'FORBIDDEN') {
        return ErrorCategories.AUTHORIZATION;
    }
    if (error.name === 'NotFoundError' || error.statusCode === 404) {
        return ErrorCategories.NOT_FOUND;
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
        return ErrorCategories.TIMEOUT;
    }
    if (error.code === 'ENOENT' || error.code === 'EACCES') {
        return ErrorCategories.FILE_SYSTEM;
    }
    if (error.isAxiosError || error.response) {
        return ErrorCategories.EXTERNAL_API;
    }
    return ErrorCategories.INTERNAL;
}

/**
 * Extract detailed error information
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @returns {Object} Error details
 */
function extractErrorDetails(error, req) {
    const category = categorizeError(error);

    const details = {
        category,
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
        statusCode: error.statusCode || error.status || 500,
        correlationId: req.correlationId,
        userId: req.user?.userId || req.user?.id,
        userName: req.user?.userName || req.user?.name || req.user?.email,
        method: req.method,
        path: req.path,
        query: req.query,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString()
    };

    // Add Axios-specific error details
    if (error.isAxiosError) {
        details.externalApi = {
            url: error.config?.url,
            method: error.config?.method,
            responseStatus: error.response?.status,
            responseData: error.response?.data
        };
    }

    // Add database-specific error details
    if (category === ErrorCategories.DATABASE) {
        details.database = {
            query: error.sql,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage
        };
    }

    return details;
}

/**
 * Global error handler middleware
 * Should be the last middleware in the chain
 */
function errorLogger(err, req, res, next) {
    const errorDetails = extractErrorDetails(err, req);

    // Log critical errors (5xx) differently
    if (errorDetails.statusCode >= 500) {
        logCritical('Server error occurred', err);
    } else {
        logError('Request error occurred', errorDetails);
    }

    // Send error response
    const response = {
        error: {
            message: process.env.NODE_ENV === 'production'
                ? getPublicErrorMessage(errorDetails.category, errorDetails.statusCode)
                : err.message,
            correlationId: req.correlationId,
            timestamp: errorDetails.timestamp
        }
    };

    // Include more details in development
    if (process.env.NODE_ENV !== 'production') {
        response.error.category = errorDetails.category;
        response.error.stack = err.stack;
    }

    res.status(errorDetails.statusCode).json(response);
}

/**
 * Get user-friendly error message based on category
 * @param {string} category - Error category
 * @param {number} statusCode - HTTP status code
 * @returns {string} Public error message
 */
function getPublicErrorMessage(category, statusCode) {
    switch (category) {
        case ErrorCategories.VALIDATION:
            return 'Invalid request data provided.';
        case ErrorCategories.DATABASE:
            return 'Database operation failed. Please try again.';
        case ErrorCategories.EXTERNAL_API:
            return 'External service is temporarily unavailable.';
        case ErrorCategories.AUTHENTICATION:
            return 'Authentication failed. Please login again.';
        case ErrorCategories.AUTHORIZATION:
            return 'You do not have permission to perform this action.';
        case ErrorCategories.NOT_FOUND:
            return 'The requested resource was not found.';
        case ErrorCategories.TIMEOUT:
            return 'Request timed out. Please try again.';
        case ErrorCategories.FILE_SYSTEM:
            return 'File operation failed.';
        default:
            return 'An unexpected error occurred. Please contact support.';
    }
}

/**
 * Async error wrapper for route handlers
 * Catches errors in async functions and passes to error handler
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function
 */
function asyncErrorHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Custom error class for application errors
 */
class AppError extends Error {
    constructor(message, statusCode = 500, category = ErrorCategories.INTERNAL) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.category = category;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = {
    errorLogger,
    asyncErrorHandler,
    AppError,
    ErrorCategories
};