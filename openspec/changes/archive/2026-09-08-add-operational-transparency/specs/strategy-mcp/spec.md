## ADDED Requirements

### Requirement: Skill Run Observability Tools

The system SHALL expose MCP tools for querying autonomous skill execution history,
enabling AI agents to understand what happened, what is in progress, and how much
LLM capacity was consumed.

#### Scenario: List skill runs for instance
- **WHEN** a caller invokes `list_skill_runs` with an `instance_id`
- **THEN** the system returns a paginated list of skill runs ordered by `started_at` descending
- **AND** each entry includes `run_id`, `skill_name`, `status`, `trigger`,
  `started_at`, `completed_at`, `duration_seconds`, `chunks_completed`/`chunk_count`,
  `total_input_tokens`, `total_output_tokens`, `batch_id` (if completed)

#### Scenario: Filter skill runs by status
- **WHEN** a caller invokes `list_skill_runs` with `status=running`
- **THEN** only runs with `status='running'` are returned

#### Scenario: Filter skill runs by trigger
- **WHEN** a caller invokes `list_skill_runs` with `trigger=ripple`
- **THEN** only runs triggered by ripple cascade are returned

#### Scenario: Get skill run detail
- **WHEN** a caller invokes `get_skill_run` with a `run_id`
- **THEN** the system returns the full run record including `trigger`, `trigger_context`,
  `chunk_log` with per-chunk timing, token counts, attempt counts, validation errors,
  and context truncation flags (dropped features count)

#### Scenario: Run not found
- **WHEN** a caller invokes `get_skill_run` with an unknown `run_id`
- **THEN** the system returns an error with "skill run not found"

#### Scenario: Get LLM usage summary
- **WHEN** a caller invokes `get_llm_usage` with an `instance_id`
- **THEN** the system returns aggregated token counts grouped by skill name
- **AND** includes total `input_tokens`, `output_tokens`, and `run_count` per skill

#### Scenario: LLM usage with date filter
- **WHEN** a caller invokes `get_llm_usage` with `since` and/or `until` ISO 8601 dates
- **THEN** only runs within the date range are included in the aggregation

---

### Requirement: Autonomous Run Tracking in run_skill

The `run_skill` tool in autonomous mode SHALL return a `run_id` that callers can use
to track execution progress via `get_skill_run`.

#### Scenario: Autonomous mode returns run_id
- **WHEN** a caller invokes `run_skill` with `mode=autonomous`
- **THEN** the response includes `run_id` (UUID), `status="running"`, and a message
  directing the caller to use `get_skill_run` or `list_pending_batches` for progress

#### Scenario: Poll run progress
- **WHEN** a caller polls `get_skill_run` with the returned `run_id`
- **THEN** the response shows real-time chunk progress: which chunks have completed,
  current token usage, and estimated remaining chunks
