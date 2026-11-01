## ADDED Requirements

### Requirement: Structural Edges From Stored References

The decomposer SHALL create every edge whose relation has `provenance: explicit`
from the field named in that relation's `carried_by`, and SHALL NOT create
structural edges from text matching.

#### Scenario: Stored mitigation link

- **GIVEN** a feature with `strategic_context.mitigates: [risk-002]`
- **WHEN** the instance is decomposed
- **THEN** a `mitigates` edge exists from the feature to `risk-002`
- **AND** it has `provenance: explicit`

#### Scenario: Keyword overlap alone creates no edge

- **GIVEN** a feature whose description repeats a white space's wording
- **AND** the feature's `addresses_white_spaces` field is empty
- **WHEN** the instance is decomposed
- **THEN** no `addresses_white_space` edge exists for that feature

#### Scenario: Unresolved stored reference

- **GIVEN** an imported feature referencing `seg-009`, which does not exist
- **WHEN** the instance is decomposed
- **THEN** no edge is created for that reference and a warning is logged

### Requirement: Exact Value-Model Resolution

Value-model references SHALL be resolved by exact match of the
`{track}:{layer-id}.{component-id}[.{sub-component-id}]` form against the
instance's value models. Case folding and punctuation stripping SHALL be used
only by the 2.x import migration.

#### Scenario: Legacy form not matched

- **WHEN** a 3.0.0 instance contains `Product.CorePlatform.DataManagement`
- **THEN** it does not resolve and no `contributes_to` edge is created

### Requirement: SWOT Opportunity Graph Type

SWOT opportunities SHALL be ingested as `SwotOpportunity` objects;
`Opportunity` objects SHALL come only from the `insight_opportunity` artifact.

#### Scenario: Re-ingest after migration

- **WHEN** a migrated instance is fully re-ingested
- **THEN** its SWOT opportunities exist as `SwotOpportunity`
- **AND** no `Opportunity` object derives from `insight_analyses`

### Requirement: Link Suggestions

The system SHALL offer link suggestions for explicit relations, computed by the
former text-matching rules, excluding links already stored or previously
rejected, through MCP tools and the web UI.

#### Scenario: List suggestions

- **WHEN** a caller requests suggestions for an instance
- **THEN** each suggestion includes relation, source ID, target ID, score and
  reason

#### Scenario: Accept a suggestion

- **WHEN** a caller with write access accepts a suggestion
- **THEN** a mutation adding the target ID to the source's field is staged
- **AND** the staged batch records the suggestion's origin: rule, source and
  target IDs with their artifacts' revisions, score and reason
- **AND** no edge exists until that batch is committed

#### Scenario: Reject a suggestion

- **WHEN** a caller rejects a suggestion
- **THEN** it is not offered again for that instance while neither
  artifact's content has changed
