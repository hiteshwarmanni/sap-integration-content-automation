// server/server.js
const express = require('express');
const cors = require('cors');
const { knex, setupDatabase } = require('./db.js');

const app = express();
const PORT = 3001; // We'll run the server on 3001

app.use(cors()); // Allow requests from our React app
app.use(express.json()); // Allow it to read JSON bodies

// --- API Endpoints Will Go Here ---

// Example: Log an activity
app.post('/api/log', async (req, res) => {
  try {
    const { projectName, environment, userName, activityType } = req.body;
    
    await knex('logs').insert({
      projectName,
      environment,
      userName,
      activityType
    });
    
    res.status(201).json({ message: 'Log created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  setupDatabase(); // Initialize the database
});