# IntOps User Guide

**Integration Operations for SAP Cloud Integration**

Version 1.0 | Last Updated: February 2026

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Features](#2-features)
   - [Download Config](#21-download-config)
   - [Upload Config](#22-upload-config)
   - [Deploy](#23-deploy)
     - [Integration Flow](#231-integration-flow)
     - [Script Collection](#232-script-collection)
     - [Value Mapping](#233-value-mapping)
   - [Undeploy](#24-undeploy)
     - [Integration Flow](#241-integration-flow)
3. [Reference](#3-reference)
4. [Support](#4-support)

---

## 1. Introduction

### What is IntOps?

IntOps (Integration Operations) is a web-based automation tool designed to streamline bulk operations on SAP Cloud Platform Integration (CPI) tenants. It enables integration developers and administrators to perform mass configuration changes, deployments, and undeployments efficiently through CSV file uploads.

### Key Benefits

- **Time Savings**: Process hundreds or thousands of iFlow parameter updates in minutes instead of hours
- **Audit Trail**: Complete logging of all operations with downloadable result files
- **Error Handling**: Detailed error reporting for each failed operation
- **Background Processing**: Long-running jobs execute in the background, allowing you to continue working
- **Multi-Project Support**: Manage multiple CPI tenants from a single interface
- **Role-Based Access**: Project-level access control based on user email domains

### Prerequisites

Before using IntOps, ensure you have:

1. **SAP BTP Account** with Cloud Integration capability
2. **Service Key** for Process Integration Runtime (plan: `api`) with required roles:
   - `WorkspacePackagesConfigure`
   - `WorkspaceArtifactsDeploy`
   - `WorkspacePackagesRead`
   - `WorkspacePackagesEdit`
3. **User Access**: Your email must be authorized for the project you wish to use
4. **Modern Web Browser**: Chrome, Edge, Firefox, or Safari (latest versions)

### System Architecture

IntOps consists of:
- **Frontend**: React-based web application
- **Backend**: Node.js server handling API requests and job processing
- **Database**: SAP HANA for storing projects, logs, and job results
- **Authentication**: XSUAA-based authentication via SAP BTP

---

## 2. Features

### 2.1 Download Config

The Download Config feature retrieves all integration flow (iFlow) parameters from your CPI tenant and exports them to a CSV file. This is ideal for:
- Creating backups of current configurations
- Generating templates for bulk updates
- Documenting parameter settings across packages
- Comparing configurations between environments

#### How to Use Download Config

**Step 1: Navigate to Download Config Page**
- Click on **Download Config** in the left navigation menu

**Step 2: Select Project**
- From the **Select Project** dropdown, choose your target CPI tenant
- The system will auto-populate credentials from the selected project
- You can only see projects where your email domain has access

**Step 3: Specify Package Scope**
- **Option A - All Packages**: Leave the Package IDs field empty to download parameters from all packages
- **Option B - Specific Packages**: Enter comma-separated Package IDs (e.g., `Package1,Package2,Package3`)

**Step 4: Review Auto-Populated Credentials**
The following fields are automatically filled from the selected project:
- Project Name
- Environment
- CPI Base URL
- Token URL
- Client ID
- Client Secret (hidden for security)

**Step 5: Submit the Job**
- Click the **Submit** button to start the download job
- The page will display a progress indicator showing "Processing packages and iFlows"
- You cannot navigate away or submit another job until this completes

**Step 6: Download Results**
- Once complete, a success message appears with a **Download CSV** link
- Click the link to download your configuration file
- The CSV contains columns:
  - `PackageName`: Name of the integration package
  - `PackageID`: Technical ID of the package
  - `IflowName`: Name of the integration flow
  - `IflowID`: Technical ID of the integration flow
  - `ParameterKey`: Configuration parameter name
  - `ParameterValue`: Current value of the parameter
  - `DataType`: Data type (e.g., xsd:string, xsd:integer)

#### CSV Output Format

```csv
PackageName,PackageID,IflowName,IflowID,ParameterKey,ParameterValue,DataType
My Package,MyPackage1,My Integration Flow,MyIFlow1,HTTP_Address,https://api.example.com,xsd:string
My Package,MyPackage1,My Integration Flow,MyIFlow1,Timeout,60000,xsd:integer
```

#### Use Cases

**Use Case 1: Environment Migration**
1. Download configuration from DEV environment
2. Modify values for PROD environment
3. Upload to PROD using Upload Config feature

**Use Case 2: Configuration Backup**
1. Schedule monthly downloads for all packages
2. Store CSV files in version control
3. Use as restore point if needed

**Use Case 3: Parameter Audit**
1. Download all configurations
2. Review parameter values in Excel
3. Identify inconsistencies or security issues

#### Tips & Best Practices

- **Package IDs are Case-Sensitive**: Ensure exact match with CPI
- **Download All Packages First**: This gives you a complete template for uploads
- **Save with Timestamps**: Rename downloaded files with date (e.g., `config_2026-02-12.csv`)
- **Version Control**: Store configuration files in Git for change tracking
- **Regular Backups**: Schedule periodic downloads before major changes

---

### 2.2 Upload Config

The Upload Config feature performs bulk updates to iFlow parameters using a CSV file. This is essential for:
- Mass parameter updates across multiple iFlows
- Environment-specific configuration changes
- Standardizing settings across integration flows
- Implementing configuration changes from change requests

#### How to Use Upload Config

**Step 1: Prepare Your CSV File**

Your CSV file **must** contain these mandatory columns:
- `IflowID`: Technical ID of the integration flow
- `ParameterKey`: Name of the parameter to update
- `ParameterValue`: New value (can be blank to clear a parameter)

Optional but recommended columns:
- `PackageName`: For better logging
- `IflowName`: For better logging
- `DataType`: Parameter data type

**Example CSV:**
```csv
IflowID,ParameterKey,ParameterValue,PackageName,IflowName,DataType
MyIFlow1,HTTP_Address,https://new-api.example.com,MyPackage,My Integration Flow,xsd:string
MyIFlow1,Timeout,30000,MyPackage,My Integration Flow,xsd:integer
MyIFlow2,Sender_Address,/api/endpoint,MyPackage,Another Flow,xsd:string
```

**Step 2: Navigate to Upload Config Page**
- Click on **Upload Config** in the left navigation menu

**Step 3: Select Project**
- Choose your target CPI tenant from the **Select Project** dropdown
- Credentials will auto-populate from the selected project

**Step 4: Upload CSV File**
- Click **Choose File** and select your prepared CSV file
- Only `.csv` files are accepted
- The file size should be reasonable (< 10MB for best performance)

**Step 5: Submit the Job**
- Click **Submit** to start the upload job
- A progress bar shows: "Processing parameters: X / Total"
- The percentage complete is displayed in real-time
- You can continue working while the job runs in the background

**Step 6: Download Results**
- Upon completion, a **Download Results CSV** link appears
- The results file contains:
  - All original columns from your upload file
  - `Status`: Success or Failed
  - `Message`: Details about the operation
  - `Timestamp`: When the operation was performed

**Example Results CSV:**
```csv
IflowID,ParameterKey,ParameterValue,PackageName,IflowName,DataType,Status,Message,Timestamp
MyIFlow1,HTTP_Address,https://new-api.example.com,MyPackage,My Integration Flow,xsd:string,Success,Parameter updated successfully,2026-02-12T10:30:45Z
MyIFlow1,Timeout,30000,MyPackage,My Integration Flow,xsd:integer,Success,Parameter updated successfully,2026-02-12T10:30:46Z
MyIFlow2,InvalidParam,value,MyPackage,Another Flow,xsd:string,Failed,Parameter not found in iFlow,2026-02-12T10:30:47Z
```

#### Error Handling

The upload process handles various error scenarios:

| Error Type | Description | Resolution |
|------------|-------------|------------|
| Authentication Failed | Invalid credentials | Verify service key credentials in Project Master |
| iFlow Not Found | IflowID doesn't exist | Check iFlow ID spelling and case sensitivity |
| Parameter Not Found | ParameterKey doesn't exist in iFlow | Verify parameter name from Download Config |
| Invalid Data Type | Value doesn't match parameter type | Ensure numeric values for integer types |
| Permission Denied | Missing required role | Add WorkspacePackagesConfigure role to service key |
| Network Timeout | Connection to CPI failed | Check CPI tenant availability and network |

#### Use Cases

**Use Case 1: Environment-Specific URLs**
```csv
IflowID,ParameterKey,ParameterValue
IFlow1,DEV_Endpoint,https://dev-api.example.com
IFlow1,QA_Endpoint,https://qa-api.example.com
IFlow1,PROD_Endpoint,https://prod-api.example.com
```

**Use Case 2: Mass Timeout Updates**
```csv
IflowID,ParameterKey,ParameterValue
IFlow1,HTTP_Timeout,60000
IFlow2,HTTP_Timeout,60000
IFlow3,HTTP_Timeout,60000
```

**Use Case 3: Clearing Parameter Values**
```csv
IflowID,ParameterKey,ParameterValue
IFlow1,TempConfig,
IFlow2,TempConfig,
```

#### Tips & Best Practices

- **Start with Download**: Always download current config first to get the exact parameter names
- **Test on DEV First**: Validate CSV with a small subset in DEV before uploading to PROD
- **Backup Before Upload**: Download current config as backup before making changes
- **Case Sensitivity**: iFlowID and ParameterKey are case-sensitive
- **Batch Processing**: For very large files (>1000 rows), consider splitting into smaller batches
- **Validate Values**: Double-check URLs, credentials, and numeric values before upload
- **Review Results**: Always download and review the results file for any failures
- **Empty Values Are Valid**: Blank ParameterValue will clear the parameter

---

### 2.3 Deploy

The Deploy feature enables bulk deployment of integration artifacts to your CPI tenant. It supports three artifact types: Integration Flows, Script Collections, and Value Mappings.

#### 2.3.1 Integration Flow

Integration Flows are the core artifacts in CPI that define message processing logic. Deploying an integration flow makes it available for runtime execution.

**How to Deploy Integration Flows**

**Step 1: Prepare Your CSV File**

Your CSV needs only one column:
- `ArtifactID`: Technical ID of the integration flow (case-sensitive)

**Example CSV:**
```csv
ArtifactID
MyIntegrationFlow1
MyIntegrationFlow2
MyIntegrationFlow3
```

**Step 2: Navigate to Deploy Page**
- Click on **Deploy/Undeploy** in the left navigation menu

**Step 3: Select Project**
- Choose your target CPI tenant from the **Select Project** dropdown
- Credentials auto-populate from the selected project

**Step 4: Select Artifact Type**
- From the **Artifact Type** dropdown, select **Integration Flow**

**Step 5: Select Operation**
- From the **Operation** dropdown, select **Deploy**
- The dropdown defaults to "Deploy"

**Step 6: Upload CSV File**
- Click **Choose File** and select your CSV file with ArtifactID column
- File upload is enabled only after selecting project and artifact type

**Step 7: Submit the Job**
- Click **Submit** to start the deployment
- Progress bar shows: "Processing Artifacts: X / Total (percentage%)"
- Real-time status updates appear as each artifact is processed

**Step 8: Download Results**
- Upon completion, click **Download Results CSV**
- Results file contains:
  - `ArtifactID`: The integration flow ID
  - `Status`: Success or Failed
  - `Message`: Deployment status message
  - `Timestamp`: When deployment occurred

**Example Results CSV:**
```csv
ArtifactID,Status,Message,Timestamp
MyIntegrationFlow1,Success,Artifact deployed successfully,2026-02-12T14:25:30Z
MyIntegrationFlow2,Success,Artifact deployed successfully,2026-02-12T14:25:35Z
MyIntegrationFlow3,Failed,Artifact not found in design workspace,2026-02-12T14:25:37Z
```

**Deployment Behavior**
- All integration flows are deployed with **Version: active**
- If already deployed, the active version is redeployed
- Deployment makes the flow available for message processing immediately
- Previous runtime versions are retained as per CPI's version history

**Common Deployment Errors**

| Error | Cause | Solution |
|-------|-------|----------|
| Artifact not found | ArtifactID doesn't exist in design workspace | Verify the artifact ID spelling and case |
| Already deployed | Artifact is already running | This is informational; the deployment succeeds |
| Deployment failed | Internal CPI error during deployment | Check CPI tenant status; retry deployment |
| Permission denied | Missing WorkspaceArtifactsDeploy role | Update service key with required role |
| Configuration error | iFlow has configuration errors | Fix errors in CPI web UI before deploying |

#### 2.3.2 Script Collection

Script Collections contain reusable Groovy scripts that can be referenced by multiple integration flows. Deploying a script collection makes the scripts available for runtime execution.

**How to Deploy Script Collections**

**Step 1: Prepare Your CSV File**

CSV format is the same as Integration Flows:
```csv
ArtifactID
MyScriptCollection1
MyScriptCollection2
```

**Step 2-3: Select Project and Artifact Type**
- Navigate to **Deploy/Undeploy** page
- Select your project
- Select **Script Collection** from Artifact Type dropdown

**Step 4: Operation Selection**
- The **Operation** dropdown will show:
  - **Deploy** (enabled)
  - **Undeploy (API Not Available)** (grayed out)
- Script Collections cannot be undeployed via API - this is a CPI API limitation

**Step 5-8: Upload and Process**
- Follow the same steps as Integration Flow deployment
- Upload CSV, submit, and download results

**Important Notes for Script Collections**
- ⚠️ **Undeploy Not Supported**: CPI API does not provide an endpoint to undeploy script collections
- To remove a script collection from runtime, you must use the CPI web UI manually
- Script collections are deployed with the active version
- Deployed scripts are immediately available to all integration flows

**Example Results CSV:**
```csv
ArtifactID,Status,Message,Timestamp
MyScriptCollection1,Success,Script collection deployed successfully,2026-02-12T15:10:20Z
MyScriptCollection2,Failed,Script collection not found in design workspace,2026-02-12T15:10:22Z
```

#### 2.3.3 Value Mapping

Value Mappings define transformation rules for converting values between different systems. Deploying a value mapping makes the transformation rules available at runtime.

**How to Deploy Value Mappings**

**Step 1: Prepare Your CSV File**

CSV format is identical to other artifacts:
```csv
ArtifactID
MyValueMapping1
MyValueMapping2
```

**Step 2-3: Select Project and Artifact Type**
- Navigate to **Deploy/Undeploy** page
- Select your project
- Select **Value Mapping** from Artifact Type dropdown

**Step 4: Operation Selection**
- The **Operation** dropdown will show:
  - **Deploy** (enabled)
  - **Undeploy (API Not Available)** (grayed out)
- Value Mappings cannot be undeployed via API - this is a CPI API limitation

**Step 5-8: Upload and Process**
- Follow the same deployment process
- Upload CSV, submit, monitor progress, and download results

**Important Notes for Value Mappings**
- ⚠️ **Undeploy Not Supported**: CPI API does not provide an endpoint to undeploy value mappings
- To remove a value mapping from runtime, use the CPI web UI
- Value mappings are deployed with the active version
- Deployed mappings are immediately available for transformation operations

**Example Results CSV:**
```csv
ArtifactID,Status,Message,Timestamp
MyValueMapping1,Success,Value mapping deployed successfully,2026-02-12T16:45:10Z
MyValueMapping2,Success,Value mapping deployed successfully,2026-02-12T16:45:12Z
```

#### Deployment Tips & Best Practices

**For All Artifact Types:**
- **Test in DEV First**: Always test deployments in DEV before PROD
- **Download Template**: Use the sample CSV template from the Home page
- **Verify IDs**: Ensure artifact IDs match exactly (case-sensitive)
- **Sequential Processing**: Artifacts are deployed one at a time to ensure stability
- **Check Logs**: Review the Logs page for detailed activity history
- **Results File**: Always download and review the results CSV

**Artifact Type Selection:**
- Each deployment job handles only ONE artifact type
- Don't mix integration flows with script collections in the same CSV
- Create separate CSV files for each artifact type

**Progress Monitoring:**
- The progress bar updates in real-time
- Don't close the browser during deployment
- The job continues in the background if you navigate away
- You can check status later in the Logs page

---

### 2.4 Undeploy

The Undeploy feature removes deployed artifacts from the runtime, stopping their execution. Currently, only Integration Flows support undeployment via API.

#### 2.4.1 Integration Flow

Undeploying an integration flow stops message processing and removes it from the runtime environment. The artifact remains in the design workspace but is no longer active.

**How to Undeploy Integration Flows**

**Step 1: Prepare Your CSV File**

CSV format is the same as deployment:
```csv
ArtifactID
MyIntegrationFlow1
MyIntegrationFlow2
```

**Step 2: Navigate to Deploy/Undeploy Page**
- Click on **Deploy/Undeploy** in the left navigation menu

**Step 3: Select Project**
- Choose your target CPI tenant from the dropdown

**Step 4: Select Artifact Type**
- Select **Integration Flow** from the Artifact Type dropdown

**Step 5: Select Undeploy Operation**
- From the **Operation** dropdown, select **Undeploy**
- This option is only available for Integration Flows

**Step 6: Upload CSV File**
- Upload your CSV file containing the ArtifactID column

**Step 7: Submit the Job**
- Click **Submit** to start undeployment
- Progress bar shows real-time status
- Each artifact is undeployed sequentially

**Step 8: Download Results**
- Click **Download Results CSV** when complete
- Review the results for any failures

**Example Results CSV:**
```csv
ArtifactID,Status,Message,Timestamp
MyIntegrationFlow1,Success,Artifact undeployed successfully,2026-02-12T17:30:45Z
MyIntegrationFlow2,Failed,Artifact is not deployed,2026-02-12T17:30:47Z
MyIntegrationFlow3,Success,Artifact undeployed successfully,2026-02-12T17:30:49Z
```

**Undeployment Behavior**
- The integration flow is immediately stopped
- In-flight messages may complete or fail depending on CPI settings
- The artifact remains in the design workspace
- Previous deployment history is retained
- Can be redeployed later without changes

**Common Undeployment Scenarios**

| Scenario | Status | Message | Next Step |
|----------|--------|---------|-----------|
| Successfully undeployed | Success | Artifact undeployed successfully | Artifact is stopped |
| Not deployed | Failed | Artifact is not deployed | No action needed |
| Does not exist | Failed | Artifact not found | Verify artifact ID |
| Permission error | Failed | Permission denied | Check service key roles |
| In-flight messages | Success with warning | Undeployed; some messages may fail | Check message monitoring |

**When to Undeploy Integration Flows**

1. **Decommissioning**: Permanently removing unused flows
2. **Maintenance**: Stopping flows before making design changes
3. **Troubleshooting**: Isolating problematic flows
4. **Environment Cleanup**: Removing test or obsolete flows
5. **Change Management**: Controlled shutdown before updates

#### API Limitations for Undeploy

**Integration Flows**: ✅ Undeploy supported via API

**Script Collections**: ❌ Undeploy NOT supported via API
- Must be undeployed manually through CPI web UI
- Operation dropdown shows "Undeploy (API Not Available)"
- Submit button is disabled when undeploy is selected for script collections

**Value Mappings**: ❌ Undeploy NOT supported via API
- Must be undeployed manually through CPI web UI
- Operation dropdown shows "Undeploy (API Not Available)"
- Submit button is disabled when undeploy is selected for value mappings

**Why the Limitation?**
SAP CPI's OData API provides endpoints for:
- Deploying all artifact types
- Undeploying integration flows only

For script collections and value mappings, SAP has not exposed undeploy endpoints in the public API. This is a platform limitation, not an IntOps limitation.

**Workaround for Script Collections and Value Mappings:**
1. Log into SAP CPI Web UI
2. Navigate to Monitor → Manage Integration Content
3. Select the artifact
4. Click "Undeploy" button
5. Confirm the action

#### Undeploy Tips & Best Practices

- **Impact Analysis**: Review dependent integration flows before undeploying script collections
- **Message Monitoring**: Check for in-flight messages before undeployment
- **Notifications**: Inform stakeholders before undeploying production flows
- **Documentation**: Document the reason for undeployment
- **Results Review**: Always check the results CSV for failures
- **Redeployment Plan**: Have a redeployment plan if undeployment is temporary
- **Off-Peak Hours**: Undeploy during maintenance windows when possible

---

## 3. Reference

### 3.1 CSV File Format Reference

#### Download Config CSV Output
| Column | Type | Required | Description |
|--------|------|----------|-------------|
| PackageName | String | Yes | Name of the integration package |
| PackageID | String | Yes | Technical ID of the package |
| IflowName | String | Yes | Name of the integration flow |
| IflowID | String | Yes | Technical ID of the integration flow |
| ParameterKey | String | Yes | Configuration parameter name |
| ParameterValue | String | No | Current parameter value (can be empty) |
| DataType | String | Yes | XSD data type (e.g., xsd:string, xsd:integer) |

#### Upload Config CSV Input
| Column | Type | Required | Description |
|--------|------|----------|-------------|
| IflowID | String | Yes | Technical ID of the integration flow |
| ParameterKey | String | Yes | Configuration parameter to update |
| ParameterValue | String | No | New value (empty to clear parameter) |
| PackageName | String | No | Package name (for logging) |
| IflowName | String | No | Integration flow name (for logging) |
| DataType | String | No | Parameter data type (for logging) |

#### Deploy/Undeploy CSV Input
| Column | Type | Required | Description |
|--------|------|----------|-------------|
| ArtifactID | String | Yes | Technical ID of the artifact to deploy/undeploy |

### 3.2 API Endpoints Reference

IntOps uses the following SAP CPI OData API endpoints:

#### Integration Packages & Flows
- `GET /api/v1/IntegrationPackages` - List all packages
- `GET /api/v1/IntegrationPackages('{PackageId}')/IntegrationDesigntimeArtifacts` - List artifacts in package
- `GET /api/v1/IntegrationDesigntimeArtifacts(Id='{ArtifactId}',Version='active')/Configurations` - Get artifact configurations
- `PUT /api/v1/IntegrationDesigntimeArtifacts(Id='{ArtifactId}',Version='active')/Configurations('{ParameterKey}')` - Update parameter

#### Deployment Operations
- `POST /api/v1/DeployIntegrationDesigntimeArtifact?Id='{ArtifactId}'&Version='active'` - Deploy integration flow
- `DELETE /api/v1/IntegrationRuntimeArtifacts('{ArtifactId}')` - Undeploy integration flow
- `POST /api/v1/DeployScriptCollectionDesigntimeArtifact?Id='{ArtifactId}'&Version='active'` - Deploy script collection
- `POST /api/v1/DeployValueMappingDesigntimeArtifact?Id='{ArtifactId}'&Version='active'` - Deploy value mapping

### 3.3 Required SAP BTP Roles

Your service key must have these roles in the Process Integration Runtime instance:

| Role | Purpose | Required For |
|------|---------|--------------|
| WorkspacePackagesRead | Read package and artifact metadata | Download Config, Deploy, Undeploy |
| WorkspacePackagesConfigure | Update artifact configurations | Upload Config |
| WorkspacePackagesEdit | Modify artifacts in design workspace | Upload Config |
| WorkspaceArtifactsDeploy | Deploy and undeploy artifacts | Deploy, Undeploy |

**How to Add Roles to Service Key:**
1. In SAP BTP Cockpit, navigate to your subaccount
2. Go to Services → Instances and Subscriptions
3. Find your Process Integration Runtime instance (plan: api)
4. Click the three dots → View
5. Create a new service key or update existing one
6. In the JSON configuration, ensure all roles are listed
7. Copy the updated service key to your Project Master entry in IntOps

### 3.4 Project Master Configuration

Projects in IntOps define connection details for CPI tenants. Each project contains:

| Field | Description | Example |
|-------|-------------|---------|
| Project Name | Friendly name for the project | Production CPI |
| Environment | Environment identifier | PROD, DEV, QA |
| CPI Base URL | API URL from service key (api.url) | https://tenant.api.sap |
| Token URL | OAuth token URL (uaa.url + /oauth/token) | https://tenant.authentication.sap.hana.ondemand.com/oauth/token |
| Client ID | OAuth client ID (uaa.clientid) | sb-client-id!b12345 |
| Client Secret | OAuth client secret (uaa.clientsecret) | secretValue123= |
| Allowed Domains | Comma-separated email domains with access | sap.com,example.com |

**Project Access Control:**
- Users only see projects where their email domain matches the Allowed Domains
- Example: user@sap.com can access projects with "sap.com" in Allowed Domains
- Admin users (as defined in `ADMIN_EMAILS` environment variable) see all projects

### 3.5 Logs Page Reference

The Logs page provides a complete audit trail of all operations:

**Log Entry Fields:**
| Field | Description |
|-------|-------------|
| ID | Unique log entry identifier |
| Project | Project name and environment |
| Activity Type | Type of operation (Download Config, Upload Config, Deploy - Integration Flow, etc.) |
| Status | Success, Failed, or Running |
| Started | Timestamp when job started |
| Completed | Timestamp when job completed |
| Duration | Time taken to complete |
| Result Summary | High-level results (e.g., "150 parameters updated successfully") |

**Filtering:**
- Filter by Project (Project Name - Environment)
- Filter by Activity Type
- Search by any field
- Pagination controls (25, 50, 100 items per page)

**Downloading Logs:**
- Click the expand icon (►) to view details
- Click "Download Log" to get the original upload CSV
- Click "Download Results" to get the results CSV with status

### 3.6 Cleanup Logs (Admin Only)

The Cleanup Logs feature automatically clears old log content to manage database size:

**Cleanup Schedule:**
- Runs daily at midnight UTC
- Clears LOG_CONTENT and RESULT_CONTENT for logs older than 1 year (configurable via RETENTION_MONTHS)
- Keeps log metadata (ID, timestamps, status, summary)

**What Gets Cleaned:**
- Original uploaded CSV content (LOG_CONTENT)
- Results file content (RESULT_CONTENT)
- Only for logs older than the retention period

**What's Preserved:**
- Log entry metadata
- Timestamps and duration
- Status and result summary
- Project and activity type information

**Admin Features:**
- View cleanup execution history
- Manually trigger cleanup jobs
- See detailed breakdown by project and environment
- Monitor cleanup job status and duration

### 3.7 Environment Variables

IntOps can be configured via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3000 |
| NODE_ENV | Environment (production/development) | development |
| ADMIN_EMAILS | Comma-separated admin email addresses | admin@example.com |
| RETENTION_MONTHS | Log retention period in months | 12 |
| SESSION_TIMEOUT | User session timeout in milliseconds | 1800000 (30 min) |

**Setting Environment Variables:**

For local development, create a `.env` file:
```
PORT=3000
ADMIN_EMAILS=admin@example.com,admin2@example.com
RETENTION_MONTHS=12
```

For Cloud Foundry deployment:
```bash
cf set-env intops ADMIN_EMAILS "admin@example.com,admin2@example.com"
cf set-env intops RETENTION_MONTHS 12
cf restage intops
```

### 3.8 Sample CSV Files

**Download Sample Templates:**
- Integration Flow Deploy/Undeploy: [sample_deploy_artifacts.csv](sample_deploy_artifacts.csv)
- Script Collection Deploy: [sample_script_collection.csv](sample_script_collection.csv)
- Value Mapping Deploy: [sample_value_mapping.csv](sample_value_mapping.csv)

**Upload Config Template:**
Use Download Config to generate a template specific to your tenant

---

## 4. Support

### 4.1 Troubleshooting Guide

#### Common Issues and Solutions

**Issue: "Authentication Failed"**
- **Cause**: Invalid service key credentials
- **Solution**: 
  1. Verify service key is for Process Integration Runtime (plan: api)
  2. Check Client ID and Client Secret are correct
  3. Ensure Token URL includes `/oauth/token` suffix
  4. Regenerate service key if needed

**Issue: "Permission Denied"**
- **Cause**: Missing required roles in service key
- **Solution**:
  1. Verify service key has all required roles (see Section 3.3)
  2. Regenerate service key with proper role configuration
  3. Update project in Project Master with new credentials

**Issue: "Artifact Not Found"**
- **Cause**: Artifact ID doesn't exist or is misspelled
- **Solution**:
  1. Check artifact ID spelling and case sensitivity
  2. Verify artifact exists in CPI design workspace
  3. Use Download Config to get exact artifact IDs

**Issue: "Cannot Undeploy Script Collection"**
- **Cause**: API limitation - undeployment not supported
- **Solution**: Use CPI Web UI to manually undeploy script collections

**Issue: "Job Stuck in Running Status"**
- **Cause**: Backend process crashed or network timeout
- **Solution**:
  1. Refresh the page after 5 minutes
  2. Check Logs page for job status
  3. If still stuck, contact administrator to check server logs

**Issue: "CSV Upload Fails"**
- **Cause**: Invalid CSV format or missing required columns
- **Solution**:
  1. Ensure CSV has all required columns
  2. Check for special characters in values
  3. Verify file encoding is UTF-8
  4. Try with sample template first

**Issue: "Session Timeout"**
- **Cause**: Inactivity for 30 minutes
- **Solution**: Log in again; your work-in-progress is saved in browser

#### Network and Connectivity Issues

**Issue: "Network Timeout"**
- **Cause**: Slow or unstable connection to CPI tenant
- **Solution**:
  1. Verify CPI tenant is accessible from your network
  2. Check for network proxy or firewall issues
  3. Try again during off-peak hours
  4. Contact SAP support if CPI tenant is down

**Issue: "CORS Errors"**
- **Cause**: Browser security restrictions
- **Solution**:
  1. Ensure you're accessing IntOps via the correct URL
  2. Check if SAP BTP trust configuration is correct
  3. Contact administrator to verify CORS settings

### 4.2 Best Practices Summary

**Project Setup:**
- Create separate projects for each environment (DEV, QA, PROD)
- Use descriptive project names (e.g., "Production CPI - US Region")
- Restrict access using email domain filtering
- Regularly rotate service key credentials

**Download Config:**
- Download full config monthly for backup
- Save downloads with timestamps
- Store in version control (Git)
- Review for configuration drift

**Upload Config:**
- Always test in DEV before PROD
- Download current config before making changes
- Validate CSV in Excel before upload
- Review results file for any failures
- Keep audit trail of all changes

**Deploy/Undeploy:**
- Deploy to lower environments first
- Use separate CSV files for each artifact type
- Schedule deployments during maintenance windows
- Communicate with stakeholders before PROD changes
- Always download and review results

**Security:**
- Never share service key credentials via email
- Use Project Master to centralize credentials
- Restrict project access via email domains
- Regular audit of project access permissions
- Enable MFA on SAP BTP accounts

**Performance:**
- For large uploads (>1000 rows), consider batching
- Avoid running multiple jobs simultaneously
- Schedule heavy jobs during off-peak hours
- Monitor job progress via Logs page

### 4.3 Getting Help

**Documentation:**
- Home Page: Overview and quick start
- This User Guide: Detailed feature documentation
- SAP CPI Documentation: https://help.sap.com/docs/CLOUD_INTEGRATION

**Internal Support:**
- Email: [your-support-email@example.com]
- Slack: #intops-support
- Wiki: [internal-wiki-link]

**Reporting Issues:**
- Use the built-in feedback mechanism (if available)
- Include:
  - Project name and environment
  - Activity type (Download, Upload, Deploy, Undeploy)
  - CSV file (sanitized if contains sensitive data)
  - Results file
  - Screenshot of error message
  - Steps to reproduce

**Feature Requests:**
- Submit via internal ticketing system
- Describe the use case and business value
- Provide examples of expected behavior

### 4.4 System Administration

**For Administrators:**

**User Access Management:**
- Add/remove users by updating Allowed Domains in Project Master
- Grant admin privileges by adding emails to ADMIN_EMAILS environment variable
- Monitor user activity via Logs page

**Database Maintenance:**
- Cleanup jobs run automatically daily
- Adjust retention period via RETENTION_MONTHS environment variable
- Monitor database size in SAP HANA Cockpit
- Manually trigger cleanup via Cleanup Logs page (admin only)

**Monitoring:**
- Check application logs in Cloud Foundry
- Monitor job queues for stuck jobs
- Review cleanup logs for database health
- Track user activity patterns

**Deployment:**
- Deploy updates during maintenance windows
- Test in DEV before deploying to PROD
- Backup database before major version upgrades
- Communicate downtime to users in advance

**Security:**
- Regularly review and rotate service keys
- Audit project access permissions quarterly
- Enable Cloud Foundry security scanning
- Monitor for suspicious activity in logs

### 4.5 Frequently Asked Questions

**Q: Can I download configurations from multiple tenants at once?**
A: No, each download job targets one project (tenant) at a time. Submit separate jobs for each tenant.

**Q: What happens if I upload a CSV with duplicate rows?**
A: Each row is processed independently. The last update wins if the same parameter is updated multiple times.

**Q: Can I schedule jobs to run automatically?**
A: Not currently. IntOps requires manual job submission. Feature may be added in future versions.

**Q: How long are job results stored?**
A: Job metadata is stored indefinitely. Log content (CSV files) is cleared after the retention period (default 1 year).

**Q: Can I deploy to multiple environments in one job?**
A: No, each job targets one project/environment. Create separate jobs for each environment.

**Q: What if I accidentally undeploy a production integration flow?**
A: You can immediately redeploy it using the Deploy feature with the same artifact ID. The flow configuration is preserved in the design workspace.

**Q: Can I download results from old jobs?**
A: Yes, as long as the job is within the retention period. After cleanup, only metadata is available.

**Q: Why can't I see some projects?**
A: You only see projects where your email domain matches the Allowed Domains configuration. Contact your administrator to request access.

**Q: How do I know if a job completed successfully?**
A: Check the Logs page. The status column shows Success, Failed, or Running. Download the results file for details on each item processed.

**Q: Can I cancel a running job?**
A: No, jobs cannot be cancelled once started. They will run to completion or failure. However, the system processes items sequentially, so failed items won't block subsequent items.

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| Artifact | A deployable component in CPI (Integration Flow, Script Collection, Value Mapping) |
| CPI | Cloud Platform Integration (now called Cloud Integration) |
| Deploy | Make an artifact available in the runtime environment for message processing |
| iFlow | Integration Flow - defines message processing logic |
| OAuth | Open Authorization protocol used for authentication |
| OData | Open Data Protocol - RESTful API standard used by SAP |
| Package | Container for grouping related integration artifacts |
| Parameter | Configuration value in an integration flow |
| Service Key | Credentials for accessing SAP BTP services programmatically |
| Tenant | An isolated CPI environment within SAP BTP |
| Undeploy | Remove an artifact from the runtime environment |
| XSUAA | Extended Services for User Account and Authentication |

---

## Appendix B: Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 2026 | Initial release with Download, Upload, Deploy, and Undeploy features |

---

## Appendix C: Quick Reference Card

**Download Config:**
1. Select Project → Submit → Download CSV

**Upload Config:**
1. Select Project → Upload CSV (IflowID, ParameterKey, ParameterValue) → Submit → Download Results

**Deploy Integration Flow:**
1. Select Project → Select "Integration Flow" → Select "Deploy" → Upload CSV (ArtifactID) → Submit → Download Results

**Deploy Script Collection:**
1. Select Project → Select "Script Collection" → Upload CSV (ArtifactID) → Submit → Download Results

**Deploy Value Mapping:**
1. Select Project → Select "Value Mapping" → Upload CSV (ArtifactID) → Submit → Download Results

**Undeploy Integration Flow:**
1. Select Project → Select "Integration Flow" → Select "Undeploy" → Upload CSV (ArtifactID) → Submit → Download Results

**View Logs:**
1. Navigate to Logs page → Filter by Project/Activity → Expand row → Download files

---

*End of User Guide*