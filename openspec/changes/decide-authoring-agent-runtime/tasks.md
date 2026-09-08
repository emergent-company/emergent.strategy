# Tasks: Decide the authoring agent runtime

Record the test baseline before starting. As of 2026-09-08, from
`apps/strategy-server` with Postgres up, `go test ./...` passes: **40 packages with
tests, 0 failures**. `task lint` clean.

**Sequencing note.** Sections 1–2 are a spike and produce a decision. Do not write
production code until the decision is recorded. The failure mode this guards against
is real and already happened once: `add-artifact-assistant-bot` task 3.2 committed to
a hand-rolled loop in June by default, not by evidence, and the estate has been
holding four database tables open ever since waiting for someone to actually decide.

## 1. Spike: prove the loop under both options

The spike is throwaway. Its output is evidence, not code to keep.

- [x] 1.1 Build the smallest possible tool-calling round trip against **one** provider
      (choose the OpenAI-compatible path — it is the cheaper half) with a hand-rolled
      loop: declare one tool, get a tool call back, execute it, feed the result back,
      get a final answer. Measure the real line count, do not estimate it. —
      182 lines, run live against Google AI Studio's endpoint. Found a real,
      previously unknown provider quirk on the first run (Gemini 3.5 requires
      an opaque `thought_signature` echoed back on tool-call turns). See
      `decision.md` §1–2.
- [x] 1.2 Build the same round trip through ADK's `LlmAgent` with a `model.LLM`
      written directly against that provider. Measure again. — 418 lines
      (`model.go` 279 + `main.go` 93 + `agent.go` 46), same live endpoint.
      `decision.md` §1.
- [x] 1.3 Record what each spike actually needed that the other did not. Distinguish
      "ADK gave me this" from "ADK made me write this differently". —
      `decision.md`'s capability scorecard. The 2.3× line-count delta is
      entirely the genai↔wire translation layer, not the loop itself.
- [x] 1.4 Probe specifically whether ADK's out-of-order function-response history
      rearrangement (`internal/llminternal/contents_processor.go:161,166`) and
      function-call ID synthesis (`internal/utils/utils.go:37-65`) matter for our
      shape, or only for parallel/async tool use we will not have. These are the
      strongest claimed ADK benefits — test the claim rather than repeating it. —
      Both confirmed inert by direct source reading: the rearrangement
      functions early-return unchanged whenever a response immediately
      follows its call (our synchronous shape, always); ID synthesis only
      fires on an empty provider-returned ID (never observed; structurally
      required by all three wire formats). `decision.md` §4.
- [x] 1.5 Confirm or refute the proposal's reframing: **does the authoring bot need
      mid-turn HITL at all**, given the human gate is an out-of-band batch review?
      If it does not, ADK's confirmation protocol — its strongest single advantage —
      is not a benefit for this agent. Answer with a worked flow, not an opinion. —
      Confirmed via a worked 4-step flow: `propose_patch` executes
      synchronously and returns a review link in the same turn; no
      suspension occurs anywhere. `decision.md` §5.

## 2. Decide and record

- [x] 2.1 Write `decision.md` with explicit criteria and the evidence from section 1.
      Follow `harden-aim-execution/decision.md`'s shape, including its drift-log
      discipline. — `decision.md`. **Decision: hand-rolled loop, not ADK's
      `LlmAgent`** — reverses this proposal's own working hypothesis, recorded
      as a reversal rather than a quiet correction.
- [x] 2.2 State what would reverse the decision. A decision with no reversal
      condition is a preference. — `decision.md`'s four revisit triggers:
      a write tool needing genuine pre-execution approval; genuine parallel
      slow tool calls in one turn; in-loop sub-agent delegation; the
      conversation store (2.4) needing more of ADK's session semantics than
      expected.
- [x] 2.3 Update `docs/UNIFIED_AGENT_ARCHITECTURE.md` open question 6 with the outcome
      and a link. Do not leave the baseline stating an open question that is closed —
      that is drift-log error 2 in the making. — Done; see the doc's §8.
- [x] 2.4 If the decision is against ADK, say plainly in `decision.md` what happens to
      `internal/adk.SessionStore` and the four `adk_*` tables migration 039 retained,
      and open a follow-up to drop them. Leaving them is how the estate accumulates
      load-bearing-looking dead code. — `decision.md`'s "What happens to
      `internal/adk`" section: `adksession.Service` has no caller once the bot
      doesn't run `LlmAgent`/`runner`. Two options recorded (repoint vs.
      replace), deliberately not decided here — that needs the actual
      conversation schema design, which is bot task 3, not this spike.

## 3. Tool-calling seam — shared types

Required under either outcome.

- [ ] 3.1 Define a provider-neutral `ToolDeclaration{Name, Description, ParametersJSONSchema}`.
- [ ] 3.2 Extend the message model with assistant-side tool calls and a tool-result
      role carrying a call ID and name.
- [ ] 3.3 Extend the result model with tool calls and a finish/stop reason.
- [ ] 3.4 **Verify `skillexec` is untouched.** It uses its own narrow `LLMClient`
      interface (`domain/skillexec/executor.go:63-66`), so it should be unaffected —
      confirm this by test, not by reading. All 30 embedded skills must still run.
- [ ] 3.5 Update the test fakes. There are few real implementers (`*Client`,
      `bedrockProvider`, one test fake), so the blast radius is small — confirm that.

## 4. Tool-calling seam — OpenAI-compatible / Vertex

- [ ] 4.1 Serialise tool declarations into the request.
- [ ] 4.2 Serialise assistant turns carrying `tool_calls`, and tool results as
      `{"role":"tool","tool_call_id":…,"content":…}`.
- [ ] 4.3 Parse `tool_calls` out of responses. Arguments arrive as a **JSON string**,
      not an object — handle malformed JSON explicitly rather than letting it panic
      or silently vanish.
- [ ] 4.4 Handle parallel tool calls: one assistant message carrying N calls requires
      N separate tool-result messages, all before the next assistant turn.
- [ ] 4.5 **Gemini schema-subset sanitiser.** Vertex's function declarations reject
      `$ref`, most `anyOf`, and much `additionalProperties` usage. Reflection-derived
      schemas from 153 MCP tools will hit this. Build the sanitiser and test it
      against the **real** tool catalogue via
      `mcpserver.NewMCPServerForIntrospection()` — the same introspection path
      `internal/selfmodel` uses, so coverage cannot drift from reality.
- [ ] 4.6 Tests including at least one round trip against a recorded real response
      shape, not only hand-written fixtures.

## 5. Tool-calling seam — Bedrock / Anthropic

The larger half. Budget accordingly.

- [ ] 5.1 Change `anthropicMessage.Content` (`internal/llm/bedrock.go:122-125`) from
      `string` to an array of typed blocks (`text` / `tool_use` / `tool_result`).
      This is a type change, not a field addition.
- [ ] 5.2 Rewrite `joinTextBlocks` (`bedrock.go:194-205`) to preserve non-text blocks
      instead of discarding them — its own comment already names `tool_use` as the
      thing being thrown away.
- [ ] 5.3 **Rewrite `translateMessages` (`bedrock.go:214-247`).** It merges consecutive
      same-role messages by string concatenation (`:227`). With tool results this
      corrupts the conversation: `tool_result` blocks must sit in a user message that
      immediately follows the assistant `tool_use` message, and a merge fuses a text
      turn into it. Patching this is not sufficient.
- [ ] 5.4 Add `tools` and `tool_choice` to the request; handle
      `stop_reason == "tool_use"`.
- [ ] 5.5 Test the strict-pairing invariant: every `tool_use` answered by a matching
      `tool_result` in the immediately following user message. Anthropic 400s
      otherwise, so this must be a test, not a convention.

## 6. Orphaned tool-call repair

- [ ] 6.1 Port `ensureToolCallResponsePairs` from `emergent.memory`
      (`pkg/adk/openai_model.go:404-474`): walk the message list, collect assistant
      tool-call IDs and tool-response IDs in discovery order, inject synthetic error
      responses for orphans immediately after the owning assistant message.
- [ ] 6.2 **Write the tests upstream does not have.** Grepping `pkg/adk/*_test.go` for
      `ensureToolCallResponsePairs` returns nothing — the highest-risk function in
      their adapter is untested. Do not inherit that.
- [ ] 6.3 Test the case that motivates it: a session persisted mid-tool-call, then
      reloaded, produces a conversation a strict provider accepts.

## 7. Runtime invariants

- [ ] 7.1 Bounded tool loop with a configurable maximum. Under ADK this is a
      `BeforeModelCallback` returning a non-nil response to short-circuit; hand-rolled
      it is a counter. Either way it is ours — ADK has no built-in guard.
- [ ] 7.2 Test that the bound actually terminates a runaway loop, by driving a fake
      model that always returns a tool call.
- [ ] 7.3 Retrieval budget enforced at the boundary — a top-k and a token ceiling,
      not "everything relevant". Do not cite `skillexec`'s 112,000-byte constant as a
      precedent to copy; it drops feature definitions and nothing else, and the
      per-skill `capability.context_budget` field is declared in 30 skills and read by
      no code.
- [ ] 7.4 **Invariant 4: tool results are not session history.** Decide and implement
      the reference-plus-summary shape for large tool payloads. Test that a tool
      returning a whole artifact payload does not put that payload into the
      conversation record.
- [ ] 7.5 Bound history reload per turn. `NumRecentEvents` exists on ADK's
      `session.GetRequest` but no ADK code path sets it; `internal/adk/perf_history_test.go`
      already documents the consequence.
- [ ] 7.6 Decide whether compaction is needed **at all**, given the chosen unit of
      work. If the unit already bounds the session, compaction is unnecessary
      complexity. If it is needed, follow `emergent.memory`'s two-phase shape but
      **not** its delete-then-recreate rebuild (`session_compressor.go:196-216`) —
      that is a non-atomic destruction of history with no transaction and no archive;
      a failed `Create` after a successful `Delete` loses the conversation.
- [ ] 7.7 If compaction is implemented, it must be inspectable — recorded as an event,
      never silent (invariant 5).

## 8. Verify

- [ ] 8.1 `go test ./...` — compare against the 40-package baseline. No regressions.
- [ ] 8.2 `task lint` clean.
- [ ] 8.3 Run a real tool-calling round trip against **both** providers, not just the
      one used for the spike. A seam proven on one provider is half a seam.
- [ ] 8.4 Confirm all 30 embedded skills still execute (task 3.4's guarantee, verified
      end to end rather than by interface inspection).
