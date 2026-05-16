# Change: Add Memory agent integration tools and discoverability

## Why

AI agents working with EPF instances cannot effectively use the Memory graph integration. Three gaps compound into a poor agent experience:

1. **Discoverability (#10):** Agents cannot discover that `epf-cli ingest`/`sync` exist. They default to manually creating entities via Memory MCP tools — producing ~120 flat entities instead of the 785+ objects the decomposer pipeline produces. A real session wasted ~15 minutes on manual entity creation before the user pointed to the correct workflow.

2. **Query capabilities (#9):** The MCP server only exposes `semantic_search`, `semantic_neighbors`, and `contradictions`. Agents need structured graph queries (list by type + filter) and object similarity search, but these are only available via CLI/REST. During a marketing report workflow, an agent had to read 18 YAML files directly for information the graph already contained.

3. **Quality intelligence (#8):** The graph contains quality signals (status conflicts, generic content, disconnected nodes) but agents must creatively discover them. During an enrichment session, the agent found 42 status contradictions, 16 generic UVPs, and disconnected Beliefs/Trends — but only because it thought to look, not because the system surfaced them.

These form a natural progression: agents must first find the pipeline, then query the graph effectively, then use graph signals for quality improvement.

## What Changes

### Memory discoverability (Issue #10)

- `epf_agent_instructions` includes a Memory Integration section when `EPF_MEMORY_*` env vars are configured
- New `epf_memory_status` MCP tool reports configuration state, ingestion status (object count), and recommends next steps (`ingest` or `sync`)
- Agent instruction output (`epf-cli agent`) includes Memory workflow guidance

### Graph query tools (Issue #9)

- New `epf_graph_list` MCP tool for structured graph queries by type and filter (e.g., `type=Feature filter=status=delivered`)
- New `epf_graph_similar` MCP tool for embedding-ranked similarity search between objects

### Quality intelligence tools (Issue #8)

- New `epf_quality_audit` MCP tool combining graph signals into categorized findings with fix instructions (contradictions, generic content, disconnected nodes)
- New `epf_suggest_enrichment` MCP tool providing per-feature graph-driven enrichment suggestions (missing fields, contradictions, weak UVPs, suggested dependencies)
- Existing `epf_contradictions` responses include `fix_with` field pointing to the correct fix tool and parameters
- Existing `epf_semantic_neighbors` responses include quality hints for low-connectivity nodes

## Impact

- Affected specs: `epf-semantic-engine`, `epf-cli-mcp`
- Affected code:
  - `apps/epf-cli/internal/mcp/` — new tool handlers
  - `apps/epf-cli/internal/memory/` — new Memory client methods for graph list and similarity
  - `apps/epf-cli/internal/agent/` — agent instructions Memory section
  - `apps/epf-cli/internal/quality/` — new package for quality audit logic
- New MCP tools: 5 (`epf_memory_status`, `epf_graph_list`, `epf_graph_similar`, `epf_quality_audit`, `epf_suggest_enrichment`)
- Modified MCP tools: 2 (`epf_contradictions`, `epf_semantic_neighbors`)
- GitHub issues resolved: #8, #9, #10

## References

- GitHub Issue #10: https://github.com/emergent-company/emergent.strategy/issues/10
- GitHub Issue #9: https://github.com/emergent-company/emergent.strategy/issues/9
- GitHub Issue #8: https://github.com/emergent-company/emergent.strategy/issues/8
- Related: emergent-company/emergent.memory#103 (search threshold and MCP tool gaps)
