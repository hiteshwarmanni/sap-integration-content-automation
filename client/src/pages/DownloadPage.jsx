// client/src/pages/DownloadPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

// --- Multi-Select Dropdown Component ---
function MultiSelectDropdown({ packages, selectedPackages, onTogglePackage, onSelectAll, selectAll, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get selected package objects
  const selectedPackageObjects = packages.filter(pkg => selectedPackages.includes(pkg.id));

  // Remove a selected package
  const handleRemoveTag = (packageId, e) => {
    e.stopPropagation();
    onTogglePackage(packageId);
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Dropdown Trigger with Selected Tags */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          height: '48px',
          padding: '0.5rem',
          border: '1px solid #ddd',
          borderRadius: '6px',
          backgroundColor: disabled ? '#f5f5f5' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Selected Package Tags - Scrollable */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flex: 1,
          overflow: 'auto',
          whiteSpace: 'nowrap',
          scrollbarWidth: 'thin'
        }}>
          {selectedPackageObjects.length > 0 ? (
            selectedPackageObjects.map(pkg => (
              <span
                key={pkg.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.25rem 0.5rem',
                  backgroundColor: 'transparent',
                  color: '#333',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  gap: '0.5rem',
                  whiteSpace: 'nowrap'
                }}
              >
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>✓</span>
                {pkg.name}
                <button
                  type="button"
                  onClick={(e) => handleRemoveTag(pkg.id, e)}
                  disabled={disabled}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#666',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    padding: '0',
                    fontSize: '1.2rem',
                    lineHeight: '1',
                    fontWeight: 'bold'
                  }}
                >
                  ×
                </button>
              </span>
            ))
          ) : (
            <span style={{ color: '#999' }}>Select packages...</span>
          )}
        </div>

        {/* Dropdown Arrow */}
        <span
          style={{
            fontSize: '1.2rem',
            color: '#666',
            transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0
          }}
        >
          ▼
        </span>
      </div>

      {/* Dropdown List */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '0.25rem',
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            borderRadius: '6px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            zIndex: 1000,
            maxHeight: '300px',
            overflowY: 'auto'
          }}
        >
          {/* "All" Checkbox at Top */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              cursor: 'pointer',
              borderBottom: '2px solid #e9ecef',
              backgroundColor: '#f8f9fa',
              position: 'sticky',
              top: 0,
              zIndex: 1
            }}
          >
            <input
              type="checkbox"
              checked={selectAll}
              onChange={onSelectAll}
              disabled={disabled}
              style={{ marginRight: '0.75rem', width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <strong>All</strong>
          </label>

          {/* Package List */}
          {packages.map(pkg => (
            <label
              key={pkg.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <input
                type="checkbox"
                checked={selectedPackages.includes(pkg.id)}
                onChange={() => onTogglePackage(pkg.id)}
                disabled={disabled}
                style={{ marginRight: '0.75rem', width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.95rem', color: '#333' }}>{pkg.name}</span>
            </label>
          ))}
        </div>
      )}

      {/* Selection Count */}
      <small style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.5rem', display: 'block' }}>
        {selectedPackages.length} package{selectedPackages.length !== 1 ? 's' : ''} selected
      </small>
    </div>
  );
}

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

  // Package selection states
  const [availablePackages, setAvailablePackages] = useState([]);
  const [selectedPackages, setSelectedPackages] = useState([]);
  const [selectAll, setSelectAll] = useState(true);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [packageError, setPackageError] = useState('');

  // Filter projects with access from props
  const projects = projectsProp ? projectsProp.filter(p => p.hasAccess) : [];

  const handleProjectSelect = async (e) => {
    const projectId = e.target.value;
    setSelectedProjectId(projectId);
    setPackageError('');
    setAvailablePackages([]);
    setSelectedPackages([]);
    setSelectAll(true);

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
          packageId: ''
        });

        // Fetch packages from backend
        await fetchPackages(project);
      }
    } else {
      setFormData(initialFormState);
    }
  };

  // Fetch packages from backend
  const fetchPackages = async (project) => {
    setLoadingPackages(true);
    setPackageError('');

    try {
      const { data } = await axios.post(`${API_URL}/api/v1/get-package-details`, {
        cpiBaseUrl: project.cpiBaseUrl,
        tokenUrl: project.tokenUrl,
        clientId: project.clientId,
        clientSecret: project.clientSecret
      });

      setAvailablePackages(data.packages);
      // Select all packages by default
      setSelectedPackages(data.packages.map(pkg => pkg.id));
      setSelectAll(true);
    } catch (error) {
      console.error('Error fetching packages:', error);
      const errorMsg = error.response?.data?.error || 'Failed to fetch packages. Please check credentials.';
      setPackageError(errorMsg);
      setAvailablePackages([]);
      setSelectedPackages([]);
    } finally {
      setLoadingPackages(false);
    }
  };

  // Handle Select All checkbox
  const handleSelectAllChange = (e) => {
    const checked = e.target.checked;
    setSelectAll(checked);
    if (checked) {
      setSelectedPackages(availablePackages.map(pkg => pkg.id));
    } else {
      setSelectedPackages([]);
    }
  };

  // Handle individual package selection
  const handlePackageToggle = (packageId) => {
    setSelectedPackages(prev => {
      const newSelection = prev.includes(packageId)
        ? prev.filter(id => id !== packageId)
        : [...prev, packageId];

      // Update Select All checkbox state
      setSelectAll(newSelection.length === availablePackages.length);
      return newSelection;
    });
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

    // Validate package selection
    if (availablePackages.length > 0 && selectedPackages.length === 0) {
      setError('Please select at least one package or select "All".');
      return;
    }

    setIsJobRunning(true);
    setError('');
    setJobStatus(null);
    if (pollInterval) clearInterval(pollInterval);

    try {
      // Convert selected packages to comma-separated string
      const packageIdString = selectedPackages.length > 0 ? selectedPackages.join(',') : '';

      // 1. Start the job
      const { data } = await axios.post(
        `${API_URL}/api/v1/start-download-job`,
        {
          ...formData,
          projectId: selectedProjectId,
          packageId: packageIdString // Send selected packages as comma-separated string
        }
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
    setSelectedProjectId('');
    setError('');
    setJobId(null);
    setJobStatus(null);
    setIsJobRunning(false);
    setAvailablePackages([]);
    setSelectedPackages([]);
    setSelectAll(true);
    setPackageError('');
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

        {/* Package Selection Multi-Select Dropdown */}
        <div className="form-group">
          <label>Select Packages *</label>

          {loadingPackages && (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#666', border: '1px solid #ddd', borderRadius: '6px' }}>
              Loading packages...
            </div>
          )}

          {packageError && (
            <div style={{ padding: '0.75rem', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', color: '#856404', marginBottom: '0.5rem' }}>
              {packageError}
            </div>
          )}

          {!loadingPackages && availablePackages.length > 0 && (
            <MultiSelectDropdown
              packages={availablePackages}
              selectedPackages={selectedPackages}
              onTogglePackage={handlePackageToggle}
              onSelectAll={handleSelectAllChange}
              selectAll={selectAll}
              disabled={isJobRunning}
            />
          )}

          {!loadingPackages && !packageError && availablePackages.length === 0 && selectedProjectId && (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#666', border: '1px solid #ddd', borderRadius: '6px' }}>
              No packages available for this project
            </div>
          )}

          {!selectedProjectId && (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#666', border: '1px solid #ddd', borderRadius: '6px' }}>
              Please select a project to load packages
            </div>
          )}
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
