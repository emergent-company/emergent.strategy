# Plan: EPF LSP Server (add-epf-lsp-server)

## Overview

Build a Go-based LSP server that wraps EPF CLI's existing validation logic, providing real-time diagnostics, schema-aware completions, hover documentation, code actions, and go-to-definition for EPF YAML files. Delivered as `epf-cli lsp` subcommand.

---

## OpenSpec Proposal (proposal.md)

### File: `openspec/changes/add-epf-lsp-server/proposal.md`

```markdown
# Change: Add EPF Language Server Protocol (LSP) Server

## Why

EPF's "Strategy-as-Code" approach uses structured YAML files validated against JSON schemas, but today validation only happens via CLI commands or MCP tool calls — there is no real-time feedback loop in the editor. AI agents writing EPF artifacts can produce schema-invalid content that is only caught after the fact.

An LSP server wrapping the existing validation logic would provide real-time diagnostics (red squiggles), schema-aware completions, and hover documentation directly in any LSP-compatible editor. This makes it virtually impossible for AI agents (or humans) to write "illegal" strategy by catching errors as they type.

## What Changes

**Phase 1 — Core Diagnostics**
- New `internal/lsp/` package with LSP server implementation using GLSP library
- New `epf-cli lsp` subcommand (stdio default, optional TCP for debugging)
- Real-time validation diagnostics on file open, change, and save
- Automatic artifact type detection from filename patterns
- Error severity mapping from existing validation error classification
- Embedded schemas for zero-configuration operation

**Phase 2 — Completions & Hover**
- Schema-aware YAML key completion (suggests valid field names at cursor position)
- Enum value completion (e.g., `status:` suggests `draft|ready|in-progress|delivered`)
- `contributes_to` path completion (walks value model for valid paths)
- Hover documentation pulled from JSON Schema `description` fields
- Schema constraint hints on hover (minLength, enum values, patterns)

**Phase 3 — Advanced Intelligence**
- Code Actions offering auto-fixes from `ai_friendly.go` error classification and fix hints
- Go-to-definition for `contributes_to` paths (jumps to value model file/section)
- Go-to-definition for feature dependency IDs (jumps to referenced feature definition)
- Content readiness warnings (TBD/TODO/placeholder detection as LSP warnings)
- Workspace-level diagnostics (validates full EPF instance relationships on demand)

## Impact

- Affected specs: `epf-lsp` (new capability)
- Affected code:
  - `apps/epf-cli/cmd/lsp.go` (new command)
  - `apps/epf-cli/internal/lsp/` (new package, ~6-8 files)
  - `apps/epf-cli/go.mod` (new dependency: `github.com/tliron/glsp`)
  - No changes to existing validation, schema, or MCP packages (pure wrapping)
- New dependency: `github.com/tliron/glsp` (Apache 2.0, LSP 3.17 protocol)
- Documentation: Editor configuration guides for VS Code, Neovim, Cursor
```

---

## Design Document (design.md)

### File: `openspec/changes/add-epf-lsp-server/design.md`

```markdown
## Context

EPF CLI already has comprehensive validation infrastructure:
- `internal/validator/` — JSON Schema validation with line/column positions
- `internal/validator/ai_friendly.go` — Error classification (type_mismatch, invalid_enum, etc.) with fix hints
- `internal/validator/schema_introspect.go` — Schema structure extraction for field/type discovery
- `internal/validator/explanations.go` — Human-readable error explanations
- `internal/schema/loader.go` — Artifact type detection from filename patterns, schema loading
- `internal/relationships/` — Value model path validation with "did you mean" suggestions
- `internal/checks/` — Content readiness (TBD/TODO detection)
- `internal/embedded/` — Bundled schemas for zero-config operation

The LSP server wraps this existing logic — it does NOT re-implement validation. The MCP server (`internal/mcp/`) provides the architectural pattern to follow.

**Stakeholders:** AI agents writing EPF artifacts, human strategy practitioners, EPF framework maintainers.

## Goals / Non-Goals

**Goals:**
- Real-time validation feedback in any LSP-compatible editor
- Schema-aware completions to guide correct artifact authoring
- Zero-configuration operation (embedded schemas, auto-detect artifact types)
- Same binary distribution as existing CLI (`epf-cli lsp` subcommand)
- Make it impossible for AI agents to write schema-invalid EPF artifacts

**Non-Goals:**
- VS Code extension packaging (manual editor config only)
- YAML formatting/pretty-printing (use existing `epf-cli fix` or external formatters)
- Content generation or writing (LSP is read-only / diagnostic — aligns with "Agent as Writer, Tool as Linter" principle)
- Replacing the MCP server (LSP and MCP serve different purposes and coexist)

## Decisions

### Decision 1: Use GLSP library (`github.com/tliron/glsp`)

**Why:** Handler-based API with complete LSP 3.17 protocol, built-in stdio/TCP/WebSocket transport. Lowest friction for wrapping existing validation logic. Production-proven in zk (Zettelkasten CLI) and Puccini TOSCA.

**Alternatives considered:**
- `go.lsp.dev/protocol` — More low-level; requires manual JSON-RPC dispatch wiring. Used by helm-ls. More boilerplate but more control.
- gopls internals — Not importable (internal packages). Reference only.
- Custom implementation — Too much protocol work; no justification.

### Decision 2: Subcommand of existing binary (`epf-cli lsp`)

**Why:** Follows the established `epf-cli serve` pattern. Shares embedded schemas, single binary to distribute. Users already have the CLI.

**Transport modes:**
- `epf-cli lsp` — stdio (default, for editor integration)
- `epf-cli lsp --tcp :7998` — TCP mode (for debugging, connecting from multiple clients)

### Decision 3: Document store with debounced validation

**Why:** LSP sends `didChange` events on every keystroke. Running full schema validation on each keystroke would be too expensive. The document store:
- Tracks open files and their current content in memory
- On `didChange`: update document content, schedule debounced validation (~300ms)
- On `didSave`: run full validation (schema + relationships + content readiness)
- On `didOpen`: run full validation immediately

### Decision 4: YAML AST for cursor-position awareness

**Why:** Completions and hover require knowing "where in the YAML structure is the cursor?" The `gopkg.in/yaml.v3` parser produces `yaml.Node` trees with line/column positions. We traverse the AST to find the node at the cursor position, then walk up to determine the schema path.

### Decision 5: Three-phase delivery

**Why:** Phase 1 (diagnostics) delivers immediate value with minimal risk. Phases 2 and 3 build on the foundation incrementally. Each phase is independently useful.

### Decision 6: Workspace detection via existing instance discovery

**Why:** The `internal/discovery/` and `internal/anchor/` packages already detect EPF instances. On LSP initialization, the server walks up from the workspace root to find the nearest EPF instance. This enables:
- Relationship validation (needs full instance context)
- `contributes_to` path completion (needs value model)
- Cross-file go-to-definition (needs feature definitions)

## Architecture

```
apps/epf-cli/
├── cmd/
│   └── lsp.go                  # NEW: Cobra command (mirrors serve.go)
├── internal/
│   └── lsp/
│       ├── server.go           # Server struct, init, capabilities declaration
│       ├── document.go         # In-memory document store + YAML parsing cache
│       ├── handlers.go         # LSP method handlers (initialize, shutdown, didOpen, etc.)
│       ├── diagnostics.go      # ValidationError/AIFriendlyResult → protocol.Diagnostic mapping
│       ├── completion.go       # Phase 2: Schema-aware YAML completion
│       ├── hover.go            # Phase 2: Schema description hover
│       ├── actions.go          # Phase 3: Code actions from fix hints
│       ├── definition.go       # Phase 3: Go-to-definition for cross-refs
│       └── yaml_position.go    # YAML AST cursor-position utilities
```

### Server Lifecycle

```
1. Editor launches: epf-cli lsp
2. Initialize request:
   - Detect EPF instance from workspace root
   - Create validator (embedded schemas)
   - Declare capabilities (diagnostics, completion, hover, codeActions, definition)
   - Return ServerCapabilities
3. Document lifecycle:
   - didOpen → parse YAML, validate, publish diagnostics
   - didChange → update doc store, debounce → validate, publish diagnostics
   - didSave → full validate (schema + relationships + content readiness), publish diagnostics
   - didClose → remove from doc store
4. Requests:
   - completion → determine cursor YAML path, query schema introspector
   - hover → determine cursor YAML path, return schema description + constraints
   - codeAction → return fix actions from AIFriendlyResult fix hints
   - definition → resolve contributes_to paths or feature IDs to file locations
5. Shutdown → clean up
```

### Diagnostic Severity Mapping

| Validation Priority | LSP Severity | Source |
|---|---|---|
| `critical` (type_mismatch) | Error | validator/ai_friendly.go |
| `high` (invalid_enum, missing_required) | Error | validator/ai_friendly.go |
| `medium` (constraint_violation, pattern_mismatch) | Warning | validator/ai_friendly.go |
| `low` (unknown_field) | Information | validator/ai_friendly.go |
| Content readiness (TBD/TODO) | Hint | checks/instance.go |
| Relationship errors | Warning | relationships/validator.go |

### Completion Strategy

For YAML completions, the system must know the "schema path" at the cursor. Given cursor at line L, column C:

1. Parse document YAML into `yaml.Node` tree
2. Walk tree to find the innermost node containing position (L, C)
3. Walk up parent nodes to build schema path (e.g., `definition.personas[0].technical_proficiency`)
4. Query `SchemaIntrospector` for that path's expected type/values
5. Return `CompletionItem[]` with label, detail, insertText

**Completion triggers:**
- After `:` on a known key → suggest enum values or type hint
- At indentation level → suggest valid sibling keys for current schema path
- Inside `contributes_to:` array → suggest value model paths from loaded value model

## Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|---|---|---|
| GLSP library maintenance stalls | Low | Library is simple enough to fork; protocol types are stable |
| YAML AST position mapping is imprecise | Medium | Extensive testing with real EPF files; fall back to nearest node |
| Debounced validation still too slow for large files | Low | Profile, consider incremental validation for specific sections |
| gopkg.in/yaml.v3 Node positions are 1-indexed, LSP is 0-indexed | Certain | Handle offset in `yaml_position.go` consistently |

## Open Questions

- Should the LSP watch for file changes outside the editor (e.g., git checkout changing files)? The `internal/strategy/watcher.go` already uses fsnotify. Could reuse for workspace-level invalidation.
- Should diagnostic messages match the CLI output exactly, or be optimized for inline display (shorter)?
```

---

## Tasks (tasks.md)

### File: `openspec/changes/add-epf-lsp-server/tasks.md`

```markdown
## Phase 1: Core Diagnostics

### 1.1 Foundation
- [ ] 1.1.1 Add `github.com/tliron/glsp` dependency to go.mod
- [ ] 1.1.2 Create `internal/lsp/server.go` — Server struct with validator, schema loader, document store
- [ ] 1.1.3 Create `internal/lsp/document.go` — In-memory document store (open/change/close lifecycle, content tracking, YAML parse cache)
- [ ] 1.1.4 Create `cmd/lsp.go` — Cobra command with stdio (default) and --tcp flag, following serve.go pattern

### 1.2 Diagnostics Pipeline
- [ ] 1.2.1 Create `internal/lsp/diagnostics.go` — Map `ValidationError` and `AIFriendlyResult` to `protocol.Diagnostic` with correct severity, range, source, code
- [ ] 1.2.2 Create `internal/lsp/handlers.go` — Initialize handler (detect EPF instance, declare capabilities), shutdown, didOpen, didChange (debounced), didSave, didClose
- [ ] 1.2.3 Implement debounced validation — 300ms timer on didChange, immediate on didOpen/didSave
- [ ] 1.2.4 Wire artifact type auto-detection from `schema.Loader.DetectArtifactType()` for opened files
- [ ] 1.2.5 Publish diagnostics for non-EPF YAML files (clear diagnostics, or ignore gracefully)

### 1.3 Testing & Configuration
- [ ] 1.3.1 Write unit tests for diagnostic mapping (ValidationError → protocol.Diagnostic)
- [ ] 1.3.2 Write unit tests for document store (open/change/close lifecycle)
- [ ] 1.3.3 Write integration test: open EPF file with known errors, verify diagnostics
- [ ] 1.3.4 Verify `go build` still produces single binary with LSP included
- [ ] 1.3.5 Test stdio mode with a real editor (VS Code / Neovim)
- [ ] 1.3.6 Test TCP mode for debugging

## Phase 2: Completions & Hover

### 2.1 YAML Position Utilities
- [ ] 2.1.1 Create `internal/lsp/yaml_position.go` — Find YAML node at cursor position, build schema path from node ancestry
- [ ] 2.1.2 Handle 1-indexed YAML positions ↔ 0-indexed LSP positions consistently
- [ ] 2.1.3 Write unit tests for cursor-to-schema-path mapping with real EPF YAML structures

### 2.2 Completions
- [ ] 2.2.1 Create `internal/lsp/completion.go` — Register `textDocument/completion` handler
- [ ] 2.2.2 Implement key completion: at current indentation, suggest valid YAML keys from schema
- [ ] 2.2.3 Implement enum value completion: after `:` on enum-typed field, suggest valid values
- [ ] 2.2.4 Implement `contributes_to` path completion: load value model, suggest valid paths
- [ ] 2.2.5 Implement pattern hint completion: for pattern-constrained fields (e.g., `id: fd-`), show pattern
- [ ] 2.2.6 Write unit tests for each completion type

### 2.3 Hover
- [ ] 2.3.1 Create `internal/lsp/hover.go` — Register `textDocument/hover` handler
- [ ] 2.3.2 Implement key hover: show JSON Schema `description` for the field at cursor
- [ ] 2.3.3 Show constraint info: minLength, maxItems, enum values, pattern on hover
- [ ] 2.3.4 Show value model path explanation on hover over `contributes_to` entries
- [ ] 2.3.5 Write unit tests for hover content generation

## Phase 3: Advanced Intelligence

### 3.1 Code Actions
- [ ] 3.1.1 Create `internal/lsp/actions.go` — Register `textDocument/codeAction` handler
- [ ] 3.1.2 Map `AIFriendlyResult` fix hints to `CodeAction` items with `WorkspaceEdit`
- [ ] 3.1.3 Implement quick-fix for enum errors (replace with valid value)
- [ ] 3.1.4 Implement quick-fix for missing required fields (insert template)
- [ ] 3.1.5 Write unit tests for code action generation

### 3.2 Go-to-Definition
- [ ] 3.2.1 Create `internal/lsp/definition.go` — Register `textDocument/definition` handler
- [ ] 3.2.2 Resolve `contributes_to` paths to value model file and line
- [ ] 3.2.3 Resolve feature dependency IDs (requires/enables) to feature definition files
- [ ] 3.2.4 Write unit tests for definition resolution

### 3.3 Workspace Intelligence
- [ ] 3.3.1 Detect EPF instance root on workspace open (use internal/discovery/)
- [ ] 3.3.2 Run relationship validation on save and publish cross-file diagnostics
- [ ] 3.3.3 Publish content readiness warnings (TBD/TODO placeholders)
- [ ] 3.3.4 Consider using fsnotify (already indirect dep) for external file change detection

## Phase 4: Documentation & Polish

### 4.1 Editor Configuration
- [ ] 4.1.1 Write VS Code configuration guide (settings.json LSP client config)
- [ ] 4.1.2 Write Neovim configuration guide (nvim-lspconfig setup)
- [ ] 4.1.3 Write Cursor configuration guide
- [ ] 4.1.4 Add configuration examples to AGENTS.md

### 4.2 Integration
- [ ] 4.2.1 Update epf-cli AGENTS.md with LSP server documentation
- [ ] 4.2.2 Update epf-cli README.md with LSP section
- [ ] 4.2.3 Add `lsp` to the CLI commands table in AGENTS.md
- [ ] 4.2.4 End-to-end testing with real EPF instance and multiple editors
```

---

## Spec Delta — New Capability: `epf-lsp`

### File: `openspec/changes/add-epf-lsp-server/specs/epf-lsp/spec.md`

```markdown
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
```

---

## Summary

This plan creates an openspec change proposal `add-epf-lsp-server` with:

| File | Purpose |
|---|---|
| `proposal.md` | Why, what changes, impact |
| `design.md` | Architecture, library choice, decisions, risks |
| `tasks.md` | 38 implementation tasks across 4 phases |
| `specs/epf-lsp/spec.md` | 6 requirements, 17 scenarios for new `epf-lsp` capability |

**No changes to existing specs** — this is a purely additive new capability. The LSP wraps existing validation logic without modifying it.

### Key Decisions
- **Library:** GLSP (`github.com/tliron/glsp`) — handler-based, LSP 3.17, built-in transports
- **Binary:** `epf-cli lsp` subcommand (shares embedded schemas, single distribution)
- **Architecture:** `internal/lsp/` package mirroring `internal/mcp/` pattern
- **Transport:** stdio (default) + TCP (debug)
- **Validation:** Debounced on change (300ms), immediate on open/save
- **Editor support:** Manual configuration docs for VS Code, Neovim, Cursor
