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
      table.string('status'); // <-- ADDED THIS COLUMN
    });
    console.log("'logs' table created.");
  } else {
    // --- Add column if it doesn't exist ---
    const colExists = await knex.schema.hasColumn('logs', 'status');
    if (!colExists) {
      console.log("Adding 'status' column to 'logs' table...");
      await knex.schema.alterTable('logs', (table) => {
        table.string('status');
      });
      console.log("'status' column added.");
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
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    console.log("'upload_jobs' table created.");
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
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    console.log("'download_jobs' table created.");
  }

}



module.exports = { knex, setupDatabase };