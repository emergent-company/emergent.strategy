## ADDED Requirements

### Requirement: Source Authority Over Graph Data

The system SHALL be the authoritative source for the strategy data it projects
into emergent.memory. Structured reads from PostgreSQL SHALL be the only basis
for writes to strategy data; results read from Memory SHALL only rank, suggest
or classify. The system SHALL write, update and delete only graph objects it
owns, and SHALL NOT modify any graph object it did not write.

#### Scenario: Memory result does not write strategy data
- **WHEN** any tool or background process reads results from Memory
- **THEN** no strategy artifact, relationship or mutation in PostgreSQL is
  created or changed from those results without passing through the normal
  mutation path

#### Scenario: Foreign objects are left untouched
- **WHEN** the ingest for an instance runs and the Memory project contains
  objects written by Memory itself or by another writer that relate to the
  instance's objects
- **THEN** the ingest neither updates nor deletes those objects

---

### Requirement: Recorded Source Revision of Projected Objects

The system SHALL record, for every graph object in an instance's current
projection, the `source_revision` it represents (a hash of the artifact's
canonical payload, changing only when its content changes) and a
`revision_seq` that increases monotonically per instance. The system SHALL NOT
write provenance as graph object properties.

#### Scenario: Artifact object revision is recorded
- **WHEN** an instance is ingested
- **THEN** the projection records, for each artifact-layer object, a
  `source_revision` equal to the hash of the artifact's canonical payload

#### Scenario: No provenance properties
- **WHEN** an instance is ingested
- **THEN** no object written to Memory carries a property holding source,
  schema version, layer or revision

#### Scenario: Decomposed object takes its parent's revision
- **WHEN** an artifact is decomposed into objects during ingest
- **THEN** the projection records the parent artifact's `source_revision`
  for each decomposed object

#### Scenario: Revisions are ordered
- **WHEN** an instance is ingested twice with a content change in between
- **THEN** the second ingest records a higher `revision_seq` than the first

#### Scenario: Identical content keeps its revision
- **WHEN** an artifact is re-committed, imported or restored with a payload
  identical to the current one
- **THEN** its `source_revision` is unchanged
- **AND** the next ingest creates no new Memory version for its objects

---

### Requirement: Labelled and Anchored Synthesized Results

Semantic reads SHALL return only source data by default. When a caller
explicitly requests synthesized data, the system MAY additionally return graph
objects written by Memory or its agents, but only when every object they
relate to is owned by the requested instance and belongs to its current
projection. Every result SHALL carry a `class` of `source` or `synthesized`.

#### Scenario: Default read excludes synthesis
- **WHEN** `search_strategy` is called without `include_synthesized`
- **THEN** every result is in the instance's current projection
- **AND** every result has `class: source`

#### Scenario: Anchored synthesis is returned on request
- **WHEN** `search_strategy` is called with `include_synthesized: true`
- **AND** Memory holds an inferred object related only to objects in the
  instance's current projection
- **THEN** that object may be returned with `class: synthesized`

#### Scenario: Cross-instance synthesis is excluded
- **WHEN** a synthesized object relates to objects of two different instances
- **THEN** it is not returned for either instance, with or without
  `include_synthesized`

#### Scenario: Synthesis is not presented as strategy
- **WHEN** a client reads the `search_strategy` or `get_neighbors` tool
  description
- **THEN** it states that `synthesized` results are Memory's inference and not
  the organisation's recorded strategy

#### Scenario: Guessed relations are labelled as synthesis
- **WHEN** a semantic read returns a relation whose ontology provenance is
  `inferred` or `embedding`
- **THEN** the relation has `class: synthesized`, even though
  strategy-server's decomposer produced it
