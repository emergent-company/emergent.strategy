## ADDED Requirements

### Requirement: Edition-aware MCP Tool Visibility

The MCP server SHALL restrict the tools listed for a caller to those allowed by the
targeted instance's edition, intersected with any session-selected categories. Starter
instances SHALL expose only a slim tool set sufficient to author North Star and Roadmap.

#### Scenario: Starter tools/list is slim

- **WHEN** a starter caller lists MCP tools
- **THEN** only the starter-allowed tool categories are returned (core plus minimal strategy/authoring)
- **AND** full-only tools are not listed

#### Scenario: Full edition tools unchanged

- **WHEN** a full-edition caller lists MCP tools
- **THEN** all tool categories remain available as before

### Requirement: Edition Tool Execution Guard

The MCP server SHALL enforce edition entitlements at execution time, not only at
listing time. A starter caller invoking a full-only tool SHALL receive a structured
"not available on this plan" error.

#### Scenario: Starter caller cannot execute a gated tool

- **WHEN** a starter caller invokes a full-only tool directly
- **THEN** the server returns a structured error indicating the tool is not available on the starter plan
- **AND** no mutation is performed
