// client/src/pages/LogsPage.jsx
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../config';
import Pagination from '../components/Pagination';

// Helper function to get color class based on success rate
function getCountClass(countString) {
  if (!countString || countString === 'N/A' || countString === '-') return '';
  const parts = countString.split('/');
  if (parts.length !== 2) return '';
  const success = parseInt(parts[0]);
  const total = parseInt(parts[1]);
  if (isNaN(success) || isNaN(total) || total === 0) return '';
  const rate = success / total;
  if (rate === 1) return 'count-success';      // 100% success - Green
  if (rate < 0.5) return 'count-failed';       // <50% success - Red
  return '';                                    // 50-99% success - Normal black
}

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

// Memoized Log Row Component for better performance
const LogRow = React.memo(({ log, visibleColumns, hasAccess }) => {
  return (
    <tr>
      {visibleColumns.id && <td>{log.id}</td>}
      {visibleColumns.projectName && <td>{log.projectName}</td>}
      {visibleColumns.environment && <td>{log.environment}</td>}
      {visibleColumns.userName && <td>{log.userName}</td>}
      {visibleColumns.activityType && <td>{log.activityType}</td>}
      {visibleColumns.timestamp && <td>{log.timestamp}</td>}

      {visibleColumns.status && (
        <td>
          <span className={`status-badge status-${log.status?.toLowerCase()}`}>
            {log.status}
          </span>
        </td>
      )}

      {visibleColumns.artifactCount && (
        <td>
          <span className={getCountClass(log.artifactCount)}>
            {log.artifactCount || '-'}
          </span>
        </td>
      )}

      {visibleColumns.parameterCount && (
        <td>
          <span className={getCountClass(log.parameterCount)}>
            {log.parameterCount || '-'}
          </span>
        </td>
      )}

      {visibleColumns.timeTaken && <td>{formatTime(log.timeTakenSeconds)}</td>}

      {visibleColumns.logFile && (
        <td style={{ textAlign: 'center' }}>
          {log.logContent ? (
            hasAccess ? (
              <a
                href={`${API_URL}/api/download/log/${log.id}`}
                title="Download Log File"
                style={{ color: '#005fbc', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </a>
            ) : (
              <span
                title="You don't have access to this project. Only Admin or project members can download."
                style={{
                  color: '#ccc',
                  cursor: 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  opacity: 0.4
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </span>
            )
          ) : (
            <span style={{ color: '#999' }}>-</span>
          )}
        </td>
      )}

      {visibleColumns.resultFile && (
        <td style={{ textAlign: 'center' }}>
          {log.resultContent ? (
            hasAccess ? (
              <a
                href={`${API_URL}/api/download/result/${log.id}`}
                title="Download Result File"
                style={{ color: '#005fbc', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </a>
            ) : (
              <span
                title="You don't have access to this project. Only Admin or project members can download."
                style={{
                  color: '#ccc',
                  cursor: 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  opacity: 0.4
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </span>
            )
          ) : (
            <span style={{ color: '#999' }}>-</span>
          )}
        </td>
      )}
    </tr>
  );
});

LogRow.displayName = 'LogRow';

// Main LogsPage component with React.memo for optimization
const LogsPage = React.memo(({ logs, error, refreshLogs, projects, userInfo }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [projectFilter, setProjectFilter] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);

  // Default columns configuration
  const defaultColumns = {
    id: false, // Database Id column unselected by default
    projectName: true,
    environment: true,
    userName: true,
    activityType: true,
    timestamp: true,
    status: true,
    artifactCount: true,
    parameterCount: true,
    timeTaken: true,
    logFile: true,
    resultFile: true
  };

  // Load column visibility from sessionStorage or use defaults
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = sessionStorage.getItem('logsColumnVisibility');
    return saved ? JSON.parse(saved) : defaultColumns;
  });

  // Save column visibility to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('logsColumnVisibility', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // Toggle column visibility - memoized to prevent unnecessary re-renders
  const toggleColumn = useCallback((columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }));
  }, []);

  // Column configuration
  const columnConfig = [
    { key: 'id', label: 'Database Id' },
    { key: 'projectName', label: 'Project' },
    { key: 'environment', label: 'Environment' },
    { key: 'userName', label: 'User' },
    { key: 'activityType', label: 'Activity' },
    { key: 'timestamp', label: 'Timestamp' },
    { key: 'status', label: 'Status' },
    { key: 'artifactCount', label: 'Artifact Count' },
    { key: 'parameterCount', label: 'Parameter Count' },
    { key: 'timeTaken', label: 'Time Taken (s)' },
    { key: 'logFile', label: 'Log File' },
    { key: 'resultFile', label: 'Result File' }
  ];

  // Compute access for logs using already-loaded projects data
  const logsWithAccess = useMemo(() => {
    if (!userInfo || !projects) return logs;

    // Check if user is admin
    const isAdmin = userInfo.isAdmin || userInfo.scopes?.some(s => s.endsWith('.Admin'));

    return logs.map(log => {
      // Admin has access to everything
      if (isAdmin) {
        return { ...log, hasAccess: true };
      }

      // Find matching project
      const project = projects.find(
        p => p.projectName === log.projectName && p.environment === log.environment
      );

      // Check if user is a project member
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
  }, [logs, projects, userInfo]);

  // Get unique values for filters (use logsWithAccess)
  const uniqueProjects = useMemo(() => {
    const projectNames = [...new Set(logsWithAccess.map(log => log.projectName).filter(Boolean))];
    return projectNames.sort();
  }, [logsWithAccess]);

  const uniqueEnvironments = useMemo(() => {
    const environments = [...new Set(logsWithAccess.map(log => log.environment).filter(Boolean))];
    return environments.sort();
  }, [logsWithAccess]);

  // Filter logs based on selected filters (use logsWithAccess)
  const filteredLogs = useMemo(() => {
    return logsWithAccess.filter(log => {
      const matchesProject = !projectFilter || log.projectName === projectFilter;
      const matchesEnvironment = !environmentFilter || log.environment === environmentFilter;
      return matchesProject && matchesEnvironment;
    });
  }, [logsWithAccess, projectFilter, environmentFilter]);

  // Calculate pagination based on filtered logs
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentLogs = filteredLogs.slice(startIndex, endIndex);

  // Reset to page 1 when items per page changes - memoized
  const handleItemsPerPageChange = useCallback((newItemsPerPage) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  }, []);

  // Reset to page 1 when logs or filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [logs.length, projectFilter, environmentFilter]);

  // Clear all filters - memoized
  const handleClearFilters = useCallback(() => {
    setProjectFilter('');
    setEnvironmentFilter('');
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

  return (
    <div className="page-content">
      <h2>Execution Logs</h2>

      {error && <div className="form-error" style={{ maxWidth: '100%' }}>{error}</div>}

      {/* Filter Section */}
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
        <div style={{ flex: '1', minWidth: '200px' }}>
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

        <div style={{ flex: '1', minWidth: '200px' }}>
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

        <button
          onClick={handleClearFilters}
          className="btn-primary"
          disabled={!projectFilter && !environmentFilter}
          style={{
            height: '38px',
            padding: '0 1.5rem'
          }}
        >
          Clear Filters
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

          {/* Settings Popup Dialog */}
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
              {/* Arrow pointing to the icon */}
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

      <div className="table-container">
        <table className="logs-table">
          <thead>
            <tr>
              {visibleColumns.id && <th>Database Id</th>}
              {visibleColumns.projectName && <th>Project</th>}
              {visibleColumns.environment && <th>Environment</th>}
              {visibleColumns.userName && <th>User</th>}
              {visibleColumns.activityType && <th>Activity</th>}
              {visibleColumns.timestamp && <th>Timestamp</th>}
              {visibleColumns.status && <th>Status</th>}
              {visibleColumns.artifactCount && <th>Artifact Count</th>}
              {visibleColumns.parameterCount && <th>Parameter Count</th>}
              {visibleColumns.timeTaken && <th>Time Taken (s)</th>}
              {visibleColumns.logFile && <th>Log File</th>}
              {visibleColumns.resultFile && <th>Result File</th>}
            </tr>
          </thead>
          <tbody>
            {currentLogs.length === 0 && (
              <tr>
                <td colSpan={Object.values(visibleColumns).filter(Boolean).length} style={{ textAlign: 'center' }}>No logs found.</td>
              </tr>
            )}
            {currentLogs.map((log) => (
              <LogRow
                key={log.id}
                log={log}
                visibleColumns={visibleColumns}
                hasAccess={log.hasAccess}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Component */}
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

LogsPage.displayName = 'LogsPage';

export default LogsPage;