// client/src/pages/UploadPage.jsx
import React, { useState } from 'react';
import axios from 'axios';

// We must define this here since it's no longer in App.jsx
const API_URL = 'http://localhost:3001';

// --- 👇 Upload Page (Updated with jobStatus fix) ---
function UploadPage({ isJobRunning, setIsJobRunning }) {
  const initialFormState = {
    projectName: '', environment: '', userName: '',
    cpiBaseUrl: '', tokenUrl: '', clientId: '', clientSecret: ''
  };

  const [formData, setFormData] = useState(initialFormState);
  const [file, setFile] = useState(null);
  
  // We no longer need a separate jobId state
 // const [isLoading, setIsLoading] = useState(false);
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
          setIsJobRunning(false);
          if(data.status === 'Failed') {
            setError('Job failed. Check logs for details.');
          }
        }
      } catch (pollError) {
        setError('Error checking job status.');
        clearInterval(interval);
        setPollInterval(null);
        setIsJobRunning(false);
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
    
    setIsJobRunning(true);
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
      setIsJobRunning(false);
    }
  };

  // --- Reset Button Handler ---
  const handleReset = () => {
    setFormData(initialFormState);
    setFile(null);
    setError('');
    setJobStatus(null);
    setIsJobRunning(false);
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
        {isJobRunning && jobStatus && jobStatus.status === 'Running' && (
          <div className="progress-bar-container">
            <span>{`Processing: ${jobStatus.progress} / ${jobStatus.total} rows...`}</span>
            <progress className="progress-bar" value={jobStatus.progress} max={jobStatus.total}></progress>
          </div>
        )}
        {isJobRunning && !jobStatus && (
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
              required disabled={isJobRunning}
            />
          </div>

          <div className="form-group">
            <label>Environment *</label>
            <input 
              type="text" name="environment"
              value={formData.environment} onChange={handleInputChange}
              placeholder="e.g., Development" 
              required disabled={isJobRunning}
            />
          </div>

          <div className="form-group">
            <label>User Name</label>
            <input 
              type="text" name="userName"
              value={formData.userName} onChange={handleInputChange}
              placeholder="Your name or S-User" 
              disabled={isJobRunning}
            />
          </div>

          <div className="form-group">
            <label>CPI Base URL *</label>
            <input 
              type="text" name="cpiBaseUrl"
              value={formData.cpiBaseUrl} onChange={handleInputChange}
              placeholder="https://your-tenant.api.sap" 
              required disabled={isJobRunning}
            />
          </div>

          <div className="form-group">
            <label>Token URL *</label>
            <input 
              type="text" name="tokenUrl"
              value={formData.tokenUrl} onChange={handleInputChange}
              placeholder="https://your-tenant.authentication.sap" 
              required disabled={isJobRunning}
            />
          </div>

          <div className="form-group">
            <label>Client ID *</label>
            <input 
              type="text" name="clientId"
              value={formData.clientId} onChange={handleInputChange}
              placeholder="Copy from service key" 
              required disabled={isJobRunning}
            />
          </div>

          <div className="form-group">
            <label>Client Secret *</label>
            <input 
              type="password" name="clientSecret"
              value={formData.clientSecret} onChange={handleInputChange}
              placeholder="Copy from service key" 
              required disabled={isJobRunning}
            />
          </div>

          <div className="form-group">
            <label>Upload CSV File *</label>
            <input 
              type="file" id="file-input" 
              accept=".csv" 
              onChange={handleFileChange} 
              required disabled={isJobRunning}
            />
          </div>

        <div style={{ marginBottom: '1.5rem' }}></div> 

        <div className="button-group">
          <button type="submit" className="btn-primary" disabled={isJobRunning || !file}>
            {isJobRunning ? 'Uploading...' : 'Upload Config'}
          </button>
          
          <button type="button" className="btn-secondary" onClick={handleReset} disabled={isJobRunning}>
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
// --- End of Upload Page ---

export default UploadPage;