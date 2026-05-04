# Capability: strategy-core

Workspace and strategy instance lifecycle management. The foundational layer on which all
other strategy-server capabilities are built.

---

## Requirements

### Requirement: Workspace Management

The system SHALL manage workspaces, where a workspace is an association between a GitHub
owner (user or organisation) and a set of strategy instances.

#### Scenario: Create workspace
- **WHEN** a caller POSTs a valid workspace with a unique `github_owner`
- **THEN** the workspace is persisted with a UUID primary key and `status=active`
- **AND** an audit log entry is written recording the creation

#### Scenario: Duplicate workspace rejected
- **WHEN** a caller POSTs a workspace whose `github_owner` already exists
- **THEN** the server responds with HTTP 409 and error code 110002
- **AND** no new workspace is created

#### Scenario: List workspaces
- **WHEN** a caller GETs the workspace list
- **THEN** all non-deleted workspaces are returned with cursor-based pagination
- **AND** soft-deleted workspaces (deleted_at IS NOT NULL) are excluded

#### Scenario: Soft-delete workspace
- **WHEN** a caller DELETEs a workspace
- **THEN** `deleted_at` is set to now and the workspace is excluded from future list results
- **AND** all associated strategy instances are also soft-deleted

---

### Requirement: Strategy Instance Lifecycle

The system SHALL manage strategy instances (versioned EPF instances) within a workspace.
An instance progresses through: `draft` → `active` → `archived`.

#### Scenario: Import instance from GitHub
- **WHEN** a caller provides a valid `github_repo` and optional `github_base_path`
- **THEN** the system parses the EPF YAML files from the repository
- **AND** creates a strategy instance record with `status=draft`
- **AND** stores the parsed artifact content as the initial committed mutations
- **AND** an audit log entry is written

#### Scenario: Activate instance
- **WHEN** a caller updates an instance status to `active`
- **THEN** the instance becomes the active strategy for the workspace
- **AND** a workspace can have at most one `active` instance at a time
- **AND** any previously active instance transitions to `draft`

#### Scenario: Archive instance
- **WHEN** a caller archives an instance
- **THEN** the instance status becomes `archived`
- **AND** the instance is excluded from default list views
- **AND** all staged (uncommitted) mutations for that instance are discarded

#### Scenario: Get instance with health
- **WHEN** a caller GETs a specific instance
- **THEN** the response includes the instance metadata and a health summary
- **AND** the health summary covers: validation status, content readiness, completeness score

---

### Requirement: Append-Only Mutation Ledger

The system SHALL record all strategy changes in an append-only `strategy_mutations` table.
Current state is derived by reading the latest committed mutation per artifact key.

#### Scenario: Read current artifact state
- **WHEN** a service reads the current state of an artifact (e.g., north_star)
- **THEN** it queries `SELECT ... WHERE instance_id = ? AND artifact_key = ? AND status = 'committed' ORDER BY created_at DESC LIMIT 1`
- **AND** no in-place updates are made to existing rows

#### Scenario: Staged mutation lifecycle
- **WHEN** a write tool creates a staged mutation
- **THEN** the mutation record has `status='staged'` and a `batch_id`
- **AND** the staged mutation does not affect current artifact state reads
- **WHEN** `commit_batch` is called with that `batch_id`
- **THEN** all mutations in the batch atomically transition to `status='committed'`
- **AND** the committed mutations become the new current state

#### Scenario: Discard batch
- **WHEN** a caller calls `discard_batch` with a `batch_id`
- **THEN** all mutations in that batch transition to `status='discarded'`
- **AND** discarded mutations are excluded from current state reads

---

### Requirement: Audit Log

The system SHALL write an audit log entry for every significant mutation and state change.

#### Scenario: Audit entry on workspace create
- **WHEN** a workspace is created
- **THEN** an `audit_log` row is written with `entity_type='workspace'`, `action='create'`, `source` from context, `actor_id` from context

#### Scenario: Audit entry on batch commit
- **WHEN** a batch is committed
- **THEN** an `audit_log` row is written with `entity_type='strategy_mutation'`, `action='commit'`, `details` containing the batch ID and mutation count

#### Scenario: Audit source attribution
- **WHEN** a mutation originates from the MCP server
- **THEN** `source='mcp'` is recorded
- **WHEN** it originates from the web UI
- **THEN** `source='web'` is recorded
