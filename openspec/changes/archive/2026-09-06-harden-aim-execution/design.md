# Design: Hardening AIM's execution layer

## Context

AIM currently uses ADK's workflow graph for both **orchestration** (which step runs
next, where a gate pauses) and **durability** (surviving a restart). Those are
different layers, and `sequence`'s job-class matrix says so explicitly, classifying
ADK as *"Not a durability engine."*

The conflation is not currently causing outages, because AIM's gate-park is unusually
cheap: the driving goroutine exits, nothing is held in memory, and `adk_run_metadata`
answers every cross-run question. What it costs is **capability**: no step
memoization, no durable timers, no dynamic control flow.

## The capability scorecard

A1's output. Score candidates on what AIM needs, not on what it currently does.

| Capability | Needed because | ADK today |
|---|---|---|
| **Step memoization** | steps cost 127K–230K tokens; retry must not re-run them | ✗ — the direct cause of unimplementable `Retry` |
| **Durable timers** | gate escalation, scheduled resume, signal-driven wake | ✗ — sweep ticker only |
| **Dynamic control flow** | instance-dependent steps, mid-cycle re-planning | ✗ — graph built at `Register` |
| **Park/wake** | human gates, days to weeks | ✓ — and free, because gates hold nothing |
| **Deterministic idempotency** | overlapping triggers must not double-apply | ✓ — via the partial unique index |
| **One-replica operability** | current deployment | ✓ |
| **Multi-tenant safety** | many instances, one server | ✓ — concurrency key is `instance_id` |

Note the shape: AIM already has the bottom four. **The decision is entirely about the
top three**, which is a narrower question than "should we adopt a workflow engine".

## Candidates

### 1. DBOS Transact Go

Closest match to the three gaps: step memoization is its core primitive,
`Send`/`Recv` gives durable park/wake with timeouts, durable `Sleep` gives timers,
and workflows are plain Go functions so dynamic control flow is native.

Genuine risks, from `sequence`'s own evaluation, not from vendor material:
- Free license permits **one executor per application**; Conductor (needed for
  distributed recovery) is proprietary and paid.
- Young SDK — `v0.20.0` stable at their evaluation with a breaking `v1.0.0-rc.1`.
- Blue/green deploys must keep old code alive until long workflows drain. AIM gates
  can stay open for weeks; this is a direct hit, not a theoretical one.
- **`sequence`'s kill criteria are not recorded as passed.** Four items remain open,
  including 21-day HITL park/wake and Railway redeploy mid-workflow.

Additional delta for strategy-server that `sequence` did not have to evaluate:
multi-tenancy (many instances per server) and gates authenticated through Zitadel
rather than an operator UI.

### 2. Temporal

Ranked first on raw capability in `sequence`'s bake-off; ranked second overall for
their constraints. Mature Go SDK, official ADK Go integration. Cost is a separate
control plane, a deterministic-Go discipline, and a much larger operational surface
than a single Go service currently warrants.

Keep as the documented fallback, exactly as `sequence` did.

### 3. Stay on ADK and build the missing pieces

Not a null option — it is what `emergent.memory` did, and it works. Retry becomes
"seed a new session's `StateKeyStepResults` from the failed run's `RunStore`
record". Timers become durable rows plus the existing sweep. Dynamic control flow
becomes per-run graph construction.

Honest assessment: each piece is individually tractable, and together they are a
bespoke layer-2 engine. That is the footgun `sequence`'s bake-off names — *"Teams
can accidentally build a bespoke workflow engine around it"* — and the one
`emergent.memory` walked into, producing a 29,369-job queue explosion.

The mitigating difference: AIM's fan-out is bounded (one cycle per instance,
enforced by a unique index), so the specific explosion mode does not apply. This
option is more defensible here than it would be for a spawn-heavy agent.

### 4. River

**Rejected on layer grounds, recorded so it is not revisited.** River is a job
queue. Its own characterisation in the bake-off: *"execution restarts the job
function rather than resuming a workflow checkpoint"* and *"No native parked
workflow."* It would solve a problem AIM does not have (queueing) and not the three
it does.

River may still be right for strategy-server's **layer 1** — the heartbeat is a bare
ticker today — but that is a separate change.

## Decision framing

The question is **not** "is DBOS good". It is:

> Is AIM's trajectory dynamic enough, and is retry valuable enough, to justify
> adopting a young layer-2 engine with a one-executor license and a blue/green
> constraint that collides with multi-week gates?

Reasonable answers differ. What must not happen is deciding by inertia — which is
what "AIM's six steps cope today" amounts to.

### Kill criteria (draft, to be finalised in A1)

Adoption is reverted if any fail:

1. A cycle parked at a gate cannot be resumed after a real process kill (the bar
   `restart_proof_test.go` already sets for ADK).
2. A multi-week park cannot survive a deploy of new application code.
3. Step memoization does not actually prevent re-running a completed step on retry,
   verified by a test that fails if it re-runs.
4. Operating it requires more than one replica, or a paid component, to be correct
   rather than merely faster.
5. `domain/aim` can no longer stay engine-neutral.

Criterion 5 is the important one for reversibility: the reason A1 is a real choice
is that `domain/aim` imports no engine package. Any candidate that forces engine
types into the domain layer costs the option to change again.

## Sequencing

A1 (evaluate) → A2 (retry) and A3 (retention) in parallel → A4 (design note).

A3 is independent of the outcome and should not wait — it is a live leak.

A2's implementation depends on A1, but its **tests** do not. Write the retry test
first, against the current engine, and let it fail. It then becomes the acceptance
criterion for whichever engine wins.

## Open questions

1. Does the evaluation include the reconciler question (baseline OQ9), or assume
   discrete cycles? Recommendation: score both, decide neither — but reject any
   candidate that forecloses the reconciler.
2. If "stay on ADK" wins, do we still write the retention and timer pieces as a
   named internal layer-2 module rather than scattering them through `aimadk`? That
   is the difference between a deliberate small engine and an accidental one.
3. Does the authoring bot share whatever layer-2 mechanism AIM lands on? Its needs
   are lighter (a conversation does not need step memoization) but its parks are
   real. Defer until B ships, but do not choose something that excludes it.
