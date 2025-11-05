// client/src/App.jsx
import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import axios from 'axios';

// API URL for our server
const API_URL = 'http://localhost:3001';

// --- 1. Define Your Pages ---

// --- 👇 HomePage (Updated with Instructions) ---
function HomePage() {
  return (
    <div className="page-content">
      <h2>Welcome to the SAP Automation Tool</h2>
      <p style={{ textAlign: 'center', marginBottom: '2rem' }}>
        This tool automates managing SAP CPI iFlow configurations.
      </p>

      {/* --- Card 1: What it Does --- */}
      <div className="info-card">
        <h3>What This App Does</h3>
        <ul className="info-list">
          <li>
            <strong>Download Config:</strong>
            <p>
              Batch-downloads all iFlow parameters from your tenant into a single CSV file. This is perfect for backups, audits, or preparing for a bulk update.
            </p>
          </li>
          <li>
            <strong>Upload Config:</strong>
            <p>
              Updates iFlow parameters in bulk by uploading a modified CSV file. This saves hours of manual copy-pasting in the CPI interface.
            </p>
          </li>
        </ul>
      </div>

      {/* --- Card 2: Credentials Format --- */}
      <div className="info-card">
        <h3>Credentials Format</h3>
        <p>Both tools require the same credentials from your SAP BTP service key for the **Process Integration Runtime** (api-access) plan.</p>
        <ul className="info-list">
          <li>
            <strong>CPI Base URL:</strong> The <code>url</code> from the <code>api</code> section of your service key.
            <br />
            <em>Example: <code>https://your-tenant.api.sap</code></em>
          </li>
          <li>
            <strong>Token URL:</strong> The <code>url</code> from the <code>uaa</code> section of your service key, with <code>/oauth/token</code> appended.
            <br />
            <em>Example: <code>https://your-tenant.authentication.sap/oauth/token</code></em>
          </li>
          <li>
            <strong>Client ID:</strong> The <code>clientid</code> from the service key.
          </li>
          <li>
            <strong>Client Secret:</strong> The <code>clientsecret</code> from the service key.
          </li>
        </ul>
      </div>

      {/* --- Card 3: CSV Format --- */}
      <div className="info-card">
        <h3>CSV File Format</h3>
        <p>
          The <strong>Upload Config</strong> tool requires a specific CSV format. The easiest way to get this is to first use the <strong>Download Config</strong> tool.
        </p>
        <p>
          The file you download is the perfect template to use for your uploads.
        </p>
      </div>
    </div>
  );
}
// --- End of HomePage ---

// --- 👇 Download Page (Updated to Job System) ---
function DownloadPage() {
  const initialFormState = {
    projectName: '', environment: '', userName: '',
    cpiBaseUrl: '', tokenUrl: '', clientId: '', clientSecret: ''
  };

  const [formData, setFormData] = useState(initialFormState);
  
  // --- State for Job Management ---
  const [jobId, setJobId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [jobStatus, setJobStatus] = useState(null); // Will hold { status, progress, total, resultFile }
  const [pollInterval, setPollInterval] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({ ...prevState, [name]: value }));
  };

  // --- Polling Function ---
  const pollJobStatus = (id) => {
    const interval = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/v1/download-job-status/${id}`);
        setJobStatus({ ...data, jobId: id }); 

        if (data.status === 'Complete' || data.status === 'Failed') {
          clearInterval(interval);
          setPollInterval(null);
          setIsLoading(false);
          if(data.status === 'Failed') {
            setError('Job failed. Check logs for details.');
          }
        }
      } catch (pollError) {
        setError('Error checking job status.');
        clearInterval(interval);
        setPollInterval(null);
        setIsLoading(false);
      }
    }, 2000); // Poll every 2 seconds
    setPollInterval(interval);
  };

  // --- Form submission handler ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setJobStatus(null);
    if(pollInterval) clearInterval(pollInterval);

    try {
      // 1. Start the job
      const { data } = await axios.post(
        `${API_URL}/api/v1/start-download-job`,
        formData // Send form data as JSON
      );
      
      // 2. Start polling
      setJobId(data.jobId);
      pollJobStatus(data.jobId);
      
    } catch (apiError) {
      console.error('Download Start Error:', apiError);
      if (apiError.response && apiError.response.data) {
        setError(`Error: ${apiError.response.data.error}`);
      } else {
        setError('An unknown error occurred. Check the server console.');
      }
      setIsLoading(false);
    }
  };

  // --- Reset Button Handler ---
  const handleReset = () => {
    setFormData(initialFormState);
    setError('');
    setJobId(null);
    setJobStatus(null);
    setIsLoading(false);
    if(pollInterval) clearInterval(pollInterval);
  };
  
  return (
    <div className="page-content">
      <h2>Download Configuration</h2>
      
      {/* --- Status & Progress Section --- */}
      <div className="status-container">
        {/* Progress Bar */}
        {isLoading && jobStatus && jobStatus.status === 'Running' && (
          <div className="progress-bar-container">
            <span>{`Processing: ${jobStatus.progress} / ${jobStatus.total} packages...`}</span>
            <progress className="progress-bar" value={jobStatus.progress} max={jobStatus.total}></progress>
          </div>
        )}
        {isLoading && !jobStatus && (
          <div className="progress-bar-container">
            <span>Starting job...</span>
            <progress className="progress-bar"></progress>
          </div>
        )}
        
        {/* Download Link */}
        {jobStatus && jobStatus.status === 'Complete' && (
          <div className="form-success">
            Job complete! 
            <a href={`${API_URL}/api/v1/get-download-result/${jobStatus.jobId}`} className="download-link">Download Config CSV</a>
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
      </div>
      
      {/* Form (no change) */}
      <form className="modern-form" onSubmit={handleSubmit}>
          {/* ... (all form-group divs) ... */}
          <div className="form-group">
            <label>Project Name *</label>
            <input 
              type="text" name="projectName"
              value={formData.projectName} onChange={handleInputChange}
              placeholder="e.g., MyCPIProject" 
              required disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>Environment *</label>
            <input 
              type="text" name="environment"
              value={formData.environment} onChange={handleInputChange}
              placeholder="e.g., Development" 
              required disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>User Name</label>
            <input 
              type="text" name="userName"
              value={formData.userName} onChange={handleInputChange}
              placeholder="Your name or S-User" 
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>CPI Base URL *</label>
            <input 
              type="text" name="cpiBaseUrl"
              value={formData.cpiBaseUrl} onChange={handleInputChange}
              placeholder="https://your-tenant.api.sap" 
              required disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>Token URL *</label>
            <input 
              type="text" name="tokenUrl"
              value={formData.tokenUrl} onChange={handleInputChange}
              placeholder="https://your-tenant.authentication.sap" 
              required disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>Client ID *</label>
            <input 
              type="text" name="clientId"
              value={formData.clientId} onChange={handleInputChange}
              placeholder="Copy from service key" 
              required disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>Client Secret *</label>
            <input 
              type="password" name="clientSecret"
              value={formData.clientSecret} onChange={handleInputChange}
              placeholder="Copy from service key" 
              required disabled={isLoading}
            />
          </div>

        <div style={{ marginBottom: '1.5rem' }}></div> 

        <div className="button-group">
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Downloading...' : 'Download Config'}
          </button>
          
          <button type="button" className="btn-secondary" onClick={handleReset} disabled={isLoading}>
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
// --- End of Download Page ---

// --- 👇 Upload Page (Updated with jobStatus fix) ---
function UploadPage() {
  const initialFormState = {
    projectName: '', environment: '', userName: '',
    cpiBaseUrl: '', tokenUrl: '', clientId: '', clientSecret: ''
  };

  const [formData, setFormData] = useState(initialFormState);
  const [file, setFile] = useState(null);
  
  // We no longer need a separate jobId state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [jobStatus, setJobStatus] = useState(null); // Will hold { jobId, status, progress, total, resultFile }
  const [pollInterval, setPollInterval] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({ ...prevState, [name]: value }));
  };

  const handleFileChange = (e) => {
    if (e.target.files) setFile(e.target.files[0]);
  };

  // --- Polling Function (Updated) ---
  const pollJobStatus = (id) => { // 'id' is the jobId
    const interval = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/v1/job-status/${id}`);
        
        // --- THIS IS THE FIX ---
        // We add the jobId to the status object we save
        setJobStatus({ ...data, jobId: id }); 
        // --- END OF FIX ---

        if (data.status === 'Complete' || data.status === 'Failed') {
          clearInterval(interval);
          setPollInterval(null);
          setIsLoading(false);
          if(data.status === 'Failed') {
            setError('Job failed. Check logs for details.');
          }
        }
      } catch (pollError) {
        setError('Error checking job status.');
        clearInterval(interval);
        setPollInterval(null);
        setIsLoading(false);
      }
    }, 2000);
    setPollInterval(interval);
  };

  // --- Form submission handler ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a CSV file to upload.');
      return;
    }
    
    setIsLoading(true);
    setError('');
    setJobStatus(null);
    if(pollInterval) clearInterval(pollInterval);

    const uploadData = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      uploadData.append(key, value);
    });
    uploadData.append('file', file);

    try {
      // 1. Start the job
      const { data } = await axios.post(`${API_URL}/api/v1/run-upload`, uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      // 2. Start polling
      pollJobStatus(data.jobId);
      
    } catch (apiError) {
      console.error('Upload Error:', apiError);
      if (apiError.response && apiError.response.data) {
        setError(`Error: ${apiError.response.data.error}`);
      } else {
        setError('An unknown error occurred. Check the server console.');
      }
      setIsLoading(false);
    }
  };

  // --- Reset Button Handler ---
  const handleReset = () => {
    setFormData(initialFormState);
    setFile(null);
    setError('');
    setJobStatus(null);
    setIsLoading(false);
    if(pollInterval) clearInterval(pollInterval);
    
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
  };
  
  return (
    <div className="page-content">
      <h2>Upload Configuration</h2>
      
      {/* --- Status & Progress Section --- */}
      <div className="status-container">
        {/* Progress Bar (no change) */}
        {isLoading && jobStatus && jobStatus.status === 'Running' && (
          <div className="progress-bar-container">
            <span>{`Processing: ${jobStatus.progress} / ${jobStatus.total} rows...`}</span>
            <progress className="progress-bar" value={jobStatus.progress} max={jobStatus.total}></progress>
          </div>
        )}
        {isLoading && !jobStatus && (
          <div className="progress-bar-container">
            <span>Starting job...</span>
            <progress className="progress-bar"></progress>
          </div>
        )}
        
        {/* --- Download Link (Updated) --- */}
        {jobStatus && jobStatus.status === 'Complete' && (
          <div className="form-success">
            Job complete! 
            {/* --- THIS IS THE FIX --- */}
            {/* We now read the jobId from the jobStatus object */}
            <a href={`${API_URL}/api/v1/get-result/${jobStatus.jobId}`} className="download-link">Download Results CSV</a>
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
      </div>
      
      {/* Form (no change) */}
      <form className="modern-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Project Name *</label>
            <input 
              type="text" name="projectName"
              value={formData.projectName} onChange={handleInputChange}
              placeholder="e.g., MyCPIProject" 
              required disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>Environment *</label>
            <input 
              type="text" name="environment"
              value={formData.environment} onChange={handleInputChange}
              placeholder="e.g., Development" 
              required disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>User Name</label>
            <input 
              type="text" name="userName"
              value={formData.userName} onChange={handleInputChange}
              placeholder="Your name or S-User" 
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>CPI Base URL *</label>
            <input 
              type="text" name="cpiBaseUrl"
              value={formData.cpiBaseUrl} onChange={handleInputChange}
              placeholder="https://your-tenant.api.sap" 
              required disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>Token URL *</label>
            <input 
              type="text" name="tokenUrl"
              value={formData.tokenUrl} onChange={handleInputChange}
              placeholder="https://your-tenant.authentication.sap" 
              required disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>Client ID *</label>
            <input 
              type="text" name="clientId"
              value={formData.clientId} onChange={handleInputChange}
              placeholder="Copy from service key" 
              required disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>Client Secret *</label>
            <input 
              type="password" name="clientSecret"
              value={formData.clientSecret} onChange={handleInputChange}
              placeholder="Copy from service key" 
              required disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>Upload CSV File *</label>
            <input 
              type="file" id="file-input" 
              accept=".csv" 
              onChange={handleFileChange} 
              required disabled={isLoading}
            />
          </div>

        <div style={{ marginBottom: '1.5rem' }}></div> 

        <div className="button-group">
          <button type="submit" className="btn-primary" disabled={isLoading || !file}>
            {isLoading ? 'Uploading...' : 'Upload Config'}
          </button>
          
          <button type="button" className="btn-secondary" onClick={handleReset} disabled={isLoading}>
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
// --- End of Upload Page ---



// --- 2. Build the Main App Layout (Updated) ---
function App() {
  const [sideNavOpen, setSideNavOpen] = useState(true);

  // --- NEW: Function to expand nav on icon click ---
  const handleNavClick = () => {
    if (!sideNavOpen) {
      setSideNavOpen(true);
    }
    // The NavLink will handle the page change automatically
  };

  return (
    <BrowserRouter>
      <div className="app-container">
        <header className="app-header">
          <button className="menu-btn" onClick={() => setSideNavOpen(!sideNavOpen)}>
            ☰
          </button>
          <h1>SAP Integration Suite Automation</h1>
        </header>
        
        <div className="app-body">
          
          <nav 
            className={`app-nav ${sideNavOpen ? '' : 'collapsed'}`} 
            style={{ width: sideNavOpen ? '240px' : '60px' }}
          >
            {/* --- SVG HOME ICON (No Change) --- */}
            <NavLink to="/" onClick={handleNavClick}>
              <span className="nav-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-svg">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
              </span>
              <span className="nav-text">Home</span>
            </NavLink>

            {/* --- 👇 NEW SVG DOWNLOAD ICON --- */}
            <NavLink to="/download" onClick={handleNavClick}>
              <span className="nav-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-svg">
                  <line x1="12" y1="5" x2="12" y2="15"></line>
                  <polyline points="18 12 12 18 6 12"></polyline>
                  <line x1="6" y1="20" x2="18" y2="20"></line>
                </svg>
              </span>
              <span className="nav-text">Download Config</span>
            </NavLink>

            {/* --- 👇 NEW SVG UPLOAD ICON --- */}
            <NavLink to="/upload" onClick={handleNavClick}>
              <span className="nav-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-svg">
                  <line x1="12" y1="19" x2="12" y2="9"></line>
                  <polyline points="18 12 12 6 6 12"></polyline>
                  <line x1="6" y1="4" x2="18" y2="4"></line>
                </svg>
              </span>
              <span className="nav-text">Upload Config</span>
            </NavLink>
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