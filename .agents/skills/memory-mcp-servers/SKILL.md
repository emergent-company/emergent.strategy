---
name: memory-mcp-servers
description: Manage MCP (Model Context Protocol) servers in an Emergent project — register, inspect, sync tools, and delete servers. Use when the user wants to add, configure, or troubleshoot MCP servers connected to their Emergent project.
metadata:
  author: emergent
  version: "2.0"
---

Manage MCP servers connected to an Emergent project using `memory agents mcp-servers`.

## Rules

- **Never run `memory browse`** — it launches a full interactive TUI that blocks on terminal input and will hang in an automated agent context.
- **Always prefix `memory` commands with `NO_PROMPT=1`** (e.g. `NO_PROMPT=1 memory <cmd>`). Without it, the CLI may show interactive pickers when no project, agent, MCP server, skill, or agent-definition ID is provided. Do not add this to `.env.local` — it must only apply to agent-driven invocations.
- **Always supply a project** with `--project <id>` on project-scoped commands, or ensure `MEMORY_PROJECT` is set.

## Commands

### List servers
```bash
memory agents mcp-servers list
memory agents mcp-servers list --output json
```

### Get server details
```bash
memory agents mcp-servers get <server-id>
```

### Register a new server

**SSE server:**
```bash
memory agents mcp-servers create --name "my-server" --type sse --url "http://localhost:8080/sse"
```

**HTTP server:**
```bash
memory agents mcp-servers create --name "my-server" --type http --url "http://localhost:8080/mcp"
```

**stdio server (spawned process):**
```bash
memory agents mcp-servers create --name "github" --type stdio --command "npx" --args "-y,@modelcontextprotocol/server-github"
memory agents mcp-servers create --name "github" --type stdio --command "npx" --args "-y,@modelcontextprotocol/server-github" --env "GITHUB_TOKEN=ghp_xxx"
```

**With env vars:**
```bash
memory agents mcp-servers create --name "my-server" --type http --url "http://..." --env "API_KEY=abc123" --env "ENV=prod"
```

### Inspect (test connection + show capabilities)
```bash
memory agents mcp-servers inspect <server-id>
```
Returns: connection status, latency, server info, list of tools/prompts/resources.

### Sync tools (refresh tool list from live server)
```bash
memory agents mcp-servers sync <server-id>
```

### List tools for a server
```bash
memory agents mcp-servers tools <server-id>
```

### Configure a tool
```bash
memory agents mcp-servers configure <tool-name> <key=value ...>
```

### Delete a server
```bash
memory agents mcp-servers delete <server-id>
```

## Server Types

| Type | When to use | Required flags |
|---|---|---|
| `sse` | Remote server with SSE transport | `--url` |
| `http` | Remote server with HTTP transport | `--url` |
| `stdio` | Local process (spawned by Emergent) | `--command`, optionally `--args`, `--env` |

## Workflow

1. **Adding a new MCP server**: use `create`, then `inspect` to verify connectivity, then `sync` to populate tools
2. **Troubleshooting a server**: use `inspect` to check connection status and see what capabilities it reports
3. **After updating a server's tools**: run `sync` to refresh the cached tool list in Emergent
4. **Finding a server ID**: use `list --output json` and look up by name

## Notes

- `--project` global flag selects the project; falls back to config default
- Server IDs are UUIDs — use `list` to find them by name
- `--args` for stdio type is comma-separated: `"arg1,arg2,arg3"`
