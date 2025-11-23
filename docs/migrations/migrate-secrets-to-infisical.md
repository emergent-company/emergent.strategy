# Migrate Secrets to Infisical

This guide walks you through migrating all environment variables from `.env` files to your self-hosted Infisical instance.

## Overview

The migration script (`scripts/migrate-secrets-to-infisical.ts`) will:
1. Read your local `.env` files (`.env`, `.env.staging`, `docker/.env`)
2. Categorize secrets into folders based on ownership:
   - `/workspace` - Shared config (ports, URLs, namespace)
   - `/server` - Backend secrets (database, APIs, auth)
   - `/admin` - Frontend config (VITE_* variables)
   - `/docker` - Docker dependency config (Zitadel, PostgreSQL)
3. Push secrets to Infisical via API with proper folder structure
4. Skip Infisical bootstrap credentials (to avoid circular dependency)

## Prerequisites

### 1. Create Infisical Projects

In your Infisical dashboard, create projects for each environment:

```
spec-server-dev
spec-server-staging
spec-server-production
```

For each project, create environments:
- `dev` (for spec-server-dev)
- `staging` (for spec-server-staging)
- `production` (for spec-server-production)

**Note the Project IDs** - you'll need these in step 2.

### 2. Create Machine Identity & Get API Token

For each project:

1. Go to **Project Settings** → **Access Control** → **Machine Identities**
2. Click **Create Machine Identity** (or use existing)
3. Choose **Universal Auth** method
4. Give it a name: `migration-script` or `spec-server-dev-admin`
5. Set permissions: **Admin** (or at least read/write for secrets)
6. Generate **Client ID** and **Client Secret**
7. **Get Access Token** via API:

```bash
curl -X POST https://your-infisical.com/api/v1/auth/universal-auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET"
  }'
```

**Save the access token** - you'll use it as `INFISICAL_API_TOKEN`.

### 3. Configure Environment Variables

Create a temporary `.env.infisical` file (or add to your shell profile):

```bash
# Your self-hosted Infisical instance
INFISICAL_SITE_URL=https://infisical.yourdomain.com

# API token from step 2
INFISICAL_API_TOKEN=eyJhbGc...your-token-here

# Project IDs from step 1
INFISICAL_PROJECT_ID_DEV=proj_abc123...
INFISICAL_PROJECT_ID_STAGING=proj_def456...
INFISICAL_PROJECT_ID_PRODUCTION=proj_ghi789...
```

Then load it:
```bash
source .env.infisical
```

Or export variables individually:
```bash
export INFISICAL_SITE_URL=https://infisical.yourdomain.com
export INFISICAL_API_TOKEN=eyJhbGc...
export INFISICAL_PROJECT_ID_DEV=proj_abc123...
# etc.
```

## Migration Steps

### Step 1: Dry Run (Recommended)

First, run in dry-run mode to see what would be migrated:

```bash
npm run migrate-secrets:dry-run
```

This will:
- Parse your `.env` files
- Show which secrets would be pushed to which folders
- Display a summary by environment and folder
- **NOT actually push anything** to Infisical

**Review the output carefully** to ensure:
- Variables are categorized correctly
- Sensitive data isn't exposed
- Folder structure matches expectations

### Step 2: Migrate Development Environment Only

Once dry run looks good, migrate just dev environment first:

```bash
npm run migrate-secrets -- --env=dev
```

This will:
- Push secrets from `.env` to `spec-server-dev` project
- Push secrets from `docker/.env` to `/docker` folder in dev
- Skip Infisical bootstrap variables
- Create folders automatically if they don't exist

**After migration:**
1. Go to Infisical dashboard
2. Navigate to `spec-server-dev` project → `dev` environment
3. Verify secrets are in correct folders:
   - `/workspace` - NAMESPACE, ports, URLs
   - `/server` - DATABASE_URL, API keys, auth secrets
   - `/admin` - VITE_* variables
   - `/docker` - Zitadel and PostgreSQL config
4. Check secret values match your `.env` files

### Step 3: Migrate Staging/Production (Optional)

If you have `.env.staging` or `.env.production` files:

```bash
# Staging
npm run migrate-secrets -- --env=staging

# Production
npm run migrate-secrets -- --env=production

# Or migrate all at once
npm run migrate-secrets
```

### Step 4: Verify & Test

After migration, test the integration:

1. **Install Infisical SDK** (if not already):
   ```bash
   npm install @infisical/sdk --workspace apps/server
   npm install @infisical/sdk --workspace apps/admin
   ```

2. **Test fetching secrets** (Phase 2-5 of the main change proposal):
   - Add SDK integration to server startup
   - Add SDK integration to admin app initialization
   - Add SDK integration to workspace-cli
   - Test Docker dependencies with Infisical secrets

3. **Keep `.env` files as backup** until fully tested:
   ```bash
   # Don't delete .env files yet!
   cp .env .env.backup
   cp docker/.env docker/.env.backup
   ```

## Troubleshooting

### Error: "INFISICAL_API_TOKEN environment variable is required"

**Solution:** Export the API token before running:
```bash
export INFISICAL_API_TOKEN=eyJhbGc...your-token-here
npm run migrate-secrets:dry-run
```

### Error: "No Infisical project IDs configured"

**Solution:** Set project ID environment variables:
```bash
export INFISICAL_PROJECT_ID_DEV=proj_abc123...
export INFISICAL_PROJECT_ID_STAGING=proj_def456...
npm run migrate-secrets:dry-run
```

### Error: "Failed to push SECRET_NAME: 401 Unauthorized"

**Solution:** 
1. Check API token is valid (tokens expire after a certain period)
2. Verify machine identity has write permissions in the project
3. Regenerate token if needed (see Prerequisites step 2)

### Error: "Failed to create folder /workspace: 403 Forbidden"

**Solution:** Ensure machine identity has **Admin** or **Write** permissions in project settings.

### Variables in Wrong Folder

**Solution:** Update the `VAR_TO_FOLDER_MAP` in `scripts/migrate-secrets-to-infisical.ts`:

```typescript
const VAR_TO_FOLDER_MAP: Record<string, string> = {
  // Add your variable mappings here
  MY_CUSTOM_VAR: 'server',  // Goes to /server folder
  MY_FRONTEND_VAR: 'admin',  // Goes to /admin folder
  // etc.
};
```

Then re-run the migration.

## What Gets Excluded?

The following variables are **NOT migrated** to Infisical (they stay in `.env` files):

- `INFISICAL_CLIENT_ID`
- `INFISICAL_CLIENT_SECRET`
- `INFISICAL_PROJECT_ID`
- `INFISICAL_PROJECT_ID_DEV`
- `INFISICAL_PROJECT_ID_STAGING`
- `INFISICAL_PROJECT_ID_PRODUCTION`
- `INFISICAL_ENVIRONMENT`
- `INFISICAL_SITE_URL`
- `INFISICAL_API_TOKEN`

**Why?** These are bootstrap credentials needed to connect to Infisical. Storing them in Infisical would create a circular dependency (need Infisical to read Infisical credentials).

## Folder Structure

After migration, your Infisical project will have this structure:

```
spec-server-dev (project)
└── dev (environment)
    ├── /workspace
    │   ├── NAMESPACE
    │   ├── ADMIN_PORT
    │   ├── SERVER_PORT
    │   ├── ADMIN_URL
    │   └── SERVER_URL
    ├── /server
    │   ├── DATABASE_URL
    │   ├── POSTGRES_HOST
    │   ├── POSTGRES_PORT
    │   ├── POSTGRES_USER
    │   ├── POSTGRES_PASSWORD
    │   ├── POSTGRES_DB
    │   ├── ZITADEL_ISSUER
    │   ├── ZITADEL_CLIENT_ID
    │   ├── ZITADEL_CLIENT_SECRET
    │   ├── JWT_SECRET
    │   ├── CLICKUP_API_TOKEN
    │   ├── LANGSMITH_API_KEY
    │   ├── OPENAI_API_KEY
    │   ├── ANTHROPIC_API_KEY
    │   └── (all other backend secrets)
    ├── /admin
    │   ├── VITE_SERVER_URL
    │   ├── VITE_ZITADEL_ISSUER
    │   ├── VITE_ZITADEL_CLIENT_ID
    │   ├── VITE_ZITADEL_REDIRECT_URI
    │   └── (all other VITE_* variables)
    └── /docker
        ├── ZITADEL_MASTERKEY
        ├── ZITADEL_TOKEN_KEY
        ├── ZITADEL_EXTERNALDOMAIN
        ├── ZITADEL_DATABASE_POSTGRES_HOST
        ├── ZITADEL_DATABASE_POSTGRES_PASSWORD
        └── (all Zitadel and PostgreSQL config)
```

## Next Steps

After successful migration:

1. **Phase 2-5**: Integrate Infisical SDK into apps
   - See `openspec/changes/integrate-infisical-secrets-management/tasks.md`
   - Start with Phase 2 (Server SDK integration)

2. **Update `.env.example`**: Add Infisical bootstrap template:
   ```bash
   # Infisical Configuration
   INFISICAL_CLIENT_ID=
   INFISICAL_CLIENT_SECRET=
   INFISICAL_PROJECT_ID=
   INFISICAL_ENVIRONMENT=dev
   INFISICAL_SITE_URL=https://infisical.yourdomain.com
   ```

3. **Archive old `.env` files**: Once fully tested, move to `secrets-dev/archive/`

4. **Update documentation**: Update setup guides to mention Infisical instead of `.env` files

## Security Notes

- **Never commit `.env.infisical`** with API tokens - add to `.gitignore`
- **API tokens expire** - you'll need to regenerate periodically
- **Machine identities** should have minimum required permissions
- **Rotate secrets** after migration (optional but recommended for production)
- **Access logs** are available in Infisical for audit trail

## Support

For issues with:
- **Infisical API**: Check [Infisical API docs](https://infisical.com/docs/api-reference)
- **Migration script**: See `scripts/migrate-secrets-to-infisical.ts` code comments
- **Change proposal**: See `openspec/changes/integrate-infisical-secrets-management/`
