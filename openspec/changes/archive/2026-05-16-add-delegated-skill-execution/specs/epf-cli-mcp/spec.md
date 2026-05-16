## ADDED Requirements

### Requirement: Skill Execution Modes

The skill system SHALL support three execution modes declared via an `execution` field in the skill manifest, with a fourth reserved for future use:

1. **`prompt-delivery`** (default) -- The MCP server returns the skill's prompt content for the LLM to follow. This is the existing behavior and SHALL remain the default when `execution` is not specified.
2. **`inline`** -- The MCP server executes the skill's Go handler directly and returns structured results via the `epf_execute_skill` tool.
3. **`script`** -- The MCP server executes a user-provided script as a subprocess, passing JSON on stdin and reading JSON from stdout. Enables custom computational skills in any language.
4. **`plugin`** (reserved) -- The MCP server delegates to an external skill pack binary. The system SHALL reject skills with `execution: plugin` until plugin support is implemented.

#### Scenario: Default execution mode is prompt-delivery
- **WHEN** a skill manifest does not include an `execution` field
- **THEN** the system SHALL treat it as `execution: prompt-delivery`
- **AND** behavior SHALL be identical to current skill handling

#### Scenario: Inline skill requires handler specification
- **WHEN** a skill manifest specifies `execution: inline`
- **AND** the `inline.handler` field is missing or empty
- **THEN** manifest validation SHALL report an error

#### Scenario: Script skill requires command specification
- **WHEN** a skill manifest specifies `execution: script`
- **AND** the `script.command` field is missing or empty
- **THEN** manifest validation SHALL report an error

#### Scenario: Plugin mode rejected until implemented
- **WHEN** a skill manifest specifies `execution: plugin`
- **THEN** the system SHALL return an error indicating plugin execution is not yet supported

### Requirement: Inline Skill Execution Tool

The MCP server SHALL expose an `epf_execute_skill` tool that executes inline skills directly and returns structured results.

The tool SHALL accept:
1. `skill` (required) -- The skill name to execute
2. `instance_path` (required) -- Path to the EPF instance providing input data
3. `parameters` (optional) -- JSON object with skill-specific parameters

The tool SHALL return a structured `ExecutionResult` containing:
1. `success` -- Boolean indicating execution outcome
2. `output` -- The skill's output (format depends on skill: HTML, JSON, markdown)
3. `execution_log` -- Structured log with skill name, duration, per-step status
4. `error` -- Error message if `success` is false

#### Scenario: Successful inline skill execution
- **WHEN** `epf_execute_skill` is called with a valid inline skill name and instance path
- **AND** the instance has the required artifacts
- **THEN** the tool SHALL execute the registered Go handler
- **AND** return a structured result with `success: true`, the computed output, and an execution log

#### Scenario: Inline skill with missing required artifacts
- **WHEN** `epf_execute_skill` is called for a skill that requires `value_model` artifacts
- **AND** the instance path does not contain value model files
- **THEN** the tool SHALL return `success: false` with an error listing the missing artifacts

#### Scenario: Successful script skill execution
- **WHEN** `epf_execute_skill` is called with a valid script skill name and instance path
- **AND** the script command is available on PATH or as a relative path in the skill directory
- **THEN** the tool SHALL spawn the subprocess with JSON input on stdin
- **AND** read the JSON `ExecutionResult` from stdout
- **AND** return the result to the caller

#### Scenario: Script skill timeout
- **WHEN** `epf_execute_skill` is called for a script skill
- **AND** the script does not complete within the configured timeout (default 30s)
- **THEN** the tool SHALL kill the subprocess
- **AND** return `success: false` with an error indicating timeout

#### Scenario: Script command not found
- **WHEN** `epf_execute_skill` is called for a script skill
- **AND** the `script.command` is not found on PATH or in the skill directory
- **THEN** the tool SHALL return `success: false` with an error indicating the command was not found

#### Scenario: Unknown skill name
- **WHEN** `epf_execute_skill` is called with a skill name that has no registered handler and no script spec
- **THEN** the tool SHALL return an error indicating the skill is not an executable skill or does not exist

#### Scenario: Prompt-delivery skill rejected by execute tool
- **WHEN** `epf_execute_skill` is called with a skill that has `execution: prompt-delivery`
- **THEN** the tool SHALL return an error directing the caller to use `epf_get_skill` instead

### Requirement: Inline Skill Redirection in Get Skill

When `epf_get_skill` is called for a skill with `execution: inline`, the MCP server SHALL return redirection instructions instead of prompt content.

The response SHALL include:
1. The skill's metadata (name, description, type, category)
2. Instructions directing the LLM to call `epf_execute_skill` with the skill name
3. The skill's parameter schema so the LLM can construct valid input
4. The skill's prompt content (if any) for hybrid skills that need LLM involvement after execution

#### Scenario: Get skill returns redirection for inline skill
- **WHEN** `epf_get_skill` is called for a skill with `execution: inline`
- **THEN** the response SHALL include metadata and execution instructions
- **AND** SHALL direct the caller to use `epf_execute_skill` for the computational part

#### Scenario: Hybrid skill returns both redirection and prompt
- **WHEN** `epf_get_skill` is called for an inline skill that also has prompt content
- **THEN** the response SHALL include both the execution instructions and the prompt content
- **AND** SHALL explain the two-phase flow: execute first, then use prompt for narrative

### Requirement: Inline Skill Discovery

Inline skills SHALL participate in the same discovery mechanisms as prompt-delivery skills:

1. Three-tier discovery (instance > framework > global > embedded)
2. Keyword-based recommender (`epf_get_agent_for_task` or skill routing)
3. Listing via `epf_list_skills`
4. Agent-to-skill relationships (`skills.required` in agent manifests)

The skill listing response SHALL indicate the execution mode so consumers know whether the skill returns prompt content or requires `epf_execute_skill`.

#### Scenario: Inline skill appears in skill listing
- **WHEN** `epf_list_skills` is called
- **AND** both prompt-delivery and inline skills exist
- **THEN** all skills SHALL appear in the listing
- **AND** each skill entry SHALL indicate its execution mode

#### Scenario: Inline skill found by recommender
- **WHEN** `epf_get_agent_for_task` or skill recommendation is invoked with a task matching an inline skill's keywords
- **THEN** the inline skill SHALL be recommended with a note that it uses inline execution

### Requirement: Skill Manifest Validation for Execution Fields

The skill manifest schema SHALL validate execution-specific fields:

1. When `execution` is `inline`, `inline.handler` MUST be present and non-empty.
2. When `execution` is `script`, `script.command` MUST be present and non-empty.
3. When `execution` is `prompt-delivery` or absent, `inline` and `script` blocks MUST NOT be present (or SHALL be ignored with a warning).
4. The `execution` field SHALL only accept values: `prompt-delivery`, `inline`, `script`, `plugin`.
5. The `inline.parameters` array, if present, SHALL validate each parameter has `name` and `type` fields.
6. The `script.timeout` field, if present, SHALL be a positive integer (seconds).

#### Scenario: Valid inline manifest passes validation
- **WHEN** a skill manifest has `execution: inline` with `inline.handler: value-model-preview`
- **THEN** validation SHALL pass

#### Scenario: Valid script manifest passes validation
- **WHEN** a skill manifest has `execution: script` with `script.command: python3` and `script.args: [calculate.py]`
- **THEN** validation SHALL pass

#### Scenario: Invalid execution value rejected
- **WHEN** a skill manifest has `execution: compute`
- **THEN** validation SHALL fail with an error listing valid execution values

#### Scenario: Inline block on prompt-delivery skill triggers warning
- **WHEN** a skill manifest has `execution: prompt-delivery` and an `inline` block
- **THEN** validation SHALL produce a warning that the inline block is ignored for prompt-delivery skills

#### Scenario: Script skill limited to instance source
- **WHEN** a skill manifest with `execution: script` is discovered from embedded or framework sources
- **THEN** the system SHALL log a warning and treat it as `prompt-delivery`
- **AND** script execution SHALL only be available for instance-local skills

### Requirement: Execution Logging

Inline and script skill execution SHALL produce structured execution logs as part of the tool response. The execution log MUST include:

1. Skill name
2. Total execution duration in milliseconds
3. Per-step status (name, status, duration, optional details)
4. Overall result status (success, failure)

#### Scenario: Successful execution includes complete log
- **WHEN** an inline skill executes successfully
- **THEN** the response SHALL include an execution log with timestamps, step details, and a success result

#### Scenario: Failed execution includes partial log
- **WHEN** an inline skill execution fails at a specific step
- **THEN** the response SHALL include the execution log up to the point of failure
- **AND** the failed step SHALL include error details sufficient for diagnosis
