// server/db.js
const knex = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: './logs.db', // This file will be created
  },
  useNullAsDefault: true,
});

// Create the 'logs' table if it doesn't exist
async function setupDatabase() {
  const tableExists = await knex.schema.hasTable('logs');
  if (!tableExists) {
    console.log('Creating logs table...');
    await knex.schema.createTable('logs', (table) => {
      table.increments('id').primary();
      table.string('projectName');
      table.string('environment');
      table.string('userName');
      table.string('activityType'); // e.g., "Download", "Upload"
      table.timestamp('timestamp').defaultTo(knex.fn.now());
    });
    console.log('Logs table created.');
  }
}

module.exports = { knex, setupDatabase };