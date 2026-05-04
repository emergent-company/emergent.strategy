# Capability: strategy-authoring

Strategy artifact creation, update, and archival. All writes go through a staged batch pattern:
agent stages → human reviews → human commits (or discards).

---

## Requirements

### Requirement: Read Strategy Context

The system SHALL expose read operations for all EPF artifact types, deriving current state
from the committed mutation ledger.

#### Scenario: Get product vision
- **WHEN** a caller requests the product vision for an instance
- **THEN** the system returns the current north_star artifact content
- **AND** returns HTTP 404 if the instance has no committed north_star mutation

#### Scenario: Get personas
- **WHEN** a caller requests personas for an instance
- **THEN** the system returns all current persona artifacts derived from committed mutations

#### Scenario: Get roadmap
- **WHEN** a caller requests the roadmap for an instance
- **THEN** the system returns all OKRs and key results derived from committed roadmap mutations

#### Scenario: List features
- **WHEN** a caller lists features for an instance
- **THEN** the system returns all non-archived feature artifacts
- **AND** each feature includes strategic alignment summary and status

#### Scenario: Get feature detail
- **WHEN** a caller requests a specific feature by its artifact key
- **THEN** the system returns the full feature definition including value model and personas
- **AND** returns HTTP 404 if the feature has no committed mutation or was archived

---

### Requirement: Staged Write Operations

The system SHALL stage all write operations in a batch before they affect visible state.
A batch is a set of mutations sharing a common `batch_id`. Batches are committed or discarded atomically.

#### Scenario: Stage north star update
- **WHEN** a caller submits a north star update via `update_north_star`
- **THEN** a `strategy_mutation` row is created with `status='staged'`, `artifact_type='north_star'`, `action='update'`
- **AND** a `batch_id` is returned identifying the staging batch
- **AND** the current visible north star is unchanged

#### Scenario: Stage new feature
- **WHEN** a caller submits a new feature via `create_feature`
- **THEN** a `strategy_mutation` row is created with `status='staged'`, `artifact_type='feature'`, `action='create'`
- **AND** the feature does not appear in list reads until the batch is committed

#### Scenario: Stage feature update
- **WHEN** a caller submits a feature update via `update_feature`
- **THEN** a `strategy_mutation` row is created with `status='staged'`, `action='update'`
- **AND** the feature's visible state remains the previously committed version

#### Scenario: Stage feature archival
- **WHEN** a caller submits an archival via `archive_feature`
- **THEN** a `strategy_mutation` row is created with `action='archive'`
- **AND** the feature remains visible until the batch is committed

#### Scenario: Commit batch
- **WHEN** a caller calls commit with a valid `batch_id`
- **THEN** all staged mutations in the batch atomically transition to `status='committed'`
- **AND** the committed mutations immediately become the new visible state
- **AND** an audit log entry is written

#### Scenario: Discard batch
- **WHEN** a caller discards a batch with a valid `batch_id`
- **THEN** all staged mutations in the batch transition to `status='discarded'`
- **AND** the discarded mutations have no effect on visible state

#### Scenario: Batch not found
- **WHEN** a caller tries to commit or discard a `batch_id` that does not exist
- **THEN** the system returns HTTP 404 with error code 112002

---

### Requirement: Artifact Validation

The system SHALL validate artifact payloads against EPF JSON schemas before staging.

#### Scenario: Valid artifact staged
- **WHEN** a caller submits an artifact payload that passes EPF schema validation
- **THEN** the mutation is staged and a batch_id is returned

#### Scenario: Invalid artifact rejected
- **WHEN** a caller submits an artifact payload that fails EPF schema validation
- **THEN** the system returns HTTP 422 with error code 112004
- **AND** the validation error details are included in the response
- **AND** no mutation is created
