## ADDED Requirements

### Requirement: CLI Parity Subcommands

The strategy-server binary SHALL expose developer CLI subcommands that have no
MCP or web equivalent in epf-cli, covering at minimum: `validate`, `health`,
`locate`, `fix`, `diff`, `coverage`, `explain`, `context`, `ask`, `report`, and
`export`. Each subcommand SHALL parse arguments and delegate to the same
`domain/*` services used by the MCP tools, contain no business logic, and support
human-readable output by default and `--json` for scripting.

#### Scenario: Validate a local file from the terminal

- **GIVEN** an EPF artifact YAML file on disk
- **WHEN** a user runs the strategy-server `validate` subcommand against it
- **THEN** the command returns schema and relationship validation results (with a
  non-zero exit code on failure) without requiring a running server.

#### Scenario: Scriptable JSON output for CI

- **GIVEN** a CI pipeline invoking a parity subcommand with `--json`
- **WHEN** the command runs
- **THEN** it emits machine-readable JSON and an exit code suitable for gating CI.

### Requirement: Language Server (LSP)

strategy-server SHALL provide an LSP server (`strategy-server lsp`, stdio) that
offers real-time diagnostics, completion, hover, go-to-definition, and code
actions over EPF YAML, reusing the schema registry and validation services. The
LSP SHALL operate on the open buffer and embedded schemas without requiring a
database or a running platform server.

#### Scenario: Real-time diagnostics in an editor

- **GIVEN** an editor connected to the strategy-server LSP
- **WHEN** a user edits an EPF artifact and introduces a schema violation
- **THEN** the editor shows a diagnostic at the offending location in real time,
  with the same rule set the platform uses for validation.

#### Scenario: Works in a bare checkout

- **GIVEN** a git checkout with no database and no running server
- **WHEN** the LSP is started
- **THEN** it provides diagnostics and completion from embedded schemas alone.

### Requirement: Generator Authoring Parity

strategy-server SHALL provide a complete authoring surface for output generators
equivalent to epf-cli — listing, retrieving, scaffolding, validating, and running
custom generators across the established categories (compliance, marketing,
investor, internal, development, custom) — either as dedicated generator tools or
as an equivalent, documented extension of the skill system. The existing
generator content (investor-memo, skattefunn, context-sheet, development-brief)
SHALL remain available.

#### Scenario: Author and validate a custom generator

- **GIVEN** strategy-server in any mode
- **WHEN** a user scaffolds a new custom generator and validates its output
- **THEN** the scaffold and validation succeed through strategy-server, with no
  dependency on epf-cli.

### Requirement: Value Model HTML Preview

strategy-server SHALL provide an invokable path to render a value model as
shareable HTML (the capability currently blocked because the inline
`value-model-preview` skill is rejected by `run_skill`). The rendered preview
SHALL be available via the web UI and via export/tooling.

#### Scenario: Render a value model preview

- **GIVEN** an instance with a value model
- **WHEN** a user requests a value model HTML preview
- **THEN** strategy-server returns rendered HTML suitable for sharing.

### Requirement: Report Generation

strategy-server SHALL generate health/strategy reports in multiple formats
(markdown, HTML, JSON) via `export_report` (MCP) and the `report` CLI subcommand,
sourcing from the same health, coherence, and coverage data the web dashboard
uses.

#### Scenario: Generate an HTML health report

- **GIVEN** an instance
- **WHEN** a user requests an HTML report
- **THEN** strategy-server produces a styled, self-contained HTML report
  equivalent in coverage to epf-cli's `report` output.

### Requirement: Scaffolding Parity

strategy-server SHALL provide scaffolding for the authoring artifact kinds epf-cli
scaffolds — at minimum agents and generators — in addition to the existing skill
and instance scaffolds, or document the skill-system equivalent that fully
replaces them.

#### Scenario: Scaffold an agent

- **GIVEN** strategy-server in any mode
- **WHEN** a user scaffolds a new agent definition
- **THEN** a valid agent scaffold is produced through strategy-server without
  epf-cli.

### Requirement: epf-cli Parity Matrix and Cutover

The spec SHALL maintain a parity matrix mapping every epf-cli MCP tool and CLI
command to its strategy-server equivalent (an MCP tool, a CLI subcommand, a web
UI action, or an explicit "not applicable" with rationale). epf-cli SHALL NOT be
removed until the parity matrix is fully resolved and a deprecation window has
elapsed.

#### Scenario: Every epf-cli capability is accounted for

- **GIVEN** the parity matrix
- **WHEN** the matrix is reviewed before retiring epf-cli
- **THEN** every epf-cli tool/command maps to a strategy-server equivalent or a
  documented, accepted "not applicable" rationale, with no unresolved gaps.

#### Scenario: Deprecation precedes removal

- **GIVEN** a fully-resolved parity matrix
- **WHEN** the team moves to retire epf-cli
- **THEN** epf-cli first emits a deprecation notice, a window is observed, and
  only then is `apps/epf-cli/` removed and project docs updated.
