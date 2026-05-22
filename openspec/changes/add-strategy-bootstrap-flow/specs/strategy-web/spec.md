## ADDED Requirements

### Requirement: READY Artifact Bootstrap Skills

The system SHALL provide AI-powered creation skills for each READY-phase
artifact. Each skill SHALL produce a schema-valid first draft from available
strategy context and user input.

#### Scenario: Draft North Star from scratch
- **WHEN** no north_star artifact exists
- **AND** the user triggers the draft-north-star skill (via web UI or MCP)
- **THEN** the skill collects minimal input (company name, industry, product)
- **AND** produces a schema-valid north_star artifact
- **AND** stages it as a batch for human review

#### Scenario: Draft Foundations from North Star
- **WHEN** a north_star artifact exists
- **AND** the user triggers the draft-foundations skill
- **THEN** the skill reads the north_star as context
- **AND** produces a schema-valid strategy_foundations artifact
- **AND** stages it for human review

#### Scenario: Dependency enforcement
- **WHEN** the user triggers draft-foundations
- **AND** no north_star artifact exists
- **THEN** the system indicates that north_star must be created first

### Requirement: Web UI Draft Actions on READY Dashboard

The READY phase dashboard SHALL display "Draft with AI" action buttons for
each missing artifact. Buttons SHALL be disabled with prerequisite hints when
dependency artifacts are missing.

#### Scenario: Empty instance with scaffold
- **WHEN** all READY artifacts contain only placeholder text
- **THEN** the North Star card shows an enabled "Draft with AI" button
- **AND** the Foundations card shows a disabled button with "Requires North Star"
- **AND** buttons become enabled as prerequisites are met

#### Scenario: Triggering a draft
- **WHEN** the user clicks "Draft with AI" on a READY artifact card
- **THEN** the corresponding skill runs via the executor
- **AND** the user is redirected to review the staged draft

### Requirement: READY Phase Readiness Score

The system SHALL compute a readiness score (0-100) for the READY phase based on
artifact presence, section completeness, placeholder detection, and schema
validation. The score SHALL surface on the READY dashboard and in the health
check response.

#### Scenario: Empty scaffold
- **WHEN** all READY artifacts contain only template placeholder text
- **THEN** the readiness score reflects partial credit (present but placeholder)
- **AND** blockers list specific sections needing real content

#### Scenario: Complete strategy
- **WHEN** all 7 READY artifacts exist with substantive content and pass validation
- **THEN** the readiness score is >= 80
- **AND** a "Publish first version" prompt appears

### Requirement: Inter-READY Structural Relationships

The system SHALL auto-derive structural relationships between READY-phase
artifacts when both source and target exist. These edges SHALL be created during
index derivation (on commit) and backfill.

#### Scenario: Foundation artifacts committed
- **WHEN** both north_star and strategy_foundations exist
- **THEN** a `derived_from` relationship edge exists from strategy_foundations to north_star

#### Scenario: Full READY graph
- **WHEN** all 7 READY artifacts exist
- **THEN** the relationship graph includes edges encoding the authoring dependency chain
- **AND** the ripple engine can propagate signals along these edges

### Requirement: First Version Publication Prompt

The READY dashboard SHALL prompt the user to publish their first strategy version
when the readiness score reaches the threshold and no version has been published.

#### Scenario: Ready for first version
- **WHEN** readiness score >= 80
- **AND** version count is 0
- **THEN** the READY dashboard shows a "Publish first version" banner with a button
- **AND** clicking the button publishes a version labeled "Initial strategy"

#### Scenario: Already published
- **WHEN** version count > 0
- **THEN** no publish prompt is shown on the READY dashboard

## MODIFIED Requirements

### Requirement: Lifecycle Mode Detection

The lifecycle mode detection SHALL check all 7 READY artifact types for the
`foundation` mode transition, not only north_star, strategy_foundations, and
strategy_formula.

#### Scenario: Partial foundation
- **WHEN** north_star and strategy_foundations exist but insight_analyses does not
- **THEN** the lifecycle mode is `foundation` (not `building`)
- **AND** the health check next_steps recommend creating insight_analyses

#### Scenario: Complete foundation
- **WHEN** all 7 READY artifacts exist with substantive content
- **AND** at least 1 feature exists
- **THEN** the lifecycle mode transitions to `building`
