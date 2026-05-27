## 1. Preparation

- [x] 1.1 Revert local changes to `align-portfolio` prompt (handler deleted; prompt will be overwritten on next sync)
- [x] 1.2 Keep `loadAllArtifacts` value_model multi-type collection (needed for skill context bundle)
- [x] 1.3 Keep `value_models` staging logic in `stageMutationsFromOutput` (backward compatibility)
- [ ] 1.4 File upstream issue on `epf-canonical` for align-portfolio prompt bugs

## 2. Domain logic — `domain/strategy/align.go`

- [x] 2.1 Add `AlignPortfolioResult` struct (per-track: activated, deactivated, unresolvable paths, KR coverage)
- [x] 2.2 Add `AlignPortfolio(ctx, instanceID) (AlignPortfolioResult, error)` method on `Service`
- [x] 2.3 Implement KR target extraction from committed `roadmap_recipe` payload
- [x] 2.4 Implement component path resolver (dot-separated L1.L2.L3 ID walk)
- [x] 2.5 Implement activation logic (set active on targeted L3s, propagate upward)
- [x] 2.6 Implement `activation_notes` writing (cite KR ID and description)
- [x] 2.7 Implement structural preservation (only modify `active` and `activation_notes` fields, preserve everything else)
- [x] 2.8 Auto-commit mutations (deterministic, structure-safe — no review gate)
- [x] 2.9 Skip when activation state has not changed (avoid no-op mutations)

## 3. Consistency check — `domain/strategy/consistency.go`

- [x] 3.1 Add `ConsistencyResult` struct (per-check: what was found, what was fixed)
- [x] 3.2 Add `RunConsistencyCheck(ctx, instanceID) (ConsistencyResult, error)` method on `Service`
- [x] 3.3 Wire `AlignPortfolio` as a sub-check
- [x] 3.4 Stale skill run cleanup (mark runs stuck in `running` >10 min as failed)
- [x] 3.5 Orphaned staged mutation detection (warn on batches staged >24h)
- [x] 3.6 Each sub-check is independent — failure in one does not block others
- [x] 3.7 Add `RunConsistencyCheckForAll(ctx)` — satisfies `heartbeat.InstanceConsistencyChecker`

## 4. AIM cycle integration — `domain/aim/`

- [x] 4.1 Add `PortfolioAligner` interface to `workflow.go` (avoids circular import)
- [x] 4.2 Add `align_portfolio` step to `Steps()` (after `adapt_foundations`, before `snapshot_cycle`)
- [x] 4.3 Step calls `aligner.AlignPortfolio(ctx, instID)` (auto-commits, no human gate)
- [x] 4.4 Step is a no-op when no aligner is wired (nil-safe)
- [x] 4.5 Alignment failures are non-fatal — cycle continues to `snapshot_cycle`
- [x] 4.6 Step result included in cycle metadata (activated/deactivated counts)

## 5. Heartbeat integration — `domain/heartbeat/`

- [x] 5.1 Add `InstanceConsistencyChecker` interface to `service.go`
- [x] 5.2 Add `WithConsistencyChecker()` builder on `Service`
- [x] 5.3 Run `consistencyChecker.RunConsistencyCheckForAll(ctx)` in `runOnce` after trigger evaluation
- [x] 5.4 Wire `strategySvc` (satisfies `InstanceConsistencyChecker`) in `cmd_serve.go`
- [x] 5.5 Wire `strategyPortfolioAlignerAdapter` into `NewCycleWorkflow().WithPortfolioAligner()` in `cmd_serve.go`

## 6. FIRE phase UI — `internal/ui/phase_fire.templ`

- [x] 6.1 Replace `fireAlignBanner` (button-based) with `fireAlignStatusBanner` (read-only)
- [x] 6.2 Remove `handler_fire_align.go` and the `/fire/align-portfolio` route
- [x] 6.3 Regenerate `phase_fire_templ.go` via `templ generate`

## 7. Tests

- [x] 7.1 `TestAlignPortfolio_NoRoadmap` — no-op when roadmap missing
- [x] 7.2 `TestAlignPortfolio_NoKRTargets` — no-op when KRs have no targets
- [x] 7.3 `TestAlignPortfolio_ActivatesTargetedComponents` — activates targeted L3, leaves others inactive
- [x] 7.4 `TestAlignPortfolio_NoOp` — second run is no-op (idempotent)
- [x] 7.5 `TestAlignPortfolio_StructuralPreservation` — non-activation fields unchanged
- [x] 7.6 `TestAlignPortfolio_UpwardPropagation` — L1/L2 active when child L3 active
- [x] 7.7 `TestAlignPortfolio_UnresolvablePath` — warns on bad path, continues
- [x] 7.8 `TestAlignPortfolio_Idempotent` — two runs produce stable state
- [x] 7.9 `TestConsistencyCheck_StaleRunCleanup` — runs >10min marked failed
- [x] 7.10 `TestConsistencyCheck_RecentRunNotCleaned` — recent runs untouched
- [x] 7.11 `TestCycleWorkflow_Steps` — updated to expect 6 steps
- [x] 7.12 Full test suite green (35 packages)
