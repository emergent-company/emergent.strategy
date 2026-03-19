## MODIFIED Requirements

### Requirement: MCP Tool Integration

The system SHALL expose semantic engine capabilities as MCP tools.

#### Scenario: Semantic search

- **WHEN** `epf_semantic_search` is called with a query
- **THEN** it returns scored results from the Memory graph

#### Scenario: Semantic neighbors

- **WHEN** `epf_semantic_neighbors` is called with a node key
- **THEN** it returns all connected nodes with edge types and weights

#### Scenario: Semantic neighbors with quality hints

- **WHEN** `epf_semantic_neighbors` is called with a node key
- **AND** the node has zero outgoing connections
- **THEN** the response includes a `quality_hint` field explaining the disconnection and suggesting how to add references

#### Scenario: Semantic impact

- **WHEN** `epf_semantic_impact` is called with a node key and description
- **THEN** it runs the propagation circuit and returns the cascade trace

#### Scenario: Contradictions with fix instructions

- **WHEN** `epf_contradictions` is called
- **AND** status conflicts are found
- **THEN** each contradiction includes a `fix_with` object specifying the tool name and parameters needed to resolve it

#### Scenario: Memory status check

- **WHEN** `epf_memory_status` is called
- **THEN** it reports whether `EPF_MEMORY_URL`, `EPF_MEMORY_PROJECT`, and `EPF_MEMORY_TOKEN` are configured
- **AND** if configured, it queries Memory for the current object count
- **AND** it recommends `epf-cli ingest` (if no objects) or `epf-cli sync` (if objects exist) as the next step

#### Scenario: Memory status when not configured

- **WHEN** `epf_memory_status` is called
- **AND** Memory env vars are not set
- **THEN** it returns a structured response listing the required env vars and setup instructions

## ADDED Requirements

### Requirement: Structured Graph Queries

The system SHALL expose deterministic graph queries via the `epf_graph_list` MCP tool, enabling agents to list objects by type and filter by properties without relying on embedding-based search.

#### Scenario: List objects by type

- **WHEN** `epf_graph_list` is called with `type=Feature`
- **THEN** it returns all Feature objects from the Memory graph with their key, name, status, and properties

#### Scenario: List objects by type with filter

- **WHEN** `epf_graph_list` is called with `type=Feature` and `filter=status=delivered`
- **THEN** it returns only Feature objects where status equals "delivered"

#### Scenario: List objects by type with limit

- **WHEN** `epf_graph_list` is called with `type=Scenario` and `limit=10`
- **THEN** it returns at most 10 Scenario objects

#### Scenario: List objects with feature reference filter

- **WHEN** `epf_graph_list` is called with `type=Scenario` and `filter=feature_ref=fd-009`
- **THEN** it returns only Scenario objects associated with feature fd-009

#### Scenario: Memory not configured

- **WHEN** `epf_graph_list` is called
- **AND** Memory env vars are not set
- **THEN** it returns a structured error with setup instructions

### Requirement: Object Similarity Search

The system SHALL expose embedding-ranked similarity search via the `epf_graph_similar` MCP tool, enabling agents to find semantically related objects across types.

#### Scenario: Find similar objects

- **WHEN** `epf_graph_similar` is called with an object key (e.g., `Feature:feature:fd-001`)
- **THEN** it returns objects ranked by embedding similarity with scores

#### Scenario: Find similar objects with type filter

- **WHEN** `epf_graph_similar` is called with an object key and `type=Feature`
- **THEN** it returns only Feature objects ranked by similarity

#### Scenario: Find similar objects with minimum score

- **WHEN** `epf_graph_similar` is called with `min_score=0.7`
- **THEN** it returns only objects with similarity score >= 0.7

#### Scenario: Memory not configured

- **WHEN** `epf_graph_similar` is called
- **AND** Memory env vars are not set
- **THEN** it returns a structured error with setup instructions

### Requirement: Quality Audit

The system SHALL provide a combined quality audit via the `epf_quality_audit` MCP tool that runs multiple graph-based checks and returns categorized findings with actionable fix instructions.

#### Scenario: Full quality audit

- **WHEN** `epf_quality_audit` is called with an instance path
- **THEN** it runs contradiction detection, generic content detection (cross-similarity > 0.80), and disconnected node detection in parallel
- **AND** returns findings categorized by type (contradictions, generic_content, disconnected_nodes)
- **AND** each finding includes a `fix_with` object specifying the tool and parameters needed to resolve it

#### Scenario: Contradiction findings

- **WHEN** the audit detects status contradictions (e.g., delivered feature with hypothetical capabilities)
- **THEN** each finding includes `fix_with: {tool: "epf_update_capability_maturity", params: {feature_id, capability_id, maturity}}`

#### Scenario: Generic content findings

- **WHEN** the audit detects L2 UVPs with cross-similarity > 0.80
- **THEN** findings include the similar UVP pairs with scores and a recommendation to rewrite with product-specific language

#### Scenario: Disconnected node findings

- **WHEN** the audit detects nodes with zero outgoing edges (e.g., Beliefs or Trends not connected to Features)
- **THEN** findings include the disconnected nodes and a recommendation to add references in feature definitions

#### Scenario: Memory not configured

- **WHEN** `epf_quality_audit` is called
- **AND** Memory env vars are not set
- **THEN** it returns a structured error with setup instructions

### Requirement: Per-Feature Enrichment Suggestions

The system SHALL provide per-feature enrichment suggestions via the `epf_suggest_enrichment` MCP tool, using graph signals to identify missing content, contradictions, weak UVPs, and potential dependency relationships.

#### Scenario: Feature enrichment report

- **WHEN** `epf_suggest_enrichment` is called with a feature ID
- **THEN** it returns a structured report covering:
  - Missing fields (e.g., value_propositions with 0 persona coverage)
  - Capability maturity contradictions (e.g., delivered feature with hypothetical capabilities)
  - Weak UVPs (contributes_to paths with generic descriptions, cross-similarity > 0.80)
  - Suggested dependencies based on semantic similarity to other features

#### Scenario: Suggested dependencies from similarity

- **WHEN** `epf_suggest_enrichment` identifies features with similarity > 0.70 to the target feature
- **THEN** it suggests `dependencies.requires` or `dependencies.enables` relationships with the similar features and their scores

#### Scenario: Feature not found

- **WHEN** `epf_suggest_enrichment` is called with a feature ID that does not exist in the graph
- **THEN** it returns a clear error indicating the feature was not found and suggesting `epf-cli ingest` if the graph may be stale

#### Scenario: Memory not configured

- **WHEN** `epf_suggest_enrichment` is called
- **AND** Memory env vars are not set
- **THEN** it returns a structured error with setup instructions

### Requirement: Memory Workflow Discoverability

The system SHALL proactively surface Memory integration workflow guidance to AI agents through existing instruction channels.

#### Scenario: Agent instructions with Memory configured

- **WHEN** `epf_agent_instructions` is called
- **AND** `EPF_MEMORY_URL`, `EPF_MEMORY_PROJECT`, and `EPF_MEMORY_TOKEN` are configured
- **THEN** the response includes a Memory Integration section documenting `epf-cli ingest`, `epf-cli sync`, and `epf-cli semantic-edges` commands
- **AND** explicitly warns against manually creating entities via Memory MCP tools

#### Scenario: Agent instructions without Memory configured

- **WHEN** `epf_agent_instructions` is called
- **AND** Memory env vars are not set
- **THEN** the response does not include the Memory Integration section
