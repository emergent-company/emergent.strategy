# Change: Harden AIM's execution layer for a dynamic, signal-driven future

> **Baseline:** `docs/UNIFIED_AGENT_ARCHITECTURE.md`. This change addresses
> baseline open questions 1, 2 and 10, and the layer-2 gap named in baseline §2.1.
>
> **Evaluate on capability needed at trajectory, not on today's six steps.** That
> error is drift-log entry 1 and it is the specific reason this change exists.

## Why

AIM runs on ADK's workflow graph. That was the right call for the shape it had,
and the cutover shipped clean (`adopt-adk-runtime-and-provider-seam`, B5). But it
placed the **durable-execution** concern on the **agent-runtime** layer, and three
consequences follow that will not improve on their own.

### 1. There is no step memoization, so `Retry` is unimplementable

`ADKEngine.Retry` returns an explicit error. The reason is recorded in its doc
comment: ADK has no session-level partial replay, so a fresh invocation restarts
from `workflow.Start` and would re-run every completed step. AIM steps cost
127K–230K LLM tokens each. Re-running `draft_assessment` because
`adapt_foundations` failed is not an acceptable retry.

This was accepted at the time on the evidence that production behaviour is
kill-and-restart (72% of dev-DB reruns started within 5 minutes of the previous one
dying) and that retry had zero test coverage anywhere. That is an accurate
description of a workaround, not an argument that the capability is unneeded.

**Step memoization — "restart replays completed results and resumes at the first
uncheckpointed step" — is the core primitive of every layer-2 engine.**

### 2. The graph is statically built, which caps how dynamic AIM can become

`BuildAIMGraph(name, steps)` runs once at `Register` time. `followsGate` is decided
at build time (`aim_graph.go:145`) because ADK hands the first node the triggering
message, which is type-indistinguishable from a reviewer's reply. `stepNames` is
recorded at registration.

For six fixed steps this is fine. For an AIM that selects steps per instance,
re-plans mid-cycle in response to a signal, or varies its gates by maturity, it is
a structural constraint — not a tuning problem. A layer-2 workflow is an ordinary
Go function; dynamic control flow is native to it.

### 3. Durable timers do not exist

Gate expiry is a sweep ticker with a 60-day threshold. There is no way to say
"escalate this gate in 5 days" or "resume this cycle on Monday". Signal-driven
operation needs both.

### Plus one live defect

`adk_sessions` has **no retention policy**. One session per cycle is disposable
once the cycle terminates; nothing deletes them. This is a slow leak in production
today (baseline open question 10) and is in scope here because it is the same
layer.

### Why now

The authoring bot (`add-artifact-assistant-bot`) will land soon and will drive
strategy edits, which trigger ripple, which trigger cycle proposals. AIM is about
to be exercised far more often and less predictably than it is today. The
`add-work-package-contract` push/pull design and the reconciler direction both
point the same way.

## What Changes

Deliberately staged: **evaluate before adopting.** No engine is presumed.

### Part A1 — Evaluation with kill criteria (no production code)

- **ADD** a decision record scoring layer-2 options against AIM's *needed
  capabilities*: step memoization, durable timers, dynamic control flow, park/wake,
  deterministic idempotency, and operability at one replica.
- Candidates: **DBOS Transact Go**, **Temporal**, **stay on ADK + build the missing
  pieces**, and **hand-rolled on Postgres**. Reuse `sequence`'s bake-off
  (`durable-execution-bake-off-2026-08-11.md`) as prior art rather than repeating it;
  the delta to establish is what differs for strategy-server, notably multi-tenancy
  and Zitadel-authenticated gates.
- **ADD** explicit kill criteria before any adoption, modelled on `sequence`'s. Note
  that `sequence`'s own kill criteria are **not yet recorded as passed** — its DBOS
  adoption is a live spike, so "sequence uses it" is not evidence.
- **ADD** a spike proving the chosen engine can resume a cycle parked at a gate
  across a real process kill, matching the existing bar in
  `internal/aimadk/restart_proof_test.go`.

### Part A2 — Retry, whichever engine wins

- **MODIFY** `ADKEngine.Retry` (or its successor) so a failed run resumes from the
  first uncompleted step rather than re-running completed ones.
- If A1 selects "stay on ADK", this is implemented by seeding a new session's
  `StateKeyStepResults` from the failed run's `RunStore` record — candidate design 2
  already recorded in the `Retry` doc comment. Verify by direct probe before
  building, as with every other ADK behaviour in this codebase.
- **ADD** test coverage for retry at engine and e2e level. It currently has none at
  any layer, which is why the gap went unnoticed.

### Part A3 — Session retention

- **ADD** a retention policy for `adk_sessions`: delete sessions for runs in a
  terminal state after a configurable window (`ADK_SESSION_RETENTION`, default 30
  days), with the sweep alongside the existing abandoned-gate sweep.
- **ADD** a metric or log line for sessions reaped, so the leak is observable.

### Part A4 — Dynamic-graph readiness (design only)

- **ADD** a design note on what changes if AIM's steps become instance-dependent or
  re-planned mid-cycle: per-run graph construction, `followsGate` at runtime, and
  what that does to step-log projection (`nodeNameFromPath`) and to the run panel.
- **Do not implement.** The purpose is to know the cost before the requirement
  arrives, and to avoid a decision in A1 that forecloses it.

## Impact

- **Affected specs:** `agent-runtime` (new requirements for retry semantics and
  session retention).
- **Affected code:** `internal/aimadk/engine.go`, `internal/aimadk/runstore.go`,
  `internal/adk/session_store.go`, `config/config.go`, a new migration for retention
  if the chosen approach needs one.
- **Not affected:** the AIM cycle's steps, the staging spine, `domain/skillexec`,
  the MCP surface, the run panel. This change is about how the cycle is *executed*,
  not what it does. `domain/aim` must remain engine-neutral — it currently imports
  no engine package at all, and that property is what makes A1 a real choice rather
  than a rewrite.

## Non-goals

- Making AIM dynamic. A4 is design-only.
- Reconciler vs discrete cycles (baseline open question 9) — this change must not
  foreclose either, and A1 should score candidates on both.
- Migrating any other repo. `sequence` and `emergent.memory` have made their own
  layer-2 decisions for their own reasons.
- Replacing ADK. Even if a layer-2 engine is adopted, ADK stays as the agent runtime
  — the two compose, which is exactly `sequence`'s split ("ADK remains responsible
  for planning, tools, and subagents").
