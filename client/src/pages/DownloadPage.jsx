// client/src/pages/DownloadPage.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

// --- 👇 Download Page (Updated to Job System) ---
function DownloadPage({ isJobRunning, setIsJobRunning, refreshLogs, projects: projectsProp }) {
  const initialFormState = {
    projectName: '', environment: '',
    cpiBaseUrl: '', tokenUrl: '', clientId: '', clientSecret: '',
    packageId: ''
  };

  const [formData, setFormData] = useState(initialFormState);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [jobId, setJobId] = useState(null);
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
          clientSecret: project.clientSecret,
          packageId: formData.packageId // Keep packageId as user input
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

  // --- Polling Function ---
  const pollJobStatus = (id) => {
    const interval = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/v1/download-job-status/${id}`);
        setJobStatus({ ...data, jobId: id });

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
    }, 2000); // Poll every 2 seconds
    setPollInterval(interval);
  };

  // --- Form submission handler ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsJobRunning(true);
    setError('');
    setJobStatus(null);
    if (pollInterval) clearInterval(pollInterval);

    try {
      // 1. Start the job
      const { data } = await axios.post(
        `${API_URL}/api/v1/start-download-job`,
        { ...formData, projectId: selectedProjectId } // Send form data with projectId
      );

      // 2. Start polling
      setJobId(data.jobId);
      pollJobStatus(data.jobId);

    } catch (apiError) {
      console.error('Download Start Error:', apiError);
      const errorMsg = apiError.response?.data?.error || 'An unknown error occurred. Check the server console.';
      setError(`Error: ${errorMsg}`);
      setIsJobRunning(false);
    }
  };

  // --- Reset Button Handler ---
  const handleReset = () => {
    setFormData(initialFormState);
    setError('');
    setJobId(null);
    setJobStatus(null);
    setIsJobRunning(false);
    if (pollInterval) clearInterval(pollInterval);
  };

  return (
    <div className="page-content">
      <h2>Download Configuration</h2>

      {/* --- Status & Progress Section --- */}
      <div className="status-container">
        {/* Enhanced Progress Bar */}
        {isJobRunning && jobStatus && jobStatus.status === 'Running' && (
          <div className="progress-bar-container">
            <div style={{ width: '100%', textAlign: 'center', marginBottom: '0.5rem' }}>
              Processing Packages: {jobStatus.progress} / {jobStatus.total}
              <span style={{ marginLeft: '1rem', color: '#666' }}>
                ({Math.round((jobStatus.progress / jobStatus.total) * 100)}%)
              </span>
            </div>
            <progress className="progress-bar" value={jobStatus.progress} max={jobStatus.total}></progress>
            {/* <div style={{ width: '100%', fontSize: '0.9rem', color: '#666', marginTop: '0.5rem', textAlign: 'center' }}>
              Fetching integration flows and configurations...
            </div> */}
          </div>
        )}
        {isJobRunning && !jobStatus && (
          <div className="progress-bar-container">
            <span>Starting download job...</span>
            <progress className="progress-bar"></progress>
            <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
              Initializing connection and retrieving package list...
            </div>
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
          <label>Cloud Integration Base URL (API Plan) *</label>
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

        {/* Package ID - User can still input */}
        <div className="form-group">
          <label>Package ID (Optional)</label>
          <input
            type="text" name="packageId"
            value={formData.packageId}
            onChange={handleInputChange}
            placeholder="Leave blank for all, or: id1,id2,id3"
            disabled={isJobRunning || !selectedProjectId}
          />
          <small style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
            Optional: Specify package IDs separated by commas
          </small>
        </div>

        <div style={{ marginBottom: '1.5rem' }}></div>

        <div className="button-group">
          <button type="submit" className="btn-primary" disabled={isJobRunning}>
            {isJobRunning ? 'Downloading...' : 'Download Config'}
          </button>

          <button type="button" className="btn-secondary" onClick={handleReset} disabled={isJobRunning}>
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
// --- End of Download Page ---

export default DownloadPage;
