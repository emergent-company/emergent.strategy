## Context

EPF artifacts are structured YAML files validated against JSON Schemas from `epf-canonical`. They are densely interconnected: feature definitions reference value model paths via `contributes_to`, roadmap KRs target value model components, personas are linked from features and strategy formulas, and the value model itself defines the capability hierarchy. When strategy evolves — a new OKR is added, a persona changes, a value model component is restructured — multiple artifacts need coordinated updates to stay consistent.

Today, these updates are done manually with CLI validation (`epf-cli validate`). Emergent AI Strategy automates this by using headless OpenCode as an AI writing agent that understands EPF's structure through the EPF Cloud Strategy Server (MCP) and `epf-canonical` schemas.

### Architecture: Two-Layer Design

The system is designed as **two layers** to support future framework expansion:

1. **Engine layer** (framework-agnostic): OpenCode orchestration, session management, A2A protocol (formerly ACP — see migration note below), billing/metering, compute isolation. This layer knows nothing about EPF — it manages AI agent sessions that write structured files.

2. **Framework layer** (pluggable): EPF-specific context and validation. The EPF Cloud Strategy Server provides strategic context via MCP tools (personas, features, value model, roadmap). The `epf-canonical` package provides JSON Schemas for artifact validation. The `emergent` knowledge graph provides persistent storage, semantic search, and graph traversal for strategy artifacts via its REST API or MCP server. Future frameworks plug in at this layer by providing their own MCP context server and schema package.

### Stakeholders

- **Strategy teams using EPF** — write and maintain EPF artifacts with AI assistance
- **Platform operators** — provision compute, manage billing, monitor usage
- **Framework authors** (future) — plug additional structured frameworks into the engine

## Goals / Non-Goals

### Goals

- Validate that headless OpenCode can reason over and write EPF YAML artifacts using MCP-provided strategic context
- Define the two-layer architecture: framework-agnostic engine + pluggable framework layer
- Spec the EPF framework integration (MCP strategy server for context, `epf-canonical` for validation)
- Define the A2A abstraction for client-agent communication (A2A Protocol, formerly ACP — merged under Linux Foundation Aug 2025)
- Spec the subscription + overage billing model
- Define per-session compute isolation

### Non-Goals

- Building a custom AI model (uses existing Claude/Gemini via Vertex AI)
- Real-time collaborative editing (agent works asynchronously on tasks)
- Supporting non-EPF frameworks in v1 (architecture supports it, implementation is EPF-only)
- Building a full IDE (headless engine — frontends are separate)
- Generic document editing (Markdown, DOCX, etc.) — this writes EPF YAML artifacts specifically
- Competing with general-purpose document editors (Google Docs, Notion)

## Decisions

### Headless OpenCode as the agent engine

**Decision**: Use OpenCode in headless/server mode (`opencode serve`) as the core agent engine.

**Why**: OpenCode already provides file editing, terminal execution, tool use, and MCP integration. Its HTTP API supports session creation, sync/async prompts, SSE event streaming, and dynamic MCP server attachment — exactly what we need to point an agent at EPF artifacts with the strategy server as context.

Key capabilities confirmed from research:
- `POST /session` — create agent sessions
- `POST /session/:id/prompt` — sync prompt submission
- `POST /session/:id/prompt_async` — fire-and-forget with SSE streaming
- `POST /mcp` — dynamically attach MCP servers at runtime (key for plugging in EPF strategy server)
- `format: { type: "json_schema", schema: {...} }` — structured output for consistent artifact generation

**Alternatives considered**:
- Custom agent framework — too much engineering investment, reinventing proven patterns
- Claude API directly — loses the agent loop (tool use, multi-step reasoning, file editing)
- LangChain/LangGraph — Python ecosystem, doesn't integrate with existing Go infrastructure

**Open question**: OpenCode headless mode readiness for production use needs validation during the PoC. The API surface is extensive but production reliability (error handling, session lifecycle, resource cleanup) is unproven for programmatic orchestration at scale.

### A2A (Agent2Agent Protocol) for client and inter-agent communication

**Decision**: Use A2A as the protocol between frontends and the engine, and between agents in the ecosystem.

**Why**: A2A (originally Google's Agent2Agent, now Linux Foundation; IBM's ACP merged into A2A in Aug 2025) provides a standard interface for agent interactions, decoupling frontends from the specific agent engine. Key A2A capabilities:
- **Agent Cards** for discovery — agents publish JSON metadata describing their identity, skills, endpoint, and auth requirements. Other agents and clients find them without hardcoded configuration.
- **Task lifecycle** — stateful units of work with unique IDs, status tracking, streaming, and push notifications for long-running operations.
- **Multi-turn interactions** — conversational coordination between agents for complex strategy operations.
- **Transport** — HTTP-based, supports both synchronous and async (SSE streaming, push notifications).

This enables:
- Web dashboard to submit artifact writing tasks
- CLI to trigger operations
- Webhooks to initiate automated workflows
- Engine swaps without frontend changes
- **Agent-to-agent coordination** — the AI strategy agent can discover and delegate to other agents (e.g., emergent's knowledge graph agents) via A2A, not just consume MCP tools

**SDK**: Official Go SDK at `github.com/a2aproject/a2a-go`. ADK-Go (already in `emergent`) has native A2A support for both exposing and consuming A2A agents.

**ACP migration note**: Earlier versions of this spec referenced ACP (Agent Communication Protocol). ACP merged with A2A under the Linux Foundation in August 2025. All ACP capabilities (RESTful agent communication, async tasks, streaming) are subsumed by A2A. Migration from ACP to A2A is documented at the BeeAI project.

### EPF Cloud Strategy Server as the framework context provider

**Decision**: The agent connects to the EPF Cloud Strategy Server (from `add-epf-cloud-server`) as an MCP server to get strategic context.

**Why**: The strategy server already provides 50+ MCP tools for querying personas, features, value model, roadmap, competitive position, etc. By dynamically attaching it to the OpenCode session via `POST /mcp`, the agent can:
- Query existing strategy before writing new artifacts
- Validate that new artifacts align with existing OKRs and personas
- Resolve `contributes_to` paths against the live value model
- Check cross-artifact consistency

This is the **framework layer** plug point — other frameworks would provide their own MCP context server.

### `epf-canonical` schemas for artifact validation

**Decision**: Use JSON Schemas from `epf-canonical` for validating generated artifacts.

**Why**: `epf-canonical` is the single source of truth for EPF artifact structure. The agent must produce artifacts that pass schema validation. The CLI's `epf-cli validate` command already wraps these schemas. The agent can use it as a tool within OpenCode to validate its own output.

### Subscription + overage billing model

**Decision**: Subscription base with overage charges for excess usage.

**Why**: Strategy artifact writing is a recurring activity with predictable baseline usage. Subscription covers the base, overage handles burst periods (e.g., quarterly roadmap planning). This is simpler than pure token metering and aligns with how strategy work happens in practice.

### Per-session compute isolation (Cloud Run jobs, not Firecracker)

**Decision**: Use Cloud Run jobs for per-session agent isolation. No Firecracker.

**Why**: Each agent session needs filesystem access for artifact writing and tool execution. Cloud Run jobs provide:
- Ephemeral compute per session
- Clean filesystem state
- Resource limits (CPU, memory, timeout)
- No cluster management
- Native GCP integration

Firecracker adds complexity (not natively supported on GCP) without clear benefit at initial scale. If stronger isolation is needed later, it can be evaluated.

## Risks / Trade-offs

- **OpenCode headless mode maturity** -> The API surface is extensive but production readiness is unproven. Mitigation: Phase 1 (local PoC) is a hard gate — if agent quality or reliability is insufficient, stop before building infrastructure.
- **EPF artifact complexity** -> EPF artifacts have dense cross-references (value model paths, persona links, KR references). The agent may struggle with relationship integrity. Mitigation: use the strategy server MCP tools to query existing relationships, and validate output with `epf-cli validate`.
- **Schema evolution** -> `epf-canonical` schemas evolve. Agent must handle schema version changes. Mitigation: always validate against current schemas; schema version is in artifact metadata.
- **Cost model uncertainty** -> Per-session Cloud Run job costs depend on task duration and model token usage. Mitigation: implement session timeouts and token quotas; subscription base covers fixed costs.
- **Framework abstraction overhead** -> Designing the engine layer as framework-agnostic adds initial complexity. Mitigation: keep the abstraction thin — the engine only needs to manage sessions and billing; all domain logic lives in the framework layer (MCP server + schemas).
- **ACP specification stability** -> ACP has merged into A2A under the Linux Foundation (Aug 2025). A2A v1 spec is released with official Go SDK (`a2a-go`). ADK-Go provides native A2A support. Risk is now lower than when ACP was standalone. Mitigation: use the official SDK; the A2A spec is backed by Google, IBM, AWS, Microsoft, and others.

## Migration Plan

### Phase 1: Local Proof of Concept (Gate)

1. Configure OpenCode with Vertex AI model access and EPF strategy server as MCP
2. Create EPF-specific agent instruction sets (writing features, updating roadmaps, maintaining value model consistency)
3. Test artifact writing — agent writes a new feature definition given a product brief
4. Test artifact updating — agent updates dependent artifacts when a persona changes
5. Test relationship integrity — agent resolves `contributes_to` paths against the value model
6. Validate output with `epf-cli validate` — artifacts must pass schema validation
7. **Gate**: If agent quality is insufficient for EPF artifacts, stop and reassess

### Phase 2: Headless API ("The Engine")

1. Run OpenCode in headless mode (`opencode serve`)
2. Create thin A2A-compatible wrapper (Agent Card, task lifecycle, streaming)
3. Implement session lifecycle (create, prompt, stream, abort)
4. Dynamically attach EPF strategy server as MCP per session
5. Expose task submission, progress streaming, and result retrieval
6. Integration test: submit artifact writing task via API, verify valid EPF output

### Phase 3: Platform Layer

1. Implement per-session Cloud Run job isolation
2. Add subscription management and overage billing
3. Deploy orchestrator service for task routing
4. Add usage metering and reporting
5. Deploy to GCP with production monitoring
6. End-to-end test: submit artifact task, verify isolation, billing, and valid output

## Resolved Questions

### Repo location

Lives in this repo at `apps/emergent-ai-strategy/`, not a separate repo. Shares infrastructure with `apps/epf-cli/`.

### Document formats

EPF YAML artifacts validated against `epf-canonical` JSON Schemas. Not generic Markdown/YAML. The agent must understand and produce files conforming to specific artifact types: `north_star`, `feature_definition`, `personas`, `roadmap`, `value_model`, `strategy_formula`, `insight_analyses`, etc.

### Dependency tracking

Uses EPF's existing relationship model:
- `contributes_to` paths (features -> value model components)
- KR references (roadmap key results -> value model)
- Persona links (features -> personas, strategy formula -> personas)
- Value model hierarchy (L0 tracks -> L1 pillars -> L2 components -> L3 sub-components)

Not frontmatter-based dependency tracking.

### Pricing model

Subscription + overage. Base subscription covers a monthly artifact operation quota. Overage charges per additional operation beyond the quota.

### PoC scope

Phase 1 (local PoC) stays in this change as a hard gate. Not split into a separate openspec change.

## Open Questions

- Is OpenCode's headless mode reliable enough for production programmatic orchestration? (Validated during Phase 1 PoC)
- What are the right agent instruction patterns for EPF artifact writing? (Discovered during Phase 1)
- How should the agent handle conflicting strategic context (e.g., artifact references a deprecated persona)? (Design during Phase 2)

## Architectural Context: Relationship to Other Changes

This change sits at the top of a dependency chain with two other active changes, and integrates with the `emergent` knowledge graph platform as a tool.

### Protocol stack (from `add-aim-recalibration-engine` Decision #11)

```
MCP  (Agent-to-Tool)   — EPF CLI tools, emergent MCP tools
A2A  (Agent-to-Agent)  — coordination between EPF agent, emergent agents
ADK  (Agent framework) — already in emergent (ADK-Go), native A2A support
```

The AI strategy agent uses **MCP** to access tools (EPF strategy server, AIM write-back commands, `epf-cli validate`) and **A2A** to coordinate with other agents in the ecosystem (e.g., emergent's extraction agents, future monitoring agents).

### Dependency: `add-epf-cloud-server`

The cloud server provides the MCP-over-HTTP endpoint that the AI agent connects to for strategic context. Without it, the agent can only run locally with `epf-cli serve` over stdio. The cloud server enables:
- Remote agent sessions connecting to strategy context
- GitHub-sourced EPF instances (no local clones needed)
- Cloud Run hosting for the MCP server
- Future: A2A Agent Card for discovery by this agent

### Upstream: `add-aim-recalibration-engine`

The AIM recalibration engine (Phases 1-2 shipped as v0.18.1) provides the MCP write-back tools that the agent uses for autonomous strategy operations:

| AIM MCP Tool | Agent uses it for |
|---|---|
| `epf_aim_write_assessment` | Fill assessment report from collected data |
| `epf_aim_write_calibration` | Draft calibration memo with recommendation |
| `epf_aim_recalibrate` | Generate and apply READY artifact changesets |
| `epf_aim_generate_src` | Run Strategic Reality Check before calibration |
| `epf_aim_check_triggers` | Evaluate whether an AIM session is needed |
| `epf_aim_health` | Quick health diagnostic before full assessment |
| `epf_aim_collect` | Collect metrics from external systems (Phase 3 CLI) |

These tools are already built and available in the CLI. The agent doesn't need to implement any AIM logic — it orchestrates existing tools.

### Tool: `emergent` knowledge graph platform

The `emergent` platform (separately developed in `emergent-company/emergent`) provides the knowledge graph capabilities the agent can use for persistent strategy storage and rich analysis:

| Capability | How the agent uses it | Access via |
|---|---|---|
| **Schemaless entity storage** | Store EPF artifacts as typed graph objects with JSONB properties | REST API `/api/graph/objects` or MCP |
| **Graph relationships** | Model Feature→Persona, Feature→NorthStar, KR→ValueModel links | REST API `/api/graph/relationships` |
| **Vector similarity search** | Find strategically related artifacts ("what's similar to this feature?") | REST API `/api/graph/objects/vector-search` |
| **Hybrid search** | FTS + vector fusion for semantic strategy queries | REST API `/api/graph/search` |
| **Graph traversal** | Walk alignment chains (Feature → Persona → NorthStar) to check consistency | REST API `/api/graph/traverse` |
| **Branching** | "What-if" strategy scenarios without modifying production graph | REST API `/api/graph/branches` |
| **Template Packs** | Define EPF object type schemas for the knowledge graph | REST API `/api/template-packs` |
| **LLM extraction** | Extract EPF concepts from unstructured documents using template pack schemas | REST API extraction pipeline |

The agent accesses `emergent` via its REST API, Go SDK (`apps/server-go/pkg/sdk/`), or MCP server (`/api/mcp`). `emergent` is a **tool, not a dependency** — the agent works without it (using local YAML), but gains persistence, semantic search, and graph analysis when connected.

### Architectural constraint from `add-aim-recalibration-engine` Decision #9

The EPF CLI is a stateless analysis engine. This agent does not write directly to YAML files — it uses AIM MCP tools for write operations and `epf-cli validate` for validation. The CLI's Go packages can be imported as a library if the agent needs direct access, but the primary interface is MCP.

### Architectural constraint from `add-aim-recalibration-engine` Decision #11

Cross-system coordination uses open protocols (MCP, A2A, REST API) — not shared databases or mandatory Go package imports. The deployment topology for all components is deferred to the last responsible moment. The `emergent` platform is actively co-developed and can be extended with new capabilities as needed by this agent, but the integration remains protocol-based to preserve independent development and deployment.
