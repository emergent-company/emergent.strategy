## ADDED Requirements

### Requirement: Ripple Signal Lifecycle

The system SHALL maintain ripple signals as ephemeral observations about
misalignment between connected strategy artifacts. Each signal SHALL have a
type (drift, propagation, tension, staleness, clustering, orphan), severity
(critical, warning, info), and lifecycle status (active, acknowledged,
resolved, dismissed).

#### Scenario: Signal created on commit

- **WHEN** a batch is committed that changes an artifact with downstream dependencies
- **THEN** the system analyzes structural ripple effects and creates signals for each affected downstream artifact that is stale relative to the change

#### Scenario: Signal auto-resolved on target update

- **WHEN** a batch is committed that updates an artifact that is the target of an active signal
- **THEN** all active signals targeting that artifact are automatically resolved and linked to the resolving batch

#### Scenario: Signal dismissed with reason

- **WHEN** a user dismisses a signal with a reason (e.g. "intentional cross-track tension")
- **THEN** the signal status is set to dismissed and the reason is stored in metadata, preventing re-creation of the same signal type for the same source-target pair

### Requirement: Ripple-Aware Batch Workflow

The system SHALL support ripple batches — batches that group a root change
with its downstream consequences into a single atomic commit. Ripple batches
SHALL carry metadata identifying the root cause artifact and the propagation
chain.

#### Scenario: Ripple batch with root cause metadata

- **WHEN** a batch is described with `root_cause_key` and `ripple_chain`
- **THEN** the batch metadata is stored and visible in `list_pending_batches` response

#### Scenario: Commit batch returns ripple summary

- **WHEN** a batch is committed
- **THEN** the response includes a `ripple_signals` summary with counts of new signals created, signals auto-resolved, and total active signals for the instance

### Requirement: Propose Change Impact Preview

The system SHALL provide an impact preview tool that analyzes the blast radius
of a proposed artifact change before it is committed. The preview SHALL walk
the strategy relationship graph to identify all structurally connected artifacts
and classify them by impact severity.

#### Scenario: Propose change returns affected artifacts

- **WHEN** `propose_change` is called with an instance ID, artifact key, and proposed payload
- **THEN** the system returns an impact report listing all affected artifacts, their relationship to the changed artifact, staleness duration, and track classification

#### Scenario: Propose change with no downstream effects

- **WHEN** `propose_change` is called for an artifact with no outgoing relationships
- **THEN** the system returns an empty impact report with a note that no downstream artifacts are affected

## MODIFIED Requirements

### Requirement: Staged Write Operations

The system SHALL stage all writes in a batch before affecting visible state.
The system SHALL support grouping multiple staged mutations into a single
batch for atomic commit. After commit, the system SHALL analyze structural
ripple effects and return a ripple signal summary in the commit response.

#### Scenario: Stage north star update

- **WHEN** `update_north_star` is called with valid payload
- **THEN** a staged mutation is created with a new `batch_id` and status `staged`

#### Scenario: Stage new feature

- **WHEN** `create_feature` is called with valid payload
- **THEN** a staged mutation is created; if `batch_id` is provided, the mutation joins that batch

#### Scenario: Stage feature update

- **WHEN** `update_feature` is called with valid payload and existing feature key
- **THEN** a staged mutation is created for the update action

#### Scenario: Stage feature archival

- **WHEN** `archive_feature` is called with existing feature key
- **THEN** a staged mutation is created for the archive action

#### Scenario: Commit batch

- **WHEN** `commit_batch` is called with a valid batch ID containing staged mutations
- **THEN** all mutations in the batch are promoted to committed status, the strategic index is derived, and a ripple signal summary is returned

#### Scenario: Discard batch

- **WHEN** `discard_batch` is called with a valid batch ID
- **THEN** all staged mutations in the batch are marked as discarded

#### Scenario: Batch not found

- **WHEN** `commit_batch` or `discard_batch` is called with a non-existent batch ID
- **THEN** the system returns an error with code indicating batch not found
