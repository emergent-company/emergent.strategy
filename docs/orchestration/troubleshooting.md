# Workspace Orchestration Troubleshooting

The workspace CLI wraps PM2-managed processes and Docker dependencies under a single command
surface. When something fails to start or stays unhealthy, use this guide to isolate the problem
quickly.

## Quick Diagnostic Workflow

1. **Check consolidated status**
   ```bash
   npm run workspace:status
   ```
   Look for services in `errored`, `stopped`, or `waiting` states and note any dependency warnings.

2. **Inspect structured logs**
   ```bash
   npm run workspace:logs -- --lines 200
   ```
   This tails both application and dependency logs. Use `--service=<id>` or `--dependency=<id>` to
   narrow the view.

3. **Verify port ownership**
   ```bash
   lsof -nP -i :3001 -i :5175 -i :5432 -i :8100 -i :8101
   ```
   This lists any non-workspace processes bound to the expected ports. Stop them before retrying the
   workspace CLI command. Inside Copilot, you can also run
   `mcp_dev-manager_check_status({ services: ["ports"], detailed: true })` for the same check.

> Prefer the MCP dev-manager tools (`list_scripts`, `run_script`, `browse_logs`, `check_status`) when
> working inside Copilot. The npm commands above are equivalent for terminal workflows.

## Common Issues & Fixes

### 1. Dependencies fail immediately after start

**Symptoms**
- `workspace:deps:start` reports a dependency as `errored` or stuck in a restart loop.
- `workspace:logs -- --dependency=<name>` shows image not found, migration errors, or volume
  mismatches.

**Steps**
1. Pull fresh images and rebuild missing layers:
   ```bash
   cd docker
   docker compose pull postgres zitadel
   ```
2. Reset only the problematic dependency (example: Zitadel):
   ```bash
   npm run workspace:deps:stop -- --dependency=zitadel
   npm run workspace:deps:start -- --dependency=zitadel
   ```
3. If volumes are corrupted, perform a targeted prune:
   ```bash
   docker compose down --volumes zitadel
   npm run workspace:deps:start -- --dependency=zitadel
   ```
4. Confirm the dependency recovers by running `npm run workspace:status` again.

### 2. PM2 restart threshold exceeded

**Symptoms**
- The status command shows `stopped` with a note like `restart count exceeded`.
- PM2 logs include `Too many unstable restarts`.

**Steps**
1. Review the failing service log:
   ```bash
   npm run workspace:logs -- --service=server --lines 200
   ```
2. Fix the root error (misconfigured `.env`, migration failure, etc.).
3. Reset the process state:
   ```bash
   npm run workspace:stop -- --service=server
   pm2 delete workspace-server || true
   npm run workspace:start -- --service=server
   ```
   > Replace `server` with the PM2 process id reported in the status output.
4. If you need to adjust thresholds temporarily, edit
   `tools/workspace-cli/src/config/processes.ts` (applications) or
   `dependency-processes.ts` (Docker services), then rebuild the CLI: `nx run workspace-cli:build`.

### 3. Port collisions block startup

**Symptoms**
- `workspace:start` exits with `EADDRINUSE` or the status command reports `foreign` owners for key
  ports (3001 API, 5175 Admin, 5432 Postgres, 8100/8101 Zitadel).

**Steps**
1. Identify the conflicting process:
   ```bash
   lsof -nP -i :3001 -i :5175 -i :5432 -i :8100 -i :8101
   ```
2. Stop the stray program (examples):
   ```bash
   lsof -ti:3001 | xargs kill -9
   pkill -f "vite"   # if a leftover admin dev server is running
   pkill -f "nest"   # if a raw Nest instance is running
   ```
3. Relaunch the managed service:
   ```bash
   npm run workspace:restart -- --service=admin
   ```
4. Re-run the status command to confirm ports are owned by the expected PM2 namespace
   (`workspace-cli` / `workspace-cli-deps`).

### 4. CLI refuses to start due to stale PM2 state

**Symptoms**
- Commands return `Process already exists in another namespace` or similar PM2 errors.

**Steps**
1. Flush lingering PM2 state:
   ```bash
   pm2 delete all
   ```
2. Clear cached logs (optional but recommended):
   ```bash
   rm -rf apps/logs/workspace apps/logs/dependencies
   ```
3. Recreate processes via the CLI:
   ```bash
   npm run workspace:start
   ```

## Reference Commands

| Purpose | Command |
| --- | --- |
| Full stack status | `npm run workspace:status` |
| Tail service logs | `npm run workspace:logs -- --service=<id> --lines 200` |
| Restart dependencies | `npm run workspace:deps:restart` |
| Restart a single service | `npm run workspace:restart -- --service=<id>` |
| Start dependencies only | `npm run workspace:deps:start` |
| Stop everything | `npm run workspace:stop` |

For deeper context, pair this guide with:
- `docs/orchestration/dependencies.md` – managing Docker-backed services.
- `docs/orchestration/status.md` – understanding status output.
- `docs/orchestration/workspace-commands.md` – workspace CLI flags and profiles.

If a scenario is not covered here, capture the failure details (status snapshot, log snippet) and
add a new section so future runs benefit from the improved playbook.
