// client/src/App.jsx
import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import axios from 'axios';

// API URL for our server
const API_URL = 'http://localhost:3001';

// --- 1. Define Your Pages ---

function HomePage() {
  return (
    <div className="page-content">
      <h2>Welcome to the SAP Automation Tool</h2>
      <p>Select an action from the menu to begin.</p>
    </div>
  );
}

// --- 👇 Download Page (Updated) ---
function DownloadPage() {
  // --- Create initial empty state for reset ---
  const initialFormState = {
    projectName: '',
    environment: '',
    userName: '',
    cpiBaseUrl: '',
    tokenUrl: '',
    clientId: '',
    clientSecret: ''
  };

  const [formData, setFormData] = useState(initialFormState); // <-- Use initial state
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Generic handler to update state from any input
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  // --- 👇 Form submission handler (Updated) ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMessage('');

    // 1. Log the activity (no change)
    try {
      await axios.post(`${API_URL}/api/log`, {
        projectName: formData.projectName,
        environment: formData.environment,
        userName: formData.userName,
        activityType: 'Download'
      });
    } catch (logError) {
      console.warn('Logging failed:', logError.message);
    }

    // 2. Call the main download endpoint
    try {
      const response = await axios.post(
        `${API_URL}/api/v1/run-download`,
        formData,
        { responseType: 'blob' }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // --- 👇 NEW: Dynamic Filename Logic ---
      const { projectName, environment } = formData;
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const timestamp = new Date().toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
      
      // --- 👇 THIS IS THE FILENAME CHANGE ---
      const filename = `${projectName}_${environment}_configurations_${date}_${timestamp}.csv`;
      
      link.setAttribute('download', filename);
      
      document.body.appendChild(link);
      link.click();
      
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setSuccessMessage(`Success! File downloaded as: ${filename}`);

    } catch (apiError) {
      // ... (error handling is the same) ...
      console.error('Download Error:', apiError);
      if (apiError.response && apiError.response.data) {
        const errorText = await apiError.response.data.text();
        const errorJson = JSON.parse(errorText);
        setError(`Error: ${errorJson.error}`);
      } else {
        setError('An unknown error occurred. Check the server console.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // --- 👇 NEW: Reset Button Handler ---
  const handleReset = () => {
    setFormData(initialFormState);
    setError('');
    setSuccessMessage('');
  };

  return (
    <div className="page-content">
      <h2>Download Configuration</h2>
      
      {/* --- Status & Progress Section (No changes) --- */}
      <div className="status-container">
        {isLoading && (
          <div className="progress-bar-container">
            <span>Processing request... this may take a moment.</span>
            <progress className="progress-bar"></progress>
          </div>
        )}
        {successMessage && <div className="form-success">{successMessage}</div>}
        {error && <div className="form-error">{error}</div>}
      </div>
      
      <form className="modern-form" onSubmit={handleSubmit}>
        {/* --- All form-group divs (No changes) --- */}
        <div className="form-group">
          <label>Project Name *</label>
          <input 
            type="text" 
            name="projectName"
            value={formData.projectName}
            onChange={handleInputChange}
            placeholder="e.g., MyCPIProject" 
            required 
            disabled={isLoading}
          />
        </div>
        <div className="form-group">
          <label>Environment *</label>
          <input 
            type="text" 
            name="environment"
            value={formData.environment}
            onChange={handleInputChange}
            placeholder="e.g., Development" 
            required 
            disabled={isLoading}
          />
        </div>
        <div className="form-group">
          <label>User Name</label>
          <input 
            type="text" 
            name="userName"
            value={formData.userName}
            onChange={handleInputChange}
            placeholder="Your name or S-User" 
            disabled={isLoading}
          />
        </div>
        <div className="form-group">
          <label>CPI Base URL *</label>
          <input 
            type="text" 
            name="cpiBaseUrl"
            value={formData.cpiBaseUrl}
            onChange={handleInputChange}
            placeholder="https://your-tenant.api.sap" 
            required 
            disabled={isLoading}
          />
        </div>
        <div className="form-group">
          <label>Token URL *</label>
          <input 
            type="text" 
            name="tokenUrl"
            value={formData.tokenUrl}
            onChange={handleInputChange}
            placeholder="https://your-tenant.authentication.sap" 
            required 
            disabled={isLoading}
          />
        </div>
        <div className="form-group">
          <label>Client ID *</label>
          <input 
            type="text" 
            name="clientId"
            value={formData.clientId}
            onChange={handleInputChange}
            required 
            disabled={isLoading}
          />
        </div>
        <div className="form-group">
          <label>Client Secret *</label>
          <input 
            type="password"
            name="clientSecret"
            value={formData.clientSecret}
            onChange={handleInputChange}
            required 
            disabled={isLoading}
          />
        </div>
        
        {/* --- 👇 NEW: Button Group --- */}
        <div className="button-group">
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Downloading...' : 'Download Config'}
          </button>
          
          {/* --- 👇 NEW: Reset Button --- */}
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={handleReset} 
            disabled={isLoading}
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
// --- End of Download Page ---

function UploadPage() {
  // ... (UploadPage code remains the same) ...
  return (
    <div className="page-content">
      <h2>Upload Configuration</h2>
      <form className="modern-form">
        {/* ... (all form-group divs) ... */}
        <div className="form-group">
          <label>Project Name</label>
          <input type="text" placeholder="e.g., MyCPIProject" />
        </div>
        <div className="form-group">
          <label>Environment</label>
          <input type="text" placeholder="e.g., Development" />
        </div>
        <div className="form-group">
          <label>User Name</label>
          <input type="text" placeholder="Your name or S-User" />
        </div>
        <div className="form-group">
          <label>CPI Base URL</label>
          <input type="text" placeholder="https://your-tenant.api.sap" />
        </div>
        <div className="form-group">
          <label>Token URL</label>
          <input type="text" placeholder="https://your-tenant.authentication.sap" />
        </div>
        <div className="form-group">
          <label>Client ID</label>
          <input type="text" />
        </div>
        <div className="form-group">
          <label>Client Secret</label>
          <input type="password" />
        </div>
        <div className="form-group">
          <label>Upload CSV File</label>
          <input type="file" accept=".csv" />
        </div>
        <button type="submit" className="btn-primary">Upload Config</button>
      </form>
    </div>
  );
}

// --- Main App Layout (No changes) ---
function App() {
  const [sideNavOpen, setSideNavOpen] = useState(true);

  return (
    <BrowserRouter>
      <div className="app-container">
        {/* ... (header) ... */}
        <header className="app-header">
          <button className="menu-btn" onClick={() => setSideNavOpen(!sideNavOpen)}>
            ☰
          </button>
          <h1>SAP Integration Suite Automation</h1>
        </header>
        
        <div className="app-body">
          {/* ... (nav) ... */}
          <nav className="app-nav" style={{ width: sideNavOpen ? '240px' : '0' }}>
            <NavLink to="/">Home</NavLink>
            <NavLink to="/download">Download Config</NavLink>
            <NavLink to="/upload">Upload Config</NavLink>
          </nav>
          
          <main className="app-main">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/download" element={<DownloadPage />} />
              <Route path="/upload" element={<UploadPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;