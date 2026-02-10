// client/src/components/NotificationDropdown.jsx
// Notification dropdown component for admin users - shows latest cleanup job status

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

function NotificationDropdown({ onClose }) {
    const [cleanupStatus, setCleanupStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchCleanupStatus();
    }, []);

    const fetchCleanupStatus = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`${API_URL}/api/cleanup/latest`);
            setCleanupStatus(response.data);
            setError(null);
        } catch (err) {
            console.error('Failed to fetch cleanup status:', err);
            setError('Failed to load notification');
        } finally {
            setLoading(false);
        }
    };

    const formatTimestamp = (timestamp) => {
        if (!timestamp) return 'Never';
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    };

    const getStatusIcon = (status) => {
        if (status === 'Success') {
            return '✓';
        } else if (status === 'Failed') {
            return '✗';
        } else {
            return '⏳';
        }
    };

    const getStatusColor = (status) => {
        if (status === 'Success') {
            return '#28a745';
        } else if (status === 'Failed') {
            return '#dc3545';
        } else {
            return '#6c757d';
        }
    };

    return (
        <div className="notification-dropdown">
            <div className="notification-header">
                <h3>🔔 Database Cleanup</h3>
                <button className="notification-close-btn" onClick={onClose}>×</button>
            </div>

            <div className="notification-body">
                {loading ? (
                    <div className="notification-loading">Loading...</div>
                ) : error ? (
                    <div className="notification-error">{error}</div>
                ) : cleanupStatus ? (
                    <>
                        <div className="notification-item">
                            <span className="notification-label">Last Run:</span>
                            <span className="notification-value">
                                {formatTimestamp(cleanupStatus.timestamp)}
                            </span>
                        </div>

                        <div className="notification-item">
                            <span className="notification-label">Status:</span>
                            <span
                                className="notification-value notification-status"
                                style={{ color: getStatusColor(cleanupStatus.status) }}
                            >
                                {getStatusIcon(cleanupStatus.status)} {cleanupStatus.status}
                            </span>
                        </div>

                        <div className="notification-item">
                            <span className="notification-label">Entries Cleaned:</span>
                            <span className="notification-value">
                                {cleanupStatus.logsCleanedCount.toLocaleString()}
                            </span>
                        </div>

                        {cleanupStatus.durationSeconds !== undefined && (
                            <div className="notification-item">
                                <span className="notification-label">Duration:</span>
                                <span className="notification-value">
                                    {cleanupStatus.durationSeconds}s
                                </span>
                            </div>
                        )}

                        {cleanupStatus.message && cleanupStatus.message !== 'Database cleanup job has not run yet. It will run automatically at midnight UTC.' && (
                            <div className="notification-details">
                                <div className="notification-label">Details:</div>
                                <pre className="notification-message">
                                    {cleanupStatus.message}
                                </pre>
                            </div>
                        )}

                        {cleanupStatus.status === 'Never Run' && (
                            <div className="notification-info">
                                <p>The cleanup job runs automatically every midnight UTC (5:30 AM IST).</p>
                                <p>It will clear log and result file content for entries older than 1 year.</p>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="notification-empty">No cleanup data available</div>
                )}
            </div>
        </div>
    );
}

export default NotificationDropdown;