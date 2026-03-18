# Design: MCP Tool Architecture Refactoring

## Context

The EPF CLI MCP server has grown organically to ~94 tools across 16 categories. LLMs struggle with tool selection at this scale. The tool count will keep growing as new capabilities are added. We need architectural principles and a concrete plan to bring the count down without losing functionality.

## Goals

- Reduce MCP tool count from ~94 to ~40 for the default coding agent mode
- Establish clear principles for what becomes an MCP tool vs CLI command
- Make remaining tools easily navigable via a router tool
- Support multiple consumer modes (coding agent, strategy reader, full suite)
- Maintain backward compatibility during transition

## Non-Goals

- Removing functionality — every current capability remains accessible (via CLI or MCP)
- Changing the MCP protocol — we work within standard MCP
- Building a dynamic tool registry — out of scope for now

## Decisions

### Decision 1: The Router Tool

A single `epf` tool serves as the entry point for agents who don't know which tool to call. It accepts a free-text `task` description and returns:

```json
{
  "recommended_tool": "epf_validate_file",
  "parameters": {"path": "...", "ai_friendly": "true"},
  "confidence": 0.95,
  "reasoning": "You mentioned validating after editing a YAML file",
  "alternatives": [
    {"tool": "epf_health_check", "when": "If you want a comprehensive check, not just this file"}
  ]
}
```

This is similar to `epf_get_agent_for_task` but operates at the tool level, not the agent level. It uses keyword matching and task classification — no LLM call needed.

**Implementation**: A static routing table mapping task patterns → tools. Lives in `internal/mcp/router.go`. Patterns are compiled regexes with priority ordering.

### Decision 2: Parameter Consolidation Strategy

| Current Tools | Consolidated Tool | Discriminating Parameter |
|--------------|-------------------|------------------------|
| `epf_validate_file` + `epf_validate_with_plan` + `epf_validate_section` + `epf_validate_content` | `epf_validate` | `mode`: `file` (default), `plan`, `section`, `content` |
| `epf_list_schemas` + `epf_list_artifacts` + `epf_get_phase_artifacts` | `epf_browse` | `what`: `schemas`, `artifacts`, `phase` |
| `epf_add_implementation_reference` + `epf_update_capability_maturity` + `epf_add_mapping_artifact` | `epf_update_relationships` | `action`: `add_reference`, `update_maturity`, `add_mapping` |
| `epf_aim_init_cycle` + `epf_aim_archive_cycle` | `epf_aim_cycle` | `action`: `init`, `archive` |
| `epf_diff_artifacts` + `epf_diff_template` | `epf_diff` | `mode`: `artifacts`, `template` |
| `epf_add_value_model_component` + `epf_add_value_model_sub` | `epf_add_value_model_node` | `level`: `component`, `sub_component` |

### Decision 3: CLI-Only Operations

These operations move to CLI-only (removed from MCP):

| Operation | Why CLI-only |
|-----------|-------------|
| `epf_migrate_definitions` | One-time migration, rare |
| `epf_sync_canonical` | One-time sync, rare |
| `epf_generate_report` | Large output, better as file |
| `epf_import_agent` | Rare, complex format detection |
| `epf_import_skill` | Rare, complex format detection |
| `epf_reload_instance` | Should be automatic on file change |
| `epf_check_migration_status` | Subset of `epf_get_migration_guide` |
| `epf_detect_artifact_type` | Built into `epf_validate` |

### Decision 4: Legacy Tool Sunset

Generator tools (`epf_list_generators`, `epf_get_generator`, etc.) and review tool wrappers (`epf_review_strategic_coherence`, etc.) are removed from default registration. They can be re-enabled via `EPF_LEGACY_TOOLS=true` for transition.

The wizard tools (`epf_list_wizards`, `epf_get_wizard`, `epf_get_wizard_for_task`) are kept — they're still referenced in AGENTS.md and serve a different routing purpose than agent tools.

### Decision 5: Description Format

Every tool description follows this template:

```
[Category] USE WHEN <trigger>. <one-line what it does>. <key constraint or post-condition if any>.
```

Examples:

```
[Validate] USE WHEN you wrote or edited an EPF YAML file. Validates against its schema and returns errors with fix hints. MUST be called after every write.

[Query] USE WHEN you need to understand who the product is for. Returns all target personas with ID, name, role, and description.

[Write] USE WHEN you need to track that a PR implements a feature. Links implementation artifacts (PRs, specs, code) to feature definitions.
```

### Decision 6: Tool Count Targets

| Mode | Current | After Phase 1 | After Phase 2 |
|------|---------|---------------|---------------|
| Full (all tools) | ~94 | ~55 | ~55 + router |
| Default (coding agent) | ~94 | ~55 | ~40 (router assists) |
| Strategy-only (consumer) | ~26 | ~26 | ~26 + router |

## Risks / Trade-offs

### Risk: Breaking existing integrations
- **Mitigation**: `EPF_LEGACY_TOOLS=true` re-enables removed tools. Transition period of 2 cycles before hard removal. AGENTS.md updated before tools are removed.

### Risk: Parameter consolidation makes tools harder to discover
- **Mitigation**: The router tool handles discovery. Tool descriptions mention all modes.

### Risk: CLI-only operations aren't accessible from MCP clients
- **Mitigation**: These are genuinely rare operations. An agent can still run CLI commands via bash tool.

## Open Questions

1. Should the router tool be named `epf` (very short, might conflict) or `epf_find_tool` or `epf_help`?
2. Should we deprecate wizard tools in favor of agent tools, or keep both permanently?
3. How do we handle the AGENTS.md update — do we update it before or after the tool changes?
