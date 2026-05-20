## ADDED Requirements

### Requirement: Ripple Signal Serving

The system SHALL expose ripple signals for an instance through read-only
serving tools. Signals SHALL be filterable by type, severity, status, and
target artifact key.

#### Scenario: List active signals

- **WHEN** `list_signals` is called with an instance ID
- **THEN** the system returns all active signals sorted by severity (critical first), including signal type, source artifact, target artifact, description, and age

#### Scenario: Filter signals by severity

- **WHEN** `list_signals` is called with `severity: critical`
- **THEN** only critical signals are returned

#### Scenario: No active signals

- **WHEN** `list_signals` is called for an instance with no active signals
- **THEN** the system returns an empty list with a note that the strategy graph is coherent

## MODIFIED Requirements

### Requirement: Strategy Context Aggregation

The system SHALL provide aggregated strategy context combining multiple
artifact types in a single response. The system SHALL include a ripple signal
summary in the health check response, reporting active signal counts by
severity and the most critical signals.

#### Scenario: Full strategic context

- **WHEN** `get_strategy_context` is called with a valid instance ID
- **THEN** the system returns vision, personas, competitive position, and strategic foundations combined

#### Scenario: Competitive position

- **WHEN** `get_competitive_position` is called with a valid instance ID
- **THEN** the system returns insight analyses with competitive landscape data

#### Scenario: Strategy health summary with signals

- **WHEN** `health_check` is called with a valid instance ID
- **THEN** the system returns artifact counts, lifecycle mode, schema status, validation issues, and a `ripple_signals` section with active signal count by severity and the top 3 most critical signals
