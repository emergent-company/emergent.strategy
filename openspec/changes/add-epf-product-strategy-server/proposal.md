# Change: Add Product Strategy Server to epf-cli

## Why

Today, product strategy knowledge captured in EPF artifacts is only accessible to AI agents that have local filesystem access to the product repository. This limits EPF's value in several important scenarios:

1. **CI/CD Pipelines** - PR review bots and automation tools clone repos temporarily and lack persistent product context
2. **Production AI Features** - Product AI assistants (customer-facing or internal) need strategy context but can't git clone
3. **Non-Developer Teams** - Design, marketing, and support teams using AI tools don't have repos cloned locally
4. **Web-Based AI Tools** - ChatGPT, Claude.ai, and similar tools can connect to MCPs but lack filesystem access
5. **Multi-Product Organizations** - Cross-product strategy queries require aggregating across multiple repos

The epf-cli currently excels at **authoring** (create, validate, fix) but lacks a **semantic query layer** that makes product strategy easily consumable by any AI agent regardless of where it runs.

## What Changes

### New Capability: Product Strategy Server

Extend epf-cli with a **Product Strategy Server** that provides read-only, semantic access to EPF product strategy:

1. **StrategyStore Abstraction** - A pluggable interface for loading EPF artifacts from different sources:

   - `FileSystemSource` - Local filesystem (existing behavior, for local dev)
   - `GitHubSource` - Fetch from GitHub repository (new, for server deployment)

2. **In-Memory Strategy Model** - Parse EPF artifacts into typed, queryable objects:

   - Vision, Mission, North Star
   - Personas with pain points and narratives
   - Value Propositions
   - Competitive positioning
   - Roadmap with OKRs and Key Results
   - Relationship graph between artifacts

3. **New MCP Tools for Strategy Queries** - Read-only tools for AI agents to query product strategy:

   - `epf_get_product_vision` - High-level product direction
   - `epf_get_personas` - Who we're building for
   - `epf_get_persona_details` - Deep dive into a specific persona
   - `epf_get_value_propositions` - Why customers choose us
   - `epf_get_competitive_position` - How we compare to alternatives
   - `epf_get_roadmap_summary` - What's planned and why
   - `epf_search_strategy` - Full-text search across all strategy artifacts
   - `epf_get_strategic_context_for_topic` - Synthesized context for a specific topic

4. **CLI Diagnostics** - Minimal CLI commands for server management (not query duplication):

   - `epf strategy serve` - Start the strategy server (long-running MCP)
   - `epf strategy status` - Check what's loaded in the strategy store
   - `epf strategy export` - Export combined strategy document

5. **File Watching** - For local development, watch for file changes and rebuild the strategy model automatically

### What Does NOT Change

- **Authoring tools remain unchanged** - All existing create, validate, fix, migrate commands work exactly as before
- **Existing MCP tools unchanged** - All 49 current MCP tools continue to work
- **No database required** - Strategy model is in-memory, rebuilt from files on startup
- **No embeddings initially** - Start with structured access and full-text search; add semantic search later if needed

## Impact

### Affected Specs

- **epf-cli-mcp** - Will be extended with new strategy query tools (ADDED requirements)
- **New spec: epf-strategy-server** - New capability for the strategy server functionality

### Affected Code

| Area            | Files                                                          | Change Type |
| --------------- | -------------------------------------------------------------- | ----------- |
| Strategy Store  | `internal/strategy/store.go`, `internal/strategy/sources/*.go` | New         |
| Strategy Model  | `internal/strategy/model/*.go`                                 | New         |
| Strategy Parser | `internal/strategy/parser/*.go`                                | New         |
| MCP Tools       | `internal/mcp/strategy_tools.go`                               | New         |
| CLI Commands    | `cmd/strategy.go`                                              | New         |
| File Watcher    | `internal/strategy/watcher.go`                                 | New         |

### Migration

None required. This is purely additive. Existing epf-cli users can continue using current commands without any changes.

### Future Extraction Path

The design intentionally supports future extraction to a standalone server:

1. **Phase 1 (this proposal)**: Strategy server lives in epf-cli, uses FileSystemSource
2. **Phase 2 (future)**: Add GitHubSource for fetching from remote repos
3. **Phase 3 (future)**: Extract to standalone `epf-server` if multi-tenant/always-on deployment is needed

The `StrategyStore` interface makes this extraction straightforward without changing MCP tool definitions.

## Design Considerations

### Why In-Memory, Not Database?

EPF instances are small (~20-50 files, ~100KB of content). Loading into memory is trivial:

- Parse time: ~50-100ms
- Memory footprint: ~10-20MB with indexes
- Rebuild on file change: instant

A database adds operational complexity without benefit at this scale.

### Why Full-Text Search First, Not Embeddings?

1. Embeddings require external API calls or heavy local models
2. Full-text search covers most use cases for structured strategy content
3. Can add embeddings later behind the same interface if needed

### Performance Impact on CLI

Lazy loading ensures the strategy server features only load when needed:

- `epf create persona` - Fast, no strategy loading
- `epf validate` - Fast, no strategy loading
- `epf strategy serve` - Loads strategy store, slight startup delay (~500ms)

The strategy server is long-running, so startup time is acceptable.
