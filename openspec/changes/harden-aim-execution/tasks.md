# Tasks

Record the test baseline before starting (`go test ./...` from
`apps/strategy-server`; 38 packages pass as of 2026-09-04). Fix any regression
before considering a task done.

**Method note.** Every ADK behaviour asserted in this codebase was verified by
direct probe, not from documentation — `Actions()` being nil inside a node,
`State.Set` silently discarding, `Event.Author` being useless, the `NodeInfo.Path`
format. Hold the same bar for any new engine. Write the probe, run it, record the
result in `design.md`.

## 1. Evaluation (A1)

- [ ] Write the capability scorecard from `design.md` into a decision record,
      scoring DBOS / Temporal / stay-on-ADK / hand-rolled against the seven
      capabilities. Cite `sequence`'s bake-off for shared findings rather than
      re-deriving them; record only the strategy-server delta (multi-tenancy,
      Zitadel-authenticated gates, multi-week parks).
- [ ] Finalise the kill criteria (draft in `design.md`). They must be falsifiable
      and each must name the test that decides it.
- [ ] Probe: does the candidate engine's step memoization actually skip a completed
      step on resume? Write it as a failing-if-it-re-runs test, not an assertion
      from docs.
- [ ] Probe: can a workflow parked >1 deploy cycle survive new application code
      being deployed? This is kill criterion 2 and the one most likely to fail.
- [ ] Spike: resume a cycle parked at a gate across a real `SIGKILL`, matching the
      bar in `internal/aimadk/restart_proof_test.go` (re-exec the test binary; do
      not simulate).
- [ ] Confirm `domain/aim` stays engine-neutral under the candidate. If engine
      types reach the domain layer, that is kill criterion 5.
- [ ] Record the decision, including the rejected options and why. Note explicitly
      whether the reconciler direction (baseline OQ9) is foreclosed.

## 2. Retry (A2)

- [ ] Write the failing test first, against the **current** engine: a run whose
      third step fails, retried, must not re-execute steps one and two. Assert on
      step execution counts, not on wall time.
- [ ] Add e2e coverage for retry through the real handler path. There is currently
      none at any layer — `tests/e2e/aim_orchestrator_test.go` never calls it.
- [ ] Implement retry against the engine chosen in A1.
- [ ] If "stay on ADK" won: seed the new session's `StateKeyStepResults` from the
      failed run's `RunStore` record (candidate design 2 in the `Retry` doc
      comment). Probe first that `snapshot_cycle`'s `Prior` lookup reads it
      correctly — that path already depends on the same mechanism.
- [ ] Remove the "not implemented" error and its doc-comment rationale; replace
      with the actual semantics.
- [ ] Verify by mutation: revert the memoization and confirm the test fails.

## 3. Session retention (A3)

Independent of A1. Do not block on the evaluation.

- [ ] Add `ADK_SESSION_RETENTION` config (default `720h` / 30 days). Follow the
      `AbandonGatesAfter` precedent, including the reasoning that a too-short
      default is worse than a slow leak.
- [ ] Delete `adk_sessions` rows for runs in a terminal state older than the
      window. `adk_session_events` cascades already (`034_adk_sessions.sql:39`) —
      confirm, do not assume.
- [ ] Run the reaper alongside the existing abandoned-gate sweep in
      `startGateSweep`; do not add a second ticker.
- [ ] Log sessions reaped per pass, so the leak is observable.
- [ ] Test: a terminal run's session is reaped; an `awaiting_human` run's session is
      **not**, however old. A gate open for 90 days must still be resumable.

## 4. Dynamic-graph readiness (A4, design only)

- [ ] Write the design note: what changes if steps become instance-dependent or are
      re-planned mid-cycle. Cover per-run graph construction, deciding `followsGate`
      at runtime, and the impact on `nodeNameFromPath` step-log projection and the
      run panel.
- [ ] Record which A1 candidates make this cheap and which make it expensive. This
      is an input to A1, not an output — write it before the decision is final.
- [ ] Do not implement.

## 5. Documentation

- [ ] Update `docs/UNIFIED_AGENT_ARCHITECTURE.md` open questions 1, 2 and 10 with
      the outcomes. Closing them is the point of this change.
- [ ] Update `openspec/AGENT_RUNTIME_PATTERN.md` open question 2 (build park/wake
      or adopt DBOS) with the decision and its reasoning.
- [ ] If an engine is adopted, add it to the baseline's §2 layer table and §6 repo
      table.
- [ ] Fix the stale comment at `internal/adk/aim_graph.go:36-40` while in this code
      (claims the graph is not yet referenced by `cmd_serve.go`; false since B5).
