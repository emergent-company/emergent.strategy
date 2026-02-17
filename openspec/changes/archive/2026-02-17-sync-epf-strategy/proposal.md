# Change: Sync EPF Strategy Instance with Organizational Reality

## Why

The Emergent EPF strategy instance (`emergent-company/emergent-epf`) has diverged significantly from the actual state of development across the organization. The `emergent` monorepo has shipped to v0.9.4 with a fully ported Go backend (609 E2E tests), knowledge graph, vector search, entity extraction, and document processing — but the EPF value model still calls this "Emergent Core" with only 2 components, when the product identity has evolved to **Emergent Memory**: a pure memory/knowledge layer that AI agents use alongside other specialized data stores.

The architectural philosophy has crystallized: every module in the Emergent ecosystem — including Memory itself — is an **autonomous reasoning node** with its own bounded context, specialized AI agents, algorithms, and reasoning loops. Memory reasons about *memory operations* (how to optimally store, structure, index, and retrieve knowledge), while other products reason about their *domain tasks*. At a higher level, cross-platform reasoning is handled by coordinated multi-specialist AI agents that compose capabilities from across the full network. This creates a brain-like architecture where specialized reasoning regions share a common knowledge substrate.

Additionally, two major new initiatives (`add-epf-cloud-server` and `add-emergent-ai-strategy`) have been planned in this repo but the EPF-Runtime value model still describes the now-abandoned Temporal-based workflow engine. A new product (Diane) has shipped at v1.1.0 with no EPF representation at all.

## What Changes

### Org-Wide Assessment Summary

| Repo | EPF Status | Reality | Gap |
|---|---|---|---|
| `emergent` (Memory) | Value model named "Emergent Core" with 2 components | v0.9.4, Go server: knowledge graph, vector search, entity extraction, document processing. Now positioned as **Emergent Memory** — pure memory layer | **Critical**: Wrong name, wrong scope, severely underrepresents shipped capabilities |
| `emergent.strategy` (EPF-Runtime) | Value model has 4 layers, Layers 2-4 describe Temporal-based server + web dashboard | epf-cli v0.13.0 shipped, cloud server + AI strategy planned (not Temporal) | **Critical**: Layers 2-4 describe wrong architecture |
| `epf-canonical` | Referenced in EPF-Runtime value model | v2.12.4, active development, schemas/templates/wizards | **Minor**: Adequately represented |
| `emergent-epf` | Self-referential (the EPF instance itself) | 2 commits, just initialized | **N/A** |
| `diane` | Not mentioned anywhere in EPF | v1.1.0 shipped, 69+ MCP tools, Go binary | **Critical**: Entire product line missing |
| `homebrew-tap` | Not mentioned in EPF | Working, serves epf-cli distribution | **Minor**: Distribution channel not tracked |
| `homebrew-emergent` | Not mentioned in EPF | Working, serves emergent-cli distribution | **Minor**: Distribution channel not tracked |

### Architectural Principle: Bounded-Context Reasoning Everywhere

Every module in the Emergent ecosystem — including Memory itself — is an **autonomous reasoning node** with its own bounded context, specialized AI agents, algorithms, and reasoning loops. Each can dynamically extend and improve its own capabilities within its domain:

- **Emergent Memory** reasons about *memory operations*: how to optimally structure knowledge for different assets and artifacts, how to organize the graph for retrieval, how to optimize embedding strategies, how to resolve entity conflicts. It is not a "dumb database" — it actively reasons about storage, indexing, and retrieval.
- **EPF CLI** reasons about validation, health checking, coverage analysis, and relationship integrity
- **Diane** reasons about personal assistant tasks, calendar optimization, smart home automation — with 69+ specialized tool implementations
- **Emergent AI Strategy** reasons about EPF artifact writing, cross-artifact consistency, and strategic alignment — with headless AI agent orchestration
- **Emergent CLI/SDK** reason about developer workflows, token management, and API interactions

At a higher level, **cross-platform reasoning** is handled by mixed specialist AI agents coordinated through reasoning orchestration — using the various capabilities of the "Emergent Brain" (the full network of modules). This creates a two-tier reasoning architecture:
1. **Bounded-context reasoning**: Each module reasons deeply within its own domain
2. **Cross-platform reasoning**: Coordinated multi-specialist agents that compose capabilities from across the network

The distinction for Memory is not "Memory doesn't reason" but rather "Memory's reasoning is about memory operations, not domain tasks." Memory reasons about *how* to store, structure, and retrieve; other modules reason about *what* to do with the knowledge.

This means the value model for Memory should be scoped to:
- **Knowledge Graph** — entity storage, relationships, graph queries, canonical IDs — with reasoning about graph structure optimization
- **Vector Search** — embeddings, similarity search, fusion strategies — with reasoning about retrieval optimization
- **Entity Extraction** — NLP, AI-powered extraction from documents — with reasoning about extraction quality
- **Document Processing** — ingestion, chunking, embedding pipelines — with reasoning about optimal chunking strategies
- **Storage & APIs** — the interfaces that expose memory capabilities

Tools and products are tracked separately under Emergent Tools or their own product lines — each as autonomous reasoning systems with their own bounded contexts that compose with Memory as the shared knowledge substrate.

### Changes Required

#### 1. EPF-Runtime Value Model Rewrite (Layers 2-4)
- **Layer 2** (Workflow Engine): Replace Temporal-based DurableExecution with EPF Cloud Strategy Server (MCP over SSE, GitHub artifact loading, Cloud Run hosting)
- **Layer 3** (Platform Services): Replace WorkspaceIsolation/ExternalIntegrations with AI Strategy Engine (OpenCode headless orchestration, EPF artifact writing, framework-agnostic engine + EPF framework layer)
- **Layer 4** (Web Interface): Replace ProductFactoryOS Dashboard with AI Strategy Platform (subscription billing, session management, multi-tenant isolation)
- Update roadmap phases 3-7 to reflect actual implementation path
- Mark new Layer 1 capabilities as active (distribution pipeline shipped, Homebrew tap working)

#### 2. Emergent Core → Emergent Memory (Rename + Refocus)
- **Rename** product line from "Emergent Core" to "Emergent Memory" across portfolio and value model
- **Scope down** to pure memory capabilities: Knowledge Graph (entity/relationship storage, graph queries, batch operations, FTS, canonical IDs), Vector Search (embeddings, similarity, 5 fusion strategies), Entity Extraction (NLP, AI-powered, Google ADK-Go), Document Processing (ingestion, chunking, embedding policies)
- **Remove** from Memory value model: CLI, SDK, admin UI, MCP server, multi-agent coordination, email service, template packs — these are tools/applications that *consume* Memory, not Memory itself
- Update maturity/active status to reflect production state (v0.9.4)

#### 3. New Product Line: Diane (Personal AI Assistant)
- Add product entry to `product_portfolio.yaml`
- Create new value model `product.diane.value_model.yaml`
- Create feature definition fd-015

#### 4. Roadmap Recipe Updates (okr-p-003 KRs)
- Rewrite kr-p-006 through kr-p-009 to match actual implementation path
- Replace Temporal 4-stage approach with: Cloud Server → AI Strategy PoC → AI Strategy Platform
- Add KRs for Emergent Memory v1.0 milestone and Diane stabilization

#### 5. Feature Definition Updates
- **fd-010** (Workflow Initiation API): Major rewrite — replace Temporal workflow orchestration with EPF Cloud Strategy Server (MCP-based, stateless)
- **fd-011** (EPF Schema Validation Service): Update server-side references from Temporal to Cloud Run, mark local validation as delivered
- **New fd-014** (AI Strategy Agent): Feature definition for the emergent-AI-strategy capability
- **New fd-015** (Diane Personal AI Assistant): Feature definition for Diane
- **fd-001 through fd-009**: Review maturity tracking and update `contributes_to` paths to use new "Memory" value model paths

#### 6. Emergent Tools Value Model Update
- Mark Emergent CLI capabilities as active (shipped in `emergent` monorepo as Go binary)
- Add Go SDK as active (shipped alongside server-go)
- Move MCP Server, admin UI, and other tool capabilities here (from former "Core")
- Update to reflect tools as **consumers** of Emergent Memory APIs

#### 7. Product Portfolio Updates
- Rename Emergent Core → Emergent Memory with updated description reflecting pure memory positioning
- Add Diane product line
- Update EPF-Runtime description (remove Temporal references)
- Update Emergent Memory version (0.1.0 → 0.9.4)
- Update Emergent Tools version and status

## Impact
- Affected EPF artifacts: 15+ files across READY/ and FIRE/ directories
- Affected repos: `emergent-epf` (direct changes), consumed by `emergent.strategy` and `emergent` via submodule
- **No code changes** — this is a strategy alignment exercise
- **Product rename**: Emergent Core → Emergent Memory (affects value model paths, FD contributes_to references, KR targets)
- Risk: Large changeset requires careful validation; rename creates cascading path changes across all artifacts referencing Core
