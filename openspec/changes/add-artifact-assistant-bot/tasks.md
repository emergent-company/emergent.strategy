# Tasks: Add context-aware artifact assistant bot and granular sub-object editing

## 1. Sub-object editing primitive (`domain/strategy/`)

- [ ] 1.1 Define `Patch` type (`op`, `path` RFC6901 JSON Pointer, `value`) and `PatchOp` enum (`set`, `remove`, `append`, `insert`)
- [ ] 1.2 Implement JSON Pointer apply over `json.RawMessage` payloads (set/remove/append/insert), with clear errors on unresolvable paths
- [ ] 1.3 Implement `StagePatch(ctx, instanceID, artifactKey, []Patch) (batchID, error)`: load current committed payload → apply patches in memory → re-validate full payload against canonical schema → `Stage` as whole-payload update mutation
- [ ] 1.4 Record the applied patch set + before/after values in `BatchMetadata` for diff rendering
- [ ] 1.5 Add stable-identity path resolution for known sub-objects (belief, value-model component, KR, feature) via the decompose layer where an identity field exists
- [ ] 1.6 Tests: apply each op; unresolvable path errors; schema-invalid result rejected (no batch staged); identity-based path resolution; idempotent set

## 2. Manual sub-object edit UI (`strategy-web`)

- [ ] 2.1 Define a per-artifact-type editability descriptor (which sub-objects/fields are editable vs read-only/canonical-derived)
- [ ] 2.2 Add inline "Edit" affordance + scoped edit form (templ + HTMX) to bespoke views for editable sub-objects (start with belief, KR, value-model component)
- [ ] 2.3 Add add/remove/reorder controls for list-typed sub-objects
- [ ] 2.4 Add `handler_artifact_edit.go`: POST handler that builds the patch set from form input and calls `StagePatch`, then redirects to the existing draft review screen
- [ ] 2.5 Register routes in `handler.go`; remove the global "read-only / use MCP" placeholder where editing is now supported
- [ ] 2.6 Render a precise per-field diff in the draft review screen from `BatchMetadata` patch records
- [ ] 2.7 Tests: edit form renders for editable sub-object; read-only sub-object has no edit affordance; POST stages a patch batch; review screen shows field-level diff

## 3. Assistant orchestrator (`domain/assistant/`)

- [ ] 3.1 Create `domain/assistant/` package with `Orchestrator` interface and a bounded tool-use loop (configurable max rounds, default 8)
- [ ] 3.2 Implement an LLM-backed orchestrator over `internal/llm`; add multi-turn `Chat([]ChatMessage)` + `tools`/function-calling to `internal/llm/client.go` if not already present
- [ ] 3.3 Implement `MockOrchestrator` (keyword → tool) for no-LLM operation
- [ ] 3.4 Provider/mocks selection with graceful fallback (LLM configured → real; else mock)
- [ ] 3.5 Tool registry: read tools (get/search artifacts, list evidence, get signals, semantic search) and write tools (`propose_patch`, `propose_evidence_link`, `propose_skill_run`)
- [ ] 3.6 Allowlist enforcement in two places: filter tool defs before sending to LLM, and re-check at execution time (no commit tool exists)
- [ ] 3.7 `propose_patch` tool calls `strategy.StagePatch` and returns a review link; assistant never commits
- [ ] 3.8 Emit assistant tool-call progress as activity events (reuse `domain/activity` if present)
- [ ] 3.9 Tests: bounded loop terminates; allowlist refuses off-list/commit tool (table + e2e harness, LLM-gated); mock orchestrator answers a read query; `propose_patch` stages a batch

## 4. Conversation persistence

- [ ] 4.1 Migration: `assistant_conversations` (id, instance_id, org_id, user_id, artifact_key, created_at, updated_at) and `assistant_messages` (id, conversation_id, role, content, tool_calls jsonb, citations jsonb, created_at)
- [ ] 4.2 Repository for conversations/messages with org+user scoping
- [ ] 4.3 Session lifecycle: get-or-create per (instance, artifact, user); append user/assistant messages per turn
- [ ] 4.4 Tests: messages persist across "restart" (new service instance, same DB); cross-user/cross-org isolation enforced

## 5. Context injection

- [ ] 5.1 Implement `BuildArtifactContext(ctx, instanceID, artifactKey, selectedPath)` assembling current artifact + sub-objects + related artifacts + linked evidence + open signals
- [ ] 5.2 Reuse `skillexec` context builder primitives; respect the token budget cap
- [ ] 5.3 Assemble per-turn system prompt fresh each message (current context, never stale)
- [ ] 5.4 Tests: context includes the focused artifact and its linked evidence; budget cap respected

## 6. Assistant UI (`strategy-web`)

- [ ] 6.1 `assistant_drawer.templ`: toggle button, message list, send form; mobile bottom-sheet variant
- [ ] 6.2 `handler_assistant.go`: GET drawer (with artifactKey + selectedPath context), POST send
- [ ] 6.3 Send payload carries instance_id, artifact_key, optional sub-object path, conversation_id, message
- [ ] 6.4 Render assistant turn as a server-rendered fragment appended to the message list
- [ ] 6.5 Surface "preparing change…" / tool-call progress via the existing SSE activity stream
- [ ] 6.6 When the assistant stages a batch, render an inline "Review change" link to the draft review screen
- [ ] 6.7 Tests: drawer renders with artifact context; send round-trips a mock answer; staged-batch link appears

## 7. MCP parity

- [ ] 7.1 Register `patch_artifact` MCP tool (JSON Pointer patches → `StagePatch`, staged for review)
- [ ] 7.2 Structured error responses (no raw Go errors to MCP clients)
- [ ] 7.3 Tests: `patch_artifact` stages a batch; invalid path returns structured error

## 8. Integration & coordination

- [ ] 8.1 If `add-operational-transparency` skill-run ledger is present, route `propose_skill_run` through it; otherwise emit activity events directly
- [ ] 8.2 Confirm bootstrap "Draft with AI" flows can stage through the same review path (no conflict with `add-strategy-bootstrap-flow`)
- [ ] 8.3 Lint clean (`task lint`)
- [ ] 8.4 Full test suite green (`go test ./...` with Postgres)
- [ ] 8.5 `openspec validate add-artifact-assistant-bot --strict` passes
