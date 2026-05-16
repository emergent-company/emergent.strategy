## ADDED Requirements

### Requirement: Decomposer Schema Reconciliation Check

The decomposer SHALL maintain a declarative field manifest listing every YAML field path it
extracts from each artifact type. A build-time test SHALL verify that every manifest entry
corresponds to an existing field in the canonical JSON schema for that artifact type.

#### Scenario: All fields match
- **WHEN** `go test ./pkg/decompose/...` runs
- **THEN** the reconciliation test loads all embedded JSON schemas
- **AND** resolves each manifest entry's JSON path against the schema properties tree
- **AND** the test passes with zero drift

#### Scenario: Schema field removed
- **WHEN** a canonical schema removes a field that the decomposer extracts
- **AND** `go test ./pkg/decompose/...` runs
- **THEN** the reconciliation test fails with a message identifying the missing field, artifact type, and schema file

#### Scenario: Manifest incomplete
- **WHEN** the decomposer source code extracts a field not listed in the manifest
- **AND** `go test ./pkg/decompose/...` runs
- **THEN** the test reports a warning or failure indicating the manifest is incomplete
