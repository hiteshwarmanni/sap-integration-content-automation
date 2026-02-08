# Logging Optimization Summary

## Overview
The logging system has been optimized to reduce noise while maintaining critical debugging capabilities.

## Optimization Strategy

### 1. **Removed Verbose Database Logs**
**Before:** Logged every table creation and column addition (20+ log entries on startup)
```javascript
logInfo("Creating 'logs' table");
// ... create table ...
logInfo("'logs' table created successfully");
logInfo("Adding 'status' column to 'logs' table");
// ... add column ...
logInfo("'status' column added successfully");
```

**After:** Single log per table initialization only when needed
```javascript
logInfo("Database initialized", { table: 'logs' });
```

**Impact:** Reduced database initialization logs from 20+ to 4 entries

---

### 2. **Streamlined Route Logging**
**Before:** Logged every successful request
```javascript
logInfo('Upload job created', { jobId, userName, projectName, ... });
logApiRequest(req, 'success', { jobId, userName });
```

**After:** Only log errors, keep error logging
```javascript
// Success: No log (reduces noise)
// Error: logError('Failed to start upload job', error);
```

**Impact:** 
- Reduced successful request logs by 100%
- Error logs retained for debugging

---

### 3. **Optimized Request Middleware**
**Before:** Logged ALL requests and responses
```javascript
logInfo('Incoming request', { method, path, query, ... });
// ... process ...
logInfo('Request completed', { statusCode, duration, ... });
```

**After:** Only log errors and slow requests (>2s)
```javascript
// Normal requests: No log
// Errors (4xx/5xx): logError('Request failed', { ... })
// Slow requests (>2s): logWarning('Slow request detected', { ... })
```

**Impact:**
- Reduced normal request logging by 100%
- Performance issues now visible (>2s threshold)
- All errors still captured

---

### 4. **Removed Redundant Success Logs**
Removed from:
- ✅ Upload route success confirmations
- ✅ Download route success confirmations
- ✅ Deploy route success confirmations
- ✅ Log retrieval success confirmations
- ✅ File download success confirmations

**Kept:**
- ❌ All error logs (critical for debugging)
- ❌ Validation error logs
- ❌ Database error logs
- ❌ Authentication failure logs

---

## What's Still Logged

### ✅ **Always Logged (Critical):**
1. **Server Lifecycle**
   - Server startup
   - Server shutdown
   - Database connection status
   - Critical errors (uncaught exceptions)

2. **Errors**
   - Failed requests (4xx/5xx status codes)
   - Database query failures
   - Authentication/authorization failures
   - File operation errors
   - External API failures
   - Job execution failures

3. **Performance Issues**
   - Slow requests (>2 seconds)
   - Slow operations (timeouts)

4. **Security Events**
   - Authentication failures
   - Authorization denials
   - Invalid credentials
   - Token validation errors

### ❌ **Not Logged (Noise Reduction):**
1. Successful API requests (200, 201, 202 status codes)
2. Normal database operations (SELECT, INSERT when successful)
3. File downloads/uploads when successful
4. Database schema migrations (unless errors)
5. Health check requests
6. Static file serving

---

## Logging Levels

### **Production (LOG_LEVEL=info)**
- ✅ Errors (error)
- ✅ Warnings (warn)
- ✅ Important events (info)
- ❌ Debug details (debug)

### **Development (LOG_LEVEL=debug)**
- ✅ Everything including debug logs

---

## Correlation IDs

**Retained:** Correlation IDs are still generated and attached to:
- All requests (in headers: `x-correlation-id`)
- All error logs
- All slow request logs
- Job executions

**Benefit:** Can trace issues across the entire system even with reduced logging

---

## Sensitive Data Redaction

**Still Active:** All sensitive fields automatically redacted:
- passwords
- clientSecret
- tokens (access, refresh)
- authorization headers
- API keys
- credentials

---

## Configuration

```env
# .env or environment variables
LOG_LEVEL=info              # error, warn, info, debug
LOG_SANITIZE=true           # Auto-redact sensitive data
```

---

## Logging Locations Summary

### **Server Files:**
| File | Logs Count Before | Logs Count After | Reduction |
|------|-------------------|------------------|-----------|
| `db.js` | 24 | 4 | 83% ↓ |
| `upload.routes.js` | 8 | 3 | 62% ↓ |
| `download.routes.js` | 8 | 3 | 62% ↓ |
| `deploy.routes.js` | 8 | 3 | 62% ↓ |
| `logs.routes.js` | 8 | 3 | 62% ↓ |
| `request-logger.js` | All requests | Errors + Slow only | 95% ↓ |

**Total Reduction:** ~80% fewer log entries in normal operations

---

## When to Add More Logging

Add logging when:
1. **Debugging complex flows** - Temporarily increase LOG_LEVEL to debug
2. **Investigating issues** - Add specific debug logs where needed
3. **Monitoring specific operations** - Add metric logs for business KPIs
4. **Compliance requirements** - Add audit logs for regulatory needs

---

## Benefits of Optimization

### ✅ **Pros:**
1. **Reduced Log Volume**
   - 80% fewer logs in normal operations
   - Lower storage costs
   - Faster log queries
   - Better performance

2. **Better Signal-to-Noise Ratio**
   - Errors stand out
   - Performance issues visible
   - Critical events not buried

3. **Easier Debugging**
   - Less clutter to search through
   - Focus on actual problems
   - Correlation IDs still link everything

4. **Cost Savings**
   - Lower cloud logging costs
   - Reduced storage requirements
   - Less bandwidth usage

### ⚠️ **Trade-offs:**
1. Less detailed audit trail for successful operations
2. Need to rely on metrics/monitoring for normal operations
3. May need to temporarily increase logging for specific debugging

---

## Monitoring Recommendations

Since we reduced logging, consider adding:
1. **Metrics Dashboard** - Track request counts, response times
2. **Alerts** - Monitor error rates, slow requests
3. **Health Checks** - Regular automated health checks
4. **APM Tool** - Application Performance Monitoring (Dynatrace, New Relic)

---

## Quick Reference

### **To Debug an Issue:**
1. Check error logs (automatically captured)
2. Use correlation ID to trace request
3. Temporarily set `LOG_LEVEL=debug` if needed
4. Review slow request warnings

### **To Monitor Performance:**
1. Watch for "Slow request detected" warnings
2. Check response times in slow request logs
3. Monitor error rate trends

### **To Audit Activity:**
1. Errors are logged with full context
2. Authentication failures are logged
3. Use correlation IDs to link operations
4. Job executions tracked in database


# Logging Standardization Guide

## Overview

This application uses a standardized logging approach with structured logging, correlation IDs, and automatic sensitive data redaction.

## Architecture

### Components

1. **Cloud Logger** (`server/cloud-logger.js`)
   - Core logging functionality
   - SAP Cloud Logging integration
   - Automatic sensitive data sanitization
   - Correlation ID management
   - Performance timing utilities

2. **Request Logger Middleware** (`server/middleware/request-logger.js`)
   - Logs all incoming HTTP requests
   - Tracks response times
   - Adds correlation IDs to requests/responses
   - Sanitizes request bodies

3. **Error Logger Middleware** (`server/middleware/error-logger.js`)
   - Catches and logs all errors
   - Categorizes errors (validation, database, API, etc.)
   - Provides user-friendly error messages in production
   - Includes full stack traces in development

4. **Job Logger Helper** (`server/jobs/shared/logger-helper.js`)
   - Creates Winston loggers for job execution
   - Integrates with cloud logger
   - Provides correlation ID context for jobs

## Features

### 1. Structured Logging

All logs include structured metadata:

```javascript
logInfo('Upload job started', {
    jobId: 123,
    userName: 'john.doe@example.com',
    projectName: 'MyProject',
    environment: 'Production',
    fileName: 'artifacts.csv'
});
```

Output:
```json
{
    "timestamp": "2026-02-08T13:00:00.000Z",
    "level": "info",
    "message": "Upload job started",
    "jobId": 123,
    "userName": "john.doe@example.com",
    "projectName": "MyProject",
    "environment": "Production",
    "fileName": "artifacts.csv"
}
```

### 2. Correlation IDs

Every API request gets a unique correlation ID that tracks the request through the entire system:

- Automatically generated for each request
- Can be provided via `x-correlation-id` header
- Included in all related logs
- Returned in response headers
- Propagated to external API calls

**Benefits:**
- Trace a single request across multiple services
- Debug issues in production
- Link related log entries

### 3. Sensitive Data Redaction

The logging system automatically redacts sensitive fields:

- `password`
- `clientSecret`
- `token`
- `accessToken`
- `refreshToken`
- `authorization`
- `cookie`
- `apiKey`
- `secret`
- `credentials`

**Example:**
```javascript
logInfo('User authentication', {
    username: 'john.doe',
    password: 'secret123',  // Will be redacted
    clientSecret: 'xyz789'  // Will be redacted
});
```

Output:
```json
{
    "username": "john.doe",
    "password": "***REDACTED***",
    "clientSecret": "***REDACTED***"
}
```

### 4. Performance Tracking

Track operation duration:

```javascript
// Start timer
timeStart('database_query', correlationId);

// ... perform operation ...

// End timer and log duration
timeEnd('database_query', correlationId, { 
    rows: 100 
});
```

Output:
```json
{
    "message": "Operation completed: database_query",
    "duration": "342ms",
    "correlationId": "abc-123-xyz",
    "rows": 100
}
```

### 5. Context-Aware Logging

Create a logger with pre-bound context:

```javascript
const logger = withContext({
    correlationId: 'abc-123',
    userId: 'john.doe@example.com',
    jobId: 456
});

// All logs will automatically include the context
logger.info('Processing started');
logger.error('Processing failed', error);
```

## Usage

### Logging Levels

```javascript
const { logInfo, logWarning, logError, logDebug, logCritical } = require('./cloud-logger');

// Informational messages
logInfo('Server started', { port: 3001 });

// Warnings (non-fatal issues)
logWarning('Rate limit approaching', { currentRate: 95 });

// Errors (handled exceptions)
logError('Failed to process upload', error);

// Debug (development only)
logDebug('Variable state', { variable: value });

// Critical (system failures)
logCritical('Database connection lost', error);
```

### Logging in Routes

Routes automatically get correlation IDs from the request logger middleware:

```javascript
router.post('/upload', authenticate, async (req, res) => {
    try {
        logInfo('Upload started', {
            correlationId: req.correlationId,
            userId: req.user?.userId,
            fileName: req.file.originalname
        });
        
        // ... process upload ...
        
        res.json({ success: true });
    } catch (error) {
        logError('Upload failed', {
            correlationId: req.correlationId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: 'Upload failed' });
    }
});
```

### Logging in Jobs

Jobs use the logger helper to create context-aware loggers:

```javascript
const { createJobLogger } = require('./shared/logger-helper');

async function runUploadJob(jobId) {
    const executionTimestamp = new Date();
    const { logger, cloudLogger, correlationId } = createJobLogger(
        executionTimestamp, 
        'upload',
        jobId
    );
    
    // Log to Winston (file + console)
    logger.info('Job started');
    
    // Log to cloud logging with context
    cloudLogger.info('Processing artifacts', { count: 100 });
    
    // Track performance
    cloudLogger.timeStart('artifact_processing');
    // ... process artifacts ...
    cloudLogger.timeEnd('artifact_processing', { processed: 100 });
}
```

## Configuration

### Environment Variables

```env
# Log Level
# Options: error, warn, info, debug, trace
# Default: info
LOG_LEVEL=info

# Log Format
# Options: json, text
# Default: json
LOG_FORMAT=json

# Sensitive Data Redaction
# Options: true, false
# Default: true
LOG_SANITIZE=true
```

### Development vs Production

**Development:**
- Logs output to console
- Full error details in responses
- Debug logs enabled
- Stack traces included

**Production:**
- Logs sent to SAP Cloud Logging
- User-friendly error messages
- Debug logs disabled
- Sensitive data redacted

## Best Practices

### DO:

✅ Include correlation IDs in all logs:
```javascript
logInfo('Operation completed', { correlationId: req.correlationId });
```

✅ Log at appropriate levels:
```javascript
logInfo('Normal operation');
logWarning('Potential issue');
logError('Handled error');
logCritical('System failure');
```

✅ Include context:
```javascript
logError('Database query failed', {
    query: 'SELECT * FROM users',
    error: error.message,
    duration: '5000ms'
});
```

✅ Use structured data:
```javascript
logInfo('User action', {
    action: 'upload',
    userId: 123,
    fileName: 'data.csv',
    size: 1024000
});
```

### DON'T:

❌ Use console.log directly:
```javascript
// BAD
console.log('Upload started');

// GOOD
logInfo('Upload started', { correlationId });
```

❌ Log sensitive data directly:
```javascript
// BAD
logInfo('Auth attempt', { password: password });

// GOOD (automatically redacted)
logInfo('Auth attempt', { username: username });
```

❌ Log without context:
```javascript
// BAD
logError('Failed');

// GOOD
logError('Upload failed', {
    correlationId,
    fileName,
    error: error.message
});
```

❌ Concatenate strings:
```javascript
// BAD
logInfo(`User ${userId} uploaded ${fileName}`);

// GOOD
logInfo('User uploaded file', { userId, fileName });
```

## Monitoring and Debugging

### Finding Logs by Correlation ID

In SAP Cloud Logging:
```
correlationId: "abc-123-xyz"
```

### Finding Logs by User

```
userId: "john.doe@example.com"
```

### Finding Errors

```
level: "error"
```

### Performance Analysis

```
duration: >1000ms
```

### Tracking a Job

```
jobId: 123
jobType: "upload"
```

## Troubleshooting

### Issue: Logs not appearing in Cloud Logging

**Check:**
1. Cloud Logging service is bound in `mta.yaml`
2. `initCloudLogging()` is called in `server.js`
3. Running in Cloud Foundry (not local)

### Issue: Sensitive data not being redacted

**Check:**
1. `LOG_SANITIZE=true` in environment
2. Field name matches sensitive patterns
3. Using cloud logger functions (not console.log)

### Issue: Correlation IDs missing

**Check:**
1. Request logger middleware is registered
2. Middleware order (should be early in chain)
3. Using `req.correlationId` in logs

## Examples

### Complete Request Flow

```javascript
// 1. Request arrives
// Request logger generates correlation ID: "abc-123"

// 2. Route handler
router.post('/upload', async (req, res) => {
    logInfo('Upload request received', {
        correlationId: req.correlationId,  // "abc-123"
        fileName: req.file.originalname
    });
    
    // 3. Start job
    const jobId = await startJob(req.correlationId);
    
    // 4. Job execution
    cloudLogger.info('Job started', {
        correlationId: req.correlationId,  // "abc-123"
        jobId: jobId
    });
    
    // 5. External API call
    await callExternalAPI({
        headers: {
            'x-correlation-id': req.correlationId  // "abc-123"
        }
    });
    
    // 6. Job complete
    cloudLogger.info('Job completed', {
        correlationId: req.correlationId,  // "abc-123"
        jobId: jobId,
        duration: '5000ms'
    });
    
    res.json({ jobId });
});
```

All these logs can be traced using correlation ID "abc-123".

## Migration from console.log

Replace all `console.log` statements:

```javascript
// OLD
console.log('Upload started');
console.error('Error:', error);

// NEW
logInfo('Upload started', { correlationId, jobId });
logError('Upload failed', { correlationId, error: error.message, stack: error.stack });
```

## Summary

- ✅ All logs are structured with metadata
- ✅ Correlation IDs track requests end-to-end
- ✅ Sensitive data is automatically redacted
- ✅ Performance metrics are tracked
- ✅ Error categorization for better debugging
- ✅ Cloud Logging integration for production
- ✅ Context-aware logging for jobs
- ✅ Development-friendly console output