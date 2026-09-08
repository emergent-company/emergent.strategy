# Decision record: the authoring agent's tool-calling runtime

> Output of §1–2. Read `proposal.md` first for why this question exists and
> what it does not settle (the provider seam itself, §3–6, is unaffected by
> this decision — it is paid in full either way and is not re-litigated here).
>
> **Scope honesty note.** This is a real, running spike, not a desk
> evaluation: both round trips execute against the actual configured
> provider (Google AI Studio's OpenAI-compatible endpoint, `models/gemini-3.5-flash`,
> the same credential `apps/strategy-server/.env.local` uses), over the real
> network, with real tool-call round trips including a genuine, previously
> unknown failure mode. Code lives outside the repo (throwaway, per §1's own
> instruction) — line counts and behaviour below are measured from it, not
> estimated. It is a minimal case: one tool, one call per turn, no parallelism,
> no long-running tool, no HITL. Where that matters, it is called out below
> and turned into a revisit trigger rather than papered over.

## Decision

**Hand-rolled tool-calling loop, not ADK's `LlmAgent`, for the authoring
bot's own first-party tool execution.**

This reverses the proposal's working hypothesis ("adopt ADK, write `model.LLM`
directly per provider"). The hypothesis was reasonable going in — it is not
reasonable to keep after running the spike. Recorded as a reversal, not
quietly corrected, per the drift-log discipline in
`docs/UNIFIED_AGENT_ARCHITECTURE.md` §9.

This decision is about the bot's **own** tool loop only. It does not touch:
- **Delegation transport** (other agents calling into strategy-server, or
  strategy-server calling out) — that is MCP-over-HTTP, already proven by
  `establish-agent-contract`'s `mcptoolset` probe, and is orthogonal to what
  runs the bot's internal loop.
- **`internal/adk`'s fate** — addressed separately below, since it does not
  automatically follow from this decision.

## Evidence

### 1. Measured line count (task 1.1 vs 1.2)

Identical functional round trip — one tool declared, one call executed, one
tool result fed back, one final answer — against the same live endpoint:

| | Lines | Breakdown |
|---|---|---|
| Hand-rolled | **182** | wire types, tool declaration, loop, HTTP call, loop guard |
| ADK `LlmAgent` + direct `model.LLM` | **418** | `model.go` 279 (genai↔wire conversion) + `main.go` 93 (wiring/runner) + `agent.go` 46 (loop guard) |

**The entire 2.3× overhead is the genai↔wire translation layer** (`model.go`).
`agent.go` + `main.go` (139 lines: agent construction, the loop guard, running
it) is *smaller* than the hand-rolled file's loop-and-wire-types combined.
This directly contradicts the "avoid a third lossy hop" reasoning the working
hypothesis was built on: going through genai's vocabulary costs more code than
talking the wire format directly, not less, because genai's `Content`/`Part`
representation is richer than an OpenAI-compatible tool-calling turn needs,
and every one of the three shapes (assistant tool-call turn, tool-result turn,
opaque provider metadata) has to be built in both directions regardless of
which side you start from.

### 2. A genuine, previously unknown provider quirk, and what it implies

The hand-rolled spike's first run failed on round two:

> `Function call is missing a thought_signature in functionCall parts... may
> lead to degraded model performance.`

Confirmed by raw probe: Gemini 3.5's OpenAI-compat shim attaches an opaque
`extra_content.google.thought_signature` blob (hundreds of bytes, base64) to
every function-call turn, which **must be echoed back verbatim** on the next
request or the call fails outright.

Nothing in either `internal/llm.ChatMessage` or the hand-rolled spike's first
draft had anywhere to put this — round-tripping through a fixed struct
silently dropped it. Fixed with one `json.RawMessage` field (6 lines).

`genai.Part` already has a first-class field for exactly this
(`ThoughtSignature []byte`, `genai/types.go:1604-1605`) — a real, if minor,
point in favour of genai's richer vocabulary. It cost 6 lines to work around
under the hand-rolled shape and would need a comparable dedicated field under
either option; it is not decisive either way, but it **is** a finding that
belongs directly in `decide-authoring-agent-runtime`'s own §3 (the provider
seam), regardless of which loop wins: whatever provider-neutral `ToolCall`
type gets built there needs an extension point for opaque, provider-specific,
round-trip-required metadata. Task 3.1 should be read as including this.

### 3. `AfterToolCallback` is a real, verified hook — and it changes nothing

Confirmed by reading `internal/llminternal/base_flow.go:1278-1293`: an
`AfterToolCallback`'s return value genuinely replaces the tool result before
it is embedded in the event that gets persisted to session
(`runner.go:346-349` appends whatever the flow yields, unmodified). So ADK
*does* provide a load-bearing seam for design Decision 3 (tool results are
references, not raw payloads) — this was worth verifying rather than assuming
either way, since the original design doc framed session accumulation as
something to "design around, not fight."

It changes nothing about the loop decision, though: a hand-rolled tool
function can return `{ref, summary}` directly as its own result type, with no
callback machinery needed at all. The callback is an alternative mechanism for
the same outcome, not a capability the hand-rolled path lacks.

### 4. Two of the three cited ADK advantages are confirmed inert for this shape

Read from source, not inferred from documentation:

- **Out-of-order function-response rearrangement**
  (`internal/llminternal/contents_processor.go:224-234`, `:360-375`,
  literally named `rearrangeEventsForAsyncFunctionResponse` in the upstream
  adk-python this was ported from). Both functions early-return unchanged
  whenever a function response event immediately follows its call event —
  which is every synchronous, same-turn tool call. They exist for async /
  long-running tools and resumed sessions where a response landed out of
  order. The authoring bot's write tools (`propose_patch`,
  `propose_evidence_link`) are synchronous `Stage` calls that complete inside
  the same turn — this machinery is dead code for our shape.
- **Function-call ID synthesis** (`internal/utils/utils.go:37-43`,
  `PopulateClientFunctionCallID`) only fires when the provider returns an
  empty ID. Confirmed live: Gemini's OpenAI-compat endpoint returns a real ID
  (`call_15989`) on every call. OpenAI and Anthropic's wire formats both
  require an ID field structurally, so this is expected to hold generally,
  not just for this one provider.

### 5. The third — HITL confirmation — is answered by a worked flow (task 1.5)

The proposal's strongest argument for ADK was `toolconfirmation`'s complete
raise/emit/pause/resume protocol. Walked against the bot's actual write path:

1. User: "tighten this UVP."
2. Agent calls `propose_patch`. The tool executes **synchronously** — it calls
   `StagePatch`, which is a Postgres write that never touches committed state
   — and returns `{batch_id, review_url}` as an ordinary tool result, in the
   same turn.
3. Agent's next model call sees the tool result and produces final text:
   "I've staged that change — review it here: `<url>`." Loop ends normally.
4. The human approval happens **later, out of band**, on a separate HTTP
   request (clicking commit on the review screen) that has no relationship to
   the agent's turn, session, or process.

No suspension occurs anywhere in this flow, because staging is not a
privileged operation that needs pre-execution approval — it is inherently
safe (reviewable, discardable, no effect on committed state) by the staging
spine's own design. This is structurally different from `emergent.memory`'s
shape, where some tools **do** mutate external state directly and therefore
need a pre-execution gate — which is exactly why they built durable
suspension and we do not need to.

If a clarifying question is ever needed mid-task, it is an ordinary chat turn
("should I also update the KR target?") answered by an ordinary chat turn —
not a suspended tool call requiring `FunctionCallID` re-injection across a
process boundary.

**Confirmed: this agent does not need mid-turn HITL**, and therefore gets no
benefit from ADK's strongest differentiator.

### 6. Loop guard and history bound: a wash, verified by mutation on both sides

Neither option has one built in — confirmed by reading `agent.RunConfig`
(exactly two fields, neither a call cap) and by building both:

- Hand-rolled: a `for round := 1; round <= maxRounds` counter (~6 lines).
- ADK: a `BeforeModelCallback` that short-circuits past a round count
  (~15 lines, `adkloop/agent.go`).

Both were verified to actually fire, not just assumed to compile: temporarily
set the bound to 0/1 on each side, confirmed the guard triggered with the
expected message, reverted, confirmed the happy path still works. Genuinely
equivalent effort either way — this is not a factor in the decision.

### 7. `mcptoolset` does not transfer to this decision the way it first appears to

`establish-agent-contract`'s probe proved strategy-server's own 153 MCP tools
are reachable through ADK's `mcptoolset` over the real wire. That is real, but
it answers a different question: it is evidence for **remote delegation**
(another agent, in another process, calling into strategy-server over MCP),
not for **the authoring bot's own first-party tool calls**. The bot's write
tools call `domain/strategy.Service` directly, in-process — there is no
self-network-round-trip to avoid or to gain from `mcptoolset` either way, and
no version of this decision changes what `establish-agent-contract` already
proved about the delegation surface.

## Why this does not contradict `emergent.memory`'s choice

`emergent.memory` — the estate's reference chat runtime — genuinely uses
ADK's `LlmAgent` and gets real value from it. That does not transfer here,
for reasons specific to shape rather than a re-litigation of their choice:

- Their MCP tools wrap **remote services** with real latency and genuine
  benefit from ADK's concurrent tool dispatch. Ours are in-process Postgres
  calls.
- Some of their tools **mutate external state directly** and need
  pre-execution confirmation. Ours only ever stage.
- They run **long-lived spawned sub-agents**. The authoring bot has no
  sub-agent delegation in its own loop (delegation to AIM happens at the
  transport layer, per `establish-agent-contract`, not as an ADK sub-agent).

This is exactly the baseline's own instruction (drift-log entry 3): keep
per-repo ADK adoption decisions separate from shared-module decisions, and
evaluate each on its own shape rather than on another repo's precedent.

## Capability scorecard

| Capability | Hand-rolled | ADK `LlmAgent` | Decisive for this bot? |
|---|---|---|---|
| Lines for minimal round trip | 182 (measured) | 418 (measured) | Yes — hand-rolled |
| Loop guard | Must build (~6 lines) | Must build (~15 lines) | No — wash |
| Unbounded history reload | Must bound (own code) | Must bound (own code — `NumRecentEvents` exists, no ADK path sets it) | No — wash |
| Async/out-of-order response rearrangement | N/A — not needed | Present, confirmed inert for our synchronous shape | No — dormant either way |
| Function-call ID synthesis | N/A — not needed | Present, confirmed inert (providers return real IDs) | No — dormant either way |
| Mid-turn HITL / `toolconfirmation` | N/A — not needed (worked flow, §5) | Present, genuinely complete, but unused | No — not needed regardless |
| Invariant-4 tool-result shaping | Tool return type, directly | Tool return type, or `AfterToolCallback` | No — equally available |
| Session store | Must build | `internal/adk.SessionStore`, already conformance-tested | **Yes — real ADK asset**, addressed below |
| Provider-opaque metadata round-trip (thought_signature) | Needed a field either way (6 lines) | genai has a native field | Minor — not decisive |
| Remote delegation via MCP | Unaffected — solved at the transport layer | Unaffected — solved at the transport layer | No — orthogonal |

Only one row favours ADK on its own merits: the session store. Handled next.

## What happens to `internal/adk` (task 2.4)

Migration `039_drop_adk_tables.sql` kept `adk_sessions` / `adk_session_events`
/ `adk_app_states` / `adk_user_states` explicitly "for whichever engine the
authoring bot chooses." This decision does not choose that engine, so those
tables' stated reason for existing no longer holds.

**Recommendation, not yet executed:** do not keep `internal/adk.SessionStore`
as an unused implementation of `adksession.Service` — that interface has no
caller once the bot doesn't run `LlmAgent`/`runner`. Two real options, not
decided here:

1. **Repoint**, not rewrite. The four tables' shape (event log, JSONB
   state, app/user/session scoping) fits a hand-rolled conversation store
   with light changes — this was the estate's own prior assessment
   ("repointing is ~a day of work, not a rewrite") and nothing in this
   decision changes that estimate.
2. **Replace.** Design decisions 1 (bounded unit of work) and 3
   (reference-shaped tool results) already diverge from what
   `adksession.Event`'s envelope assumes (a full `model.LLMResponse` per
   event, unbounded by design). A schema built directly for what this bot
   actually stores — turn text, tool-call summaries, references — may be
   simpler than adapting ADK's shape to not do what it was built to do.

Opening a follow-up task rather than deciding here, per task 2.4's own
instruction: this needs the actual conversation schema design (bot task 3),
not a decision made in the abstract.

**If this decision is later reversed** (see Revisit Triggers), `internal/adk`
should not be touched until that reversal is recorded — do not act on this
recommendation preemptively.

## What this decision does not resolve

- **The provider seam itself (§3–6).** Unaffected. Tool declarations, calls,
  and results must round-trip on both the OpenAI-compatible and Bedrock/
  Anthropic paths regardless of which loop drives them. The thought_signature
  finding (§2 above) is now part of that seam's scope, not a separate concern.
- **Compaction (task 7.6).** Orthogonal — a hand-rolled loop still needs the
  same bounded-unit-of-work and reference-shaped-tool-result design as an
  ADK-driven one; nothing here decides whether compaction beyond that is ever
  needed.
- **Whether a *future* write tool needs genuine concurrency or async
  suspension.** See revisit trigger 1.

## What was not done in this session, and why

- **Bedrock/Anthropic was not spiked.** Task 1.1 explicitly scoped the spike
  to the OpenAI-compatible path "it is the cheaper half." The provider-seam
  tasks (§4–6) still need their own proof against Anthropic's stricter
  content-block pairing; this decision does not claim that work is done or
  that it is symmetric in cost — `proposal.md` already estimates it as the
  larger half.
- **Parallel tool calls in one turn were not exercised.** The hand-rolled
  loop already handles multiple `tool_calls` per assistant turn structurally
  (it loops over them), but only one tool exists in this spike, so true
  concurrent dispatch was never triggered on either side. If the bot's real
  tool set produces genuine multi-call turns with independent, slow
  dependencies, revisit trigger 2 applies.
- **No load or concurrency testing.** This is a single-conversation,
  single-process spike. Nothing here says anything about behaviour under
  concurrent conversations against the same instance.

## Revisit triggers

Revisit this decision, rather than the calendar, when any of:

1. **A write tool needs genuine pre-execution approval** — i.e. a future tool
   that is not merely a `Stage` call and therefore cannot rely on the
   out-of-band review gate. If that ever becomes real, ADK's
   `toolconfirmation` protocol (§5's dormant advantage) becomes live, not
   dormant, and the calculus changes.
2. **The bot's tool set produces genuine parallel, slow, independent tool
   calls within one turn** where concurrent dispatch has real latency value —
   not merely multiple calls in sequence, which the hand-rolled loop already
   handles.
3. **The bot needs to delegate to a sub-agent from *inside* its own loop**
   (not via the MCP transport layer) — this is where `agenttool`/
   `remoteagent`'s free composition (`research.md` §1.2 in
   `establish-agent-contract`) would actually apply to this bot specifically,
   which it does not today.
4. **The repointed or replaced conversation store (task 2.4's follow-up)
   turns out to need more of ADK's session semantics than expected** —
   e.g. genuine multi-agent branching within one conversation.

## Reversal note (recorded per drift-log discipline)

The working hypothesis in `proposal.md` — "adopt ADK's `LlmAgent`, write
`model.LLM` directly per provider" — is **reversed** by this decision. It was
reasoned from real, cited evidence (the session store, the mcptoolset probe,
`emergent.memory`'s precedent) that turned out, on actually building both
options, to be either non-transferable to this bot's shape (mcptoolset,
emergent.memory's precedent) or real but non-decisive (the session store,
addressed above rather than treated as sufficient on its own). The lesson,
consistent with baseline drift-log entry 7 ("check whether a thing is
*called*, not just *present*"): a capability being present and proven
elsewhere is not the same question as whether it is exercised by this specific
shape of work.
