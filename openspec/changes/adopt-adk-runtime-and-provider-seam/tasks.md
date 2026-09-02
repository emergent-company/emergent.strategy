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
- [x] Add `google.golang.org/adk/v2` — **v2.2.0, which requires Go 1.26.5, not the ">= 1.25" this design assumed.** Only v2.0.0 still accepts 1.25; v2.1.0+ moved the floor.
- [x] **Toolchain bump:** `go.work` 1.26.1 → 1.26.5 and strategy-server `go.mod` → 1.26.5. epf-cli's own `go.mod` stays at 1.25.1 (frozen, untouched).
- [x] **Insulated epf-cli CI with `GOWORK: "off"`.** Verified that the workspace floor otherwise breaks `apps/epf-cli` under `GOTOOLCHAIN=local`; `GOWORK=off` also matches how epf-cli is actually consumed (standalone module). strategy-server cannot simply leave the workspace — it imports `epf-cli/pkg/decompose` via a `replace`.
- [x] Chose v2.2.0 over the zero-bump v2.0.0 deliberately: v2.2.0 carries ~300 changed lines in `workflow/scheduler.go` and `session/session.go`, the exact subsystems Part B's restart-resume exit gate depends on.
- [x] New `internal/adk/` package.
- [x] `provider_model.go`: wrap `llm.Provider` as ADK `model.LLM`, adapting the non-streaming `ChatWithFormat` to a single-yield `GenerateContent`.
- [x] **Model registry not used.** It exists only in v2.2.0 (`model.Register`), but `llmagent.Config.Model` is a plain `model.LLM` field, and exactly one provider is configured at a time — regex name-routing solves a problem we do not have. The spec's actual requirement (ADK nodes use the configured provider with the same classified errors) is met by direct injection.
- [x] Translation covered by tests (17 cases): genai `model` role → `assistant`, system instruction hoisted to a `system` message, multi-part concatenation, nil/empty content skipping, `application/json` → `llm.FormatJSON`, token/usage mapping, and single-complete-turn semantics under both `stream` values.
- [x] **Classified errors propagate unwrapped**, so `llm.IsRetryable` / `IsAccessDenied` keep working from inside ADK nodes — pinned by a test, since wrapping here would silently turn a rate-limit into a permanent failure.

### B2. Session persistence
- [x] `session_store.go` + `session_types.go`: bun/Postgres-backed ADK v2 `session.Service`.
- [x] **Chose bun over ADK's built-in store.** ADK ships `session/database`, but it is GORM-based and self-migrating — adopting it would add a second ORM, a second migration system, and a second connection pool, against the constitution.
- [x] Migration `034_adk_sessions.sql` (goose): `adk_sessions`, `adk_session_events`, `adk_app_states`, `adk_user_states`, with cascade delete and a replay index.
- [x] Three-way state scoping implemented per ADK semantics: `app:`/`user:` prefixes stripped on write and routed to shared tables, re-applied when the merged view is read; `temp:` keys never persisted.
- [x] Events persisted as whole JSONB documents rather than GORM's ~20 decomposed columns — nothing queries an individual event field. `session_event_json_test.go` guards the lossless round-trip this depends on, so an ADK upgrade that breaks it fails loudly instead of corrupting resumed runs.
- [x] **Validated against ADK's own conformance suite** (`sessiontestsuite.RunServiceTests`), not hand-written expectations. This caught an undocumented semantic on the first run: an empty `UserID` in `ListRequest` means "all users of this app", not "the user whose id is the empty string". Note the in-house emergent `bunsession` precedent this design referenced has a placeholder test asserting `true` — it is effectively unvalidated, so it was not used as a correctness model.
- [x] Restart durability proven directly: `TestSessionStore_SurvivesProcessRestart` discards the in-memory view, re-reads through a fresh store, and asserts state, the pause marker, and the replay log survive while `temp:` state does not.
- [x] Event ordering and both read filters (`NumRecentEvents`, `After`) covered — `NumRecentEvents` queries descending and reverses, so a missed reversal would hand ADK the stream backwards.

### B3. AIM cycle → ADK graph

- [x] **API research complete.** Read the shipped ADK v2.2.0 workflow package and both HITL examples; findings recorded in `design.md` under "Verified against the ADK v2.2.0 API". Four constraints change the plan:
  - The `RerunOnResume` HITL pattern re-runs the node body after the human answers, which would repeat each AIM step's LLM call and stage a **second mutation batch** per approval. The two-node handoff pattern is mandatory.
  - Topology is **10 nodes, not 6** — each gated step splits into work + gate.
  - Data flow breaks at every gate (the post-gate node receives the human's reply, not the gate's output), so run context must live in session state rather than node I/O.
  - Abort-on-discard has no ADK equivalent and must be re-implemented in the post-gate node.
- [x] `aim_graph.go` in `internal/adk`: work+gate node pairs, built from an **injected step list** so the package stays free of `domain/aim` imports and is testable with fakes.
- [x] Human gates → `NewRequestInputEvent` + `ErrNodeInterrupted`; the staged `AIMStepResult` rides on `RequestInput.Payload` so a reviewer UI renders the batch rather than parsing prose.
- [x] Empty batch → the gate declines to emit a `RequestInput` and passes `autoAdvanced` through (covers `adapt_foundations`).
- [x] Post-gate nodes interpret the reply and abort with `ErrCycleDiscarded`. Unparseable replies **fail closed** — guessing "committed" would apply a batch nobody approved.
- [x] Ungated steps → plain FunctionNodes (covers `align_portfolio`, `snapshot_cycle`).
- [x] 9 tests + 7 subtests, driven through the real bun session store so pause/resume crosses the database. Full suite green (37 packages), lint 0 issues.
- [x] Steps receive `AIMStepInput` (RunID, InstanceID, Params, Prior) and the graph accumulates step history, because `snapshot_cycle` recovers the calibration decision from metadata recorded several gates earlier.
- [x] **`domain/aim` exposes `CycleSteps() []Step`** in an engine-neutral shape; the legacy engine reaches them through a temporary adapter that goes away with `pkg/orchestration`. No test file was touched and all 33 AIM tests still pass — the evidence this changed shape, not behaviour.
- [ ] Concurrency key = `instance_id` (one active cycle per instance) — enforced at the engine layer, not the graph.
- [x] Adapter from `[]aim.Step` → `[]adk.AIMStep` in `internal/aimadk`, at the wiring layer so `internal/adk` keeps no `domain/aim` import. `TestSteps_RealCycleFormsAValidGraph` runs the real six-step cycle through the graph builder.

### B4d. Engine swap — scope corrected

The flag was scoped as "config switch plus wiring". A survey of consumers shows
that is wrong by a wide margin. `*orchestration.Engine` is consumed through **11
methods at ~30 call sites**, and swapping it means reproducing several things
ADK does not provide:

| Consumer surface | Why ADK does not cover it |
|---|---|
| `FindRunByBatch` | the batch↔run binding all 4 `Resume` sites depend on; ADK has no notion of our batches |
| `StepLog.Meta`, 18 keys | decoded by `buildRunPanelData` / `buildRunListRow`; **breaking it degrades the run UI silently** |
| `ErrAlreadyActive` | one-cycle-per-instance, matched with `errors.Is` in 4 places |
| `ListRuns` / `GetRun` / `ActiveRun` | run listing and status projection for 6 dashboard widgets |
| `Abort` / `Retry` | no ADK equivalent |
| raw SQL on `orchestration_runs` | `handler_versions.go:336` bypasses the engine entirely |

ADK supplies durable sessions, graph execution and HITL pause/resume. It supplies
none of the above. **Replacing the engine means building an engine**, with its own
run-metadata store, not wiring one.

- [ ] Extract an `Engine` interface from `*orchestration.Engine` (11 methods) and point consumers at it. Pure refactor, legacy satisfies it unchanged — the precondition for any swap.
- [ ] Decide the run-metadata strategy: project run records from ADK session state, or keep a dedicated table alongside. The `StepLog.Meta` contract and `FindRunByBatch` both need a home.
- [ ] `ADK_ENGINE` flag once there are two implementations to choose between. Follow the `AuthEnabled` bool pattern in `config/config.go:68`.
- [ ] Resume handler commits the reviewed batch **before** resuming. All 4 existing sites already order it that way; preserve it.

**Carrying data across a gate — verified by probe, not assumption:**

| Mechanism | Result |
|---|---|
| `agent.Context.Actions()` | **nil** inside a workflow node; dereferencing panics |
| `session.State.Set` | returns no error, then **silently discards** the write |
| emitted event with `Actions.StateDelta` | **persists** across the pause |

The middle row is the dangerous one: a cycle would keep running and snapshot the wrong decision with nothing in the logs. Work nodes are therefore emitting nodes that record their result as a state delta, pinned by `TestAIMGraph_StepHistorySurvivesGate`.

**Two findings from building it:**

- Whether a step must settle a review has to be decided at **build time** from the graph's shape. ADK hands the first node the user message that triggered the run, and it is indistinguishable by type from a reviewer's reply — a first draft that sniffed input types rejected every cycle at its first step.
- **Committing a reviewed batch stays with the caller**, performed before the run is resumed. The graph only observes the verdict. This keeps `internal/adk` free of the mutation store and leaves exactly one writer for staged batches. The resume handler in B4d must commit first, then resume.
- [ ] **Parity approach:** expose the six existing step bodies from `domain/aim` in an engine-neutral shape so both engines drive the *same* code, rather than reimplementing the steps against ADK.
- [ ] Feature flag `ADK_ENGINE` (legacy default) so both engines coexist until parity is proven.

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
