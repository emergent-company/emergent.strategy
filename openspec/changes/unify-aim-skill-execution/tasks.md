# Tasks: Unify AIM Skill Execution via Canonical EPF Skills

## 1. Upstream Skill Definitions to Canonical EPF

File GitHub issues on `emergent-company/epf-canonical` requesting skill
definitions. Each issue includes the complete skill content (skill.yaml,
prompt.md, chunks/, output_schema.json) for the canonical team to review and
merge.

### 1a. New skills (do not exist in canonical or strategy-server yet)

- [x] 1.1 File issue: `draft-assessment` skill -- single-shot prompt that
      receives OKR skeleton, prior actuals, LRA context, ripple signals, and
      strategic context; produces complete `assessment_report` artifact. Include
      `skill.yaml` (phase: AIM, type: generation, execution: prompt, requires:
      roadmap_recipe + living_reality_assessment + assessment_report [optional]),
      `prompt.md` template with `{{range}}` over OKR data and
      `{{schemaConstraints "assessment_report"}}`, and `output_schema.json`.
- [x] 1.2 File issue: `draft-calibration` skill -- single-shot prompt that
      receives pre-computed decision, OKR hit rate, assessment data, and formula
      reasoning; produces the `reasoning` narrative field. Include `skill.yaml`
      (phase: AIM, type: generation, execution: prompt, requires:
      assessment_report), `prompt.md` template, and `output_schema.json`
      (simple `{"reasoning": "..."}` envelope).

### 1b. Existing native skills (already in strategy-server, need upstreaming)

- [x] 1.3 File issue: upstream `adapt-strategy` -- include skill.yaml,
      chunks/01-04, output_schema.json from
      `apps/strategy-server/internal/embedded/skills/adapt-strategy/`
- [x] 1.4 File issue: upstream `adapt-foundations` -- include skill.yaml,
      chunks/01-04, output_schema.json from
      `apps/strategy-server/internal/embedded/skills/adapt-foundations/`
- [x] 1.5 File issue: upstream `draft-lra` -- include skill.yaml, prompt.md
      from `apps/strategy-server/internal/embedded/skills/draft-lra/`
- [x] 1.6 File issue: upstream `draft-north-star` -- include skill.yaml,
      prompt.md from
      `apps/strategy-server/internal/embedded/skills/draft-north-star/`
- [x] 1.7 File issue: upstream `draft-formula` -- include skill.yaml, prompt.md
      from `apps/strategy-server/internal/embedded/skills/draft-formula/`
- [x] 1.8 File issue: upstream `draft-foundations` -- include skill.yaml,
      prompt.md from
      `apps/strategy-server/internal/embedded/skills/draft-foundations/`
- [x] 1.9 File issue: upstream `draft-insights` -- include skill.yaml,
      prompt.md from
      `apps/strategy-server/internal/embedded/skills/draft-insights/`
- [x] 1.10 File issue: upstream `draft-opportunity` -- include skill.yaml,
      prompt.md from
      `apps/strategy-server/internal/embedded/skills/draft-opportunity/`
- [x] 1.11 File issue: upstream `draft-roadmap` -- include skill.yaml,
      prompt.md from
      `apps/strategy-server/internal/embedded/skills/draft-roadmap/`
- [x] 1.12 File issue: upstream `align-portfolio` -- include skill.yaml,
      prompt.md from
      `apps/strategy-server/internal/embedded/skills/align-portfolio/`

## 2. Strategy-Server: Route Assessment Through Skill Executor

- [x] 2.1 Extract `DraftAssessment` pre-computation into a public method
      `AssembleAssessmentParams(ctx, instanceID) (map[string]any, error)` on
      `aim.Service` -- calls `extractOKRSkeleton`, `seedWithPriorActuals`,
      `extractAssumptionValidations`, `extractStrategicInsights`,
      `loadStrategicContext`, `loadSignalContext`, `buildLRAContext`; returns
      the assembled param map
- [x] 2.2 Update `stepDraftAssessment` in `workflow.go` to:
      (a) call `w.svc.AssembleAssessmentParams()` for pre-computation,
      (b) call `w.executor.RunChunked(ctx, instanceID, "draft-assessment", params)`,
      (c) map `SkillResult` to `orchestration.StepResult` with run metadata
- [x] 2.3 Update `handleDraftAssessment` in `handler_aim_agent.go` to match
      the new flow (assemble params + call executor, not `svc.DraftAssessment`)
- [ ] 2.4 Verify run tracking (requires live test with LLM): after drafting, `skill_runs` row is created
      with `skill_name='draft-assessment'`, `status='completed'`, token counts
      populated
- [ ] 2.5 Verify draft review UI (requires live test with LLM) shows assessment run in AIM run panel with
      token count and duration

## 3. Strategy-Server: Route Calibration Through Skill Executor

- [x] 3.1 Extract calibration pre-computation into a public method
      `AssembleCalibratiionParams(ctx, instanceID) (map[string]any, error)` on
      `aim.Service` -- loads committed assessment, calls
      `computeOKRHitRate`, `countInvalidatedAssumptions`,
      `calibrationDecision`, `buildReasoningSummary`; returns param map
      including `decision`, `hit_rate_pct`, `invalidated_count`,
      `formula_reasoning`, and `assessment_data`
- [x] 3.2 Update `stepDraftCalibration` in `workflow.go` to:
      (a) call `w.svc.AssembleCalibrationParams()`,
      (b) call `w.executor.RunChunked(ctx, instanceID, "draft-calibration", params)`,
      (c) assemble the final calibration_memo by merging the Go-computed
      decision fields with the skill-generated reasoning narrative,
      (d) stage the complete calibration_memo as a batch mutation
- [x] 3.3 Update `handleDraftCalibration` in `handler_aim_agent.go` to match
- [ ] 3.4 Verify run tracking for calibration (requires live test with LLM) skill runs
- [ ] 3.5 Verify the deterministic decision logic is unchanged: write a test
      that asserts `calibrationDecision()` still produces the same outputs for
      the same inputs after the refactor

## 4. Remove Dead Code from aim.Service

- [ ] 4.1 Remove `enrichAssessmentWithLLM()` method (~130 lines)
- [ ] 4.2 Remove `enrichCalibrationWithLLM()` method (~30 lines)
- [ ] 4.3 Remove `llm` field from `Service` struct and the `LLMClient`
      constructor parameter
- [ ] 4.4 Update `cmd_serve.go` to stop passing `LLMClient` to
      `aim.NewService()`
- [ ] 4.5 Update `DraftAssessment()` to call `AssembleAssessmentParams()`
      only (for MCP backward compat -- MCP tools may call the service directly)
      or remove it if all callers now use the executor path
- [ ] 4.6 Update `DraftCalibration()` similarly
- [ ] 4.7 Verify all tests pass after dead code removal

## 5. Sync Canonical Skills

- [x] 5.1 After canonical-epf publishes the new skill definitions, run
      `task sync-embedded` to pull canonical versions into
      `internal/embedded/skills/`
- [x] 5.2 Verify MANIFEST.txt includes the new canonical skills
      (draft-assessment, draft-calibration) and the upstreamed native skills
- [x] 5.3 Remove any native skill files that are now superseded by canonical
      versions (the sync script should overwrite them)
- [x] 5.4 Rebuild and run `go test ./...` to verify no regressions

## 6. Verification

- [ ] 6.1 Run a full AIM cycle on a test instance (Twenty First) through all
      5 orchestration steps: draft_assessment, draft_calibration,
      adapt_strategy, adapt_foundations, snapshot_cycle
- [ ] 6.2 Verify all 4 writing steps have `skill_runs` records with
      `status='completed'`, non-zero token counts, and duration
- [ ] 6.3 Verify the AIM run panel in the web UI shows run metadata (tokens,
      duration, artifact types) for all steps, not just Adapt
- [ ] 6.4 Verify per-instance skill override: install a custom
      `draft-assessment` skill for one instance, run assessment, confirm the
      custom prompt is used
- [ ] 6.5 Verify skeleton mode: with LLM disabled, all steps produce skeleton
      batches (no crash, no nil pointer, status visible in UI)
- [x] 6.6 Run `go test ./...` -- all tests pass, no regressions vs baseline
      (7 pre-existing e2e failures from JS URL parsing -- same as before)
