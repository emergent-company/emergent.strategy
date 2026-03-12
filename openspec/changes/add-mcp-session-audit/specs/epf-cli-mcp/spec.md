## ADDED Requirements

### Requirement: Session Audit Log

The MCP server SHALL maintain an in-memory audit log of all tool calls made during a session. Each audit entry SHALL include the tool name, a hash of the parameters, a monotonically increasing `call_id`, and a timestamp. The audit log SHALL be scoped per session (per-user in multi-tenant mode, process-global in local mode).

#### Scenario: Audit log records tool calls

- **WHEN** an AI agent calls any MCP tool (e.g., `epf_health_check`, `epf_validate_file`)
- **THEN** an audit entry is appended with `call_id`, tool name, parameter hash, and timestamp
- **AND** the entry is retrievable via `epf_session_audit`

#### Scenario: Audit log scoped per session in multi-tenant mode

- **WHEN** user A calls `epf_health_check` and user B calls `epf_validate_file`
- **THEN** user A's audit log contains only `epf_health_check`
- **AND** user B's audit log contains only `epf_validate_file`

#### Scenario: Audit log caps at maximum entries

- **WHEN** more than 1000 tool calls are made in a single session
- **THEN** the oldest entries are evicted (FIFO) to maintain the cap
- **AND** the audit response includes `evicted_count` indicating how many entries were lost

#### Scenario: Call count map caps at maximum unique keys

- **WHEN** more than 500 unique tool+params combinations are tracked for anti-loop detection
- **THEN** the least recently called key is evicted (LRU) to maintain the cap
- **AND** new tool calls are still tracked correctly

#### Scenario: Session reset clears all audit state

- **WHEN** the MCP session is reset (client reconnects or session expires)
- **THEN** the audit log is cleared
- **AND** the call count map is cleared
- **AND** the call ID counter is reset to zero

---

### Requirement: Session Audit Tool

The MCP server SHALL expose an `epf_session_audit` tool that returns audit information for the current session. By default, the response SHALL return only a compact summary (total call count, unique tool names, evicted count) to minimize context window token usage. Individual entries SHALL only be returned when `verbose=true` is specified, with pagination via `limit` and `offset` parameters.

#### Scenario: Retrieve session audit summary (default)

- **WHEN** an orchestrator or human calls `epf_session_audit` without parameters
- **THEN** the tool returns a JSON object with `total_calls`, `unique_tools[]`, and `evicted_count`
- **AND** no individual `entries[]` are included in the response
- **AND** the response consumes fewer than 100 context window tokens

#### Scenario: Retrieve verbose audit with pagination

- **WHEN** `epf_session_audit` is called with `verbose=true`
- **THEN** the response includes `entries[]` in addition to the summary
- **AND** entries are paginated with `limit` (default 50) and `offset` (default 0)
- **AND** each entry contains `call_id`, `tool_name`, `params_hash`, and `timestamp`
- **AND** the response includes `has_more` indicating whether additional pages exist

#### Scenario: Audit tool with tool name filter

- **WHEN** `epf_session_audit` is called with `tool_name` parameter
- **THEN** the summary and entries (if verbose) are filtered to only that tool
- **AND** `total_calls` reflects the filtered count

#### Scenario: Audit tool reports evicted entries

- **WHEN** FIFO eviction has occurred during the session
- **THEN** the summary includes `evicted_count` with the number of dropped entries
- **AND** callers can see that the audit log is incomplete

---

### Requirement: Workflow Verification Tool

The MCP server SHALL expose an `epf_verify_workflow` tool that accepts a list of expected tool names and returns a verification report showing which tools were called, which were missing, and the call count for each.

#### Scenario: Verify complete workflow

- **WHEN** `epf_verify_workflow` is called with `expected_tools: ["epf_health_check", "epf_validate_file", "epf_get_wizard_for_task"]`
- **AND** all three tools were called during the session
- **THEN** the response shows `complete: true` with all tools marked as `called`

#### Scenario: Verify incomplete workflow

- **WHEN** `epf_verify_workflow` is called with `expected_tools: ["epf_health_check", "epf_validate_file", "epf_aim_status"]`
- **AND** only `epf_health_check` was called during the session
- **THEN** the response shows `complete: false`
- **AND** `epf_validate_file` and `epf_aim_status` are marked as `missing`
- **AND** `missing_count` is 2

---

### Requirement: Tool Call Receipt

Every MCP tool response SHALL include a `_call_id` field containing a compact, unique identifier for that specific invocation. The identifier SHALL be a short monotonic string (e.g., `"call-7"`) to minimize context window token overhead (target: fewer than 5 tokens per response). This receipt enables cross-referencing claims against the audit log.

#### Scenario: Tool response includes call_id

- **WHEN** an AI agent calls `epf_health_check`
- **THEN** the JSON response includes `"_call_id": "call-7"` (short monotonic string)
- **AND** the same `call_id` appears in the session audit log

#### Scenario: Sequential call_ids are monotonically increasing

- **WHEN** tool A is called, then tool B is called
- **THEN** tool B's `_call_id` has a higher numeric value than tool A's `_call_id`

#### Scenario: call_id is compact

- **WHEN** any tool is called
- **THEN** the `_call_id` value is a short string (fewer than 10 characters)
- **AND** it does not use UUIDs, timestamps, or other verbose formats

---

## MODIFIED Requirements

### Requirement: EPF Instance Initialization via MCP

AI agents SHALL be able to initialize new EPF instances programmatically via the `epf_init_instance` MCP tool.

The tool SHALL:

- Accept parameters: `path` (required), `product_name`, `epf_version`, `structure_type`
- Support a `dry_run` mode that returns what would be created without making changes
- Create the standard EPF directory structure (READY/, FIRE/, AIM/)
- Create the anchor file (`_epf.yaml`) with proper metadata
- Return the list of created files and the anchor file content
- Include anti-loop detection that warns on 3+ identical calls with the same parameters
- Include a `_call_id` receipt in the response

#### Scenario: Initialize new EPF instance

- **WHEN** AI agent calls `epf_init_instance` with `path="/project/docs/epf"` and `product_name="My Product"`
- **THEN** the tool creates the EPF directory structure and anchor file
- **AND** returns the created file paths and anchor content
- **AND** the response includes a `_call_id` field

#### Scenario: Dry run initialization

- **WHEN** AI agent calls `epf_init_instance` with `dry_run=true`
- **THEN** the tool returns what would be created without making any changes
- **AND** the AI agent can present the plan to the user for confirmation

#### Scenario: Anti-loop detection on repeated identical calls

- **WHEN** AI agent calls `epf_init_instance` with the same parameters 3 or more times
- **THEN** the response includes a `call_count_warning` with the call count and a suggested next tool
