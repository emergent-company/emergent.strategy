# Change: Fix AIM Cycle Wiring

## Why

The AIM cycle has three critical wiring gaps that make the web UI path produce
fundamentally different (and broken) results compared to the MCP path. These
aren't cosmetic — they break the strategy update flow:

### Gap 1: Web UI commit is missing the post-commit pipeline

When a user commits a batch via the web UI (`handleDraftCommit`), the handler
calls `strategySvc.CommitBatch()` and then resumes orchestration — but skips
the entire post-commit pipeline that the MCP `commit_batch` tool runs:

- No ripple analysis (signals not created or auto-resolved)
- No convergence loop (equilibrium not recalculated)
- No schema validation warnings
- No adapt-foundations trigger (foundation artifacts never updated)

This means web UI commits silently break coherence. A user committing an
adapt-strategy batch via the web UI will never see adapt-foundations run,
and their foundation artifacts (North Star, Foundations, Analyses, Opportunity)
will drift out of alignment with zero warning.

### Gap 2: "Generate strategy rewrite" uses legacy stub

The web UI "Generate strategy rewrite" button on the Adapt step calls
`aimSvc.ApplyCalibration()` — a legacy method that applies deterministic
field patches (setting `review_flag: true`). It does NOT use the skill
executor with the `adapt-strategy` skill.

Meanwhile, the orchestrated cycle's Step 3 calls
`executor.RunChunked("adapt-strategy")` which produces full LLM-powered
rewrites of strategy_formula and roadmap_recipe with schema validation.

The button label implies AI writing. The handler delivers flag-patches.

### Gap 3: AIM cycle snapshot excludes foundation updates

The orchestrated cycle snapshots the version immediately after the adapt-strategy
batch is committed (Step 4: `snapshot_cycle`, no human gate). But adapt-foundations
runs asynchronously AFTER this snapshot, producing a separate batch. The result:

- The AIM cycle version captures strategy_formula + roadmap_recipe updates
- Foundation artifacts (north_star, foundations, analyses, opportunity) are
  updated later in a separate batch
- The "Cycle N" version is incomplete — it doesn't reflect the full strategy update

### Additional gaps

4. **"Create LRA" is a dead link** — the stepper links to a read-only artifact
   viewer. No web handler exists for LRA creation.
5. **No AI writer for initial LRA** — the adapt-strategy skill updates the LRA's
   evolution_log, but no skill or handler creates the initial LRA.
6. **READY dashboard invisible to pending drafts** — after adapt-foundations
   stages a batch, the READY dashboard shows no indicator. The user must navigate
   to AIM to discover pending foundation rewrites.
7. **Draft review only previews the first artifact** — multi-artifact batches
   (adapt-strategy produces strategy_formula + roadmap_recipe) show a rich
   preview for the first artifact only.

## What Changes

### 1. Unify web UI commit with MCP commit pipeline

Extract the post-commit pipeline from the MCP `commit_batch` tool into a shared
function that both the MCP tool and the web UI `handleDraftCommit` call. The
pipeline includes:

- Signal auto-resolution for updated artifacts
- Structural ripple analysis
- Semantic change classification (when Memory is available)
- Foundation draft enqueuing (adapt-foundations trigger)
- Convergence loop
- Schema validation warnings

The web UI commit handler will call this shared function after
`strategySvc.CommitBatch()`, ensuring identical behavior regardless of commit
path.

### 2. Wire "Generate strategy rewrite" to the skill executor

Change `handleApplyCalibration` to use the skill executor when available:

```
if s.skillExecutor != nil {
    batchID, err = s.skillExecutor.RunChunked(ctx, instanceID, "adapt-strategy", params)
} else {
    batchID, _, err = s.aimSvc.ApplyCalibration(ctx, instID)  // legacy fallback
}
```

This gives the web UI button the same LLM-powered rewrite capability as the
orchestrated cycle's Step 3.

### 3. Defer AIM cycle snapshot until foundations are updated

Restructure the AIM cycle workflow to include foundation adaptation as part of
the cycle, not as an external async side-effect. Two approaches considered:

**Approach A — Add adapt-foundations as Step 4, move snapshot to Step 5:**
Add `adapt_foundations` as a gated step in the orchestration workflow. The
snapshot moves to Step 5 and captures the complete strategy update.

**Approach B — Defer snapshot until no pending batches remain:**
After the adapt-strategy batch is committed, check if adapt-foundations was
triggered. If so, wait for it to complete and be committed before snapshotting.

**Decision: Approach A.** It's simpler, explicit, and gives the user a clear
review gate for foundation changes before the cycle snapshot. The 5-step cycle
becomes:

1. `draft_assessment` (human gate) → assessment_report
2. `draft_calibration` (human gate) → calibration_memo
3. `adapt_strategy` (human gate) → strategy_formula, roadmap_recipe
4. `adapt_foundations` (human gate) → north_star, foundations, analyses, opportunity
5. `snapshot_cycle` (no gate) → version published

Step 4 runs adapt-foundations directly via the executor instead of relying on
the ripple-triggered async path. If adapt-foundations produces no changes (e.g.,
because the calibration was "persevere" and nothing drifted), the step completes
with an empty batch and the snapshot proceeds.

Note: The ripple-triggered async adapt-foundations path is kept for non-AIM
commits (e.g., manual strategy_formula edits via MCP). The orchestrated cycle
just doesn't rely on it.

### 4. Add LRA creation handler and AI writer

Create a `draft-lra` skill that generates an initial LRA from existing strategy
context (north_star, strategy_foundations, roadmap_recipe, features). The skill
reads the current artifacts and produces a schema-valid LRA with:

- `metadata` populated from current time and defaults
- `adoption_context` inferred from strategy context
- `track_baselines` from roadmap track structure
- `current_focus` from the active roadmap cycle
- Empty `evolution_log` (first cycle)

Wire this to a web UI handler at POST `/strategies/:id/aim/draft-lra` and add
an "AI draft" button on the Observe step when no LRA exists.

### 5. Show pending foundation drafts on the READY dashboard

Add a `PendingBatches` field to `ReadyPhaseData` and render pending batch
indicators on the READY dashboard. When adapt-foundations has staged a batch,
the READY dashboard shows a banner with a link to review.

### 6. Improve draft review for multi-artifact batches

Render previews for all previewable artifacts in a batch, not just the first
one. Use a tabbed or accordion layout to show each artifact's changes.

## Impact

- **Affected specs**: `strategy-web`, `strategy-ripple`
- **Affected code**:
  - `internal/handler/handler_aim_agent.go` — commit handler, apply handler
  - `domain/aim/workflow.go` — add adapt_foundations step
  - `domain/aim/service.go` — new DraftLRA method (optional, could be skill-only)
  - `internal/embedded/skills/draft-lra/` — new skill
  - `internal/handler/queries_phases.go` — READY phase pending batches
  - `internal/ui/phase_ready.templ` — pending batch banner
  - `internal/ui/aim_draft_review.templ` — multi-artifact preview
- **No breaking changes**: MCP tools and domain services are unaffected. The
  web UI gets the same capabilities the MCP path already has.
- **Database**: No new migrations required.
