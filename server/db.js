// server/db.js
const { logInfo, logError, logDebug } = require('./cloud-logger');

const knex = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: './logs.db',
  },
  useNullAsDefault: true,
});

async function setupDatabase() {
  // --- 1. Create the main 'logs' table (Simplified) ---
  const logsTableExists = await knex.schema.hasTable('logs');
  if (!logsTableExists) {
    await knex.schema.createTable('logs', (table) => {
      table.increments('id').primary();
      table.string('projectName');
      table.string('environment');
      table.string('userName');
      table.string('activityType');
      table.string('timestamp');
      table.string('logFile');
      table.string('resultFile');
      table.string('status');
      table.text('logContent');      // Store log content
      table.text('resultContent');   // Store result content
    });
    logInfo("Database initialized", { table: 'logs' });
  } else {
    // --- Add columns if they don't exist ---
    const statusExists = await knex.schema.hasColumn('logs', 'status');
    if (!statusExists) {
      await knex.schema.alterTable('logs', (table) => {
        table.string('status');
      });
    }

    const logContentExists = await knex.schema.hasColumn('logs', 'logContent');
    if (!logContentExists) {
      await knex.schema.alterTable('logs', (table) => {
        table.text('logContent');
      });
    }

    const resultContentExists = await knex.schema.hasColumn('logs', 'resultContent');
    if (!resultContentExists) {
      await knex.schema.alterTable('logs', (table) => {
        table.text('resultContent');
      });
    }

    const artifactCountExists = await knex.schema.hasColumn('logs', 'artifactCount');
    if (!artifactCountExists) {
      await knex.schema.alterTable('logs', (table) => {
        table.string('artifactCount');
      });
    }

    const parameterCountExists = await knex.schema.hasColumn('logs', 'parameterCount');
    if (!parameterCountExists) {
      await knex.schema.alterTable('logs', (table) => {
        table.string('parameterCount');
      });
    }

    const timeTakenSecondsExists = await knex.schema.hasColumn('logs', 'timeTakenSeconds');
    if (!timeTakenSecondsExists) {
      await knex.schema.alterTable('logs', (table) => {
        table.integer('timeTakenSeconds');
      });
    }
  }

  // --- 2. Create the new 'upload_jobs' table ---
  const jobsTableExists = await knex.schema.hasTable('upload_jobs');
  if (!jobsTableExists) {
    await knex.schema.createTable('upload_jobs', (table) => {
      table.increments('id').primary();
      table.string('status'); // Pending, Running, Complete, Failed
      table.integer('progress');
      table.integer('total');
      table.string('log_file_path');    // Path to the server execution log
      table.string('result_file_path'); // Path to the results CSV
      table.string('temp_upload_path'); // Path to the user's uploaded CSV
      table.text('form_data_json');   // Stores all form data (credentials, etc.)
      table.integer('log_id');          // Foreign key to logs table
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    logInfo("Database initialized", { table: 'upload_jobs' });
  } else {
    // Add log_id column if it doesn't exist
    const logIdExists = await knex.schema.hasColumn('upload_jobs', 'log_id');
    if (!logIdExists) {
      await knex.schema.alterTable('upload_jobs', (table) => {
        table.integer('log_id');
      });
    }
  }

  // --- 3. Create the new 'download_jobs' table ---
  const downloadJobsTableExists = await knex.schema.hasTable('download_jobs');
  if (!downloadJobsTableExists) {
    await knex.schema.createTable('download_jobs', (table) => {
      table.increments('id').primary();
      table.string('status'); // Pending, Running, Complete, Failed
      table.integer('progress'); // e.g., 300
      table.integer('total');    // e.g., 1000
      table.string('log_file_path');
      table.string('result_file_path'); // Path to the final CSV
      table.text('form_data_json');   // Stores credentials
      table.integer('log_id');          // Foreign key to logs table
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    logInfo("Database initialized", { table: 'download_jobs' });
  } else {
    // Add log_id column if it doesn't exist
    const logIdExists = await knex.schema.hasColumn('download_jobs', 'log_id');
    if (!logIdExists) {
      await knex.schema.alterTable('download_jobs', (table) => {
        table.integer('log_id');
      });
    }
  }

  // --- 4. Create the 'projects' table ---
  const projectsTableExists = await knex.schema.hasTable('projects');
  if (!projectsTableExists) {
    await knex.schema.createTable('projects', (table) => {
      table.increments('id').primary();
      table.string('projectName', 100).notNullable();
      table.string('environment', 50).notNullable();
      table.string('cpiBaseUrl', 500).notNullable();
      table.string('tokenUrl', 500).notNullable();
      table.string('clientId', 200).notNullable();
      table.string('clientSecret', 500).notNullable();
      table.text('projectMembers'); // JSON string of member emails/IDs
      table.string('createdBy', 200);
      table.timestamp('createdAt').defaultTo(knex.fn.now());
      table.string('updatedBy', 200);
      table.timestamp('updatedAt').defaultTo(knex.fn.now());
      table.unique(['projectName', 'environment']);
    });
    logInfo("Database initialized", { table: 'projects' });
  }

  // --- 5. Create the 'cleanup_logs' table ---
  const cleanupLogsTableExists = await knex.schema.hasTable('cleanup_logs');
  if (!cleanupLogsTableExists) {
    await knex.schema.createTable('cleanup_logs', (table) => {
      table.increments('id').primary();
      table.timestamp('executionTimestamp');
      table.string('status', 50);
      table.integer('logsCleanedCount');
      table.text('message');
      table.integer('durationSeconds');
      table.timestamp('cutoffDate');
      table.string('errorMessage', 1000);
      table.string('executedBy', 200);
      table.timestamp('createdAt').defaultTo(knex.fn.now());
    });
    logInfo("Database initialized", { table: 'cleanup_logs' });
  } else {
    // Migration: add executedBy column if it doesn't exist (for existing databases)
    const executedByExists = await knex.schema.hasColumn('cleanup_logs', 'executedBy');
    if (!executedByExists) {
      await knex.schema.alterTable('cleanup_logs', (table) => {
        table.string('executedBy', 200);
      });
      logInfo("Database migrated", { table: 'cleanup_logs', addedColumn: 'executedBy' });
    }
  }

  // --- 6. Create the 'transport_jobs' table ---
  const transportJobsTableExists = await knex.schema.hasTable('transport_jobs');
  if (!transportJobsTableExists) {
    await knex.schema.createTable('transport_jobs', (table) => {
      table.increments('id').primary();
      table.string('status');
      table.integer('progress');
      table.integer('total');
      table.text('form_data_json');
      table.string('result_file_path');
      table.string('progress_message');
      table.integer('log_id');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    logInfo("Database initialized", { table: 'transport_jobs' });
  }

  // --- 7. Create the 'transport_logs' table ---
  const transportLogsTableExists = await knex.schema.hasTable('transport_logs');
  if (!transportLogsTableExists) {
    await knex.schema.createTable('transport_logs', (table) => {
      table.increments('id').primary();
      table.string('projectName');
      table.string('environment');
      table.string('userName');
      table.string('timestamp');
      table.string('status');
      table.string('sourcePackageId');
      table.string('sourceIflowId');
      table.string('sourceIflowName');
      table.string('targetPackageId');
      table.string('targetIflowId');
      table.string('targetIflowName');
      table.integer('timeTakenSeconds');
      table.text('errorMessage');
      table.text('errorDetails');
      table.text('failedStep');
      table.text('errorStackTrace');
      table.text('logContent');
      table.text('resultContent');
      table.timestamp('createdAt').defaultTo(knex.fn.now());
    });
    logInfo("Database initialized", { table: 'transport_logs' });
  }

}

// Get project by name and environment
async function getProjectByNameAndEnv(projectName, environment) {
  try {
    const project = await knex('projects')
      .where({ projectName, environment })
      .first();
    return project || null;
  } catch (error) {
    logError('Error getting project by name and environment', error);
    throw error;
  }
}

module.exports = { knex, setupDatabase, getProjectByNameAndEnv };
