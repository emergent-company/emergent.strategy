## ADDED Requirements

### Requirement: Canonical Graph Type Contract

The object and relationship types the decomposer produces SHALL be loaded from
the canonical ontology registry embedded in the binary. Presentation fields and
object properties MAY be defined in Go, keyed by type name.

#### Scenario: Types come from the registry

- **WHEN** the server lists graph object and relationship types
- **THEN** their names, descriptions, inertia tiers and endpoint types equal
  those in the embedded `ontology/epf_ontology.yaml`

#### Scenario: Layer is part of the contract

- **WHEN** the server lists graph object and relationship types
- **THEN** each type carries the layer declared in the registry

#### Scenario: Presentation overlay is complete

- **WHEN** the test suite runs
- **THEN** it fails if a registry type has no presentation entry, or a
  presentation entry names no registry type

### Requirement: Decomposition Conforms to the Ontology

Every object and edge the decomposer emits SHALL have a type declared in the
registry, and every edge's endpoint types SHALL be among the relation's
declared `from` and `to` types.

#### Scenario: Conformance on test instances

- **WHEN** the decomposer runs on every test instance
- **THEN** no object type, edge type or edge endpoint falls outside the
  registry

#### Scenario: Undeclared edge type

- **GIVEN** an edge-building function that emits a relation not in the registry
- **WHEN** the conformance test runs
- **THEN** it fails and names the relation

### Requirement: Single Memory Schema Source

The emergent.memory schema pack SHALL be generated from the registry, and the
committed blueprint pack SHALL equal the generated one.

#### Scenario: Committed pack drifts

- **GIVEN** a committed pack missing a relation type the registry declares
- **WHEN** the test suite runs
- **THEN** the pack comparison test fails

#### Scenario: Schema installed when absent

- **GIVEN** Memory is configured and the project has no EPF schema installed
- **WHEN** the server starts
- **THEN** it installs the generated pack

### Requirement: Edge Provenance

Every edge written to the graph SHALL carry a `provenance` property taken from
the registry for its relation type. Existing `edge_source` and weight values
SHALL NOT change.

#### Scenario: Guessed edge labelled

- **WHEN** the decomposer creates a `competes_with` edge from a name match
- **THEN** the edge has `provenance: inferred`
- **AND** its `edge_source` and `weight` are the same as before this change

#### Scenario: Stored edge labelled

- **WHEN** the decomposer creates a `contributes_to` edge from a feature's field
- **THEN** the edge has `provenance: explicit`

### Requirement: Provenance in Graph Reads

Graph neighborhood and contradiction detection responses SHALL include each
edge's provenance, reporting `unknown` for edges ingested before provenance
existed.

#### Scenario: Neighborhood shows provenance

- **WHEN** a caller requests neighbors of a feature
- **THEN** each returned edge includes `provenance`
