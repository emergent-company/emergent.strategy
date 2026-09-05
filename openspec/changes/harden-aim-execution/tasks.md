# Tasks

Record the test baseline before starting (`go test ./...` from
`apps/strategy-server`; 50 packages pass as of 2026-09-04, re-verified before
this change's edits). Fix any regression before considering a task done.

**Method note.** Every ADK behaviour asserted in this codebase was verified by
direct probe, not from documentation — `Actions()` being nil inside a node,
`State.Set` silently discarding, `Event.Author` being useless, the `NodeInfo.Path`
format. Hold the same bar for any new engine. Write the probe, run it, record the
result in `design.md`.

## 1. Evaluation (A1)

See `decision.md` for the full record. Summary of what closed and what did not:

- [x] Write the capability scorecard from `design.md` into a decision record,
      scoring DBOS / Temporal / stay-on-ADK / hand-rolled against the seven
      capabilities. Cite `sequence`'s bake-off for shared findings rather than
      re-deriving them; record only the strategy-server delta (multi-tenancy,
      Zitadel-authenticated gates, multi-week parks). — `decision.md`, read
      against `sequence`'s primary bake-off docs directly, not secondhand.
- [x] Finalise the kill criteria (draft in `design.md`). They must be falsifiable
      and each must name the test that decides it. — `decision.md`'s kill
      criteria table.
- [ ] Probe: does the candidate engine's step memoization actually skip a completed
      step on resume? Write it as a failing-if-it-re-runs test, not an assertion
      from docs. — **Not done.** Requires DBOS or Temporal to be an actual
      dependency; out of scope once the decision was "stay on ADK, don't adopt
      either." Becomes required if a future review overturns that decision —
      see `decision.md`'s revisit triggers.
- [ ] Probe: can a workflow parked >1 deploy cycle survive new application code
      being deployed? This is kill criterion 2 and the one most likely to fail.
      — **Not done** for the same reason. `decision.md` records an assumption
      (ADK sessions are our own Postgres rows, not a vendored replay format)
      in place of a proof.
- [x] Spike: resume a cycle parked at a gate across a real `SIGKILL`, matching the
      bar in `internal/aimadk/restart_proof_test.go` (re-exec the test binary; do
      not simulate). — Already exists and re-verified passing
      (`TestADKEngine_SurvivesRealProcessKill`) as part of this change, because
      the chosen candidate is ADK itself. Not run against DBOS or Temporal.
- [x] Confirm `domain/aim` stays engine-neutral under the candidate. If engine
      types reach the domain layer, that is kill criterion 5. — Verified by
      direct inspection: `domain/aim/{service,workflow}.go` import only
      `google/uuid`, `uptrace/bun`, and this repo's own non-engine packages.
- [x] Record the decision, including the rejected options and why. Note explicitly
      whether the reconciler direction (baseline OQ9) is foreclosed. —
      `decision.md`: stay on ADK; DBOS/Temporal/River all rejected with reasons;
      OQ9 explicitly not foreclosed either way.

## 2. Retry (A2)

- [x] Write the failing test first, against the **current** engine: a run whose
      third step fails, retried, must not re-execute steps one and two. Assert on
      step execution counts, not on wall time. —
      `TestADKEngine_Retry_SkipsCompletedSteps_ResumesAtFailure`
      (`internal/aimadk/engine_test.go`), asserting on `atomic.Int32` call
      counters per step, plus `TestADKEngine_Retry_SecondFailure_CanBeRetriedAgain`
      for a run retried more than once.
- [x] Add e2e coverage for retry through the real handler path. There is currently
      none at any layer — `tests/e2e/aim_orchestrator_test.go` never calls it. —
      `TestRetryRun_HandlerPath_SkipsCompletedGatedStepsAndSucceeds` (posts the
      real `/aim/runs/:runID/retry` route, not `engine.Retry` directly) and
      `TestRetryRun_HandlerPath_NonFailedRun_ReturnsConflict`.
- [x] Implement retry against the engine chosen in A1. — stay on ADK
      (`decision.md`), implemented in `internal/aimadk/engine.go`.
- [x] If "stay on ADK" won: seed the new session's `StateKeyStepResults` from the
      failed run's `RunStore` record (candidate design 2 in the `Retry` doc
      comment). Probe first that `snapshot_cycle`'s `Prior` lookup reads it
      correctly — that path already depends on the same mechanism. — Probed:
      candidate design 1 (ADK skipping nodes with a recorded output on its
      own) does not hold — every dispatched node runs its body regardless of
      history, confirmed by direct read of `newWorkNode` before writing any
      code. Design 2 implemented: `ADKEngine.Retry` deletes the failed
      session and recreates it under the same id, seeded with
      `completedStepResults(run.Steps)`; `internal/adk.newWorkNode` returns a
      cached result unchanged when its own step name is already present in
      the seeded history, and `newGateNode` auto-advances a carried-forward
      step instead of re-requesting review (this is what "does no
      LLM-observable work twice" and "does not duplicate a staged batch"
      actually reduce to). `snapshot_cycle`'s `Prior` lookup shares this exact
      mechanism and needed no change.
- [x] Remove the "not implemented" error and its doc-comment rationale; replace
      with the actual semantics.
- [x] Verify by mutation: revert the memoization and confirm the test fails. —
      Performed by hand (see comment on
      `TestADKEngine_Retry_MutationCheck_ReExecutingCompletedStepsFailsTheAbove`):
      disabling the skip check made
      `TestADKEngine_Retry_SkipsCompletedSteps_ResumesAtFailure` fail (the run
      got stuck re-requesting human review instead of completing); restoring
      it passed again.

## 3. Session retention (A3)

Independent of A1. Do not block on the evaluation.

- [x] Add `ADK_SESSION_RETENTION` config (default `720h` / 30 days). Follow the
      `AbandonGatesAfter` precedent, including the reasoning that a too-short
      default is worse than a slow leak. — `config/config.go`, wired in
      `cmd_serve.go`.
- [x] Delete `adk_sessions` rows for runs in a terminal state older than the
      window. `adk_session_events` cascades already (`034_adk_sessions.sql:39`) —
      confirm, do not assume. — Confirmed (`ON DELETE CASCADE` on the FK);
      reaping goes through `adksession.Service.Delete`, which deletes the
      `adk_sessions` row and lets the cascade take the events.
- [x] Run the reaper alongside the existing abandoned-gate sweep in
      `startGateSweep`; do not add a second ticker. — `startGateSweep` now
      calls a shared `runSweeps` on the one ticker; each sweep is
      independently gated by its own threshold.
- [x] Log sessions reaped per pass, so the leak is observable. — one
      `slog.InfoContext` per sweep pass with `reaped` and `candidates` counts,
      including when zero (confirms the sweep is running, not just silent).
- [x] Test: a terminal run's session is reaped; an `awaiting_human` run's session is
      **not**, however old. A gate open for 90 days must still be resumable. —
      `TestADKEngine_SessionRetention_ReapsTerminalRunSession`,
      `TestADKEngine_SessionRetention_LeavesAwaitingHumanAlone` (asserts the
      run remains resumable after the sweep runs, not just that the session
      row persists), `TestADKEngine_SessionRetention_DisabledIndependentlyOfGateSweep`.
      A new `session_reaped_at` column on `adk_run_metadata`
      (migration `037`) makes the sweep idempotent — a reaped run's session
      is never re-selected.

## 4. Dynamic-graph readiness (A4, design only)

- [x] Write the design note: what changes if steps become instance-dependent or are
      re-planned mid-cycle. Cover per-run graph construction, deciding `followsGate`
      at runtime, and the impact on `nodeNameFromPath` step-log projection and the
      run panel. — `dynamic-graph-readiness.md`.
- [x] Record which A1 candidates make this cheap and which make it expensive. This
      is an input to A1, not an output — write it before the decision is final.
      — Same file's cost table; instance-dependent selection is cheap under
      any candidate, mid-cycle re-planning is the sharp gap DBOS/Temporal have
      and ADK does not.
- [x] Do not implement. — No AIM step-selection or re-planning code was added.

## 5. Documentation

- [x] Update `docs/UNIFIED_AGENT_ARCHITECTURE.md` open questions 1, 2 and 10 with
      the outcomes. Closing them is the point of this change.
- [x] Update `openspec/AGENT_RUNTIME_PATTERN.md` open question 2 (build park/wake
      or adopt DBOS) with the decision and its reasoning.
- [x] If an engine is adopted, add it to the baseline's §2 layer table and §6 repo
      table. — N/A: no new engine was adopted, so the tables are unchanged;
      noted as N/A rather than silently skipped.
- [x] Fix the stale comment at `internal/adk/aim_graph.go:36-40` while in this code
      (claims the graph is not yet referenced by `cmd_serve.go`; false since B5).
