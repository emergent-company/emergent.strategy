# Environment Files Archive - 2025-11-23 21:50:39

## What's Archived

This archive contains all environment files from before the Infisical migration.

### Root Directory
- `.env` - Main environment configuration
- `.env.bak` - Backup of main config
- `.env.coolify.buildtime` - Coolify build-time config
- `.env.coolify.runtime` - Coolify runtime config
- `.env.dev.local` - Local dev overrides
- `.env.e2e` - E2E test configuration
- `.env.local` - Local overrides
- `.env.local.bak` - Backup of local config
- `.env.local.remote` - Remote dev config
- `.env.opencode` - OpenCode AI config
- `.env.production.example` - Production template
- `.env.remote` - Remote environment config
- `.env.staging` - Staging environment config
- `.env.test` - Test configuration
- `.env.test.local` - Local test overrides
- `.env.test.local.example` - Test template
- `.envrc` - direnv configuration

### Docker Directory
- `docker/.env` - Docker services configuration
- `docker/.env.coolify` - Coolify Docker config
- `docker/.env.example-instance2` - Multi-instance example

### Apps Directory
- `apps/admin/.env` - Admin app config
- `apps/admin/.env.e2e` - Admin E2E config
- `apps/admin/.env.local` - Admin local config
- `apps/admin/.env.local.bak` - Admin backup
- `apps/admin/.env.old` - Old admin config
- `apps/server/.env` - Server config
- `apps/server/.env.backup` - Server backup
- `apps/server/.env.backup2` - Server backup 2
- `apps/server/.env.bak` - Server backup alt
- `apps/server/.env.bak2` - Server backup alt 2
- `apps/server/.env.e2e.scenarios` - E2E scenarios config
- `apps/server/.env.local` - Server local config
- `apps/server/.env.local.bak` - Server local backup
- `apps/server/.env.local.remote` - Server remote config

## Migration Summary

**Date:** November 23, 2025
**Action:** Migrated all secrets to Infisical
**Infisical Project:** 2c273128-5d01-4156-a134-be9511d99c61
**Environment:** local

### Secrets Organization in Infisical

All secrets are now organized in folders:
- `/workspace` - 26 secrets (shared config, ports, namespace)
- `/server` - 13 secrets (database, APIs, Vertex AI)
- `/admin` - 6 secrets (VITE_* frontend variables)
- `/docker` - 27 secrets (Zitadel configuration)

**Total:** 72 secrets

## Current Configuration

After migration, all `.env` files contain only Infisical bootstrap credentials:

```bash
INFISICAL_ENABLED=true
INFISICAL_SITE_URL=https://infiscal.kucharz.net
INFISICAL_PROJECT_ID=2c273128-5d01-4156-a134-be9511d99c61
INFISICAL_ENVIRONMENT=local
INFISICAL_TOKEN=st.b94ab531-9cbe-48c6-aee0-74606e6b7ac9...
```

## Restoration

If you need to restore the old configuration:

```bash
# Restore a specific file
cp secrets-dev/archive/20251123_215039/.env .env

# Restore all files
rsync -av secrets-dev/archive/20251123_215039/ ./
```

## Security Notes

⚠️ **Important:** This archive contains sensitive credentials and secrets.

- Never commit this directory to version control
- Ensure it's listed in `.gitignore`
- Delete when no longer needed
- Store securely if backing up

## Related Documentation

- Migration guide: `docs/migrations/migrate-secrets-to-infisical.md`
- Infisical setup: `docker/README-INFISICAL.md`
- Setup guide: `/tmp/infisical-setup-guide.md`
