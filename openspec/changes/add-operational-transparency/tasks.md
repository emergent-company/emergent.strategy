# Tasks: Operational Transparency

## 1. Skill Run Ledger

- [ ] 1.1 Create migration `025_skill_runs.sql` — `skill_runs` table with columns:
      `id`, `instance_id`, `skill_name`, `status`, `trigger`, `trigger_context`,
      `started_at`, `completed_at`, `chunk_count`, `chunks_completed`,
      `total_input_tokens`, `total_output_tokens`, `model`, `batch_id`, `error`,
      `chunk_log` — indexes on `(instance_id, status)` and `(instance_id, created_at)`
- [ ] 1.2 Create `domain/skillrun/service.go` — `Service` with `Create`, `UpdateChunk`,
      `Complete`, `Fail`, `ListByInstance`, `GetByID`, `ActiveForInstance` methods
- [ ] 1.3 Create `domain/skillrun/models.go` — `Run`, `ChunkEntry` types with bun tags;
      `TriggerManual`, `TriggerRipple`, `TriggerAIMCycle` constants
- [ ] 1.4 Wire `skillrun.Service` into `cmd_serve.go` and `mcpserver.Services`

## 2. LLM Token Propagation

- [ ] 2.1 Define `LLMResult` struct in `domain/skillexec/`: `Content string`,
      `InputTokens int`, `OutputTokens int`
- [ ] 2.2 Update `skillexec.LLMClient` interface: `CompleteJSON` returns `(LLMResult, error)`
- [ ] 2.3 Update `aim.LLMClient` interface: `Complete` and `CompleteJSON` return
      `(LLMResult, error)`
- [ ] 2.4 Update `llmAIMAdapter` in `cmd_serve.go` to propagate `ChatResult` token
      fields into `LLMResult`
- [ ] 2.5 Update `callWithValidationChunk` and `callWithValidation` in `executor.go` to
      accumulate tokens from each LLM call (including retries)
- [ ] 2.6 Add `InputTokens`, `OutputTokens` fields to `SkillResult`
- [ ] 2.7 Populate `DraftSummary.InputTokens`/`OutputTokens` in `aim/service.go`
- [ ] 2.8 Include token totals in `skill.completed` and `skill.chunk_staged` activity events
- [ ] 2.9 Update all test mocks to return `LLMResult` instead of `(string, error)`

## 3. Executor → Run Ledger Integration

- [ ] 3.1 Add `RunLedger` field (interface) to `skillexec.Executor`
- [ ] 3.2 At start of `runChunkedInternal`: create a run record (status=running,
      trigger from params or default to manual)
- [ ] 3.3 After each chunk completes: update chunk progress, accumulate tokens, and
      record chunk entry with timing, attempts, errors, context_truncated flag
- [ ] 3.4 On completion: mark run complete, set batch_id, total tokens
- [ ] 3.5 On failure: mark run failed, record error and partial chunk log
- [ ] 3.6 Enhance `run_skill autonomous` MCP response to include `run_id`
- [ ] 3.7 Update `enqueueFoundationDraft` to pass trigger=ripple and signal IDs in params
- [ ] 3.8 Update `stepAdaptStrategy` (aim/workflow.go) to pass trigger=aim_cycle and
      run_id in params

## 4. MCP Orchestration Resume Fix

- [ ] 4.1 In `commit_batch` handler (server.go): after commit succeeds, check if an
      active orchestration run is awaiting this batch_id via `engine.FindRunByBatch`
- [ ] 4.2 If found, call `engine.Resume(ctx, run.ID, true)` to advance the cycle
- [ ] 4.3 In `discard_batch` handler: same check, call `engine.Resume(ctx, run.ID, false)`
      to abort the cycle
- [ ] 4.4 Add `FindRunByBatch` method to `orchestration.Engine` if not already present
- [ ] 4.5 Test: start AIM cycle → wait at step 1 → commit via MCP → verify step 2 starts

## 5. MCP Observability Tools

- [ ] 5.1 `list_skill_runs` — instance_id required; optional status/trigger filter, limit;
      returns runs with duration, tokens, status, trigger, batch_id
- [ ] 5.2 `get_skill_run` — run_id required; returns full run detail including
      per-chunk timing, tokens, errors, retries, trigger context
- [ ] 5.3 `get_llm_usage` — instance_id required; optional since/until date range;
      returns aggregated tokens by skill name, total run count
- [ ] 5.4 Enhance `list_pending_batches` response to include `source_skill` and
      `source_run_id` when the batch was produced by a skill run

## 6. Activity Stream Client Wiring

- [ ] 6.1 Add `EventSource` JS in `shell.templ` connecting to
      `/strategies/:id/activity/stream` on instance pages
- [ ] 6.2 On `skill.started` event: add generating indicator to affected artifact cards
- [ ] 6.3 On `skill.chunk_staged` event: update progress (e.g. "2 of 4 chunks complete")
- [ ] 6.4 On `skill.completed` event: remove generating indicator, show "Review draft"
      banner with link to draft-review page
- [ ] 6.5 On `skill.failed` event: remove generating indicator, show error toast
- [ ] 6.6 Include `run_id`, `skill_name`, `chunk_count`, and `affected_artifacts` in
      skill activity event payloads so the client can render without extra queries

## 7. Web UI Cascade Tracker

- [ ] 7.1 Create `cascadeTracker` templ component — instance-level panel showing:
      active AIM cycle run (if any), active skill runs with chunk progress, pending
      batches with review links, recent completed runs with token summary
- [ ] 7.2 Create handler `GET /strategies/:id/cascade` returning the cascade tracker
      partial (HTMX-compatible)
- [ ] 7.3 Add cascade tracker panel to instance layout (sidebar or top banner) when
      any active run or pending batch exists
- [ ] 7.4 Cascade tracker updates live via SSE events (swap partial on skill/batch events)
- [ ] 7.5 Show downstream effect hints: "After committing this batch, adapt-foundations
      will run automatically" when viewing an execution-layer batch
- [ ] 7.6 Show context truncation warnings: "16 features dropped from context due to
      token budget" when chunk_log contains dropped_features > 0

## 8. Web UI Artifact State Indicators

- [ ] 8.1 Create `generatingBadge` templ component — pulsing sparkle icon + text,
      conditionally rendered when artifact has an active skill run
- [ ] 8.2 Create `pendingDraftBanner` templ component — info banner with batch
      description and "Review AI draft" link
- [ ] 8.3 Add `ActiveSkillRun *skillrun.Run` and `PendingBatch *BatchInfo` fields to
      artifact view data structs
- [ ] 8.4 Modify `handler_artifact.go` to query active runs and pending batches for
      the viewed artifact type and populate view data
- [ ] 8.5 Add generating badge to READY phase overview cards (north_star,
      strategy_foundations, insight_analyses, insight_opportunity)
- [ ] 8.6 Add generating badge + pending draft banner to artifact detail header
- [ ] 8.7 Add pending batch count indicator to instance sidebar

## 9. Tests

- [ ] 9.1 Unit tests for `domain/skillrun/` — CRUD, list with filters, concurrent
      chunk updates, trigger context serialization
- [ ] 9.2 Unit tests for token propagation — verify `LLMResult` tokens flow through
      `callWithValidationChunk` → `SkillResult` → activity events → run ledger
- [ ] 9.3 Unit tests for `list_skill_runs` and `get_skill_run` MCP tools
- [ ] 9.4 Integration test: `run_skill autonomous` → verify run_id returned → poll
      `get_skill_run` → verify status progression running → completed
- [ ] 9.5 Integration test: MCP `commit_batch` resumes orchestration run
- [ ] 9.6 Run full test suite — no regressions
