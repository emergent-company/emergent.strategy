# Change: Adopt ADK Go 2.0 runtime and a pluggable LLM Provider seam

## Why

strategy-server has three concentric AI layers that are currently entangled and
single-shaped:

1. **Provider (Ring 1)** — `internal/llm/client.go` speaks exactly ONE wire
   format: OpenAI `chat/completions`. Request/response shaping is hardcoded in
   `client.do()`. Auth is abstracted well (a `TokenSource` seam already powers
   Vertex ADC), but the wire format is not. A new contributor on AWS infra needs
   **Claude on Bedrock (EU data residency)**, which is served over the
   Anthropic **Messages** API (and requires **SigV4** request signing, not a
   Bearer token). This is impossible today without code changes.

2. **Control loop (Ring 3)** — the AIM cycle is a bespoke step engine
   (`pkg/orchestration` + `domain/aim/workflow.go`) with hand-rolled human-gate
   handling, and `domain/skillexec` is a bespoke one-shot runner. Both
   independently reimplement orchestration, human-in-the-loop, persistence, and
   retry — the same primitives Google now ships, production-grade, in **ADK Go
   2.0** (graph workflow engine, first-class HITL pause/resume, state
   persistence, unified node runtime, agent modes Chat/Task/SingleTurn).

3. **Tools/knowledge (Ring 2)** — MCP tools, prompts, and domain logic. These
   are correctly per-product and are NOT in scope to unify.

Two forces make now the right time. First, a real EU-residency deadline from an
external contributor needs the Provider seam regardless of any larger plan.
Second, a fourth Go service (Sequence) is about to build the same
runner+bot+provider trio, and the emergent repo (`emergent.memory`) already
runs on **ADK Go v1.2.0** — proving the runtime hosts custom providers (it ships
its own OpenAI model). ADK Go 2.0 is the credible open-source consolidation
target we said we would adopt "should something suitable open-source come up."

This change does the **spec-independent, no-regret** foundation work now, ahead
of the ecosystem-wide decision:

- Introduce a **Provider interface** in `internal/llm` and refactor the existing
  client to be the reference `openai` provider behind it (zero behaviour change).
- Add a **Bedrock / Anthropic-Messages provider** behind that interface, using
  the AWS SDK for SigV4 + refreshable instance-role credentials — unblocking the
  contributor.
- Migrate strategy-server from the bespoke orchestration/skillexec engines onto
  **ADK Go 2.0** as the agent+workflow runtime, mapping the AIM cycle onto ADK
  graph nodes + HITL. The Provider interface is deliberately shaped to become an
  ADK `model.LLM` registration, so the provider work is not thrown away.

**Non-goal / deferred:** any cross-repo shared module, and any decision that
binds Sequence, 21st-bot, or 21st-captable. Those wait for the Sequence OpenSpec
review. This change is scoped to strategy-server only.

## What Changes

### Part A — LLM Provider seam (ship first; unblocks Bedrock)

- **New `llm.Provider` interface** extracted from the existing client surface:
  `Chat` / `ChatWithFormat` / `Ping` / `Model`. The current `*llm.Client`
  becomes `openaiProvider` and satisfies it unchanged.
- **Callers depend on `Provider`, not `*Client`** — `domain/skillexec`,
  `domain/aim`, `domain/ripple`, `internal/llm.ModelSelector`.
- **New `bedrockProvider`** implementing `Provider` via the AWS SDK
  (`bedrockruntime` + Anthropic Messages payloads). AWS SDK owns SigV4 signing
  and credential refresh (instance role / STS / SSO) — we do NOT force AWS auth
  through the `oauth2.TokenSource` Bearer seam.
- **New `LLM_AUTH_MODE=bedrock`** with `LLM_BEDROCK_REGION` and a Bedrock model
  id (e.g. `eu.anthropic.claude-*`). `buildLLMConfig` gains a bedrock branch.
- **Error taxonomy preserved:** `APIError`/`IsRetryable`/`IsAccessDenied` stays
  the caller contract; add an Anthropic/Bedrock envelope parser + a mapping from
  AWS error types to the existing `ErrorKind`s.
- **Preflight `Ping` + `/health`** live-probe works for the bedrock provider too.

### Part B — ADK Go 2.0 runtime adoption (after A is stable)

- **Add `google.golang.org/adk/v2`** (Go 1.26 already satisfies the ≥1.25
  requirement).
- **Register the Provider seam as ADK models** — the `llm.Provider`
  implementations are wrapped as ADK `model.LLM` and registered via ADK's
  regex model registry, so ADK agents/nodes use the same providers (incl.
  Bedrock) with the same error classification.
- **Map the AIM cycle onto an ADK graph:** each of the six AIM steps becomes an
  ADK node; the four `HumanGate: true` steps become ADK HITL `RequestInput`
  pauses; run state uses ADK session persistence + `ReconstructRunState`/Resume,
  replacing the bespoke `pkg/orchestration/pg` backend.
- **Map `skillexec` one-shot runs** onto ADK `SingleTurn` agent nodes.
- **Keep the existing HTTP/SSE surface** (`handler_aim_orchestrator.go`) and MCP
  tool surface unchanged for clients — only the internal engine changes.

## Impact

- **Affected specs (new):**
  - `llm-provider` (new capability — Provider interface + bedrock)
  - `agent-runtime` (new capability — ADK 2.0 as the workflow/agent engine)
- **Affected code:**
  - Part A: `internal/llm/` (provider split + bedrock), `config/config.go`,
    `cmd_serve.go` (`buildLLMConfig`/`setupLLM`), caller signatures in
    `domain/skillexec`, `domain/aim`, `domain/ripple`.
  - Part B: `pkg/orchestration/*` (superseded by ADK; retained as a shim during
    migration), `domain/aim/workflow.go`, `domain/skillexec/executor.go`,
    `cmd_serve.go` wiring, new `internal/adk/` adapter package.
- **Backward compatibility:** Part A is behaviour-preserving for existing
  api-key/vertex modes (default `LLM_AUTH_MODE=api-key` unchanged). Part B keeps
  external HTTP/MCP contracts stable; the AIM run lifecycle semantics
  (steps, gates, snapshots) are preserved.
- **Migration reference:** emergent `apps/server/pkg/adk` (ADK v1.2.0) is the
  in-house precedent; the v1→v2 deltas (unified `agent.Context`, graph engine,
  session Resume) are handled in the new `internal/adk/` package.
- **Exit gates:**
  - Part A: `task test` + `task lint` pass; bedrock provider passes a live
    `Ping` against an EU Bedrock endpoint (contributor-verified); no change to
    api-key/vertex behaviour.
  - Part B: an AIM cycle runs end-to-end on ADK (all six steps, all four human
    gates, snapshot) with the same external behaviour; run survives a server
    restart mid-cycle (resume).

## Out of Scope (deferred)

- Any shared cross-repo AI module or its hosting org.
- Migrating 21st-bot, 21st-captable, or emergent apps/server.
- Sequence's adoption (awaiting its OpenSpec — this change is designed to be a
  reusable pattern for it, not a dependency).
- Streaming from bedrock (add later only if a use-case needs it; the AIM/
  skillexec runner is non-streaming today).
- The manifest / `/.well-known/21st-app.json` discovery network (orthogonal;
  tracked separately).
