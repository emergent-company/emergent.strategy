## ADDED Requirements

### Requirement: Declarative Schema Reconciliation

The system SHALL declaratively reconcile the Memory project's schema to match the decomposer's type definitions at the start of every ingest and sync operation. The decomposer code is the single source of truth for EPF graph types — there is no separate schema file to maintain.

#### Scenario: Missing types created during ingest

- **WHEN** `epf-cli ingest` connects to a Memory project
- **AND** the project is missing object or relationship types that the decomposer produces
- **THEN** the system creates the missing types in the Memory project
- **AND** logs which types were created

#### Scenario: All types already present

- **WHEN** `epf-cli ingest` connects to a Memory project
- **AND** all decomposer types already exist in the project
- **THEN** the system continues silently without schema changes

#### Scenario: Reconciliation is additive only

- **WHEN** the reconciliation runs
- **THEN** it NEVER removes types from the Memory project
- **AND** non-EPF types created by other tools are left unchanged

#### Scenario: Reconciliation during sync

- **WHEN** `epf-cli sync` connects to a Memory project
- **THEN** the same reconciliation logic runs as during ingest

#### Scenario: Reconciliation API unavailable

- **WHEN** the Memory API does not support type management endpoints
- **THEN** the system logs a warning and continues without reconciliation
- **AND** does not fail the ingest/sync operation

#### Scenario: Type definitions co-located with extraction code

- **WHEN** the decomposer defines a new object type or relationship type
- **THEN** the type definition (name, description, properties) lives in the same Go package as the extraction code
- **AND** no separate schema JSON file needs to be maintained

### Requirement: Reconciliation Status Reporting

The `epf_memory_status` MCP tool SHALL report reconciliation status alongside ingestion status.

#### Scenario: Reconciliation status reported

- **WHEN** `epf_memory_status` is called
- **AND** Memory is configured and accessible
- **THEN** the response includes the count of EPF types present in the project
- **AND** the count of types the decomposer expects
- **AND** a list of any missing types

### Requirement: IntegrationPoint Extraction

The decomposer SHALL extract `IntegrationPoint` objects from roadmap `integration_points[]` with appropriate properties and containment relationships.

#### Scenario: Integration points in roadmap

- **WHEN** the roadmap recipe contains `integration_points[]`
- **THEN** the decomposer creates `IntegrationPoint` objects with name, description, and priority
- **AND** creates `contains` edges from the Artifact node
- **AND** creates `unlocks` edges to Features referenced by the integration point

### Requirement: Constraint Extraction

The decomposer SHALL extract `Constraint` objects from feature `constraints[]` and roadmap `technical_constraints[]`.

#### Scenario: Constraints in feature definitions

- **WHEN** a feature definition contains `constraints[]`
- **THEN** the decomposer creates `Constraint` objects with description and type
- **AND** creates `constrains` edges from Constraint to Feature

#### Scenario: Technical constraints in roadmap

- **WHEN** the roadmap recipe contains `technical_constraints[]`
- **THEN** the decomposer creates `Constraint` objects
- **AND** creates `contains` edges from the Artifact node

### Requirement: Opportunity Extraction

The decomposer SHALL extract `Opportunity` objects from insight analyses `opportunities[]`.

#### Scenario: Opportunities in insight analyses

- **WHEN** the insight analyses artifact contains `opportunities[]`
- **THEN** the decomposer creates `Opportunity` objects with description, timeframe, and size
- **AND** creates `contains` edges from the Artifact node
- **AND** creates `addresses` edges to Features that reference the opportunity

### Requirement: CrossTrackDependency Extraction

The decomposer SHALL extract `CrossTrackDependency` objects from roadmap `cross_track_dependencies[]`.

#### Scenario: Cross-track dependencies in roadmap

- **WHEN** the roadmap recipe contains `cross_track_dependencies[]`
- **THEN** the decomposer creates `CrossTrackDependency` objects with from_kr, to_kr, dependency_type, and description
- **AND** creates `converges_at` edges to the referenced KR objects

### Requirement: Structural Relationship Inference

The decomposer SHALL create structural relationships that can be inferred from explicit YAML references, complementing the semantic edges created by `semantic-edges`.

#### Scenario: informs (Belief → Positioning)

- **WHEN** the graph contains both Belief and Positioning nodes
- **THEN** the decomposer creates `informs` edges from Belief nodes to Positioning nodes
- **AND** edges are weighted based on the thematic relationship between belief category and positioning domain

#### Scenario: constrains (Assumption → Feature)

- **WHEN** a Feature has `assumptions_tested[]` references
- **THEN** the decomposer creates `constrains` edges from the referenced Assumptions to the Feature
- **AND** this is the bidirectional complement of the existing `tests_assumption` edge

#### Scenario: delivers (OKR → Feature)

- **WHEN** a roadmap KR references a feature via `linked_to_kr`, feature ID in description, or `delivers` field
- **THEN** the decomposer creates `delivers` edges from the OKR to the referenced Feature

#### Scenario: validates (Capability → Assumption)

- **WHEN** a Capability has maturity `proven` or `scaled`
- **AND** the parent Feature has `assumptions_tested[]`
- **THEN** the decomposer creates `validates` edges from the Capability to the tested Assumptions
- **AND** includes the capability's evidence text as edge metadata

#### Scenario: shared_technology (Feature → Feature)

- **WHEN** two or more Features share `contributes_to` paths to the same ValueModelComponent
- **THEN** the decomposer creates bidirectional `shared_technology` edges between those Features
- **AND** each edge includes the shared component path as metadata

## MODIFIED Requirements

### Requirement: Decomposer Object Types

The decomposer SHALL produce objects for all structurally-extractable types defined in the epf-engine schema.

Previously produced 10 types. Now produces 14 types:
- Existing: `Artifact`, `Belief`, `Trend`, `Persona`, `PainPoint`, `Positioning`, `OKR`, `Assumption`, `ValueModelComponent`, `Feature`, `Scenario`, `Capability`
- Added: `IntegrationPoint`, `Constraint`, `Opportunity`, `CrossTrackDependency`

#### Scenario: Full decomposition produces all 14 types

- **WHEN** `DecomposeInstance()` runs on an EPF instance containing all artifact types
- **THEN** the result contains objects of all 14 types listed above
- **AND** each object has a stable key, inertia tier, source artifact, and section path

#### Scenario: Missing YAML sections produce no objects

- **WHEN** an EPF instance does not contain `integration_points[]`, `constraints[]`, `opportunities[]`, or `cross_track_dependencies[]`
- **THEN** the decomposer silently skips those types without errors

### Requirement: Decomposer Relationship Types

The decomposer SHALL produce all structural relationships that can be inferred from explicit YAML references.

Previously produced 8 types. Now produces 16 structural types:
- Existing: `contains`, `contributes_to`, `tests_assumption`, `depends_on`, `targets`, `serves`, `elaborates`
- Added: `informs`, `constrains`, `delivers`, `validates`, `shared_technology`, `addresses`, `converges_at`, `unlocks`

Semantic-only types remain in `semantic-edges`: `supports`, `contradicts`, `parallels`, `invalidates`

#### Scenario: Full decomposition produces structural relationships

- **WHEN** `DecomposeInstance()` runs on an EPF instance with cross-references
- **THEN** all 16 structural relationship types are produced where the source data supports them
- **AND** each relationship has a stable from/to key, type, edge source, and optional weight

#### Scenario: Semantic-only relationships not produced by decomposer

- **WHEN** `DecomposeInstance()` runs
- **THEN** the result does NOT contain `supports`, `contradicts`, `parallels`, or `invalidates` relationships
- **AND** those remain the responsibility of `semantic-edges`
