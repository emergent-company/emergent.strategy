# MCP Interface

This document defines an initial MCP surface for agents. The contract is intentionally minimal and can evolve.

## Resources
- resource: facts/document
  - get(id): returns document metadata and available views.
  - list(filter): paginate by source, time, labels.
- resource: facts/chunk
  - get(id): text, metadata, provenance, document link.
  - list(document_id, page): paginate chunks.
- resource: facts/entity
  - get(id)
  - neighbors(id, types?): related entities and supporting evidence.

## Tools
- tool: facts.search
  - input: { query: string, k?: number, filters?: { source?, date_range?, labels?, entities? }, mode?: "hybrid"|"vector"|"keyword" }
  - output: { results: Array<{ chunk_id, score, text_snippet, document_id, section_path, citations: Array<{uri, page?, anchor?}> }> }
- tool: facts.fetch
  - input: { chunk_id: string }
  - output: { chunk, document, provenance }
- tool: facts.expand
  - input: { entity_id: string, relation_types?: string[], k?: number }
  - output: { entities, relations, evidence_chunks }
- tool: facts.summarize
  - input: { ids: {chunk_ids?: string[], document_ids?: string[]}, style?: "bullet"|"narrative" }
  - output: { summary, citations }
- tool: facts.propose_spec (optional v1.1)
  - input: { goal: string, constraints?: string[], seed_ids?: string[] }
  - output: { spec_markdown, sources }

## AuthN/AuthZ
- Bearer tokens or session from client; per-tenant scoping and role mapping.
- Row-level security ensures only authorized facts are exposed.

## Error Model
- 4xx for invalid queries or forbidden resources; 5xx for internal errors.
- Include correlation_id and partial results when possible.
