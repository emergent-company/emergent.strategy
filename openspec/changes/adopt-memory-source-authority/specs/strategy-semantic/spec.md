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

### Requirement: Source Descriptor and Revision on Projected Objects

Every graph object the system writes SHALL carry `properties.source`
(`strategy-server`), `properties.source_schema` (the schema version it was
produced under), `properties.layer` (its type's layer, once the ontology
registry is embedded) and `properties.source_revision` (a hash of the
artifact's canonical payload, changing only when its content changes).

#### Scenario: Artifact object carries its revision
- **WHEN** an instance is ingested
- **THEN** each artifact-layer object carries `source`, `source_schema` and a
  `source_revision` equal to the hash of the artifact's canonical payload

#### Scenario: Schema and layer come from the ontology
- **WHEN** an instance is ingested with the ontology registry embedded
- **THEN** `source_schema` equals the registry's `ontology_version`
- **AND** `layer` equals the registry's layer for the object's type

#### Scenario: Decomposed object carries its parent's revision
- **WHEN** an artifact is decomposed into objects during ingest
- **THEN** each decomposed object carries the parent artifact's
  `source_revision`

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
- **THEN** no result lacks `source = strategy-server`
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
