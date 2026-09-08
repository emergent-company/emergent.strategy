# Change: Decide the authoring agent runtime and build the tool-calling seam

> **Closes baseline open question 6** (`docs/UNIFIED_AGENT_ARCHITECTURE.md` §8):
> *"Does the authoring bot use ADK's `LlmAgent` or a hand-rolled loop?"*
>
> **Research and spike first, per `establish-agent-contract`'s sequencing note** —
> that change's tasks 1–2 produced a decision document before any code, and it
> worked: the research corrected the baseline's own framing (`agentregistry` is a
> GCP client, not a card shape) before a fifth wrong implementation was written.
> Same discipline here.

## Why

`add-artifact-assistant-bot` has been blocked since 2026-06-08 on a question its
own tasks answer implicitly and wrongly. Task 3.2 says *"implement an LLM-backed
orchestrator over `internal/llm`; add multi-turn `Chat([]ChatMessage)` +
`tools`/function-calling to `internal/llm/client.go` if not already present"* — a
hand-rolled loop, decided by default rather than on evidence, three months before
the unified baseline existed. Meanwhile migration `039_drop_adk_tables.sql`
deliberately retained four `adk_*` tables *"for whichever engine the authoring bot
chooses (baseline open question 6, still open)"*. The estate has been holding a
door open for a decision nobody has made.

### The question is usually framed wrongly

"Does ADK save us the hard part?" It does not. The hard part is the **tool-calling
provider seam**, and it is unavoidable and near-identical under both options:

- `llm.ChatMessage` is `{Role, Content string}` (`internal/llm/client.go:294-297`).
  There is nowhere to put a tool call. `chatRequest` has no `tools` field;
  `chatResponse` decodes only `choices[].message.content`.
- `internal/adk/provider_model.go` drops function-call data in four places. Most
  decisively, `resultToResponse` (`:175-189`) always emits exactly one text part, so
  `IsFinalResponse()` is always true and **the ADK loop can never iterate today**.
- `bedrock.go:193` explicitly skips `tool_use` content blocks.

So both paths start by building the same thing. The real question is narrower:
*after paying that cost, do we want ADK's loop or our own?*

### What the research already establishes

Three findings that reframe the choice, each verified against source rather than
inferred from package names:

1. **ADK v2.2.0 ships no usable model adapter for either of our providers.** It has
   `gemini` and `openaimodel` — and `openaimodel` targets the **Responses API**
   (`/v1/responses`), which Vertex's OpenAI-compatible shim does not serve. There is
   **no Anthropic/Bedrock model in ADK v2.2.0 at all**. Both production paths are
   greenfield either way.
2. **`emergent.memory`, the estate's reference implementation, has no Anthropic
   adapter either.** Its `pkg/adk/openai_model.go` covers the OpenAI-shaped half
   only. The pattern is reusable; roughly half the code is not.
3. **ADK's `Flow.Run` is an unbounded `for {}` with no loop guard.** `agent.RunConfig`
   has exactly two fields and neither is a call cap; `MaxLLMCalls` exists only on
   `LiveRunConfig` (Gemini-only bidi). Separately, `NumRecentEvents` exists on
   `session.GetRequest` but **no ADK code path ever sets it**, so history reload is
   unbounded per turn. Both gaps are ours to close under either option.

### And one finding that changes the shape of the bot

The proposal's strongest argument for ADK was its HITL confirmation protocol. But
the authoring bot's human gate is the **batch review screen**, which is already
durable in Postgres. "Stage and return a review link" *ends the turn* — there is no
suspended tool call to resume. Notably, `emergent.memory` also declined ADK's
`toolconfirmation` and built durable suspension itself, for the same reason:
ADK's mechanism is in-process, and their gate is not.

This does not settle the question. It removes the argument that was doing most of
the work, which is why the decision needs re-deriving rather than inheriting.

## What Changes

### 1. Close open question 6 with a decision record

- **ADD** a decision record with explicit criteria, the way
  `harden-aim-execution/decision.md` did — including its drift-log discipline, so a
  later reversal has to argue against recorded reasoning rather than a vibe.
- **Working hypothesis, to be confirmed or refuted by the spike, not assumed:**
  adopt ADK's `LlmAgent`, but implement `model.LLM` **directly per provider** rather
  than routing through `llm.Provider`. Rationale: it avoids a third lossy
  translation hop (genai → `ChatMessage` → wire), leaves `internal/llm` untouched
  for `skillexec`'s 30 one-shot JSON skills, and makes the already
  conformance-tested `internal/adk.SessionStore` immediately useful.
- The record must state what would reverse it.
- **Outcome (2026-09-08): reversed.** The spike (`tasks.md` §1) measured this
  hypothesis against a hand-rolled loop with a real, running round trip against
  the live provider on both sides, not a desk comparison. The hand-rolled loop
  won on the only two things that turned out to matter for this bot's shape:
  it costs 2.3× less code for an identical round trip (182 vs. 418 lines, the
  entire delta being the genai↔wire translation layer ADK requires and
  hand-rolled does not), and the strongest cited ADK advantage — mid-turn HITL
  confirmation — is confirmed, by a worked flow, not needed at all, because
  this bot's writes are synchronous `Stage` calls that never need
  pre-execution approval. Full reasoning: `decision.md`.

### 2. Build the tool-calling seam

Unavoidable under either outcome, so it is scoped here rather than held hostage to
the decision.

- **ADD** tool declarations, tool calls, and tool results across the OpenAI-compatible
  / Vertex path.
- **ADD** the same across the Bedrock / Anthropic path. This is the larger half:
  `anthropicMessage.Content` is a `string` and must become an array of typed blocks;
  `translateMessages` (`bedrock.go:214-247`) merges consecutive same-role messages by
  string concatenation, which **corrupts** `tool_result` sequencing and needs a
  rewrite rather than a patch.
- **ADD** a JSON Schema sanitiser for the Gemini function-declaration subset. This is
  the routinely underestimated part: reflection-derived schemas from 153 MCP tools
  will contain `$ref`, `anyOf` and `additionalProperties` constructs that Gemini
  rejects.
- **ADD** orphaned-tool-call repair, ported from `emergent.memory`'s
  `ensureToolCallResponsePairs` (`pkg/adk/openai_model.go:404-474`). Any design that
  persists sessions *and* supports pause/resume will produce assistant turns whose
  tool calls have no matching result; strict providers reject the conversation
  outright. Port the algorithm **and write the tests they did not** — that function
  is currently untested upstream.

### 3. Fix the runtime invariants the estate keeps rediscovering

- **ADD** a bounded tool loop. Not optional: there is no built-in guard.
- **ADD** a retrieval budget enforced at the boundary. The existing precedent is
  thinner than it is usually credited: `skillexec` has one 112,000-**byte** constant
  enforced by dropping feature definitions one at a time (`executor.go:1464-1494`),
  and nothing else is ever truncated. `skill.yaml`'s `capability.context_budget` is
  declared in 30 skills and **read by zero Go code**.
- **ADD** compliance with `AGENT_RUNTIME_PATTERN.md` invariant 4 — tool results are
  not session history. This is the single highest-leverage decision in the whole
  authoring effort. Under ADK, the runner appends **every** non-partial event to the
  session, tool results included; `emergent.memory` shows where that leads —
  unbounded JSONB with roughly 5× write amplification, and a compactor that *skips*
  function calls when summarising, so the payloads that caused the bloat contribute
  nothing to the compressed form. For a bot whose tools return whole artifact
  payloads that fails immediately. The fix is tool design — return a reference and a
  summary, keep the payload in storage — and it must be decided before
  implementation, not discovered.

## Impact

- **Affected specs:** `agent-runtime` — adds engine-neutral requirements for bounded
  chains, retrieval budgets, and tool-result handling; corrects one stale requirement
  (below).
- **Affected code:** `internal/llm` (tool types across both providers, schema
  sanitiser, orphan repair), `internal/adk/provider_model.go` (rewritten or replaced
  per the decision).
- **No migration.** The `adk_*` tables from migration `034` already exist and are
  retained for exactly this.
- **Corrects a stale spec.** `agent-runtime`'s "Terminated runs' sessions are
  reclaimed" justifies itself with *"Without this, `adk_sessions` grows without
  bound"*. That is no longer true of AIM — it moved to DBOS, `adk_sessions` has no
  writer, and the sweep is now `DBOSEngine.ReapCompletedWorkflows`. The requirement
  is still right; its rationale names the wrong store. It is re-pointed here rather
  than elsewhere because the authoring bot is about to make `adk_sessions` live
  again, so this change is where the requirement stops being hypothetical.

## Non-goals

- **Building the bot.** That is `add-artifact-assistant-bot`.
- **Changing how `skillexec` calls the LLM.** Its 30 skills use one-shot JSON
  completion and must keep working unchanged. Widening `llm.Provider` in a way that
  disturbs them is a failure of this change, not a side effect.
- **Reopening the AIM engine decision.** DBOS shipped and parity was proven. AIM is
  code-planned; this is about the model-planned agent. Different knob (baseline §1.1).
- **A shared cross-repo module.** Baseline §4.1: three ADK majors on three Go
  toolchains. Whatever is built here stays in this repo.
