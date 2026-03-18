# Capability: EPF Semantic Strategy Engine

The semantic strategy engine treats EPF artifacts as a live semantic graph.
Changes at any node propagate through the graph using tiered LLM reasoning,
enabling real-time impact analysis, contradiction detection, and what-if
scenario projection.

## Architecture

The engine consists of six packages in `apps/epf-cli/internal/`:

| Package | Purpose |
|---------|---------|
| `decompose` | Parse EPF YAML into graph objects and structural edges |
| `memory` | REST client for emergent.memory graph API |
| `ingest` | Push decomposed objects to Memory, incremental sync |
| `reasoning` | Tiered LLM reasoning (Local/Cloud/Frontier) |
| `propagation` | Propagation circuit with 4-layer protection |
| `scenario` | What-if exploration via graph branching |

### Requirement: Artifact Decomposition

The system SHALL parse EPF YAML artifacts into section-level graph objects
with stable keys, mapping each section to one of 14 schema v2 object types
with an `inertia_tier` property (1=highest resistance, 7=lowest).

#### Scenario: Decompose full EPF instance

- **WHEN** the decomposer is given a valid EPF instance path
- **THEN** it produces typed graph objects for all artifact sections
- **AND** structural relationships (contains, contributes_to, depends_on, etc.)
- **AND** all objects have non-empty keys, inertia_tier, and source_artifact

#### Scenario: Handle missing or empty artifacts

- **WHEN** the decomposer is given an instance with missing YAML files
- **THEN** it skips missing files without error
- **AND** produces objects only for files that exist

#### Scenario: Version compatibility warning

- **WHEN** the instance has an EPF version higher than the decomposer supports
- **THEN** it emits a warning but continues decomposition

### Requirement: Graph Ingestion

The system SHALL upsert decomposed objects to emergent.memory using the
REST API, with idempotent upsert-by-key semantics.

#### Scenario: Full ingestion

- **WHEN** `epf ingest <instance-path>` is run
- **THEN** all objects are upserted to Memory
- **AND** all structural relationships are created
- **AND** upsert statistics are reported

#### Scenario: Incremental sync

- **WHEN** `epf sync <instance-path>` is run
- **THEN** only objects with changed content hashes are upserted
- **AND** unchanged objects are skipped (no API call)

### Requirement: Tiered Reasoning

The system SHALL evaluate node changes using LLM models selected by the
target node's inertia tier, with confidence-based escalation.

#### Scenario: Tier routing

- **WHEN** a node at inertia tier 5-7 is evaluated
- **THEN** the Local reasoner (Ollama) is used
- **WHEN** a node at inertia tier 3-4 is evaluated
- **THEN** the Cloud reasoner is used
- **WHEN** a node at inertia tier 1-2 is evaluated
- **THEN** the Frontier reasoner is used

#### Scenario: Confidence escalation

- **WHEN** the initial tier returns confidence below 0.6
- **AND** the verdict is not "unchanged"
- **THEN** the evaluation is retried at the next higher tier

### Requirement: Propagation Circuit

The system SHALL propagate strategy changes through the graph using a BFS
traversal with signal decay, inertia thresholds, and circuit protection.

#### Scenario: Signal propagation

- **WHEN** a signal is emitted from a changed node
- **THEN** each neighbor is evaluated if signal strength exceeds its inertia threshold
- **AND** modified nodes emit new signals (decayed) for further propagation
- **AND** unchanged nodes stop propagation on their branch

#### Scenario: Circuit protection - signal decay

- **WHEN** a signal propagates through the graph
- **THEN** its strength is multiplied by the decay factor (default 0.7) per hop
- **AND** signals below the minimum strength (default 0.05) are dropped

#### Scenario: Circuit protection - oscillation

- **WHEN** a node is evaluated more than 3 times in a cascade
- **THEN** it is frozen and further evaluations are skipped

#### Scenario: Circuit protection - budget

- **WHEN** cumulative token usage exceeds the cascade budget
- **THEN** remaining evaluations are skipped and BudgetExhausted is reported

### Requirement: Impact Analysis

The system SHALL provide dry-run impact analysis showing the cascade
trace for a hypothetical change without applying modifications.

#### Scenario: Impact from feature change

- **WHEN** `epf impact <description> --node <key>` is run
- **THEN** the graph is loaded from Memory
- **AND** the propagation circuit runs in dry-run mode
- **AND** a formatted trace shows evaluations by wave, proposed changes by tier, and skipped nodes by reason

### Requirement: Scenario Projection

The system SHALL support what-if strategy exploration via graph branching.

#### Scenario: Create and evaluate scenario

- **WHEN** a scenario is created with `epf scenario create <name>`
- **THEN** a graph branch is created in Memory
- **WHEN** modifications are applied with `epf scenario modify`
- **THEN** changes are written to the branch only
- **WHEN** `epf scenario evaluate` is run
- **THEN** the propagation circuit runs on the branched graph
- **AND** a diff shows direct vs cascade modifications

#### Scenario: Discard scenario

- **WHEN** `epf scenario discard --branch <id>` is run
- **THEN** the branch is deleted without affecting the main graph

### Requirement: MCP Tool Integration

The system SHALL expose semantic engine capabilities as MCP tools.

#### Scenario: Semantic search

- **WHEN** `epf_semantic_search` is called with a query
- **THEN** it returns scored results from the Memory graph

#### Scenario: Semantic neighbors

- **WHEN** `epf_semantic_neighbors` is called with a node key
- **THEN** it returns all connected nodes with edge types and weights

#### Scenario: Semantic impact

- **WHEN** `epf_semantic_impact` is called with a node key and description
- **THEN** it runs the propagation circuit and returns the cascade trace

## CLI Commands

| Command | Description |
|---------|-------------|
| `epf ingest [path]` | Full ingestion to Memory (with --dry-run) |
| `epf sync [path]` | Incremental sync (only changed objects) |
| `epf impact <desc>` | Dry-run impact analysis |
| `epf scenario create` | Create a what-if branch |
| `epf scenario modify` | Modify nodes on a branch |
| `epf scenario evaluate` | Run circuit on branch |
| `epf scenario discard` | Delete branch |

## Configuration

| Env Var | Description |
|---------|-------------|
| `EPF_MEMORY_URL` | Memory server URL |
| `EPF_MEMORY_PROJECT` | Memory project ID |
| `EPF_MEMORY_TOKEN` | Memory API token |
