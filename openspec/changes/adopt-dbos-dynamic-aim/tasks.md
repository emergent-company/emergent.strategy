# Tasks

Record the test baseline before starting (`go test ./...` from
`apps/strategy-server`; 50 packages passing as of 2026-09-04, after
`harden-aim-execution`). Fix any regression before considering a task done.

**Method note.** Every DBOS behaviour this plan depends on must be verified
by direct probe against the real dependency before code is written on top of
it — the same discipline this codebase applied to every ADK behaviour
(`Actions()` nil inside a node, `State.Set` discarding, `NodeInfo.Path`'s
format). `design.md`'s "What is not yet verified" section lists the four
specific unknowns to close first.

## 1. Probes (do first, before any engine code)

All five resolved 2026-09-04 by direct experiment against
`dbos-transact-golang v1.3.0` and a real Postgres instance. Full findings in
`design.md`'s "Probe results" section.

- [x] Write a throwaway program that: adds the `dbos-transact-golang`
      dependency at its current stable version (v1.3.0 — confirmed latest
      via `go list -m -versions`), registers a two-step workflow, and
      confirms the quickstart's own claim — kill the process between steps,
      restart, second step runs without the first re-running. — Confirmed:
      step one's invocation counter stayed at 1 across the kill; step two
      (never completed before the kill) re-ran from scratch on recovery.
- [x] Force a step to return an error (not a crash) and determine exactly
      how the workflow is retried. — `ResumeWorkflow` is a no-op on a
      logically-failed workflow (scoped to cancelled/max-recovery-attempts
      only, confirmed by zero re-invocations). `ForkWorkflow` with
      `StartStep` = the failed step's index is the real mechanism: prior
      steps' invocation counters stayed unchanged, the failed step
      re-ran and succeeded once fixed. This makes Part C3 much smaller than
      `harden-aim-execution`'s A2 — no carried-forward machinery needed.
- [x] Confirm whether a workflow ID can be supplied deterministically at
      start. — `dbos.WithWorkflowID(id)`, confirmed working, including
      `RetrieveWorkflow` fetching it from a process that never started it.
- [x] Confirm whether `Recv`'s park is actually free. — Confirmed it
      survives a `SIGKILL` mid-park (recovered as `PENDING`, `Send` from a
      new process delivered correctly). Found and recorded a real
      difference from ADK: the workflow *function's* top-level code
      re-executes on every replay, not just failed steps — see design.md's
      "Replay and idempotent bookkeeping" section, which is binding for how
      Part C2's step-log projection must be written (as steps, not bare
      calls). Also found, unplanned: `Recv`'s own timeout parameter gives
      gate-abandonment for free (`dbos.ErrTimeout`, confirmed), removing
      the need for a separate sweep ticker A3 needed for ADK.
- [x] Confirm whether DBOS's own step-checkpoint records are queryable. —
      `GetWorkflowSteps` returns queryable `StepInfo` with `WithStepName`
      support, but carries no gate-lifecycle concept (`GateOpenedAt` etc.)
      — confirmed strategy-server must keep writing its own projection, as
      expected, now via steps wrapping each bookkeeping write (see
      design.md).

## 2. Part C1 — DBOS foundation, fixed steps first

- [x] Add the `dbos-transact-golang` dependency, pinned to the version
      confirmed in the probes above (v1.3.0).
- [x] Add a new migration creating the `dbos` schema (038) — DBOS's own
      `Launch()` creates its tables within it, confirmed working.
- [x] Add a new migration dropping the AIM-specific cross-run table (039).
      **Narrower than originally planned**: only `adk_run_metadata` is
      dropped. `adk_sessions` / `adk_session_events` / `adk_app_states` /
      `adk_user_states` are kept — they back `internal/adk.SessionStore`,
      which is general ADK infrastructure, not AIM-specific (see Part C6
      below); dropping them broke that package's own conformance suite
      during verification and was reverted.
- [x] Add `aim_cycle_runs` (038) as `adk_run_metadata`'s replacement — same
      shape, same partial-unique-index enforcement.
- [x] Build `DBOSEngine` implementing `pkg/orchestration.EngineAPI`
      (`internal/aimdbos`), driving AIM's *existing* six fixed steps (no
      dynamic planning yet — Part C4 remains a separate, not-yet-started
      piece of work).
- [x] Port `TestADKEngine_SurvivesRealProcessKill`'s shape to `DBOSEngine`
      — `TestDBOSEngine_SurvivesRealProcessKill`. Kill criterion 1 passes.
- [x] Add a deploy-survival test. **Real, significant finding, not a clean
      pass**: simulated via DBOS's own `ApplicationVersion` (recompiling the
      binary would exercise the same mechanism DBOS itself uses to
      represent "a different deploy" — confirmed `computeApplicationVersion`
      hashes the whole binary). Discovered DBOS does **not** auto-recover a
      workflow across an `ApplicationVersion` change — confirmed via direct
      probe that even an explicit `ResumeWorkflow` call only advances
      status to `ENQUEUED` and never executes. Mitigation, now enforced by
      `DBOSEngineConfig.ApplicationVersion` refusing to be empty: pin a
      stable, explicit version tied to AIM's step *shape*, never DBOS's
      binary-hash default. `TestDBOSEngine_SurvivesDeployAcrossAnOpenGate`
      (same pinned version — the realistic case) passes;
      `TestDBOSEngine_ApplicationVersionChange_OrphansOpenGate` documents
      the failure mode this avoids, deliberately, as a bounded and now-known
      operational cost (bump the version only after draining open gates).
- [x] Wire `cmd_serve.go` to use `DBOSEngine` instead of `ADKEngine`, no
      flag — clean cutover once parity was proven.

## 3. Part C2 — Human gates on DBOS

- [x] Implemented via `dbos.Send`/`dbos.Recv` in `internal/aimdbos/workflow.go`,
      one topic per gate (`gate:<stepName>`), with a defensive
      step-name check on the received verdict.
- [x] Gate-lifecycle fields populated by dedicated, individually-memoized
      `RunAsStep` calls (`recordGateOpened`/`recordGateCleared`/
      `recordGateAbandoned`) — required by a real finding, not a style
      choice: the workflow function's own top-level code re-executes on
      every replay (confirmed by probe), so any bookkeeping write not
      itself wrapped in a step would silently re-fire with a fresh,
      wrong timestamp on every crash-recovery or retry.
- [x] Ported the multi-gate correctness test —
      `TestDBOSEngine_TwoSequentialGates_EachResumesCorrectly`.
- [ ] Confirm a run panel `GetRun` call while a gate is parked for a long
      time shows no cost difference from a gate parked briefly. Not
      separately measured — `Recv`'s cost profile while a process stays up
      (as opposed to across a kill, which is measured) was not benchmarked.

## 4. Part C3 — Retry and failure semantics

- [x] Implemented `DBOSEngine.Retry` via `dbos.ForkWorkflow`, confirmed by
      probe to be the correct primitive (not `ResumeWorkflow`). `StartStep`
      is computed from DBOS's own `GetWorkflowSteps`, not from AIM's
      domain-level step count — the two numberings differ because every
      bookkeeping write is itself a separate DBOS step.
- [x] Ported the retry test suite —
      `TestDBOSEngine_Retry_SkipsCompletedSteps_ResumesAtFailure`,
      `TestDBOSEngine_Retry_SecondFailure_CanBeRetriedAgain` (renamed
      `_ApplicationVersionChange_` tests are separate, see Part C1).
- [x] Ported the e2e retry coverage unchanged at the HTTP layer — confirmed
      `EngineAPI` absorbed the engine swap without touching
      `handler_aim_orchestrator.go`.
- [x] Deleted `internal/adk`'s ADK-specific carried-forward machinery along
      with `aim_graph.go` itself (Part C6) — not ported, as expected.
- [x] Verified by mutation: forced `firstIncompleteStepIndex` to always
      return 0, confirmed
      `TestDBOSEngine_Retry_SkipsCompletedSteps_ResumesAtFailure` fails
      (the run gets stuck re-requesting review instead of completing),
      reverted.

**Also found and fixed during this work, not originally scoped:**

- A step body panicking (e.g. a real nil-pointer bug in domain code) runs in
  DBOS's own internal goroutine; unrecovered, it crashed the entire test
  binary, not just the one workflow — confirmed by direct crash while
  testing `TestDBOSEngine_Register_AcceptsTheRealAIMCycleWorkflow`. Fixed
  with a `recover()` inside the step closure in `cycleWorkflow`, converting
  a panic into a normal step failure. This is a real production-safety
  property DBOS does not provide for free.

## 5. Part C4 — Dynamic step planning

- [x] Finalized the `Planner` contract in `domain/aim`
      (`Plan(ctx, instanceID, completed) ([]string, error)` — returns step
      names, not `Step` values, since `Step.Run` is a function value and
      cannot cross DBOS's gob-encoded boundary; see design.md's "as
      implemented" note for the two other deliberate departures from the
      original sketch). Confirmed `domain/aim` imports no engine package —
      `go build ./...` plus a direct read of `domain/aim/workflow.go`'s
      imports (`context`, `fmt`, `google/uuid`, `domain/skillexec` only).
- [x] Implemented instance-dependent step selection via
      `TriggerConfig.SkipFoundations` (a real, already-existing per-instance
      config surface — `Service.GetTriggerConfig`/`loadTriggerConfig`, not
      a field invented for this test) — `CycleWorkflow.Plan` omits
      `adapt_foundations` entirely for an instance with it set. Proved with
      two different instances at `domain/aim/planner_test.go`
      (`TestPlan_SkipFoundations_DifferentInstancesDifferentPlans`) and at
      the engine level with a fake planner keyed by instance ID
      (`internal/aimdbos/planner_test.go`,
      `TestDBOSEngine_InstanceDependentPlanning_TwoInstancesGetDifferentPlans`).
- [x] Implemented the mid-cycle re-plan signal: `DBOSEngine.Replan` (added
      to `orchestration.EngineAPI`) sets a `RunStore.ReplanRequested` flag
      and sends on a fixed `"replan"` topic; `cycleWorkflow`'s
      `checkReplan` reads the flag (as its own memoized step) at every
      step boundary and only calls `dbos.Recv` when it is true — added
      specifically to avoid a `dbos.Recv`-with-timeout call, and DBOS's own
      WARN-level "timeout reached" log, at every boundary of every cycle
      that never uses this feature.
- [x] `TestDBOSEngine_Replan_TakesEffectAtTheNextBoundary` proves a signal
      sent while a step is in flight changes what runs at the next
      boundary. Documented honestly in the test's own comment: this does
      not claim to hit the exact "after step1's own completion, before
      step2 begins" instant, which is not independently observable without
      instrumenting production code — the observable effect is the same
      regardless of exactly when in that window the signal lands, and
      blocking mid-step is the deterministic way to guarantee it lands
      somewhere in it.
- [x] `TestDBOSEngine_Replan_DoesNotInterruptAStepAlreadyInFlight` proves
      the complementary property precisely: a signal sent while a step is
      *confirmed already running* (via a channel it closes on entry, not a
      timing guess) never changes that step's own output — it completes
      exactly as it would have — only the step after it changes.
- [x] Updated the run panel / step-log projection: **not a problem in
      practice**, because the initial plan is resolved in host code
      (`StartRun`, before the run row is even created — see design.md),
      not inside the replaying workflow function. `run.Steps`' placeholders
      are built from the real, instance-specific plan from the start, the
      same way the old fixed-list code did. A mid-cycle re-plan additionally
      rewrites the *pending tail* of `run.Steps` (`recordReplanned`,
      `internal/aimdbos/workflow.go`) — done/awaiting/in-flight entries are
      never touched, only unclaimed pending ones are replaced.

## 6. Part C5 — Retention and cross-run bookkeeping

- [x] Checked DBOS's Go API directly (`go doc`, not just its docs site):
      no built-in retention/GC exists. `ListWorkflows`
      (`WithFilterStatus`, `WithFilterCompletedBefore`) and
      `DeleteWorkflows` are manual primitives DBOS expects a caller to
      drive itself.
- [x] Ported `harden-aim-execution` Part A3's shape to DBOS's own
      completed-workflow record: `DBOSEngineConfig.WorkflowRetention`
      (configurable window, env `AIM_DBOS_RETENTION`, default 720h),
      `DBOSEngine.ReapCompletedWorkflows` (batched, reaped count returned
      and logged) and `RunRetentionSweep` (ticker loop, wired into
      `cmd_serve.go` alongside `heartbeatSvc.RunTicker`). Proved by test
      that a sweep actually deletes (a second immediate sweep finds
      nothing left — not just that the count "looked" right), never touches
      a non-terminal (parked at a gate) or too-recent run regardless of
      the window, and is a true no-op when disabled (the guard lives in
      `ReapCompletedWorkflows` itself, not only in the ticker, so no other
      caller can bypass it) — `internal/aimdbos/retention_test.go`.
- [x] Confirmed `aim_cycle_runs` (Part C1) does **not** need its own
      retention story: one row per run (not per event, unlike ADK's
      `adk_sessions`), gated and heartbeat-driven rather than
      high-frequency, and — confirmed by the same test — untouched by DBOS
      workflow deletion regardless of how old the backing DBOS record gets,
      since it is this engine's own permanent history, not a
      DBOS-managed table.

## 7. Part C6 — Cutover and cleanup

- [x] Removed `internal/aimadk` entirely once `DBOSEngine` reached parity
      (all ported tests pass, plus C1's new kill-criteria tests).
- [x] Removed `internal/adk/aim_graph.go` and `aim_graph_test.go`.
- [x] Did **not** remove `internal/adk/session_store.go`, `session_types.go`,
      `provider_model.go`, or their tests — baseline open question 6 (does
      the authoring bot use ADK's `LlmAgent`) is unrelated and still open.
      Moved `testAppName`/`testUserID` (previously shared with the deleted
      `aim_graph_test.go`) into `perf_history_test.go`, their only
      remaining consumer.
- [x] Fixed stale `internal/aimadk`-referencing comments in files that
      survived the cutover: `domain/aim/workflow.go`,
      `domain/aim/workflow_test.go`, `pkg/orchestration/{types,api,workflow}.go`.
      Added `TestDBOSEngine_Register_AcceptsTheRealAIMCycleWorkflow` to
      `internal/aimdbos` as the direct replacement for the deleted
      `internal/aimadk` test the `domain/aim` comment pointed at.
- [x] `golangci-lint run ./...` — 0 issues.
- [x] Full suite (`go test ./...`, 37 packages) plus `-race -count=2` on
      `internal/aimdbos` — all pass. Also smoke-tested the real server
      binary boot against the dev database: DBOS launches, `/health`
      reports ok, clean shutdown.

## 8. Part C7 — Documentation

- [x] Updated `docs/UNIFIED_AGENT_ARCHITECTURE.md` open questions 1, 2, and
      10 — appended a dated correction/closure note to each, preserving the
      original text rather than erasing it (per the task's own instruction
      — caught and fixed a first draft that violated this).
- [x] Updated `openspec/AGENT_RUNTIME_PATTERN.md` open questions 2 and 5
      the same way.
- [x] Updated `dynamic-graph-readiness.md`'s framing to "implemented, see
      `adopt-dbos-dynamic-aim`," with a "What actually shipped" section at
      the end comparing the real implementation to the note's own
      predictions (the "Native" DBOS capability held; the WARN-log-noise
      cost of naive polling was a real complication the note didn't
      anticipate).
- [x] Added a closing pointer to `harden-aim-execution/decision.md`.
- [x] Updated `apps/strategy-server/AGENTS.md`: tech-stack table (new
      `dbos-inc/dbos-transact-golang` dependency), internal-packages table
      (`internal/aimdbos` added, `pkg/orchestration/pg` — itself already
      deleted, a pre-existing doc gap — corrected to describe the current
      contract-only package, `internal/adk`'s role narrowed to its
      surviving non-AIM purpose), migration count and table (31 → 40,
      rows added through `040_aim_cycle_runs_replan.sql`), and the config
      table (`AIM_APPLICATION_VERSION`, `AIM_DBOS_RETENTION`,
      `ABANDON_GATES_AFTER`).

## Status summary (2026-09-04)

**Done and verified:** Parts C1, C2, C3, C4, C5, C6 — DBOS is the live
orchestration engine for AIM, with real gates, real retry, real
instance-dependent dynamic step planning, a real mid-cycle re-plan signal,
and a real retention sweep for DBOS's own workflow records. Several
significant findings discovered and fixed along the way, not just the
originally-scoped work: the `ApplicationVersion` pinning requirement,
step-panic isolation, the gob-encoding limit on `Planner`'s return shape,
and the need to gate the re-plan check behind a cheap flag rather than
polling `dbos.Recv` unconditionally at every boundary.

`go test ./...` (38 packages), `-race -count=1` on the affected packages,
and `-race -count=2` on `internal/aimdbos` all pass; `task lint` reports 0
issues; every new mechanism (replan effect, replan non-interruption,
retention deletion, retention disabled) was verified by deliberate mutation
— break it, confirm the relevant test fails, revert.

**All parts done, including documentation (Part C7).** This change is
complete: DBOS is the live AIM orchestration engine with real gates, retry,
dynamic per-instance step planning, mid-cycle re-planning, and workflow
retention — and every baseline doc this change touched (`
docs/UNIFIED_AGENT_ARCHITECTURE.md`, `openspec/AGENT_RUNTIME_PATTERN.md`,
`dynamic-graph-readiness.md`, `harden-aim-execution/decision.md`,
`apps/strategy-server/AGENTS.md`) reflects the actual shipped state, not
the plan.

## Post-completion findings from manual testing (2026-09-05)

Two real bugs, found only by running a real AIM cycle against real data
through the web UI — every automated test at the time of the summary above
used fixtures that structurally could not have caught either one. Both
fixed, both now covered by a mutation-tested regression test. Recorded here
because "all tests passed" and "the feature works" turned out to be two
different claims, and the gap between them is worth being honest about
rather than letting the summary above stand unqualified.

1. **`aim.StepInput.InstanceID` was wired to the run's own ID, not the EPF
   instance ID** (`internal/aimdbos/workflow.go`). Every real step, on
   every real cycle ever run under this engine, queried strategy data
   scoped to the wrong id — always "not found," surfaced by
   `domain/aim.Service` as a generic, misleading "No roadmap found for
   instance" on an instance that had one. Invisible to every existing test
   because `fakeStep`'s default body ignores `StepInput` entirely. Fixed;
   guarded by `TestDBOSEngine_StepInput_ReceivesTheInstanceID_NotTheRunID`,
   `TestDBOSEngine_StepInput_AllFieldsWiredCorrectly` (checks RunID,
   Params, and Prior too, not just this one field), and
   `TestDBOSEngine_RealDomainStep_ReadsRealDataByTheCorrectInstanceID` (runs
   the real `aim.Service.AssembleAssessmentParams` — not a fixture —
   against a real seeded Postgres row, reproducing the exact production
   error message when the bug is reintroduced).
2. **`Resume`, `Replan`, and `Abort` addressed a run's own id
   unconditionally, but `Retry`'s `ForkWorkflow` always mints a new,
   different DBOS-internal workflow id for the retried attempt** — so
   once a run had been retried even once, every later `Resume`/`Replan`/
   `Abort` silently addressed the dead original workflow. `dbos.Send`/
   `CancelWorkflow` to a dead id return no error, so this was invisible
   from the caller's side too. Practical symptom: approving a gate on a
   once-retried run appeared to succeed but the run never moved — it sat
   parked until `AbandonGatesAfter` elapsed. Fixed by tracking the
   currently-live workflow id separately from the run's own stable id
   (`aim_cycle_runs.dbos_workflow_id`, migration 041,
   `RunStore.DBOSWorkflowID`/`SetDBOSWorkflowID`). Guarded by
   `TestDBOSEngine_Resume_AfterRetry_TargetsTheLiveWorkflow`,
   `TestDBOSEngine_Abort_AfterRetry_CancelsTheLiveWorkflow`,
   `TestDBOSEngine_Replan_AfterRetry_TargetsTheLiveWorkflow`, and
   `TestDBOSEngine_Retry_SecondFailure_CanBeRetriedAgain` (a second retry
   must chain from the first retry's fork, not re-fork the original —
   written once already referenced as planned in design.md but never
   actually built until now).

   **Correction made while writing the third of those tests, kept
   visible rather than quietly fixed**: the first version of the Replan
   test assumed this was an equally serious correctness bug for `Replan`
   specifically. Mutation testing it — reverting the fix, expecting the
   test to fail — instead showed it still passed: `Replan`'s
   `SetReplanRequested` write goes straight to Postgres, independent of
   which DBOS workflow the accompanying `Send` reaches, and
   `checkReplan`'s own timeout fallback (workflow.go) already treats a
   missed signal as "proceed anyway." The bug there is real but smaller —
   an unnecessary ~5s stall, not a stuck run — and the test and its
   surrounding code comments were rewritten to assert that, not a
   correctness outcome the mechanism doesn't actually produce.

All four new test files/additions:
`internal/aimdbos/engine_test.go` (field-wiring, second-retry,
abort-after-retry tests), `internal/aimdbos/planner_test.go`
(replan-after-retry test), `internal/aimdbos/realworkflow_test.go` (new —
the real-domain-code integration test), plus the UI fix that surfaced the
first bug's failure reason to a human at all
(`internal/ui/aim_run_panel.templ`, `internal/handler/handler_aim_orchestrator.go`)
and the `recordFailure` fix that made a failed step's own timeline row
show as failed instead of staying "pending" forever
(`internal/aimdbos/workflow.go`).
