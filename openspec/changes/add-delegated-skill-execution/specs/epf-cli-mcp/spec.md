## ADDED Requirements

### Requirement: Skill Execution Modes

The skill system SHALL support three execution modes declared via an `execution` field in the skill manifest:

1. **`prompt-delivery`** (default) -- The MCP server returns the skill's prompt content for the LLM to follow. This is the existing behavior and SHALL remain the default when `execution` is not specified.
2. **`delegated`** -- The MCP server returns delegation instructions directing the LLM to call a specific tool on a specified companion MCP server. The skill manifest MUST include a `delegate` block with `server` (MCP server name) and `tool` (tool name) fields.
3. **`inline`** (reserved) -- Reserved for future use. The MCP server SHALL reject skills with `execution: inline` with an error indicating the mode is not yet supported.

#### Scenario: Default execution mode is prompt-delivery
- **WHEN** a skill manifest does not include an `execution` field
- **THEN** the system SHALL treat it as `execution: prompt-delivery`
- **AND** behavior SHALL be identical to current skill handling

#### Scenario: Delegated skill requires delegate block
- **WHEN** a skill manifest specifies `execution: delegated`
- **AND** the `delegate` block is missing or incomplete (no `server` or `tool`)
- **THEN** manifest validation SHALL report an error

#### Scenario: Inline mode rejected
- **WHEN** a skill manifest specifies `execution: inline`
- **THEN** the system SHALL return an error indicating inline execution is not yet supported

### Requirement: Delegated Skill Response

When `epf_get_skill` is called for a skill with `execution: delegated`, the MCP server SHALL return delegation instructions instead of prompt content. The response MUST include:

1. The target MCP server name (from `delegate.server`)
2. The target tool name (from `delegate.tool`)
3. The skill's input schema (if defined) for parameter validation
4. Clear instructions for the LLM to invoke the specified tool on the specified server

The response SHALL NOT include prompt content (the `prompt` field SHALL be replaced with delegation instructions).

#### Scenario: Delegated skill returns delegation instructions
- **WHEN** `epf_get_skill` is called with a skill name that has `execution: delegated`
- **AND** `delegate.server` is `epf-agents` and `delegate.tool` is `memory_graph_sync`
- **THEN** the response SHALL include delegation instructions directing the LLM to call `memory_graph_sync` on the `epf-agents` MCP server
- **AND** the response SHALL NOT include the skill's prompt content

#### Scenario: Delegated skill includes input schema
- **WHEN** `epf_get_skill` is called for a delegated skill that has an input schema defined
- **THEN** the delegation instructions SHALL include the input schema so the LLM can construct valid tool call parameters

### Requirement: Delegated Skill Discovery

Delegated skills SHALL participate in the same discovery mechanisms as prompt-delivery skills:

1. Three-tier discovery (instance > framework > global > embedded)
2. Keyword-based recommender (`epf_get_skill_for_task` or agent routing)
3. Listing via `epf_list_skills`
4. Agent-to-skill relationships (`skills.required` in agent manifests)

The skill listing response SHALL indicate the execution mode so consumers know whether the skill will return prompt content or delegation instructions.

#### Scenario: Delegated skill appears in skill listing
- **WHEN** `epf_list_skills` is called
- **AND** both prompt-delivery and delegated skills exist
- **THEN** all skills SHALL appear in the listing
- **AND** each skill entry SHALL indicate its execution mode

#### Scenario: Delegated skill found by recommender
- **WHEN** `epf_get_agent_for_task` or skill recommendation is invoked with a task matching a delegated skill's keywords
- **THEN** the delegated skill SHALL be recommended the same as any prompt-delivery skill

### Requirement: Delegated Execution Observability

Companion MCP servers providing delegated skill execution SHALL return structured execution logs as part of their tool response. The execution log MUST include:

1. Skill name
2. Start and completion timestamps
3. Per-step status (name, status, duration, optional details)
4. Overall result status (success, failure, partial)

The `epf_session_audit` tool SHALL include delegated tool calls in its audit trail since they are standard MCP tool calls visible to the host.

#### Scenario: Successful delegated execution includes log
- **WHEN** a delegated skill is executed via the companion MCP server
- **AND** execution completes successfully
- **THEN** the tool response SHALL include a structured execution log with timestamps, step details, and a `success` result

#### Scenario: Failed delegated execution includes error context
- **WHEN** a delegated skill execution fails
- **THEN** the tool response SHALL include the execution log up to the point of failure
- **AND** the failed step SHALL include error details sufficient for diagnosis

### Requirement: Skill Manifest Validation for Delegation Fields

The skill manifest schema SHALL validate delegation-specific fields:

1. When `execution` is `delegated`, `delegate.server` and `delegate.tool` MUST be present and non-empty strings.
2. When `execution` is `prompt-delivery` or absent, `delegate` block MUST NOT be present (or SHALL be ignored with a warning).
3. The `execution` field SHALL only accept values: `prompt-delivery`, `delegated`, `inline`.

#### Scenario: Valid delegated manifest passes validation
- **WHEN** a skill manifest has `execution: delegated` with `delegate.server: epf-agents` and `delegate.tool: memory_graph_sync`
- **THEN** validation SHALL pass

#### Scenario: Invalid execution value rejected
- **WHEN** a skill manifest has `execution: compute`
- **THEN** validation SHALL fail with an error listing valid execution values

#### Scenario: Delegate block on prompt-delivery skill triggers warning
- **WHEN** a skill manifest has `execution: prompt-delivery` and a `delegate` block
- **THEN** validation SHALL produce a warning that the delegate block is ignored for prompt-delivery skills
