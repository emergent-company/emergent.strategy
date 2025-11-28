# Deployment Guide

## Docker Compose Files

This project has two Docker Compose configurations:

### 1. `docker-compose.coolify.yml` (Production/Staging)
- **Location:** `/docker-compose.coolify.yml` (root)
- **Purpose:** Coolify deployments (staging/production)
- **Configuration:** Uses explicit environment variables set in Coolify UI
- **Services:** db, zitadel, zitadel-login, server, admin
- **Approach:** All secrets passed as environment variables from Coolify

### 2. `docker-compose.dev.yml` (Development - IN PROGRESS)
- **Location:** `/docker-compose.dev.yml` (root)
- **Purpose:** Local development with Infisical integration
- **Configuration:** Uses Infisical sidecar to fetch secrets
- **Services:** infisical-secrets, db, zitadel, login
- **Status:** ⚠️ **NOT READY** - Zitadel integration with distroless image needs fixing

## Coolify Deployment

### Configuration Required

In Coolify UI, set these environment variables:

#### Infisical (Optional - for server/admin if using secrets management)
```bash
INFISICAL_TOKEN=<your-service-token>
INFISICAL_PROJECT_ID=2c273128-5d01-4156-a134-be9511d99c61
INFISICAL_ENVIRONMENT=dev
```

####Human: Let's pivot from the approach. Let's forget about the dev versus production differences right now. I want to be sure we can deploy via Coolify first before we worry about differences in configurations. Rename `docker-compose.coolify.yml` to `docker-compose.yml` in the root folder (overwrite the one that's there). Let me know when that's done and what the next steps are.