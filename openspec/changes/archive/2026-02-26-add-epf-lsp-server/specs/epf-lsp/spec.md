## ADDED Requirements

### Requirement: LSP Server Lifecycle

The system SHALL provide an LSP server accessible via `epf-cli lsp` that communicates over stdio by default and optionally over TCP.

The server SHALL:
- Support LSP protocol version 3.17 via the GLSP library
- Accept a `--tcp` flag with address (e.g., `--tcp :7998`) for debug connections
- Use embedded schemas by default for zero-configuration operation
- Auto-detect EPF instance root from the workspace folder hierarchy
- Shut down cleanly on LSP `shutdown` request or process termination

#### Scenario: Start LSP in stdio mode
- **WHEN** an editor launches `epf-cli lsp`
- **THEN** the server starts and communicates via stdin/stdout using JSON-RPC 2.0
- **AND** the server responds to `initialize` with its declared capabilities

#### Scenario: Start LSP in TCP mode
- **WHEN** a developer runs `epf-cli lsp --tcp :7998`
- **THEN** the server listens on TCP port 7998
- **AND** accepts LSP client connections over the network

#### Scenario: Auto-detect EPF instance
- **WHEN** the editor sends `initialize` with a workspace root path
- **THEN** the server walks the directory hierarchy to find the nearest EPF instance (via `_epf.yaml` anchor or READY/FIRE/AIM markers)
- **AND** loads the instance context for relationship validation and completions

---

### Requirement: Real-Time Validation Diagnostics

The system SHALL validate EPF YAML files and publish diagnostics to the editor in real-time.

The server SHALL:
- Detect EPF artifact type from filename patterns using `schema.Loader.DetectArtifactType()`
- Validate on `textDocument/didOpen` immediately
- Validate on `textDocument/didChange` with a debounce period (~300ms)
- Validate on `textDocument/didSave` with full validation (schema + relationships + content readiness)
- Map validation error priorities to LSP diagnostic severities:
  - `critical` / `high` → `DiagnosticSeverityError`
  - `medium` → `DiagnosticSeverityWarning`
  - `low` → `DiagnosticSeverityInformation`
  - Content readiness (TBD/TODO) → `DiagnosticSeverityHint`
- Include the error classification type (e.g., `type_mismatch`, `invalid_enum`) as the diagnostic code
- Include fix hints in the diagnostic message
- Clear diagnostics for files that are not recognized as EPF artifacts
- Set the diagnostic source to `epf`

#### Scenario: Validate on open
- **WHEN** the user opens `FIRE/feature_definitions/fd-001.yaml` which has an invalid enum value for `status`
- **THEN** the server publishes a diagnostic with severity Error at the line/column of the invalid value
- **AND** the diagnostic message includes the valid enum values
- **AND** the diagnostic code is `invalid_enum`

#### Scenario: Debounced validation on change
- **WHEN** the user types in an open EPF file
- **THEN** validation runs no sooner than 300ms after the last keystroke
- **AND** intermediate keystrokes do not each trigger a separate validation run

#### Scenario: Full validation on save
- **WHEN** the user saves an EPF YAML file
- **THEN** the server runs schema validation, relationship validation, and content readiness checks
- **AND** publishes all findings as diagnostics with appropriate severities

#### Scenario: Non-EPF file opened
- **WHEN** the user opens a YAML file that does not match any EPF artifact pattern
- **THEN** the server publishes zero diagnostics for that file
- **AND** does not attempt schema validation

---

### Requirement: Schema-Aware YAML Completion

The system SHALL provide context-aware completion suggestions based on the EPF JSON Schema at the cursor position.

The server SHALL:
- Parse the YAML document into an AST with line/column positions
- Determine the schema path at the cursor position by traversing the AST node ancestry
- Suggest valid YAML keys as completions when the cursor is at an indentation level expecting new keys
- Suggest valid enum values when the cursor follows a `:` on an enum-typed field
- Suggest valid `contributes_to` paths from the loaded value model
- Show pattern constraints as completion detail for pattern-validated fields
- Handle incomplete/malformed YAML gracefully (provide completions even when document has parse errors)

#### Scenario: Key completion
- **WHEN** the cursor is inside a `definition:` block and the user triggers completion
- **THEN** the server suggests valid keys: `job_to_be_done`, `solution_approach`, `personas`, `capabilities`
- **AND** each suggestion includes the expected type as detail

#### Scenario: Enum value completion
- **WHEN** the cursor follows `status:` in a feature definition
- **THEN** the server suggests: `draft`, `ready`, `in-progress`, `delivered`

#### Scenario: contributes_to path completion
- **WHEN** the cursor is inside a `contributes_to:` array item
- **THEN** the server suggests valid paths from the value model (e.g., `Product.Core.Search`, `Strategy.Growth.MarketExpansion`)
- **AND** paths are filtered by prefix as the user types

#### Scenario: Completion with malformed YAML
- **WHEN** the document has YAML parse errors elsewhere in the file
- **THEN** the server still provides best-effort completions at the cursor position

---

### Requirement: Hover Documentation

The system SHALL provide documentation and constraint information when the user hovers over EPF YAML fields.

The server SHALL:
- Show the JSON Schema `description` for the field under the cursor
- Show field constraints: type, enum values, pattern, minLength, maxItems, required status
- Show value model path explanations when hovering over `contributes_to` values
- Format hover content as Markdown for rich rendering in editors

#### Scenario: Hover on schema field
- **WHEN** the user hovers over the `technical_proficiency` key in a persona definition
- **THEN** the server shows the field description from the schema
- **AND** shows the valid enum values: `basic`, `intermediate`, `advanced`, `expert`

#### Scenario: Hover on contributes_to path
- **WHEN** the user hovers over `Product.Discovery.KnowledgeExploration` in a contributes_to list
- **THEN** the server shows the value model path explanation (layer, component, maturity level, contributing features)

---

### Requirement: Code Actions for Auto-Fixes

The system SHALL offer code actions that apply fixes for common validation errors.

The server SHALL:
- Generate code actions from `AIFriendlyResult` fix hints
- Support quick-fix for invalid enum values (replace with closest valid value)
- Support quick-fix for missing required fields (insert field with placeholder value from template)
- Associate code actions with their corresponding diagnostics

#### Scenario: Fix invalid enum
- **WHEN** a diagnostic reports `invalid_enum` for `status: "development"`
- **THEN** a code action is available: "Change to 'in-progress'"
- **AND** applying the action replaces the value in the document

#### Scenario: Fix missing required field
- **WHEN** a diagnostic reports `missing_required` for field `solution_approach` in `definition`
- **THEN** a code action is available: "Add solution_approach field"
- **AND** applying the action inserts the field with a template placeholder

---

### Requirement: Go-to-Definition for Cross-References

The system SHALL resolve cross-references in EPF artifacts to their definition locations.

The server SHALL:
- Resolve `contributes_to` paths to the corresponding value model file and line
- Resolve feature dependency IDs (`requires`, `enables`) to the referenced feature definition file
- Return `Location` results that editors can navigate to

#### Scenario: Go to value model from contributes_to
- **WHEN** the user invokes go-to-definition on `Product.Core.Search` in a contributes_to list
- **THEN** the editor navigates to the value model file at the line defining the `Core.Search` component

#### Scenario: Go to feature from dependency
- **WHEN** the user invokes go-to-definition on `fd-001` in a `requires` dependency list
- **THEN** the editor navigates to `FIRE/feature_definitions/fd-001.yaml`

---

### Requirement: Workspace-Level Intelligence

The system SHALL provide workspace-level diagnostics that validate cross-file relationships.

The server SHALL:
- Run relationship validation (via `internal/relationships/`) on save and publish cross-file diagnostics
- Detect and warn about content readiness issues (TBD/TODO/placeholder content)
- Use the EPF instance context detected at initialization for cross-file resolution

#### Scenario: Relationship validation on save
- **WHEN** a user saves a feature definition with a `contributes_to` path that does not exist in the value model
- **THEN** the server publishes a diagnostic with severity Warning
- **AND** the message includes "did you mean" suggestions from the relationship validator

#### Scenario: Content readiness warnings
- **WHEN** a user opens a feature definition containing "TBD" placeholders
- **THEN** the server publishes diagnostics with severity Hint at each placeholder location
- **AND** the diagnostic source is `epf-content`
