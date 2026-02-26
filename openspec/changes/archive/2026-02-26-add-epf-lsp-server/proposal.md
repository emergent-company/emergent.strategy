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
