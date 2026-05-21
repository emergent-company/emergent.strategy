## ADDED Requirements

### Requirement: Background Heartbeat

The system SHALL run a periodic background process that evaluates AIM triggers for
all active strategy instances at a configurable interval (default: 5 minutes).

When a trigger fires, the system SHALL record a heartbeat signal with the instance ID,
trigger reason, human-readable message, and timestamp.

Heartbeat signals SHALL be surfaced via SSE for real-time UI notification and via MCP
tools for agent consumption.

The heartbeat SHALL NOT initiate any AIM cycle or modify any strategy artifact. It is
detection and notification only.

#### Scenario: Time-based trigger fires via heartbeat

- **WHEN** a strategy instance has not had an assessment for longer than the configured
  threshold (default 90 days)
- **AND** the heartbeat evaluates that instance
- **THEN** a heartbeat signal is created with reason "time" and the instance's trigger
  state
- **AND** the signal is published via SSE

#### Scenario: Signal-based trigger fires via heartbeat

- **WHEN** a strategy instance has more active critical ripple signals than the
  configured threshold (default 3)
- **AND** the heartbeat evaluates that instance
- **THEN** a heartbeat signal is created with reason "signals"

#### Scenario: Heartbeat skips healthy instances

- **WHEN** a strategy instance has a recent assessment and critical signals below
  threshold
- **THEN** no heartbeat signal is created for that instance

#### Scenario: Heartbeat graceful degradation

- **WHEN** the heartbeat encounters a database error evaluating a specific instance
- **THEN** it logs a warning and continues evaluating remaining instances
- **AND** no heartbeat signal is created for the failed instance

### Requirement: Activity Stream

The system SHALL maintain a persistent activity log capturing all autonomous and
semi-autonomous processing events across the platform.

Activity types SHALL include: convergence_run, signal_created, signal_auto_resolved,
evidence_ingested, trigger_evaluated, trigger_fired, cycle_proposed, cycle_started,
cycle_step_completed, heartbeat_run.

Activities SHALL be recorded synchronously in domain services and published via SSE
for real-time streaming.

Activities SHALL be queryable via MCP tool with cursor pagination and type filtering.

#### Scenario: Convergence run recorded

- **WHEN** the convergence loop completes after a commit_batch
- **THEN** an activity entry is created with type "convergence_run" containing the
  convergence summary (iterations, auto-resolved count, equilibrium score, damping
  reason)

#### Scenario: Activity stream via SSE

- **WHEN** a client subscribes to the activity SSE endpoint for an instance
- **AND** autonomous processing occurs (signal created, evidence ingested, etc.)
- **THEN** the client receives real-time activity events

#### Scenario: Activity query via MCP

- **WHEN** an agent calls `list_activities` with an instance ID and optional type filter
- **THEN** the system returns activities in reverse chronological order with cursor
  pagination

### Requirement: Memory-Backed Graph Traversal

The system SHALL use Memory's `Expand()` API for multi-hop relationship traversal in
ripple propagation analysis when Memory is available, falling back to direct Postgres
SQL queries when Memory is unavailable.

#### Scenario: Propagation via Memory Expand

- **WHEN** ripple propagation analysis runs for a changed artifact
- **AND** Memory is configured and reachable
- **THEN** the system uses `Expand(maxDepth:2)` to find downstream, upstream, and
  transitive affected artifacts in a single API call

#### Scenario: Propagation falls back to SQL

- **WHEN** ripple propagation analysis runs for a changed artifact
- **AND** Memory is unavailable
- **THEN** the system falls back to the existing multi-hop SQL queries against
  `strategy_relationships` in Postgres
- **AND** produces the same set of affected artifacts

### Requirement: Bulk Memory Ingestion

The system SHALL use Memory's `CreateSubgraph()` API for batch ingestion of committed
artifacts instead of per-object upsert calls, reducing API round-trips.

#### Scenario: Batch commit triggers bulk ingestion

- **WHEN** a batch of 5 mutations is committed
- **THEN** the ingest pipeline sends a single `CreateSubgraph()` call to Memory
  containing all 5 objects and their relationships
- **AND** updates sync counts for the instance

#### Scenario: Bulk ingestion failure fallback

- **WHEN** `CreateSubgraph()` fails
- **THEN** the pipeline falls back to per-object upserts with retry
- **AND** logs a warning

## MODIFIED Requirements

### Requirement: Equilibrium Scoring

The system SHALL compute an equilibrium score for a strategy instance based on
weighted penalties from active ripple signals.

Signal penalties SHALL vary by severity AND signal type:
- Structural signals (orphan, staleness): critical = 0.05, warning = 0.02
- Semantic signals (drift, tension, propagation): critical = 0.15, warning = 0.04
- Info signals: 0.00 penalty

Natural tension baselines SHALL reduce penalties for expected inter-track divergence.

The equilibrium score SHALL additionally factor in unprocessed evidence count when
evidence artifacts exist, applying a minor penalty (0.01 per unprocessed item, capped
at 0.10) to reflect incomplete information processing.

The system SHALL report the score as a value between 0.0 and 1.0, where
`InEquilibrium = score >= threshold` (configurable, default 0.70).

#### Scenario: Score with unprocessed evidence

- **WHEN** an instance has 5 unprocessed evidence items
- **AND** no active ripple signals
- **THEN** the equilibrium score is 1.0 - (5 * 0.01) = 0.95
- **AND** the instance is in equilibrium (0.95 >= 0.70)

#### Scenario: Score without evidence (backward compatible)

- **WHEN** an instance has no evidence artifacts
- **THEN** the equilibrium score is computed using only ripple signal penalties
  (existing behavior unchanged)
