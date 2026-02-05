// server/db-hana.js
const xsenv = require('@sap/xsenv');
const hdbext = require('@sap/hdbext');

let hanaClient = null;

// Initialize HANA connection using bound service
async function initializeHanaConnection() {
    try {
        // Get HANA credentials from environment
        const hanaOptions = xsenv.getServices({
            hana: { tag: 'hana' }
        });

        if (!hanaOptions.hana) {
            throw new Error('HANA service not found in environment');
        }

        return new Promise((resolve, reject) => {
            hdbext.createConnection(hanaOptions.hana, (err, client) => {
                if (err) {
                    console.error('Failed to connect to HANA:', err);
                    reject(err);
                } else {
                    hanaClient = client;
                    console.log('✅ Successfully connected to SAP HANA');
                    resolve(client);
                }
            });
        });
    } catch (error) {
        console.error('Error initializing HANA connection:', error);
        throw error;
    }
}

// Get the HANA client
function getHanaClient() {
    if (!hanaClient) {
        throw new Error('HANA client not initialized. Call initializeHanaConnection first.');
    }
    return hanaClient;
}

// Execute a query with parameters
function executeQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        const client = getHanaClient();
        client.exec(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Execute a prepared statement
function executePrepared(sql, params = []) {
    return new Promise((resolve, reject) => {
        const client = getHanaClient();
        client.prepare(sql, (err, statement) => {
            if (err) {
                reject(err);
                return;
            }

            statement.exec(params, (execErr, rows) => {
                if (execErr) {
                    reject(execErr);
                } else {
                    resolve(rows);
                }
            });
        });
    });
}

// Insert and return the generated ID
async function insertAndReturnId(tableName, data) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map(() => '?').join(', ');

    const sql = `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

    await executePrepared(sql, values);

    // Get the last inserted ID
    const result = await executeQuery(`SELECT CURRENT_IDENTITY_VALUE() AS "ID" FROM DUMMY`);
    return result[0].ID;
}

// Update records
async function updateRecords(tableName, data, whereClause, whereParams = []) {
    const updates = Object.keys(data)
        .map(key => `"${key}" = ?`)
        .join(', ');

    const sql = `UPDATE "${tableName}" SET ${updates} WHERE ${whereClause}`;
    const params = [...Object.values(data), ...whereParams];

    return executePrepared(sql, params);
}

// Select records
async function selectRecords(tableName, whereClause = '', params = [], columns = '*') {
    const columnsStr = Array.isArray(columns)
        ? columns.map(c => `"${c}"`).join(', ')
        : columns;

    let sql = `SELECT ${columnsStr} FROM "${tableName}"`;
    if (whereClause) {
        sql += ` WHERE ${whereClause}`;
    }

    return executeQuery(sql, params);
}

// Delete records
async function deleteRecords(tableName, whereClause, params = []) {
    const sql = `DELETE FROM "${tableName}" WHERE ${whereClause}`;
    return executePrepared(sql, params);
}

// Close the connection
function closeConnection() {
    if (hanaClient) {
        hanaClient.disconnect();
        hanaClient = null;
        console.log('HANA connection closed');
    }
}

module.exports = {
    initializeHanaConnection,
    getHanaClient,
    executeQuery,
    executePrepared,
    insertAndReturnId,
    updateRecords,
    selectRecords,
    deleteRecords,
    closeConnection
};
