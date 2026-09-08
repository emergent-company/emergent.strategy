# Change: The strategy authoring agent

> **Rewritten again, 2026-09-08, same day as the first rewrite.** The first
> rewrite (see git history) corrected the change against the 2026-09-04
> architecture baseline but kept the original 2026-06-08 scope: a bounded chat
> drawer with three narrow write tools, ending its turn after one staged
> patch. That scope is too small for what this change actually needs to be.
>
> **The change id stays `add-artifact-assistant-bot`** for continuity — it is
> referenced by name in `establish-agent-contract`, `docs/AIM_ARCHITECTURE_AND_
> CROSS_REPO_REUSE.md`, `internal/agentcard/authoringbot.go`, and three
> archived changes. Renaming would break those references for a cosmetic gain.
> Read the title as the actual scope, not the id.
>
> **Why the scope changed:** epf-cli is frozen specifically because
> strategy-server is meant to replace it as the primary authoring surface for
> anyone — not eventually, that is the stated reason it stopped receiving
> features (`retire-epf-cli/proposal.md`). The bar this change must clear is
> parity with epf-cli's agent-first authoring experience — six persona agents,
> a semantic engine, dogfooded on the company's own real strategy — done
> natively in strategy-server's UI, not a bolt-on edit helper.

## Why

### The two existing mechanisms for cross-artifact consistency are both inadequate, for different reasons

**epf-cli's agents** (`pathfinder`, `product-architect`, `synthesizer`) maintain
cross-artifact consistency entirely through prompt discipline — the LLM
re-reads its own prior output and reasons in context against static written
guidance. There is no tooling backing this; it works because the conversation
is long and the model is instructed to check. Nothing enforces it.

**strategy-server's Ripple Coherence Engine** is a real, sophisticated piece of
infrastructure — but its classification of a change's severity is a **text-
similarity score** (a Memory search-relevance score, or word-set overlap when
Memory is unavailable), thresholded into autonomous/gated/escalated. This is
provably the wrong tool for meaning-level changes. Concretely:

> "We will support enterprise SSO in Q3" → "We will not support enterprise
> SSO in Q3"

shares nearly every word and would very plausibly score as high-similarity —
**autonomous, auto-approvable** — under the existing thresholds. That is the
exact opposite of correct. This was verified live, not asserted: a real LLM
call asked to review this exact edit correctly flagged it as inconsistent,
using genuine reasoning about the two sentences' content; a similarity score
cannot do this by construction, negation-insensitivity is a textbook property
of bag-of-words and embedding-similarity metrics.

**Neither of these compose into what's needed: an agent that reads what a
change actually says, understands its implications, and proposes a
coordinated, reasoned set of changes across the artifacts it affects.**

### No external research capability exists anywhere in the estate

Checked exhaustively: epf-cli's closest thing to a "market research" agent
(`trend_scout`) interviews the *human* for market knowledge — it never fetches
anything. Strategy-server has no web-search tool at all. This is a from-scratch
capability, not an upgrade of something existing.

### A working, portable pattern for exactly this problem already exists — one repository over

`opencode-harness` (a sibling Go project) already solved "how do you get
several independent, config-tunable reviewer perspectives to weigh in on a
proposed change, in parallel, with a consensus rule, feeding a human decision"
— its expert/council mechanism. Verified by reading its source directly, not
its documentation: the concurrency is plain Go goroutines around independent
LLM calls (no framework), the whole thing has zero OpenCode dependency and is
already exposed as a generic MCP server, and — tellingly — its own design docs
say the skill-execution pattern underneath it **was borrowed from strategy-
server/EPF's own skill format in the first place**. This change borrows it
back, adapted to reasoning about strategy artifacts instead of code diffs.

One more thing worth stating plainly, because it independently strengthens a
decision this change depends on: `opencode-harness` faced the identical "ADK
vs hand-rolled" question for its own orchestration engine and rejected ADK,
via different reasoning that converges on the same facts
`decide-authoring-agent-runtime` found (ADK's agent loop is an uncapped
`for{}`; ADK ships no Anthropic model). Two independent investigations, same
conclusion. Detail in that change's `decision.md` addendum.

## What Changes

### 1. The conversational agent (`domain/authoring/` or equivalent)

- **ADD** a model-planned agent on the runtime decided by
  `decide-authoring-agent-runtime` (hand-rolled loop), writing exclusively
  through the staging spine. No commit tool exists, ever.
- **ADD** an explicit unit of work and what ends it — task complete, budget
  reached, or a human gate — per that change's tool-calling seam.
- **ADD** a tool surface that is **actively scoped, not the full MCP
  catalogue.** `opencode-harness`'s own probe found a 61-tool unfiltered
  toolset caused its model to pick the wrong tool and fail; strategy-server
  already has 153. Reuse and extend the existing per-session category filter
  (`internal/mcpserver/tool_filter.go`) rather than inventing a second scoping
  mechanism — this is a tool-surface-design lesson, independent of which
  runtime drives the loop.
- **ADD** a new **web research tool.** Fetched external content is untrusted
  data the agent reasons about, never instructions it follows — this must be
  designed into the tool's result shape from the start (fetched text delimited
  and labelled as data, never injected as if it were a system/developer
  message), because a write-capable agent that also fetches arbitrary external
  content is exposed to indirect prompt injection. Not a reason to avoid the
  capability — a reason to design the boundary deliberately.

### 2. Judgment-based significance triage

- **ADD** the agent's own judgment as the trigger for deeper review, not an
  always-on gate and not (yet) a per-project config toggle. A one-word
  correction stages directly through `add-artifact-patch-authoring`'s
  primitive. An edit the agent judges might have implications elsewhere
  triggers the coherence council (§3) before staging.
- This is deliberately the cheaper default: consulting a panel of experts on
  every trivial edit is real latency and real cost for no benefit. Per-project
  configurability of this trigger is a natural extension once experts
  themselves are configurable (§3's non-goal) — not built now.

### 3. The coherence council

- **ADD** a small, **built-in, fixed** set of expert reviewers — starting with
  a `coherence` expert that reads the artifacts structurally connected to the
  one being edited (reusing `AnalyzeStructuralRipple`'s connectivity query as
  the candidate list, not its scoring) and reasons directly about whether the
  edit's actual content conflicts with them. Room for more (e.g. an
  evidence-grounding expert) without redesigning anything.
- **ADD** parallel dispatch via plain Go goroutines, mirroring
  `opencode-harness/internal/runtime/council.go` exactly — proven live and
  measured: the concurrency-specific code is ~20 lines, exercises no framework
  feature, and is identical in cost whether the main agent's own loop is
  hand-rolled or ADK-based. This is not evidence for either runtime choice; it
  is evidence the choice doesn't matter here.
- **ADD** verdict synthesis into **one coordinated multi-artifact staged
  batch**, using the staging spine's existing support for one `batch_id`
  spanning multiple artifact types, and the existing review screen
  (`aim_draft_review.templ`) which already renders "N items, one shared
  rationale, commit or discard together" — it currently only receives that
  shared rationale from a skill executor's `batch_metadata.change_summaries`;
  this change makes the council a second writer of that same field.
- **ADD** experts as **skill-shaped primitives** — matching the
  `skill.yaml`/`prompt.md` convention already used by strategy-server's 30
  embedded skills — so that user-configurable experts (the natural next step,
  explicitly deferred below) is an additive extension of an existing shape,
  not a rewrite.
- **The council does not replace the Ripple Coherence Engine.** That engine
  keeps running exactly as it does today — a cheap, always-on, post-commit
  backstop with known blind spots. The council is a complementary,
  judgment-gated, pre-commit, content-aware layer. Both flagging the same
  thing is not a conflict; it is defence in depth. Neither this change nor any
  part of it rewires `domain/ripple`.

### 4. Conversation persistence, audit, agent contract closure

Unchanged in substance from the prior rewrite — carried forward here rather
than re-derived:

- Persist conversations on the store `decide-authoring-agent-runtime` settles
  (repoint vs. replace `internal/adk`'s tables), org- and user-scoped, actually
  enforced.
- Tool results are references and summaries, never raw payloads, in the
  conversation record (invariant 4).
- Run/step audit rows for agent turns **and** council invocations, with the
  same fidelity AIM records for cycle steps.
- `delegation_chain` on mutation rows (deferred by `establish-agent-contract`
  §7 to "whichever change first has a real delegated call" — this is it).
- The end-to-end delegation proof (`establish-agent-contract` task 6),
  including answering whether the initiating principal survives a DBOS
  park/wake for the authoring-agent → AIM case (design Open Question 1, still
  open, still needs answering here, not assumed).
- `agentcard.AuthoringBot()` generated from the running agent's real tool set
  and gate configuration, not hand-authored from this proposal's text; flipped
  from `planned` to live.

## Impact

- **Affected specs:** `strategy-authoring` (council review requirement, no-commit
  invariant, delegation chain), `strategy-web` (chat drawer, council
  attribution, external-research disclosure).
- **Affected code:** new agent package; new council package (skill-shaped
  experts, goroutine fan-out, verdict synthesis); new web-research tool with
  untrusted-content handling; `internal/agentcard/authoringbot.go` (generated,
  live); `domain/strategy` (delegation chain, council-authored
  `change_summaries`).
- **Migration:** `delegation_chain` on mutation rows. No new conversation
  tables unless `decide-authoring-agent-runtime`'s follow-up concludes a
  bespoke schema is needed over repointing `internal/adk`'s.
- **Sequencing flexibility:** the council (§3) is separable enough that it
  could become its own change if its scope grows during implementation
  (`tasks.md` flags this explicitly rather than deciding it here).

## Dependencies

| Depends on | For | State |
|---|---|---|
| `add-artifact-patch-authoring` | `propose_patch`; batch provenance for review attribution | Proposed |
| `decide-authoring-agent-runtime` | Runtime decision, tool-calling seam, bounded loop, invariant-4 handling | Proposed — decision recorded, seam (§3-6) still open |
| `establish-agent-contract` §1–5 | Card shape, self-model, federated-approval design, delegation transport | **Complete** |

## Non-goals

- **User-configurable experts.** `opencode-harness`'s full config layering
  (`pipeline.yaml`/`experts/*.yaml`/`llm.yaml`) is a proven pattern worth
  reaching for eventually, not now. Ship built-in experts first; prove the
  mechanism; let real usage determine what should become configurable rather
  than guessing the config surface up front.
- **Automatic (always-on) council triggering**, and **per-project
  configuration of the trigger.** Both are natural extensions once experts are
  configurable. The agent's own judgment is the trigger for v1.
- **Rewiring or replacing `domain/ripple`.** It keeps running unchanged.
- **Fixing the `ingest_evidence` staging bypass**, or emitting the twelve dead
  `domain/activity` constants. Both real, both pre-existing, both out of scope
  here (recorded in `add-artifact-patch-authoring`'s non-goals already).
- **A shared cross-repo module** with `opencode-harness`. The pattern is
  borrowed by re-implementation, not by dependency — consistent with the
  baseline's "no shared module may import ADK" constraint and, more generally,
  with keeping this change's runtime independent of a sibling repo's release
  cycle.

## Design Principles

1. **It is an agent, not an assistant subsystem** — one agent type
   (baseline §1), differing from AIM only in who plans the chain and in write
   set.
2. **Prepare, don't commit.** No commit tool, ever — not in the main agent,
   not in any council expert.
3. **One staging path.** Agent edits, council-reviewed multi-artifact sets,
   manual edits, and skill drafts all share the same gate and the same
   post-commit pipeline.
4. **Reasoning, not scoring, for meaning.** Where the existing ripple engine
   uses similarity thresholds, this agent and its council read actual content
   and reason about it — proven necessary by the negation example above, not
   asserted.
5. **Untrusted content stays untrusted.** External research results are data
   the agent reasons about, never instructions it follows.
6. **Built to extend, not to be replaced.** Experts are skill-shaped from day
   one so that configurability is additive later.
7. **Graceful degradation.** No LLM configured → mock agent; manual editing
   from `add-artifact-patch-authoring` works with no LLM at all.
