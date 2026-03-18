## Context

EPF artifacts form a hierarchical semantic graph. Within a single instance, the hierarchy runs from North Star (highest inertia, changes rarely) down through Insights, Strategy Formula, Roadmap, Value Models, Features, to Capabilities (lowest inertia, changes frequently). Changes propagate both downward (strategy decisions constrain execution) and upward (execution evidence challenges strategy beliefs). Horizontal connections between the 4 tracks (Product, Strategy, OrgOps, Commercial) create cross-track tension.

This same pattern repeats at the multi-instance level: a group strategy instance is "above" its subsidiary instances, just as a North Star is "above" its feature definitions. Subsidiary discoveries bubble up to challenge group strategy, just as AIM evidence bubbles up to challenge North Star beliefs.

**The fractal principle: the propagation mechanism is identical at every scale.** Whether a change is propagating from a North Star belief to a feature narrative, or from a group strategy to a subsidiary roadmap, the circuit is the same.

### The Universal Propagation Circuit

```
1. Node X changed
2. Query: what nodes are connected to X? (structural + semantic edges)
3. For each connected node Y:
   a. What's the inertia of Y relative to X?
   b. Is the signal strong enough to overcome Y's inertia?
   c. If yes: select reasoning tier based on Y's inertia (local SLM / cloud / frontier)
   d. Evaluate whether Y needs to change (targeted LLM call at the selected tier)
   e. If Y changes: Y becomes a new signal source → recurse (with damping)
```

This circuit runs the same way for:
- **Downward cascade** (North Star change -> re-evaluate Strategy Formula -> re-evaluate Roadmap -> re-evaluate Features)
- **Upward cascade** (AIM assumption invalidated -> re-evaluate Roadmap -> re-evaluate Strategy Formula -> flag North Star for review)
- **Wave cascade** (AIM evidence invalidates assumption at tier 7 -> propagates up to roadmap tier 4 -> up to strategy formula tier 3 where the moat claim depends on the invalidated assumption -> reflects back down to value models tier 5, features tier 6, and opportunity tier 2)
- **Horizontal cascade** (Product capability delivered -> re-evaluate Commercial positioning -> re-evaluate Strategy messaging)
- **Cross-instance cascade** (Group strategy shift -> re-evaluate Subsidiary North Stars -> each triggers internal cascade in any direction)

The only things that change between scales are:
- **The graph** (nodes and edges — what's connected to what)
- **The inertia weights** (North Star has highest inertia, capabilities have lowest; group strategy has higher inertia than subsidiary strategy)
- **The reasoning tier** (low-inertia nodes evaluated by local SLMs, high-inertia nodes evaluated by frontier models)
- **The communication channel** (in-process graph traversal within an instance; MCP socket across instances)

### Constraints
- EPF-CLI remains the validation and structural tooling layer
- Git remains the authoritative record — emergent.memory is the live semantic state
- The propagation circuit must work offline for a single instance (reduced: no semantic edges, structural edges only)
- emergent.memory provides the graph, embeddings, and search infrastructure
- The circuit must be simple — complexity in topology, not in code

### Stakeholders
- Strategic managers who need fast, interactive strategy iteration
- AI agents that maintain artifacts via MCP tools
- Enterprise users operating strategy-of-strategies across subsidiaries

## Goals / Non-Goals

### Goals
- Build one propagation circuit that works at every scale (intra-artifact, intra-instance, inter-instance)
- Pre-compute semantic relationships so changes trigger targeted evaluation, not full re-reads
- Close the AIM -> READY -> FIRE causal loop
- Enable real-time "what if?" scenario exploration
- Keep the Go orchestration layer simple — a circuit, not a logic engine

### Non-Goals
- Replacing Git as the source of record
- Building a web frontend or desktop app (future scope)
- Supporting non-EPF frameworks
- Real-time collaborative editing
- Rebuilding emergent.memory's capabilities

## Decisions

### Decision 1: One circuit, three scale modes

**What**: The propagation circuit is implemented once as a generic graph traversal with pluggable node resolution and communication. It operates in three modes:

- **Intra-instance mode**: Nodes are artifact sections in one EPF instance. Edges are structural (from YAML references) + semantic (from embedding similarity) + causal (from EPF phase knowledge). Communication is in-process.
- **Inter-instance mode**: Nodes are EPF instances. Edges are MCP socket connections with sovereignty weights. Communication is MCP tool calls.
- **Offline mode**: Same as intra-instance but without semantic edges (no emergent.memory). Only structural edges from YAML references. Degraded but functional.

**Why**: Building separate mechanisms for intra-instance and inter-instance propagation would duplicate logic and prevent the fractal architecture. The circuit doesn't care what a "node" is — it only cares about edges, weights, and thresholds.

### Decision 2: EPF hierarchy defines inertia tiers

**What**: Inertia (resistance to change) is determined by position in the EPF hierarchy:

| Tier | Artifacts | Inertia | Signal required to trigger change |
|------|-----------|---------|----------------------------------|
| 1 (Root) | North Star | Highest | Multiple invalidated core beliefs with strong evidence |
| 2 | Insight Analysis, Strategy Foundations | High | Significant market shift or validated counter-evidence |
| 3 | Insight Opportunity, Strategy Formula | Medium-High | Opportunity invalidation or competitive repositioning need |
| 4 | Roadmap Recipe | Medium | Assumption invalidation or KR miss |
| 5 | Value Models | Medium-Low | Strategic restructuring or coverage gap |
| 6 | Feature Definitions | Low | Capability reprioritization or dependency change |
| 7 | Capabilities, Mappings | Lowest | Implementation evidence or KR completion |

In multi-instance mode, group instances sit at tier 0 (above North Star) for their subsidiaries, and subsidiary instances collectively sit at tier 7+ (below capabilities) for their group.

**Why**: This maps directly to observed EPF behavior. Huma's North Star reframe happened once and cascaded to everything. Feature definitions change with every sprint. The inertia tiers encode this natural frequency difference.

### Decision 3: Section-level semantic nodes

**What**: When ingesting EPF artifacts into emergent.memory, each semantically meaningful section becomes its own graph node. A persona's pain point is a separate node from the persona itself. A North Star core belief is a separate node from the vision statement.

**Why**: The propagation circuit needs granular nodes to do targeted evaluation. Adding "NOT" to one core belief should trigger re-evaluation of the 3-5 downstream nodes semantically connected to that specific belief, not all 19 features. Section-level granularity enables this precision.

**Approximate node counts per instance**: 300-500 semantic nodes with 1000-2000 edges. A multi-instance network with 5 subsidiaries would be ~2000 nodes with ~10,000 edges. Well within emergent.memory's capacity.

### Decision 4: Three types of edges

**What**: Edges carry typed meaning:

- **Structural edges** (deterministic, from YAML references): `contributes_to`, `targets_kr`, `tests_assumption`, `requires`, `enables`, `maps_to_value_model`. These are always present, even in offline mode.
- **Semantic edges** (computed from embedding similarity): `supports`, `contradicts`, `elaborates`, `parallels`. These are discovered by comparing vector embeddings. They capture meaning-level relationships not expressed in field references. Requires emergent.memory.
- **Causal edges** (computed from EPF phase knowledge): `informs`, `validates`, `invalidates`, `constrains`, `triggers_recalibration`. These encode the READY-FIRE-AIM causal flow. They have direction and carry the inertia differential between tiers.

**Why**: Structural edges alone miss the "NOT" problem (semantic change without structural change). Semantic edges alone miss the framework's intentional causal structure. Causal edges encode the propagation rules that are currently implicit in EPF documentation (Huma's `informs_ready_phase` section is an explicit example).

### Decision 5: Targeted LLM calls replace full context reads

**What**: When the propagation circuit determines that node Y needs re-evaluation, it sends only node Y's content + node X's change + the local semantic neighborhood to an LLM. Not the full artifact set.

**Typical context size**: 5-15 nodes per evaluation (the changed node + its direct semantic neighbors). At ~200-500 tokens per node, this is 1K-7.5K tokens per evaluation — vs. 50K-100K tokens for a full instance read.

**Why**: This is the core performance improvement. Reading 160 artifacts through an LLM takes 30-60 seconds and costs $0.10-0.50 per evaluation. Targeted evaluation of 5-15 nodes takes 2-5 seconds and costs $0.01-0.05. This makes interactive strategy iteration feasible.

### Decision 6: Tiered LLM reasoning is part of the circuit

**What**: The propagation circuit selects the reasoning model as part of its core loop, not as external configuration. Model selection is determined by the target node's inertia tier:

| Inertia Tier | Artifacts | Model Tier | Reasoning Character |
|---|---|---|---|
| 7 (Lowest) | Capabilities, Mappings | Local SLM (Ollama) | Pattern matching: "does this path still resolve?" |
| 6 | Feature Definitions | Local SLM | Bounded comparison: "does this JTBD still align with the value prop?" |
| 5 | Value Models | Local SLM or mid-tier | Structural assessment: "is this value hierarchy still coherent?" |
| 4 | Roadmap Recipe | Mid-tier cloud model | Synthesis: "is this assumption still valid given new evidence?" |
| 3 | Strategy Formula, Opportunity | Frontier model | Strategic reasoning: "how should positioning shift?" |
| 2 | Insights, Strategy Foundations | Frontier model | Market analysis: "what do these trends mean for our strategy?" |
| 1 (Highest) | North Star | Frontier model + human | Existential: "is our core belief still valid?" Always requires human approval. |

**Why**: Most evaluations in a cascade are low-tier (features, capabilities, mappings). These are reflexive — simple semantic comparisons that a local 8B model handles well. Only a few evaluations per cascade reach the strategy level where frontier reasoning is needed. This means:

- **90%+ of evaluations** are free (local SLM) and fast (~100ms)
- **~5-10% of evaluations** use a mid-tier cloud model (~$0.01 each, ~1-2s)
- **~1-3% of evaluations** use a frontier model (~$0.05-0.10 each, ~3-5s)

A typical cascade from a feature change: 8-12 evaluations, ~10 local + 1-2 mid-tier + 0-1 frontier = total cost ~$0.01-0.05, total time ~2-5 seconds.

**Interface**: The circuit uses a pluggable `Reasoner` interface:

```
Reasoner interface {
    Evaluate(ctx Context, change Change, target Node, neighborhood []Node) (Assessment, error)
}
```

The `TieredReasoner` implementation routes to the appropriate model based on `target.InertiaLevel`. If a local model returns low confidence, it can escalate to a higher tier (with the token budget as the constraint).

**Escalation pattern**: Local SLM attempts evaluation. If confidence < threshold (e.g., 0.7), escalate to mid-tier. If still low, escalate to frontier. This means the system self-calibrates — simple evaluations stay local, genuinely complex ones reach frontier models without manual routing rules.

### Decision 7: Circuit protection — five layers preventing runaway cascades

**What**: The propagation circuit has five independent protection layers, each addressing a different failure mode. All five are active simultaneously — any one of them can halt or throttle a cascade.

**Layer 1: Signal Decay (prevents distant noise)**

Signal strength decays multiplicatively with each hop through the graph (configurable factor, default 0.7). After 5 hops: 0.7^5 = 0.17 — only 17% of the original signal remains. After 8 hops: 0.7^8 = 0.06 — effectively zero.

This is the primary convergence mechanism. Most cascades die naturally within 3-5 hops because the signal falls below the target node's inertia threshold. No explicit depth limit needed — the math handles it.

**Why it matters**: A change at tier 7 (capability) starts with signal strength 1.0. To reach tier 1 (North Star, inertia ~0.9), the signal must survive enough hops without decaying below 0.9. At decay 0.7, this is impossible in a single hop chain — the signal must accumulate through *multiple* low-tier nodes converging on the same high-tier node. This is correct behavior: a single capability change shouldn't trigger a North Star review, but 10 capability changes all pointing at the same issue should.

**Layer 2: Temporal Damping (prevents oscillation)**

Minimum interval between re-evaluations of the same node (configurable, default 60 seconds). If a node was evaluated 30 seconds ago and a new signal arrives, the signal is queued, not processed immediately.

This prevents the specific failure mode you're concerned about: Node A changes, which changes Node B, which changes Node A again, which changes Node B again — infinite oscillation. With temporal damping, the second evaluation of Node A is delayed, during which the cascade may resolve through other paths.

**Layer 3: Oscillation Detection (prevents contradictory loops)**

If the same node is evaluated more than N times (default 3) within a single cascade, the circuit flags it as an **oscillation**. This means two or more nodes are in genuine semantic conflict — the cascade can't converge because resolving one conflict creates another.

Response: The oscillating subgraph is frozen. The circuit continues evaluating non-oscillating nodes. The oscillation is surfaced to the human with full context: "These nodes keep contradicting each other — here's what each evaluation produced. Manual resolution required."

**Layer 4: Token Budget (prevents financial runaway)**

Maximum LLM tokens consumed per cascade (configurable, default varies by mode):
- Interactive (user-triggered `epf impact`): 50K tokens (~$0.50 max)
- Automatic (AIM-triggered cascade): 100K tokens (~$1.00 max)
- Scenario (what-if exploration): 200K tokens (~$2.00 max)

When the budget is exhausted, the cascade halts. Completed evaluations are preserved. Unevaluated nodes are flagged as "budget-exceeded — not assessed." The circuit reports what was evaluated and what was skipped.

**Why mode-based**: Interactive use should be cheap and fast (seconds). Automatic cascades can spend more because they're background operations. Scenarios can spend the most because the user explicitly requested a comprehensive exploration.

**Layer 5: Change Validation (prevents self-destructing storms)**

Before any change is applied to the graph, it passes through three gates:

1. **Schema validation**: Does the proposed change produce valid EPF YAML? (field lengths, required fields, enums). If not, re-dispatch with schema constraints — don't apply invalid content.

2. **Coherence check**: Does the proposed change create new contradictions with its immediate neighbors? If fixing one inconsistency creates two new ones, the change is flagged as "potentially destabilizing" and held for review.

3. **Rollback checkpoint**: Before each wave of changes is applied, a checkpoint is created. If the cascade produces a worse coherence score than the starting state (more contradictions, more broken references), the entire cascade can be rolled back to the checkpoint.

This is the "first, do no harm" layer. The circuit should never leave the graph in a worse state than it found it.

**Failure modes and responses:**

| Failure | Detection | Response |
|---------|-----------|----------|
| Cascade explosion (too many nodes) | Signal decay | Signal falls below threshold naturally |
| Oscillation (A↔B loop) | Same node evaluated 3+ times | Freeze oscillating subgraph, surface to human |
| Financial runaway | Token budget exceeded | Halt, report what was/wasn't evaluated |
| Invalid changes | Schema validation failure | Re-dispatch with constraints, don't apply |
| Self-destructing storm | Coherence check | Hold destabilizing changes for review |
| Cascade makes things worse | Rollback checkpoint | Roll back entire cascade, report |
| Unknown failure | All layers passed but result is wrong | Human approval for tier 1-2 always required |

**Configuration**: All thresholds are configurable per instance. Conservative defaults are provided. The live testing phase (1.12) calibrates these against real cascades across 8 instances.

### Decision 8: Scenarios use graph branching, not Git branches

**What**: "What if?" scenarios create a branch in the emergent.memory graph, apply proposed changes to the branched graph, then run the propagation circuit on the branch to see what cascades.

**Why**: The strategic manager's question isn't "what files change?" — it's "what's the semantic consequence of this strategic shift?" Git branches give file diffs. Graph branches give semantic diffs through the propagation circuit. The LLM evaluates meaning, not text.

**Workflow**: Create graph branch -> modify nodes -> run propagation circuit on branch -> review cascade results -> commit (merge branch, generate YAML, commit to Git) or discard.

### Decision 9: emergent.memory schema v2 — rich object types for section-level granularity

**What**: The `epf-engine` schema (v1.0.0, already installed on the `epf-engine` project) has 7 object types at file/entity level (Artifact, Feature, Persona, etc.) and 8 structural relationship types. Schema v2 adds section-level types as distinct object types, plus semantic/causal relationship types and inertia properties.

**New object types for v2** (alongside existing 7):
- `Belief` — a single core belief from the North Star (tier 1)
- `Trend` — a market/technology trend from insight analyses (tier 2)
- `PainPoint` — a specific persona pain point (tier 2)
- `Positioning` — competitive positioning claim from strategy formula (tier 3)
- `Assumption` — a riskiest assumption from the roadmap (tier 4)
- `Capability` — a single capability within a feature definition (tier 7)
- `Scenario` — a user scenario from a feature definition (tier 6)

**New relationship types for v2**:
- Semantic: `supports`, `contradicts`, `elaborates`, `parallels` (with `confidence` property)
- Causal: `informs`, `validates`, `invalidates`, `constrains` (with `strength` property)

**Inertia properties** added to all object types: `inertia_tier` (integer 1-7). Added to all relationship types: `weight` (float 0.0-1.0), `edge_source` (structural/semantic/causal).

**Why rich types**: A `Belief` contradicting a `Positioning` is semantically richer than two generic nodes. Memory's graph query agent reasons about type-specific relationships. The schema IS the semantic model.

### Decision 10: Memory handles embeddings — no separate embedding engine

**What**: emergent.memory automatically embeds all graph objects via background workers (objects, relationships, sweep — all currently running). The EPF engine does NOT build a separate embedding pipeline.

**Eliminated from plan**: `Embedder` interface, Ollama embedder, cloud embedder. All of Phase 1 tasks 1.3.1-1.3.4.

**What remains**: The `TieredReasoner` for LLM evaluation of semantic impact — that's generative AI evaluation, not embedding generation.

**Flow**: EPF-CLI parses YAML → generates graph objects → calls Memory API → Memory embeds automatically → semantic search available immediately via `memory query --mode=search`.

### Decision 11: Blueprint directories in the repo — schema and seed data are Git-tracked

**What**: Each EPF instance has a companion blueprint directory (e.g., `docs/EPF/_instances/emergent/.memory/`) containing:
- `packs/epf-engine.yaml` — the Memory schema (object types, relationship types)
- `seed/objects/<Type>.jsonl` — ingested graph objects with stable `key` fields
- `seed/relationships/<Type>.jsonl` — graph relationships with `srcKey`/`dstKey` references

The blueprint is applied to a Memory project via `memory blueprints ./path --project <id>`. Re-apply is idempotent (keyed objects are skipped; `--upgrade` to upsert).

**Why**: This makes the semantic graph configuration part of the Strategy-as-Code story. The schema, the object types, the seed data — all version-controlled in Git alongside the EPF YAML artifacts. When the schema evolves (adding new types for Phase 2, 3, etc.), it's a normal commit with a blueprint update.

**Schema iteration**: The schema is just a YAML file in the blueprint. Adding a new object type (e.g., `Trend` for Phase 2) is: edit the pack file, add the type, apply with `--upgrade`. No migration ceremony. Memory handles schema evolution gracefully — new types are additive.

**Multi-project flexibility**: Different EPF instances can use different Memory projects. The Emergent instance uses `epf-engine`. A client instance could use a separate project with the same schema. The blueprint is reusable — apply the same pack to multiple projects.

**Ingestion flow**:
- Full ingestion: epf-cli parses YAML → generates JSONL seed files → `memory blueprints ./blueprint --project epf-engine`
- Incremental sync: epf-cli detects changed sections → `memory graph objects update` for modified objects → `memory graph objects create` for new ones
- Export: `memory blueprints dump ./exported --project epf-engine` → JSONL files for backup or transfer

### Decision 12: REST API for runtime, CLI for operations

**What**: The propagation circuit communicates with emergent.memory via its REST API directly (HTTP client in Go). The CLI is used for setup, maintenance, and blueprint operations only.

| Operation | Interface | Why |
|-----------|-----------|-----|
| Load graph (400 objects, 1500 edges) | REST API | Single paginated GET, typed JSON, no subprocess |
| Update objects during cascade | REST API | Direct HTTP PATCH, ~5ms per call, concurrent |
| Batch create objects (ingestion) | REST API | Single POST with JSON array, no temp files |
| Vector search (semantic edges) | REST API | HTTP POST, typed results with similarity scores |
| Schema deployment | CLI | `memory blueprints` is purpose-built for this |
| Backup/export | CLI | `memory blueprints dump` handles JSONL generation |
| Embedding control | CLI | `memory embeddings pause/resume` for operational tasks |
| Project setup | CLI | `memory projects create`, `memory init` |

**Why not CLI for runtime**: Each CLI invocation spawns a subprocess (~50-100ms overhead), parses table/JSON output from stdout, and depends on the CLI binary being installed and configured. The circuit makes 10-50 API calls per cascade — subprocess overhead would add 0.5-5s of pure overhead. The REST API is direct HTTP with typed JSON responses.

**Why not MCP**: MCP is designed for AI agent interaction (LLM calling tools). The propagation circuit is a Go program making deterministic API calls. MCP adds JSON-RPC protocol overhead, tool discovery, and capability negotiation that provide no value here. MCP is appropriate for Phase 2 when AI agents inside the circuit need to interact with Memory through the standard agent interface.

**Implementation**: The `internal/memory/` package wraps the REST API with a typed Go client. The Memory server's OpenAPI spec (15K+ lines) can generate the client, or we build a minimal client covering only the endpoints the circuit needs:

```
Client interface {
    // Graph objects
    ListObjects(ctx, projectID, opts) ([]Object, error)
    GetObject(ctx, projectID, objectID) (*Object, error)
    CreateObject(ctx, projectID, obj) (*Object, error)
    CreateObjectBatch(ctx, projectID, objs) ([]Object, error)
    UpdateObject(ctx, projectID, objectID, props) (*Object, error)

    // Graph relationships
    ListRelationships(ctx, projectID, opts) ([]Relationship, error)
    CreateRelationship(ctx, projectID, rel) (*Relationship, error)
    CreateRelationshipBatch(ctx, projectID, rels) ([]Relationship, error)
    ObjectEdges(ctx, projectID, objectID) (*Edges, error)

    // Search
    Search(ctx, projectID, query, opts) ([]SearchResult, error)

    // Branches (when available — feature request #92)
    CreateBranch(ctx, projectID, name) (*Branch, error)
    MergeBranch(ctx, projectID, name) error
    DeleteBranch(ctx, projectID, name) error
}
```

Auth: Bearer token from `EPF_MEMORY_TOKEN` environment variable or project token from `.env.local`.

### Decision 13: Hybrid cloud+local — cloud Memory as primary, local cache for offline

**What**: The desktop app uses cloud-hosted emergent.memory as the primary semantic graph, with a local cache that enables full offline operation. No Docker dependency on the desktop.

**Online mode** (connected to cloud Memory):
- Full capabilities: semantic search, impact analysis, scenario projection, cascades with tiered LLM reasoning
- Changes sync to cloud Memory in real-time
- Cloud Memory handles embeddings, vector indexing, and graph branching
- Tier 1-4 evaluations use cloud LLMs

**Offline mode** (no internet — plane, remote location):
- The local cache contains a full snapshot of the semantic graph (nodes, edges, embeddings)
- Semantic search works against the local cache (SQLite + sqlite-vec for vector similarity, embedded in the Go binary — zero dependencies)
- Impact analysis and cascades work against the local in-memory graph
- All LLM evaluations route to Ollama (local SLM only — tier 5-7 quality for all evaluations)
- Changes are queued in a write-ahead log
- Scenario projection works locally (branching the in-memory graph)

**Reconnection sync**:
- When connectivity is restored, the write-ahead log replays against cloud Memory
- Cloud Memory re-embeds any changed objects (local embeddings may differ from cloud model)
- Conflict resolution: last-write-wins with timestamp, or flag conflicts for human review
- Graph state converges to cloud as authoritative

**Architecture layers**:
```
┌──────────────────────────────────────┐
│  Delivery Layer (varies)             │
│  ├── Wails shell (desktop)           │
│  └── HTTP server (cloud SaaS)        │
├──────────────────────────────────────┤
│  UI Layer (shared)                   │
│  └── htmx 4 + DaisyUI templates     │
├──────────────────────────────────────┤
│  API Layer (shared)                  │
│  ├── MCP server (49+ tools)         │
│  └── HTTP handlers (UI endpoints)   │
├──────────────────────────────────────┤
│  Engine Layer (shared)               │
│  ├── Propagation circuit             │
│  ├── Semantic graph queries          │
│  ├── Tiered LLM reasoning           │
│  ├── Validation & analysis           │
│  └── Sync engine (Git <-> Memory)   │
├──────────────────────────────────────┤
│  Graph Layer (varies)                │
│  ├── GraphStore interface            │
│  │   ├── CloudStore (REST API       │
│  │   │    to hosted Memory)          │
│  │   ├── LocalCache (SQLite +       │
│  │   │    sqlite-vec, embedded)      │
│  │   └── HybridStore (cloud primary,│
│  │        local cache, write queue)  │
│  └── LLM routing                    │
│      ├── Online: tiered (Ollama +   │
│      │    cloud + frontier)          │
│      └── Offline: Ollama only       │
├──────────────────────────────────────┤
│  Storage Layer (varies)              │
│  ├── StrategyStore (Source interface)│
│  │   ├── FileSystemSource (local)   │
│  │   ├── GitHubSource (cloud)       │
│  │   └── MemorySource (either)      │
│  └── Git repos (local clones)       │
└──────────────────────────────────────┘
```

| Aspect | Desktop (online) | Desktop (offline) | Cloud SaaS |
|--------|-----------------|-------------------|------------|
| **App shell** | Wails | Wails | Go HTTP server |
| **Semantic graph** | Cloud Memory via REST | Local SQLite cache | Hosted Memory |
| **Vector search** | Cloud Memory (pgvector) | Local sqlite-vec | Hosted Memory |
| **Embeddings** | Cloud Memory (auto) | Local snapshot (read-only until reconnect) | Hosted Memory |
| **LLM reasoning** | Ollama (tier 5-7) + cloud (tier 1-4) | Ollama only (all tiers, degraded quality for tier 1-3) | Cloud APIs (all tiers) |
| **Graph branching** | Cloud Memory | In-memory branch (local) | Hosted Memory |
| **Changes** | Direct to cloud | Write-ahead log → sync on reconnect | Direct to hosted |
| **Auth** | API token for cloud Memory | None (offline) | GitHub OAuth / MCP OAuth |
| **Dependencies** | Ollama (optional) | Ollama (optional) | None on user machine |

**Why hybrid, not pure-local**: Docker is a heavyweight dependency for non-technical strategic managers. Running PostgreSQL locally adds operational complexity (upgrades, backups, disk space). The hybrid approach gives the same offline capability with zero infrastructure on the desktop — just a Go binary with embedded SQLite. When online, you get cloud-grade embeddings, frontier LLMs, and graph branching. When offline, you get full functionality at reduced quality (local model only, snapshot embeddings).

**Why not pure-cloud**: Strategic managers work in planes, trains, and locations without reliable internet. Strategy iteration can't pause because of connectivity. The local cache ensures the propagation circuit, impact analysis, and scenario projection all work offline — just with Ollama quality instead of frontier model quality for high-tier evaluations.

**Local cache sizing**: ~400 nodes × 768-dim embeddings = ~1.2MB of vectors. Plus node properties and edges = ~5-10MB total. SQLite database fits easily on any machine. No meaningful storage footprint.

**Key design rules**:
- **No JS frameworks.** htmx 4 + DaisyUI keeps the UI server-rendered. Same Go templates work in Wails (localhost) and cloud (remote URL). htmx 4 specifically for:
  - **`<hx-partial>`** for multi-target updates
  - **`innerMorph`/`outerMorph`** swap modes (preserve DOM state during graph updates)
  - **SSE extension via `fetch()` + `ReadableStream`** (stream cascade progress in real time)
  - **ETag support** (skip re-render when data unchanged)
  - **View Transitions API** (smooth navigation between views)
- **The Engine Layer has zero knowledge of the Delivery Layer.** It calls the `GraphStore` interface. Whether that's `CloudStore`, `LocalCache`, or `HybridStore` is configured at startup, not coded into the engine.
- **Ollama is optional, not required.** If Ollama isn't installed, all evaluations route to cloud APIs (requires internet). Desktop users are encouraged to install Ollama for offline capability and cost savings, but it's not a hard dependency.

**Alternatives considered**:
- Electron — rejected: heavy runtime, JavaScript ecosystem, doesn't leverage Go strengths
- Tauri — considered: Rust-based, lighter than Electron. But Wails is Go-native — same language as the engine, no FFI boundary.
- React/Vue/Svelte frontend — rejected: adds build pipeline, JS dependency, separate codebase. htmx 4 + DaisyUI is simpler.
- Full local Docker (memory server install) — rejected as default: adds Docker dependency. Remains an option for power users who want full local Memory capabilities, but the hybrid approach is the default.

### Decision 10: MCP sockets are the inter-instance synapse

**What**: Inter-instance connections use MCP tool calls extended with sovereignty metadata. Each connection has:
- **Sovereignty weight** (0.0 = peer/informational, 1.0 = parent/binding) — determines how strongly signals propagate across the boundary
- **Signal filter** — what types of changes are forwarded (not all internal changes should propagate)
- **Containment threshold** — internal tensions must exceed this threshold before propagating externally

**Why**: MCP is the existing universal interface. The EPF-CLI MCP server already supports multi-tenant mode. Sovereignty weights encode the hierarchical relationship between instances without hard-coding levels. A subsidiary that grows to influence the group simply gets a higher sovereignty weight on its upward connection.

### Decision 14: Decomposer owns its own YAML parsing (no strategy parser dependency)

**What**: The `decompose` package reads raw YAML files directly using its own struct definitions, independent of the `strategy` parser package. It does not import or depend on `strategy.StrategyModel`, `strategy.NorthStar`, `strategy.Feature`, etc.

**Why**: The strategy parser and the decomposer have fundamentally different jobs. The parser exists to answer MCP queries ("what's the vision?", "who are the personas?") and intentionally omits fields irrelevant to those queries. The decomposer needs *everything* — every belief, every assumption, every dependency, every capability. Forcing both through the same code leads to either a bloated parser or perpetual raw YAML workarounds in the decomposer.

The strategy parser has known gaps — e.g., it reads capabilities from `implementation.capabilities` when the actual YAML has them at `definition.capabilities`. It also doesn't expose individual core beliefs, riskiest assumptions, or feature dependencies. Rather than fixing the parser (which would change working MCP behavior), the decomposer has its own structs that mirror the YAML exactly.

This means canonical schema changes (field renames, moves) require updating one place — the decomposer's raw structs — instead of two (the strategy parser AND the decomposer). The decomposer also checks `meta.epf_version` and warns if the instance version is newer than what it supports (`MaxSupportedMajorVersion = 2`).

**Coupling surfaces**:
- **`memory.UpsertObjectRequest`** — correct coupling; changes when we change the Memory schema (fully under our control)
- **YAML field names from epf-canonical** — the only external dependency; one place to fix when canonical evolves
- **Zero dependency on `strategy` package** — parser refactors cannot break the decomposer

**Alternatives considered**:
- Extend the strategy parser — rejected: adds unused fields to MCP query types, couples decomposer to parser bugs
- Dual approach (typed model + raw workarounds) — tried first, then rejected: two code paths reading the same YAML, `MergeResults` deduplication, subtle overlapping outputs

**Result**: Single-file `decompose.go` (680 lines) replaces two-file approach (1038 lines). Live Emergent instance: 739 objects, 927 relationships, 30ms. More complete extraction than the dual approach (431 ValueModelComponents vs 118 — the old parser missed `subs` variant and `path_segment` overrides).

## Risks / Trade-offs

### Risk: Embedding quality determines semantic accuracy
- **Mitigation**: Start with high-quality embedding model. Validate semantic edges against known structural edges (ground truth). Iterate on model choice.

### Risk: Cascade convergence
- **Mitigation**: Damping parameters (signal decay, temporal, depth limit, token budget) are configurable. Start conservative (low depth, high damping) and loosen based on observed behavior.

### Risk: emergent.memory API stability
- **Mitigation**: Generated Go client from OpenAPI spec. Pin to API version. MemorySource is behind the Source interface — breakage is localized.

### Risk: LLM evaluation quality for semantic impact
- **Mitigation**: The LLM receives structured context (EPF artifact types, edge types, inertia tiers) — this constrains its evaluation. Use frontier models for high-inertia evaluations, local SLMs for low-inertia.

### Trade-off: emergent.memory as external dependency
- **Pro**: Graph, vector search, branching, and event infrastructure without building it
- **Con**: Runtime dependency for semantic features
- **Accepted**: Offline mode preserves structural-only propagation. Semantic features require emergent.memory.

## Findings from Manual EPF Instance Update (2026-03-16)

We manually updated the Emergent EPF instance from "AI Knowledge Infrastructure" to "Semantic Strategy Runtime" — touching 20+ artifacts across READY, FIRE, and AIM phases. This exercise served as the baseline measurement for what the semantic runtime should automate. Key findings that inform the design:

### Finding 1: Cascades are not strictly top-down — they are wave-like

We naturally worked top-down when the change originated at the North Star. But cascades can originate at any tier and propagate in any direction. Example: an AIM assessment invalidates assumption `asm-p2-001` (tier 7). This bubbles up to the roadmap (tier 4) where the linked KRs need re-evaluation. If the KR adjustment is significant, it propagates further up to the strategy formula (tier 3) where the competitive moat claim depends on propagation circuit reliability. If the moat claim changes, that cascades **back down** to value models (tier 5), feature definitions (tier 6), and opportunity framing (tier 2). The flow is tier 7 → 4 → 3 → 2,4,5,6 — a wave that goes up, reflects off the high-inertia node, and cascades back down.

**Design implication**: The circuit must NOT assume top-down ordering. It must follow the graph edges wherever they lead, respecting the recursive step (3e): "if Y changes, Y becomes a new signal source." The damping mechanisms (signal decay, temporal damping, cascade depth limit) prevent infinite loops. Within a single cascade wave, the circuit evaluates each newly-changed node's connections regardless of tier direction. Parallel evaluation within a wave is still valid — but only for nodes that don't depend on each other's evaluation results.

### Finding 2: The cascade is wide, not just deep

The North Star change affected ALL 5 downstream READY artifacts, ALL value models, 8 feature definitions (6 new + 2 updated), the portfolio, and 3 AIM artifacts. That's ~20 artifacts from a single high-inertia change. The propagation circuit must handle wide cascades efficiently — parallelizing within tiers is essential for performance.

**Design implication**: The circuit's dispatch step (step 3) should batch-evaluate all affected nodes at the same tier level in parallel, not sequentially. A North Star change that affects 6 feature definitions should dispatch 6 parallel SLM evaluations, not 6 sequential ones.

### Finding 3: Schema constraints are a propagation concern

Multiple artifacts failed validation after rewriting due to field length constraints (maxLength: 200, 300, 400, 500 chars). The propagation circuit must be aware of EPF schema constraints when generating or proposing content changes. An LLM that writes a 600-char description for a 500-char field creates invalid artifacts.

**Design implication**: The TieredReasoner should receive schema constraints as part of the evaluation context. The circuit should validate proposed changes against the schema before applying them — and if validation fails, re-dispatch with the constraint information included.

### Finding 4: Cross-reference creation is part of the cascade

Creating 6 new feature definitions required setting `contributes_to` paths that reference the value model, `dependencies` that reference other features, and `assumptions_tested` that reference the roadmap. These cross-references must be correct for the instance to pass relationship validation. The propagation circuit must not just evaluate existing nodes — it must also propose new cross-references when new nodes are created.

**Design implication**: Edge creation is a first-class output of the propagation circuit, not just content changes. When a new value model layer is added, the circuit should propose `contributes_to` paths for affected features.

### Finding 5: The `informs_ready_phase` section is the explicit causal map

The updated North Star includes an `informs_ready_phase` section that explicitly declares what each downstream artifact type should align with. This is essentially a hand-written causal edge declaration. The propagation circuit should use these as authoritative causal edges rather than inferring them from embedding similarity.

**Design implication**: Causal edges should be derived from three sources in priority order: (1) explicit declarations like `informs_ready_phase`, (2) structural references (contributes_to, dependencies), (3) embedding similarity. Source (1) is highest confidence and should never be overridden by (3).

### Finding 6: Value model restructuring is the hardest cascade type

Renaming layers in the value model (`Layer5AimRecalibration` -> `AIMRecalibration`) broke 6 cross-references across 2 feature definitions. The current `epf_rename_value_path` tool handles this mechanically. But *adding new layers* (SemanticEngine, CausalAIM, etc.) requires creating new feature definitions that contribute to them — that's a semantic/creative task, not a mechanical one. The circuit must distinguish between rename cascades (mechanical, auto-apply) and restructuring cascades (semantic, propose + review).

**Design implication**: The impact classification system needs a fourth category beyond mechanical/semantic/structural: **"creative"** — when the cascade requires generating new artifacts (not just modifying existing ones). Creative tasks always require human review and likely frontier-model reasoning.

### Finding 7: Cache invalidation is critical for validation accuracy

After updating files, the EPF-CLI's instance cache returned stale relationship data until explicitly reloaded. The propagation circuit must invalidate cached data after each change application, or the next evaluation step will reason over stale state.

**Design implication**: After each batch of changes is applied, the circuit must reload the affected portion of the semantic graph before proceeding to the next tier's evaluations.

## Open Questions

1. **Embedding model selection**: Which local model provides sufficient quality for strategic text? Needs benchmarking against EPF content.

2. **Signal decay calibration**: What decay factor (0.7?) produces the right cascade behavior? Too aggressive = missed connections. Too mild = cascade explosion. Likely needs empirical tuning per instance.

3. **Auth bridging**: EPF-CLI uses GitHub OAuth. emergent.memory uses Zitadel. Options: separate API token, OIDC token exchange, shared identity provider.

4. **Causal edge generation**: The `informs_ready_phase` section in Huma's North Star explicitly declares downstream constraints. Should this be required in all instances, or should causal edges be inferred from EPF schema structure? **Update from findings**: Both — explicit declarations take priority, with schema inference as fallback and embedding similarity as last resort.

5. **Scenario commit workflow**: Graph branch -> YAML generation -> Git commit. How much human review is needed at each step? Should the system generate a PR with the full cascade diff?

6. **AIM data ingestion beyond assessment reports**: How does real-world evidence (analytics, user feedback, market data) enter the semantic graph? Manual entry? API feeds? Webhook integrations?

7. **Cross-instance auth and trust**: When instance A sends a signal to instance B via MCP, how does B verify A's identity and sovereignty claim? MCP OAuth + signed sovereignty certificates?

8. **Cycle detection in cascades**: When a wave propagates up to tier 3, reflects back down to tier 5, and that tier 5 change has an edge back to a tier 3 node — how do we prevent infinite oscillation? Signal decay handles gradual convergence, but what about cases where two nodes are in genuine semantic conflict? Likely: detect oscillation (same node evaluated twice with contradictory results), halt, and flag for human review.

9. **Creative cascade handling**: When a cascade requires generating new artifacts (e.g., new FDs for new value model layers), should the circuit propose them or just flag the gap? Likely: flag the gap with a structured description of what's needed, let a human or frontier-model agent create the artifact.
