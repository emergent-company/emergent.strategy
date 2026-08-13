# Tasks: ADK Go 2.0 runtime + LLM Provider seam

Ordered so Part A ships independently (unblocks the Bedrock/EU contributor)
before Part B (ADK migration).

## Part A — Provider seam (ship first)

### A1. Extract the Provider interface (behaviour-preserving)
- [ ] Define `llm.Provider` (`Chat`, `ChatWithFormat`, `Ping`, `Model`) in `internal/llm`.
- [ ] Confirm existing `*llm.Client` satisfies `Provider` (no logic change).
- [ ] Change callers to depend on `llm.Provider`: `domain/skillexec`, `domain/aim`, `domain/ripple`, `ModelSelector.SelectModel` return path.
- [ ] `go build` + `task test` green (baseline unchanged). Record baseline first.

### A2. Bedrock / Anthropic-Messages provider
- [ ] Add AWS SDK v2 deps (`config`, `bedrockruntime`).
- [ ] Implement `bedrockProvider` (AWS SDK client; SigV4 + credential refresh via default chain).
- [ ] Message translation `[]ChatMessage` → Anthropic Messages (system extraction, max_tokens, anthropic_version).
- [ ] Response parse `content[]` → `ChatResult`; map usage tokens.
- [ ] JSON output: instruction-based enforcement for `ResponseFormat=json_object`.
- [ ] Error mapping AWS/Bedrock → existing `ErrorKind` (+ `Action` strings); add Anthropic envelope parser.
- [ ] Unit tests: translation, error mapping, JSON-mode (table-driven; no live AWS).

### A3. Config + wiring
- [ ] Add `LLM_AUTH_MODE=bedrock`, `LLM_BEDROCK_REGION`; validate in `config.go`.
- [ ] `buildLLMConfig` bedrock branch → returns `bedrockProvider` as `Provider`.
- [ ] `setupLLM` preflight `Ping` + `/health` live-probe cover bedrock (already interface-based — verify).
- [ ] Docs: update `AGENTS.md` LLM Provider Auth table with the bedrock mode.

### A4. Part A exit gate
- [ ] `task test` + `task lint` pass; api-key/vertex behaviour unchanged.
- [ ] Contributor verifies a live `Ping` against an EU Bedrock endpoint.

## Part B — ADK Go 2.0 runtime (after A is stable)

### B1. Dependency + adapter scaffolding
- [ ] Add `google.golang.org/adk/v2` (Go 1.26 OK).
- [ ] New `internal/adk/` package.
- [ ] `provider_model.go`: wrap `llm.Provider` as ADK `model.LLM`; register via model registry (adapt non-streaming `Chat*` → single-yield `GenerateContent`).

### B2. Session persistence
- [ ] `session_store.go`: bun/Postgres-backed ADK v2 session store (reference emergent `pkg/adk/session/bunsession`, adapt to v2 + `ReconstructRunState`).
- [ ] Migration for ADK session tables if needed (goose).

### B3. AIM cycle → ADK graph
- [ ] `aim_graph.go`: six nodes per design table.
- [ ] Human gates → ADK `RequestInput`; wire existing approve/commit HTTP action to `runner.Run(...)` resume.
- [ ] Empty adapt_foundations → auto-advance (no RequestInput).
- [ ] align_portfolio + snapshot_cycle → FunctionNodes (deterministic).
- [ ] Concurrency key = `instance_id` (one active cycle per instance).

### B4. skillexec → SingleTurn nodes
- [ ] Port `RunChunked` one-shot generation to ADK `SingleTurn` agent node; move schema constraints to ADK structured output.

### B5. Cutover + cleanup
- [ ] Feature-flag/config switch: ADK engine vs legacy `pkg/orchestration`.
- [ ] Keep `pkg/orchestration` as compiling shim during migration.
- [ ] Delete legacy engine + `pkg/orchestration/pg` in a follow-up once parity is proven.

### B6. Part B exit gate
- [ ] End-to-end AIM cycle on ADK: all six steps, all four human gates, snapshot — same external HTTP/MCP behaviour.
- [ ] Restart mid-cycle → resume works (ADK `ReconstructRunState`).
- [ ] `task test` + `task lint` pass; SSE/HTTP/MCP contracts unchanged.

## Cross-cutting
- [ ] `openspec validate adopt-adk-runtime-and-provider-seam --strict` passes.
- [ ] Record test baseline before starting; fix any regression before done.
- [ ] Do NOT introduce cross-repo shared modules in this change.
