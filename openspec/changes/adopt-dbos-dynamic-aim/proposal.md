# Change: Move AIM onto DBOS and make its steps dynamic

> **Baseline:** `docs/UNIFIED_AGENT_ARCHITECTURE.md`. This change reopens and
> reverses `harden-aim-execution`'s Part A1 decision
> (`openspec/changes/harden-aim-execution/decision.md`, marked superseded in
> place — read it first, it records exactly what changed and why). It also
> implements what `harden-aim-execution`'s Part A4
> (`dynamic-graph-readiness.md`) deliberately left as design-only.
>
> **Why the reversal is not drift-log error 1 or 2.** The A1 decision was not
> wrong on the evidence available that day; three inputs changed within
> hours: (1) strategy-server has no production deployment yet, so the risk
> A1 weighted most heavily — a multi-week park surviving a blue-green
> deploy — is a validation cost, not a production incident, right now; (2)
> AIM's dynamic direction was confirmed as near-term product intent, not
> inferred from current shape (the thing drift-log entry 1 warns against);
> (3) DBOS Go reached v1.0 stable in August 2026, retiring the "young SDK"
> risk A1 leaned on. Re-deriving from these, not re-citing A1's conclusion,
> is what produced this proposal.

## Why

`harden-aim-execution` closed AIM's retry and session-leak gaps without
adopting a new engine, on the reasoning that the adoption risk (young SDK,
license constraint, blue-green vs. multi-week parks) outweighed the benefit
while nothing in AIM's roadmap concretely needed dynamic control flow. Both
conditions have changed:

1. **No production exposure yet.** The specific risk that made A1
   conservative — a workflow parked for weeks failing to survive a deploy —
   can be tested directly, cheaply, by doing it, instead of needing another
   team's unproven bake-off to resolve it first.
2. **AIM's dynamic direction is now a stated near-term requirement**, not a
   hypothetical `dynamic-graph-readiness.md` scored for completeness. That
   document's own cost table is the reason this matters: ADK has no clean
   model for mid-cycle re-planning (a running graph's node sequence is fixed
   once `runner.Run` starts), while DBOS workflows are plain Go functions —
   dynamic control flow is native, not bolted on.
3. **DBOS Go SDK reached v1.0 stable (August 2026).** The specific risk A1
   named — "young SDK, `v0.20.0` stable with a breaking `v1.0.0-rc.1`" — no
   longer describes the current state of the library.
4. **strategy-server is better positioned to validate this than waiting on
   `sequence`.** Re-checked the same day this proposal was written:
   `sequence`'s kill criteria have not moved since 2026-08-24, and their own
   thread close-out explicitly puts Temporal and multi-replica **out of
   scope until designated** — they are not going to produce a fuller answer
   soon. strategy-server has more active usage to validate against than
   their one synchronous `RunAndWait` workflow, and the baseline
   (`UNIFIED_AGENT_ARCHITECTURE.md` §7) already names strategy-server as the
   repo that should lead this in code rather than in prose.

## What stays true regardless

Kill criterion 5 from the superseded decision is **not superseded** — it is
the thing that makes this reversal itself affordable:

> `domain/aim` SHALL NOT import any execution-engine package.

This still holds after this change. Every part below is designed so
`domain/aim` gains a *planning* contract (which step comes next), not an
*engine* dependency. If this constraint is ever violated, that is a design
defect, not an acceptable cost of adopting DBOS.

## What Changes

Staged into parts, in dependency order. Parts C1–C3 must land before C4
(dynamic planning) is meaningful — there is no point making step selection
dynamic on an engine that hasn't yet proven it can durably execute the
steps it's given.

### Part C1 — DBOS foundation, fixed steps first

- **ADD** the `dbos-transact-golang` dependency, pinned to the current stable
  release (v1.0.x at proposal time — confirm exact version at implementation
  time, do not assume).
- **ADD** a `DBOSEngine` implementing `pkg/orchestration.EngineAPI`, run
  against the AIM cycle's *existing* six fixed steps — deliberately not
  combined with dynamic planning in the same commit, so a DBOS integration
  defect and a step-planning defect are never debugged at the same time.
- **ADD** a new schema for DBOS's own system tables (`dbos`, following
  `sequence`'s precedent of a dedicated schema) plus whatever
  strategy-server-owned table replaces `adk_run_metadata`'s cross-run
  bookkeeping (DBOS has no concept of "which workflow is active for this
  AIM instance" — that is domain-specific and still ours to keep).
- **DROP** `adk_sessions`, `adk_session_events`, `adk_app_states`,
  `adk_user_states`, `adk_run_metadata` and their indexes. No production data
  exists; a clean migration is simpler than preserving dev-only run history.
- **PROBE, do not assume**, before writing any dependent code — this
  codebase's own rule for every prior ADK behaviour applies identically
  here:
  - Exactly how a *logically failed* workflow (one whose function returned
    an error, as opposed to one interrupted by a process crash) is
    re-invoked. DBOS's documented crash-recovery is automatic on `Launch`;
    it is not yet established here whether a returned-error failure needs
    an explicit "retry this workflow ID" call, and if so, what it's named
    in the current stable release.
  - Whether a caller can specify a deterministic workflow ID (needed to key
    a DBOS workflow to an AIM run ID the way an ADK session was keyed to
    one), or whether IDs are opaque and a mapping table is mandatory rather
    than optional.
  - Whether `RunAsStep`'s memoization is visible/inspectable in a form the
    run panel can still render as today's `StepLog` (name, status, batch id,
    timestamps, gate lifecycle) — DBOS's step checkpoints are not
    guaranteed to carry AIM-domain metadata for free.
- **ADD** a real process-kill resume test matching the bar
  `internal/aimadk/restart_proof_test.go` already set for ADK (re-exec the
  test binary, `SIGKILL`, do not simulate) — this is kill criterion 1 from
  the superseded decision, still the right bar, now validated against DBOS
  instead of assumed against it.
- **ADD** a deploy-survival test: park a workflow at a gate, rebuild the
  binary with a trivial change (simulating a deploy), restart, confirm the
  parked workflow still resumes correctly. This is kill criterion 2 — the
  one the superseded decision called "most likely to fail" — now cheap to
  answer directly because there is no production traffic to protect while
  answering it.

### Part C2 — Human gates on DBOS

- **ADD** the gate mechanism using `dbos.Send`/`dbos.Recv`: a gate step calls
  `Recv` on a topic keyed to the run and blocks; `commit_batch` (or its
  discard path) calls `Send` with the verdict. This replaces ADK's
  `RequestInput`/interrupt/`FunctionResponse` mechanism entirely.
- **CONFIRM** a parked `Recv` costs nothing while waiting — this is the
  property that made ADK's gates free (`drive()` simply exits; nothing
  blocked in memory) and it must hold here too, or a multi-week gate becomes
  expensive in a way it never was.
- **PRESERVE** `orchestration.Run` / `orchestration.StepLog`'s shape and the
  existing HTTP handlers / run panel UI unchanged. This is the seam
  `EngineAPI` exists for; if any caller needs to change, that is a signal
  the abstraction leaked, not an acceptable side effect.

### Part C3 — Retry and failure semantics

- **REPLACE** `ADKEngine.Retry`'s session-reseed mechanism (the
  `RetryCarriedForwardMetaKey` / `findStepResult` machinery added in
  `harden-aim-execution` Part A2) with whatever DBOS's own re-invocation
  primitive turns out to be, per the C1 probe above. If DBOS's own
  `RunAsStep` memoization already gives "don't re-run completed steps" for
  free, the bespoke carried-forward bookkeeping is deleted outright rather
  than ported — it existed only to work around ADK's lack of the same
  property.
- **KEEP** the spec requirements from `harden-aim-execution`
  (`specs/agent-runtime/spec.md`'s retry scenarios) as the acceptance bar:
  a retried run must not re-execute completed steps, must not duplicate a
  staged batch, and must be observable. The *mechanism* changes; the
  *guarantee* does not.

### Part C4 — Dynamic step planning

- **ADD** a step-planning contract in `domain/aim`, replacing
  `CycleWorkflow.CycleSteps() []Step`'s fixed slice. Shape to be finalized in
  design, but must satisfy: given an instance and the steps completed so
  far, produce the next step (or "cycle done") — in domain terms, with no
  engine import, per the standing constraint above.
- **SUPPORT** instance-dependent step selection (the cheap case per
  `dynamic-graph-readiness.md`'s cost table): different instances may run
  different steps or orderings, decided once at cycle start.
- **SUPPORT** mid-cycle re-planning via a documented signal path: a
  `Recv` on a side topic, checked between steps, that can cause the planner
  to be re-consulted with updated domain state before the next step runs.
- **DO NOT** build a full standing-state reconciler in this change. Baseline
  open question 9 (reconciler vs. discrete cycles) is a larger, separate
  design question; mid-cycle re-planning within one discrete cycle is not
  the same thing as replacing the cycle model itself, and this change must
  not be read as having answered OQ9.

### Part C5 — Retention and cross-run bookkeeping

- **DESIGN** a retention story for DBOS's own system tables, analogous to
  `harden-aim-execution` Part A3 for `adk_sessions` — confirm first whether
  DBOS ships this natively (Conductor-adjacent tooling may already cover it)
  before building a bespoke sweep.
- **ADD** whatever minimal table replaces `adk_run_metadata`'s job: which
  DBOS workflow is active for a given AIM instance, enforced the same way
  (a partial unique index), since DBOS has no notion of "AIM instance."

### Part C6 — Cutover and cleanup

- **REMOVE** `internal/aimadk` (the ADK-specific engine) and
  `internal/adk/aim_graph.go` (the AIM-specific graph) once `DBOSEngine`
  reaches parity, matching how the legacy pg-backed engine was retired once
  ADK reached parity with it (B5 cutover).
- **DO NOT** remove `internal/adk/session_store.go`,
  `session_types.go`, or `provider_model.go`. These are general ADK
  infrastructure, not AIM-specific, and whether the authoring bot
  (`add-artifact-assistant-bot`) uses ADK's `LlmAgent` at all is baseline
  open question 6 — still open. Removing them here would foreclose that
  option as a side effect of an unrelated change.

### Part C7 — Documentation

- **UPDATE** `docs/UNIFIED_AGENT_ARCHITECTURE.md` open questions 1 and 2
  again — they were closed by `harden-aim-execution` on 2026-09-04 and are
  reopened and re-closed by this change the same way `harden-aim-execution`
  itself corrected earlier drift. Record both closures in sequence; do not
  erase the first one.
- **UPDATE** `openspec/AGENT_RUNTIME_PATTERN.md` open question 2 with the
  final answer.
- **UPDATE** `dynamic-graph-readiness.md`'s framing from "design only, not
  implemented" to "implemented, see this change" once C4 ships.
- **UPDATE** `harden-aim-execution/decision.md` — already marked superseded;
  add a closing pointer once this change completes.

## Impact

- **Affected specs:** `agent-runtime` (retry and session-retention
  requirements carry over with DBOS as the mechanism; new requirements for
  dynamic step planning).
- **Affected code:** new `internal/aimdbos` (or similar — naming decided in
  design) replacing `internal/aimadk`; `internal/adk/aim_graph.go` removed;
  `domain/aim/workflow.go`'s `CycleSteps()` replaced by a planning contract;
  new migrations; `cmd_serve.go` wiring.
- **Not affected:** the staging spine, `domain/skillexec`, the MCP surface,
  the run panel UI (by design — `EngineAPI` and `Run`/`StepLog` are the seam
  that should absorb this entire change without leaking into callers).

## Non-goals

- Reconciler vs. discrete cycles (baseline OQ9) — mid-cycle re-planning
  within a cycle is in scope; replacing the cycle model is not.
- Migrating the authoring bot or any other agent onto DBOS. This change is
  AIM-specific.
- Migrating `sequence`, `emergent.memory`, or any other repo.
- A shared Go module for the DBOS adapter across repos — `sequence` already
  has its own `internal/durability`, built independently; nothing here
  presumes or requires convergence with it.
