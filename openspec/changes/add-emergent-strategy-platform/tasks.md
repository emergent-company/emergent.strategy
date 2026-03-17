## Prerequisites (Complete Before Phase 1)

### P.A Complete Active Changes
- [x] P.1 Complete `refactor-agents-and-skills` (4 remaining tasks)
- [x] P.2 Complete `migrate-canonical-agents-skills` (content migration)
- [x] P.3 Complete `add-aim-recalibration-engine` Phase 3 CLI
- [x] P.4 Ship `add-mcp-session-audit`
- [x] P.5 Ship `add-github-app-multi-tenant`

### P.B Update Emergent EPF Instance (emergent-epf)

The Emergent EPF instance currently reflects a "Context Layer for AI" positioning. It must be updated to reflect the semantic strategy runtime direction before Phase 1 begins. This is both necessary strategic preparation and the first dogfooding exercise.

**Tier 1: Strategic Foundation (must do first — all downstream artifacts reference these)**
- [x] P.6 Update `READY/00_north_star.yaml` — North Star v2.0 rewritten for semantic strategy runtime direction
- [x] P.7 Update `READY/01_insight_analyses.yaml` — added technology/market/competitive trends for semantic runtime
- [x] P.8 Update `READY/02_strategy_foundations.yaml` — aligned with updated North Star
- [x] P.9 Update `READY/03_insight_opportunity.yaml` — reframed for semantic strategy runtime
- [x] P.10 Update `READY/04_strategy_formula.yaml` — rewritten positioning, competitive moat, business model

**Tier 2: Execution Framework (translates direction into plans)**
- [x] P.11 Create new `READY/05_roadmap_recipe.yaml` Cycle 2 — 4 OKRs, 9 KRs, 6 assumptions. Cycle 1 archived.
- [x] P.12 Rewrite `FIRE/value_models/product.epf-runtime.value_model.yaml` — 5 new layers for semantic runtime
- [x] P.13 Update `FIRE/value_models/product.emergent-memory.value_model.yaml` — repositioned as integrated substrate
- [x] P.14 Update `product_portfolio.yaml` — revised for new architecture

**Tier 3: Feature Definitions (define the capabilities to build)**
- [x] P.15 Create `fd-020_semantic_strategy_engine.yaml`
- [x] P.16 Create `fd-021_propagation_circuits.yaml`
- [x] P.17 Create `fd-022_tiered_llm_reasoning.yaml`
- [x] P.18 Create `fd-023_desktop_application.yaml`
- [x] P.19 Create `fd-024_multi_instance_networking.yaml`
- [x] P.20 Create `fd-025_emergent_memory_integration.yaml`
- [x] P.21 Update `fd-014_ai_strategy_agent.yaml` — added tiered reasoning and propagation awareness
- [x] P.22 Update `fd-016_epf_cloud_server.yaml` — added multi-instance networking role

**Tier 4: Supporting Artifacts (keep the instance consistent)**
- [x] P.23 Update `AIM/living_reality_assessment.yaml` — updated for new direction
- [x] P.24 Update `AIM/aim_trigger_config.yaml` — added new critical assumptions
- [x] P.25 Update `FIRE/mappings.yaml` — updated code artifact URLs
- [x] P.26 Activate relevant components in `strategy.value_model.yaml` and `commercial.value_model.yaml`
- [x] P.27 Run `epf health` on the updated instance — 86/86 valid paths, 95% content readiness, Grade A

## Phase 1: Semantic Strategy Engine (`add-semantic-engine`)

### 1.1 Blueprint & Schema Setup ✅ COMPLETE
- [x] 1.1.1 Create blueprint directory at `docs/EPF/_instances/emergent/.memory/` with `packs/` subdirectory
- [x] 1.1.2 Design epf-engine schema v2.0.0 (JSON) with 14 object types: Belief, Trend, PainPoint, Positioning, Assumption, ValueModelComponent, Feature, Scenario, Capability, Persona, OKR, Artifact, Agent, Skill — each with `inertia_tier` property
- [x] 1.1.3 Add 4 semantic relationship types: supports, contradicts, elaborates, parallels (with `confidence` property)
- [x] 1.1.4 Add 4 causal relationship types: informs, validates, invalidates, constrains (with `strength` property)
- [x] 1.1.5 Add `weight` and `edge_source` properties to all 16 relationship types (8 structural + 4 semantic + 4 causal)
- [x] 1.1.6 Apply blueprint to epf-engine project on emergent.memory — verified with test object creation/deletion
- [x] 1.1.7 Schema committed to Git at `docs/EPF/_instances/emergent/.memory/packs/epf-engine.json`

### 1.2 emergent.memory REST API Client ✅ COMPLETE
Decision: REST API directly (not CLI wrapper) per design.md Decision 12.
- [x] 1.2.1 Create `apps/epf-cli/internal/memory/` package (7 files, 831 lines) — full typed Go HTTP client
- [x] 1.2.2 Implement auth: `NewClient(baseURL, token)` with Bearer token auth and configurable HTTP client
- [x] 1.2.3 Implement graph object CRUD: Create, Get, Update, Delete, List + Upsert (by type+key), BulkCreate, Similar, History
- [x] 1.2.4 Implement graph relationship CRUD: Create, Get, Delete, BulkCreate
- [x] 1.2.5 Implement graph operations: Expand (BFS), Traverse (directed), CreateSubgraph (atomic)
- [x] 1.2.6 Implement search: HybridSearch, SearchWithNeighbors (semantic search + graph context)
- [x] 1.2.7 Implement branches: Create, List, Get, Delete, Merge (for scenario projection in 1.10)
- [x] 1.2.8 Write 6 client tests
- Note: Batch seed/JSONL via `memory blueprints` deferred — REST upsert-by-key is sufficient for ingestion

### 1.3 Artifact Decomposition & Ingestion ✅ COMPLETE
Architectural decision: The decomposer owns its own raw YAML parsing, independent of the strategy parser package. This eliminates coupling to the strategy parser's Go structs (which has known gaps like capabilities under wrong path) and ensures the decomposer extracts everything the graph needs without workarounds. See design.md Decision 14.
- [x] 1.3.1 Define section-to-object-type mapping: north_star → Belief (tier 1), insight_analyses → Trend/PainPoint/Persona (tier 2), strategy_formula → Positioning (tier 3), roadmap → OKR/Assumption (tier 4), value_model → ValueModelComponent (tier 5), features → Feature/Scenario (tier 6), capabilities → Capability (tier 7)
- [x] 1.3.2 Implement self-contained section parser at `apps/epf-cli/internal/decompose/decompose.go` — reads raw YAML directly (no dependency on `strategy` package), emits typed `memory.UpsertObjectRequest` objects
- [x] 1.3.3 Implement structural edge extraction: contributes_to, depends_on, tests_assumption, targets, serves, elaborates, contains — all from YAML cross-references
- [x] 1.3.4 Write decomposition tests: 9 tests covering all artifact types + utilities + live instance integration
- [x] 1.3.5 Integration test against Emergent EPF instance: 739 objects, 927 relationships, 30ms
- [x] 1.3.6 Add EPF version check: warns if instance version > 2.x (MaxSupportedMajorVersion constant)
- Note: Embeddings generated automatically by Memory's background workers — no embedding engine needed
- Note: Handles both `sub_components` and `subs` YAML keys in value models (a known inconsistency in epf-canonical)

### 1.4 Tiered Reasoning Engine ✅ COMPLETE
All three tiers use the same OpenAI-compatible chat completions API (Ollama also exposes this). A shared `llmReasoner` base handles prompt construction and response parsing. The `TieredReasoner` routes by inertia tier and escalates when confidence < threshold.
- [x] 1.4.1 Define `Reasoner` interface and supporting types: `EvaluationRequest`, `Signal`, `Node`, `Constraint`, `Assessment`, `Verdict`, `ChangeClassification`, `TokenUsage`, `ModelTier` at `apps/epf-cli/internal/reasoning/types.go`
- [x] 1.4.2 Implement `LocalReasoner` — wraps `llmReasoner` with Ollama defaults (`http://localhost:11434`, `llama3.2:8b`)
- [x] 1.4.3 Implement `CloudReasoner` — wraps `llmReasoner` with mid-tier defaults (`gpt-4o-mini`)
- [x] 1.4.4 Implement `FrontierReasoner` — wraps `llmReasoner` with frontier defaults (`gpt-4o`)
- [x] 1.4.5 Implement `TieredReasoner` at `apps/epf-cli/internal/reasoning/tiered.go` — routes by inertia tier, supports confidence-based escalation (threshold default 0.6), graceful fallback when tier is unconfigured
- [x] 1.4.6 Write 12 tests: unchanged/modified/needs_review verdicts, invalid JSON handling, markdown-wrapped JSON, tier routing, confidence escalation, no-escalation for unchanged, missing tier fallback, JSON extraction, prompt construction

### 1.5 Semantic Graph Construction — PARTIALLY COMPLETE
Core ingestion pipeline is complete and live. Semantic and causal edge computation are deferred until the propagation circuit needs them.
- [x] 1.5.1 Implement full ingestion pipeline at `apps/epf-cli/internal/ingest/ingest.go`: decompose → upsert objects via REST (not JSONL/blueprints) → resolve keys → create relationships. Fixed Memory API field names: `src_id`/`dst_id` (not `fromId`/`toId`).
- [x] 1.5.2 Structural edge creation — handled by the decomposer (contributes_to, depends_on, tests_assumption, targets, serves, elaborates, contains). Produces 812 edges for the Emergent instance.
- [ ] 1.5.3 Implement semantic edge computation: query Memory for embedding similarity between objects, create semantic edges above confidence threshold
- [ ] 1.5.4 Implement causal edge computation with priority ordering (Finding 5): (1) explicit declarations (informs_ready_phase sections), (2) structural references (contributes_to, dependencies), (3) embedding similarity as fallback
- [x] 1.5.5 Add `epf ingest` CLI command with `--dry-run`, `--url`, `--project`, `--token` flags and env var support. MCP tool deferred.
- [x] 1.5.6 Write 4 ingestion tests: unit (mock server), error handling, idempotency, integration against live Emergent instance
- [x] 1.5.7 First live ingestion: 739 objects, 812 relationships into `epf-engine` project on emergent.memory (2026-03-17). Semantic search verified working.

### 1.6 Incremental Sync ✅ CORE COMPLETE
Content hashing detects which objects have changed. Only changed objects are upserted to Memory, skipping unchanged ones entirely (739 skipped in no-change test).
- [x] 1.6.1 Implement change detection: content hash comparison (SHA-256 of sorted properties) between decomposition output and existing Memory objects. At `apps/epf-cli/internal/ingest/sync.go`.
- [x] 1.6.2 Implement incremental upsert: only push created/updated objects. Unchanged objects are skipped (no API call, no embedding re-computation). Orphaned objects detected but not deleted (needs manual review).
- [x] 1.6.4 Add `epf sync` CLI command at `apps/epf-cli/cmd/sync.go`. Same env var config as `epf ingest`.
- [x] 1.6.5 Live test: 739 objects, 0 created, 0 updated, 739 unchanged in <1s (vs 4m35s for full ingest). Relationships still re-created (812).
- [ ] 1.6.3 Implement Git-triggered sync (deferred — manual `epf sync` is sufficient for now)
- [ ] 1.6.6 Implement relationship diffing to avoid re-creating unchanged relationships

### 1.7 Propagation Circuit — CORE COMPLETE
The propagation circuit is implemented as an in-memory BFS graph traversal with tiered LLM evaluation. 5-step loop: signal → query neighbors → threshold check → evaluate → recurse with decay. 4 of 5 protection layers active. Architecture across 3 files in `apps/epf-cli/internal/propagation/`.
- [x] 1.7.1 Define Circuit types at `types.go`: `Config`, `CascadeMode` (Interactive/Automatic/Scenario), `CascadeResult`, `NodeEvaluation`, `ProposedChange`, `SkippedNode`, `DefaultConfig()`
- [x] 1.7.2 Implement in-memory graph snapshot at `graph.go`: `GraphSnapshot` with `GraphNode`/`GraphEdge`, `LoadGraphSnapshot()` from Memory API, `NewGraphSnapshotFromData()` for tests, `Neighbors()`, `EdgeTypesTo()`, `ToReasoningNode()`
- [x] 1.7.3 Implement wave-following propagation loop at `circuit.go`: BFS queue, signal decay per hop, inertia threshold check (`tier/10`), TieredReasoner evaluation, modified nodes emit new signals
- [x] 1.7.4 Implement inertia tier resolution from `inertia_tier` property (string→int parsing)
- [x] 1.7.5 Implement signal strength: initial from Signal.Strength, decays `strength × decay^depth` per hop
- [x] 1.7.6 Implement threshold check: `decayedStrength < tier/10` → skip
- [x] 1.7.7 Wire in Reasoner interface: evaluation builds neighborhood context (up to 10 nodes), passes to reasoner
- [x] 1.7.10 Implement change classification: mechanical auto-apply, semantic/structural/creative propose for review
- [x] 1.7.12 Implement 4 of 5 circuit protection layers:
  - Layer 1: Signal decay ✅ (configurable factor, default 0.7)
  - Layer 2: Temporal damping ✅ (configurable interval, default 60s)
  - Layer 3: Oscillation detection ✅ (max evals per node, default 3 → freeze)
  - Layer 4: Token budget ✅ (50K/100K/200K per mode, halt on exhaustion)
  - Layer 5: Schema validation — deferred to 1.7.8
- [x] 1.7.14 Write 9 circuit tests: downward cascade, signal decay, oscillation detection, budget exhaustion, unchanged stops propagation, graph snapshot construction, inertia threshold, temporal damping, mechanical apply in non-dry-run
- [ ] 1.7.3b Implement parallel dispatch for independent nodes (deferred — sequential works first)
- [ ] 1.7.8 Implement post-evaluation schema validation (Layer 5)
- [ ] 1.7.9 Implement edge creation as circuit output (creative proposals)
- [ ] 1.7.11 Implement graph reload after each wave of applied changes
- [ ] 1.7.13 Implement human approval gate for tier 1-2 artifacts
- [ ] 1.7.15 Write propagation tests with real Emergent instance cascade patterns

### 1.8 Semantic Impact Analysis ✅ COMPLETE
Built during the live demo. `epf impact` loads the graph from Memory, runs the propagation circuit in dry-run mode, and prints a formatted cascade trace.
- [x] 1.8.1 Implement `epf impact` at `apps/epf-cli/cmd/impact.go`: loads graph via `LoadGraphSnapshot()`, runs circuit with heuristic reasoner (LLM reasoner pluggable), prints wave-by-wave trace
- [x] 1.8.2 Implement impact report: shows cascade trace grouped by wave, proposed changes grouped by tier, skipped nodes grouped by reason, oscillation and budget warnings
- [x] 1.8.3 Live demo: fd-012 change produces 32-node cascade across 3 tiers (Value Model, Features, Capabilities) in <1s. 96 nodes correctly skipped by inertia threshold.
- [x] 1.8.4 Heuristic reasoner for demo: tier-based heuristics (no LLM needed). Pluggable — swap in TieredReasoner for real evaluations.
- [ ] 1.8.3 Add `epf impact` CLI command and `epf_semantic_impact` MCP tool
- [ ] 1.8.4 Write impact analysis tests

### 1.9 Contradiction Detection
- [ ] 1.9.1 Implement pairwise contradiction check: nodes with high semantic similarity but opposing polarity
- [ ] 1.9.2 Implement cross-track tension detection: contradictory claims across tracks
- [ ] 1.9.3 Implement continuous background check: after each sync, scan affected neighborhood
- [ ] 1.9.4 Add `epf_contradictions` MCP tool
- [ ] 1.9.5 Write contradiction detection tests

### 1.10 Scenario Projection
- [ ] 1.10.1 Implement scenario creation: create a branch in emergent.memory graph with metadata (hypothesis, description)
- [ ] 1.10.2 Implement scenario modification: apply proposed changes to the branched graph
- [ ] 1.10.3 Implement scenario evaluation: run propagation circuit and contradiction detection on the branched graph
- [ ] 1.10.4 Implement semantic diff: compare branched graph to main graph showing cascade implications
- [ ] 1.10.5 Implement scenario commit: merge branched graph to main, generate YAML changes for Git commit
- [ ] 1.10.6 Add MCP tools: `epf_scenario_create`, `epf_scenario_modify`, `epf_scenario_evaluate`, `epf_scenario_commit`
- [ ] 1.10.7 Write scenario projection tests

### 1.11 MemorySource for StrategyStore
- [ ] 1.11.1 Implement `strategy.Source` interface as `MemorySource` (read from emergent.memory graph)
- [ ] 1.11.2 Wire into strategy store: auto-detect `EPF_MEMORY_URL`, `--source memory` flag
- [ ] 1.11.3 Ensure backward compatibility: all existing MCP tools work identically with MemorySource
- [ ] 1.11.4 Write MemorySource integration tests

### 1.12 Semantic Query Tools
- [ ] 1.12.1 Implement `epf_semantic_search` MCP tool: delegates to `memory query --mode=search` with EPF-specific formatting
- [ ] 1.12.2 Implement `epf_semantic_neighbors` MCP tool: given a node, query Memory graph for connected nodes with edge types and weights
- [ ] 1.12.3 Implement `epf_semantic_path` MCP tool: find the semantic path between two artifact sections via graph traversal
- [ ] 1.12.4 Write semantic query tests

### 1.13 Live Testing & Calibration
- [ ] 1.13.1 Ingest Emergent instance — validate node/edge counts, test semantic queries
- [ ] 1.13.2 Ingest Huma instance — validate against known cascade (North Star reframe)
- [ ] 1.13.3 Ingest LegalPlant instance — validate contradiction detection (known broken paths)
- [ ] 1.13.4 Ingest 21st instance — test on a simpler instance
- [ ] 1.13.5 Run impact analysis on each instance with real changes, calibrate inertia thresholds and signal decay
- [ ] 1.13.6 Run scenario projection on each instance, gather feedback on usefulness
- [ ] 1.13.7 Document Phase 1 learnings: what worked, what needs adjustment, what was surprising

### 1.14 Documentation
- [ ] 1.14.1 Create `openspec/specs/epf-semantic-engine/spec.md`
- [ ] 1.14.2 Update `openspec/specs/epf-strategy-server/spec.md` with MemorySource
- [ ] 1.14.3 Update AGENTS.md with semantic tooling guidance

## Phase 2: Causal AIM Loop (`add-causal-aim-loop`)

### 2.1 AIM Signal Ingestion
- [ ] 2.1.1 Define signal types: assessment outcome, trigger event, market signal, metric update
- [ ] 2.1.2 Implement signal ingestion: new evidence enters the graph as nodes with edges to the assumptions/beliefs they test
- [ ] 2.1.3 Implement signal classification: determine which READY/FIRE artifacts are semantically affected
- [ ] 2.1.4 Add `epf_ingest_signal` MCP tool

### 2.2 Automatic Cascade Triggering
- [ ] 2.2.1 Implement trigger monitoring: watch for AIM signals that exceed activation thresholds (maps to aim_trigger_config.yaml)
- [ ] 2.2.2 Implement automatic cascade: when a signal triggers, run the propagation circuit from Phase 1 automatically
- [ ] 2.2.3 Implement response classification: auto-adjust (mechanical), propose adjustment (semantic), flag for review (structural)
- [ ] 2.2.4 Implement auto-adjust for mechanical changes: update KR statuses, propagate path renames, update maturity levels
- [ ] 2.2.5 Implement AI agent dispatch for semantic adjustments: send affected subgraph as context, receive proposed YAML changes
- [ ] 2.2.6 Implement output validation: validate AI-proposed changes against EPF schemas before applying
- [ ] 2.2.7 Implement approval gates: human approval required for tier 1-2 artifacts (North Star, Insights)

### 2.3 Circuit Protection Tuning for Automatic Cascades
The 5-layer protection system is built in Phase 1. Phase 2 tunes it for automatic (AIM-triggered) cascades, which are riskier than interactive cascades because no human is watching.
- [ ] 2.3.1 Configure automatic cascade token budget (default 100K tokens — higher than interactive 50K, lower than scenario 200K)
- [ ] 2.3.2 Configure stricter temporal damping for automatic mode (default 120s vs 60s for interactive — slower automatic mutations give humans time to notice)
- [ ] 2.3.3 Implement safe mode: when any protection layer trips in automatic mode, halt the orchestration loop and alert. Don't just skip — full stop until human reviews.
- [ ] 2.3.4 Implement cascade audit log: every automatic cascade is logged with full trace (signal source, nodes evaluated, changes applied/proposed/rejected, protection layers triggered, cost)
- [ ] 2.3.5 Implement automatic rollback: if an automatic cascade's coherence check (Layer 5) shows degradation, automatically roll back and alert instead of leaving the damage
- [ ] 2.3.6 Write automatic cascade protection tests — specifically: what happens when AIM evidence triggers a cascade that oscillates? What happens when two AIM signals arrive simultaneously?

### 2.4 Orchestration Loop
- [ ] 2.4.1 Implement the 4-state circuit (Idle -> Sensing -> Dispatching -> Cooling)
- [ ] 2.4.2 Implement event-driven transitions (not polling)
- [ ] 2.4.3 Integrate with existing AIM MCP tools (epf_aim_write_assessment, epf_aim_write_calibration, epf_aim_recalibrate)
- [ ] 2.4.4 Write orchestration loop tests

### 2.5 Live Testing & Calibration
- [ ] 2.5.1 Run causal loop on Emergent instance through a complete AIM cycle
- [ ] 2.5.2 Run on Huma instance through an AIM cycle (most mature AIM artifacts)
- [ ] 2.5.3 Calibrate circuit breaker thresholds based on observed cascade behavior
- [ ] 2.5.4 Measure: auto-applied vs proposed vs flagged ratio — is it correctly calibrated?
- [ ] 2.5.5 Document Phase 2 learnings

### 2.6 Documentation
- [ ] 2.6.1 Create `openspec/specs/epf-causal-aim/spec.md`
- [ ] 2.6.2 Archive `add-emergent-ai-strategy` (subsumed)

## Phase 3: Strategy App — Desktop & Cloud (`add-strategy-app`)

### 3.1 Shared Engine Interfaces
- [ ] 3.1.1 Extract engine layer into clean Go interfaces: StrategyEngine (propagation, impact, scenarios), SemanticIndex (queries, embeddings), AIMLoop (signals, cascades)
- [ ] 3.1.2 Ensure engine has zero knowledge of delivery layer (no HTTP, no Wails, no MCP imports)
- [ ] 3.1.3 Write engine interface tests independent of delivery

### 3.2 htmx 4 + DaisyUI Interface
- [ ] 3.2.1 Design page structure: strategy graph view, artifact editor, cascade explorer, scenario playground, AIM dashboard
- [ ] 3.2.2 Implement Go HTML templates with htmx 4 `<hx-partial>` multi-target updates
- [ ] 3.2.3 Implement strategy graph visualization using htmx 4 `innerMorph` + lightweight JS graph library + DaisyUI
- [ ] 3.2.4 Implement cascade explorer with SSE streaming: watch propagation circuit process nodes in real time via htmx 4 SSE extension
- [ ] 3.2.5 Implement ETag-based conditional updates for dashboard panels
- [ ] 3.2.6 Implement scenario playground: create/modify/evaluate/commit scenarios via UI
- [ ] 3.2.7 Implement AIM dashboard: signal ingestion, cascade history, equilibrium status
- [ ] 3.2.8 Enable View Transitions API for smooth navigation between strategy views
- [ ] 3.2.9 Write UI tests

### 3.3 Local Cache & Offline Support
- [ ] 3.3.1 Implement `LocalCache` using SQLite + sqlite-vec (embedded in Go binary, zero external dependencies)
- [ ] 3.3.2 Implement graph snapshot sync: on connect, download full graph (nodes, edges, embeddings) from cloud Memory into local SQLite
- [ ] 3.3.3 Implement write-ahead log: changes made offline are queued in SQLite and replayed to cloud Memory on reconnect
- [ ] 3.3.4 Implement `HybridStore` that wraps `CloudStore` + `LocalCache`: routes to cloud when online, falls back to local cache when offline, auto-detects connectivity
- [ ] 3.3.5 Implement reconnection sync: replay write-ahead log, handle conflicts (last-write-wins with timestamp, flag ambiguous conflicts for review), re-embed changed objects via cloud
- [ ] 3.3.6 Implement offline indicator in UI: clearly show when operating from local cache vs cloud, what capabilities are degraded (Ollama-only reasoning, snapshot embeddings)
- [ ] 3.3.7 Write offline/online transition tests

### 3.4 Wails Desktop App
- [ ] 3.4.1 Set up Wails project at `apps/strategy-app/`
- [ ] 3.4.2 Embed Go engine + htmx 4 templates + HybridStore in Wails app
- [ ] 3.4.3 Implement Ollama detection and graceful fallback: if not installed, route all tiers to cloud (with cost warning). Prompt user to install for offline capability.
- [ ] 3.4.4 Implement first-run setup wizard (htmx 4-based):
  - Step 1: Sign in to cloud Memory (API token or OAuth)
  - Step 2: Select or create Memory project
  - Step 3: Select EPF instance (local Git repo)
  - Step 4: Ingest instance into cloud Memory + sync to local cache
  - Step 5: Optional: install Ollama for offline LLM capability
- [ ] 3.4.5 Implement local Git repo management (select/open EPF instance, detect changes, trigger sync)
- [ ] 3.4.6 Package for macOS, Windows, Linux (single binary + embedded SQLite, no Docker required)
- [ ] 3.4.7 Write desktop-specific integration tests

### 3.5 Cloud SaaS Deployment
- [ ] 3.5.1 Implement cloud HTTP server serving same htmx 4 templates (reuses the same Go engine + templates as Wails, different delivery layer)
- [ ] 3.5.2 Integrate existing multi-tenant auth (GitHub OAuth, MCP OAuth)
- [ ] 3.5.3 Wire to hosted emergent.memory instance (CloudStore only, no local cache needed)
- [ ] 3.5.4 Wire to cloud LLM APIs for all reasoning tiers
- [ ] 3.5.5 Deploy to Cloud Run (extend existing infrastructure)
- [ ] 3.5.6 Write cloud deployment tests

### 3.6 Live Testing
- [ ] 3.6.1 Deploy desktop app to internal users — test online + offline workflows
- [ ] 3.6.2 Test airplane mode: start online, go offline, make changes, reconnect, verify sync
- [ ] 3.6.3 Deploy cloud SaaS to pilot customers — gather feedback on workflow
- [ ] 3.6.4 Document Phase 3 learnings

### 3.7 Documentation
- [ ] 3.7.1 Create `openspec/specs/epf-strategy-app/spec.md`

## Phase 4: Multi-Instance Network (`add-strategy-network`)

### 4.1 Inter-Instance Protocol
- [ ] 4.1.1 Define MCP socket extension for inter-instance communication (sovereignty weights, signal types)
- [ ] 4.1.2 Implement instance registration and discovery
- [ ] 4.1.3 Implement signal propagation with sovereignty-weighted attenuation
- [ ] 4.1.4 Implement containment: local storms stay local until equilibrium or containment threshold
- [ ] 4.1.5 Ensure protocol works across deployment modes (desktop <-> cloud, cloud <-> cloud)

### 4.2 Cross-Instance Semantic Queries
- [ ] 4.2.1 Extend semantic search to span connected instances
- [ ] 4.2.2 Implement cross-instance contradiction detection
- [ ] 4.2.3 Implement hierarchical cascade: group-level changes propagate down with sovereignty weights

### 4.3 Strategy-of-Strategies
- [ ] 4.3.1 Define meta-level AIM loop for cross-instance coherence
- [ ] 4.3.2 Implement aggregated fitness metrics (subsidiary health visible to group)
- [ ] 4.3.3 Implement mutation proposals (subsidiary requests group constraint change)

### 4.4 Live Testing
- [ ] 4.4.1 Connect Emergent group instance to product subsidiary instances
- [ ] 4.4.2 Test cross-instance cascade with real strategic changes
- [ ] 4.4.3 Document Phase 4 learnings

### 4.5 Documentation
- [ ] 4.5.1 Create `openspec/specs/epf-strategy-network/spec.md`
