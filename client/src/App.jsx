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

// --- 👇 Download Page (Updated to Single Column) ---
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

  const [formData, setFormData] = useState(initialFormState);
  
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

  // --- Form submission handler ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMessage('');

    // 1. Log the activity
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
      
      const { projectName, environment } = formData;
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const timestamp = new Date().toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
      const filename = `${projectName}_${environment}_configurations_${date}_${timestamp}.csv`;
      
      link.setAttribute('download', filename);
      
      document.body.appendChild(link);
      link.click();
      
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setSuccessMessage(`Success! File downloaded as: ${filename}`);

    } catch (apiError) {
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

  // --- Reset Button Handler ---
  const handleReset = () => {
    setFormData(initialFormState);
    setError('');
    setSuccessMessage('');
  };

  return (
    <div className="page-content">
      <h2>Download Configuration</h2>
      
      {/* --- Status & Progress Section --- */}
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
        
        {/* --- Adds space before buttons --- */}
        <div style={{ marginBottom: '1.5rem' }}></div> 

        <div className="button-group">
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Downloading...' : 'Download Config'}
          </button>
          
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

// --- 👇 Upload Page (Updated) ---
function UploadPage() {
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

  const [formData, setFormData] = useState(initialFormState);
  const [file, setFile] = useState(null); // State for the file
  
  // State for loading, error, and success messages (for future use)
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

  // Handler for file input
  const handleFileChange = (e) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  // --- Form submission handler (placeholder for now) ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    
    console.log("Form Data:", formData);
    console.log("File:", file);
    
    // We will build the job logic here later
    // For now, just simulate work
    setTimeout(() => {
      setIsLoading(false);
      // setSuccessMessage("Upload complete!"); 
      // setError("This is a test error.");
    }, 2000);
  };

  // --- Reset Button Handler ---
  const handleReset = () => {
    setFormData(initialFormState);
    setFile(null);
    setError('');
    setSuccessMessage('');
    
    // This is needed to clear the <input type="file"> field
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.value = '';
    }
  };

  return (
    <div className="page-content">
      <h2>Upload Configuration</h2>
      
      {/* --- Status & Progress Section --- */}
      <div className="status-container">
        {isLoading && (
          <div className="progress-bar-container">
            <span>Uploading... this may take a moment.</span>
            <progress className="progress-bar"></progress>
          </div>
        )}
        {successMessage && <div className="form-success">{successMessage}</div>}
        {error && <div className="form-error">{error}</div>}
      </div>
      
      <form className="modern-form" onSubmit={handleSubmit}>
          
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
              required /*
 * Fix for 3095213 (PARTNER)
 * Original code:
 *
 * return "" + year + "/" + month + "/" + day;
 *
 */
// return "" + year + "/" + month + "/" + day + " " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
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

          <div className="form-group">
            <label>Upload CSV File *</label>
            <input 
              type="file" 
              id="file-input" // Added ID for reset
              accept=".csv"
              onChange={handleFileChange}
              required
              disabled={isLoading}
            />
          </div>
        
        {/* --- Adds space before buttons --- */}
        <div style={{ marginBottom: '1.5rem' }}></div> 

        <div className="button-group">
          <button type="submit" className="btn-primary" disabled={isLoading || !file}>
            {isLoading ? 'Uploading...' : 'Upload Config'}
          </button>
          
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
// --- End of Upload Page ---

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