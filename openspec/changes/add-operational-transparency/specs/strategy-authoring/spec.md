## ADDED Requirements

### Requirement: Skill Run Ledger

The system SHALL persist a structured record for every autonomous skill execution,
tracking status, timing, chunk progress, token usage, trigger context, and the
resulting batch.

#### Scenario: Run created on skill start
- **WHEN** an autonomous skill execution begins (via `run_skill autonomous` or automatic trigger)
- **THEN** a `skill_runs` row is created with `status='running'`, `started_at=now()`,
  `skill_name`, `instance_id`, `chunk_count`, `trigger` (manual/ripple/aim_cycle),
  and `trigger_context` (JSONB with signal IDs, orchestration run ID, etc.)
- **AND** a `run_id` (UUID) is returned to the caller

#### Scenario: Chunk progress recorded
- **WHEN** a chunk completes (staged successfully or failed after retries)
- **THEN** the run's `chunks_completed` is incremented
- **AND** the chunk's timing, tokens (input + output including retries), attempt count,
  and any validation errors are appended to the `chunk_log` JSONB array
- **AND** the run's `total_input_tokens` and `total_output_tokens` are updated

#### Scenario: Run completed
- **WHEN** all chunks complete and the batch is staged
- **THEN** the run's `status` transitions to `'completed'`
- **AND** `completed_at` is set
- **AND** `batch_id` is set to the staged batch UUID

#### Scenario: Run failed
- **WHEN** a chunk exhausts all retries and the skill execution aborts
- **THEN** the run's `status` transitions to `'failed'`
- **AND** `completed_at` is set
- **AND** `error` contains the failure description
- **AND** `chunk_log` contains entries for all attempted chunks (including partial)

---

### Requirement: LLM Token Propagation

The system SHALL capture and propagate LLM token usage (input and output token counts)
from every LLM call through to the skill result, activity events, and run ledger.

#### Scenario: Tokens returned from LLM client
- **WHEN** the `LLMClient.CompleteJSON` method is called
- **THEN** the response includes `InputTokens` and `OutputTokens` from the provider API
- **AND** these values are non-zero for successful calls

#### Scenario: Tokens accumulated across retries
- **WHEN** a chunk requires validation retries
- **THEN** tokens from all attempts (initial + retries) are summed in the chunk total
- **AND** per-attempt token counts are recorded in the chunk log

#### Scenario: Tokens in skill result
- **WHEN** a chunked skill execution completes
- **THEN** `SkillResult.InputTokens` and `SkillResult.OutputTokens` contain the
  accumulated totals across all chunks and retries

#### Scenario: Tokens in activity events
- **WHEN** a `skill.completed` activity event is recorded
- **THEN** the event payload includes `input_tokens` and `output_tokens` totals

---

### Requirement: Pending Batch Provenance

The system SHALL include the source skill and run ID when listing pending batches
that were produced by autonomous skill execution.

#### Scenario: Batch from autonomous skill
- **WHEN** `list_pending_batches` returns a batch produced by an autonomous skill run
- **THEN** the batch entry includes `source_skill` (skill name) and `source_run_id`
  (run UUID)

#### Scenario: Batch from manual staging
- **WHEN** `list_pending_batches` returns a batch created by manual MCP tool calls
- **THEN** `source_skill` and `source_run_id` are absent or null

---

### Requirement: MCP Orchestration Resume

The MCP `commit_batch` and `discard_batch` handlers SHALL resume AIM orchestrated
cycle runs when the committed or discarded batch matches a run that is waiting for
human review. This makes MCP and web UI batch operations equivalent.

#### Scenario: Commit batch resumes AIM cycle
- **WHEN** a caller commits a batch via MCP `commit_batch`
- **AND** an active AIM orchestrated run is at `awaiting_human` for that batch_id
- **THEN** the orchestration run is resumed and advances to the next step

#### Scenario: Discard batch aborts AIM cycle
- **WHEN** a caller discards a batch via MCP `discard_batch`
- **AND** an active AIM orchestrated run is at `awaiting_human` for that batch_id
- **THEN** the orchestration run is aborted

#### Scenario: Commit unrelated batch does not affect cycle
- **WHEN** a caller commits a batch that does not match any awaiting orchestration run
- **THEN** no orchestration state changes occur

## MODIFIED Requirements

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

#### Scenario: Autonomous skill run produces batch
- **WHEN** an autonomous skill execution completes and stages a batch
- **THEN** the batch's `batch_metadata` JSONB includes `source_skill` and `source_run_id`
- **AND** these fields are returned by `list_pending_batches`
