# Deployment Guide

## Docker Compose Files

This project has two Docker Compose configurations:

### 1. `docker-compose.yml` (Development)

- **Location:** `/docker-compose.yml` (root)
- **Purpose:** Local development
- **Services:** db, zitadel, zitadel-login, server, admin

### 2. `docker-compose.staging.yml` (Staging/Production)

- **Location:** `/docker-compose.staging.yml` (root)
- **Purpose:** Staging and production deployments
- **Configuration:** Uses explicit environment variables
- **Services:** db, server, admin

## Docker Deployment

### Configuration Required

Set these environment variables in your deployment platform:

#### Infisical (Optional - for secrets management)

```bash
INFISICAL_TOKEN=<your-service-token>
INFISICAL_PROJECT_ID=<your-project-id>
INFISICAL_ENVIRONMENT=dev
```

#### Direct Environment Variables

See `.env.production.example` for the complete list of required variables.

### Deployment Steps

1. Configure environment variables in your deployment platform
2. Build and deploy using Docker Compose:
   ```bash
   docker compose -f docker-compose.staging.yml up -d
   ```
3. Verify health endpoints:
   - Server: `http://localhost:3002/health`
   - Admin: `http://localhost:3000/`
