## ADDED Requirements

### Requirement: Schema Structure Display

The `epf-cli schemas show <schema-name>` command SHALL display the schema structure in a human-readable format that shows:

- All properties with their types
- Required vs optional status for each property
- Enum allowed values
- String length constraints (minimum/maximum)
- Nested object structures with indentation

#### Scenario: Show schema for insight_analyses

- **WHEN** user runs `epf-cli schemas show insight_analyses`
- **THEN** display the full schema structure with types and requirements
- **AND** mark required fields clearly (e.g., with `*` or `[required]`)

#### Scenario: Show specific schema section

- **WHEN** user runs `epf-cli schemas show insight_analyses --path strengths`
- **THEN** display only the `strengths` section of the schema
- **AND** include all nested properties and constraints

### Requirement: Validation Error Explanation

The `epf-cli validate --explain` command SHALL provide detailed error context including:

- JSON path to the error location (e.g., `/strengths/2/strength`)
- Expected schema structure for the failing property
- Actionable fix suggestion

#### Scenario: Explain missing required property

- **WHEN** validation fails with `missing properties: 'weakness'`
- **AND** user runs `epf-cli validate file.yaml --explain`
- **THEN** show the JSON path where the property is missing
- **AND** show the expected structure for `weakness` with all required sub-properties
- **AND** provide example fix text

#### Scenario: Explain type mismatch

- **WHEN** validation fails with `expected object, but got string`
- **AND** user runs with `--explain`
- **THEN** show what object structure is expected
- **AND** show the current string value that needs to be converted

### Requirement: Health Command Explain Mode

The `epf-cli health --explain` command SHALL show detailed validation errors with schema context for all failing files.

#### Scenario: Health check with explanation

- **WHEN** user runs `epf-cli health --explain`
- **AND** files fail schema validation
- **THEN** show each error with JSON path and expected schema structure
- **AND** group errors by file for easier navigation
