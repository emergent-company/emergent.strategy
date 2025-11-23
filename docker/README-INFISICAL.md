# Docker Compose + Infisical Integration

This document explains how to use Infisical secrets with Docker Compose services.

## Overview

The Docker Compose setup can load secrets from Infisical using the `infisical-secrets` service. This provides:

- **Centralized secret management** - Update secrets in Infisical UI, not local files
- **Consistency** - Same secrets across all services
- **Security** - Secrets never stored in git
- **Easy rotation** - Update in one place, restart services

## Architecture

```
┌─────────────────────┐
│ Infisical Platform  │
│ (infiscal.kucharz.net)│
└──────────┬──────────┘
           │
           │ HTTPS API
           │
┌──────────▼──────────────┐
│ infisical-secrets       │ ← Fetches secrets using token
│ (infisical/cli)         │
└──────────┬──────────────┘
           │
           │ Exports as environment variables
           │
           ├───────────────┬───────────────┐
           │               │               │
    ┌──────▼─────┐  ┌─────▼────┐  ┌──────▼──────┐
    │     db     │  │ zitadel  │  │   login     │
    │ (postgres) │  │   (idp)  │  │    (ui)     │
    └────────────┘  └──────────┘  └─────────────┘
```

## Setup

### 1. Get Your Infisical Token

1. Go to https://infiscal.kucharz.net
2. Navigate to your project
3. Go to **Settings** → **Tokens**
4. Create a new **Service Token** for the `dev` environment
5. Copy the token (starts with `st.`)

### 2. Configure Docker Environment

Edit `docker/.env` and add your token:

```bash
# Infisical Configuration
INFISICAL_TOKEN=st.your-dev-token-here

# Optional: Fallback values if Infisical unavailable
POSTGRES_USER=spec
POSTGRES_PASSWORD=spec
POSTGRES_DB=spec
POSTGRES_PORT=5432
```

### 3. Start Services with Infisical

```bash
cd docker
docker compose --profile infisical up -d
```

The `--profile infisical` flag activates the `infisical-secrets` service.

## Usage Modes

### Mode 1: With Infisical (Recommended)

**Use when:** You have access to Infisical and want centralized secret management

```bash
# Start with Infisical secrets
docker compose --profile infisical up -d

# View logs
docker compose --profile infisical logs -f
```

**What happens:**
1. `infisical-secrets` service starts first
2. Fetches all secrets from `/workspace` folder in Infisical
3. Exports them as environment variables
4. Other services inherit these variables
5. `infisical-secrets` exits (job done)
6. Services run with Infisical secrets

### Mode 2: Without Infisical (Local Development)

**Use when:** Offline, no Infisical access, or testing with local overrides

```bash
# Start without Infisical (uses .env file)
docker compose up -d
```

**What happens:**
1. Services start immediately
2. Use environment variables from `docker/.env` file
3. Fallback to defaults if variables missing

## Configuration Management

### Updating Secrets

**With Infisical:**
1. Update secret in Infisical UI
2. Restart Docker services:
   ```bash
   docker compose --profile infisical restart
   ```

**Without Infisical:**
1. Edit `docker/.env` file
2. Restart Docker services:
   ```bash
   docker compose restart
   ```

### Which Secrets Come from Infisical?

The `infisical-secrets` service fetches from the `/workspace` folder:

**Database:**
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

**Zitadel Infrastructure:**
- `ZITADEL_MASTERKEY`
- `ZITADEL_EXTERNALDOMAIN`
- `ZITADEL_HTTP_PORT`
- `ZITADEL_LOGIN_PORT`
- `ZITADEL_DATABASE_*` (all database connection vars)
- `ZITADEL_FIRSTINSTANCE_*` (bootstrap config)
- `ZITADEL_OIDC_*` (OIDC endpoints)

**Docker Config:**
- `COMPOSE_PROJECT_NAME`
- `DB_CONTAINER_NAME`
- `DB_LOGS_PATH`

**See full list:** Check Infisical UI → `/workspace` folder

## Troubleshooting

### Service Token Invalid

**Error:** `401 Unauthorized` from Infisical API

**Solution:**
1. Check token in `docker/.env` is correct
2. Verify token has access to the project
3. Check token is for the correct environment (`dev`)
4. Generate a new token if expired

### Secrets Not Loading

**Error:** Services use default values instead of Infisical secrets

**Check:**
```bash
# View infisical-secrets service logs
docker compose --profile infisical logs infisical-secrets

# Should show: "Successfully exported X secrets"
```

**Solutions:**
1. Ensure you used `--profile infisical` flag
2. Check token is set in `docker/.env`
3. Verify network connectivity to infiscal.kucharz.net

### Service Dependency Issues

**Error:** Services start before Infisical loads secrets

**Check:**
```bash
docker compose --profile infisical ps
```

**Should show:**
- `infisical-secrets` - `exited (0)` (completed successfully)
- `db` - `running` (healthy)
- `zitadel` - `running`

**Solution:**
Services depend on `infisical-secrets` with `condition: service_completed_successfully`. If this fails, check `infisical-secrets` logs.

### Testing Infisical Connection

```bash
# Run infisical-secrets service manually
docker compose --profile infisical run --rm infisical-secrets export --format=dotenv-export

# Should output all environment variables from Infisical
```

## Best Practices

### ✅ DO:
- Use Infisical for shared infrastructure secrets (database, Zitadel)
- Keep sensitive secrets (passwords, keys) in Infisical
- Use `docker/.env` only for non-sensitive defaults
- Document which secrets come from Infisical

### ❌ DON'T:
- Commit real secrets to `docker/.env` file
- Use Infisical for local development overrides (use `.env` instead)
- Skip the `--profile infisical` flag if you want Infisical integration

## Switching Between Modes

### From Local → Infisical

```bash
# 1. Stop services
docker compose down

# 2. Add token to docker/.env
echo "INFISICAL_TOKEN=st.your-token" >> docker/.env

# 3. Start with Infisical
docker compose --profile infisical up -d
```

### From Infisical → Local

```bash
# 1. Stop services
docker compose --profile infisical down

# 2. Ensure fallback values in docker/.env
# (Check .env.example for required variables)

# 3. Start without Infisical
docker compose up -d
```

## Integration with Applications

The server and admin apps also use Infisical but load secrets directly (not via Docker):

- **Server** (`apps/server`): Uses `@infisical/sdk` in `src/config/infisical-loader.ts`
- **Admin** (`apps/admin`): Uses Vite plugin with `@infisical/sdk`

**Why different approaches?**
- Docker services (postgres, zitadel): Infrastructure, use CLI tool
- Application code (server, admin): Business logic, use SDK for runtime loading

See `docs/improvements/010-infisical-sdk-integration.md` for details.

## See Also

- [Infisical Docker Compose Docs](https://infisical.com/docs/integrations/platforms/docker-compose)
- [Infisical CLI Reference](https://infisical.com/docs/cli/overview)
- `docker/.env.example` - Example configuration
- `docker/README-PREFIX.md` - Multi-instance setup
