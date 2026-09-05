# Decision record: AIM's execution-layer engine (Part A1)

> **SUPERSEDED (2026-09-04, same day).** The "stay on ADK" decision below was
> made on three assumptions that turned out to be wrong or incomplete within
> hours of writing it:
>
> 1. It weighted production risk (blue-green deploys vs. multi-week parks)
>    heavily. **strategy-server has no production deployment yet** — that
>    risk is a validation cost, not a production incident, while still in
>    dev. The whole point of kill criterion 1/2 (resume across a real
>    process kill / a real deploy) is that they're *testable directly*, not
>    theoretical, when there's nothing at stake.
> 2. It treated "AIM needs dynamic control flow" (revisit trigger 2, and
>    `dynamic-graph-readiness.md`'s sharpest capability gap) as speculative.
>    It is not — confirmed as near-term product intent directly, not
>    inferred from code shape.
> 3. It leaned on "wait for sequence's kill criteria to resolve." Re-checked
>    the same day: nothing moved (still open as of their most recent record),
>    and sequence has explicitly put Temporal and multi-replica **out of
>    scope until designated** for their own program — they are not going to
>    produce that answer soon, and strategy-server has more active usage to
>    validate against than their one synchronous `RunAndWait` workflow.
>
> Also freshly checked, not assumed: **DBOS Go reached v1.0 stable in August
> 2026**, retiring the "young SDK / breaking RC" risk this record leaned on.
> Conductor pricing ($99/mo, up to 3 apps) is not the blocker it was framed
> as either.
>
> **New direction:** adopt DBOS for real, validated in dev rather than
> spiked in isolation first — see the change that supersedes this one
> (to be scoped). Kill criterion 5 (`domain/aim` stays engine-neutral) is
> unchanged and still binding; it is what makes this reversal itself cheap.
> The capability scorecard and candidate research below remain accurate and
> are not re-litigated — only the adoption-timing conclusion changes.
>
> **Closing pointer (2026-09-04): shipped.** The superseding change is
> `openspec/changes/adopt-dbos-dynamic-aim` (36/42 tasks at last check, only
> documentation remaining). `internal/aimdbos.DBOSEngine` is the live
> orchestration engine; `internal/aimadk` (this decision's original answer)
> was deleted once parity was proven, including both dynamic-planning
> capabilities `dynamic-graph-readiness.md` (Part A4, below this decision
> in the original plan) scoped but did not implement. Kill criterion 5 held
> throughout: `domain/aim` imports no engine package, confirmed after the
> cutover the same way it was confirmed before.

> Output of Part A1. Read `design.md` first for the capability scorecard's
> derivation and the candidates' fuller descriptions — this document records
> the decision, the evidence for it, and what is explicitly **not** verified.
>
> **Scope honesty note.** This decision was produced as a desk evaluation:
> reading strategy-server's own code (`internal/aimadk`, `internal/adk`), and
> `sequence`'s primary bake-off documents in `~/code/sequence/docs/` directly
> (not secondhand summaries — re-derived per drift-log entry 2). It does
> **not** include standing up DBOS or Temporal against this codebase, because
> neither is currently a dependency here and doing so is a multi-day
> integration spike in its own right — the same order of effort `sequence`
> spent on its own bake-off. Tasks in `tasks.md` §1 that require a live
> candidate engine (the memoization probe, the deploy-survival probe, the
> SIGKILL spike against a real candidate) were not performed — see "What was
> not done in this session, and why" below for exactly which tasks are and
> are not closed.

## Decision

**Stay on ADK. Build retry (A2) and durable timers as a small, explicitly
named internal layer-2 module rather than adopting DBOS or Temporal now.**
Revisit this decision on the triggers listed at the end, not on a calendar.

This is a reversible choice, not a close-the-question-forever one: kill
criterion 5 (`domain/aim` stays engine-neutral) is what keeps it reversible,
and it holds trivially here because nothing changes about which engine sits
behind `orchestration.EngineAPI`.

## Why this is not drift-log error 1

The temptation this decision must avoid is "AIM's six steps cope today, so do
nothing." That is not the reasoning below. The reasoning is:

1. AIM's gates are **documented, not hypothetical**, as multi-week: the
   production `AbandonGatesAfter` default is 60 days, chosen because "no
   human gate in this system has ever been observed clearing" and the default
   favours a true duration over an early guess (`config/config.go`). A
   cycle's session — and, if DBOS were adopted, its workflow — must therefore
   be assumed to survive weeks to months of application deploys in between,
   not a demo's few minutes.
2. DBOS's own adopters name this exact scenario as their least-proven area.
   `sequence` adopted DBOS on 2026-08-24 (`ADR-057`) and as of that record —
   the most recent available — **still lists open**: "Railway redeploy
   mid-workflow on prod," "multi-executor / Conductor," "21-day HITL
   park/wake," and "kill-criteria pass/fail recorded"
   (`dbos-adopted-2026-08-24.md`). AIM's gate durations meet or exceed
   sequence's own unproven 21-day bar. This is not "sequence uses it, so it
   works" (drift-log error 7) — it is the opposite: sequence's own record
   says this specific capability is not yet proven, for a shorter park than
   AIM regularly holds.
3. The bake-off that produced that adoption independently names the same
   risk for DBOS specifically: "Blue/green deploys must keep old code alive
   until long workflows drain... AIM gates can stay open for weeks; this is
   a direct hit, not a theoretical one" (already recorded in `design.md`,
   re-confirmed here against the primary bake-off document,
   `durable-execution-bake-off-2026-08-11.md`: *"the documented blue/green
   strategy keeps old code alive until old workflows drain—a concern for
   21-day executions"*).
4. The three capabilities actually gained (step memoization, durable timers,
   dynamic control flow) are not free even on ADK, but they are **each
   individually tractable to build**, per the `Retry` doc comment's own
   candidate design 2 and `design.md`'s "stay on ADK" analysis. Choosing to
   build them is not "nothing changes" — it is picking the lower-risk way to
   get them.

None of this argues the current six steps are sufficient forever — point 4
above is explicitly about building new capability, not declining to. It
argues that the *engine-adoption* risk (young SDK, license constraint,
documented blue/green conflict) is concretely worse than the risk of writing
~200-400 lines of retry and timer code on a substrate (ADK + Postgres) this
codebase already operates and has already proven can survive a real
`SIGKILL` mid-cycle (`internal/aimadk/restart_proof_test.go`,
`TestADKEngine_SurvivesRealProcessKill` — still passing, re-run as part of
this change).

## Capability scorecard

Reproduced from `design.md` with the evidence source for each cell made
explicit. "Tractable" means individually buildable without adopting a new
engine, not "already done."

| Capability | ADK today | DBOS | Temporal | Stay-on-ADK (chosen) |
|---|---|---|---|---|
| Step memoization | ✗ (`Retry` unimplemented) | ✓ core primitive | ✓ activities + event history | Tractable — seed new session's `StateKeyStepResults` from `RunStore` (A2) |
| Durable timers | ✗ sweep ticker only | ✓ durable `Sleep` | ✓ durable timers | Tractable — durable row + existing sweep, same shape as A3 |
| Dynamic control flow | ✗ graph built at `Register` | ✓ workflows are plain Go | ✓ plain Go | Tractable but real cost — per-run graph construction (scoped, not built, in A4) |
| Park/wake | ✓ free (drive() just exits) | ✓ `Send`/`Recv` | ✓ Signals/Updates | ✓ (unchanged) |
| Deterministic idempotency | ✓ partial unique index | ✓ idempotency keys | ✓ | ✓ (unchanged) |
| One-replica operability | ✓ | ✓ *only* single-executor free tier; Conductor (multi-replica) is paid | ✓ (Cloud) but adds an external control-plane dependency | ✓ (unchanged) |
| Multi-tenant safety | ✓ concurrency key = instance_id | not evaluated against strategy-server's model — no integration exists | not evaluated | ✓ (unchanged) |

The bottom four rows are already satisfied and are not what the decision
turns on, matching `design.md`'s framing. The top three are where DBOS and
Temporal are strictly ahead **in principle** — the decision is that the
adoption cost of getting there now exceeds the value, not that the
capabilities are unneeded.

## Kill criteria (finalized)

Carried from `design.md`, each now paired with the test that would decide it
and its current status **for the chosen option** (stay on ADK):

| # | Criterion | Deciding test | Status for "stay on ADK" |
|---|---|---|---|
| 1 | A cycle parked at a gate cannot be resumed after a real process kill | `TestADKEngine_SurvivesRealProcessKill` (re-exec + `SIGKILL`) | **Already passes.** Re-run in this change; no regression. |
| 2 | A multi-week park cannot survive a deploy of new application code | No ADK-session-format-breaking change has occurred in this codebase's history; would need a dedicated deploy-compatibility test if this becomes a concern | Not separately tested — ADK sessions are our own Postgres rows (`internal/adk`), not a vendored binary format, so the deploy-compatibility risk that specifically threatens DBOS (blue/green code-drain) does not apply the same way. Noted as an assumption, not proven by a new test. |
| 3 | Step memoization does not prevent re-running a completed step | The A2 test in `tasks.md` §2 ("a run whose third step fails, retried, must not re-execute steps one and two") | **Not yet built** — this is A2's own acceptance test, tracked there, not blocked by this decision. |
| 4 | Operating it requires more than one replica or a paid component to be correct | N/A — no new component adopted | **Trivially satisfied.** |
| 5 | `domain/aim` can no longer stay engine-neutral | `grep` of `domain/aim`'s imports | **Verified now:** `domain/aim/{service,workflow}.go` import only `google/uuid`, `uptrace/bun`, and this repo's own non-engine packages. No `pkg/orchestration`, no ADK, no `aimadk`. Confirmed by direct inspection for this decision, not assumed from `design.md`'s prior claim. |

Criteria 1, 4, and 5 pass for the chosen option today. Criterion 3 is A2's
job, tracked separately. Criterion 2 is an assumption specific to ADK's
storage model (our own Postgres schema, not a vendored replay format) and is
flagged as such rather than claimed proven.

## What this decision does not resolve

- **The reconciler question (baseline OQ9).** Staying on ADK neither commits
  to nor forecloses a reconciler — that direction is orthogonal to which
  execution engine backs discrete cycles, and a reconciler could be layered
  on top of either choice later.
- **A4 (dynamic-graph readiness).** DBOS and Temporal would make dynamic
  control flow structurally free (workflows are plain Go functions); staying
  on ADK means per-run graph construction, which A4's design note (not yet
  written — see `tasks.md` §4) must cost out before AIM actually needs it.
  This decision does not pick a side on whether that cost is ever worth
  paying — it only declines to let an engine choice make the decision by
  default before the requirement exists.
- **River**, rejected on layer grounds per `design.md` — it solves queueing,
  a problem AIM does not have, not durability. Not revisited here.

## What was not done in this session, and why

Several `tasks.md` §1 items require a live candidate engine wired into this
codebase to answer:

- The step-memoization probe ("does the candidate engine's step memoization
  actually skip a completed step on resume, as a failing-if-it-re-runs
  test") — requires DBOS or Temporal to be an actual dependency here.
- The deploy-survival probe (kill criterion 2) against a real candidate.
- A SIGKILL spike against a real candidate engine, as opposed to the
  existing ADK proof.

None of these were performed. Standing up either engine, wiring a spike
workflow, and running the failure matrix `sequence`'s own bake-off used
(`durable-execution-bake-off-2026-08-11.md` §5, a 1–2 week plan) is out of
proportion to what this decision needed, given the decision is *not* to
adopt either engine right now. If a future review overturns this decision,
those probes become required before adoption, not optional — do not adopt
DBOS or Temporal on the strength of this document alone; it explicitly did
not clear those criteria for either candidate.

## Revisit triggers

Revisit this decision, rather than the calendar, when any of:

1. `sequence` records its kill criteria pass/fail (`dbos-adopted-2026-08-24.md`'s
   "still open" list resolves) — its Railway-redeploy and 21-day-park results
   transfer close to directly, since AIM's gate profile is similar or longer.
2. AIM needs actual dynamic control flow (A4 stops being design-only), at
   which point per-run ADK graph construction's real cost should be weighed
   against DBOS/Temporal's native support for it at that time, not today's.
3. Strategy-server's deployment model changes from one replica to a scaled
   multi-replica requirement, at which point DBOS's Conductor/paid-tier
   constraint needs a real answer rather than being moot by default.
4. A2's retry implementation (session-reseed approach) turns out not to work
   cleanly in practice — its own probe (`tasks.md` §2, checking whether
   `snapshot_cycle`'s `Prior` lookup reads seeded state correctly) is the
   first real test of whether "stay on ADK" is as tractable as this document
   assumes.
