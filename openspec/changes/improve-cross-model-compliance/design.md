## Context

The `improve-ai-tool-discovery` change (26/27 tasks done) added structured JSON guidance to epf-cli MCP tool responses: `required_next_tool_calls`, `recommended_tool`, tiered tool discovery, and structural error classification. These work perfectly for Claude models but fail for Gemini models.

Benchmarking with the `eval/epf-model-compliance` suite across 5 models reveals that Gemini models process tool descriptions and system prompt directives reliably, but do not extract actionable instructions from structured JSON fields in tool responses. This is a fundamental difference in how these model families process tool interaction patterns.

**Stakeholders:** AI agents (all model families), human users (indirect), EPF-CLI maintainers.

**Constraints:**
- Backward compatible — no existing JSON fields removed or renamed
- No MCP protocol changes — only response payloads and tool descriptions
- Must improve Gemini compliance without degrading Claude compliance
- Changes must be model-agnostic (no model detection or model-specific branching)
- Builds on `improve-ai-tool-discovery` foundation — does not modify its deliverables

## Goals / Non-Goals

**Goals:**
- Raise Gemini model compliance from 35–65% to 70%+ by meeting them where they read: tool descriptions and natural language in responses
- Eliminate tool call loops (Gemini 3 Pro calling same tool 10x)
- Reduce multi-step workflow failures by combining wizard lookup + wizard content into a single tool call
- Maintain or improve Claude's 100% compliance

**Non-Goals:**
- Model-specific prompt engineering or model detection logic
- Changing the MCP transport or protocol
- Removing or replacing the `required_next_tool_calls` JSON field (it stays for Claude)
- Modifying the eval suite's scoring thresholds (eval stays independent)
- Implementing enforcement gates that block tool calls

## Decisions

### Decision 1: Dual-Channel Guidance (Structured JSON + Natural Language)

Every diagnostic tool response that includes `required_next_tool_calls` (structured JSON) will also include an `action_required` field (natural language imperative text). The two fields contain the same information in different formats.

Example:
```json
{
  "required_next_tool_calls": [
    {"tool": "epf_get_wizard_for_task", "params": {"task": "fix value model"}, "priority": "urgent"}
  ],
  "action_required": "IMPORTANT: You must call epf_get_wizard_for_task with task='fix value model quality issues' before making any changes. The value model quality score is 68/100 (threshold: 80). Do NOT attempt to fix the value model without wizard guidance."
}
```

**Why:** The eval data shows Claude follows `required_next_tool_calls` perfectly (100% `follows_required_tool_calls`) while Gemini ignores it (0%). However, Gemini follows natural-language directives in system prompts and tool descriptions at 100% (`wizard_before_write`, `tiered_discovery`). The `action_required` field puts the same guidance in a format Gemini processes reliably.

**Alternatives considered:**
- *Only use natural language, remove structured JSON:* Would regress Claude. Rejected.
- *Put directives in tool descriptions instead of responses:* Tool descriptions are static and can't reference dynamic context (specific score values, specific file paths). Rejected for dynamic guidance; adopted for static post-conditions (Decision 3).

### Decision 2: Combined Wizard Lookup (Reduce Call Chain)

`epf_get_wizard_for_task` will optionally include the full wizard content in its response when confidence is "high". This reduces the mandatory `wizard_for_task` → `get_wizard` 2-call chain to 1 call.

```json
{
  "recommended": {"name": "feature_definition", "confidence": "high"},
  "wizard_content_preview": "# Feature Definition Wizard\n\n## Step 1: Job-to-be-Done\n..."
}
```

**Why:** Gemini 3.1 Pro scores 100% on `wizard_before_write` (calls `epf_get_wizard_for_task`) but only 65% overall because it quits after getting the recommendation without calling `epf_get_wizard`. Including the content inline eliminates this failure mode. Claude is unaffected — it already follows the 2-call chain, and having content inline just saves a call.

**Trade-off:** Larger response payloads (~2KB extra). Acceptable since wizard content is text, not binary, and MCP has no practical payload limit.

### Decision 3: POST-CONDITION Directives in Tool Descriptions

Static behavioral mandates go in tool descriptions using a `POST-CONDITION:` prefix pattern:

```
"Run a comprehensive health check on an EPF instance. POST-CONDITION: After receiving results, you MUST follow the action_required field before proceeding to any other work."
```

**Why:** Both Claude and Gemini read tool descriptions before calling tools. Post-conditions in descriptions address the `validates_after_write` failure (0% for Gemini) by putting the validation mandate where Gemini processes it — in the description, not in the response JSON.

### Decision 4: Anti-Loop Detection via Per-Session Counters

The MCP server maintains a `map[string]int` counter keyed by `toolName + hash(params)`. When the same tool+params combination is called >2 times in a session, the response includes a `call_count_warning` field:

```json
{
  "call_count_warning": "WARNING: You have called epf_health_check with the same parameters 4 times. The result has not changed. Stop calling this tool and proceed to the next step: call epf_get_wizard_for_task."
}
```

**Why:** Gemini 3 Pro calls `epf_health_check` 10x and `epf_validate_file` 10x with identical params. The MCP server has session state (persistent connection), so it can track call counts. A natural-language warning in the response gives the model an explicit "stop" signal.

**Session boundary:** Counter resets when the MCP connection resets. No persistent storage needed.

**Alternatives considered:**
- *Rate limiting (reject calls):* Would break MCP protocol expectations. Rejected.
- *Client-side detection:* Would require changes to every MCP client/host. Rejected.

### Decision 5: Workflow Completion Signals

Add `workflow_status` ("complete"/"incomplete") and `remaining_steps` fields:

```json
{
  "workflow_status": "incomplete",
  "remaining_steps": [
    "Call epf_get_wizard_for_task with task='fix value model quality issues'",
    "Follow wizard guidance to restructure value model",
    "Validate changes with epf_validate_file"
  ]
}
```

**Why:** Gemini 3.1 Pro's main failure mode is quitting early — it runs health check, sees issues, reports them to the user, and stops. An explicit "incomplete" status with a numbered checklist gives it a clear termination condition. The model knows it's not done until `workflow_status` is "complete".

### Decision 6: Implementation Location

All changes are in response payloads and tool descriptions. No new tool registrations:

| Component | Change |
|-----------|--------|
| `internal/mcp/server.go` | `handleHealthCheck` adds `action_required`, `workflow_status`, `remaining_steps` |
| `internal/mcp/server.go` | `handleValidateFile` adds `action_required`, `workflow_status` |
| `internal/mcp/server.go` | `handleGetWizardForTask` adds `wizard_content_preview` |
| `internal/mcp/server.go` | Tool description strings updated with POST-CONDITION text |
| `internal/mcp/server.go` | Per-session call counter middleware + `call_count_warning` injection |
| `internal/mcp/server.go` | `handleAgentInstructions` adds `response_processing_protocol` |
| `internal/checks/` | Response structs get new optional fields |
| Embedded AGENTS.md | Quick Protocol gets "Response Processing" subsection |

## Risks / Trade-offs

- **Risk:** `action_required` text may become stale relative to `required_next_tool_calls`.
  - *Mitigation:* Both are generated from the same mapping function in the same code path. Unit tests verify consistency.

- **Risk:** Combined wizard lookup increases response size.
  - *Mitigation:* Opt-out via `include_wizard_content=false`. Only included for high-confidence matches.

- **Risk:** Anti-loop detection has false positives (legitimate repeated calls).
  - *Mitigation:* Threshold of >2 is generous. Warning is informational, not blocking. Counter resets on session reset.

- **Risk:** POST-CONDITION text in tool descriptions may be ignored by future models.
  - *Mitigation:* POST-CONDITION is additive. The structured JSON fields remain the canonical guidance. POST-CONDITION is a redundant signal, not a replacement.

- **Risk:** Changes add response payload complexity.
  - *Mitigation:* All new fields are optional (null/omitted when not triggered). Existing consumers see no behavioral change.

## Open Questions

- Should `wizard_content_preview` include the full wizard content or a truncated summary? (Current answer: Full content — wizards are typically <3KB and models benefit from complete context.)
- Should anti-loop detection be configurable (threshold, enable/disable)? (Current answer: Start with hardcoded threshold of 2, add config if needed.)
- Should we add a `model_hint` field to agent instructions that suggests optimal interaction patterns per model family? (Current answer: No — keep model-agnostic. Revisit if eval data shows it would help.)
