# E2E Dependency Checker

## Overview

The E2E test suite now automatically checks and starts all required dependencies before running tests.

## What It Does

The `scripts/ensure-e2e-deps.mjs` script:

1. **Checks Docker Containers** - Verifies PostgreSQL and Zitadel are running
2. **Checks Admin Dev Server** - Verifies Vite dev server is running on port 5175
3. **Auto-Starts Missing Services** - Starts any service that isn't running
4. **Waits for Readiness** - Ensures services are fully ready before proceeding

## Usage

### Automatic (Recommended)

All E2E test scripts now automatically run the dependency checker:

```bash
# Via MCP tools
mcp_dev-manager_run_script({ app: "admin", action: "e2e:clickup" })

# Via npm directly
npm run dev-manager:admin:e2e:clickup
```

### Manual

You can also run the dependency checker manually:

```bash
node scripts/ensure-e2e-deps.mjs
```

## How It Works

### Port Checks

The script uses `lsof -ti:PORT` to check if ports are in use:

- **Port 5175**: Admin Vite dev server
- **Port 5432**: PostgreSQL (via Docker)
- **Port 8080**: Zitadel (via Docker)

### Docker Container Check

Uses `docker compose ps --format json` to verify containers are running.

### Starting Services

- **Docker**: Runs `docker compose up -d` in the `docker/` directory
- **Admin**: Spawns detached `npm run dev` process in `apps/admin/`

The admin process is detached (`detached: true, unref()`) so it continues running after the script exits.

## Implementation Details

### Script Location

`/Users/mcj/code/spec-server/scripts/ensure-e2e-deps.mjs`

### Package.json Integration

```json
{
  "dev-manager:admin:e2e": "node scripts/ensure-e2e-deps.mjs && cd apps/admin && E2E_FORCE_TOKEN=1 npx playwright test ...",
  "dev-manager:admin:e2e:clickup": "node scripts/ensure-e2e-deps.mjs && cd apps/admin && E2E_FORCE_TOKEN=1 npx playwright test integrations.clickup.spec.ts ...",
  "dev-manager:admin:e2e:chat": "node scripts/ensure-e2e-deps.mjs && cd apps/admin && E2E_FORCE_TOKEN=1 npx playwright test chat.*.spec.ts ..."
}
```

### Timeout Configuration

- **Docker Health Wait**: 5 seconds after `docker compose up -d`
- **Admin Server Wait**: Up to 30 seconds (checks every 1 second)

## Output Example

```
🔍 Checking E2E test dependencies...

✅ Docker containers are running
⚠️  Admin dev server not running on port 5175
🚀 Starting admin dev server...
⏳ Waiting for admin server to start...
✅ Admin server started on port 5175

==================================================
✅ All E2E dependencies are ready!
```

## Exit Codes

- **0**: All dependencies started successfully
- **1**: One or more dependencies failed to start

## Current Status (October 6, 2025)

✅ **Dependency checker working perfectly**
- Auto-detects missing services
- Successfully starts Docker containers
- Successfully starts admin dev server
- Integrates seamlessly with E2E test commands

❌ **Tests still failing**
- Root cause: Integration gallery page shows "Failed to fetch"
- Issue: Backend API calls are failing before test mocks are applied
- Next step: Fix integration API mocking in test setup

## Benefits

1. **No Manual Setup**: Developers don't need to remember to start services
2. **Consistent Environment**: Tests always run with correct dependencies
3. **Fast Feedback**: Fails fast if dependencies can't be started
4. **CI/CD Ready**: Works in automated environments
5. **Zero Configuration**: Just run the test command

## Future Enhancements

- [ ] Add backend API server check (port 3001)
- [ ] Add health check endpoints instead of just port checks
- [ ] Add option to skip dependency checks (for CI where services are pre-started)
- [ ] Add verbose mode for debugging
- [ ] Add option to stop services after tests complete
