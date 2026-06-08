## ADDED Requirements

### Requirement: Work Package Artifact Recognition

strategy-server SHALL recognize the `work_package` artifact type, validate it
against the canonical work_package schema, and register it in the server-side
artifact-type registry and strategic index.

#### Scenario: Work package validates against the canonical schema

- **WHEN** a work package payload is staged or committed
- **THEN** it is validated against the embedded `work_package_schema.json`
- **AND** an invalid `track`, `status`, or `risk_class` is rejected

#### Scenario: Work package is indexed

- **WHEN** a work package is committed
- **THEN** its id, title, track, status, risk_class, and lifecycle are extracted into the strategic index
- **AND** relationships are emitted to its target value-model paths, definition ids, and KR ids

### Requirement: Server-Derived Footprint

strategy-server SHALL derive a work package's footprint as the union of its
`targets.value_model_paths` and `targets.definition_ids`. The footprint SHALL NOT
include `kr_ids`, and SHALL NOT be taken from any field authored by the tool.

#### Scenario: Footprint is the union of value paths and definitions

- **WHEN** the footprint of a work package is computed
- **THEN** it equals the de-duplicated union of `value_model_paths` and `definition_ids`
- **AND** `kr_ids` are excluded from the footprint

#### Scenario: Footprint is queryable

- **WHEN** a consumer requests a work package's footprint
- **THEN** strategy-server returns the derived footprint
- **AND** the value is computed server-side, not read from an authored field

### Requirement: Work Package Status State-Machine

strategy-server SHALL enforce the work package status lifecycle
`proposed → approved → scheduled → executing → done`, with `cancelled` reachable
as a terminal state from any non-terminal state. Illegal transitions SHALL be
rejected.

#### Scenario: Legal transition is accepted

- **WHEN** a work package in `approved` transitions to `scheduled`
- **THEN** the transition is committed

#### Scenario: Illegal transition is rejected

- **WHEN** a work package in `done` is asked to transition to `executing`
- **THEN** strategy-server rejects the transition with a structured error
- **AND** the work package status is unchanged

#### Scenario: Cancellation is terminal

- **WHEN** a non-terminal work package transitions to `cancelled`
- **THEN** the transition is accepted
- **AND** no further transition out of `cancelled` is permitted

### Requirement: Subscribable Status Events

strategy-server SHALL emit a subscribable event on each committed work package
status transition, using the existing activity stream, so connected systems can
react without polling. This SHALL augment, not replace, the existing post-commit
pipeline and AIM heartbeat.

#### Scenario: Transition emits an event

- **WHEN** a work package status transition is committed
- **THEN** a `work_package` activity event is recorded and fanned out to subscribers for that instance

#### Scenario: Heartbeat remains the fallback

- **WHEN** no subscriber is connected
- **THEN** the transition is still recorded
- **AND** the post-commit pipeline still runs as before

### Requirement: Work Package MCP Tools

strategy-server SHALL expose MCP tools to list, read, create, approve, and
transition work packages, and to retrieve a work package's derived footprint.
The tools SHALL require `instance_id` and SHALL be discoverable via tool-category
filtering.

#### Scenario: Listing work packages

- **WHEN** `list_work_packages` is called with an `instance_id`
- **THEN** work packages are returned, filterable by track and status

#### Scenario: Creating and transitioning

- **WHEN** `create_work_package` then `approve_work_package` are called
- **THEN** a work package is staged and its status advanced through the enforced state-machine

#### Scenario: Footprint via MCP

- **WHEN** `get_work_package_footprint` is called for a work package
- **THEN** the server-derived footprint (value paths ∪ definitions, no KRs) is returned
