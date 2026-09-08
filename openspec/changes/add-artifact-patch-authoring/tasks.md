# Tasks: Sub-object patch authoring

Record the test baseline before starting. As of 2026-09-08, from
`apps/strategy-server` with Postgres up (`task dev-deps`), `go test ./...` passes:
**40 packages with tests, 0 failures**. `task lint` clean.

## 1. Patch primitive (`domain/strategy/`)

- [ ] 1.1 Define `Patch{Op, Path, Value}` with `op ∈ {set, remove, append, insert}`
      and `Path` an RFC 6901 JSON Pointer. Decide the library-vs-hand-rolled question
      first: the repo has **no** JSON Pointer dependency today, and only four ops are
      needed. Prefer hand-rolled over pulling RFC 6902 in whole — but check
      `go.sum` for a transitively-available implementation before writing one.
- [ ] 1.2 Implement pointer resolution: navigate `map[string]any` / `[]any` payloads,
      including the RFC 6901 `~0`/`~1` escapes and the `-` end-of-array token for
      `append`. Return a typed path-resolution error, never a panic.
- [ ] 1.3 Implement the four ops against a resolved location. `insert` and `append`
      are array-only; `set` creates a missing final key on a map but MUST NOT create
      intermediate levels (silent structure invention is how patch APIs corrupt data).
- [ ] 1.4 Implement `StagePatch(ctx, instanceID, artifactKey, []Patch) (uuid.UUID, error)`:
      load committed payload → deep-copy → apply patches in order → re-validate the
      **full** payload against the canonical EPF schema → `Stage` an `update` mutation.
      On any failure, stage nothing.
- [ ] 1.5 Record the applied patches with before/after values into `batch_metadata`,
      written by the same function that applies them (design Decision 6 rationale —
      do not reconstruct the diff at read time).
- [ ] 1.6 Decide `maxItems` behaviour for `append`/`insert` (design Open Question 2 —
      lean reject) and implement it. Record the decision in this file.
- [ ] 1.7 Tests: table-driven per op; nested paths; array boundaries; `~0`/`~1`
      escapes; unresolvable path; patch producing a schema-invalid payload stages
      nothing; patch ordering matters and is honoured.
- [ ] 1.8 Verify by mutation that 1.7's "stages nothing on invalid" test genuinely
      detects — make `StagePatch` skip revalidation, confirm the test fails, revert.

## 2. Identity-based path resolution

- [ ] 2.1 Create a single internal adapter over `apps/epf-cli/pkg/decompose` (design
      Decision 2 — one file, so `retire-epf-cli` is a one-file move rather than a
      grep). Route the three existing call sites through it as part of this task, or
      record explicitly why not.
- [ ] 2.2 Resolve `{type, identity}` → JSON Pointer for sub-object types that carry a
      stable identity field. Enumerate which types actually do — do not assume all
      six bespoke-view types qualify.
- [ ] 2.3 Confirm raw pointers still work for every artifact type with no decomposer
      (design Decision 3). Test at least one type that has no bespoke view.
- [ ] 2.4 Test: reordering a list then patching by identity edits the intended
      sub-object; the same patch expressed by index edits the wrong one. Both
      assertions in one test — the second is what proves identity resolution earns
      its complexity.

## 3. `patch_artifact` MCP tool

- [ ] 3.1 Register `patch_artifact` in the **`core`** category (design Decision 4).
      Add the reasoning as a comment at the registration site, not only here.
- [ ] 3.2 Structured error responses for invalid path and failed validation — never a
      raw Go error (`AGENTS.md` §4).
- [ ] 3.3 Test: a fresh MCP session — no `set_tool_filter` call — can see and invoke
      `patch_artifact`. This is the assertion that makes Decision 4 real; without it
      the category choice is untested prose. Follow the pattern in
      `internal/mcpserver/mcptoolset_probe_test.go` (note its documented gotcha:
      streamable-HTTP clients hold an SSE GET open, so `CloseClientConnections()`
      before `Close()` or the test hangs).
- [ ] 3.4 Regenerate `self-model.json` (`task selfmodel:check` will fail until you
      do — `internal/selfmodel` introspects the real registration path, so the tool
      count moves from 153 to 154).

## 4. Batch provenance (absorbed `add-operational-transparency` 5.4)

- [ ] 4.1 Extend `strategy.PendingBatch` (`domain/strategy/service.go:196-202`) with
      `SourceSkill` and `SourceRunID`, read from the existing `batch_metadata`
      (`skill_name` is already written by `skillexec.finalizeBatch`,
      `executor.go:1519-1556`, and never read back).
- [ ] 4.2 Surface both in the `list_pending_batches` MCP tool response.
- [ ] 4.3 Have `StagePatch` write its own provenance so a human-initiated patch batch
      is distinguishable from a skill-generated one at review time.
- [ ] 4.4 Test: batches from a skill run, from a patch, and from a ripple draft are
      distinguishable in `ListPendingBatches` output.

## 5. Editability descriptor

- [ ] 5.1 Define the per-type, per-sub-object descriptor. Canonical-derived structure
      (value-model layer skeletons, track definitions) is read-only.
- [ ] 5.2 Enforce it in **three** places: view rendering, the POST handler, and
      `patch_artifact` (design Decision 5 — view-only enforcement is not enforcement).
- [ ] 5.3 Test: a patch targeting a read-only path is refused by the handler *and* by
      the MCP tool, not merely absent from the UI.

## 6. Manual sub-object edit UI

- [ ] 6.1 Extend `handlerEntry` (`internal/handler/handler.go:197-200`) with a POST
      seam. It currently has exactly one field, `GET`, and `RegisterRoutes`
      (`:253-275`) only ever calls `e.GET` — so this is a small but genuinely
      structural change to the graph-driven routing.
- [ ] 6.2 New `internal/handler/handler_artifact_edit.go`: parse form → build patch
      set → `StagePatch` → 303 to `/aim/draft-review/:batchID` (mirroring
      `handler_ready_draft.go:71-81`).
- [ ] 6.3 Inline edit form component (templ + HTMX), scoped to one sub-object's
      fields, following the `render.RenderTriple` three-tier pattern.
- [ ] 6.4 Add/remove/reorder controls for list-typed sub-objects → `append` / `remove`
      / `insert` patches.
- [ ] 6.5 Wire the affordance into **one** artifact type end to end and prove the full
      loop before rolling out.
- [ ] 6.6 Roll out to the remaining bespoke artifact views.
- [ ] 6.7 Per-field diff rendering on the draft review screen, from the
      `batch_metadata` written in 1.5.
- [ ] 6.8 i18n: new user-visible strings go in `internal/langs/langs.go` in **both**
      EN and NB. `complete-i18n-templ-prose` exists because this was skipped before;
      do not add to its backlog.
- [ ] 6.9 Run `task css` and rebuild — `app.css` is `go:embed`ed, so new DaisyUI
      classes are invisible until it is regenerated.

## 7. Verify

- [ ] 7.1 `go test ./...` from `apps/strategy-server` — compare against the 40-package
      baseline. Fix any regression before proceeding.
- [ ] 7.2 `task lint` clean.
- [ ] 7.3 `task selfmodel:check` passes (i.e. 3.4 was actually done).
- [ ] 7.4 End-to-end by hand: edit one belief in the UI → review the per-field diff →
      commit → confirm the post-commit pipeline ran (ripple signals / convergence),
      since a patch batch must inherit the same downstream chain as any other commit.
- [ ] 7.5 Confirm the whole change works with **no LLM configured** — unset
      `LLM_PROVIDER_URL` and repeat 7.4. This is design principle 4 and the reason
      the change was split out; if it fails, the split has not been honoured.
