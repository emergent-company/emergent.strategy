# Tasks

Record the test baseline before starting (`go test ./...` from
`apps/strategy-server`; 37 packages pass as of 2026-09-01). Fix any regression
before considering a task done.

## 1. Record the gate lifecycle

- [ ] Add `GateOpenedAt *time.Time`, `GateClearedAt *time.Time`,
      `GateOutcome string` to `orchestration.StepLog` (`pkg/orchestration/types.go:46`).
      Pointers and an empty string so absent stays distinguishable from zero —
      runs written before this change must not read as "gate cleared at the
      epoch".
- [ ] Set `GateOpenedAt` where the step is marked `awaiting_human`
      (`pkg/orchestration/pg/pool.go:331`), persisted **before** the worker
      blocks on `waitForResume`. A crash between those two points must not lose
      the gate-open record.
- [ ] Set `GateClearedAt` and `GateOutcome` on both resume branches — committed
      (`pool.go:~350`) and discarded (`pool.go:~348`).
- [ ] Confirm `FinishedAt` semantics are unchanged. It marks the step body
      returning; the gate fields are additive, and existing readers must not
      shift meaning under them.
- [ ] Retry currently nils `StartedAt`/`FinishedAt` (`pool.go:461`). Nil the gate
      fields alongside them, so a retried step does not carry a stale gate from
      a previous attempt.

## 2. Emit gate duration

- [ ] On clearance, log run id, step name, outcome and wait duration via
      `log/slog`.
- [ ] Include the outcome in the existing `EventAwaitingHuman` follow-up event
      if it can be done without changing the SSE contract; skip it if it cannot.

## 3. Release abandoned runs

- [ ] Config: parked-run threshold. Follow the `AuthEnabled` pattern
      (`config/config.go:68`). Default generous — we do not yet know what a
      normal review takes, which is the whole reason for this change.
- [ ] Extend the sweep to include `awaiting_human` past the threshold. Note
      `markStaleFailed` (`pkg/orchestration/pg/store.go:88`) deliberately
      excludes that status today because `listAwaitingHuman` re-registers those
      runs on startup — the threshold is what makes including them safe.
- [ ] Run the sweep periodically, not only at startup. Parked runs accumulate
      during uptime; the 91-day run survived many restarts because the status
      was excluded, but a startup-only sweep would still miss a long-lived
      server.
- [ ] Record the release on the step as `GateOutcome = "abandoned"` with a
      clearance timestamp, so it is not mistaken for a reviewer's discard.
- [ ] Verify the concurrency slot is genuinely freed: a new cycle for that
      instance must start without `ErrAlreadyActive`.

## 4. Surface it

- [ ] `buildRunPanelData` (`internal/handler/handler_aim_orchestrator.go:326`) —
      expose execution duration and review wait as separate values.
- [ ] Live elapsed wait for a run currently parked.
- [ ] Preserve the existing `StepLog.Meta` key contract. The run UI decodes 18
      keys and breaking one degrades the panel silently.

## 5. Tests

- [ ] Gate open → commit records both timestamps and the committed outcome.
- [ ] Gate open → discard records the discarded outcome.
- [ ] Ungated step records no gate fields.
- [ ] A run stored without gate fields loads and renders.
- [ ] Sweep releases a run past the threshold and leaves one within it.
- [ ] After a sweep, a new cycle starts for that instance.
- [ ] Retry of a gated step clears the previous attempt's gate fields.

## 6. Exit gate

- [ ] `go test ./...` and `task lint` clean.
- [ ] Sweep the one run parked since 2026-06-02 in the dev database and confirm
      the instance accepts a new cycle.
- [ ] `openspec validate instrument-cycle-gates --strict` passes.

## Follow-up, deliberately not now

- [ ] Once real gate durations exist, revisit
      `openspec/AGENT_RUNTIME_PATTERN.md` — specifically whether a gate should
      end a cycle rather than pause one, and what the parked threshold should
      actually be.
- [ ] If retries of gated steps prove common, replace in-place step records with
      an append-only run-event log.
