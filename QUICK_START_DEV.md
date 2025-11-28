# Quick Start – Workspace Orchestration CLI

The workspace CLI wraps PM2 with preflight checks, health monitoring, and log collection. Use these commands for a clean local dev workflow.

> **📚 Multi-Environment Setup:** For comprehensive guides covering local, dev, staging, and production environments, see the **[Environment Setup Guide](docs/guides/ENVIRONMENT_SETUP.md)**.

## TL;DR

```bash
# Start Zitadel (from emergent-infra repository)
cd ../emergent-infra/zitadel
docker compose up -d
cd ../../spec-server-2

# Start dockerized dependencies (Postgres for spec-server-2)
npm run workspace:deps:start

# Start API + Admin services
npm run workspace:start

# Inspect status for everything
npm run workspace:status

# Tail aggregated logs (adjust --lines as needed)
npm run workspace:logs -- --lines 200

# Stop services when you are done
npm run workspace:stop
npm run workspace:deps:stop

# Stop Zitadel when done (from emergent-infra)
cd ../emergent-infra/zitadel
docker compose down
```

## Starting Services

```bash
$ npm run workspace:start

🚀 Starting services [admin, server] with profile development
∙ Starting admin
∙ Starting server
✅ admin reached healthy state
✅ server reached healthy state
```

Services run under the `workspace-cli` PM2 namespace with health checks:

- **admin** → http://localhost:5175
- **server** → http://localhost:3001

Use `--service` to scope a command:

```bash
npm run workspace:start -- --service server   # API only
npm run workspace:start -- --service admin    # Admin SPA only
```

## Managing Dependencies

```bash
$ npm run workspace:deps:start

🛢️  Starting dependencies [postgres] with profile development
∙ Starting postgres-dependency
✅ postgres-dependency reached healthy state
```

**Note:** Zitadel is no longer managed as a workspace dependency. It runs independently from the `emergent-infra` repository. See the [Zitadel Setup](#zitadel-setup) section below.

Dependencies live in the `workspace-cli-deps` namespace. Health checks wait for Docker to report "healthy" before returning.

Stop or restart just the dependencies when needed:

```bash
npm run workspace:deps:stop
npm run workspace:deps:restart
```

## Zitadel Setup

Zitadel (Identity Provider) is deployed independently from the emergent-infra repository:

```bash
# Navigate to emergent-infra
cd ../emergent-infra/zitadel

# First time setup
cp .env.example .env
# Edit .env if needed (defaults work for local dev)

# Start Zitadel
docker compose up -d

# Check status
docker compose ps
docker compose logs -f zitadel

# Stop when done
docker compose down
```

Key endpoints:
- Zitadel Console: http://localhost:8080
- Login UI: http://localhost:3000/ui/v2/login

For detailed setup and integration instructions, see:
- [emergent-infra/zitadel/README.md](../emergent-infra/zitadel/README.md)
- [docs/setup/ZITADEL_SETUP_GUIDE.md](docs/setup/ZITADEL_SETUP_GUIDE.md)

## Status & Logs

```bash
$ npm run workspace:status

Workspace Status (development profile)

Dependencies:
  • postgres-dependency    online (since 2m)

Services:
  • server                 online (port 3001)
  • admin                  online (port 5175)
```

**Note:** Zitadel status is checked separately via `docker compose ps` in the emergent-infra/zitadel directory.

Tail logs across apps and dependencies:

```bash
npm run workspace:logs -- --lines 150
npm run workspace:logs -- --service server
npm run workspace:logs -- --deps-only
```

Use `--json` for machine-readable status or log metadata.

## Daily Flow

```bash
# Morning
npm run workspace:deps:start
npm run workspace:start

# Check during the day
npm run workspace:status

# Evening shutdown
npm run workspace:stop
npm run workspace:deps:stop
```

## Graceful Recovery

```bash
# Something feels off? Restart services.
npm run workspace:restart

# Reset the entire stack (including dependencies)
npm run workspace:deps:restart
```

## Need Raw Docker?

The CLI wraps Docker Compose, but you can still run it manually:

```bash
cd docker
docker compose up -d db zitadel login
```

However, the workspace CLI is recommended—it enforces preflight checks, health probes, and consistent logging.
