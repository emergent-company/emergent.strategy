# strategy-orchestration

## ADDED Requirements

### Requirement: Human gate entry and clearance are recorded distinctly

The system SHALL record, for every step that opens a human review gate, the
instant the gate opened, the instant it cleared, and how it was decided. These
SHALL be distinct from the step's own execution timestamps, so that time spent
waiting for a human is separable from time spent doing work.

A step's `finished_at` marks the completion of the step body, not the
completion of the step. Without separate gate timestamps, a step that paused
for review is indistinguishable after the fact from one that never gated.

#### Scenario: A gated step opens a gate

- **WHEN** a step with a human gate finishes its body and stages a batch
- **THEN** the step records the instant the gate opened
- **AND** the record is durable before the run begins waiting

#### Scenario: A reviewer commits the staged batch

- **WHEN** the gate is cleared by a commit
- **THEN** the step records the instant of clearance and an outcome of committed
- **AND** the gate-open timestamp is left intact

#### Scenario: A reviewer discards the staged batch

- **WHEN** the gate is cleared by a discard
- **THEN** the step records the instant of clearance and an outcome of discarded
- **AND** the run terminates as it does today

#### Scenario: A step that never gated

- **WHEN** a step without a human gate completes
- **THEN** no gate timestamps are recorded for it
- **AND** it is distinguishable from a gated step whose gate cleared instantly

#### Scenario: Runs predating this capability remain readable

- **WHEN** a run written before gate timestamps existed is read
- **THEN** it loads without error
- **AND** its steps report gate information as absent rather than as zero

### Requirement: Gate duration is observable without inspecting stored run state

The system SHALL emit gate duration when a gate clears, so the measurement is
available to operations without querying nested run state.

#### Scenario: Gate clears

- **WHEN** a human gate clears
- **THEN** the system logs the run, the step, the outcome, and the wait duration

### Requirement: Runs parked at a gate beyond a threshold are released

The system SHALL treat a run parked at a human gate beyond a configurable
threshold as abandoned, move it to a terminal status, and release the
concurrency slot it holds.

One active cycle is permitted per instance. A run parked at a gate currently
survives restarts indefinitely, so an abandoned review blocks every subsequent
cycle for that instance until someone intervenes by hand.

#### Scenario: A run exceeds the parked threshold

- **WHEN** a run has been awaiting human review for longer than the threshold
- **THEN** it moves to a terminal status with an error identifying it as an
  abandoned review
- **AND** a new cycle can be started for that instance

#### Scenario: A run within the threshold is untouched

- **WHEN** a run has been awaiting human review for less than the threshold
- **THEN** it is left in place and remains resumable

#### Scenario: The sweep runs without a restart

- **WHEN** the server has been running continuously past a run's threshold
- **THEN** the run is still released

  Parked runs accumulate during uptime, so a startup-only sweep is not
  sufficient.

#### Scenario: Releasing is recorded as an outcome, not a silent edit

- **WHEN** a parked run is released
- **THEN** its gate records the clearance instant and an outcome of abandoned
- **AND** the run is distinguishable from one a reviewer explicitly discarded

### Requirement: Gate wait is shown separately from execution time

The run panel SHALL present time spent awaiting review separately from time
spent executing, for steps where a gate was recorded.

#### Scenario: Operator views a run that paused for review

- **WHEN** a run containing a cleared gate is displayed
- **THEN** the step shows its execution duration and its review wait as separate
  values

#### Scenario: Operator views a run still awaiting review

- **WHEN** a run is currently parked at a gate
- **THEN** the elapsed wait is shown and updates as it grows
