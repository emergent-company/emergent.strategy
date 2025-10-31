# ✅ Coolify Deployment - Ready!

**Date**: October 31, 2025  
**Status**: ✅ **Infrastructure Ready**  
**Next**: Configure Environment & Deploy

---

## 🎉 What's Complete

All core infrastructure for Coolify deployment has been created:

### ✅ Docker Infrastructure
- ✅ `apps/server-nest/Dockerfile` - Backend NestJS API
- ✅ `apps/admin/Dockerfile` - Frontend React app with Nginx
- ✅ `docker-compose.yml` - Production compose with all services
- ✅ `.dockerignore` - Optimized build context

### ✅ Configuration
- ✅ `.env.production.example` - Complete environment variable reference

### ✅ Deployment Scripts
- ✅ `scripts/deploy-coolify.sh` - One-command deployment
- ✅ `scripts/sync-coolify-env.sh` - Environment variable sync via API
- ✅ `scripts/preflight-check.sh` - Pre-deployment validation
- ✅ `scripts/test-docker-local.sh` - Local Docker testing

### ✅ Documentation
- ✅ `docs/COOLIFY_DEPLOYMENT_PLAN.md` - Detailed implementation plan
- ✅ This guide - Step-by-step deployment instructions

---

## 🚀 Quick Start (5 Steps)

```bash
# 1. Configure environment
cp .env.production.example .env.production
# Edit .env.production with your actual values

# 2. Run pre-flight checks
./scripts/preflight-check.sh

# 3. Test locally (optional but recommended)
./scripts/test-docker-local.sh

# 4. Sync environment variables to Coolify
export COOLIFY_APP_UUID=your-app-uuid
export COOLIFY_TOKEN=your-api-token
./scripts/sync-coolify-env.sh

# 5. Deploy!
./scripts/deploy-coolify.sh
```

---

## 📋 Pre-Deployment Checklist

### Prerequisites
- [ ] Coolify instance accessible
- [ ] Coolify CLI installed (`npm install -g coolify-cli`)
- [ ] Docker and BuildKit available locally (for testing)
- [ ] Git repository accessible to Coolify
- [ ] Domain names configured and DNS pointing to Coolify
- [ ] SSL certificates (auto-provisioned by Coolify/Traefik)

### Configuration
- [ ] `.env.production` created and filled with actual values
- [ ] Zitadel configured:
  - [ ] Organization created
  - [ ] Backend API client created (JWT Profile)
  - [ ] Frontend client created (User Agent/PKCE)
  - [ ] Service account key generated (if needed)
- [ ] Google API key obtained
- [ ] Database passwords generated (secure, 32+ characters)
- [ ] Zitadel master key generated (exactly 32 characters)

### Testing
- [ ] Local builds succeed (`./scripts/preflight-check.sh`)
- [ ] Local Docker test passes (`./scripts/test-docker-local.sh`)
- [ ] All tests passing
- [ ] No uncommitted changes (or committed and pushed)

---

## 🔧 Detailed Setup

### Step 1: Configure Environment Variables

Create your production environment file:

```bash
cp .env.production.example .env.production
```

**Required values to configure:**

#### Database
```bash
POSTGRES_PASSWORD=<generate-with: openssl rand -base64 32>
```

#### Google AI
```bash
GOOGLE_API_KEY=<from: https://makersuite.google.com/app/apikey>
```

#### Zitadel Authentication
```bash
ZITADEL_DOMAIN=auth.yourdomain.com
ZITADEL_CLIENT_ID=<backend-client-id-from-zitadel>
ZITADEL_CLIENT_SECRET=<backend-client-secret-from-zitadel>
ZITADEL_MAIN_ORG_ID=<organization-id-from-zitadel>
```

#### Frontend Build Variables
```bash
VITE_API_URL=https://api.yourdomain.com
VITE_ZITADEL_ISSUER=https://auth.yourdomain.com
VITE_ZITADEL_CLIENT_ID=<frontend-client-id-from-zitadel>
```

#### CORS
```bash
CORS_ORIGIN=https://app.yourdomain.com
```

#### Zitadel Setup (first deployment only)
```bash
ZITADEL_ADMIN_PASSWORD=<generate-with: openssl rand -base64 32>
ZITADEL_MASTERKEY=<generate-with: openssl rand -hex 16>
```

#### Coolify Configuration
```bash
COOLIFY_APP_UUID=<get-from-coolify-ui>
COOLIFY_TOKEN=<generate-in-coolify: Settings → API Tokens>
COOLIFY_URL=https://coolify.yourdomain.com
```

### Step 2: Create Zitadel OAuth Clients

#### Backend API Client (JWT Profile)

1. In Zitadel UI: Organization → Applications → New
2. Type: **API**
3. Name: **Spec Server API**
4. Authentication Method: **JWT**
5. Generate and download the JWT key
6. Copy the `key` field content to `ZITADEL_CLIENT_SECRET`
7. Copy the client ID to `ZITADEL_CLIENT_ID`

#### Frontend Client (User Agent/PKCE)

1. In Zitadel UI: Organization → Applications → New
2. Type: **User Agent**
3. Name: **Spec Server Admin**
4. Authentication Method: **PKCE**
5. Redirect URIs: `https://app.yourdomain.com/*`
6. Post Logout URIs: `https://app.yourdomain.com`
7. Copy the client ID to `VITE_ZITADEL_CLIENT_ID`

### Step 3: Configure Coolify Application

#### Create Application

1. Log into Coolify UI
2. Navigate to your Project
3. Click **New Application**
4. Select **Docker Compose**
5. Name: **spec-server-2**

#### Connect Repository

1. Add Git repository URL
2. Select branch: **main** (or your default branch)
3. Configure deploy key or use existing credentials
4. Optional: Enable auto-deploy on push

#### Configure Build

1. Build context: **Repository root**
2. Compose file: **docker-compose.yml**
3. Enable BuildKit: **✅**
4. Build arguments: None (uses environment variables)

#### Configure Domains

Map services to domains:

| Service | Internal Port | Domain | SSL |
|---------|---------------|--------|-----|
| admin | 3000 | app.yourdomain.com | ✅ |
| server | 3002 | api.yourdomain.com | ✅ |
| zitadel | 8080 | auth.yourdomain.com | ✅ |

For each domain:
- Enable SSL/TLS (Let's Encrypt)
- Enable automatic renewal
- Force HTTPS redirect
- Enable HSTS (recommended)

#### Configure Volumes

Create persistent volumes:

| Volume | Purpose |
|--------|---------|
| postgres-data | Main database with pgvector |
| zitadel-db-data | Zitadel database |

#### Configure Resources (Optional)

Recommended limits:

| Service | CPU | Memory | Replicas |
|---------|-----|--------|----------|
| admin | 0.5 | 512MB | 1 |
| server | 1.0 | 1GB | 1 |
| db | 2.0 | 2GB | 1 |
| zitadel | 1.0 | 1GB | 1 |
| zitadel-db | 1.0 | 1GB | 1 |

### Step 4: Sync Environment Variables

Export Coolify credentials:

```bash
export COOLIFY_APP_UUID=<your-app-uuid>
export COOLIFY_TOKEN=<your-api-token>
export COOLIFY_URL=https://coolify.yourdomain.com
```

Sync variables:

```bash
./scripts/sync-coolify-env.sh .env.production preview
```

Verify in Coolify UI:
- Navigate to: Application → Environment Variables
- Check all required variables are present
- Verify sensitive variables are marked as secrets

### Step 5: Deploy

Run the deployment script:

```bash
./scripts/deploy-coolify.sh
```

This will:
1. Check Coolify authentication
2. Show current app status
3. Prompt for confirmation
4. Trigger deployment
5. Follow logs in real-time

Monitor the deployment:
- Services build in parallel
- Database migrations run automatically
- Zitadel initializes on first run
- Health checks verify services are ready

---

## 🧪 Post-Deployment Testing

### 1. Health Checks

```bash
# Server health
curl https://api.yourdomain.com/health
# Expected: {"status":"ok","timestamp":"...","database":"connected"}

# Admin health
curl https://app.yourdomain.com/health
# Expected: OK

# Zitadel health
curl https://auth.yourdomain.com/
# Expected: HTML page or redirect
```

### 2. Test Authentication Flow

1. Navigate to: `https://app.yourdomain.com`
2. Should redirect to Zitadel login
3. Login with admin credentials (from ZITADEL_ADMIN_USERNAME/PASSWORD)
4. Should redirect back to app
5. Verify authenticated state

### 3. Test API Endpoints

```bash
# Get auth token from browser (localStorage or cookies)
TOKEN="your-access-token"

# Test protected endpoint
curl -H "Authorization: Bearer $TOKEN" \
     https://api.yourdomain.com/api/...
```

### 4. Verify Database

```bash
# SSH into Coolify server or use Coolify CLI
coolify app exec <app-uuid> db -- psql -U spec -d spec -c "SELECT COUNT(*) FROM migrations"
```

---

## 📊 Monitoring

### View Logs

```bash
# Follow all logs
coolify app logs <app-uuid> --preview --follow

# View specific service
docker compose logs -f server

# Search for errors
coolify app logs <app-uuid> --preview | grep ERROR
```

### Check Service Status

```bash
# Coolify CLI
coolify app get <app-uuid>

# Docker Compose
docker compose ps

# Check health
curl https://api.yourdomain.com/health
```

### Monitor Resources

In Coolify UI:
- Navigate to: Application → Metrics
- View CPU, memory, network usage
- Set up alerts for resource limits

---

## 🐛 Troubleshooting

### Build Failures

**Symptom**: Docker build fails

**Solutions**:
```bash
# Check BuildKit is enabled
docker buildx version

# Test build locally
cd apps/server-nest && docker build .

# Check for syntax errors in Dockerfile
docker build --check .

# View full build log
coolify app logs <app-uuid> --preview | grep "Building"
```

### Service Won't Start

**Symptom**: Service shows as unhealthy or exited

**Solutions**:
```bash
# Check service logs
docker compose logs server --tail=100

# Check environment variables
docker compose exec server env | grep -E "POSTGRES|ZITADEL"

# Restart service
docker compose restart server
```

### Database Connection Failed

**Symptom**: Server logs show "ECONNREFUSED" or "connection refused"

**Solutions**:
```bash
# Check database is running
docker compose ps db

# Test database connection
docker compose exec db pg_isready -U spec

# Check credentials
docker compose exec server psql -h db -U spec -d spec -c "SELECT 1"

# Check migrations ran
docker compose exec db psql -U spec -d spec -c "SELECT * FROM migrations ORDER BY id DESC LIMIT 5"
```

### Zitadel Authentication Not Working

**Symptom**: Login redirects fail or token validation fails

**Solutions**:
1. Verify `ZITADEL_DOMAIN` matches actual domain
2. Check OAuth client configuration in Zitadel UI
3. Verify redirect URIs include your frontend domain
4. Check `ZITADEL_CLIENT_SECRET` is correct JWT key
5. Ensure `ZITADEL_MAIN_ORG_ID` matches your organization

### Frontend 404 Errors

**Symptom**: Frontend routes return 404

**Solutions**:
- Verify Nginx SPA routing is configured (already in Dockerfile)
- Check admin service logs for errors
- Test directly: `curl -I https://app.yourdomain.com/some/route`

### SSL Certificate Issues

**Symptom**: SSL warnings or certificate errors

**Solutions**:
1. Verify DNS is pointing to Coolify
2. Check Coolify proxy/Traefik configuration
3. Let's Encrypt may take a few minutes to provision
4. Check Coolify logs for certificate provisioning

---

## 🔄 Update & Redeploy

### Update Application Code

```bash
# 1. Make changes locally
git add .
git commit -m "Your changes"
git push origin main

# 2. Trigger redeployment
./scripts/deploy-coolify.sh

# Or use Coolify auto-deploy (if configured)
```

### Update Environment Variables

```bash
# 1. Edit .env.production
vim .env.production

# 2. Sync to Coolify
./scripts/sync-coolify-env.sh .env.production preview

# 3. Restart services (if needed)
coolify app restart <app-uuid> --preview
```

### Update Dependencies

```bash
# 1. Update package.json
npm update

# 2. Commit changes
git add package*.json
git commit -m "Update dependencies"
git push

# 3. Rebuild and deploy
./scripts/deploy-coolify.sh
```

---

## 🔐 Security Checklist

### Pre-Production

- [ ] Change all default passwords
- [ ] Use strong, unique passwords (32+ characters)
- [ ] Disable demo seed data (`ORGS_DEMO_SEED=false`)
- [ ] Set `NODE_ENV=production`
- [ ] Rotate Zitadel master key
- [ ] Enable Zitadel MFA for admin users
- [ ] Review CORS settings
- [ ] Enable HSTS on all domains
- [ ] Set up automated backups
- [ ] Configure log retention
- [ ] Review Zitadel security settings
- [ ] Set up monitoring alerts

### Ongoing

- [ ] Rotate secrets regularly
- [ ] Monitor access logs
- [ ] Keep dependencies updated
- [ ] Review and update SSL certificates
- [ ] Backup database regularly
- [ ] Test disaster recovery procedures

---

## 📚 Reference

### Service Ports

| Service | Internal Port | External Access |
|---------|---------------|-----------------|
| admin | 3000 | Via Coolify proxy |
| server | 3002 | Via Coolify proxy |
| db | 5432 | Internal only |
| zitadel | 8080 | Via Coolify proxy |
| zitadel-db | 5432 | Internal only |

### Environment Variables

See `.env.production.example` for complete list.

**Critical variables**:
- `POSTGRES_PASSWORD` - Database password
- `GOOGLE_API_KEY` - AI services
- `ZITADEL_CLIENT_SECRET` - Backend auth
- `ZITADEL_MASTERKEY` - Zitadel encryption

### Useful Commands

```bash
# Deployment
./scripts/deploy-coolify.sh

# Environment sync
./scripts/sync-coolify-env.sh .env.production preview

# Pre-flight checks
./scripts/preflight-check.sh

# Local testing
./scripts/test-docker-local.sh

# Coolify CLI
coolify app logs <uuid> --follow
coolify app restart <uuid>
coolify app get <uuid>

# Docker Compose
docker compose ps
docker compose logs -f
docker compose restart server
docker compose down -v
```

### Documentation

- Full plan: `docs/COOLIFY_DEPLOYMENT_PLAN.md`
- Local dev setup: `QUICK_START_DEV.md`
- Database setup: `SETUP.md`
- Operational guide: `RUNBOOK.md`
- Security scopes: `SECURITY_SCOPES.md`

---

## 🎯 Success Criteria

Deployment is successful when:

- [ ] All services show as "healthy" in Coolify
- [ ] Health endpoints return 200 OK
- [ ] Frontend loads and displays login screen
- [ ] Authentication flow works end-to-end
- [ ] API endpoints respond correctly
- [ ] Database migrations completed successfully
- [ ] SSL certificates active on all domains
- [ ] No errors in application logs
- [ ] Zitadel accessible and functional

---

## 📞 Getting Help

### Common Issues

1. **Build fails**: Check Dockerfile syntax, verify build context
2. **Services unhealthy**: Check logs, verify environment variables
3. **Auth not working**: Verify Zitadel configuration, check client IDs
4. **Database errors**: Check migrations, verify credentials
5. **SSL issues**: Wait for provisioning, check DNS configuration

### Resources

- Coolify Docs: https://coolify.io/docs
- Zitadel Docs: https://zitadel.com/docs
- Project Issues: Check `docs/fixes/` for known issues
- Docker Compose: https://docs.docker.com/compose/

---

## 🎉 You're Ready to Deploy!

All infrastructure is in place. Follow the **Quick Start** section above to deploy to Coolify.

**Next Steps**:
1. ✅ Configure `.env.production`
2. ✅ Run pre-flight checks
3. ✅ Sync environment variables
4. ✅ Deploy to Coolify
5. ✅ Test and verify

Good luck! 🚀

---

**Created**: October 31, 2025  
**Last Updated**: October 31, 2025  
**Status**: Ready for deployment
