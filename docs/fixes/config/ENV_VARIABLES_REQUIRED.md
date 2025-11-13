# Required Environment Variables - Quick Reference

**Last Updated:** 2025-01-XX  
**Status:** Post Environment Variable Fallback Removal  
**Related Docs:** `ENV_FALLBACK_IMPLEMENTATION_COMPLETE.md`, `.env.example`

---

## Quick Start

```bash
# Copy the example file
cp .env.example .env

# Edit and fill in all required values
vim .env

# Test that validation passes
npm run start:dev
```

If you see errors about missing environment variables, check this document for the correct format and examples.

---

## Database Configuration (REQUIRED)

All database scripts, tests, and the application require these variables:

```bash
# PostgreSQL Connection
POSTGRES_HOST=localhost          # Database host
POSTGRES_PORT=5432              # Database port
POSTGRES_USER=spec              # Database user
POSTGRES_PASSWORD=spec          # Database password
POSTGRES_DB=spec                # Database name
```

**Why Required:**
- Application validates on startup (fails fast if missing)
- All scripts use `env-validator.ts` to check before running
- Tests use centralized `test-env.ts` (sets local defaults)

**No Fallbacks:**
- Previously: `POSTGRES_HOST || DB_HOST || 'localhost'` (3-level chain)
- Now: Must be explicitly set or startup fails with clear error

---

## Security Configuration (REQUIRED)

### Integration Encryption Key

```bash
# AES-256 encryption key for integration credentials (pgcrypto)
INTEGRATION_ENCRYPTION_KEY=your-32-character-or-longer-key-here-minimum
```

**Requirements:**
- ✅ Must be **≥32 characters** (enforced at startup)
- ✅ Must be set in production (no fallback to empty string)
- ✅ Used for encrypting OAuth tokens, API keys in database

**Validation:**
- `encryption.service.ts` validates on module init
- `main.ts` validates before app bootstrap
- **Fails fast** if missing or too short

**Why This Changed:**
- **Before:** `INTEGRATION_ENCRYPTION_KEY || ''` → stored credentials **unencrypted**
- **After:** App refuses to start → prevents security vulnerability

**Example:**
```bash
# Generate a strong key
openssl rand -base64 32
# Output: 8K7f2Hn9Jm3Lp4Qr5St6Uv7Wx8Yz9Aa0Bb1Cc2Dd3Ee4=
```

---

## AI/LLM Configuration (REQUIRED if using embeddings)

### Google Vertex AI

```bash
# Google Cloud Project
VERTEX_EMBEDDING_PROJECT=my-gcp-project-id

# GCP Region (affects costs and latency)
VERTEX_EMBEDDING_LOCATION=us-central1

# Embedding Model Version
VERTEX_EMBEDDING_MODEL=text-embedding-004

# Provider Selection
EMBEDDING_PROVIDER=google-vertex
```

**Why Required:**
- **Cost Control:** Region affects GCP pricing (no hidden us-central1 default)
- **Model Visibility:** Team knows exact model in use
- **Auditability:** Explicit configuration in deployment manifests

**What Changed:**
- **Before:** Silent fallback to `us-central1` and `text-embedding-004`
- **After:** Must be explicitly configured or app refuses to start

**Common Regions:**
- `us-central1` - Iowa (lowest cost)
- `us-east4` - Virginia
- `europe-west1` - Belgium
- `asia-northeast1` - Tokyo

**Cost Implications:**
```
US regions:      $0.00002 per 1K characters
EU regions:      $0.000024 per 1K characters (20% higher)
Asia regions:    $0.000028 per 1K characters (40% higher)
```

---

## Optional Configuration (Acceptable Defaults)

These variables have sensible defaults and **do not require explicit configuration** for local development:

### Application Ports
```bash
PORT=3001                       # API server port
ADMIN_PORT=5175                 # Admin UI port
```

### Logging
```bash
LOG_LEVEL=info                  # debug, info, warn, error
```

### CORS (Development Only)
```bash
CORS_ALLOWED_ORIGINS=*          # Comma-separated origins in production
```

### Performance Tuning
```bash
EMBEDDING_BATCH_SIZE=50         # LLM batch processing
CHUNK_SIZE=500                  # Document chunking
CLEANUP_INTERVAL_MS=3600000     # Maintenance (1 hour)
```

**Why These Have Defaults:**
- No security implications
- No cost implications
- Standard development values work for 99% of cases
- Can be tuned for specific environments

---

## Environment-Specific Examples

### Local Development

```bash
# .env (local development)
POSTGRES_HOST=localhost
POSTGRES_PORT=5437  # Docker mapped port
POSTGRES_USER=spec
POSTGRES_PASSWORD=spec
POSTGRES_DB=spec

INTEGRATION_ENCRYPTION_KEY=local-dev-key-32-characters-min

VERTEX_EMBEDDING_PROJECT=my-dev-project
VERTEX_EMBEDDING_LOCATION=us-central1
VERTEX_EMBEDDING_MODEL=text-embedding-004
EMBEDDING_PROVIDER=google-vertex

# Optional: Use defaults for these
# PORT=3001
# LOG_LEVEL=info
```

### CI/CD Pipeline

```yaml
# .github/workflows/test.yml
env:
  POSTGRES_HOST: localhost
  POSTGRES_PORT: 5432
  POSTGRES_USER: postgres
  POSTGRES_PASSWORD: postgres
  POSTGRES_DB: test_db
  
  INTEGRATION_ENCRYPTION_KEY: ${{ secrets.TEST_ENCRYPTION_KEY }}
  
  # Mock AI config for tests
  VERTEX_EMBEDDING_PROJECT: test-project
  VERTEX_EMBEDDING_LOCATION: us-central1
  VERTEX_EMBEDDING_MODEL: text-embedding-004
  EMBEDDING_PROVIDER: google-vertex
  
  # Test-specific
  NODE_ENV: test
  DB_AUTOINIT: true
```

### Production Deployment

```bash
# Kubernetes ConfigMap/Secret
POSTGRES_HOST=prod-db.example.com
POSTGRES_PORT=5432
POSTGRES_USER=prod_app_user
POSTGRES_PASSWORD=<from-k8s-secret>
POSTGRES_DB=production_db

INTEGRATION_ENCRYPTION_KEY=<from-k8s-secret-32-chars-minimum>

VERTEX_EMBEDDING_PROJECT=prod-gcp-project
VERTEX_EMBEDDING_LOCATION=us-central1
VERTEX_EMBEDDING_MODEL=text-embedding-004
EMBEDDING_PROVIDER=google-vertex

# Production overrides
LOG_LEVEL=warn
CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

---

## Validation Behavior

### Startup Validation

The application validates **all required variables** before starting:

```typescript
// apps/server/src/main.ts
function validateEnvironment() {
  const required = {
    'POSTGRES_HOST': 'localhost',
    'POSTGRES_PORT': '5432',
    'POSTGRES_USER': 'spec',
    'POSTGRES_PASSWORD': 'spec',
    'POSTGRES_DB': 'spec',
    'INTEGRATION_ENCRYPTION_KEY': 'your-32-character-key',
  };
  
  // Validates before bootstrap
  // Throws clear error if missing
}
```

**Example Error:**
```
Error: Missing required environment variables:
  - INTEGRATION_ENCRYPTION_KEY (example: your-32-character-key-here)
  - VERTEX_EMBEDDING_LOCATION (example: us-central1)

Please set these variables in your .env file or environment.
See .env.example for reference.
```

### Script Validation

All database scripts use `env-validator.ts`:

```typescript
// scripts/lib/env-validator.ts
export const DB_REQUIREMENTS = {
  'POSTGRES_HOST': 'localhost',
  'POSTGRES_PORT': '5432',
  'POSTGRES_USER': 'spec',
  'POSTGRES_PASSWORD': 'spec',
  'POSTGRES_DB': 'spec',
};

validateEnvVars(DB_REQUIREMENTS);
// Fails fast with helpful error if missing
```

**Scripts Using Validation:**
- `reset-db.ts`, `full-reset-db.ts`
- `seed-*.ts` (all seed scripts)
- `run-migrations.ts`
- `get-clickup-credentials.ts`
- `migrate-embedding-dimension.ts`

### Test Validation

Tests use centralized `test-env.ts`:

```typescript
// apps/server/tests/test-env.ts
export function setupTestEnvironment() {
  // Sets sensible defaults for local dev
  process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || 'localhost';
  process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || '5437';
  // ...
  
  // In CI, validates that required vars are actually set
  if (process.env.CI === 'true') {
    validateRequiredVars();
  }
}
```

**Test Behavior:**
- **Local Dev:** Uses sensible defaults (localhost:5437, spec/spec)
- **CI:** Validates all vars are explicitly set
- **No Silent Failures:** Tests fail fast if config wrong

---

## Troubleshooting

### "Missing required environment variables"

**Cause:** App can't find required env var at startup

**Solution:**
1. Check if `.env` file exists: `ls -la .env`
2. Verify variable is set: `grep POSTGRES_HOST .env`
3. Check for typos: `POSTGRESS_HOST` vs `POSTGRES_HOST`
4. Ensure no spaces around `=`: `POSTGRES_HOST=localhost` (not `POSTGRES_HOST = localhost`)
5. Restart dev server after changing `.env`: `npm run start:dev`

### "INTEGRATION_ENCRYPTION_KEY must be at least 32 characters"

**Cause:** Key is too short for AES-256 security

**Solution:**
```bash
# Generate a proper key
openssl rand -base64 32

# Add to .env
echo "INTEGRATION_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env
```

### "Database connection failed"

**Cause:** Database credentials are wrong or DB not running

**Solution:**
1. Verify Docker is running: `docker ps | grep postgres`
2. Check connection params: `echo $POSTGRES_HOST $POSTGRES_PORT`
3. Test connection manually:
   ```bash
   psql -h localhost -p 5437 -U spec -d spec
   # Should prompt for password: spec
   ```
4. Reset database if needed: `npx tsx scripts/reset-db.ts`

### "Script fails with validation error"

**Cause:** Script uses `env-validator.ts` which requires all DB vars

**Solution:**
```bash
# Option 1: Set missing vars
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
# ...

# Option 2: Use .env file
npx tsx scripts/reset-db.ts
# Automatically loads from .env
```

### Tests fail with "Cannot connect to database"

**Cause:** Test database not configured or not running

**Solution:**
1. Check test DB config: `grep POSTGRES test-env.ts`
2. Ensure test DB running: `docker ps`
3. Run with explicit vars:
   ```bash
   POSTGRES_HOST=localhost \
   POSTGRES_PORT=5437 \
   POSTGRES_USER=spec \
   POSTGRES_PASSWORD=spec \
   POSTGRES_DB=spec \
   npm run test
   ```

---

## Migration Checklist

If you're updating an existing development environment:

- [ ] Copy `.env.example` to `.env`
- [ ] Set `POSTGRES_*` variables (5 required)
- [ ] Generate and set `INTEGRATION_ENCRYPTION_KEY` (≥32 chars)
- [ ] Set `VERTEX_EMBEDDING_*` variables (4 required)
- [ ] Remove old `DB_HOST`, `DB_PORT`, `DB_USER`, etc. (legacy vars)
- [ ] Test startup: `npm run start:dev`
- [ ] Verify no validation errors in console
- [ ] Run tests: `npm run test`
- [ ] Run a script: `npx tsx scripts/reset-db.ts --dry-run`

---

## Reference

### See Also
- `.env.example` - Template with all required variables
- `ENV_FALLBACK_IMPLEMENTATION_COMPLETE.md` - Full implementation details
- `ENV_FALLBACK_AUDIT.md` - Original analysis
- `ENV_FALLBACK_FIXES.md` - Implementation plan

### Key Files
- `apps/server/src/main.ts` - Startup validation
- `apps/server/src/modules/integrations/encryption.service.ts` - Encryption key validation
- `scripts/lib/env-validator.ts` - Script validation utility
- `apps/server/tests/test-env.ts` - Test environment setup

### Support
If you encounter issues not covered in this guide:
1. Check error message for specific variable names
2. Compare your `.env` with `.env.example`
3. Search `ENV_FALLBACK_AUDIT.md` for variable context
4. Ask team for help with deployment-specific configurations

---

**TL;DR:**
1. **Required:** `POSTGRES_*` (5 vars), `INTEGRATION_ENCRYPTION_KEY` (≥32 chars), `VERTEX_EMBEDDING_*` (4 vars if using AI)
2. **Optional:** Everything else has sensible defaults
3. **Validation:** App fails fast with clear errors if required vars missing
4. **Testing:** Tests use defaults locally, validate in CI
5. **Scripts:** All validate before touching database

**No more silent fallbacks. Explicit configuration only.** ✅
