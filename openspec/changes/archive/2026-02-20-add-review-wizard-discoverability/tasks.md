## 1. P0 — Critical Path Fixes

### 1.1 Add `evaluate_quality` task type to workflow decision tree
- [x] 1.1.1 Find `workflow_decision_tree` in `cmd/agent.go` (added by `improve-epf-agent-discoverability`)
- [x] 1.1.2 Add `evaluate_quality` entry: `epf_health_check` -> `epf_list_wizards(type=agent_prompt)` -> `epf_get_wizard` for each review wizard -> execute against instance
- [x] 1.1.3 Update `outputHuman()` to display the new task type in the decision tree

### 1.2 Widen wizard-first trigger to include "evaluating"
- [x] 1.2.1 In `cmd/agent.go`, update `mandatory_protocols` wizard-first text from "creating or modifying" to "creating, modifying, or evaluating"
- [x] 1.2.2 In `internal/mcp/server.go`, update `epf_get_wizard_for_task` tool description from "before creating any EPF artifact" to "before creating, modifying, or evaluating any EPF artifact or instance"
- [x] 1.2.3 Update `epf_get_wizard` tool description to mention evaluation use case alongside creation
- [x] 1.2.4 Update embedded AGENTS.md wizard-first section to include evaluation trigger
- [x] 1.2.5 Update root AGENTS.md and `.opencode/instructions.md` wizard-first protocol references

### 1.3 Add always-present `semantic_review_recommendations` to health check
- [x] 1.3.1 In `internal/mcp/server.go` `handleHealthCheck`, find the existing `evaluateMCPSemanticTriggers()` (added by P2 #14 in semantic-validation change)
- [x] 1.3.2 Add a baseline set of review wizard recommendations that always appear, regardless of conditional trigger results
- [x] 1.3.3 Baseline should list all 3 review wizards with their purpose and `epf_get_wizard` invocation syntax
- [x] 1.3.4 In CLI `cmd/health.go`, add the same always-present recommendations section to human-readable output
- [x] 1.3.5 Verify the `semantic_review_recommendations` key appears in JSON output with both conditional triggers and the always-present baseline

## 2. P1 — Robust Discovery

### 2.1 Update `epf_get_wizard_for_task` routing for evaluation queries
- [x] 2.1.1 In `internal/wizard/types.go`, add keyword mappings for evaluation tasks: "evaluate", "review", "assess quality", "check quality", "strategic coherence", "feature quality", "value model quality"
- [x] 2.1.2 Ensure these keywords map to the three review wizards: `strategic_coherence_review`, `feature_quality_review`, `value_model_review`
- [x] 2.1.3 Verify `RecommendWizard()` in `internal/wizard/recommender.go` handles `agent_prompt` type wizards (not just `wizard` type)
- [x] 2.1.4 Add test: calling with task "evaluate our strategy quality" should return `strategic_coherence_review`
- [x] 2.1.5 Add test: calling with task "review feature definitions" should return `feature_quality_review`

### 2.2 Add `epf_recommend_reviews` MCP tool
- [x] 2.2.1 Register new MCP tool `epf_recommend_reviews` in `internal/mcp/server.go` tool list
- [x] 2.2.2 Accept `instance_path` parameter (optional, uses default)
- [x] 2.2.3 Return all 3 review wizards with: name, purpose, wizard type, invocation syntax
- [x] 2.2.4 Optionally include instance-specific context (e.g., "instance has 4 VM files — value_model_review particularly relevant")
- [x] 2.2.5 Add tool description that mentions evaluation: "Returns applicable semantic review wizards for evaluating an EPF instance's strategic quality"

## 3. P2 — Belt-and-Suspenders

### 3.1 Cross-reference review wizards in AIM tool responses
- [x] 3.1.1 In `handleAIMHealth` response, add a footer section mentioning review wizards when instance has strategy artifacts
- [x] 3.1.2 In `handleAIMStatus` response, add a "next steps" hint mentioning review wizards for quality evaluation
- [x] 3.1.3 Keep these as informational suggestions, not mandatory steps

### 3.2 Surface review wizards as dedicated MCP tools
- [x] 3.2.1 Register `epf_review_strategic_coherence` as an alias/wrapper that calls `epf_get_wizard(name="strategic_coherence_review")`
- [x] 3.2.2 Register `epf_review_feature_quality` as an alias/wrapper for `feature_quality_review`
- [x] 3.2.3 Register `epf_review_value_model` as an alias/wrapper for `value_model_review`
- [x] 3.2.4 Tool descriptions should clearly state these are evaluation/review tools, not creation tools
- [x] 3.2.5 Consider: do wrapper tools add value vs. just better routing in `epf_get_wizard_for_task`? If not, skip 3.2.1-3.2.4 and document rationale

## 4. Build & Verify

- [x] 4.1 Run full test suite (`go test ./...`)
- [x] 4.2 Build epf-cli binary
- [x] 4.3 Test health check on emergent instance — verify `semantic_review_recommendations` always appears
- [x] 4.4 Test health check on huma-strategy instance — verify same
- [x] 4.5 Test `epf_get_wizard_for_task` with evaluation queries — verify review wizards returned
- [x] 4.6 Manual test: restart MCP server, ask agent to "evaluate the quality of our EPF strategy" — verify it finds review wizards
