# Design: The strategy authoring agent

## Context

This design assumes `add-artifact-patch-authoring` (the write primitive) and
`decide-authoring-agent-runtime` (the runtime, decided: hand-rolled loop) have
landed. What follows is specific to the agent and the coherence council.

Verified substrate, 2026-09-08:

| Concern | State |
|---|---|
| Chat UI | None. No templ file contains "chat"; DaisyUI's `chat` classes ship unused. |
| Conversation storage | None. `adk_sessions` + 3 siblings exist, no writer, retained for this. |
| Ripple engine | Real, running, post-commit, similarity-score-based. Confirmed **cannot** detect negation-style meaning inversion — a search-relevance score or word-overlap ratio scores "X" and "not X" as highly similar. Not being replaced by this change. |
| `propose_change` (MCP) | Takes no proposed content — only enumerates current graph connectivity and staleness of the *existing* artifact. Cannot evaluate a candidate edit. Reused here only as a connectivity query, not as the pre-commit tool it sounds like. |
| Multi-artifact batches | Real. One `batch_id` spans artifact types; `aim_draft_review.templ` already renders "N items, one shared rationale, commit/discard together." The shared rationale (`batch_metadata.change_summaries`) is currently written only by skill executors. |
| `opencode-harness`'s expert/council pattern | Real, running, portable Go (zero OpenCode dependency), already exposed as a generic MCP server. Concurrency is goroutines around independent LLM calls — no framework feature. Explicitly rejected ADK for its own orchestration engine, citing the uncapped loop and missing Anthropic model — independently corroborating `decide-authoring-agent-runtime`. Also found: an unfiltered 61-tool MCP toolset caused wrong-tool selection; only worked pre-filtered. |
| epf-cli's cross-artifact consistency | Achieved entirely by LLM in-context re-reading against static prompt guidance (`synthesizer` agent is the clearest example) — no tooling, no verification, works because the conversation is long and disciplined. |

## Goals

- A conversational agent that reaches epf-cli's agent-first authoring parity,
  natively, in strategy-server's UI.
- Genuine, content-aware reasoning about cross-artifact implications — proven
  necessary because the existing score-based mechanism provably fails on
  meaning-inverting edits.
- A council mechanism that is useful today with a fixed expert set and does
  not need a rewrite to become configurable later.
- No parallel mechanism where one already exists — staging spine, review UI,
  skill format, tool-filter categories.

## Non-Goals

- Full per-project expert/pipeline configuration (`opencode-harness`'s
  `pipeline.yaml` equivalent). Explicit non-goal in `proposal.md`.
- Replacing or rewiring `domain/ripple`.
- Token streaming.

## Decisions

### Decision 1 — The council is judgment-triggered, not automatic

The agent itself decides whether a proposed edit is significant enough to
consult the council, versus staging directly through
`add-artifact-patch-authoring`'s primitive.

**Rejected: always-on council review** (mirroring `opencode-harness`'s code
review gate, which reviews every diff unconditionally). Every strategy edit
running N parallel LLM calls before it can stage is real latency and real cost
for the overwhelming majority of edits, which are trivial. `opencode-harness`
can afford unconditional review because it gates *commits*, a naturally
coarser-grained event than *every keystroke-equivalent artifact edit*.

**Rejected (for now): config-driven triggering.** A legitimate future
direction — different projects may reasonably want different thresholds — but
it presupposes a config surface for experts that does not exist yet (Decision
2). Building the trigger's configurability before the thing it triggers is
configurable is solving the wrong half first.

**Consequence to watch:** the agent's own judgment is now a real point of
failure — an edit that should have triggered the council but didn't produces
exactly the failure mode this change exists to prevent. Task 5 must include a
test corpus of edits that *should* trigger review (negation, scope changes,
commitment reversals) and verify the agent's judgment catches them, not just
that the mechanism works when triggered.

### Decision 2 — Experts are built-in and fixed, shaped as skills

Ship a small, fixed set of experts (starting with `coherence`) as
skill-shaped primitives — `skill.yaml` + `prompt.md`, matching the convention
already used by strategy-server's 30 embedded skills — rather than either (a)
hardcoding them as inline Go logic with no shape at all, or (b) building
`opencode-harness`'s full YAML-config-layering system now.

**Why skill-shaped rather than inline:** the moment user-configurable experts
becomes real work (explicitly deferred, not if-never), the shape already
exists to extend — a new expert is a new skill directory, matching exactly how
a new drafting skill is added today. Building this shape now costs little and
avoids a rewrite later.

**Why not the full config system now:** `opencode-harness`'s
`pipeline.yaml`/`experts/*.yaml`/`llm.yaml`/`tools.yaml` is real, tested, and
good — but it is solving "let any project define its own committee of
reviewers with their own models and rules." We do not yet know whether
strategy-authoring customers want that degree of control, or whether two or
three well-chosen built-in experts cover the overwhelming majority of real
cases. Building the general mechanism before that's known is speculative
generality — ship the fixed set, learn from real usage, generalize once the
shape of the need is known rather than guessed.

### Decision 3 — Council concurrency is plain goroutines, proven cheap and runtime-agnostic

Verified live, not assumed: a two-expert council (`coherence`, `clarity`)
fanned out via `sync.WaitGroup` against the real configured provider, on the
exact negation example from `proposal.md`, correctly identified the
inconsistency using genuine reasoning. The concurrency-specific code — the
fan-out and join, not the underlying single-shot call each expert makes — is
approximately 20 lines and exercises no framework feature.

**This does not reopen `decide-authoring-agent-runtime`.** A council expert is
an independent LLM conversation, not a tool call inside the main agent's own
turn — the concurrency this needs (running N separate conversations at once)
is orthogonal to what runs the main agent's loop. `opencode-harness`'s own
council is built the same way, on its own hand-rolled runtime, for the same
reason.

**What this does not settle**, stated precisely so it isn't overclaimed: the
main agent's own turn issuing multiple *tool calls* that need genuine
concurrent dispatch (`decide-authoring-agent-runtime`'s revisit trigger 2, as
originally scoped) was not tested by this and remains a live, distinct
question if it materializes — a council expert reviewing artifacts is not the
same shape as the main agent calling two tools in one turn.

### Decision 4 — Verdict synthesis reuses the existing review UI's rationale field

The council's combined verdicts become the `batch_metadata.change_summaries`
already rendered by `aim_draft_review.templ` — currently written only by
skill executors. No new review surface, no new rendering logic; the council
becomes a second writer of a field that already displays correctly.

**Attribution matters here specifically.** The review screen must show
*which* expert flagged *what*, with *why*, not a merged, anonymous summary —
a reviewer deciding whether to trust a flagged inconsistency needs to see the
reasoning that produced it, the same way a human PR reviewer's comment is
attributed to them, not folded into "the review said X."

### Decision 5 — The tool surface is actively scoped, independent of runtime

`opencode-harness`'s own probe — a real, first-hand finding, not a
hypothetical — found that exposing 61 unfiltered MCP tools caused its model to
select the wrong one and fail; it only worked once pre-filtered. Strategy-
server has 153 tools across 14 categories, already filtered per-session by
`internal/mcpserver/tool_filter.go` (core-only by default, 13 tools).

The authoring agent must construct its own scoped view — likely `core` plus
`authoring`, `strategy`, `evidence`, and the connectivity-query subset of
`ripple` — rather than requesting the full catalogue. This is a tool-surface-
design decision, independent of `decide-authoring-agent-runtime`'s hand-rolled
loop choice; it would be exactly as necessary under ADK.

### Decision 6 — Web research treats fetched content as data, never instructions

The tool's result shape must delimit and label fetched content distinctly
from the agent's own reasoning — e.g. wrapped and tagged as
`<fetched_content source="...">...</fetched_content>` in the tool result, with
the system prompt stating plainly that content inside that tag is data to
reason about, never an instruction to follow, regardless of what it claims to
be.

**Why this matters specifically here, not just in general:** this is a
write-capable agent. A knowledge-only bot that gets prompt-injected can at
worst say something wrong; a write-capable one that gets prompt-injected could
be steered toward staging a change it shouldn't. The staging gate is the
backstop (nothing commits without human review), but the tool boundary should
not rely on the backstop alone — designing the boundary is cheap; discovering
its absence via an actual injected change reaching review is not the way to
find this gap.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Agent's judgment misses an edit that should trigger the council (Decision 1) | Test corpus of should-trigger edits (negation, scope change, commitment reversal), not just mechanism tests |
| Fixed expert set proves too narrow for real usage | Skill-shaped from day one (Decision 2) — extension is additive |
| Council latency on genuinely significant, multi-artifact edits | Parallel dispatch (Decision 3) keeps wall-clock cost to the slowest single expert, not the sum |
| Review screen can't distinguish council reasoning from skill-executor reasoning | Decision 4's attribution requirement — per-expert, not merged |
| Web research tool is a prompt-injection vector | Decision 6's delimiting design, defence-in-depth with the existing staging gate |
| Runtime decision gets second-guessed again as scope grows | `decide-authoring-agent-runtime`'s decision.md now carries two independent corroborations (opencode-harness's own rejection, this council's measured concurrency cost) — cite before re-litigating |

## Migration Plan

1. Agent skeleton, scoped read-only tool set (Decision 5), mock agent.
2. Conversation persistence.
3. Chat drawer + progress streaming.
4. `coherence` expert as a skill-shaped primitive, council fan-out (Decisions 2-3), judgment-based trigger (Decision 1), verdict synthesis into `change_summaries` (Decision 4).
5. Write tools (`propose_patch` first) behind the declarative gate.
6. Web research tool with untrusted-content handling (Decision 6).
7. `delegation_chain`, the end-to-end proof, card generation, go live.

Steps 1–3 ship a genuinely useful read-only agent with no write risk. Step 4
is separable enough to become its own change if it grows in the doing —
flagged in `tasks.md`, not decided here.

## Open Questions

1. **Does the initiating principal survive a DBOS park/wake?** Carried
   unresolved from the prior rewrite — must be answered by the delegation
   proof (task 7), not assumed.
2. **Does the editability descriptor belong in the self-model?** Carried from
   `add-artifact-patch-authoring`.
3. **When (not if) experts become configurable, does the trigger (Decision 1)
   become config-driven at the same time, or separately?** Not resolved —
   deliberately deferred until the first real request for either.
4. **Should the `coherence` expert's candidate-artifact set come from
   `AnalyzeStructuralRipple`'s connectivity query alone, or should it also
   consider semantically-similar-but-unconnected artifacts** (the kind
   `domain/ripple`'s clustering detector finds)? Structural connectivity is
   the safer default (precise, explainable); semantic clustering risks false
   positives from the same score-based blind spots this change exists to
   avoid. Lean structural-only for v1; revisit if real usage shows the council
   is missing genuinely related but unlinked artifacts.
