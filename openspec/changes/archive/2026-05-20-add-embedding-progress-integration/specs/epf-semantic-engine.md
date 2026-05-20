# Delta: epf-semantic-engine

## ADDED Requirements

### Requirement: Embedding Progress Awareness

The system SHALL check embedding progress before operations that depend on
vector similarity, warning when embeddings are incomplete.

#### Scenario: Incomplete embeddings before semantic-edges

- **WHEN** `epf semantic-edges` is run
- **AND** the Memory project has <80% of objects embedded
- **THEN** a warning is emitted: "Embedding progress: {pct}% ({embedded}/{total} objects). Semantic edges may be incomplete."
- **AND** the command proceeds (does not block)
- **AND** the final summary includes a note about incomplete embeddings

#### Scenario: Severely incomplete embeddings

- **WHEN** `epf semantic-edges` is run
- **AND** the Memory project has <20% of objects embedded
- **THEN** a warning is emitted: "Only {pct}% of objects are embedded. Results will be unreliable. Wait for embeddings to propagate or re-run later."
- **AND** the command proceeds but the summary indicates results are unreliable

#### Scenario: Fully embedded

- **WHEN** `epf semantic-edges` is run
- **AND** the Memory project has ≥80% of objects embedded
- **THEN** no embedding warning is emitted
- **AND** the command proceeds normally

### Requirement: Wait for Embeddings

The system SHALL optionally wait for embedding completion after ingestion.

#### Scenario: Ingest with wait

- **WHEN** `epf ingest [path] --wait-for-embeddings` is run
- **THEN** after upsert completes, the system polls embedding progress every 5 seconds
- **AND** progress is displayed: "Embedding: {embedded}/{total} objects ({pct}%)..."
- **AND** the command exits when 100% embedded

#### Scenario: Wait timeout

- **WHEN** `epf ingest [path] --wait-for-embeddings --embed-timeout 300` is run
- **AND** embeddings are not complete within 300 seconds
- **THEN** a warning is emitted: "Embedding incomplete after timeout ({pct}% done). Run 'memory embeddings progress' to check status."
- **AND** the command exits with code 0 (timeout is not an error)

## MODIFIED Requirements

### Requirement: MCP Tool Integration

#### ADDED Scenario: Embedding progress in memory status

- **WHEN** `epf_memory_status` MCP tool is called
- **THEN** the response includes embedding progress for documents (chunks), objects, and relationships
- **AND** includes estimated time remaining if available

### Requirement: Graph Ingestion

#### ADDED Scenario: Post-ingest embedding status

- **WHEN** `epf ingest` or `epf sync` completes
- **THEN** the summary includes current embedding progress
- **AND** if <80% embedded, suggests: "Run 'epf semantic-edges' after embeddings propagate (~{estimate})."
