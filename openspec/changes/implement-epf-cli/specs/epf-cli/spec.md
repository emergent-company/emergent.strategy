# Capability: epf-cli

EPF CLI provides schema validation and MCP server functionality for the Emergent Product Framework.

## ADDED Requirements

### Requirement: Schema Validation

The system SHALL validate EPF YAML files against canonical JSON schemas and report errors with file paths and line numbers.

#### Scenario: Valid file passes validation
- **GIVEN** an EPF YAML file that conforms to its schema
- **WHEN** user runs `epf-cli validate <file>`
- **THEN** exit code is 0
- **AND** output shows "✓ Valid: <filename>"

#### Scenario: Invalid file fails validation
- **GIVEN** an EPF YAML file with schema violations
- **WHEN** user runs `epf-cli validate <file>`
- **THEN** exit code is 1
- **AND** output shows error with file path, line number, and description
- **AND** output includes suggested fix when available

#### Scenario: Batch directory validation
- **GIVEN** a directory containing multiple EPF YAML files
- **WHEN** user runs `epf-cli validate <directory>`
- **THEN** all EPF files are validated recursively
- **AND** summary shows count of valid/invalid files

### Requirement: Schema Loading

The system SHALL load EPF schemas from local directories and remote GitHub repository with configurable precedence.

#### Scenario: Local schema takes precedence
- **GIVEN** a schema exists in both local `./schemas/` and remote repository
- **WHEN** validation runs
- **THEN** the local schema is used for validation

#### Scenario: Remote schema fallback
- **GIVEN** a schema does not exist locally
- **AND** network connectivity is available
- **WHEN** validation runs
- **THEN** schema is fetched from `eyedea-io/epf-canonical-definition`
- **AND** schema is cached locally for future use

#### Scenario: Offline mode
- **GIVEN** user runs with `--offline` flag
- **WHEN** required schema is not cached locally
- **THEN** validation fails with clear error about missing schema

### Requirement: MCP Server Mode

The system SHALL serve as an MCP server providing schema information to AI assistants via stdio transport.

#### Scenario: Start MCP server
- **GIVEN** epf-cli is invoked with `serve` command
- **WHEN** AI assistant connects via stdio
- **THEN** MCP handshake completes successfully
- **AND** server advertises available tools, resources, and prompts

#### Scenario: AI requests schema via MCP
- **GIVEN** MCP server is running
- **WHEN** AI assistant calls `resources/schemas` resource
- **THEN** server returns list of available EPF schema types with descriptions

#### Scenario: AI validates artifact via MCP
- **GIVEN** MCP server is running
- **WHEN** AI assistant calls `tools/validate` with YAML content
- **THEN** server returns validation result with any errors

### Requirement: Multiple Output Formats

The system SHALL support multiple output formats for integration with different tools and environments.

#### Scenario: JSON format for CI/CD
- **GIVEN** user runs `epf-cli validate --format json <file>`
- **WHEN** validation completes
- **THEN** output is valid JSON with structured error data

#### Scenario: SARIF format for GitHub
- **GIVEN** user runs `epf-cli validate --format sarif <file>`
- **WHEN** validation completes
- **THEN** output conforms to SARIF 2.1.0 schema
- **AND** errors appear in GitHub Code Scanning when uploaded

#### Scenario: Text format for humans
- **GIVEN** user runs `epf-cli validate <file>` (default format)
- **WHEN** validation completes with errors
- **THEN** output includes colored error messages
- **AND** output shows source code snippet with error location highlighted

### Requirement: Watch Mode

The system SHALL support continuous validation during development with file watching.

#### Scenario: Validate on file change
- **GIVEN** user runs `epf-cli validate --watch <directory>`
- **WHEN** an EPF YAML file is modified
- **THEN** validation runs automatically on the changed file
- **AND** results are displayed immediately

#### Scenario: Clear terminal on revalidation
- **GIVEN** watch mode is active
- **WHEN** revalidation triggers
- **THEN** previous output is cleared
- **AND** new validation results are shown

### Requirement: Schema Discovery

The system SHALL allow users to explore available EPF schemas and their structure.

#### Scenario: List available schemas
- **GIVEN** user runs `epf-cli schemas list`
- **WHEN** command executes
- **THEN** output shows all EPF artifact types with brief descriptions

#### Scenario: Show schema details
- **GIVEN** user runs `epf-cli schemas show north_star`
- **WHEN** schema exists
- **THEN** output shows full JSON Schema with property descriptions
- **AND** output includes example valid YAML snippet
