// server/jobs/shared/csv-helper.js

const { fs } = require('../../utils.js');

/**
 * Parses CSV file manually for deploy jobs (expects only ArtifactID column)
 * @param {string} filePath - Path to CSV file
 * @param {Object} logger - Winston logger instance
 * @returns {Array<Object>} Array of parsed row objects
 */
function parseDeploy_UndeployCSVFile(filePath, logger) {
    logger.info('Reading CSV file as text...');
    const csvContent = fs.readFileSync(filePath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim().length > 0);

    logger.info(`CSV has ${lines.length} lines (including header)`);

    // Skip header line and parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Split by comma and trim each part (in case there are multiple columns)
        const parts = line.split(',').map(p => p.trim());

        // We only need the first column (ArtifactID)
        if (parts[0]) {
            rows.push({
                artifactId: parts[0],
                version: parts[1] || 'active'  // Optional version column, defaults to 'active'
            });
        }
    }

    logger.info(`CSV Parsed manually. ${rows.length} rows to process.`);
    return rows;
}

/**
 * Parses CSV file for upload job (with parameter data)
 * @param {string} filePath - Path to CSV file
 * @param {Object} logger - Winston logger instance
 * @returns {Array<Object>} Array of parsed row objects
 */
function parseUploadCSV(filePath, logger) {
    logger.info('Reading CSV file as text...');
    const csvContent = fs.readFileSync(filePath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim().length > 0);

    logger.info(`CSV has ${lines.length} lines (including header)`);

    // Parse header to get column indices
    const headerLine = lines[0].trim();
    const headers = headerLine.split(',').map(h => h.trim());

    // Skip header line and parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Split by comma
        const parts = line.split(',').map(p => p.trim());

        const row = {};
        headers.forEach((header, index) => {
            row[header] = parts[index] || '';
        });

        rows.push(row);
    }

    logger.info(`CSV Parsed manually. ${rows.length} rows to process.`);
    return rows;
}

module.exports = {
    parseDeploy_UndeployCSVFile,
    parseUploadCSV
};
