// client/src/pages/HomePage.jsx
import React from 'react';

// --- 👇 HomePage (Updated with Instructions) ---
function HomePage() {
  return (
    <div className="page-content">
      <h2>Welcome to the SAP Automation Tool</h2>
      <p style={{ textAlign: 'center', marginBottom: '2rem' }}>
        This tool automates managing SAP CPI iFlow configurations.
      </p>

      {/* --- Card 1: What it Does --- */}
      <div className="info-card">
        <h3>What This App Does</h3>
        <ul className="info-list">
          <li>
            <strong>Download Config:</strong>
            <p>
              Batch-downloads all iFlow parameters from your tenant into a single CSV file. This is perfect for backups, audits, or preparing for a bulk update.
            </p>
          </li>
          <li>
            <strong>Upload Config:</strong>
            <p>
              Updates iFlow parameters in bulk by uploading a modified CSV file. This saves hours of manual copy-pasting in the CPI interface.
            </p>
          </li>
        </ul>
      </div>

      {/* --- Card 2: Credentials Format --- */}
      <div className="info-card">
        <h3>Credentials Format</h3>
        <p>Both tools require the same credentials from your SAP BTP service key for the **Process Integration Runtime** (api-access) plan.</p>
        <ul className="info-list">
          <li>
            <strong>CPI Base URL:</strong> The <code>url</code> from the <code>api</code> section of your service key.
            <br />
            <em>Example: <code>https://your-tenant.api.sap</code></em>
          </li>
          <li>
            <strong>Token URL:</strong> The <code>url</code> from the <code>uaa</code> section of your service key, with <code>/oauth/token</code> appended.
            <br />
            <em>Example: <code>https://your-tenant.authentication.sap/oauth/token</code></em>
          </li>
          <li>
            <strong>Client ID:</strong> The <code>clientid</code> from the service key.
          </li>
          <li>
            <strong>Client Secret:</strong> The <code>clientsecret</code> from the service key.
          </li>
        </ul>
      </div>

      {/* --- Card 3: CSV Format --- */}
      <div className="info-card">
        <h3>CSV File Format</h3>
        <p>
          The <strong>Upload Config</strong> tool requires a specific CSV format. The easiest way to get this is to first use the <strong>Download Config</strong> tool.
        </p>
        <p>
          The file you download is the perfect template to use for your uploads.
        </p>
      </div>
    </div>
  );
}
// --- End of HomePage ---

export default HomePage;