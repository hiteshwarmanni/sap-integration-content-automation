// client/src/pages/CleanupLogsPage.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import Pagination from '../components/Pagination';

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

// Helper function to format date for display
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    } catch (e) {
        return dateString;
    }
}

// Helper function to format date for input field
function formatDateForInput(date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const CleanupLogsPage = ({ cleanupLogs, error, refreshCleanupLogs, refreshLogs, userInfo }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [isRunning, setIsRunning] = useState(false);
    const [runMessage, setRunMessage] = useState('');
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [countdown, setCountdown] = useState('');

    // Calculate countdown to next scheduled cleanup (midnight UTC)
    useEffect(() => {
        const updateCountdown = () => {
            const now = new Date();
            const nextMidnightUTC = new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() + 1,
                0, 0, 0, 0
            ));

            const diff = nextMidnightUTC - now;

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            setCountdown(`${hours}h ${minutes}m ${seconds}s`);
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);

        return () => clearInterval(interval);
    }, []);

    // Fetch cleanup logs on component mount (lazy loading)
    useEffect(() => {
        if (cleanupLogs.length === 0 && !error) {
            refreshCleanupLogs();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Client-side pagination - calculate from all logs
    const totalPages = Math.ceil(cleanupLogs.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentLogs = cleanupLogs.slice(startIndex, endIndex);

    // Handle items per page change
    const handleItemsPerPageChange = useCallback((newItemsPerPage) => {
        setItemsPerPage(newItemsPerPage);
        setCurrentPage(1);
    }, []);

    // Reset to page 1 when logs change
    useEffect(() => {
        setCurrentPage(1);
    }, [cleanupLogs.length]);

    // Toggle row expansion
    const toggleRowExpansion = (id) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    // Show confirmation dialog
    const handleRunCleanupClick = () => {
        setShowConfirmDialog(true);
    };

    // Cancel cleanup
    const handleCancelCleanup = () => {
        setShowConfirmDialog(false);
    };

    // Confirm and run cleanup job
    const handleConfirmCleanup = async () => {
        setShowConfirmDialog(false);
        setIsRunning(true);
        setRunMessage('');

        try {
            const response = await axios.post(`${API_URL}/api/cleanup/run`);
            setRunMessage(response.data.message || 'Cleanup job started successfully');

            // Refresh both cleanup logs and execution logs after a delay
            setTimeout(() => {
                refreshCleanupLogs();
                refreshLogs(); // Also refresh execution logs to reflect cleared content
                setIsRunning(false);
            }, 3000);
        } catch (err) {
            setRunMessage(err.response?.data?.error || 'Failed to start cleanup job');
            setIsRunning(false);
        }
    };

    return (
        <div className="page-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0 }}>Database Cleanup Logs</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    {/* Countdown Display */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: '#f0f8ff',
                        border: '1px solid #005fbc',
                        borderRadius: '6px'
                    }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#005fbc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#666' }}>
                                Next Scheduled Cleanup
                            </div>
                            <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#005fbc', fontFamily: 'monospace' }}>
                                {countdown}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleRunCleanupClick}
                        disabled={isRunning}
                        className="btn-primary"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        {isRunning ? (
                            <>
                                <svg style={{ animation: 'spin 1s linear infinite' }} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                                Running...
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="13 17 18 12 13 7"></polyline>
                                    <polyline points="6 17 11 12 6 7"></polyline>
                                </svg>
                                Run Cleanup Now
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Confirmation Dialog */}
            {showConfirmDialog && (
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
                        <h3 style={{ marginTop: 0, color: '#005fbc' }}>Confirm Cleanup Job</h3>
                        <p style={{ marginBottom: '1.5rem', lineHeight: '1.5' }}>
                            Are you sure you want to run the database cleanup job now?
                            <br /><br />
                            This will clear log content for all entries older than 1 year.
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleCancelCleanup}
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
                                onClick={handleConfirmCleanup}
                                className="btn-primary"
                                style={{
                                    padding: '0.5rem 1.5rem'
                                }}
                            >
                                Yes, Run Cleanup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {runMessage && (
                <div style={{
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    background: isRunning ? '#e7f3ff' : '#d4edda',
                    border: `1px solid ${isRunning ? '#005fbc' : '#28a745'}`,
                    borderRadius: '4px',
                    color: '#333'
                }}>
                    {runMessage}
                </div>
            )}

            {error && <div className="form-error" style={{ maxWidth: '100%', marginBottom: '1.5rem' }}>{error}</div>}

            <>
                <div className="table-container">
                    <table className="logs-table">
                        <thead>
                            <tr>
                                <th style={{ width: '50px' }}></th>
                                <th>ID</th>
                                <th>Execution Time</th>
                                <th>Status</th>
                                <th>Logs Cleaned</th>
                                <th>Duration</th>
                                <th>Cutoff Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentLogs.length === 0 && (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center' }}>No cleanup logs found.</td>
                                </tr>
                            )}
                            {currentLogs.map((log) => (
                                <React.Fragment key={log.id}>
                                    <tr>
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                onClick={() => toggleRowExpansion(log.id)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    color: '#005fbc',
                                                    padding: '0.25rem'
                                                }}
                                                title="View Details"
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="20"
                                                    height="20"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    style={{
                                                        transform: expandedRows.has(log.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                                                        transition: 'transform 0.2s'
                                                    }}
                                                >
                                                    <polyline points="9 18 15 12 9 6"></polyline>
                                                </svg>
                                            </button>
                                        </td>
                                        <td>{log.id}</td>
                                        <td>{formatDate(log.executionTimestamp)}</td>
                                        <td>
                                            <span className={`status-badge status-${log.status?.toLowerCase()}`}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td>{log.logsCleanedCount || 0}</td>
                                        <td>{formatTime(log.durationSeconds)}</td>
                                        <td>{formatDate(log.cutoffDate)}</td>
                                    </tr>
                                    {expandedRows.has(log.id) && (
                                        <tr>
                                            <td colSpan="7" style={{ background: '#f9f9f9', padding: '1rem' }}>
                                                <div style={{ maxWidth: '100%' }}>
                                                    <h4 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#005fbc' }}>Cleanup Details</h4>

                                                    {log.errorMessage && (
                                                        <div style={{
                                                            background: '#fee',
                                                            border: '1px solid #fcc',
                                                            padding: '0.75rem',
                                                            borderRadius: '4px',
                                                            marginBottom: '1rem'
                                                        }}>
                                                            <strong style={{ color: '#c00' }}>Error:</strong> {log.errorMessage}
                                                        </div>
                                                    )}

                                                    {(() => {
                                                        const message = log.message || '';
                                                        const lines = message.split('\n');
                                                        const summaryLine = lines[0] || '';
                                                        const projectLines = lines.slice(2, -2).filter(line => line.trim().startsWith('Project:'));
                                                        const totalLine = lines[lines.length - 1] || '';

                                                        return (
                                                            <div style={{
                                                                background: '#fff',
                                                                border: '1px solid #ddd',
                                                                padding: '1rem',
                                                                borderRadius: '4px',
                                                                fontSize: '0.9rem'
                                                            }}>
                                                                {/* Summary */}
                                                                <div style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: '600', color: '#333' }}>
                                                                    {summaryLine}
                                                                </div>

                                                                {/* Project breakdown as list */}
                                                                {projectLines.length > 0 && (
                                                                    <div style={{ marginBottom: '1rem' }}>
                                                                        <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#555' }}>Projects Cleaned:</div>
                                                                        <ul style={{
                                                                            margin: 0,
                                                                            paddingLeft: '1.5rem',
                                                                            listStyle: 'disc'
                                                                        }}>
                                                                            {projectLines.map((line, idx) => {
                                                                                // Parse: "Project: Trial, Environment: Dev - 3 entries"
                                                                                const match = line.match(/Project:\s*([^,]+),\s*Environment:\s*([^\-]+)\s*-\s*(\d+)\s*entries?/);
                                                                                if (match) {
                                                                                    const [, project, env, count] = match;
                                                                                    return (
                                                                                        <li key={idx} style={{ marginBottom: '0.25rem' }}>
                                                                                            <strong>{project.trim()}</strong> ({env.trim()}) - <span style={{ color: '#005fbc', fontWeight: '600' }}>{count} entries</span>
                                                                                        </li>
                                                                                    );
                                                                                }
                                                                                return <li key={idx}>{line}</li>;
                                                                            })}
                                                                        </ul>
                                                                    </div>
                                                                )}

                                                                {/* Total */}
                                                                {totalLine && (
                                                                    <div style={{
                                                                        paddingTop: '0.75rem',
                                                                        borderTop: '1px solid #eee',
                                                                        fontWeight: '600',
                                                                        color: '#005fbc'
                                                                    }}>
                                                                        {totalLine}
                                                                    </div>
                                                                )}

                                                                {/* If no structured data, show raw message */}
                                                                {projectLines.length === 0 && !summaryLine.includes('Cleaned') && !summaryLine.includes('No logs older than') && (
                                                                    <div style={{
                                                                        fontFamily: 'monospace',
                                                                        fontSize: '0.85rem',
                                                                        whiteSpace: 'pre-wrap',
                                                                        color: '#666'
                                                                    }}>
                                                                        {message || 'No details available'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Component */}
                {cleanupLogs.length > 0 && (
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        itemsPerPage={itemsPerPage}
                        totalItems={cleanupLogs.length}
                        onItemsPerPageChange={handleItemsPerPageChange}
                    />
                )}
            </>

            <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
};

export default CleanupLogsPage;