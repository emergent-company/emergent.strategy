# Tasks: ADK Go 2.0 runtime + LLM Provider seam

Ordered so Part A ships independently (unblocks the Bedrock/EU contributor)
before Part B (ADK migration).

## Part A — Provider seam (ship first)

### A1. Extract the Provider interface (behaviour-preserving)
- [x] Define `llm.Provider` (`Chat`, `ChatWithFormat`, `Ping`, `Model`) in `internal/llm`.
- [x] Confirm existing `*llm.Client` satisfies `Provider` (no logic change) — compile-time assertion `var _ Provider = (*Client)(nil)`.
- [x] Change callers to depend on `llm.Provider`: `domain/ripple` (`LLMResolver`), `cmd_serve.go` (`setupLLM` return, `healthHandler` param, `skillexecLLMAdapter` field). `domain/skillexec` and `domain/aim` already depend on their own narrow interfaces (`skillexec.LLMClient`, `aim.SkillRunner`) and needed no change.
- [x] Guard the nil-interface trap: nil-check the concrete `*Client` before converting to `Provider` (a typed nil would become a non-nil interface and defeat every `provider != nil` check). Added explicit guard in the skill-executor wiring.
- [x] Tests: `provider_test.go` pins the interface surface and the nil-guard contract.
- [x] `go build` + `go test ./...` green — 35 packages pass, identical to baseline. `task lint` 0 issues.

### A2. Bedrock / Anthropic-Messages provider
- [x] Add AWS SDK v2 deps (`config`, `bedrockruntime`, `smithy-go`).
- [x] Implement `bedrockProvider` (AWS SDK client; SigV4 + credential refresh via default chain).
- [x] Message translation `[]ChatMessage` → Anthropic Messages (system hoisted to top level, `max_tokens` defaulted to 8192 since Anthropic requires it, `anthropic_version`). Consecutive same-role messages are merged to satisfy Anthropic's strict alternation rule; a leading non-user message is rejected as a non-retryable `KindBadRequest` before any network call.
- [x] Response parse `content[]` → `ChatResult` (text blocks joined, non-text blocks skipped); map usage tokens.
- [x] JSON output: instruction-based enforcement for `ResponseFormat=json_object` (Anthropic has no native `response_format`; skillexec's existing validation/repair loop remains the reliability mechanism).
- [x] Error mapping AWS/Bedrock → existing `ErrorKind` (+ `Action` strings) for all 10 typed Bedrock exceptions, plus a generic `smithy.APIError` fallback that surfaces the AWS error code.
- [x] **Credential-resolution failures classified as `KindAccessDenied`.** Found via smoke test: the SDK failing to resolve credentials produces no `smithy.APIError` (the request never leaves the client), so it was falling through to `KindUnknown` with a useless "inspect the raw error" remediation and `IsAccessDenied()==false`. Now detected structurally (absence of `smithy.APIError`) plus message markers, and reported at ERROR level with the credential sources to try.
- [x] Unit tests: translation (8 cases), error mapping (11 cases), JSON-mode, credential detection (7 cases), constructor validation, max-tokens defaulting. Table-driven, no live AWS.

### A3. Config + wiring
- [x] Add `LLM_AUTH_MODE=bedrock`, `LLM_BEDROCK_REGION`, `LLM_MAX_TOKENS`; `LLMConfigured()`/`IsBedrockLLM()` in `config.go` + tests (17 cases).
- [x] `buildLLMConfig` bedrock branch; new shared `newLLMProvider(cfg, timeout)` factory constructs the right provider for all three modes and always returns a genuinely nil `Provider` on failure.
- [x] **Skill executor wiring fixed for bedrock.** It called `llm.New()` directly, which returns nil for bedrock (no BaseURL) — autonomous skills would have silently dropped to skeleton mode. Now routes through `newLLMProvider` with the 5-minute timeout.
- [x] `setupLLM` preflight `Ping` + `/health` live-probe cover bedrock (verified by smoke test).
- [x] Docs: `AGENTS.md` LLM Provider Auth section rewritten for three modes — wire formats, the `Provider` seam, the nil-handling hazard, Bedrock entitlement/residency notes, instruction-based JSON caveat, and per-mode failure remediation.

### A4. Part A exit gate
- [x] `go test ./...` — 36 packages pass (35 baseline + new `config` tests), zero failures. `task lint` 0 issues.
- [x] api-key behaviour unchanged — verified by live server boot: `preflight ok`, `mode=api-key`, `/health` reports `llm: ok`.
- [x] bedrock mode wires correctly and degrades gracefully without credentials — verified by live server boot: `mode=bedrock`, endpoint `bedrock-runtime.eu-central-1.amazonaws.com`, classified access-denied error, server does not crash.
- [ ] Contributor verifies a live `Ping` against an EU Bedrock endpoint with real credentials. **(Blocked — requires AWS access this environment does not have.)**

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
