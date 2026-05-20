## Phase 1: Embedding-Based Classification and Authority Model

### 1. Upgrade Semantic Change Classification

- [x] 1.1 Modify `domain/ripple/semantic.go` `ClassifyChange` to use Memory search score as primary classifier: search with new content, find the artifact's own key in results, use score as similarity measure
- [x] 1.2 Remove `textSimilarityRatio` as primary classifier (retain as tertiary fallback after Memory search and structural heuristics)
- [x] 1.3 Add artifact-type-specific threshold overrides: North Star/strategy formula use tighter thresholds (trivial > 0.97 vs default > 0.95)
- [x] 1.4 Add structural fallback classifier for when Memory is unavailable: downstream artifact count + artifact type sensitivity
- [x] 1.5 Return `AuthorityTier` (autonomous/gated/escalated) alongside `SemanticChangeClass` from classification
- [x] 1.6 Write unit tests for classification logic (classifyByScore thresholds, text fallback never-autonomous invariant, inferArtifactTypeFromKey)
- [x] 1.7 Write unit tests for structural fallback classifier (ClassifyChangeStructural, ClassifyAuthorityStructural)

### 2. Ripple Configuration Model

- [x] 2.1 Create `domain/ripple/config.go` with `RippleConfig` struct: authority thresholds (per artifact type), equilibrium threshold, damping params, natural tension baselines
- [x] 2.2 Define `DefaultRippleConfig()` with conservative defaults documented in design.md
- [x] 2.3 Add `RippleConfigRow`, `ConvergenceRun` models to `internal/domain/models.go` with bun tags
- [x] 2.4 Create migration `016_ripple_convergence.sql`: `ripple_config` table, `authority_tier` column on `ripple_signals`, `convergence_runs` table, version metadata columns
- [x] 2.5 Implement `GetConfig(ctx, instanceID)` in ripple service — returns persisted config or defaults
- [x] 2.6 Implement `UpdateConfig(ctx, instanceID, config)` in ripple service — merges partial updates with existing config
- [x] 2.7 Write tests for config CRUD and default fallback

### 3. Authority Model

- [x] 3.1 Create `domain/ripple/authority.go` with `ClassifyAuthority(score, artifactType, config)` function
- [x] 3.2 Map semantic similarity scores to authority tiers using config thresholds
- [x] 3.3 Add `authority_tier` field to `RippleSignal` struct and signal creation flow
- [x] 3.4 Tag signals with their authority tier during convergence loop
- [x] 3.5 Write tests for authority classification with different artifact types and configs

---

## Phase 2: Equilibrium Scoring

### 4. Equilibrium Score Computation

- [x] 4.1 Create `domain/ripple/equilibrium.go` with `ComputeEquilibrium(ctx, db, instanceID, config)` function
- [x] 4.2 Implement weighted penalty calculation: critical 0.20, warning 0.05, info 0.00 per signal
- [x] 4.3 Implement natural tension adjustment: subtract penalty for tension signals within baseline
- [x] 4.4 Exclude dismissed signals from penalty calculation
- [x] 4.5 Return `EquilibriumReport`: score, threshold, in_equilibrium bool, signal breakdown by authority tier, natural tension count
- [x] 4.6 Write tests: graph with no signals (score 1.0), graph with 5 critical (score 0.0), graph with warnings in equilibrium, dismissed signals excluded, info signals no penalty

### 5. Cross-Track Tension Detection

- [x] 5.1 Create `domain/ripple/tension.go` with `DetectCrossTrackTension(ctx, db, mem, instanceID, config)` using Memory search
- [x] 5.2 Compute per-track embedding centroid approximation: search with a synthetic query combining all artifact content for a track, measure how other tracks' artifacts rank
- [x] 5.3 Compare measured divergence against natural tension baselines from config
- [x] 5.4 Generate `tension` signals only for excess divergence (measured - baseline)
- [x] 5.5 Assign severity: warning if excess < 0.15, critical if excess >= 0.15
- [x] 5.6 Integrate tension detection into `FullSemanticAnalysisWithConfig`
- [x] 5.7 Write tests for nil-Memory graceful degradation, tension baseline symmetry, unknown pair baseline

---

## Phase 3: Convergence Loop

### 6. Auto-Commit Path

- [x] 6.1 Add `CommitAuto(ctx, CommitAutoParams)` to strategy service
- [x] 6.2 Write mutations with `status='committed'`, `source='ripple_auto'`, `authority_tier='autonomous'` in batch_metadata
- [x] 6.3 Store originating signal ID in mutation's `batch_metadata`
- [x] 6.4 Wire IngestEnqueuer into ConvergenceServices for Memory ingestion of auto-committed artifacts
- [x] 6.5 Create audit log entry with `source='ripple_auto'`
- [x] 6.6 Write tests: auto-commit creates mutation, mutation visible in list, audit entry created

### 7. Convergence Loop Implementation

- [x] 7.1 Create `domain/ripple/convergence.go` with `RunConvergenceLoop(ctx, instanceID, triggerBatchID, config, services)` function
- [x] 7.2 Implement iteration loop: sense (coherence check) -> classify (authority tiers) -> resolve (via pluggable SignalResolver) -> re-sense
- [x] 7.3 Implement damping: max iteration depth check
- [x] 7.4 Implement damping: per-cycle change budget tracking (cumulative semantic distance of auto-commits via resolver)
- [x] 7.5 Implement damping: strategy anchor check (captureAnchorTexts + anchorDrifted using text similarity)
- [x] 7.6 Implement damping: emergency brake (signal count increases for 2 consecutive iterations)
- [x] 7.7 Return `ConvergenceSummary`: iterations, auto_resolved count, escalated count, equilibrium score (start and end), damping_reason, version_published, version_id
- [x] 7.8 Write tests: loop reaches equilibrium (no signals), loop stopped by max depth, warnings within equilibrium

### 8. Convergence Loop Integration

- [x] 8.1 Integrate convergence loop into `commit_batch` MCP handler: call `RunConvergenceLoop` after existing `postCommitRippleAnalysis`
- [x] 8.2 Include `convergence_summary` in `commit_batch` response
- [x] 8.3 Wire IngestEnqueuer into ConvergenceServices for Memory ingestion
- [x] 8.4 Wire CommitAutoFn to strategy.CommitAuto for signal auto-resolution
- [x] 8.5 Add `convergence_runs` table to store convergence history (triggering batch, iterations, summary, timestamps)
- [x] 8.6 Write integration test: commit a North Star change -> convergence loop runs -> trivial downstream fixes auto-committed -> equilibrium reached

### 8c. Pluggable Resolver Interface (Dual-Mode)

- [x] 8c.1 Create `domain/ripple/resolver.go` with `SignalResolver` interface and `ResolveResult` struct
- [x] 8c.2 Add `Resolver` and `CommitAutoFn` fields to `ConvergenceServices`
- [x] 8c.3 Implement resolve step in convergence loop: filter autonomous signals, call resolver, check change budget, commit, track cumulative distance
- [x] 8c.4 Update version auto-publish gate: fire when `changedThisCycle` OR when commit moved graph into equilibrium
- [x] 8c.5 Wire `CommitAutoFn` to `strategy.CommitAuto` in server.go
- [x] 8c.6 Leave `Resolver` nil (agent-orchestrated mode) with comment for future LLM wiring

---

## Phase 4: MCP Tools and Serving

### 9. Configuration Tools

- [x] 9.1 Add `get_ripple_config` MCP tool: returns current config or defaults for an instance
- [x] 9.2 Add `update_ripple_config` MCP tool: accepts partial config updates, merges with existing, persists
- [x] 9.3 Write tests for both config tools

### 10. Equilibrium and Convergence Tools

- [x] 10.1 Add `get_equilibrium_status` MCP tool: returns current score, threshold, breakdown
- [x] 10.2 Add `get_convergence_history` MCP tool: returns recent convergence runs with optional `damping_reason` filter
- [x] 10.3 Enhance `health_check` response with `equilibrium` section: score, threshold, in_equilibrium
- [x] 10.4 Write tests for equilibrium status and convergence history tools

### 11. Knowledge Base and Agent Routing Updates

- [x] 11.1 Update `internal/agent/knowledge.go` with convergence loop, authority tiers, equilibrium, and config documentation
- [x] 11.2 Update `internal/agent/knowledge.go` with equilibrium topic integrated into ripple topic
- [x] 11.3 Add routing entries to `internal/agent/routing.go`: "equilibrium", "convergence", "auto-resolved", "ripple config" -> appropriate tools
- [x] 11.4 Write routing test cases for new intents (TestRouteTask_RippleConvergence covers equilibrium, convergence, auto-resolved, ripple config)

### 8b. Equilibrium-Triggered Versioning

- [x] 8b.1 Add `source`, `equilibrium_score`, `convergence_meta` columns to `strategy_versions` table via migration
- [x] 8b.2 Update `StrategyVersion` model with `Source`, `EquilibriumScore`, `ConvergenceMeta` fields
- [x] 8b.3 Integrate auto-publish into convergence loop with dual-mode gate
- [x] 8b.4 Skip auto-publish when convergence stopped by damping (not in equilibrium)
- [x] 8b.5 Skip auto-publish when convergence made no changes and was already in equilibrium
- [x] 8b.6 Extend `list_versions` with `VersionSummary.Source` and `EquilibriumScore` fields, updated query
- [x] 8b.7 Extend `get_version` response to include `source`, `equilibrium_score`, `convergence_meta`
- [x] 8b.8 Extend `diff_versions` to include convergence context from target version when `source='convergence'`
- [x] 8b.9 Write tests: convergence reaches equilibrium with changes -> version auto-published with correct metadata
- [x] 8b.10 Write tests: convergence stopped by damping -> no version published
- [x] 8b.11 Write tests: convergence no-op -> no version published
- [x] 8b.12 Write tests: manual publish after auto-publish -> supersedes correctly
- [x] 8b.13 Write tests: restore_version targeting auto-published version -> restores correctly

---

## Phase 5: Safety and Observability

### 12. Safety Validation

- [x] 12.1 Write integration test: convergence loop with circular dependency graph -> verify max depth damping fires
- [x] 12.2 Write integration test: many small auto-commits -> verify change budget damping fires
- [x] 12.3 Write integration test: auto-commit that transitively shifts North Star -> verify anchor drift damping fires
- [x] 12.4 Write integration test: positive feedback loop (each resolution creates 2 new signals) -> verify emergency brake fires
- [x] 12.5 Write integration test: verify autonomous commits are visible in `list_mutations` with `source='ripple_auto'`
- [x] 12.6 Write integration test: verify `restore_version` correctly reverts auto-committed mutations

### 13. Structural Fallback Validation

- [x] 13.1 Write test: convergence with Memory unavailable -> convergence runs in structural-only mode (no resolver without semantic verification)
- [x] 13.2 Write integration test: Memory becomes available mid-session -> verify semantic classification activates
- [x] 13.3 Write test: structural fallback classifier assigns correct authority tiers based on downstream count (TestClassifyAuthorityStructural)

### 14. Documentation

- [x] 14.1 Update `apps/strategy-server/AGENTS.md` with convergence loop, authority model, and equilibrium documentation
- [x] 14.2 Add ripple configuration examples to AGENTS.md (default config, product-led growth config, enterprise config)
- [x] 14.3 Update MCP tool inventory table in AGENTS.md with new tools
