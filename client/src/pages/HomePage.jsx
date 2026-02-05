// client/src/pages/HomePage.jsx
import React from 'react';

function HomePage() {
  return (
    <div className="page-content">
      <h2>Welcome to IntOps</h2>
      <p style={{ textAlign: 'center', marginBottom: '2rem', fontSize: '1.1rem', color: '#555' }}>
        Integration Operations for SAP Cloud Integration
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
            <strong>Deploy Artifacts</strong>
            <p>
              Reads a CSV file to perform bulk deployment or undeployment to your integration flow, script collection and value mapping artifacts. This handles the deployment of long-running jobs (thousands of artifact) as a background process and provides a detailed results file for every successful or failed status.
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
        <p>This tool require credentials from your {/* SAP */} BTP service key for the **Process Integration Runtime** (plan: `api`) instance.</p>
        <ul className="info-list">
          <li>
            <strong>Required Roles</strong>
            <p>The service key must have the following roles assigned to perform operations:</p>
            <br />
            <code>WorkspacePackagesConfigure</code>
            <br />
            <code>WorkspaceArtifactsDeploy</code>
            <br />
            <code>WorkspacePackagesRead</code>
            <br />
            <code>WorkspacePackagesEdit</code>
          </li>
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
              <em>Example: <code>https://your-tenant.authentication.{/* sap */}hana.ondemand.com/oauth/token</code></em>
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
        <h3>CSV File Format (for Upload Config)</h3>
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

      {/* --- Card 4: Deploy Artifacts Guide --- */}
      <div className="info-card">
        <h3>Deploy Artifacts Guide</h3>
        <p>
          The <strong>Deploy Artifacts</strong> tool allows you to deploy or undeploy multiple artifacts in bulk using a simple CSV file.
        </p>

        <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', color: '#0070f3' }}>Supported Artifact Types:</h4>
        <ul className="info-list">
          <li>
            <strong>Integration Flow</strong>
            <p>Deploy or undeploy integration flows</p>
          </li>
          <li>
            <strong>Script Collection</strong>
            <p>Deploy script collections (Undeploy not supported by API)</p>
          </li>
          <li>
            <strong>Value Mapping</strong>
            <p>Deploy value mappings (Undeploy not supported by API)</p>
          </li>
        </ul>

        <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', color: '#0070f3' }}>CSV File Format:</h4>
        <p>Your CSV file needs only <strong>one column</strong> - the artifact IDs:</p>
        <ul className="info-list">
          <li>
            <strong><code>ArtifactID</code></strong>
            <p>The technical ID of the artifact (e.g., MyIntegrationFlow1, MyScriptCollection1)</p>
          </li>
        </ul>
        <p style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.95rem' }}>
          💡 <strong>Note:</strong> You'll select the Artifact Type (Integration Flow, Script Collection, or Value Mapping) from a dropdown in the Deploy page before uploading the CSV.
        </p>

        <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', color: '#0070f3' }}>Sample CSV File:</h4>
        <div style={{
          backgroundColor: '#f5f5f5',
          padding: '1rem',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '0.9rem',
          marginBottom: '1rem'
        }}>
          <div>ArtifactID</div>
          <div>ArtifactId1</div>
          <div>ArtifactId2</div>
          <div>ArtifactId3</div>
        </div>

        <p style={{ marginBottom: '0.5rem' }}>
          <a
            href="/sample_deploy_artifacts.csv"
            download
            style={{
              color: '#0070f3',
              textDecoration: 'none',
              fontWeight: '500',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            📥 Download Sample CSV Template
          </a>
        </p>

        <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', color: '#0070f3' }}>How to Use:</h4>
        <ol className="info-list">
          <li>
            <strong>Select a Project</strong>
            <p>Choose the project with the correct CPI tenant credentials (credentials will be auto-populated)</p>
          </li>
          <li>
            <strong>Select Artifact Type</strong>
            <p>Choose from the dropdown: Integration Flow, Script Collection, or Value Mapping</p>
          </li>
          <li>
            <strong>Select Operation</strong>
            <p>Choose "Deploy" or "Undeploy" from the Operation dropdown (Note: Undeploy option is automatically disabled for Script Collections and Value Mappings as the API doesn't support undeploying these artifact types)</p>
          </li>
          <li>
            <strong>Upload CSV File</strong>
            <p>Select your CSV file with the ArtifactID column - the file upload will be enabled after selecting project and artifact type</p>
          </li>
          <li>
            <strong>Submit</strong>
            <p>Click the Submit button to start the deployment/undeployment process. The page will show real-time progress with a progress bar indicating how many artifacts have been processed.</p>
          </li>
          <li>
            <strong>Download Results</strong>
            <p>After completion, download the results CSV from the success message to see the detailed status of each artifact (successful or failed)</p>
          </li>
        </ol>

        <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', color: '#ff9800' }}>Important Notes:</h4>
        <ul className="info-list">
          <li>
            <p>All artifacts are deployed with <strong>Version: active</strong> (default)</p>
          </li>
          <li>
            <p>⚠️ <strong>Script Collections and Value Mappings cannot be undeployed via API.</strong> The Undeploy button is automatically disabled when these artifact types are selected.</p>
          </li>
          <li>
            <p>Each artifact type is processed separately - select the artifact type first, then upload a CSV containing only that type of artifact</p>
          </li>
          <li>
            <p>The tool processes artifacts sequentially and provides detailed results for each operation</p>
          </li>
          <li>
            <p>Results are logged with specific activity types: "Deploy - Integration Flow", "Deploy - Script Collection", etc., making it easy to filter in the Logs page</p>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default HomePage;
