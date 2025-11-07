# Archived Docker Compose Files

This directory contains old Docker Compose files that have been superseded by the current setup.

## Archived Files

### `docker-compose.test-zitadel.yml`
- **Status:** Superseded
- **Reason:** Used old human-user configuration requiring manual email verification
- **Replacement:** Use `docker/docker-compose.yml` for local testing

### `docker-compose.test-upgrade.yml`
- **Status:** Superseded
- **Reason:** Was used for testing v4.6.2 upgrade; upgrade is complete
- **Replacement:** Use `docker/docker-compose.yml` for testing

### `docker-compose.zitadel-local.yml`
- **Status:** Superseded
- **Reason:** Had machine-user config but was separate from main setup
- **Replacement:** Use `docker/docker-compose.yml` which now has machine-user config

## Current Setup (November 2025)

**For local development:**
```bash
docker compose -f docker/docker-compose.yml up -d
```

**For production (Coolify):**
```bash
# Uses docker-compose.coolify.yml
```

Both now use **machine-user zero-touch bootstrap** - no manual PAT creation needed!

See: [Zitadel Setup Guide](../../docs/setup/ZITADEL_SETUP_GUIDE.md)
