## ADDED Requirements

### Requirement: Tool Selection Router

The system SHALL provide a routing tool (`epf` or `epf_help`) that accepts a free-text task description and returns the recommended MCP tool name and parameters.

#### Scenario: Agent doesn't know which validation tool to use

- **WHEN** the router is called with task "I just edited a north star YAML file"
- **THEN** it returns `epf_validate_file` with `path` parameter guidance
- **AND** confidence >= 0.8

#### Scenario: Agent needs strategy context

- **WHEN** the router is called with task "what features do we have"
- **THEN** it returns `epf_list_features` with instance_path guidance
- **AND** includes alternatives like `epf_search_strategy`

### Requirement: Tool Description Format

All MCP tool descriptions SHALL follow the format: `[Category] USE WHEN <trigger>. <what it does>. <constraint or post-condition if any>.`

#### Scenario: Description enables correct selection

- **WHEN** an LLM reads tool descriptions for validation tools
- **THEN** each description starts with a distinct trigger condition
- **AND** the LLM can distinguish `epf_validate_file` from `epf_batch_validate` from `epf_validate_relationships` by reading only the first sentence

### Requirement: MCP Tool Eligibility Principles

An operation SHALL be registered as an MCP tool only if it meets ALL of:
1. It helps the LLM make a decision during an active conversation
2. It is called more than once per typical session (not one-time setup)
3. It is not a strict subset of another tool's output

Operations that fail these criteria SHALL remain available as CLI commands.

#### Scenario: One-time migration is CLI-only

- **WHEN** a developer needs to run `migrate-definitions`
- **THEN** they use the CLI command `epf-cli migrate-definitions`
- **AND** the operation is NOT registered as an MCP tool

## MODIFIED Requirements

### Requirement: Validation Tools

The system SHALL provide validation through a consolidated `epf_validate_file` tool with mode parameters, replacing standalone `epf_validate_with_plan`, `epf_validate_section`, and `epf_validate_content` tools.

#### Scenario: Validate with fix plan

- **WHEN** `epf_validate_file` is called with `mode=plan`
- **THEN** it returns a chunked fix plan (same behavior as former `epf_validate_with_plan`)

#### Scenario: Validate a section

- **WHEN** `epf_validate_file` is called with `section=target_users`
- **THEN** it validates only that section (same behavior as former `epf_validate_section`)

#### Scenario: Validate inline content

- **WHEN** `epf_validate_file` is called with `content=<yaml>` and `artifact_type=feature_definition`
- **THEN** it validates the content without writing to disk (same behavior as former `epf_validate_content`)

## REMOVED Requirements

### Requirement: Generator MCP Tools

**Reason**: Functionally parallel to skill tools. All generator operations are available through skill tool equivalents (`epf_list_skills(type=generation)`, `epf_get_skill`, `epf_scaffold_skill(type=generation)`, `epf_validate_skill_output`).

**Migration**: Replace `epf_list_generators` → `epf_list_skills(type=generation)`, `epf_get_generator` → `epf_get_skill`, etc. Temporary re-enable via `EPF_LEGACY_TOOLS=true`.

### Requirement: Review Tool Wrappers

**Reason**: Trivial aliases for `epf_get_wizard` with hardcoded names. No added value over direct wizard calls.

**Migration**: Replace `epf_review_strategic_coherence` → `epf_get_wizard("strategic_coherence_review")`.
