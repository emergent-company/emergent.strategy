## ADDED Requirements

### Requirement: Agent Task Routing

The system SHALL provide a task routing tool that directs agents to the
appropriate tool or agent for a given natural-language task description.

#### Scenario: Direct tool routing
- **WHEN** an agent calls `get_agent_for_task` with a task like "validate the north star"
- **THEN** the system returns a `direct_tool` recommendation with the tool name and parameters
- **AND** no agent activation is needed

#### Scenario: Agent routing
- **WHEN** an agent calls `get_agent_for_task` with a task like "create a new feature for user onboarding"
- **THEN** the system returns an agent recommendation with the agent name and relevant skills
- **AND** the agent can be activated for an interactive workflow

#### Scenario: Unknown task
- **WHEN** an agent calls `get_agent_for_task` with an unrecognised task
- **THEN** the system returns the most likely match with a confidence score
- **AND** suggests alternative tools if confidence is below threshold

---

### Requirement: Organisation Management Tools

The system SHALL expose org management operations as MCP tools.

#### Scenario: Create org via MCP
- **WHEN** an agent calls `create_org` with a name
- **THEN** an org is created and the caller is added as admin
- **AND** the response includes the org ID

#### Scenario: List orgs via MCP
- **WHEN** an agent calls `list_orgs`
- **THEN** the response includes all orgs the caller is a member of

#### Scenario: Invite member via MCP
- **WHEN** an agent calls `invite_member` with org_id, email, and role
- **THEN** the member is invited (immediate membership or pending invitation)

#### Scenario: Remove member via MCP
- **WHEN** an agent calls `remove_member` with org_id and user_id
- **THEN** the member is removed (with last-admin protection)

#### Scenario: List members via MCP
- **WHEN** an agent calls `list_members` with org_id
- **THEN** the response includes all members with roles and pending invitations

---

### Requirement: Phase and Definition Tools

The system SHALL expose EPF framework reference tools for agents.

#### Scenario: List phase artifacts
- **WHEN** an agent calls `get_phase_artifacts` with a phase name
- **THEN** the system returns the artifact types belonging to that phase (READY, FIRE, AIM)

#### Scenario: List definitions
- **WHEN** an agent calls `list_definitions`
- **THEN** the system returns all canonical track definitions

#### Scenario: Get definition
- **WHEN** an agent calls `get_definition` with a definition ID
- **THEN** the system returns the full definition YAML content

---

## MODIFIED Requirements

### Requirement: Read Tools

The system SHALL expose read tools that are safe (no state mutation) and do not require a staging batch.

| Tool | Description | Key Input | Key Output |
|---|---|---|---|
| `list_workspaces` | List accessible workspaces | pagination cursor | Workspace[] |
| `get_workspace` | Get workspace details | workspace_id | Workspace |
| `list_instances` | List strategy instances in a workspace | workspace_id | Instance[] |
| `get_instance` | Get instance details and health | instance_id | Instance + HealthSummary |
| `get_strategy_context` | Full strategic context (vision, personas, position) | instance_id | StrategicContext |
| `get_product_vision` | North star details | instance_id | NorthStar |
| `get_personas` | Persona list with pain points | instance_id | Persona[] |
| `get_persona_details` | Deep persona detail with pain points and jobs-to-do | instance_id, persona_id | PersonaDetail |
| `get_competitive_position` | Competitive analysis | instance_id | CompetitivePosition |
| `get_roadmap` | Full roadmap summary | instance_id | Roadmap |
| `list_features` | Feature list with strategic alignment | instance_id, status? | Feature[] |
| `get_feature` | Individual feature details with value model | instance_id, feature_key | Feature |
| `list_mutations` | Change history for an instance | instance_id, artifact_type? | Mutation[] |
| `health_check` | Instance health report | instance_id | HealthReport |
| `search_strategy` | Semantic search across strategy graph | instance_id, query, limit? | SearchResult[] |
| `get_neighbors` | Graph neighborhood for a strategy node | instance_id, node_key | GraphNeighborhood |
| `detect_contradictions` | Structural contradiction scan | instance_id | Contradiction[] |
| `get_agent_for_task` | Route task to tool or agent | task_description | RoutingResult |
| `list_definitions` | List canonical track definitions | — | Definition[] |
| `get_definition` | Get definition content by ID | definition_id | Definition |
| `get_phase_artifacts` | List artifact types by phase | phase | ArtifactType[] |
| `list_orgs` | List caller's organisations | — | Org[] |
| `list_members` | List org members and invitations | org_id | Member[] |

#### Scenario: Read tool returns current state
- **WHEN** a read tool is called
- **THEN** it returns the current committed state derived from the mutation ledger
- **AND** staged mutations are never included in read tool responses

#### Scenario: Org-scoped reads
- **WHEN** a read tool is called by an authenticated user
- **THEN** results are filtered to the caller's accessible organisations
- **AND** workspaces/instances from foreign orgs are never returned

#### Scenario: Tool descriptions are agent-friendly
- **WHEN** an agent scans tool descriptions
- **THEN** each description starts with a trigger phrase indicating when to use the tool
- **AND** descriptions are no longer than 120 characters

---

### Requirement: Write Tools

The system SHALL expose write tools that create staged mutations requiring a
subsequent `commit_batch` call. No write tool SHALL directly modify visible state.

| Tool | Description | Key Input | Key Output |
|---|---|---|---|
| `create_workspace` | Register a new workspace | name, org_id | Workspace + batch_id |
| `import_instance` | Import EPF artifacts from GitHub into DB | workspace_id, github_repo, github_base_path? | Instance + batch_id |
| `update_north_star` | Draft north star change | instance_id, payload | batch_id |
| `create_feature` | Draft new feature | instance_id, payload | batch_id |
| `update_feature` | Draft feature update | instance_id, feature_key, payload | batch_id |
| `archive_feature` | Draft feature archival | instance_id, feature_key | batch_id |
| `run_scenario` | Create what-if graph branch | instance_id, description, anchor_node? | scenario_id |
| `commit_batch` | Atomically commit a staged batch | batch_id | CommitResult |
| `discard_batch` | Discard a staged batch | batch_id | DiscardResult |
| `create_org` | Create an organisation | name | Org |
| `invite_member` | Invite a member to an org | org_id, email, role | Invitation |
| `remove_member` | Remove a member from an org | org_id, user_id | — |

#### Scenario: Write tool returns batch_id
- **WHEN** a write tool is called successfully
- **THEN** the response includes a `batch_id` that the agent presents to the user for confirmation
- **AND** the agent SHALL NOT call `commit_batch` without user confirmation

#### Scenario: Org admin required for org writes
- **WHEN** an `org_viewer` attempts to call a write tool
- **THEN** the server returns an error indicating insufficient permissions

#### Scenario: Agent staging pattern
- **WHEN** a user asks the agent to update a feature
- **THEN** the agent calls `update_feature` then receives `batch_id`
- **AND** presents the staged change to the user for review
- **AND** only calls `commit_batch` when the user explicitly confirms
- **AND** calls `discard_batch` if the user declines
