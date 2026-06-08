# Change: Work Package Contract — Tool-Agnostic, Four-Track Statement of Work

## Why

The implementation orchestrator (`apps/orchestrator`) currently reads OpenSpec
change files directly from the filesystem and assumes a single execution
substrate: coding agents producing git PRs (the `product` track). EPF is a
**four-track braided model** — `product`, `strategy`, `org_ops`, `commercial` —
and each track has its own implementation substrate:

| Track | Substrate | "Done" |
| --- | --- | --- |
| product | coding agents in git worktrees | merged PR |
| strategy | strategy-server itself (EPF AI phase + MCP write tools) — "strategy as code" | validated EPF artifact committed |
| org_ops | ecosystem partner **21st / twentyfirst** (async) | physical-world org/ops change executed |
| commercial | ecosystem partner **sequence** (async) | commercial action executed |

What is missing is a single, neutral handoff contract that (a) any authoring
tool can emit (OpenSpec, partner-native, or one we build) and (b) any executor
can consume, regardless of track. Today the binding between strategy and
execution is implicit — held in tools or people's heads — which breaks
tool-agnostic handover and four-track orchestration.

This change defines that contract: the **Work Package** (WP) — a bounded,
disposable execution unit, the equivalent of a ClickUp Work Package / Jira Epic,
that binds the three EPF execution references (Value Model paths, Definitions,
Key Results) into a scoped statement of work with a clear outcome and bounded
time and resources.

## Design Principles

1. **The SOW spine is three EPF references, never copies.** A Work Package
   targets `value_model_paths[]` (WHERE — the universal collision key),
   `definition_ids[]` (WHAT — high-level yet detailed SOPs), and `kr_ids[]`
   (the decided milestones / OUTCOME). All three are **many-to-many**: a WP
   advances multiple KRs and a KR spans multiple WPs. (1:1 was rejected — WPs
   would grow too large and KRs too numerous to stay meaningful.)

2. **Work Packages are disposable; strategy is stable.** Definitions and KRs are
   stable strategy (EPF's L2/L3). Overloading them as the unit of work is an
   explicit EPF anti-pattern ("FD = sprint backlog"). The WP is the correct home
   for the "not forever, clear outcome, bounded time/resources" property.

3. **The contract is thin; tasks are substrate-owned.** A WP declares outcome +
   targets only. Each execution substrate decomposes it its own way — sequence
   runs Shape-Up bets, 21st runs Nx projects, coding agents decompose to tasks
   at dispatch. Forcing a task model onto partners fights their grain.

4. **Footprint is derived server-side, never authored.** A WP's footprint (the
   orchestrator's collision key) is the union of its `value_model_paths` +
   `definition_ids`, computed by strategy-server from the targets — so it cannot
   be under-declared by an authoring tool.

5. **The Work Package is a canonical-EPF artifact type.** It originates in
   canonical-epf (the source of truth) and is synced into strategy-server at
   build via `task sync-embedded` — never invented in Go.

6. **Loose coupling: subscribe + heartbeat.** Status transitions emit
   subscribable journal events (push) that wake the orchestrator and the
   partners; the cron-based AIM heartbeat (pull) is the safety-net reconciler.
   WP outcomes (KR advancement) feed the AIM flow, closing the loop back to
   strategy re-assessment.

7. **Async partner handover; the WP is the shared state machine.** Org_ops and
   commercial work is slow and physical. The WP status state-machine is the
   single source of truth both sides poll/subscribe to — no synchronous RPCs
   between systems.

## What Changes

This change is a **design specification and coordination record**. The
implementing work lands in two external repositories, tracked by GitHub issues:

- **canonical-epf#21** — define the `work_package` artifact type (schema,
  template, wizard, relationship rules).
- **emergent.strategy#47** — adopt `work_package` in strategy-server
  (sync/decompose, footprint derivation, status state-machine, journal events,
  subscription hook, MCP tools).

Within this repo (`apps/orchestrator`), the future adaptation is:

1. **Authoring adapters (Stage 1).** Rename the orchestrator's `Change` type to
   a neutral `WorkPackage`, fed by adapters. OpenSpec becomes one adapter
   (change → WorkPackage); partner-native and custom tools are other adapters.
   Track 1 keeps the file-reading adapter; Track 2 hydrates WorkPackages from
   strategy-server's graph.

2. **Trigger (Stage 1→2).** The orchestrator subscribes to `work_package`
   status reaching `approved` (journal event), augmenting on-demand runs.

3. **Execution router (Stage 4).** A driver per `track`/`substrate`, all
   satisfying one `Execute(WorkPackage) → Result` interface: product →
   coding-agent/worktree (`implementation_run`); strategy → strategy-server MCP
   write tools; org_ops → 21st (async); commercial → sequence (async).

The deterministic wave scheduler and the strategic scorecard (already built) are
**unchanged** — they already schedule abstract units by footprint collision.

## Work Package — Contract Shape

```
WorkPackage
├─ id, title, intent          # human-meaningful (drives the scorecard semantic query)
├─ track                       # product | strategy | org_ops | commercial
├─ targets:                    # THE SOW SPINE — references, never copies
│   ├─ value_model_paths[]     # collision key + WHERE  (many-to-many)
│   ├─ definition_ids[]        # the SOPs / WHAT          (many-to-many)
│   └─ kr_ids[]                # milestones / OUTCOME     (many-to-many)
├─ footprint[]                 # DERIVED server-side = union(value_model_paths, definition_ids)
├─ status                      # proposed → approved → scheduled → executing → done  (+ cancelled)
├─ risk_class                  # drives Tier-3 strict/auto review
├─ substrate                   # coding-agent | strategy-mcp | partner:21st | partner:sequence
├─ source                      # authoring-tool provenance (openspec, custom, partner-native)
└─ lifecycle                   # created_at, target_close  (time-boxed, NOT eternal)
# tasks are NOT here — owned by the execution substrate
```

## Impact

- Affected specs: `strategy-orchestration` (extended)
- Affected code (future, this repo): `apps/orchestrator/internal/openspec` →
  neutral `WorkPackage` + adapter; new execution router. No code in this change.
- External dependencies: canonical-epf#21, emergent.strategy#47.
- No DB migration in this repo. No strategy-server changes in this repo.

## Non-Goals

- **Defining the schema here.** The `work_package` schema is owned by
  canonical-epf (#21), not invented in this repo.
- **Building the execution drivers now.** Stage 4 drivers (`implementation_run`,
  strategy-MCP, partner integrations) are later changes.
- **A task model on the WP.** Tasks are substrate-owned.
- **Per-track posture.** Unified for now; Tier-3 reasoning carries the
  priority-weighting nuance.
- **Replacing the AIM heartbeat.** Subscription augments, never replaces, the
  cron-based reconciler.
- **Synchronous partner coupling.** Partner handover is async via the WP status
  state-machine.
