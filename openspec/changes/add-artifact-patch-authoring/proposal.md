# Change: Sub-object patch authoring — granular edits without an LLM

> **Split from `add-artifact-assistant-bot` (2026-09-08).** That change bundled a
> boring, unblocked, LLM-free editing primitive with a conversational agent blocked
> on an unresolved runtime decision (baseline open question 6). The primitive is a
> hard prerequisite for the agent, so bundling them meant the agent's open question
> gated work that has no open questions at all.
>
> This change carries the primitive. `decide-authoring-agent-runtime` closes the
> runtime question. `add-artifact-assistant-bot` then builds the agent on top of
> both.

## Why

The artifact model is whole-payload JSONB end to end. `deriveIndex`
(`domain/strategy/service.go:518-578`) does an `INSERT … ON CONFLICT DO UPDATE SET
payload = EXCLUDED.payload`; there is no addressable sub-object write anywhere in
the codebase. Confirmed absent: no JSON Pointer, no RFC 6902/7386, no patch
dependency in `go.mod`.

The web UI is correspondingly read-only. `handlerEntry`
(`internal/handler/handler.go:197-200`) has exactly one field — `GET` — and the
screen registry maps GET only. `internal/ui/artifact_viewer.templ` renders payload
maps into `<h3>`/`<span>`/`<details>` with zero form controls. **There is no POST
route in the entire server that mutates an artifact payload directly.**

So the only way to change one belief, rename one value-model component, or fix one
KR is to regenerate the whole artifact through an LLM skill, or hand-edit YAML in
the source repo and re-import. A one-word correction costs a full `draft-*` run:
an LLM call, a whole-payload revalidation, and a review of a diff that touches
everything.

Two consequences worth naming:

1. **Every edit is pushed through the LLM**, including edits where the human is
   certain and the model can only introduce error.
2. **The assistant bot cannot be built well without this.** An agent that can only
   regenerate whole artifacts produces unreviewable diffs. Surgical edits require a
   surgical primitive, and the primitive is useful on its own.

## What Changes

### 1. Sub-object patch primitive (`domain/strategy/`)

- **ADD** `StagePatch(ctx, instanceID, artifactKey, []Patch) (batchID, error)` where
  `Patch` is `{op: set|remove|append|insert, path: <RFC 6901 pointer>, value: any}`.
  The service loads the current committed payload, applies the patches in memory,
  re-validates the **full** payload against the canonical EPF schema, and stages the
  result as an ordinary whole-payload `update` mutation.
- **No schema or storage migration for artifacts.** The payload stays the unit of
  persistence; patches are the unit of *authoring*. This preserves the append-only
  mutation log, the Memory ingestion path, and every existing reader.
- **ADD** before/after values per patch into `batch_metadata`
  (`internal/domain/models.go:80`, already a free-form `json.RawMessage`) so review
  can render a precise per-field diff rather than a whole-payload dump.
- **ADD** identity-based path resolution for sub-object types that carry a stable
  identity field, so a patch can address "the belief with id X" rather than
  `/beliefs/2` — which is fragile under reorder.

### 2. Manual sub-object edit UI (`strategy-web`)

- **ADD** per-sub-object "Edit" affordances on artifact views, opening an inline
  templ+HTMX form scoped to that sub-object's fields.
- **ADD** add / remove / reorder controls for list-typed sub-objects.
- **ADD** the first artifact-mutating POST handler in the server. It builds the patch
  set, calls `StagePatch`, and redirects to the **existing** draft review screen
  (`/aim/draft-review/:batchID`). Manual edits are never auto-committed — they use
  the same human gate as AI edits.
- **ADD** a per-type, per-sub-object editability descriptor. Canonical-derived
  structure (value-model layer skeletons, track definitions) stays read-only;
  editing is confined to human-authored content.

### 3. `patch_artifact` MCP tool (`strategy-mcp`)

- **ADD** the same primitive as an MCP tool so external and delegated agents get
  granular editing, staged for human review like every other authoring tool.
- **DECIDE the tool category explicitly.** This is not a formality:
  `establish-agent-contract/design.md` §8 proved by probe that the per-session
  category filter (`internal/mcpserver/tool_filter.go`) applies to remote
  `mcptoolset` callers exactly as to any MCP client — **a fresh session sees 13
  `core` tools, not all 153**. A `patch_artifact` registered under `authoring` is
  invisible to a delegated agent that has not called `set_tool_filter` first. That
  probe named this change as the place to design around it.

### 4. Batch provenance (absorbed leftover)

- **ADD** `source_skill` / `source_run_id` to `list_pending_batches`.

  This is `add-operational-transparency` task 5.4, the single unfinished item in an
  otherwise-complete change (verified: `domain/strategy/service.go:196-202`'s
  `PendingBatch` carries `BatchID`/`ArtifactCount`/`AgentID`/`BatchDescription`/
  `StagedAt` and nothing else; `batch_metadata` already holds `skill_name`, written
  by `skillexec.finalizeBatch` at `executor.go:1519-1556`, and is simply never read
  back).

  It is absorbed here rather than left waiting because this change adds a *second*
  producer of staged batches. Once a batch can come from a background ripple draft,
  an AIM cycle step, or a human clicking Edit, "where did this pending batch come
  from" stops being nice-to-have and becomes required for the review screen to make
  sense. It is roughly thirty lines.

## Impact

- **Affected specs:** `strategy-authoring` (patch primitive, human gate),
  `strategy-web` (manual sub-object editing), `strategy-mcp` (`patch_artifact`).
- **Affected code:**
  - Modified: `domain/strategy/service.go` — `StagePatch`, patch application, diff
    into `BatchMetadata`; `ListPendingBatches` gains provenance
  - Modified: `internal/handler/handler.go` — `handlerEntry` gains a POST seam;
    new routes
  - New: `internal/handler/handler_artifact_edit.go`
  - Modified: `internal/ui/artifact_viewer.templ` and the bespoke artifact views
  - Modified: `internal/mcpserver/` — register `patch_artifact`, category decision
- **No migration.** `batch_metadata` is already free-form JSONB.
- **No breaking changes** to existing MCP tools, routes, or the mutation schema.

## Non-goals

- **The conversational assistant.** Separate change, separate prerequisites.
- **`delegation_chain` on mutation rows.** `establish-agent-contract/design.md` §7
  explicitly defers this to "whichever change first has a real delegated call to
  prove it against". A human clicking Edit is not a delegated call. The bot is —
  so it lands there, with a producer, rather than here as an unexercised column.
- **Fixing the `ingest_evidence` staging bypass.** Worth stating plainly because it
  contradicts this change's first design principle: `domain/evidence/service.go:118-180`
  writes a `committed` mutation **and** upserts `strategy_artifacts` in a single
  call — no batch, no review. Eight admin tools do likewise. That is a real
  inconsistency in the "one staging path" claim, but it is pre-existing, unrelated
  to granular editing, and fixing it changes evidence semantics. It should be its
  own change; it is recorded here so it stops being invisible.
- **Emitting the 12 dead activity constants.** `domain/activity` declares 20 event
  types and emits 8. Related, but it belongs with whoever next owns the commit path.

## Design Principles

1. **One staging path.** Manual edits, AI edits and bootstrap drafts all produce
   staged batches through the same human gate. No edit surface bypasses review.
2. **Payload is the unit of storage; patches are the unit of authoring.** No schema
   migration; patches apply in memory and re-stage the full, re-validated payload.
3. **Structure is sacred where canonical.** Canonical-derived structure stays
   read-only or activation-only.
4. **Useful with no LLM configured.** This entire change works with `LLM_PROVIDER_URL`
   unset. That is the point of splitting it out.
