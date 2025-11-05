// server/utils.js
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const multer = require('multer');

// --- 1. Setup Directories ---
const logsDir = path.join(__dirname, 'logs');
const uploadsDir = path.join(__dirname, 'uploads');
const resultsDir = path.join(__dirname, 'results');
[logsDir, uploadsDir, resultsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// --- 2. Multer Setup (for file uploads) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// --- 3. Logger Format ---
const loggerFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
);

// --- 4. Timestamp Helper ---
function getFormattedTimestamp(date) {
  const pad = (num) => (num < 10 ? '0' : '') + num;
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

// --- 5. CSV Helper ---
function escapeCSV(cell) {
  if (cell === null || typeof cell === 'undefined') return "";
  let str = String(cell);
  if (str.includes(',') || str.includes('\"') || str.includes('\n')) {
    str = str.replace(/\"/g, '\"\"');
    return `"${str}"`;
  }
  return str;
}

// --- 6. Export everything ---
module.exports = {
  logsDir,
  resultsDir,
  upload,
  loggerFormat,
  getFormattedTimestamp,
  escapeCSV,
  path,
  fs,
  winston,
  axios: require('axios'),
  csv: require('csv-parser'),
};