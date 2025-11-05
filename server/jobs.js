// server/jobs.js

// --- 1. Import all dependencies ---
const { knex } = require('./db.js');
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
  API_URL, // <-- Import the API_URL
} = require('./utils.js');


// --- 2. runDownloadJob ---
async function runDownloadJob(jobId) {
  // 1. Get job data
  const job = await knex('download_jobs').where({ id: jobId }).first();
  const { formData } = JSON.parse(job.form_data_json);
  const { projectName, environment, userName, cpiBaseUrl, tokenUrl, clientId, clientSecret, packageId } = formData;

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

  try {
    // 3. Update job to 'Running'
    await knex('download_jobs').where({ id: jobId }).update({
      status: 'Running',
      log_file_path: `logs/${logFileName}`,
      result_file_path: `results/${resultsFileName}`
    });

    // 4. Get Auth Token
    logger.info('Step 1: Getting Auth Token...');
    const tokenAuth = { username: clientId, password: clientSecret };
    const tokenBody = new URLSearchParams();
    tokenBody.append('grant_type', 'client_credentials');
    const tokenResponse = await axios.post(tokenUrl, tokenBody, {
      auth: tokenAuth, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const accessToken = tokenResponse.data.access_token;
    logger.info('Token acquired.');
    
    // --- THIS WAS THE BUG FIX: Define authHeader *after* token is acquired ---
    const authHeader = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

    // --- STEP 5: Get ALL Packages, THEN Filter ---
    logger.info('Step 2: Getting ALL Integration Packages...');
    const packagesUrl = `${cpiBaseUrl}/IntegrationPackages`;
    const packagesResponse = await axios.get(packagesUrl, { headers: authHeader });
    let allPackages = packagesResponse.data.d.results;
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
    await knex('download_jobs').where({ id: jobId }).update({ total: packagesToProcess.length });

    // 6. Loop Packages and iFlows
    logger.info('Step 3 & 4: Looping packages and iFlows...');
    const version = 'active';
    let progress = 0;

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
        await knex('download_jobs').where({ id: jobId }).update({ progress: progress });
      }
    } // end package loop
    
    logger.info('All data fetched. CSV generated.');
    finalStatus = 'Complete';

  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    logger.error(`FATAL DOWNLOAD ERROR: ${errorMsg}`);
    finalStatus = 'Failed';
  
  } finally {
    // 7. Close streams
    resultsStream.end();

    // 8. Update job status
    await knex('download_jobs').where({ id: jobId }).update({
      status: finalStatus,
      progress: (finalStatus === 'Complete') ? (await knex('download_jobs').where({ id: jobId }).first()).total : undefined
    });

    // 9. Write the final audit log
    try {
      await axios.post(`${API_URL}/api/log`, {
        projectName, environment, userName,
        activityType: 'Download',
        logFile: `logs/${logFileName}`,
        resultFile: `results/${resultsFileName}`,
        executionTimestamp: formattedTimestamp.replace('_', ' ')
      });
    } catch (logError) {
      console.error("Failed to write final download log:", logError.message);
    }
    
    // 10. Close logger
    logger.end();
  }
}


// --- 3. runUploadJob ---
async function runUploadJob(jobId) {
  // 1. Get job data
  const job = await knex('upload_jobs').where({ id: jobId }).first();
  const { formData, filePath } = JSON.parse(job.form_data_json);
  const { projectName, environment, userName, cpiBaseUrl, tokenUrl, clientId, clientSecret, version = 'active' } = formData;

  // 2. Create logger and result file
  const executionTimestamp = new Date(job.created_at);
  const formattedTimestamp = getFormattedTimestamp(executionTimestamp);
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
    // 3. Update job to 'Running'
    await knex('upload_jobs').where({ id: jobId }).update({
      status: 'Running',
      log_file_path: `logs/${logFileName}`,
      result_file_path: `results/${resultsFileName}`
    });

    // 4. Get Auth Token
    logger.info('Getting Auth Token...');
    const tokenAuth = { username: clientId, password: clientSecret };
    const tokenBody = new URLSearchParams();
    tokenBody.append('grant_type', 'client_credentials');
    const tokenResponse = await axios.post(tokenUrl, tokenBody, {
      auth: tokenAuth, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const accessToken = tokenResponse.data.access_token;
    logger.info('Auth Token acquired.');

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

    // 6. Parse CSV and get total
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
        await knex('upload_jobs').where({ id: jobId }).update({ progress: progress });
      }
    }

    // 8. Finish Job
    logger.info('Upload processing complete.');
    finalStatus = 'Complete';

  } catch (jobError) {
    const errorMsg = jobError.response ? JSON.stringify(jobError.response.data) : jobError.message;
    logger.error(`FATAL UPLOAD ERROR: ${errorMsg}`);
    finalStatus = 'Failed';
  
  } finally {
    // 9. Close streams
    resultsStream.end();
    fs.unlinkSync(filePath);

    // 10. Update job status
    await knex('upload_jobs').where({ id: jobId }).update({
      status: finalStatus,
      progress: (finalStatus === 'Complete') ? (await knex('upload_jobs').where({ id: jobId }).first()).total : undefined
    });

    // 11. FINAL LOGGING STEP
    try {
      // --- 👇 USE THE IMPORTED API_URL ---
      await axios.post(`${API_URL}/api/log`, {
        projectName, environment, userName,
        activityType: 'Upload',
        logFile: `logs/${logFileName}`,
        resultFile: `results/${resultsFileName}`,
        executionTimestamp: formattedTimestamp.replace('_', ' ')
      });
    } catch (logError) {
      console.error("Failed to write final upload log:", logError.message);
    }
    
    // 12. Close logger
    logger.end();
  }
}


// --- 4. Export the job functions ---
module.exports = {
  runDownloadJob,
  runUploadJob,
};