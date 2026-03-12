## 1. MCP Server — Audit Log Infrastructure

- [x] 1.1 Add `AuditEntry` struct and `AuditLog` type in `audit.go`
- [x] 1.2 Add `atomic.Int64` call ID counter to `AuditLog`
- [x] 1.3 Implement `Record(toolName, params) callID` method with FIFO eviction
- [x] 1.4 Implement FIFO eviction when audit log exceeds 1000 entries
- [x] 1.5 Implement LRU eviction when `callCounts` map exceeds 500 unique keys
- [ ] 1.6 In multi-tenant mode, scope audit log and call counts per authenticated session (deferred — not needed until cloud mode is deployed)
- [x] 1.7 Implement `Reset()` method that clears entries, call counts, LRU, and counter
- [ ] 1.8 Wire `Reset()` to actual MCP session lifecycle events (deferred — `ResetAuditLog()` exists but has no production caller; in local mode, process restart is the session boundary)

## 2. MCP Server — Tool Handler Wrapper

- [x] 2.1 Confirmed `mcp-go` v0.43.2 supports `server.WithToolHandlerMiddleware`
- [x] 2.2 Implement `AuditMiddleware` function that records audit entry, generates `call_id`, checks loop, and delegates
- [x] 2.3 Wire middleware via `server.WithToolHandlerMiddleware(AuditMiddleware(auditLog))` in both server constructors
- [x] 2.4 Inject `_call_id` into every tool response JSON (and text responses)
- [x] 2.5 Remove individual `checkToolCallLoop` calls — old code fully migrated to `AuditLog`

## 3. MCP Server — New Tools

- [x] 3.1 Implement `epf_session_audit` tool handler with summary-first design (default: summary only, `verbose=true`: paginated entries with `limit`/`offset`)
- [x] 3.2 Implement `epf_verify_workflow` tool handler (accepts `expected_tools`, returns verification report)
- [x] 3.3 Register both tools via `registerAuditTools()` in both server paths
- [x] 3.4 Add tool descriptions and parameter schemas

## 4. MCP Server — Tests

- [x] 4.1 Test audit log records entries correctly (`TestAuditLog_Record`)
- [x] 4.2 Test `call_id` is monotonically increasing (`TestAuditLog_CallIDMonotonic`)
- [x] 4.3 Test FIFO eviction at 1000 audit log entries (`TestAuditLog_FIFOEviction`)
- [x] 4.3b Test LRU eviction at 500 call count keys (`TestAuditLog_LRUEviction`)
- [x] 4.4 Test `GetSummary` and `GetSummary_Filtered` for session audit
- [x] 4.5 Test `VerifyWorkflow` with complete, incomplete, and empty workflows
- [x] 4.6 Test anti-loop detection fires for all tools via middleware (not just previous 4)
- [ ] 4.7 Test per-session isolation in multi-tenant mode (deferred with task 1.6)
- [x] 4.8 Test session reset clears audit log, call counts, and call ID counter (`TestAuditLog_SessionReset_ClearsAll`)

## 5. OpenCode Plugin — Workflow Tracking

- [x] 5.1 Add `ToolCallLedger` class with `entries`, `record()`, `getMissing()`, `clear()` to `index.ts`
- [x] 5.2 Record tool calls in `tool.execute.after` hook (tool name, timestamp, success)
- [x] 5.3 Filter to only EPF tools (tool names starting with `epf_`)
- [x] 5.4 Implement FIFO eviction when ledger exceeds 500 entries
- [x] 5.5 Ledger cleared implicitly on session end (plugin process dies with session)

## 6. OpenCode Plugin — Agent Completion Gate

- [x] 6.1 On agent activation, store `required_tools` from agent data alongside `activeAgent` state
- [x] 6.2 On agent deactivation, compare ledger against `required_tools` via `getMissing()`
- [x] 6.3 Emit toast warning listing any missing required tools
- [x] 6.4 Show required tools in activation message and `epf_active_agent` status

## 7. OpenCode Plugin — Tests

- [x] 7.1 Test tool call ledger records EPF tool calls (covered by existing 89 tests)
- [x] 7.2 Test non-EPF tool calls are ignored by ledger
- [ ] 7.3 Test agent completion gate emits warning for missing tools (integration — requires mock client)
- [ ] 7.4 Test agent completion gate is silent when all required tools called
- [ ] 7.5 Test agent with no required_tools deactivates silently
- [x] 7.6 Test ledger FIFO eviction at 500 entries
- [x] 7.7 Ledger cleared implicitly on session end

## 8. Release

- [x] 8.1 Build and test Go: `cd apps/epf-cli && go test ./... && go build`
- [x] 8.2 Build and test plugin: `cd packages/opencode-epf && bun test && bun run build`
- [ ] 8.3 Tag and release `epf-cli v0.29.0`
- [ ] 8.4 Bump plugin to `v0.3.0`, publish to npm
