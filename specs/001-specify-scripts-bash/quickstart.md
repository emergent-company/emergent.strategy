# Quickstart: Unified Orchestration Scripts

Welcome! This guide shows you how to spin up the full Spec Server stack using the new scripted workflow that unifies Nx targets, PM2 supervision, and Docker-backed dependencies.

---

## 1. Prerequisites

- Node.js 20+
- pnpm 9+ (preferred) or npm 10+
- Docker Desktop (with Compose v2)
- PostgreSQL and Zitadel images already pulled (run `docker compose pull` once)

Run the setup commands to ensure toolchain alignment:

```bash
pnpm install
pnpm nx configure-ai-agents
```

The first command installs workspace dependencies; the second configures Nx Console to serve the Nx MCP server and writes the AI agent configuration files—no custom scripts required.

---

## 2. Discover Available Commands

All orchestration commands are exposed via Nx targets with friendly aliases. List them with:

```bash
pnpm nx graph --focus workspace-cli
```

or consult the runner catalog in `specs/001-specify-scripts-bash/spec.md` under **Command Surface & Runner Catalog**.

Key targets:

- `nx run workspace:start`
- `nx run workspace:start-all`
- `nx run workspace:restart`
- `nx run workspace:stop`
- `nx run workspace:status`
- `nx run workspace:logs -- --service=admin`
- `nx run workspace:deps:start`

---

## 3. Start Everything

Kick off both app services and docker dependencies:

```bash
pnpm nx run workspace:start-all
```

What happens under the hood:

1. PM2 starts `server-api` and `admin-web` using their process profiles.
2. The orchestration API triggers Docker Compose to ensure Postgres and Zitadel are running.
3. Health probes confirm readiness before reporting success.

You can watch the live status (table output by default; add `--json` for structured automation):

```bash
pnpm nx run workspace:status
```

Expected output (abridged):

```
✔ server         online  uptime 00:02:14  restarts 0
✔ admin          online  uptime 00:02:05  restarts 0
✔ postgres       online  uptime 00:02:13  restarts 0
✔ zitadel        online  uptime 00:02:12  restarts 0
```

---

## 4. Tail Logs

Retrieve logs for any service (human-readable tail by default; add `--json` for machine processing):

```bash
pnpm nx run workspace:logs -- --service=server --tail=300
```

Use `--from`/`--to` for time-bounded slices. Append `--json` to switch to structured output for tools like `jq`.

---

## 5. Restart or Stop Individual Services

Graceful restart:

```bash
pnpm nx run workspace:restart -- --service=admin
```

Stop everything:

```bash
pnpm nx run workspace:stop
```

This drains HTTP traffic and stops PM2-managed application services. Dependency orchestration commands land in User Story 3; until then, stop Docker Compose services manually if needed.

When a service crashes repeatedly, the restart workflow surfaces a structured error that looks like:

```json
{
	"code": "RESTART_THRESHOLD_EXCEEDED",
	"serviceId": "server",
	"profile": "staging",
	"attempts": 5,
	"maxRestarts": 5,
	"recommendation": "Run nx run workspace:status --profile staging"
}
```

Use the JSON payload to drive alerting or automation and follow the recommended status/log commands to troubleshoot.

---

## 6. Health Checks & Troubleshooting

If a service is failing health checks:

1. `pnpm nx run workspace:status -- --includeHistory`
2. Inspect restart history and last exit codes.
3. Pull recent logs as described above.
4. Restart the offending service once the root cause is fixed.

If containers refuse to start, verify Docker Desktop is running and run:

```bash
pnpm nx run workspace:restart -- --service=postgres
```

---

## 7. Tear Down & Cleanup

When you're done:

```bash
pnpm nx run workspace:stop
pnpm exec pm2 delete all
```

To clear PM2 logs:

```bash
pnpm exec pm2 flush
```

---

Congrats! You now have a streamlined workflow that treats Nx as the command surface, PM2 as the service supervisor, and Docker Compose as the dependency runtime under the `workspace` command family (root) and service-specific aliases (e.g., `admin:start`).