## Context

EPF CLI provides comprehensive strategy tooling via three integration layers:
- `epf-cli` binary — validation, health checks, coverage analysis, OKR progress
- MCP server (`epf-cli serve`) — agent Q&A via structured tool calls
- LSP server (`epf-cli lsp`) — real-time inline diagnostics and completions

The OpenCode plugin is the fourth layer: proactive guardrails and on-demand dashboards. It is a TypeScript module that uses OpenCode's native plugin system to hook into agent lifecycle events and expose custom tools. It shells out to `epf-cli` for all logic — the plugin is purely an integration/presentation layer.

**Stakeholders:** AI agents working in EPF-enabled repos, human developers using OpenCode for strategy work, EPF framework maintainers.

## Goals / Non-Goals

**Goals:**
- Prevent commits with broken EPF artifacts via pre-commit guardrails
- Surface EPF instance health proactively (session idle, file edit events)
- Provide on-demand rich dashboards (health, coverage, roadmap status) as inline custom tools
- Zero configuration — auto-detect EPF instance and `epf-cli` on PATH
- Work both as a local plugin and as an npm package

**Non-Goals:**
- Graphical/visual dashboards (charts, heat maps) — that's a separate web app project
- Replacing MCP server tools (the plugin's custom tools are for quick inline summaries, not full strategy queries)
- Modifying EPF artifacts (the plugin is read-only / diagnostic — it observes and reports, never writes)
- Supporting editors other than OpenCode (this is OpenCode-specific by design)

## Decisions

### Decision 1: TypeScript plugin using OpenCode's native plugin system

**Why:** OpenCode's plugin system is JS/TS-based (loaded by Bun). No Wasm plugin API exists. The TS plugin system provides event hooks, custom tool definitions, SDK client access, and shell execution — everything needed for guardrails and dashboards.

**Alternatives considered:**
- TinyGo/Wasm module — No host runtime exists in OpenCode. Would require building a custom Wasm sandbox from scratch. Not justified.
- MCP server tools only — Already have this. Doesn't provide proactive guardrails (event hooks).
- Standalone TUI app — Separate process, not integrated into OpenCode's event loop.

### Decision 2: Shell out to `epf-cli` for all logic

**Why:** The plugin is an integration layer, not a reimplementation. `epf-cli` already has health checks, validation, coverage analysis, OKR progress, and content readiness. The plugin calls `epf-cli health --json`, `epf-cli validate --json`, etc., parses the JSON output, and formats it for inline display.

This means:
- Zero code duplication with the Go codebase
- Plugin stays thin (~300-500 lines of TS)
- CLI improvements automatically benefit the plugin
- Single source of truth for all validation/analysis logic

### Decision 3: Guardrails as event hooks, dashboards as custom tools

**Why:** These map naturally to OpenCode's extension model:
- **Guardrails** use `tool.execute.before` (intercept git commit), `session.idle` (health alerts), `file.edited` (validation triggers), and `lsp.client.diagnostics` (pattern detection)
- **Dashboards** use custom tools (`epf_dashboard`, `epf_coverage`, `epf_roadmap_status`) that the LLM can call on demand

This separation keeps the plugin clean: hooks for proactive behavior, tools for on-demand queries.

### Decision 4: Package location at `packages/opencode-epf/`

**Why:** This is a separate TypeScript package, not part of the Go CLI. Placing it at `packages/opencode-epf/` follows standard monorepo conventions and keeps it distinct from `apps/epf-cli/`. It can be published to npm independently.

### Decision 5: JSON output mode for epf-cli communication

**Why:** The plugin needs structured data from `epf-cli`, not human-readable text. The CLI already supports `--format json` on health checks and `--json` on some outputs. Where JSON output doesn't exist yet, we'll add it to the CLI (minor enhancement, not a breaking change). The plugin parses JSON and formats it as markdown tables for inline display.

## Architecture

```
packages/opencode-epf/
├── package.json            # npm package config, @opencode-ai/plugin dependency
├── tsconfig.json           # TypeScript config
├── src/
│   ├── index.ts            # Plugin entry point, exports EPFPlugin function
│   ├── guardrails.ts       # Event hook implementations (commit guard, idle health, file edit)
│   ├── tools.ts            # Custom tool definitions (dashboard, coverage, roadmap)
│   ├── cli.ts              # epf-cli subprocess wrapper (exec, JSON parse, error handling)
│   └── formatters.ts       # JSON → markdown table formatters for inline display
├── tests/
│   ├── guardrails.test.ts  # Unit tests for hook logic
│   ├── tools.test.ts       # Unit tests for tool output formatting
│   └── cli.test.ts         # Unit tests for CLI wrapper (mock subprocess)
└── README.md               # Usage, installation, configuration
```

### Plugin Lifecycle

```
1. OpenCode loads plugin at startup
2. Plugin checks:
   - Is epf-cli on PATH? If not, log warning and disable guardrails
   - Is there an EPF instance in the workspace? (run epf-cli locate --json)
   - Cache instance path for subsequent calls
3. Register event hooks:
   - tool.execute.before → commit guard
   - session.idle → health check toast
   - file.edited → EPF file validation
   - lsp.client.diagnostics → diagnostic aggregation
4. Register custom tools:
   - epf_dashboard → inline health overview
   - epf_coverage → value model coverage
   - epf_roadmap_status → OKR progress
5. Plugin runs until OpenCode exits
```

### Commit Guard Flow

```
tool.execute.before (bash tool):
  1. Parse command string for git commit patterns
  2. If not a git commit → pass through (no-op)
  3. If git commit detected:
     a. Run: epf-cli health <instance_path> --format json
     b. Parse JSON result
     c. If critical errors exist → throw Error("EPF instance has N critical errors. Run epf_dashboard for details.")
     d. If warnings only → allow commit, show toast with warning count
     e. If healthy → allow commit silently
```

## Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|---|---|---|
| `tool.execute.before` doesn't fire for MCP tools (known OpenCode limitation #2319) | Certain | Document limitation; guardrails only apply to built-in bash tool. MCP-initiated commits are unguarded. |
| `epf-cli` not on PATH in some environments | Medium | Graceful degradation — plugin disables itself and logs warning. Clear error message with install instructions. |
| Subprocess overhead on every git commit | Low | `epf-cli health --json` runs in <500ms for typical instances. Cache results with 30s TTL. |
| OpenCode plugin API changes | Low | Pin `@opencode-ai/plugin` version, follow OpenCode release notes. |
| False positives blocking commits | Medium | Allow `--force` escape hatch by detecting `git commit --no-verify` or similar. Configurable strictness level. |

## Open Questions

- Should the plugin have a configuration file (e.g., `.opencode/epf-plugin.json`) for customizing strictness levels, which guardrails are active, and dashboard defaults?
- Should `epf_dashboard` output use collapsible sections (if OpenCode supports them) or flat markdown?
- Should the session.idle health check run on every idle event or only the first one per session?
