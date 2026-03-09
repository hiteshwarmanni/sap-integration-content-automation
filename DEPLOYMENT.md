# Cloud Foundry Deployment Guide

This guide will help you deploy the IntOps application to SAP Cloud Foundry.

## Prerequisites

Before deploying, ensure you have:

1. **Cloud Foundry CLI installed**
   ```bash
   # macOS
   brew install cloudfoundry/tap/cf-cli
   
   # Or download from: https://docs.cloudfoundry.org/cf-cli/install-go-cli.html
   ```

2. **Access to SAP BTP Cloud Foundry environment**
   - Account with deployment permissions
   - Space where you want to deploy

3. **Required services created in your Cloud Foundry space:**
   - `intops_db` - Database service (SAP HANA or PostgreSQL)
   - `intops_xsuaa` - XSUAA service for authentication
   - `cloud-logging-cloud-logging` - Cloud Logging service

## Deployment Steps

### 1. Login to Cloud Foundry

```bash
cf login -a <api-endpoint>
```

Example for EU10:
```bash
cf login -a https://api.cf.eu10-004.hana.ondemand.com
```

Enter your credentials when prompted.

### 2. Target your organization and space

```bash
cf target -o <your-org> -s <your-space>
```

### 3. Verify required services exist

```bash
cf services
```

Ensure you see:
- intops_db
- intops_xsuaa
- cloud-logging-cloud-logging

If services don't exist, create them:

```bash
# Create HANA database
cf create-service hana hdi-shared intops_db

# Create XSUAA service
cf create-service xsuaa application intops_xsuaa -c xs-security.json

# Create Cloud Logging service
cf create-service cloud-logging standard cloud-logging-cloud-logging
```

### 4. Update manifest.yml (if needed)

Edit `manifest.yml` to update routes to match your Cloud Foundry subdomain:

```yaml
applications:
  - name: intops-server
    routes:
      - route: intops-server.cfapps.<your-region>.hana.ondemand.com
  
  - name: intops-app
    routes:
      - route: intops-app.cfapps.<your-region>.hana.ondemand.com
    env:
      destinations: '[{"name":"backend","url":"https://intops-server.cfapps.<your-region>.hana.ondemand.com","forwardAuthToken":true}]'
```

### 5. Run the deployment script

```bash
./deploy.sh
```

This script will:
1. ✅ Check CF CLI installation and login status
2. ✅ Install all dependencies
3. ✅ Build the client application
4. ✅ Copy client build to server
5. ✅ Deploy both applications to Cloud Foundry

### 6. Verify deployment

```bash
# Check application status
cf apps

# View recent logs
cf logs intops-app --recent
cf logs intops-server --recent
```

## Manual Deployment (Alternative)

If you prefer to deploy manually:

```bash
# 1. Install dependencies
npm run install-all

# 2. Build client
cd client && npm run build && cd ..

# 3. Copy client build to server
rm -rf server/public
mkdir -p server/public
cp -r client/dist/* server/public/

# 4. Deploy to Cloud Foundry
cf push
```

## Post-Deployment

### Access your application

- **Frontend (User Interface):** https://intops-app.cfapps.eu10-004.hana.ondemand.com
- **Backend (API):** https://intops-server.cfapps.eu10-004.hana.ondemand.com

### Configure User Access

1. Access SAP BTP Cockpit
2. Navigate to your subaccount → Security → Role Collections
3. Assign users to the appropriate role collections

### Monitor your application

```bash
# View live logs
cf logs intops-app
cf logs intops-server

# Check application health
cf app intops-app
cf app intops-server

# View recent logs
cf logs intops-app --recent
cf logs intops-server --recent
```

## Troubleshooting

### Application won't start

```bash
# Check logs
cf logs intops-server --recent

# Restart application
cf restart intops-server
```

### Service binding issues

```bash
# Check bound services
cf services

# Rebind service if needed
cf unbind-service intops-server intops_db
cf bind-service intops-server intops_db
cf restage intops-server
```

### Memory or disk quota exceeded

Update `manifest.yml`:
```yaml
memory: 2G  # Increase from 1G
disk_quota: 2G  # Increase from 1G
```

Then redeploy:
```bash
cf push
```

## Updating the Application

To deploy updates:

```bash
# Pull latest changes
git pull

# Run deployment script
./deploy.sh
```

Or use zero-downtime deployment:

```bash
cf push intops-server --strategy rolling
cf push intops-app --strategy rolling
```

## Environment Variables

Key environment variables (set in `manifest.yml`):

- `NODE_ENV`: Set to "production"
- `BEHIND_APPROUTER`: Set to "true" when using approuter
- `CLEANUP_SCHEDULE_UTC`: Schedule for cleanup job (e.g., "DAILY 00")
- `RETENTION_MONTHS`: Number of months to retain logs (e.g., "12")

## Scaling

To scale your application:

```bash
# Scale instances
cf scale intops-server -i 2

# Scale memory
cf scale intops-server -m 2G
```

## Additional Resources

- [Cloud Foundry Documentation](https://docs.cloudfoundry.org/)
- [SAP BTP Cloud Foundry Documentation](https://help.sap.com/docs/btp/sap-business-technology-platform/cloud-foundry-environment)
- [CF CLI Reference](https://cli.cloudfoundry.org/en-US/v8/)

## Support

For issues or questions:
1. Check application logs: `cf logs intops-server --recent`
2. Review Cloud Foundry events: `cf events intops-server`
3. Check service health: `cf services`