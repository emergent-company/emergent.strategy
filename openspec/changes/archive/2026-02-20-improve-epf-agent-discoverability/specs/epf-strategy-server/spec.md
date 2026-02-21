## MODIFIED Requirements

### Requirement: Strategy Server CLI Commands

The system SHALL provide minimal CLI commands for strategy server management (not query duplication).

The commands SHALL:

- `epf strategy serve` - Start the strategy server as a long-running MCP server
- `epf strategy status` - Show what's loaded in the strategy store (artifact counts, last reload)
- `epf strategy export` - Export combined strategy document in markdown format

When started via `epf strategy serve <instance-path>`, the server SHALL:

- Set the `EPF_STRATEGY_INSTANCE` environment variable to the provided instance path
- Configure the instance path as the default for all MCP tools that accept `instance_path`
- Log the active instance path and product name to stderr on startup
- Include the instance context in `epf_agent_instructions` responses

#### Scenario: Start strategy server

- **WHEN** user runs `epf strategy serve`
- **THEN** the strategy server starts and loads the EPF instance
- **AND** begins serving MCP requests via stdio
- **AND** watches for file changes if `--watch` flag is provided

#### Scenario: Strategy server provides instance default to tools

- **WHEN** user runs `epf strategy serve ./epf-instance`
- **AND** an AI agent calls `epf_health_check` without `instance_path`
- **THEN** the tool uses `./epf-instance` as the default instance path
- **AND** returns health check results for that instance

#### Scenario: Check strategy server status

- **WHEN** user runs `epf strategy status`
- **THEN** the CLI shows loaded artifact counts (personas, features, value props, etc.)
- **AND** shows last reload timestamp
- **AND** shows any warnings about missing or invalid artifacts

#### Scenario: Export strategy document

- **WHEN** user runs `epf strategy export`
- **THEN** the CLI outputs a combined markdown document
- **AND** includes all strategy artifacts in a readable format
- **AND** supports `--output` flag for writing to file
