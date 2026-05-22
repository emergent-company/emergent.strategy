## MODIFIED Requirements

### Requirement: Staged Write Operations

The system SHALL stage all write operations in a batch before they affect visible state.
A batch is a set of mutations sharing a common `batch_id`. Batches are committed or discarded atomically.

Batches may be staged by:
- Direct MCP tool calls (`update_north_star`, `create_feature`, etc.)
- Autonomous skill execution via `SkillExecutor.Run` or `run_skill` with `mode=autonomous`
- Workflow steps (`StepFunc` implementations that call `SkillExecutor.Run`)

All staging paths produce `strategy_mutation` rows with `status='staged'` and are
subject to the same commit/discard lifecycle.

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

#### Scenario: Skill executor stages mutations
- **WHEN** `run_skill` is called with `mode=autonomous` for a prompt-mode skill
- **AND** the LLM returns valid output
- **THEN** one or more `strategy_mutation` rows are created with `status='staged'`
- **AND** a `batch_id` is returned in the `run_skill` response
- **AND** the staged content is visible via `list_pending_batches`
- **AND** the mutations are subject to the same commit/discard lifecycle as any other batch

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
