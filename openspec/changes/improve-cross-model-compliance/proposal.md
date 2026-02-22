# Change: Improve Cross-Model MCP Compliance

## Why

The `improve-ai-tool-discovery` change added structured guidance to epf-cli MCP tool responses — `required_next_tool_calls`, `recommended_tool`, and tiered tool discovery. Benchmarking across 5 AI models via the `eval/epf-model-compliance` suite reveals a sharp compliance gap:

| Model | Overall Compliance | Key Failure |
|---|---|---|
| Claude Opus 4.6 | **100%** | None |
| Claude Sonnet 4.6 | **~100%** | None |
| Gemini 3.1 Pro | **65%** | Quits early, doesn't follow through |
| Gemini 3 Pro | **~35%** | Tool call loops (same tool 10x) |
| Gemini 2.5 Pro | **~50%** | Tool call loops, times out |

The failures concentrate in 3 behaviors:
1. **`follows_required_tool_calls`: 0%** — Gemini sees `required_next_tool_calls` in JSON but doesn't act on them
2. **`validates_after_write`: 0%** — Writes artifacts but never calls `epf_validate_file` afterward
3. **`structural_error_classification`: 0–50%** — Skips wizard for structural errors

Meanwhile, Gemini scores 100% on `tiered_discovery`, `wizard_before_write`, and `no_invented_structure` — behaviors driven by tool descriptions and system prompt instructions.

**Root cause:** Gemini models treat structured JSON metadata as informational, not actionable. They reliably follow directives in tool descriptions and system prompts, but don't extract and execute instructions from response payload fields. The `improve-ai-tool-discovery` approach of embedding guidance in JSON response fields works for Claude but not for Gemini.

## What Changes

### 1. Natural Language Action Directives in Tool Responses
Add a plain-text `action_required` field to diagnostic tool responses, duplicating `required_next_tool_calls` guidance as imperative natural language. This targets models that process text directives reliably but ignore structured metadata.

### 2. Workflow Completion Signals
Add `workflow_status` ("complete"/"incomplete") and `remaining_steps` fields to diagnostic responses. Gives models an explicit "you're not done" signal with a checklist.

### 3. Combined Wizard Lookup
When `epf_get_wizard_for_task` returns a high-confidence match, include the wizard content inline via `wizard_content_preview`. Reduces the mandatory 2-call chain to 1 call for models that struggle with multi-step tool sequences.

### 4. Post-Condition Guidance in Tool Descriptions
Add explicit "POST-CONDITION: After receiving results, ..." language to tool descriptions. Addresses `validates_after_write` by putting the validation mandate where Gemini reads it — the tool description, not the response payload.

### 5. Anti-Loop Detection
Track per-session tool call frequency. When the same tool is called >2 times with identical params, include a `call_count_warning` directing the model to stop repeating and move to the next step. Targets Gemini 3 Pro's 10x loop pattern.

### 6. Response Processing Protocol in AGENTS.md
Add a "Response Processing Protocol" section to agent instructions that explicitly tells agents to check `action_required`, `workflow_status`, and `call_count_warning` after every tool call.

## Impact
- Affected specs: `epf-cli-mcp`
- Affected code: `apps/epf-cli/internal/mcp/server.go` (tool handlers, tool descriptions), `apps/epf-cli/internal/checks/` (response types), embedded AGENTS.md
- Backward compatible: All changes add new fields; no existing fields removed or renamed
- Non-overlapping with `improve-ai-tool-discovery` (builds on its foundation, does not modify its deliverables)
