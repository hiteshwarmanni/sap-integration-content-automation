// client/src/pages/LogsPage.jsx
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import Pagination from '../components/Pagination';
import { useAdminCheck } from '../hooks/useAdminCheck';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function getCountClass(countString) {
  if (!countString || countString === 'N/A' || countString === '-') return '';
  const parts = countString.split('/');
  if (parts.length !== 2) return '';
  const success = parseInt(parts[0]);
  const total = parseInt(parts[1]);
  if (isNaN(success) || isNaN(total) || total === 0) return '';
  const rate = success / total;
  if (rate === 1) return 'count-success';
  if (rate < 0.5) return 'count-failed';
  return '';
}

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

function formatTimestamp(timestampString) {
  if (!timestampString) return '-';
  return `${timestampString} (UTC)`;
}

// ─── Execution Log Row ────────────────────────────────────────────────────────

const LogRow = React.memo(({ log, visibleColumns, hasAccess }) => {
  return (
    <tr>
      {visibleColumns.id && <td>{log.id}</td>}
      {visibleColumns.projectName && <td>{log.projectName}</td>}
      {visibleColumns.environment && <td>{log.environment}</td>}
      {visibleColumns.userName && <td>{log.userName}</td>}
      {visibleColumns.activityType && <td>{log.activityType}</td>}
      {visibleColumns.timestamp && <td>{formatTimestamp(log.timestamp)}</td>}
      {visibleColumns.status && (
        <td>
          <span className={`status-badge status-${log.status?.toLowerCase()}`}>{log.status}</span>
        </td>
      )}
      {visibleColumns.artifactCount && (
        <td><span className={getCountClass(log.artifactCount)}>{log.artifactCount || '-'}</span></td>
      )}
      {visibleColumns.parameterCount && (
        <td><span className={getCountClass(log.parameterCount)}>{log.parameterCount || '-'}</span></td>
      )}
      {visibleColumns.timeTaken && <td>{formatTime(log.timeTakenSeconds)}</td>}
      {visibleColumns.logFile && (
        <td style={{ textAlign: 'center' }}>
          {log.logContent ? (
            hasAccess ? (
              <a href={`${API_URL}/api/download/log/${log.id}`} title="Download Log File"
                style={{ color: '#005fbc', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </a>
            ) : (
                <span title="You don't have access to this project."
                  style={{ color: '#ccc', cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', opacity: 0.4 }}>
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
              <a href={`${API_URL}/api/download/result/${log.id}`} title="Download Result File"
                style={{ color: '#005fbc', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </a>
            ) : (
                <span title="You don't have access to this project."
                  style={{ color: '#ccc', cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', opacity: 0.4 }}>
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

// ─── Transport Log Row ────────────────────────────────────────────────────────

const TransportLogRow = React.memo(({ log, visibleColumns, isAdmin, selected, onSelect, expanded, onToggleExpand }) => {
  const hasError = log.status === 'Failed' && log.errorMessage;
  const visibleColumnCount = Object.values(visibleColumns).filter(Boolean).length + (isAdmin ? 1 : 0);

  return (
    <>
      <tr style={{ cursor: hasError ? 'pointer' : 'default' }} onClick={() => hasError && onToggleExpand(log.id)}>
        {isAdmin && (
          <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={selected} onChange={(e) => onSelect(log.id, e.target.checked)} style={{ cursor: 'pointer' }} />
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
              <span className={`status-badge status-${log.status?.toLowerCase()}`}>{log.status}</span>
              {hasError && (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="#dc3545" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                  title="Click to view error details">
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
            <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', padding: '1rem', margin: '0.5rem' }}>
              <h4 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#dc3545', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                  <div style={{ marginTop: '0.25rem', padding: '0.5rem', background: '#fff', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.9rem' }}>{log.failedStep}</div>
                </div>
              )}
              <div style={{ marginBottom: '0.75rem' }}>
                <strong style={{ color: '#856404' }}>Error Message:</strong>
                <div style={{ marginTop: '0.25rem', padding: '0.5rem', background: '#fff', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.9rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log.errorMessage}</div>
              </div>
              {log.errorDetails && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong style={{ color: '#856404' }}>Error Details:</strong>
                  <div style={{ marginTop: '0.25rem', padding: '0.5rem', background: '#fff', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '200px', overflowY: 'auto' }}>
                    {typeof log.errorDetails === 'string' ? log.errorDetails : JSON.stringify(JSON.parse(log.errorDetails), null, 2)}
                  </div>
                </div>
              )}
              {log.errorStackTrace && (
                <details style={{ marginTop: '0.75rem' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#856404', padding: '0.25rem', userSelect: 'none' }}>Stack Trace (click to expand)</summary>
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#fff', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '300px', overflowY: 'auto' }}>{log.errorStackTrace}</div>
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

// ─── Settings / column-toggle icon ───────────────────────────────────────────

const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

// ─── Main LogsPage ────────────────────────────────────────────────────────────

const LogsPage = React.memo(({
  logs, error, refreshLogs, refreshCleanupLogs, projects, userInfo,
  transportLogs = [], transportLogsError = '', refreshTransportLogs
}) => {
  // ── Tab state ──
  const [activeTab, setActiveTab] = useState('execution'); // 'execution' | 'transport'

  // Load transport logs when switching to the transport tab (lazy)
  useEffect(() => {
    if (activeTab === 'transport' && transportLogs.length === 0 && refreshTransportLogs) {
      refreshTransportLogs();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin = useAdminCheck(userInfo);

  // ════════════════════════════════════════════════════════════
  // EXECUTION LOGS STATE
  // ════════════════════════════════════════════════════════════
  const [execPage, setExecPage] = useState(1);
  const [execItemsPerPage, setExecItemsPerPage] = useState(25);
  const [execProjectFilter, setExecProjectFilter] = useState('');
  const [execEnvFilter, setExecEnvFilter] = useState('');
  const [execSearch, setExecSearch] = useState('');
  const [showExecSettings, setShowExecSettings] = useState(false);
  const execSettingsRef = useRef(null);

// Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedLogForDeletion, setSelectedLogForDeletion] = useState(null);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeletingContent, setIsDeletingContent] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');

  // Fetch execution logs on first mount (lazy)
  useEffect(() => {
    if (logs.length === 0 && !error) {
      refreshLogs();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const execDefaultColumns = {
    id: false, projectName: true, environment: true, userName: true,
    activityType: true, timestamp: true, status: true,
    artifactCount: true, parameterCount: true, timeTaken: true,
    logFile: true, resultFile: true
  };

  const [execColumns, setExecColumns] = useState(() => {
    const saved = sessionStorage.getItem('logsColumnVisibility');
    return saved ? JSON.parse(saved) : execDefaultColumns;
  });

  useEffect(() => {
    sessionStorage.setItem('logsColumnVisibility', JSON.stringify(execColumns));
  }, [execColumns]);

  const toggleExecColumn = useCallback((key) => {
    setExecColumns(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const execColumnConfig = [
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

  const logsWithAccess = useMemo(() => {
    if (!userInfo || !projects) return logs;
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const admin = isDev || userInfo.isAdmin || userInfo.scopes?.some(s => s.endsWith('.Admin'));
    return logs.map(log => {
      if (admin) return { ...log, hasAccess: true };
      const project = projects.find(p => p.projectName === log.projectName && p.environment === log.environment);
      const userId = userInfo.email || userInfo.id;
      let members = [];
      if (project?.projectMembers) {
        try { members = typeof project.projectMembers === 'string' ? JSON.parse(project.projectMembers) : project.projectMembers; }
        catch (e) { members = []; }
      }
      return { ...log, hasAccess: members.includes(userId) };
    });
  }, [logs, projects, userInfo]);

  const execUniqueProjects = useMemo(() => [...new Set(logsWithAccess.map(l => l.projectName).filter(Boolean))].sort(), [logsWithAccess]);
  const execUniqueEnvs = useMemo(() => [...new Set(logsWithAccess.map(l => l.environment).filter(Boolean))].sort(), [logsWithAccess]);

  const filteredExecLogs = useMemo(() => logsWithAccess.filter(log => {
    const matchProject = !execProjectFilter || log.projectName === execProjectFilter;
    const matchEnv = !execEnvFilter || log.environment === execEnvFilter;
    const matchSearch = !execSearch ||
      log.projectName?.toLowerCase().includes(execSearch.toLowerCase()) ||
      log.environment?.toLowerCase().includes(execSearch.toLowerCase()) ||
      log.userName?.toLowerCase().includes(execSearch.toLowerCase()) ||
      log.activityType?.toLowerCase().includes(execSearch.toLowerCase());
    return matchProject && matchEnv && matchSearch;
  }), [logsWithAccess, execProjectFilter, execEnvFilter, execSearch]);

  const execTotalPages = Math.ceil(filteredExecLogs.length / execItemsPerPage);
  const execCurrentLogs = filteredExecLogs.slice((execPage - 1) * execItemsPerPage, execPage * execItemsPerPage);

  useEffect(() => { setExecPage(1); }, [logs.length, execProjectFilter, execEnvFilter, execSearch]);

  const handleExecItemsPerPage = useCallback((n) => { setExecItemsPerPage(n); setExecPage(1); }, []);
  const handleClearExecFilters = useCallback(() => { setExecProjectFilter(''); setExecEnvFilter(''); setExecSearch(''); }, []);

  useEffect(() => {
    const handler = (e) => { if (execSettingsRef.current && !execSettingsRef.current.contains(e.target)) setShowExecSettings(false); };
    if (showExecSettings) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExecSettings]);

  const accessibleLogsForDeletion = useMemo(() => logsWithAccess.filter(l => l.hasAccess && (l.logContent || l.resultContent)), [logsWithAccess]);
  const filteredAccessibleLogs = useMemo(() => accessibleLogsForDeletion.filter(log => {
    if (!modalSearchQuery) return true;
    const q = modalSearchQuery.toLowerCase();
    return log.projectName?.toLowerCase().includes(q) || log.environment?.toLowerCase().includes(q) ||
      log.activityType?.toLowerCase().includes(q) || log.userName?.toLowerCase().includes(q);
  }), [accessibleLogsForDeletion, modalSearchQuery]);

  const handleDeleteContent = async () => {
    if (!selectedLogForDeletion) return;
    setIsDeletingContent(true);
    setDeleteError('');
    try {
      const response = await axios.delete(`${API_URL}/api/logs/content`, { data: { logIds: [selectedLogForDeletion.id] } });
      if (response.data.success) {
        setShowDeleteModal(false);
        setShowDeleteConfirmation(false);
        setSelectedLogForDeletion(null);
        setModalSearchQuery('');
        setDeleteSuccess('Log content deleted successfully');
        setTimeout(() => setDeleteSuccess(''), 5000);
        refreshLogs();
        if (refreshCleanupLogs) refreshCleanupLogs();
      }
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete log content');
    } finally {
      setIsDeletingContent(false);
    }
  };

  // ════════════════════════════════════════════════════════════
  // TRANSPORT LOGS STATE
  // ════════════════════════════════════════════════════════════
  const [tPage, setTPage] = useState(1);
  const [tItemsPerPage, setTItemsPerPage] = useState(25);
  const [tProjectFilter, setTProjectFilter] = useState('');
  const [tEnvFilter, setTEnvFilter] = useState('');
  const [tSearch, setTSearch] = useState('');
  const [showTSettings, setShowTSettings] = useState(false);
  const tSettingsRef = useRef(null);

  const [tSelectedLogs, setTSelectedLogs] = useState(new Set());
  const [showTDeleteConfirm, setShowTDeleteConfirm] = useState(false);
  const [tDeleteAll, setTDeleteAll] = useState(false);
  const [tIsDeleting, setTIsDeleting] = useState(false);
  const [tIsExporting, setTIsExporting] = useState(false);
  const [tActionMessage, setTActionMessage] = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());

  const tDefaultColumns = {
    id: false, projectName: true, environment: true, userName: true, timestamp: true,
    status: true, sourcePackageId: true, sourceIflowName: true,
    targetPackageId: true, targetIflowName: true,
    sourceIflowId: false, targetIflowId: false, timeTaken: false
  };

  const [tColumns, setTColumns] = useState(() => {
    const saved = sessionStorage.getItem('transportLogsColumnVisibility');
    return saved ? JSON.parse(saved) : tDefaultColumns;
  });

  useEffect(() => {
    sessionStorage.setItem('transportLogsColumnVisibility', JSON.stringify(tColumns));
  }, [tColumns]);

  const toggleTColumn = useCallback((key) => { setTColumns(prev => ({ ...prev, [key]: !prev[key] })); }, []);

  const tColumnConfig = [
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

  const tLogsWithAccess = useMemo(() => {
    if (!userInfo || !projects) return transportLogs;
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const admin = isDev || userInfo.isAdmin || userInfo.scopes?.some(s => s.endsWith('.Admin'));
    return transportLogs.map(log => {
      if (admin) return { ...log, hasAccess: true };
      const project = projects.find(p => p.projectName === log.projectName && p.environment === log.environment);
      const userId = userInfo.email || userInfo.id;
      let members = [];
      if (project?.projectMembers) {
        try { members = typeof project.projectMembers === 'string' ? JSON.parse(project.projectMembers) : project.projectMembers; }
        catch (e) { members = []; }
      }
      return { ...log, hasAccess: members.includes(userId) };
    });
  }, [transportLogs, projects, userInfo]);

  const tUniqueProjects = useMemo(() => [...new Set(tLogsWithAccess.map(l => l.projectName).filter(Boolean))].sort(), [tLogsWithAccess]);
  const tUniqueEnvs = useMemo(() => [...new Set(tLogsWithAccess.map(l => l.environment).filter(Boolean))].sort(), [tLogsWithAccess]);

  const filteredTLogs = useMemo(() => tLogsWithAccess.filter(log => {
    const matchProject = !tProjectFilter || log.projectName === tProjectFilter;
    const matchEnv = !tEnvFilter || log.environment === tEnvFilter;
    const matchSearch = !tSearch ||
      log.projectName?.toLowerCase().includes(tSearch.toLowerCase()) ||
      log.environment?.toLowerCase().includes(tSearch.toLowerCase()) ||
      log.userName?.toLowerCase().includes(tSearch.toLowerCase()) ||
      log.sourcePackageId?.toLowerCase().includes(tSearch.toLowerCase()) ||
      log.targetPackageId?.toLowerCase().includes(tSearch.toLowerCase()) ||
      log.sourceIflowName?.toLowerCase().includes(tSearch.toLowerCase()) ||
      log.targetIflowName?.toLowerCase().includes(tSearch.toLowerCase());
    return matchProject && matchEnv && matchSearch;
  }), [tLogsWithAccess, tProjectFilter, tEnvFilter, tSearch]);

  const tTotalPages = Math.ceil(filteredTLogs.length / tItemsPerPage);
  const tCurrentLogs = filteredTLogs.slice((tPage - 1) * tItemsPerPage, tPage * tItemsPerPage);

  useEffect(() => { setTPage(1); }, [transportLogs.length, tProjectFilter, tEnvFilter, tSearch]);
  useEffect(() => { setTSelectedLogs(new Set()); }, [tProjectFilter, tEnvFilter, tSearch]);

  const handleTItemsPerPage = useCallback((n) => { setTItemsPerPage(n); setTPage(1); }, []);
  const handleClearTFilters = useCallback(() => { setTProjectFilter(''); setTEnvFilter(''); setTSearch(''); }, []);

  useEffect(() => {
    const handler = (e) => { if (tSettingsRef.current && !tSettingsRef.current.contains(e.target)) setShowTSettings(false); };
    if (showTSettings) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTSettings]);

  const handleSelectTLog = useCallback((logId, checked) => {
    setTSelectedLogs(prev => { const s = new Set(prev); checked ? s.add(logId) : s.delete(logId); return s; });
  }, []);

  const handleSelectAllT = useCallback((checked) => {
    setTSelectedLogs(checked ? new Set(filteredTLogs.map(l => l.id)) : new Set());
  }, [filteredTLogs]);

  const handleToggleExpand = useCallback((logId) => {
    setExpandedRows(prev => { const s = new Set(prev); s.has(logId) ? s.delete(logId) : s.add(logId); return s; });
  }, []);

  const handleTExport = async () => {
    setTIsExporting(true);
    setTActionMessage('');
    try {
      const response = await axios.post(`${API_URL}/api/transport-logs/export`, {}, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `transport-logs-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setTActionMessage('Transport logs exported successfully');
      setTimeout(() => setTActionMessage(''), 3000);
    } catch (err) {
      setTActionMessage(err.response?.data?.error || 'Failed to export transport logs');
    } finally {
      setTIsExporting(false);
    }
  };

  const handleTDeleteSelected = () => {
    if (tSelectedLogs.size === 0) { setTActionMessage('Please select logs to delete'); setTimeout(() => setTActionMessage(''), 3000); return; }
    setTDeleteAll(false);
    setShowTDeleteConfirm(true);
  };

  const handleTDeleteAll = () => { setTDeleteAll(true); setShowTDeleteConfirm(true); };

  const confirmTDelete = async () => {
    setShowTDeleteConfirm(false);
    setTIsDeleting(true);
    setTActionMessage('');
    try {
      const payload = tDeleteAll ? { deleteAll: true } : { ids: Array.from(tSelectedLogs) };
      const response = await axios.post(`${API_URL}/api/transport-logs/bulk-delete`, payload);
      setTActionMessage(response.data.message || 'Logs deleted successfully');
      setTSelectedLogs(new Set());
      setTimeout(() => { if (refreshTransportLogs) refreshTransportLogs(); setTActionMessage(''); }, 2000);
    } catch (err) {
      setTActionMessage(err.response?.data?.error || 'Failed to delete logs');
    } finally {
      setTIsDeleting(false);
    }
  };

  const allTSelected = filteredTLogs.length > 0 && tSelectedLogs.size === filteredTLogs.length;

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <div className="page-content">
      <h2>Logs</h2>

      {/* ── Tab Switcher ── */}
      <div style={{
        display: 'flex',
        borderBottom: '2px solid #e0e0e0',
        marginBottom: '1.5rem',
        gap: '0'
      }}>
        {[
          { key: 'execution', label: 'Execution Logs' },
          { key: 'transport', label: 'Transport Logs' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderBottom: activeTab === tab.key ? '3px solid #005fbc' : '3px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === tab.key ? '600' : '400',
              fontSize: '0.95rem',
              color: activeTab === tab.key ? '#005fbc' : '#666',
              marginBottom: '-2px',
              transition: 'color 0.2s, border-color 0.2s'
            }}
          >
            {tab.label}
            <span style={{
              marginLeft: '0.5rem',
              padding: '0.1rem 0.5rem',
              borderRadius: '12px',
              fontSize: '0.8rem',
              backgroundColor: activeTab === tab.key ? '#005fbc' : '#e0e0e0',
              color: activeTab === tab.key ? 'white' : '#666',
              fontWeight: '500'
            }}>
              {tab.key === 'execution' ? logs.length : transportLogs.length}
            </span>
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          EXECUTION LOGS TAB
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'execution' && (
        <>
          {error && <div className="form-error" style={{ maxWidth: '100%' }}>{error}</div>}

          {/* Search + Filter bar */}
          <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', position: 'relative' }}>
            <div style={{ flex: '2', minWidth: '300px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#555' }}>Search Logs</label>
              <div className="search-input-wrapper">
                <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                <input type="text" className="search-input" placeholder="Search by project, environment, user, or activity..." value={execSearch} onChange={(e) => setExecSearch(e.target.value)} />
                {execSearch && <button className="search-clear-btn" onClick={() => setExecSearch('')} title="Clear search">×</button>}
              </div>
            </div>
            <div style={{ flex: '1', minWidth: '180px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#555' }}>Filter by Project</label>
              <select value={execProjectFilter} onChange={(e) => setExecProjectFilter(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1dadd', borderRadius: '4px', fontSize: '0.9rem' }}>
                <option value="">All Projects</option>
                {execUniqueProjects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ flex: '1', minWidth: '180px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#555' }}>Filter by Environment</label>
              <select value={execEnvFilter} onChange={(e) => setExecEnvFilter(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1dadd', borderRadius: '4px', fontSize: '0.9rem' }}>
                <option value="">All Environments</option>
                {execUniqueEnvs.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <button onClick={handleClearExecFilters} className="btn-primary" disabled={!execProjectFilter && !execEnvFilter && !execSearch} style={{ height: '38px', padding: '0 1.5rem', whiteSpace: 'nowrap' }}>Clear All Filters</button>

            {/* Delete icon */}
            <button onClick={() => setShowDeleteModal(true)} style={{ background: 'none', border: '1px solid #dc3545', borderRadius: '4px', padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '38px', width: '38px', color: '#dc3545' }}
              title="Delete Sensitive Log Content"
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#dc3545'; e.currentTarget.style.color = '#fff'; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#dc3545'; }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>

            {/* Settings icon */}
            <div ref={execSettingsRef} style={{ position: 'relative' }}>
              <button onClick={() => setShowExecSettings(!showExecSettings)} style={{ background: 'none', border: '1px solid #d1dadd', borderRadius: '4px', padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '38px', width: '38px' }}
                title="Column Settings"
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f7f9'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                <SettingsIcon />
              </button>
              {showExecSettings && (
                <div style={{ position: 'absolute', top: '100%', right: '0', marginTop: '0.5rem', background: '#ffffff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: '300px', zIndex: 1000, border: '1px solid #d1dadd' }}>
                  <div style={{ position: 'absolute', top: '-8px', right: '12px', width: '0', height: '0', borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '8px solid #ffffff', filter: 'drop-shadow(0 -2px 2px rgba(0,0,0,0.1))' }}></div>
                  <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', color: '#005fbc' }}>Column Visibility</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
                    {execColumnConfig.map(col => (
                      <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem', borderRadius: '4px' }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f7f9'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <input type="checkbox" checked={execColumns[col.key]} onChange={() => toggleExecColumn(col.key)} style={{ cursor: 'pointer' }} />
                        <span style={{ fontSize: '0.9rem' }}>{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {execSearch && (
            <div className="search-results-info" style={{ marginBottom: '1.5rem' }}>
              Found {filteredExecLogs.length} result{filteredExecLogs.length !== 1 ? 's' : ''} for "{execSearch}"
            </div>
          )}

          <div className="table-container">
            <table className="logs-table">
              <thead>
                <tr>
                  {execColumns.id && <th>Database Id</th>}
                  {execColumns.projectName && <th>Project</th>}
                  {execColumns.environment && <th>Environment</th>}
                  {execColumns.userName && <th>User</th>}
                  {execColumns.activityType && <th>Activity</th>}
                  {execColumns.timestamp && <th>Timestamp</th>}
                  {execColumns.status && <th>Status</th>}
                  {execColumns.artifactCount && <th>Artifact Count</th>}
                  {execColumns.parameterCount && <th>Parameter Count</th>}
                  {execColumns.timeTaken && <th>Time Taken (s)</th>}
                  {execColumns.logFile && <th>Log File</th>}
                  {execColumns.resultFile && <th>Result File</th>}
                </tr>
              </thead>
              <tbody>
                {execCurrentLogs.length === 0 && (
                  <tr><td colSpan={Object.values(execColumns).filter(Boolean).length} style={{ textAlign: 'center' }}>No logs found.</td></tr>
                )}
                {execCurrentLogs.map(log => (
                  <LogRow key={log.id} log={log} visibleColumns={execColumns} hasAccess={log.hasAccess} />
                ))}
              </tbody>
            </table>
          </div>

          {filteredExecLogs.length > 0 && (
            <Pagination currentPage={execPage} totalPages={execTotalPages} onPageChange={setExecPage}
              itemsPerPage={execItemsPerPage} totalItems={filteredExecLogs.length} onItemsPerPageChange={handleExecItemsPerPage} />
          )}

          {/* Success toast */}
          {deleteSuccess && (
            <div style={{ position: 'fixed', top: '80px', right: '20px', background: '#d4edda', border: '1px solid #28a745', color: '#155724', padding: '1rem 1.5rem', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 10000, maxWidth: '400px' }}>
              ✓ {deleteSuccess}
            </div>
          )}

          {/* Delete modal */}
          {showDeleteModal && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
              <div style={{ background: '#ffffff', borderRadius: '8px', maxWidth: '700px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, color: '#005fbc', fontSize: '1.25rem' }}>Delete Sensitive Log Content</h3>
                  <button onClick={() => { setShowDeleteModal(false); setSelectedLogForDeletion(null); setModalSearchQuery(''); setDeleteError(''); setShowDeleteConfirmation(false); }}
                    style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666', padding: '0', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>×</button>
                </div>

                {!showDeleteConfirmation ? (
                  <>
                    <div style={{ padding: '1.5rem', flex: 1 }}>
                      <p style={{ marginTop: 0, marginBottom: '1rem', color: '#555' }}>Select a log to permanently delete its sensitive content:</p>
                      <div className="search-input-wrapper" style={{ marginBottom: '1rem' }}>
                        <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                        <input type="text" className="search-input" placeholder="Search logs..." value={modalSearchQuery} onChange={(e) => setModalSearchQuery(e.target.value)} style={{ paddingLeft: '2.5rem' }} />
                      </div>
                      {deleteError && <div style={{ padding: '0.75rem', marginBottom: '1rem', background: '#fee', border: '1px solid #fcc', borderRadius: '4px', color: '#c00' }}>{deleteError}</div>}
                      <div style={{ border: '1px solid #e0e0e0', borderRadius: '4px', maxHeight: '350px', overflowY: 'auto' }}>
                        {filteredAccessibleLogs.length === 0 ? (
                          <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>
                            {accessibleLogsForDeletion.length === 0 ? <><p>No logs available for deletion.</p><p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>You don't have access to any logs or there are no logs with content.</p></> : <p>No logs match your search.</p>}
                          </div>
                        ) : (
                            filteredAccessibleLogs.map(log => (
                              <div key={log.id} onClick={() => setSelectedLogForDeletion(log)}
                                style={{ padding: '1rem', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: selectedLogForDeletion?.id === log.id ? '#e7f3ff' : 'transparent', borderLeft: selectedLogForDeletion?.id === log.id ? '3px solid #005fbc' : '3px solid transparent', transition: 'all 0.2s' }}
                                onMouseOver={(e) => { if (selectedLogForDeletion?.id !== log.id) e.currentTarget.style.backgroundColor = '#f5f7f9'; }}
                                onMouseOut={(e) => { if (selectedLogForDeletion?.id !== log.id) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                <input type="radio" checked={selectedLogForDeletion?.id === log.id} onChange={() => setSelectedLogForDeletion(log)} style={{ marginTop: '0.2rem', cursor: 'pointer' }} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: '600', color: '#333', marginBottom: '0.25rem' }}>{log.projectName} / {log.environment} / {log.activityType}</div>
                                  <div style={{ fontSize: '0.85rem', color: '#666', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                    <span>📅 {log.timestamp}</span>
                                    <span className={`status-badge status-${log.status?.toLowerCase()}`} style={{ fontSize: '0.75rem' }}>{log.status}</span>
                                    {log.artifactCount && <span>📦 {log.artifactCount}</span>}
                                    {log.userName && <span>👤 {log.userName}</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      {filteredAccessibleLogs.length > 0 && (
                        <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#666' }}>
                          Showing {filteredAccessibleLogs.length} log{filteredAccessibleLogs.length !== 1 ? 's' : ''} you have access to
                          {selectedLogForDeletion && <span style={{ fontWeight: '600', color: '#005fbc' }}> • Selected: 1 log</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '1.5rem', borderTop: '1px solid #e0e0e0', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                      <button onClick={() => { setShowDeleteModal(false); setSelectedLogForDeletion(null); setModalSearchQuery(''); setDeleteError(''); }} style={{ padding: '0.6rem 1.5rem', border: '1px solid #d1dadd', background: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '0.95rem' }}>Cancel</button>
                      <button onClick={() => setShowDeleteConfirmation(true)} disabled={!selectedLogForDeletion} className="btn-primary" style={{ padding: '0.6rem 1rem', backgroundColor: '#dc3545', opacity: !selectedLogForDeletion ? 0.5 : 1, cursor: !selectedLogForDeletion ? 'not-allowed' : 'pointer' }}>Delete Content</button>
                    </div>
                  </>
                ) : (
                    <div style={{ padding: '1.5rem', flex: 1 }}>
                      <div style={{ padding: '1rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', marginBottom: '1rem' }}>
                      <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                        <strong style={{ color: '#856404', marginLeft: '0.5rem' }}>Confirm Deletion</strong>
                      </div>
                      {selectedLogForDeletion && (
                        <div style={{ background: '#f5f7f9', border: '1px solid #d1dadd', borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
                          <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.95rem' }}>
                            <div><strong>📋 Project:</strong> {selectedLogForDeletion.projectName}</div>
                            <div><strong>🌍 Environment:</strong> {selectedLogForDeletion.environment}</div>
                            <div><strong>⚡ Activity:</strong> {selectedLogForDeletion.activityType}</div>
                            <div><strong>📅 Date:</strong> {selectedLogForDeletion.timestamp}</div>
                            <div><strong>👤 User:</strong> {selectedLogForDeletion.userName}</div>
                        </div>
                      </div>
                    )}
                    <div style={{ background: '#fee', border: '1px solid #fcc', borderRadius: '6px', padding: '1rem', fontSize: '0.9rem' }}>
                      <p style={{ margin: '0 0 0.5rem 0', fontWeight: '600', color: '#c00' }}>⚠️ This will permanently delete log and result file content.</p>
                    </div>
                    {deleteError && <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fee', border: '1px solid #fcc', borderRadius: '4px', color: '#c00' }}>{deleteError}</div>}
                    <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                      <button onClick={() => { setShowDeleteConfirmation(false); setDeleteError(''); }} disabled={isDeletingContent} style={{ padding: '0.6rem 1.5rem', border: '1px solid #d1dadd', background: 'white', borderRadius: '4px', cursor: isDeletingContent ? 'not-allowed' : 'pointer', opacity: isDeletingContent ? 0.5 : 1 }}>Go Back</button>
                      <button onClick={handleDeleteContent} disabled={isDeletingContent} className="btn-primary"
                        style={{ padding: '0.6rem 1.5rem', backgroundColor: '#dc3545', cursor: isDeletingContent ? 'not-allowed' : 'pointer', opacity: isDeletingContent ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {isDeletingContent ? (<><span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}></span>Deleting...</>) : 'Yes, Delete Content'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          TRANSPORT LOGS TAB
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'transport' && (
        <>
          {transportLogsError && <div className="form-error" style={{ maxWidth: '100%' }}>{transportLogsError}</div>}

          {/* Search + Filter bar */}
          <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', position: 'relative' }}>
            <div style={{ flex: '2', minWidth: '300px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#555' }}>Search Transport Logs</label>
              <div className="search-input-wrapper">
                <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                <input type="text" className="search-input" placeholder="Search by project, environment, user, packages, or iFlows..." value={tSearch} onChange={(e) => setTSearch(e.target.value)} />
                {tSearch && <button className="search-clear-btn" onClick={() => setTSearch('')} title="Clear search">×</button>}
              </div>
            </div>
            <div style={{ flex: '1', minWidth: '180px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#555' }}>Filter by Project</label>
              <select value={tProjectFilter} onChange={(e) => setTProjectFilter(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1dadd', borderRadius: '4px', fontSize: '0.9rem' }}>
                <option value="">All Projects</option>
                {tUniqueProjects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ flex: '1', minWidth: '180px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#555' }}>Filter by Environment</label>
              <select value={tEnvFilter} onChange={(e) => setTEnvFilter(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1dadd', borderRadius: '4px', fontSize: '0.9rem' }}>
                <option value="">All Environments</option>
                {tUniqueEnvs.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <button onClick={handleClearTFilters} className="btn-primary" disabled={!tProjectFilter && !tEnvFilter && !tSearch} style={{ height: '38px', padding: '0 1.5rem', whiteSpace: 'nowrap' }}>Clear All Filters</button>

            {/* Settings icon */}
            <div ref={tSettingsRef} style={{ position: 'relative' }}>
              <button onClick={() => setShowTSettings(!showTSettings)} style={{ background: 'none', border: '1px solid #d1dadd', borderRadius: '4px', padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '38px', width: '38px' }}
                title="Column Settings"
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f7f9'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                <SettingsIcon />
              </button>
              {showTSettings && (
                <div style={{ position: 'absolute', top: '100%', right: '0', marginTop: '0.5rem', background: '#ffffff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: '300px', zIndex: 1000, border: '1px solid #d1dadd' }}>
                  <div style={{ position: 'absolute', top: '-8px', right: '12px', width: '0', height: '0', borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '8px solid #ffffff', filter: 'drop-shadow(0 -2px 2px rgba(0,0,0,0.1))' }}></div>
                  <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', color: '#005fbc' }}>Column Visibility</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
                    {tColumnConfig.map(col => (
                      <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem', borderRadius: '4px' }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f7f9'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <input type="checkbox" checked={tColumns[col.key]} onChange={() => toggleTColumn(col.key)} style={{ cursor: 'pointer' }} />
                        <span style={{ fontSize: '0.9rem' }}>{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {tSearch && (
            <div className="search-results-info" style={{ marginBottom: '1.5rem' }}>
              Found {filteredTLogs.length} result{filteredTLogs.length !== 1 ? 's' : ''} for "{tSearch}"
            </div>
          )}

          {/* Admin action buttons */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <button onClick={handleTExport} disabled={tIsExporting || transportLogs.length === 0} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {tIsExporting ? (<><svg style={{ animation: 'spin 1s linear infinite' }} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>Exporting...</>) : (<><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>Export to CSV</>)}
              </button>
              <button onClick={handleTDeleteSelected} disabled={tIsDeleting || tSelectedLogs.size === 0}
                style={{ padding: '0.5rem 1.5rem', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: tSelectedLogs.size === 0 || tIsDeleting ? 'not-allowed' : 'pointer', fontSize: '0.9rem', fontWeight: '500', opacity: tSelectedLogs.size === 0 || tIsDeleting ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Delete Selected ({tSelectedLogs.size})
              </button>
              <button onClick={handleTDeleteAll} disabled={tIsDeleting || transportLogs.length === 0}
                style={{ padding: '0.5rem 1.5rem', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: transportLogs.length === 0 || tIsDeleting ? 'not-allowed' : 'pointer', fontSize: '0.9rem', fontWeight: '500', opacity: transportLogs.length === 0 || tIsDeleting ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                Delete All Logs
              </button>
              {tSelectedLogs.size > 0 && <span style={{ color: '#666', fontSize: '0.9rem' }}>{tSelectedLogs.size} of {filteredTLogs.length} selected</span>}
            </div>
          )}

          {tActionMessage && (
            <div style={{ padding: '1rem', marginBottom: '1.5rem', background: tActionMessage.includes('success') || tActionMessage.includes('exported') || tActionMessage.includes('deleted') ? '#d4edda' : '#f8d7da', border: `1px solid ${tActionMessage.includes('success') || tActionMessage.includes('exported') || tActionMessage.includes('deleted') ? '#28a745' : '#dc3545'}`, borderRadius: '4px', color: '#333' }}>
              {tActionMessage}
            </div>
          )}

          {/* Delete confirmation */}
          {showTDeleteConfirm && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
              <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', maxWidth: '500px', width: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                <h3 style={{ marginTop: 0, color: '#dc3545' }}>Confirm Delete</h3>
                <p style={{ marginBottom: '1.5rem', lineHeight: '1.5' }}>
                  {tDeleteAll ? `Are you sure you want to delete all ${transportLogs.length} transport log(s)? This action cannot be undone.` : `Are you sure you want to delete ${tSelectedLogs.size} selected transport log(s)? This action cannot be undone.`}
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowTDeleteConfirm(false)} style={{ padding: '0.5rem 1.5rem', border: '1px solid #d1dadd', background: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>Cancel</button>
                  <button onClick={confirmTDelete} style={{ padding: '0.5rem 1.5rem', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>Yes, Delete</button>
                </div>
              </div>
            </div>
          )}

          <div className="table-container">
            <table className="logs-table">
              <thead>
                <tr>
                  {isAdmin && <th style={{ width: '50px', textAlign: 'center' }}><input type="checkbox" checked={allTSelected} onChange={(e) => handleSelectAllT(e.target.checked)} style={{ cursor: 'pointer' }} title="Select All" /></th>}
                  {tColumns.id && <th>ID</th>}
                  {tColumns.projectName && <th>Project</th>}
                  {tColumns.environment && <th>Environment</th>}
                  {tColumns.userName && <th>User</th>}
                  {tColumns.timestamp && <th>Timestamp</th>}
                  {tColumns.status && <th>Status</th>}
                  {tColumns.sourcePackageId && <th>Source Package</th>}
                  {tColumns.sourceIflowName && <th>Source iFlow Name</th>}
                  {tColumns.targetPackageId && <th>Target Package</th>}
                  {tColumns.targetIflowName && <th>Target iFlow Name</th>}
                  {tColumns.sourceIflowId && <th>Source iFlow ID</th>}
                  {tColumns.targetIflowId && <th>Target iFlow ID</th>}
                  {tColumns.timeTaken && <th>Time Taken</th>}
                </tr>
              </thead>
              <tbody>
                {tCurrentLogs.length === 0 && (
                  <tr><td colSpan={(isAdmin ? 1 : 0) + Object.values(tColumns).filter(Boolean).length} style={{ textAlign: 'center' }}>No transport logs found.</td></tr>
                )}
                {tCurrentLogs.map(log => (
                  <TransportLogRow key={log.id} log={log} visibleColumns={tColumns} isAdmin={isAdmin}
                    selected={tSelectedLogs.has(log.id)} onSelect={handleSelectTLog}
                    expanded={expandedRows.has(log.id)} onToggleExpand={handleToggleExpand} />
                ))}
              </tbody>
            </table>
          </div>

          {filteredTLogs.length > 0 && (
            <Pagination currentPage={tPage} totalPages={tTotalPages} onPageChange={setTPage}
              itemsPerPage={tItemsPerPage} totalItems={filteredTLogs.length} onItemsPerPageChange={handleTItemsPerPage} />
          )}
        </>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
});

LogsPage.displayName = 'LogsPage';

export default LogsPage;