## Context

An LLM (Gemini 2.5 Flash Lite) fabricated results for ~20 MCP tool calls it never made during an EPF workflow verification session. The existing `checkToolCallLoop` mechanism (which warns on 3+ identical calls) caught one symptom but is applied to only 4 of 70+ tool handlers and has no production caller for `ResetToolCallCounts()`.

The problem has two layers:
1. **Detection** — No way to verify what tools were actually called (MCP server side)
2. **Prevention** — No way to enforce that required workflow steps are completed (plugin side)

The harder problem — detecting that an LLM's *text output* contains fabricated claims — requires platform-level hooks (e.g., OpenCode inspecting LLM output before showing to user). That is out of scope for this change.

### Stakeholders

- AI agents using EPF MCP tools
- Human users verifying agent work
- Orchestration plugins (opencode-epf) enforcing workflow quality

## Goals / Non-Goals

### Goals

- Humans and orchestrators can audit exactly which MCP tools were called in a session
- Every tool response carries a unique receipt (`call_id`) for cross-referencing
- Workflow completeness can be verified post-hoc (did the agent call all expected tools?)
- Agent activation in the plugin tracks required tool calls and flags gaps
- Anti-loop detection covers all tools, not just 4

### Non-Goals

- Detecting fabricated text in LLM output (requires platform hooks, out of scope)
- Blocking LLMs from generating text about tools they didn't call (impossible at MCP layer)
- Adding authentication or authorization to the audit log (already handled by session manager)
- Persisting audit logs across server restarts (in-memory per session is sufficient)

## Decisions

### 1. Audit log is in-memory, per-session

**Decision**: Store audit entries in a slice on the `Server` struct, scoped per MCP session (same lifecycle as `toolCallCounts`).

**Alternatives considered**:
- File-based log — Adds I/O complexity, unclear who reads it. Rejected.
- Database — Violates "Git is God" and "no server infrastructure" constraints. Rejected.
- External telemetry (OpenTelemetry) — Over-engineered for the problem. Could be added later.

**Rationale**: The audit log serves the same purpose as `toolCallCounts` — per-session state for detecting behavioral issues. In-memory is consistent with the existing pattern and requires zero new dependencies.

### 2. `call_id` is a counter, not a UUID

**Decision**: Use a monotonically increasing integer (`atomic.Int64`) as `call_id`, formatted as `"call-{N}"`. The audit log entry includes the full details (tool name, params hash, timestamp).

**Alternatives considered**:
- UUID per call — Overkill, harder to read, no benefit since IDs are session-scoped.
- Timestamp-based — Could have collisions with parallel calls.

**Rationale**: Simple, deterministic, easy to reference in conversation ("call-7 was the health check").

### 3. Anti-loop detection via middleware pattern

**Decision**: Instead of adding `checkToolCallLoop` to each of 70+ handlers individually, introduce a wrapper function that wraps every tool handler. This wrapper records the audit entry, generates the `call_id`, checks for loops, and delegates to the actual handler.

**Alternatives considered**:
- Add `checkToolCallLoop` to each handler manually — Error-prone, 70+ call sites, easy to miss new tools.
- MCP-level middleware (if mcp-go supports it) — Check if `mcp-go` has handler middleware; if so, use it. If not, use the wrapper approach.

**Rationale**: Single point of enforcement. New tools automatically get audit logging and loop detection.

### 4. Plugin tracks tool calls via `tool.execute.after` hook

**Decision**: The plugin already has `tool.execute.after` hooks. Add a per-session `Map<string, ToolCallEntry[]>` that records every EPF tool call. When an agent is deactivated, compare the ledger against the agent's `required_tools` list and emit a warning for missing calls.

**Alternatives considered**:
- Track in `tool.execute.before` — Can't capture success/failure.
- Track only during agent activation — Would miss tools called before activation.

**Rationale**: `after` hook gives us the tool name, parameters, and whether it succeeded. Tracking all calls (not just during agent activation) gives a complete picture.

### 5. Workflow verification is a separate tool, not automatic

**Decision**: `epf_verify_workflow` is an opt-in tool that takes `expected_tools[]` and returns a verification report. It does not automatically block or warn — the caller decides what to do with the result.

**Alternatives considered**:
- Automatic verification on every response — Too intrusive, breaks the "tool as linter" principle.
- Verification only at agent deactivation — Useful but doesn't cover non-agent workflows.

**Rationale**: Keeps the MCP server passive ("agent as writer, tool as linter"). The plugin or human chooses when to verify.

### 6. Per-session state in multi-tenant mode

**Decision**: In multi-tenant mode, audit log and call counts are scoped per authenticated session (keyed by session JWT or user ID). In local mode, they remain process-global (single user).

**Rationale**: Prevents user A's tool calls from appearing in user B's audit log or triggering user B's loop thresholds.

### 7. Memory management — bounded data structures with GC

**Decision**: All in-memory audit state has explicit bounds and garbage collection:

| Data structure | Location | Bound | GC strategy |
|---|---|---|---|
| Audit log (`[]AuditEntry`) | MCP server | 1000 entries max | FIFO eviction — oldest entries dropped when cap is reached |
| Call count map (`map[string]int`) | MCP server | 500 unique keys max | LRU eviction — least recently called tool+params key evicted when cap is reached |
| Tool call ledger (`Map<string, ToolCallEntry[]>`) | Plugin | 500 entries max | FIFO eviction — oldest entries dropped |
| Agent-scoped tracking | Plugin | Cleared on deactivation | Full clear on agent deactivation + session end |

Additionally:
- All state is reset on MCP session reconnect (wiring `ResetToolCallCounts()` to production session events also resets the audit log).
- In multi-tenant mode, session expiry (JWT TTL, default 24h) implicitly garbage-collects all per-session state.
- The `epf_session_audit` response includes `evicted_count` so callers know if entries were lost.

**Rationale**: Without bounds, a misbehaving LLM (or a long-running server in multi-tenant mode) could grow these structures indefinitely. The caps are generous enough for normal usage (a typical EPF workflow involves 10-30 tool calls) but prevent pathological growth. The existing `toolCallCounts` map has no bounds today — this change fixes that.

**Alternatives considered**:
- Time-based eviction (drop entries older than N minutes) — More complex, requires a timer goroutine. Not worth it since session reset already handles the common case.
- No bounds (rely on session reset) — Risky in multi-tenant mode where sessions can be long-lived (24h TTL).

### 8. Token-aware response design — minimize context window impact

**Decision**: Audit tools are designed to be compact by default, with opt-in verbosity. The guiding principle is: audit data exists for verification, not for the LLM to reason about. It should consume minimal context window tokens.

| Response | Default behavior | Token estimate | Opt-in verbose |
|---|---|---|---|
| `_call_id` field | Short string `"call-7"` in every response | ~5 tokens per response | N/A |
| `epf_session_audit` (default) | Summary only: `total_calls`, `unique_tools[]`, `evicted_count` | ~50-100 tokens | `verbose=true` returns full entry list |
| `epf_session_audit` (verbose) | Full entries with pagination: `limit` (default 50), `offset` | ~500-1000 tokens per page | N/A |
| `epf_verify_workflow` | Compact: `complete`, `called[]`, `missing[]`, counts | ~50-100 tokens | N/A |
| `call_count_warning` | Only on loop detection (3+ identical calls) | ~30 tokens when triggered | N/A |
| Agent completion warning (plugin) | Toast message, not injected into context | 0 tokens (toast only) | N/A |

**Key constraints**:
- `epf_session_audit` without `verbose=true` MUST NOT return individual entries. Only summary stats and the list of unique tool names. This prevents a 1000-entry dump from consuming the context window.
- `epf_session_audit` with `verbose=true` MUST paginate with `limit` (default 50) and `offset`. Callers must explicitly request more pages.
- `_call_id` values MUST be short (e.g., `"call-7"`, not UUIDs or timestamps). This keeps the per-response overhead under 5 tokens.
- Agent completion warnings MUST use toast notifications, not system message injection. Toasts are visible to the user but don't consume LLM context tokens.

**Rationale**: The primary consumer of MCP tool responses is the LLM's context window. Every token spent on audit metadata is a token not available for strategic content (personas, features, roadmap data). The audit log is primarily for human/orchestrator verification — the LLM rarely needs to see individual entries. Summary-first design preserves context budget for what matters.

**Alternatives considered**:
- No `_call_id` in responses (only in audit log) — Saves ~5 tokens per call but eliminates the ability to cross-reference claims in-flight. The overhead is minimal enough to justify keeping it.
- Always return full audit entries — Would make `epf_session_audit` a context-window bomb. Rejected.
- Inject audit warnings as system messages — Consumes persistent context tokens for every message. Toast is better for warnings that are informational, not actionable by the LLM.

## Risks / Trade-offs

- **Memory growth** — Mitigated by bounded data structures with FIFO/LRU eviction (see Decision 7). Worst case: ~1000 audit entries * ~200 bytes = ~200KB per session. Acceptable.
- **Performance** — Wrapper function adds ~microsecond overhead per tool call. Acceptable.
- **False workflow gaps** — An agent may intentionally skip optional tools. Mitigation: `epf_verify_workflow` reports gaps but does not block. The plugin's agent completion gate only warns (toast), doesn't prevent deactivation.
- **mcp-go middleware support** — If `mcp-go` doesn't support handler middleware, the wrapper approach requires refactoring all tool registrations. Mitigation: straightforward mechanical change.
- **Eviction hides data** — If a session exceeds 1000 tool calls, early entries are lost. Mitigation: `evicted_count` in audit response makes this visible. In practice, sessions with 1000+ tool calls indicate a misbehaving model, not legitimate usage.

## Migration Plan

1. Add audit log struct and `call_id` counter to `Server` (non-breaking)
2. Implement wrapper function for tool handlers (refactor tool registration)
3. Add `epf_session_audit` and `epf_verify_workflow` tools (new tools, non-breaking)
4. Wire `ResetToolCallCounts()` to session reset events (bug fix)
5. Add workflow tracking to opencode-epf plugin (non-breaking addition)
6. Release epf-cli v0.29.0 and opencode-epf v0.3.0

No breaking changes. All additions are backward-compatible.

### 9. MCP server decomposition — when and how to split

The MCP server is currently a monolith: 5,146 lines in `server.go`, 26K lines across 29 files, 70+ tools spanning validation, strategy, AIM, agents, skills, generators, instance management, and workspace discovery. Adding session audit is the right time to acknowledge this is approaching the point where decomposition makes sense.

**Current state**: The monolith works because:
- Single binary deployment — `epf-cli serve` just works, no orchestration needed
- Shared state — strategy cache, schema loader, instance detection are shared across tools
- Simple configuration — one MCP server, one connection, done

**When to split**: The trigger for decomposition is NOT code size. It's when one of these becomes true:
- **Independent scaling** — Some tool groups need different resource profiles (e.g., strategy queries are read-heavy, AIM writes are mutation-heavy)
- **Independent release cycles** — Session audit infrastructure should be stable while strategy tools evolve rapidly
- **Cognitive overload** — A new contributor can't understand the server by reading `server.go` (arguably already true at 5K lines)
- **Tool discovery noise** — 70+ tools overwhelm LLM tool selection. Models perform worse with too many tools (empirically, >30-40 tools degrades selection accuracy)

**How it would work**: MCP supports tool namespacing but not natively multiple servers per connection. Two practical approaches:

1. **Internal decomposition (recommended first step)**: Keep single binary, but refactor `server.go` into a thin dispatcher that delegates to domain-specific registrars. Each registrar owns its tools, state, and handlers. The audit middleware wraps the dispatcher, so it applies universally. This is what the wrapper pattern in Decision 3 already sets up.

2. **Process decomposition (future)**: Split into multiple MCP servers behind a proxy or use the MCP "tool groups" pattern if the spec evolves to support it. Each server owns a domain:
   - `epf-cli serve --tools=core` — validation, health, instance management, audit
   - `epf-cli serve --tools=strategy` — vision, personas, roadmap, search, competitive
   - `epf-cli serve --tools=aim` — assessment, calibration, OKR progress, SRC
   - `epf-cli serve --tools=agents` — agent/skill/wizard/generator management

   The plugin would connect to multiple servers, or a lightweight proxy would multiplex.

**Decision for this change**: We do NOT split the server in this change. Instead, the wrapper/middleware pattern we're introducing for audit logging is designed to make future decomposition easier — it creates a clean interception layer between tool registration and handler execution. When the time comes to split, each domain registrar takes its handlers and the dispatcher becomes a router.

**Monitoring signal**: Track these metrics to know when to split:
- Tool count per `epf-cli version` output (currently 70+, watch for >100)
- `server.go` line count (currently 5.1K, watch for >8K)
- LLM tool selection accuracy (if models start calling wrong tools, too many tools is likely the cause)
- New contributor onboarding time for MCP package

## Open Questions

- Does `mcp-go` (v0.26+) support handler middleware or interceptors? If so, we should use that instead of a custom wrapper. Need to check the library API.
- Should the `_call_id` field be in the JSON payload or in MCP response metadata? JSON payload is simpler but adds a field to every response schema. MCP metadata would be cleaner but may not be supported by all clients.
- Should the plugin's agent completion gate be a toast warning or a conversation-injected system message? Toast is less intrusive but easier to ignore. System message ensures the LLM sees it.
- At what tool count threshold should we implement `--tools` flag filtering? Should it be a hard split (separate processes) or soft split (single process, filtered tool registration)?
