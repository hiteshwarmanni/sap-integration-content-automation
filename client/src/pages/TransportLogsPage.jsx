// client/src/pages/TransportLogsPage.jsx
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import Pagination from '../components/Pagination';
import { useAdminCheck } from '../hooks/useAdminCheck';

// Helper function to format time in human-readable format
function formatTime(seconds) {
  if (!seconds || seconds === '-') return '-';
  const sec = parseInt(seconds);
  if (isNaN(sec)) return seconds;

  if (sec < 60) return `${sec}s`;
  if (sec < 3600) {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Memoized Transport Log Row Component
const TransportLogRow = React.memo(({ log, visibleColumns, hasAccess, isAdmin, selected, onSelect, expanded, onToggleExpand }) => {
  const hasError = log.status === 'Failed' && log.errorMessage;
  const visibleColumnCount = Object.values(visibleColumns).filter(Boolean).length + (isAdmin ? 1 : 0);

  return (
    <>
      <tr style={{ cursor: hasError ? 'pointer' : 'default' }} onClick={() => hasError && onToggleExpand(log.id)}>
        {isAdmin && (
          <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(log.id, e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
          </td>
        )}
        {visibleColumns.id && <td>{log.id}</td>}
        {visibleColumns.projectName && <td>{log.projectName}</td>}
        {visibleColumns.environment && <td>{log.environment}</td>}
        {visibleColumns.userName && <td>{log.userName}</td>}
        {visibleColumns.timestamp && <td>{log.timestamp}</td>}
        
        {visibleColumns.status && (
          <td>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`status-badge status-${log.status?.toLowerCase()}`}>
                {log.status}
              </span>
              {hasError && (
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="#dc3545" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                  style={{ 
                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s'
                  }}
                  title="Click to view error details"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              )}
            </div>
          </td>
        )}

        {visibleColumns.sourcePackageId && <td>{log.sourcePackageId || '-'}</td>}
        {visibleColumns.sourceIflowName && <td>{log.sourceIflowName || '-'}</td>}
        {visibleColumns.targetPackageId && <td>{log.targetPackageId || '-'}</td>}
        {visibleColumns.targetIflowName && <td>{log.targetIflowName || '-'}</td>}
        {visibleColumns.sourceIflowId && <td>{log.sourceIflowId || '-'}</td>}
        {visibleColumns.targetIflowId && <td>{log.targetIflowId || '-'}</td>}
        {visibleColumns.timeTaken && <td>{formatTime(log.timeTakenSeconds)}</td>}
      </tr>
      {expanded && hasError && (
        <tr>
          <td colSpan={visibleColumnCount} style={{ padding: 0 }}>
            <div style={{
              background: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              padding: '1rem',
              margin: '0.5rem'
            }}>
              <h4 style={{ 
                marginTop: 0, 
                marginBottom: '0.75rem', 
                color: '#dc3545',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                Error Details
              </h4>
              
              {log.failedStep && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong style={{ color: '#856404' }}>Failed Step:</strong>
                  <div style={{ 
                    marginTop: '0.25rem',
                    padding: '0.5rem',
                    background: '#fff',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '0.9rem'
                  }}>
                    {log.failedStep}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '0.75rem' }}>
                <strong style={{ color: '#856404' }}>Error Message:</strong>
                <div style={{ 
                  marginTop: '0.25rem',
                  padding: '0.5rem',
                  background: '#fff',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.9rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {log.errorMessage}
                </div>
              </div>

              {log.errorDetails && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong style={{ color: '#856404' }}>Error Details:</strong>
                  <div style={{ 
                    marginTop: '0.25rem',
                    padding: '0.5rem',
                    background: '#fff',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {typeof log.errorDetails === 'string' 
                      ? log.errorDetails 
                      : JSON.stringify(JSON.parse(log.errorDetails), null, 2)
                    }
                  </div>
                </div>
              )}

              {log.errorStackTrace && (
                <details style={{ marginTop: '0.75rem' }}>
                  <summary style={{ 
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    color: '#856404',
                    padding: '0.25rem',
                    userSelect: 'none'
                  }}>
                    Stack Trace (click to expand)
                  </summary>
                  <div style={{ 
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    background: '#fff',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '300px',
                    overflowY: 'auto'
                  }}>
                    {log.errorStackTrace}
                  </div>
                </details>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

TransportLogRow.displayName = 'TransportLogRow';

const TransportLogsPage = React.memo(({ transportLogs, error, refreshTransportLogs, projects, userInfo }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [projectFilter, setProjectFilter] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);
  
  // Admin functionality states
  const isAdmin = useAdminCheck(userInfo);
  const [selectedLogs, setSelectedLogs] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteAll, setDeleteAll] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  
  // Expanded rows state for error details - persist across renders
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Fetch logs whenever the page is visited (not just on mount)
  useEffect(() => {
    refreshTransportLogs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Default columns configuration
  const defaultColumns = {
    id: false,
    projectName: true,
    environment: true,
    userName: true,
    timestamp: true,
    status: true,
    sourcePackageId: true,
    sourceIflowName: true,
    targetPackageId: true,
    targetIflowName: true,
    sourceIflowId: false,
    targetIflowId: false,
    timeTaken: false
  };

  // Load column visibility from sessionStorage
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = sessionStorage.getItem('transportLogsColumnVisibility');
    return saved ? JSON.parse(saved) : defaultColumns;
  });

  // Save column visibility to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('transportLogsColumnVisibility', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // Toggle column visibility
  const toggleColumn = useCallback((columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }));
  }, []);

  // Column configuration
  const columnConfig = [
    { key: 'id', label: 'ID' },
    { key: 'projectName', label: 'Project' },
    { key: 'environment', label: 'Environment' },
    { key: 'userName', label: 'User' },
    { key: 'timestamp', label: 'Timestamp' },
    { key: 'status', label: 'Status' },
    { key: 'sourcePackageId', label: 'Source Package' },
    { key: 'sourceIflowName', label: 'Source iFlow Name' },
    { key: 'targetPackageId', label: 'Target Package' },
    { key: 'targetIflowName', label: 'Target iFlow Name' },
    { key: 'sourceIflowId', label: 'Source iFlow ID' },
    { key: 'targetIflowId', label: 'Target iFlow ID' },
    { key: 'timeTaken', label: 'Time Taken' }
  ];

  // Compute access for logs
  const logsWithAccess = useMemo(() => {
    if (!userInfo || !projects) return transportLogs;

    const isDevelopment = window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    const isAdmin = isDevelopment || userInfo.isAdmin || userInfo.scopes?.some(s => s.endsWith('.Admin'));

    return transportLogs.map(log => {
      if (isAdmin) {
        return { ...log, hasAccess: true };
      }

      const project = projects.find(
        p => p.projectName === log.projectName && p.environment === log.environment
      );

      const userId = userInfo.email || userInfo.id;
      let projectMembers = [];

      if (project?.projectMembers) {
        try {
          projectMembers = typeof project.projectMembers === 'string'
            ? JSON.parse(project.projectMembers)
            : project.projectMembers;
        } catch (e) {
          projectMembers = [];
        }
      }

      const hasAccess = projectMembers.includes(userId);
      return { ...log, hasAccess };
    });
  }, [transportLogs, projects, userInfo]);

  // Get unique values for filters
  const uniqueProjects = useMemo(() => {
    const projectNames = [...new Set(logsWithAccess.map(log => log.projectName).filter(Boolean))];
    return projectNames.sort();
  }, [logsWithAccess]);

  const uniqueEnvironments = useMemo(() => {
    const environments = [...new Set(logsWithAccess.map(log => log.environment).filter(Boolean))];
    return environments.sort();
  }, [logsWithAccess]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logsWithAccess.filter(log => {
      const matchesProject = !projectFilter || log.projectName === projectFilter;
      const matchesEnvironment = !environmentFilter || log.environment === environmentFilter;
      const matchesSearch = !searchQuery ||
        log.projectName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.environment?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.sourcePackageId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.targetPackageId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.sourceIflowId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.targetIflowId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.sourceIflowName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.targetIflowName?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesProject && matchesEnvironment && matchesSearch;
    });
  }, [logsWithAccess, projectFilter, environmentFilter, searchQuery]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentLogs = filteredLogs.slice(startIndex, endIndex);

  // Reset to page 1 when items per page changes
  const handleItemsPerPageChange = useCallback((newItemsPerPage) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  }, []);

  // Reset to page 1 when logs or filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [transportLogs.length, projectFilter, environmentFilter, searchQuery]);

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setProjectFilter('');
    setEnvironmentFilter('');
    setSearchQuery('');
  }, []);

  // Close settings popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettings(false);
      }
    };

    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettings]);

  // Selection handlers
  const handleSelectLog = useCallback((logId, checked) => {
    setSelectedLogs(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(logId);
      } else {
        newSet.delete(logId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback((checked) => {
    if (checked) {
      setSelectedLogs(new Set(filteredLogs.map(log => log.id)));
    } else {
      setSelectedLogs(new Set());
    }
  }, [filteredLogs]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedLogs(new Set());
  }, [projectFilter, environmentFilter, searchQuery]);

  // Toggle expanded row handler
  const handleToggleExpand = useCallback((logId) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  }, []);

  // Export handler
  const handleExport = async () => {
    setIsExporting(true);
    setActionMessage('');
    
    try {
      const response = await axios.post(`${API_URL}/api/transport-logs/export`, {}, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `transport-logs-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      setActionMessage('Transport logs exported successfully');
      setTimeout(() => setActionMessage(''), 3000);
    } catch (err) {
      setActionMessage(err.response?.data?.error || 'Failed to export transport logs');
    } finally {
      setIsExporting(false);
    }
  };

  // Cleanup handlers
  const handleDeleteSelected = () => {
    if (selectedLogs.size === 0) {
      setActionMessage('Please select logs to delete');
      setTimeout(() => setActionMessage(''), 3000);
      return;
    }
    setDeleteAll(false);
    setShowDeleteConfirm(true);
  };

  const handleDeleteAll = () => {
    setDeleteAll(true);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    setActionMessage('');
    
    try {
      const payload = deleteAll 
        ? { deleteAll: true }
        : { ids: Array.from(selectedLogs) };
        
      const response = await axios.post(`${API_URL}/api/transport-logs/bulk-delete`, payload);
      
      setActionMessage(response.data.message || 'Logs deleted successfully');
      setSelectedLogs(new Set());
      
      // Refresh logs after deletion
      setTimeout(() => {
        refreshTransportLogs();
        setActionMessage('');
      }, 2000);
    } catch (err) {
      setActionMessage(err.response?.data?.error || 'Failed to delete logs');
    } finally {
      setIsDeleting(false);
    }
  };

  const allSelected = filteredLogs.length > 0 && selectedLogs.size === filteredLogs.length;

  return (
    <div className="page-content">
      <h2>Transport Logs</h2>

      {error && <div className="form-error" style={{ maxWidth: '100%' }}>{error}</div>}

      {/* Search and Filter Section */}
      <div style={{
        background: '#ffffff',
        padding: '1.5rem',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        marginBottom: '1.5rem',
        display: 'flex',
        gap: '1rem',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        position: 'relative'
      }}>
        {/* Search Box */}
        <div style={{ flex: '2', minWidth: '300px' }}>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#555' }}>
            Search Transport Logs
          </label>
          <div className="search-input-wrapper">
            <svg
              className="search-icon"
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Search by project, environment, user, packages, or iFlows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Project Filter */}
        <div style={{ flex: '1', minWidth: '180px' }}>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#555' }}>
            Filter by Project
          </label>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1dadd',
              borderRadius: '4px',
              fontSize: '0.9rem'
            }}
          >
            <option value="">All Projects</option>
            {uniqueProjects.map(project => (
              <option key={project} value={project}>{project}</option>
            ))}
          </select>
        </div>

        {/* Environment Filter */}
        <div style={{ flex: '1', minWidth: '180px' }}>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#555' }}>
            Filter by Environment
          </label>
          <select
            value={environmentFilter}
            onChange={(e) => setEnvironmentFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1dadd',
              borderRadius: '4px',
              fontSize: '0.9rem'
            }}
          >
            <option value="">All Environments</option>
            {uniqueEnvironments.map(env => (
              <option key={env} value={env}>{env}</option>
            ))}
          </select>
        </div>

        {/* Clear Filters Button */}
        <button
          onClick={handleClearFilters}
          className="btn-primary"
          disabled={!projectFilter && !environmentFilter && !searchQuery}
          style={{
            height: '38px',
            padding: '0 1.5rem',
            whiteSpace: 'nowrap'
          }}
        >
          Clear All Filters
        </button>

        {/* Settings Icon */}
        <div ref={settingsRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              background: 'none',
              border: '1px solid #d1dadd',
              borderRadius: '4px',
              padding: '0.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              marginBottom: '0',
              height: '38px',
              width: '38px'
            }}
            title="Column Settings"
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f7f9'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>

          {/* Settings Popup */}
          {showSettings && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: '0',
              marginTop: '0.5rem',
              background: '#ffffff',
              padding: '1.5rem',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              minWidth: '300px',
              maxWidth: '400px',
              zIndex: 1000,
              border: '1px solid #d1dadd'
            }}>
              <div style={{
                position: 'absolute',
                top: '-8px',
                right: '12px',
                width: '0',
                height: '0',
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderBottom: '8px solid #ffffff',
                filter: 'drop-shadow(0 -2px 2px rgba(0, 0, 0, 0.1))'
              }}></div>

              <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', color: '#005fbc' }}>
                Column Visibility
              </h3>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                maxHeight: '400px',
                overflowY: 'auto'
              }}>
                {columnConfig.map(col => (
                  <label key={col.key} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    transition: 'background-color 0.2s'
                  }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f7f9'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.key]}
                      onChange={() => toggleColumn(col.key)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.9rem' }}>{col.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search Results Info */}
      {searchQuery && (
        <div className="search-results-info" style={{ marginBottom: '1.5rem' }}>
          Found {filteredLogs.length} result{filteredLogs.length !== 1 ? 's' : ''} for "{searchQuery}"
        </div>
      )}

      {/* Admin Action Buttons */}
      {isAdmin && (
        <div style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={handleExport}
            disabled={isExporting || transportLogs.length === 0}
            className="btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {isExporting ? (
              <>
                <svg style={{ animation: 'spin 1s linear infinite' }} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export to CSV
              </>
            )}
          </button>

          <button
            onClick={handleDeleteSelected}
            disabled={isDeleting || selectedLogs.size === 0}
            style={{
              padding: '0.5rem 1.5rem',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: selectedLogs.size === 0 || isDeleting ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              fontWeight: '500',
              opacity: selectedLogs.size === 0 || isDeleting ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Delete Selected ({selectedLogs.size})
          </button>

          <button
            onClick={handleDeleteAll}
            disabled={isDeleting || transportLogs.length === 0}
            style={{
              padding: '0.5rem 1.5rem',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: transportLogs.length === 0 || isDeleting ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              fontWeight: '500',
              opacity: transportLogs.length === 0 || isDeleting ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            Delete All Logs
          </button>

          {selectedLogs.size > 0 && (
            <span style={{ color: '#666', fontSize: '0.9rem' }}>
              {selectedLogs.size} of {filteredLogs.length} selected
            </span>
          )}
        </div>
      )}

      {/* Action Message */}
      {actionMessage && (
        <div style={{
          padding: '1rem',
          marginBottom: '1.5rem',
          background: actionMessage.includes('success') || actionMessage.includes('exported') || actionMessage.includes('deleted') ? '#d4edda' : '#f8d7da',
          border: `1px solid ${actionMessage.includes('success') || actionMessage.includes('exported') || actionMessage.includes('deleted') ? '#28a745' : '#dc3545'}`,
          borderRadius: '4px',
          color: '#333'
        }}>
          {actionMessage}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{ marginTop: 0, color: '#dc3545' }}>Confirm Delete</h3>
            <p style={{ marginBottom: '1.5rem', lineHeight: '1.5' }}>
              {deleteAll
                ? `Are you sure you want to delete all ${transportLogs.length} transport log(s)? This action cannot be undone.`
                : `Are you sure you want to delete ${selectedLogs.size} selected transport log(s)? This action cannot be undone.`
              }
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  padding: '0.5rem 1.5rem',
                  border: '1px solid #d1dadd',
                  background: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '0.5rem 1.5rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="table-container">
        <table className="logs-table">
          <thead>
            <tr>
              {isAdmin && (
                <th style={{ width: '50px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                    title="Select All"
                  />
                </th>
              )}
              {visibleColumns.id && <th>ID</th>}
              {visibleColumns.projectName && <th>Project</th>}
              {visibleColumns.environment && <th>Environment</th>}
              {visibleColumns.userName && <th>User</th>}
              {visibleColumns.timestamp && <th>Timestamp</th>}
              {visibleColumns.status && <th>Status</th>}
              {visibleColumns.sourcePackageId && <th>Source Package</th>}
              {visibleColumns.sourceIflowName && <th>Source iFlow Name</th>}
              {visibleColumns.targetPackageId && <th>Target Package</th>}
              {visibleColumns.targetIflowName && <th>Target iFlow Name</th>}
              {visibleColumns.sourceIflowId && <th>Source iFlow ID</th>}
              {visibleColumns.targetIflowId && <th>Target iFlow ID</th>}
              {visibleColumns.timeTaken && <th>Time Taken</th>}
            </tr>
          </thead>
          <tbody>
            {currentLogs.length === 0 && (
              <tr>
                <td colSpan={(isAdmin ? 1 : 0) + Object.values(visibleColumns).filter(Boolean).length} style={{ textAlign: 'center' }}>
                  No transport logs found.
                </td>
              </tr>
            )}
            {currentLogs.map((log) => (
              <TransportLogRow
                key={log.id}
                log={log}
                visibleColumns={visibleColumns}
                hasAccess={log.hasAccess}
                isAdmin={isAdmin}
                selected={selectedLogs.has(log.id)}
                onSelect={handleSelectLog}
                expanded={expandedRows.has(log.id)}
                onToggleExpand={handleToggleExpand}
              />
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Pagination */}
      {filteredLogs.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          totalItems={filteredLogs.length}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
      )}
    </div>
  );
});

TransportLogsPage.displayName = 'TransportLogsPage';

export default TransportLogsPage;