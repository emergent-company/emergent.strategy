# Design: MCP Tool Architecture Refactoring

## Context

The EPF CLI MCP server has grown to ~94 tools. LLMs struggle with selection at this scale — not because of the count alone, but because similar tools have similar descriptions, making it hard to pick the right one. The fix is a combination of removing genuinely redundant tools and rewriting descriptions so the remaining ones are clearly distinguishable.

## Goals

- Remove wrappers, subsets, and dead weight (~94 → ~72)
- Make every remaining tool clearly distinguishable via description format
- Honor the "no deprecation" commitment for generator and wizard tools
- Support multiple consumer modes (coding agent, strategy reader)
- Zero breaking changes in Phase 1

## Non-Goals

- Consolidating tools by adding mode parameters (learned: replaces tool confusion with parameter confusion)
- Adding a new router tool (learned: overlaps with existing agent/wizard-for-task routers)
- Removing generator or wizard tools (committed to permanent coexistence)

## Decisions

### Decision 1: Description Format

Every tool description follows:

```
[Category] USE WHEN <trigger>. <one-line what>. <constraint>.
```

Categories: `[Validate]`, `[Health]`, `[Query]`, `[Write]`, `[AIM]`, `[Semantic]`, `[Agent]`, `[Wizard]`, `[Skill]`, `[Generator]`, `[Instance]`, `[Diff]`, `[Audit]`

Examples:

```
BEFORE: "Validate a local EPF YAML file against its schema. Automatically detects
the artifact type from the filename/path pattern. Use ai_friendly=true for
structured output optimized for AI agents..."

AFTER: "[Validate] USE WHEN you wrote or edited an EPF YAML file. Validates against
schema with auto-detected artifact type. MUST call after every write to an EPF file."
```

```
BEFORE: "Run a comprehensive health check on an EPF instance. RECOMMENDED FIRST STEP:
Always run health check before starting work to assess scope. Returns structure
validation, schema validation, content readiness..."

AFTER: "[Health] USE WHEN starting work on an EPF instance or diagnosing problems.
Runs all checks (structure, schema, content readiness, relationships). Call this FIRST."
```

The key insight: the trigger sentence must be unique across all tools. Two tools should never have the same trigger.

### Decision 2: What Gets Removed (Phase 1)

**Strict rule**: A tool is removed only if calling it is equivalent to calling another tool with specific arguments. No functionality is lost.

| Removed Tool | Equivalent | Why redundant |
|-------------|-----------|---------------|
| `epf_review_strategic_coherence` | `epf_get_wizard("strategic_coherence_review")` | Hardcoded alias |
| `epf_review_feature_quality` | `epf_get_wizard("feature_quality_review")` | Hardcoded alias |
| `epf_review_value_model` | `epf_get_wizard("value_model_review")` | Hardcoded alias |
| `epf_recommend_reviews` | `epf_list_wizards(type="review")` | Lists 3 hardcoded names |
| `epf_check_instance` | `epf_health_check` | Strict subset |
| `epf_check_content_readiness` | `epf_health_check` | Strict subset |
| `epf_check_feature_quality` | `epf_health_check` | Strict subset |
| `epf_detect_artifact_type` | `epf_validate_file` | Built into validate |
| `epf_check_migration_status` | `epf_get_migration_guide` | Strict subset |
| `epf_reload_instance` | Automatic on file change | Cache management |
| `epf_list_agent_skills` | `epf_get_agent` response | Already included |
| `epf_list_agent_instructions` | `epf_agent_instructions` | Fold into existing |

**CLI-only moves** (tool still works, just not registered as MCP):

| Tool | Why CLI-only |
|------|-------------|
| `epf_migrate_definitions` | One-time per instance lifecycle |
| `epf_sync_canonical` | One-time sync operation |
| `epf_generate_report` | Large output, better as file |
| `epf_check_generator_prereqs` | Rare, already checked by `epf_get_generator` |

### Decision 3: Enhance Existing Routers Instead of Adding New Ones

`epf_get_agent_for_task` already routes tasks → agents. We extend it to also suggest specific MCP tools when no agent activation is needed. For example:

```json
Input: {"task": "validate my feature definition"}
Output: {
  "agent": null,
  "direct_tool": "epf_validate_file",
  "parameters": {"path": "...", "ai_friendly": "true"},
  "reasoning": "Validation doesn't require agent activation — call epf_validate_file directly"
}
```

This means the existing router covers both agent workflows and direct tool usage, without adding tool count.

### Decision 4: Phase 2 Consolidation Criteria

A tool merge in Phase 2 is only justified if:
1. The two tools share a handler implementation (same code, just different entry point)
2. The merged parameters are obvious (no ambiguity about which "mode" to use)
3. The merged tool name clearly covers both use cases

Tools that meet all three: `aim_init_cycle` + `aim_archive_cycle` (both are cycle management), `diff_artifacts` + `diff_template` (both are diff), `add_value_model_component` + `add_value_model_sub` (both add VM nodes).

Tools that fail: validation tools (different output shapes), catalog tools (different data sources), relationship maintenance tools (different write targets).

## Risks / Trade-offs

### Risk: Removing subsets breaks some workflow that depends on the narrow tool
- **Mitigation**: Check AGENTS.md and all wizard/agent prompts for references to removed tools before removal. Update references.

### Risk: Description rewrite changes meaning for tools with established usage patterns
- **Mitigation**: Keep the core information, just restructure it. The trigger is added, not replacing.

### Risk: CLI-only tools are inaccessible from MCP-only clients
- **Mitigation**: Only truly one-time operations go CLI-only. Scaffold, import, and other authoring tools stay MCP.

## Open Questions

1. Should we deprecate wizard tools in favor of agent tools eventually, or commit to permanent coexistence?
2. Should description rewrite be validated by testing tool selection accuracy with multiple LLMs?
3. What's the right category prefix for tools that span concerns (e.g., `epf_get_strategic_context` is both Query and Synthesis)?
