# Design note: dynamic-graph readiness (Part A4)

> Written design-only, per the proposal's non-goals at the time — nothing
> here was implemented when this note was first written. **Status update,
> 2026-09-04: both capabilities below are now implemented, in
> `openspec/changes/adopt-dbos-dynamic-aim`**, on the DBOS engine this
> note's own cost table (below) predicted would make them tractable. See
> "What actually shipped" at the end of this note for how the real
> implementation compared to the prediction. The analysis below is kept
> as-written — it is the reasoning that justified building on DBOS, not
> a stale prediction superseded by the outcome.
>
> Purpose: know the cost of instance-dependent or mid-cycle-replanned AIM
> steps before the requirement arrives, and feed that cost into `decision.md`
> (A1) as an input, not derive it from A1's choice. It was written before A1
> was finalized, per `design.md`'s sequencing note, though both land in the
> same change.

## What "dynamic" would mean, concretely

Two distinct capabilities get bundled under "dynamic AIM" and should not be:

1. **Instance-dependent step selection.** Different instances run different
   subsets or orderings of steps — e.g. a young instance skips
   `adapt_foundations`, a mature one adds a step the six-step cycle doesn't
   have today. Known at cycle-start time.
2. **Mid-cycle re-planning.** A signal arriving *during* a running cycle
   changes what the remaining steps should be — e.g. new evidence invalidates
   `adapt_strategy`'s premise while `align_portfolio` hasn't run yet. Not
   known until partway through execution.

(1) is the cheaper capability by a wide margin under every candidate. (2) is
what actually stresses the current architecture, described below.

## What changes under the current architecture (stay on ADK)

### `BuildAIMGraph` runs once, at `Register`

`internal/adk/aim_graph.go`'s `BuildAIMGraph(name, steps)` is called once per
workflow name in `ADKEngine.Register` (`internal/aimadk/engine.go`), and the
resulting `agent.Agent` — and the `runner.Runner` built from it — are cached
in `e.runners[workflowName]` for the engine's lifetime. `StartRun` always
resolves the same runner for a given workflow name.

**For (1), instance-dependent selection:** this becomes per-instance graph
construction. `Register`'s one-time call becomes a `BuildAIMGraph` call
inside `StartRun`, keyed by whatever varies the step list (instance maturity
tier, a feature flag, an explicit plan). The runner cache
(`e.runners map[string]*runner.Runner`) would need to key on that dimension
too, or be rebuilt per run — graphs are cheap to construct (`BuildAIMGraph`
does no I/O), so rebuilding per `StartRun` is plausible without a cache at
all. This is a genuinely small change.

**For (2), mid-cycle re-planning:** there is no clean answer under ADK's
model. A running graph's node sequence is fixed once `runner.Run` starts;
`workflow.Chain(nodes...)` is static per invocation. Re-planning would mean
either (a) treating each step as its own micro-cycle with a fresh
`StartRun`-equivalent per step, giving up the single-session-per-cycle
property this codebase currently relies on for cheap gates, or (b) building
a custom ADK node whose body decides which step logically comes next and
dispatches accordingly — at which point the "graph" is one big node with
hand-rolled control flow, and `nodeNameFromPath` step-log projection (below)
stops meaning anything.

### `followsGate` is decided at build time, and this is load-bearing, not incidental

`aim_graph.go`'s `followsGate := i > 0 && steps[i-1].HumanGate` exists because
ADK hands the first node in a chain the *triggering* message when a run
starts, and the *reviewer's reply* when a run resumes after a gate — and
these are type-indistinguishable. The graph resolves the ambiguity
structurally: a node downstream of a gate is defined, at construction time,
to expect a reply.

Under (1), this is unaffected — each per-instance graph still knows its own
gate positions at its own construction time, which still precedes any run of
it.

Under (2), this breaks: if a step can be inserted or removed *after* a run
has already started (and possibly already passed a gate), the "is this node
downstream of a gate" fact is no longer knowable at construction time,
because the graph doesn't have its final shape yet when it starts running.
Resolving this would need a runtime signal distinguishing "triggering
message" from "reviewer reply" independent of graph position — e.g. a typed
envelope instead of a bare `genai.Content`, which is a change to how `drive()`
constructs its initial message in `internal/aimadk/engine.go`, not just to
graph construction.

### Step-log projection (`nodeNameFromPath`) assumes a stable, known node set

`internal/aimadk/engine.go`'s `nodeNameFromPath` recovers a step name by
parsing `NodeInfo.Path` (`"<name>@<n>"` or `"<parent>/<name>@<n>"`), and
`drive()` uses `stepIndex` (built from `e.stepNames[workflowName]`, itself
recorded once at `Register`) to place each event into the right slot of
`run.Steps`. The run panel renders `run.Steps` directly.

Under (1), `e.stepNames` needs to become per-run rather than per-workflow —
tractable, since `StartRun` already knows which run it's building and could
carry the resolved step list alongside the graph.

Under (2), a step appearing mid-run that wasn't in the pre-populated
`run.Steps` placeholder list (see `drive()`'s "Pre-populate a pending
placeholder for every registered step" comment) would show up as a new
entry appended to `run.Steps`, not a pending one turning "done" — the run
panel's rendering assumption ("here is the pipeline, upfront, filling in")
would need to change to "here is the pipeline so far, which may grow."

## Cost by candidate (input to A1, not an output of it)

| | Instance-dependent (1) | Mid-cycle re-planning (2) |
|---|---|---|
| **Stay on ADK** | Small — per-run graph construction, per-run step-name list | Large — no clean model; effectively requires either per-step micro-cycles or abandoning the graph abstraction for a hand-rolled dispatch node |
| **DBOS** | Trivial — workflows are plain Go functions, so instance-dependent branching is just an `if` | Native — a running workflow can call arbitrary Go logic to decide its next step; this is exactly durable execution's normal shape |
| **Temporal** | Trivial — same reasoning as DBOS | Native — same reasoning, with `Continue-As-New` available if replanning grows the history significantly |

This is the sharpest capability gap DBOS/Temporal offer over staying on ADK,
and it is what `decision.md`'s revisit trigger 2 refers to: if (2) becomes an
actual requirement rather than a hypothetical, this cost table — not a fresh
re-litigation of park/wake or step memoization — is what should drive the
re-evaluation, because (2) is the one place "stay on ADK" does not have a
tractable answer today.

## What this note does not do

It does not propose implementing (1) or (2). It does not pick a side on
whether the reconciler direction (baseline OQ9) and mid-cycle re-planning are
the same question — they are related (a reconciler implies work can change
between iterations) but not identical (a reconciler could still run a fixed
step list per iteration). That relationship is left for whichever change
actually takes up OQ9.

## What actually shipped (2026-09-04, `adopt-dbos-dynamic-aim`)

The "Native" prediction in the cost table held, with one refinement the
prediction didn't anticipate: DBOS workflows being "plain Go functions" is
necessary but not sufficient — a live DB read (Planner.Plan) or a live
Recv call inside that function must still be treated carefully under
replay, or a re-plan decision could silently change on a crash-recovery
that shouldn't have re-derived it. In practice this meant:

- **(1), instance-dependent selection**, shipped as
  `domain/aim.Planner.Plan(ctx, instanceID, completed) ([]string, error)`,
  resolved once in host code (`DBOSEngine.StartRun`) *before* the workflow
  even starts — not inside it. This is a stronger, simpler answer than the
  note anticipated ("workflows are plain Go functions, so this is just an
  `if`"): it doesn't need to be an `if` inside the workflow at all, because
  the decision only ever needs a fast config read with no bearing on
  replay safety, so there's no reason to run it under DBOS's execution
  model in the first place.
- **(2), mid-cycle re-planning**, shipped via `DBOSEngine.Replan` +
  `dbos.Send`/`Recv` on a fixed topic, checked only at step boundaries
  (never mid-step, confirmed by test:
  `TestDBOSEngine_Replan_DoesNotInterruptAStepAlreadyInFlight`). The one
  real complication the "Native" framing undersold: a naive per-boundary
  `dbos.Recv`-with-timeout poll produces a WARN-level "timeout reached" log
  from DBOS itself at every boundary of every cycle that never uses this
  feature — cheap computationally, noisy operationally. Fixed with a
  `RunStore.ReplanRequested` flag checked first (a plain DB read, no DBOS
  log), only calling `Recv` when it is actually true.

The `followsGate`-at-build-time and `nodeNameFromPath` concerns this note
raised for staying on ADK are moot under DBOS specifically because they
were ADK-shaped problems: DBOS's step ledger is queried by ID, not parsed
from a node-path string, and there is no "triggering message vs. reviewer
reply" type-ambiguity to resolve, since `dbos.Recv`'s payload type is
explicit at the call site.
