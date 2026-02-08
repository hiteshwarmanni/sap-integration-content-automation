// server/jobs/shared/logger-helper.js

const { path, fs, winston, loggerFormat, getFormattedTimestamp, logsDir, resultsDir } = require('../../utils.js');
const { withContext, generateCorrelationId } = require('../../cloud-logger');

/**
 * Creates a Winston logger instance for job execution with correlation ID
 * @param {Date} executionTimestamp - Timestamp of job execution
 * @param {string} jobType - Type of job (download, upload, deploy, undeploy)
 * @param {number} jobId - Job ID for context
 * @returns {Object} Object containing logger, logFilePath, correlationId, and cloudLogger
 */
function createJobLogger(executionTimestamp, jobType, jobId = null) {
    const formattedTimestamp = getFormattedTimestamp(executionTimestamp);
    const logFileName = `run_${jobType}_${formattedTimestamp}.log`;
    const logFilePath = path.join(logsDir, logFileName);
    const correlationId = generateCorrelationId();

    // Create Winston logger for file logging
    const logger = winston.createLogger({
        level: 'info',
        format: loggerFormat,
        transports: [
            new winston.transports.Console({ format: winston.format.simple() }),
            new winston.transports.File({ filename: logFilePath })
        ]
    });

    // Create cloud logger with context
    const cloudLogger = withContext({
        correlationId,
        jobType,
        jobId,
        timestamp: formattedTimestamp
    });

    return { logger, logFilePath, formattedTimestamp, correlationId, cloudLogger };
}

/**
 * Creates a write stream for results CSV file
 * @param {Date} executionTimestamp - Timestamp of job execution
 * @param {Array<string>} headers - CSV header columns
 * @param {string} filePrefix - Prefix for the results file name
 * @returns {Object} Object containing resultsStream and resultsFilePath
 */
function createResultsStream(executionTimestamp, headers, filePrefix) {
    const formattedTimestamp = getFormattedTimestamp(executionTimestamp);
    const resultsFileName = `${filePrefix}_${formattedTimestamp}.csv`;
    const resultsFilePath = path.join(resultsDir, resultsFileName);

    const resultsStream = fs.createWriteStream(resultsFilePath);
    resultsStream.write(headers.join(',') + '\n');

    return { resultsStream, resultsFilePath };
}

/**
 * Closes logger and waits for it to flush
 * @param {Object} logger - Winston logger instance
 * @returns {Promise<void>}
 */
function closeLogger(logger) {
    return new Promise((resolve) => {
        logger.on('finish', resolve);
        logger.end();
    });
}

/**
 * Closes stream and waits for completion
 * @param {Object} stream - Write stream instance
 * @returns {Promise<void>}
 */
function closeStream(stream) {
    return new Promise((resolve) => {
        stream.end(resolve);
    });
}

module.exports = {
    createJobLogger,
    createResultsStream,
    closeLogger,
    closeStream
};
