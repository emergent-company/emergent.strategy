# Design: ADK Go 2.0 runtime + LLM Provider seam

## Mental model (three rings)

Every AI feature is a control loop around an LLM call:

- **Ring 1 — Provider:** one LLM call (wire format + auth). Inessential
  differences (OpenAI vs Anthropic vs Bedrock; api-key vs Vertex ADC vs SigV4).
  → Unify hard behind one interface.
- **Ring 2 — Tools/Context:** what the model may see/do (MCP tools, prompts).
  → Stays per-product; not in scope.
- **Ring 3 — Control loop:** who decides the next step. Conversational
  (model-driven) vs workflow (code-driven) vs one-shot. → Unify onto ADK 2.0's
  graph engine, which expresses all three as node configurations.

This change addresses Ring 1 (Part A) and Ring 3 (Part B). Part A ships first
because it is smaller, unblocks an external deadline, and is a prerequisite for
clean Ring 3 provider wiring.

## Part A — Provider seam

### Interface (extracted from today's `*llm.Client`)

```go
// Provider makes a single LLM call. Implementations own wire format + auth.
// The error contract is the existing classified *APIError.
type Provider interface {
    Chat(ctx context.Context, msgs []ChatMessage, temperature float64) (*ChatResult, error)
    ChatWithFormat(ctx context.Context, msgs []ChatMessage, temperature float64, format *ResponseFormat) (*ChatResult, error)
    Ping(ctx context.Context) error
    Model() string
}
```

- `ChatMessage`, `ChatResult`, `ResponseFormat`, `APIError`, `ErrorKind`,
  `IsRetryable`, `IsAccessDenied` are unchanged and shared by all providers.
- The current `*Client` is renamed conceptually to `openaiProvider` (keep the
  `Client` type name to avoid churn; it already satisfies `Provider`). Vertex
  stays a configuration of the openai provider (OpenAI-compatible endpoint + ADC
  `TokenSource`) — no separate type needed.

### Bedrock / Anthropic-Messages provider

```go
type bedrockProvider struct {
    client *bedrockruntime.Client // AWS SDK v2 — owns SigV4 + credential refresh
    model  string                 // e.g. "eu.anthropic.claude-3-5-sonnet-20241022-v2:0"
    region string
}
```

- **Auth:** AWS SDK default credential chain (instance role / STS / SSO /
  env). No static key required; refresh is the SDK's responsibility. This
  directly answers the contributor's "refreshable AWS credentials" ask — and
  intentionally does NOT go through the `oauth2.TokenSource` Bearer seam, because
  Bedrock uses SigV4, not Bearer.
- **Wire translation:** map `[]ChatMessage` → Anthropic Messages
  (`system` extracted to top-level, `messages[]` with role/content, `max_tokens`,
  `anthropic_version`). Map `ResponseFormat=json_object` → a system-prompt JSON
  instruction (Bedrock Anthropic has no native `response_format`; enforce via
  instruction + tool-use if needed).
- **Response:** parse Anthropic `content[]` blocks → `ChatResult.Content`; map
  `usage.input_tokens`/`output_tokens` → `ChatResult.InputTokens/OutputTokens`.
- **Errors:** map AWS SDK error types + Bedrock HTTP statuses onto the existing
  `ErrorKind`s (`AccessDeniedException`→`KindAccessDenied`,
  `ThrottlingException`→`KindRateLimited`, `ValidationException`→`KindBadRequest`,
  `ResourceNotFoundException`/unknown model→`KindModelNotFound`, 5xx→
  `KindServerError`). Preserve the actionable `Action` remediation strings.

### Config + wiring

New env (additive; defaults keep current behaviour):

| Var | Mode | Meaning |
|---|---|---|
| `LLM_AUTH_MODE` | +`bedrock` | now one of `api-key` \| `vertex` \| `bedrock` |
| `LLM_BEDROCK_REGION` | bedrock | e.g. `eu-central-1`, `eu-west-1` (residency) |
| `LLM_MODEL` | bedrock | Bedrock model id (`eu.anthropic.claude-*`) |

`buildLLMConfig`/`setupLLM` gain a `bedrock` branch that constructs
`bedrockProvider` and returns it as a `Provider`. Preflight `Ping` and `/health`
live-probe are provider-agnostic (they already call the interface).

### Why this survives the ADK migration

ADK 2.0's model contract is:

```go
type LLM interface {
    Name() string
    GenerateContent(ctx, req *LLMRequest, stream bool) iter.Seq2[*LLMResponse, error]
}
```

with a **regex model registry** (`model.Register(pattern, factory)`). In Part B
we wrap each `llm.Provider` as an ADK `model.LLM` (adapting `Chat*` ⇄
`GenerateContent`) and register it. The contributor's `bedrockProvider` therefore
becomes an ADK model registration with no rework. Net: Part A is a stepping
stone, not a detour.

## Part B — ADK Go 2.0 runtime

### AIM cycle → ADK graph

#### Verified against the ADK v2.2.0 API (supersedes the sketch below)

Four constraints found by reading the shipped API and ADK's own HITL examples.
They change the node topology from the six-node table below.

**1. There are two HITL patterns, and the obvious one is wrong for AIM.**

- `hitl_rerun`: one node with `NodeConfig.RerunOnResume`, using
  `workflow.ResumeOrRequestInput`. The node body **re-runs from scratch** after
  the human answers.
- `hitl_simple`: two nodes. The first emits `NewRequestInputEvent` and returns
  `workflow.ErrNodeInterrupted`; it is not re-run.

AIM steps do expensive LLM work and stage a mutation batch *before* pausing, so
`RerunOnResume` would repeat the LLM call and stage a **second batch** on every
approval. The two-node handoff is therefore mandatory, not stylistic.

**2. Topology is 10 nodes, not 6.** Each gated step becomes a work node plus a
gate node:

```
Start → draft_assessment → gate_assessment
      → draft_calibration → gate_calibration
      → adapt_strategy    → gate_strategy
      → adapt_foundations → gate_foundations
      → align_portfolio   → snapshot_cycle
```

`align_portfolio` and `snapshot_cycle` keep no gate. The conditional
auto-advance for an empty `adapt_foundations` batch belongs in
`gate_foundations`: the gate receives the work node's output, so it can decline
to emit a `RequestInput` when the batch id is empty and simply pass through.

**3. Data flow breaks at every gate.** A gate returns `ErrNodeInterrupted`
rather than a value, and on resume the *human's reply* — not the gate's output —
is delivered as the next node's input. Run context therefore cannot be threaded
through node I/O. It must live in session state (`agent.Context.State()`),
seeded once when the run is created and read by each work node. Node I/O carries
only the work→gate handoff and the resumed reply.

**4. Commit vs discard is now the post-gate node's job.** The legacy engine
aborts the run when `Engine.Resume(..., committed=false)` is called. ADK has no
equivalent: the reply is just a value handed to the next node, so that node must
inspect it and abort. This is behaviour that must be re-implemented, not
inherited.

#### API surface confirmed

| Need | ADK v2.2.0 |
|---|---|
| Graph construction | `workflow.Chain(Start, n1, …) []Edge`; `workflowagent.New(Config{Name, Edges})` |
| Deterministic step | `workflow.NewFunctionNode[IN,OUT](name, fn, cfg)` |
| Step that pauses | `workflow.NewEmittingFunctionNode[IN,OUT]` + `workflow.NewRequestInputEvent` + `workflow.ErrNodeInterrupted` |
| Driving / resuming | `runner.New(Config{AppName, Agent, SessionService})`, `runner.Run(ctx, userID, sessionID, msg, cfg)`; resume by submitting a `FunctionResponse` targeting the `InterruptID` |
| Run context | `agent.Context.State()` / `Actions().StateDelta` |

#### Consequences for the rest of Part B

- The graph builder should live in `internal/adk` and take an injected step
  list, keeping that package free of `domain/aim` imports and testable with
  fakes.
- Guaranteeing parity is best served by both engines driving the *same* step
  bodies. That means exposing the six step functions from `domain/aim` in an
  engine-neutral shape, rather than reimplementing them against ADK.

---

Original sketch (retained for context) — today
(`domain/aim/workflow.go`): six ordered steps, four with `HumanGate:true`.

| AIM step | ADK node | HITL |
|---|---|---|
| draft_assessment | AgentNode (SingleTurn) → stage batch | `RequestInput` (human review/commit) |
| draft_calibration | AgentNode (SingleTurn) | `RequestInput` |
| adapt_strategy | AgentNode (SingleTurn, skill `adapt-strategy`) | `RequestInput` |
| adapt_foundations | AgentNode; empty→auto-advance | conditional `RequestInput` |
| align_portfolio | FunctionNode (deterministic, auto-commit) | none |
| snapshot_cycle | FunctionNode (auto-publish version) | none |

- **HITL:** replace the bespoke human-gate/batch-review with ADK
  `RequestInput`/Resume. The run pauses emitting `RequestInput`; the existing
  HTTP `commit_batch`/approve action supplies the user response to
  `runner.Run(...)` to resume. Auto-advance (empty adapt_foundations) = node
  completes without `RequestInput`.
- **Persistence/resume:** ADK session store + `ReconstructRunState` replaces
  `pkg/orchestration/pg`. One active cycle per instance = ADK concurrency key on
  `instance_id` (mirrors today's `ConcurrencyKey`).
- **skillexec** one-shot chunked runs → `SingleTurn` agent nodes; schema
  constraints move to ADK structured-output config.

### Adapter package `internal/adk/`

- `provider_model.go` — wrap `llm.Provider` as ADK `model.LLM` + register.
- `session_store.go` — back ADK sessions with the existing bun Postgres (mirror
  emergent's `pkg/adk/session/bunsession`, adapted to v2 session iface).
- `aim_graph.go` — build the AIM graph from the table above.
- Keep `pkg/orchestration` compiling as a thin shim until callers are migrated,
  then delete in a follow-up.

### v1→v2 deltas to handle (from emergent pkg/adk precedent)

- Unified `agent.Context` (merged `ToolContext`/`CallbackContext`).
- Graph engine + node types (`FunctionNode`, `AgentNode`, `JoinNode`,
  `DynamicNode`) replace 1.x hierarchical executors.
- Session Resume via event scan (`ReconstructRunState`) rather than a persisted
  blob — align the bun session store accordingly.
- Model interface returns `iter.Seq2[*LLMResponse, error]` (streaming-shaped);
  adapt the non-streaming `Provider.Chat*` by yielding a single response.

## Risks & mitigations

- **ADK 2.0 is new (Jun 30 2026), breaking vs 1.x.** Mitigate: Part A ships
  independently and is valuable alone; Part B is gated behind an
  end-to-end AIM parity test + restart-resume test before deleting the old
  engine. Keep the shim so rollback is a wiring switch.
- **Bedrock structured output** has no native `response_format`. Mitigate:
  instruction-based JSON + validation; escalate to tool-use if a step needs hard
  guarantees.
- **Scope creep into other repos.** Mitigate: this change is strategy-server
  only; ecosystem decisions wait for the Sequence OpenSpec.

## Open questions (for Sequence OpenSpec review / contributor)

1. Does bedrock need **streaming** for any strategy-server use? (assume no)
2. EU region + exact Bedrock model id the contributor targets?
3. Should the ADK session store reuse emergent's `bunsession` as a shared vendored
   snapshot, or a strategy-server-local copy? (default: local copy, per repo
   isolation)
