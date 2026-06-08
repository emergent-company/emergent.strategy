# Change: Implementation Orchestrator — Wave Planner and Strategic Scorecard

## Why

Strategy-server answers *what* to build and *why* (EPF artifacts), and the
EPF → OpenSpec pipeline produces *spec'd, human-signed-off* units of work. What
is missing is the layer that takes a backlog of signed-off OpenSpec changes and
turns it into an *autonomous, parallel-safe implementation schedule* with the
right human-in-the-loop gates.

Today that coordination is manual: a human holds the cross-change picture in
their head, decides which changes are safe to start in parallel, and babysits
each implementation. This does not scale, and it is exactly the failure mode
that naive parallelism makes worse — two changes touching the same capability
will collide and silently produce incoherent merges.

This change introduces a **standalone orchestrator** — a separate system from
strategy-server, connected only by an explicit handoff — whose first capability
is a **deterministic wave planner**: it reads OpenSpec changes, derives each
change's footprint (the specs it touches), and computes parallel-safe waves so
that no two changes in the same wave can collide. On top of the deterministic
schedule it layers a **strategic scorecard** that interrogates strategy-server
over MCP (the grounded equivalent of a "CEO review") and surfaces tensions for a
human to resolve — it never auto-decides.

## Design Principles

1. **Clean cut between strategy and execution.** The orchestrator is a separate
   Go module (`apps/orchestrator/`). It never imports strategy-server internals.
   It reads the OpenSpec change artifacts (the explicit handoff) and, for the
   scorecard, acts purely as an *MCP client* of strategy-server. Strategy-server
   has no knowledge that the orchestrator exists.

2. **The orchestrator interrogates strategy; it never mutates it.** The
   scorecard reads strategy via MCP and produces advisory output. Any strategic
   judgment (e.g. "this change should be re-scoped") is surfaced as a flag for
   the human sign-off gate, never written back to strategy automatically.

3. **Deterministic scheduling, advisory scoring.** Collision safety is derived
   purely from declared footprints — fully deterministic, no LLM, no external
   calls. The strategic scorecard is a separate, advisory layer that preserves
   the dimensionality of conflicting signals rather than collapsing them into a
   single verdict.

4. **Whole-change granularity.** Each change is scheduled as one unit dispatched
   to one agent in one isolated worktree. Two changes that share a footprint are
   mutually exclusive and land in different waves.

5. **Endpoint-as-config.** The strategy-server MCP endpoint is configurable so
   the same binary runs locally (Track 1) or against a cloud deployment
   (Track 2).

## What Changes

### Implemented in this change (deterministic core)

1. **New standalone module `apps/orchestrator/`** — own `go.mod`, added to
   `go.work`. Independent of strategy-server.

2. **OpenSpec change parser** (`internal/openspec/`) — read-only discovery of
   changes under `openspec/changes/`: footprints from `specs/*/` subdirectories,
   task progress from `tasks.md`, cross-change references from `tasks.md` (the
   "subsume, don't duplicate" reconciliation signal), title from `proposal.md`.
   Tolerates zero-footprint changes and missing files.

3. **Deterministic wave scheduler** (`internal/plan/`) — greedy footprint
   graph-coloring producing ordered, parallel-safe waves; a collision map of
   shared footprints; a list of changes needing human reconciliation; and a
   skip list for completed changes. Fully deterministic output.

4. **`planner` CLI** (`cmd/planner/`) — renders the wave plan, collision
   hot-spots, reconciliation flags, and skip list. Flags: `--changes`,
   `--include-completed`, and `--mcp-endpoint` (reserved for the scorecard).

5. **Tests** for the parser and scheduler covering: footprint extraction, task
   counting, archive/dotfile skipping, zero-footprint changes, cross-ref
   detection, collision separation, chained collisions, completed-change
   skipping, reconciliation flagging, and determinism.

### Implemented in this change (strategic scorecard layers)

6. **MCP client** (`internal/mcp/`) — endpoint-as-config, dependency-free
   JSON-RPC client over MCP streamable HTTP (JSON + SSE), optional bearer token,
   and tool discovery that auto-enables the scorecard tool categories via
   `set_tool_filter`. Degrades gracefully when the endpoint is unreachable.

7. **Strategic scorecard** (`internal/score/`) — five independently-scored
   dimensions per change: traceability, contradiction, maturity (grounded in
   facts), scope/adjacency (reported as a Signal, not a faked-precision grade),
   and sequencing vs roadmap. Each dimension is fail-soft (Unavailable on a tool
   error) and carries cited evidence. The scorecard has NO single verdict field.

8. **Posture-configurable weighting** — presets (balanced, venture-early,
   scaling) plus a `--posture` flag. Weights drive an *attention ranking*
   (inverse-confidence: which changes need human review first), never a
   pass/fail verdict.

9. **Tension flags** — explicit, named tensions where strong signals conflict
   (e.g. high traceability on weak maturity), fed to the human gate.

10. **Machine-readable output** — `--json` emits the full report (plan + ranked
    scorecards), the future work-order payload, alongside the terminal view.

### Remaining (future change — not in scope here)

- **Agent dispatch / execution** — the `implementation_run` workflow that
  consumes the work order and drives coding agents in isolated worktrees. This
  is a separate change against strategy-server's existing `pkg/orchestration`
  engine (see Non-Goals).

## Impact

- Affected specs: `strategy-orchestration` (new)
- Affected code:
  - `apps/orchestrator/go.mod` — new module
  - `apps/orchestrator/internal/openspec/` — change parser (+ tests)
  - `apps/orchestrator/internal/plan/` — wave scheduler (+ tests)
  - `apps/orchestrator/cmd/planner/` — CLI entry point
  - `go.work` — add `./apps/orchestrator`
- No DB migration. No changes to strategy-server.

## Non-Goals

- **Agent dispatch / execution.** This change plans waves and scores changes;
  it does not run coding agents, create worktrees, open PRs, or write back
  results. That is a later change (the `implementation_run` workflow on
  strategy-server's existing `pkg/orchestration` engine).
- **Replacing OpenSpec.** The OpenSpec format and Node CLI remain the authoring
  tool. The orchestrator only *reads* the change artifacts.
- **Auto-resolving strategic tensions.** Conflicting strategic signals are
  surfaced for human decision, never resolved automatically.
- **Mutating strategy.** The orchestrator is read-only with respect to
  strategy-server.
- **Postgres-backed change storage.** Track 1 reads `openspec/changes/` files
  directly. Hydrating changes from strategy-server `spec_proposal` artifacts is
  a future Track-2 evolution that leaves the scheduler/scorecard unchanged.
