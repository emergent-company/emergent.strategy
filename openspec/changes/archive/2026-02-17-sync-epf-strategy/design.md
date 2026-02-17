## Context

The EPF strategy instance (`emergent-epf`) was initialized on Feb 15, 2026 with a comprehensive set of artifacts. However, the artifacts were written based on aspirational plans (Temporal-based workflow engine, multi-tenant enterprise deployment) rather than the actual implementation path that has materialized. Meanwhile, the `emergent` monorepo has undergone rapid development (v0.1.0 → v0.9.4 in 10 days) and a new product (Diane) has shipped entirely outside the EPF tracking system.

Critically, the product identity has evolved: what was called "Emergent Core" is now understood as **Emergent Memory** — a specialized reasoning node focused on memory operations. The architectural philosophy is that every module in the Emergent ecosystem — including Memory — is an autonomous reasoning node with its own bounded context. Memory reasons about *how to optimally store, structure, index, and retrieve knowledge* (graph structure optimization, embedding strategies, entity resolution, chunking policies). Other products reason about their *domain tasks* (EPF CLI about validation, Diane about personal assistance, AI Strategy about artifact writing). At a higher level, cross-platform reasoning is handled by coordinated multi-specialist AI agents that compose capabilities from across the network — the "Emergent Brain." Memory is the shared knowledge substrate; bounded-context reasoning is everywhere; cross-platform reasoning orchestrates the whole.

### Constraints
- All changes go to `emergent-company/emergent-epf` (private repo), consumed as a git submodule
- Must pass `epf-cli validate` and `epf-cli health` after all changes
- Feature definitions must have exactly 4 personas, 200+ char narratives, 30+ char context descriptions
- Schema validation is strict — all enum values, ID patterns, and path references must be valid
- Changes should be made in the submodule directory (`docs/EPF/_instances/emergent/`) and pushed to `emergent-epf`
- Product rename (Core → Memory) creates cascading path changes across all artifacts

### Stakeholders
- Founder/CEO (sole operator) — primary consumer of EPF strategy data
- AI agents — consume EPF via MCP tools for strategic context in development

## Goals / Non-Goals

### Goals
- Align EPF strategy artifacts with actual organizational state across all 7 repos
- Rename Emergent Core → Emergent Memory and refocus value model to pure memory capabilities
- Rewrite EPF-Runtime value model to reflect cloud server + AI strategy path (not Temporal)
- Add missing product line (Diane) to portfolio
- Move non-memory capabilities (CLI, SDK, admin UI, MCP server) to Emergent Tools — positioned as autonomous reasoning nodes, not dumb consumers
- Update capability maturity tracking to reflect shipped features
- Ensure all relationship references (contributes_to, KR targets) are valid after changes

### Non-Goals
- Rewriting the North Star or strategic vision (these remain valid)
- Changing the Strategy, Commercial, or OrgOps track value models (no evidence of drift there)
- Creating implementation specs for the cloud server or AI strategy (those exist as separate openspec changes)
- Filling in the Emergent Tools tier 2-4 roadmap (aspirational, no development started)

## Decisions

### Decision 1: Scope — Update existing artifacts vs. create new
**Decision**: Update existing artifacts where possible; create new ones only for genuinely new product lines (Diane) and new feature categories (AI Strategy Agent).
**Rationale**: Minimizes disruption and maintains artifact history. EPF FDs are meant to be stable capability categories that evolve over time, not replaced.

### Decision 2: Diane tracking depth
**Decision**: Add Diane to product portfolio with a minimal value model and ONE feature definition (fd-015). Do not create detailed roadmap KRs for Diane yet.
**Rationale**: Diane is a shipped side-project (v1.1.0) but not a core strategic product. Lightweight tracking is appropriate. Can be expanded later if Diane becomes strategic.

### Decision 3: fd-010 handling — rewrite vs. replace
**Decision**: Rewrite fd-010 to describe the EPF Cloud Strategy Server (replacing the Temporal Workflow Initiation API concept). The underlying job-to-be-done (programmatic access to EPF operations for AI agents) is the same — only the technical approach changed.
**Rationale**: The FD granularity guide says FDs should be stable capability categories. The job ("AI agents need remote programmatic access to EPF") hasn't changed; only the how (MCP over SSE vs. Temporal REST API) has changed.

### Decision 4: Emergent Core → Emergent Memory (rename + refocus)
**Decision**: Rename the "Emergent Core" product line to "Emergent Memory" and scope the value model down to pure memory capabilities: Knowledge Graph (entity/relationship storage, graph queries, batch ops, FTS, canonical IDs), Vector Search (embeddings, similarity, fusion strategies), Entity Extraction (NLP, AI-powered, Google ADK-Go), Document Processing (ingestion, chunking, embedding policies). Move CLI, SDK, admin UI, MCP server, multi-agent coordination, email service, and template packs to Emergent Tools — where they are tracked as autonomous reasoning nodes with their own bounded contexts, not as passive API consumers.
**Rationale**: The product identity has evolved. Memory is a specialized reasoning node focused on memory operations — it reasons about how to optimally store, structure, index, and retrieve knowledge (graph optimization, embedding strategies, entity resolution), but it doesn't reason about domain tasks like validation, personal assistance, or artifact writing. The tools around it are equally autonomous reasoning systems, each with their own bounded contexts and specialized AI agents. Separating Memory from Tools keeps each reasoning domain focused while allowing independent evolution. At the cross-platform level, coordinated multi-specialist agents compose these capabilities into the "Emergent Brain." The brain analogy: Memory is a specialized reasoning region focused on knowledge storage and retrieval; other regions reason about their domains; and higher-order coordination ties it all together.
**Alternatives considered**: (a) Keep "Core" name but narrow scope — rejected because the name "Core" implies everything is inside it. (b) Add all 19 domains as Core components — rejected because it bloats the memory product with tool/reasoning concerns that belong to their own bounded contexts.

### Decision 5: Execution order
**Decision**: Execute changes in this order:
1. Value models first (they define the paths other artifacts reference)
2. Product portfolio (renames Core → Memory, adds Diane, updates versions)
3. Feature definitions (reference value model paths — all `contributes_to` paths must be updated for rename)
4. Roadmap recipe (references FD capabilities and value model paths)
5. Validate everything
**Rationale**: Value model paths are referenced by FDs and KRs. Changing them first ensures we can validate incrementally. The rename makes this especially important — every `contributes_to` path referencing "Core" must be updated to "Memory".

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|---|---|---|
| Large changeset causes cascading validation errors | High | Execute in order (value models → FDs → roadmap), validate after each file |
| Product rename creates cascading path changes | High | Update all `contributes_to` and KR target paths; run `epf-cli validate-relationships` after all changes |
| Rewriting fd-010 loses useful future-looking design | Low | The Temporal design was never implemented; no loss of actual value |
| Adding Diane dilutes strategic focus | Low | Minimal tracking (1 FD, lightweight value model); can be removed later |
| Memory scope boundary unclear for some domains | Medium | Use clear heuristic: if it reasons about knowledge storage/retrieval/indexing, it's Memory; if it reasons about presenting/orchestrating/transforming for users, it's Tools |
| Maturity tracking may be inaccurate | Medium | Use commit history and E2E test counts as evidence; mark uncertain items as "emerging" not "proven" |

## Open Questions

None — all decisions have been made based on the assessment. The user should review the proposal before execution.
