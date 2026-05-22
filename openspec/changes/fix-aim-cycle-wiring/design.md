## Context

The AIM cycle was built in three waves:

1. **AIM agent loop** (`add-aim-agent-loop`): DraftAssessment, DraftCalibration,
   ApplyCalibration as standalone service methods with inline LLM calls. MCP
   tools wired. Web UI handlers added with direct service calls.

2. **Unified skill executor** (`add-unified-skill-executor`): `adapt-strategy`
   and `adapt-foundations` skills with chunked LLM execution, schema validation,
   and activity tracking. Wired into the orchestration workflow and the ripple
   post-commit hook. Web UI handlers were NOT updated.

3. **Continuous strategy loop** (`add-continuous-strategy-loop`): Heartbeat
   ticker, trigger evaluation, cycle proposals. Orchestration engine with
   4-step workflow. MCP commit path enriched with full post-commit pipeline.
   Web UI commit path was NOT updated.

Each wave added capabilities to the MCP/orchestration path but left the web UI
handlers unchanged. The web UI now has a fundamentally different (and broken)
code path compared to MCP.

## Goals

- Web UI commits behave identically to MCP commits (single code path)
- The orchestrated AIM cycle produces a complete strategy update before snapshot
- LRA creation has an AI writer accessible from the web UI
- The user can see all pending drafts from any entry point (AIM, READY, Activity)

## Non-Goals

- Changing the MCP tool interfaces
- Restructuring the skill executor or chunk plan system
- Adding new embedded skill types (script, inline)

## Decisions

### 1. Shared post-commit pipeline function

Extract `postCommitPipeline(ctx, svc, instanceID, batchID)` from the MCP
`commit_batch` tool code. Both the MCP tool and `handleDraftCommit` call it.

**Location:** New file `internal/handler/postcommit.go` or refactor the existing
`postCommitRippleAnalysis` from `register_ripple_tools.go` into a reusable
function accessible to both MCP and web handlers.

The challenge: `postCommitRippleAnalysis` currently lives in the MCP server
package and depends on MCP-specific service bundles. The fix is to:
1. Move the pipeline logic into a domain service or a shared handler function
2. Both the MCP tool and web handler call the same function
3. The function takes explicit dependencies (ripple service, skill executor,
   orchestration engine) rather than the MCP service bundle

**Alternative considered:** Have the web handler call the MCP `commit_batch`
tool internally. Rejected — this creates circular dependencies and the MCP tool
returns JSON responses not suitable for web redirects.

### 2. Executor wiring for web UI Apply button

Add `skillExecutor *skillexec.Executor` to the `Server` struct in `handler.go`.
Wire it during server construction in `cmd_serve.go`. The `handleApplyCalibration`
handler checks `s.skillExecutor != nil` before falling back to the legacy method.

The executor runs asynchronously (it takes 1-4 minutes for LLM calls). The
handler should:
1. Start the skill run (returns immediately with batch_id if possible, or
   run_id if chunked)
2. Redirect to the draft review page or activity page
3. The generating badge and SSE show progress

### 3. 5-step orchestrated cycle

Modify `CycleWorkflow` in `workflow.go` to have 5 steps:

```
Steps: []Step{
    {Name: "draft_assessment",    Execute: w.stepDraftAssessment,    HumanGate: true},
    {Name: "draft_calibration",   Execute: w.stepDraftCalibration,   HumanGate: true},
    {Name: "adapt_strategy",      Execute: w.stepAdaptStrategy,      HumanGate: true},
    {Name: "adapt_foundations",   Execute: w.stepAdaptFoundations,   HumanGate: true},
    {Name: "snapshot_cycle",      Execute: w.stepSnapshotCycle,      HumanGate: false},
}
```

`stepAdaptFoundations` calls `executor.RunChunked("adapt-foundations")` with
the same instance context.

**Graceful empty-step handling:** In most cycles — particularly "persevere"
decisions — foundations won't need changes. The North Star doesn't drift just
because you scored OKRs and decided to stay the course. The step must handle
this gracefully:

- The skill executor runs and evaluates whether foundation changes are needed
  based on the calibration decision and any ripple signals.
- **If no mutations are produced** (empty batch): the step auto-advances past
  the human gate. The run panel shows the step as "Completed — no changes
  needed" (not "waiting for review"). No user action required.
- **If mutations are produced**: the step pauses at the human gate as normal
  and the user reviews the foundation updates.
- **The version snapshot proceeds either way.** The version is complete because
  there genuinely weren't any foundation changes to capture — not because
  they were missed.

This means in a quiet "persevere" cycle, the user experience is:
1. Review assessment report → commit
2. Review calibration memo → commit
3. Review strategy rewrite → commit
4. Foundations: "No changes needed" (auto-advanced, ~2 seconds)
5. Version published

The cycle doesn't feel broken or stalled — step 4 simply reports that
foundations are already aligned.

**Implementation:** The orchestration engine's `waitForResume` is only called
when `HumanGate: true` AND the step result contains a non-empty `BatchID`. The
step executor returns a `StepResult` with an empty `BatchID` when no mutations
were staged, and the engine skips the gate.

The snapshot at step 5 now captures all artifact updates — both execution-layer
and foundation-layer — in one version.

**Note:** The ripple-triggered async adapt-foundations path remains for non-AIM
commits (e.g., manual strategy_formula edits via MCP). The orchestrated cycle
simply doesn't depend on it.

### 4. draft-lra skill

Create `internal/embedded/skills/draft-lra/` with:
- `skill.yaml`: type=creation, phase=AIM, execution=prompt, requires
  north_star + strategy_foundations + roadmap_recipe
- `prompt.md`: Instructions to generate a schema-valid LRA from strategy context

The web handler `handleDraftLRA` calls `executor.RunChunked("draft-lra")` and
redirects to the draft review page.

The Observe step in the stepper gets a "Draft LRA" button (like the AI draft
buttons on Assess and Decide steps) that POSTs to `/strategies/:id/aim/draft-lra`.

### 5. Pending batch visibility on READY dashboard

Add `PendingBatches []CascadeBatch` to `ReadyPhaseData`. The `loadReadyPhaseData`
query includes the same staged-batch query used by `loadCascadePendingBatches`,
filtered to batches that touch READY artifact types.

Render a banner at the top of the READY dashboard when pending batches exist,
with a link to the draft review page.

### 6. Cascade depth tracking and escalation

The READY artifacts are bidirectional and interconnected. Changing north_star can
create signals targeting strategy_formula, and vice versa. The current system has
damping within a single convergence loop (max iterations, change budget, anchor
drift, emergency brake), but no protection against **cross-commit cascade loops**
where:

1. AIM cycle commits strategy_formula changes
2. Ripple triggers adapt-foundations (changes north_star, foundations, etc.)
3. User commits foundation changes
4. Ripple detects misalignment between updated north_star and strategy_formula
5. Agent/user re-runs adapt-strategy → goto 1

This loop is bounded by human gates (the user must commit each batch), but an
AI agent using MCP tools could drive it automatically without limit.

**Safeguards to add:**

**A. Cascade generation counter on batches**

Add a `cascade_generation` integer to `batch_metadata`. The first batch in a
chain (e.g., the AIM cycle's adapt-strategy output) gets `generation: 0`.
When adapt-foundations is triggered by that commit, its batch gets `generation: 1`.
If signals from that commit trigger further adaptation, `generation: 2`, etc.

The `enqueueFoundationDraft` function propagates the generation from the
triggering batch's metadata, incrementing by 1.

**B. Escalation at generation depth threshold**

When `cascade_generation >= 2` (configurable via ripple config), the batch is
automatically escalated to `authority_tier: "escalated"` regardless of semantic
distance. This forces human review with a clear warning:

> "This draft is the result of a 3rd-generation cascade. The strategy artifacts
> have been modified multiple times in this chain. Review carefully to ensure
> the changes converge rather than oscillate."

**C. Hard stop at generation depth limit**

When `cascade_generation >= 3` (configurable), `enqueueFoundationDraft` refuses
to trigger and logs a warning instead:

> "Cascade depth limit reached (generation 3). Manual review required to break
> the adaptation loop."

The user must manually run adapt-foundations or adapt-strategy if they want to
continue the chain.

**D. Per-instance cooldown for skill runs**

After a skill run completes for an instance, enforce a minimum cooldown before
the same skill can be triggered again for that instance. Default: 5 minutes for
adapt-foundations, 10 minutes for adapt-strategy. This prevents rapid-fire
cascades even if an agent is driving commits programmatically.

The cooldown is checked in `enqueueFoundationDraft` and in the executor's
`RunChunked`. If the cooldown hasn't elapsed, the trigger is logged but skipped.

**Within the orchestrated AIM cycle**, these mechanisms don't fire — the cycle
runs steps sequentially with explicit human gates, and adapt-foundations in step
4 is not triggered by ripple but by the workflow directly.

## Risks / Trade-offs

- **5-step cycle is longer:** Adding adapt-foundations as a gated step means the
  user reviews 4 batches instead of 3. Mitigation: the step can be auto-committed
  for `persevere` decisions where foundations rarely change, but we start with
  always gating.

- **Shared post-commit function coupling:** Extracting pipeline logic from the
  MCP package requires careful dependency management. Mitigation: use explicit
  parameter passing, not service bundles.

- **draft-lra skill quality:** The initial LRA is hard to generate well without
  real-world context (team situation, market conditions). Mitigation: the skill
  should produce a minimal valid LRA as a starting point, clearly marking
  sections that need human input.

## Open Questions

1. Should the 5th step (adapt-foundations) be auto-committed when the calibration
   decision is "persevere" and no ripple signals target foundations? This would
   reduce review burden for minor cycles.

2. Should the draft-review page allow committing all pending batches in sequence
   (a "commit all" flow) for orchestrated cycles where the user trusts the AI?
