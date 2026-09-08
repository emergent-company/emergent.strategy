# Tasks: Operational Transparency

## 1. Skill Run Ledger

- [x] 1.1 Create migration `025_skill_runs.sql` — `skill_runs` table with columns:
      `id`, `instance_id`, `skill_name`, `status`, `trigger`, `trigger_context`,
      `started_at`, `completed_at`, `chunk_count`, `chunks_completed`,
      `total_input_tokens`, `total_output_tokens`, `model`, `batch_id`, `error`,
      `chunk_log` — indexes on `(instance_id, status)` and `(instance_id, created_at)`
- [x] 1.2 Create `domain/skillrun/service.go` — `Service` with `Create`, `UpdateChunk`,
      `Complete`, `Fail`, `ListByInstance`, `GetByID`, `ActiveForInstance` methods
- [x] 1.3 Create `domain/skillrun/models.go` — `Run`, `ChunkEntry` types with bun tags;
      `TriggerManual`, `TriggerRipple`, `TriggerAIMCycle` constants
- [x] 1.4 Wire `skillrun.Service` into `cmd_serve.go` and `mcpserver.Services`

## 2. LLM Token Propagation

- [x] 2.1 Define `LLMResult` struct in `domain/skillexec/`: `Content string`,
      `InputTokens int`, `OutputTokens int`
- [x] 2.2 Update `skillexec.LLMClient` interface: `CompleteJSON` returns `(LLMResult, error)`
- [x] 2.3 Update `aim.LLMClient` interface: `Complete` and `CompleteJSON` return **[SUPERSEDED]**
      `(LLMResult, error)`
- [x] 2.4 Update `llmAIMAdapter` in `cmd_serve.go` to propagate `ChatResult` token **[SUPERSEDED]**
      fields into `LLMResult`
- [x] 2.5 Update `callWithValidationChunk` and `callWithValidation` in `executor.go` to
      accumulate tokens from each LLM call (including retries)
- [x] 2.6 Add `InputTokens`, `OutputTokens` fields to `SkillResult`
- [x] 2.7 Populate `DraftSummary.InputTokens`/`OutputTokens` in `aim/service.go`
- [x] 2.8 Include token totals in `skill.completed` and `skill.chunk_staged` activity events
- [x] 2.9 Update all test mocks to return `LLMResult` instead of `(string, error)`

## 3. Executor → Run Ledger Integration

- [x] 3.1 Add `RunLedger` field (interface) to `skillexec.Executor`
- [x] 3.2 At start of `runChunkedInternal`: create a run record (status=running,
      trigger from params or default to manual)
- [x] 3.3 After each chunk completes: update chunk progress, accumulate tokens, and
      record chunk entry with timing, attempts, errors, context_truncated flag
- [x] 3.4 On completion: mark run complete, set batch_id, total tokens
- [x] 3.5 On failure: mark run failed, record error and partial chunk log
- [ ] 3.6 Enhance `run_skill autonomous` MCP response to include `run_id`
- [x] 3.7 Update `enqueueFoundationDraft` to pass trigger=ripple and signal IDs in params
- [x] 3.8 Update `stepAdaptStrategy` (aim/workflow.go) to pass trigger=aim_cycle and
      run_id in params

## 4. MCP Orchestration Resume Fix

- [x] 4.1 In `commit_batch` handler (server.go): after commit succeeds, check if an
      active orchestration run is awaiting this batch_id via `engine.FindRunByBatch`
- [x] 4.2 If found, call `engine.Resume(ctx, run.ID, true)` to advance the cycle
- [x] 4.3 In `discard_batch` handler: same check, call `engine.Resume(ctx, run.ID, false)`
      to abort the cycle
- [x] 4.4 Add `FindRunByBatch` method to `orchestration.Engine` if not already present
- [ ] 4.5 Test: start AIM cycle → wait at step 1 → commit via MCP → verify step 2 starts

## 5. MCP Observability Tools

- [x] 5.1 `list_skill_runs` — instance_id required; optional status/trigger filter, limit;
      returns runs with duration, tokens, status, trigger, batch_id
- [x] 5.2 `get_skill_run` — run_id required; returns full run detail including
      per-chunk timing, tokens, errors, retries, trigger context
- [x] 5.3 `get_llm_usage` — instance_id required; optional since/until date range;
      returns aggregated tokens by skill name, total run count
- [ ] 5.4 Enhance `list_pending_batches` response to include `source_skill` and
      `source_run_id` when the batch was produced by a skill run

## 6. Activity Stream Client Wiring

- [x] 6.1 Add `EventSource` JS in `shell.templ` connecting to
      `/strategies/:id/activity/stream` on instance pages
- [x] 6.2 On `skill.started` event: add generating indicator to affected artifact cards
- [ ] 6.3 On `skill.chunk_staged` event: update progress (e.g. "2 of 4 chunks complete")
- [x] 6.4 On `skill.completed` event: remove generating indicator, show "Review draft"
      banner with link to draft-review page
- [ ] 6.5 On `skill.failed` event: remove generating indicator, show error toast
- [ ] 6.6 Include `run_id`, `skill_name`, `chunk_count`, and `affected_artifacts` in
      skill activity event payloads so the client can render without extra queries

## 7. Web UI Cascade Tracker

- [x] 7.1 Create `cascadeTracker` templ component — instance-level panel showing:
      active AIM cycle run (if any), active skill runs with chunk progress, pending
      batches with review links, recent completed runs with token summary
- [x] 7.2 Create handler `GET /strategies/:id/cascade` returning the cascade tracker
      partial (HTMX-compatible)
- [x] 7.3 Add cascade tracker panel to instance layout (sidebar or top banner) when **[SUPERSEDED]**
      any active run or pending batch exists
- [x] 7.4 Cascade tracker updates live via SSE events (swap partial on skill/batch events) **[SUPERSEDED]**
- [x] 7.5 Show downstream effect hints: "After committing this batch, adapt-foundations
      will run automatically" when viewing an execution-layer batch
- [x] 7.6 Show context truncation warnings: "16 features dropped from context due to
      token budget" when chunk_log contains dropped_features > 0

## 8. Web UI Artifact State Indicators

- [x] 8.1 Create `generatingBadge` templ component — pulsing sparkle icon + text,
      conditionally rendered when artifact has an active skill run
- [x] 8.2 Create `pendingDraftBanner` templ component — info banner with batch
      description and "Review AI draft" link
- [x] 8.3 Add `ActiveSkillRun *skillrun.Run` and `PendingBatch *BatchInfo` fields to **[SUPERSEDED]**
      artifact view data structs
- [ ] 8.4 Modify `handler_artifact.go` to query active runs and pending batches for
      the viewed artifact type and populate view data
- [ ] 8.5 Add generating badge to READY phase overview cards (north_star,
      strategy_foundations, insight_analyses, insight_opportunity)
- [x] 8.6 Add generating badge + pending draft banner to artifact detail header
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
- [x] 9.6 Run full test suite — no regressions

---

## Status (recorded 2026-09-08)

**Implemented 2026-05-22 in commit `fc3bc42d`** — the same commit that added this
change's own proposal, design and spec files, which is why the checkboxes were never
ticked. Follow-on UI work landed the same day in `899d5948`, `1bce40da` and `7c54b2c0`
(none of which touch this directory, so `git log -- <dir>` does not show them).

Verified task by task against the code on 2026-09-08:
**41 done · 5 superseded · 14 not done.** Baseline at time of verification:
`go test ./...` from `apps/strategy-server`, 40 packages, 0 failures; `task lint` clean.

Left unticked and unarchived for three and a half months, this change was reported by
`openspec list` as `0/55`, which caused `add-artifact-assistant-bot` to write a
coordination hedge against a dependency that had already shipped. That hedge has been
removed in this same pass.

### Superseded

- **2.3, 2.4** — `aim.LLMClient` and its adapter no longer exist. `aim.Service`
  delegates through `SkillRunner` to `skillexec`; tokens arrive on
  `SkillRunResult.InputTokens`/`OutputTokens` (`domain/aim/service.go:103,113-114`).
- **7.3, 7.4** — the cascade tracker is not a panel in the instance layout fed by SSE
  swaps. It is a dedicated Activity page (`internal/ui/activity_page.templ`,
  `handler_skillruns.go`) using `hx-trigger="every 5s"` polling, with a separate 30s
  `/cascade` reconcile in `shell.templ:159-183`.
- **8.3** — no `ActiveSkillRun`/`PendingBatch` fields on artifact view data. Artifact
  detail toggles hidden components client-side from SSE; READY uses
  `ReadyPhaseData.PendingBatches` instead.

### Deviations from the design document

- **Migration number.** `design.md` and task 1.1 say `025_skill_runs.sql`. The actual
  file is `026_skill_runs.sql`; `025` is `strategy_activities`.
- **The cascade diagram in `design.md` is obsolete.** It documents a fixed four-step
  AIM cycle. `adapt-foundations` was added later, and `adopt-dbos-dynamic-aim`
  (archived 2026-09-06) introduced dynamic per-instance step planning. "4 steps, 3
  human gates" no longer holds.
- **3.3 partial.** `ChunkEntry.Attempts` and `.Errors` are never populated by the
  executor — the fields exist but are set only in tests. `StartedAt` is an estimate
  derived from token counts (`executor.go:691`), not a real timestamp.
- **Design Decision 4** ("affected artifacts inferred from a small static map")
  shipped as a JavaScript literal inside a templ string (`shell.templ:130-141`), now
  duplicated in `cascade_tracker.templ`. The design predicted the coupling cost; it is
  now slightly higher than predicted. See leftover 6.6.

### Genuine leftovers

**A — Batch provenance (5.4).** `list_pending_batches` exposes no `source_skill` /
`source_run_id`. `batch_metadata` already carries `skill_name` (written by
`skillexec.finalizeBatch`, `executor.go:1519-1556`) and is simply never read back.
**Absorbed by `add-artifact-patch-authoring` §4**, which adds a second batch producer
and therefore needs it.

**B — `run_skill autonomous` returns no `run_id` (3.6).** Blocked by the async design:
the run is created inside the background goroutine, so the ID does not exist at
response time. The response points the caller at `list_skill_runs` instead. Closing
this properly means creating the run row before dispatch.

**C — Client-side UI wiring half-mounted (6.3, 6.5, 6.6, 8.4, 8.5, 8.7).** These are
one coupled deviation, not six independent ones. No `skill.chunk_staged` progress
handler; no error surface on `skill.failed`; no `affected_artifacts` on `skill.started`
(hence the hard-coded client map, which 6.6 existed to eliminate);
`handler_artifact.go` never queries runs or batches; `GeneratingBadge` is rendered only
on artifact detail, never on READY cards — `readyMapCardProps.ArtifactType` is set on
three cards and consumed by nothing; no sidebar pending-batch count.

**D — Test coverage debt (4.5, 9.1–9.5).** Nothing tests the run-ledger integration
path, either skill-run MCP tool, or MCP `commit_batch` → orchestration resume. The
ledger's own unit tests cover CRUD and filters but not concurrent chunk updates, and
`TriggerContext` is written without a round-trip assertion.

Leftovers A–D are recorded rather than fixed here. A is absorbed elsewhere; B, C and D
should be scheduled as their own work if the observability story matters, and are
explicitly **not** prerequisites for the authoring changes.
