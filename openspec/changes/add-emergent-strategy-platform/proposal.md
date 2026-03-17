# Change: Evolve EPF into a Semantic Strategy Runtime

## Why

EPF models strategy as a causally connected graph of YAML artifacts. The READY phase lays down beliefs and plans (North Star -> Insights -> Opportunity -> Strategy Formula -> Roadmap). FIRE converts strategy into structured execution (Feature Definitions, Value Models, Mappings). AIM closes the loop by collecting evidence that validates or invalidates READY assumptions, triggering recalibration.

**The coupling between artifacts is fundamentally semantic, not just referential.** Across 8 real EPF instances:

- When Huma's North Star reframed from "TES company" to "full thermal energy platform," every downstream artifact — insights, strategy, 23 features, 8 value models, roadmap — needed semantic reassessment. Not because path strings broke, but because the *meaning* of the strategic foundation changed.
- LegalPlant's personas are described in insight analyses AND duplicated in 17 feature definitions. They're connected by meaning, not by ID. When a persona's pain points evolve, there's no way to detect feature-level drift without reading and understanding both.
- Adding the word "NOT" to a core belief can invalidate the rationale for 19 feature definitions. No structural check catches this — it requires semantic reasoning over the connected graph.

**Today, every semantic assessment requires a full LLM context read of all artifacts.** Even for a one-word change. This makes strategy iteration slow (~30-60s per assessment), expensive (large context = high tokens), and non-interactive. Strategic managers can't explore "what if" scenarios in real time.

**The AIM feedback loop is designed to be causal but operates manually.** The framework defines AIM triggers (ROI thresholds, assumption invalidation, opportunity signals) that should automatically trigger READY/FIRE recalibration. Today, a human reads the assessment report, realizes an assumption was invalidated, manually decides which artifacts to update, and manually runs validation. The AIM -> READY -> FIRE causal chain is broken.

**This compounds at enterprise scale.** The vision is strategy-of-strategies: a group strategy instance connected to subsidiary instances, each with their own READY-FIRE-AIM loops. Changes at the group level cascade down; discoveries at the subsidiary level bubble up. With manual processes, this is unmanageable beyond 2-3 instances.

## What Changes

The core architectural shift: **strategy artifacts need a semantic runtime** — a system where the meaning of artifacts is pre-computed, indexed, and queryable, so that changes can be evaluated incrementally against the semantic graph rather than requiring full re-reads.

emergent.memory provides this runtime. It has:
- **Graph entities and relationships** — for modeling the causal connections between artifacts
- **Vector embeddings (pgvector)** — for finding semantically related content without full reads
- **Search (vector + FTS)** — for querying across the semantic space
- **Schema registry** — for modeling EPF artifact types
- **Branching** — for scenario exploration

Git remains the authoritative record (the "DNA"). emergent.memory becomes the live, queryable, reactive state (the "Connectome").

Each phase delivers substantial, standalone value that can be tested across live projects before proceeding to the next. Learning between phases is explicit — each phase produces operational insights that inform the next.

**Before building, update the Emergent EPF instance itself.** The current instance (emergent-epf) reflects a "Context Layer for AI" positioning. The semantic strategy runtime direction requires updating the North Star, strategy formula, roadmap (new Cycle 2), value models (new layers for semantic engine, propagation, tiered reasoning), and creating 6 new feature definitions. This is both necessary preparation and the first dogfooding of the framework — using EPF to plan and track the evolution of EPF.

### Phase 1: Semantic Strategy Engine (`add-semantic-engine`)
**Value delivered**: Strategic managers change a belief and in seconds see which features, OKRs, and competitive claims are semantically affected. They explore "what if?" scenarios without committing. Contradiction detection runs continuously.

This phase builds the complete vertical stack from ingestion to user-facing impact analysis:

- **Artifact ingestion into emergent.memory**: Parse EPF YAML, create graph entities per artifact section (not just per file — a persona's pain point is a separate node), generate vector embeddings, create structural + semantic + causal edges
- **The universal propagation circuit**: When a node changes, traverse the semantic graph to find affected nodes, evaluate each using tiered LLM reasoning (local SLM for low-inertia artifacts, frontier models for high-inertia), recurse with damping. This is the core mechanism that repeats at every scale.
- **Semantic impact analysis**: Run the propagation circuit in dry-run mode — show the cascade without applying changes. "If I change this belief, here's what's affected and why."
- **Scenario projection**: Create a branch in the semantic graph, make proposed changes, run the propagation circuit on the branch. "What if we drop the franchise model?" — see the full cascade before committing.
- **Contradiction detection**: Continuous check for semantic contradictions across the artifact graph (e.g., North Star says "enterprise focus" but a new feature targets "solo developers").
- **Incremental sync**: Git -> Memory sync triggered by file changes. Only re-embed changed sections and recompute affected semantic edges.
- **MCP tools for everything**: `epf_semantic_search`, `epf_semantic_impact`, `epf_scenario_create`, `epf_scenario_evaluate`, `epf_contradictions`

**Learning between phases**: Run Phase 1 across Emergent, Huma, LegalPlant, 21st, and other live instances. Learn: Are the embeddings accurate enough? Does the propagation circuit find the right affected nodes? Are the inertia tiers correctly calibrated? Do strategic managers actually find the impact analysis useful? What scenarios do they explore? Adjust thresholds, edge types, and reasoning tier assignments based on real usage.

### Phase 2: Causal AIM Loop (`add-causal-aim-loop`)
**Value delivered**: AIM evidence automatically triggers READY/FIRE recalibration proposals. Routine adjustments auto-apply. High-impact changes require human approval. The READY-FIRE-AIM loop closes.

Builds on Phase 1's propagation circuit — the circuit already exists, this phase adds automatic triggering:

- **AIM signal ingestion**: Structured evidence (assessment outcomes, trigger events, market signals) enters the semantic graph as new nodes with edges to the assumptions/beliefs they test
- **Automatic cascade triggering**: When a signal enters, the propagation circuit runs automatically — not just on manual "what if?" requests, but triggered by data
- **Tiered response classification**: For each affected artifact, classify the required response: auto-adjust (mechanical, e.g., update KR status), propose adjustment (semantic, e.g., revise feature narrative), flag for review (structural, e.g., North Star belief invalidated)
- **Circuit breakers**: Token budgets, temporal damping (minimum interval between mutations), cascade depth limits, human approval gates for high-inertia artifacts
- **Orchestration loop**: Simple 4-state circuit (Idle -> Sensing -> Dispatching -> Cooling) driven by events, not polling

**Learning between phases**: Run Phase 2 across live instances for several AIM cycles. Learn: How often do automatic cascades fire? Are the circuit breakers correctly calibrated (not too conservative, not too permissive)? Do the auto-applied adjustments improve consistency or introduce errors? Which LLM tier handles which evaluation well? What percentage of cascades need human intervention?

### Phase 3: Strategy App — Desktop & Cloud (`add-strategy-app`)
**Value delivered**: Strategic managers interact with the engine through a visual interface — strategy graph, cascade explorer, scenario playground, AIM dashboard. Runs locally as a desktop app or as cloud SaaS. Same experience, same engine.

Builds on Phase 1-2's engine — the capabilities already exist, this phase makes them accessible to non-technical users:

- **Wails desktop app**: Go backend + native webview. Strategy data stays on the user's machine. Local emergent.memory (embedded or Docker). Local LLM via Ollama for tier 5-7 evaluations.
- **htmx 4 + DaisyUI interface**: Server-rendered HTML, no JS frameworks. htmx 4 for: `<hx-partial>` multi-target updates, `innerMorph` (update graph without losing DOM state), SSE streaming (watch cascades in real time), ETag caching (skip re-render when data unchanged), View Transitions (smooth navigation).
- **Cloud SaaS**: Same Go server, same templates. Multi-tenant auth, hosted emergent.memory, cloud LLM APIs. The engine layer is identical to desktop.

**Learning between phases**: Deploy the app to real strategic managers (internal first, then pilot customers). Learn: What visualizations are most useful? Is the cascade explorer understandable? Do people prefer desktop or cloud? What's the onboarding experience like? What features are missing that only become apparent with a real UI?

### Phase 4: Multi-Instance Network (`add-strategy-network`)
**Value delivered**: Multiple EPF instances connect in a dynamic weighted graph. Group-level strategy cascades down to subsidiaries. Subsidiary discoveries bubble up. The same propagation circuit works across instance boundaries via MCP sockets.

Builds on all previous phases — extends the propagation circuit across instance boundaries:

- **MCP sockets**: Standardized inter-instance connectors with sovereignty weights (how tightly coupled are the instances). Same mechanism as intra-instance semantic edges, but with sovereignty-weighted attenuation.
- **Signal propagation across instances**: Changes in one instance propagate to connected instances. Containment prevents local storms from destabilizing the network.
- **Fractal READY-FIRE-AIM**: Each instance runs its own loop; the network level has its own meta-loop for cross-instance coherence.
- **Works across deployment modes**: Desktop app instances connect to cloud instances and vice versa — the MCP socket protocol is the same.

**Learning**: Run across the actual Emergent company structure (emergent.memory, epf-cli, other products as subsidiary instances, Emergent as group instance). Learn: Does the sovereignty model work in practice? Are cross-instance cascades useful or noisy? How does containment perform?

## Impact

### Existing Specs — Disposition

| Spec | Disposition | Rationale |
|------|------------|-----------|
| `epf-strategy-server` | **Extend** (Phase 1) | MemorySource for StrategyStore, semantic query tools |
| `epf-cli-mcp` | **Extend** (Phases 1-2) | New semantic MCP tools |
| `epf-opencode-plugin` | **Extend** (Phase 2) | Causal loop hooks |
| `epf-cli-auth` | **Keep, extend later** | Auth bridging for emergent.memory (Zitadel) |
| `epf-lsp` | **Keep as-is** | Orthogonal |
| `epf-strategy-instance` | **Keep as-is** | Data quality spec |
| `openspec-workflow` | **Keep as-is** | Process spec |
| `products` | **Context doc** | Aligns with vision |

### Existing Changes — Disposition

| Change | Disposition | Rationale |
|--------|------------|-----------|
| `refactor-agents-and-skills` | **Complete first** | Agent/skill infra needed for Phase 2 |
| `migrate-canonical-agents-skills` | **Complete first** | Content migration |
| `add-aim-recalibration-engine` | **Phase 3 CLI independent; Phase 4 subsumed** | AIM CLI tools proceed; autonomous recalibration becomes Phase 2 |
| `add-emergent-ai-strategy` | **Subsumed by Phase 2** | Causal loop is the concrete implementation |
| `add-github-app-multi-tenant` | **Keep independent** | Tactical |
| `add-mcp-session-audit` | **Keep independent** | Operational |

### Affected Code

- `apps/epf-cli/internal/memory/` — New: emergent.memory client and ingestion engine
- `apps/epf-cli/internal/semantic/` — New: semantic index, embedding queries, propagation circuit, impact analysis
- `apps/epf-cli/internal/strategy/` — Extended: MemorySource implementation
- `apps/epf-cli/internal/sync/` — New: Git <-> memory sync engine
- `apps/epf-cli/internal/reasoner/` — New: tiered LLM reasoning (Ollama, cloud, frontier)
- `apps/epf-cli/internal/mcp/` — Extended: semantic query, scenario, and AIM MCP tools
- `apps/strategy-app/` — New: Wails desktop app + cloud HTTP server + htmx 4 templates

### External Dependencies

- `emergent-company/emergent.memory` — Knowledge graph platform (Phase 1+)
- Embedding model (local or API) — Vector generation (Phase 1+)
- Ollama — Local LLM runtime for tier 5-7 evaluations (Phase 1+)
- AI agent infrastructure — Targeted evaluation and adjustment (Phase 1+)
- Wails — Desktop app framework (Phase 3)
- htmx 4 (`htmx.org@next`) — Hypermedia UI (Phase 3)
- DaisyUI — UI component library (Phase 3)

## Phasing Rationale

Each phase delivers a complete capability that strategic managers can use across live projects, with explicit learning periods between phases:

1. **Semantic Strategy Engine first** because it delivers the core value proposition: fast, interactive semantic impact analysis and scenario exploration. This is the capability that changes how strategic managers work. Everything else builds on it. **Test across all 8 live instances before proceeding.**

2. **Causal AIM Loop second** because it extends the Phase 1 engine from "on-demand" to "automatic." The propagation circuit already exists; this phase adds AIM-triggered activation and circuit breakers. Phase 1 learning informs the calibration: we know which evaluations are accurate, which inertia tiers work, and which LLM tier handles what. **Run through several AIM cycles across live instances before proceeding.**

3. **Strategy App third** because the engine must work well before wrapping it in a UI. Phases 1-2 are consumed via MCP tools (by AI agents and technical users). Phase 3 makes the same capabilities accessible to non-technical strategic managers. Phase 1-2 learning informs the UI design: we know which visualizations matter, which scenarios people explore, and what the workflow looks like. **Deploy to internal users, then pilot customers, before proceeding.**

4. **Multi-Instance Network last** because it multiplies the semantic graph across instance boundaries. Get one instance working as a responsive, automated system delivered as a usable product before connecting instances together. Phase 1-3 learning informs the multi-instance design: we know how cascades behave, what containment looks like, and what the operational model is.
