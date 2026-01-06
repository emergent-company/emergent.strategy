# Infisical Quick Reference

## Access Infisical

**URL:** https://infiscal.kucharz.net  
**Project ID:** `2c273128-5d01-4156-a134-be9511d99c61`  
**Environment:** `local`

## Service Tokens

**Local (write):**
```
st.b94ab531-9cbe-48c6-aee0-74606e6b7ac9.d10902aca2ec46ebc41587c2ba40e2c7.b1860d00f5b3672075148d7ec8c76a91
```

**All Environments (read/write):**
```
st.9c24d992-b18e-40cd-86a1-1c33ab46f66f.e64a392640716f6080f8b25044fd13b2.7633a36bb3bf769d0268ca03aa1af9ef
```

## Folder Structure

```
local/
├── /workspace (26 secrets) - Ports, namespace, shared config
├── /server (13 secrets)    - Database, APIs, Vertex AI
├── /admin (6 secrets)      - VITE_* frontend variables
└── /docker (27 secrets)    - Zitadel configuration
```

## Configuration Files

All `.env` files now contain only:
```bash
INFISICAL_ENABLED=true
INFISICAL_SITE_URL=https://infiscal.kucharz.net
INFISICAL_PROJECT_ID=2c273128-5d01-4156-a134-be9511d99c61
INFISICAL_ENVIRONMENT=local
INFISICAL_TOKEN=st.b94ab531-9cbe-48c6-aee0-74606e6b7ac9...
```

**Files:**
- `.env` (root)
- `docker/.env`
- `apps/server/.env.local`
- `apps/admin/.env.local`

## Archive Location

**Path:** `secrets-dev/archive/20251123_215039/`  
**Files:** 34 environment files backed up

## Common Commands

**View secrets in a folder:**
```bash
/tmp/review-infisical-env.sh local <TOKEN>
```

**Create folders in new environment:**
```bash
/tmp/create-infisical-folders.sh <environment> <TOKEN>
```

**Upload secrets with folder structure:**
```bash
/tmp/upload-with-folders-v2.sh <environment> <TOKEN> <env-file>
```

## Restore Old Configuration

```bash
# Single file
cp secrets-dev/archive/20251123_215039/.env .env

# All files
rsync -av secrets-dev/archive/20251123_215039/ ./
```

## Test Credentials

**Username:** testuser@spec-demo.emergentmethods.ai  
**Password:** TestUser123!

## Services

- **PostgreSQL:** localhost:5432
- **Zitadel:** localhost:8200/8201
- **Server API:** localhost:3002
- **Admin App:** localhost:5176

## Documentation

- Full summary: `INFISICAL_MIGRATION_COMPLETE.md`
- Archive README: `secrets-dev/archive/20251123_215039/README.md`
- Migration guide: `docs/migrations/migrate-secrets-to-infisical.md`
