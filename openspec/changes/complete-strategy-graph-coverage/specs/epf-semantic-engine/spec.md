## ADDED Requirements

### Requirement: Complete Insight Analyses Decomposition

The decomposer SHALL extract all 18 sections of `01_insight_analyses.yaml` into typed graph objects, not just trends and target_users.

#### Scenario: Competitive landscape extraction

- **WHEN** insight analyses contains `competitive_landscape.direct_competitors[]`
- **THEN** the decomposer creates `Competitor` objects with name, positioning, strengths, weaknesses
- **AND** creates `Competitor` objects from `strategy_tools[]` and `indirect_competitors[]`
- **AND** creates `contains` edges from the Artifact node

#### Scenario: Market structure extraction

- **WHEN** insight analyses contains `market_structure.segments[]`
- **THEN** the decomposer creates `MarketSegment` objects with segment name, size, characteristics, unmet needs
- **AND** creates `contains` edges from the Artifact node

#### Scenario: White space extraction

- **WHEN** insight analyses contains `white_spaces[]`
- **THEN** the decomposer creates `WhiteSpace` objects with gap description, evidence, opportunity potential
- **AND** creates `contains` edges from the Artifact node

#### Scenario: SWOT extraction

- **WHEN** insight analyses contains `strengths[]`, `weaknesses[]`, `opportunities[]`, `threats[]`
- **THEN** the decomposer creates separate `Strength`, `Weakness`, `Opportunity`, `Threat` objects
- **AND** each object retains its type-specific fields (evidence, mitigation, likelihood, etc.)

#### Scenario: Hypothesis extraction

- **WHEN** insight analyses contains `problem_solution_hypotheses[]` or `validation_status[]`
- **THEN** the decomposer creates `Hypothesis` objects with hypothesis statement, test approach, validation status
- **AND** merges data from both sections when hypothesis text matches

#### Scenario: Key insight extraction

- **WHEN** insight analyses contains `key_insights[]`
- **THEN** the decomposer creates `KeyInsight` objects with insight text, supporting trends, and strategic implication

#### Scenario: Market dynamics extraction

- **WHEN** insight analyses contains `market_dynamics[]`
- **THEN** the decomposer creates objects capturing dynamic/implication pairs as properties on Trend-category objects

#### Scenario: Missing sections handled gracefully

- **WHEN** an insight analyses file is missing any of the 18 sections
- **THEN** the decomposer silently skips that section without errors

### Requirement: Strategy Foundations Decomposition

The decomposer SHALL extract `02_strategy_foundations.yaml` into typed graph objects covering product vision, value proposition, strategic sequencing, and information architecture.

#### Scenario: Value proposition extraction

- **WHEN** strategy foundations contains `value_proposition`
- **THEN** the decomposer creates a `ValueProposition` object with headline, target segment, functional value, emotional value, economic value, and proof points

#### Scenario: Strategic sequencing extraction

- **WHEN** strategy foundations contains `strategic_sequencing.phases[]`
- **THEN** the decomposer creates `StrategicPhase` objects with phase number, name, timeframe, focus, target segment, and success criteria
- **AND** creates sequential `follows` edges between phases

#### Scenario: Product vision extraction

- **WHEN** strategy foundations contains `product_vision`
- **THEN** the decomposer creates a `Belief`-tier object with vision statement, success indicators, and alignment data

### Requirement: Insight Opportunity Decomposition

The decomposer SHALL extract `03_insight_opportunity.yaml` into a graph object capturing the validated opportunity with its evidence and value hypothesis.

#### Scenario: Opportunity extraction

- **WHEN** insight opportunity contains `opportunity`
- **THEN** the decomposer creates an `Opportunity` object with title, description, context, evidence, value hypothesis, status, and confidence level
- **AND** creates `contains` edges from the Artifact node

### Requirement: Complete Strategy Formula Decomposition

The decomposer SHALL extract all 8 sections of `04_strategy_formula.yaml`, not just positioning and competitive moat.

#### Scenario: Value creation extraction

- **WHEN** strategy formula contains `value_creation.value_drivers[]`
- **THEN** the decomposer creates `ValueDriver` objects with driver name, mechanism, and flywheel effect

#### Scenario: Strategic risk extraction

- **WHEN** strategy formula contains `risks[]`
- **THEN** the decomposer creates `StrategicRisk` objects with risk description, likelihood, impact, mitigation, and monitoring approach

#### Scenario: Constraint and trade-off extraction

- **WHEN** strategy formula contains `constraints[]` or `trade_offs[]`
- **THEN** the decomposer creates objects capturing constraints (with implications and strategies) and trade-offs (with what's gained vs given up)

#### Scenario: Business model extraction

- **WHEN** strategy formula contains `business_model`
- **THEN** the decomposer captures pricing philosophy, tiers, unit economics targets, and growth engines as properties on a strategy-level object

### Requirement: Non-Product Track Definition Decomposition

The decomposer SHALL extract strategy (`sd-*`), org_ops (`pd-*`), and commercial (`cd-*`) definitions from `FIRE/definitions/` into `TrackDefinition` graph objects.

#### Scenario: Strategy definition extraction

- **WHEN** `FIRE/definitions/strategy/` contains `.yaml` files with `id` matching `sd-*`
- **THEN** the decomposer creates `TrackDefinition` objects with base fields (purpose, outcome, owner, steps, cadence) and strategy-specific fields (decision_frameworks)
- **AND** creates `contributes_to` edges to value model components

#### Scenario: OrgOps definition extraction

- **WHEN** `FIRE/definitions/org_ops/` contains `.yaml` files with `id` matching `pd-*`
- **THEN** the decomposer creates `TrackDefinition` objects with base fields and org_ops-specific fields (compliance, maturity_indicators)
- **AND** creates `contributes_to` edges to value model components

#### Scenario: Commercial definition extraction

- **WHEN** `FIRE/definitions/commercial/` contains `.yaml` files with `id` matching `cd-*`
- **THEN** the decomposer creates `TrackDefinition` objects with base fields and commercial-specific fields (revenue_impact)
- **AND** creates `contributes_to` edges to value model components

#### Scenario: Related definitions as edges

- **WHEN** a track definition has `related_definitions[]` entries
- **THEN** the decomposer creates `related_definition` edges with the relationship type (requires, enables, follows, parallel, alternative)

#### Scenario: Practitioner scenarios extraction

- **WHEN** a track definition has `practitioner_scenarios[]`
- **THEN** the decomposer creates `PractitionerScenario` objects with situation, trigger, actions, and outcome
- **AND** creates `contains` edges from the TrackDefinition

#### Scenario: Empty definition directories

- **WHEN** a track definition directory does not exist or is empty
- **THEN** the decomposer silently skips it without errors

### Requirement: Cross-Artifact Relationship Inference

The decomposer SHALL infer structural relationships that connect insights to strategy to execution across all 4 tracks.

#### Scenario: competes_with (Positioning → Competitor)

- **WHEN** a Positioning node mentions a competitor name
- **AND** a Competitor node exists with that name
- **THEN** the decomposer creates a `competes_with` edge

#### Scenario: targets_segment (Feature → MarketSegment)

- **WHEN** a Feature serves personas whose descriptions overlap with a MarketSegment's characteristics
- **THEN** the decomposer creates a `targets_segment` edge

#### Scenario: mitigates (Feature → Threat/StrategicRisk)

- **WHEN** a Feature or Capability addresses a described threat or risk
- **THEN** the decomposer creates a `mitigates` edge

#### Scenario: validates_hypothesis (Capability → Hypothesis)

- **WHEN** a Capability has maturity `proven` or `scaled`
- **AND** a Hypothesis exists that the capability's parent feature tests
- **THEN** the decomposer creates a `validates_hypothesis` edge with the capability's evidence

#### Scenario: requires_process (Feature → TrackDefinition)

- **WHEN** a Feature or its capabilities reference a process by ID
- **THEN** the decomposer creates a `requires_process` edge to the TrackDefinition

## MODIFIED Requirements

### Requirement: Decomposer Object Types

The decomposer SHALL produce objects for all structurally-extractable types defined in the schema.

Previously produced 15 types. Now produces up to 29 types:
- Existing (15): `Artifact`, `Belief`, `Trend`, `Persona`, `PainPoint`, `Positioning`, `OKR`, `Assumption`, `ValueModelComponent`, `Feature`, `Scenario`, `Capability`, `Constraint`, `CrossTrackDependency`, `ReferenceDocument`
- Added (14): `Competitor`, `MarketSegment`, `WhiteSpace`, `Strength`, `Weakness`, `Opportunity`, `Threat`, `Hypothesis`, `KeyInsight`, `ValueProposition`, `StrategicPhase`, `ValueDriver`, `StrategicRisk`, `TrackDefinition`, `PractitionerScenario`

#### Scenario: Full decomposition produces all applicable types

- **WHEN** `DecomposeInstance()` runs on a fully-populated EPF instance
- **THEN** the result contains objects of all applicable types
- **AND** types with no source data are silently skipped

### Requirement: Decomposer Relationship Types

The decomposer SHALL produce all structural relationships that can be inferred from explicit YAML references across all 4 tracks.

Previously produced 16 structural types. Now produces up to 24 structural types:
- Existing (16): `contains`, `contributes_to`, `targets`, `serves`, `depends_on`, `tests_assumption`, `uses_skill`, `delivers`, `shared_technology`, `converges_at`, `informs`, `constrains`, `validates`, `supports`, `contradicts`, `elaborates`, `parallels`, `invalidates`
- Added (8): `competes_with`, `addresses_white_space`, `mitigates`, `leverages`, `targets_segment`, `validates_hypothesis`, `requires_process`, `related_definition`

#### Scenario: Cross-track cascade path exists

- **WHEN** the graph contains objects from all 4 tracks
- **THEN** a cascade starting from a tier 1 Belief can reach tier 7 Capabilities through at least one path traversing Strategy, OrgOps, or Commercial track objects
