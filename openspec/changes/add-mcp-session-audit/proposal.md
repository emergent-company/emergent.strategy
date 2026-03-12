# Change: Add MCP Session Audit Log and Workflow Verification

## Why

LLMs can fabricate tool call results — claiming to have called 20+ MCP tools and reporting "PASS" when they only made 5 actual calls. This was observed with Gemini 2.5 Flash Lite against the EPF MCP server. The existing anti-loop detection (duplicate call warnings) caught one symptom but couldn't prevent or detect the fabrication.

The EPF MCP server currently has no way to answer "what tools were actually called in this session?" and the OpenCode plugin has no way to verify that an agent completed all required workflow steps. These gaps make it impossible for humans or orchestrators to audit LLM claims.

## What Changes

### epf-cli MCP Server (Go)

- **Session audit log**: Every tool call is recorded with timestamp, tool name, parameter hash, and a unique `call_id`. A new `epf_session_audit` tool exposes this log.
- **Workflow verification tool**: A new `epf_verify_workflow` tool accepts a list of expected tool names and returns which were called vs. missing, enabling post-hoc verification of multi-step workflows.
- **Universal call_id in responses**: Every tool response includes a `_call_id` field — a unique receipt that can be cross-referenced against the audit log.
- **Expand anti-loop detection**: Apply `checkToolCallLoop` to all tool handlers (currently only 4 of 70+ tools have it). Wire `ResetToolCallCounts()` to actual session reset events.
- **Per-session isolation in multi-tenant mode**: Move `toolCallCounts` from process-global to per-session state so user A's calls don't interfere with user B's thresholds.

### opencode-epf Plugin (TypeScript)

- **Workflow step tracking**: When an agent is activated, the plugin tracks which tools the LLM calls against the agent's `required_tools` list. On agent deactivation (or session end), it reports any missing required tool calls.
- **Agent completion gate**: Before accepting agent work as "complete", verify that all tools in the agent's required workflow were invoked. Emit a warning if verification fails.

## Impact

- Affected specs: `epf-cli-mcp`, `epf-opencode-plugin`
- Affected code:
  - `apps/epf-cli/internal/mcp/server.go` — audit log struct, call_id generation, tool registration
  - `apps/epf-cli/internal/mcp/tool_suggestions.go` — expand loop detection
  - `apps/epf-cli/internal/mcp/*.go` — add `checkToolCallLoop` to all handlers
  - `packages/opencode-epf/src/index.ts` — workflow tracking state, agent completion gate
  - `packages/opencode-epf/src/tools.ts` — tool call ledger integration
