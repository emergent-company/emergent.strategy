# Zitadel Upgrade Plan: v2.64.1 → v4.6.2

**Date:** November 3, 2025  
**Current Version:** v2.64.1 (ghcr.io/zitadel/zitadel:latest)  
**Target Version:** v4.6.2 (latest stable)  
**Reason:** Resolve GitHub issue #7948 (storage projection bug causing introspection 500 errors)

## Executive Summary

We're experiencing Zitadel introspection 500 errors due to a known storage projection bug (GitHub issue #7948) affecting all v2.x versions from v2.51.0 onward. While production authentication works perfectly via JWKS fallback (zero user impact), upgrading to **v4.6.2** will:

1. **Eliminate the bug permanently** - v4.6.2 includes fix "projection: locking behavior based on configuration" (#11014) released Oct 31, 2025 (3 days ago)
2. **Upgrade Management API from v1 → v2** - Current code uses v1 endpoints that are deprecated but functional
3. **Future-proof authentication infrastructure** - Stay current with security patches and features

**Recommended Path:** v2.64.1 → v4.6.2 (skip v3.x, directly to latest)

---

## Current State Assessment

### What's Working ✅
- **Production authentication:** 100% functional via JWKS fallback
- **User login/registration:** No issues reported
- **Service account token flow:** Working (service account JWT → access token)
- **Frontend OAuth2/OIDC:** No changes required (standard protocol compliance)
- **Deployment:** Coolify + Docker, Traefik reverse proxy

### What's Broken 🔴
- **Introspection endpoint:** Returns 500 errors every ~10 seconds
- **Error:** "invalid signature (error fetching keys: ID=QUERY-Tha6f Message=Errors.AuthNKey.NotFound Parent=(sql: no rows in result set))"
- **Impact:** Cosmetic (logs pollution only), zero functional impact
- **Root Cause:** Storage projection bug where queries fail despite data existing in database

### Current Zitadel Usage
Our `ZitadelService` uses **Management API v1** for:
1. **User management:**
   - `/management/v1/users/human/_import` (create users)
   - `/management/v1/users/_search` (search users by email)
2. **User metadata:**
   - `/management/v1/users/${userId}/metadata` (set custom metadata)
3. **Password management:**
   - `/management/v1/users/${userId}/password/_set` (set user password)
4. **Role grants:**
   - `/management/v1/users/${userId}/grants` (grant project roles)
   - `/management/v1/users/${userId}/grants/_search` (search user grants)
5. **Token introspection:**
   - `/oauth/v2/introspect` (validate access tokens) - **No changes needed**

---

## Version Comparison

| Version | Released | Status | Projection Fix | API v2 Status | Notes |
|---------|----------|--------|---------------|---------------|-------|
| v2.64.1 | Nov 3, 2025 | Current | ❌ No | v1 only | Bug present |
| v2.71.18 | Oct 29, 2025 | Latest v2.x | ❌ No | v1 only | Bug still present |
| v3.4.3 | Oct 29, 2025 | Latest v3.x | ❌ No | v2 Beta | No fix mentioned |
| **v4.6.2** | **Oct 31, 2025** | **Latest v4.x** | ✅ **Yes** (#11014) | v2 GA | **RECOMMENDED** |

### Why Skip v3.x?
- v3.x doesn't fix the projection bug
- v4.x is more actively developed (v4.6.2 just 3 days old)
- v4.x has stable API v2 (GA) instead of v2beta
- No intermediate upgrade effort wasted

---

## Breaking Changes Analysis

### 1. License Change (v3.0.0)
**Impact:** ⚠️ **Review Required**
- v2.x: Apache 2.0
- v3.x+: AGPL3

**Action:**
- Review AGPL3 terms: https://www.gnu.org/licenses/agpl-3.0.en.html
- Confirm compliance with our self-hosted deployment model
- If modifications needed, evaluate implications

### 2. CockroachDB Support Removed (v3.0.0)
**Impact:** ✅ No Impact (we use PostgreSQL 16)

### 3. API Architecture Changes (v4.0.0)

#### Management API v1 → v2 Migration Required
**Impact:** 🟡 **Code Changes Needed**

**v1 Approach (Current):**
- REST/HTTP endpoints under `/management/v1/`
- Contextual header: `x-zitadel-orgid`
- Use-case based (Auth API, Management API, Admin API)

**v2 Approach (Target):**
- gRPC with Connect RPC (HTTP/1.1 compatible)
- Contextual data in request body: `organization_id`
- Resource-based (Users API, Projects API, etc.)

**Migration Required For:**

| Current v1 Endpoint | v2 Equivalent | Breaking Change |
|---------------------|---------------|-----------------|
| `POST /management/v1/users/human/_import` | `POST /v2/users/human` (Connect RPC) | ✅ Endpoint path + protocol |
| `POST /management/v1/users/_search` | `POST /v2/users/_search` (Connect RPC) | ✅ Endpoint path + protocol |
| `POST /management/v1/users/{id}/metadata` | `POST /v2/users/{id}/metadata` (Connect RPC) | ✅ Endpoint path + protocol |
| `POST /management/v1/users/{id}/password/_set` | `POST /v2/users/{id}/password/set` (Connect RPC) | ✅ Endpoint path + protocol |
| `POST /management/v1/users/{id}/grants` | `POST /v2/users/{id}/grants` (Connect RPC) | ✅ Endpoint path + protocol |
| `POST /management/v1/users/{id}/grants/_search` | `POST /v2/users/{id}/grants/_search` (Connect RPC) | ✅ Endpoint path + protocol |

**Key Changes:**
1. **Protocol:** HTTP REST → gRPC/Connect RPC
2. **Context:** Header (`x-zitadel-orgid`) → Request body (`organization_id`)
3. **Client Library:** Need to use generated gRPC/Connect clients or write HTTP/JSON calls to Connect RPC endpoints
4. **User Creation:** Unified endpoint (`CreateUser`) instead of type-specific (`AddHumanUser`)
5. **User States:** No more "initial" state, all new users are `active` by default

### 4. OAuth2/OIDC Endpoints (No Changes)
**Impact:** ✅ No Changes Required
- `/oauth/v2/authorize` - unchanged
- `/oauth/v2/token` - unchanged
- `/oauth/v2/introspect` - unchanged (but will stop failing after upgrade!)
- Service account JWT flow - unchanged
- Frontend authentication - unchanged

### 5. Login UI (v4.0.0)
**Impact:** ✅ No Impact
- Login V2 becomes default for new customers
- Existing instances continue using configured login UI
- No forced migration

---

## Upgrade Strategy

### Phase 1: Pre-Upgrade (1-2 hours)

#### 1.1 Backup Current State
```bash
# SSH to production
ssh root@kucharz.net

# Backup Zitadel database
docker exec -i postgres-zitadel pg_dump -U zitadel -d zitadel > /tmp/zitadel_backup_$(date +%Y%m%d_%H%M%S).sql

# Copy backup to local machine
scp root@kucharz.net:/tmp/zitadel_backup_*.sql ~/backups/
```

#### 1.2 Document Current Configuration
```bash
# Save current environment variables
docker exec zitadel env | grep ZITADEL_ > zitadel_env_backup.txt

# Save current docker-compose.yml or Coolify config
# (Coolify stores in database, access via UI: Project → Environment Variables)
```

#### 1.3 Test v4.6.2 Locally (Docker Compose)

Create `docker-compose.upgrade-test.yml`:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: zitadel
      POSTGRES_PASSWORD: zitadel
      POSTGRES_DB: zitadel
    volumes:
      - postgres_data:/var/lib/postgresql/data

  zitadel:
    image: ghcr.io/zitadel/zitadel:v4.6.2
    command: 'start-from-init --masterkeyFromEnv --tlsMode external'
    environment:
      ZITADEL_DATABASE_POSTGRES_HOST: postgres
      ZITADEL_DATABASE_POSTGRES_PORT: 5432
      ZITADEL_DATABASE_POSTGRES_DATABASE: zitadel
      ZITADEL_DATABASE_POSTGRES_USER_USERNAME: zitadel
      ZITADEL_DATABASE_POSTGRES_USER_PASSWORD: zitadel
      ZITADEL_DATABASE_POSTGRES_USER_SSL_MODE: disable
      ZITADEL_DATABASE_POSTGRES_ADMIN_USERNAME: zitadel
      ZITADEL_DATABASE_POSTGRES_ADMIN_PASSWORD: zitadel
      ZITADEL_DATABASE_POSTGRES_ADMIN_SSL_MODE: disable
      ZITADEL_MASTERKEY: "MasterkeyNeedsToHave32Characters"
      ZITADEL_EXTERNALDOMAIN: localhost
      ZITADEL_EXTERNALPORT: 8080
      ZITADEL_EXTERNALSECURE: false
    ports:
      - "8080:8080"
    depends_on:
      - postgres

volumes:
  postgres_data:
```

Test startup and migrations:
```bash
docker-compose -f docker-compose.upgrade-test.yml up -d
docker-compose -f docker-compose.upgrade-test.yml logs -f zitadel
```

Verify:
- Container starts successfully
- Migrations run without errors
- Health check passes: `curl http://localhost:8080/debug/healthz`
- Console accessible: http://localhost:8080/ui/console

#### 1.4 Test Management API v1 Compatibility
Even though v1 is deprecated, it should still work in v4.6.2:

```bash
# Test user search (v1 endpoint)
curl -X POST 'http://localhost:8080/management/v1/users/_search' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -d '{
    "queries": [{
      "emailQuery": {
        "emailAddress": "test@example.com",
        "method": "TEXT_QUERY_METHOD_EQUALS"
      }
    }]
  }'
```

Expected: Should work (deprecated but functional)

### Phase 2: Code Migration (4-6 hours)

We have two options for API migration:

#### Option A: Continue Using v1 API (Deprecated but Functional)
**Pros:**
- No code changes needed immediately
- Quick upgrade path
- Zero downtime

**Cons:**
- v1 endpoints deprecated, may be removed in future versions
- Missing new v2 features
- Technical debt accumulates

**Recommendation:** Only if time-constrained and need immediate bug fix

#### Option B: Migrate to v2 API (Recommended)
**Pros:**
- Future-proof (v2 is GA, v1 deprecated)
- Access to new features
- Better performance (gRPC)
- Official migration path

**Cons:**
- Requires code changes
- Need to test thoroughly

**Implementation Path:**

##### Option B1: Connect RPC with HTTP/JSON (Easier)
Use Connect RPC protocol with HTTP/1.1 and JSON (no gRPC knowledge required):

```typescript
// Before (v1 REST)
const apiUrl = `https://${process.env.ZITADEL_DOMAIN}/management/v1/users/human/_import`;
const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-zitadel-orgid': organizationId, // ← Header
    },
    body: JSON.stringify({
        userName: email,
        email: { email, isEmailVerified: false },
        profile: { firstName, lastName },
        password: { password }
    })
});

// After (v2 Connect RPC)
const apiUrl = `https://${process.env.ZITADEL_DOMAIN}/zitadel.user.v2.UserService/AddHumanUser`;
const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        organization_id: organizationId, // ← Body
        user_name: email,
        email: { email, is_verified: false },
        profile: { given_name: firstName, family_name: lastName },
        password: { password }
    })
});
```

##### Option B2: gRPC Client (Optimal Performance)
Install and use official gRPC client:

```bash
npm install @connectrpc/connect @connectrpc/connect-node
npm install @zitadel/proto --save-dev
```

```typescript
import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { UserService } from "@zitadel/proto/zitadel/user/v2/user_service_pb";

const transport = createConnectTransport({
    baseUrl: `https://${process.env.ZITADEL_DOMAIN}`,
    httpVersion: "2",
});

const client = createPromiseClient(UserService, transport);

// Usage
const response = await client.addHumanUser({
    organizationId,
    userName: email,
    email: { email, isVerified: false },
    profile: { givenName: firstName, familyName: lastName },
    password: { password }
});
```

**Recommended:** Start with **Option B1** (Connect RPC with HTTP/JSON) for easier migration, then optimize to B2 if needed.

### Phase 3: Testing (2-3 hours)

#### 3.1 Local Testing
- Start upgraded Zitadel v4.6.2 locally
- Test all ZitadelService methods:
  - `createUser()` - create test user
  - `searchUsers()` - search by email
  - `setUserMetadata()` - set custom fields
  - `setPassword()` - change password
  - `grantProjectRole()` - assign roles
  - `introspect()` - validate token (should stop returning 500!)

#### 3.2 Integration Testing
- Run server-nest test suite: `nx run server-nest:test`
- Run server-nest E2E suite: `nx run server-nest:test-e2e`
- Verify no authentication-related failures

#### 3.3 Admin E2E Testing
- Start test environment with v4.6.2
- Run admin Playwright suite: `E2E_FORCE_TOKEN=1 nx run admin:e2e`
- Verify login flow works end-to-end

### Phase 4: Staging Deployment (1 hour)

If you have a staging environment:
1. Deploy v4.6.2 to staging
2. Run full test suite
3. Monitor logs for errors
4. Test user registration/login flows manually

**Rollback Plan for Staging:**
```bash
# Revert to v2.64.1 image
docker pull ghcr.io/zitadel/zitadel:v2.64.1
# Update Coolify config to use v2.64.1
# Restart Zitadel container
```

### Phase 5: Production Deployment (30 minutes + monitoring)

#### 5.1 Schedule Maintenance Window
- **Recommended:** Off-peak hours (2-4 AM local time)
- **Estimated Downtime:** 5-10 minutes (container restart + migrations)
- **Notify Users:** If applicable (internal tool may not need notification)

#### 5.2 Deployment Steps
```bash
# 1. SSH to production
ssh root@kucharz.net

# 2. Navigate to project directory (or use Coolify UI)
cd /path/to/project

# 3. Update image tag in docker-compose.yml or Coolify config
# FROM: ghcr.io/zitadel/zitadel:latest (or v2.64.1)
# TO:   ghcr.io/zitadel/zitadel:v4.6.2

# 4. Pull new image
docker pull ghcr.io/zitadel/zitadel:v4.6.2

# 5. Stop current container (via Coolify UI or docker-compose)
docker-compose stop zitadel

# 6. Start new container
docker-compose up -d zitadel

# 7. Monitor startup logs
docker-compose logs -f zitadel
```

#### 5.3 Monitor Migrations
Watch for migration log messages:
```
level=info msg="running migration steps"
level=info msg="migration step completed" step="49.01 permitted orgs function"
level=info msg="all migrations completed successfully"
```

Expected migration time: 1-3 minutes (depending on data size)

#### 5.4 Health Checks
```bash
# 1. Container running
docker ps | grep zitadel

# 2. Health endpoint
curl https://spec-zitadel.kucharz.net/debug/healthz

# 3. Introspection endpoint (should now work!)
# Use test-zitadel-introspection-bearer.mjs script from investigation
node test-zitadel-introspection-bearer.mjs

# Expected: 200 OK instead of 500 error
```

#### 5.5 Verify Authentication
```bash
# Test user login via frontend
# Navigate to: https://spec-admin.kucharz.net
# Login with existing user (maciej@kucharz.net)
# Verify successful authentication
```

#### 5.6 Monitor Logs
```bash
# Watch for any errors
docker-compose logs -f zitadel | grep -i error

# Watch for introspection requests (should be 200 now)
docker-compose logs -f zitadel | grep -i introspect
```

### Phase 6: Post-Upgrade Validation (1 hour)

#### 6.1 Verify Projection Fix
The introspection 500 errors should be **completely gone**:

```bash
# Before upgrade: Every 10 seconds
# 2025-11-03T17:02:09.123Z ERROR Errors.AuthNKey.NotFound

# After upgrade: Clean logs
# (no introspection errors)
```

#### 6.2 Test All Authentication Flows
- [ ] User registration (new user)
- [ ] User login (existing user)
- [ ] Password reset
- [ ] JWT token validation
- [ ] Role-based access control
- [ ] Metadata retrieval

#### 6.3 Monitor Performance
Watch for any performance degradation:
- Login response times
- Token introspection latency
- Overall page load times

#### 6.4 Check Error Logs
```bash
# Admin backend logs
nx run workspace-cli:workspace:logs -- --service=server

# Zitadel logs
docker-compose logs zitadel --tail=1000 | grep -i error
```

---

## Rollback Plan

If critical issues arise during upgrade:

### Immediate Rollback (< 5 minutes)
```bash
# SSH to production
ssh root@kucharz.net

# Stop current container
docker-compose stop zitadel

# Update config to use v2.64.1
docker-compose up -d zitadel

# Verify health
curl https://spec-zitadel.kucharz.net/debug/healthz
```

**Note:** Database schema changes from v4.6.2 migrations are forward-compatible. Rolling back to v2.64.1 should work (Zitadel designs for this), but test in local environment first.

### Database Rollback (if needed)
```bash
# Restore from backup
docker exec -i postgres-zitadel psql -U zitadel -d zitadel < /tmp/zitadel_backup_TIMESTAMP.sql
```

---

## Migration Effort Estimate

| Phase | Time Estimate | Complexity |
|-------|---------------|------------|
| Pre-Upgrade (backup, testing) | 1-2 hours | Low |
| Code Migration (if doing v2 API) | 4-6 hours | Medium |
| Testing (local, integration) | 2-3 hours | Medium |
| Staging Deployment | 1 hour | Low |
| Production Deployment | 30 minutes | Low |
| Post-Upgrade Validation | 1 hour | Low |
| **Total** | **9-13.5 hours** | **Medium** |

**If skipping code migration (stay on v1):** ~5-7 hours total

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration failures | Low | High | Comprehensive backups, tested locally first |
| API v1 incompatibility | Low | Medium | v1 still functional (deprecated), can stay on v1 short-term |
| User authentication breaks | Very Low | Critical | JWKS fallback already proven, OAuth2 endpoints unchanged |
| Downtime exceeds window | Low | Medium | Rollback plan ready, migrations typically fast |
| AGPL3 license issues | Low | Medium | Review terms beforehand, modification unlikely |
| New bugs in v4.6.2 | Very Low | Medium | Recent release (3 days old), stable v4.x branch |

**Overall Risk Level:** 🟡 **Low-Medium** (with proper testing and backups)

---

## Decision Matrix

| Scenario | Recommendation | Timeline |
|----------|----------------|----------|
| **Need bug fix immediately** | Upgrade to v4.6.2, stay on v1 API | This week |
| **Want future-proof solution** | Upgrade to v4.6.2, migrate to v2 API | Within 2 weeks |
| **Risk-averse, production critical** | Test thoroughly in staging first | Within 1 month |
| **Can tolerate log noise** | Continue monitoring, defer upgrade | Defer indefinitely |

**Our Recommendation:** **Upgrade to v4.6.2 this week, stay on v1 API short-term, migrate to v2 API in next sprint** (phased approach minimizes risk).

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Test v4.6.2 locally** using Docker Compose (Phase 1.3)
3. **Decide on API migration strategy:**
   - Option A: Stay on v1 (quick path)
   - Option B: Migrate to v2 (recommended long-term)
4. **Schedule maintenance window** if needed
5. **Execute upgrade** following Phase 5 steps
6. **Monitor production** closely for 24-48 hours post-upgrade

---

## References

- **Zitadel v4.0.0 Release Notes:** https://github.com/zitadel/zitadel/releases/tag/v4.0.0
- **Zitadel v3.0.0 Release Notes:** https://github.com/zitadel/zitadel/releases/tag/v3.0.0
- **API v1 → v2 Migration Guide:** https://zitadel.com/docs/apis/migration_v1_to_v2
- **API v2 Documentation:** https://zitadel.com/docs/apis/v2
- **GitHub Issue #7948 (projection bug):** https://github.com/zitadel/zitadel/issues/7948
- **GitHub PR #11014 (projection fix):** https://github.com/zitadel/zitadel/pull/11014
- **Connect RPC Documentation:** https://connectrpc.com/
- **AGPL3 License:** https://www.gnu.org/licenses/agpl-3.0.en.html

---

## Contact & Support

- **Zitadel Chat:** https://zitadel.com/chat (Discord)
- **GitHub Discussions:** https://github.com/zitadel/zitadel/discussions
- **Documentation:** https://zitadel.com/docs
- **Status Page:** https://zitadelstatus.com/

---

**Document Version:** 1.0  
**Last Updated:** November 3, 2025  
**Author:** AI Assistant (based on investigation findings)
