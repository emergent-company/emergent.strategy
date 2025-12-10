# Entity Extraction Capability

## ADDED Requirements

### Requirement: LangGraph Extraction Pipeline

The system SHALL implement a multi-node extraction pipeline using LangGraph that decouples entity extraction from relationship linking to maximize graph density and quality.

#### Scenario: Full pipeline execution on narrative document

- **WHEN** a document is submitted for extraction
- **AND** the document is classified as "narrative" type
- **THEN** the pipeline executes nodes in sequence: Router → Extractor → Resolver → Builder → Auditor
- **AND** entity extraction uses narrative-focused prompts (characters, themes, locations)
- **AND** relationships are built using temp_ids assigned during extraction

#### Scenario: Full pipeline execution on legal document

- **WHEN** a document is submitted for extraction
- **AND** the document is classified as "legal" type
- **THEN** the pipeline executes nodes in sequence: Router → Extractor → Resolver → Builder → Auditor
- **AND** entity extraction uses legal-focused prompts (defined terms, parties, dates)

#### Scenario: Pipeline handles unknown document type

- **WHEN** a document cannot be classified into a known category
- **THEN** the router assigns category "other"
- **AND** a generic extraction prompt is used

### Requirement: Document Router Node

The pipeline SHALL include a Document_Router node that classifies documents to select the appropriate extraction strategy.

#### Scenario: Classify narrative text

- **WHEN** the router receives text from a story, book, or narrative
- **THEN** it returns `{ category: 'narrative' }`
- **AND** the classification uses only the first 2000 characters for efficiency

#### Scenario: Classify legal text

- **WHEN** the router receives text from a contract, covenant, or legal document
- **THEN** it returns `{ category: 'legal' }`

#### Scenario: Router uses structured output

- **WHEN** the router LLM call completes
- **THEN** the output is validated against a strict schema
- **AND** invalid responses are rejected with an error

### Requirement: Entity Extractor Node

The pipeline SHALL include an Entity_Extractor node that extracts entities with temporary IDs, focusing only on nodes (not relationships).

#### Scenario: Extract entities with temp_ids

- **WHEN** the extractor processes a document
- **THEN** each extracted entity includes a unique `temp_id` (e.g., "peter_1", "clause_5")
- **AND** the temp*id format is `{name_slug}*{sequence}`
- **AND** relationships are NOT extracted in this step

#### Scenario: Category-specific extraction prompts

- **WHEN** the document category is "narrative"
- **THEN** the prompt instructs: "Focus on characters, emotional themes, locations"
- **WHEN** the document category is "legal"
- **THEN** the prompt instructs: "Focus on defined terms, parties, effective dates"

#### Scenario: Extractor uses structured output

- **WHEN** the extractor LLM call completes
- **THEN** the output is validated against Entity schema
- **AND** each entity has: name, type, description, temp_id, properties

### Requirement: Identity Resolver Node (Code-Based)

The pipeline SHALL include an Identity_Resolver node that maps temp_ids to real UUIDs using deterministic code logic (no LLM).

#### Scenario: Resolve entity to existing UUID via vector search

- **WHEN** an extracted entity name matches an existing entity with similarity > 0.90
- **THEN** the temp_id is mapped to the existing UUID
- **AND** the mapping is stored in `resolved_uuid_map`

#### Scenario: Generate new UUID for novel entity

- **WHEN** an extracted entity name does not match any existing entity (similarity <= 0.90)
- **THEN** a new UUID is generated
- **AND** the temp_id is mapped to the new UUID

#### Scenario: Resolution is deterministic

- **WHEN** the same entity name is processed multiple times
- **THEN** it consistently resolves to the same UUID
- **AND** no LLM calls are made during resolution

### Requirement: Relationship Builder Node

The pipeline SHALL include a Relationship_Builder node that connects entities using their temp_ids.

#### Scenario: Build relationships using temp_ids

- **WHEN** the builder processes extracted entities and original text
- **THEN** relationships reference entities by their temp_ids
- **AND** no new entities are created during this step
- **AND** the constraint "You MUST use the provided temp_ids" is enforced

#### Scenario: Builder receives entity context

- **WHEN** the builder prompt is constructed
- **THEN** it includes the list of extracted entities with their temp_ids
- **AND** it includes the original document text
- **AND** it includes the document category for context

### Requirement: Quality Auditor Node

The pipeline SHALL include a Quality_Auditor node that validates extraction quality and triggers retry loops for orphan entities.

#### Scenario: Detect orphan entities

- **WHEN** the auditor analyzes relationships and entities
- **THEN** it identifies entities that appear in neither source_ref nor target_ref of any relationship
- **AND** these are flagged as "orphans"

#### Scenario: Quality check passes

- **WHEN** all entities have at least one relationship
- **THEN** `quality_check_passed` is set to true
- **AND** the pipeline proceeds to END

#### Scenario: Quality check fails with retry

- **WHEN** orphan entities are detected
- **AND** `retry_count` < 3
- **THEN** `quality_check_passed` is set to false
- **AND** feedback is added: "Entities [X, Y] are orphans. Find their connections."
- **AND** the pipeline loops back to Relationship_Builder

#### Scenario: Quality check fails after max retries

- **WHEN** orphan entities are detected
- **AND** `retry_count` >= 3
- **THEN** a warning is logged
- **AND** the pipeline proceeds to END with partial results
- **AND** orphan entities are still persisted

### Requirement: Graph State Management

The pipeline SHALL maintain a typed GraphState that persists across all nodes.

#### Scenario: State includes all required fields

- **WHEN** a pipeline execution starts
- **THEN** the state includes:
  - `original_text`: The document content
  - `file_metadata`: Source information
  - `doc_category`: Classification result
  - `extracted_entities`: List of entities with temp_ids
  - `resolved_uuid_map`: temp_id to UUID mappings
  - `final_relationships`: List of relationships
  - `quality_check_passed`: Boolean flag
  - `retry_count`: Number of retry attempts
  - `feedback_log`: Accumulated feedback messages

#### Scenario: Feedback log accumulates across retries

- **WHEN** the Quality_Auditor adds feedback
- **AND** the pipeline retries
- **THEN** the new feedback is appended to existing feedback
- **AND** previous feedback is preserved

### Requirement: Structured Output Validation

All LLM nodes SHALL use structured output with strict schema validation.

#### Scenario: Router output validated

- **WHEN** the Document_Router returns a response
- **THEN** it is validated against: `{ category: 'narrative' | 'legal' | 'technical' | 'other' }`

#### Scenario: Extractor output validated

- **WHEN** the Entity_Extractor returns a response
- **THEN** each entity is validated against Entity schema
- **AND** invalid entities are rejected

#### Scenario: Builder output validated

- **WHEN** the Relationship_Builder returns a response
- **THEN** each relationship is validated against Relationship schema
- **AND** invalid relationships are rejected

### Requirement: Pipeline Feature Flag

The LangGraph pipeline SHALL be gated behind a feature flag for gradual rollout.

#### Scenario: Enable LangGraph pipeline via environment

- **WHEN** `EXTRACTION_PIPELINE_MODE=langgraph` is set
- **THEN** the new pipeline is used for extraction jobs

#### Scenario: Default to existing pipeline

- **WHEN** no feature flag is set
- **THEN** the existing single-pass extraction is used
- **AND** no breaking changes occur
