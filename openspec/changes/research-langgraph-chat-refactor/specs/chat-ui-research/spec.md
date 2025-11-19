# Chat UI Research

**Capability:** `chat-ui-research`  
**Type:** Research (Exploratory)  
**Change:** `research-langgraph-chat-refactor`

## Overview

This research spec explores **LangChain Generative UI with LangGraph** as an alternative to the current custom React chat implementation. LangChain's Generative UI allows LangGraph nodes to render custom React components (using DaisyUI) alongside AI responses, providing rich, interactive chat experiences.

The goal is to determine feasibility, effort, and trade-offs before committing to a full refactor.

**Key Discovery:** LangChain Generative UI is not a separate product but a built-in feature of LangGraph that:

- Lets you define React components alongside graph code
- Supports Tailwind CSS 4.x and DaisyUI out of the box
- Uses `useStream()` React hook for seamless integration with existing React apps
- Bundles and serves UI components via LangGraph Server (Agent Server)

**Note:** This is not an implementation spec. It documents research requirements and success criteria for evaluating this architecture.

## ADDED Requirements

### Requirement: LangGraph Server Deployment Feasibility (REQ-CUI-R001)

The research MUST validate that LangGraph Server (Agent Server) can be deployed alongside our existing infrastructure.

#### Scenario: Deploy LangGraph Server Locally

**Given** a local development environment with Docker, Node.js, and PostgreSQL  
**When** the team sets up LangGraph Server following official documentation  
**Then** a working LangGraph Server instance launches successfully  
**And** the server is accessible via HTTP at a local URL  
**And** UI components are bundled and served correctly  
**And** the deployment approach (standalone Docker vs embedded) is documented

**Acceptance Criteria:**

- LangGraph Server runs locally without errors
- Can configure graphs in `langgraph.json`
- Can bundle React UI components from `ui.tsx` files
- Documentation exists for setup steps and configuration
- Deployment model recommendation is documented in `design.md`

---

### Requirement: React UI Components with DaisyUI (REQ-CUI-R002)

The research MUST validate that custom React components styled with DaisyUI can be used for UI rendering in LangGraph.

#### Scenario: Render DaisyUI-Styled Document Component

**Given** a React component using DaisyUI (Card, Badge, Button)  
**And** the component is defined in `src/agent/ui.tsx`  
**And** Tailwind CSS is imported: `@import "tailwindcss";`  
**When** a LangGraph node pushes a UI message with this component  
**Then** the component renders in the React app via `LoadExternalComponent`  
**And** DaisyUI styling is preserved (colors, spacing, typography)  
**And** the component is visually consistent with existing admin app

**Acceptance Criteria:**

- DaisyUI components render correctly in shadow DOM
- Tailwind utility classes and DaisyUI theme work as expected
- Can demonstrate at least one custom object type (document with citations)
- Styling approach is documented with examples

---

### Requirement: Database Tool Integration (REQ-CUI-R003)

The research MUST validate that LangGraph nodes can query our database/graph and push structured results as UI messages.

#### Scenario: Query Documents and Render Results

**Given** a LangGraph node configured to search documents  
**And** the node calls our NestJS API or database directly  
**When** a user asks "Find documents about authentication"  
**Then** the node executes a semantic search query  
**And** receives structured document results with citations  
**And** pushes a UI message with document components  
**And** the React app renders document cards with title, preview, and citations

**Acceptance Criteria:**

- LangGraph node successfully queries database (via API or direct access)
- Structured data flows from database → LangGraph → React UI
- At least one tool integration is demonstrated (document search, graph query, or schema access)
- Tool interface contracts are documented
- Any limitations or blockers are documented

---

### Requirement: Custom Object Rendering (REQ-CUI-R004 - formerly R003)

The research MUST validate that complex objects (documents with citations, graph nodes with relationships) can be rendered in a user-friendly format.

#### Scenario: Render Document with Citations and Graph Object

**Given** a LangGraph node returns a document object with embedded citations  
**And** a graph object with relationships  
**When** the node pushes UI messages for both objects  
**Then** the document is displayed with title, preview, metadata, and expandable citations  
**And** the graph object is displayed with properties and relationship links  
**And** both objects are styled consistently with DaisyUI

**Acceptance Criteria:**

- At least two custom object types render correctly (document + citation, graph object)
- Rendering is visually acceptable (not just raw JSON)
- Complex nested data structures are handled (citations within documents, relationships within objects)
- Approach for rendering multiple object types is documented

---

### Requirement: Authentication Integration (REQ-CUI-R005 - formerly R004)

The research MUST validate that user authentication can be maintained between the React app, LangGraph Server, and database.

#### Scenario: Authenticate User via JWT in Graph Config

**Given** a user logs in via Zitadel OAuth and receives a JWT token  
**When** the React app calls `useStream()` with the JWT in config.configurable  
**Then** LangGraph Server receives the token  
**And** LangGraph nodes extract and validate the JWT  
**And** user/org/project context is applied to database queries  
**And** unauthorized users cannot access other users' data

**Acceptance Criteria:**

- JWT token successfully propagates from React app → LangGraph Server → Graph nodes
- User identity is correctly extracted in graph nodes
- Org/project isolation is enforced (row-level security or filtering)
- Unauthorized requests are rejected with appropriate errors
- Authentication flow is documented with code examples

---

### Requirement: useStream() Hook Integration (REQ-CUI-R006 - new)

The research MUST validate that the `useStream()` React hook can be integrated into the existing admin app.

#### Scenario: Integrate useStream() into Admin Chat Page

**Given** the existing React admin app at `apps/admin/src`  
**When** the team adds `@langchain/langgraph-sdk` dependency  
**And** replaces custom SSE logic with `useStream()` hook  
**Then** the hook handles message streaming, state management, and loading states  
**And** chat functionality works identically to current implementation  
**And** integration is simpler than current custom SSE code

**Acceptance Criteria:**

- `useStream()` hook successfully replaces custom chat state logic
- Streaming works correctly (tokens, citations, objects)
- Loading states, errors, and interrupts are handled
- Integration complexity is lower than current custom implementation
- Code examples are documented

---

### Requirement: Alternative Framework Evaluation (REQ-CUI-R007 - formerly R005)

The research MUST evaluate whether LangChain Generative UI is the best fit compared to alternatives.

#### Scenario: Compare LangChain Generative UI with Alternatives

**Given** research time for evaluating alternatives  
**When** the team reviews documentation and capabilities for:

- **LangChain Generative UI** (primary candidate)
- Vercel AI SDK (RSC-based generative UI)
- Custom React (stay with current approach)  
  **Then** a comparison matrix is created documenting:
- Deployment complexity
- UI customization options (DaisyUI support)
- Tool integration approach
- Learning curve
- Pros and cons

**Acceptance Criteria:**

- Comparison matrix includes at least 3 approaches
- Each approach has documented pros/cons
- A recommendation is made with justification
- If LangChain Generative UI is not the best option, the recommended alternative is specified

---

### Requirement: Migration Effort Estimation (REQ-CUI-R008 - formerly R006)

The research MUST provide a realistic estimate of the effort required to migrate from the current chat architecture to LangChain Generative UI.

#### Scenario: Estimate Migration Tasks and Timeline

**Given** the research findings from REQ-CUI-R001 through REQ-CUI-R007  
**When** the team analyzes migration requirements  
**Then** a detailed task breakdown is created including:

- LangGraph Server setup and deployment (Docker, PostgreSQL, Redis)
- Graph node conversion from current ChatService/ChatGenerationService
- UI component migration (React → LangGraph UI components with DaisyUI)
- Database tool integration (via NestJS API or direct access)
- Authentication integration (Zitadel JWT)
- Data migration (conversations, messages from existing tables)
- Testing and validation  
  **And** each task has an effort estimate (hours or days)  
  **And** dependencies and risks are identified

**Acceptance Criteria:**

- Complete task breakdown exists in `tasks.md` (implementation version)
- Each task has effort estimate (optimistic, realistic, pessimistic)
- Total timeline estimate is provided
- High-risk tasks are flagged with mitigation strategies
- Comparison with "improve current architecture" baseline is documented

---

### Requirement: Architecture Decision Documentation (REQ-CUI-R009 - formerly R007)

The research MUST document a clear architectural recommendation with justification and next steps.

#### Scenario: Document Recommendation

**Given** completed research and prototyping  
**When** the team synthesizes findings  
**Then** a recommendation is documented in `design.md` with one of:

- **Proceed with LangChain Generative UI:** Full migration to LangGraph Server
- **Stay with current:** Improve existing React + NestJS chat architecture
- **Hybrid approach:** Use LangGraph for orchestration, keep React UI  
  **And** the recommendation includes:
- Clear justification based on research data
- Trade-offs analysis (benefits vs costs)
- Prerequisites and dependencies (PostgreSQL, Redis, Docker)
- Timeline and resource requirements

**Acceptance Criteria:**

- Recommendation is clearly stated in `design.md` with rationale
- Justification is backed by prototype findings
- Trade-offs are objectively analyzed (not biased)
- Next steps are actionable (follow-up change IDs or specific tasks)
- Architecture diagrams illustrate the proposed solution

---

## Out of Scope (Explicitly)

This research does NOT include:

- ❌ Full implementation of chat refactor
- ❌ Production deployment configuration for LangGraph Server
- ❌ Data migration scripts for conversations/messages
- ❌ Deprecation of existing chat functionality
- ❌ Performance benchmarking or load testing
- ❌ Security audit of LangGraph Server
- ❌ Multi-agent orchestration patterns (future research)

These items would be addressed in follow-up implementation changes if the research recommends proceeding.

---

## Dependencies

- LangChain Generative UI documentation: https://docs.langchain.com/langsmith/generative-ui-react
- LangGraph Server documentation: https://docs.langchain.com/langsmith/agent-server
- `@langchain/langgraph-sdk` npm package for React integration
- `useStream()` hook documentation: https://docs.langchain.com/langsmith/use-stream-react
- Local development environment with Docker support
- Existing chat implementation for comparison (`apps/server/src/modules/chat/`, `apps/admin/src/pages/admin/chat/`)

---

## Success Criteria

This research is successful if:

1. ✅ Can deploy LangGraph Server locally and configure graphs
2. ✅ Can use DaisyUI-styled React components for UI rendering
3. ✅ Can query database/graph from LangGraph nodes
4. ✅ Can integrate `useStream()` hook into existing React admin app
5. ✅ Can prove authentication (Zitadel JWT) works with LangGraph Server
6. ✅ Have documented architecture with diagrams in `design.md`
7. ✅ Have clear recommendation (proceed/stay/hybrid) with justification
8. ✅ Have effort estimates for follow-up implementation (if proceeding)

---

## Related Specifications

- `mcp-integration`: Current MCP server implementation (may coexist or be replaced)
- (Future) `chat-architecture`: If refactor proceeds, new spec for LangGraph-based chat
- (Future) `langgraph-deployment`: If refactor proceeds, deployment configuration spec

---

## Notes

- This is a time-boxed research effort (9-14 days estimated)
- Focus on answering feasibility questions, not building production-ready code
- Prototype quality should be "proof of concept" level
- Document all decisions, blockers, and workarounds for future reference
- If research reveals showstopper blockers, it's acceptable to recommend staying with current architecture
- DaisyUI styling support is a key requirement - must verify compatibility with shadow DOM rendering
