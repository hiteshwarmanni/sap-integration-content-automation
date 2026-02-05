// server/db.js
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
    console.log("Creating 'logs' table...");
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
    console.log("'logs' table created.");
  } else {
    // --- Add columns if they don't exist ---
    const statusExists = await knex.schema.hasColumn('logs', 'status');
    if (!statusExists) {
      console.log("Adding 'status' column to 'logs' table...");
      await knex.schema.alterTable('logs', (table) => {
        table.string('status');
      });
      console.log("'status' column added.");
    }

    const logContentExists = await knex.schema.hasColumn('logs', 'logContent');
    if (!logContentExists) {
      console.log("Adding 'logContent' column to 'logs' table...");
      await knex.schema.alterTable('logs', (table) => {
        table.text('logContent');
      });
      console.log("'logContent' column added.");
    }

    const resultContentExists = await knex.schema.hasColumn('logs', 'resultContent');
    if (!resultContentExists) {
      console.log("Adding 'resultContent' column to 'logs' table...");
      await knex.schema.alterTable('logs', (table) => {
        table.text('resultContent');
      });
      console.log("'resultContent' column added.");
    }

    const artifactCountExists = await knex.schema.hasColumn('logs', 'artifactCount');
    if (!artifactCountExists) {
      console.log("Adding 'artifactCount' column to 'logs' table...");
      await knex.schema.alterTable('logs', (table) => {
        table.string('artifactCount');
      });
      console.log("'artifactCount' column added.");
    }

    const parameterCountExists = await knex.schema.hasColumn('logs', 'parameterCount');
    if (!parameterCountExists) {
      console.log("Adding 'parameterCount' column to 'logs' table...");
      await knex.schema.alterTable('logs', (table) => {
        table.string('parameterCount');
      });
      console.log("'parameterCount' column added.");
    }

    const timeTakenSecondsExists = await knex.schema.hasColumn('logs', 'timeTakenSeconds');
    if (!timeTakenSecondsExists) {
      console.log("Adding 'timeTakenSeconds' column to 'logs' table...");
      await knex.schema.alterTable('logs', (table) => {
        table.integer('timeTakenSeconds');
      });
      console.log("'timeTakenSeconds' column added.");
    }
  }

  // --- 2. Create the new 'upload_jobs' table ---
  const jobsTableExists = await knex.schema.hasTable('upload_jobs');
  if (!jobsTableExists) {
    console.log("Creating 'upload_jobs' table...");
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
    console.log("'upload_jobs' table created.");
  } else {
    // Add log_id column if it doesn't exist
    const logIdExists = await knex.schema.hasColumn('upload_jobs', 'log_id');
    if (!logIdExists) {
      console.log("Adding 'log_id' column to 'upload_jobs' table...");
      await knex.schema.alterTable('upload_jobs', (table) => {
        table.integer('log_id');
      });
      console.log("'log_id' column added.");
    }
  }

  // --- 3. Create the new 'download_jobs' table ---
  const downloadJobsTableExists = await knex.schema.hasTable('download_jobs');
  if (!downloadJobsTableExists) {
    console.log("Creating 'download_jobs' table...");
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
    console.log("'download_jobs' table created.");
  } else {
    // Add log_id column if it doesn't exist
    const logIdExists = await knex.schema.hasColumn('download_jobs', 'log_id');
    if (!logIdExists) {
      console.log("Adding 'log_id' column to 'download_jobs' table...");
      await knex.schema.alterTable('download_jobs', (table) => {
        table.integer('log_id');
      });
      console.log("'log_id' column added.");
    }
  }

  // --- 4. Create the 'projects' table ---
  const projectsTableExists = await knex.schema.hasTable('projects');
  if (!projectsTableExists) {
    console.log("Creating 'projects' table...");
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
    console.log("'projects' table created.");
  }

}



module.exports = { knex, setupDatabase };
