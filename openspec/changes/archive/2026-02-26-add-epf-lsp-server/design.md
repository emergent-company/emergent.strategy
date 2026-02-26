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
