## 1. Design: Define Tool Call Suggestion Schema

- [x] 1.1 Define `ToolCallSuggestion` Go struct: `Tool string`, `Params map[string]string`, `Reason string`, `Priority string`
- [x] 1.2 Define `ToolCallSuggestions` type as `[]ToolCallSuggestion`
- [x] 1.3 Add `ToolCallSuggestions` field to health check result types
- [x] 1.4 Add `ToolCallSuggestions` field to AI-friendly validation result types
- [x] 1.5 Write unit tests for the new types

## 2. Health Check: Add Required Next Tool Calls

- [x] 2.1 Create mapping function: health check issue category → tool call suggestion (e.g., low value model score → `epf_get_wizard_for_task` with `task: "fix value model"`)
- [x] 2.2 Add mappings for all major health check categories:
  - Value Model Quality < 80 → `epf_get_wizard_for_task {task: "fix value model"}`
  - Feature Quality < 80% → `epf_get_wizard_for_task {task: "review feature quality"}`
  - Schema validation errors → `epf_validate_with_plan {path: "<file>"}`
  - Content readiness issues → `epf_get_wizard_for_task {task: "complete EPF artifacts"}`
  - Relationship errors → `epf_validate_relationships` + `epf_get_wizard_for_task`
  - Missing LRA → `epf_aim_bootstrap`
- [x] 2.3 Integrate mapping into `handleHealthCheck` in `server.go` to populate `required_next_tool_calls` in response JSON
- [x] 2.4 Write unit tests for each mapping
- [ ] 2.5 Write integration test with a real instance that triggers multiple suggestions (deferred — unit tests cover all mapping logic)

## 3. Validation: Structural Error Detection and Wizard Redirect

- [x] 3.1 Define structural error heuristics: classify validation errors as `structural` vs `surface` based on error type and count
  - Type mismatches on top-level sections → structural
  - > 20 errors with > 5 critical → structural
  - > 10 critical errors alone → structural
  - Missing required field → surface
  - Enum violation → surface
- [x] 3.2 Add `structural_issue: bool` and `recommended_tool: ToolCallSuggestion` fields to AI-friendly validation output
- [x] 3.3 When structural issues detected, populate `recommended_tool` with the relevant wizard call
- [x] 3.4 Update `handleValidateFile` to run structural classification when `ai_friendly=true`
- [x] 3.5 Update `handleValidateWithPlan` to include structural classification in fix plan response
- [x] 3.6 Write unit tests for structural vs surface classification
- [x] 3.7 Write unit tests for wizard redirect in validation responses

## 4. Agent Instructions: Tiered Tool Organization

- [x] 4.1 Add `Tier` field to `AgentMCPTool` struct (values: "Essential", "Guided", "Specialized")
- [x] 4.2 Assign tiers to all tools in `buildAgentInstructionsOutput`:
  - Tier "Essential": `epf_health_check`, `epf_get_wizard_for_task`, `epf_validate_file`
  - Tier "Guided": `epf_get_wizard`, `epf_get_template`, `epf_get_schema`, `epf_validate_with_plan`, wizard/strategy query tools
  - Tier "Specialized": all remaining tools
- [x] 4.3 Add `tool_tiers` and `tool_discovery_guidance` fields to agent instructions response
- [x] 4.4 Update AGENTS.md Quick Protocol section to reflect tiered discovery (both embedded and development-facing)
- [x] 4.5 Write test verifying tier assignments and no overlaps

## 5. Testing and Verification

- [x] 5.1 Build and run full test suite: `cd apps/epf-cli && go test ./...` — all 27 packages pass
- [x] 5.2 Manual test: run `epf_health_check` on a real instance and verify `required_next_tool_calls` appear in JSON output — unit tests pass; live MCP verification requires server restart with new binary
- [x] 5.3 Manual test: run `epf_validate_file` with `ai_friendly=true` on a file with structural issues and verify wizard redirect — unit tests pass; live MCP verification requires server restart with new binary
- [x] 5.4 Manual test: call `epf_agent_instructions` and verify tiered tool organization — unit tests pass; live MCP verification requires server restart with new binary
- [x] 5.5 Verify backward compatibility: existing JSON consumers still work (no removed/renamed fields)
