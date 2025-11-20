# unified-search Specification

## Purpose
TBD - created by archiving change add-unified-hybrid-search-tests. Update Purpose after archive.
## Requirements
### Requirement: Unified Search Endpoint

The system SHALL provide a unified search endpoint that executes both graph object search and document chunk search in parallel and returns combined results with configurable fusion strategies.

**Implementation Status:** ✅ COMPLETED

**Files:**

- `apps/server/src/modules/unified-search/unified-search.controller.ts` - Controller with POST /search/unified endpoint
- `apps/server/src/modules/unified-search/unified-search.service.ts` - Service with parallel execution and fusion logic
- `apps/server/src/modules/unified-search/unified-search.module.ts` - NestJS module wiring
- `apps/server/src/modules/unified-search/dto/` - Request/response DTOs with validation
- `apps/server/tests/e2e/search.unified.e2e.spec.ts` - 15 E2E test scenarios

**Fusion Strategies Implemented:**

1. `weighted` - Score-based combination with configurable weights (default 0.5/0.5)
2. `rrf` - Reciprocal Rank Fusion (k=60, rank-based)
3. `interleave` - Alternates between graph and text results
4. `graph_first` - All graph results before text results
5. `text_first` - All text results before graph results

#### Scenario: Execute unified search with both result types

- **GIVEN** a user query "authentication patterns"
- **WHEN** the user calls `POST /search/unified` with the query
- **THEN** the system SHALL execute graph object hybrid search
- **AND** the system SHALL execute document chunk hybrid search
- **AND** both searches SHALL run in parallel for performance
- **AND** the response SHALL include combined results array with type discriminator
- **AND** the response SHALL include metadata with result counts and execution times

**Implementation:** ✅ Implemented in `UnifiedSearchService.search()`

- Uses `Promise.all()` for parallel execution
- Returns `UnifiedSearchResultItem[]` with `type: 'graph' | 'text'`
- Metadata includes `graphResultCount`, `textResultCount`, `executionTime` breakdown

#### Scenario: Apply fusion strategy to combine results

- **GIVEN** graph results and text results from parallel searches
- **WHEN** unified search applies fusion strategy
- **THEN** results SHALL be combined according to strategy
- **AND** `weighted` strategy SHALL multiply scores by normalized weights
- **AND** `rrf` strategy SHALL use reciprocal rank formula (1/(k+rank))
- **AND** `interleave` strategy SHALL alternate between result types
- **AND** combined results SHALL be limited by `limit` parameter

**Implementation:** ✅ Implemented in `UnifiedSearchService.fuseResults()`

- 5 fusion strategies with detailed inline documentation
- Configurable weights for `weighted` strategy (normalized to sum=1)
- RRF with k=60 (standard research value)
- Interleave preserves relative ranking within each type

#### Scenario: Include relationships in graph results

- **GIVEN** graph objects have relationships to other objects
- **WHEN** unified search returns graph results
- **AND** the request specifies `relationshipOptions.enabled: true`
- **THEN** each graph object SHALL include an array of relationships
- **AND** each relationship SHALL include type, sourceId, targetId, direction, and properties
- **AND** relationship expansion SHALL be limited by `maxNeighbors` parameter (default 5)
- **AND** relationship expansion SHALL respect `maxDepth` parameter (0-3, default 1)
- **AND** relationships SHALL be filtered by `direction` (in/out/both, default both)

**Implementation:** ✅ Implemented in `UnifiedSearchService.expandRelationships()`

- Calls `GraphService.expand()` with configurable depth and direction
- Builds relationship map from edges
- Includes bidirectional relationships (in + out)
- Applies maxNeighbors limit
- Handles errors gracefully (returns results without relationships on failure)

#### Scenario: Handle empty results gracefully

- **GIVEN** a query that matches no graph objects or text chunks
- **WHEN** unified search is executed
- **THEN** the response SHALL return empty array for `results`
- **AND** metadata SHALL indicate zero `totalResults`
- **AND** no error SHALL be thrown
- **AND** HTTP status SHALL be 200

**Implementation:** ✅ Implemented with proper empty handling

- Service returns empty arrays when no results found
- Metadata correctly reflects zero counts
- E2E test AT-US-14 validates empty results scenario

#### Scenario: Enforce result limits independently

- **GIVEN** request parameter `limit: 20`
- **WHEN** unified search is executed
- **THEN** total combined results SHALL not exceed `limit`
- **AND** limit SHALL be enforced after fusion (not per-search)
- **AND** limit validation SHALL reject values <1 or >100

**Implementation:** ✅ Implemented with validation

- DTOs enforce limit constraints (1-100, default 20)
- Fusion strategies apply limit after combining results
- E2E test AT-US-10 validates limit enforcement
- E2E test AT-US-13 validates limit constraint validation

### Requirement: Relationship Expansion

Graph objects in unified search results SHALL include expanded relationship information when requested.

**Implementation Status:** ✅ COMPLETED

**Key Features:**

- Calls `GraphService.expand()` for relationship traversal
- Supports depth 0-3 (default 1)
- Supports directional filtering: in, out, both (default both)
- Limits neighbors per result (max 20, default 5)
- Returns relationship metadata (type, source, target, properties, direction)

#### Scenario: Expand outgoing relationships

- **GIVEN** a graph object with outgoing relationships (e.g., Decision depends_on Requirement)
- **WHEN** unified search returns that object with `includeRelationships: true`
- **THEN** the object's `relationships` array SHALL include outgoing relationships
- **AND** each relationship SHALL include target object fields (title, type, key)
- **AND** relationship metadata SHALL include relationship type and direction

#### Scenario: Limit relationship expansion depth

- **GIVEN** graph objects with multi-hop relationship chains
- **WHEN** unified search includes relationships
- **THEN** only direct (1-hop) relationships SHALL be included
- **AND** transitive relationships SHALL NOT be expanded automatically
- **AND** clients MAY call `/graph/traverse` for deeper expansion

#### Scenario: Filter relationships by type

- **GIVEN** request parameter `relationshipTypes: ["depends_on", "implements"]`
- **WHEN** unified search expands relationships
- **THEN** only relationships matching the specified types SHALL be included
- **AND** other relationship types SHALL be excluded

### Requirement: Result Scoring and Ranking

Unified search results SHALL preserve individual scoring from each search mode while providing combined metadata.

#### Scenario: Preserve search scores

- **GIVEN** graph search assigns scores to objects based on hybrid search
- **AND** text search assigns scores to chunks based on hybrid search
- **WHEN** unified search returns results
- **THEN** each graph object SHALL include its hybrid search score (0.0-1.0)
- **AND** each text chunk SHALL include its hybrid search score (0.0-1.0)
- **AND** scores SHALL NOT be normalized across result types

#### Scenario: Include search metadata

- **GIVEN** graph search and text search produce metadata (mode, lexical_score, vector_score)
- **WHEN** unified search returns results
- **THEN** `graphResults.meta` SHALL include graph search metadata
- **AND** `textResults.meta` SHALL include text search metadata
- **AND** top-level `meta` SHALL include combined query_time_ms and total_results

### Requirement: Authentication and Authorization

Unified search SHALL enforce the same scope-based authorization as individual search endpoints.

#### Scenario: Require search:read scope

- **GIVEN** a user without `search:read` scope
- **WHEN** the user calls `POST /search/unified`
- **THEN** the request SHALL be rejected with 403 Forbidden
- **AND** the response SHALL include missing scope information

#### Scenario: Apply RLS tenant context

- **GIVEN** an authenticated user with org_id and project_id context
- **WHEN** unified search executes
- **THEN** graph search SHALL filter objects by tenant context (RLS)
- **AND** text search SHALL filter chunks by tenant context (RLS)
- **AND** results SHALL only include data accessible to the user

### Requirement: Performance and Error Handling

Unified search SHALL optimize for performance and handle partial failures gracefully.

#### Scenario: Execute searches in parallel

- **GIVEN** unified search is called
- **WHEN** both graph and text searches are executed
- **THEN** searches SHALL run concurrently (Promise.all)
- **AND** total query time SHALL not exceed sum of individual search times
- **AND** query_time_ms SHALL reflect wall-clock time, not sum

#### Scenario: Handle partial search failures

- **GIVEN** text search succeeds but graph search fails (e.g., timeout)
- **WHEN** unified search is executed
- **THEN** the response SHALL include successful text results
- **AND** `graphResults.objects` SHALL be empty
- **AND** metadata SHALL include a warning about graph search failure
- **AND** HTTP status SHALL be 200 (partial success)

#### Scenario: Apply performance timeouts

- **GIVEN** unified search is configured with a 5-second timeout
- **WHEN** either search exceeds the timeout
- **THEN** that search SHALL be cancelled
- **AND** the response SHALL include results from the faster search
- **AND** metadata SHALL include a timeout warning

### Requirement: Request and Response Schema

Unified search SHALL accept structured request parameters and return a well-defined JSON schema.

#### Scenario: Validate request parameters

- **GIVEN** a request with invalid parameters (e.g., graphLimit: -1)
- **WHEN** the request is processed
- **THEN** validation SHALL fail before executing searches
- **AND** the response SHALL be 400 Bad Request
- **AND** the error SHALL include parameter validation details

#### Scenario: Return consistent response structure

- **GIVEN** any valid unified search request
- **WHEN** the search completes successfully
- **THEN** the response SHALL always include `query`, `graphResults`, `textResults`, and `meta` fields
- **AND** null fields SHALL be represented as empty arrays or null values
- **AND** the schema SHALL match OpenAPI specification exactly

