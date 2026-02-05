// server/jobs.js

// --- 1. Import all dependencies ---
const db = require('./db-wrapper.js');
const {
  logsDir,
  resultsDir,
  loggerFormat,
  getFormattedTimestamp,
  escapeCSV,
  path,
  fs,
  winston,
  axios,
  csv,
  API_URL,
  CPI_API_PATH_SUFFIX,
} = require('./utils.js');
const { logJobExecution, logError, logInfo } = require('./cloud-logger.js');


// --- 2. runDownloadJob ---
async function runDownloadJob(jobId) {
  // 1. Get job data
  const job = await db.getDownloadJobById(jobId);
  const { formData } = JSON.parse(job.form_data_json);
  let { projectName, environment, userName, cpiBaseUrl, tokenUrl, clientId, clientSecret, packageId } = formData;

  // Automatically append API path suffix to CPI Base URL
  if (cpiBaseUrl && !cpiBaseUrl.endsWith(CPI_API_PATH_SUFFIX)) {
    cpiBaseUrl = cpiBaseUrl.replace(/\/$/, '') + CPI_API_PATH_SUFFIX;
  }

  // 2. Create logger and result file
  const executionTimestamp = new Date(job.created_at);
  const formattedTimestamp = getFormattedTimestamp(executionTimestamp);
  const logFileName = `run_download_${formattedTimestamp}.log`;
  const logFilePath = path.join(logsDir, logFileName);
  const resultsFileName = `${projectName}_${environment}_configurations_${formattedTimestamp}.csv`;
  const resultsFilePath = path.join(resultsDir, resultsFileName);

  const logger = winston.createLogger({
    level: 'info', format: loggerFormat,
    transports: [
      new winston.transports.Console({ format: winston.format.simple() }),
      new winston.transports.File({ filename: logFilePath })
    ]
  });

  const resultsStream = fs.createWriteStream(resultsFilePath);
  const headers = ["PackageName", "PackageID", "IflowName", "IflowID", "ParameterKey", "ParameterValue", "DataType"];
  resultsStream.write(headers.join(',') + '\n');
  let finalStatus = 'Failed';
  let progress = 0; // Initialize progress variable at the start

  try {
    // 3. Update job to 'Running'
    await db.updateDownloadJob(jobId, {
      status: 'Running'
    });

    // Log job start to Cloud Logging
    logJobExecution('download', jobId, 'Started', { projectName, environment, userName });

    // 4. Get Auth Token
    logger.info('Step 1: Getting Auth Token...');
    logger.info(`Token URL: ${tokenUrl}`);
    logger.info(`Client ID length: ${clientId ? clientId.length : 0}`);
    logger.info(`Client Secret length: ${clientSecret ? clientSecret.length : 0}`);

    // Create Basic Auth header manually to handle special characters
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenBody = new URLSearchParams();
    tokenBody.append('grant_type', 'client_credentials');

    let accessToken;
    try {
      const tokenResponse = await axios.post(tokenUrl, tokenBody, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        }
      });
      accessToken = tokenResponse.data.access_token;
      logger.info('Token acquired successfully.');
    } catch (tokenError) {
      logger.error('Token acquisition failed:');
      logger.error(`Status: ${tokenError.response?.status}`);
      logger.error(`Response: ${JSON.stringify(tokenError.response?.data)}`);
      throw tokenError;
    }

    // --- THIS WAS THE BUG FIX: Define authHeader *after* token is acquired ---
    const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

    // --- STEP 5: Get ALL Packages, THEN Filter ---
    logger.info('Step 2: Getting ALL Integration Packages...');
    const packagesUrl = `${cpiBaseUrl}/IntegrationPackages`;
    const packagesResponse = await axios.get(packagesUrl, { headers: authHeader });

    // Handle different API response formats
    let allPackages = [];
    if (packagesResponse.data && packagesResponse.data.d && packagesResponse.data.d.results) {
      allPackages = packagesResponse.data.d.results;
    } else if (packagesResponse.data && Array.isArray(packagesResponse.data)) {
      allPackages = packagesResponse.data;
    } else {
      logger.error(`Unexpected API response format: ${JSON.stringify(packagesResponse.data)}`);
      throw new Error('Unable to parse packages from API response. Check API URL and credentials.');
    }

    logger.info(`Fetched ${allPackages.length} total packages.`);

    let packagesToProcess = [];

    // Now, we filter the results in our code
    if (packageId && packageId.trim().length > 0) {
      logger.info(`Filtering for specific packages: ${packageId}`);
      // Compare case-insensitively
      const idList = packageId.split(',').map(id => id.trim().toUpperCase());

      packagesToProcess = allPackages.filter(pkg =>
        idList.includes(pkg.Id.toUpperCase())
      );

      logger.info(`Found ${packagesToProcess.length} matching packages.`);
    } else {
      logger.info('No specific Package IDs provided. Processing all packages.');
      packagesToProcess = allPackages;
    }
    // --- END OF STEP 5 FIX ---


    // Set total for progress bar
    await db.updateDownloadJob(jobId, { total: packagesToProcess.length });

    // 6. Loop Packages and iFlows
    logger.info('Step 3 & 4: Looping packages and iFlows...');
    const version = 'active';

    // --- Use the filtered list 'packagesToProcess' ---
    for (const [index, pkg] of packagesToProcess.entries()) {
      logger.info(`--- Processing Package ${index + 1}/${packagesToProcess.length}: ${pkg.Name} ---`);

      // --- THIS IS THE URL YOU PROVIDED ---
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
        resultsStream.write([
          escapeCSV(pkg.Name), escapeCSV(pkg.Id), '', '', '', '', ''
        ].join(',') + '\n');
      } else {
        logger.info(`Found ${iFlows.length} iFlows for package: ${pkg.Name}`);
        for (const iflow of iFlows) {
          const configsUrl = `${cpiBaseUrl}/IntegrationDesigntimeArtifacts(Id='${iflow.Id}',Version='${version}')/Configurations`;
          let configurations = [];

          const baseRow = [
            escapeCSV(pkg.Name),
            escapeCSV(pkg.Id),
            escapeCSV(iflow.Name),
            escapeCSV(iflow.Id)
          ];

          try {
            const configResponse = await axios.get(configsUrl, { headers: authHeader });
            configurations = configResponse.data.d.results;
          } catch (iflowError) {
            logger.error(`Error getting configs for iFlow ${iflow.Name}: ${iflowError.message}`);
            resultsStream.write([...baseRow, 'ERROR', escapeCSV(iflowError.message), ''].join(',') + '\n');
            continue;
          }

          if (configurations.length === 0) {
            resultsStream.write([...baseRow, '', '', ''].join(',') + '\n');
          } else {
            configurations.forEach(config => {
              const configRow = [
                ...baseRow,
                escapeCSV(config.ParameterKey),
                escapeCSV(config.ParameterValue),
                escapeCSV(config.DataType)
              ];
              resultsStream.write(configRow.join(',') + '\n');
            });
          }
        } // end iflow loop
      }

      // Update progress
      progress++;
      if (progress % 5 === 0 || progress === packagesToProcess.length) {
        await db.updateDownloadJob(jobId, { progress: progress });
      }
    } // end package loop

    logger.info('All data fetched. CSV generated.');
    finalStatus = 'Complete';

    // Log successful completion to Cloud Logging
    logJobExecution('download', jobId, 'Complete', {
      projectName,
      environment,
      userName,
      packagesProcessed: packagesToProcess.length
    });

  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    logger.error(`FATAL DOWNLOAD ERROR: ${errorMsg}`);
    finalStatus = 'Failed';

    // Log failure to Cloud Logging
    logJobExecution('download', jobId, 'Failed', {
      projectName,
      environment,
      userName,
      error: errorMsg
    });

  } finally {
    // 7. Close streams and wait for completion
    await new Promise((resolve) => {
      resultsStream.end(resolve);
    });

    // Close logger and wait for flush
    await new Promise((resolve) => {
      logger.on('finish', resolve);
      logger.end();
    });

    // 8. Read file contents to store in database
    let logContent = null;
    let resultContent = null;

    try {
      if (fs.existsSync(logFilePath)) {
        logContent = fs.readFileSync(logFilePath, 'utf8');
      }
      if (fs.existsSync(resultsFilePath)) {
        resultContent = fs.readFileSync(resultsFilePath, 'utf8');
      }
    } catch (readError) {
      console.error('Error reading log/result files:', readError.message);
    }

    // 9. Update job status
    const updatedJob = await db.getDownloadJobById(jobId);
    await db.updateDownloadJob(jobId, {
      status: finalStatus,
      progress: (finalStatus === 'Complete') ? updatedJob.total : progress
    });

    // 10. Write the final audit log with content directly to database
    try {
      await db.insertLog({
        projectName,
        environment,
        userName,
        activityType: 'Download',
        logContent: logContent,
        resultContent: resultContent,
        timestamp: formattedTimestamp.replace('_', ' '),
        status: finalStatus
      });
      logInfo('Download job audit log stored in database', { jobId, finalStatus });
    } catch (logError) {
      logError("Failed to write final download log to database", logError);
    }
  }
}


// --- 3. runUploadJob ---
async function runUploadJob(jobId) {
  // 1. Get job data
  const job = await db.getUploadJobById(jobId);
  const { formData, filePath } = JSON.parse(job.form_data_json);
  let { projectName, environment, userName, cpiBaseUrl, tokenUrl, clientId, clientSecret, version = 'active' } = formData;

  // Automatically append API path suffix to CPI Base URL
  if (cpiBaseUrl && !cpiBaseUrl.endsWith(CPI_API_PATH_SUFFIX)) {
    cpiBaseUrl = cpiBaseUrl.replace(/\/$/, '') + CPI_API_PATH_SUFFIX;
  }

  // 2. Create logger and result file
  const executionTimestamp = new Date(job.created_at);
  const formattedTimestamp = getFormattedTimestamp(executionTimestamp);
  const logFileName = `Run_${formattedTimestamp}.log`;
  const logFilePath = path.join(logsDir, logFileName);

  const resultsFileName = `Results_${formattedTimestamp}.csv`;
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
    // 3. Update job to 'Running'
    await db.updateUploadJob(jobId, {
      status: 'Running'
    });

    // Log job start to Cloud Logging
    logJobExecution('upload', jobId, 'Started', { projectName, environment, userName });

    // 4. Get Auth Token
    logger.info('Getting Auth Token...');
    logger.info(`Token URL: ${tokenUrl}`);
    logger.info(`Client ID length: ${clientId ? clientId.length : 0}`);
    logger.info(`Client Secret length: ${clientSecret ? clientSecret.length : 0}`);

    // Create Basic Auth header manually to handle special characters
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenBody = new URLSearchParams();
    tokenBody.append('grant_type', 'client_credentials');

    let accessToken;
    try {
      const tokenResponse = await axios.post(tokenUrl, tokenBody, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        }
      });
      accessToken = tokenResponse.data.access_token;
      logger.info('Auth Token acquired successfully.');
    } catch (tokenError) {
      logger.error('Token acquisition failed:');
      logger.error(`Status: ${tokenError.response?.status}`);
      logger.error(`Response: ${JSON.stringify(tokenError.response?.data)}`);
      throw tokenError;
    }

    // 5. Get CSRF Token
    logger.info('Getting CSRF Token...');
    const sapApi = axios.create({
      baseURL: cpiBaseUrl,
      headers: { 'Authorization': `Bearer ${accessToken}` },
      withCredentials: true
    });
    const csrfResponse = await sapApi.get('/', { headers: { 'X-CSRF-Token': 'Fetch' } });
    const csrfToken = csrfResponse.headers['x-csrf-token'];
    logger.info('CSRF Token acquired.');

    // 6. Parse CSV manually as string (bypassing csv parser issues)
    logger.info('Reading CSV file as text...');
    const csvContent = fs.readFileSync(filePath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim().length > 0);

    logger.info(`CSV has ${lines.length} lines (including header)`);

    // Skip header line and parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Split by comma
      const parts = line.split(',').map(p => p.trim());

      if (parts.length >= 2) {
        rows.push({
          artifactId: parts[0],
          artifactType: parts[1],
          version: parts[2] || 'active'
        });
      }
    }

    await db.updateUploadJob(jobId, { total: rows.length });
    logger.info(`CSV Parsed manually. ${rows.length} rows to process.`);

    // 7. Loop and process each row
    let progress = 0;
    for (const row of rows) {

      logger.info(`Processing row data: ${JSON.stringify(row)}`);
      const { IflowID, ParameterKey, ParameterValue, DataType } = row;

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
          escapeCSV(row.PackageName), escapeCSV(row.PackageID), escapeCSV(row.IflowName), escapeCSV(row.IflowID),
          escapeCSV(row.ParameterKey), escapeCSV(row.ParameterValue), escapeCSV(row.DataType),
          statusCode, 'Failed', escapeCSV(errorMsg)
        ];
        resultsStream.write(outputRow.join(',') + '\n');
      }

      progress++;
      if (progress % 5 === 0 || progress === rows.length) {
        await db.updateUploadJob(jobId, { progress: progress });
      }
    }

    // 8. Finish Job
    logger.info('Upload processing complete.');
    finalStatus = 'Complete';

    // Log successful completion to Cloud Logging
    logJobExecution('upload', jobId, 'Complete', {
      projectName,
      environment,
      userName,
      rowsProcessed: rows.length
    });

  } catch (jobError) {
    const errorMsg = jobError.response ? JSON.stringify(jobError.response.data) : jobError.message;
    logger.error(`FATAL UPLOAD ERROR: ${errorMsg}`);
    finalStatus = 'Failed';

    // Log failure to Cloud Logging
    logJobExecution('upload', jobId, 'Failed', {
      projectName,
      environment,
      userName,
      error: errorMsg
    });

  } finally {
    // 9. Close streams and wait for completion
    await new Promise((resolve) => {
      resultsStream.end(resolve);
    });

    // Delete uploaded CSV file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Close logger and wait for flush
    await new Promise((resolve) => {
      logger.on('finish', resolve);
      logger.end();
    });

    // 10. Read file contents to store in database
    let logContent = null;
    let resultContent = null;

    try {
      if (fs.existsSync(logFilePath)) {
        logContent = fs.readFileSync(logFilePath, 'utf8');
      }
      if (fs.existsSync(resultsFilePath)) {
        resultContent = fs.readFileSync(resultsFilePath, 'utf8');
      }
    } catch (readError) {
      console.error('Error reading log/result files:', readError.message);
    }

    // 11. Update job status
    const updatedJob = await db.getUploadJobById(jobId);
    await db.updateUploadJob(jobId, {
      status: finalStatus,
      progress: (finalStatus === 'Complete') ? updatedJob.total : progress
    });

    // 12. Write the final audit log with content directly to database
    try {
      await db.insertLog({
        projectName,
        environment,
        userName,
        activityType: 'Upload',
        logContent: logContent,
        resultContent: resultContent,
        timestamp: formattedTimestamp.replace('_', ' '),
        status: finalStatus
      });
      logInfo('Upload job audit log stored in database', { jobId, finalStatus });
    } catch (logError) {
      logError("Failed to write final upload log to database", logError);
    }
  }
}


// --- 4. runDeployJob ---
async function runDeployJob(jobId) {
  // 1. Get job data
  const job = await db.getUploadJobById(jobId);
  const { formData, filePath } = JSON.parse(job.form_data_json);
  let { projectName, environment, userName, cpiBaseUrl, tokenUrl, clientId, clientSecret, operation } = formData;

  // Automatically append API path suffix to CPI Base URL
  if (cpiBaseUrl && !cpiBaseUrl.endsWith(CPI_API_PATH_SUFFIX)) {
    cpiBaseUrl = cpiBaseUrl.replace(/\/$/, '') + CPI_API_PATH_SUFFIX;
  }

  // 2. Create logger and result file
  const executionTimestamp = new Date(job.created_at);
  const formattedTimestamp = getFormattedTimestamp(executionTimestamp);
  const logFileName = `Run_${operation}_${formattedTimestamp}.log`;
  const logFilePath = path.join(logsDir, logFileName);

  const resultsFileName = `${operation}_Results_${formattedTimestamp}.csv`;
  const resultsFilePath = path.join(resultsDir, resultsFileName);

  const logger = winston.createLogger({
    level: 'info', format: loggerFormat,
    transports: [
      new winston.transports.Console({ format: winston.format.simple() }),
      new winston.transports.File({ filename: logFilePath })
    ]
  });

  const resultsStream = fs.createWriteStream(resultsFilePath, { encoding: 'utf8' });

  // Set headers for result CSV (write without BOM)
  const resultsHeaders = ["ArtifactID", "ArtifactType", "Version", "Operation", "ResponseCode", "ResponseMessage"];
  resultsStream.write(resultsHeaders.join(',') + '\n');
  let finalStatus = 'Failed';

  try {
    // 3. Update job to 'Running'
    await db.updateUploadJob(jobId, {
      status: 'Running'
    });

    // Log job start to Cloud Logging
    logJobExecution('deploy', jobId, 'Started', { projectName, environment, userName, operation });

    // 4. Get Auth Token
    logger.info('Getting Auth Token...');
    logger.info(`Token URL: ${tokenUrl}`);
    logger.info(`Client ID length: ${clientId ? clientId.length : 0}`);
    logger.info(`Client Secret length: ${clientSecret ? clientSecret.length : 0}`);

    // Create Basic Auth header manually to handle special characters
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenBody = new URLSearchParams();
    tokenBody.append('grant_type', 'client_credentials');

    let accessToken;
    try {
      const tokenResponse = await axios.post(tokenUrl, tokenBody, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        }
      });
      accessToken = tokenResponse.data.access_token;
      logger.info('Auth Token acquired successfully.');
    } catch (tokenError) {
      logger.error('Token acquisition failed:');
      logger.error(`Status: ${tokenError.response?.status}`);
      logger.error(`Response: ${JSON.stringify(tokenError.response?.data)}`);
      throw tokenError;
    }

    // 5. Get CSRF Token 
    let csrfToken = null;
    logger.info('Getting CSRF Token...');
    const sapApi = axios.create({
      baseURL: cpiBaseUrl,
      headers: { 'Authorization': `Bearer ${accessToken}` },
      withCredentials: true
    });
    const csrfResponse = await sapApi.get('/', { headers: { 'X-CSRF-Token': 'Fetch' } });
    csrfToken = csrfResponse.headers['x-csrf-token'];
    logger.info('CSRF Token acquired.');

    // 6. Parse CSV manually as string (bypassing csv parser issues)
    logger.info('Reading CSV file as text...');
    const csvContent = fs.readFileSync(filePath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim().length > 0);

    logger.info(`CSV has ${lines.length} lines (including header)`);

    // Skip header line and parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Split by comma
      const parts = line.split(',').map(p => p.trim());

      if (parts.length >= 2) {
        rows.push({
          artifactId: parts[0],
          artifactType: parts[1],
          version: parts[2] || 'active'
        });
      }
    }

    await db.updateUploadJob(jobId, { total: rows.length });
    logger.info(`CSV Parsed manually. ${rows.length} rows to process.`);

    // 7. Loop and process each row based on ArtifactType
    let progress = 0;
    for (const row of rows) {
      logger.info(`Processing row: ArtifactID="${row.artifactId}", ArtifactType="${row.artifactType}", Version="${row.version}"`);

      const artifactId = row.artifactId;
      const artifactType = row.artifactType;
      const version = row.version;
      let outputRow = [];

      // Validate required fields
      if (!artifactId || !artifactType) {
        const errorMsg = 'Missing ArtifactID or ArtifactType';
        logger.error(errorMsg);
        logger.error(`ArtifactID: "${artifactId}"`);
        logger.error(`ArtifactType: "${artifactType}"`);
        outputRow = [
          escapeCSV(artifactId || ''),
          escapeCSV(artifactType || ''),
          escapeCSV(version),
          escapeCSV(operation),
          'N/A',
          escapeCSV(errorMsg)
        ];
        resultsStream.write(outputRow.join(',') + '\n');
        progress++;
        continue;
      }

      try {
        let deployUrl = '';
        let httpMethod = 'POST';
        let requiresCSRF = true;

        // Normalize artifact type
        const normalizedType = artifactType.trim().toLowerCase();

        if (operation === 'deploy') {
          // Handle deployment based on artifact type
          if (normalizedType === 'integration flow') {
            deployUrl = `${cpiBaseUrl}/DeployIntegrationDesigntimeArtifact?Id='${artifactId}'&Version='${version}'`;
            logger.info(`Deploying Integration Flow: ${artifactId} (Version: ${version})`);
          } else if (normalizedType === 'script collection') {
            deployUrl = `${cpiBaseUrl}/DeployScriptCollectionDesigntimeArtifact?Id='${artifactId}'&Version='${version}'`;
            logger.info(`Deploying Script Collection: ${artifactId} (Version: ${version})`);
          } else if (normalizedType === 'value mapping') {
            deployUrl = `${cpiBaseUrl}/DeployValueMappingDesigntimeArtifact?Id='${artifactId}'&Version='${version}'`;
            logger.info(`Deploying Value Mapping: ${artifactId} (Version: ${version})`);
          } else {
            throw new Error(`Unknown artifact type: ${artifactType}`);
          }
        } else if (operation === 'undeploy') {
          // Handle undeployment
          if (normalizedType === 'integration flow') {
            deployUrl = `${cpiBaseUrl}/IntegrationRuntimeArtifacts('${artifactId}')`;
            httpMethod = 'DELETE';
            requiresCSRF = false;
            logger.info(`Undeploying Integration Flow: ${artifactId}`);
          } else if (normalizedType === 'script collection' || normalizedType === 'value mapping') {
            // No API available for undeploying Script Collections and Value Mappings
            const msg = `No API currently available to undeploy ${artifactType}. Please perform the undeployment manually.`;
            logger.warn(msg);
            outputRow = [
              escapeCSV(artifactId),
              escapeCSV(artifactType),
              escapeCSV(version),
              escapeCSV(operation),
              'N/A',
              escapeCSV(msg)
            ];
            resultsStream.write(outputRow.join(',') + '\n');
            progress++;
            if (progress % 5 === 0 || progress === rows.length) {
              await db.updateUploadJob(jobId, { progress: progress });
            }
            continue;
          } else {
            throw new Error(`Unknown artifact type: ${artifactType}`);
          }
        }

        // Make the API call
        const headers = {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        };

        if (requiresCSRF && csrfToken) {
          headers['X-CSRF-Token'] = csrfToken;
        }

        let response;
        if (httpMethod === 'DELETE') {
          response = await axios.delete(deployUrl, { headers });
        } else {
          response = await axios.post(deployUrl, {}, { headers });
        }

        logger.info(`Success: ${artifactId} - Status: ${response.status}`);

        outputRow = [
          escapeCSV(artifactId),
          escapeCSV(artifactType),
          escapeCSV(version),
          escapeCSV(operation),
          response.status,
          'Success'
        ];

        resultsStream.write(outputRow.join(',') + '\n');

      } catch (rowError) {
        const statusCode = rowError.response ? rowError.response.status : 'N/A';
        const errorMsg = rowError.response ? JSON.stringify(rowError.response.data) : rowError.message;
        logger.error(`Failed: ${artifactId}. Error: ${errorMsg}`);

        outputRow = [
          escapeCSV(artifactId),
          escapeCSV(artifactType),
          escapeCSV(version),
          escapeCSV(operation),
          statusCode,
          escapeCSV(errorMsg)
        ];

        resultsStream.write(outputRow.join(',') + '\n');
      }

      progress++;
      if (progress % 5 === 0 || progress === rows.length) {
        await db.updateUploadJob(jobId, { progress: progress });
      }
    }

    // 8. Finish Job
    logger.info('Deploy processing complete.');
    finalStatus = 'Complete';

    // Log successful completion to Cloud Logging
    logJobExecution('deploy', jobId, 'Complete', {
      projectName,
      environment,
      userName,
      operation,
      rowsProcessed: rows.length
    });

  } catch (jobError) {
    const errorMsg = jobError.response ? JSON.stringify(jobError.response.data) : jobError.message;
    logger.error(`FATAL DEPLOY ERROR: ${errorMsg}`);
    finalStatus = 'Failed';

    // Log failure to Cloud Logging
    logJobExecution('deploy', jobId, 'Failed', {
      projectName,
      environment,
      userName,
      operation,
      error: errorMsg
    });

  } finally {
    // 9. Close streams and wait for completion
    await new Promise((resolve) => {
      resultsStream.end(resolve);
    });

    // Delete uploaded CSV file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Close logger and wait for flush
    await new Promise((resolve) => {
      logger.on('finish', resolve);
      logger.end();
    });

    // 10. Read file contents to store in database
    let logContent = null;
    let resultContent = null;

    try {
      if (fs.existsSync(logFilePath)) {
        logContent = fs.readFileSync(logFilePath, 'utf8');
      }
      if (fs.existsSync(resultsFilePath)) {
        resultContent = fs.readFileSync(resultsFilePath, 'utf8');
      }
    } catch (readError) {
      console.error('Error reading log/result files:', readError.message);
    }

    // 11. Update job status
    const updatedJob = await db.getUploadJobById(jobId);
    await db.updateUploadJob(jobId, {
      status: finalStatus,
      progress: (finalStatus === 'Complete') ? updatedJob.total : progress
    });

    // 12. Write the final audit log with content directly to database
    try {
      await db.insertLog({
        projectName,
        environment,
        userName,
        activityType: operation === 'deploy' ? 'Deploy' : 'Undeploy',
        logContent: logContent,
        resultContent: resultContent,
        timestamp: formattedTimestamp.replace('_', ' '),
        status: finalStatus
      });
      logInfo('Deploy job audit log stored in database', { jobId, operation, finalStatus });
    } catch (logError) {
      logError("Failed to write final deploy log to database", logError);
    }
  }
}


// --- 5. Export the job functions ---
module.exports = {
  runDownloadJob,
  runUploadJob,
  runDeployJob,
};
