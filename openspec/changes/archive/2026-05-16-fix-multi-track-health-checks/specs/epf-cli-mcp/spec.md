## MODIFIED Requirements

### Requirement: Health Check Instance Validation

The system SHALL validate all EPF definition tracks (product, strategy,
org_ops, commercial) during health checks, not only the product track.

#### Scenario: Multi-track relationship validation
- **WHEN** `epf_health_check` is called on an instance with definitions in multiple tracks
- **THEN** `contributes_to` paths are validated for all tracks against their corresponding value models
- **AND** invalid paths in commercial, strategy, or org_ops definitions are reported as warnings
- **AND** the relationship score reflects the health of all tracks, not just product

#### Scenario: Multi-track coverage analysis
- **WHEN** `epf_health_check` reports coverage analysis
- **THEN** per-track coverage shows actual checked/total counts for all 4 tracks
- **AND** tracks with definitions show non-zero denominators (e.g., `Commercial 85% (17/20)`)

#### Scenario: Multi-track feature quality
- **WHEN** `epf_health_check` runs feature quality checks
- **THEN** quality checks apply to all definition types (fd-*, cd-*, sd-*, pd-*)
- **AND** schema differences between tracks are respected

#### Scenario: Cross-track dependency validation
- **WHEN** a commercial definition depends on a product definition
- **THEN** the cross-track dependency reference is validated
- **AND** invalid cross-track references are reported
