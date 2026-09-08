# Capability: strategy-mcp

## Purpose

MCP (Model Context Protocol) server — the primary Phase 2 interface. Every domain operation
is exposed as an MCP tool. The AI agent is the first client.

---

## Requirements

### Requirement: MCP Server Availability

The system SHALL expose an MCP HTTP endpoint at `/mcp`.

#### Scenario: Health check
- **WHEN** a client sends `GET /health`
- **THEN** the server returns `{"status":"ok","service":"strategy-server"}` with HTTP 200

#### Scenario: MCP tools discoverable
- **WHEN** an MCP client sends a `tools/list` request
- **THEN** all registered tools are returned with their names, descriptions, and input schemas

---

### Requirement: Read Tools

Read tools are safe (no state mutation) and do not require a staging batch.

| Tool | Description | Key Input | Key Output |
|---|---|---|---|
| `list_workspaces` | List accessible workspaces | pagination cursor | Workspace[] |
| `get_workspace` | Get workspace details | workspace_id | Workspace |
| `list_instances` | List strategy instances in a workspace | workspace_id | Instance[] |
| `get_instance` | Get instance details and health | instance_id | Instance + HealthSummary |
| `get_strategy_context` | Full strategic context (vision, personas, position) | instance_id | StrategicContext |
| `get_product_vision` | North star details | instance_id | NorthStar |
| `get_personas` | Persona list with pain points | instance_id | Persona[] |
| `get_competitive_position` | Competitive analysis | instance_id | CompetitivePosition |
| `get_roadmap` | Full roadmap summary | instance_id | Roadmap |
| `list_features` | Feature list with strategic alignment | instance_id, status? | Feature[] |
| `get_feature` | Individual feature details with value model | instance_id, feature_key | Feature |
| `list_mutations` | Change history for an instance | instance_id, artifact_type? | Mutation[] |
| `health_check` | Instance health report | instance_id | HealthReport |
| `search_strategy` | Semantic search across strategy graph | instance_id, query, limit? | SearchResult[] |
| `get_neighbors` | Graph neighborhood for a strategy node | instance_id, node_key | GraphNeighborhood |
| `detect_contradictions` | Structural contradiction scan | instance_id | Contradiction[] |

#### Scenario: Read tool returns current state
- **WHEN** a read tool is called
- **THEN** it returns the current committed state derived from the mutation ledger
- **AND** staged mutations are never included in read tool responses

#### Scenario: Tool descriptions are agent-friendly
- **WHEN** an agent scans tool descriptions
- **THEN** each description starts with a trigger phrase indicating when to use the tool
- **AND** descriptions are ≤ 120 characters

---

### Requirement: Write Tools

Write tools create staged mutations that require a subsequent `commit_batch` call.
No write tool directly modifies visible state.

| Tool | Description | Key Input | Key Output |
|---|---|---|---|
| `create_workspace` | Register a new workspace | github_owner | Workspace + batch_id |
| `import_instance` | Import EPF artifacts from GitHub into DB | workspace_id, github_repo, github_base_path? | Instance + batch_id |
| `update_north_star` | Draft north star change | instance_id, payload | batch_id |
| `create_feature` | Draft new feature | instance_id, payload | batch_id |
| `update_feature` | Draft feature update | instance_id, feature_key, payload | batch_id |
| `archive_feature` | Draft feature archival | instance_id, feature_key | batch_id |
| `run_scenario` | Create what-if graph branch | instance_id, description, anchor_node? | scenario_id |
| `commit_batch` | Atomically commit a staged batch | batch_id | CommitResult |
| `discard_batch` | Discard a staged batch | batch_id | DiscardResult |

#### Scenario: Write tool returns batch_id
- **WHEN** a write tool is called successfully
- **THEN** the response includes a `batch_id` that the agent presents to the user for confirmation
- **AND** the agent SHALL NOT call `commit_batch` without user confirmation

#### Scenario: Agent staging pattern
- **WHEN** a user asks the agent to update a feature
- **THEN** the agent calls `update_feature` → receives `batch_id`
- **AND** presents the staged change to the user for review
- **AND** only calls `commit_batch` when the user explicitly confirms
- **AND** calls `discard_batch` if the user declines

---

### Requirement: Auth on MCP Endpoint

The system SHALL protect the MCP endpoint with the same auth middleware as the REST API.

#### Scenario: Unauthenticated MCP request rejected in prod
- **WHEN** `AUTH_ENABLED=true` and an MCP request arrives without a valid session
- **THEN** the server returns HTTP 401 before routing to any tool handler

#### Scenario: Audit source set for MCP
- **WHEN** any MCP tool call creates a mutation
- **THEN** `source='mcp'` is recorded in the mutation and audit log

### Requirement: Skill Run Observability Tools

The system SHALL expose MCP tools for querying autonomous skill execution history,
enabling AI agents to understand what happened, what is in progress, and how much
LLM capacity was consumed.

#### Scenario: List skill runs for instance
- **WHEN** a caller invokes `list_skill_runs` with an `instance_id`
- **THEN** the system returns a paginated list of skill runs ordered by `started_at` descending
- **AND** each entry includes `run_id`, `skill_name`, `status`, `trigger`,
  `started_at`, `completed_at`, `duration_seconds`, `chunks_completed`/`chunk_count`,
  `total_input_tokens`, `total_output_tokens`, `batch_id` (if completed)

#### Scenario: Filter skill runs by status
- **WHEN** a caller invokes `list_skill_runs` with `status=running`
- **THEN** only runs with `status='running'` are returned

#### Scenario: Filter skill runs by trigger
- **WHEN** a caller invokes `list_skill_runs` with `trigger=ripple`
- **THEN** only runs triggered by ripple cascade are returned

#### Scenario: Get skill run detail
- **WHEN** a caller invokes `get_skill_run` with a `run_id`
- **THEN** the system returns the full run record including `trigger`, `trigger_context`,
  `chunk_log` with per-chunk timing, token counts, attempt counts, validation errors,
  and context truncation flags (dropped features count)

#### Scenario: Run not found
- **WHEN** a caller invokes `get_skill_run` with an unknown `run_id`
- **THEN** the system returns an error with "skill run not found"

#### Scenario: Get LLM usage summary
- **WHEN** a caller invokes `get_llm_usage` with an `instance_id`
- **THEN** the system returns aggregated token counts grouped by skill name
- **AND** includes total `input_tokens`, `output_tokens`, and `run_count` per skill

#### Scenario: LLM usage with date filter
- **WHEN** a caller invokes `get_llm_usage` with `since` and/or `until` ISO 8601 dates
- **THEN** only runs within the date range are included in the aggregation

---

### Requirement: Autonomous Run Tracking in run_skill

The `run_skill` tool in autonomous mode SHALL return a `run_id` that callers can use
to track execution progress via `get_skill_run`.

#### Scenario: Autonomous mode returns run_id
- **WHEN** a caller invokes `run_skill` with `mode=autonomous`
- **THEN** the response includes `run_id` (UUID), `status="running"`, and a message
  directing the caller to use `get_skill_run` or `list_pending_batches` for progress

#### Scenario: Poll run progress
- **WHEN** a caller polls `get_skill_run` with the returned `run_id`
- **THEN** the response shows real-time chunk progress: which chunks have completed,
  current token usage, and estimated remaining chunks

### Requirement: Lifecycle Mode Detection Covers the Full READY Set

<!-- Relocated 2026-09-08. This was written as a MODIFIED requirement against
     strategy-web, but no such requirement has ever existed in that capability and
     lifecycle detection is not a web concern: it is implemented in
     internal/mcpserver/lifecycle.go and surfaced through MCP next_steps. Recorded
     here as ADDED, against the capability that actually owns it. -->

The lifecycle mode detection SHALL check all 7 READY artifact types for the
`foundation` mode transition. When evidence items exist but READY artifacts are
placeholder-only, the system SHALL recommend the bootstrap flow.

#### Scenario: Evidence loaded but placeholder artifacts
- **WHEN** evidence items exist but READY artifacts contain only placeholders
- **THEN** the lifecycle mode is `foundation`
- **AND** next_steps recommend starting the bootstrap flow

#### Scenario: Complete foundation
- **WHEN** all 7 READY artifacts exist with substantive content and at least 1 feature exists
- **THEN** the lifecycle mode transitions to `building`
