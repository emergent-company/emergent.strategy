# Coolify + Infisical Setup Guide

This guide explains how to configure Coolify to deploy the spec-server-2 project with Infisical secrets management.

## Quick Setup (4 Variables Required!)

In Coolify, set these environment variables:

```bash
# Required - Infisical credentials
INFISICAL_API_URL=https://infiscal.kucharz.net
INFISICAL_TOKEN=st.your-dev-token-here
INFISICAL_ENVIRONMENT=dev
INFISICAL_PROJECT_ID=2c273128-5d01-4156-a134-be9511d99c61
```

**That's it!** All other secrets (46 variables) come from Infisical automatically.

## Where to Get These Values

### 1. INFISICAL_API_URL

**Fixed value for self-hosted Infisical:**
```
https://infiscal.kucharz.net
```

This tells the Infisical CLI to use your self-hosted instance instead of the default cloud instance.

### 2. INFISICAL_TOKEN

**IMPORTANT:** The token must be a **Service Token** (not a personal access token).

1. Go to: https://infiscal.kucharz.net
2. Navigate to your project
3. Click **Settings** → **Service Tokens** (NOT "Access Tokens")
4. Create a new **Service Token** for the `dev` environment with:
   - **Name:** `coolify-dev` (or any descriptive name)
   - **Environment:** `dev`
   - **Path:** `/` (root access to all folders)
   - **Permissions:** Read-only is sufficient
5. Copy the token (starts with `st.` followed by many characters)

**Token format:** `st.dev.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx...`

**Common mistakes:**
- ❌ Using personal access token (starts with different prefix)
- ❌ Token for wrong environment
- ❌ Token without access to `/workspace` folder

### 3. INFISICAL_ENVIRONMENT

Choose one:
- `dev` - Development environment
- `staging` - Staging environment
- `production` - Production environment

### 4. INFISICAL_PROJECT_ID

**Fixed value for this project:**
```
2c273128-5d01-4156-a134-be9511d99c61
```

## How It Works

```
Coolify Deployment
│
├─ Coolify injects 3 variables:
│  ├─ INFISICAL_TOKEN
│  ├─ INFISICAL_ENVIRONMENT
│  └─ INFISICAL_PROJECT_ID
│
├─ Starts: infisical-secrets service
│  ├─ Runs: infisical export --token=... --env=dev --path=/workspace
│  ├─ Fetches: 46 secrets from Infisical
│  └─ Writes: /secrets/.env.infisical
│
├─ Starts: db (PostgreSQL)
│  └─ Loads: /secrets/.env.infisical
│
├─ Starts: zitadel (Identity Provider)
│  └─ Loads: /secrets/.env.infisical
│
└─ Starts: login (Zitadel Login UI)
   └─ Loads: /secrets/.env.infisical
```

## What Secrets Come from Infisical?

The `/workspace` folder contains 46 secrets:

**Database:**
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `DATABASE_URL`

**Zitadel (Identity Provider):**
- `ZITADEL_MASTERKEY`
- `ZITADEL_EXTERNALDOMAIN`
- `ZITADEL_HTTP_PORT`, `ZITADEL_LOGIN_PORT`
- `ZITADEL_DATABASE_*` (connection strings)
- `ZITADEL_FIRSTINSTANCE_*` (bootstrap config)
- `ZITADEL_OIDC_*` (OIDC endpoints)

**ClickUp Integration:**
- `CLICKUP_API_KEY`
- `CLICKUP_WORKSPACE_ID`
- `CLICKUP_TEAM_ID`

**And many more...**

See the full list in Infisical UI → `/workspace` folder.

## Deployment Steps in Coolify

1. **Create New Resource**
   - Type: Docker Compose
   - Repository: `github.com/eyedea-io/spec-server`
   - Branch: `master`
   - Compose file: `docker/docker-compose.yml`

2. **Set Environment Variables**
   - Navigate to **Environment Variables** tab
   - Add the 3 variables listed above

3. **Deploy**
   - Click **Deploy**
   - Coolify will pull the repo and start services

4. **Verify Deployment**
   - Check logs: Look for "🔐 Fetching secrets from Infisical..."
   - Should see: "✅ Secrets written to /secrets/.env.infisical"
   - Services should start successfully

## Troubleshooting

### Service doesn't start: "depends_on infisical-secrets service_healthy failed"

**Cause:** Infisical token is invalid or expired

**Fix:**
1. Check token in Coolify environment variables
2. Verify token has access to the project
3. Generate a new token if needed

### Secrets file is empty

**Cause:** Wrong `INFISICAL_ENVIRONMENT` or `INFISICAL_PROJECT_ID`

**Fix:**
1. Verify `INFISICAL_ENVIRONMENT` matches Infisical project (dev/staging/production)
2. Verify `INFISICAL_PROJECT_ID` is correct
3. Check Infisical UI → Project Settings → Project ID

### Services have wrong values

**Cause:** Secrets not updated in Infisical

**Fix:**
1. Update secrets in Infisical UI
2. Restart deployment in Coolify
3. Check logs to confirm fresh secrets loaded

## Updating Secrets

### 1. Update in Infisical

1. Go to https://infiscal.kucharz.net
2. Navigate to `/workspace` folder
3. Update secret values
4. Click **Save**

### 2. Restart Deployment

In Coolify:
1. Go to your deployment
2. Click **Restart**
3. The `infisical-secrets` service will fetch fresh values

## Multi-Environment Setup

You can deploy to multiple environments using the same configuration:

**Development:**
```bash
INFISICAL_TOKEN=st.dev-token-here
INFISICAL_ENVIRONMENT=dev
INFISICAL_PROJECT_ID=2c273128-5d01-4156-a134-be9511d99c61
```

**Staging:**
```bash
INFISICAL_TOKEN=st.staging-token-here
INFISICAL_ENVIRONMENT=staging
INFISICAL_PROJECT_ID=2c273128-5d01-4156-a134-be9511d99c61
```

**Production:**
```bash
INFISICAL_TOKEN=st.prod-token-here
INFISICAL_ENVIRONMENT=production
INFISICAL_PROJECT_ID=2c273128-5d01-4156-a134-be9511d99c61
```

Each environment loads its own secrets from Infisical.

## Benefits

✅ **Minimal configuration** - Only 3 variables in Coolify  
✅ **Centralized secrets** - All in Infisical UI  
✅ **Easy updates** - Change in Infisical, restart in Coolify  
✅ **No secrets in git** - Everything in Infisical  
✅ **Multi-environment** - Same setup for dev/staging/prod  
✅ **Audit trail** - Infisical tracks all changes  

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│ Infisical (infiscal.kucharz.net)                        │
│ Project: 2c273128-5d01-4156-a134-be9511d99c61           │
│                                                          │
│ ┌──────────────────────────────────────────────────┐    │
│ │ /workspace (46 secrets)                          │    │
│ │ ├─ POSTGRES_USER, POSTGRES_PASSWORD              │    │
│ │ ├─ ZITADEL_MASTERKEY, ZITADEL_EXTERNALDOMAIN     │    │
│ │ ├─ CLICKUP_API_KEY, CLICKUP_WORKSPACE_ID         │    │
│ │ └─ ... (all shared infrastructure secrets)       │    │
│ └──────────────────────────────────────────────────┘    │
└─────────────────────────┬───────────────────────────────┘
                          │
                          │ Infisical CLI
                          │
      ┌───────────────────▼──────────────────┐
      │ Coolify Docker Compose               │
      │                                       │
      │ ┌─────────────────────────────────┐  │
      │ │ infisical-secrets               │  │
      │ │ (fetches & writes secrets)      │  │
      │ └────────────┬────────────────────┘  │
      │              │                        │
      │              ├─────────┬─────────┐   │
      │              │         │         │   │
      │       ┌──────▼────┐ ┌──▼────┐ ┌─▼──┐│
      │       │    db     │ │zitadel│ │login││
      │       │(postgres) │ │ (idp) │ │(ui) ││
      │       └───────────┘ └───────┘ └────┘│
      └───────────────────────────────────────┘
```

## Related Documentation

- **Infisical Integration:** `docker/README-INFISICAL.md`
- **Environment Variables:** `docker/.env.example`
- **Server Integration:** `apps/server/src/config/infisical-loader.ts`
- **Admin Integration:** `apps/admin/vite-plugin-infisical.ts`
- **Migration Status:** `INFISICAL_MIGRATION_STATUS.md`

## Need Help?

- **Infisical Issues:** https://infiscal.kucharz.net
- **Project Issues:** https://github.com/eyedea-io/spec-server/issues
- **Logs:** Check Coolify deployment logs for detailed error messages
