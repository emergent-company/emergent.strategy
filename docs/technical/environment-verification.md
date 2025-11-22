# Environment Variables Verification

This document describes the environment variable verification script and how to use it for configuration sanity checks.

## Overview

The `verify-env` script performs comprehensive checks on environment variables across the workspace to ensure correct configuration before running the application. It helps catch configuration issues early without needing to run the full application.

## Features

### 1. Variable Existence Checks

- Verifies all required variables are set
- Reports missing required variables
- Lists optional variables (in verbose mode)

### 2. Variable Placement Validation

- Detects variables in wrong files (e.g., server vars in root files)
- Warns about secrets in committed files
- Suggests correct file locations

### 3. Value Validation

- Port numbers (1-65535)
- Boolean values (true/false, 0/1)
- Number ranges
- Threshold values (0.0-1.0)
- URL formats
- Email formats
- Embedding dimension consistency

### 4. Service Connectivity Tests

- **Vertex AI**: Tests authentication and API access
- **PostgreSQL**: Tests database connection
- **Zitadel**: Tests OIDC discovery endpoint

### 5. Configuration Sanity

- Detects common misconfigurations
- Suggests fixes for errors
- Provides context for warnings

### 6. Variable Usage Analysis

- **Lists which files in YOUR source code use each variable**
- Identifies unused variables (not referenced anywhere)
- Highlights single-file variables (used in only one place)
- Shows detailed file listings in verbose mode
- **Excludes dependencies** - only searches your code in `apps/`, `scripts/`, `tools/`
- Helps identify dead configuration and understand refactoring impact

**Note:** Only searches source code (TypeScript, JavaScript files), not:

- `node_modules/` - dependencies
- `dist/`, `build/` - build artifacts
- Configuration where variables are DEFINED (e.g., `.env` files)
- Only shows where variables are USED in your code

## Usage

### Basic Verification

```bash
npm run verify-env
```

Runs all checks including connectivity tests.

### Quick Mode (Skip Connectivity)

```bash
npm run verify-env -- --quick
```

Skips service connectivity tests for faster validation.

### Verbose Mode

```bash
npm run verify-env -- --verbose
```

Shows all details including optional variables and configuration info.

### With Fix Suggestions

```bash
npm run verify-env -- --fix
```

Shows suggested fixes for all errors.

### With Usage Analysis

```bash
npm run verify-env -- --usage
```

Analyzes your source code to show which files use each variable. Shows:

- Unused variables (not referenced in any source file)
- Summary: "X unused, Y used (Z in single file)"

**Example output:**

```
─── Unused Variables ───
⚠️  GOOGLE_REDIRECT_URL is defined but not used in source code
⚠️  ORGS_DEMO_SEED is defined but not used in source code

✅ Usage analysis complete: 7 unused, 63 used (9 in single file)
```

**Note:** Combine with `--verbose` to see detailed file listings:

```bash
npm run verify-env -- --usage --verbose
```

**Verbose output shows which files use each variable:**

```
─── Variable Usage by File ───

NODE_ENV (39 files)
  • scripts/setup-e2e-tests.mjs
  • tools/workspace-cli/src/config/application-processes.ts
  • apps/server/src/common/config/config.schema.ts
  ... and 36 more file(s)

CORS_ORIGIN (1 file)
  • apps/server/src/main.ts

TEST_USER_EMAIL (1 file)
  • scripts/test-chat-sdk-search.mjs
```

This helps you:

- **Find dead configuration** - variables defined but never used
- **Understand scope** - is it used in one place or everywhere?
- **Plan refactoring** - see exactly which files need updating

### Help

```bash
npm run verify-env -- --help
```

Displays help information.

## Exit Codes

- **0**: All checks passed ✅
- **1**: Errors found (blocking issues) ❌
- **2**: Warnings only (non-blocking) ⚠️

## Variable Specifications

**The verification script now reads variable specifications directly from `.env.example` files.**

This means the `.env.example` files serve as both:

1. **Documentation** - Examples and safe defaults for developers
2. **Specification** - Source of truth for the verification script

### Metadata Format

Each variable in `.env.example` files can have metadata tags in its comment:

```bash
# Variable description (REQUIRED) (SECRET)
VARIABLE_NAME=default_value
```

**Supported tags (case-insensitive):**

- `(REQUIRED)` - Variable must be set
- `(OPTIONAL)` - Variable is optional
- `(SECRET)` - Variable contains sensitive data (must be in .env.local)

**Heuristic fallback** (if no tag specified):

- Empty value or placeholder → Assumed REQUIRED
- Has a value → Assumed OPTIONAL

**Examples:**

```bash
# Database password (REQUIRED) (SECRET)
POSTGRES_PASSWORD=

# Enable debug mode (OPTIONAL)
DEBUG_MODE=false

# API endpoint (REQUIRED)
API_URL=
```

### Root Variables (.env, .env.local)

**Required:**

- `NAMESPACE` - PM2 namespace for process management
- `ADMIN_PORT` - Frontend port
- `SERVER_PORT` - Backend API port
- `ZITADEL_DOMAIN` - OIDC authority domain

**Optional:**

- `TEST_USER_EMAIL` - Manual test user email
- `TEST_USER_PASSWORD` - Manual test user password (SECRET)
- `E2E_TEST_USER_EMAIL` - E2E test user email
- `E2E_TEST_USER_PASSWORD` - E2E test user password (SECRET)

See `.env.example` for complete list and descriptions.

### Server Variables (apps/server/.env, apps/server/.env.local)

**Required:**

- `PORT` - Server port
- `NODE_ENV` - Environment (development/production)
- `POSTGRES_HOST` - Database host
- `POSTGRES_PORT` - Database port
- `POSTGRES_USER` - Database user
- `POSTGRES_PASSWORD` - Database password (SECRET)
- `POSTGRES_DB` - Database name
- `GCP_PROJECT_ID` - Google Cloud project
- `VERTEX_AI_LOCATION` - Vertex AI region
- `VERTEX_AI_MODEL` - LLM model name

**Optional:** 40+ variables including:

- Database configuration
- Authentication (Zitadel)
- AI/LLM settings
- Extraction worker configuration
- Observability (LangSmith)
- Testing/seeding

See `apps/server/.env.example` for complete list with descriptions and metadata.

### Admin Variables (apps/admin/.env, apps/admin/.env.local)

**Required:**

- `VITE_API_BASE` - Backend API URL
- `VITE_ZITADEL_CLIENT_ID` - OIDC client ID

**Optional:**

- `VITE_ZITADEL_ISSUER` - OIDC issuer URL
- `VITE_ZITADEL_REDIRECT_URI` - OAuth redirect URI
- `VITE_ZITADEL_POST_LOGOUT_REDIRECT_URI` - OAuth post-logout URI
- `VITE_ZITADEL_SCOPES` - OAuth scopes
- `VITE_ZITADEL_AUDIENCE` - OAuth audience
- `VITE_ENV` - Environment name
- `VITE_CLIENT_LOGGING` - Client-side logging
- `ADMIN_PORT` - Dev server port

See `apps/admin/.env.example` for complete list with descriptions and metadata.

## Common Issues and Fixes

### Missing Required Variables

```
❌ Required variable not set: GCP_PROJECT_ID
💡 Fix: Set GCP_PROJECT_ID in apps/server/.env.local
```

**Solution:** Add the variable to the suggested file.

### Variables in Wrong Files

```
⚠️  Server variable POSTGRES_HOST found in root file .env
ℹ️  Server-specific variables should be in apps/server/.env or apps/server/.env.local
```

**Solution:** Move the variable to the correct file location.

### Secrets in Committed Files

```
❌ Secret POSTGRES_PASSWORD found in committed file apps/server/.env
💡 Fix: Move POSTGRES_PASSWORD to apps/server/.env.local (gitignored)
```

**Solution:** Move secrets to `.env.local` files which are gitignored.

### Invalid Port Numbers

```
❌ Invalid port for SERVER_PORT: 99999
💡 Fix: Must be a number between 1 and 65535
```

**Solution:** Use a valid port number.

### Invalid Embedding Dimension

```
⚠️  EMBEDDING_DIMENSION is 1536, but text-embedding-004 uses 768
ℹ️  Update EMBEDDING_DIMENSION to 768 to match text-embedding-004
```

**Solution:** Update `EMBEDDING_DIMENSION=768` to match the model.

### Vertex AI Connection Failed

```
❌ Vertex AI initialization failed: Invalid project ID
💡 Fix: Check GCP_PROJECT_ID and VERTEX_AI_LOCATION
```

**Solution:** Verify GCP credentials and project ID are correct.

### PostgreSQL Connection Failed

```
❌ PostgreSQL connection failed: Connection refused
💡 Fix: Check POSTGRES_* variables and ensure database is running
```

**Solution:** Start PostgreSQL or verify connection settings.

### Zitadel Connection Failed

```
❌ Zitadel connection failed: Failed to fetch
💡 Fix: Check ZITADEL_ISSUER and network connectivity
```

**Solution:** Start Zitadel or verify the issuer URL.

## Integration with CI/CD

### GitHub Actions

```yaml
- name: Verify Environment Configuration
  run: npm run verify-env -- --quick
```

Use `--quick` in CI to skip connectivity tests (services may not be available).

### Pre-commit Hook

```bash
#!/bin/sh
npm run verify-env -- --quick || {
  echo "Environment configuration issues detected."
  echo "Run 'npm run verify-env' for details."
  exit 1
}
```

### Docker Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD npm run verify-env -- --quick || exit 1
```

## Extending the Verification Script

### Adding New Variables

**To add a new variable, simply add it to the appropriate `.env.example` file with metadata tags:**

```bash
# apps/server/.env.example

# My new API key (REQUIRED) (SECRET)
MY_API_KEY=

# My feature flag (OPTIONAL)
MY_FEATURE_ENABLED=false
```

The verification script will automatically:

- ✅ Detect required vs optional status
- ✅ Identify secrets
- ✅ Check for existence
- ✅ Validate placement
- ✅ Analyze usage in code

**No code changes needed!**

### Metadata Tag Reference

| Tag          | Effect                                        |
| ------------ | --------------------------------------------- |
| `(REQUIRED)` | Variable must be set                          |
| `(OPTIONAL)` | Variable is optional                          |
| `(SECRET)`   | Variable is sensitive (must be in .env.local) |

**Fallback behavior (no tag):**

- Empty value: `VAR_NAME=` → Treated as REQUIRED
- Has value: `VAR_NAME=something` → Treated as OPTIONAL

### Adding Custom Validators

Add validation logic in `validateVariableValues()` function in `scripts/verify-env.mjs`:

```javascript
// Custom validation
const myVar = process.env.MY_VAR;
if (myVar && !myVar.startsWith('prefix_')) {
  addError(`MY_VAR must start with 'prefix_'`);
}
```

### Adding Service Connectivity Tests

Add a new test function and call it in `testServiceConnectivity()`:

```javascript
async function testMyService() {
  section('My Service');
  try {
    // Test connection
    addPassed('My Service is accessible');
  } catch (err) {
    addError(`My Service connection failed: ${err.message}`);
  }
}
```

## Related Scripts

- `scripts/test-vertex-ai-credentials.mjs` - Detailed Vertex AI testing
- `scripts/validate-schema.ts` - Database schema validation
- `scripts/sync-agent-instructions.mjs` - AI agent instructions sync

## See Also

- [Environment Variables Documentation](./environment-variables-audit.md)
- [Configuration Files](../../.env.example)
- [Server Configuration](../../apps/server/.env.example)
- [Admin Configuration](../../apps/admin/.env.example)
