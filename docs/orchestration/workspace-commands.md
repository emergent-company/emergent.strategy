# Workspace Command Workflow

This guide documents the Phase 3 command surface for launching application services via the unified Nx + PM2 orchestration pipeline.

## Prerequisites

- Node.js 22+
- PM2 globally (`npm install -g pm2`) or available through `npx pm2`
- Docker Desktop (for dependencies that require containers)
- Repository dependencies installed at the root (`npm install`)

## Environment Profiles

Commands accept a `--profile <name>` flag and default to `development` when omitted. Supported profiles:

- `development`
- `staging`
- `production`

You may also set the `WORKSPACE_PROFILE` environment variable to establish a default, for example:

```bash
export WORKSPACE_PROFILE=staging
```

## Application Service Commands

### Admin Application

```bash
# Install dependencies
nx run admin:setup --profile development

# Start under PM2 supervision
nx run admin:start --profile development

# Execute tests (passes remaining CLI args through to Vitest)
nx run admin:test -- --run --reporter=list
```

### Server (Nest API)

```bash
nx run server:setup --profile development
nx run server:start --profile development
nx run server:test -- --runInBand
```

All application commands are wrappers around `tools/workspace-cli/src/cli.ts`, so you can invoke the CLI directly when needed:

```bash
npx tsx tools/workspace-cli/src/cli.ts start --service=admin --profile staging
```

## Workspace Aggregation Commands

### Start Default Stack

Launches every service flagged as part of the default workspace set (currently `admin` and `server`).

```bash
nx run workspace-cli:workspace:start --profile development
```

### Start All Registered Services

```bash
nx run workspace-cli:workspace:start-all --profile staging
```

### Dry-Run Preview

Append `-- --dry-run` to preview actions without executing them:

```bash
nx run workspace-cli:workspace:start -- --dry-run
```

### Check Service & Dependency Status

Render a consolidated view of application services and foundational dependencies. The default target
includes the workspace services plus postgres/zitadel when the `--dependencies` flag is provided.

```bash
nx run workspace-cli:workspace:status -- --json
```

Omit `-- --json` to view a human-readable table. You can filter to a single service or dependency
via `--service=<id>` / `--dependency=<id>` arguments.

### Tail Managed Logs

Stream the most recent log output for managed services and dependencies. The command delegates to the
workspace CLI `logs` subcommand and honours the same filtering flags as `status`.

```bash
# Tail default workspace services plus dependencies
nx run workspace-cli:workspace:logs

# Tail a single service with JSON output
nx run workspace-cli:workspace:logs -- --service=server --lines 150 --json
```

See `docs/orchestration/logs.md` for detailed options, JSON schema, and log rotation defaults.

## Command Behaviour Summary

- All commands funnel through the workspace CLI, which reads environment profiles from `tools/workspace-cli/src/config/env-profiles.ts`.
- PM2 process metadata originates from `tools/workspace-cli/pm2/ecosystem.apps.cjs` and `tools/workspace-cli/src/config/application-processes.ts`.
- The CLI refuses to start processes if a conflicting PM2 namespace (`workspace-cli`) is not detected, preventing accidental overlap with ad-hoc processes.
- Log files live under `apps/logs/<service>/` with rotation handled in later phases.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `Conflicting PM2 process` | Run `pm2 delete <name>` or stop the foreign process before retrying. |
| Missing dependencies | Re-run `nx run <service>:setup` to ensure `npm install` completed. |
| Port already in use | Use `pm2 list` to inspect running processes or `lsof -ti:<port>` to clear stale processes. |
| Need richer output | Run commands with `-- --dry-run` to inspect resolved scripts and environment. |

For additional automation details, see `tools/workspace-cli/src/commands/start-service.ts` and the shared application process definitions in `tools/workspace-cli/src/config/application-processes.ts`.
