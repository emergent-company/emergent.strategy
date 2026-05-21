## MODIFIED Requirements

### Requirement: Graph Ingestion

The system SHALL ingest committed strategy artifacts into the Memory semantic graph
asynchronously after each batch commit.

Ingestion SHALL use Memory's `CreateSubgraph()` API for bulk operations when
committing batches of 2 or more mutations, falling back to individual `UpsertObject()`
calls for single-mutation batches or when bulk ingestion fails.

The system SHALL support full re-ingestion of all artifacts for an instance, including
the decomposed layer (sub-entity objects extracted from YAML artifacts).

Ingestion failures SHALL NOT block or roll back commits. Failures SHALL be logged and
retried with exponential backoff (3 attempts at 5s, 15s, 60s intervals).

#### Scenario: Bulk batch ingestion

- **WHEN** a batch of 5 mutations is committed
- **THEN** the ingest pipeline sends a single `CreateSubgraph()` call containing all
  5 objects and their relationships to Memory
- **AND** sync counts are updated for the instance

#### Scenario: Bulk ingestion failure fallback

- **WHEN** `CreateSubgraph()` fails for a batch
- **THEN** the pipeline retries with per-object `UpsertObject()` calls
- **AND** logs a warning about the bulk failure

#### Scenario: Single mutation uses direct upsert

- **WHEN** a batch of 1 mutation is committed
- **THEN** the ingest pipeline uses `UpsertObject()` directly (no subgraph overhead)

#### Scenario: Full re-ingest

- **WHEN** a full re-ingest is triggered for an instance
- **THEN** all non-archived artifacts are upserted to Memory
- **AND** all relationships are re-created
- **AND** the decomposed layer is regenerated

### Requirement: Semantic Search

The system SHALL provide natural language search across the strategy graph, returning
ranked results by relevance score.

Search results SHALL include strategy artifacts of all types, including evidence
artifacts when they exist in the graph.

#### Scenario: Search returns evidence alongside strategy

- **WHEN** an agent calls `search_strategy` with a query like "user retention metrics"
- **AND** evidence artifacts related to retention have been ingested
- **THEN** the results include both strategy artifacts (features, assumptions) and
  evidence artifacts, ranked by relevance

#### Scenario: Search without evidence (backward compatible)

- **WHEN** no evidence artifacts exist in the graph
- **THEN** search returns only strategy artifacts (existing behavior unchanged)

## ADDED Requirements

### Requirement: Evidence Graph Integration

The system SHALL push ingested evidence objects to the Memory semantic graph with
appropriate type labels, tags, and relationship edges.

Evidence objects SHALL be searchable via the same `search_strategy` tool as other
strategy artifacts.

Evidence objects SHALL be linked to related strategy artifacts via relationship edges
created through the `link_evidence` tool or at ingest time via `linked_artifacts`
(e.g., evidence about a metric linked to the KR it measures, evidence about an
assumption linked to that assumption).

#### Scenario: Evidence ingested to Memory

- **WHEN** evidence is ingested via `ingest_evidence`
- **AND** Memory is configured and reachable
- **THEN** the evidence is stored as a Memory object with type "evidence" and
  properties including tags, source name, source type, and collected_at timestamp
- **AND** the object is available for semantic search

#### Scenario: Evidence with linked artifact relationship

- **WHEN** evidence is ingested with `linked_artifacts` containing "asm-001"
- **OR** an agent calls `link_evidence` to link evidence to assumption "asm-001"
- **THEN** a relationship edge is created between the evidence object and the
  assumption object in Memory
- **AND** the relationship type reflects the semantic link (e.g., "supports",
  "contradicts", "measures")

#### Scenario: Evidence ingestion without Memory

- **WHEN** evidence is ingested but Memory is unavailable
- **THEN** the evidence is stored in Postgres (strategy_artifacts table)
- **AND** Memory ingestion is retried on subsequent ingest pipeline runs
