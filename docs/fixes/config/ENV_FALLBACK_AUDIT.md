# Environment Variable Fallback Audit Report

**Date:** October 31, 2025  
**Objective:** Identify and categorize all environment variable fallbacks to determine which should be kept and which should be removed.

## Executive Summary

Found **200+ instances** of environment variable fallbacks using the pattern `process.env.VAR || fallback`. These fallbacks can cause silent failures where the application uses fallback values instead of detecting misconfiguration.

## Problem Statement

Fallback values can hide configuration issues:
- ❌ **Silent failures**: App runs with wrong config without warning
- ❌ **Hidden bugs**: Different behavior in dev vs production due to different fallbacks
- ❌ **Security risks**: Using insecure defaults (empty encryption keys, weak passwords)
- ❌ **Debugging difficulty**: Hard to know if env var was actually read or fallback used

## Classification of Fallbacks

### 🔴 **CRITICAL - Remove Immediately (Security)**

These have security implications and should FAIL FAST if not set:

#### 1. Encryption Key (DANGEROUS!)
**File:** `apps/server/src/modules/integrations/encryption.service.ts:28`
```typescript
this.encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY || '';
```
**Problem:** Empty string fallback means credentials stored unencrypted!
**Fix:** Require this variable, throw error if missing in production
```typescript
this.encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;
if (!this.encryptionKey && process.env.NODE_ENV === 'production') {
    throw new Error('INTEGRATION_ENCRYPTION_KEY is required in production');
}
```

#### 2. Database Credentials in Tests/Scripts with Production Values
**Files:** Multiple seed/migration scripts
```typescript
user: process.env.DB_USER || 'mcj',  // Personal username as fallback!
password: process.env.POSTGRES_PASSWORD || '',  // Empty password!
```
**Problem:** Scripts might accidentally connect to production with wrong creds
**Fix:** Require explicit credentials, no fallbacks

---

### 🟡 **HIGH PRIORITY - Remove for Config Schema**

Variables that should be required in `config.schema.ts`:

#### 3. Database Connection (Already in Schema but with Fallbacks Elsewhere)
**File:** `apps/server/src/common/config/config.schema.ts`
```typescript
// Schema defines these as required (!), but many files still use fallbacks:
POSTGRES_HOST!: string;  // Required in schema ✅
POSTGRES_USER!: string;  // Required in schema ✅
POSTGRES_PASSWORD!: string;  // Required in schema ✅
```

**Problem Files:**
- `tests/setup.ts:61-65` - uses fallbacks for test database
- `tests/test-db-config.ts:20-24` - overwrites env vars with fallbacks
- `scripts/reset-db.ts:30-34` - dangerous fallbacks for DB reset
- Many other scripts (see full list below)

**Fix:** 
1. Keep schema validation strict (no fallbacks)
2. For tests: Use dedicated test environment setup
3. For scripts: Require explicit `.env` file or command line args

#### 4. Model/Embedding Configuration
**Files:** 
- `src/modules/graph/google-vertex-embedding.provider.ts:47,64,86,88`
- `src/common/config/config.service.ts:58`

```typescript
const location = process.env.VERTEX_EMBEDDING_LOCATION || 'us-central1';
const model = process.env.VERTEX_EMBEDDING_MODEL || 'text-embedding-004';
const dim = parseInt(process.env.EMBEDDING_DIMENSION || '1536', 10);
```

**Problem:** Wrong model/location can cause:
- High costs (using expensive region)
- API errors (wrong model name)
- Vector dimension mismatch

**Fix:** Add to config schema as required, validate in startup

---

### 🟢 **ACCEPTABLE - Keep (Reasonable Development Defaults)**

These are acceptable for local development:

#### 5. Local Development Ports
**Files:**
- `apps/admin/vite.config.ts:15,18`
- `apps/admin/e2e/utils/navigation.ts:8`
- `apps/server/scripts/check-e2e-deps.mjs:13`

```typescript
const DEV_PORT = Number(process.env.ADMIN_PORT || 5175);  // ✅ OK
const API_TARGET = process.env.API_ORIGIN || `http://localhost:3001`;  // ✅ OK
```

**Justification:** Standard local dev ports are safe fallbacks

#### 6. Test Configuration
**Files:**
- `apps/admin/e2e/playwright.config.ts:34`
- `apps/server/tests/openapi-regression.spec.ts:35`

```typescript
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${DEV_PORT}`;  // ✅ OK
const EXPECTED_HASH = process.env.OPENAPI_EXPECTED_HASH || '<known-hash>';  // ✅ OK for validation
```

**Justification:** Tests need defaults to run locally

#### 7. Worker Intervals (Performance Tuning)
**Files:**
- `src/modules/graph/embedding-worker.service.ts:53,97`
- `src/modules/graph/tag-cleanup-worker.service.ts:27`
- `src/modules/graph/revision-count-refresh-worker.service.ts:23`

```typescript
start(intervalMs: number = parseInt(process.env.EMBEDDING_WORKER_INTERVAL_MS || '2000', 10))  // ✅ OK
const batch: EmbeddingJobRow[] = await this.jobs.dequeue(parseInt(process.env.EMBEDDING_WORKER_BATCH || '5', 10));  // ✅ OK
```

**Justification:** These are performance tuning knobs with sensible defaults

#### 8. Feature Flags / Optional Services
**Files:**
- `src/main.ts:131,135`
- `src/common/config/config.service.ts:22`

```typescript
const embeddingProvider = process.env.EMBEDDING_PROVIDER || 'unset';  // ✅ OK
CHAT_MODEL_ENABLED_env: process.env.CHAT_MODEL_ENABLED || 'unset',  // ✅ OK
```

**Justification:** Optional features that gracefully degrade

---

### 🔵 **REFACTOR - Consolidate Patterns**

#### 9. Multiple Variable Names for Same Purpose
**Problem:** Database connection uses inconsistent naming:
```typescript
// Some files use POSTGRES_* prefix:
process.env.POSTGRES_HOST || 'localhost'
process.env.POSTGRES_PORT || '5432'

// Others use DB_* prefix:
process.env.DB_HOST || 'localhost'
process.env.DB_PORT || '5432'

// Some check both:
process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost'
```

**Files Affected:**
- `scripts/seed-extraction-demo.ts:19-23`
- `scripts/reset-db.ts:30-34`
- `scripts/full-reset-db.ts:48-52`
- `scripts/get-clickup-credentials.ts:19-23`

**Fix:** 
1. Standardize on `POSTGRES_*` prefix (matches NestJS config schema)
2. Remove `DB_*` support
3. Update all scripts to use canonical names only
4. Add deprecation warnings if old names detected

---

## Detailed File-by-File Analysis

### Production Code (apps/server/src)

#### CRITICAL - Remove Fallbacks

| File | Line | Variable | Fallback | Risk | Action |
|------|------|----------|----------|------|--------|
| `modules/integrations/encryption.service.ts` | 28 | `INTEGRATION_ENCRYPTION_KEY` | `''` | 🔴 CRITICAL | REMOVE - require in prod |
| `modules/template-packs/seeds/meeting-decision-pack.seed.ts` | 646-649 | DB connection | `localhost`/`mcj` | 🔴 HIGH | REMOVE - use .env |

#### HIGH - Validate in Config Schema

| File | Line | Variable | Fallback | Action |
|------|------|----------|----------|--------|
| `modules/graph/google-vertex-embedding.provider.ts` | 47,64,86,88 | `VERTEX_EMBEDDING_LOCATION`, `VERTEX_EMBEDDING_MODEL` | `us-central1`, `text-embedding-004` | Add to schema |
| `common/config/config.service.ts` | 58 | `EMBEDDING_DIMENSION` | `1536` | Already logged ✅ |

#### ACCEPTABLE - Keep

| File | Line | Variable | Fallback | Justification |
|------|------|----------|----------|---------------|
| `modules/graph/embedding-worker.service.ts` | 53,97 | Worker intervals/batch | `2000`, `5` | Performance tuning |
| `modules/graph/tag-cleanup-worker.service.ts` | 27 | Cleanup interval | `300000` | Performance tuning |
| `modules/graph/graph.service.ts` | 47,1935,2398 | Graph limits | `20`, `500`, `50` | Algorithm parameters |
| `modules/chat/chat.controller.ts` | 812 | `MCP_SERVER_URL` | `localhost:3001` | Optional integration |
| `common/config/config.schema.ts` | 146-162 | Extraction worker config | Various | Has defaults in schema ✅ |

---

### Test Files (apps/server/tests)

#### REFACTOR - Use Test Environment Setup

All test files that use DB connection fallbacks should use a centralized test configuration:

**Current Problem:**
- `tests/setup.ts` - sets fallbacks
- `tests/test-db-config.ts` - overwrites env vars with fallbacks
- `tests/e2e/e2e-context.ts:195,201` - sets test flags with fallbacks
- `tests/utils/db-describe.ts` - uses fallbacks

**Fix:**
```typescript
// tests/test-env.ts (NEW FILE)
export function setupTestEnvironment() {
    // Require these to be set, no fallbacks
    if (!process.env.POSTGRES_HOST) {
        throw new Error('POSTGRES_HOST must be set for tests');
    }
    // ... validate all required vars
}
```

#### Test-Specific Acceptable Fallbacks

| File | Fallback | OK? | Reason |
|------|----------|-----|--------|
| `tests/e2e/chat.mcp-integration.e2e.spec.ts` | `MCP_SERVER_URL` → `localhost:3002` | ✅ | Test isolation |
| `tests/e2e/chat.mcp-integration.e2e.spec.ts` | `TEST_AUTH_TOKEN` → `test-token` | ✅ | Test fixture |
| `tests/openapi-regression.spec.ts` | `OPENAPI_EXPECTED_HASH` → known hash | ✅ | Validation baseline |

---

### Scripts

#### DANGEROUS - Remove All Fallbacks

All scripts that modify database or seed data should require explicit configuration:

**Files to Fix:**
- `scripts/reset-db.ts` - DB reset with fallbacks 🔴
- `scripts/full-reset-db.ts` - Full reset with fallbacks 🔴
- `scripts/seed-extraction-demo.ts` - Seeds with fallbacks
- `scripts/seed-togaf-template.ts` - Seeds with fallbacks
- `scripts/seed-meeting-pack.ts` - Seeds with fallbacks
- `scripts/seed-emergent-framework.ts` - Seeds with fallbacks
- `scripts/run-migrations.ts` - Migrations with fallbacks 🔴
- `scripts/get-clickup-credentials.ts` - Reads prod data with fallbacks 🔴

**Fix Pattern:**
```typescript
// BEFORE (DANGEROUS)
const host = process.env.POSTGRES_HOST || 'localhost';

// AFTER (SAFE)
const host = process.env.POSTGRES_HOST;
if (!host) {
    console.error('ERROR: POSTGRES_HOST environment variable is required');
    console.error('Load from .env: source .env && npm run script:name');
    process.exit(1);
}
```

---

### Frontend (apps/admin)

#### ACCEPTABLE - Keep Development Defaults

All admin frontend fallbacks are acceptable:

| File | Variables | Fallback | OK? |
|------|-----------|----------|-----|
| `vite.config.ts` | `ADMIN_PORT`, `SERVER_PORT` | `5175`, `3001` | ✅ |
| `e2e/playwright.config.ts` | `E2E_BASE_URL` | `localhost:5175` | ✅ |
| `e2e/helpers/test-user.ts` | Test URLs | `localhost:5176` | ✅ |
| `e2e/fixtures/app.ts` | Log directory | Default path | ✅ |

---

## Recommended Actions

### Phase 1: Critical Security (Immediate)

1. **Remove encryption key fallback**
   - File: `encryption.service.ts`
   - Action: Throw error if missing in production
   - Impact: Prevents storing unencrypted credentials

2. **Add startup validation**
   - File: `main.ts` (bootstrap)
   - Action: Validate critical env vars before starting server
   - Check: `INTEGRATION_ENCRYPTION_KEY`, database vars, model config

### Phase 2: Config Schema Validation (Week 1)

1. **Add missing vars to config.schema.ts**
   - Add: `VERTEX_EMBEDDING_LOCATION`, `VERTEX_EMBEDDING_MODEL`
   - Mark as required (no `@IsOptional()`)
   - Remove fallbacks from provider code

2. **Validate on startup**
   - Use existing `validateSync()` pattern
   - Log all loaded env vars (non-sensitive)
   - Fail fast on validation errors

### Phase 3: Test Infrastructure (Week 2)

1. **Create centralized test environment setup**
   - New file: `tests/test-env.ts`
   - Validates test DB connection vars
   - No fallbacks, explicit configuration required

2. **Update all test files**
   - Import and call `setupTestEnvironment()`
   - Remove individual fallbacks
   - Document required test env vars in `TESTING.md`

### Phase 4: Scripts Safety (Week 2)

1. **Remove all script fallbacks**
   - Add explicit env var validation
   - Print helpful error messages with examples
   - Document required vars in script headers

2. **Add script runner helper**
   ```bash
   # scripts/run-with-env.sh
   #!/bin/bash
   if [ ! -f .env ]; then
       echo "ERROR: .env file not found"
       exit 1
   fi
   source .env
   "$@"
   ```

3. **Update package.json scripts**
   ```json
   {
     "scripts": {
       "seed:demo": "./scripts/run-with-env.sh tsx scripts/seed-extraction-demo.ts"
     }
   }
   ```

### Phase 5: Variable Name Consolidation (Week 3)

1. **Standardize on POSTGRES_* prefix**
   - Remove DB_* support
   - Add deprecation warning if detected
   - Update all documentation

2. **Create migration guide**
   - Document old → new mapping
   - Provide search/replace commands
   - Add to CHANGELOG

---

## Environment Variable Checklist

### Required in Production (No Fallbacks)

- [ ] `INTEGRATION_ENCRYPTION_KEY` - Must be 32+ chars
- [ ] `POSTGRES_HOST`
- [ ] `POSTGRES_PORT`
- [ ] `POSTGRES_USER`
- [ ] `POSTGRES_PASSWORD`
- [ ] `POSTGRES_DB`
- [ ] `VERTEX_EMBEDDING_LOCATION` (if using Vertex AI)
- [ ] `VERTEX_EMBEDDING_MODEL` (if using Vertex AI)
- [ ] `GCP_PROJECT_ID` (if using GCP)

### Required for Features

- [ ] `EMBEDDING_PROVIDER` - Required for embeddings
- [ ] `CHAT_MODEL_ENABLED` - Required for chat
- [ ] `AUTH_ISSUER` - Required for OIDC
- [ ] `AUTH_JWKS_URI` - Required for OIDC

### Optional with Safe Defaults

- ✅ `ADMIN_PORT` → 5175
- ✅ `SERVER_PORT` → 3001
- ✅ `EMBEDDING_WORKER_INTERVAL_MS` → 2000
- ✅ `EMBEDDING_WORKER_BATCH` → 5
- ✅ `EXTRACTION_WORKER_POLL_INTERVAL_MS` → 5000
- ✅ `EXTRACTION_WORKER_BATCH_SIZE` → 5

---

## Testing the Changes

### 1. Test with Missing Required Vars

```bash
# Should FAIL with clear error message
unset POSTGRES_HOST
npm run start:dev
# Expected: Error about POSTGRES_HOST being required
```

### 2. Test with Minimal Valid Config

```bash
# Should START successfully
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5437
export POSTGRES_USER=spec
export POSTGRES_PASSWORD=spec
export POSTGRES_DB=spec
export INTEGRATION_ENCRYPTION_KEY=gZXyEvwCaPpSngSmkUNr7gibNRkPTDom
npm run start:dev
```

### 3. Test Scripts

```bash
# Should FAIL with helpful error
npm run seed:demo
# Expected: Error listing required env vars

# Should SUCCEED
source .env && npm run seed:demo
```

---

## Migration Plan for Users

### Update .env File

Add explicit values for all variables that previously had fallbacks:

```bash
# Previously optional (had fallbacks), now required:
VERTEX_EMBEDDING_LOCATION=us-central1
VERTEX_EMBEDDING_MODEL=text-embedding-004
INTEGRATION_ENCRYPTION_KEY=<generate-32-char-key>

# Standardized naming (remove DB_* if present):
# OLD: DB_HOST=localhost
# NEW: POSTGRES_HOST=localhost
```

### Generate Encryption Key

```bash
# Generate secure 32-character key
openssl rand -base64 24
```

---

## Summary Statistics

- **Total Fallbacks Found:** 200+
- **Critical Security Issues:** 2 (encryption key, DB creds in seeds)
- **Should Remove:** ~50 (scripts, prod code, tests)
- **Should Keep:** ~150 (dev defaults, performance tuning, optional features)
- **Need Refactoring:** ~30 (variable name inconsistency)

## Priority Rankings

1. 🔴 **P0 (This Week):** Remove encryption key fallback + startup validation
2. 🟠 **P1 (Week 1):** Add model/embedding config to schema
3. 🟡 **P2 (Week 2):** Fix test infrastructure + dangerous scripts
4. 🟢 **P3 (Week 3):** Consolidate variable names
5. 🔵 **P4 (Future):** Document and communicate changes

---

## Files to Modify (Summary)

### Immediate Changes
- `apps/server/src/modules/integrations/encryption.service.ts`
- `apps/server/src/main.ts` (add startup validation)

### Config Schema Updates
- `apps/server/src/common/config/config.schema.ts`
- `apps/server/src/modules/graph/google-vertex-embedding.provider.ts`

### Script Safety Updates (12 files)
- `scripts/reset-db.ts`
- `scripts/full-reset-db.ts`
- `scripts/seed-extraction-demo.ts`
- `scripts/seed-togaf-template.ts`
- `scripts/seed-meeting-pack.ts`
- `scripts/seed-emergent-framework.ts`
- `scripts/run-migrations.ts`
- `scripts/get-clickup-credentials.ts`
- `scripts/fix-my-conversations.mjs`
- `scripts/migrate-embedding-dimension.ts`
- `apps/server/scripts/graph-backfill.ts`
- `apps/server/scripts/migrate-phase1.ts`

### Test Infrastructure (5 files)
- `apps/server/tests/test-env.ts` (NEW)
- `apps/server/tests/setup.ts`
- `apps/server/tests/test-db-config.ts`
- `apps/server/tests/utils/db-describe.ts`
- `apps/server/tests/e2e/e2e-context.ts`

### Documentation Updates
- `.env.example` (add new required vars)
- `TESTING.md` (document test environment setup)
- `CHANGELOG.md` (document breaking changes)

---

**END OF REPORT**
