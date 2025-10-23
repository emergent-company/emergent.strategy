# PM2 Process Name Prefixing

## Overview

PM2 processes are now automatically prefixed with the instance name to enable running multiple isolated instances of the workspace simultaneously.

## Configuration

The prefix is read from environment variables in this order:
1. `PM2_INSTANCE_NAME` (if set)
2. `COMPOSE_PROJECT_NAME` (from docker/.env)
3. Empty string (no prefix)

For this instance: **spec-2**

## Process Naming

With the `COMPOSE_PROJECT_NAME=spec-2` prefix:

### Application Processes
- **Admin Frontend**: `spec-2-admin` (instead of `admin`)
- **Backend Server**: `spec-2-server` (instead of `server`)

### Dependency Processes
- **PostgreSQL**: `spec-2-postgres-dependency` (instead of `postgres-dependency`)
- **Zitadel**: `spec-2-zitadel-dependency` (instead of `zitadel-dependency`)

## Implementation

The prefixing is implemented at three levels:

### 1. TypeScript Configuration Files
- `tools/workspace-cli/src/config/application-processes.ts`
  - Reads `COMPOSE_PROJECT_NAME` environment variable
  - Applies prefix using `prefixProcessId()` helper function
  
- `tools/workspace-cli/src/config/dependency-processes.ts`
  - Reads `COMPOSE_PROJECT_NAME` environment variable
  - Applies prefix using `prefixDependencyId()` helper function

### 2. PM2 Ecosystem Files
- `tools/workspace-cli/pm2/ecosystem.apps.cjs`
  - Reads `COMPOSE_PROJECT_NAME` at runtime
  - Applies prefix using `prefixProcessName()` helper function
  
- `tools/workspace-cli/pm2/ecosystem.dependencies.cjs`
  - Reads `COMPOSE_PROJECT_NAME` at runtime
  - Applies prefix using `prefixDependencyName()` helper function

### 3. Nx Target Configuration
All workspace commands in `tools/workspace-cli/project.json` explicitly set `COMPOSE_PROJECT_NAME=spec-2`:
- `workspace:start`
- `workspace:start-all`
- `workspace:restart`
- `workspace:stop`
- `workspace:deps:start`
- `workspace:deps:restart`
- `workspace:deps:stop`
- `workspace:logs`
- `workspace:status`

## Usage

All workspace CLI commands automatically use the prefixed names:

```bash
# Start services with spec-2 prefix
npm run workspace:start

# Check status (shows spec-2-admin, spec-2-server, etc.)
npm run workspace:status

# View PM2 list
npx pm2 list

# Stop specific service
npx pm2 stop spec-2-admin

# Restart specific service  
npx pm2 restart spec-2-server
```

## Multiple Instances

This prefixing system allows running multiple workspace instances simultaneously:

```bash
# Instance 1: spec-server (uses COMPOSE_PROJECT_NAME=spec-server)
cd /Users/mcj/code/spec-server
npm run workspace:start
# Creates: spec-server-admin, spec-server-server, spec-server-postgres-dependency, spec-server-zitadel-dependency

# Instance 2: spec-server-2 (uses COMPOSE_PROJECT_NAME=spec-2)
cd /Users/mcj/code/spec-server-2
npm run workspace:start
# Creates: spec-2-admin, spec-2-server, spec-2-postgres-dependency, spec-2-zitadel-dependency
```

Both instances run independently without naming conflicts!

## PM2 Process List Example

```
┌────┬────────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name               │ mode     │ ↺    │ status    │ cpu      │ memory   │
├────┼────────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
│ 15 │ spec-2-admin       │ fork     │ 0    │ online    │ 0%       │ 45.8mb   │
│ 13 │ spec-2-postgres-d… │ fork     │ 0    │ online    │ 0%       │ 19.9mb   │
│ 16 │ spec-2-server      │ fork     │ 0    │ online    │ 0%       │ 57.1mb   │
│ 14 │ spec-2-zitadel-de… │ fork     │ 0    │ online    │ 0%       │ 19.8mb   │
│ 3  │ spec-server-admin  │ fork     │ 0    │ online    │ 0%       │ 21.2mb   │
│ 1  │ spec-server-postg… │ fork     │ 0    │ online    │ 0%       │ 7.3mb    │
│ 4  │ spec-server-server │ fork     │ 0    │ online    │ 0%       │ 21.3mb   │
│ 2  │ spec-server-zitad… │ fork     │ 0    │ online    │ 0%       │ 7.3mb    │
└────┴────────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
```

## Health Checks

Both instances remain healthy and independent:

```bash
# spec-server-2 (port 3002)
curl http://localhost:3002/health
# {"ok": true}

# spec-server (port 3001)
curl http://localhost:3001/health
# {"ok": true}
```

## Consistency with Docker

The PM2 process prefixing now matches the Docker container naming:

- **Docker Containers**: `spec-2_pg`, `spec-2_zitadel`
- **PM2 Processes**: `spec-2-admin`, `spec-2-server`, `spec-2-postgres-dependency`, `spec-2-zitadel-dependency`

Both use the same `COMPOSE_PROJECT_NAME=spec-2` prefix for consistency.

## Troubleshooting

### Processes not prefixed
If processes appear without the prefix, check:
1. Is `COMPOSE_PROJECT_NAME` set in `docker/.env`?
2. Run with explicit environment variable: `COMPOSE_PROJECT_NAME=spec-2 npm run workspace:start`
3. Rebuild workspace-cli: `npm run build --workspace=tools/workspace-cli`

### Cannot find PM2 process
If you get "Missing PM2 ecosystem entry" errors:
1. Ensure `COMPOSE_PROJECT_NAME` environment variable is set
2. The ecosystem files read this variable at runtime
3. Process names in PM2 list should match the prefixed names

### Old processes still running
To clean up old unprefixed processes:
```bash
npx pm2 delete admin server postgres-dependency zitadel-dependency
```

## Related Documentation
- `docs/DEV_PROCESS_MANAGER.md` - Workspace CLI and PM2 usage
- `QUICK_START_DEV.md` - Getting started guide
- `docker/.env` - Contains COMPOSE_PROJECT_NAME configuration
