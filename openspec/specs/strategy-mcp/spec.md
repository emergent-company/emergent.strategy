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

### Requirement: Validation Verdict Envelope

Every MCP tool that renders a validation verdict SHALL return a shared,
machine-readable envelope as `structuredContent`, and SHALL publish a matching
`outputSchema` so the envelope is discoverable rather than folklore.

The envelope SHALL contain `ok`, `summary`, `counts` and `findings`. The
envelope SHALL be identical across every validation tool, so a consumer can
read `ok` and `findings` without knowing which tool it called.

Tools covered: `validate_artifact`, `validate_instance`,
`validate_relationships`, `validate_with_plan`, `check_content_readiness`.

`health_check` is explicitly NOT covered: it reports completeness, not a
verdict, and defining `ok` for it would require the server to choose a
threshold for "healthy".

#### Scenario: A validation tool reports a verdict

- **WHEN** any covered validation tool completes
- **THEN** the response carries `structuredContent` matching the tool's
  published `outputSchema`
- **AND** `ok` is `true` if and only if `counts.error` is zero
- **AND** `counts.checked` reports how many subjects were examined, so a
  consumer can distinguish "clean" from "nothing ran"
- **AND** the existing human-readable `content` is present and unchanged

#### Scenario: Finding problems is a successful call

- **WHEN** a validation tool finds any number of errors in its subject
- **THEN** `isError` is `false`
- **AND** the verdict is carried in `ok` and `findings`

`isError` SHALL mean the call could not be performed. It SHALL NOT be used to
signal that the subject is invalid, because that would remove a caller's
ability to ask "what is the validation state?" — a legitimate query for
dashboards, coverage reports and surveying agents.

#### Scenario: The call genuinely fails

- **WHEN** a validation tool cannot perform the check — the instance does not
  exist, the schema cannot be compiled, the caller lacks access
- **THEN** `isError` is `true`
- **AND** no verdict is reported, because none was reached

#### Scenario: A consumer applies its own threshold

- **WHEN** a consumer needs a policy other than "zero errors"
- **THEN** `findings` enumerates every problem individually with its severity
- **AND** the consumer computes its own verdict from them

Acceptability is policy and it varies. An instance with a tolerated backlog
returns `ok: false` on every call; a consumer that gated on `ok` alone would
block all work there permanently. The server SHALL own the shape of a verdict
and SHALL NOT own the threshold for acting on it. Tool descriptions SHALL
state this, so `ok` is not mistaken for a universally meaningful gate.

### Requirement: Structured Validation Findings

Validation findings SHALL carry structured fields — severity, subject key,
rule identifier, and location — derived from the validator's own structured
error, NOT by reformatting a rendered error message.

Each finding SHALL have a stable identity across runs for unchanged input, so
a consumer can baseline current findings and act only on new ones.

#### Scenario: A schema violation becomes a finding

- **WHEN** an artifact fails schema validation
- **THEN** each distinct violation becomes one finding
- **AND** the finding carries the failing keyword as `rule` and the location
  within the payload as `path`, both taken from the structured validation
  error rather than parsed out of its message text

#### Scenario: Findings are stable across runs

- **WHEN** the same unchanged input is validated twice
- **THEN** the findings have identical `(key, rule, path)` tuples both times

A prose message is not a stable identifier — it changes whenever the
validation library rewords its output, which would present to a baselining
consumer as a wave of phantom new findings.

#### Scenario: Existing string errors keep working

- **WHEN** structured findings are added to a validation result
- **THEN** the existing `errors` string list remains populated exactly as
  before
- **AND** existing readers of that field continue to work without change

### Requirement: Answering Guidance In The Outline

The system SHALL carry guidance on how to answer in the whole-instance outline
returned by `get_outline`. The guidance SHALL have two parts:

- `how_to_answer`: the general rules for answering questions from a company's
  strategy, held in the server. They SHALL state at least: follow a read that
  came back over budget; run a keyword search before saying the strategy does
  not state something; collect across tracks for a question about a function;
  list the facts read and check the draft against them before sending it; keep
  exact dates, counts and names; say what is undecided, excluded or left to
  someone else; keep "My reading" apart from the strategy and never in place of
  a fact it states; keep internal codes out of the body and name the sources in
  one closing line.
- `company_rules`: the prompt of the skill named `answering-rules` installed in
  that instance, when there is one. It SHALL carry the skill name, the pack
  name, the text, its size in characters and whether it was cut. The text SHALL
  be cut at 8,000 characters and say so. The system SHALL NOT run the skill; the
  text is guidance for the reader.

The guidance SHALL NOT be carried in the outline of a single artifact. The
general rules SHALL NOT name any company, customer or competitor. Rules that
belong to one company (audience, vocabulary, format) SHALL live only in that
instance's pack.

The server instructions SHALL tell the client to follow the guidance in the
outline.

#### Scenario: An instance without the pack

- **WHEN** a client calls `get_outline` for an instance that has no skill named
  `answering-rules`
- **THEN** the response carries `how_to_answer` and no `company_rules`

#### Scenario: An instance with the pack

- **WHEN** a pack that contains a skill named `answering-rules` is installed in
  an instance and a client calls `get_outline` for it
- **THEN** the response carries `company_rules` with the skill's prompt, the
  pack name and the size, and `how_to_answer` is unchanged

#### Scenario: A skill with another name

- **WHEN** an instance has an installed skill that is not named
  `answering-rules`
- **THEN** the outline carries no `company_rules`

#### Scenario: Long company rules

- **WHEN** the skill's prompt is longer than 8,000 characters
- **THEN** `company_rules.text` holds the first 8,000 characters,
  `size_chars` holds the full length and `truncated` is true

#### Scenario: One artifact's outline

- **WHEN** a client calls `get_outline` with an `artifact`
- **THEN** the response carries no guidance

### Requirement: Reserved Skill Name Is Discoverable

`describe_pack_format` SHALL list the skill names the server gives a meaning to
(`reserved_skill_names`), each with what it does. It SHALL list `answering-rules`
and say that its prompt is returned by `get_outline` as `guidance.company_rules`,
cut at 8,000 characters, and never run.

#### Scenario: A pack author asks for the format

- **WHEN** a client calls `describe_pack_format`
- **THEN** the response lists `answering-rules` with its effect

### Requirement: Objectives View Returns The Whole Index

The `objectives` view SHALL use a default budget of 24,000 characters when the
caller gives no `max_chars`, so that one call returns every objective and key
result of a roadmap of the size measured in the pilot (about 15,000
characters). An explicit `max_chars` SHALL be honoured, and the cap of 40,000
SHALL stay.

#### Scenario: A roadmap over the general default

- **WHEN** a roadmap's objectives index is 15,000 characters and a client calls
  the `objectives` view without `max_chars`
- **THEN** the response carries every key result and is not truncated

#### Scenario: An explicit smaller budget

- **WHEN** the same call gives `max_chars` 5,000
- **THEN** the part is truncated and lists the tracks as children
