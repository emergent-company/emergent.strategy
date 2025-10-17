# Workspace Status Command

Use the workspace CLI status command to capture a consolidated health snapshot of every managed
application and dependency. The command surfaces PM2 process information alongside Docker Compose
state for foundational services (PostgreSQL, Zitadel).

## Quick Start

```bash
# Table output for default workspace services + dependencies
nx run workspace-cli:workspace:status

# JSON output suitable for tooling or CI
nx run workspace-cli:workspace:status -- --json
```

The Nx target delegates to:

```bash
npx tsx tools/workspace-cli/src/cli.ts status --workspace --dependencies
```

### Filtering

- `--service=<id>` – Limit the report to a specific application service (repeatable).
- `--dependency=<id>` – Limit the report to a specific dependency.
- `--dependencies` – Include the default dependency set alongside services.
- `--deps-only` – Report on dependencies exclusively.
- `--json` – Emit structured JSON (`UnifiedHealthSnapshot`) instead of a table.

### Output Fields

Each row in the table (and element in JSON) includes:

| Field | Description |
| --- | --- |
| `serviceId` | Workspace identifier (matches process ID for applications or dependency ID). |
| `type` | `application` or `dependency`. |
| `status` | Normalized status (`online`, `starting`, `stopped`, `failing`, `degraded`). |
| `uptimeSec` | Seconds since PM2 reported the process online. |
| `restartCount` | PM2 restart counter. |
| `detail` | Summary of PM2 state plus Docker status for dependencies. |
| `dependencyState` | (Applications only) Compact status view for each declared dependency. |

Example table output:

```
Captured at: 2025-10-17T12:34:56.789Z
Service   Type         Status   Uptime   Restarts  Detail
--------  -----------  -------  -------  --------  ---------------------------------------
admin     application  online   15m      0         online | deps=postgres:online
server    application  online   14m      0         online | deps=postgres:online
postgres  dependency   online   20m      0         online | docker=running (healthy)
zitadel   dependency   degraded 2m       1         online | docker=running (starting)
```

### JSON Output Structure

```json
{
  "capturedAt": "2025-10-17T12:34:56.789Z",
  "services": [
    {
      "serviceId": "admin",
      "type": "application",
      "status": "online",
      "uptimeSec": 930,
      "restartCount": 0,
      "dependencyState": [
        { "dependencyId": "postgres", "status": "online" }
      ]
    },
    {
      "serviceId": "postgres",
      "type": "dependency",
      "status": "online",
      "uptimeSec": 1200,
      "restartCount": 0,
      "healthDetail": "online | docker=running"
    }
  ]
}
```

## Troubleshooting

| Issue | Recommendation |
| --- | --- |
| `docker=not-found` | Ensure `docker compose ps --format json` reports the dependency. The process may not be running or Docker may be unavailable. |
| `pm2=missing` | The dependency was not started under PM2. Launch via `nx run workspace-cli:workspace:deps:start`. |
| JSON output missing service | Verify the service/dependency ID is registered in `tools/workspace-cli/src/config/application-processes.ts` or `dependency-processes.ts`. |
| Status remains `failing` | Inspect logs under `apps/logs/<service>/` or rerun start commands with `-- --dry-run` to confirm configuration. |

For orchestration basics, see `docs/orchestration/workspace-commands.md`. Dependency-specific setup is
covered in `docs/orchestration/dependencies.md`.
