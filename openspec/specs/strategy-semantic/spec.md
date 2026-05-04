# Capability: strategy-semantic

Semantic graph integration via emergent.memory. Enables semantic search, graph traversal,
contradiction detection, and what-if scenario exploration.

---

## Requirements

### Requirement: Strategy Graph Ingestion

The system SHALL ingest committed strategy mutations into the emergent.memory graph,
keeping the semantic graph in sync with the PostgreSQL ledger.

#### Scenario: Ingest on commit
- **WHEN** a batch is committed
- **THEN** the newly committed artifacts are asynchronously ingested into emergent.memory
- **AND** ingestion failure does not roll back the commit
- **AND** ingestion errors are logged and retried

#### Scenario: Full re-ingest
- **WHEN** an admin triggers a full re-ingest for an instance
- **THEN** all current committed mutations are ingested (upsert semantics)
- **AND** the graph reflects the current state of the PostgreSQL ledger after completion

---

### Requirement: Semantic Search

The system SHALL proxy semantic search queries to emergent.memory and return ranked results.

#### Scenario: Natural language search
- **WHEN** a caller queries with a natural-language string (e.g., "features targeting growth")
- **THEN** the system returns results ranked by semantic similarity
- **AND** each result includes: artifact_type, artifact_key, snippet, relevance_score

#### Scenario: Limit results
- **WHEN** a caller specifies a `limit` parameter
- **THEN** at most `limit` results are returned

---

### Requirement: Graph Neighborhood

The system SHALL return the semantic graph neighborhood of a given strategy node.

#### Scenario: Get neighbors
- **WHEN** a caller requests neighbors for a node (e.g., feature fd-001)
- **THEN** the system returns connected nodes with edge types and directions
- **AND** orphaned or weakly connected nodes are flagged in the response

---

### Requirement: Contradiction Detection

The system SHALL detect structural contradictions within the strategy graph.

#### Scenario: Detect contradictions
- **WHEN** a caller requests a contradiction scan
- **THEN** the system queries emergent.memory for contradictions
- **AND** returns a list of contradiction descriptions with fix recommendations
- **AND** this is a read-only operation

---

### Requirement: What-If Scenario Exploration

The system SHALL support what-if scenario exploration via emergent.memory graph branching.

#### Scenario: Create scenario
- **WHEN** a caller provides a scenario description and optional anchor node
- **THEN** the system creates a graph branch in emergent.memory
- **AND** a scenario record is stored in PostgreSQL with `status='active'`
- **AND** a scenario ID is returned

#### Scenario: Evaluate scenario
- **WHEN** a caller requests scenario evaluation
- **THEN** the system runs the propagation circuit on the scenario branch
- **AND** returns: impact summary, affected nodes, propagation depth, confidence scores

#### Scenario: Commit scenario to main
- **WHEN** a caller commits a scenario
- **THEN** the scenario branch is merged into the main graph
- **AND** the scenario record in PostgreSQL transitions to `status='committed'`
- **AND** corresponding strategy mutations are staged for human review

#### Scenario: Discard scenario
- **WHEN** a caller discards a scenario
- **THEN** the graph branch is deleted from emergent.memory
- **AND** the scenario record transitions to `status='discarded'`
