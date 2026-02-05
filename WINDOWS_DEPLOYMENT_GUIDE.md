# SAP BTP Cloud Foundry Deployment Guide - Windows

## Overview
This guide provides Windows-specific deployment instructions that don't require the `make` utility.

---

## 🚀 Deployment Approach for Windows

Since `mbt build` requires GNU Make (not available by default on Windows), we'll use the **direct Cloud Foundry push** method with manual service creation.

---

## Prerequisites

1. **Cloud Foundry CLI** installed ([Download](https://docs.cloudfoundry.org/cf-cli/install-go-cli.html))
2. **Node.js** (v18 or v20 recommended for SAP packages)
3. **SAP BTP Account** with Cloud Foundry environment
4. **HANA Cloud** instance available in your space

---

## Deployment Steps

### Step 1: Prepare the Application

```bash
# Navigate to project root
cd c:\Users\I763106\sap-integration-content-automation

# Install all dependencies in client
cd client
npm install
npm run build
cd ..

# Copy all dependecies to router
xcopy /E /I /Y client\dist\* approuter\resources\

#Install all depencies in server
cd server
npm install
cd ..
```

### Step 2: Login to Cloud Foundry

```bash
# Login to Cloud Foundry
cf login -a https://api.cf.eu10-004.hana.ondemand.com

# Enter your credentials and select org/space
```

### Step 3: Create HANA HDI Container Service

```bash
# Create HANA service (if not exists)
cf create-service hana hdi-shared integration_automation_db

# Wait for service creation (check status)
cf service integration_automation_db
```

### Step 4: Create XSUAA Service

```bash
# Create XSUAA service with security configuration
cf create-service xsuaa application integration_automation_xsuaa -c xs-security.json

# Check service status
cf service integration_automation_xsuaa
```

### Step 5: Deploy Database to HDI Container

Since we can't use MTA build on Windows without make, we'll deploy the database manually:

```bash
# Navigate to db folder
cd db

# Install dependencies
npm install

# Get service key for HDI container
cf create-service-key integration_automation_db service-key-db

# Get the service key details
cf service-key integration_automation_db service-key-db
```

**Manual HDI Deployment Option 1: Use SAP Business Application Studio or Web IDE**

1. Open SAP Business Application Studio
2. Create a new workspace
3. Copy the `db` folder contents
4. Bind to the HDI container service
5. Deploy using the built-in HDI deploy functionality

**Manual HDI Deployment Option 2: Use Cloud Foundry Task**

Create a temporary deployer app:

```bash
# From project root
cd db

# Create a temporary manifest for HDI deployment
```

Create `db/manifest-deploy.yml`:
```yaml
---
applications:
  - name: db-deployer-temp
    memory: 256M
    health-check-type: process
    no-route: true
    tasks:
      - name: deploy
        command: npm start
    services:
      - integration_automation_db
```

```bash
# Push as a task
cf push db-deployer-temp -f manifest-deploy.yml --no-start

# Run the deployment task
cf run-task db-deployer-temp "npm start" --name hdi-deploy

# Monitor task
cf tasks db-deployer-temp

# After successful deployment, delete the temporary app
cf delete db-deployer-temp -f
```

### Step 6: Deploy the Main Application

```bash
# Return to project root
cd ..

# Push the application (it will use manifest.yml)
cf push
```

### Step 7: Verify Deployment

```bash
# Check application status
cf apps

# View logs
cf logs sap-integration-automation-app --recent

# Check service bindings
cf services

# Test health endpoint
curl https://sap.integrationsuite.automation.cfapps.eu10-004.hana.ondemand.com/health
```

### Step 8: Assign User Roles

1. Access BTP Cockpit
2. Navigate to Security → Role Collections
3. Find: `IntegrationAutomation_Admin` and `IntegrationAutomation_User`
4. Navigate to Security → Users
5. Select your user and assign appropriate role collection

### Step 9: Access Application

Open browser:
```
https://sap.integrationsuite.automation.cfapps.eu10-004.hana.ondemand.com
```

---

## 🔧 Alternative: Install Make for Windows

If you prefer to use MTA build, you can install Make:

### Option 1: Install via Chocolatey
```powershell
# Install Chocolatey (if not installed)
# Run as Administrator
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install make
choco install make
```

### Option 2: Install Git Bash (includes make)
1. Download and install Git for Windows: https://git-scm.com/download/win
2. Use Git Bash terminal for `mbt build` command

### Option 3: Use WSL (Windows Subsystem for Linux)
```bash
# Enable WSL and install Ubuntu
wsl --install

# In WSL terminal
npm install -g mbt
mbt build
```

---

## 📝 Simplified manifest.yml for Direct Push

The existing `manifest.yml` is already configured for direct `cf push`. It includes:
- Application name and route
- Memory and disk allocation
- Service bindings (HANA and XSUAA)
- Health check configuration

---

## 🐛 Troubleshooting

### Issue: Services not bound
```bash
# Check if services exist
cf services

# Bind manually if needed
cf bind-service sap-integration-automation-app integration_automation_db
cf bind-service sap-integration-automation-app integration_automation_xsuaa

# Restage app
cf restage sap-integration-automation-app
```

### Issue: Database tables not created
If using direct push without HDI deployment, you may need to create tables manually via HANA Cockpit or use the SQL from the .hdbtable files.

### Issue: Authentication not working
```bash
# Check XSUAA service key
cf service-key integration_automation_xsuaa deploy-key

# Verify redirect URIs in xs-security.json match your route
# Update service if needed
cf update-service integration_automation_xsuaa -c xs-security.json
cf restage sap-integration-automation-app
```

---

## ✨ Recommended Deployment Flow for Windows

**Best Practice: Use SAP Business Application Studio**

1. Open SAP Business Application Studio (BAS)
2. Create a new Dev Space (Full-Stack Cloud Application)
3. Clone/upload your project
4. BAS has all tools pre-installed (MTA build tool, CF CLI, etc.)
5. Run standard deployment:
   ```bash
   cd client && npm run build && cd ..
   mbt build
   cf deploy mta_archives/sap-integration-automation_1.0.0.mtar
   ```

This avoids Windows-specific issues and provides the full SAP development environment.

---

## 🎯 Current Status

✅ **Code Migration:** Complete  
✅ **Local Testing:** Passed  
✅ **Dependencies:** Installed  
✅ **Configuration:** Complete  
🟡 **Deployment:** Ready (awaiting HDI deployment)  

**Next Action:**
- Use SAP Business Application Studio for deployment, OR
- Use direct `cf push` with manual HDI deployment, OR
- Install make utility and use `mbt build`

---

## 📞 Support

For deployment issues:
1. Check DEPLOYMENT_GUIDE.md for detailed troubleshooting
2. Use `cf logs sap-integration-automation-app --recent`
3. Verify service bindings with `cf env sap-integration-automation-app`
4. Consider using SAP Business Application Studio for easier deployment

**Deployment completed successfully!** 🎉
