## ADDED Requirements

### Requirement: Evidence-Aware Bootstrap Skills

The system SHALL provide AI-powered bootstrap skills for each READY-phase
artifact. Each skill SHALL read loaded evidence items as primary context,
falling back to interactive prompts when no evidence is available. Skills SHALL
enforce a dependency chain where each artifact requires its prerequisites.

#### Scenario: Draft North Star from evidence
- **WHEN** evidence items exist tagged with vision/strategy/pitch
- **AND** the user triggers the draft-north-star skill
- **THEN** the skill reads evidence items as primary context
- **AND** produces a schema-valid north_star artifact
- **AND** stages it as a batch for human review

#### Scenario: Draft North Star without evidence
- **WHEN** no evidence items are loaded
- **AND** the user triggers the draft-north-star skill
- **THEN** the skill falls back to interactive prompts
- **AND** asks targeted questions about purpose, vision, and values

#### Scenario: Draft Foundations with dependency
- **WHEN** a north_star artifact exists
- **AND** the user triggers the draft-foundations skill
- **THEN** the skill reads north_star + evidence as context
- **AND** produces a schema-valid strategy_foundations artifact

#### Scenario: Dependency enforcement
- **WHEN** the user triggers draft-foundations
- **AND** no north_star artifact exists
- **THEN** the system indicates that north_star must be created first

### Requirement: Web UI Evidence Loading

The system SHALL provide a web UI interface for loading source material as
evidence items. The interface SHALL support text paste with source type and
tag classification.

#### Scenario: Paste strategy notes
- **WHEN** the user pastes text into the evidence loading interface
- **AND** selects source_type and tags
- **THEN** an evidence item is created via the evidence service
- **AND** the item is available to bootstrap skills as context

#### Scenario: Evidence count on READY dashboard
- **WHEN** evidence items have been loaded for an instance
- **THEN** the READY dashboard header shows the evidence count
- **AND** links to the evidence list

### Requirement: Web UI Draft Actions on READY Dashboard

The READY phase dashboard SHALL display "Draft with AI" action buttons for
each missing artifact. When evidence items are loaded, buttons SHALL indicate
that source material will be used. Buttons SHALL be disabled with prerequisite
hints when dependency artifacts are missing.

#### Scenario: Draft from evidence
- **WHEN** evidence items exist AND north_star is missing
- **THEN** the North Star card shows "Draft from evidence" button
- **AND** clicking it triggers the draft-north-star skill with evidence context

#### Scenario: Prerequisite missing
- **WHEN** north_star does not exist
- **THEN** the Foundations card shows a disabled button with "Requires North Star"

#### Scenario: Existing artifact
- **WHEN** north_star exists with substantive (non-placeholder) content
- **THEN** the button is hidden or labeled "Redraft" with confirmation warning

### Requirement: READY Phase Readiness Score

The system SHALL compute a readiness score (0-100) for the READY phase based on
artifact presence, section completeness, placeholder detection, and schema
validation. The score SHALL surface on the READY dashboard and in the health
check response.

#### Scenario: Placeholder-filled instance
- **WHEN** all 7 READY artifacts exist but contain template placeholder text
- **THEN** the readiness score is low (indicating presence but not substance)
- **AND** blockers identify placeholder sections

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
- **WHEN** readiness score >= 80 AND version count is 0
- **THEN** the READY dashboard shows a "Publish first version" banner with a button

## MODIFIED Requirements

### Requirement: Lifecycle Mode Detection

The lifecycle mode detection SHALL check all 7 READY artifact types for the
`foundation` mode transition, not only north_star, strategy_foundations, and
strategy_formula. When evidence items exist but no READY artifacts are authored,
the system SHALL suggest starting the bootstrap flow.

#### Scenario: Evidence loaded but no artifacts
- **WHEN** evidence items exist for the instance
- **AND** no READY artifacts have been authored (only placeholders)
- **THEN** the lifecycle mode is `foundation`
- **AND** next_steps recommend starting the bootstrap flow with evidence

#### Scenario: Complete foundation
- **WHEN** all 7 READY artifacts exist with substantive content
- **AND** at least 1 feature exists
- **THEN** the lifecycle mode transitions to `building`
