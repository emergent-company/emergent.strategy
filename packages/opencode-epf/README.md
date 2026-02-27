# opencode-epf

OpenCode plugin for **EPF** (Emergent Product Framework) — proactive guardrails and on-demand dashboard tools.

Part of the EPF **Power Combo**: CLI (storage/logic) -> MCP (agent consultant) -> LSP (agent tutor) -> **Plugin (agent dashboard/guardrails)**.

## What It Does

**Guardrails** (automatic, event-driven):

| Hook | Trigger | Behavior |
|------|---------|----------|
| Commit guard | `git commit` via bash tool | Blocks commit if EPF instance has critical errors. Use `--no-verify` to bypass. |
| Session idle | First idle event per session | Shows toast with EPF instance health summary. |
| File edit | EPF YAML file saved | Validates the file and shows toast if errors found. |
| Diagnostic aggregation | EPF LSP diagnostics | Summarizes when 5+ files have diagnostics. |

**Dashboard tools** (on-demand, LLM-invokable):

| Tool | Description |
|------|-------------|
| `epf_dashboard` | Instance health overview — tiers, schema validation, content readiness, relationships. |
| `epf_coverage` | Value model coverage analysis — L2 components by track, uncovered gaps, next steps. |
| `epf_roadmap_status` | OKR achievement rates, assumption validation, cycle trends. |

## Requirements

- **OpenCode** (with plugin support)
- **epf-cli** v0.24.0+ on PATH (`brew install epf-cli` or download from [releases](https://github.com/emergent-company/emergent.strategy/releases))
- An EPF instance in your workspace (with `_epf.yaml` anchor file)

## Installation

Add `opencode-epf` to your `opencode.json`:

```json
{
  "plugin": ["opencode-epf"]
}
```

OpenCode will auto-install the package on startup.

### Local development

If you're developing the plugin itself, create a shim at `.opencode/plugins/opencode-epf.ts`:

```ts
export { EPFPlugin } from "../../packages/opencode-epf/src/index";
```

This loads the plugin directly from source (requires Bun).

## How It Works

The plugin is **purely an integration/presentation layer**. All EPF logic runs in the `epf-cli` Go binary via subprocess calls:

```
OpenCode Plugin (TypeScript)
    |
    |-- event hooks --> epf-cli health / validate
    |-- custom tools --> epf-cli health / coverage / aim okr-progress / aim validate-assumptions
    |
    v
epf-cli (Go binary)
    |
    v
EPF Instance (YAML files in READY/FIRE/AIM/)
```

### Plugin Architecture

```
src/
├── index.ts        # Plugin entry point — orchestrates hooks and tools
├── cli.ts          # CLI subprocess wrapper (findCLI, execCLI, detectInstance, etc.)
├── guardrails.ts   # Event hook helpers (isGitCommit, isEPFFile, healthToastVariant)
├── formatters.ts   # JSON -> markdown formatters for dashboard output
└── tools.ts        # Custom tool definitions (epf_dashboard, epf_coverage, epf_roadmap_status)
```

## Guardrail Details

### Commit Guard

Intercepts `tool.execute.before` for bash commands containing `git commit`. Runs `epf-cli health --json` on the detected instance:

- **Critical errors** (missing anchor, schema failures): throws an Error that blocks the commit.
- **Warnings only** (quality issues, placeholders): allows commit with a toast notification.
- **Healthy**: silent pass-through.

**Overrides:**

| Method | Effect |
|--------|--------|
| `git commit --no-verify` | Bypasses the guardrail entirely (detected and respected) |
| No EPF instance in workspace | Guardrail is inactive (no-op) |
| `epf-cli` not on PATH | Plugin disables itself at startup |
| CLI failure during health check | Commit proceeds (fail-open to avoid blocking work) |

**Detection patterns:** `git commit`, `git commit -m "..."`, `git commit -am "..."`, `git commit --amend`, and any other `git commit` variant. Whitespace is normalized before matching.

### Session Idle Health Check

On the first `session.idle` event, runs a health check and shows a toast with the instance status. Only fires once per session to avoid noise.

**Behavior:**
- Toast variant reflects health: `success` (healthy), `info` (warnings), `warning` (errors), `error` (critical).
- Subsequent idle events in the same session are ignored.
- If no EPF instance is detected, the hook is skipped entirely.

### File Edit Validation

When a `file.edited` event fires for a YAML file inside `READY/`, `FIRE/`, or `AIM/`, runs `epf-cli validate --ai-friendly` and shows a toast if errors are found.

**File matching:** Only `.yaml` and `.yml` files under paths containing `/READY/`, `/FIRE/`, or `/AIM/` are validated. All other edits are ignored.

### Diagnostic Aggregation

Listens for `lsp.client.diagnostics` events from the EPF LSP server (`serverID: "epf"`). When 5+ files have diagnostics, shows a summary toast.

**Behavior:**
- Only tracks diagnostics where `serverID` is `"epf"`.
- Toast fires at every multiple of 5 files (5, 10, 15, ...) to avoid spamming.
- Counts are tracked per session and reset on restart.

## Tool Details

### `epf_dashboard`

No arguments. Returns a markdown report with:

- Overall status and health tiers (critical/schema/quality scores)
- Structure check results
- Schema validation summary with invalid file list
- Instance check pass/fail counts
- Relationship coverage (L2 components, grade)
- Content readiness (score, grade, placeholder count)

<details>
<summary>Example output</summary>

```markdown
## EPF Instance Health

**Instance:** `docs/EPF/_instances/emergent`
**Overall Status:** warning

### Health Tiers
| Tier | Score | Issues | Summary |
|------|-------|--------|---------|
| critical | 10/10 | 0 | No critical issues |
| schema | 18/20 | 2 | 2 files have schema errors |
| quality | 7/10 | 3 | 3 quality issues |

### Structure
- Repo type: phased
- Valid: yes
- Instance structure is valid

### Schema Validation
| Metric | Count |
|--------|-------|
| Total files | 12 |
| Valid | 10 |
| Invalid | 2 |

**Invalid files:**
- `product/fd-014.yaml` (feature_definition): 3 error(s)
- `READY/01_insight_analyses.yaml` (insight_analyses): 1 error(s)

### Instance Checks
Passed: 7/8

### Relationships
- Coverage: 42% (8/19 L2 components)
- Grade: C

### Content Readiness
- Score: 85
- Grade: B
- Placeholders remaining: 4
```

</details>

### `epf_coverage`

| Arg | Type | Description |
|-----|------|-------------|
| `track` | string (optional) | Filter: `Product`, `Strategy`, `OrgOps`, or `Commercial` |

Returns a markdown report with:

- Coverage percentage and L2 component counts
- Layer breakdown table with visual coverage bars
- Top 10 uncovered components
- Next steps from CLI guidance

<details>
<summary>Example output</summary>

```markdown
## EPF Value Model Coverage

**Track:** Product | **Coverage:** 60% (6/10 L2 components)

### Coverage by Layer
| Layer | Components | Covered | Coverage |
|-------|-----------|---------|----------|
| Discovery | 3 | 2 | [######----] 60% |
| Core | 4 | 3 | [########--] 80% |
| Integration | 3 | 1 | [###-------] 30% |

### Uncovered Components (top 10)
- `Product.Discovery.MarketAnalysis`
- `Product.Core.DataPipeline`
- `Product.Integration.ExternalAPIs`
- `Product.Integration.Webhooks`

### Next Steps
- Create feature definitions for uncovered L2 components
- Review value model for components that may no longer be relevant
```

</details>

### `epf_roadmap_status`

| Arg | Type | Description |
|-----|------|-------------|
| `track` | string (optional) | Filter: `product`, `strategy`, `org_ops`, `commercial` |
| `cycle` | string (optional) | Filter by cycle number |

Runs OKR progress and assumption validation **in parallel**. Returns:

- Overall achievement rate and KR breakdown
- Progress by track table
- Per-cycle OKR details
- Assumption validation summary with status icons

<details>
<summary>Example output</summary>

```markdown
## EPF Roadmap Status

### Overall OKR Progress
**Achievement Rate:** 65% | **Total KRs:** 12
Exceeded: 2 | Met: 6 | Partially Met: 3 | Missed: 1

### Progress by Track
| Track | KRs | Achievement |
|-------|-----|-------------|
| product | 5 | 80% |
| strategy | 3 | 67% |
| org_ops | 2 | 50% |
| commercial | 2 | 50% |

### Cycle 1
Achievement: 65% (12 KRs)

| OKR | Track | KRs | Rate |
|-----|-------|-----|------|
| Deliver core knowledge management | product | 5 | 80% |
| Establish market positioning | strategy | 3 | 67% |
| Build operational foundation | org_ops | 2 | 50% |
| Validate revenue model | commercial | 2 | 50% |

### Assumption Validation
**Total:** 8 | Validated: 3 | Invalidated: 1 | Inconclusive: 2 | Pending: 2

| ID | Track | Status |
|----|-------|--------|
| A-001 | product | [+] validated |
| A-002 | product | [+] validated |
| A-003 | strategy | [x] invalidated |
| A-004 | strategy | [?] inconclusive |
| A-005 | commercial | [ ] pending |
```

</details>

## Development

```bash
# Install dependencies
cd packages/opencode-epf && bun install

# Build (JS bundle + type declarations)
bun run build

# Type check
bun run typecheck

# Run tests
bun test
```

## License

MIT
