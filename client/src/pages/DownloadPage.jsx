// client/src/pages/DownloadPage.jsx
import React, { useState } from 'react';
import axios from 'axios';

// We must define this here since it's no longer in App.jsx
const API_URL = 'http://localhost:3001';

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

export default DownloadPage;