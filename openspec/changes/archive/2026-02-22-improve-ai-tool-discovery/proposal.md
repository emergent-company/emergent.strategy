# Change: Improve AI Agent Tool Discovery and Normative Guidance

## Why

Field testing with multiple AI models (Gemini 3.1, Claude, etc.) reveals that agents consistently bypass EPF-CLI's generative/guiding tools despite successfully using diagnostic tools. The root cause is structural, not linguistic: with 49+ MCP tools, agents skim tool listings superficially, latch onto diagnostic tools (health_check, validate), and then rely on their generalized pre-training heuristics to "fix" issues rather than consulting EPF's wizards and framework rules.

The post-mortem from the Veilag instance (docs/EPF/ad-hoc-artifacts/ai-tool-discovery-post-mortem.md) documents a concrete failure where the agent:
1. Successfully ran `epf_health_check` and identified Value Model Quality: 50/100
2. Completely bypassed `epf_get_wizard_for_task` and `epf_get_wizard`
3. Generated a value model from generic PM heuristics that violated core EPF principles
4. Required a full revert and explicit human correction

This is not a one-off failure — it represents a systematic gap in how tool responses guide agents through the correct workflow. The fix must be model-agnostic and structural: every tool response that identifies a problem must contain the explicit next tool to call with pre-filled parameters.

## What Changes

### 1. Actionable Next-Tool-Calls in Health Check and Validation Responses
- `epf_health_check` response includes a `required_next_tool_calls` array mapping each issue to the specific MCP tool + parameters the agent should call next
- `epf_validate_file` (ai-friendly mode) includes `recommended_tool` when structural/architectural errors are detected (not just surface-level typos)
- `epf_validate_with_plan` chunk responses include tool call suggestions when chunks indicate fundamental structural issues

### 2. Tool Response Chaining (Guided State Machine)
- Every diagnostic tool response that identifies fixable issues includes explicit tool call suggestions in its JSON output
- Tool suggestions include pre-filled parameter values where possible (e.g., `{"tool": "epf_get_wizard_for_task", "params": {"task": "fix value model quality issues"}}`)
- This creates a "state machine" where agents only need to trust one tool to get pulled into the correct workflow

### 3. Tiered Tool Discovery via epf_agent_instructions
- `epf_agent_instructions` response reorganizes tools into tiers: **Tier 1 (Always Use First)** vs **Tier 2 (After Wizard Guidance)** vs **Tier 3 (Specialized)**
- Tier 1 contains only: `epf_health_check`, `epf_get_wizard_for_task`, `epf_validate_file`
- This reduces cognitive load for agents scanning the tool listing

### 4. Validation Responses Redirect to Wizards for Structural Errors
- When `epf_validate_file` detects errors classified as structural (wrong L1/L2/L3 organization, anti-pattern violations, missing required sections) vs surface-level (typos, missing fields), the response includes a `structural_issue` flag
- Structural issues include a `recommended_tool` field pointing to the relevant wizard
- This prevents agents from brute-forcing validation errors that require framework understanding

## Impact
- Affected specs: `epf-cli-mcp`
- Affected code: `apps/epf-cli/internal/mcp/server.go` (health check handler, validate handler, agent instructions handler), `apps/epf-cli/internal/checks/` (health check result types)
- Backward compatible: All changes add new fields to JSON responses; no existing fields are removed or renamed
