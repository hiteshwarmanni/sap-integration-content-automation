// client/src/pages/UploadPage.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

// --- 👇 Upload Page (Updated with jobStatus fix) ---
function UploadPage({ isJobRunning, setIsJobRunning, refreshLogs, projects: projectsProp }) {
  const initialFormState = {
    projectName: '', environment: '',
    cpiBaseUrl: '', tokenUrl: '', clientId: '', clientSecret: ''
  };

  const [formData, setFormData] = useState(initialFormState);
  const [file, setFile] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [error, setError] = useState('');
  const [jobStatus, setJobStatus] = useState(null);
  const [pollInterval, setPollInterval] = useState(null);

  // Filter projects with access from props
  const projects = projectsProp ? projectsProp.filter(p => p.hasAccess) : [];

  const handleProjectSelect = (e) => {
    const projectId = e.target.value;
    setSelectedProjectId(projectId);

    if (projectId) {
      const project = projects.find(p => p.id === parseInt(projectId));
      if (project) {
        setFormData({
          projectName: project.projectName,
          environment: project.environment,
          cpiBaseUrl: project.cpiBaseUrl,
          tokenUrl: project.tokenUrl,
          clientId: project.clientId,
          clientSecret: project.clientSecret
        });
      }
    } else {
      setFormData(initialFormState);
    }
  };

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

          // Refresh logs when job completes
          if (refreshLogs) {
            refreshLogs();
          }

          if (data.status === 'Failed') {
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
    if (pollInterval) clearInterval(pollInterval);

    const uploadData = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      uploadData.append(key, value);
    });
    uploadData.append('projectId', selectedProjectId);
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
      const errorMsg = apiError.response?.data?.error || 'An unknown error occurred. Check the server console.';
      setError(`Error: ${errorMsg}`);
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
    if (pollInterval) clearInterval(pollInterval);

    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
  };

  return (
    <div className="page-content">
      <h2>Upload Configuration</h2>

      {/* --- Status & Progress Section --- */}
      <div className="status-container">
        {/* Enhanced Progress Bar */}
        {isJobRunning && jobStatus && jobStatus.status === 'Running' && (
          <div className="progress-bar-container">
            <div style={{ width: '100%', textAlign: 'center', marginBottom: '0.5rem' }}>
              Processing Parameters: {jobStatus.progress} / {jobStatus.total}
              <span style={{ marginLeft: '1rem', color: '#666' }}>
                ({Math.round((jobStatus.progress / jobStatus.total) * 100)}%)
              </span>
            </div>
            <progress className="progress-bar" value={jobStatus.progress} max={jobStatus.total}></progress>
            {/* <div style={{ width: '100%', fontSize: '0.9rem', color: '#666', marginTop: '0.5rem', textAlign: 'center' }}>
              Updating integration flow configurations...
            </div> */}
          </div>
        )}
        {isJobRunning && !jobStatus && (
          <div className="progress-bar-container">
            <span>Starting upload job...</span>
            <progress className="progress-bar"></progress>
            <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
              Authenticating and parsing CSV file...
            </div>
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

      {/* Form */}
      <form className="modern-form" onSubmit={handleSubmit}>
        {/* Project Selector */}
        <div className="form-group">
          <label>Select Project *</label>
          <select
            value={selectedProjectId}
            onChange={handleProjectSelect}
            required
            disabled={isJobRunning}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '1rem',
              backgroundColor: 'white'
            }}
          >
            <option value="">-- Select a Project --</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.projectName} ({project.environment})
              </option>
            ))}
          </select>
          {projects.length === 0 && (
            <small style={{ color: '#dc3545', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
              No projects available. Please create a project in Project Master first.
            </small>
          )}
        </div>

        {/* Auto-populated fields (greyed out) */}
        <div className="form-group">
          <label>Project Name *</label>
          <input
            type="text" name="projectName"
            value={formData.projectName}
            placeholder="Select a project above"
            required
            disabled
            style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
          />
        </div>

        <div className="form-group">
          <label>Environment *</label>
          <input
            type="text" name="environment"
            value={formData.environment}
            placeholder="Select a project above"
            required
            disabled
            style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
          />
        </div>

        <div className="form-group">
          <label>CPI Base URL *</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
            <input
              type="text" name="cpiBaseUrl"
              value={formData.cpiBaseUrl}
              placeholder="Select a project above"
              required
              disabled
              style={{
                borderTopRightRadius: '0',
                borderBottomRightRadius: '0',
                flexGrow: 1,
                backgroundColor: '#f5f5f5',
                cursor: 'not-allowed'
              }}
            />
            <span style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#e0e0e0',
              color: '#666',
              border: '1px solid #ddd',
              borderLeft: 'none',
              borderTopRightRadius: '6px',
              borderBottomRightRadius: '6px',
              fontSize: '0.95rem',
              whiteSpace: 'nowrap'
            }}>
              /api/v1
            </span>
          </div>
        </div>

        {/* File upload - User input */}
        <div className="form-group">
          <label>Upload CSV File *</label>
          <input
            type="file" id="file-input"
            accept=".csv"
            onChange={handleFileChange}
            required
            disabled={isJobRunning || !selectedProjectId}
          />
          <small style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
            Select a project first, then upload your CSV file
          </small>
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
