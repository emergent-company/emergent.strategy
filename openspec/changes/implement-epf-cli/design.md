# Design: epf-cli Implementation

## Context

EPF (Emergent Product Framework) currently exists as a set of YAML schemas and documentation. To make EPF "operationally executable," we need a validation tool that:

1. AI agents can query for schema information during artifact creation
2. Developers can use for local validation and CI/CD integration
3. Acts as the "compiler backend" that ensures all EPF files are valid

This tool is **intentionally separate** from the EPF-Runtime server (which handles durable workflows, storage, and multi-tenancy). The CLI is stateless and Git-native.

**Stakeholders:**
- AI Agents (OpenCode, GitHub Copilot) — need MCP access for schema-aware autocomplete
- Developers — need CLI for local validation and CI/CD
- DevOps — need CI integration for EPF validation gates

## Goals / Non-Goals

### Goals
- Validate EPF YAML files against canonical JSON schemas
- Serve as MCP server for AI assistant integration
- Run standalone without external dependencies (database, APIs)
- Support both local schemas and remote canonical schemas
- Provide clear, actionable error messages with line numbers

### Non-Goals
- Writing or generating EPF content (that's OpenCode's job)
- Storing artifacts (Git is the database)
- Web UI (that's product-factory-os)
- Workflow orchestration (that's EPF-Runtime server-side)
- Multi-tenancy or auth (CLI runs in trusted local context)

## Decisions

### 1. Language: Go

**Decision:** Implement in Go 1.22+

**Rationale:**
- Single static binary distribution (no runtime dependencies)
- Excellent CLI tooling ecosystem (Cobra)
- MCP server implementations available
- Fast startup time critical for editor integration
- Matches product-factory-os tech stack for code sharing

**Alternatives considered:**
- Node.js/TypeScript (rejected: runtime dependency, slower startup)
- Rust (rejected: steeper learning curve, smaller ecosystem for MCP)

### 2. Schema Source Priority

**Decision:** Local schemas override remote schemas

**Rationale:**
- Developers may experiment with schema changes locally
- CI/CD should use pinned schema versions
- Remote schemas provide canonical fallback

**Resolution order:**
1. Project-local `./schemas/` directory
2. Workspace `docs/EPF/schemas/` directory
3. Remote GitHub `eyedea-io/epf-canonical-definition` (cached)

### 3. MCP Transport: stdio

**Decision:** Use stdio transport for MCP server

**Rationale:**
- Standard pattern for editor extensions (VS Code, Cursor, Claude Desktop)
- No network configuration required
- Process lifecycle managed by host application

**Alternative considered:**
- HTTP transport (rejected: adds complexity, firewall issues)

### 4. Validation Library: santhosh-tekuri/jsonschema

**Decision:** Use `github.com/santhosh-tekuri/jsonschema/v5`

**Rationale:**
- Pure Go implementation
- Supports JSON Schema draft 2020-12
- Good error messages with JSONPath locations
- Active maintenance

### 5. Error Output Format

**Decision:** Support multiple output formats via `--format` flag

**Formats:**
- `text` (default): Human-readable with colors
- `json`: Machine-parseable for CI/CD
- `sarif`: GitHub Code Scanning compatible

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        epf-cli                               │
├─────────────────────────────────────────────────────────────┤
│  CLI Layer (Cobra)                                          │
│  ├── validate <path> [--watch] [--format]                   │
│  ├── serve --port (MCP server)                              │
│  ├── schemas list                                           │
│  └── schemas show <type>                                    │
├─────────────────────────────────────────────────────────────┤
│  MCP Layer                                                  │
│  ├── tools/validate — on-demand validation                  │
│  ├── resources/schemas — schema discovery                   │
│  └── prompts/epf-artifact — generation templates            │
├─────────────────────────────────────────────────────────────┤
│  Validation Engine                                          │
│  ├── YAML Parser (yaml.v3 with line tracking)               │
│  ├── JSON Schema Validator (santhosh-tekuri)                │
│  └── EPF Cross-Reference Validator                          │
├─────────────────────────────────────────────────────────────┤
│  Schema Loader                                              │
│  ├── Local File Loader                                      │
│  ├── Remote GitHub Loader (with cache)                      │
│  └── Schema Registry (type → schema mapping)                │
└─────────────────────────────────────────────────────────────┘
```

## Risks / Trade-offs

### Risk: Schema Version Mismatch
**Mitigation:** Include schema version in validation output. Add `--schema-version` flag to pin specific versions.

### Risk: Large Schema Downloads
**Mitigation:** Cache schemas locally with 24-hour TTL. Add `--offline` flag for air-gapped environments.

### Risk: MCP Protocol Changes
**Mitigation:** Use stable MCP Go SDK. Version MCP interface separately from CLI version.

### Trade-off: No Web UI
**Accepted:** Keeping epf-cli focused on validation. Web visualization is product-factory-os's responsibility.

## Migration Plan

1. **Week 1:** Core validation engine + CLI commands
2. **Week 2:** MCP server implementation + testing
3. **Week 3:** Documentation + CI integration examples
4. **Week 4:** Homebrew formula + multi-platform releases

No data migration required (new tool, no existing state).

## Open Questions

- [ ] Should epf-cli support validating partial/incomplete EPF files during drafting?
- [ ] What's the cache location on each platform? (`~/.cache/epf-cli/` vs XDG?)
- [ ] Should we add LSP (Language Server Protocol) support in addition to MCP?
