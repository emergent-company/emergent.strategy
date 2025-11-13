# Zitadel Dual Service Account Migration Plan

**Date:** November 6, 2025  
**Status:** Planning  
**Goal:** Migrate from single service account to dual service account architecture for better security and separation of concerns

---

## Executive Summary

Based on research into Zitadel APIs and the proven pattern from `huma-blueprints-api` project, we will implement a **dual service account architecture**:

- **ZITADEL_CLIENT_JWT** - For token introspection (verifying frontend user tokens)
- **ZITADEL_API_JWT** - For Management API (creating/managing users, roles, grants)

**Current Issue:** Single service account used for both purposes, violating separation of concerns principle.

**Expected Outcome:** 
- Improved security through minimal permissions per account
- Better audit trail (separate accounts for different operations)
- Alignment with Zitadel best practices
- Fix for introspection 500 errors

---

## Background Research

### Zitadel API Capabilities Confirmed ✅

Research via Context7 documentation confirmed Zitadel fully supports programmatic setup:

1. **User Management APIs**:
   - Create human users: `POST /management/v1/users/human`
   - Create machine users: `POST /management/v1/users/machine`
   - Import users with password hashes: `POST /management/v1/users/human/_import`

2. **Application Management APIs**:
   - Create OIDC apps: `POST /management/v1/projects/:projectId/apps/oidc`
   - Create API apps: `POST /management/v1/projects/:projectId/apps/api`
   - Generate client secrets programmatically

3. **Key Management APIs**:
   - Generate service account keys: `POST /management/v1/users/:userId/keys`
   - Set expiration dates
   - Support for JWT and Bearer tokens

4. **Organization Management APIs**:
   - Setup complete organizations: `POST /admin/v1/orgs/_setup`
   - Create projects and grants
   - Manage roles and permissions

5. **SDK Support**:
   - Go SDK: `github.com/zitadel/zitadel-go/v3`
   - C# SDK available
   - Python SDK available

### Reference Implementation: huma-blueprints-api

Located at `/Users/mcj/code/huma/huma-blueprints-api`, this project implements the exact pattern we need:

**Configuration Structure** (`config/config.go`):
```go
type Zitadel struct {
    ClientJWT          string  // For introspection
    ClientJWTPath      string  // File path alternative
    APIJWT             string  // For Management API
    APIJWTPath         string  // File path alternative
    Domain             string
    MainOrgID          string
    MainProjectID      string
    IntrospectCacheTTL time.Duration
    RetryMax           uint
}
```

**Key Features**:
- Dual-layer caching (Redis + Ristretto in-memory)
- GRPC retry interceptors (configurable max retries)
- Mutex-protected lazy initialization
- Flexible config (inline JWT or file path)
- Proper error handling and wrapping

**Files to Review**:
- `pkg/auth/client.go` - Zitadel client creation
- `pkg/auth/auth.go` - Service user authentication
- `internal/clients/service.go` - Service clients integration
- `docker-compose.yml` - Environment variable configuration

---

## Current State Analysis

### Production Service Accounts

**OLD Service Account** (created Nov 3, 2024):
- File: `/home/spec-server/zitadel-service-account.json`
- keyId: `345194524361885700`
- clientId: `345047809973618692`
- appId: `345047809973553156`
- Status: Currently in use (has all required fields)
- Issue: Used for BOTH introspection AND Management API

**NEW Service Account "spec-backend"** (created Nov 4, 2024):
- User ID: `345192839140870148`
- Type: 2 (machine user)
- Key ID: `345192914973886468`
- Access Token Type: 1 (JWT)
- Status: Created in database but NOT configured on server

### Current Implementation Issues

**File: `apps/server/src/modules/auth/strategies/zitadel.strategy.ts`**
- Uses single `ZITADEL_CLIENT_JWT_PATH`
- Loads service account for introspection

**File: `apps/server/src/modules/auth/zitadel.service.ts`**
- Uses SAME service account for Management API
- Functions: `createUser()`, `updateUserMetadata()`, `getAccessToken()`, etc.

**Problem**: One service account with broad permissions violates least-privilege principle.

---

## Migration Plan

### Phase 1: Service Account Provisioning (Automated Script)

**Goal:** Create two service accounts via Zitadel Management API

**Script:** `scripts/setup-zitadel-service-accounts.sh`

```bash
#!/bin/bash
# Setup dual service accounts for Zitadel

set -e

ZITADEL_DOMAIN="${ZITADEL_DOMAIN:-your-domain.com}"
ADMIN_TOKEN="${ZITADEL_ADMIN_TOKEN}"
PROJECT_ID="${ZITADEL_PROJECT_ID}"
ORG_ID="${ZITADEL_ORG_ID}"

echo "🚀 Creating Zitadel service accounts..."

# 1. Create introspection service account
echo "📝 Creating introspection service account..."
INTROSPECTION_USER=$(curl -s -X POST \
  "https://${ZITADEL_DOMAIN}/management/v1/users/machine" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "userName": "introspection-service",
    "name": "Token Introspection Service",
    "description": "For verifying frontend user access tokens",
    "accessTokenType": "ACCESS_TOKEN_TYPE_JWT"
  }')

INTROSPECTION_USER_ID=$(echo "$INTROSPECTION_USER" | jq -r '.userId')
echo "✅ Introspection service created: ${INTROSPECTION_USER_ID}"

# 2. Create Management API service account
echo "📝 Creating Management API service account..."
API_USER=$(curl -s -X POST \
  "https://${ZITADEL_DOMAIN}/management/v1/users/machine" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "userName": "management-api-service",
    "name": "Management API Service",
    "description": "For creating and managing users, roles, and grants",
    "accessTokenType": "ACCESS_TOKEN_TYPE_JWT"
  }')

API_USER_ID=$(echo "$API_USER" | jq -r '.userId')
echo "✅ Management API service created: ${API_USER_ID}"

# 3. Generate keys for both accounts
echo "🔑 Generating service account keys..."
INTROSPECTION_KEY=$(curl -s -X POST \
  "https://${ZITADEL_DOMAIN}/management/v1/users/${INTROSPECTION_USER_ID}/keys" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "KEY_TYPE_JSON",
    "expirationDate": "2026-12-31T23:59:59Z"
  }')

API_KEY=$(curl -s -X POST \
  "https://${ZITADEL_DOMAIN}/management/v1/users/${API_USER_ID}/keys" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "KEY_TYPE_JSON",
    "expirationDate": "2026-12-31T23:59:59Z"
  }')

# 4. Save keys to files
echo "$INTROSPECTION_KEY" | jq '.' > zitadel-client-service-account.json
echo "$API_KEY" | jq '.' > zitadel-api-service-account.json

echo "✅ Keys saved to:"
echo "   - zitadel-client-service-account.json (for introspection)"
echo "   - zitadel-api-service-account.json (for Management API)"

# 5. Grant appropriate permissions
echo "🔐 Granting permissions..."

# Grant introspection account token verification scope
curl -s -X POST \
  "https://${ZITADEL_DOMAIN}/management/v1/users/${INTROSPECTION_USER_ID}/grants" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": \"${PROJECT_ID}\",
    \"roleKeys\": [\"TOKEN_VERIFIER\"]
  }"

# Grant Management API account user management scopes
curl -s -X POST \
  "https://${ZITADEL_DOMAIN}/management/v1/users/${API_USER_ID}/grants" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": \"${PROJECT_ID}\",
    \"roleKeys\": [\"ORG_USER_MANAGER\", \"PROJECT_GRANT_MANAGER\"]
  }"

echo "✅ Permissions granted"
echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Copy service account files to server:"
echo "   scp zitadel-client-service-account.json root@kucharz.net:/home/spec-server/"
echo "   scp zitadel-api-service-account.json root@kucharz.net:/home/spec-server/"
echo ""
echo "2. Update environment variables:"
echo "   ZITADEL_CLIENT_JWT_PATH=/home/spec-server/zitadel-client-service-account.json"
echo "   ZITADEL_API_JWT_PATH=/home/spec-server/zitadel-api-service-account.json"
echo ""
echo "3. Restart server container"
```

**Dependencies:**
- `jq` for JSON parsing
- `curl` for API calls
- Admin token with permission to create users and grants

**Time Estimate:** 30 minutes to develop and test

---

### Phase 2: NestJS Backend Refactoring

**Goal:** Update server to use two separate service accounts

#### 2.1 Configuration Updates

**File:** `apps/server/src/modules/auth/auth.config.ts` (create new)

```typescript
export interface ZitadelConfig {
  domain: string;
  mainOrgId: string;
  mainProjectId: string;
  
  // For introspection
  clientJwt?: string;
  clientJwtPath?: string;
  
  // For Management API
  apiJwt?: string;
  apiJwtPath?: string;
  
  introspectCacheTtl: number; // milliseconds
  retryMax: number;
}
```

**File:** `apps/server/.env` or `docker/.env`

```bash
# Zitadel Configuration
ZITADEL_DOMAIN=auth.yourdomain.com
ZITADEL_MAIN_ORG_ID=your-org-id
ZITADEL_MAIN_PROJECT_ID=your-project-id

# Introspection Service Account (for verifying tokens)
ZITADEL_CLIENT_JWT_PATH=/home/spec-server/zitadel-client-service-account.json

# Management API Service Account (for creating/managing users)
ZITADEL_API_JWT_PATH=/home/spec-server/zitadel-api-service-account.json

# Optional: Inline JWTs instead of file paths
# ZITADEL_CLIENT_JWT={"type":"serviceaccount",...}
# ZITADEL_API_JWT={"type":"serviceaccount",...}

# Caching and Retry
ZITADEL_INTROSPECT_CACHE_TTL=300000  # 5 minutes in ms
ZITADEL_RETRY_MAX=5
```

#### 2.2 Strategy Updates (Introspection)

**File:** `apps/server/src/modules/auth/strategies/zitadel.strategy.ts`

**Changes:**
- Load service account from `ZITADEL_CLIENT_JWT_PATH` (no change)
- Keep existing introspection logic
- Add better error handling

```typescript
constructor() {
  const clientJwtPath = process.env.ZITADEL_CLIENT_JWT_PATH;
  const clientJwt = process.env.ZITADEL_CLIENT_JWT;
  
  if (!clientJwtPath && !clientJwt) {
    throw new Error('Either ZITADEL_CLIENT_JWT_PATH or ZITADEL_CLIENT_JWT must be set');
  }
  
  let fileContent: string;
  if (clientJwt) {
    fileContent = clientJwt;
  } else {
    fileContent = fs.readFileSync(clientJwtPath, 'utf8');
  }
  
  serviceAccountKey = JSON.parse(fileContent);
  
  if (!serviceAccountKey.keyId || !serviceAccountKey.key || !serviceAccountKey.clientId) {
    throw new Error('Service account key must contain keyId, key, and clientId');
  }
  
  this.logger.log('Loaded CLIENT service account for introspection');
}
```

#### 2.3 Service Updates (Management API)

**File:** `apps/server/src/modules/auth/zitadel.service.ts`

**Changes:**
- Add new method to load API service account
- Update `getAccessToken()` to use API JWT
- Keep all other methods unchanged

```typescript
export class ZitadelService {
  private readonly logger = new Logger(ZitadelService.name);
  private apiServiceAccountKey: any;
  
  constructor() {
    this.loadApiServiceAccount();
  }
  
  private loadApiServiceAccount() {
    const apiJwtPath = process.env.ZITADEL_API_JWT_PATH;
    const apiJwt = process.env.ZITADEL_API_JWT;
    
    if (!apiJwtPath && !apiJwt) {
      throw new Error('Either ZITADEL_API_JWT_PATH or ZITADEL_API_JWT must be set');
    }
    
    let fileContent: string;
    if (apiJwt) {
      fileContent = apiJwt;
    } else {
      fileContent = fs.readFileSync(apiJwtPath, 'utf8');
    }
    
    this.apiServiceAccountKey = JSON.parse(fileContent);
    
    if (!this.apiServiceAccountKey.keyId || 
        !this.apiServiceAccountKey.key || 
        !this.apiServiceAccountKey.clientId) {
      throw new Error('API service account key must contain keyId, key, and clientId');
    }
    
    this.logger.log('Loaded API service account for Management API');
  }
  
  async getAccessToken(): Promise<string> {
    // Use API service account instead of CLIENT service account
    const jwt = this.generateJWT(this.apiServiceAccountKey);
    // ... rest of implementation unchanged
  }
  
  // All other methods remain the same:
  // createUser(), updateUserMetadata(), getUserByEmail(), etc.
}
```

**Time Estimate:** 2-3 hours for implementation and testing

---

### Phase 3: Docker Configuration Updates

**File:** `docker-compose.yml` (production)

```yaml
services:
  server:
    environment:
      # Add new environment variables
      ZITADEL_CLIENT_JWT_PATH: /home/spec-server/zitadel-client-service-account.json
      ZITADEL_API_JWT_PATH: /home/spec-server/zitadel-api-service-account.json
      ZITADEL_INTROSPECT_CACHE_TTL: 300000
      ZITADEL_RETRY_MAX: 5
    volumes:
      # Mount both service account files
      - /home/spec-server/zitadel-client-service-account.json:/home/spec-server/zitadel-client-service-account.json:ro
      - /home/spec-server/zitadel-api-service-account.json:/home/spec-server/zitadel-api-service-account.json:ro
```

**File:** `docker/.env`

Update to include new environment variables.

**Time Estimate:** 30 minutes

---

### Phase 4: Testing & Validation

#### 4.1 Local Testing

**Prerequisites:**
- Both service account JSON files generated
- Environment variables configured
- Server built with new code

**Test Cases:**

1. **Test Introspection** (CLIENT JWT):
```bash
# Get a valid user token from frontend
curl -X POST http://localhost:3001/api/documents \
  -H "Authorization: Bearer <valid-user-token>" \
  -H "Content-Type: application/json"

# Expected: Should work, using CLIENT service account for introspection
```

2. **Test User Creation** (API JWT):
```bash
# Create a new user via API
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com", "password":"Test123!"}'

# Expected: Should work, using API service account for Management API
```

3. **Test Metadata Updates** (API JWT):
```bash
# Update user metadata
curl -X PUT http://localhost:3001/api/users/metadata \
  -H "Authorization: Bearer <valid-user-token>" \
  -H "Content-Type: application/json" \
  -d '{"key":"value"}'

# Expected: Should work, using API service account
```

4. **Monitor Logs**:
```bash
# Check for proper service account loading
docker logs server-container 2>&1 | grep "service account"

# Expected logs:
# "Loaded CLIENT service account for introspection"
# "Loaded API service account for Management API"
```

#### 4.2 Production Deployment Checklist

- [ ] Backup current service account file
- [ ] Generate new service accounts via script
- [ ] Upload both service account files to server
- [ ] Update environment variables in Coolify/docker-compose
- [ ] Deploy new server version
- [ ] Monitor logs for 30 minutes
- [ ] Verify zero introspection 500 errors
- [ ] Test user registration flow
- [ ] Test user authentication flow
- [ ] Test metadata updates
- [ ] Check Zitadel console for API calls from correct accounts

**Time Estimate:** 1-2 hours for deployment and monitoring

---

### Phase 5: Cleanup & Documentation

#### 5.1 Remove Old Service Account

After confirming new setup works for 48 hours:

1. Revoke old service account key in Zitadel console
2. Delete old service account user
3. Remove old JSON file from server

#### 5.2 Update Documentation

Files to update:
- `docs/AUTHENTICATION.md` - Document new dual service account pattern
- `RUNBOOK.md` - Add service account management procedures
- `.env.example` - Include new environment variables
- `README.md` - Update setup instructions

#### 5.3 Create Monitoring Alerts

Add alerts for:
- Service account authentication failures
- Introspection errors
- Management API rate limits
- Service account key expiration (warning 30 days before)

**Time Estimate:** 2 hours

---

## Permission Matrix

### Introspection Service Account (`introspection-service`)

**Purpose:** Verify access tokens from frontend users

**Required Scopes:**
- Token introspection endpoint access
- Read token claims

**Forbidden Operations:**
- Cannot create users
- Cannot modify users
- Cannot assign roles/grants
- Cannot access Management API

### Management API Service Account (`management-api-service`)

**Purpose:** Create and manage users, roles, grants

**Required Scopes:**
- `urn:zitadel:iam:org:project:id:zitadel:aud` - Access Zitadel APIs
- User management (create, update, delete)
- Metadata management
- Grant management
- Role assignment

**Forbidden Operations:**
- Cannot verify tokens (no introspection access)

---

## Rollback Plan

If issues arise during deployment:

### Immediate Rollback (< 5 minutes)

1. Revert environment variables to single service account:
```bash
ZITADEL_CLIENT_JWT_PATH=/home/spec-server/zitadel-service-account.json
# Remove ZITADEL_API_JWT_PATH
```

2. Restart server container:
```bash
docker restart server-container
```

3. Server will use old service account for both purposes (known working state)

### Code Rollback

1. Revert git commits for Phase 2 changes
2. Rebuild and redeploy server
3. No database changes required (schema unchanged)

---

## Success Criteria

### Must Have ✅

- [ ] Zero introspection 500 errors for 48 hours
- [ ] User registration works correctly
- [ ] User authentication works correctly
- [ ] Metadata updates work correctly
- [ ] Both service accounts visible in Zitadel console
- [ ] Audit logs show separate accounts for different operations

### Nice to Have 🎯

- [ ] Improved performance from proper scope separation
- [ ] Better audit trail visibility
- [ ] Monitoring alerts configured
- [ ] Infrastructure-as-code script for service account provisioning
- [ ] Documentation updated

---

## Timeline Estimate

| Phase | Task | Time | Dependencies |
|-------|------|------|--------------|
| 1 | Create provisioning script | 30 min | Admin token, API access |
| 1 | Generate service accounts | 15 min | Script complete |
| 2 | Refactor NestJS code | 2-3 hours | Service accounts created |
| 2 | Local testing | 1 hour | Code complete |
| 3 | Docker config updates | 30 min | Code tested locally |
| 4 | Production deployment | 30 min | All previous phases |
| 4 | Production monitoring | 30 min | Deployment complete |
| 5 | Cleanup & docs | 2 hours | 48h monitoring complete |

**Total Estimated Time:** 7-9 hours over 3-4 days

---

## Risk Assessment

### High Risk ⚠️

**Risk:** Service account creation fails  
**Mitigation:** Test script locally first, have manual console creation as backup

**Risk:** Introspection breaks after deployment  
**Mitigation:** Quick rollback plan, deploy during low-traffic window

### Medium Risk ⚠️

**Risk:** Permission configuration incorrect  
**Mitigation:** Test each operation type thoroughly before production

**Risk:** Old service account still in use somewhere  
**Mitigation:** Gradual migration, monitor logs for old account usage

### Low Risk ✓

**Risk:** Performance degradation  
**Mitigation:** Caching already implemented, dual accounts should not impact performance

---

## Alternative Approaches Considered

### Option A: Keep Single Service Account
**Pros:** No code changes, zero risk  
**Cons:** Security vulnerability, violates best practices, no fix for introspection errors

### Option B: Manual Console Setup
**Pros:** No automation needed, GUI-based  
**Cons:** Not reproducible, error-prone, time-consuming for multiple environments

### Option C: Full Infrastructure-as-Code (Selected Hybrid)
**Pros:** Completely automated, reproducible across environments  
**Cons:** More complex, longer development time  
**Decision:** Implement provisioning script (Phase 1) for reproducibility, but allow manual setup as fallback

---

## References

### Documentation
- Zitadel Management API: https://zitadel.com/docs/apis/resources/mgmt
- Zitadel Service Users: https://zitadel.com/docs/guides/integrate/service-users
- Zitadel Go SDK: https://github.com/zitadel/zitadel-go

### Reference Implementation
- Project: `huma-blueprints-api`
- Location: `/Users/mcj/code/huma/huma-blueprints-api`
- Key files:
  - `pkg/auth/client.go`
  - `pkg/auth/auth.go`
  - `internal/clients/service.go`
  - `config/config.go`

### Research Documentation
- Context7 Zitadel docs: `/websites/zitadel` (6433 code snippets)
- Zitadel GitHub: `/zitadel/zitadel` (1198 code snippets)
- 54+ API examples retrieved during research

---

## Next Actions

**Immediate (This Week):**
1. Review and approve this plan
2. Create provisioning script (Phase 1)
3. Test script in local environment
4. Generate service accounts for production

**Short Term (Next Week):**
1. Implement NestJS refactoring (Phase 2)
2. Test thoroughly in local environment
3. Update Docker configurations (Phase 3)
4. Deploy to production (Phase 4)

**Long Term (Next Month):**
1. Monitor production for 48 hours
2. Complete cleanup and documentation (Phase 5)
3. Consider expanding automation to other Zitadel setup tasks
4. Implement monitoring alerts

---

## Approval & Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| DevOps | | | |
| Security | | | |

---

**Document Version:** 1.0  
**Last Updated:** November 6, 2025  
**Next Review:** After Phase 4 completion
