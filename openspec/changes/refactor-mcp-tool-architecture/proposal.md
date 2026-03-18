# Change: Refactor MCP Tool Architecture for LLM Scalability

## Why

The EPF CLI MCP server exposes ~94 tools. This is too many for LLMs to handle effectively:

1. **Context cost**: ~20K tokens consumed by tool definitions before any conversation starts
2. **Selection confusion**: 8 validation variants, 7 wizard variants, 5 generator variants — LLMs pick the wrong one
3. **Legacy duplication**: Wizard and generator tools are parallel to the newer agent and skill tools (same content, different response shapes)
4. **Not everything needs to be an MCP tool**: Some operations (migration, scaffolding, report generation) are better served by CLI commands, since they're rare, produce large output, or are one-time operations

The tool count will only grow as capabilities are added (semantic engine, scenario projection, multi-instance networking). Without architectural principles governing what becomes an MCP tool, the problem compounds.

## Principles

### P1: MCP tools are for LLM decision-making, not CLI wrapping

An operation should be an MCP tool only if it helps the LLM make a better decision during an active conversation. Operations that are:
- **One-time setup** (migration, scaffolding, import) → CLI command
- **Large output** (reports, exports) → CLI command
- **Cache management** (reload, sync) → Automatic or CLI command
- **Subset of another tool** (check_instance is a subset of health_check) → Parameter on parent tool

### P2: One tool per concern, parameters for variants

Instead of 8 validation tools, one `epf_validate` tool with a `mode` parameter. Instead of 3 review tools, `epf_get_wizard("strategic_coherence_review")`. Fewer tools with richer parameters > many tools with narrow scope.

### P3: Response chaining replaces tool chaining

When tool A always leads to tool B, tool A should include tool B's output in its response (or a `next_tool` directive). The LLM shouldn't need to discover and call tool B separately — the response tells it what to do.

### P4: Progressive disclosure via a router tool

A single `epf` routing tool can handle broad queries ("I need to validate", "help me create a feature") and return the specific tool name + parameters to call. This replaces browsing 94 descriptions with asking one tool.

### P5: Tiered registration for different consumers

| Consumer | Needs | Mode |
|----------|-------|------|
| Coding agent (OpenCode) | Full authoring toolset | Default (~40 tools after consolidation) |
| Strategy consumer app | Read-only strategy queries | `EPF_SERVER_MODE=strategy` (~26 tools) |
| Integrated strategy tool | Everything + semantic engine | `EPF_SERVER_MODE=full` (all tools) |
| Standalone CLI user | CLI commands, no MCP | `epf-cli` directly |

## What Changes

### Phase 1: Consolidate duplicates and remove legacy wrappers (~94 → ~55 tools)

1. **Remove legacy generator tools** (5 tools) — `epf_list_generators`, `epf_get_generator`, `epf_check_generator_prereqs`, `epf_scaffold_generator`, `epf_validate_generator_output` — all are parallel to skill tools
2. **Remove review tool wrappers** (4 tools) — `epf_review_strategic_coherence`, `epf_review_feature_quality`, `epf_review_value_model`, `epf_recommend_reviews` — agents call `epf_get_wizard` directly
3. **Merge validation tools** — `epf_validate_file` absorbs `epf_validate_with_plan` (mode param), `epf_validate_section` (section param), `epf_validate_content` (content param)
4. **Merge catalog tools** — `epf_list_schemas`, `epf_list_artifacts`, `epf_get_phase_artifacts` → one `epf_browse` tool
5. **Move rare ops to CLI-only** — `epf_migrate_definitions`, `epf_sync_canonical`, `epf_generate_report`, `epf_import_agent`, `epf_import_skill`
6. **Eliminate subsets** — `epf_check_instance`, `epf_check_content_readiness`, `epf_check_feature_quality` (all subsets of health_check), `epf_detect_artifact_type` (built into validate), `epf_check_migration_status` (subset of migration_guide)

### Phase 2: Add router tool and improve descriptions (~55 tools, better navigable)

1. **Add `epf` router tool** — single entry point that takes a task description and returns which tool to call with what parameters. Replaces browsing 55 descriptions.
2. **Rewrite descriptions with "USE WHEN" prefix** — every tool description starts with when to use it, not what it does. E.g., "USE WHEN you just wrote or edited an EPF YAML file and need to verify it's valid."
3. **Add tool categories to descriptions** — prefix with `[Validate]`, `[Query]`, `[Write]`, `[AIM]` etc.

### Phase 3: Context-aware tool filtering (future)

1. **Agent-scoped tools** — when an EPF agent is activated, only tools relevant to that agent's skills are exposed
2. **Dynamic registration** — tools registered/unregistered based on context (instance detected, Memory API configured, etc.)

## Impact

- Affected specs: `epf-cli-mcp`
- Affected code: `apps/epf-cli/internal/mcp/server.go`, all `*_tools.go` files
- **BREAKING**: Generator tool names removed (callers must use skill tools)
- **BREAKING**: Some tool names change (validate_with_plan → validate_file with mode param)
- Backward compatibility: Legacy tools can be re-enabled via `EPF_LEGACY_TOOLS=true` env var during transition
