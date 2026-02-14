## MODIFIED Requirements

### Requirement: EPF Instance Initialization via MCP

AI agents SHALL be able to initialize new EPF instances programmatically via the `epf_init_instance` MCP tool.

The tool SHALL:

- Accept parameters: `path` (required), `product_name`, `epf_version`, `structure_type`
- Support a `dry_run` mode that returns what would be created without making changes
- Create the standard EPF directory structure (READY/, FIRE/, AIM/)
- Create the anchor file (`_epf.yaml`) with proper metadata
- Return the list of created files and the anchor file content

The MCP server binary SHALL be distributed from the `emergent-company/emergent.strategy` repository (formerly `eyedea-io/emergent`). All embedded agent instructions, documentation paths, and GitHub URLs within the CLI SHALL reference the `emergent-strategy` project identity.

#### Scenario: Initialize new EPF instance

- **WHEN** AI agent calls `epf_init_instance` with `path="/project/docs/epf"` and `product_name="My Product"`
- **THEN** the tool creates the EPF directory structure and anchor file
- **AND** returns the created file paths and anchor content

#### Scenario: Embedded instructions reference correct project identity

- **WHEN** the epf-cli binary is built from the `emergent-company/emergent.strategy` repository
- **THEN** all embedded agent instructions reference "Emergent Strategy" as the project name
- **AND** all GitHub URLs point to `emergent-company/emergent.strategy`
- **AND** all filesystem paths use `emergent-strategy` instead of `product-factory-os`
