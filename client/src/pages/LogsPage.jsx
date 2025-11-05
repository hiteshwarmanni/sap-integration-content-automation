// client/src/pages/LogsPage.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

// We get this from the other pages
const API_URL = 'http://localhost:3001';

function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');

  // Fetch logs when the page loads
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/logs`);
        setLogs(data);
      } catch (err) {
        setError('Failed to fetch logs. Is the server running?');
        console.error(err);
      }
    };

    fetchLogs();
  }, []); // The empty array [] means this runs once on mount

  return (
    <div className="page-content">
      <h2>Execution Logs</h2>
      
      {error && <div className="form-error" style={{ maxWidth: '100%' }}>{error}</div>}
      
      <div className="table-container">
        <table className="logs-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Project</th>
              <th>Environment</th>
              <th>User</th>
              <th>Activity</th>
              <th>Timestamp</th>
              <th>Execution Log</th>
              <th>Result File</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center' }}>No logs found.</td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.id}</td>
                <td>{log.projectName}</td>
                <td>{log.environment}</td>
                <td>{log.userName}</td>
                <td>{log.activityType}</td>
                <td>{log.timestamp}</td>
                <td>
                  {log.logFile ? (
                    <a href={`${API_URL}/api/download/log/${log.id}`} className="download-link-table">
                      Download
                    </a>
                  ) : (
                    'N/A'
                  )}
                </td>
                <td>
                  {log.resultFile ? (
                    <a href={`${API_URL}/api/download/result/${log.id}`} className="download-link-table">
                      Download
                    </a>
                  ) : (
                    'N/A'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default LogsPage;