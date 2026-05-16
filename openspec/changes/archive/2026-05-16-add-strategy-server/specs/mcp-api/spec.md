## ADDED Requirements

### Requirement: MCP Server — Primary Interface
The strategy-server SHALL expose an MCP server over HTTP at `/mcp` (Streamable HTTP transport).
Every domain capability SHALL be accessible via MCP tools. The MCP interface SHALL be the
primary and complete interface for Phase 2 — an AI agent SHALL be able to complete any user
journey using only MCP tools.

#### Scenario: MCP tools discoverable
- **WHEN** an AI agent calls `tools/list` on the MCP server
- **THEN** all registered tools are returned with accurate descriptions, input schemas, and read/write classification

#### Scenario: MCP operable without web UI
- **WHEN** an AI agent is given a user story in plain language
- **THEN** it can complete the story using only MCP tools, with no workarounds
- **AND** the resulting database state is correct

### Requirement: Read Tools — No Side Effects
Read tools SHALL be safe to call at any time, return structured JSON, and have zero side
effects. They SHALL NOT require a staging batch.

#### Scenario: list_workspaces returns scoped results
- **WHEN** `list_workspaces` is called by an authenticated user
- **THEN** only workspaces accessible to that user's GitHub identity are returned
- **AND** the response is a JSON array with consistent pagination envelope

#### Scenario: get_strategy_context returns full context
- **WHEN** `get_strategy_context` is called with a valid `instance_id`
- **THEN** the response includes `vision`, `personas`, `competitive_position`, `roadmap_summary`, and `strategic_priorities` as structured JSON

#### Scenario: search_strategy returns ranked results
- **WHEN** `search_strategy` is called with `query: "customer onboarding friction"` and `instance_id`
- **THEN** semantically relevant strategy objects are returned, ranked by relevance
- **AND** each result includes `key`, `type`, `title`, and a relevance `score`

#### Scenario: validate_artifact returns typed errors
- **WHEN** `validate_artifact` is called with a YAML file containing a schema violation
- **THEN** the response contains `valid: false` and a list of errors with `path`, `message`, and `fix_hint`

### Requirement: Write Tools — Staging Required
Write tools SHALL create a staging batch and return a `batch_id`. They SHALL NOT modify
persistent state until `commit_batch` is called. The tool description SHALL explicitly state
"creates a staging draft — does not commit".

#### Scenario: update_feature creates staging record
- **WHEN** `update_feature` is called with modified feature data
- **THEN** the response includes `batch_id`, `preview` of the change, and `expires_at`
- **AND** the active feature state is unchanged

#### Scenario: commit_batch applies changes atomically
- **WHEN** `commit_batch` is called with a valid `batch_id`
- **THEN** all staged mutations in the batch become active in a single database transaction
- **AND** the `batch_id` is no longer valid for further operations

#### Scenario: discard_batch removes staging records
- **WHEN** `discard_batch` is called with a valid `batch_id`
- **THEN** all staging records for that batch are deleted
- **AND** active state is unchanged

### Requirement: MCP Tool Descriptions Are Precise
Every MCP tool description SHALL state: what it does (one sentence), what it does NOT do (if
there is a common confusion), any preconditions, and whether it modifies data or is read-only.
Error messages SHALL be complete sentences that explain what went wrong and what to do.

#### Scenario: Tool description includes non-action
- **WHEN** a tool description is read for a write tool
- **THEN** it includes a sentence starting with "Does not" or "This tool does not" clarifying what the tool explicitly does not do

#### Scenario: Error message is user-readable
- **WHEN** `update_feature` is called with a non-existent `feature_id`
- **THEN** the error message is "Feature not found: no feature with ID '<id>' exists in instance '<instance_id>'."
- **AND** never a raw Go error or constraint violation string

### Requirement: MCP Auth Integration
The MCP HTTP endpoint SHALL be protected by the same auth middleware as the REST API.
Multi-tenant auth (GitHub App OAuth) SHALL be supported. The audit context SHALL be set to
`source: "mcp"` for all MCP-originated writes.

#### Scenario: Unauthenticated MCP request rejected
- **WHEN** `POST /mcp` is called without a valid bearer token in multi-tenant mode
- **THEN** the response is `401 Unauthorized` with a WWW-Authenticate header

#### Scenario: MCP writes are audited with source "mcp"
- **WHEN** a write tool is called and the batch is committed
- **THEN** the resulting `strategy_mutations` row has `source: "mcp"`
- **AND** the `audit_log` entry has `source: "mcp"` and the authenticated user's ID
