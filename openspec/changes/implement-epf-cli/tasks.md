# Implementation Tasks: epf-cli

## 1. Schema Loading Infrastructure

- [ ] 1.1 Implement schema fetcher to load EPF JSON schemas from local `docs/EPF/schemas/` directory
- [ ] 1.2 Implement remote schema fetcher to pull from `eyedea-io/epf-canonical-definition` GitHub repo
- [ ] 1.3 Add schema caching layer with TTL-based invalidation
- [ ] 1.4 Create schema registry that maps EPF artifact types to their JSON schemas

## 2. Validation Engine

- [ ] 2.1 Implement YAML parser with line-number tracking for error reporting
- [ ] 2.2 Integrate JSON Schema validation library (e.g., `gojsonschema` or `santhosh-tekuri/jsonschema`)
- [ ] 2.3 Implement custom validation rules for EPF-specific cross-references
- [ ] 2.4 Create structured error output with file path, line number, and suggested fixes
- [ ] 2.5 Support batch validation (validate entire directory tree)

## 3. CLI Commands

- [ ] 3.1 Implement `epf-cli validate <path>` command with recursive directory support
- [ ] 3.2 Implement `epf-cli validate --watch` for continuous file watching
- [ ] 3.3 Add `--format` flag for output formats (text, json, sarif)
- [ ] 3.4 Implement `epf-cli schemas list` to show available schema types
- [ ] 3.5 Implement `epf-cli schemas show <type>` to display schema details

## 4. MCP Server Mode

- [ ] 4.1 Implement MCP server framework using stdio transport
- [ ] 4.2 Add `tools/validate` MCP tool for on-demand validation
- [ ] 4.3 Add `resources/schemas` MCP resource for schema discovery
- [ ] 4.4 Add `prompts/epf-artifact` MCP prompt for artifact generation templates
- [ ] 4.5 Test integration with OpenCode/Claude Desktop

## 5. Configuration & Distribution

- [ ] 5.1 Create `.epf-cli.yaml` config file format for project-specific settings
- [ ] 5.2 Add support for schema overrides (local schemas take precedence)
- [ ] 5.3 Create GitHub Actions workflow for CI validation
- [ ] 5.4 Build multi-platform binaries (darwin/amd64, darwin/arm64, linux/amd64)
- [ ] 5.5 Create installation script and Homebrew formula

## 6. Testing & Documentation

- [ ] 6.1 Write unit tests for schema validation engine
- [ ] 6.2 Write integration tests for CLI commands
- [ ] 6.3 Write MCP server protocol tests
- [ ] 6.4 Create README with usage examples
- [ ] 6.5 Add `--help` documentation for all commands
