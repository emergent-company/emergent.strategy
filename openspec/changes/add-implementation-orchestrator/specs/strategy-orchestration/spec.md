## ADDED Requirements

### Requirement: Standalone Orchestrator Module

The orchestrator SHALL be a standalone Go module separate from strategy-server,
and SHALL NOT import strategy-server internal packages. It SHALL interact with
strategy only through the OpenSpec change artifacts (the explicit handoff) and,
for strategic scoring, as an MCP client of strategy-server.

#### Scenario: Module is independent

- **WHEN** the orchestrator module is built
- **THEN** it compiles as its own Go module with its own `go.mod`
- **AND** it does not import any `apps/strategy-server` package

#### Scenario: Strategy interaction is via artifacts and MCP only

- **WHEN** the orchestrator needs strategy information
- **THEN** it reads OpenSpec change files for footprints and tasks
- **AND** it reaches strategy-server only over the MCP endpoint
- **AND** it never writes to strategy-server's data stores

### Requirement: OpenSpec Change Discovery

The orchestrator SHALL discover and parse active OpenSpec changes from a
configured changes directory, extracting each change's footprints, task
progress, title, and cross-change references.

#### Scenario: Footprints derived from spec subdirectories

- **WHEN** a change directory contains `specs/<name>/spec.md` entries
- **THEN** each `<name>` subdirectory is recorded as a footprint of that change
- **AND** the footprints are sorted deterministically

#### Scenario: Zero-footprint change is tolerated

- **WHEN** a change directory has no `specs/` directory
- **THEN** the change is parsed with an empty footprint list
- **AND** no error is raised

#### Scenario: Archive and dotfiles are skipped

- **WHEN** the changes directory contains an `archive` directory or dot-prefixed entries
- **THEN** those entries are excluded from discovery

#### Scenario: Task progress is counted

- **WHEN** a change's `tasks.md` contains markdown checkboxes
- **THEN** open (`- [ ]`) and completed (`- [x]`/`- [X]`) tasks are counted
- **AND** a change is reported complete only when it has at least one task and all are done

### Requirement: Cross-Change Reconciliation Detection

The orchestrator SHALL detect when a change's tasks reference another known
change, and SHALL flag such changes as requiring human reconciliation before
dispatch.

#### Scenario: Tasks reference another change

- **WHEN** a change's `tasks.md` mentions the ID of another known change
- **THEN** that other change ID is recorded as a cross-reference
- **AND** the change is listed under reconciliation-required in the plan

#### Scenario: No self-reference

- **WHEN** scanning a change for cross-references
- **THEN** the change's own ID is never recorded as a cross-reference

### Requirement: Deterministic Wave Scheduling

The orchestrator SHALL compute a parallel-safe wave plan at whole-change
granularity such that no two changes within the same wave share a footprint.
The schedule SHALL be deterministic and require no external calls.

#### Scenario: Disjoint changes run in parallel

- **WHEN** changes have pairwise-disjoint footprints
- **THEN** they are placed in the same wave

#### Scenario: Colliding changes are serialized

- **WHEN** two changes share at least one footprint
- **THEN** they are placed in different waves
- **AND** the shared footprint is reported as a collision listing both changes

#### Scenario: Footprint-less change never collides

- **WHEN** a change has no footprints
- **THEN** it may be scheduled in the first wave regardless of other changes

#### Scenario: Completed changes are skipped by default

- **WHEN** a change has all tasks complete
- **THEN** it is excluded from scheduling and listed as skipped
- **AND** it is included only when completed changes are explicitly requested

#### Scenario: Output is deterministic

- **WHEN** the same set of changes is scheduled repeatedly
- **THEN** the wave count, wave membership, and ordering are identical each time

### Requirement: Wave Plan Reporting

The orchestrator SHALL present the wave plan in a human-readable form including
per-wave change membership, footprints, collision hot-spots, reconciliation
flags, and skipped changes.

#### Scenario: Plan renders the backlog as waves

- **WHEN** the planner runs against a changes directory
- **THEN** it prints ordered waves with the changes that may run in parallel in each
- **AND** it prints collision hot-spots sorted by contention
- **AND** it prints changes requiring human reconciliation
- **AND** it prints skipped (completed) changes

### Requirement: Strategic Scorecard

The orchestrator SHALL produce a per-change strategic scorecard by interrogating
strategy-server over MCP, scoring multiple independent dimensions without
collapsing them into a single pass/fail verdict. The scorecard SHALL be advisory
and SHALL surface conflicting signals as explicit tensions for human resolution.

#### Scenario: Dimensions are scored independently

- **WHEN** a change is scored
- **THEN** traceability, contradiction, maturity, scope/adjacency, and sequencing are each reported separately
- **AND** each dimension carries the evidence behind its score

#### Scenario: Tensions are surfaced, not resolved

- **WHEN** strategic dimensions conflict for a change
- **THEN** the conflict is reported as a named tension with its evidence
- **AND** no automatic accept/reject decision is made

#### Scenario: Weighting drives attention, not verdicts

- **WHEN** dimension weights are configured for a strategic posture
- **THEN** the weights determine the order in which changes are surfaced for human review
- **AND** the weights never produce an automatic build/skip decision

#### Scenario: Configurable MCP endpoint

- **WHEN** the orchestrator is configured with a strategy-server MCP endpoint
- **THEN** it connects to that endpoint for scoring queries
- **AND** the same binary works against a local or remote endpoint
