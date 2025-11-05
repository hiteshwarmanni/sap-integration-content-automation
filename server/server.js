// server/server.js
const express = require('express');
const cors = require('cors');
const { setupDatabase } = require('./db.js');
const { defineRoutes } = require('./routes.js');

const app = express();
const PORT = 3001;

// --- 1. Setup Middleware ---
app.use(cors());
app.use(express.json());

// --- 2. Define All Routes ---
// Pass the 'app' instance to our routes file
defineRoutes(app);

// --- 3. Start the server ---
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Initialize the database
  setupDatabase();
});