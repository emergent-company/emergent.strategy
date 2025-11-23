# Consolidate Duplicate Environment Variables

**Status:** ✅ COMPLETED  
**Priority:** High  
**Category:** Developer Experience, Architecture  
**Created:** 2025-11-23  
**Completed:** 2025-11-23

## Implementation Results

### ✅ Consolidation Completed Successfully

**Date:** 2025-11-23  
**Tool:** `npm run audit-infisical-duplicates -- --fix`  
**Actions Executed:** 67 total

#### Actions Performed:
- ✅ **Deleted 7 duplicates** (removed redundant copies)
- ✅ **Created 3 missing secrets** (POSTGRES_* in /workspace)
- ✅ **Moved 57 misplaced variables** to correct folders

#### Final Structure:
```
/workspace (46 secrets) - Shared infrastructure
  ├── Database: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
  ├── Ports: ADMIN_PORT, SERVER_PORT, NAMESPACE
  ├── Zitadel Infrastructure: ZITADEL_DOMAIN, ZITADEL_HTTP_PORT, ZITADEL_LOGIN_PORT, etc.
  ├── Docker: COMPOSE_PROJECT_NAME, DB_CONTAINER_NAME
  ├── E2E Testing: E2E_* variables
  └── LangSmith: LANGSMITH_* variables

/server (30 secrets) - Server-specific
  ├── Zitadel App: ZITADEL_ORG_ID, ZITADEL_PROJECT_ID, ZITADEL_API_CLIENT_ID
  ├── GCP/Vertex AI: GCP_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS, VERTEX_*
  ├── Auth: AUTH_ISSUER, AUTH_JWKS_URI
  ├── Extraction: EXTRACTION_* config
  └── Server Config: EMBEDDING_PROVIDER, ORGS_DEMO_SEED, SCOPES_DISABLED, etc.

/admin (6 secrets) - Admin-specific
  └── Vite/Frontend: VITE_AUTH_MODE, VITE_ZITADEL_* variables

/docker (0 secrets) - Empty
  └── All docker variables moved to /workspace (shared scope)
```

#### Verification:
```bash
$ npm run audit-infisical-duplicates

✅ No duplicate variables found!
✅ All variables are correctly organized!
Total: 82 unique secrets across 3 folders
```

## Current State

We have duplicate environment variables scattered across multiple `.env` files:

### Database Variables (3 locations)
- **Root `.env`**: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_DB`
- **`apps/server/.env`**: Same 4 + `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- **`docker/.env`**: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`

### GCP/Vertex AI Variables (2 locations)
- **Root `.env`**: `GCP_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `VERTEX_AI_*`, `VERTEX_EMBEDDING_*`
- **`apps/server/.env`**: Duplicates most of the above

### Zitadel Variables (2 locations)
- **Root `.env`**: Infrastructure config (`ZITADEL_DOMAIN`, `ZITADEL_HTTP_PORT`, database config, first instance setup)
- **`apps/server/.env`**: Application config (`ZITADEL_ORG_ID`, `ZITADEL_PROJECT_ID`, client IDs, JWT paths)

### Problems

1. **Synchronization Drift**: Same variable in multiple files can have different values
2. **Maintenance Burden**: Changes must be made in multiple places
3. **Confusion**: Unclear which file is the "source of truth"
4. **Scripts Break**: Root scripts use root `.env`, but some values only exist in app `.env`
5. **Infisical Migration**: Now that we have Infisical, we need ONE canonical location per variable

## Proposed Solution

### Principle: **Single Source of Truth**

Each variable should exist in **exactly one location** based on its scope:

#### 1. `/workspace` Folder (Root-level, shared infrastructure)
Variables used by:
- Docker Compose
- Multiple apps (admin + server)
- Root-level scripts
- Workspace CLI

**Variables to move here:**
```bash
# Database (used by docker-compose, scripts, both apps)
POSTGRES_HOST=localhost
POSTGRES_PORT=5437
POSTGRES_USER=spec
POSTGRES_PASSWORD=spec
POSTGRES_DB=spec

# Workspace-level config
NAMESPACE=spec
ADMIN_PORT=5176
SERVER_PORT=3002

# Zitadel Infrastructure (Docker config)
ZITADEL_DOMAIN=localhost:8200
ZITADEL_HTTP_PORT=8200
ZITADEL_LOGIN_PORT=8201
ZITADEL_MASTERKEY=MasterkeyNeedsToHave32Characters
ZITADEL_EXTERNALDOMAIN=localhost
ZITADEL_EXTERNALSECURE=false
ZITADEL_TLS_ENABLED=false
ZITADEL_DATABASE_POSTGRES_HOST=db
ZITADEL_DATABASE_POSTGRES_PORT=5437
ZITADEL_DATABASE_POSTGRES_DATABASE=zitadel
ZITADEL_DATABASE_POSTGRES_USER_USERNAME=zitadel
ZITADEL_DATABASE_POSTGRES_USER_PASSWORD=zitadel
ZITADEL_DATABASE_POSTGRES_USER_SSL_MODE=disable
ZITADEL_FIRSTINSTANCE_ORG_NAME="Spec, Inc."
ZITADEL_FIRSTINSTANCE_ORG_HUMAN_USERNAME=root
ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORD=Password1!
ZITADEL_FIRSTINSTANCE_LOGINCLIENTPATPATH=/current-dir/login-client.pat
# ... other Zitadel infrastructure config
```

#### 2. `/server` Folder (Server-specific)
Variables **only** used by the server app:

```bash
# Zitadel Application Config (server-specific IDs and auth)
ZITADEL_ORG_ID=345644688004349955
ZITADEL_PROJECT_ID=345644688256008195
ZITADEL_API_CLIENT_ID=345644690655215619
ZITADEL_API_APP_JWT_PATH=./secrets/zitadel-api-app-key.json
ZITADEL_CLIENT_JWT_PATH=./secrets/zitadel-client-service-account.json
ZITADEL_API_JWT_PATH=./secrets/zitadel-api-service-account.json
ZITADEL_OAUTH_CLIENT_ID=345644688558063619
ZITADEL_OAUTH_REDIRECT_URI=http://localhost:3002/auth/callback

# GCP/Vertex AI (server-specific, used for embeddings/LLM)
GCP_PROJECT_ID=spec-server-dev
GOOGLE_APPLICATION_CREDENTIALS=/Users/mcj/spec-server-dev-vertex-ai.json
GOOGLE_CLOUD_PROJECT=spec-server-dev
GOOGLE_CLOUD_LOCATION=europe-central2
VERTEX_AI_MODEL=gemini-2.5-flash-lite
VERTEX_AI_LOCATION=europe-central2
VERTEX_AI_PROJECT_ID=spec-server-dev
VERTEX_EMBEDDING_MODEL=text-embedding-004
VERTEX_EMBEDDING_PROJECT=spec-server-dev
VERTEX_EMBEDDING_LOCATION=europe-north1

# Server runtime config
EMBEDDING_PROVIDER=vertex-ai
EXTRACTION_WORKER_ENABLED=true
EXTRACTION_RATE_LIMIT_RPM=60
EXTRACTION_RATE_LIMIT_TPM=100000
INTEGRATION_ENCRYPTION_KEY=...
ORGS_DEMO_SEED=true
SCOPES_DISABLED=false
CHAT_MODEL_ENABLED=true
NODE_ENV=development
```

#### 3. `/admin` Folder (Admin-specific)
Variables **only** used by the admin app:

```bash
# Vite/Frontend config
VITE_AUTH_MODE=oidc
VITE_ZITADEL_CLIENT_ID=345644688558063619
VITE_ZITADEL_ISSUER=http://localhost:8200
VITE_ZITADEL_REDIRECT_URI=http://localhost:5176/auth/callback
VITE_ZITADEL_POST_LOGOUT_REDIRECT_URI=http://localhost:5176
VITE_ZITADEL_SCOPES=openid profile email offline_access
```

#### 4. `/docker` Folder (Docker Compose only)
**Remove all duplicates** - Docker Compose will reference workspace variables via Infisical.

Only keep Docker-specific config:
```bash
COMPOSE_PROJECT_NAME=spec
DB_CONTAINER_NAME=spec-db
```

### Special Case: PG* vs POSTGRES_*

The `PG*` variables (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`) are **PostgreSQL client environment variables** that tools like `psql` automatically read.

**Decision**: Keep both sets, but derive `PG*` from `POSTGRES_*` in app startup:

```typescript
// apps/server/src/main.ts (startup)
if (!process.env.PGHOST && process.env.POSTGRES_HOST) {
  process.env.PGHOST = process.env.POSTGRES_HOST;
  process.env.PGPORT = process.env.POSTGRES_PORT;
  process.env.PGUSER = process.env.POSTGRES_USER;
  process.env.PGPASSWORD = process.env.POSTGRES_PASSWORD;
  process.env.PGDATABASE = process.env.POSTGRES_DB;
}
```

This way:
- **Infisical only stores `POSTGRES_*`** (canonical names)
- **Scripts use `POSTGRES_*`** consistently
- **PostgreSQL tools still work** (via `PG*` derived at runtime)

## Implementation Plan

### Phase 1: Update Infisical Structure ✅ (Already Done)

We already have the correct folder structure in Infisical:
- `/workspace` - Shared config
- `/server` - Server-specific
- `/admin` - Admin-specific
- `/docker` - Docker-specific

### Phase 2: Move Variables to Correct Locations

1. **Audit current Infisical secrets** - verify which folder each variable is in
2. **Move shared variables to `/workspace`**:
   - All `POSTGRES_*` variables
   - All Zitadel infrastructure variables
   - `NAMESPACE`, ports, etc.
3. **Remove duplicates** from `/server` and `/docker` folders
4. **Keep only app-specific secrets** in `/server` and `/admin`

### Phase 3: Update Code to Reference Workspace Variables

1. **Update `apps/server/src/config/database.config.ts`**:
   ```typescript
   // Before: reads from app-level .env
   // After: reads from workspace-level (via Infisical)
   host: process.env.POSTGRES_HOST,
   port: parseInt(process.env.POSTGRES_PORT || '5437'),
   // ...
   ```

2. **Update scripts** to use consistent variable names:
   ```bash
   # All scripts use POSTGRES_* (not PG*)
   psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB"
   ```

3. **Add PG* derivation** in server startup (see Special Case above)

### Phase 4: Update .env Files as Documentation

1. **Root `.env.example`**:
   ```bash
   # ==========================================
   # WORKSPACE-LEVEL VARIABLES
   # Source: Infisical /workspace folder
   # Used by: docker-compose, scripts, all apps
   # ==========================================
   
   # Database Configuration
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5437
   # ... with comments indicating Infisical is source
   ```

2. **`apps/server/.env.example`**:
   ```bash
   # ==========================================
   # SERVER-SPECIFIC VARIABLES
   # Source: Infisical /server folder
   # ==========================================
   
   # Zitadel Application Config
   ZITADEL_ORG_ID=...
   # ... only server-specific vars
   ```

3. **Remove duplicate variables** from all `.env` files

### Phase 5: Update Documentation

1. **Update `QUICK_START_DEV.md`** with new variable structure
2. **Update `RUNBOOK.md`** with Infisical reference
3. **Add section to `INFISICAL_MIGRATION_STATUS.md`** explaining variable consolidation

## Benefits

1. ✅ **Single source of truth** - Each variable exists in exactly one place (Infisical folder)
2. ✅ **No sync drift** - Impossible for same variable to have different values
3. ✅ **Clear ownership** - `/workspace` vs `/server` vs `/admin` scope is explicit
4. ✅ **Easier scripts** - Scripts can rely on workspace-level variables always being present
5. ✅ **Better developer experience** - New developers understand variable scope immediately
6. ✅ **Safer** - Secrets in Infisical with proper access control, not scattered in files

## Risks & Mitigation

**Risk**: Breaking existing code that expects variables in wrong location  
**Mitigation**: Thorough testing after migration; update all references in Phase 3

**Risk**: Developer confusion during transition  
**Mitigation**: Clear documentation; maintain `.env.example` files with comments

**Risk**: Scripts break if they can't access workspace variables  
**Mitigation**: Ensure Infisical SDK loads `/workspace` folder first in all contexts

## Success Metrics

- Zero duplicate variables across `.env` files
- All scripts run successfully with workspace-level variables
- Apps start successfully with correct variable scoping
- Infisical folder structure matches logical ownership (workspace/server/admin/docker)

## Next Steps

### Remaining Tasks

1. ✅ ~~Create audit/fix script~~
2. ✅ ~~Execute consolidation~~
3. ✅ ~~Verify new structure~~
4. ⏳ **Test applications** - Ensure apps can access variables from new locations
5. 📝 **Update .env.example files** - Document new structure
6. 📝 **Update documentation** - Reflect new folder organization in guides

### Testing Checklist

- [ ] Server can access `/workspace` variables (database, Zitadel infrastructure)
- [ ] Server can access `/server` variables (GCP, extraction config)
- [ ] Admin can access `/workspace` variables (if needed)
- [ ] Admin can access `/admin` variables (VITE_*)
- [ ] Scripts can access `/workspace` variables
- [ ] Docker Compose can access `/workspace` variables

### Documentation Updates Needed

- [ ] `QUICK_START_DEV.md` - Update with new Infisical folder structure
- [ ] `RUNBOOK.md` - Update variable references
- [ ] `INFISICAL_MIGRATION_STATUS.md` - Add consolidation section
- [ ] `.env.example` - Reorganize to match Infisical structure
- [ ] `apps/server/.env.example` - Remove duplicates, reference /workspace
- [ ] `docker/.env.example` - Remove all secrets, reference /workspace

---

**Questions for Review:**

1. Should `GOOGLE_APPLICATION_CREDENTIALS` be workspace-level (if used by scripts) or server-level?
   - **Decision:** Server-level ✅ (only used by server app for embeddings)
   
2. Are there other shared variables that should be in `/workspace`?
   - **Decision:** All shared variables identified and moved ✅
   
3. Should we keep `.env` files at all, or only `.env.example`?
   - **Decision:** Keep `.env` for local development, use Infisical for deployment ✅
