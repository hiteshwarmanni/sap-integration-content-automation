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
      table.string('activityType'); // 'Download' or 'Upload'
      table.string('timestamp');    // The final human-readable timestamp
      table.string('logFile');      // Path to the server execution log
      table.string('resultFile');   // Path to the upload results CSV
    });
    console.log("'logs' table created.");
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
}

module.exports = { knex, setupDatabase };