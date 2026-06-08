## Context

We want a free starter edition (North Star + a slim roadmap with KRs) for all 21st
users, as an on-ramp to the full product. A codebase survey found **no plan/tier/
entitlement concept anywhere** — all gating dimensions are static and unconditional.
Optional subsystems (Memory, LLM, GitHub) already follow a clean "configured → degrade
gracefully" idiom, and the commit-path engine is broadly nil-safe on a partial graph.
Two components actively misbehave on a slim instance and must become edition-aware:
the AIM heartbeat (`domain/aim/service.go:223`, `domain/heartbeat/service.go:154`) and
the lifecycle detector (`internal/mcpserver/lifecycle.go:115-133, 373`).

Key fact: **KRs are not separate artifacts** — they are nested inside the
`roadmap_recipe` payload (`delivered_by_kr`/`linked_to_kr` relationships,
`models.go:193-194`). So "North Star + KRs" = `north_star` + `roadmap_recipe`.

## Goals / Non-Goals

- Goals:
  - A plan/entitlement model with two editions (`starter`, `full`) and a single resolved
    `Entitlements` value object.
  - A starter instance that is a coherent, scoped subset — engine loops gated, not broken.
  - A non-destructive upgrade path to full (starter graph is a strict subset).
- Non-Goals:
  - Billing/payment integration (plan is set/changed administratively in v1).
  - More than two editions, usage-metering beyond a simple instance-count limit.
  - Rewriting the engine; we gate loops, not re-architect them.

## Decisions

- **Decision: `plan` on `Org`, optional `edition` override on `StrategyInstance`.**
  Org is the billing/ownership root (aligns with `enrich-org-ownership-model`). The
  instance override allows mixed-edition orgs and gives the engine per-instance
  granularity (which is where nearly all gating hooks operate). Resolution: instance
  edition if set, else org plan.
  - Alternatives: plan only on Org (too coarse — engine gates are per-instance);
    plan only on instance (loses the billing/ownership home). Rejected both.

- **Decision: a single `Entitlements` value object resolved from plan/edition.**
  Contains allowed phases, allowed artifact types, allowed MCP tool categories, engine-loop
  flags, instance limit. UI, MCP filter, and engine loops all read it. Avoids scattered
  per-surface plan checks.
  - Alternative: ad-hoc `if plan == "starter"` checks at each hook. Rejected — drifts.

- **Decision: introduce a central artifact-type registry.** Today the artifact→phase map
  is duplicated in ≥6 places (export paths `server.go:843`, version categorization
  `handler_versions.go:448`, AIM step map `handler_aim_orchestrator.go:466`, import map
  `parse.go:119`, lifecycle missing-set `lifecycle.go:96`, ripple foundation keys
  `postcommit.go:265` + `register_ripple_tools.go:603`). The entitlement allowlist needs a
  single `type → {phase, editions}` map; consolidating fixes the existing duplication.
  - This is scoped to introducing the registry and pointing consumers at it; it overlaps
    with the bootstrap-flow "ghost artifact" cleanup and should share the registry.

- **Decision: route gating is request-time middleware, not skipped registration.**
  Routes are registered once at startup (`handler.go:251`); a starter instance is a
  per-request property. Gated screens redirect to an upgrade page (not 404). Tab/sub-nav
  rendering is already per-request and can be filtered directly.

- **Decision: MCP gating = filter (visibility) + per-handler guard (enforcement).**
  `toolCategoryFilter` (`tool_filter.go:283`) currently has only session context; thread
  the resolved entitlements in. Because a client can call a hidden tool, gated tools also
  get a per-handler "not available on this plan" structured error.

- **Decision: gate the AIM heartbeat for starter, leave commit-path engine alone.**
  The ripple/convergence/ingest post-commit pipeline (`postcommit.go`) is nil-safe and
  degrades cleanly — it just finds fewer signals. The AIM heartbeat is the one loop that
  misbehaves (immediate time-trigger → cycle proposals), so skip starter instances in
  `EvaluateAll` / short-circuit `EvaluateTriggers`.

- **Decision: upgrade is additive, no data migration.** Starter graph (north_star +
  roadmap) is a valid subset of the full graph. `UpgradePlan` flips edition, installs the
  full pack, enables gated capabilities; the bootstrap genesis flow fills the rest.

## Risks / Trade-offs

- **Risk: scattered artifact maps make a partial allowlist leak (a gated artifact still
  reachable via export/import/version views).** → Consolidate into the registry and route
  all consumers through it; test that no gated type is reachable on starter.
- **Risk: MCP visibility/enforcement mismatch.** → Per-handler guards + a test asserting
  a starter caller cannot execute a full-only tool even if it calls it directly.
- **Risk: heartbeat gate interacts with `add-continuous-strategy-loop` changes.** →
  Implement the gate in `EvaluateAll`/`EvaluateTriggers` so it composes with that work;
  coordinate ordering.
- **Risk: lifecycle detector and other "you're incomplete" messaging confuses starter
  users.** → Make the detector edition-aware; starter set = complete.
- **Risk: entitlement resolution adds a DB read on hot paths (every request/tool call).**
  → Cache resolved entitlements per org/instance with short TTL or invalidate on upgrade.

## Migration Plan

1. Add `plan` (orgs) + `edition` (instances) columns; default `starter` for new orgs,
   backfill existing orgs to `full` so nothing changes for current customers.
2. Introduce `Entitlements` + the artifact-type registry; point existing consumers at the
   registry (behavior-preserving refactor, full edition unaffected).
3. Add UI gating (tabs/sub-nav/route middleware/upgrade page) behind the entitlement.
4. Add MCP filter intersection + per-handler guards.
5. Gate the AIM heartbeat + lifecycle detector + pack resolution for starter.
6. Add provisioning defaults + `UpgradePlan` + instance-limit quota.
- Rollback: backfilling existing orgs to `full` means the feature is inert for current
  customers; the columns and registry refactor are safe to keep even if starter is paused.

## Open Questions

- Exact starter artifact set: confirm `north_star` + `roadmap_recipe` only, or also a
  minimal read-only insight/foundations stub for context?
- Is edition a property of the **org** (one plan per customer) or genuinely per-instance?
  Default assumption: org-level plan with optional per-instance override.
- Starter instance limit default (one per org?) and whether starter allows LLM-assisted
  drafting or is manual-edit only (ties into `add-artifact-assistant-bot`).
- Should starter include the evidence lobby (`add-evidence-lobby-extraction`) or is that
  a full-edition feature?
- Where does plan get set in v1 — admin tool, 21st provisioning hook, or both?
