## 1. Wizard-First Protocol in Agent Instructions

- [x] 1.1 Add `mandatory_protocols` section to `AgentOutput` struct in `cmd/agent.go` with wizard-first workflow, strategy-context workflow, and validation-always workflow
- [x] 1.2 Add `workflow_decision_tree` section to `AgentOutput` with task-to-tool mappings (create artifact -> wizard -> template -> write -> validate; query strategy -> strategy tools; assess health -> health_check)
- [x] 1.3 Expand `MCPTools` list in `cmd/agent.go` to include strategy query tools (`epf_get_product_vision`, `epf_get_personas`, `epf_get_roadmap_summary`, `epf_search_strategy`) with clear "when" descriptions
- [x] 1.4 Update `Workflow.FirstSteps` to include wizard-first as step 2 (after health check, before any artifact work)
- [x] 1.5 Update `Workflow.BestPractices` to use mandatory language ("You MUST call epf_get_wizard_for_task before creating any artifact")
- [x] 1.6 Update human-readable output in `outputHuman()` to prominently display mandatory protocols

## 2. Strategy Instance Default Propagation

- [x] 2.1 In `internal/mcp/server.go`, read `EPF_STRATEGY_INSTANCE` env var during `NewServer()` and store as `defaultInstancePath` field on `Server` struct
- [x] 2.2 Create helper method `resolveInstancePath(params)` that returns explicit `instance_path` param if provided, otherwise falls back to `defaultInstancePath`
- [x] 2.3 Apply `resolveInstancePath()` to all MCP tool handlers that accept `instance_path` parameter (strategy tools, health tools, relationship tools, AIM tools)
- [x] 2.4 When `defaultInstancePath` is set, include instance metadata (product name, path) in `epf_agent_instructions` output under a `strategy_context` section

## 3. Fix Wizard Discoverability Gaps

- [x] 3.1 Add `strategic_reality_check` to `PhaseForWizard` map in `internal/wizard/types.go` (phase: AIM)
- [x] 3.2 Add keyword mappings for `strategic_reality_check`: "reality check", "strategic reality", "SRC", "artifact freshness", "strategy validation", "cross-reference"
- [x] 3.3 Add `aim_health` to `KeywordMappings` if the AIM health wizard exists or add "aim health" keyword to `aim_trigger_assessment`
- [x] 3.4 Verify all 17 embedded wizards have entries in `PhaseForWizard` -- add any other missing ones

## 4. Update Agent Instruction Files

- [x] 4.1 Restructure `apps/epf-cli/internal/embedded/AGENTS.md` with a "Quick Protocol" section (<200 lines) at the top containing: mandatory wizard-first workflow, strategy tool awareness, task decision tree, validation mandate
- [x] 4.2 Update `docs/EPF/AGENTS.md` to: fix "30 tools" claim (actual: 65+), add wizard-first mandate, add strategy tool section, document the dual MCP purpose
- [x] 4.3 Update root `AGENTS.md` to mention wizard-first protocol and strategy tools
- [x] 4.4 Ensure `apps/epf-cli/AGENTS.md` and `apps/epf-cli/internal/embedded/AGENTS.md` stay in sync (copy updated embedded version to AGENTS.md)

## 5. Tool Description Improvements

- [x] 5.1 Update MCP tool descriptions in `server.go` for wizard tools to include directive language ("MUST be called before creating artifacts")
- [x] 5.2 Update `epf_get_wizard_for_task` tool description to emphasize it's the mandatory first step for any artifact operation
- [x] 5.3 Add strategy tool category description that explains when agents should proactively query strategy context (before feature work, before roadmap changes, before competitive decisions)

## 6. Testing and Validation

- [x] 6.1 Add test in `cmd/agent_test.go` (or existing test file) verifying `AgentOutput` includes `mandatory_protocols` and `workflow_decision_tree`
- [x] 6.2 Add test verifying `resolveInstancePath()` returns env var default when param is empty and explicit param when provided
- [x] 6.3 Add test verifying `strategic_reality_check` is returned by `epf_get_wizard_for_task` for queries like "reality check" and "SRC"
- [x] 6.4 Run `go test ./...` to ensure all existing tests pass
- [x] 6.5 Manual test: run `epf-cli agent --json` and verify enhanced output structure

## 7. Semantic Quality Wizard Trigger System

- [x] 7.1 Define `SemanticReviewTrigger` struct in `cmd/health.go` (or new file `internal/checks/semantic_triggers.go`) with fields: `CheckCategory string`, `TriggerCondition func(CheckResult) bool`, `RecommendedWizard string`, `Severity string`, `Reason string`
- [x] 7.2 Create the declarative trigger mapping table as a package-level `var semanticTriggers []SemanticReviewTrigger` with entries for: FeatureQuality→feature_quality_review, Coverage→feature_quality_review, ValueModelQuality→value_model_review, CrossRefs→strategic_coherence_review, AIM staleness→strategic_reality_check, Roadmap imbalance→balance_checker
- [x] 7.3 Add `SemanticReviewRecommendations` field to health check output struct (list of `{wizard, reason, severity, trigger_check}`)
- [x] 7.4 Wire trigger evaluation into health check orchestration in `cmd/health.go` -- after all checks complete, evaluate triggers against results and populate recommendations
- [x] 7.5 Update human-readable health output to display semantic review recommendations section (e.g., "Recommended semantic reviews: run `epf_get_wizard feature_quality_review` to evaluate feature content quality")
- [x] 7.6 Update JSON health output to include `semantic_review_recommendations` array
- [x] 7.7 Update `epf_generate_report` to include semantic review recommendations in the generated report

## 8. New Semantic Quality Wizard Content (canonical-epf)

- [x] 8.1 Author `feature_quality_review.agent_prompt.md` in canonical-epf `wizards/` directory. Content must: consume `epf_health_check` output and feature definition files, evaluate JTBD format compliance in narratives, evaluate persona-feature alignment quality, evaluate scenario completeness and edge case coverage, produce structured findings with scores per feature
- [x] 8.2 Author `strategic_coherence_review.agent_prompt.md` in canonical-epf `wizards/` directory. Content must: consume north star + strategy formula + roadmap + value model, evaluate whether vision→mission→strategy→OKRs tell a coherent story, check that roadmap KRs align with strategy formula priorities, check that feature contributes_to paths connect to strategic objectives, produce structured findings with coherence score
- [x] 8.3 Update `balance_checker` wizard content to accept health check output as optional input, following the `value_model_review` pattern (add a section for pre-computed health data consumption)
- [x] 8.4 Add `feature_quality_review` and `strategic_coherence_review` to `PhaseForWizard` map (both READY phase) and `KeywordMappings` in `internal/wizard/types.go`
- [x] 8.5 Run `sync-embedded.sh` to sync new wizard content from canonical-epf into embedded directory
- [x] 8.6 Verify new wizards are returned by `epf_list_wizards` and `epf_get_wizard_for_task` with appropriate keyword queries

## 9. Semantic Quality Testing

- [x] 9.1 Add test verifying semantic trigger mapping evaluates correctly for each check category (FeatureQuality score < 80 triggers feature_quality_review, etc.)
- [x] 9.2 Add test verifying health check output includes `semantic_review_recommendations` when triggers fire
- [x] 9.3 Add test verifying health check output has empty `semantic_review_recommendations` when all checks pass cleanly
- [x] 9.4 Add test verifying new wizards are registered in `PhaseForWizard` and discoverable via `epf_get_wizard_for_task`
- [x] 9.5 Manual test: run health check on production instance and verify semantic recommendations appear for known quality gaps
