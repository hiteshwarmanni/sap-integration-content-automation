// client/src/config.js
// Simple API URL configuration that works in both environments

// In production (BTP): window.location.origin returns the BTP app URL
// In development: Vite proxy or explicit localhost URL

const isDevelopment = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

const API_URL = isDevelopment
    ? 'http://localhost:3001'  // Local development backend
    : window.location.origin;   // Production (BTP) - same origin as frontend

export { API_URL };
