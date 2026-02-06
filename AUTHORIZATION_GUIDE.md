# Authorization Guide - SAP Integration Content Automation

## Overview
This application uses SAP XSUAA (Extended Services for User Account and Authentication) for role-based access control (RBAC). The authorization system has been configured with granular scopes to differentiate between Admin and User roles.

---

## 📋 Scopes Defined

The application defines four scopes in `xs-security.json`:

| Scope | Description | Operations Allowed |
|-------|-------------|-------------------|
| **Read** | View access | View logs, projects, download files |
| **Write** | Create/Update access | Create and update projects |
| **Execute** | Job execution access | Run download, upload, deploy jobs |
| **Delete** | Delete access | Delete projects (Admin only) |

---

## 👥 Roles & Permissions

### Admin Role
**Full Access** - Has all four scopes:
- ✅ Read - View all data
- ✅ Write - Create and update projects
- ✅ Execute - Run all jobs
- ✅ Delete - Delete projects

### User Role
**Limited Access** - Has three scopes (no Delete):
- ✅ Read - View all data
- ✅ Write - Create and update projects
- ✅ Execute - Run all jobs
- ❌ Delete - Cannot delete projects

---

## 🔐 Role Collections

### IntOps_Admin
- Assigned to administrators
- Grants Admin role with all permissions

### IntOps_User
- Assigned to regular users
- Grants User role without delete permission

---

## 📍 Endpoint Authorization

### Project Routes (`/api/projects`)
| Method | Endpoint | Required Scope | Admin | User |
|--------|----------|----------------|-------|------|
| GET | `/` | Read | ✅ | ✅ |
| GET | `/:id` | Read | ✅ | ✅ |
| POST | `/` | Write | ✅ | ✅ |
| PUT | `/:id` | Write | ✅ | ✅ |
| DELETE | `/:id` | **Delete** | ✅ | ❌ |

### Logs Routes (`/api`)
| Method | Endpoint | Required Scope | Admin | User |
|--------|----------|----------------|-------|------|
| GET | `/logs` | Read | ✅ | ✅ |
| GET | `/download/log/:id` | Read | ✅ | ✅ |
| GET | `/download/result/:id` | Read | ✅ | ✅ |

### Download Routes (`/api/v1`)
| Method | Endpoint | Required Scope | Admin | User |
|--------|----------|----------------|-------|------|
| POST | `/start-download-job` | Execute | ✅ | ✅ |
| GET | `/download-job-status/:id` | Read | ✅ | ✅ |
| GET | `/get-download-result/:id` | Read | ✅ | ✅ |

### Upload Routes (`/api/v1`)
| Method | Endpoint | Required Scope | Admin | User |
|--------|----------|----------------|-------|------|
| POST | `/run-upload` | Execute | ✅ | ✅ |
| GET | `/job-status/:id` | Read | ✅ | ✅ |
| GET | `/get-result/:id` | Read | ✅ | ✅ |

### Deploy Routes (`/api/v1`)
| Method | Endpoint | Required Scope | Admin | User |
|--------|----------|----------------|-------|------|
| POST | `/run-deploy` | Execute | ✅ | ✅ |
| GET | `/deploy-job-status/:id` | Read | ✅ | ✅ |
| GET | `/get-deploy-result/:id` | Read | ✅ | ✅ |

---

## 🚀 Deployment & Configuration

### Step 1: Build and Deploy to Cloud Foundry

**On Windows (without make installed):**
```bash
# Build using the provided batch script
.\build.bat

# Deploy directly (no mtar file needed)
cf deploy
```

**On Linux/Mac (with make installed):**
```bash
# Build the MTA
mbt build

# Deploy
cf deploy mta_archives/intops_1.0.0.mtar
```

### Step 2: Assign Role Collections to Users

1. Go to **SAP BTP Cockpit**
2. Navigate to your **Subaccount**
3. Go to **Security → Users**
4. Select a user
5. Click **Assign Role Collection**
6. Choose:
   - `IntOps_Admin` for administrators
   - `IntOps_User` for regular users

### Step 3: Verify Authorization

#### Test as Admin User:
```bash
# Should succeed - Delete project
DELETE /api/projects/1
Response: 200 OK
```

#### Test as Regular User:
```bash
# Should fail - Delete project
DELETE /api/projects/1
Response: 403 Forbidden
{
  "error": "Forbidden",
  "message": "You don't have permission to perform this action. Required scope: Delete"
}
```

---

## 🔧 Technical Implementation

### Scope Checking Methods

The `auth-middleware.js` implements multiple methods to check scopes:

1. **checkLocalScope()** - Most reliable (SAP recommended)
2. **getScopes()** - Fallback method
3. **scopes property** - Additional fallback
4. **authInfo.scopes** - Last resort

### Usage in Routes

```javascript
// Example: Protect DELETE endpoint (Admin only)
router.delete('/:id', authenticate, checkScope('Delete'), async (req, res) => {
  // Only users with Delete scope can reach here
});

// Example: Protect POST endpoint (Admin and User)
router.post('/', authenticate, checkScope('Write'), async (req, res) => {
  // Both Admin and User can reach here
});
```

---

## 🧪 Testing Authorization

### Local Development
In local mode (without VCAP_APPLICATION), authorization is **bypassed** for easier development.

### Cloud Environment
In Cloud Foundry, authorization is **enforced** based on JWT tokens from XSUAA.

### Test Scenarios

1. **Admin User Tests:**
   - ✅ Create project
   - ✅ Update project
   - ✅ Delete project
   - ✅ Run jobs
   - ✅ View logs

2. **Regular User Tests:**
   - ✅ Create project
   - ✅ Update project
   - ❌ Delete project (should get 403)
   - ✅ Run jobs
   - ✅ View logs

---

## 🐛 Troubleshooting

### Issue: User role not working

**Symptoms:**
- Users assigned `IntOps_User` role collection can't access the application
- 403 Forbidden errors for all operations

**Solutions:**

1. **Verify Role Collection Assignment:**
   ```bash
   # Check assigned role collections in BTP Cockpit
   Security → Users → Select User → View Assignments
   ```

2. **Check XSUAA Service Binding:**
   ```bash
   cf env intops-server
   # Look for XSUAA credentials in VCAP_SERVICES
   ```

3. **Verify Scope in JWT Token:**
   - Use browser DevTools → Network → Check Authorization header
   - Decode JWT token at https://jwt.io
   - Verify scopes are present: `intops.Read`, `intops.Write`, `intops.Execute`

4. **Check Application Logs:**
   ```bash
   cf logs intops-server --recent
   # Look for scope-related warnings
   ```

### Issue: Delete still works for User role

**Solution:**
- Verify `xs-security.json` was updated correctly
- Redeploy application:
  ```bash
  mbt build
  cf deploy mta_archives/intops_1.0.0.mtar
  ```
- Clear browser cache and re-login

---

## 📊 Authorization Flow

```
┌─────────────────────────────────────────────────────────┐
│  1. User accesses application                           │
│     ↓                                                    │
│  2. AppRouter redirects to XSUAA for authentication     │
│     ↓                                                    │
│  3. XSUAA authenticates and issues JWT token            │
│     - Token contains user info and scopes               │
│     ↓                                                    │
│  4. Request sent to backend with JWT token              │
│     ↓                                                    │
│  5. auth-middleware validates JWT                       │
│     ↓                                                    │
│  6. checkScope middleware checks required scope         │
│     ↓                                                    │
│  7. If scope present → Allow (200 OK)                   │
│     If scope missing → Deny (403 Forbidden)             │
└─────────────────────────────────────────────────────────┘
```

---

## 🔒 Security Best Practices

1. **Principle of Least Privilege**
   - Assign only necessary role collections
   - Use `IntOps_User` by default, `IntOps_Admin` only when needed

2. **Regular Audits**
   - Review user assignments periodically
   - Check logs for authorization failures

3. **Scope Granularity**
   - Current scopes are well-defined
   - Can add more scopes if needed (e.g., `Approve`, `Monitor`)

4. **Token Security**
   - Tokens are short-lived (configurable in XSUAA)
   - Automatic refresh handled by AppRouter

---

## 📝 Customization

### Adding New Scopes

1. **Update xs-security.json:**
```json
{
  "scopes": [
    {
      "name": "$XSAPPNAME.YourNewScope",
      "description": "Description of your scope"
    }
  ]
}
```

2. **Update Role Templates:**
```json
{
  "role-templates": [
    {
      "name": "YourRole",
      "scope-references": ["$XSAPPNAME.YourNewScope"]
    }
  ]
}
```

3. **Apply to Routes:**
```javascript
router.post('/your-endpoint', authenticate, checkScope('YourNewScope'), handler);
```

4. **Redeploy:**
```bash
mbt build
cf deploy mta_archives/intops_1.0.0.mtar
```

---

## 📚 References

- [SAP XSUAA Documentation](https://help.sap.com/docs/CP_AUTHORIZ_TRUST_MNG)
- [SAP BTP Security Guide](https://help.sap.com/docs/BTP/65de2977205c403bbc107264b8eccf4b/e129aa20c78c4a9fb379b9803b02e5f6.html)
- [@sap/xssec NPM Package](https://www.npmjs.com/package/@sap/xssec)

---

**Last Updated:** February 6, 2026  
**Version:** 1.0  
**Author:** Development Team