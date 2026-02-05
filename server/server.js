// server/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const xsenv = require('@sap/xsenv');
const { initializeHanaConnection } = require('./db-hana.js');
const { initializeAuthentication } = require('./auth-middleware.js');
const { defineRoutes } = require('./routes/index.js');
const { initCloudLogging, logInfo, logError, logCritical } = require('./cloud-logger.js');

const app = express();

// Determine if running locally or in Cloud Foundry
const isLocal = !process.env.VCAP_APPLICATION;
const PORT = process.env.PORT || 3001;

// --- Initialize Cloud Logging ---
initCloudLogging();

// --- 1. Setup Middleware ---
app.use(cors());
app.use(express.json());

// --- 2. Initialize Authentication ---
if (!isLocal) {
  initializeAuthentication(app);
  logInfo('Authentication middleware initialized');
} else {
  logInfo('Running in local mode - authentication disabled');
}

// --- 3. Health check endpoint (before authentication) ---
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// --- 4. Define All Routes ---
defineRoutes(app);

// --- 5. Handle 404 for backend - Do not serve frontend ---
if (!isLocal) {
  app.use((req, res) => {
    res.status(404).json({
      error: 'Cannot GET ' + req.path,
      message: 'This is the backend API server. Please access the application through the approuter.',
      timestamp: new Date().toISOString()
    });
  });
} else {
  // In local development, serve the React app
  const clientPath = path.join(__dirname, '../client/dist');
  app.use(express.static(clientPath));
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// --- 7. Initialize database and start server ---
async function startServer() {
  try {
    if (!isLocal) {
      // Initialize HANA connection in Cloud Foundry
      await initializeHanaConnection();
      logInfo('Connected to SAP HANA Cloud', { database: 'HANA' });
    } else {
      // In local mode, use the old SQLite setup
      const { setupDatabase } = require('./db.js');
      await setupDatabase();
      logInfo('Using SQLite database (local mode)', { database: 'SQLite' });
    }

    app.listen(PORT, () => {
      logInfo('Server started successfully', {
        port: PORT,
        environment: isLocal ? 'Local' : 'Cloud Foundry',
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    logCritical('Failed to start server', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logCritical('Uncaught Exception', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logCritical('Unhandled Promise Rejection', { reason, promise: promise.toString() });
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logInfo('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logInfo('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

startServer();
