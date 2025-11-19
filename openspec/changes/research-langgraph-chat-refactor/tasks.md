# Research Tasks: LangGraph UI Chat Refactor

This document outlines the ordered tasks for researching the feasibility of refactoring our chat functionality to use LangGraph UI with MCP integration.

## Phase 1: Documentation & Discovery (Research)

- [ ] **Task 1.1:** Review LangGraph UI official documentation

  - Understand deployment models (standalone, embedded, Docker)
  - Document configuration options and customization points
  - Identify authentication/authorization integration patterns
  - Note licensing and cost structure

- [ ] **Task 1.2:** Survey alternative chat UI frameworks

  - Research Vercel AI SDK UI components
  - Research Chainlit framework
  - Research LangServe UI
  - Research OpenAI-style chat UI libraries
  - Document pros/cons comparison matrix

- [ ] **Task 1.3:** Study MCP tool design patterns

  - Review MCP protocol specification for complex data types
  - Find examples of MCP servers exposing database operations
  - Document best practices for multi-tenant MCP tool access
  - Understand MCP authentication/authorization models

- [ ] **Task 1.4:** Analyze existing chat architecture
  - Map current chat data flow (frontend → API → LangChain → database)
  - Document existing MCP integration (mcp-client.service, tools)
  - List all custom chat features (citations, graph objects, streaming)
  - Identify technical debt and pain points

## Phase 2: Proof of Concept (Prototype)

- [ ] **Task 2.1:** Set up LangGraph UI development environment

  - Create new Nx app or separate workspace (`apps/chat-langgraph` or separate repo)
  - Install LangGraph UI dependencies and CLI tools
  - Configure basic deployment (local dev server)
  - Verify it runs and displays default UI

- [ ] **Task 2.2:** Build MCP server for database access

  - Design MCP tool interface for document search (semantic + lexical)
  - Implement MCP tool that queries PostgreSQL via existing services
  - Test tool invocation from command line or MCP inspector
  - Document tool schema and parameters

- [ ] **Task 2.3:** Integrate LangGraph UI with MCP server

  - Configure LangGraph UI to connect to local MCP server
  - Test tool calling from LangGraph UI chat interface
  - Verify data flows correctly (user input → MCP → database → response)
  - Document integration steps and configuration

- [ ] **Task 2.4:** Implement custom object rendering

  - Design JSON schema for document object with citations
  - Extend LangGraph UI to render custom object type
  - Test rendering with sample documents from database
  - Document rendering approach (React components? Template system?)

- [ ] **Task 2.5:** Prototype authentication flow
  - Research LangGraph UI authentication extension points
  - Design JWT token propagation from UI → MCP tools
  - Implement proof-of-concept auth middleware
  - Test with valid and invalid tokens

## Phase 3: Architecture Design (Documentation)

- [ ] **Task 3.1:** Document proposed system architecture

  - Create architecture diagrams (component, sequence, deployment)
  - Define service boundaries and responsibilities
  - Document data flow for key scenarios (search, chat, object rendering)
  - Add to `design.md`

- [ ] **Task 3.2:** Design MCP tool interface contracts

  - Define complete set of MCP tools needed (documents, graph, search, etc.)
  - Specify input/output schemas for each tool
  - Document error handling and edge cases
  - Include in `design.md`

- [ ] **Task 3.3:** Design authentication/authorization strategy

  - Document how user identity flows through system
  - Design org/project context propagation via MCP
  - Specify token refresh and session management
  - Address multi-tenancy isolation concerns

- [ ] **Task 3.4:** Define deployment architecture
  - Document how chat app fits into monorepo vs separate repo
  - Specify Docker containerization approach
  - Design routing/proxying for development and production
  - Document scaling considerations (separate instances, load balancing)

## Phase 4: Feasibility Assessment (Analysis)

- [ ] **Task 4.1:** Evaluate migration effort

  - Estimate effort for each component (UI, MCP tools, deployment)
  - Identify high-risk or complex migration areas
  - Document assumptions and unknowns
  - Compare against "stay with current" baseline

- [ ] **Task 4.2:** Identify technical blockers

  - List any capabilities not supported by LangGraph UI
  - Note MCP limitations or gaps
  - Document workarounds or alternatives
  - Assess blocker severity (showstopper, major, minor)

- [ ] **Task 4.3:** Compare against current architecture

  - List benefits of new architecture (features, maintainability, scalability)
  - List drawbacks or trade-offs (complexity, deployment, learning curve)
  - Quantify improvements (if possible: performance, bundle size, DX)
  - Make recommendation: proceed, stay, or hybrid

- [ ] **Task 4.4:** Define migration path
  - Design incremental rollout strategy (parallel systems, feature flags)
  - Plan data migration for conversations/messages
  - Document rollback procedures
  - Estimate timeline and resources required

## Phase 5: Recommendations & Next Steps (Delivery)

- [ ] **Task 5.1:** Write research findings document

  - Summarize key discoveries from prototype
  - Document all answered and unanswered questions
  - Include screenshots/demos from prototype
  - Add to `design.md` or separate research report

- [ ] **Task 5.2:** Present architecture recommendations

  - Prepare decision matrix (stay, refactor, hybrid)
  - Document recommended path with justification
  - Include effort estimates and timeline
  - List prerequisites and dependencies

- [ ] **Task 5.3:** Outline follow-up change proposals

  - If proceeding: Create change-id for full migration (e.g., `migrate-to-langgraph-chat`)
  - If hybrid: Create change-ids for incremental improvements
  - If staying: Create change-ids for fixing current pain points
  - Specify relationship to existing specs

- [ ] **Task 5.4:** Update project.md if needed
  - If new architecture is chosen, update tech stack documentation
  - Add LangGraph UI to dependencies
  - Document new deployment model
  - Update architecture patterns section

## Validation Steps

After completing research phases:

- [ ] Can deploy LangGraph UI and connect to backend via MCP (Task 2.3)
- [ ] Can render at least one custom object type (Task 2.4)
- [ ] Can authenticate users across MCP boundary (Task 2.5)
- [ ] Have documented architecture with diagrams (Task 3.1)
- [ ] Have clear recommendation with justification (Task 5.2)

## Dependencies

- Requires stable network connection for documentation access
- May require trial/evaluation licenses for paid tools
- Requires local development environment with Docker support
- May need feedback from team on architecture preferences

## Estimated Effort

- **Phase 1 (Research):** 2-3 days
- **Phase 2 (Prototype):** 3-4 days
- **Phase 3 (Design):** 2-3 days
- **Phase 4 (Assessment):** 1-2 days
- **Phase 5 (Delivery):** 1-2 days
- **Total:** 9-14 days (allowing for unknowns and iterations)

## Notes

- This is a research-focused task list - implementation details may change based on findings
- Some tasks may be skipped if early research reveals blockers
- Prototype quality is "proof of concept" not "production ready"
- Focus on answering feasibility questions rather than polishing code
- Document all decisions and trade-offs for future reference
