# Dependency Orchestration Guide

The workspace CLI manages foundational Docker dependencies (PostgreSQL, Zitadel) with the same
PM2-backed workflow used for application services. This guide explains how to prepare, start,
restart, and stop those dependencies from Nx targets or directly through the CLI.

## Prerequisites

- Docker and Docker Compose available on the host.
- The repository checked out with the `docker/` directory intact (contains compose file and
  supporting scripts).
- PM2 installed via the workspace CLI bootstrap (handled automatically when you run the
  application commands).

## Quick Commands

| Workflow | CLI Command | Nx Target |
| --- | --- | --- |
| Pull latest dependency images | `docker compose pull postgres zitadel` (from `docker/`) | `nx run docker:setup` |
| Start dependencies only | `npx tsx tools/workspace-cli/src/cli.ts start --deps-only` | `nx run workspace-cli:workspace:deps:start` or `nx run docker:start` |
| Restart dependencies | `npx tsx tools/workspace-cli/src/cli.ts restart --deps-only` | `nx run workspace-cli:workspace:deps:restart` or `nx run docker:restart` |
| Stop dependencies | `npx tsx tools/workspace-cli/src/cli.ts stop --deps-only` | `nx run workspace-cli:workspace:deps:stop` or `nx run docker:stop` |
| Start full stack (apps + deps) | `npx tsx tools/workspace-cli/src/cli.ts start --all` | `nx run workspace-cli:workspace:start-all` |

> ℹ️ All commands accept `--profile <development|staging|production>` and `--dry-run` for inspection.

## Recommended Flow

1. **Pull Images (one-time or after updates)**
   ```bash
   nx run docker:setup
   ```
   This command runs `docker compose pull postgres zitadel` inside the `docker` directory, ensuring
   the latest container images are available.

2. **Start Dependencies Under PM2**
   ```bash
   nx run workspace-cli:workspace:deps:start
   ```
   - Launches the PM2 processes defined in `tools/workspace-cli/pm2/ecosystem.dependencies.cjs`.
   - Ensures log directories exist under `apps/logs/dependencies/<dependency>`.
   - Applies restart policies defined in `tools/workspace-cli/src/config/dependency-processes.ts`.

3. **Verify Status** *(optional until the consolidated status command lands)*
   - Use `pm2 status` to confirm `postgres-dependency` and `zitadel-dependency` are `online`.
   - Logs stream to `apps/logs/dependencies/...` for inspection.

4. **Restart or Stop When Needed**
   ```bash
   nx run workspace-cli:workspace:deps:restart   # bounce the dependency fleet
   nx run workspace-cli:workspace:deps:stop      # graceful shutdown
   ```
   Both commands wait for clean PM2 transitions and surface namespace mismatches or restart
   threshold breaches as structured errors.

## Flags & Targeting

- `--dependency <id>` – restart/stop a specific dependency (e.g., `postgres` or `zitadel`).
- `--dependencies` – include the default dependency set alongside services (useful with
  `--workspace`).
- `--deps-only` – restrict the command to dependencies and skip application services (used by the
  Nx targets above).
- `--dry-run` – print the planned PM2 actions without executing them.

### Examples

Start only Postgres (CLI):
```bash
npx tsx tools/workspace-cli/src/cli.ts start --dependency=postgres --deps-only
```

Restart Zitadel plus application services:
```bash
npx tsx tools/workspace-cli/src/cli.ts restart --dependency=zitadel --service=admin
```

## Logs and Artifacts

- Logs are stored in `apps/logs/dependencies/<dependency>/{out.log,error.log}`.
- Each dependency process runs inside the `workspace-cli-deps` PM2 namespace, aiding isolation from
  application services.
- Restart policy defaults (3 attempts, 90s uptime window, exponential backoff) are enforced by the
  PM2 ecosystem configuration. Adjust values in `dependency-processes.ts` if required.

## Troubleshooting

- **Process missing from PM2** – run the start command again; PM2 must register the process before
  restart/stop commands can operate.
- **Namespace mismatch errors** – indicates a stale PM2 entry left from older scripts. Run
  `pm2 delete <name>` or stop commands with `--dry-run` to inspect expected namespace values.
- **Container exit loops** – inspect logs under `apps/logs/dependencies/` and validate Docker
  health checks (`docker ps --format '{{ .Names }} {{ .Status }}'`).

For more workflow examples, pair this document with
`docs/orchestration/workspace-commands.md`, which covers the application service side.
