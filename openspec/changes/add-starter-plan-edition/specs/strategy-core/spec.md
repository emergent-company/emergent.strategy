## ADDED Requirements

### Requirement: Plan and Edition Model

The system SHALL associate a billing plan with each organization and SHALL allow a
per-instance edition override. The system SHALL resolve a single `Entitlements` value
object from plan/edition that is the source of truth for what is allowed. Two editions
SHALL exist in v1: `starter` and `full`.

#### Scenario: New org defaults to starter

- **WHEN** a new organization is created
- **THEN** its plan is `starter`

#### Scenario: Instance edition overrides org plan

- **WHEN** an instance has an explicit edition set
- **THEN** entitlements resolve from the instance edition, otherwise from the org plan

#### Scenario: Existing orgs are full

- **WHEN** the plan column is added to existing organizations
- **THEN** existing organizations are backfilled to `full` so behavior is unchanged

#### Scenario: Single entitlement source of truth

- **WHEN** any surface (UI, MCP, engine loop) checks what is allowed
- **THEN** it reads the same resolved `Entitlements` for the org/instance

### Requirement: Starter Artifact Scope

The starter edition SHALL allow only the `north_star` and `roadmap_recipe` artifact
types. Key results SHALL be carried within the roadmap_recipe payload, not as separate
artifacts.

#### Scenario: Starter allows only north star and roadmap

- **WHEN** entitlements are resolved for a starter instance
- **THEN** the allowed artifact types are exactly `north_star` and `roadmap_recipe`

#### Scenario: KRs live inside the roadmap

- **WHEN** a starter user defines objectives and key results
- **THEN** they are stored within the roadmap_recipe artifact, not as separate artifacts

### Requirement: Central Artifact-Type Registry

The system SHALL maintain a single registry mapping each artifact type to its phase and
allowed editions, and consumers that need artifact-type/phase information SHALL read
this registry.

#### Scenario: Registry drives edition allowlist

- **WHEN** an edition allowlist is computed
- **THEN** it is derived from the registry's per-type edition tags

#### Scenario: Registry covers existing types

- **WHEN** the registry is validated
- **THEN** every existing artifact type is present with a phase

### Requirement: Edition-aware Engine Loops

Engine loops that assume the full artifact graph SHALL be gated for starter instances so
a starter instance is scoped, not broken. The AIM heartbeat SHALL NOT generate cycle
proposals for starter instances, and the lifecycle detector SHALL treat the starter
artifact set as complete.

#### Scenario: Starter instance generates no AIM proposals

- **WHEN** the heartbeat evaluates triggers
- **THEN** starter-edition instances are skipped and no AIM cycle proposal is created for them

#### Scenario: Lifecycle detector treats starter as complete

- **WHEN** the lifecycle detector runs on a starter instance with north_star + roadmap
- **THEN** it reports a complete/scoped mode with starter-appropriate next steps, not a "missing foundation" mode

#### Scenario: Commit-path engine works on the slim graph

- **WHEN** a starter user commits a change to north_star or roadmap_recipe
- **THEN** the ripple/convergence/ingest pipeline runs without error over the available artifacts

### Requirement: Non-destructive Upgrade Path

The system SHALL allow upgrading an org/instance from `starter` to `full` without any
data migration. Upgrading SHALL only add capability and SHALL preserve the existing
starter artifacts unchanged.

#### Scenario: Upgrade preserves starter data

- **WHEN** a starter instance is upgraded to full
- **THEN** the existing north_star and roadmap_recipe are preserved unchanged
- **AND** the previously gated phases, tools, and loops become available

#### Scenario: Starter instance limit

- **WHEN** an org has reached its starter instance limit
- **THEN** creating an additional starter instance is rejected with an explanatory message
