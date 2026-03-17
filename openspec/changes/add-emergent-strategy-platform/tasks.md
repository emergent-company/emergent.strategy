## Prerequisites (Complete Before Phase 1)

### P.A Complete Active Changes
- [ ] P.1 Complete `refactor-agents-and-skills` (4 remaining tasks)
- [ ] P.2 Complete `migrate-canonical-agents-skills` (content migration)
- [ ] P.3 Complete `add-aim-recalibration-engine` Phase 3 CLI
- [ ] P.4 Ship `add-mcp-session-audit`
- [ ] P.5 Ship `add-github-app-multi-tenant`

### P.B Update Emergent EPF Instance (emergent-epf)

The Emergent EPF instance currently reflects a "Context Layer for AI" positioning. It must be updated to reflect the semantic strategy runtime direction before Phase 1 begins. This is both necessary strategic preparation and the first dogfooding exercise.

**Tier 1: Strategic Foundation (must do first — all downstream artifacts reference these)**
- [ ] P.6 Update `READY/00_north_star.yaml` — revise vision, mission, core beliefs, key capabilities to reflect the semantic strategy runtime direction (propagation circuits, tiered reasoning, desktop+cloud, multi-instance networking)
- [ ] P.7 Update `READY/01_insight_analyses.yaml` — add technology trends (semantic runtime architectures, tiered LLM reasoning, desktop app renaissance, federation patterns), new competitors (strategy tools, AI strategy assistants), new white spaces, new key insights
- [ ] P.8 Update `READY/02_strategy_foundations.yaml` — align product vision, value proposition, and sequencing with updated North Star
- [ ] P.9 Update `READY/03_insight_opportunity.yaml` — reframe opportunity for semantic strategy runtime, update pain points, value hypothesis, and success indicators
- [ ] P.10 Update `READY/04_strategy_formula.yaml` — rewrite positioning (semantic strategy runtime category), competitive moat (propagation circuits as primary differentiator), business model (strategy sessions, propagation events, reasoning tiers, instance count), success metrics

**Tier 2: Execution Framework (translates direction into plans)**
- [ ] P.11 Create new `READY/05_roadmap_recipe.yaml` Cycle 2 — new OKRs for semantic engine, propagation circuits, tiered reasoning, desktop+cloud app, multi-instance networking. New assumptions (asm-p-020 through asm-p-025). New solution scaffold. Archive Cycle 1.
- [ ] P.12 Rewrite `FIRE/value_models/product.epf-runtime.value_model.yaml` — add new layers: Semantic Strategy Engine, Propagation Circuits, Tiered LLM Reasoning, Desktop Application, Multi-Instance Networking
- [ ] P.13 Update `FIRE/value_models/product.emergent-memory.value_model.yaml` — reposition Memory as integrated substrate within the semantic runtime, not a standalone product
- [ ] P.14 Update `product_portfolio.yaml` — revise product line descriptions and relationships for the new architecture

**Tier 3: Feature Definitions (define the capabilities to build)**
- [ ] P.15 Create `fd-020_semantic_strategy_engine.yaml` — core semantic engine treating EPF artifacts as a live semantic graph
- [ ] P.16 Create `fd-021_propagation_circuits.yaml` — automatic propagation of strategy changes across artifact dependencies and instances
- [ ] P.17 Create `fd-022_tiered_llm_reasoning.yaml` — router selecting appropriate LLM tier based on task complexity and cost
- [ ] P.18 Create `fd-023_desktop_application.yaml` — Wails desktop app with htmx 4 + DaisyUI interface
- [ ] P.19 Create `fd-024_multi_instance_networking.yaml` — protocol for connecting EPF instances with sovereignty weights
- [ ] P.20 Create `fd-025_emergent_memory_integration.yaml` — deep integration between EPF-CLI and emergent.memory
- [ ] P.21 Update `fd-014_ai_strategy_agent.yaml` — add tiered reasoning and propagation awareness
- [ ] P.22 Update `fd-016_epf_cloud_server.yaml` — add multi-instance networking role

**Tier 4: Supporting Artifacts (keep the instance consistent)**
- [ ] P.23 Update `AIM/living_reality_assessment.yaml` — update track baselines, current focus, operating assumptions for new direction
- [ ] P.24 Update `AIM/aim_trigger_config.yaml` — add new critical assumptions (asm-p-020 through asm-p-025)
- [ ] P.25 Update `FIRE/mappings.yaml` — update code artifact URLs for Go-based architecture, add mappings for new semantic runtime components
- [ ] P.26 Activate relevant components in `strategy.value_model.yaml` and `commercial.value_model.yaml`
- [ ] P.27 Run `epf health` on the updated instance — validate all cross-references, schema compliance, and content readiness

## Phase 1: Semantic Strategy Engine (`add-semantic-engine`)

### 1.1 Blueprint & Schema Setup
- [ ] 1.1.1 Create blueprint directory at `docs/EPF/_instances/emergent/.memory/` with `packs/`, `seed/objects/`, `seed/relationships/` subdirectories
- [ ] 1.1.2 Design epf-engine schema pack (YAML) with section-level object types: Belief, Trend, PainPoint, Positioning, Assumption, Capability, Scenario — each with `inertia_tier` property. Keep existing file-level types (Artifact, Feature, Persona, OKR, etc.)
- [ ] 1.1.3 Add semantic relationship types: supports, contradicts, elaborates, parallels (with `confidence` property)
- [ ] 1.1.4 Add causal relationship types: informs, validates, invalidates, constrains (with `strength` property)
- [ ] 1.1.5 Add `weight` and `edge_source` properties to all relationship types
- [ ] 1.1.6 Apply blueprint to epf-engine project: `memory blueprints .memory/ --project epf-engine --upgrade`
- [ ] 1.1.7 Commit blueprint directory to Git (schema is now version-controlled alongside EPF artifacts)

### 1.2 emergent.memory Client
- [ ] 1.2.1 Create `apps/epf-cli/internal/memory/` package — thin wrapper around Memory CLI or REST API
- [ ] 1.2.2 Implement auth configuration: `EPF_MEMORY_URL`, `EPF_MEMORY_TOKEN` (or delegate to `memory` CLI config)
- [ ] 1.2.3 Implement graph object CRUD (create, update, delete, list, get)
- [ ] 1.2.4 Implement graph relationship CRUD
- [ ] 1.2.5 Implement batch operations via blueprints seed format (generate JSONL, apply via `memory blueprints`)
- [ ] 1.2.6 Implement query delegation (`memory query --mode=search` for semantic search, `memory query` for agent reasoning)
- [ ] 1.2.7 Write client tests

### 1.3 Artifact Decomposition & Ingestion
- [ ] 1.3.1 Define section-to-object-type mapping per EPF artifact type (north_star sections → Belief objects, insight_analyses → Trend + PainPoint objects, etc.)
- [ ] 1.3.2 Implement section parser: given a YAML artifact, emit typed graph objects with properties matching schema v2
- [ ] 1.3.3 Generate JSONL seed files from parsed objects (blueprints format)
- [ ] 1.3.4 Write decomposition tests for each artifact type
- [ ] 1.3.5 Note: embeddings are generated automatically by Memory's background workers — no embedding engine needed in epf-cli

### 1.4 Tiered Reasoning Engine
- [ ] 1.4.1 Define `Reasoner` interface (Evaluate: change + target + neighborhood -> Assessment)
- [ ] 1.4.2 Implement `LocalReasoner` using Ollama for local SLM evaluation (tier 5-7 artifacts)
- [ ] 1.4.3 Implement `CloudReasoner` for mid-tier cloud model evaluation (tier 3-4 artifacts, via Memory's provider API or direct)
- [ ] 1.4.4 Implement `FrontierReasoner` for frontier model evaluation (tier 1-2 artifacts)
- [ ] 1.4.5 Implement `TieredReasoner` that routes based on target inertia tier with confidence-based escalation
- [ ] 1.4.6 Write reasoner tests with fixture evaluations at each tier

### 1.5 Semantic Graph Construction
- [ ] 1.5.1 Implement full ingestion pipeline: parse instance -> decompose into typed objects -> generate JSONL -> apply via `memory blueprints`
- [ ] 1.5.2 Implement structural edge creation from YAML references (contributes_to, dependencies, assumptions, KR targets, mappings)
- [ ] 1.5.3 Implement semantic edge computation: query Memory for embedding similarity between objects, create semantic edges above confidence threshold
- [ ] 1.5.4 Implement causal edge computation with priority ordering (Finding 5): (1) explicit declarations (informs_ready_phase sections), (2) structural references (contributes_to, dependencies), (3) embedding similarity as fallback
- [ ] 1.5.5 Add `epf ingest` CLI command and `epf_ingest_instance` MCP tool
- [ ] 1.5.6 Write ingestion tests with fixture data

### 1.6 Incremental Sync
- [ ] 1.6.1 Implement change detection: hook into existing file watcher, identify changed YAML sections by content hash
- [ ] 1.6.2 Implement incremental update: re-parse changed sections, call `memory graph objects update` for modified objects, recompute semantic edges for affected neighborhood
- [ ] 1.6.3 Implement Git-triggered sync: on commit, identify changed files, run incremental update
- [ ] 1.6.4 Add `epf sync` CLI command and `epf_sync_to_memory` MCP tool
- [ ] 1.6.5 Write incremental sync tests

### 1.7 Propagation Circuit
- [ ] 1.7.1 Implement the universal propagation circuit (5-step loop from design.md)
- [ ] 1.7.2 Implement wave-following evaluation: the circuit follows edges wherever they lead (upward, downward, horizontal), not strictly top-down (Finding 1). Each newly-changed node becomes a new signal source. Damping prevents infinite loops.
- [ ] 1.7.3 Implement parallel dispatch for independent nodes: within a cascade wave, nodes that don't depend on each other's evaluation results evaluate concurrently (Finding 2). Dependency detection via shared semantic edges.
- [ ] 1.7.4 Implement inertia tier resolution: given a node, determine its inertia level (1-7) from object type (schema v2 `inertia_tier` property)
- [ ] 1.7.5 Implement signal strength calculation: initial signal from change magnitude (embedding distance via Memory query), decays per hop (configurable factor)
- [ ] 1.7.6 Implement threshold check: signal strength vs inertia -> evaluate or skip
- [ ] 1.7.7 Wire in TieredReasoner: step 3c selects model based on target inertia tier. Pass EPF schema constraints as context so proposed changes are schema-valid (Finding 3)
- [ ] 1.7.8 Implement post-evaluation schema validation: validate proposed changes against EPF schemas before applying. Re-dispatch with constraint info if validation fails (Finding 3)
- [ ] 1.7.9 Implement edge creation as circuit output: when cascade reaches a gap, propose new cross-references or flag for creative review (Finding 4)
- [ ] 1.7.10 Implement change classification: mechanical (auto-apply), semantic (propose + review), structural (require approval), creative (flag gap, require human) (Finding 6)
- [ ] 1.7.11 Implement graph reload after each wave of changes applied (Finding 7)
- [ ] 1.7.12 Implement 5-layer circuit protection (see design.md Decision 7):
  - Layer 1: Signal decay (configurable factor, default 0.7 per hop)
  - Layer 2: Temporal damping (min interval between re-evaluations of same node, default 60s)
  - Layer 3: Oscillation detection (same node evaluated 3+ times → freeze subgraph, surface to human)
  - Layer 4: Token budget per cascade (interactive: 50K, automatic: 100K, scenario: 200K)
  - Layer 5: Change validation — schema check + coherence check + rollback checkpoint
- [ ] 1.7.13 Implement human approval gate for tier 1-2 artifacts
- [ ] 1.7.14 Write circuit protection tests: oscillation, budget exhaustion, schema-invalid proposal, destabilizing change, rollback
- [ ] 1.7.15 Write propagation circuit tests with known cascade patterns (downward, upward, wave) — use the manual Emergent instance update as reference

### 1.8 Semantic Impact Analysis
- [ ] 1.8.1 Implement `epf impact` as a dry-run of the propagation circuit: run the circuit but don't apply changes, collect the cascade trace
- [ ] 1.8.2 Implement impact report: structured output showing cascade path, affected artifacts per tier, reasoning tier used, estimated cost
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
