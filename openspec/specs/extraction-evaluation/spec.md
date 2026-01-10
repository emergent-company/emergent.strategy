# extraction-evaluation Specification

## Purpose
TBD - created by archiving change add-langfuse-evaluation. Update Purpose after archive.
## Requirements
### Requirement: Extraction Evaluation Datasets

The system SHALL support creating and managing evaluation datasets in LangFuse for testing extraction quality.

#### Scenario: Create extraction evaluation dataset

- **GIVEN** a user with access to LangFuse
- **WHEN** the user creates a dataset with extraction input (document text, schemas) and expected output (entities, relationships)
- **THEN** the dataset item SHALL be stored in LangFuse with the specified structure
- **AND** the dataset item SHALL be retrievable via the LangFuse SDK

#### Scenario: Seed dataset from production traces

- **GIVEN** a production extraction trace with manually validated results
- **WHEN** a developer runs the seed script with the trace ID
- **THEN** a dataset item SHALL be created with the trace's input and validated output
- **AND** the dataset item SHALL link back to the source trace

### Requirement: Extraction Experiment Execution

The system SHALL support running extraction experiments against LangFuse datasets to evaluate extraction quality.

#### Scenario: Run extraction experiment

- **GIVEN** an evaluation dataset exists in LangFuse
- **AND** the extraction pipeline is configured
- **WHEN** a developer runs an experiment with a dataset name and configuration
- **THEN** the extraction pipeline SHALL process each dataset item
- **AND** each extraction SHALL create a trace linked to the dataset item
- **AND** evaluation scores SHALL be computed and recorded on each trace

#### Scenario: Parameterized experiment configuration

- **GIVEN** an evaluation dataset exists
- **WHEN** a developer specifies experiment parameters (model, prompt label, temperature)
- **THEN** the extraction pipeline SHALL use the specified parameters for all items
- **AND** experiment metadata SHALL record the parameters used

#### Scenario: Experiment error handling

- **GIVEN** an experiment is running
- **WHEN** extraction fails for a specific dataset item
- **THEN** the error SHALL be recorded as a score on the trace
- **AND** the experiment SHALL continue processing remaining items
- **AND** the final summary SHALL report the number of failures

### Requirement: Extraction Quality Metrics

The system SHALL compute and record evaluation metrics for extraction results.

#### Scenario: Entity precision calculation

- **GIVEN** an extraction result with entities
- **AND** expected entities from the dataset item
- **WHEN** evaluation is performed
- **THEN** entity precision SHALL be calculated as (matched entities / total extracted entities)
- **AND** the score SHALL be recorded on the trace with name "entity_precision"

#### Scenario: Entity recall calculation

- **GIVEN** an extraction result with entities
- **AND** expected entities from the dataset item
- **WHEN** evaluation is performed
- **THEN** entity recall SHALL be calculated as (matched entities / total expected entities)
- **AND** the score SHALL be recorded on the trace with name "entity_recall"

#### Scenario: Entity F1 score calculation

- **GIVEN** entity precision and recall scores
- **WHEN** F1 calculation is performed
- **THEN** F1 score SHALL be calculated as 2 _ (precision _ recall) / (precision + recall)
- **AND** the score SHALL be recorded on the trace with name "entity_f1"

#### Scenario: Relationship accuracy calculation

- **GIVEN** an extraction result with relationships
- **AND** expected relationships from the dataset item
- **WHEN** evaluation is performed
- **THEN** relationship accuracy SHALL be calculated as (correct relationships / total extracted relationships)
- **AND** the score SHALL be recorded on the trace with name "relationship_accuracy"

#### Scenario: Type accuracy calculation

- **GIVEN** an extraction result with typed entities
- **AND** expected entities with types from the dataset item
- **WHEN** evaluation is performed
- **THEN** type accuracy SHALL be calculated as (entities with correct type / total matched entities)
- **AND** the score SHALL be recorded on the trace with name "type_accuracy"

### Requirement: Entity Matching

The system SHALL match extracted entities to expected entities using fuzzy name matching.

#### Scenario: Exact name match

- **GIVEN** an extracted entity with name "John Smith"
- **AND** an expected entity with name "John Smith"
- **WHEN** entity matching is performed
- **THEN** the entities SHALL be matched with a similarity score of 1.0

#### Scenario: Fuzzy name match

- **GIVEN** an extracted entity with name "John D. Smith"
- **AND** an expected entity with name "John Smith"
- **WHEN** entity matching is performed with similarity threshold 0.85
- **THEN** the entities SHALL be matched if the Levenshtein similarity exceeds 0.85

#### Scenario: Case-insensitive matching

- **GIVEN** an extracted entity with name "JOHN SMITH"
- **AND** an expected entity with name "John Smith"
- **WHEN** entity matching is performed
- **THEN** the entities SHALL be matched (case-insensitive comparison)

### Requirement: Relationship Matching

The system SHALL match extracted relationships to expected relationships using directional, inverse, and symmetric matching.

#### Scenario: Exact relationship match

- **GIVEN** an extracted relationship "John --parent_of--> Mary"
- **AND** an expected relationship "John --parent_of--> Mary"
- **WHEN** relationship matching is performed
- **THEN** the relationships SHALL be matched with matchType "exact"

#### Scenario: Inverse relationship match

- **GIVEN** an extracted relationship "Mary --child_of--> John"
- **AND** an expected relationship "John --parent_of--> Mary"
- **AND** inverse mappings include (parent_of <-> child_of)
- **WHEN** relationship matching is performed
- **THEN** the relationships SHALL be matched with matchType "inverse"
- **AND** the system SHALL recognize that source/target are correctly swapped

#### Scenario: Symmetric relationship match

- **GIVEN** an extracted relationship "Mary --married_to--> John"
- **AND** an expected relationship "John --married_to--> Mary"
- **AND** married_to is a symmetric relationship type
- **WHEN** relationship matching is performed
- **THEN** the relationships SHALL be matched with matchType "exact"
- **AND** the system SHALL recognize symmetric relationships regardless of direction

#### Scenario: Fuzzy entity names in relationships

- **GIVEN** an extracted relationship "John Smith --parent_of--> Mary"
- **AND** an expected relationship "J. Smith --parent_of--> Mary"
- **WHEN** relationship matching is performed with entity fuzzy matching enabled
- **THEN** the relationships SHALL be matched if entity name similarity exceeds threshold
- **AND** matchType SHALL be "fuzzy" or "inverse-fuzzy" as appropriate

#### Scenario: Inverse relationship types supported

- **GIVEN** the following inverse relationship pairs are configured:
  - parent_of <-> child_of
  - employs <-> employed_by
  - contains <-> contained_in
  - owns <-> owned_by
  - manages <-> managed_by
  - created <-> created_by
  - supervises <-> supervised_by
  - leads <-> led_by
  - member_of <-> has_member
  - located_in <-> contains_location
  - lived_in <-> was_residence_of
  - born_in <-> birthplace_of
  - died_in <-> deathplace_of
  - originated_from <-> origin_of
- **WHEN** a relationship is extracted with one type and expected with the inverse
- **THEN** the match SHALL succeed with matchType "inverse"

#### Scenario: Symmetric relationship types supported

- **GIVEN** the following symmetric relationship types are configured:
  - married_to
  - sibling_of
  - related_to
  - colleague_of
  - friend_of
  - neighbor_of
  - connected_to
  - associated_with
  - partnered_with
- **WHEN** a symmetric relationship is extracted with source/target swapped
- **THEN** the match SHALL succeed regardless of direction

### Requirement: Experiment CLI

The system SHALL provide a CLI tool for running extraction experiments.

#### Scenario: Run experiment via CLI

- **GIVEN** the CLI script is invoked with `--dataset "extraction-eval" --name "baseline-v1"`
- **WHEN** the script executes
- **THEN** the experiment SHALL run against the specified dataset
- **AND** progress SHALL be displayed during execution
- **AND** a summary with average scores SHALL be displayed on completion

#### Scenario: Specify model and prompt via CLI

- **GIVEN** the CLI script is invoked with `--model "gemini-1.5-pro" --prompt-label "staging"`
- **WHEN** the script executes
- **THEN** the extraction pipeline SHALL use the specified model
- **AND** prompts SHALL be fetched from LangFuse with the specified label

