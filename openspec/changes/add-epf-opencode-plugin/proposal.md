# Change: Add EPF OpenCode Plugin

## Why

EPF now has three integration layers — CLI for storage/logic, MCP for agent Q&A, and LSP for inline validation — but lacks the fourth piece: proactive guardrails and on-demand status dashboards inside the agent's environment. Today, an AI agent can write valid YAML (thanks to LSP) and query strategy context (thanks to MCP), but nothing prevents it from committing a broken EPF instance, and there's no way to get a quick visual status of instance health, value model coverage, or OKR progress without manually invoking CLI commands.

An OpenCode plugin fills this gap by hooking into the agent's lifecycle events (tool execution, session idle, file edits) to provide proactive guardrails and exposing custom tools that render rich inline dashboards on demand.

## What Changes

**Guardrails (Event Hooks)**
- `tool.execute.before` hook on `bash` tool — intercept `git commit` commands and run `epf-cli health` first; block the commit if critical validation errors exist in the EPF instance
- `session.idle` hook — auto-run health check when the agent goes idle and surface warnings via `tui.toast.show`
- `file.edited` hook — detect when EPF YAML files are modified and trigger validation summary
- `lsp.client.diagnostics` hook — aggregate LSP diagnostics from EPF files and escalate patterns (e.g., "5 EPF files have errors")

**Dashboard Tools (Custom Tools)**
- `epf_dashboard` tool — runs `epf-cli health`, formats results as rich markdown tables showing instance health, validation status, coverage gaps, and content readiness
- `epf_coverage` tool — runs `epf-cli` coverage analysis and renders value model coverage as a formatted overview (which L2 components have features, which are gaps)
- `epf_roadmap_status` tool — runs OKR progress analysis and renders achievement rates, assumption validation status, and cycle trends

**Distribution**
- Published as an npm package (`opencode-epf` or `@emergent/opencode-epf`)
- Also installable as a local plugin (`.opencode/plugins/` or `~/.config/opencode/plugins/`)
- Zero configuration — auto-detects EPF instances in workspace using `epf-cli` on PATH

## Impact

- Affected specs: `epf-opencode-plugin` (new capability)
- Affected code:
  - New TypeScript plugin package (separate from `apps/epf-cli/`)
  - Location: `packages/opencode-epf/` (new directory in repo root)
  - Dependencies: `@opencode-ai/plugin` (types), `epf-cli` binary on PATH
- No changes to existing EPF CLI, MCP server, or LSP server code
- Requires `epf-cli` to be installed and on PATH (the plugin shells out to it)
- Documentation updates to `apps/epf-cli/AGENTS.md` and `apps/epf-cli/README.md`
