// server/server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios'); // We need axios
const { knex, setupDatabase } = require('./db.js');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// --- Helper function to escape CSV cells ---
function escapeCSV(cell) {
  if (cell === null || typeof cell === 'undefined') return "";
  let str = String(cell);
  if (str.includes(',') || str.includes('\"') || str.includes('\n')) {
    str = str.replace(/\"/g, '\"\"'); // Escape double quotes
    return `"${str}"`;
  }
  return str;
}

// --- Database Logging Endpoint ---
app.post('/api/log', async (req, res) => {
  try {
    const { projectName, environment, userName, activityType } = req.body;
    
    // Validate required fields
    if (!projectName || !environment || !activityType) {
      return res.status(400).json({ error: 'Missing required log fields' });
    }

    await knex('logs').insert({
      projectName,
      environment,
      userName: userName || 'N/A', // Handle optional userName
      activityType
    });
    
    res.status(201).json({ message: 'Log created' });
  } catch (error) {
    console.error('Log Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- 👇 NEW: Main Download Logic Endpoint ---
app.post('/api/v1/run-download', async (req, res) => {
  console.log('Download request received...');
  
  // 1. Get all credentials from the form
  const {
    cpiBaseUrl,
    tokenUrl,
    clientId,
    clientSecret
  } = req.body;

  // Simple validation
  if (!cpiBaseUrl || !tokenUrl || !clientId || !clientSecret) {
    return res.status(400).json({ error: 'Missing required API credentials' });
  }

  let accessToken = '';

  try {
    // --- Step 1: Get Auth Token ---
    console.log('Step 1: Getting Auth Token...');
    const tokenAuth = { username: clientId, password: clientSecret };
    const tokenBody = new URLSearchParams();
    tokenBody.append('grant_type', 'client_credentials');

    const tokenResponse = await axios.post(tokenUrl, tokenBody, {
      auth: tokenAuth,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    accessToken = tokenResponse.data.access_token;
    console.log('Token acquired.');

    // --- Step 2: Get All Integration Packages ---
    console.log('Step 2: Getting Integration Packages...');
    const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
    const packagesUrl = `${cpiBaseUrl}/IntegrationPackages`;
    
    const packagesResponse = await axios.get(packagesUrl, { headers: authHeader });
    const packages = packagesResponse.data.d.results;
    console.log(`Found ${packages.length} packages.`);

    // --- Step 3 & 4: Loop Packages and iFlows ---
    console.log('Step 3 & 4: Looping packages and iFlows...');
    const allConfigData = [];
    const version = 'active'; // Using 'active' version as from Postman

    for (const pkg of packages) {
      const iFlowsUrl = `${cpiBaseUrl}/IntegrationPackages('${pkg.Id}')/IntegrationDesigntimeArtifacts`;
      let iFlows = [];
      
      try {
        const iFlowsResponse = await axios.get(iFlowsUrl, { headers: authHeader });
        iFlows = iFlowsResponse.data.d.results;
      } catch (pkgError) {
        console.error(`Error getting iFlows for package ${pkg.Name}: ${pkgError.message}`);
        continue; // Skip this package
      }

      if (iFlows.length === 0) {
        // Add a blank entry for the package if it has no iFlows
        allConfigData.push({
          PackageName: pkg.Name,
          PackageID: pkg.Id,
          IflowName: '',
          IflowID: '',
          ParameterKey: '',
          ParameterValue: '',
          DataType: ''
        });
        continue;
      }

      for (const iflow of iFlows) {
        const configsUrl = `${cpiBaseUrl}/IntegrationDesigntimeArtifacts(Id='${iflow.Id}',Version='${version}')/Configurations`;
        let configurations = [];

        try {
          const configResponse = await axios.get(configsUrl, { headers: authHeader });
          configurations = configResponse.data.d.results;
        } catch (iflowError) {
          console.error(`Error getting configs for iFlow ${iflow.Name}: ${iflowError.message}`);
          // Add a row showing the iFlow but with an error
           allConfigData.push({
            PackageName: pkg.Name,
            PackageID: pkg.Id,
            IflowName: iflow.Name,
            IflowID: iflow.Id,
            ParameterKey: 'ERROR',
            ParameterValue: iflowError.message,
            DataType: ''
          });
          continue; // Skip this iFlow
        }

        const baseRow = {
          PackageName: pkg.Name,
          PackageID: pkg.Id,
          IflowName: iflow.Name,
          IflowID: iflow.Id
        };

        if (configurations.length === 0) {
          // If no configs, add one blank row for the iFlow
          allConfigData.push({ ...baseRow, ParameterKey: '', ParameterValue: '', DataType: '' });
        } else {
          // Add one row for each config parameter
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
    console.log('All data fetched. Generating CSV.');

    // --- Step 5: Convert to CSV ---
    const headers = ["PackageName", "PackageID", "IflowName", "IflowID", "ParameterKey", "ParameterValue", "DataType"];
    const csvHeader = headers.join(',') + '\n';
    const csvRows = allConfigData.map(row => 
      headers.map(header => escapeCSV(row[header])).join(',')
    ).join('\n');
    
    const csvContent = csvHeader + csvRows;

    // --- Step 6: Send File as Response ---
    console.log('Sending CSV file to client.');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="configurations.csv"');
    res.status(200).send(csvContent);

  } catch (error) {
    console.error('Full Download Error:', error);
    // Handle different error types
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Error Data:', error.response.data);
      console.error('Error Status:', error.response.status);
      res.status(500).json({
        error: `API Error: ${error.response.data.error?.message || 'Failed to call SAP API'}`,
        status: error.response.status
      });
    } else if (error.request) {
      // The request was made but no response was received
      console.error('Error Request:', error.request);
      res.status(500).json({ error: 'No response from SAP API. Check URL and connectivity.' });
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error Message:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
});

// --- Start the server ---
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  setupDatabase();
});