## ADDED Requirements

### Requirement: Strategy Graph Ingestion
The system SHALL ingest EPF strategy artifacts into the `emergent.memory` semantic graph using
the `epf-cli/internal/ingest` pipeline. Ingestion SHALL be triggered on instance import and
on batch commit. Ingestion SHALL be idempotent (upsert-by-key).

#### Scenario: Ingestion on import
- **WHEN** `import_instance` is committed
- **THEN** all EPF artifacts are decomposed into graph objects and upserted to Memory
- **AND** the instance's `memory_ingested_at` timestamp is updated

#### Scenario: Ingestion is idempotent
- **WHEN** the same instance is ingested twice without changes
- **THEN** no duplicate objects are created in Memory
- **AND** the operation succeeds without error

### Requirement: Semantic Search
The system SHALL expose semantic search over the strategy graph via the `search_strategy`
MCP tool and `GET /api/search` REST endpoint. Results SHALL be ranked by semantic relevance.

#### Scenario: Search returns relevant results
- **WHEN** `search_strategy` is called with `query: "reduce time to value for new customers"`
- **THEN** features and personas related to onboarding and activation are ranked highest
- **AND** unrelated features (e.g. billing, security) are ranked lower or absent

### Requirement: Contradiction Detection
The system SHALL detect structural contradictions in the strategy graph (e.g. a feature
claiming to address a pain point not associated with any persona, or a value model component
with no supporting features) via the `detect_contradictions` MCP tool.

#### Scenario: Contradiction detected
- **WHEN** `detect_contradictions` is called on an instance with a dangling value model component
- **THEN** the response includes the contradiction with `type`, `description`, `severity`, and `fix_with` instructions

### Requirement: What-If Scenario Exploration
The system SHALL support what-if scenario exploration via the `run_scenario` and
`evaluate_scenario` MCP tools, using Memory graph branching. Scenarios SHALL be isolated
from the main graph until explicitly committed or discarded.

#### Scenario: Create and evaluate scenario
- **WHEN** `run_scenario` is called with `hypothesis: "Deprioritize feature X and accelerate feature Y"`
- **THEN** a Memory branch is created
- **AND** the hypothesis modifications are applied to the branch
- **WHEN** `evaluate_scenario` is called
- **THEN** the propagation circuit runs on the branch
- **AND** the response includes proposed cascading changes and affected nodes

#### Scenario: Scenario does not affect main graph
- **WHEN** a scenario is active with modifications on the branch
- **THEN** `get_feature` on the main instance returns the unmodified feature state
- **AND** the scenario's changes are visible only via `evaluate_scenario` and `diff_scenario`

#### Scenario: Discard scenario cleans up branch
- **WHEN** `discard_scenario` is called
- **THEN** the Memory branch is deleted
- **AND** the main graph is unchanged
