# Tasks: Fix AIM Cycle Wiring

## 1. Extract shared post-commit pipeline

- [ ] 1.1 Create `internal/handler/postcommit.go` with a `PostCommitPipeline` struct
      that holds explicit dependencies (ripple service, skill executor, orchestration
      engine, Memory client, strategy service, db)
- [ ] 1.2 Extract `postCommitRippleAnalysis` logic from `register_ripple_tools.go`
      into `PostCommitPipeline.Run(ctx, instanceID, batchID)` — keeping the same
      behavior: signal auto-resolution, structural analysis, semantic classification,
      foundation draft enqueuing, convergence loop
- [ ] 1.3 Update MCP `commit_batch` tool to call the shared pipeline instead of
      the inline `postCommitRippleAnalysis` function
- [ ] 1.4 Update `handleDraftCommit` in `handler_aim_agent.go` to call the shared
      pipeline after `strategySvc.CommitBatch()`
- [ ] 1.5 Verify both paths produce identical ripple signals and convergence results
      using an existing instance with active signals
- [ ] 1.6 Wire `PostCommitPipeline` in `cmd_serve.go` with the correct dependencies

## 2. Wire skill executor to web UI Apply button

- [ ] 2.1 Add `skillExecutor *skillexec.Executor` field to `Server` struct in
      `handler.go`; add `WithSkillExecutor()` option
- [ ] 2.2 Wire the executor in `cmd_serve.go` via `WithSkillExecutor(executor)`
- [ ] 2.3 Update `handleApplyCalibration` to check `s.skillExecutor != nil` and
      call `executor.RunChunked(ctx, instanceID, "adapt-strategy", params)` with
      appropriate params (calibration decision, trigger context)
- [ ] 2.4 Handle the async nature: the executor returns a run ID, not a batch ID.
      Redirect to the activity page or skill run detail page while it generates,
      then redirect to draft review when the batch is ready
- [ ] 2.5 Keep the legacy `aimSvc.ApplyCalibration()` fallback when executor is nil

## 3. Add adapt-foundations as AIM cycle step 4

- [ ] 3.1 Add `stepAdaptFoundations` method to `CycleWorkflow` in `workflow.go` that
      calls `executor.RunChunked("adapt-foundations")` with instance context
- [ ] 3.2 Insert the new step between `adapt_strategy` and `snapshot_cycle` in the
      Steps slice, with `HumanGate: true`
- [ ] 3.3 Handle the empty-batch case: if adapt-foundations produces no changes
      (executor returns empty result), auto-advance past the human gate
- [ ] 3.4 Update `stepSnapshotCycle` to use the correct cycle number (now step 5
      instead of step 4)
- [ ] 3.5 Update the AIM run panel UI labels: `runStepLabel` in `aim_run_panel.templ`
      to include the new step name
- [ ] 3.6 Update web UI `aimCycleStepper` automation hint and step count references
- [ ] 3.7 Test orchestrated cycle end-to-end: verify the version snapshot includes
      foundation updates

## 4. Create draft-lra skill and web handler

- [ ] 4.1 Create `internal/embedded/skills/draft-lra/skill.yaml`:
      type=creation, phase=AIM, execution=prompt, requires north_star +
      strategy_foundations + roadmap_recipe
- [ ] 4.2 Create `internal/embedded/skills/draft-lra/prompt.md` with instructions
      to generate a schema-valid LRA from strategy context — focus on the required
      fields (metadata, adoption_context, track_baselines, current_focus) with
      sensible defaults for optional sections
- [ ] 4.3 Add a chunk plan entry in `skillexec/executor.go` for `draft-lra`:
      single chunk producing `living_reality_assessment` artifact type
- [ ] 4.4 Add `handleDraftLRA` handler at POST `/strategies/:id/aim/draft-lra`
      that calls the executor and redirects to the draft review page
- [ ] 4.5 Register the route in `handler.go` alongside the other AIM POST routes
- [ ] 4.6 Update `aimStepObserve` in `phase_aim.templ`: when no LRA exists AND
      north_star exists, show "Draft LRA" button (POST to `/aim/draft-lra`)
      as a secondary action alongside the existing "Create LRA" link
- [ ] 4.7 When no north_star exists, the Observe step should explain that
      foundation artifacts are needed first (LRA draft needs context)

## 5. Pending batch visibility on READY dashboard

- [ ] 5.1 Add `PendingBatches []CascadeBatch` field to `ReadyPhaseData` in
      `phase_ready.templ`
- [ ] 5.2 In `loadReadyPhaseData` (`queries_phases.go`), query staged batches
      that touch READY artifact types (north_star, strategy_foundations,
      insight_analyses, insight_opportunity, strategy_formula, roadmap_recipe)
- [ ] 5.3 Render a `PendingDraftBannerActive` or new banner component at the top
      of `ReadyPhaseContent` when `len(PendingBatches) > 0`, linking to the
      draft review page for each batch

## 6. Multi-artifact draft review preview

- [ ] 6.1 Remove the `break` after the first preview in `handleDraftReview`
      (`handler_aim_agent.go:176`) — render previews for all previewable artifacts
- [ ] 6.2 In the draft review template, render each artifact preview in a
      collapsible section with the artifact type as header
- [ ] 6.3 Ensure the preview renderer handles all READY artifact types
      (north_star, strategy_foundations, insight_analyses, insight_opportunity,
      strategy_formula, roadmap_recipe) not just assessment_report and
      calibration_memo

## 7. Update AIM pipeline page stepper

- [ ] 7.1 Update `aimStepObserve` to show "Draft LRA" button when no LRA exists
      but foundation artifacts are available
- [ ] 7.2 Ensure the "Generate strategy rewrite" button label matches the actual
      behavior — if executor is available, it produces AI rewrites; if not, it
      produces flag patches. Consider labeling differently.
- [ ] 7.3 After committing any batch, check for other pending batches and show
      a "Continue reviewing" link or redirect to the next pending batch

## 8. Tests

- [ ] 8.1 Test shared post-commit pipeline: verify ripple analysis runs for both
      MCP and web UI commit paths
- [ ] 8.2 Test 5-step orchestrated cycle: verify version snapshot includes all
      artifact updates from both adapt-strategy and adapt-foundations
- [ ] 8.3 Test draft-lra skill: verify it produces schema-valid LRA from
      existing strategy context
- [ ] 8.4 Test empty adapt-foundations: verify the step auto-advances when no
      foundation changes are needed
