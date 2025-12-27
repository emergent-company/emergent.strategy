# Environment Variable Migration Guide

## Overview

We've reorganized environment variables to follow a clear, secure pattern:

- **`.env` files** - Committed safe defaults (no secrets)
- **`.env.local` files** - Gitignored local overrides and secrets
- **Scope-based organization** - Workspace, server, and admin configs separated

## Quick Reference

| File                     | Status        | Contains                      |
| ------------------------ | ------------- | ----------------------------- |
| `.env`                   | ✅ COMMITTED  | Workspace safe defaults       |
| `.env.local`             | ❌ GITIGNORED | Workspace secrets & overrides |
| `apps/server/.env`       | ✅ COMMITTED  | Server safe defaults          |
| `apps/server/.env.local` | ❌ GITIGNORED | Server secrets & overrides    |
| `apps/admin/.env`        | ✅ COMMITTED  | Admin safe defaults           |
| `apps/admin/.env.local`  | ❌ GITIGNORED | Admin secrets & overrides     |

## Loading Precedence

**Server Application:**

```
apps/server/.env.local  (highest)
  ↓
apps/server/.env
  ↓
.env.local
  ↓
.env  (lowest)
```

**Admin Application:**

```
apps/admin/.env.local  (highest)
  ↓
apps/admin/.env  (lowest)
```

**Workspace CLI:**

```
.env.local  (highest)
  ↓
.env  (lowest)
```

## Migration Steps

### Step 1: Backup Your Current Configuration

```bash
# Backup all existing .env files
cp .env .env.backup
cp apps/server/.env apps/server/.env.backup 2>/dev/null || true
cp apps/admin/.env apps/admin/.env.backup 2>/dev/null || true
```

### Step 2: Extract Secrets to .env.local

Create `.env.local` files with ONLY your secrets:

**Root `.env.local`:**

```bash
cat > .env.local <<'EOF'
# Add workspace overrides here if needed
# Example:
# ADMIN_PORT=5177
# SERVER_PORT=3003
EOF
```

**`apps/server/.env.local`:**

```bash
cat > apps/server/.env.local <<'EOF'
# Real API keys and credentials go here
GOOGLE_API_KEY=AIza...your-real-key
POSTGRES_PASSWORD=your-secure-password
ZITADEL_CLIENT_JWT=eyJhbGc...
LANGSMITH_API_KEY=lsv2_pt_...
EOF
```

**`apps/admin/.env.local`:**

```bash
cat > apps/admin/.env.local <<'EOF'
# Real client ID from your Zitadel instance
VITE_ZITADEL_CLIENT_ID=123456789012345
# Custom overrides if needed
# VITE_API_BASE=http://localhost:3003
EOF
```

### Step 3: Update .env Files with Safe Defaults

Copy example files and customize:

```bash
# Root workspace config
cp .env.example .env
# Edit and set: NAMESPACE, ports, test users

# Server config
cp apps/server/.env.example apps/server/.env
# Keep placeholders for secrets

# Admin config
cp apps/admin/.env.example apps/admin/.env
# Use placeholder client ID
```

### Step 4: Verify No Secrets in .env Files

```bash
# Check for common secret patterns
grep -E "AIza|lsv2_pt|eyJhbGc|BEGIN.*KEY" .env apps/server/.env apps/admin/.env

# If found, move them to .env.local files!
```

### Step 5: Test Your Configuration

```bash
# Start workspace services
nx run workspace-cli:workspace:start

# Check logs for any missing variables
nx run workspace-cli:workspace:logs
```

### Step 6: Verify .env.local is Gitignored

```bash
# Should show .env.local files are gitignored
git check-ignore .env.local apps/server/.env.local apps/admin/.env.local

# Should be empty (no .env.local files tracked)
git ls-files | grep ".env.local"
```

### Step 7: Clean Up Backups (After Verification)

```bash
# Once everything works, remove backups
rm .env.backup apps/server/.env.backup apps/admin/.env.backup
```

## What Goes Where?

### Root `.env` (Workspace Defaults)

**✅ Include:**

- `NAMESPACE=spec-server-2`
- `ADMIN_PORT=5176`
- `SERVER_PORT=3002`
- `ZITADEL_DOMAIN=localhost:8200`
- Test user credentials (for dev)

**❌ Exclude:**

- Database config → `apps/server/.env`
- API keys → `apps/server/.env.local`
- LLM config → `apps/server/.env`

### `apps/server/.env` (Server Defaults)

**✅ Include:**

- `POSTGRES_HOST=localhost` (safe default)
- `POSTGRES_PASSWORD=spec` (dev default)
- `GOOGLE_API_KEY=` (placeholder)
- Feature flags with safe defaults

**❌ Exclude:**

- Real API keys → `apps/server/.env.local`
- Production credentials → `apps/server/.env.local`

### `apps/admin/.env` (Admin Defaults)

**✅ Include:**

- `VITE_ZITADEL_ISSUER=http://localhost:8080`
- `VITE_ZITADEL_CLIENT_ID=your-public-client-id-here` (placeholder)
- `VITE_API_BASE=` (empty for proxy)

**❌ Exclude:**

- Real client IDs → `apps/admin/.env.local` (though public, keep consistent)

### `.env.local` Files (Secrets & Overrides)

**✅ Include:**

- Real API keys: `GOOGLE_API_KEY=AIza...`
- Real credentials: `POSTGRES_PASSWORD=secure123`
- Custom ports: `ADMIN_PORT=5177`
- Auth tokens: `LANGSMITH_API_KEY=lsv2_pt_...`
- Any user-specific customizations

## Troubleshooting

### Services Can't Find Variables

**Problem:** Missing environment variables after migration.

**Solution:** Check loading precedence - `.env.local` should contain your secrets:

```bash
# Debug server env loading
DEBUG_ENV_LOAD=1 nx run server:serve

# Check which files were loaded
```

### Accidentally Committed Secrets

**Problem:** Secrets were committed to `.env` files.

**Solution:**

1. **Immediately rotate the compromised secrets**
2. Move secrets to `.env.local`:
   ```bash
   # Extract to .env.local
   echo "GOOGLE_API_KEY=new-rotated-key" >> apps/server/.env.local
   ```
3. Replace with placeholders in `.env`:
   ```bash
   # In apps/server/.env
   GOOGLE_API_KEY=your-key-here
   ```
4. Commit the change:
   ```bash
   git add apps/server/.env
   git commit -m "security: remove secrets from committed .env"
   ```
5. Consider cleaning git history with BFG Repo-Cleaner

### .env.local Not Being Loaded

**Problem:** Values in `.env.local` aren't overriding `.env`.

**Solution:** Verify `.env.local` is in the correct location and has correct syntax:

```bash
# Check file exists
ls -la .env.local apps/server/.env.local apps/admin/.env.local

# Check syntax (no spaces around =)
cat apps/server/.env.local
# Correct: GOOGLE_API_KEY=value
# Wrong: GOOGLE_API_KEY = value
```

### Vite Not Exposing Variables

**Problem:** Frontend can't access environment variables.

**Solution:** Only `VITE_*` prefixed variables are exposed:

```bash
# In apps/admin/.env.local
VITE_ZITADEL_CLIENT_ID=123456789  # ✅ Exposed
GOOGLE_API_KEY=secret              # ❌ Not exposed (backend only)
```

## Security Best Practices

1. **Never commit secrets** - Always use `.env.local` for sensitive data
2. **Rotate exposed secrets** - If accidentally committed, rotate immediately
3. **Use placeholders** - Keep `GOOGLE_API_KEY=your-key-here` in `.env`
4. **Review before commit** - Check `.env` files don't contain real secrets
5. **Document required secrets** - Use comments to indicate what goes in `.env.local`

## Example Configurations

### Development Setup

**`.env`:**

```bash
NAMESPACE=spec-server-2
ADMIN_PORT=5176
SERVER_PORT=3002
ZITADEL_DOMAIN=localhost:8200
```

**`.env.local`:**

```bash
# Empty or minimal overrides
```

**`apps/server/.env`:**

```bash
POSTGRES_HOST=localhost
POSTGRES_PASSWORD=spec
GOOGLE_API_KEY=your-key-here
```

**`apps/server/.env.local`:**

```bash
GOOGLE_API_KEY=AIza_real_key_here
LANGSMITH_API_KEY=lsv2_pt_real_key
```

### Production Deployment

Production should use:

- Environment-specific secrets management (AWS Secrets Manager, Infisical, etc.)
- `.env` files with safe defaults (if deployed via git)
- Platform environment variables for secrets (not `.env.local`)

## Need Help?

- Check the specification: `openspec/changes/reorganize-environment-variables/`
- Review example files: `.env.example`, `apps/server/.env.example`, `apps/admin/.env.example`
- Run tests: `nx run server:test` and `nx run admin:test`
- Check logs: `nx run workspace-cli:workspace:logs`
