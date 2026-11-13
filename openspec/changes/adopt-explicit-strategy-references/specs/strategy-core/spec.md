## ADDED Requirements

### Requirement: EPF 2.x Import Migration

Every import path (GitHub import, instance import, local repo source) SHALL
detect EPF 2.x content and migrate it to 3.0.0 before storing it, keeping the
original payload as the first committed version and the migrated payload as the
second.

#### Scenario: Import a 2.x instance from GitHub

- **WHEN** a caller imports a repository containing an EPF 2.x instance
- **THEN** the stored current state validates against EPF 3.0.0
- **AND** version history shows the original and the migrated payload

#### Scenario: Unresolvable reference on import

- **GIVEN** a 2.x value-model reference that matches two components
- **WHEN** the instance is imported
- **THEN** the import succeeds with the reference left unresolved
- **AND** the instance's migration report lists it with both candidates

### Requirement: Migration Matches Canonical

The Go import migration SHALL produce the same output as the canonical EPF
migration on every canonical migration fixture.

#### Scenario: Fixture parity

- **WHEN** the test suite runs the Go migration on the canonical fixtures
- **THEN** each result equals the canonical expected output after YAML
  normalisation

### Requirement: Migration Report

Each migrated instance SHALL keep its migration report (IDs assigned,
references rewritten, unresolved references, suggested links), readable through
an MCP tool and the web UI, and its suggestions SHALL be loaded into link
suggestions.

#### Scenario: Read the report

- **WHEN** a caller requests the migration report for a migrated instance
- **THEN** it returns the counts and the unresolved and suggested items
