# Change: Context-aware artifact authoring agent

> **Rewritten 2026-09-08.** The previous version was written 2026-06-08 and never
> substantively revised: only `proposal.md` was touched on 2026-09-04 (a caveat
> header), while `design.md`, `tasks.md` and all three spec deltas remained exactly
> as first written — three months and two architecture reversals earlier. This
> rewrite replaces all of them.
>
> **Scope narrowed.** The sub-object patch primitive, the manual edit UI and the
> `patch_artifact` MCP tool have moved to `add-artifact-patch-authoring`; they are
> unblocked, LLM-free, and were being held hostage by this change's open runtime
> question. The runtime question itself has moved to
> `decide-authoring-agent-runtime`.
>
> **This change is now only the agent.**

## Why

With the patch primitive in place, a strategy manager can make surgical edits — but
only if they already know exactly what to change and where. What is still missing is
the conversational surface: *"tighten this UVP"*, *"what evidence backs this
assumption?"*, *"add a KR for the retention target"* — asked in place, on the artifact
being read, with the answer arriving as a reviewable staged change rather than as
advice the user then has to execute by hand.

There is a second reason, and it is the one that makes this change load-bearing for
the estate rather than merely useful:

**`establish-agent-contract` cannot finish without a second agent.** Its tasks 1–5 are
complete — research, federated-approval design, self-model publication, agent cards,
delegation transport proven by probe. Tasks 6 and 7 are not, and its own status note
says why: task 6 *"explicitly exercises discovery, invocation, staging, and human
review between two agents, which does not exist until `add-artifact-assistant-bot`
(or whatever ships first) is built."* The contract is currently proven by document
and by probe, not by use.

Related: `internal/agentcard/authoringbot.go` **already publishes a card for this
agent**, at `/.well-known/strategy-server-agents.json`, marked `Status: "planned"`,
`Version: "0.0.0"`, empty URL, declaring the three write skills named below. The
service is advertising an agent that does not exist. Either build it or withdraw the
card.

## What Changes

### 1. The agent (`domain/authoring/` or equivalent)

- **ADD** a model-planned agent over the runtime chosen by
  `decide-authoring-agent-runtime`, using the tool-calling seam built there.
- **ADD** an explicit **unit of work** and what ends it — task complete, budget
  reached, or a human gate. This must be decided before implementation, not
  discovered. The unit is what bounds the conversation; without one, the session
  grows for as long as the drawer stays open.
- **ADD** a read-broad, write-narrow tool set:
  - *Read:* get/search artifacts, list evidence, get signals, semantic search.
  - *Write:* `propose_patch` (over `add-artifact-patch-authoring`'s `StagePatch`),
    `propose_evidence_link`, `propose_skill_run`. Each stages and returns a review
    reference. **There is no commit tool.**
- **ADD** declarative per-tool write gating — `{confirm, disabled}` as data, following
  `emergent.memory`'s `ToolPolicy` (`domain/agents/entity.go:310-323`), **but failing
  closed.** Their implementation logs a warning and lets the tool execute if the
  confirmation gate cannot be created (`executor.go:1620-1628`). For a write-gating
  mechanism that is the wrong default, and it is worth copying the shape while
  explicitly not copying that.
- **ADD** double enforcement: the allowlist applies both when building tool
  definitions and at execution time.

### 2. Conversation persistence

- **ADD** durable, org- and user-scoped conversations, on whichever store the runtime
  decision selects.
- **Do not build a second session store.** Migration `039_drop_adk_tables.sql`
  deliberately retained `adk_sessions` / `adk_session_events` / `adk_app_states` /
  `adk_user_states` *"for whichever engine the authoring bot chooses"*, and
  `internal/adk.SessionStore` already implements ADK's `session.Service` and passes
  ADK's own conformance suite. The original proposal specified fresh
  `assistant_conversations` / `assistant_messages` tables — that is precisely the
  duplication `docs/AI_RUNTIME_CONSOLIDATION.md` §7 counts as the problem
  (*"two bun-backed ADK session stores"*).
- **ADD** multi-tenant scoping that is actually used. `emergent.memory` hardcodes
  `AppName: "agents"` and `UserID: "system"` at every session call site, discarding
  the store's own user scoping. In a multi-tenant server that is not cheaply undone
  later.

### 3. Context assembly with a real budget

- **ADD** per-turn context: the current artifact, its sub-objects, related artifacts,
  linked evidence, open signals — with a top-k and a token ceiling **enforced at the
  boundary**, per `decide-authoring-agent-runtime`'s retrieval-budget requirement.
- The current artifact and any selected sub-object path are passed from the UI in the
  send payload, not inferred from a URL string.

### 4. Chat UI (`strategy-web`)

- **ADD** a drawer on artifact and phase pages: toggle, server-rendered message list,
  send action. There is no chat component in the UI today — no templ file contains
  the string, and DaisyUI's `chat` classes ship in `node_modules` unreferenced.
- **ADD** progress streaming over the **existing** SSE activity fanout
  (`/strategies/:id/activity/stream`), which is already wired client-side in
  `internal/ui/shell.templ` with teardown, reconnect and a polling fallback. Token
  streaming is out of scope for v1.
- **ADD** a deterministic mock agent so the feature degrades gracefully with no LLM
  configured and tests run without one.

### 5. Close the agent contract

- **ADD** `delegation_chain` (JSONB, nullable) alongside the existing `CreatedBy` on
  mutation rows, per `establish-agent-contract/design.md` §2. That change deferred
  the migration to *"whichever change first has a real delegated call to prove it
  against"* — this is it. `CreatedBy`'s semantics are unchanged, so every existing
  reader keeps working.
- **ADD** the end-to-end delegation proof (`establish-agent-contract` task 6):
  discovery via card, invocation via transport, a staged change, review by the
  initiating human — plus the mutation test that an agent attempting to commit is
  refused.
- **ADD** review-surface attribution: *"prepared by the authoring agent, on your
  behalf"*.
- **MODIFY** `internal/agentcard/authoringbot.go` from `Status: planned` to live, with
  a real URL and version — and **generate it from running code** the way
  `agentcard.AIM()` is generated from `CycleWorkflow.CycleSteps()`. It is currently
  hand-authored from this proposal's own text, which its doc comment admits. Hand-
  authored cards rot; that is `agent-contract` Requirement 1.

## Impact

- **Affected specs:** `strategy-web` (assistant drawer), `strategy-authoring` (agent
  write tools stage and never commit; delegation recorded).
- **Affected code:** new agent package; new `internal/handler/handler_assistant.go`;
  new assistant drawer templ; `internal/agentcard/authoringbot.go` (generated, live);
  `domain/strategy` (delegation chain on staged mutations).
- **Migration:** `delegation_chain` on mutation rows. No new conversation tables.
- **Closes:** baseline open questions 3–5 (via `establish-agent-contract` tasks 6–7);
  `establish-agent-contract` reaches 24/24.

## Dependencies

| Depends on | For | State |
|---|---|---|
| `add-artifact-patch-authoring` | `StagePatch` behind `propose_patch`; batch provenance for review attribution | Proposed |
| `decide-authoring-agent-runtime` | The runtime decision, the tool-calling seam across both providers, bounded loop, invariant-4 tool-result handling | Proposed |
| `establish-agent-contract` §1–5 | Card shape, self-model, federated-approval design, delegation transport | **Complete** |

## Coordination — corrected

The previous version hedged: *"if `add-operational-transparency` is not yet merged,
the assistant emits activity events directly and adopts the ledger when available"*,
and claimed `add-strategy-bootstrap-flow`'s "Draft with AI" buttons could stage
through the patch primitive. Both statements are wrong, and the first has been wrong
for three and a half months.

- **`add-operational-transparency` shipped 2026-05-22** (commit `fc3bc42d`), in the
  same commit as its own proposal — which is why its checkboxes were never ticked and
  `openspec list` still reports `0/55`. The skill-run ledger (`domain/skillrun`,
  migration `026`), token propagation, the MCP observability tools, the cascade
  tracker and the client-side SSE wiring all exist. `propose_skill_run` gets ledger
  integration **for free** by calling the executor, which already creates a run row
  and emits `skill.*` events. Zero work. Its one unfinished task — batch provenance —
  is absorbed by `add-artifact-patch-authoring`.
- **`add-strategy-bootstrap-flow` shipped the same day** (commit `be2664f5`,
  "groups 1-11"). But the coordination claim was wrong on the merits regardless: the
  `draft-*` skills generate an artifact **from evidence where none exists**, so there
  is no committed payload to patch. Whole-payload staging is correct for genesis;
  patching is correct for surgical edits. They are complementary primitives on the
  same staging spine, not layers. What they actually share — `strategy_mutations`,
  `batch_id`, and the `/aim/draft-review/:batchID` gate — they already share.

**"Complete but unfiled" is a state the dashboard cannot express, and it is worse
than abandoned: abandoned work does not manufacture fake dependencies.** Both are
being ticked and archived alongside this rewrite.

## Design Principles

1. **It is an agent, not an assistant subsystem.** Under
   `docs/UNIFIED_AGENT_ARCHITECTURE.md` §1 there is one agent type; this and AIM
   differ in who plans the chain and in their write set, and in nothing else that
   should appear in the type system. `internal/agentcard/card_test.go` already
   asserts this structurally — the tests must keep passing once the card goes live.
2. **Prepare, don't commit.** No commit tool. Stage and return a review reference.
3. **One staging path.** Agent edits, manual edits and drafts share the same gate and
   the same post-commit pipeline.
4. **Tool results are not conversation history.** Artifact payloads go to storage; the
   conversation carries a reference and a summary.
5. **Graceful degradation.** No LLM configured → mock agent; manual editing from
   `add-artifact-patch-authoring` works with no LLM at all.
