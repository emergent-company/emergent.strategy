## ADDED Requirements

### Requirement: Bespoke handlers render all schema-defined fields

Every bespoke handler (`handler_insights.go`, `handler_formula.go`,
`handler_foundations.go`, `handler_roadmap.go`, `handler_opportunity.go`,
`handler_feature.go`, `handler_valuemodel.go`, `handler_lra.go`,
`handler_assessment.go`, `handler_calibration.go`, `handler_artifact.go`) SHALL
render every property defined in its canonical schema that is present and
non-empty in the payload. A schema property that is not rendered MUST be on an
explicit ignore list.

#### Scenario: Insight analyses renders all canonical sections
- **WHEN** an insight analyses payload contains `market_dynamics`, `strategic_implications`, `validation_status`, and `confidence_gaps`
- **THEN** each section is rendered on the page with its content
- **AND** no section is silently blank

#### Scenario: Sub-fields within rendered sections are not dropped
- **WHEN** a `direct_competitors` entry includes `market_share`, `target_segment`, and `business_model`
- **THEN** all three sub-fields appear in the rendered competitor card

### Requirement: Gap checker agrees with the renderer

`checkInsightGaps` (and equivalent gap checks for other artifact types) SHALL
check for exactly the same set of fields the renderer reads. If the renderer
reads a field, the gap checker SHALL check for it. If the gap checker accepts
a field name, the renderer SHALL read it.

#### Scenario: Legacy layout keys are handled consistently
- **WHEN** an insight analyses payload uses `swot_analysis` instead of `strengths`/`weaknesses`/`opportunities`/`threats`
- **THEN** the gap checker and the renderer both treat `swot_analysis` as present, or both treat it as absent
- **AND** they never disagree (gap checker says present, renderer shows blank)
- **AND** a key the renderer has no dedicated view for is shown by the generic fallback under the notice, so "present" always means "shown"

### Requirement: Generic fallback for unrecognised content

Every bespoke handler SHALL include a fallback that renders payload keys the
handler does not map as generic key/value sections. When unrecognised keys
exist, the page SHALL display a visible notice stating the count.

#### Scenario: Unknown top-level key rendered via fallback
- **WHEN** a payload contains `foo_analysis` which is not in the schema or the handler's field list
- **THEN** the page renders `foo_analysis` content as a generic section
- **AND** a notice says "1 section is stored but has no dedicated view"

#### Scenario: No unknown keys produces no notice
- **WHEN** every payload key is mapped by the handler
- **THEN** no fallback notice is shown

### Requirement: Render coverage tests tied to canonical schemas

A test suite SHALL verify that every property in every embedded schema is
either rendered by its bespoke handler or on an explicit ignore list. The test
SHALL fail when a schema property has no handler and no ignore-list entry.

#### Scenario: Schema coverage test catches a new property
- **WHEN** a new property `emerging_risks` is added to the insight analyses schema
- **AND** no handler reads it and it is not on the ignore list
- **THEN** the schema coverage test fails with the name of the unhandled property

#### Scenario: Canonical template renders completely
- **WHEN** the canonical insight analyses template is rendered through the handler
- **THEN** every non-empty field in the template appears in the rendered output

### Requirement: Canonical bump gates UI handlers

When `.epf-canonical-version` is bumped, the CI pipeline SHALL run the schema
coverage test (above) so that a new or changed property with no handler or
ignore-list entry fails the bump before merge.

#### Scenario: Canonical bump with unhandled new field
- **WHEN** `.epf-canonical-version` is bumped to a release containing a new schema property
- **AND** the sync-embedded script copies the new schema
- **THEN** the schema coverage test runs
- **AND** the pipeline fails if the property is not handled or ignored
