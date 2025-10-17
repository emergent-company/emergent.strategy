git pull origin main
git pull
# MCP Dev Manager – Quick Reference (Workspace CLI Edition)

## ⚙️ Configuration

### .vscode/mcp.json
```json
{
  "servers": {
    "dev-manager": {
      "command": "node",
      "args": ["mcp-dev-manager/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/absolute/path/to/project"
      }
    }
  }
}
```

### package.json (snippet)
```json
{
  "scripts": {
    "workspace:start": "nx run workspace-cli:workspace:start",
    "workspace:stop": "nx run workspace-cli:workspace:stop",
    "test:e2e:server": "npm --prefix apps/server-nest run test:e2e",
    "e2e:admin:real": ". ./.env && E2E_REAL_LOGIN=1 npm --prefix apps/admin run e2e"
  }
}
```

> Legacy `dev-manager:*` scripts are no longer required. Keep workflows in the workspace CLI script family.

## 💬 Copilot Usage Examples

- "List all workspace scripts" → `mcp_dev-manager_list_scripts()`
- "Run the workspace stack" → `mcp_dev-manager_run_script({ script: "workspace:start" })`
- "Restart dependencies" → `mcp_dev-manager_run_script({ script: "workspace:deps:restart" })`
- "Tail API logs" → `mcp_dev-manager_browse_logs({ action: "tail", logFile: "logs/workspace/server-nest/out.log", lines: 200 })`
- "Check running ports" → `mcp_dev-manager_check_status({ services: ["ports"], detailed: true })`

## 🛠️ MCP Tools Cheat Sheet

| Tool | Sample Call | Use Case |
| --- | --- | --- |
| `run_script` | `{ script: "workspace:status" }` | Lifecycle commands, tests, builds |
| `list_scripts` | `()` | Discover managed scripts grouped by prefix |
| `browse_logs` | `{ action: "tail", logFile: "logs/workspace/pm2.log" }` | Inspect PM2/Docker/app logs |
| `check_status` | `{ services: ["docker-compose", "ports"], detailed: true }` | Verify services and port usage |
| `run_tests` (legacy) | — | Prefer `run_script` instead |
| `manage_service` (legacy) | — | Prefer `workspace:*` scripts |

## ✅ Recommended Script Map

- **Workspace lifecycle**: `workspace:start`, `workspace:stop`, `workspace:restart`, `workspace:status`, `workspace:logs`
- **Dependencies**: `workspace:deps:start`, `workspace:deps:restart`, `workspace:deps:stop`
- **Testing**: `test:smoke`, `test:e2e:server`, `test:coverage:admin`, `e2e:admin:real`
- **Builds**: `build`, `build:admin`, `build:server-nest`
- **Database**: `db:init`, `db:reset`, `db:full-reset`
- **Utilities**: `spec:diff`, `mcp:db`, `check:stories`

Run `list_scripts` regularly—new scripts automatically appear.

## 🚫 When to Use `run_in_terminal`

- Headed Playwright (`e2e:admin:ui`, `--debug`)
- Storybook UI (`npm run dev:storybook`)
- Log streaming (`pm2 logs --follow`)
- Ad-hoc shell pipelines or exploratory commands

For everything else, prefer `run_script` to benefit from preflight checks and consistent environments.

## 🔄 Updating the MCP Server

```bash
cd mcp-dev-manager
npm install
npm run build
```

## 🐛 Troubleshooting Tips

1. **Script not found** → Re-run `list_scripts`; confirm it exists in `package.json`.
2. **Interactive script blocked** → Execute via `run_in_terminal` in a foreground terminal.
3. **Preflight failure** → Use `workspace:status` or `mcp_dev-manager_check_status` for diagnostics.
4. **Logs missing** → Call `mcp_dev-manager_browse_logs({ action: "list" })` to enumerate available files.

## � Helpful Docs

- `.github/instructions/mcp-dev-manager.instructions.md` – full guidance
- `RUNBOOK.md` – day-to-day operations
- `QUICK_START_DEV.md` – onboarding workflow
