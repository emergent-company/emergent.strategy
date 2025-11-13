# Docker Services Prefix Configuration

This document explains how to run multiple instances of the spec-server Docker services without naming conflicts.

## Overview

The Docker Compose setup uses environment variables to configure:

- **Container names** - prefixed to avoid conflicts
- **Volume names** - automatically prefixed by Docker Compose
- **Port mappings** - configurable to avoid port conflicts

## Configuration

### 1. Edit `docker/.env`

The main configuration file is `docker/.env`. The key variable is:

```bash
# Change this to differentiate multiple instances
COMPOSE_PROJECT_NAME=spec
```

**Examples for multiple instances:**

```bash
# Instance 1
COMPOSE_PROJECT_NAME=spec

# Instance 2
COMPOSE_PROJECT_NAME=spec2

# Instance 3
COMPOSE_PROJECT_NAME=myproject
```

### 2. Configure Ports (Optional)

If you need to run multiple instances simultaneously, change the ports:

```bash
# Instance 1 (default)
POSTGRES_PORT=5432
ZITADEL_HTTP_PORT=8100
ZITADEL_LOGIN_PORT=8101

# Instance 2 (different ports)
POSTGRES_PORT=5433
ZITADEL_HTTP_PORT=8200
ZITADEL_LOGIN_PORT=8201
```

### 3. Update Application Configuration

After changing Docker ports, update your application's `.env` file to match:

**For `apps/server/.env`:**

```bash
# Match the POSTGRES_PORT from docker/.env
PGPORT=5432  # or 5433 for instance 2

# Match the ZITADEL_HTTP_PORT from docker/.env
AUTH_ISSUER=http://localhost:8100  # or 8200 for instance 2
AUTH_JWKS_URI=http://localhost:8100/oauth/v2/keys
```

## How It Works

### Container Names

Docker containers will be named: `{COMPOSE_PROJECT_NAME}_pg` and `{COMPOSE_PROJECT_NAME}_zitadel`

Examples:

- Default: `spec_pg`, `spec_zitadel`
- Instance 2: `spec2_pg`, `spec2_zitadel`

### Volume Names

Docker automatically prefixes volumes with the project name: `{COMPOSE_PROJECT_NAME}_pg_data`

Examples:

- Default: `spec_pg_data`
- Instance 2: `spec2_pg_data`

### Network Names

Docker creates a network: `{COMPOSE_PROJECT_NAME}_default`

## Usage Examples

### Running Default Instance

```bash
cd docker
docker compose up -d
```

### Running Second Instance

```bash
# 1. Create a copy of .env
cp docker/.env docker/.env.instance2

# 2. Edit the new file
# Change COMPOSE_PROJECT_NAME=spec2
# Change POSTGRES_PORT=5433
# Change ZITADEL_HTTP_PORT=8200
# Change ZITADEL_LOGIN_PORT=8201

# 3. Start with the new environment
cd docker
docker compose --env-file .env.instance2 up -d
```

### Managing Multiple Instances

```bash
# List all containers (both instances)
docker ps -a

# Stop specific instance
docker compose -p spec down
docker compose -p spec2 down

# View logs for specific instance
docker compose -p spec logs -f
docker compose -p spec2 logs -f

# Remove specific instance including volumes
docker compose -p spec down -v
docker compose -p spec2 down -v
```

## Cleaning Up

To completely remove an instance including its volumes:

```bash
# Stop and remove containers, networks, and volumes
docker compose -p spec down -v

# Or if using custom env file
docker compose --env-file .env.instance2 -p spec2 down -v
```

## Troubleshooting

### Port Already in Use

If you get "port already in use" errors, check what's using the port:

```bash
lsof -i :5432  # Check postgres port
lsof -i :8100  # Check Zitadel HTTP port
lsof -i :8101  # Check Zitadel login port
```

Then either:

1. Stop the conflicting service
2. Change the port in `docker/.env`

### Container Name Conflicts

If you get "container name already in use" errors:

```bash
# List all containers
docker ps -a

# Remove specific container
docker rm -f spec_pg
docker rm -f spec_zitadel

# Or change COMPOSE_PROJECT_NAME in .env
```

### Volume Conflicts

Volumes are automatically isolated by project name, but to list them:

```bash
# List all volumes
docker volume ls

# Remove specific project volumes
docker volume rm spec_pg_data
docker volume rm spec2_pg_data
```

## Default Values

All variables have sensible defaults, so the system will work even without the `.env` file:

- `COMPOSE_PROJECT_NAME`: spec
- `POSTGRES_PORT`: 5432
- `POSTGRES_USER`: spec
- `POSTGRES_PASSWORD`: spec
- `POSTGRES_DB`: spec
- `ZITADEL_HTTP_PORT`: 8100
- `ZITADEL_LOGIN_PORT`: 8101
