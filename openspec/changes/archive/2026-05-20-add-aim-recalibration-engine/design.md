## Context

The EPF AIM phase currently has read-only tooling and no closed-loop feedback. The existing CLI commands (`aim assess`, `aim okr-progress`, `aim validate-assumptions`) generate templates and reports but cannot write results back, and nothing propagates calibration decisions into READY artifacts. This design describes the architectural decisions for building a complete AIM recalibration engine across four phases.

### Stakeholders

- **EPF CLI users** — need write-back tools for AIM artifacts
- **AI Strategy Agent** (future) — needs MCP tools to autonomously run AIM sessions
- **EPF Cloud Server** (future) — needs monitoring integration for server-side trigger evaluation

## Goals / Non-Goals

### Goals

- Enable complete AIM cycle execution via CLI and MCP tools (write assessment, calibrate, propagate)
- Support cycle-over-cycle tracking with archived history
- Automate drift detection and trigger evaluation
- Prepare data contracts for autonomous AI recalibration
- Maintain backward compatibility with existing AIM commands

### Non-Goals

- Building a full data warehouse or analytics platform within the CLI (metrics storage and querying belong in the server)
- Real-time monitoring in the CLI (the CLI handles periodic/on-demand evaluation; continuous monitoring lives in the server)
- Multi-tenant monitoring (single instance per CLI invocation; multi-instance is a server concern)
- UI/dashboard for AIM data within the CLI (CLI and MCP are the local interfaces; dashboards belong in the server's web UI)
- Implementing HTTP clients for external systems (ClickUp, Linear, GitHub) in the CLI (use script-based collectors instead; production integrations live in the server)

## Decisions

### 1. AIM artifact write-back via structured input, not freeform YAML

**Decision:** Write-back commands accept structured parameters (field-level updates) rather than accepting raw YAML content to overwrite files.

**Rationale:** Structured input enables:
- Validation at write time (reject invalid states)
- Automatic evolution log entries (track what changed and why)
- Merge semantics (update specific fields without losing others)
- MCP tool compatibility (JSON parameters map cleanly)

**Alternative considered:** Accept raw YAML and validate after write. Rejected because it doesn't enable automatic evolution tracking and makes MCP tool design harder (large string parameters).

### 2. Cycle archival as directory snapshots

**Decision:** Completed cycles are archived as `cycles/cycle-N/` directories containing copies of the assessment report, calibration memo, track health signals, and a snapshot of the LRA at cycle end.

**Rationale:** Simple, git-friendly, enables cycle-over-cycle comparison. The LRA snapshot captures the baseline that was in effect during the cycle, while the current LRA evolves.

**Alternative considered:** Single timeline file with all cycles appended. Rejected because it becomes unwieldy and makes cycle-specific queries harder.

### 3. Recalibration as changeset, not direct write

**Decision:** `aim recalibrate` generates a changeset (structured diff) that can be previewed (`--dry-run`) before applying. Applied changes are logged in the LRA evolution log.

**Rationale:** Recalibration touches foundational READY artifacts (north star, strategy formula). These changes should be reviewable before applying. The changeset format also enables the AI agent to generate proposals as PRs.

### 4. Metrics as timestamped YAML in AIM/metrics/

**Decision:** Ingested metrics are stored as simple timestamped YAML files in `AIM/metrics/YYYY-MM-DD_<source>.yaml`. No database.

**Rationale:** Keeps the entire EPF instance as a git-trackable YAML tree. Metric files are small and infrequent (weekly). Schema validation applies. This is sufficient for the monitoring use case; production analytics should live in dedicated systems.

**Alternative considered:** SQLite database in AIM directory. Rejected because it breaks the "everything is YAML in git" principle and adds a binary file to the repo.

### 5. Monitoring as periodic check, not persistent daemon

**Decision:** `aim monitor` is a periodic evaluation command (invoke via cron, CI, or as a scheduled goroutine in the MCP server) rather than a standalone daemon process.

**Rationale:** A daemon adds operational complexity (process management, crash recovery, resource usage). Periodic evaluation is sufficient for weekly cadence. The MCP server already has a long-running process that can host scheduled checks if needed. Cloud Run's scheduled invocations provide the server-side equivalent.

### 6. Canonical EPF repo must be kept in sync

**Decision:** Any changes to AIM schemas, templates, or wizards must be made in `emergent-company/epf-canonical` (locally at `/Users/nikolaifasting/code/canonical-epf`) first, then synced into `epf-cli` via `sync-embedded.sh`.

**Architecture:**

```
epf-canonical (source of truth)
  schemas/*.json, templates/AIM/*.yaml, wizards/*.md
       |
       | sync-embedded.sh (copies at build time)
       v
epf-cli/internal/embedded/
  schemas/, templates/, wizards/
       |
       | Go //go:embed
       v
Compiled epf-cli binary (3-tier fallback at runtime)
```

**What this means per phase:**

| Phase | Canonical changes likely needed |
|-------|-------------------------------|
| 1 | None expected (writing to existing artifact types), but schema gaps discovered during implementation go upstream |
| 1B | Yes: fix 3 schemas (LRA trigger enum, assessment assumption pattern, assessment/calibration meta), rewrite 3 templates (assessment, calibration, LRA), update 1 wizard (synthesizer) |
| 1C | Yes: new SRC schema + template + wizard in `epf-canonical`. Register artifact type in epf-cli schema/template registries |
| 2 | Possible: changeset format schema, wizard updates to `synthesizer.agent_prompt.md` with recalibration guidance |
| 3 | Yes: metric schema (new artifact type), trigger config schema extensions, probe report schema |
| 4 | Yes: new AI agent instruction sets for AIM operations |

**Workflow for each phase:**

1. Make schema/template/wizard changes in `canonical-epf` first
2. Run `sync-embedded.sh` to copy into `epf-cli/internal/embedded/`
3. Build and test `epf-cli` against updated embedded content
4. Commit to both repos (canonical first, then emergent-strategy)

**Alternative considered:** Making changes in `internal/embedded/` directly and back-porting to canonical later. Rejected because it creates divergence risk and the sync is one-directional (canonical → embedded).

### 7. Canonical alignment: schemas are authoritative, templates and tools adapt

**Decision:** When schemas, templates, and tools disagree, the schema is the source of truth. Templates and tool code adapt to match schemas — not the other way around — with a small number of exceptions where the schema has a clear bug (e.g., assumption ID pattern that no existing artifact uses).

**Rationale:** The Phase 1 post-implementation audit revealed 9 gaps where schemas, templates, and bootstrap tools contradicted each other (e.g., assessment report template nesting OKRs by track while the schema defines a flat array; LRA template using field names and enum values that don't exist in the schema; bootstrap tool offering enum values that fail validation). The root cause is that schemas, templates, and tools were authored at different times without cross-validation.

The fix principle:
- **Schemas** define the contract. They change only when the contract itself is wrong (e.g., `asmp-` pattern that contradicts the documented `asm-` convention used everywhere else).
- **Templates** are examples. They must produce YAML that could pass schema validation (ignoring placeholder content like "TBD").
- **Tools** are producers. Their output must pass schema validation.
- **Wizards** are guides. They reference current tool names and artifact structures.

**What this means for Phase 1B:** All 5 AIM templates are being rewritten for schema compliance. The LRA schema gets one enum addition (`cycle_transition`). The assessment report schema gets one pattern correction (`asm-` prefix). Both assessment and calibration schemas get an optional `meta` field. The bootstrap tool's enum values are remapped to match the schema.

**Alternative considered:** Expanding schemas to accept both template and tool values (e.g., accepting both `asmp-` and `asm-` patterns). Rejected because it creates ambiguity about what the "right" format is, and downstream consumers (the recalibration engine in Phase 2) need a single canonical format.

### 8. Strategic Reality Check as a new artifact type, organized by detection type

**Decision:** Introduce a new AIM artifact type — `strategic_reality_check` — to evaluate all READY and FIRE artifacts against current reality. The SRC is organized by **detection type** (5 sections: belief validity, market currency, strategic alignment, execution reality, recalibration plan), not by artifact.

**Rationale:** A deep audit of all 14 EPF schemas revealed that AIM only evaluates the Roadmap Recipe. The Assessment Report tracks OKR outcomes and assumption validations; the Calibration Memo recommends next steps. But neither artifact has structured data to evaluate whether the other 6 READY artifacts or any FIRE artifacts are still valid. Five categories of detection were identified:

1. **Belief/hypothesis invalidation** — North Star `belief_challenges[].monitoring`, Strategy Formula `risks[].monitoring`, Roadmap `riskiest_assumptions[].confidence`. These monitoring directives exist in READY schemas but nothing in AIM consumes them.
2. **Maturity/status progression stalls** — Value Model L3 maturity, Feature Definition `feature_maturity.overall_stage`. AIM doesn't compare maturity across cycles.
3. **Cross-reference integrity** — Features reference value model paths via `contributes_to[]`, assumptions link to KRs via `linked_to_kr[]`, features reference each other via `dependencies`. AIM doesn't validate these.
4. **Freshness decay** — North Star `last_reviewed`/`next_review` (yearly), Insight Analyses `next_review_date` (3-6 months), Feature `last_assessment_date` (90 days). AIM doesn't flag staleness.
5. **Confidence/priority drift** — Multiple artifacts have `confidence_level` fields. Market conditions shift these but AIM has no re-evaluation mechanism.

**Why a new artifact instead of expanding existing AIM schemas:** The Assessment Report is purpose-built for roadmap cycle evaluation (OKRs + assumptions). Adding cross-artifact health checks would overload it and make it less focused. The SRC serves a different purpose: it asks "are the foundations still valid?" rather than "did we execute well this cycle?" The SRC's `recalibration_plan` feeds into the Calibration Memo as evidence, completing the information chain: SRC (what's wrong) → Calibration Memo (what to do) → `aim recalibrate` (apply it).

**Why organized by detection type, not by artifact:** Organizing by artifact (e.g., "North Star findings", "Insight Analyses findings") would scatter related signals. A weakening belief in the North Star often correlates with competitive changes detected in Insight Analyses and confidence drift in Strategy Formula. Grouping by detection type surfaces these cross-artifact patterns.

**Key structural decisions:**
- Every finding links to a specific `source_artifact` file path and `field_path`, making it traceable and actionable
- Simple signal vocabulary: `strengthening/holding/weakening/invalidated` for beliefs, `low/medium/high/critical` for staleness, `valid/broken/stale` for cross-references
- `recalibration_plan` is the primary output section — prioritized list with effort estimates, directly consumable by Phase 2's `aim recalibrate` command
- `aim generate-src` auto-populates mechanical checks (freshness dates, cross-reference validation, maturity mismatches); subjective sections are left as TODOs for AI/human judgment

**Alternative considered:** Expanding the Assessment Report and Calibration Memo schemas to include cross-artifact evaluation sections. Rejected because it conflates two different concerns (cycle execution evaluation vs. foundation validity) and would require all existing assessment/calibration tooling to handle the expanded scope.

### 9. CLI/server architectural boundary for stateful AIM operations

**Decision:** EPF CLI remains a stateless analysis engine operating on local YAML files. Stateful concerns — time-series metrics storage, continuous monitoring, dashboards, webhook receivers, multi-user access — belong in a server component (the `emergent` backend). The CLI may serve as a library (Go packages imported directly) or be invoked by the server, but it does not itself become a server with persistence.

**Rationale:** Phases 1–2 (validation, SRC, recalibration, health checks) are genuinely well-suited to file-based operation: they're stateless read-compute-output on YAML files in a git repo, with quarterly cadence. Phase 3 introduces concerns that strain the database-less model:

| Concern | File-based workaround | Server gives you |
|---|---|---|
| Metrics over time | Accumulating YAML files in `AIM/metrics/` | Time-series queries, aggregation |
| Monitoring state | Hidden state file (last run, alert history) | Proper state management |
| Trend analysis | Load + parse N files to compare | Single query |
| Dashboard serving | Read files on every request | Indexed, fast reads |
| External system webhooks | Poll-based scripts | Real-time webhook receivers |

At the current scale (solo founder, quarterly cycles, ~17 KRs), the file-based workaround is ugly but functional. But designing Phase 3 around YAML file accumulation creates technical debt that the server would immediately replace. Better to split now.

**What this means for Phase 3:**
- **3.1 (trigger evaluation) and 3.3 (probe reports)** remain CLI-native — they're stateless analysis that reads trigger config + current data and produces a report. No persistence needed.
- **3.2 (data collection/ingestion) and 3.4 (continuous monitoring)** are redesigned as server features. The CLI provides a lightweight `aim collect` command for local/script-based collection, but production metric ingestion, storage, and webhook receivers live in a server component.
- The bridge uses open protocols: the server accesses EPF analysis capabilities via MCP tools (or imports Go packages as a library). For persistent storage, the server can use `emergent`'s knowledge graph API (schemaless entities, vector search, graph traversal) rather than building its own database layer — see Decision #11. The deployment topology (standalone, emergent module, or sidecar) is deferred.

**Alternative considered:** Building SQLite storage into the CLI for metrics. Rejected because it breaks the "everything is YAML in git" principle, adds a binary file to the repo, and duplicates infrastructure the server already needs.

**Alternative considered:** Keeping everything file-based and accepting the limitations. Rejected because Phase 3.4 (monitoring endpoint) already implicitly requires a server, making the file-based approach a temporary bridge that would be thrown away.

### 10. Script-based collector model for data ingestion (Phase 3.2)

**Decision:** For the CLI-side of data collection, use a script-based plugin model. EPF CLI does not implement HTTP clients for external systems (no vendor coupling). Users provide collector scripts (Python, bash, etc.) that call external APIs and output metric YAML to stdout. The CLI orchestrates collection, validates output against the metric schema, and writes to `AIM/metrics/`.

**Architecture:**

```
aim_data_sources.yaml (config)
├── data_sources:
│   ├── git_velocity (built-in, runs locally)
│   ├── clickup_tasks (user script: scripts/collect_clickup.py)
│   └── github_prs (user script: scripts/collect_github.sh)
├── kr_mappings:
│   ├── kr-p-2025-q1-001 → metric: test_count, operator: >=, target: 50
│   └── kr-p-2025-q1-003 → metric: feature_count, operator: >=, target: 3
└── trigger_feeds:
    └── roi_waste_signal → metric: sprint_completion_rate, threshold: < 0.5

Collector scripts:
  - Called by `aim collect`
  - Auth via env var references (never stored in config)
  - Output: structured YAML to stdout (validated against metric schema)
  - Exit code 0 = success, non-zero = skip with warning

epf-cli orchestration (`aim collect`):
  1. Read aim_data_sources.yaml
  2. For each source: run script, capture stdout, validate against metric schema
  3. Write validated metrics to AIM/metrics/YYYY-MM-DD_<source>.yaml
  4. Derive KR statuses from kr_mappings (compare actuals to targets)
  5. Feed trigger_feeds into trigger evaluation engine (Phase 3.1)
```

**One built-in collector:** `git_velocity` — runs locally via `git log`, produces commits/week, files changed, active contributors. No external dependencies.

**KR mapping layer:** The key insight is that raw metrics (e.g., "47 tests passing") don't become useful until mapped to KR targets (e.g., "KR says 50, we have 47, status: partially_met"). The `kr_mappings` section bridges this with simple comparison operators (`>=`, `<=`, `==`, `contains`).

**Credentials:** Stored as env var references only (e.g., `auth_env: CLICKUP_API_TOKEN`). The config file is safe to commit; secrets stay in the environment.

**Rationale:** This approach keeps the CLI vendor-agnostic while enabling integration with any external system. Users write thin adapter scripts (typically 20-50 lines) for their specific tool stack. The CLI's job is orchestration, validation, and KR derivation — not API client maintenance.

**Scope note:** This design covers the CLI-side collector for local/CI usage. For production continuous collection (webhook receivers, real-time ingestion), the server component in `emergent` handles persistence and exposes API endpoints. The CLI's `aim collect` and the server's ingestion API both produce the same metric schema, ensuring compatibility.

**Alternative considered:** Building HTTP clients for popular tools (ClickUp, Linear, GitHub) directly into the CLI. Rejected because it creates vendor coupling, requires ongoing API maintenance, and the server is a better home for persistent integrations.

### 11. Agent-native integration: MCP for tools, A2A for agents, emergent as knowledge graph

**Decision:** Cross-system integration uses open agent protocols — not shared databases, shared Go packages, or monolithic backends. The protocol stack is:

- **MCP** (Model Context Protocol) for agent-to-tool communication. Already in use: EPF CLI exposes 50+ MCP tools. This continues unchanged.
- **A2A** (Agent2Agent Protocol) for agent-to-agent coordination. Replaces the earlier "ACP" references in `add-emergent-ai-strategy`. A2A (Google, now Linux Foundation, v1 spec) provides agent discovery via Agent Cards, task delegation, streaming, and push notifications. The official Go SDK (`github.com/a2aproject/a2a-go`) is available. Google ADK-Go — already used in `emergent` — has native A2A support.
- **`emergent` platform as a knowledge graph tool** accessed via its REST API, Go SDK, or MCP server — not via shared database tables or Go package imports. `emergent` provides schemaless entity storage (JSONB properties per type), graph relationships (directed, versioned, weighted, with auto-inverse), 768-dim vector embeddings (text-embedding-004 via Vertex AI), hybrid search (FTS + vector with z-score fusion), graph traversal (BFS with multi-phase edges, predicates, temporal filtering), and git-like branching for what-if analysis. These are accessed through `emergent`'s existing API surface (`/api/graph/*`, `/api/search/*`, `/api/type-registry/*`, `/api/template-packs/*`) or its MCP server (`/api/mcp`).

**Integration model:**

```
EPF CLI (local YAML = source of truth)
  │
  ├─ MCP ──► AI agents use EPF tools (existing)
  │
  ├─ A2A ──► EPF services coordinate with emergent services
  │          (agent discovery, task delegation, streaming)
  │
  └─ API/MCP ──► emergent knowledge graph (derived view)
                 - Sync EPF artifacts as graph objects
                 - Query via hybrid search + traversal
                 - Branch-based strategy scenarios
                 - Vector similarity across artifacts
```

**What `emergent` provides as a tool (not a dependency):**

| EPF AIM need | emergent capability | Access via |
|---|---|---|
| Persist strategy artifacts as graph | Graph objects with typed JSONB properties | REST API or SDK |
| Model artifact relationships | Graph relationships (versioned, weighted, auto-inverse) | REST API or SDK |
| Semantic search across strategy | Hybrid search (FTS + vector, configurable fusion) | REST API or MCP |
| Alignment chain analysis | Graph traverse/expand (multi-hop, predicates, temporal) | REST API |
| Strategy scenario modeling | Branch + merge (conflict detection, dry-run) | REST API |
| Define EPF artifact schemas | Template Packs (JSON Schema per type, relationship constraints) | REST API or MCP |
| AI-powered entity extraction | Extraction pipeline with template pack schemas | REST API |

**Key principle: `emergent` is a tool, not a dependency.** EPF CLI works fully offline with local YAML. The `emergent` knowledge graph is a derived view you can sync into for richer analysis. If `emergent` is unavailable, all EPF CLI functionality continues. Tighter integration (real-time sync, server-side recalibration using emergent's scheduler, graph-based trigger evaluation) remains possible later — the protocol interfaces are the same.

**Standalone vs. enhanced mode:** Every capability in the system works without `emergent` or a database. `emergent` makes things better, not possible. The AI agent can fill the gap for several "server" concerns — it *is* the dashboard, the search engine, and the trend analyzer when operating on local files.

| Capability | Standalone (YAML + AI agent) | Enhanced (with `emergent`) |
|---|---|---|
| **Strategy persistence** | YAML files in git (source of truth always) | + Graph objects with typed properties and embeddings |
| **Semantic search** | `epf_search_strategy` MCP tool (text matching) | + Hybrid FTS + vector search with z-score fusion |
| **Alignment analysis** | `epf_validate_relationships` (path validation) | + Multi-hop graph traversal with predicates |
| **Scenario modeling** | Git branches | + Graph branching with conflict detection and dry-run merge |
| **Metric storage** | YAML files in `AIM/metrics/` | + Graph objects with temporal queries |
| **Trend analysis** | AI agent parses + compares YAML files | + Time-series queries, aggregation |
| **Monitoring** | `aim check-triggers` via cron/CI | + Server-side loop with push notifications |
| **Dashboard** | AI agent generates probe report Markdown | + Web dashboard with graph analytics |
| **Agent memory** | Agent context window + local files | + Persistent graph with vector embeddings |
| **Cross-system coordination** | MCP tools (already working) | + A2A agent discovery and task delegation |

**Last responsible moment for deployment topology:** Whether the EPF cloud server runs standalone (Cloud Run), as a module within `emergent`'s server-go, or as a sidecar is a deployment decision — deferred until Phase 3S is ready to implement. The integration protocols (MCP, A2A, REST API) work identically regardless of deployment topology.

**Rationale:** The ecosystem is multiple independently-developed Go services (`emergent-strategy`/epf-cli, `emergent`/server-go, future tools). Coupling them at the database or package level creates a monolith. Coupling them at the protocol level preserves independent development, testing, and deployment while enabling rich coordination. Both `emergent` and `emergent-strategy` are AI-agentic systems — A2A is the natural coordination protocol for agent-to-agent work, just as MCP is for agent-to-tool work.

**ACP → A2A migration note:** The `add-emergent-ai-strategy` design originally referenced ACP (Agent Communication Protocol). In August 2025, IBM's ACP merged with Google's A2A protocol under the Linux Foundation. All references in these specs now use A2A. The A2A spec subsumes ACP's capabilities (RESTful agent discovery, async task management, streaming) and adds the Agent Card discovery mechanism.

**Alternative considered:** Deep integration — EPF cloud server as a domain module within `emergent`'s server-go, sharing PostgreSQL, Bun ORM, Zitadel auth, and domain patterns. Rejected for now because it creates a deployment coupling (can't ship EPF changes without deploying the full emergent stack) and blocks independent development velocity. Can be revisited if performance or operational concerns warrant it — the protocol-based approach is designed to be replaceable with tighter integration at any point.

**Alternative considered:** No `emergent` integration at all — keep everything as local YAML files forever. Rejected because graph traversal, vector similarity search, and temporal queries over strategy artifacts provide genuine value that flat YAML files cannot offer, and `emergent` already provides these capabilities.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------:|
| Phase 4 depends on AI Strategy Agent which doesn't exist yet | Phases 1-3 are fully standalone; Phase 4 tasks define clear integration points |
| Recalibration changeset format may not cover all READY artifact variations | Start with the most common patterns (track focus changes, assumption updates, OKR adjustments); extend as needed |
| Metric YAML files could proliferate in git | Add retention policy to trigger config (keep N weeks of metrics, prune older ones). For production use, server handles storage with proper retention. |
| Write-back commands change AIM artifacts, risking data loss | All writes append to evolution log; `aim archive-cycle` creates snapshots before modifications |
| SRC mechanical checks may produce false positives (e.g., flagging valid cross-references as broken due to path format variations) | Start with strict matching, add normalization rules as edge cases appear. False positives are preferable to false negatives for foundation validity |
| Canonical EPF repo (`epf-canonical`) and `epf-cli` embedded content drift apart | Enforce workflow: canonical first, sync, then build. CI clones canonical at build time. Never edit `internal/embedded/` directly |
| CLI/server boundary creates two places to maintain metric validation logic | CLI Go packages are importable as a library by the server — single validation codebase, two execution contexts |
| Script-based collectors add user-managed complexity (writing/maintaining collector scripts) | Ship with one built-in collector (`git_velocity`) as a reference implementation. Document the script contract clearly. Keep the output schema simple. |
| Server component (`emergent` backend) may not be ready when Phase 3 CLI work is done | Phase 3 CLI tasks (triggers, probe reports, `aim collect`) are fully standalone. Server-side tasks are explicitly deferred — the CLI works without a server. |
| A2A protocol is still maturing (v1 spec released 2025, Go SDK early) | A2A is backed by Google + Linux Foundation with active development. The integration is additive — MCP tools work independently. A2A adds agent-to-agent coordination but isn't required for any Phase 1-3 work. |
| `emergent` knowledge graph sync adds a new integration surface | Sync is one-directional (EPF YAML → emergent graph) and additive. EPF CLI works without emergent. Start with manual `epf sync` command; automate only when the value is proven. |

## Open Questions

- ~~Should probe reports be a new canonical artifact type with their own schema, or are they ephemeral output (like the track health signals)?~~ **Decided:** Probe reports will be a canonical artifact type — they're the weekly health snapshot that feeds trend analysis. Schema goes in Phase 3.
- ~~What is the minimum set of READY artifacts that `aim recalibrate` should support in Phase 2?~~ **Decided (Phase 2, shipped):** All READY artifacts the calibration memo and SRC reference. Changeset covers north_star, strategy_formula, roadmap_recipe, and all FIRE feature definitions.
- Should the monitoring goroutine in the MCP server be opt-in via a config flag, or always-on when the server has a trigger config? **Updated:** Now moot for the CLI — continuous monitoring lives in the server component. The CLI's `aim check-triggers` is always on-demand.
- ~~Should `aim generate-src` run all 5 detection categories by default, or accept a `--categories` flag to run a subset?~~ **Decided (Phase 1C, shipped):** Runs all categories by default. No subset flag needed — the full run is fast enough (~200ms on the emergent instance with 56 findings).
- How much of the assessment report can be auto-populated from external systems vs. requiring human input? **Updated:** Analysis shows ~60% of KR actuals can be automated with collector scripts (test counts, artifact counts, uptime). OKR narrative assessments and assumption evidence interpretation require AI synthesis (Phase 4) or human input (~15 min irreducible). Full manual effort is ~90 min/quarter.
- Where does `aim_data_sources.yaml` live — in `AIM/` alongside other AIM artifacts, or in a top-level config directory? Leaning toward `AIM/` for consistency.
- Should the server component define its own metric storage schema, or reuse the CLI's YAML metric schema as the canonical format with a database adapter layer?
- When the server is available, should `aim collect` support a `--push` flag to send collected metrics to the server API instead of writing local YAML?
- Should an EPF Template Pack be created in `emergent` to define graph object types for EPF artifacts (NorthStar, Persona, Feature, etc.)? This would enable schema-validated entity storage and LLM extraction of EPF concepts from documents.
- What is the right granularity for `emergent` graph sync — sync entire EPF instances as a graph, or sync individual artifacts on demand?
- Should the EPF cloud server expose an A2A Agent Card for discovery by other agents in the ecosystem? If so, what skills should it advertise?
