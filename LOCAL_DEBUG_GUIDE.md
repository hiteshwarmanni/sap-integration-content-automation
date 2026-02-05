# Local Development Debug Guide

## Running the Application in Debug Mode

### Option 1: Using VS Code Debugger (Recommended)

#### Step 1: Create Launch Configuration

Create `.vscode/launch.json` file:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/server/server.js",
      "cwd": "${workspaceFolder}/server",
      "console": "integratedTerminal",
      "env": {
        "NODE_ENV": "development"
      }
    },
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to Running Server",
      "port": 9229,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

#### Step 2: Start Debugging

1. **Open VS Code**
2. **Set Breakpoints:**
   - Click in the left margin of any line in `server/jobs.js`, `server/routes.js`, etc.
   - Red dots will appear where execution will pause

3. **Start Debug Mode:**
   - Press `F5` or
   - Go to Run → Start Debugging
   - Or click the Debug icon in the sidebar and click "Debug Server"

4. **In Another Terminal, Start the React Client:**
   ```bash
   cd client
   npm run dev
   ```

5. **Access the Application:**
   - Open browser: `http://localhost:5173`
   - Perform actions (download, upload)
   - Debugger will pause at breakpoints

#### Debug Controls:
- **F5** - Continue execution
- **F10** - Step over (next line)
- **F11** - Step into (enter function)
- **Shift+F11** - Step out (exit function)
- **Shift+F5** - Stop debugging

### Option 2: Using Node.js Built-in Debugger

#### Terminal 1 - Start Server with Debugging:
```bash
cd server
node --inspect server.js
```

Or with automatic breakpoint at start:
```bash
cd server
node --inspect-brk server.js
```

#### Terminal 2 - Start React Client:
```bash
cd client
npm run dev
```

#### Connect Chrome DevTools:
1. Open Chrome browser
2. Go to: `chrome://inspect`
3. Click "Open dedicated DevTools for Node"
4. Set breakpoints in the Sources tab
5. Perform actions in your app

### Option 3: Using Console Logging (Quick Debug)

Add console.log statements in your code:

```javascript
// In server/jobs.js
console.log('📊 Packages Response:', JSON.stringify(packagesResponse.data, null, 2));
console.log('📦 All Packages:', allPackages);
console.log('🔍 Packages to Process:', packagesToProcess);
```

Then run normally:
```bash
cd server
node server.js
```

Watch the console output for detailed information.

### Option 4: Using Winston Logger in Debug Mode

The application already has Winston logging. Increase verbosity:

In `server/jobs.js`, change logger level:
```javascript
const logger = winston.createLogger({
  level: 'debug',  // Changed from 'info' to 'debug'
  format: loggerFormat,
  transports: [
    new winston.transports.Console({ 
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: logFilePath })
  ]
});
```

Then add debug logs:
```javascript
logger.debug('Raw API Response:', packagesResponse.data);
logger.debug('Parsed Packages:', allPackages);
```

## Common Debugging Scenarios

### Scenario 1: Debug Download Job

**Set breakpoints in `server/jobs.js`:**
- Line ~70: Before getting auth token
- Line ~77: After getting packages response
- Line ~90: Before filtering packages
- Line ~110: Inside package processing loop

**Steps:**
1. Start debugger (F5)
2. Submit download form in browser
3. Watch variables in VS Code Debug panel
4. Step through code line by line

### Scenario 2: Debug API Calls

**Set breakpoints in `server/routes.js`:**
- Line where `/api/v1/start-download-job` endpoint is defined
- Inside the route handler

**Inspect:**
- Request body (`req.body`)
- Form data being sent
- Job creation response

### Scenario 3: Debug Database Operations

**Set breakpoints in `server/db-wrapper.js` or `server/db.js`:**
- Database query functions
- Insert/update operations

**Check:**
- SQL queries being executed
- Data being inserted
- Query results

## Useful VS Code Debug Features

### 1. Watch Expressions
In Debug panel, add watch expressions:
```javascript
packagesResponse.data
allPackages.length
progress
jobStatus
```

### 2. Debug Console
Use the Debug Console to evaluate expressions:
```javascript
// Type these while paused at breakpoint
packagesResponse.data.d
allPackages[0]
typeof packagesResponse.data
```

### 3. Logpoints
Right-click line number → Add Logpoint
```
Packages fetched: {allPackages.length}
```
Logs messages without stopping execution

### 4. Conditional Breakpoints
Right-click breakpoint → Edit Breakpoint → Add condition
```javascript
progress > 10
pkg.Name === 'MyPackage'
error !== null
```

## Environment Setup for Local Debugging

### Current Setup:
- **Backend:** `http://localhost:3001` (server/server.js)
- **Frontend:** `http://localhost:5173` (React dev server)
- **Database:** SQLite (`logs.db`)

### Environment Variables (if needed):
Create `server/.env` file:
```
NODE_ENV=development
PORT=3001
DEBUG=true
LOG_LEVEL=debug
```

## Debugging Specific Issues

### Issue: "Cannot read properties of undefined (reading 'results')"

**Debug Steps:**
1. Set breakpoint at line ~73 in `server/jobs.js`
2. Inspect `packagesResponse.data` structure
3. Check if response is:
   - OData format: `{d: {results: [...]}}`
   - Direct array: `[...]`
   - Error response: `{error: {...}}`

**Quick Fix:**
Add this before line 77:
```javascript
console.log('🔍 Raw Response:', JSON.stringify(packagesResponse.data, null, 2));
```

### Issue: Database Schema Errors

**Debug Steps:**
1. Delete old database: `rm server/logs.db` (or delete via File Explorer)
2. Restart server - it will create new schema
3. Check tables:
   ```bash
   sqlite3 server/logs.db ".schema logs"
   ```

### Issue: Authentication Errors

**Debug Steps:**
1. Set breakpoint at token acquisition (line ~60)
2. Verify credentials are correct
3. Check token response structure
4. Verify token is being used in subsequent calls

## Testing the Fixed Code Locally

### Step-by-Step Test:

1. **Start Backend in Debug Mode:**
   ```bash
   # Option A: VS Code (F5)
   # Option B: Terminal
   cd server
   node --inspect server.js
   ```

2. **Start Frontend:**
   ```bash
   cd client
   npm run dev
   ```

3. **Open Browser:**
   - Go to `http://localhost:5173`
   - Open DevTools (F12)
   - Go to Network tab

4. **Test Download:**
   - Fill in the download form
   - Submit
   - Watch both:
     - VS Code debugger (if using)
     - Browser DevTools Network tab
     - Terminal console output

5. **Verify:**
   - Job starts successfully
   - Progress updates appear
   - No crashes occur
   - CSV file downloads

## Viewing Database Contents

### Using SQLite CLI:
```bash
# Open database
sqlite3 server/logs.db

# View tables
.tables

# View logs
SELECT * FROM logs;

# View download jobs
SELECT * FROM download_jobs;

# Exit
.quit
```

### Using VS Code Extension:
1. Install "SQLite Viewer" extension
2. Right-click `logs.db` → Open Database
3. Browse tables and data

## Log File Locations

When running locally, logs are stored in:
- **Execution Logs:** `server/logs/run_download_*.log`
- **Result Files:** `server/results/*.csv`

You can open these files to see detailed execution logs.

## Quick Debug Commands

```bash
# Check if server is running
curl http://localhost:3001/health

# Check specific endpoint
curl http://localhost:3001/api/logs

# Test with verbose output
node --inspect --trace-warnings server/server.js

# Check database
sqlite3 logs.db "SELECT * FROM logs ORDER BY id DESC LIMIT 5;"
```

## Troubleshooting Tips

1. **If server won't start:**
   - Check if port 3001 is already in use
   - Check for syntax errors: `node --check server/server.js`
   - Check dependencies: `npm list` in server directory

2. **If frontend can't connect:**
   - Verify server is running: `curl http://localhost:3001/health`
   - Check browser console for CORS errors
   - Verify API_URL in `client/src/config.js`

3. **If database errors occur:**
   - Backup logs.db
   - Delete logs.db
   - Restart server (will recreate with correct schema)

4. **If breakpoints don't hit:**
   - Make sure you started in debug mode
   - Verify the file hasn't been ignored
   - Check that source maps are enabled

## Best Practices for Debugging

1. **Start with console.log** - Quick and easy
2. **Use breakpoints** - When you need to pause and inspect
3. **Check network tab** - For API call issues
4. **Read log files** - For historical execution details
5. **Use debug console** - To evaluate expressions while paused

## Summary

To run locally in debug mode right now:

```bash
# Terminal 1 (Backend with debugger)
cd server
node --inspect server.js

# Terminal 2 (Frontend)
cd client
npm run dev

# Then open: http://localhost:5173
# And connect debugger: chrome://inspect (in Chrome)
```

Or use VS Code's built-in debugger (F5) for the easiest experience!
