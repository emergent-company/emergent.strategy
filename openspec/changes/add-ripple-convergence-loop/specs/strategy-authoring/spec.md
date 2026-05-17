## ADDED Requirements

### Requirement: Autonomous Commit Path

The system SHALL provide an autonomous commit path for trivial and minor
changes identified by the convergence loop. Autonomous commits bypass the
staging batch workflow but are fully auditable and reversible.

#### Scenario: Convergence loop auto-commits a trivial fix

- **WHEN** the convergence loop identifies a signal with authority tier `autonomous` and generates a fix
- **THEN** the fix is committed directly to `strategy_mutations` with `status='committed'` and `source='ripple_auto'`
- **AND** the mutation metadata includes `authority_tier='autonomous'` and the originating signal ID
- **AND** the mutation appears in `list_mutations` with the `ripple_auto` source tag
- **AND** post-commit hooks (ingestion, ripple re-analysis) are triggered as normal

#### Scenario: Auto-commit triggers ingestion

- **WHEN** an autonomous commit is written
- **THEN** the system enqueues the committed artifacts for Memory ingestion
- **AND** ingestion follows the same async pipeline as human-committed batches

#### Scenario: Auto-commit appears in audit log

- **WHEN** an autonomous commit is written
- **THEN** an audit log entry is created with `source='ripple_auto'` and the signal ID that triggered the fix
- **AND** the entry is visible in mutation history to any user with instance access

#### Scenario: Auto-commit is reversible

- **WHEN** a user wants to undo an autonomous commit
- **THEN** the user can use `restore_version` to revert to the pre-auto-commit state
- **AND** the auto-committed mutations remain in the ledger as history

---

### Requirement: Convergence Loop

The system SHALL run a convergence loop after every `commit_batch` that
iteratively detects and auto-resolves low-authority misalignments until the
strategy graph reaches equilibrium or damping limits are reached.

#### Scenario: Convergence after normal commit

- **WHEN** a human commits a batch via `commit_batch`
- **THEN** the system runs the convergence loop synchronously before returning the response
- **AND** the response includes a `convergence_summary` with: iterations run, signals auto-resolved, signals escalated to human, final equilibrium score, and damping reason if the loop stopped early

#### Scenario: Convergence reaches equilibrium

- **WHEN** the convergence loop runs and reaches an equilibrium score at or above the instance threshold after N iterations
- **THEN** the loop stops and the response includes `equilibrium_reached: true`
- **AND** any remaining info-level signals are listed but do not block equilibrium

#### Scenario: Convergence stopped by max depth

- **WHEN** the convergence loop reaches the maximum iteration limit (default 5) without achieving equilibrium
- **THEN** the loop stops and the response includes `damping_reason: 'max_iterations'`
- **AND** all remaining unresolved signals are surfaced in the response for human review

#### Scenario: Convergence stopped by change budget

- **WHEN** the cumulative semantic distance of auto-committed changes in the current cycle exceeds the per-cycle budget (default 0.50)
- **THEN** the loop stops and the response includes `damping_reason: 'change_budget_exceeded'`
- **AND** remaining signals are surfaced for human review

#### Scenario: Convergence stopped by anchor drift

- **WHEN** an auto-commit causes the North Star or strategy formula embedding to drift more than 0.10 from its pre-cycle state
- **THEN** the loop stops immediately and the response includes `damping_reason: 'anchor_drift'`
- **AND** the drifted anchor artifact is identified in the response

#### Scenario: Emergency brake

- **WHEN** the active signal count increases for two consecutive iterations
- **THEN** the loop stops and the response includes `damping_reason: 'emergency_brake'`
- **AND** a warning is logged indicating the convergence loop may be diverging

#### Scenario: Convergence with no auto-resolvable signals

- **WHEN** the convergence loop runs and all active signals are above the autonomous authority threshold
- **THEN** the loop completes in one iteration with zero auto-resolutions
- **AND** the signals are surfaced for human review in the response

#### Scenario: No Memory available

- **WHEN** the convergence loop runs without Memory
- **THEN** only structural signals are analyzed
- **AND** no autonomous commits are made (all signals default to gated without semantic verification)
- **AND** the response notes that convergence is in structural-only mode

## MODIFIED Requirements

### Requirement: Staged Write Operations

The system SHALL stage all human-initiated write operations in a batch before
they affect visible state. A batch is a set of mutations sharing a common
`batch_id`. Batches are committed or discarded atomically. The system SHALL
additionally support autonomous commits from the convergence loop that bypass
staging but are fully auditable.

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
- **AND** the convergence loop runs synchronously, potentially auto-committing additional trivial fixes
- **AND** the response includes a `convergence_summary` alongside the commit result

#### Scenario: Discard batch

- **WHEN** a caller discards a batch with a valid `batch_id`
- **THEN** all staged mutations in the batch transition to `status='discarded'`
- **AND** the discarded mutations have no effect on visible state

#### Scenario: Batch not found

- **WHEN** a caller tries to commit or discard a `batch_id` that does not exist
- **THEN** the system returns HTTP 404 with error code 112002

#### Scenario: Autonomous commit from convergence loop

- **WHEN** the convergence loop generates a fix for an autonomous-tier signal
- **THEN** the fix is committed directly without staging or batch ID
- **AND** the mutation is tagged with `source='ripple_auto'` and `authority_tier='autonomous'`
- **AND** the fix is included in the `convergence_summary` of the triggering commit response

---

### Requirement: Equilibrium-Triggered Version Snapshot

The system SHALL automatically publish a version snapshot when the convergence
loop reaches equilibrium and at least one change was made during the
convergence cycle. The auto-published version SHALL capture the settled state
of the strategy graph and be enriched with convergence metadata.

#### Scenario: Auto-publish on equilibrium reached

- **WHEN** the convergence loop reaches equilibrium and at least one auto-commit or signal resolution occurred during the cycle
- **THEN** the system automatically publishes a version snapshot with `source='convergence'` in its metadata
- **AND** the version label is set to a descriptive string identifying the triggering batch
- **AND** the version metadata includes the equilibrium score and convergence summary
- **AND** the previously published version is superseded as in normal `publish_version` flow

#### Scenario: No auto-publish when damping stops convergence

- **WHEN** the convergence loop stops due to a damping limit (max depth, change budget, anchor drift, or emergency brake)
- **THEN** no version snapshot is auto-published
- **AND** the convergence summary indicates the damping reason

#### Scenario: No auto-publish when nothing changed

- **WHEN** the convergence loop runs but completes with zero auto-commits and zero signal resolutions
- **THEN** no version snapshot is auto-published
- **AND** the previous version remains the current published version

#### Scenario: Auto-published version coexists with manual versions

- **WHEN** a user calls `publish_version` after an auto-published equilibrium version
- **THEN** the manual version supersedes the auto-published version as normal
- **AND** both versions are visible in `list_versions` with their respective `source` metadata

#### Scenario: Auto-published version is restorable

- **WHEN** a user calls `restore_version` targeting an auto-published equilibrium version
- **THEN** the restore proceeds as normal, restoring the equilibrium-state artifacts and relationships
