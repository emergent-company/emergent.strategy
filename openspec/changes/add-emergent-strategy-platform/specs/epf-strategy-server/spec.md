## ADDED Requirements

### Requirement: Semantic Search via MCP

The system SHALL provide an `epf_semantic_search` MCP tool that queries the semantic graph by meaning, returning artifact sections that are semantically related to the query regardless of whether they contain the exact search terms.

The tool SHALL:

- Accept a natural language query describing the strategic concept to search for
- Use vector similarity search (via emergent.memory's pgvector index) to find semantically related nodes
- Return ranked results with artifact type, section path, content snippet, and similarity score
- Require emergent.memory to be configured and the instance to be ingested

#### Scenario: Semantic search finds related content across artifact types

- **WHEN** AI agent calls `epf_semantic_search` with `query="enterprise security concerns"`
- **AND** the instance has been ingested into emergent.memory
- **THEN** the tool returns nodes from personas (pain points about security), features (security-related capabilities), North Star (beliefs about trust), and competitive positioning (security differentiation)
- **AND** results are ranked by semantic similarity, not keyword match

#### Scenario: Semantic search with no emergent.memory

- **WHEN** AI agent calls `epf_semantic_search`
- **AND** emergent.memory is not configured
- **THEN** the tool returns an error indicating that semantic search requires emergent.memory
- **AND** suggests using `epf_search_strategy` for keyword-based search as a fallback

### Requirement: Semantic Impact Analysis via MCP

The system SHALL provide an `epf_semantic_impact` MCP tool that computes the semantic ripple effect of a proposed change, identifying which artifact sections are semantically affected without requiring a full context read of all artifacts.

The tool SHALL:

- Accept a change description (what artifact section changed, what the new content is)
- Query the semantic graph for nodes within N hops that are semantically related to the changed content
- Send only the changed node and its affected neighborhood to an LLM for targeted evaluation
- Return a structured impact report with affected artifacts, severity classification, and recommended actions

#### Scenario: Impact analysis for North Star belief change

- **WHEN** AI agent calls `epf_semantic_impact` with a change to a North Star core belief
- **THEN** the tool queries the semantic graph for all nodes semantically connected to that belief
- **AND** sends the belief change plus ~5-15 affected nodes to an LLM for evaluation
- **AND** returns an impact report identifying affected strategy formula positioning, feature JTBDs, and roadmap assumptions
- **AND** classifies the North Star change as "structural" (requires human approval)

#### Scenario: Impact analysis for feature narrative change

- **WHEN** AI agent calls `epf_semantic_impact` with a change to a feature definition's JTBD narrative
- **THEN** the tool identifies semantically related nodes (other features with similar JTBDs, the value model components this feature contributes to, the personas it serves)
- **AND** returns an impact report scoped to the affected neighborhood
- **AND** the LLM evaluation processes only the relevant subset, not the full artifact set

### Requirement: Memory Source for Strategy Store

The system SHALL provide a `MemorySource` implementation of the `strategy.Source` interface that loads EPF artifacts from an emergent.memory knowledge graph instance.

The MemorySource SHALL:

- Accept configuration via `EPF_MEMORY_URL` and `EPF_MEMORY_TOKEN` environment variables
- Reconstruct EPF artifact structures from graph entities and relationships
- Return data in the same format as FileSystemSource and GitHubSource
- Degrade gracefully when emergent.memory is unavailable

#### Scenario: Query strategy from emergent.memory

- **WHEN** AI agent calls any strategy query MCP tool
- **AND** the strategy server is configured with MemorySource
- **THEN** the tool queries emergent.memory for the relevant graph entities
- **AND** returns structured strategy data identical to filesystem mode

#### Scenario: MemorySource with unavailable backend

- **WHEN** the strategy server is configured with MemorySource
- **AND** the emergent.memory instance is unreachable
- **THEN** the source returns a connection error
- **AND** does not panic or hang indefinitely (timeout within 5 seconds)

### Requirement: Instance Ingestion and Sync

The system SHALL provide ingestion and sync capabilities that maintain a semantic graph representation of an EPF instance in emergent.memory.

The ingestion SHALL:

- Decompose EPF YAML artifacts into section-level semantic nodes (not file-level)
- Generate vector embeddings for each semantic node
- Create structural edges from YAML field references (contributes_to, dependencies, assumptions)
- Compute semantic edges from embedding similarity (supports, contradicts, elaborates)
- Compute causal edges from EPF phase knowledge (informs, validates, invalidates)
- Support incremental sync triggered by file changes (only re-process changed sections)

#### Scenario: Full instance ingestion

- **WHEN** user runs `epf ingest` in an EPF instance directory
- **AND** emergent.memory is configured and reachable
- **THEN** the ingestion engine decomposes all artifacts into semantic nodes
- **AND** generates embeddings for each node
- **AND** creates structural, semantic, and causal edges
- **AND** reports node count, edge count, and ingestion time

#### Scenario: Incremental sync after file change

- **WHEN** a feature definition file is modified
- **AND** the instance has been previously ingested
- **THEN** the sync engine detects the changed sections by content hash
- **AND** re-embeds only the changed sections
- **AND** recomputes semantic edges for the affected neighborhood
- **AND** does not re-process unchanged artifacts
