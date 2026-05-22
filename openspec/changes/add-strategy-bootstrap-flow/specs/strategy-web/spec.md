## ADDED Requirements

### Requirement: Unified Evidence Collection

The system SHALL provide a web UI for collecting evidence through multiple
methods: text paste, guided interview, and reference to imported artifacts.
All methods SHALL produce evidence items in the same format, stored via the
evidence service.

#### Scenario: Text paste
- **WHEN** a user pastes text into the evidence collection interface
- **AND** selects a source_type and tags
- **THEN** an evidence item is created and stored
- **AND** the item appears in the evidence list
- **AND** the item is available to bootstrap skills as context

#### Scenario: Guided interview
- **WHEN** a user starts the guided interview
- **AND** answers questions about vision, market, competition, team
- **THEN** each answer is stored as an evidence item with source_type "interview"
- **AND** the interview skips questions where matching evidence already exists

#### Scenario: Mixed evidence sources
- **WHEN** a user has uploaded a pitch deck AND answered interview questions
- **THEN** both evidence types are available to bootstrap skills
- **AND** the skills use all available evidence for richer drafts

### Requirement: Evidence Sufficiency Assessment

The system SHALL assess whether sufficient evidence exists to draft each READY
artifact. The assessment SHALL be tag-based with deliberately low thresholds to
keep the first cycle lean.

#### Scenario: Sufficient evidence for North Star
- **WHEN** at least 1 evidence item exists tagged with vision, strategy, pitch, or purpose
- **THEN** the North Star is marked as "sufficient evidence"
- **AND** the draft button is enabled with "Draft from evidence" label

#### Scenario: Insufficient evidence
- **WHEN** no evidence items with relevant tags exist for an artifact
- **THEN** the artifact is marked as "insufficient evidence"
- **AND** the draft button is enabled but labeled "Draft with AI" (sparser result)
- **AND** a hint suggests what evidence to add for a better draft

### Requirement: Evidence-Aware Bootstrap Skills

The system SHALL provide bootstrap skills for each READY artifact that read
evidence items as primary context. Skills SHALL degrade gracefully when evidence
is sparse, producing a minimal but schema-valid first draft.

#### Scenario: Rich evidence draft
- **WHEN** multiple evidence items exist with relevant tags
- **AND** the user triggers a bootstrap skill
- **THEN** the skill extracts and structures content from evidence
- **AND** produces a substantive first draft

#### Scenario: Sparse evidence draft
- **WHEN** minimal or no evidence exists
- **AND** the user triggers a bootstrap skill
- **THEN** the skill produces a minimal schema-valid draft
- **AND** the draft contains guidance comments for sections needing human input

#### Scenario: Dependency chain
- **WHEN** draft-foundations is triggered
- **AND** no north_star artifact exists
- **THEN** the system returns an error indicating north_star is required first

### Requirement: Web UI Draft Actions on READY Dashboard

The READY dashboard SHALL display draft action buttons for missing artifacts.
Button state SHALL reflect evidence sufficiency and dependency prerequisites.

#### Scenario: Evidence available
- **WHEN** sufficient evidence exists for north_star AND north_star is missing
- **THEN** the North Star card shows "Draft from evidence" button

#### Scenario: Prerequisite missing
- **WHEN** north_star does not exist
- **THEN** the Foundations card shows a disabled button with "Requires North Star"

#### Scenario: Existing substantive artifact
- **WHEN** an artifact exists with substantive (non-placeholder) content
- **THEN** the draft button shows as "Redraft" with a confirmation warning

### Requirement: READY Phase Readiness Score

The system SHALL compute a readiness score (0-100) for the READY phase. The
score SHALL account for artifact presence, section completeness, placeholder
detection, and schema validation. The score SHALL surface on the READY
dashboard and in the health check response.

#### Scenario: Placeholder-filled instance
- **WHEN** all READY artifacts contain only template placeholder text
- **THEN** the readiness score reflects partial credit

#### Scenario: First version prompt
- **WHEN** readiness score >= 80 AND version count is 0
- **THEN** a "Publish first version" prompt appears on the READY dashboard

### Requirement: Inter-READY Structural Relationships

The system SHALL auto-derive structural relationships between READY artifacts
when both source and target exist. These edges SHALL encode the authoring
dependency chain and be visible to the ripple engine.

#### Scenario: Both artifacts exist
- **WHEN** both north_star and strategy_foundations are committed
- **THEN** a derived_from edge exists from strategy_foundations to north_star

### Requirement: First Version Publication Prompt

The READY dashboard SHALL prompt the user to publish their first strategy
version when the readiness score is sufficient and no version exists.

#### Scenario: Ready for first version
- **WHEN** readiness score >= 80 AND version count is 0
- **THEN** a "Publish first version" banner with button appears

## MODIFIED Requirements

### Requirement: Lifecycle Mode Detection

The lifecycle mode detection SHALL check all 7 READY artifact types for the
`foundation` mode transition. When evidence items exist but READY artifacts are
placeholder-only, the system SHALL recommend the bootstrap flow.

#### Scenario: Evidence loaded but placeholder artifacts
- **WHEN** evidence items exist but READY artifacts contain only placeholders
- **THEN** the lifecycle mode is `foundation`
- **AND** next_steps recommend starting the bootstrap flow

#### Scenario: Complete foundation
- **WHEN** all 7 READY artifacts exist with substantive content and at least 1 feature exists
- **THEN** the lifecycle mode transitions to `building`
