## ADDED Requirements

### Requirement: Workflow Step Tracking

The plugin SHALL maintain a per-session ledger of all EPF MCP tool calls made by the LLM. When an agent is activated, the plugin SHALL track tool calls against the agent's `required_tools` list. The ledger SHALL be populated via the `tool.execute.after` hook.

#### Scenario: Tool calls recorded in ledger

- **WHEN** the LLM calls `epf_health_check` via the MCP server
- **AND** the `tool.execute.after` hook fires
- **THEN** the plugin records the tool name, timestamp, and success/failure in the session ledger

#### Scenario: Ledger tracks calls during agent activation

- **WHEN** the `product-architect` agent is activated with `required_tools: ["epf_get_product_vision", "epf_validate_file"]`
- **AND** the LLM calls `epf_get_product_vision` but not `epf_validate_file`
- **THEN** the ledger shows `epf_get_product_vision` as called and `epf_validate_file` as missing

#### Scenario: Ledger caps at maximum entries

- **WHEN** more than 500 EPF tool calls are recorded in a single session
- **THEN** the oldest entries are evicted (FIFO) to maintain the cap

#### Scenario: Ledger cleared on session end

- **WHEN** the plugin session ends or is reset
- **THEN** the tool call ledger is fully cleared

---

### Requirement: Agent Completion Gate

The plugin SHALL verify that all tools in an activated agent's `required_tools` list were invoked before the agent's work is accepted as complete. If required tools were not called, the plugin SHALL emit a warning indicating which workflow steps were skipped.

#### Scenario: Agent deactivated with complete workflow

- **WHEN** the `product-architect` agent is deactivated
- **AND** all tools in `required_tools` were called during the agent's activation period
- **THEN** the plugin allows deactivation silently

#### Scenario: Agent deactivated with incomplete workflow

- **WHEN** the `product-architect` agent is deactivated
- **AND** `epf_validate_file` from `required_tools` was never called
- **THEN** the plugin emits a toast warning: "Agent workflow incomplete: epf_validate_file was never called"
- **AND** the deactivation proceeds (warning only, not blocking)
- **AND** the warning uses a toast notification, not a system message injection, to avoid consuming LLM context window tokens

#### Scenario: Agent deactivated with no required tools defined

- **WHEN** an agent with no `required_tools` list is deactivated
- **THEN** the plugin allows deactivation silently without any verification
