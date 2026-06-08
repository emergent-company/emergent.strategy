# Tasks: Add starter plan edition (free North-Star + KRs tier)

## 1. Plan / entitlement model (`strategy-core`)

- [ ] 1.1 Migration `0NN_add_plan.sql`: `plan TEXT NOT NULL DEFAULT 'starter'` on `orgs`; `edition TEXT NULL` on `strategy_instances`; backfill existing orgs to `'full'`
- [ ] 1.2 Add `Plan` to `Org` and `Edition` to `StrategyInstance` structs (`internal/domain/models.go`)
- [ ] 1.3 Define `Edition` enum (`starter`, `full`) and `Entitlements` value object (allowed phases, allowed artifact types, allowed MCP tool categories, engine-loop flags, instance limit)
- [ ] 1.4 Implement edition resolution: `EntitlementsFor(instanceID)` = instance edition if set else org plan; `PlanFor(orgID)`
- [ ] 1.5 Add a request-time accessor + short-TTL cache (invalidated on upgrade) so all surfaces read the same resolved entitlements
- [ ] 1.6 Tests: resolution precedence (instance overrides org); default new org is starter; backfilled orgs are full; cache invalidation on upgrade

## 2. Central artifact-type registry (`strategy-core`)

- [ ] 2.1 Define a registry mapping `artifactType → {phase, editions[]}` as the single source of truth
- [ ] 2.2 Point existing consumers at the registry (behavior-preserving): export paths (`mcpserver/server.go:843`), version categorization (`handler_versions.go:448`), AIM step map (`handler_aim_orchestrator.go:466`), import filename map (`epfimport/parse.go:119`), lifecycle missing-set (`lifecycle.go:96`), ripple foundation keys (`postcommit.go:265` + `register_ripple_tools.go:603`)
- [ ] 2.3 Mark starter-allowed types: `north_star`, `roadmap_recipe`
- [ ] 2.4 Tests: registry is complete (every existing type present); consumers produce identical results to pre-refactor for full edition; gated types absent from starter allowlist

## 3. UI gating (`strategy-web`)

- [ ] 3.1 Add `Editions []string` to `ScreenDef` (`navigation/graph.go`); tag screens with allowed editions
- [ ] 3.2 Filter tabs in `strategyTabs` (`handler.go:353`) and sub-nav in `TabSubNavScreens` (`navigation/navigation.go:181`) by resolved edition
- [ ] 3.3 Request-time route-guard middleware: gated screens for starter instances redirect to the upgrade page (not 404)
- [ ] 3.4 Render hidden phases as locked "upgrade" affordances where appropriate
- [ ] 3.5 Add `Edition`/`Plan` to UI system config (`ui.SetSystemConfig`, `cmd_serve.go:470`) for consistent locked/upgrade indicators
- [ ] 3.6 Upgrade page/CTA describing what full unlocks
- [ ] 3.7 Tests: starter shows Execution + slim READY only; FIRE/AIM hidden/locked; gated route redirects to upgrade; full edition unchanged

## 4. MCP gating (`strategy-mcp`)

- [ ] 4.1 Thread resolved entitlements into `toolCategoryFilter` (`tool_filter.go:283`); intersect caller-chosen categories with edition-allowed categories
- [ ] 4.2 Define starter tool category set (core + minimal strategy/authoring for north_star + roadmap)
- [ ] 4.3 Per-handler execution guards on gated tools returning a structured "not available on this plan" error
- [ ] 4.4 Tests: starter `tools/list` excludes full-only tools; starter caller cannot execute a full-only tool even when called directly; full edition unaffected

## 5. Engine loop gating (`strategy-core`)

- [ ] 5.1 Gate the AIM heartbeat: skip starter instances in `EvaluateAll`/`listActiveInstanceIDs` or short-circuit `EvaluateTriggers` (`domain/heartbeat/service.go:154`, `domain/aim/service.go:223`)
- [ ] 5.2 Verify the commit-path ripple/convergence/ingest pipeline operates correctly on the slim graph (no code change expected; add a test)
- [ ] 5.3 Gate skill install/run via pack resolution (`domain/pack/`): starter installs only starter-relevant skills (e.g. `draft-north-star`, `draft-roadmap`)
- [ ] 5.4 Make the lifecycle detector edition-aware (`internal/mcpserver/lifecycle.go`): starter set = complete; starter-appropriate next steps
- [ ] 5.5 Tests: starter instance generates no AIM cycle proposals on heartbeat; lifecycle detector returns non-foundation mode for starter; starter pack installs only slim skills

## 6. Provisioning & upgrade path

- [ ] 6.1 New org/instance defaults to `plan='starter'`; starter instance created with slim pack + slim artifact scope
- [ ] 6.2 Implement `UpgradePlan(orgID|instanceID, 'full')`: flip edition, install full pack, enable gated phases/tools/loops, invalidate entitlement cache — no data migration
- [ ] 6.3 Confirm the bootstrap genesis flow (`add-strategy-bootstrap-flow`) is the on-ramp after upgrade
- [ ] 6.4 Optional per-org starter-instance limit (entitlement quota; default 1, configurable in `config/config.go`)
- [ ] 6.5 Set/change plan mechanism for v1 (admin operation and/or 21st provisioning hook) — confirm scope in design open questions
- [ ] 6.6 Tests: starter→full upgrade preserves the existing north_star + roadmap byte-for-byte; gated capabilities become available post-upgrade; instance-limit enforced

## 7. Coordination & verification

- [ ] 7.1 Coordinate `plan` field migration ordering with `enrich-org-ownership-model`
- [ ] 7.2 Ensure the heartbeat gate composes with `add-continuous-strategy-loop` changes
- [ ] 7.3 Share the artifact-type registry with the bootstrap-flow ghost-artifact cleanup
- [ ] 7.4 Lint clean (`task lint`)
- [ ] 7.5 Full test suite green (`go test ./...` with Postgres)
- [ ] 7.6 `openspec validate add-starter-plan-edition --strict` passes
