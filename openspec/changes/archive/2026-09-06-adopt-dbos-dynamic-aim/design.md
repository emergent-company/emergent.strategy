# Design: AIM on DBOS, with dynamic steps

## Context

`harden-aim-execution/design.md`'s capability scorecard is not re-litigated
here — it remains accurate. What changed is the adoption-timing conclusion
(`decision.md`, marked superseded) and the confirmed near-term need for
dynamic step selection. This document picks up where that scorecard left
off: DBOS is the chosen candidate; this is how it gets built.

## What was verified before writing this, and how

Per this codebase's standing rule (every ADK behaviour was confirmed by
direct probe, not documentation), the same bar applies to DBOS. As of
writing, the following is confirmed against DBOS's own current Go
programming guide (fetched directly, not recalled from the `sequence`
bake-off, which predates v1.0):

- Workflows are registered functions: `func(ctx dbos.Context, input P) (R,
  error)`, registered via `dbos.RegisterWorkflow` before `dbos.Launch`.
- Steps wrap non-deterministic work: `func(ctx context.Context) (R, error)`
  (plain `context.Context`, not `dbos.Context` — asymmetric with the
  workflow signature; a real source of bugs if a step accidentally captures
  the outer `dbos.Context` closure instead of taking its own parameter).
- `dbos.RunAsStep(ctx, stepFunction)` checkpoints a step's input and output.
  Demonstrated directly in DBOS's own quickstart: kill the process between
  two steps, restart, and the second step runs without the first re-running
  — this is the step-memoization capability `harden-aim-execution`'s
  scorecard scored DBOS as having, now confirmed against the current stable
  release specifically, not inferred from `sequence`'s pre-1.0 evaluation.
- `dbos.Send(ctx, destinationWorkflowID, message, topic)` and
  `dbos.Recv(ctx, topic, timeout)` are the durable messaging primitives —
  the gate mechanism (Part C2) is built on these.
- Queues (`dbos.RegisterQueue` / `dbos.WithQueue`) exist for concurrent
  fan-out. Not needed for AIM's one-step-at-a-time cycle; noted because a
  future dynamic-planning path that fans out sub-steps would use this, not
  something bespoke.
- Recovery from a **process crash** is automatic on the next `Launch()` —
  no caller action required, confirmed by DBOS's own kill-and-restart
  quickstart demo.

## Probe results (all four resolved by direct experiment, 2026-09-04)

Every one of these was answered by writing and running a real Go program
against `dbos-transact-golang v1.3.0` and a real Postgres instance — not
inferred from documentation. Programs and raw output are not part of this
repo (throwaway, run from a scratch temp directory); the findings below are
the durable record.

### 1. Retry for a logical (non-crash) failure: `ForkWorkflow`, not `ResumeWorkflow`

Confirmed by experiment: a three-step workflow with step three forced to
return a plain Go error ends in `WorkflowStatusError`. Calling
`ResumeWorkflow` on it is a **no-op** — it returns the same cached error
immediately, with all three step invocation counters unchanged (0 new
calls). This matches its documented scope ("resume workflows that are
cancelled or have exceeded their maximum recovery attempts") — a returned
business error is neither.

`ForkWorkflow(ctx, ForkWorkflowInput{OriginalWorkflowID: id, StartStep: 2})`
(0-indexed — step three was the third `RunAsStep` call, index 2) is what
actually works: steps one and two's counters stayed at 1 (their bodies were
**not** re-invoked), step three's counter went from 1 to 2, and — after
fixing the bug that caused the original failure — the forked workflow
completed successfully. This is a first-class primitive that does exactly
what `harden-aim-execution`'s Part A2 built by hand for ADK (seed a fresh
attempt with prior steps' results, skip re-running them). **AIM's `Retry`
on DBOS is expected to reduce to: find the index of the first
not-yet-completed step, call `ForkWorkflow` with that `StartStep`.** No
carried-forward marker, no gate auto-advance logic, no session reseed — all
of `harden-aim-execution`'s A2 machinery becomes unnecessary and should be
deleted, not ported (Part C3, Part C6).

### 2. Deterministic workflow IDs: confirmed, and they are idempotency keys

`dbos.WithWorkflowID("my-id")` on `RunWorkflow` is real and behaves exactly
as needed: an AIM run's UUID becomes the DBOS workflow ID directly, and
`RetrieveWorkflow[R](ctx, id)` fetches a handle to it from any process,
including one that never called `RunWorkflow` itself (confirmed: the
crash-recovery probe below retrieves and inspects a workflow from a process
that only ever called `Launch`, never `RunWorkflow`). No mapping table is
needed to translate between an AIM run ID and a DBOS identity — they are
the same string.

### 3. Step checkpoints are queryable, but do not carry AIM's domain metadata

`GetWorkflowSteps(ctx, workflowID)` returns `[]StepInfo{StepID, StepName,
Output, Error, ChildWorkflowID}`, sorted by step ID — `WithStepName` lets a
step carry a human/AIM-meaningful name rather than a Go function name. This
answers "is a step's completion queryable" (yes) but not "does it carry
gate lifecycle" (no — `StepInfo` has no concept of `GateOpenedAt` /
`GateClearedAt` / `GateOutcome`, which are AIM-domain concepts DBOS has no
reason to know about).

**Consequence for design:** strategy-server still writes its own
`StepLog`-shaped projection, the same conclusion `harden-aim-execution`
reached for ADK — but the *mechanism* differs in an important way (see
"Replay and idempotent bookkeeping" below): because the workflow function
itself is our own plain Go code (not something we react to via an event
stream the way ADK's `r.Run(...)` iterator was), the natural place to write
that projection is inline, immediately after each `RunAsStep` call, not
parsed out of an event stream after the fact.

### 4. A parked `Recv` survives a process kill — and its timeout gives gate-abandonment for free

Confirmed by experiment: a workflow blocked in `Recv` was `SIGKILL`ed mid-park.
A fresh process's `Launch()` logged `"Recovered pending workflows" count=1`;
the recovered workflow's status was `PENDING`; calling `Send` from that new
process delivered the message and the workflow completed normally with the
correct payload. The gate survives a process death exactly like an ADK gate
did — no goroutine or session needs to stay alive across the kill.

**One real difference from ADK, worth being precise about, not overselling
as identical:** DBOS's recovery model re-executes the workflow *function*
from its top on every recovery (confirmed: log lines from before the `Recv`
call printed again after recovery) — steps and `Recv`/`Send` calls are what's
memoized, not the surrounding Go control flow. This is not a cost concern
(the AIM cycle's own control flow is cheap loop-and-branch code, doing no
real work outside `RunAsStep`), but it is a **correctness** constraint:
**any code in the workflow function that is not wrapped in `RunAsStep` will
re-execute on every replay**, so anything non-idempotent — reading
`time.Now()`, writing to strategy-server's own bookkeeping table with a
value that should be stable — must itself be wrapped in `RunAsStep`, or it
will silently re-stamp a fresh, wrong value on every crash-recovery or
retry. This is the same discipline DBOS's own docs state for "non-deterministic
operations" — it is not a new rule, but it applies to our own
run-status-projection writes too, not just to AIM's business logic.

**Gate abandonment simplification, not planned for but discovered:**
`Recv`'s `timeout` parameter, set to `AbandonGatesAfter`, **is** the
abandoned-gate mechanism — no separate sweep is needed the way ADK's
`sweepAbandonedGates` ticker was. Confirmed: a `Recv` with a 1-second
timeout and no `Send` ever sent returns `dbos.ErrTimeout` (matched via
`errors.Is`) and the workflow ends in `WorkflowStatusError`. The workflow
function catches this specific error and records it as an abandoned gate
(distinct from any other failure) before returning — a smaller, more
direct mechanism than A3's periodic sweep, and it removes an entire
subsystem (`startGateSweep`'s ticker loop) rather than porting it.
**`ADK_SESSION_RETENTION`'s reaping concern (A3) is separate and still
needed** — that was about deleting old *sessions*, not about detecting
abandonment, and DBOS's own retention story for completed workflow records
is still to be checked (Part C5, unresolved — see open question 3 below,
unchanged).

## Replay and idempotent bookkeeping (new section, follows from probe 4)

Because the workflow function's own top-level code replays on every
recovery or fork, strategy-server's own `StepLog` projection must be
written the same way DBOS writes its own state: as steps, not as bare
function calls floating in the workflow body. The shape:

```go
func cycleWorkflow(ctx dbos.Context, in cycleInput) (string, error) {
    var prior []aim.StepOutput
    for _, step := range steps {           // fixed today; planner-driven in Part C4
        out, err := dbos.RunAsStep(ctx, runStepFn(step, in, prior), dbos.WithStepName(step.Name))
        if err != nil {
            return "", fmt.Errorf("%s: %w", step.Name, err)
        }
        prior = append(prior, out)

        // Wrapped as its own step: writes a stable timestamp exactly once,
        // and — like the domain step above it — is skipped on replay once
        // it has already run, per probe 1's confirmed memoization.
        if _, err := dbos.RunAsStep(ctx, recordStepDoneFn(in.RunID, out), dbos.WithStepName(step.Name+"_recorded")); err != nil {
            return "", err
        }

        if step.HumanGate && out.BatchID != "" {
            if _, err := dbos.RunAsStep(ctx, recordGateOpenedFn(in.RunID, step.Name), dbos.WithStepName(step.Name+"_gate_opened")); err != nil {
                return "", err
            }
            verdict, err := dbos.Recv[gateVerdict](ctx, gateTopic(in.RunID, step.Name), abandonAfter)
            switch {
            case errors.Is(err, dbos.ErrTimeout):
                _, _ = dbos.RunAsStep(ctx, recordGateAbandonedFn(in.RunID, step.Name), dbos.WithStepName(step.Name+"_gate_abandoned"))
                return "", errGateAbandoned
            case err != nil:
                return "", err
            }
            if _, err := dbos.RunAsStep(ctx, recordGateClearedFn(in.RunID, step.Name, verdict), dbos.WithStepName(step.Name+"_gate_cleared")); err != nil {
                return "", err
            }
            if !verdict.Committed {
                return "", ErrCycleDiscarded
            }
        }
    }
    return "done", nil
}
```

Every side effect — the domain step, and every one of strategy-server's own
bookkeeping writes — is a named `RunAsStep`. This is more steps per AIM step
than ADK needed (one node vs. up to four DBOS steps per gated AIM step), but
each is trivial, and it is what makes the whole function safe to replay
verbatim, which DBOS's model requires anyway.

## Proposed shape (subject to revision once the above is answered)

```
domain/aim              step-planning contract, engine-neutral   no DBOS import
      ^ adapted by
internal/aimdbos        DBOSEngine + cross-run bookkeeping        the ONLY place DBOS and AIM meet
      | drives
domain/skillexec        unchanged — the actual LLM work
```

This mirrors `internal/aimadk`'s role exactly: one adapter package is where
the domain and the engine meet, and it is the only place that imports both.
`domain/aim` gains a planning contract, not an engine dependency — this is
what keeps kill criterion 5 true after this change.

### The step-planning contract (Part C4)

**As implemented, 2026-09-04 — differs from the original sketch below in
one concrete, necessary way.** The original sketch returned `PlannedStep{
Step Step; Done bool}` — a `Step` value, which embeds `Run
func(context.Context, StepInput) (StepOutput, error)`. That cannot cross a
gob-encoded boundary (DBOS persists workflow input via gob), so the actual
`Planner` interface returns step **names** (`[]string`), not `Step` values:

```go
type Planner interface {
    Plan(ctx context.Context, instanceID uuid.UUID, completed []StepOutput) ([]string, error)
}
```

`internal/aimdbos.DBOSEngine` keeps its own `name -> Step` registry (built
once from `CycleSteps()` at `Register` time) and resolves names locally
after `Plan` decides the order. Two other differences from the sketch,
both load-bearing, not stylistic:

- **The initial plan is resolved in host code (`StartRun`), not inside the
  workflow.** `Plan` only ever needs a fast config read (one
  `strategy_artifacts` row), so there is no reason to pay for a memoized
  `dbos.RunAsStep` wrapper just to make the decision replay-safe — it is
  already fixed the instant it is written into the workflow's own input,
  which DBOS persists exactly once. This is what "decided once at cycle
  start" means concretely, and it is also what lets `run.Steps`'
  placeholders reflect the real, instance-specific plan immediately
  (resolving `dynamic-graph-readiness.md`'s "can `run.Steps` still be
  pre-populated upfront" concern: yes, because the plan is known before the
  run row is even created).
- **A workflow implementing `CycleSteps()` but not `Planner` is not an
  error.** `internal/aimdbos.staticPlanner` wraps `CycleSteps()`'s fixed
  order automatically, so every pre-Part-C4 test fixture (none of which
  implement `Planner`) keeps working unchanged. `CycleWorkflow` is the one
  implementation that actually varies its plan, via
  `TriggerConfig.SkipFoundations` — a real, already-existing per-instance
  config surface, not a field invented only for this change.

The mid-cycle re-plan signal is implemented closer to the original sketch,
with one addition the probes motivated: a `RunStore.ReplanRequested` flag,
checked (as its own memoized step) before ever calling `dbos.Recv`. Without
it, every step boundary of every cycle — including ones that never use this
feature — would call `dbos.Recv` with a timeout and hit DBOS's own
WARN-level "timeout reached" log on every single one, forever. The flag
means that cost is paid only between an actual `Replan` call and the
boundary that consumes it.

Original sketch, kept for context on how the shape evolved:

```go
// PlannedStep is what the planner hands back: either a step to run next, or
// nothing (the cycle is done).
type PlannedStep struct {
    Step Step
    Done bool
}

// Planner decides what runs next, given an instance and what has completed
// so far. It replaces CycleWorkflow.CycleSteps()'s fixed slice.
type Planner interface {
    Next(ctx context.Context, instanceID uuid.UUID, completed []StepOutput) (PlannedStep, error)
}
```

The DBOS workflow function becomes a loop: ask the planner for the next
step, run it (as a `dbos.RunAsStep` if it's not itself a gate), check the
mid-cycle-replan signal, repeat until `Done`. This is a plain Go loop —
exactly the "dynamic control flow is native" property the capability
scorecard credited DBOS with.

**Mid-cycle re-planning signal:** a `Recv` on a `"replan"` topic with a
short or zero timeout, polled between steps (not blocking the whole cycle
on it — only checked at step boundaries). A `Send` to that topic from
outside (e.g. a ripple-triggered event) causes the next planner call to
receive updated domain state and potentially produce a different next step.
This is deliberately narrower than a reconciler: it changes what happens
*within* an already-running cycle, not whether a cycle is running at all.

### What must not regress

- `orchestration.Run` / `StepLog`'s shape, and every existing handler that
  reads it, unchanged.
- The gate-lifecycle fields (`GateOpenedAt`/`GateClearedAt`/`GateOutcome`)
  still populated correctly — Part C2's `Send`/`Recv` gate must produce the
  same observability the ADK `RequestInput`/resume mechanism did.
- Retry's spec requirements (`harden-aim-execution/specs/agent-runtime/spec.md`)
  still hold under whatever mechanism C3 lands on.
- One-active-run-per-instance, enforced by a database constraint, not a
  check-then-insert race — same reasoning as `adk_run_metadata`'s partial
  unique index, ported to whichever table replaces it.

## Open questions

1. ~~Exact retry primitive~~ — **RESOLVED**, see probe 1: `ForkWorkflow`.
2. **Naming** — `internal/aimdbos` is a placeholder. Decide during
   implementation; consistency with `internal/aimadk`'s naming pattern is
   the only real constraint.
3. ~~Does DBOS's own retention/GC story cover Part C5~~ — **RESOLVED,
   2026-09-04**: no. Checked directly against DBOS's Go API (`go doc`, not
   just its docs site): `ListWorkflows` (with `WithFilterStatus`,
   `WithFilterCompletedBefore`) and `DeleteWorkflows` exist as manual
   primitives, but nothing runs them automatically. `internal/aimdbos`
   implements its own sweep (`DBOSEngine.ReapCompletedWorkflows`,
   `RunRetentionSweep`), the same shape `harden-aim-execution`'s Part A3
   built for `adk_sessions` — configurable window
   (`DBOSEngineConfig.WorkflowRetention`, env `AIM_DBOS_RETENTION`),
   batched, and provably deletion-not-just-counting (a second immediate
   sweep after a real one finds nothing left). Confirmed via a real test
   that never touches `aim_cycle_runs`, and never reaps a non-terminal
   (parked at a gate) or too-recent workflow regardless of the window.
4. **Queue use for dynamic fan-out** — out of scope for this change (AIM
   runs one step at a time), noted only so a future change doesn't
   reinvent `dbos.RegisterQueue` for something DBOS already provides.
5. **Gob-encoding gotcha, newly found.** DBOS persists workflow/step errors
   via gob encoding; an unregistered error type (e.g. a plain `errors.New`
   result, or any error not passed through `gob.Register`) loses its type on
   the way back out — `errors.Is`/`errors.As` against a *replayed* error
   value will not match, only the message string survives. Confirmed by a
   direct warning DBOS itself logs: `"workflow error type cannot be
   gob-encoded; persisting its message only"`. Any code that needs to
   distinguish error *kinds* after a recovery (not just log a message) must
   either register the type with `gob.Register` at startup or encode the
   distinction in the message/a sentinel string instead of relying on
   `errors.Is` post-replay. `errGateAbandoned` above needs this concretely:
   confirm during implementation whether it survives a crash-then-recovery
   round trip, or only works within a single process's lifetime.
