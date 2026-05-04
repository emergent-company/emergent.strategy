## ADDED Requirements

### Requirement: Agent Identity on Mutations

The system SHALL record agent identity on strategy mutations so that autonomous background
agents can be distinguished from human-driven MCP calls, and staged batches can be attributed
to specific agents in the web UI review queue.

The `strategy_mutations` table SHALL include `agent_id TEXT` and `batch_description TEXT`
columns. These are populated when a caller invokes `describe_batch` after staging.

#### Scenario: Agent attaches identity to a staged batch
- **WHEN** a caller invokes `describe_batch` with a `batch_id`, `agent_id`, and `description`
- **THEN** all mutations in that batch have their `agent_id` and `batch_description` updated
- **AND** subsequent `list_pending_batches` responses include the agent_id and description

#### Scenario: Human-driven batch has no agent_id
- **WHEN** a human stages and commits a batch without calling `describe_batch`
- **THEN** the mutations have `agent_id=NULL` and `batch_description=NULL`
- **AND** the audit log records `source='mcp'` with no agent attribution

#### Scenario: Committed mutations preserve agent identity
- **WHEN** a batch with agent_id is committed
- **THEN** the committed mutations retain `agent_id` and `batch_description`
- **AND** the audit log entry includes the agent_id for traceability

---

## MODIFIED Requirements

### Requirement: Read Strategy Context

The system SHALL expose read operations for all EPF artifact types, deriving current state
from the `strategy_artifacts` table, which is populated on commit from the mutation ledger.

#### Scenario: Get product vision
- **WHEN** a caller requests the product vision for an instance
- **THEN** the system queries `strategy_artifacts` where `artifact_type='north_star'`
- **AND** returns the current north_star artifact content
- **AND** returns HTTP 404 if the instance has no committed north_star

#### Scenario: Get personas
- **WHEN** a caller requests personas for an instance
- **THEN** the system queries `strategy_artifacts` where `artifact_type='persona'`
- **AND** returns all current persona artifacts

#### Scenario: Get roadmap
- **WHEN** a caller requests the roadmap for an instance
- **THEN** the system queries `strategy_artifacts` where `artifact_type='roadmap'`
- **AND** returns all OKRs and key results from the roadmap payload

#### Scenario: List features
- **WHEN** a caller lists features for an instance
- **THEN** the system queries `strategy_artifacts` where `artifact_type='feature'` and `status != 'archived'`
- **AND** each feature includes strategic alignment summary and status

#### Scenario: Get feature detail
- **WHEN** a caller requests a specific feature by its artifact key
- **THEN** the system queries `strategy_artifacts` by `artifact_key`
- **AND** returns the full feature definition including value model and personas
- **AND** returns HTTP 404 if the artifact does not exist or has status `archived`

---

### Requirement: Staged Write Operations

The system SHALL stage all write operations in a batch before they affect visible state.
A batch is a set of mutations sharing a common `batch_id`. Batches are committed or
discarded atomically. On commit, the system derives current state into `strategy_artifacts`
and extracts cross-artifact references into `strategy_relationships`.

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
- **AND** for each committed mutation, the system upserts `strategy_artifacts` with the artifact's current state
- **AND** for each committed mutation, the system extracts cross-artifact references and replaces them in `strategy_relationships`
- **AND** an audit log entry is written

#### Scenario: Commit batch with archive action
- **WHEN** a batch containing an `action='archive'` mutation is committed
- **THEN** the corresponding row in `strategy_artifacts` has its `status` set to `archived`
- **AND** relationships sourced from the archived artifact are removed from `strategy_relationships`

#### Scenario: Discard batch
- **WHEN** a caller discards a batch with a valid `batch_id`
- **THEN** all staged mutations in the batch transition to `status='discarded'`
- **AND** the discarded mutations have no effect on visible state
- **AND** `strategy_artifacts` and `strategy_relationships` are unchanged

#### Scenario: Batch not found
- **WHEN** a caller tries to commit or discard a `batch_id` that does not exist
- **THEN** the system returns HTTP 404 with error code 112002
