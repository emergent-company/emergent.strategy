# Change: Refactor MCP Tool Architecture for LLM Scalability

## Why

The EPF CLI MCP server exposes ~94 tools. This causes real problems for LLMs:

1. **Context cost**: ~20K tokens consumed by tool definitions before any conversation starts
2. **Selection confusion**: Similar tools with similar descriptions — LLMs pick the wrong one (8 validation tools, 4 review wrappers, 3 health check subsets)
3. **Trivial wrappers and subsets**: Some tools exist only as convenience aliases (review wrappers = `get_wizard` with a hardcoded name) or strict subsets of other tools (`check_instance` is a subset of `health_check`)
4. **No guidance on when to use what**: Tool descriptions say what the tool does, not when to use it — LLMs can't distinguish between tools with similar functions

The tool count will grow as capabilities are added. Without principles governing what becomes an MCP tool and how tools describe themselves, the problem compounds.

## Principles

### P1: MCP tools are for LLM decision-making during conversations

An operation should be an MCP tool if the LLM needs it during an active conversation. Operations that are one-time setup (migration), produce large files (reports), or manage internal caches (reload) are better served by CLI commands. But **authoring operations** (scaffold, import) remain MCP tools because agents in MCP-only clients (Claude Desktop, web UIs) cannot run CLI commands.

### P2: No trivial wrappers or strict subsets

If a tool is literally `get_wizard("some_name")` with a hardcoded argument, it shouldn't be a separate tool — the LLM should call `get_wizard` directly. If a tool's output is a strict subset of another tool's output, it shouldn't exist separately.

### P3: Descriptions tell you WHEN, not just WHAT

Every tool description starts with when to use it, using a `[Category] USE WHEN <trigger>` format. This lets the LLM scan 70 descriptions quickly and match the right tool to the task without reading full paragraphs.

### P4: Response chaining over tool discovery

When tool A always leads to tool B, tool A should tell the LLM what to call next via `required_next_tool_calls` in its response. The LLM follows instructions, not discovery. The existing `epf_get_agent_for_task` and `epf_get_wizard_for_task` already serve as routers — we improve them rather than adding a third.

### P5: Honor existing commitments

Generator tools and wizard tools were declared permanent ("no deprecation"). We honor that. They coexist with agent/skill tools. The goal is not to remove functional tools but to remove wrappers, subsets, and unused surface area.

### P6: Tiered registration for different consumers

| Consumer | Needs | Mode |
|----------|-------|------|
| Coding agent (OpenCode) | Full authoring toolset | Default (~70 tools after cleanup) |
| Strategy consumer app | Read-only strategy queries | `EPF_SERVER_MODE=strategy` (~26 tools) |
| Standalone CLI user | CLI commands, no MCP | `epf-cli` directly |

## What Changes

### Phase 1: Remove wrappers, subsets, and dead weight + rewrite descriptions (~94 → ~72 tools)

The highest-impact, lowest-risk changes. No tool consolidation, no parameter merging, no breaking changes to tool APIs.

1. **Remove review tool wrappers** (4 tools) — `epf_review_strategic_coherence`, `epf_review_feature_quality`, `epf_review_value_model` are aliases for `get_wizard(name)`. `epf_recommend_reviews` lists 3 hardcoded wizards. Agents call `epf_get_wizard` directly.

2. **Remove health check subsets** (3 tools) — `epf_check_instance`, `epf_check_content_readiness`, `epf_check_feature_quality` are strict subsets of `epf_health_check` which runs all three. No reason to call the subset when the superset exists.

3. **Remove utility tools with no standalone value** (5 tools) — `epf_detect_artifact_type` (built into validate), `epf_check_migration_status` (subset of migration_guide), `epf_reload_instance` (should be automatic), `epf_list_agent_skills` (redundant — agent response includes skills), `epf_list_agent_instructions` (fold into `epf_agent_instructions`).

4. **Move true one-time operations to CLI-only** (4 tools) — `epf_migrate_definitions`, `epf_sync_canonical`, `epf_generate_report`, `epf_check_generator_prereqs`. These are run once per instance lifecycle, not during conversations.

5. **Rewrite all tool descriptions** — Apply `[Category] USE WHEN <trigger>` format to every remaining tool. This is the highest-impact single change.

6. **Improve existing routers** — Enhance `epf_get_agent_for_task` to also recommend specific MCP tools (not just agent personas). No new router tool needed.

### Phase 2: Deeper consolidation where it clearly helps (~72 → ~60 tools)

Only consolidate where it genuinely reduces confusion without adding parameter complexity.

1. **Merge aim cycle tools** — `epf_aim_init_cycle` + `epf_aim_archive_cycle` → `epf_aim_cycle` with `action` param (these are closely related and always used together)
2. **Merge diff tools** — `epf_diff_artifacts` + `epf_diff_template` → `epf_diff` with `mode` param (same concept, just different inputs)
3. **Merge value model write tools** — `epf_add_value_model_component` + `epf_add_value_model_sub` → `epf_add_value_model_node` with `level` param
4. **Fold `epf_aim_health` into `epf_health_check`** — health check should run AIM diagnostics as part of its sweep
5. **Context-aware registration** — only register semantic tools when Memory API is configured, only register multi-tenant tools in multi-tenant mode

### Phase 3: Context-aware tool scoping (future)

1. **Agent-scoped tools** — when an EPF agent is activated, the tool list is filtered to that agent's declared skill requirements
2. **Dynamic tool registration** — tools registered/unregistered based on detected instance state

## Impact

- Affected specs: `epf-cli-mcp`
- Affected code: `apps/epf-cli/internal/mcp/server.go`, all `*_tools.go` files
- **No breaking changes in Phase 1** — only removes wrappers/subsets (no real caller depends on `epf_review_strategic_coherence` instead of `epf_get_wizard`)
- **Minor breaking changes in Phase 2** — tool renames (diff_artifacts → diff, aim_init_cycle → aim_cycle)
- Generator tools, wizard tools, skill tools, agent tools all kept as committed
