# Zitadel Setup Guide - Complete Reference

**Last Updated:** November 7, 2025  
**Status:** Current (Machine User Zero-Touch Bootstrap)

This is the complete, authoritative guide for setting up Zitadel authentication in the Spec Server project. All other Zitadel setup documentation has been consolidated here.

---

## Quick Start (5 Minutes) ⚡

### Local Development

1. **Start services:**
   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```

2. **Run bootstrap:**
   ```bash
   bash scripts/bootstrap-zitadel-fully-automated.sh provision
   ```

3. **Done!** 
   - Zitadel Console: http://localhost:8200
   - Admin credentials displayed in bootstrap output
   - All keys saved to `secrets/` directory

4. **Optional - Verify Setup:**
   ```bash
   bash scripts/bootstrap-zitadel-fully-automated.sh test
   ```
   - Runs 10 comprehensive tests
   - Confirms everything works correctly

### Production (Coolify)

1. **Set environment variables** in Coolify (see [Environment Variables](#environment-variables-checklist) section)
2. **Deploy** using `docker-compose.coolify.yml`
3. **Run bootstrap** on the server:
   ```bash
   bash scripts/bootstrap-zitadel-fully-automated.sh provision
   ```
4. **Update Coolify** environment with generated IDs from bootstrap output

---

## What Gets Created (Zero-Touch Bootstrap)

### Automatic Setup ✨

The bootstrap script creates everything automatically:

| Resource | Details |
|----------|---------|
| **Bootstrap Machine User** | `zitadel-admin-sa` in "Spec Inc" org |
| **Personal Access Token** | Auto-saved to `secrets/bootstrap/pat.txt` |
| **Application Organization** | "Spec Organization" (your app's org) |
| **Project** | "Spec Server" |
| **OAuth OIDC Application** | For frontend authentication |
| **API Application** | For backend service authentication |
| **CLIENT Service Account** | For token introspection (minimal permissions) |
| **API Service Account** | For Management API (ORG_OWNER role) |
| **Admin User** | Human user with console access + ORG_OWNER role |
| **Test User** | Human user for testing, email verified |

### Credentials 🔑

**Bootstrap Machine User** (Auto-created by Zitadel):
- Username: `zitadel-admin-sa`
- Organization: `Spec Inc` (first instance org)
- PAT: `secrets/bootstrap/pat.txt`
- Purpose: Used by bootstrap script only

**Admin User** (Console Access):
- Email: `admin@spec.local` (configurable via `ADMIN_USER_EMAIL`)
- Password: `AdminPassword123!` (configurable via `ADMIN_USER_PASSWORD`)
- Role: `ORG_OWNER`
- Console: http://localhost:8200
- Purpose: Manual administration via UI

**Test User** (Application Testing):
- Email: `test@example.com` (configurable via `TEST_USER_EMAIL`)
- Password: `TestPassword123!` (configurable via `TEST_USER_PASSWORD`)
- Status: Active, email verified
- Purpose: Testing authentication flows

**Service Accounts** (Programmatic Access):
- CLIENT: `secrets/zitadel-client-service-account.json` (token introspection)
- API: `secrets/zitadel-api-service-account.json` (Management API)
- API App: `secrets/zitadel-api-app-key.json` (API application key)

---

## Architecture

### Why Machine User Bootstrap Works

**The Problem with Manual PAT Creation:**
- Requires email verification (SMTP setup)
- Manual UI interaction needed
- Not truly "zero-touch"

**The Solution - Machine User:**
1. Zitadel creates machine user during first instance setup
2. Machine user automatically generates PAT to mounted volume
3. Bootstrap script uses PAT to create everything else
4. No email verification needed
5. Fully automated, reproducible

**Configuration:**
```bash
# In docker/zitadel.env
ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_USERNAME=zitadel-admin-sa
ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_NAME=Bootstrap Admin Service Account
ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINEKEY_TYPE=1
ZITADEL_FIRSTINSTANCE_PATPATH=/machinekey/pat.txt
ZITADEL_FIRSTINSTANCE_ORG_MACHINE_PAT_EXPIRATIONDATE=2030-12-31T23:59:59Z
```

### Dual Service Account Pattern

**Why Two Service Accounts?**

We use separate service accounts for different purposes:

#### CLIENT Service Account
- **Purpose:** Token introspection only
- **Permissions:** Minimal (just introspection scope)
- **Usage:** High-frequency (every authenticated request)
- **Security:** Reduced blast radius if compromised
- **File:** `secrets/zitadel-client-service-account.json`

#### API Service Account
- **Purpose:** Management API operations (user creation, metadata updates)
- **Permissions:** Elevated (`ORG_OWNER` role)
- **Usage:** Low-frequency (administrative operations)
- **Security:** Isolated from high-traffic introspection
- **File:** `secrets/zitadel-api-service-account.json`

**Benefits:**
- ✅ Better security isolation
- ✅ Separate token caching strategies
- ✅ Reduced risk of permission conflicts
- ✅ Easier to audit and monitor

---

## Configuration Reference

### Environment Variables Checklist

#### Required Variables (Application)

```bash
# Zitadel Domain
ZITADEL_DOMAIN=localhost:8200                     # Local dev
# ZITADEL_DOMAIN=auth.yourdomain.com             # Production

# Organization & Project IDs (from bootstrap output)
ZITADEL_ORG_ID=<org-id-from-bootstrap>
ZITADEL_PROJECT_ID=<project-id-from-bootstrap>

# Dual Service Account (Recommended)
ZITADEL_CLIENT_JWT_PATH=./secrets/zitadel-client-service-account.json
ZITADEL_API_JWT_PATH=./secrets/zitadel-api-service-account.json

# OAuth Application (for frontend)
ZITADEL_OAUTH_CLIENT_ID=<client-id-from-bootstrap>
ZITADEL_OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback

# API Application (for backend)
ZITADEL_API_CLIENT_ID=<api-client-id-from-bootstrap>
ZITADEL_API_APP_JWT_PATH=./secrets/zitadel-api-app-key.json
```

#### Bootstrap Configuration (Optional)

Customize bootstrap behavior with environment variables:

```bash
# Bootstrap Script Configuration
ZITADEL_DOMAIN=localhost:8200                     # Zitadel domain
ORG_NAME="Spec Organization"                      # Organization name
PROJECT_NAME="Spec Server"                        # Project name

# Admin User (Console Access)
ADMIN_USER_EMAIL=admin@spec.local
ADMIN_USER_PASSWORD=AdminPassword123!

# Test User (Application Testing)
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=TestPassword123!

# OAuth Application
OAUTH_APP_NAME="Spec Server OAuth"
REDIRECT_URI=http://localhost:3000/auth/callback
```

### File Locations

| File | Purpose | Auto-Generated? |
|------|---------|----------------|
| `docker/docker-compose.yml` | Local development compose | ❌ Manual |
| `docker-compose.coolify.yml` | Production compose | ❌ Manual |
| `docker/zitadel.env` | Zitadel configuration | ❌ Manual |
| `secrets/bootstrap/pat.txt` | Bootstrap PAT | ✅ Auto |
| `secrets/zitadel-client-service-account.json` | CLIENT service account | ✅ Auto |
| `secrets/zitadel-api-service-account.json` | API service account | ✅ Auto |
| `secrets/zitadel-api-app-key.json` | API application key | ✅ Auto |

---

## Bootstrap Script Modes

The bootstrap script supports multiple modes:

### `provision` (default)
Full setup from scratch - creates everything:

```bash
bash scripts/bootstrap-zitadel-fully-automated.sh provision

# With custom configuration:
ADMIN_USER_EMAIL=admin@company.com \
ADMIN_USER_PASSWORD=SecurePass123! \
bash scripts/bootstrap-zitadel-fully-automated.sh provision
```

**Creates:**
- Organization and project
- OAuth OIDC and API applications
- Two service accounts with proper roles
- Admin user with ORG_OWNER role
- Test user with verified email

### `status`
Show current configuration and connectivity:

```bash
bash scripts/bootstrap-zitadel-fully-automated.sh status
```

**Displays:**
- Local file status
- Zitadel connectivity
- Organization and project IDs
- Service account IDs
- User credentials

### `test`
Run comprehensive test suite (10 tests):

```bash
bash scripts/bootstrap-zitadel-fully-automated.sh test
```

**Tests performed:**
1. ✅ Local configuration files (PAT, service account keys)
2. ✅ Zitadel connectivity and health
3. ✅ Admin PAT authentication
4. ✅ Organization exists and accessible
5. ✅ Project exists and accessible
6. ✅ Service accounts exist (CLIENT + API)
7. ✅ Users created (admin + test users)
8. ✅ Organization roles assigned correctly
9. ✅ OAuth applications created
10. ✅ Key file consistency with Zitadel

**Output:**
- Clear pass/fail for each test
- Summary of configuration
- Console access credentials
- Exit code 0 if all pass, 1 if any fail

**Use when:**
- Verifying new setup after provision
- Confirming setup after deployment
- Troubleshooting configuration issues
- Automated CI/CD validation

### `verify`
Comprehensive health check:

```bash
bash scripts/bootstrap-zitadel-fully-automated.sh verify
```

**Checks:**
- Local configuration files
- Zitadel connectivity
- Admin PAT authentication
- Service account JWT authentication
- Management API access
- Service account existence in Zitadel

**Note:** Similar to `test` but more detailed, includes optional OAuth checks.

### `regenerate`
Regenerate service account JWT keys:

```bash
bash scripts/bootstrap-zitadel-fully-automated.sh regenerate
```

**Use when:**
- Keys have been compromised
- Keys are expiring
- Need to rotate credentials

**Warning:** Old keys become invalid immediately!

---

## Troubleshooting

### Reset Everything

If something goes wrong, you can completely reset and start fresh:

```bash
# 1. Stop all containers
docker compose -f docker/docker-compose.yml down

# 2. Remove database volume
docker volume rm spec-2_pg_data

# 3. Clear secrets
rm -f secrets/bootstrap/pat.txt
rm -f secrets/zitadel-*-service-account.json
rm -f secrets/zitadel-api-app-key.json

# 4. Start fresh
docker compose -f docker/docker-compose.yml up -d

# 5. Wait for healthy (check with docker ps)
# Then run bootstrap
bash scripts/bootstrap-zitadel-fully-automated.sh provision
```

### Common Issues

#### Issue: "Authentication failed (HTTP 401)"

**Cause:** PAT file is invalid or expired

**Solution:**
```bash
# Check if PAT file exists and has content
cat secrets/bootstrap/pat.txt

# If empty or missing, Zitadel didn't generate it
# Check Zitadel logs:
docker logs spec-2-zitadel-1 | grep -i "machine\|pat"

# Restart Zitadel to regenerate:
docker compose -f docker/docker-compose.yml restart zitadel
```

#### Issue: "Organization already exists"

**Cause:** Running provision mode when already set up

**Solution:** Use `status` mode instead to see current configuration:
```bash
bash scripts/bootstrap-zitadel-fully-automated.sh status
```

#### Issue: "Cannot iterate over null"

**Cause:** Expected resources don't exist yet (harmless warning)

**Solution:** These warnings are normal during first-time setup. Script continues and creates resources.

#### Issue: "Test user might already exist"

**Cause:** User was created in a previous run

**Solution:** This is expected and harmless. User exists and is functional.

#### Issue: Email verification required (should not happen)

**Cause:** Using old human-user configuration instead of machine-user

**Solution:** Verify `docker/zitadel.env` has machine-user config:
```bash
grep "MACHINE" docker/zitadel.env
# Should show ZITADEL_FIRSTINSTANCE_ORG_MACHINE_* variables
```

---

## Production Deployment (Coolify)

### Prerequisites

- [ ] Coolify server running
- [ ] Domain configured (e.g., `auth.yourdomain.com`)
- [ ] SSL/TLS certificates (Coolify handles this automatically)
- [ ] Secret management strategy (Coolify environment variables)

### Deployment Steps

1. **Configure Coolify Project**
   - Create new project in Coolify
   - Select `docker-compose.coolify.yml`
   - Configure domain for Zitadel

2. **Set Environment Variables**
   
   Copy these to Coolify environment settings:
   ```bash
   # PostgreSQL
   POSTGRES_USER=spec
   POSTGRES_PASSWORD=<generate-secure-password>
   POSTGRES_DB=spec
   
   # Zitadel Database
   ZITADEL_DB_PASSWORD=<generate-secure-password>
   
   # Zitadel Configuration
   ZITADEL_MASTERKEY=<exactly-32-characters>
   ZITADEL_EXTERNALDOMAIN=auth.yourdomain.com
   ZITADEL_EXTERNALSECURE=true
   
   # Organization Setup
   ZITADEL_ORG_NAME="Your Organization"
   
   # Google AI
   GOOGLE_API_KEY=<your-api-key>
   
   # Security
   INTEGRATION_ENCRYPTION_KEY=<generate-secure-key>
   
   # CORS (frontend domain)
   CORS_ORIGIN=https://yourdomain.com
   
   # Frontend Build Args
   VITE_API_URL=https://yourdomain.com/api
   VITE_ZITADEL_ISSUER=https://auth.yourdomain.com
   ```

3. **Deploy Application**
   - Trigger deployment in Coolify
   - Wait for all services to be healthy
   - Check logs for any errors

4. **Run Bootstrap on Server**
   
   SSH into your Coolify server and run:
   ```bash
   cd /path/to/deployment
   
   # Run bootstrap
   bash scripts/bootstrap-zitadel-fully-automated.sh provision
   
   # Copy the output - you'll need the IDs!
   ```

5. **Update Coolify Environment**
   
   Add these variables from bootstrap output:
   ```bash
   ZITADEL_ORG_ID=<from-bootstrap>
   ZITADEL_PROJECT_ID=<from-bootstrap>
   ZITADEL_OAUTH_CLIENT_ID=<from-bootstrap>
   ZITADEL_API_CLIENT_ID=<from-bootstrap>
   
   # Service account paths
   ZITADEL_CLIENT_JWT_PATH=./secrets/zitadel-client-service-account.json
   ZITADEL_API_JWT_PATH=./secrets/zitadel-api-service-account.json
   ZITADEL_API_APP_JWT_PATH=./secrets/zitadel-api-app-key.json
   
   # Frontend build args
   VITE_ZITADEL_CLIENT_ID=<oauth-client-id-from-bootstrap>
   ```

6. **Rebuild Frontend**
   
   Frontend needs rebuild with new client ID:
   ```bash
   # In Coolify, trigger rebuild for 'admin' service
   ```

7. **Verify Deployment**
   ```bash
   # Check all services healthy
   docker ps
   
   # Test Zitadel
   curl https://auth.yourdomain.com/debug/healthz
   
   # Test API
   curl https://yourdomain.com/api/health
   
   # Test frontend
   curl https://yourdomain.com/health
   ```

### Secret Management in Production

**Important:** Service account JSON files contain sensitive keys!

**Options:**

1. **Coolify Environment Variables** (Recommended)
   - Store JSON content as environment variables
   - Use `ZITADEL_CLIENT_JWT` and `ZITADEL_API_JWT` (not `_PATH`)
   - Application loads from env vars instead of files

2. **Secure Volume Mounts**
   - Store secrets in Coolify's secure storage
   - Mount as read-only volumes
   - Use `ZITADEL_*_JWT_PATH` variables

3. **External Secret Manager**
   - Use Vault, AWS Secrets Manager, etc.
   - Fetch secrets on container startup
   - Rotate regularly

---

## Security Notes

### Best Practices

1. **Rotate Service Account Keys Regularly**
   ```bash
   # Every 90 days recommended
   bash scripts/bootstrap-zitadel-fully-automated.sh regenerate
   ```

2. **Use Strong Passwords**
   - Admin password: 16+ characters, mixed case, numbers, symbols
   - Never use default passwords in production

3. **Limit Access**
   - Bootstrap PAT should be deleted after initial setup
   - Admin console access should be restricted by IP if possible
   - Use MFA for admin users

4. **Monitor and Audit**
   - Enable Zitadel audit logs
   - Monitor failed authentication attempts
   - Review service account usage regularly

5. **Separate Environments**
   - Use different Zitadel instances for dev/staging/prod
   - Never reuse service accounts across environments
   - Different domains for each environment

### Security Isolation

The dual service account pattern provides defense in depth:

- **CLIENT account** has minimal permissions
  - If compromised, attacker can only validate tokens
  - Cannot create users or modify configuration
  - Limited to introspection endpoint

- **API account** has elevated permissions
  - Used only for administrative operations
  - Not exposed to high-traffic endpoints
  - Easier to monitor for abuse

### Credential Storage

**Local Development:**
- Secrets in `secrets/` directory (gitignored)
- Never commit to version control
- Regenerate if accidentally exposed

**Production:**
- Use environment variables or secret managers
- Never store in Docker images
- Rotate regularly

---

## See Also

### Related Documentation

- **[Zitadel Impersonation](../ZITADEL_IMPERSONATION_SETUP.md)** - Token delegation setup for user impersonation
- **[Passport Zitadel Integration](../PASSPORT_ZITADEL.md)** - Authentication strategy details
- **[Authorization Model](../spec/18-authorization-model.md)** - Application authorization design

### External Resources

- [Zitadel Official Documentation](https://zitadel.com/docs)
- [OIDC Standard](https://openid.net/specs/openid-connect-core-1_0.html)
- [OAuth 2.0 Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

---

## Changelog

### November 7, 2025 - Machine User Zero-Touch Bootstrap
- ✨ Implemented automatic PAT generation via machine user
- ✨ Added admin user creation with ORG_OWNER role
- ✨ Consolidated setup from 6 documents into this master guide
- 🔧 Updated docker-compose files to use machine-user config
- 📚 Archived outdated documentation

### November 6, 2025 - Dual Service Account Migration
- ✨ Migrated from single to dual service account pattern
- 🔧 Separated CLIENT (introspection) from API (management) accounts
- 📚 Created comprehensive setup guides

---

**Questions or issues?** Check the [Troubleshooting](#troubleshooting) section or create an issue in the repository.
