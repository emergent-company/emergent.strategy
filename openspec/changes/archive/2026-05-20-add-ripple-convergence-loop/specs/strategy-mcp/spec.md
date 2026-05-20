## MODIFIED Requirements

### Requirement: Read Tools

The system SHALL expose read tools that are safe (no state mutation) and do
not require a staging batch. The system SHALL include equilibrium,
convergence history, and ripple configuration tools in the read tool set.

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
| `health_check` | Instance health report with equilibrium score | instance_id | HealthReport + EquilibriumStatus |
| `search_strategy` | Semantic search across strategy graph | instance_id, query, limit? | SearchResult[] |
| `get_neighbors` | Graph neighborhood for a strategy node | instance_id, node_key | GraphNeighborhood |
| `detect_contradictions` | Structural contradiction scan | instance_id | Contradiction[] |
| `get_equilibrium_status` | Current equilibrium score and breakdown | instance_id | EquilibriumReport |
| `get_convergence_history` | Past convergence loop runs | instance_id, damping_reason? | ConvergenceRun[] |
| `get_ripple_config` | Current ripple configuration for instance | instance_id | RippleConfig |

#### Scenario: Read tool returns current state

- **WHEN** a read tool is called
- **THEN** it returns the current committed state derived from the mutation ledger
- **AND** staged mutations are never included in read tool responses

#### Scenario: Tool descriptions are agent-friendly

- **WHEN** an agent scans tool descriptions
- **THEN** each description starts with a trigger phrase indicating when to use the tool
- **AND** descriptions are at most 120 characters

---

### Requirement: Write Tools

The system SHALL expose write tools that create staged mutations requiring a
subsequent `commit_batch` call. No write tool SHALL directly modify visible
state. The `commit_batch` tool SHALL additionally trigger a convergence loop
that may auto-commit autonomous-tier fixes.

| Tool | Description | Key Input | Key Output |
|---|---|---|---|
| `create_workspace` | Register a new workspace | github_owner | Workspace + batch_id |
| `import_instance` | Import EPF artifacts from GitHub into DB | workspace_id, github_repo, github_base_path? | Instance + batch_id |
| `update_north_star` | Draft north star change | instance_id, payload | batch_id |
| `create_feature` | Draft new feature | instance_id, payload | batch_id |
| `update_feature` | Draft feature update | instance_id, feature_key, payload | batch_id |
| `archive_feature` | Draft feature archival | instance_id, feature_key | batch_id |
| `run_scenario` | Create what-if graph branch | instance_id, description, anchor_node? | scenario_id |
| `commit_batch` | Atomically commit a staged batch, then run convergence loop | batch_id | CommitResult + ConvergenceSummary |
| `discard_batch` | Discard a staged batch | batch_id | DiscardResult |
| `update_ripple_config` | Update ripple thresholds for an instance | instance_id, config | RippleConfig |

#### Scenario: Write tool returns batch_id

- **WHEN** a write tool is called successfully
- **THEN** the response includes a `batch_id` that the agent presents to the user for confirmation
- **AND** the agent SHALL NOT call `commit_batch` without user confirmation

#### Scenario: Agent staging pattern

- **WHEN** a user asks the agent to update a feature
- **THEN** the agent calls `update_feature` and receives a `batch_id`
- **AND** presents the staged change to the user for review
- **AND** only calls `commit_batch` when the user explicitly confirms
- **AND** calls `discard_batch` if the user declines

#### Scenario: Commit batch with convergence

- **WHEN** a caller calls `commit_batch` with a valid `batch_id`
- **THEN** the batch is committed atomically
- **AND** the convergence loop runs synchronously
- **AND** the response includes both the commit result and a `convergence_summary` with: iterations, auto-resolved count, escalated count, equilibrium score, and damping reason if applicable

#### Scenario: Update ripple configuration

- **WHEN** a caller calls `update_ripple_config` with new thresholds
- **THEN** the instance's ripple configuration is updated
- **AND** subsequent convergence loops use the new thresholds
- **AND** the response returns the full updated configuration

---

## ADDED Requirements

### Requirement: Ripple Configuration Tools

The system SHALL expose MCP tools for viewing and updating the ripple
configuration of an instance, including authority thresholds, equilibrium
threshold, damping parameters, and natural tension baselines.

#### Scenario: Get ripple configuration

- **WHEN** a caller requests the ripple configuration for an instance
- **THEN** the system returns the current configuration including: authority tier thresholds (per artifact type), equilibrium threshold, damping parameters (max iterations, change budget, anchor drift limit), and natural tension baselines per track pair

#### Scenario: Update authority thresholds

- **WHEN** a caller updates the authority thresholds for a specific artifact type
- **THEN** the thresholds are persisted and used by subsequent convergence loops
- **AND** the response confirms the updated thresholds

#### Scenario: Update equilibrium threshold

- **WHEN** a caller updates the equilibrium threshold for an instance
- **THEN** the new threshold is used to determine when the convergence loop stops
- **AND** the current equilibrium status is re-evaluated against the new threshold and returned

#### Scenario: Update natural tension baselines

- **WHEN** a caller updates the natural tension baseline for a track pair
- **THEN** the new baseline is used in equilibrium scoring
- **AND** existing tension signals within the new baseline are annotated as `within_baseline: true`
