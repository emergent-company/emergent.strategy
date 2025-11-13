# Environment Variable Fallback - Implementation Guide

This document provides concrete code changes to fix the fallback issues identified in the audit.

## Phase 1: Critical Security Fixes (DO FIRST)

### Fix 1: Encryption Service - Fail Fast on Missing Key

**File:** `apps/server/src/modules/integrations/encryption.service.ts`

**Current Code (Line 28):**
```typescript
this.encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY || '';
```

**New Code:**
```typescript
this.encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY || '';

// Validate encryption key
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

if (!this.encryptionKey) {
    if (isProduction) {
        throw new Error(
            'INTEGRATION_ENCRYPTION_KEY is required in production. ' +
            'Set a 32-character key for AES-256 encryption.'
        );
    } else if (!isTest) {
        this.logger.error(
            '⚠️  CRITICAL: INTEGRATION_ENCRYPTION_KEY not set! ' +
            'Integration credentials will NOT be encrypted. ' +
            'Generate a key: openssl rand -base64 24'
        );
    }
} else if (this.encryptionKey.length < 32) {
    const warning = 
        `INTEGRATION_ENCRYPTION_KEY is only ${this.encryptionKey.length} characters. ` +
        'For AES-256, use at least 32 characters.';
    
    if (isProduction) {
        throw new Error(warning);
    } else {
        this.logger.warn(warning);
    }
}
```

### Fix 2: Add Startup Environment Validation

**File:** `apps/server/src/main.ts`

Add new validation function before `bootstrap()`:

```typescript
/**
 * Validate critical environment variables before starting the server
 * Fails fast with clear error messages if required vars are missing
 */
function validateEnvironment() {
    const errors: string[] = [];
    const warnings: string[] = [];
    const isProduction = process.env.NODE_ENV === 'production';
    const isTest = process.env.NODE_ENV === 'test';

    // Skip validation in test environment (tests set their own env)
    if (isTest) {
        return;
    }

    // Critical: Database connection (ALWAYS required)
    const requiredVars = [
        'POSTGRES_HOST',
        'POSTGRES_PORT',
        'POSTGRES_USER',
        'POSTGRES_PASSWORD',
        'POSTGRES_DB',
    ];

    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            errors.push(`❌ ${varName} is required`);
        }
    }

    // Critical in production: Encryption key
    if (isProduction && !process.env.INTEGRATION_ENCRYPTION_KEY) {
        errors.push('❌ INTEGRATION_ENCRYPTION_KEY is required in production (32+ chars)');
    }

    // Required if using Vertex AI embeddings
    if (process.env.EMBEDDING_PROVIDER === 'vertex') {
        if (!process.env.VERTEX_EMBEDDING_LOCATION) {
            errors.push('❌ VERTEX_EMBEDDING_LOCATION is required when EMBEDDING_PROVIDER=vertex');
        }
        if (!process.env.VERTEX_EMBEDDING_MODEL) {
            errors.push('❌ VERTEX_EMBEDDING_MODEL is required when EMBEDDING_PROVIDER=vertex');
        }
        if (!process.env.GCP_PROJECT_ID && !process.env.VERTEX_EMBEDDING_PROJECT) {
            errors.push('❌ GCP_PROJECT_ID or VERTEX_EMBEDDING_PROJECT is required for Vertex AI');
        }
    }

    // Warnings for missing optional but recommended vars
    if (!process.env.INTEGRATION_ENCRYPTION_KEY && !isProduction) {
        warnings.push('⚠️  INTEGRATION_ENCRYPTION_KEY not set - credentials will be stored unencrypted');
    }

    // Print results
    if (errors.length > 0) {
        console.error('\n❌ Environment Validation Failed:\n');
        errors.forEach(err => console.error(`  ${err}`));
        console.error('\n💡 Tip: Copy .env.example to .env and fill in the values\n');
        process.exit(1);
    }

    if (warnings.length > 0) {
        console.warn('\n⚠️  Environment Warnings:\n');
        warnings.forEach(warn => console.warn(`  ${warn}`));
        console.warn('');
    }

    console.log('✅ Environment validation passed\n');
}

async function bootstrap() {
    // Validate environment before doing anything else
    validateEnvironment();
    
    // ... rest of existing bootstrap code
}
```

## Phase 2: Config Schema Updates

### Fix 3: Add Vertex AI Config to Schema

**File:** `apps/server/src/common/config/config.schema.ts`

Add after existing Vertex AI variables:

```typescript
// --- Vertex AI Configuration (Required if EMBEDDING_PROVIDER=vertex) ---
@IsString()
@IsOptional()
VERTEX_EMBEDDING_LOCATION?: string;

@IsString()
@IsOptional()
VERTEX_EMBEDDING_MODEL?: string;

@IsString()
@IsOptional()
VERTEX_EMBEDDING_PROJECT?: string;  // Alternative to GCP_PROJECT_ID
```

Update `envDefaults` object:

```typescript
static envDefaults = {
    // ... existing defaults
    
    // Vertex AI - NO FALLBACKS (must be explicitly set)
    VERTEX_EMBEDDING_LOCATION: process.env.VERTEX_EMBEDDING_LOCATION,
    VERTEX_EMBEDDING_MODEL: process.env.VERTEX_EMBEDDING_MODEL,
    VERTEX_EMBEDDING_PROJECT: process.env.VERTEX_EMBEDDING_PROJECT || process.env.GCP_PROJECT_ID,
}
```

### Fix 4: Remove Fallbacks from Vertex Embedding Provider

**File:** `apps/server/src/modules/graph/google-vertex-embedding.provider.ts`

**Lines 47, 64, 86, 88 - Remove fallbacks:**

```typescript
// BEFORE:
const location = process.env.VERTEX_EMBEDDING_LOCATION || 'us-central1';
const model = process.env.VERTEX_EMBEDDING_MODEL || 'text-embedding-004';

// AFTER:
const location = process.env.VERTEX_EMBEDDING_LOCATION;
const model = process.env.VERTEX_EMBEDDING_MODEL;

if (!location || !model) {
    throw new Error(
        'Vertex AI configuration incomplete. Required: ' +
        'VERTEX_EMBEDDING_LOCATION, VERTEX_EMBEDDING_MODEL. ' +
        'Check .env file or environment variables.'
    );
}
```

## Phase 3: Scripts Safety

### Fix 5: Create Script Helper Utility

**New File:** `scripts/lib/env-validator.ts`

```typescript
/**
 * Environment variable validation helper for scripts
 * Provides clear error messages when required variables are missing
 */

export interface EnvRequirement {
    name: string;
    description?: string;
    example?: string;
}

export function validateEnvVars(requirements: EnvRequirement[]): void {
    const missing: EnvRequirement[] = [];
    
    for (const req of requirements) {
        if (!process.env[req.name]) {
            missing.push(req);
        }
    }
    
    if (missing.length === 0) {
        return; // All good!
    }
    
    console.error('❌ Missing Required Environment Variables:\n');
    
    for (const req of missing) {
        console.error(`  ${req.name}`);
        if (req.description) {
            console.error(`    ${req.description}`);
        }
        if (req.example) {
            console.error(`    Example: ${req.example}`);
        }
        console.error('');
    }
    
    console.error('💡 Solutions:');
    console.error('  1. Create .env file: cp .env.example .env');
    console.error('  2. Edit .env and set the required values');
    console.error('  3. Run: source .env && npm run <script>\n');
    
    process.exit(1);
}

export const DB_REQUIREMENTS: EnvRequirement[] = [
    {
        name: 'POSTGRES_HOST',
        description: 'PostgreSQL server hostname',
        example: 'localhost'
    },
    {
        name: 'POSTGRES_PORT',
        description: 'PostgreSQL server port',
        example: '5432'
    },
    {
        name: 'POSTGRES_USER',
        description: 'PostgreSQL username',
        example: 'spec'
    },
    {
        name: 'POSTGRES_PASSWORD',
        description: 'PostgreSQL password',
        example: 'spec'
    },
    {
        name: 'POSTGRES_DB',
        description: 'PostgreSQL database name',
        example: 'spec'
    },
];
```

### Fix 6: Update Script Pattern (Example)

**File:** `scripts/reset-db.ts`

```typescript
import { validateEnvVars, DB_REQUIREMENTS } from './lib/env-validator';

async function main() {
    console.log('🗄️  Database Reset Script\n');
    
    // Validate environment BEFORE doing anything
    validateEnvVars(DB_REQUIREMENTS);
    
    // Now we can safely use the env vars (no fallbacks!)
    const host = process.env.POSTGRES_HOST!;  // ! = we validated it exists
    const port = Number(process.env.POSTGRES_PORT!);
    const user = process.env.POSTGRES_USER!;
    const password = process.env.POSTGRES_PASSWORD!;
    const database = process.env.POSTGRES_DB!;
    
    console.log(`Connecting to: ${user}@${host}:${port}/${database}`);
    
    // ... rest of script
}
```

### Fix 7: Update All Seed Scripts

Apply the same pattern to:
- `scripts/seed-extraction-demo.ts`
- `scripts/seed-togaf-template.ts`
- `scripts/seed-meeting-pack.ts`
- `scripts/seed-emergent-framework.ts`
- `scripts/full-reset-db.ts`
- `scripts/run-migrations.ts`
- `scripts/get-clickup-credentials.ts`

## Phase 4: Test Infrastructure

### Fix 8: Create Test Environment Setup

**New File:** `apps/server/tests/test-env.ts`

```typescript
/**
 * Centralized test environment setup
 * Ensures all test database configuration is explicit and validated
 */

export function setupTestEnvironment() {
    const isCI = process.env.CI === 'true';
    
    // In CI, we expect env vars to be set by the CI system
    // Locally, we can provide defaults for convenience
    if (!isCI) {
        // Set defaults only for local development
        process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || 'localhost';
        process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || '5437';
        process.env.POSTGRES_USER = process.env.POSTGRES_USER || 'spec';
        process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'spec';
        process.env.POSTGRES_DB = process.env.POSTGRES_DB || 'spec';
    }
    
    // Validate that all required vars are now set
    const required = [
        'POSTGRES_HOST',
        'POSTGRES_PORT', 
        'POSTGRES_USER',
        'POSTGRES_PASSWORD',
        'POSTGRES_DB',
    ];
    
    const missing = required.filter(name => !process.env[name]);
    
    if (missing.length > 0) {
        throw new Error(
            `Test environment incomplete. Missing: ${missing.join(', ')}. ` +
            `Set these in your test environment or CI configuration.`
        );
    }
    
    // Set test-specific flags
    process.env.NODE_ENV = 'test';
    process.env.AUTH_TEST_STATIC_TOKENS = '1';
    process.env.DB_AUTOINIT = 'true';
    process.env.SCOPES_DISABLED = '0';  // Enforce scopes in tests
    
    console.log(`✅ Test environment configured: ${process.env.POSTGRES_USER}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`);
}
```

### Fix 9: Update Test Setup Files

**File:** `apps/server/tests/setup.ts`

```typescript
import { setupTestEnvironment } from './test-env';

// Configure test environment FIRST
setupTestEnvironment();

// ... rest of existing setup code
// Remove all inline fallbacks - they're handled in test-env.ts
```

**File:** `apps/server/tests/test-db-config.ts`

```typescript
import { setupTestEnvironment } from './test-env';

export function ensureTestDbConfig() {
    setupTestEnvironment();
    
    // No more fallbacks here - validation happens in setupTestEnvironment()
    return {
        host: process.env.POSTGRES_HOST!,
        port: Number(process.env.POSTGRES_PORT!),
        user: process.env.POSTGRES_USER!,
        password: process.env.POSTGRES_PASSWORD!,
        database: process.env.POSTGRES_DB!,
    };
}
```

## Phase 5: Documentation Updates

### Fix 10: Update .env.example

**File:** `.env.example`

Add required variables that didn't have examples:

```bash
############################################
# Core Services & Database (REQUIRED)
############################################

# PostgreSQL Connection - REQUIRED
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=spec
POSTGRES_PASSWORD=spec
POSTGRES_DB=spec

# Encryption Key - REQUIRED for production
# Generate with: openssl rand -base64 24
# Must be 32+ characters for AES-256
INTEGRATION_ENCRYPTION_KEY=

############################################
# Vertex AI Configuration (Required if using EMBEDDING_PROVIDER=vertex)
############################################

# Google Cloud Project ID
GCP_PROJECT_ID=your-project-id

# Vertex AI Embedding Configuration
VERTEX_EMBEDDING_PROJECT=your-project-id  # Can use GCP_PROJECT_ID instead
VERTEX_EMBEDDING_LOCATION=us-central1
VERTEX_EMBEDDING_MODEL=text-embedding-004

# Alternative: Use GOOGLE_API_KEY for Gemini API instead of Vertex AI
# GOOGLE_API_KEY=your-api-key
# EMBEDDING_PROVIDER=google

############################################
# Optional Configuration (Has sensible defaults)
############################################

# Server Ports (defaults shown)
# ADMIN_PORT=5175
# SERVER_PORT=3001

# Worker Configuration (defaults shown)
# EMBEDDING_WORKER_INTERVAL_MS=2000
# EMBEDDING_WORKER_BATCH=5
# EXTRACTION_WORKER_POLL_INTERVAL_MS=5000
# EXTRACTION_WORKER_BATCH_SIZE=5

############################################
# Development / Testing
############################################

# Auto-initialize database schema on startup
DB_AUTOINIT=true

# Test database (optional, defaults to POSTGRES_DB)
# POSTGRES_DB_E2E=spec_e2e
```

### Fix 11: Create Migration Guide

**New File:** `docs/ENV_MIGRATION_GUIDE.md`

```markdown
# Environment Variable Migration Guide

## Breaking Changes

The following environment variables now **require explicit values** and no longer have fallbacks:

### Critical (Required in Production)

- `INTEGRATION_ENCRYPTION_KEY` - Must be 32+ characters
  - Generate: `openssl rand -base64 24`
  - No fallback (was: empty string - INSECURE!)

### Required for Features

- `VERTEX_EMBEDDING_LOCATION` - When using `EMBEDDING_PROVIDER=vertex`
  - No fallback (was: `us-central1`)
  
- `VERTEX_EMBEDDING_MODEL` - When using `EMBEDDING_PROVIDER=vertex`
  - No fallback (was: `text-embedding-004`)

### Variable Renames (Standardization)

We're standardizing on `POSTGRES_*` prefix. These aliases are DEPRECATED:

| Old Name | New Name | Action |
|----------|----------|--------|
| `DB_HOST` | `POSTGRES_HOST` | Rename in .env |
| `DB_PORT` | `POSTGRES_PORT` | Rename in .env |
| `DB_USER` | `POSTGRES_USER` | Rename in .env |
| `DB_PASSWORD` | `POSTGRES_PASSWORD` | Rename in .env |
| `DB_NAME` | `POSTGRES_DB` | Rename in .env |

## Migration Steps

### 1. Generate Encryption Key

```bash
openssl rand -base64 24
```

Add to `.env`:
```bash
INTEGRATION_ENCRYPTION_KEY=<generated-key-here>
```

### 2. Update Vertex AI Config

If using `EMBEDDING_PROVIDER=vertex`, add:

```bash
VERTEX_EMBEDDING_LOCATION=us-central1  # or your preferred region
VERTEX_EMBEDDING_MODEL=text-embedding-004  # or your preferred model
```

### 3. Rename Database Variables

```bash
# Old (DEPRECATED - will be removed)
DB_HOST=localhost
DB_PORT=5432
DB_USER=spec
DB_PASSWORD=spec
DB_NAME=spec

# New (USE THESE)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=spec
POSTGRES_PASSWORD=spec
POSTGRES_DB=spec
```

### 4. Test Your Configuration

```bash
# Should start successfully
npm run start:dev

# Should show: ✅ Environment validation passed
```

## Troubleshooting

### Error: "INTEGRATION_ENCRYPTION_KEY is required in production"

**Solution:** Generate and set the encryption key:
```bash
echo "INTEGRATION_ENCRYPTION_KEY=$(openssl rand -base64 24)" >> .env
```

### Error: "POSTGRES_HOST is required"

**Solution:** Your `.env` file is missing or incomplete. Copy from example:
```bash
cp .env.example .env
# Edit .env and fill in your values
```

### Warning: "credentials will be stored unencrypted"

This warning appears in development when `INTEGRATION_ENCRYPTION_KEY` is not set.

**Solution:** Add encryption key even in development:
```bash
echo "INTEGRATION_ENCRYPTION_KEY=$(openssl rand -base64 24)" >> .env
```

### Scripts failing with "Missing Required Environment Variables"

**Solution:** Source your `.env` file before running scripts:
```bash
source .env && npm run seed:demo
```

Or add to your shell profile:
```bash
# Add to ~/.zshrc or ~/.bashrc
alias npm-env='source .env && npm'

# Usage
npm-env run seed:demo
```
```

## Testing Your Changes

### Test 1: Missing Required Var

```bash
# Remove critical var
mv .env .env.backup
unset POSTGRES_HOST

# Try to start
npm run start:dev

# Expected output:
# ❌ Environment Validation Failed:
#   ❌ POSTGRES_HOST is required
# [exits with code 1]
```

### Test 2: Valid Config

```bash
# Restore config
mv .env.backup .env
source .env

# Start server
npm run start:dev

# Expected output:
# ✅ Environment validation passed
# [server starts normally]
```

### Test 3: Script Validation

```bash
# Try script without env
unset POSTGRES_HOST
npm run seed:demo

# Expected output:
# ❌ Missing Required Environment Variables:
#   POSTGRES_HOST
# [exits with code 1]

# With env
source .env && npm run seed:demo
# [should work]
```

## Rollout Plan

1. **Week 1:** Deploy Phase 1 (critical security)
   - Merge encryption service fix
   - Deploy startup validation
   - Monitor logs for missing vars

2. **Week 2:** Deploy Phase 2 (config schema)
   - Add Vertex AI vars to schema
   - Remove provider fallbacks
   - Update documentation

3. **Week 3:** Deploy Phase 3+4 (scripts & tests)
   - Update all scripts with validation
   - Centralize test environment setup
   - Update CI/CD pipelines

4. **Week 4:** Cleanup
   - Remove deprecated DB_* variable support
   - Final documentation pass
   - Announce changes to team

## Communication Template

```
Subject: Breaking Change - Environment Variables Now Require Explicit Values

Hi Team,

We're improving environment variable handling to prevent configuration issues.

**Required Actions:**

1. Add to your .env file:
   ```
   INTEGRATION_ENCRYPTION_KEY=$(openssl rand -base64 24)
   VERTEX_EMBEDDING_LOCATION=us-central1
   VERTEX_EMBEDDING_MODEL=text-embedding-004
   ```

2. Rename DB variables (POSTGRES_* prefix):
   - DB_HOST → POSTGRES_HOST
   - DB_PORT → POSTGRES_PORT
   - etc.

3. Test: `npm run start:dev` should show "✅ Environment validation passed"

**Why:** Previous fallback values could hide configuration problems and security issues.

**Help:** See docs/ENV_MIGRATION_GUIDE.md for full details.

Questions? Reply to this email or check the documentation.
```

---

## Summary

This implementation guide provides:
- ✅ Concrete code changes for each fix
- ✅ New utility files for validation
- ✅ Updated documentation
- ✅ Testing procedures
- ✅ Migration guide for users
- ✅ Rollout plan

All changes prioritize:
1. **Security** - No more unencrypted credentials
2. **Clarity** - Clear error messages
3. **Safety** - Fail fast on misconfiguration
4. **Usability** - Helpful error messages and docs
