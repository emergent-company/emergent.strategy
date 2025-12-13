# langfuse-mcp Specification

## Purpose
TBD - created by archiving change add-langfuse-mcp. Update Purpose after archive.
## Requirements
### Requirement: The system SHALL provide an MCP server for browsing Langfuse traces

The system SHALL provide a Model Context Protocol (MCP) server that enables AI assistants to browse and inspect Langfuse traces via stdio transport. The server SHALL authenticate using the same Langfuse credentials configured for the application (`LANGFUSE_HOST`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`).

#### Scenario: AI assistant lists recent traces

- **GIVEN** the langfuse-mcp server is running
- **AND** Langfuse credentials are configured in environment
- **WHEN** an AI assistant calls the `list_traces` tool with no parameters
- **THEN** the server returns up to 20 most recent traces
- **AND** each trace includes id, name, timestamp, userId, sessionId, tags, latency, and totalCost

#### Scenario: AI assistant filters traces by name and time range

- **GIVEN** the langfuse-mcp server is running
- **WHEN** an AI assistant calls `list_traces` with `name: "extraction"` and `fromTimestamp: "2024-01-15T00:00:00Z"`
- **THEN** the server returns only traces named "extraction" created on or after the specified timestamp
- **AND** results are ordered by timestamp descending by default

#### Scenario: AI assistant handles missing credentials gracefully

- **GIVEN** the langfuse-mcp server is running
- **AND** `LANGFUSE_SECRET_KEY` environment variable is not set
- **WHEN** an AI assistant calls any tool
- **THEN** the server returns an error message indicating missing configuration
- **AND** the error message includes which environment variables are required

### Requirement: The system SHALL provide a tool to get detailed trace information

The `get_trace` tool SHALL return complete trace details including all observations (spans, generations), scores, timing, costs, and input/output data for a specific trace ID.

#### Scenario: AI assistant inspects a specific trace

- **GIVEN** a trace with ID "abc123" exists in Langfuse
- **WHEN** an AI assistant calls `get_trace` with `traceId: "abc123"`
- **THEN** the server returns the full trace including:
  - Trace metadata (id, name, timestamp, userId, sessionId, tags)
  - All observations with their inputs, outputs, model, usage, and timing
  - All scores attached to the trace
  - Computed metrics (latency, totalCost)

#### Scenario: AI assistant requests non-existent trace

- **GIVEN** no trace with ID "nonexistent" exists
- **WHEN** an AI assistant calls `get_trace` with `traceId: "nonexistent"`
- **THEN** the server returns a clear error message indicating the trace was not found

### Requirement: The system SHALL provide a tool to list sessions

The `list_sessions` tool SHALL return a list of sessions for browsing conversation-based traces grouped by session ID.

#### Scenario: AI assistant lists recent sessions

- **GIVEN** the langfuse-mcp server is running
- **AND** multiple sessions exist in Langfuse
- **WHEN** an AI assistant calls `list_sessions` with `limit: 10`
- **THEN** the server returns up to 10 most recent sessions
- **AND** each session includes id and creation timestamp

### Requirement: The MCP server SHALL be integrated with OpenCode configuration

The langfuse-mcp server SHALL be configured in `opencode.jsonc` so that it is automatically available to AI assistants using OpenCode in this workspace.

#### Scenario: OpenCode loads langfuse-mcp server

- **GIVEN** a developer opens the workspace with OpenCode
- **WHEN** OpenCode reads the `opencode.jsonc` configuration
- **THEN** the langfuse-mcp server is started and available
- **AND** tools `list_traces`, `get_trace`, and `list_sessions` appear in the tools list

#### Scenario: Langfuse MCP reads credentials from environment

- **GIVEN** the workspace has `.env` file with Langfuse credentials
- **WHEN** the langfuse-mcp server starts
- **THEN** it reads `LANGFUSE_HOST`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_SECRET_KEY` from environment
- **AND** successfully authenticates with the Langfuse API

