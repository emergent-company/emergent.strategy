## ADDED Requirements

### Requirement: Reference Validation on Write

Before staging, the system SHALL resolve every reference field in the payload
against the instance state including the same batch, and SHALL reject the
mutation when any reference does not resolve or points at the wrong entity type.

#### Scenario: Dangling reference rejected

- **WHEN** a caller stages a feature with `leverages: [swot-s-009]`
- **AND** no `swot-s-009` exists in the instance or the batch
- **THEN** the system returns HTTP 422 with the reference-validation error code
- **AND** the response names the field, the value and valid `swot-s-` IDs
- **AND** no mutation is created

#### Scenario: Reference to an entity in the same batch

- **GIVEN** a batch that stages a new competitor `cpt-007`
- **WHEN** the same batch stages a formula entry with `competitor: cpt-007`
- **THEN** the reference resolves and the mutation is staged

### Requirement: ID Assignment on Write

When a staged payload contains a list entity that requires an ID and has none,
the system SHALL assign the next free ID for that entity's prefix and return
the assigned IDs in the response.

#### Scenario: New trend without an ID

- **GIVEN** the instance has trends up to `trd-011`
- **WHEN** a caller stages a new trend with no `id`
- **THEN** the trend is stored with `id: trd-012`
- **AND** the stage response lists `trd-012`
