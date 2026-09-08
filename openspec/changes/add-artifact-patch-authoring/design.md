# Design: Sub-object patch authoring

## Context

Verified state of the substrate, from code rather than docs (2026-09-08):

| Concern | Reality |
|---|---|
| Artifact persistence | Whole-payload JSONB. `deriveIndex` (`domain/strategy/service.go:518-578`) upserts `payload = EXCLUDED.payload`. |
| Staging spine | `Stage` (`service.go:298`), `CommitBatch` (`:344`), `DiscardBatch` (`:664`). A "batch" is not an entity — it is `strategy_mutations.batch_id` grouped by `GROUP BY` (`:205-237`). There is no `batches` table and no `BatchMetadata` struct; `batch_metadata` is a free-form `json.RawMessage` column (`internal/domain/models.go:80`). |
| Post-commit | `internal/pipeline/postcommit.go` — 8 steps: ripple resolve, structural ripple, semantic classification, signal dedup, foundation-draft enqueue, convergence loop, schema warnings. Reached from exactly two callers (MCP `commit_batch`, web draft commit). |
| Patch primitive | Does not exist. No JSON Pointer, no RFC 6902/7386, no patch library in `go.mod`. |
| Artifact edit UI | Does not exist. `handlerEntry` (`internal/handler/handler.go:197-200`) has a single `GET` field. |
| Decompose | **Does** exist and is already used: `internal/handler/handler_artifact.go:13` imports `apps/epf-cli/pkg/decompose` and calls `decompose.DecomposePayload("north_star", payload)` at `:203`. Also used by `cmd_import.go:13` and `domain/ingest/service.go:18`. |

The last row corrects an error made during this change's own assessment: an earlier
pass concluded strategy-server does not import epf-cli at all. It does, in three
places including the artifact handler. The conclusion was drawn from a `ripgrep`
invocation on a machine without `ripgrep` installed, where the shell's
`command not found` was swallowed by an `|| echo "not found"` fallback. Recorded
because the failure mode is silent and will recur.

## Goals

- Granular, reviewable artifact edits with no LLM in the path.
- One staging path shared with AI edits.
- No artifact schema or storage migration.
- A primitive the assistant bot can build on unchanged.

## Non-Goals

- Per-sub-object persistence rows. See Decision 1.
- Conversational editing. Separate change.
- Real-time collaborative editing / operational transforms.

## Decisions

### Decision 1 — Patches apply in memory; the payload remains the persisted unit

`StagePatch` loads the committed payload, applies patches in memory, re-validates
the whole payload, and stages it as an ordinary `update` mutation.

**Rejected: per-sub-object rows.** It would break the append-only mutation log,
the Memory ingestion layering (`layer:decomposed` objects are derived from whole
payloads in `cmd_import.go:260-331`), `deriveIndex`'s relationship extraction, and
every existing reader of `strategy_artifacts.payload`. The cost is re-validating a
whole payload for a one-field change, which is cheap and is already what every
commit does.

**Consequence worth stating:** two concurrent patch batches against the same
artifact both load the same base payload, and the second commit silently wins.
That is the *existing* behaviour for whole-payload staging, not a regression — but
granular editing makes concurrent edits far more likely, so it moves from
theoretical to probable. Mitigation is deferred deliberately (see Open Questions).

### Decision 2 — RFC 6901 JSON Pointer, with identity resolution over known types

Raw pointers (`/beliefs/2/statement`) are the wire format. For sub-object types
that carry a stable identity field, a patch may address by identity and the service
resolves it to a pointer before applying.

**Why identity matters:** index-addressed patches are fragile under reorder. A user
who reorders beliefs in one batch and edits belief 2 in another gets a silent
mis-edit. Identity resolution eliminates the class.

**Where identity comes from:** `decompose.DecomposePayload` already produces typed
sub-objects with keys for the artifact types with bespoke views, and is already a
dependency of the artifact handler. Reuse it rather than re-deriving structure.

**Coupling risk, stated honestly.** `retire-epf-cli` (0/35, in flight) intends to
delete `apps/epf-cli`. This change would deepen strategy-server's dependency on
`apps/epf-cli/pkg/decompose` from one call site to several. That is a real coupling
cost, not a blocker: `pkg/` is the deliberately-exported half (strategy-server
already cannot import epf-cli's `internal/`, per `AGENTS.md:30-31`), and
`retire-epf-cli`'s own non-goals say equivalents are "implemented natively or share
canonical-EPF content". The mitigation is to route every decompose call in this
change through one internal adapter so the eventual move is one file, not a grep.

### Decision 3 — Identity resolution is best-effort; raw pointers always work

Not every artifact type has a bespoke decomposer, and not every sub-object has a
stable identity field. Identity addressing is an optimisation available where the
structure supports it; raw pointers are the universal fallback and the only thing
the MCP tool contract guarantees. This keeps the primitive total over all artifact
types rather than working only for the six with bespoke views.

### Decision 4 — `patch_artifact` goes in `core`

The probe finding is decisive: a fresh MCP session sees only the 13 `core` tools
(`internal/mcpserver/tool_filter.go:287-316`, core forced on at `:301`). A
delegated agent reaching `/mcp` via `mcptoolset` must call `set_tool_filter` before
its tool set is complete.

Three options were considered:

| Option | Verdict |
|---|---|
| Register under `authoring` | Correct by category taxonomy, but invisible to every fresh session. Pushes a `set_tool_filter` precondition into every consumer, including the authoring bot itself. |
| Register under `core` | Slightly stretches "core", but makes the estate's primary granular-write tool reachable by default. Core is 13 tools; one more is not the thing that blows a context budget. |
| Register in both | The filter is a name→category map (`ToolCategories`, one category per name). Not expressible without changing the filter's data model. |

**Chosen: `core`.** The alternative optimises taxonomy purity at the cost of making
the tool undiscoverable, and "unknown tool names pass through unfiltered"
(`tool_filter.go:306-309`) means a mis-categorised name fails open in a confusing
way rather than a loud one.

### Decision 5 — Editability is a descriptor, not a hardcoded template branch

A per-type, per-sub-object capability descriptor drives whether an Edit affordance
renders. Canonical-derived structure is read-only.

**Why not just omit the button in the templ:** the same descriptor must gate the
POST handler and the MCP tool. Editability enforced only in the view is not
enforced at all — the handler is directly reachable. One descriptor, three readers,
defence in depth.

### Decision 6 — Manual edits reuse the existing draft review screen

`POST` → `StagePatch` → 303 redirect to `/aim/draft-review/:batchID`. No new review
surface. This follows the precedent already set by `handler_ready_draft.go:71-81`,
which does exactly this for AI drafts, and it is what makes "one staging path" true
in code rather than in prose.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Patch application on deeply nested or heterogeneous payloads is subtly wrong | Table-driven tests per artifact type against real committed payloads; every patch re-validated against the canonical schema before staging, so a malformed result cannot be staged. |
| Concurrent edits silently clobber | Pre-existing for whole-payload staging; made more likely here. Deferred — see Open Questions. Not silently ignored. |
| Deepened `epf-cli/pkg/decompose` coupling vs `retire-epf-cli` | Single internal adapter (Decision 2). Raw-pointer fallback means the primitive does not *require* decompose (Decision 3). |
| `core` category grows by precedent | Decision 4 is specific to a write primitive that every agent needs. Record the reasoning so the next tool has to argue for it rather than cite this. |
| Diff rendering from `batch_metadata` drifts from actual applied patches | Write the diff in the same function that applies the patches, from the same values. Not reconstructed at read time. |

## Migration Plan

1. `StagePatch` + patch application + schema revalidation + tests. No UI.
2. `patch_artifact` MCP tool (Decision 4 category) + structured errors.
3. Batch provenance in `list_pending_batches` + review-screen attribution.
4. Editability descriptor + POST handler + one artifact type end to end.
5. Roll the edit affordance across remaining artifact types.

Steps 1–3 are independently shippable and independently useful — step 2 alone gives
external agents granular editing.

## Open Questions

1. **Concurrent edit conflicts.** Options: optimistic concurrency on a payload
   version/hash carried through the patch call and rejected on mismatch; or
   last-write-wins with the conflict surfaced at review. Deliberately not decided
   here — it wants a real edit-collision case to design against, and the review gate
   means a clobber is visible before it commits, not after. Revisit when the
   assistant bot can stage patches concurrently with a human editing the same
   artifact, which is the first point at which this stops being hypothetical.
2. **`append` / `insert` semantics against schema `maxItems`.** `skillexec` already
   has `fixMaxItemsViolations` (`executor.go:1755`) which auto-trims. Should a patch
   that overflows `maxItems` be rejected, or trimmed with a warning? Rejection is
   the safer default for a human-initiated edit; the skill path's auto-trim exists
   for LLM output where a retry is expensive. Lean reject; confirm during step 1.
3. **Does the editability descriptor belong in the self-model?**
   `internal/selfmodel` publishes artifact types and schemas. "Which fields an agent
   may edit" is arguably part of what a remote agent needs to use this service
   competently (`agent-contract` Requirement 4). Not resolved here; noted so the
   bot change can pick it up with a real consumer.
