## ADDED Requirements

### Requirement: Tool Description Format

All MCP tool descriptions SHALL follow the format: `[Category] USE WHEN <trigger>. <what it does>. <constraint or post-condition if any>.`

The trigger sentence MUST be unique across all tools — no two tools share the same trigger condition.

#### Scenario: Description enables correct tool selection

- **WHEN** an LLM reads tool descriptions for validation tools
- **THEN** each description starts with a distinct trigger condition
- **AND** the LLM can distinguish `epf_validate_file` from `epf_batch_validate` from `epf_validate_relationships` by reading only the first sentence

#### Scenario: Category prefix enables scanning

- **WHEN** an LLM scans all tool descriptions looking for a write operation
- **THEN** it can filter by `[Write]` prefix to quickly find relevant tools

### Requirement: MCP Tool Eligibility Principles

An operation SHALL be registered as an MCP tool only if:
1. The LLM needs it during an active conversation (not one-time setup)
2. It is not a strict subset of another tool's output
3. It is not a trivial alias (hardcoded argument to another tool)

Operations failing these criteria SHALL remain accessible as CLI commands.

#### Scenario: One-time migration is CLI-only

- **WHEN** a developer needs to run `migrate-definitions`
- **THEN** they use the CLI command `epf-cli migrate-definitions`
- **AND** the operation is NOT registered as an MCP tool

#### Scenario: Health check subset is not a separate tool

- **WHEN** an agent needs to check instance structure
- **THEN** it calls `epf_health_check` which includes structure checking
- **AND** there is no separate `epf_check_instance` tool

### Requirement: Agent Router Enhancement

The `epf_get_agent_for_task` tool SHALL return direct tool recommendations when no agent activation is needed.

#### Scenario: Direct tool recommendation for validation

- **WHEN** `epf_get_agent_for_task` is called with task "validate my feature definition"
- **THEN** it returns `direct_tool: "epf_validate_file"` with parameter suggestions
- **AND** `agent: null` indicating no agent activation needed

### Requirement: No Deprecation of Generator or Wizard Tools

Generator tools (`epf_list_generators`, `epf_get_generator`, `epf_scaffold_generator`, `epf_validate_generator_output`) and wizard tools (`epf_list_wizards`, `epf_get_wizard`, `epf_get_wizard_for_task`) SHALL remain permanently registered. They coexist with agent and skill tools.

#### Scenario: Generator tools remain available

- **WHEN** the MCP server starts in default mode
- **THEN** both `epf_list_generators` and `epf_list_skills` are registered
- **AND** both return valid results

## REMOVED Requirements

### Requirement: Review Tool Wrappers

**Reason**: `epf_review_strategic_coherence`, `epf_review_feature_quality`, `epf_review_value_model` are trivial aliases for `epf_get_wizard` with a hardcoded name. `epf_recommend_reviews` lists 3 hardcoded wizard names. All are replaceable by direct `epf_get_wizard` calls.

**Migration**: `epf_review_strategic_coherence` → `epf_get_wizard("strategic_coherence_review")`

### Requirement: Health Check Subset Tools

**Reason**: `epf_check_instance`, `epf_check_content_readiness`, `epf_check_feature_quality` are strict subsets of `epf_health_check`. The superset tool returns all the same data.

**Migration**: Call `epf_health_check` instead.

### Requirement: Redundant Utility Tools

**Reason**: `epf_detect_artifact_type` (built into validate), `epf_check_migration_status` (subset of migration_guide), `epf_reload_instance` (should be automatic), `epf_list_agent_skills` (included in `epf_get_agent` response), `epf_list_agent_instructions` (folded into `epf_agent_instructions`).

**Migration**: Use the parent tool that already includes this functionality.
