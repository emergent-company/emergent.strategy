## Phase 1: Core Diagnostics

### 1.1 Foundation
- [x] 1.1.1 Add `github.com/tliron/glsp` dependency to go.mod
- [x] 1.1.2 Create `internal/lsp/server.go` — Server struct with validator, schema loader, document store
- [x] 1.1.3 Create `internal/lsp/document.go` — In-memory document store (open/change/close lifecycle, content tracking, YAML parse cache)
- [x] 1.1.4 Create `cmd/lsp.go` — Cobra command with stdio (default) and --tcp flag, following serve.go pattern

### 1.2 Diagnostics Pipeline
- [x] 1.2.1 Create `internal/lsp/diagnostics.go` — Map `ValidationError` and `AIFriendlyResult` to `protocol.Diagnostic` with correct severity, range, source, code
- [x] 1.2.2 Create `internal/lsp/handlers.go` — Initialize handler (detect EPF instance, declare capabilities), shutdown, didOpen, didChange (debounced), didSave, didClose
- [x] 1.2.3 Implement debounced validation — 300ms timer on didChange, immediate on didOpen/didSave
- [x] 1.2.4 Wire artifact type auto-detection from `schema.Loader.DetectArtifactType()` for opened files
- [x] 1.2.5 Publish diagnostics for non-EPF YAML files (clear diagnostics, or ignore gracefully)

### 1.3 Testing & Configuration
- [x] 1.3.1 Write unit tests for diagnostic mapping (ValidationError → protocol.Diagnostic)
- [x] 1.3.2 Write unit tests for document store (open/change/close lifecycle)
- [x] 1.3.3 Write integration test: open EPF file with known errors, verify diagnostics
- [x] 1.3.4 Verify `go build` still produces single binary with LSP included
- [x] 1.3.5 Test stdio mode with a real editor (VS Code / Neovim)
- [x] 1.3.6 Test TCP mode for debugging

## Phase 2: Completions & Hover

### 2.1 YAML Position Utilities
- [x] 2.1.1 Create `internal/lsp/yaml_position.go` — Find YAML node at cursor position, build schema path from node ancestry
- [x] 2.1.2 Handle 1-indexed YAML positions ↔ 0-indexed LSP positions consistently
- [x] 2.1.3 Write unit tests for cursor-to-schema-path mapping with real EPF YAML structures

### 2.2 Completions
- [x] 2.2.1 Create `internal/lsp/completion.go` — Register `textDocument/completion` handler
- [x] 2.2.2 Implement key completion: at current indentation, suggest valid YAML keys from schema
- [x] 2.2.3 Implement enum value completion: after `:` on enum-typed field, suggest valid values
- [x] 2.2.4 Implement `contributes_to` path completion: load value model, suggest valid paths
- [x] 2.2.5 Implement pattern hint completion: for pattern-constrained fields (e.g., `id: fd-`), show pattern
- [x] 2.2.6 Write unit tests for each completion type

### 2.3 Hover
- [x] 2.3.1 Create `internal/lsp/hover.go` — Register `textDocument/hover` handler
- [x] 2.3.2 Implement key hover: show JSON Schema `description` for the field at cursor
- [x] 2.3.3 Show constraint info: minLength, maxItems, enum values, pattern on hover
- [x] 2.3.4 Show value model path explanation on hover over `contributes_to` entries
- [x] 2.3.5 Write unit tests for hover content generation

## Phase 3: Advanced Intelligence

### 3.1 Code Actions
- [x] 3.1.1 Create `internal/lsp/actions.go` — Register `textDocument/codeAction` handler
- [x] 3.1.2 Map `AIFriendlyResult` fix hints to `CodeAction` items with `WorkspaceEdit`
- [x] 3.1.3 Implement quick-fix for enum errors (replace with valid value)
- [x] 3.1.4 Implement quick-fix for missing required fields (insert template)
- [x] 3.1.5 Write unit tests for code action generation

### 3.2 Go-to-Definition
- [x] 3.2.1 Create `internal/lsp/definition.go` — Register `textDocument/definition` handler
- [x] 3.2.2 Resolve `contributes_to` paths to value model file and line
- [x] 3.2.3 Resolve feature dependency IDs (requires/enables) to feature definition files
- [x] 3.2.4 Write unit tests for definition resolution

### 3.3 Workspace Intelligence
- [x] 3.3.1 Detect EPF instance root on workspace open (use internal/discovery/)
- [x] 3.3.2 Run relationship validation on save and publish cross-file diagnostics
- [x] 3.3.3 Publish content readiness warnings (TBD/TODO placeholders)
- [x] 3.3.4 Consider using fsnotify (already indirect dep) for external file change detection

## Phase 4: Documentation & Polish

### 4.1 Editor Configuration
- [x] 4.1.1 Write VS Code configuration guide (settings.json LSP client config)
- [x] 4.1.2 Write Neovim configuration guide (nvim-lspconfig setup)
- [x] 4.1.3 Write Cursor configuration guide
- [x] 4.1.4 Add configuration examples to AGENTS.md

### 4.2 Integration
- [x] 4.2.1 Update epf-cli AGENTS.md with LSP server documentation
- [x] 4.2.2 Update epf-cli README.md with LSP section
- [x] 4.2.3 Add `lsp` to the CLI commands table in AGENTS.md
- [ ] 4.2.4 End-to-end testing with real EPF instance and multiple editors
