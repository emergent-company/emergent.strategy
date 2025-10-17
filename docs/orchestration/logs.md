# Workspace Log Retrieval & Rotation

The workspace CLI exposes a `logs` subcommand that tails recent output from every
managed service. It replaces the legacy `scripts/collect-service-logs.mjs` helper and
adds consistent filtering plus JSON output for automation workflows.

## Quick Start

```bash
# Tail default workspace services (admin + server) and dependencies
nx run workspace-cli:workspace:logs

# Tail everything as JSON with 200 lines per file
nx run workspace-cli:workspace:logs -- --lines 200 --json
```

Behind the scenes the Nx target invokes:

```bash
npx tsx tools/workspace-cli/src/cli.ts logs --workspace --dependencies
```

## Selecting Services & Dependencies

- `--service <id>` – Include one or more application services (repeatable).
- `--dependency <id>` – Include one or more dependencies (repeatable).
- `--dependencies` – Add the default dependency set alongside services.
- `--deps-only` – Restrict the snapshot to dependencies.
- `--all` – Include every registered application service.

Example:

```bash
# View only the Nest API and its dependencies
nx run workspace-cli:workspace:logs -- --service=server --dependencies
```

## Output Modes

- **Table (default):** Human-friendly snapshot with per-stream headings.
- **JSON:** Use `--json` to emit structured output suitable for tooling or CI pipelines.
- **Line Limit:** Control the number of lines per file with `--lines <n>` (default: 100).

Additional `.log` files found under `apps/logs/` or the legacy `logs/` directory are
reported in an "Additional log files" section so rotated archives remain visible.

## Log Locations

All PM2-managed services write to directories under `apps/logs/`:

```
apps/logs/<serviceId>/out.log   # stdout
apps/logs/<serviceId>/error.log # stderr
apps/logs/dependencies/<id>/out.log
apps/logs/dependencies/<id>/error.log
```

The CLI resolves these paths directly from the application and dependency
profiles defined in `tools/workspace-cli/src/config/application-processes.ts` and
`dependency-processes.ts`.

## Log Rotation Defaults

During CLI initialisation the `pm2-logrotate` module is installed (if required)
and configured using `tools/workspace-cli/pm2/logrotate.config.cjs`.

| Setting | Value | Notes |
| --- | --- | --- |
| `max_size` | `20M` | Rotate when a log grows beyond 20 MB |
| `retain` | `30` | Keep the 30 most recent archives |
| `compress` | `true` | Compress rotated files to save disk space |
| `dateFormat` | `YYYY-MM-DD_HH-mm-ss` | Timestamp appended to rotations |
| `workerInterval` | `30` | Rotation worker checks every 30 seconds |
| `rotateInterval` | `0 0 * * *` | Force rotation daily at midnight |
| `rotateModule` | `true` | Rotate PM2 module logs as well |

To customise these defaults, edit the config file and rerun any workspace CLI
command (the settings are applied on each invocation).

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `pm2` executable not found | Install PM2 globally (`npm install -g pm2`) or ensure `node_modules/.bin` is on your `PATH`. |
| Log file missing | Start the service at least once (`nx run workspace-cli:workspace:start`). Empty services report "log file not found." |
| JSON output missing a service | Confirm the service ID exists in the application/dependency profiles and that it was selected via flags. |
| Log rotation not applied | Run any workspace CLI command to reapply logrotate settings, or inspect `pm2 conf pm2-logrotate` for current values. |

The legacy script still exists as a thin wrapper that forwards to the workspace
CLI, but all new workflows should call `nx run workspace-cli:workspace:logs`
(or the direct CLI command) moving forward.
