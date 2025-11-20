# database-access Specification Delta

## ADDED Requirements

### Requirement: Hybrid Search Quality Tests

The test suite SHALL validate hybrid search quality with deterministic fixtures and quality metrics.

#### Scenario: Hybrid search outperforms single-mode search

- **GIVEN** test documents with both strong lexical signals (repeated terms) and semantic signals (embedded concepts)
- **WHEN** the same query is executed in lexical, vector, and hybrid modes
- **THEN** hybrid mode SHALL return the most relevant document first
- **AND** hybrid mode SHALL have higher average relevance than lexical-only
- **AND** hybrid mode SHALL have higher average relevance than vector-only

#### Scenario: Validate hybrid search response structure

- **GIVEN** a hybrid search query
- **WHEN** results are returned
- **THEN** each result SHALL include `id`, `snippet`, `score`, and `source` fields
- **AND** `mode` SHALL be "hybrid" (or "lexical" if embeddings disabled)
- **AND** scores SHALL be normalized between 0.0 and 1.0
- **AND** results SHALL be ordered by descending score

#### Scenario: Measure hybrid search performance

- **GIVEN** a test dataset of 50 documents
- **WHEN** hybrid search is executed with limit=10
- **THEN** query completion time SHALL be less than 500ms
- **AND** response SHALL include query_time_ms metadata
- **AND** performance SHALL be consistent across repeated queries

### Requirement: Graph Search with Relationships Tests

The test suite SHALL validate graph search returns objects with relationships correctly.

#### Scenario: Graph search returns relevant objects

- **GIVEN** a test graph with typed objects (Decision, Requirement, Issue)
- **AND** objects have properties matching search queries
- **WHEN** graph hybrid search is executed
- **THEN** matching objects SHALL be returned with correct types
- **AND** results SHALL include object properties in `fields`
- **AND** results SHALL be ranked by hybrid search score

#### Scenario: Traverse retrieves multi-hop relationships

- **GIVEN** a graph with object chain A → B → C (depends_on relationships)
- **WHEN** `/graph/traverse` is called with root_ids=[A] and max_depth=2
- **THEN** nodes SHALL include objects A, B, and C
- **AND** edges SHALL include both A→B and B→C relationships
- **AND** relationship metadata SHALL include type and direction

#### Scenario: Expand includes relationship properties

- **GIVEN** relationships with custom properties (weight, confidence)
- **WHEN** `/graph/expand` is called with `include_relationship_properties: true`
- **THEN** returned edges SHALL include relationship property objects
- **AND** properties SHALL match stored relationship metadata

#### Scenario: Search-with-neighbors combines search and expansion

- **GIVEN** graph objects with semantic similarity and direct relationships
- **WHEN** `/graph/search-with-neighbors` is called with `includeNeighbors: true`
- **THEN** `primaryResults` SHALL include objects matching search query
- **AND** `neighbors` map SHALL include related objects for each primary result
- **AND** neighbors SHALL be limited by `maxNeighbors` parameter

### Requirement: Context Quality Validation

Tests SHALL verify that search results provide adequate context for AI and human consumption.

#### Scenario: Validate snippet relevance

- **GIVEN** a search query with specific terms
- **WHEN** text search returns results
- **THEN** snippet SHALL contain query terms (for lexical/hybrid mode)
- **AND** snippet SHALL be 200-500 characters (human-readable length)
- **AND** snippet SHALL include surrounding context, not just isolated terms

#### Scenario: Verify graph object completeness

- **GIVEN** graph objects with multiple properties (title, description, status)
- **WHEN** graph search returns objects
- **THEN** `fields` SHALL include all non-null object properties
- **AND** properties SHALL match database values exactly
- **AND** no critical fields SHALL be omitted

#### Scenario: Validate relationship context

- **GIVEN** objects with relationships to other typed entities
- **WHEN** relationships are expanded
- **THEN** target objects SHALL include sufficient fields for display (at minimum: id, type, key/title)
- **AND** relationship type SHALL be human-readable (e.g., "depends_on" not "REL_001")
