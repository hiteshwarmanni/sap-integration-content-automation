// server/server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { knex, setupDatabase } = require('./db.js');
const path = require('path');
const fs = require('fs');
const winston = require('winston');

// --- Winston Logger Setup ---
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Logger format
const loggerFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
);

// Timestamp Helper Function
function getFormattedTimestamp(date) {
  const pad = (num) => (num < 10 ? '0' : '') + num;
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}


const app = express();
const PORT = 3001;
app.use(cors());
app.use(express.json());

// CSV Helper
function escapeCSV(cell) {
  if (cell === null || typeof cell === 'undefined') return "";
  let str = String(cell);
  if (str.includes(',') || str.includes('\"') || str.includes('\n')) {
    str = str.replace(/\"/g, '\"\"');
    return `"${str}"`;
  }
  return str;
}

// --- Database Logging Endpoint (Updated) ---
app.post('/api/log', async (req, res) => {
  try {
    const { projectName, environment, userName, activityType, logFile, executionTimestamp } = req.body;
    
    if (!projectName || !environment || !activityType) {
      return res.status(400).json({ error: 'Missing required log fields' });
    }

    await knex('logs').insert({
      projectName,
      environment,
      userName: userName || 'N/A',
      activityType,
      logFile: logFile || null,
      
      // --- THIS IS THE FIX ---
      // Use the provided string timestamp, or generate a new one
      timestamp: executionTimestamp ? executionTimestamp : getFormattedTimestamp(new Date()).replace('_', ' ')
    });
    
    console.log('✅ DB log created:', { projectName, activityType, logFile });
    res.status(201).json({ message: 'Log created' });

  } catch (error)
 {
    console.error('DB Log Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Main Download Logic Endpoint (Updated) ---
app.post('/api/v1/run-download', async (req, res) => {

  // 1. Generate ONE timestamp
  const executionTimestamp = new Date();
  
  // --- 👇 Use it to create the formatted string ---
  const formattedTimestamp = getFormattedTimestamp(executionTimestamp);
  const logFileName = `run_${formattedTimestamp}.log`;
  const logFilePath = path.join(logsDir, logFileName);
  
  // Create a new logger instance
  const logger = winston.createLogger({
    level: 'info',
    format: loggerFormat,
    transports: [
      new winston.transports.Console({ format: winston.format.simple() }),
      new winston.transports.File({ filename: logFilePath })
    ]
  });

  logger.info('Download request received...');
  
  const {
    projectName, environment, userName,
    cpiBaseUrl, tokenUrl, clientId, clientSecret
  } = req.body;

  // 3. Use it in the DB log call
  try {
    axios.post(`http://localhost:${PORT}/api/log`, {
      projectName,
      environment,
      userName,
      activityType: 'Download',
      logFile: `logs/${logFileName}`,
      // --- THIS IS THE FIX ---
      // Pass the formatted string (with a space) to the DB
      executionTimestamp: formattedTimestamp.replace('_', ' ') 
    });
  } catch (logError) {
    logger.error('Failed to create initial DB log:', logError.message);
  }

  // Simple validation
  if (!cpiBaseUrl || !tokenUrl || !clientId || !clientSecret) {
    logger.error('Validation failed: Missing required API credentials');
    logger.end();
    return res.status(400).json({ error: 'Missing required API credentials' });
  }

  let accessToken = '';

  try {
    // --- Step 1: Get Auth Token ---
    logger.info('Step 1: Getting Auth Token...');
    const tokenAuth = { username: clientId, password: clientSecret };
    const tokenBody = new URLSearchParams();
    tokenBody.append('grant_type', 'client_credentials');

    const tokenResponse = await axios.post(tokenUrl, tokenBody, {
      auth: tokenAuth,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    accessToken = tokenResponse.data.access_token;
    logger.info('Token acquired.');

    // --- Step 2: Get All Integration Packages ---
    logger.info('Step 2: Getting Integration Packages...');
    const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
    const packagesUrl = `${cpiBaseUrl}/IntegrationPackages`;
    
    const packagesResponse = await axios.get(packagesUrl, { headers: authHeader });
    const packages = packagesResponse.data.d.results;
    logger.info(`Found ${packages.length} packages.`);

    // --- Step 3 & 4: Loop Packages and iFlows ---
    logger.info('Step 3 & 4: Looping packages and iFlows...');
    const allConfigData = [];
    const version = 'active';

    for (const [index, pkg] of packages.entries()) {
      logger.info(`--- Processing Package ${index + 1}/${packages.length}: ${pkg.Name} ---`);
      const iFlowsUrl = `${cpiBaseUrl}/IntegrationPackages('${pkg.Id}')/IntegrationDesigntimeArtifacts`;
      let iFlows = [];
      
      try {
        const iFlowsResponse = await axios.get(iFlowsUrl, { headers: authHeader });
        iFlows = iFlowsResponse.data.d.results;
      } catch (pkgError) {
        logger.error(`Error getting iFlows for package ${pkg.Name}: ${pkgError.message}`);
        continue;
      }

      if (iFlows.length === 0) {
        logger.warn(`No iFlows found for package: ${pkg.Name}`);
        allConfigData.push({
          PackageName: pkg.Name, PackageID: pkg.Id, IflowName: '', IflowID: '',
          ParameterKey: '', ParameterValue: '', DataType: ''
        });
        continue;
      }
      
      logger.info(`Found ${iFlows.length} iFlows for package: ${pkg.Name}`);

      for (const iflow of iFlows) {
        const configsUrl = `${cpiBaseUrl}/IntegrationDesigntimeArtifacts(Id='${iflow.Id}',Version='${version}')/Configurations`;
        let configurations = [];

        try {
          const configResponse = await axios.get(configsUrl, { headers: authHeader });
          configurations = configResponse.data.d.results;
        } catch (iflowError) {
          logger.error(`Error getting configs for iFlow ${iflow.Name}: ${iflowError.message}`);
          allConfigData.push({
            PackageName: pkg.Name, PackageID: pkg.Id, IflowName: iflow.Name, IflowID: iflow.Id,
            ParameterKey: 'ERROR', ParameterValue: iflowError.message, DataType: ''
          });
          continue;
        }
        
        const baseRow = {
          PackageName: pkg.Name, PackageID: pkg.Id, IflowName: iflow.Name, IflowID: iflow.Id
        };

        if (configurations.length === 0) {
          allConfigData.push({ ...baseRow, ParameterKey: '', ParameterValue: '', DataType: '' });
        } else {
          configurations.forEach(config => {
            allConfigData.push({
              ...baseRow,
              ParameterKey: config.ParameterKey,
              ParameterValue: config.ParameterValue,
              DataType: config.DataType
            });
          });
        }
      }
    }
    logger.info('All data fetched. Generating CSV.');

    // --- Step 5: Convert to CSV ---
    const headers = ["PackageName", "PackageID", "IflowName", "IflowID", "ParameterKey", "ParameterValue", "DataType"];
    const csvHeader = headers.join(',') + '\n';
    const csvRows = allConfigData.map(row => 
      headers.map(header => escapeCSV(row[header])).join(',')
    ).join('\n');
    
    const csvContent = csvHeader + csvRows;

    // --- Step 6: Send File as Response ---
    logger.info('Sending CSV file to client.');
    logger.end();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="configurations.csv"');
    res.status(200).send(csvContent);

  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    logger.error(`FATAL DOWNLOAD ERROR: ${errorMsg}`, error);

    logger.end();
    if (error.response) {
      res.status(500).json({
        error: `API Error: ${error.response.data.error?.message || 'Failed to call SAP API'}`,
        status: error.response.status
      });
    } else if (error.request) {
      res.status(500).json({ error: 'No response from SAP API. Check URL and connectivity.' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// --- Start the server ---
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  setupDatabase();
});