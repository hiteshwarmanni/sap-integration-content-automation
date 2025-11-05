// server/server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { knex, setupDatabase } = require('./db.js');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const multer = require('multer');
const csv = require('csv-parser');

// --- Setup Directories ---
const logsDir = path.join(__dirname, 'logs');
const uploadsDir = path.join(__dirname, 'uploads');
const resultsDir = path.join(__dirname, 'results');
[logsDir, uploadsDir, resultsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// --- Multer Setup (for file uploads) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// --- Logger Format ---
const loggerFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
);

// --- Timestamp Helper ---
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

// ... (escapeCSV function) ...
function escapeCSV(cell) {
  if (cell === null || typeof cell === 'undefined') return "";
  let str = String(cell);
  if (str.includes(',') || str.includes('\"') || str.includes('\n')) {
    str = str.replace(/\"/g, '\"\"');
    return `"${str}"`;
  }
  return str;
}

// --- Database Logging Endpoint (This is now only used by the server) ---
app.post('/api/log', async (req, res) => {
  try {
    const { projectName, environment, userName, activityType, logFile, resultFile, executionTimestamp } = req.body;
    await knex('logs').insert({
      projectName, environment, userName: userName || 'N/A', activityType,
      logFile: logFile || null,
      resultFile: resultFile || null,
      timestamp: executionTimestamp ? executionTimestamp : getFormattedTimestamp(new Date()).replace('_', ' ')
    });
    console.log('✅ Final log entry created:', { projectName, activityType });
    res.status(201).json({ message: 'Log created' });
  } catch (error) {
    console.error('DB Log Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Download Logic Endpoint (Corrected and Complete) ---
app.post('/api/v1/run-download', async (req, res) => {

  // 1. Generate timestamp and logger
  const executionTimestamp = new Date();
  const formattedTimestamp = getFormattedTimestamp(executionTimestamp);
  const logFileName = `run_${formattedTimestamp}.log`;
  const logFilePath = path.join(logsDir, logFileName);
  
  const logger = winston.createLogger({
    level: 'info', format: loggerFormat,
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
      auth: tokenAuth, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
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
    const allConfigData = []; // This array will now be filled
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
        // --- 👇 ADD BLANK ROW FOR EMPTY PACKAGE ---
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
      logger.info(`Found ${iFlows.length} iFlows for package: ${pkg.Name}`);

      for (const iflow of iFlows) {
        const configsUrl = `${cpiBaseUrl}/IntegrationDesigntimeArtifacts(Id='${iflow.Id}',Version='${version}')/Configurations`;
        let configurations = [];
        
        // --- 👇 THIS IS THE BASE ROW DATA ---
        const baseRow = {
          PackageName: pkg.Name,
          PackageID: pkg.Id,
          IflowName: iflow.Name,
          IflowID: iflow.Id
        };
        
        try {
          const configResponse = await axios.get(configsUrl, { headers: authHeader });
          configurations = configResponse.data.d.results;
        } catch (iflowError) {
          logger.error(`Error getting configs for iFlow ${iflow.Name}: ${iflowError.message}`);
          // --- 👇 ADD ERROR ROW ---
          allConfigData.push({
            ...baseRow,
            ParameterKey: 'ERROR',
            ParameterValue: iflowError.message,
            DataType: ''
          });
          continue;
        }
        
        if (configurations.length === 0) {
          // --- 👇 ADD BLANK ROW FOR IFLOW WITH NO CONFIGS ---
          allConfigData.push({ ...baseRow, ParameterKey: '', ParameterValue: '', DataType: '' });
        } else {
          // --- 👇 ADD ONE ROW PER CONFIGURATION ---
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
    const headers = ["PackageName", "PackageID", "IflowName", "IflowID", "ParameterKey", "ParameterValue", "DataType"];
    const csvHeader = headers.join(',') + '\n';
    const csvRows = allConfigData.map(row => 
      headers.map(header => escapeCSV(row[header])).join(',')
    ).join('\n');
    
    const csvContent = csvHeader + csvRows;

    logger.info('Sending CSV file to client.');
    
    // Log to DB *before* sending response
    await axios.post(`http://localhost:${PORT}/api/log`, {
      projectName, environment, userName,
      activityType: 'Download',
      logFile: `logs/${logFileName}`,
      executionTimestamp: formattedTimestamp.replace('_', ' ')
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="configurations.csv"');
    res.status(200).send(csvContent);

  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    logger.error(`FATAL DOWNLOAD ERROR: ${errorMsg}`);
    
    // Log failure to DB
    await axios.post(`http://localhost:${PORT}/api/log`, {
      projectName, environment, userName,
      activityType: 'Download',
      logFile: `logs/${logFileName}`,
      executionTimestamp: formattedTimestamp.replace('_', ' '),
    });

    res.status(500).json({ error: error.message });
  
  } finally {
    // This runs *after* try or catch
    logger.end(); // Close the log stream
  }
});

// --- 👇 UPLOAD ENDPOINT (STEP 1: Start Job) ---
// This endpoint is now very fast.
app.post('/api/v1/run-upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  
  try {
    // 1. Store form data and file path
    const jobData = {
      formData: req.body,
      filePath: req.file.path
    };

    /*// 2. Create a new job in the 'upload_jobs' table
    const [newJob] = await knex('upload_jobs').insert({
      status: 'Pending',
      progress: 0,
      total: 0,
      temp_upload_path: req.file.path,
      form_data_json: JSON.stringify(jobData) // Store all info
    }).returning('id'); // Get the ID of the new row

    const jobId = newJob.id;
    */

    // 2. Create a new job in the 'upload_jobs' table
    const insertedRows = await knex('upload_jobs').insert({
      status: 'Pending',
      progress: 0,
      total: 0,
      temp_upload_path: req.file.path,
      form_data_json: JSON.stringify(jobData)
    }).returning('id');
    // This robustly handles different database return types
    const jobId = insertedRows[0].id || insertedRows[0];

    console.log(`Upload job created with ID: ${jobId}`);

  

    // 3. Respond to the client immediately
    res.status(202).json({ jobId: jobId });
    
    // 4. Start the long-running job in the background
    runUploadJob(jobId);

  } catch (error) {
    console.error(`Failed to start upload job: ${error.message}`);
    res.status(500).json({ error: 'Failed to start job.' });
  }
});

// --- 👇 UPLOAD ENDPOINT (STEP 2: Job Status) ---
// This now queries the 'upload_jobs' table
app.get('/api/v1/job-status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await knex('upload_jobs').where({ id: jobId }).first();
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }
    
    res.json({
      status: job.status,
      progress: job.progress,
      total: job.total,
      resultFile: job.result_file_path // Send the result file path
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- 👇 THIS IS THE MISSING ENDPOINT ---
app.get('/api/v1/get-result/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    // Query the 'upload_jobs' table
    const job = await knex('upload_jobs').where({ id: jobId }).first();
    
    if (!job || !job.result_file_path) {
      return res.status(404).json({ error: 'Result file not found.' });
    }
    
    // Construct the full path and send the file
    const filePath = path.join(__dirname, job.result_file_path);
    res.download(filePath); 

  } catch (error) {
    console.error(`Error getting result file for job ${req.params.jobId}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- 👇 The Main Upload Job Logic (With Timezone Fix) ---
async function runUploadJob(jobId) {
  // 1. Get job data from DB
  const job = await knex('upload_jobs').where({ id: jobId }).first();
  const { formData, filePath } = JSON.parse(job.form_data_json);
  const { projectName, environment, userName, cpiBaseUrl, tokenUrl, clientId, clientSecret, version = 'active' } = formData;


  // --- 👇 THIS IS THE FIX ---
  // 2. Create a NEW timestamp when the job *actually starts*.
  // This ignores the database's UTC 'created_at' and uses system time.
  const executionTimestamp = new Date();
  const formattedTimestamp = getFormattedTimestamp(executionTimestamp);
  // --- END OF FIX ---


  // 3. Create logger and result file using the new timestamp
  const logFileName = `run_${formattedTimestamp}.log`;
  const logFilePath = path.join(logsDir, logFileName);
  
  const resultsFileName = `results_${formattedTimestamp}.csv`;
  const resultsFilePath = path.join(resultsDir, resultsFileName);
  
  const logger = winston.createLogger({
    level: 'info', format: loggerFormat,
    transports: [
      new winston.transports.Console({ format: winston.format.simple() }),
      new winston.transports.File({ filename: logFilePath })
    ]
  });
  
  const resultsStream = fs.createWriteStream(resultsFilePath);
  const resultsHeadersList = [
    "PackageName", "PackageID", "IflowName", "IflowID",
    "ParameterKey", "ParameterValue", "DataType",
    "StatusCode", "Status", "Message"
  ];
  const resultsHeaders = resultsHeadersList.join(',') + '\n';
  resultsStream.write(resultsHeaders);

  let finalStatus = 'Failed';
  
  try {
    // 4. Update job to 'Running'
    await knex('upload_jobs').where({ id: jobId }).update({
      status: 'Running',
      log_file_path: `logs/${logFileName}`,
      result_file_path: `results/${resultsFileName}`
    });

    // 5. Get Auth Token
    logger.info('Getting Auth Token...');
    const tokenAuth = { username: clientId, password: clientSecret };
    const tokenBody = new URLSearchParams();
    tokenBody.append('grant_type', 'client_credentials');
    const tokenResponse = await axios.post(tokenUrl, tokenBody, {
      auth: tokenAuth, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const accessToken = tokenResponse.data.access_token;
    logger.info('Auth Token acquired.');

    // 6. Get CSRF Token
    logger.info('Getting CSRF Token...');
    const sapApi = axios.create({
      baseURL: cpiBaseUrl,
      headers: { 'Authorization': `Bearer ${accessToken}` },
      withCredentials: true
    });
    const csrfResponse = await sapApi.get('/', { headers: { 'X-CSRF-Token': 'Fetch' } });
    const csrfToken = csrfResponse.headers['x-csrf-token'];
    logger.info('CSRF Token acquired.');

    // 7. Parse CSV and get total
    const rows = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('headers', (headers) => {
          logger.info(`CSV Headers found: [${headers.join(', ')}]`);
        })
        .on('data', (data) => rows.push(data))
        .on('end', resolve)
        .on('error', reject);
    });
    
    await knex('upload_jobs').where({ id: jobId }).update({ total: rows.length });
    logger.info(`CSV Parsed. ${rows.length} rows to process.`);

    // 8. Loop and process each row
    let progress = 0;
    for (const row of rows) {
      
      logger.info(`Processing row data: ${JSON.stringify(row)}`);
      const { IflowID, ParameterKey, ParameterValue, DataType } = row;
      
      // Validation check
      if (!IflowID || !ParameterKey || ParameterValue === null || ParameterValue === undefined) {
        logger.warn(`Skipping row: Missing IflowID, ParameterKey, or ParameterValue.`);
        const outputRow = [
          escapeCSV(row.PackageName), escapeCSV(row.PackageID), escapeCSV(row.IflowName), escapeCSV(row.IflowID),
          escapeCSV(row.ParameterKey), escapeCSV(row.ParameterValue), escapeCSV(row.DataType),
          'N/A', 'Failed', 'Missing IflowID/ParameterKey/ParameterValue'
        ];
        resultsStream.write(outputRow.join(',') + '\n');
        progress++;
        continue;
      }

      const updateUrl = `/IntegrationDesigntimeArtifacts(Id='${IflowID}',Version='${version}')/$links/Configurations('${ParameterKey}')`;
      const updateBody = {
        ParameterValue: ParameterValue,
        DataType: DataType || 'xsd:string'
      };
      
      try {
        const updateResponse = await sapApi.put(updateUrl, updateBody, {
          headers: {
            'X-CSRF-Token': csrfToken,
            'Content-Type': 'application/json'
          }
        });
        
        logger.info(`Updated: ${row.IflowName || IflowID} -> ${ParameterKey}`);
        const outputRow = [
          escapeCSV(row.PackageName), escapeCSV(row.PackageID), escapeCSV(row.IflowName), escapeCSV(row.IflowID),
          escapeCSV(row.ParameterKey), escapeCSV(row.ParameterValue), escapeCSV(row.DataType),
          updateResponse.status, 'Success', 'Updated'
        ];
        resultsStream.write(outputRow.join(',') + '\n');
        
      } catch (rowError) {
        const statusCode = rowError.response ? rowError.response.status : 'N/A';
        const errorMsg = rowError.response ? JSON.stringify(rowError.response.data) : rowError.message;
        logger.error(`Failed: ${row.IflowName || IflowID} -> ${ParameterKey}. Error: ${errorMsg}`);
        const outputRow = [
          escapeCSV(row.PackageName), escapeCSV(row.PackageID), escapeCSV(row.IfNlowName), escapeCSV(row.IflowID),
          escapeCSV(row.ParameterKey), escapeCSV(row.ParameterValue), escapeCSV(row.DataType),
          statusCode, 'Failed', escapeCSV(errorMsg)
        ];
        resultsStream.write(outputRow.join(',') + '\n');
      }
      
      progress++;
      if (progress % 5 === 0 || progress === rows.length) {
        await knex('upload_jobs').where({ id: jobId }).update({ progress: progress });
      }
    }
    // --- END OF LOOP ---

    // 9. Finish Job
    logger.info('Upload processing complete.');
    finalStatus = 'Complete';

  } catch (jobError) {
    const errorMsg = jobError.response ? JSON.stringify(jobError.response.data) : jobError.message;
    logger.error(`FATAL UPLOAD ERROR: ${errorMsg}`);
    finalStatus = 'Failed';
  
  } finally {
    // 10. Close streams
    resultsStream.end();
    fs.unlinkSync(filePath); // Delete the temp upload file

    // 11. Update job status
    await knex('upload_jobs').where({ id: jobId }).update({
      status: finalStatus,
      progress: (finalStatus === 'Complete') ? (await knex('upload_jobs').where({ id: jobId }).first()).total : undefined
    });

    // 12. FINAL LOGGING STEP
    try {
      await axios.post(`http://localhost:${PORT}/api/log`, {
        projectName, environment, userName,
        activityType: 'Upload',
        logFile: `logs/${logFileName}`,
        resultFile: `results/${resultsFileName}`,
        executionTimestamp: formattedTimestamp.replace('_', ' ') // Use the new local timestamp
      });
    } catch (logError) {
      console.error("Failed to write final upload log:", logError.message);
    }

    // 13. Close the logger
    logger.end();
  }
}

// --- Start the server ---
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  setupDatabase();
});