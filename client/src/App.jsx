// client/src/App.jsx
import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from './config';
// import SAPLogo from './assets/SAP_Logo.png'; // Commented out SAP logo
import softwareLogo from './assets/software.png';

// --- Lazy load page components for better performance ---
const HomePage = lazy(() => import('./pages/HomePage'));
const ProjectMasterPage = lazy(() => import('./pages/ProjectMasterPage'));
const DownloadPage = lazy(() => import('./pages/DownloadPage'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const DeployPage = lazy(() => import('./pages/DeployPage'));
const LogsPage = lazy(() => import('./pages/LogsPage'));

// --- Loading fallback component ---
const LoadingSpinner = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '50vh',
    gap: '1rem'
  }}>
    <div style={{
      width: '40px',
      height: '40px',
      border: '4px solid #f3f3f3',
      borderTop: '4px solid #005fbc',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }}></div>
    <p style={{ color: '#666', fontSize: '0.9rem' }}>Loading page...</p>
    <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

// --- Main App Layout (Cleaned Up) ---
function App() {
  const [sideNavOpen, setSideNavOpen] = useState(true);
  const [isJobRunning, setIsJobRunning] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsError, setLogsError] = useState('');
  const [projects, setProjects] = useState([]);
  const [projectsError, setProjectsError] = useState('');
  const [darkMode, setDarkMode] = useState(() => {
    // Initialize dark mode from localStorage or default to false
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const userMenuRef = useRef(null);
  const sessionTimeoutRef = useRef(null);
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

  // Function to fetch logs (called on app load and when jobs complete)
  const refreshLogs = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/logs`);
      // Sort logs in descending order (newest first) by id
      const sortedLogs = data.sort((a, b) => b.id - a.id);
      setLogs(sortedLogs);
      setLogsError('');
    } catch (err) {
      setLogsError('Failed to fetch logs');
      console.error(err);
    }
  };

  // Function to fetch projects (called on app load and when projects are modified)
  const refreshProjects = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/projects`);
      setProjects(data);
      setProjectsError('');
    } catch (err) {
      setProjectsError('Failed to fetch projects');
      console.error(err);
    }
  };

  // Apply dark mode class to body
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    // Save to localStorage
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // Fetch user info and logs on component mount
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/user-info`);
        setUserInfo(response.data);
      } catch (error) {
        console.error('Failed to fetch user info:', error);
        // Set default user info for local development
        setUserInfo({ name: 'Local User', email: 'local@example.com' });
      }
    };
    fetchUserInfo();
    refreshLogs(); // Fetch logs once on app load
    refreshProjects(); // Fetch projects once on app load
  }, []);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNavClick = () => {
    if (!sideNavOpen) {
      setSideNavOpen(true);
    }
  };

  const handleLogout = () => {
    // Clear any stored tokens/data and redirect to logout endpoint
    window.location.href = `${API_URL}/logout`;
  };

  const toggleUserMenu = () => {
    setShowUserMenu(!showUserMenu);
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // Reset session timeout on user activity
  const resetSessionTimeout = () => {
    // Clear existing timeout
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
    }

    // Set new timeout
    sessionTimeoutRef.current = setTimeout(() => {
      // Show alert and logout
      alert('Your session has expired due to inactivity. You will be logged out.');
      handleLogout();
    }, SESSION_TIMEOUT);
  };

  // Session timeout - track user activity
  useEffect(() => {
    // Events that indicate user activity
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    // Reset timeout on any activity
    const handleActivity = () => {
      resetSessionTimeout();
    };

    // Add event listeners
    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Initialize timeout on mount
    resetSessionTimeout();

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
      }
    };
  }, []);

  return (
    <BrowserRouter>
      <div className={`app-container ${darkMode ? 'dark-mode' : ''}`}>
        <header className="app-header">
          <div className="header-left">
            <button className="menu-btn" onClick={() => setSideNavOpen(!sideNavOpen)}>
              ☰
            </button>
            <NavLink to="/" className="logo-link">
              <img src={softwareLogo} alt="Logo" className="logo" />
            </NavLink>
            <h1 className="app-title" style={{ fontFamily: "Arial, sans-serif" }}>IntOps</h1>
          </div>
          <div className="header-right">
            {/* Dark Mode Toggle - Commented out for now */}
            {/* <button className="theme-toggle-btn" onClick={toggleDarkMode} title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              {darkMode ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="theme-icon">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="theme-icon">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              )}
            </button> */}

            <div className="user-menu-container" ref={userMenuRef}>
              <button className="profile-btn" onClick={toggleUserMenu}>
                <svg className="profile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </button>
              {showUserMenu && (
                <div className="user-dropdown">
                  <div className="user-info">
                    <div className="user-avatar">
                      {userInfo?.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="user-details">
                      <div className="user-name">{userInfo?.name || 'User'}</div>
                      <div className="user-email">{userInfo?.email || ''}</div>
                    </div>
                  </div>
                  <div className="user-menu-divider"></div>
                  <button className="logout-btn" onClick={handleLogout}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <polyline points="16 17 21 12 16 7"></polyline>
                      <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="app-body">
          <nav
            className={`app-nav ${sideNavOpen ? '' : 'collapsed'} ${isJobRunning ? 'nav-disabled' : ''}`}
            style={{ width: sideNavOpen ? '240px' : '60px' }}
          >
            <NavLink to="/" onClick={handleNavClick}>
              <span className="nav-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-svg">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
              </span>
              <span className="nav-text">Home</span>
            </NavLink>

            <NavLink to="/projects" onClick={handleNavClick}>
              <span className="nav-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-svg">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </span>
              <span className="nav-text">Project Master</span>
            </NavLink>

            <NavLink to="/download" onClick={handleNavClick}>
              <span className="nav-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-svg">
                  <line x1="12" y1="5" x2="12" y2="15"></line>
                  <polyline points="18 12 12 18 6 12"></polyline>
                  <line x1="6" y1="20" x2="18" y2="20"></line>
                </svg>
              </span>
              <span className="nav-text">Download Config</span>
            </NavLink>
            <NavLink to="/upload" onClick={handleNavClick}>
              <span className="nav-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-svg">
                  <line x1="12" y1="19" x2="12" y2="9"></line>
                  <polyline points="18 12 12 6 6 12"></polyline>
                  <line x1="6" y1="4" x2="18" y2="4"></line>
                </svg>
              </span>
              <span className="nav-text">Upload Config</span>
            </NavLink>

            <NavLink to="/deploy" onClick={handleNavClick}>
              <span className="nav-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-svg">
                  <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                  <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
                  <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path>
                  <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path>
                </svg>
              </span>
              <span className="nav-text">Deploy/Undeploy</span>
            </NavLink>

            {/* --- 👇 NEW LOGS LINK --- */}
            <NavLink to="/logs" onClick={handleNavClick}>
              <span className="nav-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-svg">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </span>
              <span className="nav-text">Logs</span>
            </NavLink>

          </nav>

          <main className="app-main">
            {/* Wrap routes with Suspense for lazy loading */}
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/index.html" element={<HomePage />} />

                {/* --- We pass the state down to the pages as props --- */}
                <Route
                  path="/download"
                  element={<DownloadPage isJobRunning={isJobRunning} setIsJobRunning={setIsJobRunning} refreshLogs={refreshLogs} projects={projects} />}
                />
                <Route
                  path="/upload"
                  element={<UploadPage isJobRunning={isJobRunning} setIsJobRunning={setIsJobRunning} refreshLogs={refreshLogs} projects={projects} />}
                />
                <Route
                  path="/deploy"
                  element={<DeployPage isJobRunning={isJobRunning} setIsJobRunning={setIsJobRunning} refreshLogs={refreshLogs} projects={projects} />}
                />

                <Route path="/logs" element={<LogsPage logs={logs} error={logsError} refreshLogs={refreshLogs} />} />
                <Route path="/projects" element={<ProjectMasterPage projects={projects} error={projectsError} refreshProjects={refreshProjects} />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
