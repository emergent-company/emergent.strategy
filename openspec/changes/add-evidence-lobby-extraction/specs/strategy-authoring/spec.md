## ADDED Requirements

### Requirement: Evidence Lobby Intake

The system SHALL provide a lobby that captures raw potential material as
`unprocessed` lobby items through a single intake function with a channel (`door`)
discriminator. Lobby items SHALL NOT be written to the formal evidence store directly.

#### Scenario: Intake raw material

- **WHEN** material arrives through any door (upload, paste, webhook, connector, capture, interview)
- **THEN** an `unprocessed` lobby item is created recording its door, content type, payload, and metadata

#### Scenario: Lobby item not formal evidence

- **WHEN** a lobby item exists
- **THEN** it is not present in the formal evidence store until promoted via extraction

#### Scenario: Count unprocessed for triggers

- **WHEN** the unprocessed lobby count is requested for an instance
- **THEN** the system returns the number of `unprocessed` items, usable as a heartbeat trigger input

### Requirement: AI Evidence Extraction

The system SHALL provide AI extraction agents that read a lobby item and produce one
or more schema-valid candidate evidence items. Extraction prompt constraints and the
output validator SHALL both derive from the canonical evidence schema.

#### Scenario: Route and extract

- **WHEN** extraction runs for a lobby item
- **THEN** a deterministic router selects an extraction agent and skill, and the skill
  produces candidate evidence item(s) with summary, tags, confidence, and suggested links

#### Scenario: Fail-closed validation

- **WHEN** an extracted candidate fails canonical schema validation
- **THEN** no candidate is staged and the failure is recorded

#### Scenario: Skeleton mode without an LLM

- **WHEN** no LLM is configured
- **THEN** extraction emits a schema-valid placeholder candidate so the pipeline and
  human gate still function

### Requirement: Human-gated Promotion to Formal Evidence

Extracted candidates SHALL be staged for human review and only become formal evidence
on commit. Promotion SHALL atomically create the formal evidence artifact and mark the
source lobby item processed, guarded against double promotion.

#### Scenario: Accept a candidate

- **WHEN** a reviewer commits an extracted candidate batch
- **THEN** a formal evidence artifact is created and the source lobby item is marked `processed`
- **AND** the promoted evidence flows through the existing formal evidence pipeline unchanged

#### Scenario: Reject a candidate

- **WHEN** a reviewer rejects a candidate batch
- **THEN** no formal evidence is created and the lobby item returns to `unprocessed`

#### Scenario: Double-promotion guard

- **WHEN** a lobby item has already been promoted
- **THEN** a second promotion attempt is blocked
