# Change: Strategic Review Agent (Tier 3) — Grounded Dialogue and Bounded Autonomy

## Why

The implementation orchestrator (`add-implementation-orchestrator`) produces two
tiers of output:

- **Tier 1** — a deterministic, parallel-safe wave plan.
- **Tier 2** — a scripted five-dimension strategic scorecard that fires a fixed
  set of read-only MCP queries against strategy-server and surfaces tensions.

Tier 2 extracts *facts* from the strategy graph but cannot extract *judgment*. It
asks the same questions of every change and never follows a thread. For the
genuinely contested changes — the ones where strong signals conflict and a human
will have to think hard anyway — a fixed query list is too shallow.

Strategy-server is not just a database: it is a semantic graph with memory. That
makes a *dialogue* possible — an agent that reasons with strategy-server over
several turns, following the graph where the interesting tension is, the way one
would talk to a strategy manager in real time. This change adds that capability
as **Tier 3**: a grounded, turn-bounded reasoning loop that produces a strategic
judgment for contested changes.

Tier 3 is layered on top of Tier 2, not a replacement. Tier 2 is the cheap triage
filter that decides which changes are worth an expensive conversation.

## Design Principles

1. **Tier 3 is advisory reasoning; the scheduler stays deterministic.** The
   dialogue agent lives strictly in the review/scorecard layer. It NEVER
   influences wave scheduling — collision safety must never depend on an LLM.

2. **Interrogate, never mutate — enforced by construction.** The agent is given
   a read-only MCP tool allowlist. Write tools are physically absent from its
   toolset, so the clean cut between strategy and execution survives contact with
   an autonomous LLM. The agent cannot mutate strategy because it has no tool to
   do so.

3. **Bounded reasoning.** The dialogue is a turn-budgeted loop, not open-ended
   chat. Cost and latency are bounded; output is a structured Judgment, not prose.

4. **Triage with the cheap tier first.** Tier 3 runs only on changes whose Tier 2
   attention rank exceeds a threshold (the contested ones with tensions). Aligned,
   clean changes skip the conversation entirely.

5. **Autonomy is earned and bounded, not a toggle.** "Auto mode" is not strict
   mode with the human removed. The agent and its reasoning are identical in both
   modes; only a thin policy layer differs in what happens to the judgment. Auto
   mode decides only when safe and escalates to a human otherwise.

## Modes

The dialogue agent produces a structured Judgment in both modes. A policy layer
decides what happens to it.

### Strict mode (default)

The Judgment becomes a recommendation rendered to the human-in-the-loop gate.
The human approves, modifies, or rejects. Only approved changes are dispatched.
The agent's confidence and residual risk are shown to inform the human but never
change the flow — a human always decides.

### Auto mode (graduated, bounded)

The Judgment becomes a decision, but only when ALL guardrails pass:

- confidence ≥ configured threshold, AND
- residual risk is low, AND
- recommendation is `proceed` or `proceed-with-changes`, AND
- no hard-stop tension (e.g. an unresolved contradiction), AND
- the change's risk class permits auto (see below).

If any guardrail fails, auto mode **escalates** — it falls back to strict and
routes the change to a human. Auto mode is therefore "decide when safe, escalate
when not," not "always decide."

Additional auto-mode safeguards:

- **Per-change-class scoping.** Auto is enabled per risk class, never globally.
  Changes touching high-risk footprints (e.g. `north_star`, hot value paths,
  high-contention specs) are always strict regardless of confidence.
- **Full provenance.** Every auto decision produces the same Judgment artifact a
  strict recommendation would, records `auto-decided` with the reasoning chain,
  and remains reviewable after the fact.
- **Reversibility backstop.** Auto decisions dispatch work to execution, which
  produces PRs. The merge gate remains human even in auto mode (at least
  initially), so the worst case is an unnecessary PR, never unreviewed code on
  main.

Autonomy is a trust gradient climbed one change-class at a time:
`strict → scoped auto (merge-gated) → wider auto as trust compounds`.

## What Changes

1. **New package `apps/orchestrator/internal/review/`**:
   - `agent.go` — the turn-bounded dialogue loop. Input: a contested change plus
     its Tier 2 scorecard. Calls strategy-server over a read-only MCP tool
     allowlist. Output: a structured `Judgment` (recommendation, reasoning chain
     with cited evidence, confidence, residual risk).
   - `policy.go` — strict vs auto policy; the auto guardrails and escalation.
   - `gate.go` — the human-in-the-loop interface (render recommendation, capture
     approve/modify/reject).

2. **Triage integration.** The planner runs Tier 3 only on changes above a
   configurable attention threshold from the Tier 2 ranking.

3. **Read-only tool allowlist.** A constrained MCP toolset (search, neighbors,
   contradictions, roadmap, artifact reads) handed to the agent. Write tools are
   excluded by construction.

4. **CLI surface.** `--review` to enable Tier 3, `--mode strict|auto`,
   `--auto-confidence`, `--attention-threshold`, `--auto-risk-classes`.

5. **LLM provider seam.** A pluggable model interface so the reasoning model is
   configurable (orchestrator-side, preserving the clean cut).

## Impact

- Affected specs: `strategy-orchestration`
- Affected code:
  - `apps/orchestrator/internal/review/` — new package
  - `apps/orchestrator/cmd/planner/` — Tier 3 flags + triage wiring
- No DB migration. No changes to strategy-server (read-only MCP client only).

## Dependencies / Build Order

- **Blocked on Tier 2 live validation.** Tier 3 reasons over strategy-server's
  real MCP tools. The Tier 2 tool names are currently unverified guesses. Tier 3
  must not be implemented until Tier 2 has run against a live strategy-server and
  the read-only tool surface is confirmed.

## Non-Goals

- **Agent dispatch / code execution.** Tier 3 produces judgments and (in auto
  mode) decisions; it does not run coding agents. Execution remains the future
  `implementation_run` workflow.
- **Auto-merge.** The merge gate stays human even in auto mode (initially).
- **Mutating strategy.** The agent is read-only by construction.
- **Global auto mode.** Auto is always scoped by change-risk-class.
- **Influencing wave scheduling.** Tier 3 never touches the deterministic plan.
- **Open-ended chat.** The dialogue is turn-budgeted and produces structured
  output.
