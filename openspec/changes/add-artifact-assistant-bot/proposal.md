# Change: Add context-aware artifact assistant bot and granular sub-object editing

## Why

Today the strategy-server web UI is read-only for artifacts. The only way to change
an artifact is to run a whole-payload skill (AI draft → review → commit) or call an
MCP tool from an external agent. There are two missing capabilities:

1. **No conversational assistant.** A strategy manager working on an artifact cannot
   ask "tighten this UVP", "what evidence backs this assumption?", or "add a KR for
   the retention target" and have an AI act on it in place. The captable product has
   proven this pattern (a context-aware drawer bot that prepares changes for human
   approval); the strategy-server has all the substrate (LLM client, skill context
   builder, stage/commit/review flow, SSE fanout) but no chat loop wired on top.

2. **No granular editing.** The entire artifact model is whole-payload JSONB
   (`strategy/service.go:518` upserts the full payload on every commit). A user who
   wants to fix one belief, rename one value-model component, or edit one KR must
   regenerate the whole artifact via AI or hand-edit YAML in the source repo. There
   is no edit form and no per-sub-object mutation primitive. This makes small,
   confident human corrections disproportionately expensive and pushes every change
   through the LLM.

These are coupled: the assistant should produce small, surgical, reviewable edits —
which requires a sub-object editing primitive — and the manual edit UI should reuse
the same primitive so AI edits and human edits flow through one staging/review path.

## What Changes

### 1. Sub-object editing primitive (`domain/strategy/`)

- **ADD** a JSON-Pointer-addressable patch operation on the strategy service:
  `StagePatch(instanceID, artifactKey, []Patch)` where each `Patch` is a
  `{op: set|remove|append|insert, path: <RFC6901 pointer>, value: any}`. The service
  loads the current committed payload, applies the patches in memory, re-validates the
  full payload against the canonical schema, and stages the **result as a normal
  whole-payload mutation** (no schema or storage change — the payload remains the unit
  of persistence; patches are the unit of *authoring*).
- Patches are recorded in `BatchMetadata` so the review UI can render a precise
  per-field diff ("changed `/beliefs/2/statement`", "removed `/value_model/layers/0/components/3`").
- The primitive is structure-aware for known artifact types via the existing decompose
  layer so paths can be expressed against named sub-objects (belief, component, KR,
  feature) rather than raw indices where a stable identity field exists.

### 2. Manual sub-object edit UI (`strategy-web`)

- **ADD** per-sub-object edit affordances on the bespoke artifact views: an "Edit"
  action on each editable sub-object (belief, value-model component, KR, etc.) opening
  an inline form (templ + HTMX) scoped to that sub-object's fields.
- **ADD** add/remove/reorder controls for list-typed sub-objects.
- Submitting an edit calls a new POST handler that builds the patch set and calls
  `StagePatch`, then drops the user into the **existing draft review screen** to
  commit or discard. Manual edits are never auto-committed — they use the same human
  gate as AI edits.
- The artifact view stops being globally read-only; editability is per-type and
  per-sub-object, driven by a capability descriptor (some artifacts/fields remain
  read-only, e.g. canonical-derived structure).

### 3. Context-aware artifact assistant (`domain/assistant/`, `strategy-web`)

- **ADD** a `domain/assistant/` package with a bounded tool-use orchestrator
  (max N rounds) over the existing `internal/llm` client, modeled on the captable
  orchestrator: per-turn system-prompt assembly, a tool registry, and an agent loop
  that executes tools and feeds results back until the model returns a final answer.
- **ADD** conversation persistence (a `assistant_conversations` / `assistant_messages`
  table, org- and user-scoped, not in-memory) so sessions survive restarts and respect
  multi-tenant isolation.
- **ADD** per-turn context injection: a `BuildArtifactContext(instanceID, artifactKey)`
  function that assembles the current artifact, its sub-objects, related artifacts,
  linked evidence, and open signals into the system prompt — reusing the
  `skillexec` context builder where possible. The current page/artifact is passed from
  the UI in the send payload (artifactKey + optional selected sub-object path), not
  just a URL string.
- **ADD** an assistant tool set that is **read-broad, write-narrow**:
  - Read tools: get/search artifacts, list evidence, get signals, semantic search.
  - Write tools: `propose_patch` (prepares a `StagePatch`), `propose_evidence_link`,
    `propose_skill_run`. These **prepare staged batches and return a review link** —
    the assistant never commits. Enforced by an allowlist applied both when building
    tool defs and at execution time (defense in depth), mirroring captable's pattern.
- **ADD** a chat drawer UI (templ) on the artifact and phase pages: a toggle button,
  a server-rendered message list, and a send action. Streaming of intermediate
  progress (tool calls, "preparing change…") reuses the existing SSE activity fanout;
  token streaming is out of scope for v1.
- **ADD** a `MockAssistant` fallback (keyword → tool) so the feature degrades
  gracefully and tests run with no LLM configured (captable pattern).

### 4. MCP parity

- **ADD** an MCP tool surface for the sub-object patch primitive
  (`patch_artifact`) so external agents get the same granular-edit capability,
  staged for human review like all other authoring tools.

## Impact

- Affected specs: `strategy-authoring` (sub-object patch primitive, MCP patch tool),
  `strategy-web` (manual edit UI, assistant drawer), `strategy-mcp` (patch_artifact tool)
- Affected code:
  - New: `domain/assistant/` (orchestrator, tool registry, context builder, session store)
  - Modified: `domain/strategy/service.go` (StagePatch + patch application/diff in BatchMetadata)
  - Modified: `internal/handler/handler_artifact.go` (edit forms + patch POST handler),
    `internal/handler/handler.go` (routes), new `internal/handler/handler_assistant.go`
  - Modified: `internal/ui/` bespoke artifact views (edit affordances), new `assistant_drawer.templ`
  - Modified: `internal/mcpserver/` (register `patch_artifact`)
  - Modified: `internal/llm/client.go` only if a multi-turn `Chat([]ChatMessage)` entry
    point and `tools`/function-calling support are not already sufficient
- New migration: `assistant_conversations`, `assistant_messages` tables
- No change to `strategy_artifacts` / `strategy_mutations` schema — payload remains the
  persisted unit; patches are an authoring/diff layer
- No breaking changes to existing MCP tools or APIs

## Coordination with in-flight changes

- **`add-operational-transparency`** introduces the skill run ledger, token
  propagation, and activity events. The assistant's `propose_skill_run` tool and its
  progress streaming SHOULD reuse that ledger and activity stream rather than add a
  parallel mechanism. If that change is not yet merged, the assistant emits activity
  events directly and adopts the ledger when available.
- **`add-strategy-bootstrap-flow`** adds "Draft with AI" buttons and READY edit flows.
  The manual sub-object edit primitive here is the lower-level mechanism those buttons
  and the bootstrap drafts can stage through; this change provides the editing
  substrate, bootstrap provides the genesis workflow.

## Design Principles

1. **One staging path.** AI edits, manual sub-object edits, and bootstrap drafts all
   produce staged batches reviewed and committed through the same human gate. No edit
   surface bypasses review.
2. **Prepare, don't commit.** The assistant has no commit tool. It stages and returns
   a review link. Humans commit.
3. **Payload is the unit of storage; patches are the unit of authoring.** No schema or
   storage migration for artifacts — patches apply in memory and re-stage the full,
   re-validated payload.
4. **Structure is sacred where canonical.** Canonical-derived structure (value-model
   layers, track definition skeletons) stays read-only or activation-only; editing is
   confined to human-authored content.
5. **Graceful degradation.** No LLM configured → MockAssistant; the manual edit UI
   works with no LLM at all.
