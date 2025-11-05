// client/src/App.jsx
import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';

// API URL for our server
const API_URL = 'http://localhost:3001';

// --- Import our new pages ---
import HomePage from './pages/HomePage';
import DownloadPage from './pages/DownloadPage';
import UploadPage from './pages/UploadPage';

// --- Build the Main App Layout (Updated) ---
function App() {
  const [sideNavOpen, setSideNavOpen] = useState(true);

  // --- NEW: Function to expand nav on icon click ---
  const handleNavClick = () => {
    if (!sideNavOpen) {
      setSideNavOpen(true);
    }
    // The NavLink will handle the page change automatically
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
            className={`app-nav ${sideNavOpen ? '' : 'collapsed'}`} 
            style={{ width: sideNavOpen ? '240px' : '60px' }}
          >
            {/* --- SVG HOME ICON (No Change) --- */}
            <NavLink to="/" onClick={handleNavClick}>
              <span className="nav-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-svg">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
              </span>
              <span className="nav-text">Home</span>
            </NavLink>

            {/* --- 👇 NEW SVG DOWNLOAD ICON --- */}
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

            {/* --- 👇 NEW SVG UPLOAD ICON --- */}
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
          </nav>
          
          <main className="app-main">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/download" element={<DownloadPage />} />
              <Route path="/upload" element={<UploadPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;