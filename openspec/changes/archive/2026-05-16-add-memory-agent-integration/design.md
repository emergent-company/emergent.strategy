## Context

The EPF CLI's semantic engine decomposes EPF artifacts into a Memory graph (785+ objects, 838+ relationships). AI agents interact with this graph via MCP tools, but the current tool surface is too narrow — agents can search and traverse but cannot run structured queries, find similar objects, or get proactive quality signals from the graph.

This change adds 5 new MCP tools and enhances 2 existing ones. It must follow the MCP tool architecture principles (P1-P6) established in `refactor-mcp-tool-architecture`.

### Stakeholders

- AI agents (primary consumers via MCP)
- EPF instance authors (benefit from quality cues)
- EPF CLI maintainers (implement the tools)

## Goals / Non-Goals

### Goals

- Agents can discover the Memory ingestion pipeline without user guidance
- Agents can run deterministic graph queries (list by type, filter by properties)
- Agents can find semantically similar objects for cross-referencing
- Agents get proactive quality findings with actionable fix instructions
- All new tools follow P1-P6 principles (LLM decision-making tools, no wrappers, `[Category] USE WHEN` descriptions, response chaining)

### Non-Goals

- Exposing `ingest`/`sync` as MCP tools (these are intentionally CLI-only per architecture decision)
- Auto-fixing quality issues without agent/user judgment (fixes require domain context)
- Replacing the existing `semantic_search`/`semantic_neighbors` tools (complement, not replace)
- Configurable search parameters like `--fusion-strategy` (keep MCP tools simple; advanced users use CLI)

## Decisions

### Decision 1: `epf_memory_status` is a standalone tool, not folded into `epf_health_check`

**Rationale:** `epf_health_check` validates file-based artifacts. Memory status is a runtime concern (API connectivity, ingestion state). Mixing these would violate the principle of checking file health vs service health. The tool is lightweight (env var check + one API call) and follows P1 (LLM needs it during conversation to decide whether to recommend ingestion).

**Alternative considered:** Adding a `memory` section to `epf_health_check`. Rejected because health check is designed to work offline — adding an API dependency changes its reliability profile.

### Decision 2: `epf_graph_list` wraps the Memory REST API directly

**Rationale:** The Memory API already supports `GET /api/graph/objects?type=Feature&filter=status:delivered`. The epf-cli tool adds EPF-aware defaults (e.g., default types from the EPF schema v2, human-readable formatting) but delegates to the Memory client. This avoids duplicating query logic.

**Alternative considered:** Building a query DSL in epf-cli. Rejected — the Memory API's query parameters are sufficient and agents understand `type=Feature filter=status=delivered` naturally.

### Decision 3: `epf_quality_audit` composes existing primitives

**Rationale:** The quality audit runs three checks in parallel:
1. `contradictions` endpoint for status conflicts
2. `semantic_search` for generic content detection (cross-similarity > 0.80)
3. `semantic_neighbors` for disconnected node detection (0 outgoing edges)

Each check already works. The audit tool composes them into a single response with categorized findings and `fix_with` instructions. This follows P4 (response chaining) — the audit tells the agent exactly which tool to call for each finding.

**Alternative considered:** A single mega-tool that both detects and fixes. Rejected — fixes require domain context (what maturity level? what evidence?) that the agent must determine.

### Decision 4: `epf_suggest_enrichment` is per-feature, not instance-wide

**Rationale:** Instance-wide enrichment produces too much output for an LLM context window. Per-feature suggestions are actionable — the agent works on one feature at a time. The tool combines:
- Missing field detection (value_propositions, dependencies)
- Contradiction check for that feature's capabilities
- Cross-similarity scan for dependency suggestions
- UVP quality check for the feature's contributes_to paths

### Decision 5: Enhanced responses use `fix_with` objects, not free-text hints

**Rationale:** Structured `fix_with` objects (`{tool, params}`) are machine-actionable. The agent can directly call the recommended tool with the provided parameters. Free-text hints require the agent to parse natural language to determine the fix, which is less reliable.

## Risks / Trade-offs

- **Memory API dependency:** All new tools except `epf_memory_status` require a connected Memory instance. Tools MUST return clear error messages when Memory is not configured, not fail silently.
  - Mitigation: Each tool checks `EPF_MEMORY_*` env vars first and returns a structured error with setup instructions.

- **Tool count increase:** Adding 5 tools goes against the spirit of reducing tool count. However, P1 says tools should exist if the LLM needs them during conversation, and these fill real gaps evidenced by actual usage sessions.
  - Mitigation: Follow P3 strictly — `[Category] USE WHEN` descriptions so LLMs can quickly skip irrelevant tools.

- **Quality audit performance:** Running 3 checks in parallel against the Memory API could be slow for large instances.
  - Mitigation: Set reasonable timeouts, cache results within a session, and allow partial results if one check times out.

## Open Questions

- Should `epf_graph_list` support pagination or just return up to a configurable limit? (Leaning toward limit-only for simplicity — agents rarely need to paginate.)
- Should `epf_quality_audit` have a severity filter (e.g., only critical findings)? (Leaning yes — large instances could produce hundreds of findings.)
