# Infisical Integration for Docker Compose

This document explains how to use Infisical secrets with Docker Compose, specifically for Coolify deployments.

## Overview

The Docker Compose stack includes an `infisical-secrets` service that:
1. Fetches secrets from Infisical `/workspace` folder
2. Writes them to a shared volume as `.env.infisical`
3. Other services load these secrets using `env_file`

## Coolify Setup (Minimal Configuration)

### 1. Set Environment Variables in Coolify

**Only these 3 variables are required:**

```bash
INFISICAL_TOKEN=st.your-dev-token-here
INFISICAL_ENVIRONMENT=dev
INFISICAL_PROJECT_ID=2c273128-5d01-4156-a134-be9511d99c61
```

**Where to get these:**
- **Token:** https://infiscal.kucharz.net → Project Settings → Service Tokens
- **Environment:** `dev`, `staging`, or `production`
- **Project ID:** Fixed value (shown above)

### 2. Deploy

Coolify will:
1. Start `infisical-secrets` service
2. Fetch all 46 secrets from `/workspace` folder
3. Write to `/secrets/.env.infisical`
4. Start `db`, `zitadel`, `login` with secrets loaded

**All secrets come from Infisical automatically - no manual copying!**

## How It Works

### Docker Compose Architecture

```yaml
services:
  infisical-secrets:
    image: infisical/cli:latest
    # Runs: infisical export --token=... --env=dev --path=/workspace
    # Writes: /secrets/.env.infisical
    volumes:
      - infisical_secrets:/secrets

  db:
    depends_on:
      infisical-secrets: { condition: service_healthy }
    env_file:
      - /secrets/.env.infisical  # Loads Infisical secrets
    volumes:
      - infisical_secrets:/secrets:ro  # Read-only access

  zitadel:
    depends_on:
      infisical-secrets: { condition: service_healthy }
    env_file:
      - /secrets/.env.infisical  # Loads Infisical secrets
    volumes:
      - infisical_secrets:/secrets:ro

  login:
    depends_on:
      infisical-secrets: { condition: service_healthy }
    env_file:
      - /secrets/.env.infisical  # Loads Infisical secrets
    volumes:
      - infisical_secrets:/secrets:ro
```

### Secret Loading Flow

```
Coolify Deployment
├─ Sets: INFISICAL_TOKEN, INFISICAL_ENVIRONMENT, INFISICAL_PROJECT_ID
├─ Starts: infisical-secrets service
│   ├─ Fetches secrets from /workspace (46 secrets)
│   ├─ Writes to /secrets/.env.infisical
│   └─ Becomes healthy (file exists)
├─ Starts: db service
│   └─ Loads /secrets/.env.infisical via env_file
├─ Starts: zitadel service
│   └─ Loads /secrets/.env.infisical via env_file
└─ Starts: login service
    └─ Loads /secrets/.env.infisical via env_file
```

## Secrets Structure in Infisical

```
Infisical Project: 2c273128-5d01-4156-a134-be9511d99c61
└─ Environment: dev
   └─ Folders:
      ├─ /workspace (46 secrets) ← Docker Compose uses this
      │   ├─ POSTGRES_USER
      │   ├─ POSTGRES_PASSWORD
      │   ├─ POSTGRES_DB
      │   ├─ ZITADEL_*
      │   └─ ... (all shared infrastructure secrets)
      ├─ /server (30 secrets) ← Server app uses SDK
      └─ /admin (6 secrets) ← Admin app uses Vite plugin
```

## Local Development

For local development (outside Coolify):

1. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```

2. **Set your Infisical token:**
   ```bash
   INFISICAL_TOKEN=st.your-dev-token
   INFISICAL_ENVIRONMENT=dev
   INFISICAL_PROJECT_ID=2c273128-5d01-4156-a134-be9511d99c61
   ```

3. **Start services:**
   ```bash
   docker compose up -d
   ```

The `infisical-secrets` service will fetch secrets automatically.

## Troubleshooting

### Check Infisical Secrets Service Logs

```bash
docker compose logs infisical-secrets
```

**Expected output:**
```
🔐 Fetching secrets from Infisical...
✅ Secrets written to /secrets/.env.infisical
```

### Verify Secrets File

```bash
docker compose exec infisical-secrets cat /secrets/.env.infisical
```

**Should show:**
```
POSTGRES_USER=spec
POSTGRES_PASSWORD=...
POSTGRES_DB=spec
ZITADEL_EXTERNALDOMAIN=...
...
```

### Check Service Environment

```bash
docker compose exec db env | grep POSTGRES
```

**Should show:**
```
POSTGRES_USER=spec
POSTGRES_PASSWORD=...
POSTGRES_DB=spec
```

### Common Issues

**❌ Service doesn't start: "depends_on infisical-secrets service_healthy failed"**
- **Cause:** Infisical token is invalid or expired
- **Fix:** Update `INFISICAL_TOKEN` in Coolify environment variables

**❌ Secrets file is empty**
- **Cause:** Wrong `INFISICAL_ENVIRONMENT` or `INFISICAL_PROJECT_ID`
- **Fix:** Verify values match Infisical project settings

**❌ Services have wrong values**
- **Cause:** Secrets not updated in Infisical
- **Fix:** Update in Infisical UI, then `docker compose restart`

## Updating Secrets

### From Infisical UI

1. Go to https://infiscal.kucharz.net
2. Navigate to `/workspace` folder
3. Update secret values
4. Restart services in Coolify:
   ```bash
   docker compose restart
   ```

The `infisical-secrets` service will fetch fresh values on restart.

## Benefits

✅ **Minimal Coolify config** - Only 3 environment variables  
✅ **Single source of truth** - All secrets in Infisical  
✅ **Easy updates** - Change in Infisical UI, restart services  
✅ **No secrets in git** - Everything in Infisical  
✅ **Multi-environment ready** - Just change `INFISICAL_ENVIRONMENT`  
✅ **Standard Docker Compose** - No custom scripts, works everywhere  

## Architecture Overview

```
Infisical (infiscal.kucharz.net)
└─ Project: 2c273128-5d01-4156-a134-be9511d99c61
   └─ Environment: dev
      ├─ /workspace (46 secrets) → Docker services (via sidecar)
      ├─ /server (30 secrets) → Server app (via SDK)
      └─ /admin (6 secrets) → Admin app (via Vite plugin)
```

**Three Different Integration Patterns:**
1. **Docker Compose:** Sidecar service + shared volume (this guide)
2. **Server:** SDK + Manual Universal Auth (runtime loading)
3. **Admin:** Vite plugin + SDK (build-time loading)

Each uses the official Infisical approach for that use case.
