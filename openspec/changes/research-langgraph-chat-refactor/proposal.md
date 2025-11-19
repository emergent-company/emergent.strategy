# Research: LangGraph UI Chat Refactor

## Why

The current chat functionality is tightly integrated within the monorepo (apps/server NestJS backend + apps/admin React frontend). While functional, this architecture has several limitations:

1. **Limited UI Capabilities:** The custom React chat UI requires significant effort to add advanced features like streaming visualizations, multi-turn reasoning displays, and interactive tool outputs
2. **Tight Coupling:** Chat logic is embedded in the server module, making it difficult to iterate independently or swap out LLM orchestration patterns
3. **Manual Tool Integration:** While we have MCP tools for schema queries, the integration is custom-built with manual plumbing for tool detection, invocation, and result rendering
4. **Scalability Concerns:** As chat becomes more complex (multi-agent, tool chains, etc.), the current architecture may not scale cleanly

This research explores **LangChain's Generative UI with LangGraph** as a better foundation. LangChain provides:

- React-based generative UI that lets agents render custom components (documents, citations, graph objects)
- Built on LangGraph Server (Agent Server) with state management, persistence, and streaming
- Native support for Tailwind CSS and DaisyUI styling
- `useStream()` React hook for seamless integration with React apps
- Tool calling and streaming built into the framework

**Key Architectural Decision:** Deploy as a **separate standalone app** (not integrated into existing React admin) to enable:

- Independent scaling and deployment
- Clean separation of concerns
- Different release cycles for chat vs admin features
- Ability to share UI libraries (DaisyUI components) between apps via monorepo

**Note:** We can still share React components and DaisyUI styling between the admin app and chat app using Nx workspace configuration.

## What Changes

This is a **research-only change** that creates documentation and prototypes without modifying production code. It will:

- Research and document **LangChain Generative UI with LangGraph** architecture
- Build proof-of-concept LangGraph Server deployment as a **separate standalone application**
- Create new Nx app (`apps/chat`) with its own React frontend and LangGraph backend
- Design shared UI component library for DaisyUI components used by both admin and chat apps
- Evaluate **Redis vs PostgreSQL queue** requirements for LangGraph Server
- Test tool calling from LangGraph nodes to our database/graph services (via NestJS API)
- Document architectural decisions, trade-offs, and migration path
- Provide clear recommendation (proceed with refactor, stay with current, or hybrid)

**Key Research Question:** Does LangGraph Server require Redis, or can it use PostgreSQL for task queuing?

**No production code changes will be made during this research phase.**

## Impact

- **Affected specs:**
  - New `chat-ui-research` spec documenting research requirements
  - Related to existing `mcp-integration` spec (may replace or coexist)
- **Affected code:**
  - None (research only)
  - Prototype will create `apps/chat/` structure with frontend + backend
  - May create `libs/shared-ui/` for common DaisyUI components
  - Prototype code in `openspec/changes/research-langgraph-chat-refactor/prototype/` (not merged to main)
- **Dependencies:**
  - LangChain Generative UI documentation: https://docs.langchain.com/langsmith/generative-ui-react
  - LangGraph Server (Agent Server) for deployment
  - `@langchain/langgraph-sdk` for React integration
  - PostgreSQL for persistence (existing)
  - **Redis for task queue (TBD - need to evaluate if required or if PostgreSQL alternative exists)**
- **Breaking changes:** None (research phase)

## How It Works

### LangChain Generative UI Architecture (Separate App Deployment)

Instead of integrating into the existing admin app, we'll deploy chat as a **completely separate application**:

1. **Separate Nx App (`apps/chat`):**

   - Frontend: Next.js app with `useStream()` hook
   - Backend: LangGraph Server configuration (graphs, UI components)
   - Shared UI: Import DaisyUI components from `libs/shared-ui/`
   - Independent deployment (Docker container)

2. **Shared UI Component Library (`libs/shared-ui/`):**

   - Common DaisyUI components (DocumentCard, CitationList, GraphNode, etc.)
   - Tailwind CSS configuration
   - Both `apps/admin` and `apps/chat` import from this library
   - Ensures consistent styling across applications

3. **LangGraph Server (Agent Server):**

   - Configure graphs in `apps/chat/langgraph.json`
   - Define UI components in `apps/chat/src/agent/ui.tsx`
   - Server bundles UI components and serves them
   - Executes graph nodes with tool calling

4. **Task Queue Evaluation:**

   - **Question:** Does LangGraph Server require Redis, or can it use PostgreSQL?
   - **Current State:** We use PostgreSQL for all persistence and queuing
   - **Research Goal:** Determine if we can avoid adding Redis dependency
   - **Alternatives:** pgboss (PostgreSQL-based queue), custom PostgreSQL queue, or accept Redis

5. **Database Access:**
   - LangGraph nodes call NestJS API endpoints (authenticated with JWT)
   - NestJS handles RLS (row-level security) for org/project isolation
   - Avoids duplicating database access logic in LangGraph

### Research Phases

1. **Documentation Review (2-3 days):**

   - Study LangChain Generative UI documentation and examples
   - Review LangGraph Server (Agent Server) deployment models
   - **CRITICAL:** Research Redis requirement - can we use PostgreSQL instead?
   - Investigate pgboss or other PostgreSQL-based queue alternatives
   - Document DaisyUI integration approach (Tailwind 4.x support confirmed)

2. **Prototype Development (3-4 days):**

   - Create `apps/chat/` structure with Next.js frontend
   - Set up LangGraph Server with `langgraph.json` configuration
   - Create `libs/shared-ui/` with DaisyUI components (DocumentCard, etc.)
   - Build LangGraph node that calls NestJS API and pushes UI messages
   - Test `useStream()` hook in chat frontend
   - Test streaming UI updates and custom object rendering
   - **Evaluate Redis vs PostgreSQL queue** with actual LangGraph Server setup

3. **Architecture Design (2-3 days):**

   - Document proposed system architecture (separate chat app + LangGraph Server)
   - Design tool interface contracts (NestJS API endpoints for chat tools)
   - Define deployment strategy (Docker Compose with separate containers)
   - Specify authentication flow (JWT tokens from Zitadel)
   - **Document queue decision:** Redis (if required) or PostgreSQL alternative

4. **Feasibility Assessment (1-2 days):**

   - Estimate migration effort (new app creation, graph conversion, UI components)
   - Identify technical blockers (Redis requirement, authentication, multi-tenancy)
   - Compare against "stay with current" baseline
   - Document risks and mitigation strategies
   - **Assess operational impact of adding Redis** (if required)

5. **Recommendations (1-2 days):**
   - Synthesize findings into clear recommendation
   - Document decision rationale with architecture diagrams
   - **Include queue strategy:** Redis acceptance, PostgreSQL alternative, or blocker
   - Outline follow-up change proposals if proceeding
   - Present timeline and resource requirements

### Success Criteria

Research is successful if we can answer:

✅ Can LangGraph Server be deployed as a separate Docker container?  
✅ Can we share DaisyUI components between admin and chat apps via Nx libs?  
✅ Can LangGraph nodes query our database/graph via NestJS API endpoints?  
✅ Can authentication (Zitadel JWT) work across app boundaries?  
✅ **Can we use PostgreSQL for queuing, or is Redis mandatory?**  
✅ What is the estimated effort for full migration?  
✅ Should we proceed, stay with current, or take hybrid approach?

## Open Questions

These questions will be answered during the research:

1. **Redis Requirement (CRITICAL):** Is Redis mandatory for LangGraph Server task queue, or can we use PostgreSQL? Can pgboss or similar work?
2. **Shared UI Library:** How to structure `libs/shared-ui/` to share DaisyUI components between admin and chat apps?
3. **DaisyUI Integration:** How to ensure DaisyUI components render correctly in LangGraph's shadow DOM? Can we share Tailwind config?
4. **Authentication:** How to integrate Zitadel JWT tokens with LangGraph Server? Can we reuse existing auth middleware?
5. **Multi-Tenancy:** How to enforce org/project isolation in LangGraph nodes when calling NestJS API?
6. **Deployment Model:** Docker Compose setup with separate containers for chat app, LangGraph Server, and (possibly) Redis?
7. **Migration Strategy:** Can both chat systems run in parallel during migration? How to route users between old and new chat?
8. **Cost Implications:** If Redis is required, what are operational costs and complexity? Can we justify it?
9. **NestJS API Changes:** Do we need new endpoints for chat tools, or can we reuse existing search/graph endpoints?

## Next Steps After Approval

1. Begin Phase 1: Documentation review and framework comparison
2. Set up prototype environment (Docker, test MCP server)
3. Build proof-of-concept integration
4. Document findings in `design.md` with architecture diagrams
5. Present recommendation with effort estimates
6. If proceeding: Create follow-up change ID for full implementation

## Timeline Estimate

- **Phase 1 (Research):** 2-3 days
- **Phase 2 (Prototype):** 3-4 days
- **Phase 3 (Design):** 2-3 days
- **Phase 4 (Assessment):** 1-2 days
- **Phase 5 (Delivery):** 1-2 days
- **Total:** 9-14 days (allowing for unknowns and iterations)

**Note:** This is an exploratory research change. Findings may lead to a decision to keep the current architecture, proceed with full refactor, or implement a hybrid approach.
