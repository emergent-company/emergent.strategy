## ADDED Requirements

### Requirement: EPF Anchor File

The system SHALL use an anchor file (`_epf.yaml`) to identify valid EPF directories, distinguishing them from coincidentally-named directories.

#### Scenario: Valid EPF directory detected

- **WHEN** a directory contains `_epf.yaml` with valid structure
- **THEN** the directory is recognized as a valid EPF instance
- **AND** the anchor file version determines compatibility

#### Scenario: Legacy EPF directory without anchor

- **WHEN** a directory contains EPF structure (READY/, FIRE/, AIM/) but no `_epf.yaml`
- **THEN** the directory is recognized as a "legacy" EPF instance
- **AND** a warning suggests running `epf-cli migrate-anchor`

#### Scenario: False positive avoided

- **WHEN** a directory is named "epf" but lacks both anchor file and EPF structure
- **THEN** the directory is NOT recognized as an EPF instance
- **AND** the system reports "not an EPF directory"

---

### Requirement: AI Agent Instructions Command

The system SHALL provide an `epf-cli agent` command that outputs structured guidance for AI agents operating on EPF.

#### Scenario: Agent command outputs instructions

- **WHEN** an AI agent runs `epf-cli agent`
- **THEN** the output includes:
  - A declaration that epf-cli is the normative authority for EPF
  - A list of available commands with descriptions
  - Instructions to use `epf-cli validate` before writing artifacts
  - Reference to MCP server for programmatic access
  - Warning against guessing EPF structure

#### Scenario: Agent command with JSON output

- **WHEN** an AI agent runs `epf-cli agent --json`
- **THEN** the output is valid JSON containing:
  - `authority: "epf-cli"` declaration
  - `commands` array with name, description, and usage
  - `mcp_endpoint` information
  - `guidelines` array of behavioral rules

---

### Requirement: EPF Directory Location

The system SHALL provide an `epf-cli locate` command that discovers EPF directories in a repository with high confidence.

#### Scenario: EPF directory found at standard location

- **WHEN** `epf-cli locate` is run in a repository with `docs/epf/_epf.yaml`
- **THEN** the command returns the path with status "valid"
- **AND** confidence level is "high"

#### Scenario: Broken EPF directory detected

- **WHEN** `epf-cli locate` is run and `docs/epf/` exists but `_epf.yaml` is missing
- **THEN** the command returns the path with status "broken"
- **AND** repair instructions are provided

#### Scenario: No EPF directory found

- **WHEN** `epf-cli locate` is run and no EPF directory exists
- **THEN** the command returns status "not-found"
- **AND** suggests running `epf-cli init` to create one

#### Scenario: Multiple EPF-like directories

- **WHEN** `epf-cli locate` is run and multiple directories contain "epf" in the name
- **THEN** only directories with valid anchor files are reported as EPF instances
- **AND** other directories are ignored or reported as "not EPF"

---

### Requirement: Enhanced EPF Initialization

The system SHALL enhance `epf-cli init` to create a complete, valid EPF instance with anchor file.

#### Scenario: New EPF instance created

- **WHEN** `epf-cli init` is run in a repository without EPF
- **THEN** the command creates:
  - `docs/epf/_epf.yaml` anchor file
  - `docs/epf/_instances/{product}/` directory structure
  - `docs/epf/AGENTS.md` with AI instructions
- **AND** outputs AI agent guidance after completion

#### Scenario: Interactive initialization

- **WHEN** `epf-cli init --interactive` is run
- **THEN** the command prompts for:
  - Product/instance name
  - Organization type (startup, enterprise, agency)
  - Initial phase to bootstrap (READY, FIRE, or minimal)
- **AND** generates appropriate artifacts

#### Scenario: Init refuses to overwrite

- **WHEN** `epf-cli init` is run and `docs/epf/` already exists
- **THEN** the command fails with error
- **AND** suggests using `--force` to overwrite or `epf-cli health` to check status

---

### Requirement: Anchor Migration

The system SHALL provide a way to add anchor files to legacy EPF instances.

#### Scenario: Legacy instance migrated

- **WHEN** `epf-cli migrate-anchor` is run on a legacy EPF instance
- **THEN** the command creates `_epf.yaml` with:
  - Version inferred from existing artifacts
  - Instance metadata from `_meta.yaml` if present
  - Migration timestamp
- **AND** validates the instance structure

#### Scenario: Migration dry-run

- **WHEN** `epf-cli migrate-anchor --dry-run` is run
- **THEN** the command shows what would be created
- **AND** does not modify any files

---

### Requirement: Health Check Anchor Validation

The system SHALL check for anchor file presence during health checks.

#### Scenario: Health check with missing anchor

- **WHEN** `epf-cli health` is run on an instance without `_epf.yaml`
- **THEN** the report includes a warning about missing anchor
- **AND** suggests running `epf-cli migrate-anchor`

#### Scenario: Health check with valid anchor

- **WHEN** `epf-cli health` is run on an instance with `_epf.yaml`
- **THEN** the anchor file is validated for structure
- **AND** version compatibility is checked
