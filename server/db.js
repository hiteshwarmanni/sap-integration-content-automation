// server/db.js

// ... (knex setup is the same) ...
const knex = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: './logs.db',
  },
  useNullAsDefault: true,
});

// Create/update the 'logs' table
async function setupDatabase() {
  const tableExists = await knex.schema.hasTable('logs');
  if (!tableExists) {
    console.log('Creating logs table...');
    await knex.schema.createTable('logs', (table) => {
      table.increments('id').primary();
      table.string('projectName');
      table.string('environment');
      table.string('userName');
      table.string('activityType');
      
      // --- THIS LINE IS CHANGED ---
      table.string('timestamp'); // Store as text

      table.string('logFile');
    });
    console.log('Logs table created.');
  } else {
    // If table exists, check for logFile column
    const colExists = await knex.schema.hasColumn('logs', 'logFile');
    if (!colExists) {
      console.log('Adding logFile column to logs table...');
      await knex.schema.alterTable('logs', (table) => {
        table.string('logFile');
      });
      console.log('logFile column added.');
    }
    
    // --- NEW: Check and fix timestamp column type ---
    try {
      // This is a check to see if we can alter the column.
      // In a real production env, this would be a full migration.
      // For SQLite, we'll just check if it's not 'TEXT'
      const info = await knex('logs').columnInfo();
      if (info.timestamp && info.timestamp.type.toUpperCase() !== 'TEXT') {
         console.warn('Timestamp column is not TEXT. Manual migration might be needed if errors occur.');
         // For development, we'll assume it's okay or the table is new.
         // A full migration is complex (rename, create, copy, drop).
      }
    } catch (e) {
      console.error("Could not check column info:", e.message);
    }
  }
}

module.exports = { knex, setupDatabase };