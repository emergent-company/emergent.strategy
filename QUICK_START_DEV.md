# Quick Start – Workspace Orchestration CLI

The workspace CLI wraps PM2 with preflight checks, health monitoring, and log collection. Use these commands for a clean local dev workflow.

> **📚 Multi-Environment Setup:** For comprehensive guides covering local, dev, staging, and production environments, see the **[Environment Setup Guide](docs/guides/ENVIRONMENT_SETUP.md)**.

## TL;DR

```bash
# Start infrastructure (from emergent-infra repository)
cd ../emergent-infra/postgres && docker compose up -d
cd ../zitadel && docker compose up -d
cd ../../emergent

# Start API + Admin services
pnpm run workspace:start

# Inspect status for everything
pnpm run workspace:status

# Tail aggregated logs (adjust --lines as needed)
pnpm run workspace:logs -- --lines 200

# Stop services when you are done
pnpm run workspace:stop

# Stop infrastructure when done (from emergent-infra)
cd ../emergent-infra/zitadel && docker compose down
cd ../postgres && docker compose down
```

## Infrastructure Setup

Database and Identity services are managed externally via the `emergent-infra` repository:

### PostgreSQL Database

```bash
cd ../emergent-infra/postgres

# First time setup
cp .env.example .env
# Edit .env with your credentials

# Start PostgreSQL
docker compose up -d

# Check health
./scripts/health-check.sh
```

Connection: `postgresql://emergent:<password>@localhost:5432/emergent`

### Zitadel (Identity Provider)

```bash
cd ../emergent-infra/zitadel

# First time setup
cp .env.example .env

# Start Zitadel
docker compose up -d

# Check health
./scripts/health-check.sh
```

Key endpoints:
- Zitadel Console: https://zitadel.dev.emergent-company.ai
- Login UI: https://login.dev.emergent-company.ai/ui/v2/login

For detailed setup instructions, see:
- [emergent-infra/postgres/README.md](../emergent-infra/postgres/README.md)
- [emergent-infra/zitadel/README.md](../emergent-infra/zitadel/README.md)

## Starting Services

```bash
$ pnpm run workspace:start

🚀 Starting services [admin, server] with profile development
∙ Starting admin
∙ Starting server
✅ admin reached healthy state
✅ server reached healthy state
```

Services run under the `workspace-cli` PM2 namespace with health checks:

- **admin** → http://localhost:5175
- **server** → http://localhost:3002

Use `--service` to scope a command:

```bash
pnpm run workspace:start -- --service server   # API only
pnpm run workspace:start -- --service admin    # Admin SPA only
```

## Status & Logs

```bash
$ pnpm run workspace:status

Workspace Status (development profile)

Services:
  • server                 online (port 3002)
  • admin                  online (port 5175)
```

**Note:** Infrastructure status is checked separately via health-check scripts in emergent-infra.

Tail logs across apps:

```bash
pnpm run workspace:logs -- --lines 150
pnpm run workspace:logs -- --service server
```

Use `--json` for machine-readable status or log metadata.

## Daily Flow

```bash
# Morning - start infrastructure first
cd ../emergent-infra/postgres && docker compose up -d
cd ../zitadel && docker compose up -d
cd ../../emergent

# Start services
pnpm run workspace:start

# Check during the day
pnpm run workspace:status

# Evening shutdown
pnpm run workspace:stop

# Stop infrastructure (optional - can leave running)
cd ../emergent-infra/zitadel && docker compose down
cd ../postgres && docker compose down
```

## Graceful Recovery

```bash
# Something feels off? Restart services.
pnpm run workspace:restart
```

## Need Raw Docker?

For infrastructure, use docker compose directly in emergent-infra:

```bash
cd ../emergent-infra/postgres && docker compose up -d
cd ../emergent-infra/zitadel && docker compose up -d
```

The workspace CLI is recommended for application services—it enforces preflight checks, health probes, and consistent logging.
