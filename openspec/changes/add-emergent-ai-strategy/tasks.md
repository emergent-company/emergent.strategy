## 1. Local Proof of Concept — Phase 1 (Gate)

- [ ] 1.1 Configure OpenCode with Vertex AI model access and EPF strategy server as MCP
- [ ] 1.2 Create EPF-specific agent instruction sets for artifact writing operations
- [ ] 1.3 Test artifact writing — agent writes a new feature definition given a product brief
- [ ] 1.4 Test artifact updating — agent updates dependent artifacts when a persona changes
- [ ] 1.5 Test relationship integrity — agent resolves `contributes_to` paths against the value model
- [ ] 1.6 Test cross-artifact consistency — agent validates roadmap KRs against value model components
- [ ] 1.7 Validate all output with `epf-cli validate` — artifacts must pass schema validation
- [ ] 1.8 Evaluate agent quality and determine go/no-go for Phase 2
- [ ] 1.9 Document findings: effective prompt patterns, failure modes, quality benchmarks

## 2. Headless API — The Engine (Phase 2)

- [ ] 2.1 Set up `apps/emergent-ai-strategy/` project structure
- [ ] 2.2 Run OpenCode in headless mode (`opencode serve`) with programmatic session management
- [ ] 2.3 Create ACP abstraction layer (`apps/emergent-ai-strategy/acp/`)
- [ ] 2.4 Implement dynamic MCP server attachment — plug EPF strategy server into agent sessions
- [ ] 2.5 Implement task submission endpoint (submit artifact writing request with context)
- [ ] 2.6 Implement progress streaming (SSE stream of agent steps)
- [ ] 2.7 Implement result retrieval (final state of written/modified artifacts)
- [ ] 2.8 Create CLI client for testing headless API
- [ ] 2.9 Integration test: submit artifact writing task via API, verify valid EPF output

## 3. Platform Layer (Phase 3)

- [ ] 3.1 Design subscription + overage billing data model
- [ ] 3.2 Implement per-session Cloud Run job isolation
- [ ] 3.3 Implement subscription management and usage metering
- [ ] 3.4 Implement overage billing logic
- [ ] 3.5 Create task orchestrator — routes artifact tasks to isolated compute
- [ ] 3.6 Add session timeouts and token quotas
- [ ] 3.7 Deploy to GCP with production monitoring and alerting
- [ ] 3.8 End-to-end test: submit artifact task, verify isolation, billing, and valid output

## 4. Documentation

- [ ] 4.1 Architecture documentation for Emergent AI Strategy (two-layer design)
- [ ] 4.2 API documentation for ACP endpoints
- [ ] 4.3 EPF agent instruction patterns guide
- [ ] 4.4 Framework integration guide (how to plug a new framework into the engine layer)
