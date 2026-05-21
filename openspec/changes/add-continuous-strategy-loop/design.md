## Context

The strategy-server implements the Emergent Product Framework's READY-FIRE-AIM loop
as a digital platform. Two processing systems exist:

1. **Inner loop (reactive):** The ripple convergence engine runs after every
   `commit_batch`, detecting misalignments, classifying authority tiers, and
   optionally auto-resolving autonomous-tier signals. ~2,848 lines in
   `domain/ripple/`. Works well.

2. **Outer loop (manual):** The AIM cycle workflow runs 4 orchestrated steps
   (draft assessment, draft calibration, apply calibration, snapshot cycle),
   each pausing for human review. ~1,439 lines in `domain/aim/`. Works well
   but is inert -- requires manual initiation.

The gap: nothing bridges these two loops. The inner loop cannot trigger the
outer loop. External evidence cannot enter either loop. The system is a set of
excellent tools waiting to be used, not a living organism.

### Stakeholders

- **Product strategists** — need the loop to surface insights without constant
  manual polling
- **AI coding agents** — need clear, staged implementation tasks with testable
  exit gates per stage
- **Platform operators** — need predictable, observable autonomous processing
  that doesn't produce surprises

### Constraints

- Single-instance deployment for the foreseeable future (no distributed workers)
- AI-assisted development at 10x velocity (favors simple code over library integrations)
- Memory server is a sister project and strategic dependency (lean into it, don't abstract away)
- The orchestration `Backend` interface exists as a designed swap point for future needs

---

## Goals

- Make the READY-FIRE-AIM loop continuous: evidence flows in, triggers fire
  automatically, assessments draft themselves, calibration patches propagate back
- Keep humans in control of all consequential decisions via the existing staged
  batch pattern
- Each stage independently deployable and testable — no stage depends on a later
  stage being built
- Maintain full visibility into all autonomous processing
- Preserve the ability to swap infrastructure components when concrete needs arise

## Non-Goals

- Fully autonomous strategy execution without human gates
- Multi-instance / distributed worker architecture (deferred until concrete need)
- Replacing the orchestration engine with River (deferred — see Decision 3)
- Building an embedding provider abstraction layer (deferred — see Decision 2)
- Real-time streaming of LLM reasoning (deferred until activity stream exists)
- Multi-agent coordination or agent framework adoption

---

## Decisions

### Decision 1: Lean Into Memory — Don't Abstract Away

**Decision:** Increase Memory's role by delegating more structural queries (multi-hop
traversal, coherence pattern detection) to Memory's graph APIs, rather than building
an abstraction layer to decouple from it.

**Rationale:** Memory is a sister project under active development. The coupling is
intentional and strategic. The current `internal/memory/` client (812 lines) is a
clean, typed HTTP client — it IS the abstraction. Adding an interface over a single
implementation is premature abstraction that costs maintenance without providing value.

**What Memory does today:**
- Semantic search (hybrid text+vector) — 7 call sites via `Search()`
- Graph storage (objects + relationships) — via ingest pipeline
- Branch-based scenarios — via `CreateBranch()` / `MergeBranch()`
- Embedding progress tracking — via `GetEmbeddingProgress()`

**What Memory should do additionally:**
- Bulk ingestion via `CreateSubgraph()` instead of per-object upserts (reduces API
  calls by 10-100x per batch)
- Multi-hop relationship traversal via `Expand(maxDepth)` instead of 3 separate
  Postgres SQL queries in `propagation.go:193-258` (~60 lines of SQL eliminated)
- Evidence object storage (new in Stage 4) — enables semantic search across evidence
  and strategy artifacts together

**Swap protection:** If Memory ever needs to be replaced:
- Rewrite `internal/memory/` (~812 lines) — the ONLY file that knows the Memory API
- Adjust `domain/semantic/` calls — the domain boundary
- All other packages (ripple, aim, ingest) interact through domain interfaces, not
  the Memory client directly
- Estimated swap effort: 2-3 days for a competent developer, regardless of target
  (pgvector, Neo4j, market product)

**Alternatives considered:**
- *EmbeddingProvider interface* — Adds ~200 lines of abstraction for a swap that may
  never happen. The text-similarity fallback in `ripple/semantic.go` already handles
  Memory-unavailable scenarios. Rejected as premature.
- *pgvector as primary* — The Docker image already includes `pgvector/pgvector:pg16`
  but using it would mean reimplementing graph traversal, branching, and hybrid search
  that Memory provides. Rejected as building more, not less.
- *Full decoupling via interface* — Would require ~400 lines of interface definitions
  mirroring the Memory API surface. Every Memory API change would require updating
  both the interface and the implementation. Rejected as ongoing tax with no benefit
  while Memory is the only backend.

### Decision 2: Keep Custom Orchestration — Define Swap Triggers

**Decision:** Keep the current 952-line orchestration engine (`pkg/orchestration/`)
for now. Add background processing as standalone ticker goroutines wired in
`cmd_serve.go`, not through the orchestration engine.

**Rationale:** The orchestration engine does what it needs to for the AIM cycle.
The next stages (heartbeat, evidence ingestion, auto-initiation) need periodic
tickers and async processing, which are simpler than what the orchestration engine
provides. Adding a library dependency (River) to solve a problem we don't have yet
violates "build as little as possible."

AI-assisted development makes building simple Go code extremely fast. A 25-line
ticker goroutine takes 5 minutes to write and test. A River integration takes 2-4
hours including dependency management, schema migration, and learning the API.
The cost/benefit ratio favors custom code until the concrete triggers below are hit.

**What we build instead:**
- Heartbeat: standalone ticker goroutine in `cmd_serve.go` (~25 lines)
- Evidence processing: inline in the existing ingest pipeline or a second ticker
- Activity logging: synchronous writes in domain services, no queue needed

**Each background function is written as `func(ctx context.Context) error`** so
that when River time comes, each function becomes a River `Worker` with zero logic
changes. The orchestration `Backend` interface ensures the AIM workflow migrates
cleanly.

**Concrete swap triggers for River — act when ANY of these occur:**

| Trigger | Why it breaks the current system |
|---------|--------------------------------|
| Multi-instance deployment | Goroutine pool runs on all instances, competing for same work. No row-level locking. Hard failure mode. |
| >5 distinct background jobs | Ticker goroutines become a maintenance burden and startup complexity grows non-linearly. |
| Production incident from lost job on restart | `markStaleFailed` permanently kills in-flight runs. Acceptable at low frequency, unacceptable for continuous processing. |
| Need for durable retry with backoff | Building this in-house takes ~130 lines and is strictly worse than River. This is the trigger to swap rather than reimplement. |
| Observable queue depth issues | If heartbeat or evidence processing falls behind, you need queue depth metrics and backpressure — River provides both. |

**What survives the swap:**
- `orchestration.Workflow` and `orchestration.Backend` interfaces (17 + 35 lines)
- `orchestration.Engine` routing and SSE fanout (158 + 70 lines)
- Human gate mechanism (~100 lines of resume channel logic)
- AIM `workflow.go` (166 lines)

**What gets replaced:**
- `pg/pool.go` (264 lines of goroutine pool)
- `pg/store.go` (most of the 208 lines of CRUD — River handles state)
- `pg/backend.go` (98 lines — becomes a thin River adapter)
- Standalone ticker goroutines (moved to River `PeriodicJob`)

**Estimated swap effort:** 4-6 hours with AI assistance. The `Backend` interface
was designed for this swap. The comment in `pg/backend.go:24` literally says
"replace pg.NewBackend with river.NewBackend in main.go — no other files change."

**Alternatives considered:**
- *Swap to River now (Stage 0)* — Would give us durable retry, periodic jobs, and
  observability immediately. Rejected because: (a) we don't need durable retry yet,
  (b) periodic jobs are trivially built as tickers, (c) it adds a dependency before
  we have a concrete problem, (d) AI-assisted development speed makes the custom code
  cost near zero.
- *Temporal / other workflow engine* — Massive overkill. Our workflows are 4-step
  sequential processes, not distributed sagas. Rejected.
- *Build durable retry in-house* — ~130 lines to partially reimplement what River does
  better. If we need durable retry, that IS the trigger to swap to River, not to build
  a worse version. Explicitly rejected as the worst option.

### Decision 3: Evolve LLM Client — Don't Adopt an SDK

**Decision:** Add structured output support and model routing to the existing 152-line
`internal/llm/client.go`. Do not adopt an AI SDK (openai-go, langchain, etc.).

**Rationale:** The LLM client speaks the OpenAI `/v1/chat/completions` protocol, which
is the de facto standard. Every provider converges on it (OpenAI, Anthropic via proxy,
Ollama, Google via LiteLLM). The client is 152 lines because it does exactly what we
need and nothing more.

**What we add:**
- `response_format` field in `chatRequest` for structured JSON output (~10 lines)
- `ModelSelector` interface: `SelectModel(task TaskType) Config` for routing signal
  classification to a fast/cheap model and calibration reasoning to a capable one (~30 lines)
- Token usage tracking surfaced through convergence summaries (already captured, just
  needs propagation)

**Total growth:** ~150 → ~250 lines. Still trivially understandable.

**What we explicitly don't add:**
- Streaming (not needed until activity stream exists and we want to stream LLM
  reasoning — Stage 6 at earliest)
- Function calling / tool use (the server doesn't need the LLM to call tools — the
  server IS the tool provider via MCP)
- Multi-modal input (strategy artifacts are text/YAML)
- Embedding generation (delegated to Memory)
- Agent framework / planning / multi-step reasoning (the convergence loop IS the
  reasoning engine — it doesn't need an LLM planning framework on top)

**Swap triggers:**
- If we need streaming: add ~50 lines for SSE parsing. Still no SDK needed.
- If we need function calling: evaluate whether the LLM should drive tool use.
  Currently the MCP client (Claude, GPT) drives tool use, and the server provides
  tools. This is the right architecture. If we ever need server-side tool use
  (the server's own LLM calling its own tools), that would warrant an SDK. But
  this is unlikely given the MCP architecture.

**Alternatives considered:**
- *openai-go SDK* — Adds a dependency for functionality we use 5% of. The SDK
  is 10,000+ lines. Our client is 152. The maintenance cost of tracking SDK
  breaking changes exceeds the cost of maintaining 152 lines. Rejected.
- *LangChain / LlamaIndex* — Agent frameworks designed for LLM-driven orchestration.
  Our orchestration is code-driven (convergence loop, AIM workflow). Adding an LLM
  orchestration layer on top of a code orchestration layer adds complexity without
  value. Rejected.
- *Vercel AI SDK* — TypeScript, not Go. Rejected.

### Decision 4: Authority-Tiered Processing Model

**Decision:** Extend the existing 3-tier authority model (autonomous/gated/escalated)
to cover all new autonomous processing, not just convergence signals.

**Rationale:** The authority model in `domain/ripple/authority.go` already encodes the
right principle: "execute minor things and stream, gate significant things for review,
escalate major things for acknowledgment." This same principle applies to:

- Heartbeat trigger detection (autonomous — just detect and notify)
- Evidence ingestion and classification (autonomous — store and index)
- Cycle proposal generation (gated — propose but don't start)
- Assessment drafting (gated — draft but don't commit)
- Calibration decisions (gated — recommend but don't apply)
- North star / strategy formula changes (escalated — require explicit acknowledgment)

The tiers are already implemented for convergence signals. Extending them to new
processing types means reusing the same mental model, the same UI patterns, and the
same MCP interaction patterns.

**Future tier configuration:** Per-instance configuration of what's autonomous vs
gated (Stage 7). Some organisations may want assessment drafting to be autonomous
(auto-commit if the LLM confidence is high). Others may want even evidence ingestion
to be gated. The authority model supports this by design.

### Decision 5: Evidence as First-Class Artifacts

**Decision:** Model evidence as a new artifact type stored in `strategy_artifacts`
with its own schema, pushed to Memory for semantic search, and wired into AIM
assessment drafting.

**Rationale:** Evidence is strategy data. It should be schema-validated, version-
tracked, searchable, and visible in the same graph as features, assumptions, and
OKRs. Storing it in a separate table would create a parallel data path that the
ripple engine, convergence loop, and semantic search couldn't reach.

**Evidence enters the system via:**
- MCP tool `ingest_evidence` (agent-driven)
- Future: webhook endpoint (external system push)
- Future: scheduled collectors (pull from analytics APIs)

**Evidence is consumed by:**
- `DraftAssessment` — reads unprocessed evidence alongside roadmap OKRs
- Trigger evaluation — `evidence_threshold` trigger fires when evidence accumulates
- Semantic search — evidence appears in `search_strategy` results
- Assumption validation — evidence linked to assumptions via relationships

**Alternatives considered:**
- *Separate evidence table* — Simpler schema but invisible to the ripple engine,
  convergence loop, and semantic search. Would require special-casing every query
  that should include evidence. Rejected as building a silo.
- *External evidence store* — Keeps the strategy-server focused but requires an
  integration point. The evidence would need to be fetched at assessment time,
  adding latency and failure modes. Rejected as unnecessary complexity.

---

## Architecture Overview

### Processing Layers After All Stages

```
Layer 0: Background Heartbeat (Stage 1)
  - Ticker goroutine, runs every 5 min
  - Evaluates triggers for all active instances
  - Surfaces signals, does not act

Layer 1: Evidence Ingestion (Stage 4)
  - MCP tool + future webhooks
  - Validates, stores, pushes to Memory
  - Autonomous tier — no human gate

Layer 2: Reactive Coherence (existing)
  - Post-commit convergence loop
  - Structural + semantic analysis
  - Auto-resolves autonomous signals
  - Gates/escalates significant signals

Layer 3: Cycle Orchestration (existing + Stage 5)
  - AIM cycle workflow with human gates
  - Auto-proposal when triggers fire (Stage 5)
  - Human approves to start

Layer 4: Calibration Feedback (existing + Stage 7)
  - ApplyCalibration patches READY artifacts
  - Enhanced with evidence-backed amendments (Stage 7)
  - All staged for human review

Layer 5: Activity Stream (Stage 6)
  - Observes all layers
  - SSE for real-time streaming
  - MCP tool for querying
```

### Data Flow After All Stages

```
External world
  │
  │ metrics, feedback, market signals
  ▼
Evidence Ingestion (Stage 4)
  │
  │ structured evidence in strategy_artifacts + Memory
  ▼
┌─────────────────────────────────────────────┐
│             Heartbeat (Stage 1)             │
│  evaluates triggers every 5 min:            │
│  - time since last assessment               │
│  - critical signal count                    │
│  - unprocessed evidence count (Stage 4)     │
│                                             │
│  fires → cycle proposal (Stage 5)           │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│         AIM Cycle (existing)                │
│  1. DraftAssessment (reads evidence)        │
│     → [HUMAN GATE]                          │
│  2. DraftCalibration                        │
│     → [HUMAN GATE]                          │
│  3. ApplyCalibration (enriched, Stage 7)    │
│     → [HUMAN GATE]                          │
│  4. SnapshotCycle                           │
└──────────────────┬──────────────────────────┘
                   │
                   │ patches to READY artifacts
                   ▼
┌─────────────────────────────────────────────┐
│       Convergence Loop (existing)           │
│  triggered by commit of calibration patches │
│  detects ripple through FIRE artifacts      │
│  auto-resolves autonomous signals           │
│  reaches equilibrium → version snapshot     │
└─────────────────────────────────────────────┘
                   │
                   │ all activity
                   ▼
         Activity Stream (Stage 6)
```

---

## Risks / Trade-offs

### Risk: Heartbeat overhead on many instances

A heartbeat evaluating triggers for 100+ instances every 5 minutes could create
database load (each evaluation queries `ripple_signals` and `strategy_artifacts`).

**Mitigation:** Configurable interval per instance. Batch queries (single SQL with
`GROUP BY instance_id` instead of N individual queries). Skip instances with no
recent mutations. Monitor query time and adjust.

### Risk: Evidence volume overwhelms assessment drafting

If evidence ingestion is high-volume (hundreds of metrics per day), the assessment
draft could become unwieldy.

**Mitigation:** Evidence has a `processed` flag. Assessment reads only unprocessed
evidence, marks it processed after inclusion. Evidence older than the configurable
retention period is archived. The LLM summarises evidence clusters rather than
listing individual items.

### Risk: Autonomous processing produces unexpected changes

Even autonomous-tier changes (convergence auto-resolution, evidence classification)
could accumulate into unexpected strategic drift.

**Mitigation:** Already handled by the convergence loop's 4-layer damping (anchor
drift guard limits foundational artifact changes to 0.10 similarity drift). The
activity stream (Stage 6) provides full visibility. All autonomous changes are
tagged `source=ripple_auto` or `source=heartbeat` for traceability.

### Risk: Ticker goroutines lost on server restart

Standalone ticker goroutines don't persist state. If the server restarts mid-tick,
the work is lost.

**Mitigation:** Acceptable for now. Trigger evaluation is idempotent — the next tick
re-evaluates and produces the same result. Evidence ingestion is durable (committed
to Postgres before processing). If restart-related job loss becomes a production
issue, that is one of the defined swap triggers for River migration.

### Trade-off: Custom code vs library maintenance

We are choosing ~100 lines of custom ticker/background code over a library (River)
that provides the same plus durable retry, observability, and distributed execution.

**Acceptance:** The custom code is trivially simple and fast to build with AI
assistance. The library adds a dependency, a learning curve, and schema migrations
we don't need yet. When we need what River offers (see swap triggers in Decision 2),
we swap. The `Backend` interface and the `func(ctx) error` pattern ensure the swap
is mechanical, not architectural.

---

## Component Swap Registry

This section documents components that may be swapped in the future, with concrete
triggers and estimated effort. Coding agents SHOULD consult this registry before
proposing infrastructure changes.

### Orchestration Backend → River

- **Current:** `pkg/orchestration/pg/` (570 lines)
- **Swap to:** `github.com/riverqueue/river`
- **Triggers:** Multi-instance deployment, >5 background jobs, lost-job incident,
  need for durable retry
- **Effort:** 4-6 hours (interface designed for swap, comment in code says so)
- **What survives:** Engine, Workflow interface, SSE fanout, human gate mechanism
- **What's replaced:** Pool, store CRUD, backend adapter, standalone tickers

### LLM Client → AI SDK

- **Current:** `internal/llm/client.go` (152 → ~250 lines after Stage 3)
- **Swap to:** `openai-go`, provider SDK, or multi-provider router
- **Triggers:** Need for function calling (server-side LLM tool use), streaming to
  UI, multi-modal input, or >3 distinct provider integrations
- **Effort:** 2-4 hours (thin interface, few call sites)
- **What survives:** `aim.LLMClient` interface, `ModelSelector` interface
- **What's replaced:** HTTP client code, request/response types

### Memory Client → Alternative Backend

- **Current:** `internal/memory/` (812 lines)
- **Swap to:** pgvector + custom graph, Neo4j, market graph DB
- **Triggers:** Memory project discontinued, Memory unable to support required
  graph algorithms, latency requirements Memory can't meet
- **Effort:** 2-3 days (single package rewrite, domain layer unchanged)
- **What survives:** `domain/semantic/` service interface, all ripple/aim domain logic
- **What's replaced:** `internal/memory/` client entirely

### Auth → 21st Identity (twentyfirst)

- **Current:** `internal/auth/` (347 lines) — Zitadel OIDC introspection
- **Planned swap to:** 21st Identity (twentyfirst) — the organisation's own identity,
  role, and authorization platform
- **Status:** Migration already in progress at the data model level. The `orgs` table
  has a `twentyfirst_id` column (migration 017) linking organisations to 21st Identity.
  The web UI shell matches 21st-captable's companyChrome pattern. The org model includes
  `org_number`, `country`, and `website` fields aligned with 21st Identity's entity model.
- **Rationale:** Strategies belong to organisations that live in 21st Identity.
  21st Identity owns the canonical identity, role assignments, and authorization
  policies. Duplicating auth/authz logic in the strategy-server is building something
  that already exists in the sister platform.
- **Triggers for swap:** When 21st Identity exposes a token introspection or
  session verification API that the strategy-server can call instead of Zitadel's.
  This is a when, not an if — the direction is decided, only the timing is open.
- **Effort:** 2-3 days. Replace Zitadel introspection call with 21st Identity API
  call. The PG cache and circuit breaker pattern in `internal/auth/` can be reused
  regardless of the upstream provider. The middleware and context propagation
  (`web.UserFromContext(ctx)`) are provider-agnostic.
- **What survives:** PG cache, circuit breaker, auth middleware, user context
  propagation, org membership model
- **What's replaced:** Zitadel introspection HTTP call, Zitadel key loading,
  Zitadel-specific config (`ZITADEL_ISSUER`, `ZITADEL_CLIENT_ID`, `ZITADEL_KEY_PATH`)
- **What may expand:** Authorization checks. Currently strategy-server does
  workspace-scoped access control. With 21st Identity, finer-grained role-based
  authorization (e.g., who can approve calibration, who can commit to READY
  artifacts) could be delegated to 21st Identity's policy engine rather than
  built in-house. This is relevant for Stage 5 (cycle proposal approval) and
  Stage 7 (calibration feedback) where different roles may have different
  authority levels.

### Decision 6: Evolve AIM Data Model — Two-Door Evidence Lobby

**Decision:** Build the evidence pipeline on top of the existing `AIM/evidence/`
document ingestion infrastructure (epf-cli's `ReferenceDocument` graph objects),
extending it with a second intake path for structured/API-driven evidence, shared
lifecycle management, and full-content vectorization.

**What already exists (and we must not reinvent):**

The epf-cli already has a document ingestion pipeline for `AIM/evidence/`:

1. **Decomposer** (`apps/epf-cli/internal/decompose/decompose_extra.go:362-497`):
   Walks `AIM/evidence/`, reads files (.md, .pdf, .docx, .html), extracts metadata
   (SHA-256 hash, first line, category from subdirectory name), and creates
   `ReferenceDocument` graph objects with properties: `name`, `description`,
   `category`, `source_path`, `content_hash`, `file_format`.

2. **Graph schema** (`decompose/schema.go:362-374`): `ReferenceDocument` is a
   defined object type (inertia tier 2, category "Evidence") with a full property
   schema. It already lives alongside `Feature`, `OKR`, `Assumption`, etc. in the
   Memory graph.

3. **Canonical categories**: `competitive`, `partner`, `technical`, `market`,
   `narrative`, `product-specs`, `internal` — plus custom subdirectories.

4. **Ingest pipeline** (`ingest/ingest.go`): `ReferenceDocument` objects are
   upserted to Memory alongside all other graph objects. They appear in semantic
   search results.

5. **Change detection**: `content_hash` enables incremental sync — only changed
   documents are re-upserted.

6. **Designed but unfinished**: The `EvidenceDocument` struct carries `AbsPath`
   (comment: "absolute path for content upload by the ingester") but the ingester
   never uploads file content. Documents are only searchable by metadata (name,
   first line, category), not by full content. This is the single biggest gap.

**What's missing:**

1. **Full content vectorization.** The `EvidenceDocument.AbsPath` was designed
   for this but never implemented. Documents are in the graph but only searchable
   by their first line and filename. A 40-page competitive analysis is represented
   by one sentence.

2. **Strategy-server is blind to evidence.** The server's decomposed ingest path
   (`domain/ingest/service.go:590-703`) exports artifacts from PostgreSQL to a temp
   directory and runs the decomposer on that. Since evidence documents are files on
   disk — not YAML artifacts in Postgres — the temp dir never has `AIM/evidence/`,
   so `decomposeEvidence()` silently produces nothing.

3. **No structured evidence path.** The filesystem-based approach works for humans
   dropping documents. It doesn't work for metrics pipelines, webhook events, or
   API-driven evidence that never exists as a file.

4. **No lifecycle tracking.** A document in `AIM/evidence/` is either present or
   absent. There's no concept of "this evidence was consumed by Cycle 3 assessment"
   or "this evidence was linked to assumption asm-001."

5. **No provenance beyond directory name.** The category comes from the subdirectory.
   There's no timestamp (beyond file mtime), no source system identifier, no
   confidence level.

**Design: The Two-Door Evidence Lobby**

The AIM evidence lobby has two intake doors that converge into one pipeline:

```
DOOR 1: Documents (existing, extended)              DOOR 2: Structured Evidence (new)
Humans drop files in AIM/evidence/                   Systems push via MCP tool or webhook
  reports, presentations, transcripts                  metrics, user feedback, alerts
  |                                                    |
  v                                                    v
epf-cli decomposeEvidence()                          strategy-server ingest_evidence tool
  ReferenceDocument graph objects                      Evidence artifact in strategy_artifacts
  + FULL CONTENT UPLOAD (new)                          + schema-validated payload
  |                                                    |
  +---------+    SHARED PIPELINE     +-----------------+
            |                        |
            v                        v
     Memory Graph (unified search across both)
            |
            v
     Classification & Linking (optional, enrichable)
       - Tags (freeform, not enum)
       - Relationships to strategy artifacts
       - LLM-assisted or manual
            |
            v
     Consumption by DraftAssessment
       - Grouped by linked artifact
       - Marked as processed
       - Referenced in evidence_summary
```

**Door 1 changes (document path — extend existing):**

1. **Complete the content upload** — implement what `EvidenceDocument.AbsPath` was
   designed for. After upserting `ReferenceDocument` metadata, upload the file
   content to Memory as a document/attachment so it gets fully vectorized.
   For markdown: upload raw text. For PDF/DOCX: extract text first (or upload
   binary if Memory supports it). This is the single most impactful change —
   it makes the existing evidence library actually searchable by content.

2. **Add lifecycle tracking** — extend `ReferenceDocument` properties with
   `processing_status` (unprocessed/processed/archived), `processed_by` (assessment
   artifact key), `processed_at` (timestamp). The decomposer sets
   `processing_status=unprocessed` on first create.

3. **Add provenance fields** — extend `ReferenceDocument` properties with
   `collected_at` (defaults to file mtime if not set in front matter),
   `source_type` (freeform, defaults to category), `tags` (freeform string array,
   defaults to `[category]`).

4. **Optional YAML front matter in markdown** — documents CAN include front matter:
   ```yaml
   ---
   source: Q1 Board Meeting
   collected_at: 2026-01-15
   tags: [board, strategy-review, market-size]
   linked_artifacts: [asm-p-002, okr-growth-01]
   ---
   # Quarterly Board Review Notes
   ...
   ```
   If front matter is present, the decomposer extracts it. If absent, defaults
   apply (category as tag, mtime as date). This preserves the "just drop a file"
   experience while enabling richer metadata when humans care to provide it.

**Door 2 design (structured evidence — new):**

1. **Evidence schema** — `evidence_item_schema.json` in canonical EPF. Required:
   `source` (object: `name`, `type` freeform string), `collected_at` (ISO timestamp),
   `content` (freeform object). Optional: `tags` (string array), `summary` (string),
   `linked_artifacts` (array of artifact keys).

2. **Storage** — as `strategy_artifacts` with `artifact_type='evidence'`. This
   means evidence participates in mutation ledger, version snapshots, Memory graph,
   and ripple engine. No new table.

3. **MCP tools** — `ingest_evidence` (create), `list_evidence` (read with filters),
   `get_evidence` (read one), `link_evidence` (add relationship), `update_evidence`
   (add tags/summary post-intake).

4. **Tags, not enums** — freeform classification. Ship with suggested vocabulary
   derived from the existing `AIM/evidence/` categories plus common structured
   sources: `competitive`, `partner`, `technical`, `market`, `narrative`,
   `product-specs`, `internal`, `metric`, `user-feedback`, `sales`, `support`,
   `engineering`.

**Why both doors converge:**

The separation between "human drops a file" (Door 1) and "system pushes a
structured payload" (Door 2) is a UX distinction, not a data model distinction.
In Memory, both produce objects in the same graph:

| Property | Door 1 (ReferenceDocument) | Door 2 (evidence artifact) |
|----------|---------------------------|---------------------------|
| Graph type | `ReferenceDocument` | `evidence` (or unified) |
| Content | Full document text (vectorized) | `content` field (vectorized) |
| Tags | From front matter or `[category]` | From `tags` field |
| Source | File path + optional front matter | `source` object |
| Timestamp | File mtime or front matter | `collected_at` |
| Lifecycle | `processing_status` property | `status` field on artifact |
| Searchable | Yes (hybrid text+vector) | Yes (hybrid text+vector) |
| Linked | Via `linked_artifacts` in front matter | Via `strategy_relationships` |

Both types appear in `search_strategy` results. Both can be consumed by
`DraftAssessment`. Both can trigger `evidence_threshold`. The assessment doesn't
care whether evidence came from a markdown file a founder dropped after a board
meeting or from a Mixpanel webhook.

**The first-cycle bootstrap scenario:**

This is the use case you described. In Cycle 0, before READY artifacts are
populated:

1. Team dumps existing strategic documents into `AIM/evidence/`: pitch decks,
   market research, competitor analyses, founder vision docs, board presentations.
2. `epf-cli ingest` creates `ReferenceDocument` objects with full content upload.
3. Memory vectorizes everything. The strategy graph is sparse (no features, no
   OKRs) but the evidence library is rich.
4. AI agents querying `search_strategy` for "who is our target customer" get hits
   from the pitch deck and market research — even though no persona artifact exists
   yet.
5. The evidence informs the READY phase authoring: when the pathfinder agent
   drafts the north star, it draws on this evidence.
6. As READY artifacts get populated, the agent can link evidence to the artifacts
   it informed: "this market research supports assumption asm-p-001."

**The mid-flight scenario:**

Cycle 3. READY and FIRE artifacts are populated. The team is executing.

1. Meeting transcripts, sprint retro notes, and customer call summaries are dropped
   into `AIM/evidence/` with front matter tags.
2. Mixpanel sends a funnel drop-off alert via `ingest_evidence` with
   `tags: ["metric", "activation", "funnel"]`.
3. A sales rep's lost-deal post-mortem arrives via `ingest_evidence` with
   `tags: ["sales", "lost-deal", "competitor:acme"]` and `linked_artifacts: ["asm-s-002"]`.
4. The heartbeat detects 15 unprocessed evidence items and fires an
   `evidence_threshold` trigger.
5. A cycle proposal surfaces. User approves.
6. `DraftAssessment` reads all unprocessed evidence:
   - Evidence linked to OKR `okr-growth-01` is included in that OKR's assessment context
   - Evidence linked to assumption `asm-s-002` is included in that assumption's validation
   - Unlinked evidence (the meeting transcripts) becomes general strategic context
7. The assessment `evidence_summary` section references all consumed evidence.
8. On commit, consumed evidence is marked processed.

**Canonical EPF schema changes required:**

1. **New: `evidence_item_schema.json`** — Schema for structured evidence (Door 2).
   Required: `source` object, `collected_at`, `content` object. Optional: `tags`,
   `summary`, `linked_artifacts`. No type enum.

2. **Evolution: `ReferenceDocument` type in decomposer schema** — Add properties:
   `processing_status`, `processed_by`, `processed_at`, `tags`, `collected_at`,
   `source_type`. Backward-compatible (new optional properties).

3. **Evolution: `assessment_report_schema.json`** — Add optional `evidence_summary`
   section referencing consumed evidence. Backward-compatible.

4. **Evolution: `aim_trigger_config_schema.json`** — Add `evidence_threshold`
   trigger config with tag-based filtering. Backward-compatible.

5. **New: YAML front matter spec for evidence documents** — Optional front matter
   format for `AIM/evidence/*.md` files. Documented in updated `evidence_README.md`.

**Strategy-server changes required:**

1. **Bridge the strategy-server to existing document evidence.** The decomposed
   ingest path must learn to pull `ReferenceDocument` objects that epf-cli created.
   Two approaches:
   - *Option A:* Strategy-server reads `ReferenceDocument` objects from Memory
     (where epf-cli put them) and treats them as evidence for DraftAssessment.
     No new ingestion — just query Memory with type filter `ReferenceDocument`.
   - *Option B:* Strategy-server imports document evidence from the filesystem
     (if the instance has a linked GitHub repo, the files are accessible). Run
     its own evidence decomposition.
   
   Option A is simpler and correct: Memory is the convergence point for both
   doors. The strategy-server doesn't need to re-decompose files that epf-cli
   already decomposed. It just needs to query Memory for evidence objects
   (both `ReferenceDocument` and `evidence` types) when building assessment
   context.

2. **Structured evidence CRUD** — `domain/evidence/` package for Door 2.
   Store as `strategy_artifacts`, push to Memory.

3. **Unified evidence query** — `DraftAssessment` queries Memory for all
   evidence-typed objects (both `ReferenceDocument` and `evidence`), grouped
   by linked artifact. The query doesn't care which door the evidence came through.

**Alternatives considered:**

- *Keep evidence as unstructured files only.* Works for human-curated documents
  but excludes structured/API-driven evidence. The existing pipeline is a great
  foundation but can't handle the firehose alone. Rejected as insufficient.

- *Replace the filesystem path with API-only.* Would break the "just drop a file"
  experience that makes the first-cycle bootstrap work. Teams already have
  documents — making them import through an API is friction for zero benefit.
  Rejected as regression.

- *Separate `strategy_evidence` table.* Would be invisible to the mutation ledger,
  version snapshots, Memory graph, and ripple engine. Rejected as silo.

- *Fixed evidence type enum.* Too rigid for diverse sources. The existing
  `AIM/evidence/` category system (directory names) is already freeform —
  going backward to an enum contradicts the existing design. Rejected.

- *Unify ReferenceDocument and evidence into one Memory type.* Tempting but
  wrong. `ReferenceDocument` is a full document (potentially 40 pages).
  An `evidence` artifact is a structured data point (a metric, a signal).
  They have different schemas, different UX, and different processing needs.
  They should be different types in the graph but treated uniformly by
  the assessment pipeline.

---

## Open Questions

1. **Evidence retention policy:** How long should processed evidence be retained
   before auto-archiving? Default proposal: 90 days after processing (not after
   ingestion). Unprocessed evidence should never auto-archive — if it hasn't been
   consumed, that's a signal, not a cleanup target.

2. **Heartbeat notification channel:** Should fired triggers produce push
   notifications (email, Slack) in addition to SSE and MCP signals? Deferred to
   post-Stage 1 based on user feedback.

3. **Evidence webhook security:** When external systems push evidence via webhook,
   what authentication model? HMAC signing (like the app platform) is the likely
   answer but needs design when Stage 4 adds webhook support.

4. **Cross-instance evidence sharing:** When multiple strategy instances exist
   (e.g., product-level and company-level), should evidence be shared? Deferred
   to multi-instance network design (not in scope).

5. **Evidence tag vocabulary seeding:** Ship with suggested tags derived from
   existing `AIM/evidence/` categories plus common structured sources:
   `competitive`, `partner`, `technical`, `market`, `narrative`, `product-specs`,
   `internal`, `metric`, `user-feedback`, `sales`, `support`, `engineering`.
   Auto-suggest from recent usage.

6. **Canonical EPF schema governance:** The evidence schema is a new addition to
   canonical EPF. The `ReferenceDocument` type evolution and `evidence_item_schema`
   must be coordinated across canonical-epf, epf-cli, and strategy-server. The
   established pattern: add to canonical-epf first, sync to consumers via
   `make sync-embedded`. All schema evolution must be backward-compatible.

7. **Content upload implementation in Memory:** The Memory API's document/content
   upload capability needs to be verified. If Memory supports document upload with
   automatic chunking and vectorization, the implementation is straightforward.
   If not, the epf-cli would need to chunk markdown content and upsert chunks as
   separate graph objects linked to the parent `ReferenceDocument`. This affects
   the Door 1 implementation but not the overall architecture.

8. **Front matter adoption risk:** Adding optional YAML front matter to evidence
   markdown files introduces a convention that teams need to learn. The design
   makes it strictly optional (defaults apply without it), but the linked-artifacts
   capability is only available via front matter or post-hoc `link_evidence` calls.
   Monitor whether teams actually use front matter or prefer API-based linking.
