// client/src/App.jsx
import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';

// --- Import our new page ---
import HomePage from './pages/HomePage';
import DownloadPage from './pages/DownloadPage';
import UploadPage from './pages/UploadPage';
import LogsPage from './pages/LogsPage'; // <-- NEW

// --- Main App Layout (Cleaned Up) ---
function App() {
  const [sideNavOpen, setSideNavOpen] = useState(true);

  // This state will be shared with the Download and Upload pages
  const [isJobRunning, setIsJobRunning] = useState(false);

  const handleNavClick = () => {
    if (!sideNavOpen) {
      setSideNavOpen(true);
    }
  };

  return (
    <BrowserRouter>
      <div className="app-container">
        <header className="app-header">
          <button className="menu-btn" onClick={() => setSideNavOpen(!sideNavOpen)}>
            ☰
          </button>
          <h1>SAP Integration Suite Automation</h1>
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
            {/* The routes now point to the imported components */}
            <Routes>
              <Route path="/" element={<HomePage />} />
              
              {/* --- We pass the state down to the pages as props --- */}
              <Route 
                path="/download" 
                element={<DownloadPage isJobRunning={isJobRunning} setIsJobRunning={setIsJobRunning} />} 
              />
              <Route 
                path="/upload" 
                element={<UploadPage isJobRunning={isJobRunning} setIsJobRunning={setIsJobRunning} />} 
              />
              
              <Route path="/logs" element={<LogsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;