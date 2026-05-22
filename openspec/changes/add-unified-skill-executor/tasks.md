# Tasks: Add Unified Skill Executor

## 1. `domain/skillexec/` package

- [x] 1.1 Create `domain/skillexec/executor.go` — `SkillExecutor` interface and
      concrete `executor` struct with constructor `NewExecutor(pack, strategy, schema, llm)`
- [x] 1.2 Create `domain/skillexec/context.go` — `ContextBundle` builder: loads all
      committed artifacts for an instance, structures them for template rendering
- [x] 1.3 Implement `executor.Run(ctx, instanceID, skillName, params)`:
      resolve skill → build context → render prompt template → call LLM → validate
      output → stage mutations → return `SkillResult`
- [x] 1.4 Implement skeleton mode: when `llm == nil`, stage current artifact payloads
      unchanged with `_skeleton: true` marker and return `SkillResult{LLMUsed: false}`
- [x] 1.5 Implement token budget guard: if rendered context exceeds 28K tokens, truncate
      feature list entries first and log a warning with count of dropped features
- [x] 1.6 Implement LRA evolution entry appending in executor:
      when the skill output includes `lra_evolution_entry`, the executor SHALL:
      - fetch the current committed `living_reality_assessment` payload
      - append the new entry to its `evolution_log` array (preserving all existing entries)
      - stage a single `update_lra` mutation with the merged payload
      - if no LRA artifact exists for the instance, skip silently and log a warning
- [x] 1.7 Implement new assumption staging in executor:
      when the skill output includes `new_assumptions`, the executor SHALL:
      - merge them into the `roadmap_recipe` mutation's affected track `riskiest_assumptions`
        (the track is inferred from the `id` prefix: `asm-p` → product, `asm-s` → strategy,
        `asm-o` → org_ops, `asm-c` → commercial)
      - if `new_assumptions` is empty (`[]`), clear all `riskiest_assumptions` for all tracks
      - this merge happens before the `roadmap_recipe` mutation is staged (single mutation)
- [x] 1.8 Create `domain/skillexec/executor_test.go` — unit tests:
      - mock LLM returns valid JSON → mutations staged correctly
      - mock LLM returns invalid JSON → executor returns error, nothing staged
      - nil LLM → skeleton mode, mutations staged with `_skeleton: true`
      - unknown skill name → executor returns not-found error
      - output includes `lra_evolution_entry` → `update_lra` mutation staged, existing log preserved
      - output includes `new_assumptions` → roadmap mutation contains updated `riskiest_assumptions`
      - output includes `new_assumptions: []` → roadmap mutation clears all track assumptions

## 2. `adapt-strategy` embedded skill

- [x] 2.1 Create `internal/embedded/skills/adapt-strategy/skill.yaml`:
      name, version, type=generation, phase=AIM, execution=prompt,
      requires=[calibration_memo, assessment_report, strategy_formula, roadmap_recipe]
- [x] 2.2 Create `internal/embedded/skills/adapt-strategy/prompt.md`:
      - System framing: role, constraints, output contract
      - Decision-aware sections: `{{if eq .Decision "pivot"}}`, `{{if eq .Decision "persevere"}}`,
        `{{if eq .Decision "pull_the_plug"}}`
      - Context injection: `{{.Artifacts.calibration_memo}}`, `{{.Artifacts.assessment_report}}`,
        `{{.Artifacts.strategy_formula}}`, `{{.Artifacts.roadmap_recipe}}`
      - Output instructions: produce full replacement payloads for `strategy_formula`
        and `roadmap_recipe`; preserve all fields not relevant to the decision;
        revise bets and OKRs to reflect the calibration direction
      - JSON output schema reference (compact inline schema summary for LLM awareness)
- [x] 2.3 Create `internal/embedded/skills/adapt-strategy/output_schema.json`:
      JSON Schema with `strategy_formula` and `roadmap_recipe` as required top-level keys,
      and optional `lra_evolution_entry` (object matching `evolution_log` items schema)
      and `new_assumptions` (array of `riskiest_assumptions` items) keys;
      each references the canonical EPF schema (draft-07 compatible inline)
- [x] 2.4 Update `internal/embedded/skills/adapt-strategy/skill.yaml`: add
      `living_reality_assessment` to `requires` list
- [x] 2.5 Update `internal/embedded/skills/adapt-strategy/prompt.md`: add output
      instructions for `lra_evolution_entry` and `new_assumptions` with decision-aware
      branching (pivot → aim_signals trigger; persevere → cycle_transition trigger;
      pull_the_plug → external_change trigger + empty new_assumptions)
- [x] 2.6 Verify skill appears in `embedded.ListSkills()` output

## 3. AIM workflow: replace `apply_calibration` step

- [x] 3.1 Update `domain/aim/workflow.go`: rename step 3 from `apply_calibration` to
      `adapt_strategy`; replace `stepApplyCalibration` with `stepAdaptStrategy`
- [x] 3.2 Implement `CycleWorkflow.stepAdaptStrategy`: call
      `executor.Run(ctx, instanceID, "adapt-strategy", params)` where params include
      `decision` from the calibration memo; return `StepResult{BatchID: result.BatchID}`
- [x] 3.3 Update `domain/aim/service.go`: `ApplyCalibration` delegates to executor
      when executor is non-nil; falls back to current flag-setting stub when executor is nil
      (backward compatibility for callers that bypass the workflow)
- [x] 3.4 Wire `SkillExecutor` into `CycleWorkflow` via constructor:
      `NewCycleWorkflow(svc *Service, executor skillexec.SkillExecutor)`
- [x] 3.5 Update `cmd_serve.go`: construct `SkillExecutor` and pass to `NewCycleWorkflow`

## 4. `run_skill` MCP tool: autonomous mode

- [x] 4.1 Add optional `mode` string parameter to `run_skill` tool definition
      (values: `interactive` (default), `autonomous`)
- [x] 4.2 When `mode=autonomous` and LLM is configured: call `executor.Run`; return
      `{mode, skill_name, batch_id, artifact_types, llm_used, validation_passed}`
- [x] 4.3 When `mode=autonomous` and LLM is nil: return structured error
      `"autonomous mode requires LLM configuration"` (not silent fallback)
- [x] 4.4 When `mode=interactive` or mode absent: existing prompt-delivery path
      unchanged — no regression
- [x] 4.5 Write test: autonomous mode with mock executor returns batch_id in response

## 5. UI: Adapt step label

- [x] 5.1 Update `internal/ui/phase_aim.templ`: Adapt step `DraftLabel` from
      `"Apply calibration"` to `"Generate strategy rewrite"`
- [x] 5.2 Update `internal/ui/phase_aim.templ`: Adapt step `Detail` text from
      `"Apply decision, then publish a snapshot"` to
      `"AI rewrites strategy_formula and roadmap from calibration decision"`
- [x] 5.3 Regenerate `phase_aim_templ.go` (`~/go/bin/templ generate -f ./internal/ui/phase_aim.templ`)

## 6. Tests and verification

- [x] 6.1 Run `go test ./domain/skillexec/...` — all unit tests pass
- [x] 6.2 Run `go test ./domain/aim/...` — existing AIM tests still pass
- [x] 6.3 Run `go test ./internal/mcpserver/...` — run_skill tests pass
- [x] 6.4 Run `go test ./...` — no regressions across the full suite
- [x] 6.5 Smoke-test: start local server, run AIM cycle on Sequence instance,
      verify Adapt step produces a staged batch containing `strategy_formula`,
      `roadmap_recipe`, and `living_reality_assessment` mutations,
      verify `new_assumptions` present in roadmap mutation,
      verify batch is reviewable in draft-review UI
- [x] 6.6 Smoke-test: `run_skill` with `mode=autonomous` on `adapt-strategy` via MCP
      client — verify batch_id returned, batch visible in `list_pending_batches`
- [x] 6.7 Smoke-test: `run_skill` without `mode` on `adapt-strategy` — verify prompt
      returned (interactive mode unchanged)

## 7. Rebuild and deploy

- [x] 7.1 Rebuild CSS if any class changes: `task css` from `apps/strategy-server/`
- [x] 7.2 Build binary: `go build -o /tmp/strategy-server .`
- [x] 7.3 Restart server; verify `/health` returns ok
