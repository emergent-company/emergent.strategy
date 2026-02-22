## ADDED Requirements

### Requirement: Natural Language Action Directives in Diagnostic Responses

Diagnostic MCP tools that populate `required_next_tool_calls` SHALL also include an `action_required` string field containing the same guidance as imperative natural-language text.

The `action_required` field SHALL:

- Be present whenever `required_next_tool_calls` is non-empty
- Contain explicit tool names, parameter values, and reasons in plain English
- Use imperative language ("You MUST call...", "Do NOT attempt...")
- Reference specific values from the diagnostic context (scores, file paths, error counts)

The `action_required` text SHALL be generated from the same mapping function as `required_next_tool_calls` to ensure consistency.

When `required_next_tool_calls` is empty, the `action_required` field SHALL be omitted or set to null.

#### Scenario: Health check with issues includes action directive

- **WHEN** AI agent calls `epf_health_check` and issues are found
- **THEN** the response includes both `required_next_tool_calls` (structured JSON) and `action_required` (natural language text)
- **AND** the `action_required` text references the same tools and parameters as `required_next_tool_calls`

#### Scenario: Validation with structural errors includes action directive

- **WHEN** AI agent calls `epf_validate_file` with `ai_friendly=true` and structural issues are detected
- **THEN** the response includes `action_required` text directing the agent to call the wizard
- **AND** the text includes the specific file path and error counts

#### Scenario: Clean health check has no action directive

- **WHEN** AI agent calls `epf_health_check` and all checks pass
- **THEN** the response does not include an `action_required` field
- **AND** `required_next_tool_calls` is an empty array

---

### Requirement: Workflow Completion Signals in Diagnostic Responses

Diagnostic MCP tools SHALL include `workflow_status` and `remaining_steps` fields to signal whether the agent's current workflow is complete.

The `workflow_status` field SHALL be one of:

- `"complete"` — No further action needed; the agent may proceed to other work
- `"incomplete"` — The agent MUST perform additional steps before the workflow is done

The `remaining_steps` field SHALL be an array of strings, each describing one step the agent must take. Steps SHALL be ordered by priority. The field SHALL be an empty array when `workflow_status` is `"complete"`.

The following tools SHALL include workflow completion signals:

| Tool | Complete When | Incomplete When |
|------|---------------|-----------------|
| `epf_health_check` | `required_next_tool_calls` is empty | Any issues found |
| `epf_validate_file` | `valid` is true and no structural issues | Errors exist or structural issues found |

#### Scenario: Incomplete workflow with remaining steps

- **WHEN** AI agent calls `epf_health_check` and issues are found
- **THEN** the response includes `workflow_status: "incomplete"`
- **AND** `remaining_steps` lists each required action as a human-readable string
- **AND** the steps are ordered by priority (urgent first)

#### Scenario: Complete workflow

- **WHEN** AI agent calls `epf_health_check` and all checks pass
- **THEN** the response includes `workflow_status: "complete"`
- **AND** `remaining_steps` is an empty array

#### Scenario: Validation incomplete with errors

- **WHEN** AI agent calls `epf_validate_file` and errors are found
- **THEN** the response includes `workflow_status: "incomplete"`
- **AND** `remaining_steps` includes "Fix the errors listed above" and "Re-validate with epf_validate_file"

---

### Requirement: Combined Wizard Lookup with Content Preview

The `epf_get_wizard_for_task` tool SHALL optionally include wizard content inline when the recommended wizard has high confidence.

The tool SHALL accept an optional `include_wizard_content` parameter (string, default: `"true"`).

When `include_wizard_content` is not `"false"` AND the recommended wizard's confidence is `"high"`, the response SHALL include a `wizard_content_preview` string field containing the full wizard content.

When the confidence is not `"high"` or `include_wizard_content` is `"false"`, the `wizard_content_preview` field SHALL be omitted.

#### Scenario: High-confidence match includes wizard content

- **WHEN** AI agent calls `epf_get_wizard_for_task` with a task that matches a wizard with high confidence
- **THEN** the response includes `wizard_content_preview` with the full wizard content
- **AND** the agent can follow the wizard instructions without a separate `epf_get_wizard` call

#### Scenario: Low-confidence match excludes wizard content

- **WHEN** AI agent calls `epf_get_wizard_for_task` with an ambiguous task
- **AND** the recommended wizard has medium or low confidence
- **THEN** the response does not include `wizard_content_preview`
- **AND** the agent must call `epf_get_wizard` explicitly to get the wizard content

#### Scenario: Opt-out of wizard content

- **WHEN** AI agent calls `epf_get_wizard_for_task` with `include_wizard_content="false"`
- **THEN** the response does not include `wizard_content_preview` regardless of confidence level

---

### Requirement: Post-Condition Directives in Tool Descriptions

MCP tool descriptions for diagnostic and guided-workflow tools SHALL include a `POST-CONDITION:` section that explicitly states what the agent MUST do after receiving the tool's response.

The following tools SHALL have post-condition directives:

| Tool | Post-Condition |
|------|---------------|
| `epf_health_check` | "Follow the action_required field and required_next_tool_calls before proceeding to other work." |
| `epf_validate_file` | "If structural_issue is true, call the recommended_tool. After writing any EPF file, always re-validate." |
| `epf_get_wizard_for_task` | "Call epf_get_wizard with the recommended wizard name, or use wizard_content_preview if included." |
| `epf_get_wizard` | "After following wizard guidance to produce content, validate with epf_validate_file." |
| `epf_get_template` | "Fill template per wizard guidance, then validate with epf_validate_file." |

Post-condition text SHALL be appended to the existing tool description, separated by a space.

#### Scenario: Health check tool description includes post-condition

- **WHEN** AI agent discovers the `epf_health_check` tool via MCP tool listing
- **THEN** the tool description ends with "POST-CONDITION: Follow the action_required field and required_next_tool_calls before proceeding to other work."

#### Scenario: Validate tool description includes post-condition

- **WHEN** AI agent discovers the `epf_validate_file` tool via MCP tool listing
- **THEN** the tool description includes "POST-CONDITION:" text about following recommended_tool for structural issues

---

### Requirement: Anti-Loop Detection in MCP Server

The MCP server SHALL track per-session tool call frequency and inject warnings when the same tool is called repeatedly with identical parameters.

The server SHALL maintain a counter keyed by tool name and a hash of the call parameters. The counter SHALL increment on each tool call.

When a tool+params combination is called more than 2 times in the same session, the response SHALL include a `call_count_warning` object with:

- `message` (string): A natural-language warning telling the agent to stop repeating the call
- `call_count` (integer): How many times this exact call has been made
- `suggested_next_tool` (string): The tool the agent should call instead, based on the current tool's context

When the call count is 2 or fewer, the `call_count_warning` field SHALL be omitted.

The counter SHALL reset when the MCP connection is reset or a new session begins. No persistent storage SHALL be required.

#### Scenario: First two calls are clean

- **WHEN** AI agent calls `epf_health_check` with the same instance_path twice
- **THEN** neither response includes a `call_count_warning` field

#### Scenario: Third call triggers warning

- **WHEN** AI agent calls `epf_health_check` with the same instance_path a third time
- **THEN** the response includes `call_count_warning` with the call count and a suggestion to proceed to the next workflow step
- **AND** the `message` explicitly tells the agent "The result has not changed. Stop calling this tool."

#### Scenario: Different params reset counter

- **WHEN** AI agent calls `epf_health_check` with `instance_path="path-A"` twice
- **AND** then calls `epf_health_check` with `instance_path="path-B"`
- **THEN** the third call does not trigger a warning because the params differ

---

### Requirement: Response Processing Protocol in Agent Instructions

The `epf_agent_instructions` MCP tool SHALL include a `response_processing_protocol` section in its response JSON.

The protocol SHALL instruct agents to check the following fields after every diagnostic tool call, in order:

1. `call_count_warning` — If present, stop repeating the current tool and follow the suggested next tool
2. `action_required` — If present, follow the natural-language directive before doing anything else
3. `workflow_status` — If "incomplete", complete all items in `remaining_steps` before reporting to the user
4. `required_next_tool_calls` — If present, call the suggested tools in priority order

The embedded AGENTS.md Quick Protocol section SHALL include this response processing protocol within the first 200 lines.

#### Scenario: Agent instructions include response processing protocol

- **WHEN** AI agent calls `epf_agent_instructions`
- **THEN** the response includes a `response_processing_protocol` section
- **AND** the section lists the 4 fields to check in priority order
- **AND** each field has a description of what action to take

#### Scenario: AGENTS.md includes response processing

- **WHEN** an AI agent reads the AGENTS.md file
- **AND** the agent's context window only processes the first 200 lines
- **THEN** the agent has received the response processing protocol alongside the wizard-first protocol and tiered discovery guidance
