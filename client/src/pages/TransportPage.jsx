// client/src/pages/TransportPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

// Helper function to decode base64 strings in the payload
const decodeBase64 = (obj) => {
  if (typeof obj !== 'object') return obj;
  return Object.keys(obj).reduce((result, key) => {
    if (typeof obj[key] === 'string') {
      try {
        const decoded = atob(obj[key]);
        result[key] = decoded;
      } catch (e) {
        result[key] = obj[key];
      }
    } else if (typeof obj[key] === 'object') {
      result[key] = decodeBase64(obj[key]);
    } else {
      result[key] = obj[key];
    }
    return result;
  }, {});
};

// Fixed Width Searchable Dropdown Component
function SearchableDropdown({ 
  value, 
  onChange, 
  options, 
  placeholder, 
  disabled, 
  label, 
  style 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle clicks outside dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(option => option.id === value);

  return (
    <div 
      ref={dropdownRef} 
      style={{ 
        position: 'relative', 
        width: '100%', 
        minWidth: '0',
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          ...style,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          backgroundColor: disabled ? '#f5f5f5' : 'white',
          color: disabled ? '#999' : '#333',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
          boxSizing: 'border-box'
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span style={{ 
          color: value ? '#333' : '#999',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          marginRight: '8px',
          minWidth: 0
        }}>
          {selectedOption ? `${selectedOption.name} (v${selectedOption.version})` : placeholder}
        </span>
        <span style={{ fontSize: '12px', color: '#666', flexShrink: 0 }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </div>
      
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: 'white',
          border: '1px solid #ddd',
          borderRadius: '6px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          zIndex: 1000,
          maxHeight: '200px',
          overflow: 'hidden',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Search Input */}
          <div style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
            <input
              type="text"
              placeholder={`Search ${label}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          
          {/* Options List */}
          <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {filteredOptions.length > 0 ? (
              filteredOptions.map(option => (
                <div
                  key={option.id}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    backgroundColor: value === option.id ? '#e3f2fd' : 'white',
                    borderBottom: '1px solid #f0f0f0',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    wordBreak: 'break-word',
                    lineHeight: '1.4',
                    minHeight: '28px',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  onMouseEnter={(e) => {
                    if (value !== option.id) e.target.style.backgroundColor = '#f5f5f5';
                  }}
                  onMouseLeave={(e) => {
                    if (value !== option.id) e.target.style.backgroundColor = 'white';
                  }}
                  title={`${option.name} (v${option.version})`}
                >
                  {option.name} (v{option.version})
                </div>
              ))
            ) : (
              <div style={{ padding: '12px', color: '#999', textAlign: 'center' }}>
                No {label.toLowerCase()} found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Transport Page with Mode Selection ---
function TransportPage({ projects: projectsProp, refreshTransportLogs }) {
  // Transport mode state
  const [transportMode, setTransportMode] = useState('iflow'); // 'iflow' or 'package'
  
  const [formData, setFormData] = useState({
    projectName: '',
    environment: '',
    cpiBaseUrl: '',
    tokenUrl: '',
    clientId: '',
    clientSecret: ''
  });

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Warning modal state
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningDetails, setWarningDetails] = useState(null);

  // Package and iFlow selection states
  const [availablePackages, setAvailablePackages] = useState([]);
  const [sourcePackages, setSourcePackages] = useState([]);
  const [targetPackages, setTargetPackages] = useState([]);
  const [selectedSourcePackage, setSelectedSourcePackage] = useState('');
  const [selectedTargetPackage, setSelectedTargetPackage] = useState('');
  
  // Target package suffix for package transport mode
  const [targetPackageSuffix, setTargetPackageSuffix] = useState('');
  
  // Package existence check states
  const [packageExistsStatus, setPackageExistsStatus] = useState(null); // null, 'checking', 'exists', 'available', 'error'
  const [packageExistsMessage, setPackageExistsMessage] = useState('');

  // iFlow states
  const [availableSourceIflows, setAvailableSourceIflows] = useState([]);
  const [availableTargetIflows, setAvailableTargetIflows] = useState([]);
  const [selectedSourceIflow, setSelectedSourceIflow] = useState('');
  const [selectedTargetIflow, setSelectedTargetIflow] = useState('');
  
  // Real-time validation state
  const [validationResult, setValidationResult] = useState(null);

  // Loading states
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [loadingSourceIflows, setLoadingSourceIflows] = useState(false);
  const [loadingTargetIflows, setLoadingTargetIflows] = useState(false);
  const [packageError, setPackageError] = useState('');
  const [iflowError, setIflowError] = useState('');

  // Filter projects with access from props
  const projects = projectsProp ? projectsProp.filter(p => p.hasAccess) : [];

  // Helper function to calculate string similarity using Levenshtein distance
  const calculateSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    
    // Normalize strings: lowercase, remove common suffixes
    const normalize = (str) => {
      return str
        .toLowerCase()
        .replace(/[_-](v|ver|version)?\d+$/i, '') // Remove version suffixes like _v1, _v2, _version1
        .replace(/[_-](dev|qas|prod|test|staging)$/i, '') // Remove environment suffixes
        .trim();
    };

    const normalized1 = normalize(str1);
    const normalized2 = normalize(str2);

    // Exact match after normalization
    if (normalized1 === normalized2) return 100;

    // Calculate Levenshtein distance
    const levenshteinDistance = (s1, s2) => {
      const len1 = s1.length;
      const len2 = s2.length;
      
      // Create a 2D array for dynamic programming
      const dp = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
      
      // Initialize first row and column
      for (let i = 0; i <= len1; i++) dp[i][0] = i;
      for (let j = 0; j <= len2; j++) dp[0][j] = j;
      
      // Fill the dp table
      for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
          if (s1[i - 1] === s2[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1]; // No operation needed
          } else {
            dp[i][j] = Math.min(
              dp[i - 1][j] + 1,     // Deletion
              dp[i][j - 1] + 1,     // Insertion
              dp[i - 1][j - 1] + 1  // Substitution
            );
          }
        }
      }
      
      return dp[len1][len2];
    };

    const distance = levenshteinDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);
    
    // Convert distance to similarity percentage
    // 0 distance = 100% similar, maxLength distance = 0% similar
    const similarity = Math.round(((maxLength - distance) / maxLength) * 100);
    
    return Math.max(0, similarity); // Ensure non-negative
  };

  // Function to check if iFlows are similar enough
  const checkIflowSimilarity = (sourceIflow, targetIflow) => {
    if (!sourceIflow || !targetIflow) return { isSimilar: true };

    // Calculate ID similarity using the existing calculateSimilarity function
    // This normalizes IDs by removing version/environment suffixes
    const idSimilarity = calculateSimilarity(sourceIflow.id, targetIflow.id);
    
    // Consider similar if ID similarity >= 85%
    const isSimilar = idSimilarity >= 85;

    return {
      isSimilar,
      idSimilarity,
      sourceIflow,
      targetIflow
    };
  };

  // Real-time validation effect - runs instantly when iFlows are selected
  useEffect(() => {
    if (transportMode !== 'iflow') {
      setValidationResult(null);
      return;
    }

    if (!selectedSourceIflow || !selectedTargetIflow) {
      setValidationResult(null);
      return;
    }

    const sourceIflow = availableSourceIflows.find(iflow => iflow.id === selectedSourceIflow);
    const targetIflow = availableTargetIflows.find(iflow => iflow.id === selectedTargetIflow);

    if (sourceIflow && targetIflow) {
      const result = checkIflowSimilarity(sourceIflow, targetIflow);
      setValidationResult(result);
    } else {
      setValidationResult(null);
    }
  }, [selectedSourceIflow, selectedTargetIflow, availableSourceIflows, availableTargetIflows, transportMode]);

  // Debounced package existence check
  useEffect(() => {
    // Only check in package mode
    if (transportMode !== 'package') {
      setPackageExistsStatus(null);
      setPackageExistsMessage('');
      return;
    }

    // Need both source package and suffix to check
    if (!selectedSourcePackage || !targetPackageSuffix || !formData.cpiBaseUrl) {
      setPackageExistsStatus(null);
      setPackageExistsMessage('');
      return;
    }

    // Set checking status immediately
    setPackageExistsStatus('checking');
    setPackageExistsMessage('');

    // Debounce the API call
    const timeoutId = setTimeout(async () => {
      try {
        const sourcePackage = sourcePackages.find(p => p.id === selectedSourcePackage);
        if (!sourcePackage) return;

        const targetPackageId = selectedSourcePackage + targetPackageSuffix;

        const response = await axios.post(`${API_URL}/api/v1/check-package-exists`, {
          cpiBaseUrl: formData.cpiBaseUrl,
          tokenUrl: formData.tokenUrl,
          clientId: formData.clientId,
          clientSecret: formData.clientSecret,
          packageId: targetPackageId
        });

        if (response.data.exists) {
          setPackageExistsStatus('exists');
          setPackageExistsMessage(`Package "${sourcePackage.name}${targetPackageSuffix}" already exists`);
        } else {
          setPackageExistsStatus('available');
          setPackageExistsMessage(`Package "${sourcePackage.name}${targetPackageSuffix}" is available`);
        }
      } catch (error) {
        console.error('Error checking package existence:', error);
        setPackageExistsStatus('error');
        setPackageExistsMessage('Failed to check package availability');
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [transportMode, selectedSourcePackage, targetPackageSuffix, formData.cpiBaseUrl, formData.tokenUrl, formData.clientId, formData.clientSecret, sourcePackages]);

  // Handle transport mode change
  const handleTransportModeChange = (mode) => {
    setTransportMode(mode);
    // Reset form-specific states
    setError('');
    setSuccessMessage('');
    setSelectedSourcePackage('');
    setSelectedTargetPackage('');
    setTargetPackageSuffix('');
    setSelectedSourceIflow('');
    setSelectedTargetIflow('');
    setAvailableSourceIflows([]);
    setAvailableTargetIflows([]);
  };

  const handleProjectSelect = async (e) => {
    const projectId = e.target.value;
    setSelectedProjectId(projectId);
    setError('');
    setSuccessMessage('');
    setPackageError('');
    setIflowError('');
    
    // Reset all selections and data
    setAvailablePackages([]);
    setSourcePackages([]);
    setTargetPackages([]);
    setSelectedSourcePackage('');
    setSelectedTargetPackage('');
    setTargetPackageSuffix('');
    setAvailableSourceIflows([]);
    setAvailableTargetIflows([]);
    setSelectedSourceIflow('');
    setSelectedTargetIflow('');

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

        // Fetch packages from backend
        await fetchPackages(project);
      }
    } else {
      setFormData({
        projectName: '',
        environment: '',
        cpiBaseUrl: '',
        tokenUrl: '',
        clientId: '',
        clientSecret: ''
      });
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
      setSourcePackages(data.packages);
      setTargetPackages(data.packages);
      
      // For iFlow mode, auto-select and fetch iFlows
      if (transportMode === 'iflow' && data.packages.length > 0) {
        setSelectedSourcePackage(data.packages[0].id);
        setSelectedTargetPackage(data.packages[0].id);
        await fetchIflows(data.packages[0].id, true);
        await fetchIflows(data.packages[0].id, false);
      } else if (transportMode === 'package' && data.packages.length > 0) {
        // For package mode, just select the first package as source
        setSelectedSourcePackage(data.packages[0].id);
      }
    } catch (error) {
      console.error('Error fetching packages:', error);
      const errorMsg = error.response?.data?.error || 'Failed to fetch packages. Please check credentials.';
      setPackageError(errorMsg);
      setAvailablePackages([]);
      setSourcePackages([]);
      setTargetPackages([]);
      setSelectedSourcePackage('');
      setSelectedTargetPackage('');
    } finally {
      setLoadingPackages(false);
    }
  };

  // Fetch iFlows for a specific package
  const fetchIflows = async (packageId, isSource) => {
    if (!packageId) return;

    if (isSource) {
      setLoadingSourceIflows(true);
    } else {
      setLoadingTargetIflows(true);
    }
    setIflowError('');

    try {
      const project = projects.find(p => p.id === parseInt(selectedProjectId));
      if (!project) return;

      const { data } = await axios.get(`${API_URL}/api/v1/get-iflow-details`, {
        params: {
          cpiBaseUrl: project.cpiBaseUrl,
          tokenUrl: project.tokenUrl,
          clientId: project.clientId,
          clientSecret: project.clientSecret,
          packageId: packageId
        }
      });

      if (isSource) {
        setAvailableSourceIflows(data.iflows);
        if (data.iflows.length > 0) {
          setSelectedSourceIflow(data.iflows[0].id);
        } else {
          setSelectedSourceIflow('');
        }
      } else {
        setAvailableTargetIflows(data.iflows);
        if (data.iflows.length > 0) {
          setSelectedTargetIflow(data.iflows[0].id);
        } else {
          setSelectedTargetIflow('');
        }
      }
    } catch (error) {
      console.error('Error fetching iFlows:', error);
      const errorMsg = error.response?.data?.error || 'Failed to fetch iFlows. Please check credentials.';
      setIflowError(errorMsg);
      if (isSource) {
        setAvailableSourceIflows([]);
        setSelectedSourceIflow('');
      } else {
        setAvailableTargetIflows([]);
        setSelectedTargetIflow('');
      }
    } finally {
      if (isSource) {
        setLoadingSourceIflows(false);
      } else {
        setLoadingTargetIflows(false);
      }
    }
  };

  // Handle source package change
  const handleSourcePackageChange = (packageId) => {
    setSelectedSourcePackage(packageId);
    if (transportMode === 'iflow') {
      fetchIflows(packageId, true);
    }
  };

  // Handle target package change
  const handleTargetPackageChange = (packageId) => {
    setSelectedTargetPackage(packageId);
    if (transportMode === 'iflow') {
      fetchIflows(packageId, false);
    }
  };

  // --- Form submission handler for iFlow transport ---
  const handleIflowTransportSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!selectedSourcePackage) {
      setError('Please select a source package.');
      return;
    }

    if (!selectedTargetPackage) {
      setError('Please select a target package.');
      return;
    }

    if (!selectedSourceIflow) {
      setError('Please select a source iFlow.');
      return;
    }

    if (!selectedTargetIflow) {
      setError('Please select a target iFlow.');
      return;
    }

    // Check iFlow similarity before proceeding
    if (validationResult && !validationResult.isSimilar) {
      // Show warning modal instead of proceeding
      setWarningDetails(validationResult);
      setShowWarningModal(true);
      return;
    }

    // If similar, proceed with transport
    await performIflowTransport();
  };

  // Actual transport execution (extracted to be called from modal too)
  const performIflowTransport = async () => {
    setLoading(true);
    setError('');
    setSuccessMessage('');
    setShowWarningModal(false); // Close modal if open

    try {
      const sourceIflow = availableSourceIflows.find(iflow => iflow.id === selectedSourceIflow);
      const targetIflow = availableTargetIflows.find(iflow => iflow.id === selectedTargetIflow);
      
      const response = await axios.post(`${API_URL}/api/v1/transport-iflow`, {
        projectName: formData.projectName,
        environment: formData.environment,
        cpiBaseUrl: formData.cpiBaseUrl,
        tokenUrl: formData.tokenUrl,
        clientId: formData.clientId,
        clientSecret: formData.clientSecret,
        sourcePackageId: selectedSourcePackage,
        targetPackageId: selectedTargetPackage,
        sourceIflowId: selectedSourceIflow,
        targetIflowId: selectedTargetIflow,
        sourceIflowVersion: sourceIflow ? sourceIflow.version : '1.0.0',
        targetIflowVersion: targetIflow ? targetIflow.version : '1.0.0',
        sourceIflowName: sourceIflow ? sourceIflow.name : selectedSourceIflow,
        targetIflowName: targetIflow ? targetIflow.name : selectedTargetIflow
      });

      if (response.data.success) {
        setSuccessMessage(response.data.message);
        setSelectedSourcePackage('');
        setSelectedTargetPackage('');
        setSelectedSourceIflow('');
        setSelectedTargetIflow('');
        setAvailableSourceIflows([]);
        setAvailableTargetIflows([]);
        
        // Refresh transport logs to show the new log entry
        if (refreshTransportLogs) {
          refreshTransportLogs();
        }
      } else {
        setError(response.data.error || 'Transport failed.');
      }
    } catch (error) {
      setError(`Failed to transport iFlow: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Form submission handler for package transport ---
  const handlePackageTransportSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!selectedSourcePackage) {
      setError('Please select a source package.');
      return;
    }

    if (!targetPackageSuffix || targetPackageSuffix.trim() === '') {
      setError('Please enter a target package suffix.');
      return;
    }

    // Validate suffix format (should start with a dot or underscore)
    if (!targetPackageSuffix.match(/^[._-]/)) {
      setError('Suffix should start with a dot (.), underscore (_), or hyphen (-)');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await axios.post(`${API_URL}/api/v1/transport-package`, {
        projectName: formData.projectName,
        environment: formData.environment,
        cpiBaseUrl: formData.cpiBaseUrl,
        tokenUrl: formData.tokenUrl,
        clientId: formData.clientId,
        clientSecret: formData.clientSecret,
        sourcePackageId: selectedSourcePackage,
        targetPackageSuffix: targetPackageSuffix
      });

      if (response.data.success && response.data.jobId) {
        // Start polling for job status
        pollJobStatus(response.data.jobId);
      } else {
        setError(response.data.error || 'Package transport failed.');
        setLoading(false);
      }
    } catch (error) {
      setError(`Failed to transport package: ${error.response?.data?.error || error.message}`);
      setLoading(false);
    }
  };

  // Poll job status for package transport
  const pollJobStatus = async (jobId) => {
    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await axios.get(`${API_URL}/api/v1/transport-job-status/${jobId}`);
        const { status, progress, total, progressMessage } = statusResponse.data;

        // Update progress state
        if (total > 0) {
          const percentage = Math.round((progress / total) * 100);
          setSuccessMessage(`${progressMessage || 'Processing...'} (${percentage}%)`);
        } else {
          setSuccessMessage(progressMessage || 'Initializing...');
        }

        // Check if job is complete
        if (status === 'Complete' || status === 'Partial') {
          clearInterval(pollInterval);
          setLoading(false);
          if (status === 'Complete') {
            setSuccessMessage(`Package transport completed successfully! All iFlows transported.`);
          } else {
            setSuccessMessage(`Package transport partially completed. Some iFlows may have failed.`);
          }
          setSelectedSourcePackage('');
          setTargetPackageSuffix('');
          
          // Refresh transport logs to show the new log entries
          if (refreshTransportLogs) {
            refreshTransportLogs();
          }
        } else if (status === 'Failed') {
          clearInterval(pollInterval);
          setLoading(false);
          setError('Package transport failed. Please check the logs for details.');
        }
      } catch (pollError) {
        console.error('Error polling job status:', pollError);
        clearInterval(pollInterval);
        setLoading(false);
        setError('Failed to get transport status.');
      }
    }, 2000); // Poll every 2 seconds
  };

  // --- Reset Button Handler ---
  const handleReset = () => {
    setFormData({
      projectName: '',
      environment: '',
      cpiBaseUrl: '',
      tokenUrl: '',
      clientId: '',
      clientSecret: ''
    });
    setSelectedProjectId('');
    setError('');
    setSuccessMessage('');
    setAvailablePackages([]);
    setSourcePackages([]);
    setTargetPackages([]);
    setSelectedSourcePackage('');
    setSelectedTargetPackage('');
    setTargetPackageSuffix('');
    setAvailableSourceIflows([]);
    setAvailableTargetIflows([]);
    setSelectedSourceIflow('');
    setSelectedTargetIflow('');
    setPackageError('');
    setIflowError('');
  };

  return (
    <div className="page-content">
      <h2>Transport Integration Content</h2>

      {/* Warning Modal for iFlow Mismatch */}
      {showWarningModal && warningDetails && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '24px 24px 16px',
              borderBottom: '1px solid #e0e0e0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ff9800" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#333' }}>iFlow Mismatch Warning</h3>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px' }}>
              <p style={{ 
                fontSize: '1rem', 
                color: '#666', 
                marginBottom: '24px',
                lineHeight: '1.6'
              }}>
                The source and target iFlows appear to be <strong style={{ color: '#ff9800' }}>different</strong>. 
                Transporting may overwrite the target iFlow with content from a different iFlow.
              </p>

              {/* Comparison Table */}
              <div style={{
                backgroundColor: '#f9f9f9',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd' }}>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600', color: '#555' }}>Property</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600', color: '#555' }}>Source</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600', color: '#555' }}>Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '12px 8px', fontWeight: '500', color: '#666' }}>iFlow ID</td>
                      <td style={{ 
                        padding: '12px 8px', 
                        color: '#333',
                        wordBreak: 'break-word',
                        fontFamily: 'monospace',
                        fontSize: '0.9rem'
                      }}>
                        {warningDetails.sourceIflow.id}
                      </td>
                      <td style={{ 
                        padding: '12px 8px', 
                        color: '#333',
                        wordBreak: 'break-word',
                        fontFamily: 'monospace',
                        fontSize: '0.9rem'
                      }}>
                        {warningDetails.targetIflow.id}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '12px 8px', fontWeight: '500', color: '#666' }}>iFlow Name</td>
                      <td style={{ 
                        padding: '12px 8px', 
                        color: '#333',
                        wordBreak: 'break-word'
                      }}>
                        {warningDetails.sourceIflow.name}
                      </td>
                      <td style={{ 
                        padding: '12px 8px', 
                        color: '#333',
                        wordBreak: 'break-word'
                      }}>
                        {warningDetails.targetIflow.name}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '12px 8px', fontWeight: '500', color: '#666' }}>Version</td>
                      <td style={{ padding: '12px 8px', color: '#333' }}>
                        v{warningDetails.sourceIflow.version}
                      </td>
                      <td style={{ padding: '12px 8px', color: '#333' }}>
                        v{warningDetails.targetIflow.version}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Similarity Scores */}
              <div style={{
                backgroundColor: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '0.9rem', color: '#856404', marginBottom: '8px' }}>
                  <strong>Similarity Analysis:</strong>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#856404', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>• ID Similarity: <strong>{warningDetails.idSimilarity}%</strong></div>
                  <div>• Name Similarity: <strong>{warningDetails.nameSimilarity}%</strong></div>
                </div>
              </div>

              {/* Warning Message */}
              <div style={{
                backgroundColor: '#ffebee',
                border: '1px solid #ef5350',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '20px'
              }}>
                <p style={{ 
                  fontSize: '0.9rem', 
                  color: '#c62828', 
                  margin: 0,
                  lineHeight: '1.5'
                }}>
                  ⚠️ <strong>Proceed with caution:</strong> This will replace the target iFlow's content. 
                  Make sure this is intentional before continuing.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e0e0e0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button
                onClick={() => {
                  setShowWarningModal(false);
                  setWarningDetails(null);
                }}
                style={{
                  padding: '10px 24px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  backgroundColor: 'white',
                  color: '#666',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'white';
                }}
              >
                Cancel
              </button>
              <button
                onClick={performIflowTransport}
                style={{
                  padding: '10px 24px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#ff9800',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 4px rgba(255, 152, 0, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#f57c00';
                  e.target.style.boxShadow = '0 4px 8px rgba(255, 152, 0, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#ff9800';
                  e.target.style.boxShadow = '0 2px 4px rgba(255, 152, 0, 0.3)';
                }}
              >
                Proceed Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transport Mode Selection - Segmented Control (iOS-style) */}
      <div style={{ marginBottom: '2rem' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '1.25rem', 
          fontWeight: '600',
          fontSize: '1.1rem',
          color: '#2c3e50'
        }}>
          Select Transport Mode
        </label>
        
        {/* Segmented Control Container */}
        <div style={{
          display: 'inline-flex',
          padding: '4px',
          backgroundColor: '#f0f0f0',
          borderRadius: '12px',
          boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.1)',
          position: 'relative'
        }}>
          {/* iFlow Segment */}
          <div
            onClick={() => !loading && handleTransportModeChange('iflow')}
            style={{
              position: 'relative',
              padding: '12px 32px',
              minWidth: '180px',
              backgroundColor: transportMode === 'iflow' ? '#2196F3' : 'transparent',
              color: transportMode === 'iflow' ? 'white' : '#666',
              borderRadius: '10px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: transportMode === 'iflow' ? '600' : '500',
              fontSize: '1rem',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              textAlign: 'center',
              boxShadow: transportMode === 'iflow' ? '0 2px 8px rgba(33, 150, 243, 0.3)' : 'none',
              transform: transportMode === 'iflow' ? 'scale(1.02)' : 'scale(1)',
              opacity: loading ? 0.6 : 1,
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {/* Hidden radio input for accessibility */}
            <input
              type="radio"
              value="iflow"
              checked={transportMode === 'iflow'}
              onChange={(e) => handleTransportModeChange(e.target.value)}
              disabled={loading}
              style={{
                position: 'absolute',
                opacity: 0,
                width: 0,
                height: 0
              }}
              aria-label="Transport iFlow mode"
            />
            <svg width="22" height="22" viewBox="0 0 48 48" fill="currentColor" stroke="none">
              {/* Cloud shape - left side */}
              <path d="M12 20c0-4.4 3.6-8 8-8 3 0 5.6 1.6 7 4 .4-.1.8-.2 1.2-.2 3.3 0 6 2.7 6 6 0 .8-.2 1.6-.5 2.3 2.8.7 4.8 3.2 4.8 6.2 0 3.5-2.8 6.3-6.3 6.3H14c-4.4 0-8-3.6-8-8 0-4 3-7.4 6.8-7.9.1-.6.2-1.1.2-1.7z" fill="currentColor" opacity="0.9"></path>
              
              {/* Network nodes - right side */}
              <circle cx="34" cy="18" r="2.5" fill="currentColor"></circle>
              <circle cx="42" cy="22" r="2.5" fill="currentColor"></circle>
              <circle cx="38" cy="28" r="2.5" fill="currentColor"></circle>
              <circle cx="42" cy="34" r="2.5" fill="currentColor"></circle>
              <circle cx="34" cy="30" r="2.5" fill="currentColor"></circle>
              
              {/* Connecting lines between nodes */}
              <line x1="34" y1="18" x2="42" y2="22" stroke="currentColor" strokeWidth="1.5"></line>
              <line x1="42" y1="22" x2="38" y2="28" stroke="currentColor" strokeWidth="1.5"></line>
              <line x1="38" y1="28" x2="34" y2="30" stroke="currentColor" strokeWidth="1.5"></line>
              <line x1="38" y1="28" x2="42" y2="34" stroke="currentColor" strokeWidth="1.5"></line>
              <line x1="34" y1="18" x2="34" y2="30" stroke="currentColor" strokeWidth="1.5"></line>
            </svg>
            <span>Transport iFlow</span>
          </div>

          {/* Package Segment */}
          <div
            onClick={() => !loading && handleTransportModeChange('package')}
            style={{
              position: 'relative',
              padding: '12px 32px',
              minWidth: '180px',
              backgroundColor: transportMode === 'package' ? '#2196F3' : 'transparent',
              color: transportMode === 'package' ? 'white' : '#666',
              borderRadius: '10px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: transportMode === 'package' ? '600' : '500',
              fontSize: '1rem',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              textAlign: 'center',
              boxShadow: transportMode === 'package' ? '0 2px 8px rgba(33, 150, 243, 0.3)' : 'none',
              transform: transportMode === 'package' ? 'scale(1.02)' : 'scale(1)',
              opacity: loading ? 0.6 : 1,
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {/* Hidden radio input for accessibility */}
            <input
              type="radio"
              value="package"
              checked={transportMode === 'package'}
              onChange={(e) => handleTransportModeChange(e.target.value)}
              disabled={loading}
              style={{
                position: 'absolute',
                opacity: 0,
                width: 0,
                height: 0
              }}
              aria-label="Transport Package mode"
            />
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" fill="none" stroke={transportMode === 'package' ? 'white' : '#666'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12" fill="none" stroke={transportMode === 'package' ? 'white' : '#666'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></line>
            </svg>
            <span>Transport Package</span>
          </div>
        </div>

        {/* Description below segmented control */}
        <div style={{ 
          marginTop: '1rem', 
          fontSize: '0.9rem', 
          color: '#666',
          maxWidth: '600px'
        }}>
          {transportMode === 'iflow' 
            ? 'Transport a single iFlow from source to target package' 
            : 'Transport entire package with all iFlows using a suffix'}
        </div>
      </div>

      {/* Status & Progress Section */}
      <div className="status-container">
        {successMessage && (
          <div className="form-success">
            {successMessage}
            {loading && transportMode === 'package' && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{
                  width: '100%',
                  height: '24px',
                  backgroundColor: '#e0e0e0',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  position: 'relative'
                }}>
                  <div style={{
                    height: '100%',
                    backgroundColor: '#4caf50',
                    transition: 'width 0.3s ease',
                    width: successMessage.includes('%') 
                      ? successMessage.match(/\((\d+)%\)/)?.[1] + '%' || '0%'
                      : '0%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: '600',
                    fontSize: '0.85rem'
                  }}>
                    {successMessage.includes('%') && successMessage.match(/\((\d+)%\)/)?.[1] + '%'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
      </div>

      {/* Form */}
      <form className="modern-form" onSubmit={transportMode === 'iflow' ? handleIflowTransportSubmit : handlePackageTransportSubmit}>
        {/* Project Selector */}
        <div className="form-group">
          <label>Select Project *</label>
          <select
            value={selectedProjectId}
            onChange={handleProjectSelect}
            required
            disabled={loading}
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

        <div className="form-group">
          <label>Cloud Integration Base URL (API Plan) *</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
            <input
              type="text" 
              name="cpiBaseUrl"
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

        {/* Conditional Rendering Based on Transport Mode */}
        {transportMode === 'iflow' ? (
          <>
            {/* Transport iFlow Mode - Existing Form */}
            <div className="form-group">
              <label>Source Package *</label>
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
              {!loadingPackages && sourcePackages.length > 0 && (
                <SearchableDropdown
                  value={selectedSourcePackage}
                  onChange={handleSourcePackageChange}
                  options={sourcePackages}
                  placeholder="-- Select a Source Package --"
                  disabled={loading}
                  label="Source Package"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    backgroundColor: 'white'
                  }}
                />
              )}
              {!loadingPackages && !packageError && sourcePackages.length === 0 && selectedProjectId && (
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

            <div className="form-group">
              <label>Source iFlow *</label>
              {loadingSourceIflows && (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#666', border: '1px solid #ddd', borderRadius: '6px' }}>
                  Loading iFlows...
                </div>
              )}
              {iflowError && (
                <div style={{ padding: '0.75rem', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', color: '#856404', marginBottom: '0.5rem' }}>
                  {iflowError}
                </div>
              )}
              {!loadingSourceIflows && availableSourceIflows.length > 0 && (
                <SearchableDropdown
                  value={selectedSourceIflow}
                  onChange={setSelectedSourceIflow}
                  options={availableSourceIflows}
                  placeholder="-- Select a Source iFlow --"
                  disabled={loading}
                  label="Source iFlow"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    backgroundColor: 'white'
                  }}
                />
              )}
              {!loadingSourceIflows && !iflowError && availableSourceIflows.length === 0 && selectedSourcePackage && (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#666', border: '1px solid #ddd', borderRadius: '6px' }}>
                  No iFlows available in selected source package
                </div>
              )}
              {!selectedSourcePackage && (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#666', border: '1px solid #ddd', borderRadius: '6px' }}>
                  Please select a source package to load iFlows
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Target Package *</label>
              {!loadingPackages && targetPackages.length > 0 && (
                <SearchableDropdown
                  value={selectedTargetPackage}
                  onChange={handleTargetPackageChange}
                  options={targetPackages}
                  placeholder="-- Select a Target Package --"
                  disabled={loading}
                  label="Target Package"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    backgroundColor: 'white'
                  }}
                />
              )}
              {!loadingPackages && !packageError && targetPackages.length === 0 && selectedProjectId && (
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

            <div className="form-group">
              <label>Target iFlow *</label>
              {loadingTargetIflows && (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#666', border: '1px solid #ddd', borderRadius: '6px' }}>
                  Loading iFlows...
                </div>
              )}
              {!loadingTargetIflows && availableTargetIflows.length > 0 && (
                <SearchableDropdown
                  value={selectedTargetIflow}
                  onChange={setSelectedTargetIflow}
                  options={availableTargetIflows}
                  placeholder="-- Select a Target iFlow --"
                  disabled={loading}
                  label="Target iFlow"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    backgroundColor: 'white'
                  }}
                />
              )}
              {!loadingTargetIflows && !iflowError && availableTargetIflows.length === 0 && selectedTargetPackage && (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#666', border: '1px solid #ddd', borderRadius: '6px' }}>
                  No iFlows available in selected target package
                </div>
              )}
              {!selectedTargetPackage && (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#666', border: '1px solid #ddd', borderRadius: '6px' }}>
                  Please select a target package to load iFlows
                </div>
              )}
            </div>

            {/* Real-time Validation Display */}
            {validationResult && (
              <div style={{ 
                marginTop: '1.5rem',
                marginBottom: '1.5rem',
                padding: '1.25rem',
                backgroundColor: validationResult.isSimilar ? '#e8f5e9' : '#fff3e0',
                border: `2px solid ${validationResult.isSimilar ? '#4caf50' : '#ff9800'}`,
                borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
              }}>
                {/* Header */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px',
                  marginBottom: '1rem'
                }}>
                  <span style={{ fontSize: '1.8rem' }}>
                    {validationResult.isSimilar ? '✅' : '⚠️'}
                  </span>
                  <div>
                    <h3 style={{ 
                      margin: 0, 
                      fontSize: '1.1rem',
                      color: validationResult.isSimilar ? '#2e7d32' : '#e65100',
                      fontWeight: '600'
                    }}>
                      {validationResult.isSimilar ? 'iFlow IDs Match - Safe to Transport' : 'iFlow IDs Differ - Review Carefully'}
                    </h3>
                    <p style={{ 
                      margin: '4px 0 0 0', 
                      fontSize: '0.85rem', 
                      color: '#666'
                    }}>
                      {validationResult.isSimilar 
                        ? `ID Similarity: ${validationResult.idSimilarity}% - Safe to proceed with transport.`
                        : `ID Similarity: ${validationResult.idSimilarity}% - Below 85% threshold. Review before proceeding.`}
                    </p>
                  </div>
                </div>

                {/* ID Similarity Metric */}
                <div style={{ 
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px'
                  }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: '500', color: '#555' }}>
                      ID Similarity
                    </span>
                    <span style={{ 
                      fontSize: '0.95rem', 
                      fontWeight: '700',
                      color: validationResult.idSimilarity >= 85 ? '#4caf50' : '#ff9800'
                    }}>
                      {validationResult.idSimilarity}%
                    </span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: '#e0e0e0',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${validationResult.idSimilarity}%`,
                      height: '100%',
                      backgroundColor: validationResult.idSimilarity >= 85 ? '#4caf50' : '#ff9800',
                      transition: 'width 0.3s ease'
                    }}></div>
                  </div>
                </div>

                {/* Comparison Table */}
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '1rem',
                  overflowX: 'auto'
                }}>
                  <table style={{ 
                    width: '100%', 
                    borderCollapse: 'collapse',
                    fontSize: '0.85rem'
                  }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                        <th style={{ 
                          padding: '8px', 
                          textAlign: 'left', 
                          fontWeight: '600', 
                          color: '#666',
                          width: '25%'
                        }}>
                          Property
                        </th>
                        <th style={{ 
                          padding: '8px', 
                          textAlign: 'left', 
                          fontWeight: '600', 
                          color: '#666',
                          width: '37.5%'
                        }}>
                          Source
                        </th>
                        <th style={{ 
                          padding: '8px', 
                          textAlign: 'left', 
                          fontWeight: '600', 
                          color: '#666',
                          width: '37.5%'
                        }}>
                          Target
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ 
                          padding: '10px 8px', 
                          fontWeight: '500', 
                          color: '#555'
                        }}>
                          iFlow ID
                        </td>
                        <td style={{ 
                          padding: '10px 8px',
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          color: '#333',
                          wordBreak: 'break-word',
                          backgroundColor: validationResult.sourceIflow.id !== validationResult.targetIflow.id ? '#fff9c4' : 'transparent'
                        }}>
                          {validationResult.sourceIflow.id}
                        </td>
                        <td style={{ 
                          padding: '10px 8px',
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          color: '#333',
                          wordBreak: 'break-word',
                          backgroundColor: validationResult.sourceIflow.id !== validationResult.targetIflow.id ? '#fff9c4' : 'transparent'
                        }}>
                          {validationResult.targetIflow.id}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ 
                          padding: '10px 8px', 
                          fontWeight: '500', 
                          color: '#555'
                        }}>
                          iFlow Name
                        </td>
                        <td style={{ 
                          padding: '10px 8px',
                          color: '#333',
                          wordBreak: 'break-word',
                          backgroundColor: validationResult.sourceIflow.name !== validationResult.targetIflow.name ? '#fff9c4' : 'transparent'
                        }}>
                          {validationResult.sourceIflow.name}
                        </td>
                        <td style={{ 
                          padding: '10px 8px',
                          color: '#333',
                          wordBreak: 'break-word',
                          backgroundColor: validationResult.sourceIflow.name !== validationResult.targetIflow.name ? '#fff9c4' : 'transparent'
                        }}>
                          {validationResult.targetIflow.name}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ 
                          padding: '10px 8px', 
                          fontWeight: '500', 
                          color: '#555'
                        }}>
                          Version
                        </td>
                        <td style={{ 
                          padding: '10px 8px',
                          color: '#333'
                        }}>
                          v{validationResult.sourceIflow.version}
                        </td>
                        <td style={{ 
                          padding: '10px 8px',
                          color: '#333'
                        }}>
                          v{validationResult.targetIflow.version}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Warning Message for Non-Similar iFlows */}
                {!validationResult.isSimilar && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '12px 16px',
                    backgroundColor: '#ffebee',
                    border: '1px solid #ef5350',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px'
                  }}>
                    <span style={{ fontSize: '1.2rem', marginTop: '2px' }}>🚨</span>
                    <p style={{ 
                      margin: 0,
                      fontSize: '0.85rem',
                      color: '#c62828',
                      lineHeight: '1.5'
                    }}>
                      <strong>Warning:</strong> Proceeding will overwrite the target iFlow's content with the source iFlow. 
                      Ensure this is intentional before continuing.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Transport Package Mode - New Simplified Form */}
            <div className="form-group">
              <label>Source Package *</label>
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
              {!loadingPackages && sourcePackages.length > 0 && (
                <SearchableDropdown
                  value={selectedSourcePackage}
                  onChange={setSelectedSourcePackage}
                  options={sourcePackages}
                  placeholder="-- Select a Source Package --"
                  disabled={loading}
                  label="Source Package"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    backgroundColor: 'white'
                  }}
                />
              )}
              {!loadingPackages && !packageError && sourcePackages.length === 0 && selectedProjectId && (
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

            <div className="form-group">
              <label>Target Package Suffix *</label>
              <input
                type="text"
                value={targetPackageSuffix}
                onChange={(e) => setTargetPackageSuffix(e.target.value)}
                placeholder="e.g., .dev, .qas, .prod"
                required
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '1rem'
                }}
              />
              <small style={{ color: '#6c757d', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                Enter a suffix to append to the source package name (e.g., ".dev", ".qas", "-test")
              </small>
              
              {/* Package Existence Status Indicator */}
              {packageExistsStatus === 'checking' && (
                <div style={{ 
                  marginTop: '0.75rem', 
                  padding: '0.75rem', 
                  backgroundColor: '#e3f2fd', 
                  border: '1px solid #90caf9',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>🔍</span>
                  <span>Checking package availability...</span>
                </div>
              )}
              
              {packageExistsStatus === 'available' && (
                <div style={{ 
                  marginTop: '0.75rem', 
                  padding: '0.75rem', 
                  backgroundColor: '#d4edda', 
                  border: '1px solid #28a745',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#155724'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>✅</span>
                  <span><strong>{packageExistsMessage}</strong></span>
                </div>
              )}
              
              {packageExistsStatus === 'exists' && (
                <>
                  <div style={{ 
                    marginTop: '0.75rem', 
                    padding: '0.75rem', 
                    backgroundColor: '#fff3cd', 
                    border: '1px solid #ffc107',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#856404'
                  }}>
                    <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                    <span><strong>{packageExistsMessage}</strong></span>
                  </div>
                  
                  {/* Helpful tip message */}
                  <div style={{ 
                    marginTop: '0.75rem', 
                    padding: '0.75rem', 
                    backgroundColor: '#d1ecf1', 
                    border: '1px solid #17a2b8',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    color: '#0c5460'
                  }}>
                    <span style={{ fontSize: '1.2rem', marginTop: '2px' }}>ℹ️</span>
                    <div>
                      <strong>Tip:</strong> Use <strong>"Transport iFlow"</strong> mode to transport individual iFlows to this existing package
                    </div>
                  </div>
                </>
              )}
              
              {packageExistsStatus === 'error' && (
                <div style={{ 
                  marginTop: '0.75rem', 
                  padding: '0.75rem', 
                  backgroundColor: '#f8d7da', 
                  border: '1px solid #dc3545',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#721c24'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>❌</span>
                  <span>{packageExistsMessage}</span>
                </div>
              )}
              
              {selectedSourcePackage && targetPackageSuffix && !packageExistsStatus && (
                <div style={{ 
                  marginTop: '0.5rem', 
                  padding: '0.5rem', 
                  backgroundColor: '#e7f3ff', 
                  borderRadius: '4px',
                  fontSize: '0.9rem'
                }}>
                  <strong>Target Package:</strong> {sourcePackages.find(p => p.id === selectedSourcePackage)?.name}{targetPackageSuffix}
                </div>
              )}
            </div>
          </>
        )}

        <div style={{ marginBottom: '1.5rem' }}></div>

        <div className="button-group">
          <button 
            type="submit" 
            className="btn-primary" 
            disabled={loading || (transportMode === 'package' && packageExistsStatus === 'exists')}
            style={{
              opacity: (transportMode === 'package' && packageExistsStatus === 'exists') ? 0.5 : 1,
              cursor: (transportMode === 'package' && packageExistsStatus === 'exists') ? 'not-allowed' : 'pointer'
            }}
          >
            {loading 
              ? 'Transporting...' 
              : (transportMode === 'package' && packageExistsStatus === 'exists')
                ? '🚫 Cannot Transport - Package Already Exists'
                : transportMode === 'iflow' 
                  ? 'Transport iFlow' 
                  : 'Transport Package'}
          </button>

          <button type="button" className="btn-secondary" onClick={handleReset} disabled={loading}>
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}

export default TransportPage;