## ADDED Requirements

### Requirement: Lobby Intake and Extraction MCP Tools

The MCP server SHALL expose tools for external systems and agents to push raw material
into the lobby and to list/extract from it, with extraction results staged for human
review like all other authoring tools.

#### Scenario: Intake via MCP

- **WHEN** an agent calls `intake_lobby_item` with a door, content type, and document content
- **THEN** an unprocessed lobby item is created

#### Scenario: List lobby via MCP

- **WHEN** an agent calls `list_lobby` for an instance
- **THEN** the tool returns lobby items filterable by status

#### Scenario: Extraction stages for review

- **WHEN** an agent triggers extraction for a lobby item
- **THEN** candidate evidence is staged for human review, not auto-committed

#### Scenario: Structured errors

- **WHEN** a lobby tool encounters an error
- **THEN** it returns a structured error response, not a raw Go error
