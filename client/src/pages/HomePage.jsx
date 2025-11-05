// client/src/pages/HomePage.jsx
import React from 'react';

function HomePage() {
  return (
    <div className="page-content">
      <h2>Welcome to the SAP Automation Tool</h2>
      <p style={{ textAlign: 'center', marginBottom: '2rem', fontSize: '1.1rem', color: '#555' }}>
        Streamline your iFlow configuration management.
      </p>

      {/* --- Card 1: What This App Does --- */}
      <div className="info-card">
        <h3>What This App Does</h3>
        <ul className="info-list">
          <li>
            <strong>Download Config</strong>
            <p>
              Fetches all iFlow parameters from your CPI tenant. You can either get all packages or specify a comma-separated list of Package IDs. This generates a single CSV file, perfect for backups or as a template for bulk updates.
            </p>
          </li>
          <li>
            <strong>Upload Config</strong>
            <p>
              Reads a CSV file to perform bulk updates to your iFlow parameters. This handles long-running jobs (thousands of rows) as a background process and provides a detailed results file for every successful or failed update.
            </p>
          </li>
          <li>
            <strong>View Logs</strong>
            <p>
              Provides a complete audit trail of all past download and upload jobs. You can re-download any execution log or results file directly from this table.
            </p>
          </li>
        </ul>
      </div>

      {/* --- Card 2: Credentials Format --- */}
      <div className="info-card">
        <h3>Credentials Format</h3>
        <p>Both tools require credentials from your SAP BTP service key for the **Process Integration Runtime** (plan: `api`) instance.</p>
        <ul className="info-list">
          <li>
            <strong>CPI Base URL</strong>
            <p>
              The <code>url</code> from the <code>api</code> section of your service key.
              <br />
              <em>Example: <code>https://your-tenant.api.sap</code></em>
            </p>
          </li>
          <li>
            <strong>Token URL</strong>
            <p>
              The <code>url</code> from the <code>uaa</code> section of your service key, with <code>/oauth/token</code> appended.
              <br />
              <em>Example: <code>https://your-tenant.authentication.sap/oauth/token</code></em>
            </p>
          </li>
          <li>
            <strong>Client ID</strong>
            <p>The <code>clientid</code> from the <code>uaa</code> section of the service key.</p>
          </li>
          <li>
            <strong>Client Secret</strong>
            <p>The <code>clientsecret</code> from the <code>uaa</code> section of the service key.</p>
          </li>
        </ul>
      </div>

      {/* --- Card 3: CSV File Format --- */}
      <div className="info-card">
        <h3>CSV File Format (for Upload)</h3>
        <p>
          The <strong>Upload Config</strong> tool requires a specific CSV format. The easiest way to get this is to first use the <strong>Download Config</strong> tool, as it provides the perfect template.
        </p>
        <p>Your upload file **must** contain these headers at a minimum:</p>
        <ul className="info-list">
          <li>
            <strong><code>IflowID</code></strong>
            <p>The technical ID of the iFlow you want to update.</p>
          </li>
          <li>
            <strong><code>ParameterKey</code></strong>
            <p>The key of the parameter you want to change (e.g., <code>HTTP_RCVR_Address</code>).</p>
          </li>
          <li>
            <strong><code>ParameterValue</code></strong>
            <p>The new value you want to set. This can be blank!</p>
          </li>
        </ul>
        <p>Including <code>PackageName</code>, <code>IflowName</code>, and <code>DataType</code> is also recommended, as they are used for the final results log.</p>
      </div>
    </div>
  );
}

export default HomePage;