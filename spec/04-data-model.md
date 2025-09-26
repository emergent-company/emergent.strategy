# Data Model

## Core Entities
- Organization
  - id, name, slug, created_at, updated_at, deleted_at
  - owners[] (derived from Memberships where role=Owner)
- Project
  - id, organization_id, name, slug, created_at, updated_at, deleted_at
  - settings (jsonb), labels[]
- Membership (Org level)
  - id, organization_id, user_id, role (Owner|Admin|Member|Viewer), created_at, updated_at
- ProjectMembership
  - id, project_id, user_id, role (Admin|Contributor|Viewer), created_at, updated_at
- Document
  - id, tenant_id, organization_id, project_id, source (jira, github, drive, upload, etc.)
  - uri/origin, title, mime_type, checksum, size_bytes
  - created_at, captured_at, updated_at, deleted_at
  - authors[], access_scope, labels[]
- Chunk
  - id, document_id, ordinal, text, token_count
  - embedding (vector), section_path (e.g., H1/H2 trail), page/slide indices
  - citations (links, anchors), language, quality_score
- Entity
  - id, type (Person, Team, Feature, Requirement, Decision, Ticket, Meeting)
  - canonical_name, aliases[], properties (kv)
- Relation
  - id, type (references, elaborates, duplicates, supersedes, decides, owns)
  - src_entity_id, dst_entity_id, weight, evidence_chunk_ids[]
- Provenance
  - id, subject_type (document|chunk|entity|relation), subject_id
  - source_uri, processor_versions, timestamps, hash_chain

## Indexes
- Vector index on Chunk.embedding (cosine or ip).
- FTS index on Chunk.text and Document.title.
- Graph indexes on Entity.type/name and Relation.type.

## Retention and Versioning
- Documents immutable; new versions create new document+chunks with linkage.
- Soft delete keeps provenance; garbage collect content past retention policy.

## Multi-tenancy
- tenant_id on all rows; row-level security and scoped indices.
- organization_id and project_id on all content rows (Document, Chunk, Entity, Relation, Provenance, Spec Objects, Evidence, Relationships).
- Enforce RLS policies to scope queries to the active tenant + organization + project.
- Imported data must reference a valid project_id and remain isolated to that project.

## Specification Objects (Higher Level)

Operate on normalized, higher-level objects extracted from facts (chunks) to form an ultimate product specification. All objects share a common envelope and can be versioned and traced to evidence.

### Common Envelope (for all objects)
- id, tenant_id, type (see taxonomy below)
- title, description, status (proposed|accepted|deprecated|rejected), priority
- owner (person/team), labels[]
- version, effective_from, effective_to
- architecture_domain?: business|data|application|technology|security|integration
- adm_phase?: A|B|C|D|E|F|G|H
- provenance_id (chain to processing and sources)
- evidence[]: Array of { chunk_id, role, confidence, note }
- timestamps: created_at, updated_at, supersedes_id?, duplicates_id?

### Type Taxonomy
- Vision/Objective
- Stakeholder (Person|Team|Org)
- ArchitecturePrinciple
- Driver, Goal, Objective
- GlossaryTerm / DomainConcept
- Capability
- BusinessProcess, BusinessService
- Epic, Feature
- UseCase, UserStory
- Requirement
  - FunctionalRequirement (FR)
  - NonFunctionalRequirement (NFR/QualityAttribute)
  - Constraint
  - ComplianceRequirement
  - BusinessRule
- Decision (ADR)
- Assumption
- Risk
- Question, Answer
- Meeting
- ActionItem
- Issue/Conflict
- AcceptanceCriteria
- TestCase / TestScenario
- Metric/KPI / SuccessCriterion
- Interface/APIContract
- ApplicationComponent, ApplicationService
- Event (Domain/Event-Driven)
- DataEntity (Schema), DataContract
- TechnologyComponent
- Standard
- Workflow / StateMachine
- Dependency (Internal/External)
- ArchitectureBuildingBlock (ABB), SolutionBuildingBlock (SBB)
- ArchitectureView, Viewpoint
- WorkPackage, Plateau, Gap, RoadmapItem
- ChangeRequest
- Release/VersionedDeliverable

### Core Fields by Type (additive to Common Envelope)
- Requirement
  - category: FR|NFR|Constraint|Compliance|BusinessRule
  - rationale, fit_criterion (how measured), moscow: Must|Should|Could|Won't
  - related_features[], acceptance_criteria_ids[]
- ArchitecturePrinciple
  - statement, rationale, implications
- Driver / Goal / Objective
  - statement, measure (for Objective), target_date?
- BusinessProcess / BusinessService
  - owner, inputs[], outputs[], kpis[], related_capabilities[]
- Decision (ADR)
  - context, options[], chosen_option, consequences, status: proposed|accepted|superseded
  - supersedes_decision_id?
- Question / Answer
  - question_text, asked_by, status: open|answered|blocked, answer_id?
  - Answer: answer_text, answered_by, resolution_status
- Meeting
  - provider, uri, started_at, ended_at, participants[{ name, email? }], agenda[], summary
  - recording_uri?, transcript_document_id?, topics[]
- ActionItem
  - description, owner, due_date?, status: open|in_progress|done|blocked, related_decision_id?
- Assumption
  - statement, confidence, review_date
- Risk
  - likelihood (1-5), impact (1-5), mitigation, owner, status
- Feature / Epic
  - business_value, related_requirements[]
- UseCase / UserStory
  - actors[], preconditions[], trigger, main_flow[], alt_flows[], postconditions[]
- AcceptanceCriteria
  - style: gherkin|bullet, text | { given, when, then }
- TestCase
  - test_type, steps[], expected_result, linked_requirements[]
- Interface / APIContract
  - endpoint, method, version, schema_ref, backward_compat: true|false
- ApplicationComponent
  - name, responsibilities[], interfaces[], depends_on[]
- ApplicationService
  - contract_ref, sla?, provided_by_component_id
- Event
  - name, payload_schema_ref, producer, consumers[]
- DataEntity
  - attributes[{ name, type, pii?: bool, required?: bool }], keys, relations
- TechnologyComponent
  - vendor, product, version, hosting, standards[]
- Standard
  - body (e.g., RFC, ISO), reference, version, mandatory?: bool
- Workflow / StateMachine
  - states[], transitions[{ from, to, event, guard? }]
- Dependency
  - target (service/lib/vendor), version, type: runtime|build|infra, criticality
- ArchitectureBuildingBlock (ABB)
  - purpose, capabilities[], constraints[]
- SolutionBuildingBlock (SBB)
  - implements_abb_ids[], components[], constraints[]
- ArchitectureView / Viewpoint
  - viewpoint (stakeholders, concerns, conventions), artifacts[] (diagrams, catalogs, matrices)
- WorkPackage
  - description, start, end, cost_estimate, delivers[], risks[]
- Plateau
  - description, start, end, capabilities_state
- Gap
  - description, from_plateau_id, to_plateau_id, impacted_requirements[]
- RoadmapItem
  - milestone_date, objectives[], related_work_packages[]
- ComplianceRequirement
  - regulation, clause, mapping_to_controls[]
- Metric/KPI
  - definition, target, measure_method
- ChangeRequest
  - reason, impact_summary, status: proposed|approved|rejected|implemented
- Release
  - version, date, included_items[], notes

### Relationships (Traceability Graph)
- satisfy(Feature/UserStory/TestCase -> Requirement)
- verify(TestCase -> Requirement)
- implement(Feature -> Capability|Interface/APIContract|DataEntity|Workflow)
- realize(SBB -> ABB)
- serve(BusinessService/ApplicationService -> Stakeholder|Process)
- depend_on(Feature/Interface/Service/Component -> Dependency)
- refine(Epic -> Feature, Feature -> Requirement)
- trace_to(Requirement -> Driver|Goal|Objective|Principle)
- conform_to(Component|Interface -> Standard)
- migrate_to(Plateau -> Plateau) [via WorkPackage]
- deliver(WorkPackage -> Plateau|Capability|Feature)
- supersede, duplicate, contradict
- address(Risk|Issue|Gap -> Decision|ChangeRequest|WorkPackage)
- derive_from(Object -> Fact Chunk) via evidence[]
- own(Object -> Stakeholder)

### Catalogs, Matrices, and Views (TOGAF)
- Represent catalogs/matrices/views as saved queries or materialized views over objects and relationships.
  - Examples: Application Interface Catalog, Data Entity/Business Function Matrix, Standards Information Base, Technology Portfolio, Requirements Catalog, Capability Map.
- Associate a View with its Viewpoint and the artifacts (files/diagrams) stored in object storage with provenance.

### TOGAF Alignment Notes
- Objects carry optional architecture_domain and adm_phase to tag artifacts to ADM phases (A–H) and domains (Business, Data, Application, Technology).
- Building Blocks: use ABB/SBB types and realize relation to model solution realization.
- Implementation & Migration: use WorkPackage, Plateau, Gap, RoadmapItem with migrate_to and deliver relations.

### TOGAF Mapping Cheat Sheet

Domains (architecture_domain)
- business → Business Architecture
- data → Data Architecture
- application → Application Architecture
- technology → Technology Architecture
- security/integration → Cross-cutting concerns (fit into all domains as viewpoints)

ADM phases (adm_phase) and primary objects
- Phase A (Vision): Vision/Objective, Stakeholder, ArchitecturePrinciple, Driver/Goal/Objective, Capability
- Phase B (Business): Capability, BusinessProcess, BusinessService, Stakeholder, Requirement (stakeholder/system)
- Phase C (Data/Application): DataEntity, DataContract, ApplicationComponent, ApplicationService, Interface/APIContract, Event, Requirement
- Phase D (Technology): TechnologyComponent, Standard, Requirement (constraints), Interface/APIContract
- Phases E–G (Opportunities/Planning/Migration): WorkPackage, Plateau, Gap, RoadmapItem, Dependency, Risk, ChangeRequest
- Phase H (Change): ChangeRequest, Release, Risk/Assumption updates

Object → TOGAF artifact mapping
- ArchitecturePrinciple → Principles Catalog
- Driver/Goal/Objective → Driver/Goal/Objective Catalogs (Vision)
- Capability → Capability Map and heatmaps
- BusinessProcess/BusinessService → Business Function/Service Catalogs
- Requirement → Requirements Catalog (stakeholder vs system; constraints, compliance)
- Decision (ADR) → Architecture Decisions (Architecture Definition Document)
- ApplicationComponent/ApplicationService → Application Portfolio Catalog
- Interface/APIContract → Application Interface Catalog, Interface Catalogs
- DataEntity/DataContract → Data Entity Catalog, Data Dissemination/Information Maps
- Event → Information Flows (where modeled as event-driven interactions)
- TechnologyComponent → Technology Portfolio Catalog
- Standard → Standards Information Base (SIB)
- ABB/SBB → Architecture Building Blocks / Solution Building Blocks catalogs
- WorkPackage/Plateau/Gap/RoadmapItem → Implementation & Migration artifacts (Roadmap, Transition Architectures)
- Risk/Assumption → Risk Log, Assumptions Log
- ChangeRequest/Release → Architecture Change Log; Migration governance outputs

Relationships → TOGAF traceability
- satisfy → Requirement satisfaction (traceability matrix)
- verify → Test verification against Requirements (quality assurance)
- implement → Realization of capabilities/services by features/components
- realize (SBB→ABB) → Solution realizes Architecture Building Block
- serve → Services serving stakeholders/processes (service model)
- depend_on → Dependency analysis (gaps, migration planning)
- refine → Decomposition (epic→feature→requirement)
- trace_to → Requirement traced to Driver/Goal/Objective/Principle
- conform_to → Standards conformance (compliance)
- migrate_to (Plateau→Plateau) → Transition architectures via WorkPackages
- deliver (WorkPackage→Plateau/Capability/Feature) → Roadmap deliverables
- address (Risk/Issue/Gap→Decision/ChangeRequest/WorkPackage) → Governance linkage
- derive_from → Evidence; source provenance (not a TOGAF relation but supports auditability)
- own → Ownership/responsibility (RACI overlays)

Catalogs, matrices, views (build as saved queries/materialized views)
- Principles Catalog → ArchitecturePrinciple
- Requirements Catalog → Requirement (+ trace_to to goals/principles)
- Capability Map → Capability
- Application Portfolio Catalog → ApplicationComponent
- Application Interface Catalog → Interface/APIContract between ApplicationComponents
- Data Entity/Business Function Matrix → DataEntity × BusinessProcess
- Technology Portfolio/Standards Information Base → TechnologyComponent, Standard
- Roadmap and Migration Plan → RoadmapItem, WorkPackage, Plateau, Gap
- Architecture Landscape/Views → ArchitectureView linked to artifacts (diagrams, matrices)

### Evidence Mapping from Facts
- Fact (Chunk) is the atomic evidence unit. Extraction/curation yields objects with evidence links:
  - evidence.role: source|context|counterexample|rationale|citation
  - evidence.confidence: 0.0–1.0 (model or curator assigned)
- Many-to-many: Object ↔ Chunk via Evidence table for efficient joins.

  ### Template Packs (Built‑In Framework Schemas)
  The system supports **Template Packs** – signed, versioned collections of object & relationship type schemas and optional derived views. Packs accelerate adoption of established frameworks while allowing tenant overrides.

  Initial built‑in pack: `togaf-core` providing schemas for the architecture / traceability taxonomy already outlined (Capabilities, Requirements, Goals, Principles, Decisions, WorkPackages, Plateaus, Gaps, RoadmapItems, etc.) plus relationship types (trace_to, refine, realize, deliver, migrate_to, depend_on, conform_to, satisfy, verify, implement, address, own, derive_from).

  Tenants can:
  - Install a core pack (global baseline) via API.
  - Add additive overrides (new optional properties, stricter enums) through tenant-scoped schema versions.
  - Create release snapshots referencing specific object versions (see dynamic object graph spec `19-dynamic-object-graph.md` for branching, snapshots, tags).

  Pack governance: manifests are signed; upgrades support dry-run diffs highlighting added/removed/changed fields & relationship multiplicities. Direct modification of core pack types is prevented (must override). Metrics track validation success rate per pack.


### Storage Notes
- Objects table (single table with type column) or table-per-type; start with single table + JSONB payload for type-specific fields; add materialized views for frequent queries.
- Evidence table: (object_id, chunk_id, role, confidence, note, created_at)
- Relationship table: (src_object_id, rel_type, dst_object_id, weight, evidence_chunk_ids[])
 - Single datastore choice: Keep vectors and full-text search in Postgres.
   - Use pgvector for ANN indexes on Chunk.embedding (cosine/ip) and Postgres FTS (tsvector + GIN) on text.
   - Benefits: transactions, joins, RLS, backups in one system; hybrid retrieval via SQL CTEs.
