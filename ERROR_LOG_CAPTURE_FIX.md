# Error Log Capture Fix for Transport Logs

## Issue Summary
Error logs were not being captured in the transport logs table when transport operations failed. This was due to multiple issues in the codebase.

## Root Causes Identified

### 1. **Scope Issue in transport-job.js**
The `error` variable was captured in the `catch` block but was out of scope in the `finally` block where the transport log was being inserted. This meant error details were always `undefined` when trying to save them to the database.

**Location:** `server/jobs/transport-job.js` lines 347-360

### 2. **Missing Database Columns**
The `transport_logs` table was missing the `logContent` and `resultContent` columns that were being referenced in the code. These columns had been previously dropped in a migration.

**Locations:**
- SQLite schema: `server/db.js` (migration logic)
- HANA schema: `db/src/TRANSPORT_LOGS.hdbtable`

### 3. **Incomplete Error Logging in Routes**
The `/transport-iflow` endpoint in `server/routes/transport.routes.js` was not capturing `logContent` and `resultContent` when errors occurred, even though it was capturing other error details.

**Location:** `server/routes/transport.routes.js` line 709

## Changes Made

### 1. Fixed Error Scope in transport-job.js
**File:** `server/jobs/transport-job.js`

- Added `capturedError` variable at the beginning of the try block (line 160)
- Changed the catch block to assign `error` to `capturedError` (line 325)
- Updated the finally block to reference `capturedError` instead of `error` (lines 398-403)

**Before:**
```javascript
let sourceIflowData = null;
let targetIflowData = null;

try {
    // ... code ...
} catch (error) {
    // ... error handling ...
    error.failedStep = failedStep;
    error.errorDetails = errorDetails;
} finally {
    // ... code ...
    if (finalStatus === 'Failed' && error) {  // ❌ error is out of scope
        transportLogData.errorMessage = error.message;
    }
}
```

**After:**
```javascript
let sourceIflowData = null;
let targetIflowData = null;
let capturedError = null;  // ✅ Capture error for finally block

try {
    // ... code ...
} catch (error) {
    capturedError = error;  // ✅ Capture error
    // ... error handling ...
    capturedError.failedStep = failedStep;
    capturedError.errorDetails = errorDetails;
} finally {
    // ... code ...
    if (finalStatus === 'Failed' && capturedError) {  // ✅ Use captured error
        transportLogData.errorMessage = capturedError.message;
    }
}
```

### 2. Added Missing Database Columns

#### SQLite Schema (server/db.js)
Changed the migration logic from dropping `logContent` and `resultContent` columns to adding them if they don't exist:

**Before:**
```javascript
// Drop logContent and resultContent columns if they exist
const logContentExists = await knex.schema.hasColumn('transport_logs', 'logContent');
if (logContentExists) {
    await knex.schema.alterTable('transport_logs', (table) => {
        table.dropColumn('logContent');
    });
}
```

**After:**
```javascript
// Add logContent and resultContent columns if they don't exist
const logContentExists = await knex.schema.hasColumn('transport_logs', 'logContent');
if (!logContentExists) {
    await knex.schema.alterTable('transport_logs', (table) => {
        table.text('logContent');
    });
}
```

#### HANA Schema (db/src/TRANSPORT_LOGS.hdbtable)
Added two new columns to the table definition:

```sql
"LOG_CONTENT" NCLOB,
"RESULT_CONTENT" NCLOB
```

### 3. Updated db-wrapper.js
**File:** `server/db-wrapper.js`

Added support for the new columns in the `insertTransportLog` method:

```javascript
async insertTransportLog(data) {
    const [result] = await knex('transport_logs').insert({
        // ... existing fields ...
        errorStackTrace: data.errorStackTrace || null,
        logContent: data.logContent || null,        // ✅ Added
        resultContent: data.resultContent || null   // ✅ Added
    }).returning('id');
    return result.id || result[0].id || result[0];
}
```

### 4. Enhanced Error Logging in transport.routes.js
**File:** `server/routes/transport.routes.js`

Added logic to build `logContent` and `resultContent` when errors occur:

**After (lines 750-763):**
```javascript
// Build the log content with error information
const logContent = `Transport failed at step: ${failedStep}\n\n` +
    `Error Message: ${errorMsg}\n\n` +
    `Error Details:\n${JSON.stringify(errorDetails, null, 2)}\n\n` +
    `Stack Trace:\n${error.stack || 'Not available'}`;

// Build the result content in CSV format for consistency
const resultContent = `${TRANSPORT_CSV_HEADERS}\n` +
    `"${req.body.sourcePackageId || ''}","${req.body.targetPackageId || ''}","${req.body.sourceIflowId || ''}","${req.body.targetIflowId || ''}","${httpStatus}","${errorMsg.replace(/"/g, '""')}"`;

const transportLogId = await db.insertTransportLog({
    // ... existing fields ...
    errorStackTrace: error.stack || null,
    logContent: logContent,        // ✅ Added
    resultContent: resultContent   // ✅ Added
});
```

## Testing the Fix

### Prerequisites
1. Restart the server to apply database migrations (the columns will be added automatically)
2. For HANA deployments, redeploy the database module

### Test Scenarios

#### Scenario 1: Transport Failure (Authentication Error)
1. Attempt a transport with invalid credentials
2. Check the `transport_logs` table
3. Verify that the record contains:
   - `errorMessage`: The authentication error
   - `errorDetails`: JSON with error context
   - `failedStep`: "Authentication"
   - `errorStackTrace`: Full stack trace
   - `logContent`: Formatted error information
   - `resultContent`: CSV format with error

#### Scenario 2: Transport Failure (Upload Error)
1. Attempt to upload to a locked iFlow
2. Check the `transport_logs` table
3. Verify that the record contains all error fields populated

#### Scenario 3: Successful Transport
1. Perform a successful transport
2. Check the `transport_logs` table
3. Verify that error fields are `NULL` but `logContent` and `resultContent` contain success information

## Verification Queries

### SQLite
```sql
-- Check if columns exist
PRAGMA table_info(transport_logs);

-- View recent failed transports with error details
SELECT 
    id,
    projectName,
    environment,
    timestamp,
    status,
    failedStep,
    errorMessage,
    SUBSTR(logContent, 1, 100) as logContent_preview
FROM transport_logs
WHERE status = 'Failed'
ORDER BY id DESC
LIMIT 10;
```

### HANA
```sql
-- Check if columns exist
SELECT COLUMN_NAME, DATA_TYPE_NAME 
FROM TABLE_COLUMNS 
WHERE SCHEMA_NAME = CURRENT_SCHEMA 
AND TABLE_NAME = 'TRANSPORT_LOGS';

-- View recent failed transports with error details
SELECT 
    ID,
    PROJECT_NAME,
    ENVIRONMENT,
    TIMESTAMP,
    STATUS,
    FAILED_STEP,
    ERROR_MESSAGE,
    SUBSTRING(LOG_CONTENT, 1, 100) as LOG_CONTENT_PREVIEW
FROM TRANSPORT_LOGS
WHERE STATUS = 'Failed'
ORDER BY ID DESC
LIMIT 10;
```

## Files Modified

1. ✅ `server/jobs/transport-job.js` - Fixed error scope issue
2. ✅ `server/routes/transport.routes.js` - Enhanced error logging
3. ✅ `server/db.js` - Added columns to SQLite schema
4. ✅ `db/src/TRANSPORT_LOGS.hdbtable` - Added columns to HANA schema
5. ✅ `server/db-wrapper.js` - Updated insert method to handle new columns

## Impact

- **Backward Compatible**: Existing logs remain intact
- **Database Migration**: Automatic for SQLite, requires redeployment for HANA
- **No Breaking Changes**: All existing functionality continues to work
- **Improved Debugging**: Error logs now capture complete context for troubleshooting

## Next Steps

1. Monitor the transport logs after the first few failed transports
2. Verify that error details are being captured correctly
3. Update any UI components that display transport logs to show the new error fields
4. Consider adding a log viewer UI for better error visualization

## Date
June 3, 2026