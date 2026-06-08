## ADDED Requirements

### Requirement: Work Package Handoff Contract

The orchestrator SHALL consume a neutral Work Package as the unit of execution,
independent of which authoring tool produced it and which track it belongs to. A
Work Package SHALL bind three EPF execution references — value model paths,
definition ids, and key result ids — and SHALL declare a track, status, risk
class, source provenance, and a bounded lifecycle. It SHALL NOT carry a task
list; task decomposition is owned by the execution substrate.

#### Scenario: Work Package binds the three SOW references

- **WHEN** a Work Package is consumed by the orchestrator
- **THEN** it exposes `value_model_paths`, `definition_ids`, and `kr_ids` as its targets
- **AND** each of the three is a many-to-many reference set
- **AND** the Work Package carries no task list

#### Scenario: Work Package is track-tagged

- **WHEN** a Work Package is consumed
- **THEN** it carries exactly one `track` of `product`, `strategy`, `org_ops`, or `commercial`
- **AND** the track determines which execution substrate will run it

### Requirement: Footprint Derived From Targets

The orchestrator SHALL treat a Work Package's footprint — the collision key used
for wave scheduling — as the union of its value model paths and its definition
ids. The footprint SHALL be derived from the targets (by strategy-server, not by
the authoring tool), so it cannot be under-declared.

#### Scenario: Footprint is the union of value paths and definitions

- **WHEN** the orchestrator schedules a Work Package
- **THEN** its footprint is the union of `value_model_paths` and `definition_ids`
- **AND** two Work Packages sharing any value path or definition cannot run in the same wave

#### Scenario: Authoring tool cannot under-declare collisions

- **WHEN** an authoring tool emits a Work Package
- **THEN** the footprint is not taken from the tool's output
- **AND** it is derived server-side from the declared targets

### Requirement: Tool-Agnostic Authoring Adapters

The orchestrator SHALL accept Work Packages from multiple authoring tools through
a stable adapter interface. The existing OpenSpec file-based path SHALL become
one such adapter, and strategy-graph hydration SHALL be another, without changing
the scheduler or scorecard.

#### Scenario: OpenSpec is one adapter

- **WHEN** the OpenSpec adapter reads a change directory
- **THEN** it produces a Work Package with targets, track, and source `openspec`
- **AND** the resulting wave plan matches the prior file-based behavior

#### Scenario: Strategy-graph hydration is another adapter

- **WHEN** the strategy-graph adapter is configured
- **THEN** it hydrates Work Packages from strategy-server
- **AND** the scheduler and scorecard operate identically regardless of adapter

### Requirement: Status State-Machine and Approval Trigger

A Work Package SHALL move through the states `proposed`, `approved`,
`scheduled`, `executing`, and `done`, and MAY be `cancelled`. The orchestrator
SHALL begin planning a Work Package when it reaches `approved`, triggered either
by a subscribed status-change event or by an on-demand run.

#### Scenario: Approval triggers planning

- **WHEN** a Work Package transitions to `approved`
- **THEN** the orchestrator may begin a planning run for it
- **AND** a Work Package not yet `approved` is not scheduled

#### Scenario: Cancelled Work Packages are excluded

- **WHEN** a Work Package is `cancelled`
- **THEN** it is excluded from wave scheduling and scoring

#### Scenario: Subscription augments the heartbeat

- **WHEN** the orchestrator subscribes to status-change events
- **THEN** an `approved` event wakes the planner
- **AND** the on-demand (pull) run remains available as a fallback

### Requirement: Track-Routed Async Execution

The orchestrator SHALL route a Work Package to an execution driver selected by
its track, where every driver satisfies a single execute-and-report interface.
Partner-backed tracks (org_ops via 21st, commercial via sequence) SHALL be
executed asynchronously, reporting status and evidence back through the Work
Package state-machine rather than through synchronous calls.

#### Scenario: Driver is selected by track

- **WHEN** a `scheduled` Work Package is dispatched
- **THEN** a driver is chosen by its track and substrate
- **AND** product routes to a coding-agent driver, strategy to strategy-server MCP, org_ops to 21st, commercial to sequence

#### Scenario: Partner execution is async via the state-machine

- **WHEN** a Work Package is dispatched to a partner driver
- **THEN** the partner reports progress and completion by transitioning the Work Package status
- **AND** no synchronous call is required between the orchestrator and the partner

#### Scenario: Merge gate remains human

- **WHEN** any driver completes execution
- **THEN** the resulting change still passes through a human approval or merge gate

### Requirement: Scheduler and Scorecard Unchanged

Introducing the Work Package contract SHALL NOT change the deterministic wave
scheduler or the strategic scorecard. Both SHALL continue to operate on abstract
units identified by footprint.

#### Scenario: Existing planning behavior is preserved

- **WHEN** Work Packages are scheduled and scored
- **THEN** the wave plan and scorecard are computed by the existing scheduler and scorecard
- **AND** their outputs are unchanged for equivalent inputs
