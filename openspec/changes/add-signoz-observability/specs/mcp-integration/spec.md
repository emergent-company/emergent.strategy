# mcp-integration Specification Delta

## MODIFIED Requirements

### Requirement: SigNoz MCP Server Integration

The development environment SHALL provide SigNoz observability access via MCP server integration for AI-assisted log querying, trace analysis, and metrics exploration during development.

#### Scenario: AI assistant searches logs during debugging

- **WHEN** an AI coding assistant needs to investigate application behavior
- **THEN** it can search logs using the signoz MCP server's `query_logs` tool with filters for service, level, and time range
- **AND** can perform full-text searches across log messages
- **AND** the MCP server is configured in .vscode/mcp.json with stdio transport

#### Scenario: AI assistant analyzes distributed traces

- **WHEN** an AI assistant is debugging slow requests or errors
- **THEN** it can retrieve traces using the signoz MCP server's `get_traces` tool with filters for trace ID, service, operation, and duration
- **AND** can examine the complete trace spans to identify bottlenecks
- **AND** can correlate logs with traces using trace context

#### Scenario: AI assistant monitors performance metrics

- **WHEN** an AI assistant is optimizing application performance
- **THEN** it can query metrics using the signoz MCP server's `query_metrics` tool for extraction job duration, LLM call counts, and HTTP request metrics
- **AND** can aggregate metrics by time interval and grouping dimensions
- **AND** can identify performance regressions or anomalies

#### Scenario: AI assistant visualizes service dependencies

- **WHEN** an AI assistant needs to understand system architecture
- **THEN** it can retrieve the service dependency graph using the signoz MCP server's `get_service_map` tool
- **AND** can identify high-latency service interactions
- **AND** can trace requests across multiple services

#### Scenario: AI assistant investigates errors

- **WHEN** an AI assistant is troubleshooting application errors
- **THEN** it can retrieve error traces using the signoz MCP server's `get_errors` tool with filters for service, error type, and time range
- **AND** can examine exception stack traces and context
- **AND** can correlate errors with specific code paths using trace data

#### Scenario: SigNoz MCP server authenticates with API token

- **WHEN** the signoz MCP server starts
- **THEN** it reads SIGNOZ_API_ENDPOINT and SIGNOZ_API_TOKEN from environment variables
- **AND** authenticates all Query API requests with Bearer token
- **AND** provides clear error messages if credentials are missing or invalid

### Requirement: MCP Server Configuration Consistency

The MCP server configuration SHALL include all active MCP servers (playwright, postgres, context7, gh_grep, react-daisyui, chrome-devtools, **signoz**) in .vscode/mcp.json to ensure uniform tool availability.

#### Scenario: Developer has access to all MCP tools

- **WHEN** a developer opens the project in VS Code with Copilot
- **THEN** the following MCP servers are available:
  - `playwright` (browser automation)
  - `postgres` (database queries)
  - `context7` (library documentation)
  - `gh_grep` (GitHub code search)
  - `react-daisyui` (component documentation)
  - `chrome-devtools` (browser debugging)
  - `signoz` (observability queries) **← NEW**
- **AND** each server appears in the Copilot tool list
- **AND** the AI assistant can invoke tools from any server

#### Scenario: SigNoz MCP server uses stdio transport

- **WHEN** the signoz MCP server is configured in .vscode/mcp.json
- **THEN** it uses `stdio` transport type (not HTTP or SSE)
- **AND** the command points to `node tools/signoz-mcp-server/dist/index.js`
- **AND** environment variables (SIGNOZ_API_ENDPOINT, SIGNOZ_API_TOKEN) are passed via `env` configuration

### Requirement: Development Environment Security

The SigNoz MCP integration SHALL be configured for development/testing use only with appropriate security considerations for API token management.

#### Scenario: Developer reviews SigNoz MCP security

- **WHEN** a developer reviews the SigNoz MCP integration
- **THEN** documentation clearly states that the tool accesses observability data (logs, traces, metrics)
- **AND** warns that SIGNOZ_API_TOKEN grants read access to all application telemetry
- **AND** recommends using read-only API tokens when possible
- **AND** advises against committing API tokens to version control

#### Scenario: SigNoz MCP server fails gracefully without credentials

- **WHEN** the signoz MCP server starts without SIGNOZ_API_TOKEN
- **THEN** it logs a clear error message indicating missing credentials
- **AND** the MCP server exits with a non-zero status code
- **AND** VS Code Copilot shows the server as unavailable but other MCP servers continue working
