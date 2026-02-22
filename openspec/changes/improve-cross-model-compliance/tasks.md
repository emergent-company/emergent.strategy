## 1. Natural Language Action Directives
- [ ] 1.1 Add `action_required` string field to health check response struct
- [ ] 1.2 Add `action_required` string field to AI-friendly validation response struct
- [ ] 1.3 Implement builder function that converts `required_next_tool_calls` array to imperative natural-language text
- [ ] 1.4 Integrate builder into `handleHealthCheck` — populate `action_required` whenever `required_next_tool_calls` is non-empty
- [ ] 1.5 Integrate builder into `handleValidateFile` — populate `action_required` when `structural_issue` is true or errors exist
- [ ] 1.6 Write unit tests for action directive text generation
- [ ] 1.7 Write unit tests verifying `action_required` appears in health check and validation responses

## 2. Workflow Completion Signals
- [ ] 2.1 Add `workflow_status` (string: "complete"/"incomplete") and `remaining_steps` ([]string) fields to health check response struct
- [ ] 2.2 Add same fields to AI-friendly validation response struct
- [ ] 2.3 Implement logic in `handleHealthCheck`: set "incomplete" when any required_next_tool_calls exist, list remaining tools in `remaining_steps`
- [ ] 2.4 Implement logic in `handleValidateFile`: set "incomplete" when structural issues found or errors need fixing
- [ ] 2.5 Write unit tests for workflow completion signals in both tools

## 3. Combined Wizard Lookup
- [ ] 3.1 Add `wizard_content_preview` optional string field to `epf_get_wizard_for_task` response struct
- [ ] 3.2 Add `include_wizard_content` parameter to `epf_get_wizard_for_task` tool registration (default: "true")
- [ ] 3.3 When confidence is "high" and `include_wizard_content` is not "false", load wizard content and include in response
- [ ] 3.4 Write unit tests: high-confidence includes preview, low-confidence excludes, opt-out works

## 4. Post-Condition Guidance in Tool Descriptions
- [ ] 4.1 Update `epf_health_check` tool description: add "POST-CONDITION: Follow the action_required field and required_next_tool_calls before proceeding."
- [ ] 4.2 Update `epf_validate_file` tool description: add "POST-CONDITION: If structural_issue is true, call the recommended_tool. Always validate after writing."
- [ ] 4.3 Update `epf_get_wizard_for_task` tool description: add "POST-CONDITION: Call epf_get_wizard with the recommended wizard name, or use wizard_content_preview if included."
- [ ] 4.4 Update `epf_get_wizard` tool description: add "POST-CONDITION: After following wizard guidance, validate with epf_validate_file."
- [ ] 4.5 Update `epf_get_template` tool description: add "POST-CONDITION: Fill template per wizard guidance, then validate with epf_validate_file."
- [ ] 4.6 Write test verifying tool descriptions contain POST-CONDITION text where applicable

## 5. Anti-Loop Detection
- [ ] 5.1 Add per-session tool call counter to MCP server: `map[string]int` keyed by `toolName+paramsHash`
- [ ] 5.2 Add `call_count_warning` struct field to base tool response (optional, nil when not triggered)
- [ ] 5.3 Implement loop detection middleware: increment counter before handler, inject warning when count > 2
- [ ] 5.4 Include suggested alternative tool in warning based on current tool context
- [ ] 5.5 Add session/conversation reset mechanism
- [ ] 5.6 Write unit tests for loop detection: first 2 calls clean, 3rd+ has warning

## 6. Response Processing Protocol in Agent Instructions
- [ ] 6.1 Add `response_processing_protocol` section to `epf_agent_instructions` response JSON
- [ ] 6.2 Protocol content: check action_required → check workflow_status → check call_count_warning → check required_next_tool_calls
- [ ] 6.3 Update embedded AGENTS.md Quick Protocol section to include response processing instructions within first 200 lines
- [ ] 6.4 Write test verifying `epf_agent_instructions` response includes the new section

## 7. Eval Suite Updates
- [ ] 7.1 Update eval tool fixtures to include new response fields (action_required, workflow_status, remaining_steps)
- [ ] 7.2 Add new scoring behavior: `FOLLOWS_ACTION_REQUIRED` (checks if model acts on action_required text)
- [ ] 7.3 Run eval suite against all 5 providers and document before/after compliance rates

## 8. Testing and Verification
- [ ] 8.1 Build and run full Go test suite: `cd apps/epf-cli && go test ./...`
- [ ] 8.2 Verify backward compatibility: no removed or renamed JSON fields
- [ ] 8.3 Manual test: run `epf_health_check` via MCP and verify new fields appear
- [ ] 8.4 Manual test: run `epf_get_wizard_for_task` and verify wizard_content_preview on high-confidence match
