# Change: Add starter plan edition (free North-Star + KRs tier)

## Why

We want to offer a free starter plan to all 21st users: a stripped-down strategy-server
experience that is just a **North Star with a slim roadmap of objectives and key
results** — enough to be genuinely useful and to act as an on-ramp to the full product.

The codebase has **no plan / tier / edition / entitlement concept anywhere** — no field
on `Org` or `StrategyInstance`, no config flag, no per-caller gating. Every gating
dimension (UI phases/tabs, MCP tools, skills, engine loops) is currently static and
unconditional. The full engine assumes the complete artifact graph exists, and two
components actively misbehave on a deliberately-slim instance:

1. **The AIM heartbeat fires immediately on a bare instance.** The time-based trigger
   returns "fired" for any instance with no assessment report (`domain/aim/service.go:223`),
   and the heartbeat ticker runs `EvaluateAll` across all active instances every tick
   (`domain/heartbeat/service.go:154`), creating cycle proposals that urge a full AIM
   assessment against an intentionally-incomplete graph.
2. **The lifecycle detector mis-frames a slim graph.** With only north_star + roadmap it
   returns `foundation` mode with a long "draft the missing artifacts" next-steps list
   (`internal/mcpserver/lifecycle.go:115-133, 373`) — wrong messaging for a starter plan.

So this change introduces a plan/entitlement model and makes the engine plan-aware, so a
starter instance is **scoped, not broken** — and a clean upgrade path exists to the full
edition.

## What Changes

### 1. Plan / entitlement model (`strategy-core`)

- **ADD** a `plan` field on `Org` (`plan TEXT NOT NULL DEFAULT 'starter'`, new migration
  following the `017_enrich_orgs.sql` pattern) and a nullable `edition` override on
  `StrategyInstance` so a single org can host mixed-edition instances if needed
  (instance edition wins; falls back to org plan).
- **ADD** an `Entitlements` value object resolved from plan/edition: a single source of
  truth answering "what is allowed for this org/instance" — allowed phases, allowed
  artifact types, allowed MCP tool categories, which engine loops run, instance count
  limit. Two editions in v1: `starter` and `full`.
- **ADD** `org.Service` entitlement resolution (`PlanFor(orgID)`, `EntitlementsFor(instanceID)`)
  and a request-time accessor so handlers, middleware, the MCP filter, and engine loops
  read the same resolved entitlements.

### 2. Starter artifact scope (`strategy-core`)

- The starter edition's allowed artifact set is **`north_star` + `roadmap_recipe`**.
  Key results live *inside* the roadmap_recipe payload (KRs are not separate artifacts;
  relationships `delivered_by_kr`/`linked_to_kr` are nested), so "North Star + KRs" = these
  two artifacts.
- **ADD** a central artifact-type registry (`type → {phase, editions}`) to replace the
  scattered, duplicated artifact→phase maps (export paths, version categorization, AIM
  step mapping, import filename mapping, lifecycle missing-set). The entitlement check and
  every phase/export/import consumer read this one registry. Consolidating these maps is a
  prerequisite for a coherent allowlist and fixes existing duplication
  (`internal/pipeline/postcommit.go:263` admits the duplication).

### 3. UI gating (`strategy-web`)

- **ADD** edition-aware navigation: starter shows the Execution tab and a slim READY
  (North Star + Roadmap) only; FIRE and AIM tabs and the other READY sub-pages are
  hidden or rendered as **locked "upgrade" affordances**. Hooks:
  `handler.go:353 strategyTabs`, `navigation/navigation.go:181 TabSubNavScreens`,
  with an `Editions` field added to `ScreenDef` (`navigation/graph.go`).
- **ADD** a request-time route guard (middleware): because routes are registered once at
  startup (`handler.go:251`), gated screens are blocked at request time (redirect to an
  upgrade page rather than 404) for starter instances.
- **ADD** an `Edition`/`Plan` flag to the UI system config (`ui.SetSystemConfig`,
  `cmd_serve.go:470`) so locked/upgrade states render consistently, reusing the existing
  "feature unavailable" indicator idiom.
- **ADD** an upgrade page/CTA describing what the full edition unlocks.

### 4. MCP gating (`strategy-mcp`)

- **EXTEND** the per-session tool filter (`internal/mcpserver/tool_filter.go:283
  toolCategoryFilter`) to intersect the caller's chosen categories with the
  edition-allowed categories, resolved from the targeted instance/org. Starter exposes a
  slim set (core + minimal strategy/authoring for north_star + roadmap).
- **ADD** per-handler execution guards on gated tools (visibility ≠ enforcement; a client
  can call a hidden tool). Gated tools return a structured "not available on this plan"
  error, mirroring the existing structured-error and nil-service-disable patterns.

### 5. Engine loop gating (`strategy-core`)

- **GATE the AIM heartbeat for starter instances.** Skip starter-edition instances in
  `EvaluateAll`/`listActiveInstanceIDs` (or short-circuit `EvaluateTriggers`), so a slim
  instance never generates AIM cycle proposals. The commit-path ripple/convergence/ingest
  pipeline is already nil-safe on a partial graph and needs no change beyond operating on
  the smaller key set.
- **GATE skill install/run** via pack resolution (`domain/pack/`): starter instances
  install/run only the starter-relevant skills (e.g. `draft-north-star`, `draft-roadmap`),
  not the foundation/AIM skill set.
- **MAKE the lifecycle detector edition-aware** (`internal/mcpserver/lifecycle.go`): for a
  starter instance, treat north_star + roadmap as the complete set (mode `complete`/
  `building`, not `foundation`), with starter-appropriate next steps.

### 6. Provisioning & upgrade path

- **ADD** starter-instance provisioning: a new org/instance defaults to `plan='starter'`;
  starter instances are created with the slim pack and the slim artifact scope.
- **ADD** an `UpgradePlan(orgID|instanceID, 'full')` operation that flips the edition,
  installs the full pack, enables the gated phases/tools/loops, and (importantly) requires
  **no data migration** — the starter graph (north_star + roadmap) is a valid subset of
  the full graph and the existing bootstrap/genesis flow (`add-strategy-bootstrap-flow`)
  is the natural on-ramp to fill in the rest.
- **ADD** an optional starter-instance limit per org (entitlement-driven quota; default
  one starter instance per org, configurable).

## Impact

- Affected specs: `strategy-core` (plan/entitlement model, artifact registry, engine
  gating, provisioning/upgrade), `strategy-web` (edition-aware nav + route guard +
  upgrade UI), `strategy-mcp` (edition-aware tool filter + execution guards)
- Affected code:
  - New: `domain/entitlement/` (or extend `domain/org/`) — plan/edition resolution +
    `Entitlements` value object; new central artifact-type registry
  - Modified: `internal/domain/models.go` (Org.Plan, StrategyInstance.Edition),
    new migration `0NN_add_plan.sql`
  - Modified: `internal/navigation/graph.go` (+ `Editions` on `ScreenDef`),
    `navigation/navigation.go`, `internal/handler/handler.go` (tabs + route-guard
    middleware), new upgrade handler/page
  - Modified: `internal/mcpserver/tool_filter.go` (edition intersection),
    `internal/mcpserver/lifecycle.go` (edition-aware mode), per-handler guards in
    `register_*.go`
  - Modified: `domain/heartbeat/service.go` / `domain/aim/service.go` (skip starter),
    `domain/pack/` (slim pack resolution), `cmd_serve.go` (UI system config edition),
    `config/config.go` (default plan, starter-limit config)
- New migration: `plan` column on `orgs`, `edition` column on `strategy_instances`
- No data migration on upgrade (starter graph is a subset of full)
- No breaking changes to existing MCP tools or APIs for full-edition instances

## Coordination with in-flight changes

- **`enrich-org-ownership-model`** (active, not archived) establishes Org as the
  ownership root. The `plan` field SHALL be added on `Org` consistently with that change;
  coordinate the migration ordering.
- **`add-strategy-bootstrap-flow`** is the upgrade on-ramp: when a starter org upgrades,
  the bootstrap genesis flow fills in the foundation artifacts. The artifact-type registry
  introduced here SHOULD be the same one the bootstrap "ghost artifact" cleanup needs.
- **`add-continuous-strategy-loop`** / heartbeat work: the starter gate on `EvaluateAll`
  must be compatible with the continuous loop's heartbeat changes.

## Design Principles

1. **Scoped, not broken.** A starter instance is a deliberately limited but fully
   coherent product — engine loops that assume the full graph are gated off, not left to
   misbehave.
2. **One entitlement source of truth.** Plan → `Entitlements` resolved once; UI, MCP, and
   engine all read the same answer. No scattered per-surface plan checks.
3. **Visibility ≠ enforcement.** Hidden UI/tools are convenience; hard guards
   (route middleware, MCP handler checks) are enforcement.
4. **Upgrade is additive, never destructive.** Starter data is a strict subset of full;
   upgrading only adds capability, never migrates or rewrites the starter graph.
5. **Mirror the existing degradation idiom.** Reuse the proven "configured → no-op + warn
   + UI indicator" pattern, made per-org/instance and request-time instead of global.
