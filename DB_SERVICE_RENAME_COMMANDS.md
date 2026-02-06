# 🔄 Database Service Rename - Execution Guide

## ✅ Configuration Files Updated

All configuration files have been updated from `integration_automation_db` to `intops_db`:

- ✅ **mta.yaml** - 3 occurrences updated
- ✅ **manifest.yml** - 2 occurrences updated  
- ✅ **db/manifest-deploy.yml** - 2 occurrences updated

---

## 📋 Step-by-Step Execution Commands

### **Step 1: Login to Cloud Foundry**

```bash
cf login -a https://api.cf.eu10-004.hana.ondemand.com
cf target -o IT_CF_INDIA_processautomation-oswptav8 -s dev
```

### **Step 2: Verify Current Service**

```bash
# Check that integration_automation_db exists
cf services | findstr integration_automation_db

# Expected output:
# integration_automation_db   hana   hdi-shared   ...
```

### **Step 3: Rename the Service**

```bash
# This preserves all data - no data loss!
cf rename-service integration_automation_db intops_db
```

### **Step 4: Verify Rename**

```bash
# Check that intops_db now exists
cf services | findstr intops_db

# Expected output:
# intops_db   hana   hdi-shared   ...
```

### **Step 5: Deploy Database Tables**

```bash
# Navigate to db folder
cd db

# Deploy HDI artifacts
cf push -f manifest-deploy.yml

# Wait for deployment to complete (check cf apps)
# Then clean up temporary deployer
cf stop db-deployer-temp
cf delete db-deployer-temp -f

# Return to root
cd ..
```

### **Step 6: Build Frontend**

```bash
# Install dependencies and build
cd client
npm install
npm run build
cd ..

# Copy build to approuter
xcopy /E /I /Y client\dist\* approuter\resources\
```

### **Step 7: Deploy Applications**

```bash
# Deploy both intops-server and intops-app
cf push

# This will:
# 1. Deploy intops-server (bound to intops_db)
# 2. Deploy intops-app approuter (bound to intops_db)
```

### **Step 8: Verify Deployment**

```bash
# Check all apps are running
cf apps

# Expected output:
# intops-server   started   ...
# intops-app      started   ...

# Check services are bound correctly
cf services

# Expected output should show intops_db bound to both apps

# View recent logs if needed
cf logs intops-server --recent
cf logs intops-app --recent
```

---

## 🎯 Complete Command Sequence (Copy-Paste)

```bash
# === PHASE 1: Login and Verify ===
cf login -a https://api.cf.eu10-004.hana.ondemand.com
cf target -o IT_CF_INDIA_processautomation-oswptav8 -s dev
cf services | grep integration_automation_db

# === PHASE 2: Rename Service ===
cf rename-service integration_automation_db intops_db
cf services | grep intops_db

# === PHASE 3: Deploy Database ===
cd db
cf push -f manifest-deploy.yml
cf stop db-deployer-temp
cf delete db-deployer-temp -f
cd ..

# === PHASE 4: Build Frontend ===
cd client
npm install
npm run build
cd ..
xcopy /E /I /Y client\dist\* approuter\resources\

# === PHASE 5: Deploy Applications ===
cf push

# === PHASE 6: Verify ===
cf apps
cf services
```

---

## ⚠️ Important Notes

1. **Data Safety**: `cf rename-service` only changes the service name - all data is preserved
2. **No Downtime**: The rename operation is instantaneous
3. **Automatic Rebinding**: `cf push` automatically updates service bindings
4. **Rollback Available**: If needed, rename back: `cf rename-service intops_db integration_automation_db`

---

## 🔍 Troubleshooting

### If db-deployer-temp fails:
```bash
cf logs db-deployer-temp --recent
# Check for HDI deployment errors
```

### If app deployment fails:
```bash
cf logs intops-server --recent
cf logs intops-app --recent
# Check for binding or startup errors
```

### To check service bindings:
```bash
cf env intops-server
cf env intops-app
# Look for intops_db in VCAP_SERVICES
```

---

## 🎊 Success Criteria

✅ Service renamed from `integration_automation_db` to `intops_db`  
✅ Database tables deployed successfully  
✅ Both applications running  
✅ Applications can connect to database  
✅ Application accessible at routes  

**Access your application at:**
- **Main App**: https://intops-app.cfapps.eu10-004.hana.ondemand.com
- **Backend**: https://intops-server.cfapps.eu10-004.hana.ondemand.com

---

Generated: 2026-02-05