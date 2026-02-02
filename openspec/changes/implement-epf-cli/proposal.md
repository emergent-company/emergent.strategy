# Change: Implement epf-cli (EPF Validation Kernel)

## Why

EPF is evolving from a documentation-only framework to an operational, programmatically executable system. The `epf-cli` tool serves as the "Kernel" — a schema validation engine and MCP server that enables AI agents (like OpenCode) to write valid EPF YAML files with real-time linting and autocomplete support. This is Phase 2 of the ProductFactoryOS roadmap.

## What Changes

- **NEW** capability: `epf-cli` — a Go-based CLI tool for EPF schema validation
- **NEW** MCP server mode: enables AI assistants to query EPF schemas for intelligent autocomplete
- **NEW** validation engine: parses and validates EPF YAML files against canonical JSON schemas
- **NEW** schema loading: fetches schemas from canonical EPF repository or local cache
- Introduces Go module at `apps/epf-cli/` with Cobra CLI framework

## Impact

- **Affected specs**: None (new capability)
- **Affected code**: 
  - `apps/epf-cli/` — new Go module
  - No changes to existing Emergent Core or Admin
- **Dependencies**: 
  - Canonical EPF schemas (from `docs/EPF/` or remote `eyedea-io/epf-canonical-definition`)
  - MCP protocol for AI tool integration

## Success Criteria

1. `epf-cli validate <path>` validates any EPF YAML file against canonical schemas
2. `epf-cli serve --port 8080` starts MCP server that OpenCode can query for schemas
3. Validation errors include line numbers and human-readable messages
4. CLI runs standalone without requiring NestJS server or database

## Non-Goals (Phase 2 Scope)

- epf-cli does NOT write content (OpenCode is the writer)
- epf-cli does NOT store artifacts (Git is the database)
- No web UI in this phase (that's product-factory-os)
- No Temporal integration (that's EPF-Runtime server-side)
