# EPF Database Object Model Analysis

> **Purpose**: Complete data object schema for implementing an EPF database  
> **For**: Coding agent to use for implementation planning  
> **Generated**: 2026-01-11 (Updated: 2026-01-13)  
> **EPF Version**: 2.6.0

---

## Executive Summary

EPF (Emergent Product Framework) is a strategic product management framework with a **cyclical three-phase architecture**: READY → FIRE → AIM. The data model centers around **four strategic tracks** (Product, Strategy, OrgOps, Commercial) and uses a **hierarchical value decomposition pattern** (L1 Layer → L2 Component → L3 Sub-component).

### Key Architectural Patterns

1. **Phase-Based Lifecycle**: Documents flow through READY (planning) → FIRE (execution) → AIM (assessment)
2. **Four-Track Structure**: All strategic work spans Product, Strategy, OrgOps, Commercial pillars
3. **OKR Methodology**: Objectives → Key Results as primary planning units
4. **Value Model Hierarchy**: L1 (Layer) → L2 (Component) → L3 (Sub-component)
5. **N:M Relationships**: Features can contribute to multiple value model paths
6. **Cross-Document References**: Consistent ID patterns enable traceability chains
7. **Value Model Maturity (VMM)**: 4-stage maturity tracking (hypothetical → emerging → proven → scaled) with evidence-based progression from L3 upward via 80% rule
8. **Universal Milestones**: 3 validation milestones apply to all tracks (Problem-Approach Fit → Value-Recipient Fit → Sustainable-Domain Fit)
9. **Canonical Track Definitions (NEW in v2.6.0)**: Strategy, OrgOps, Commercial tracks have reusable canonical definitions; Product track contains examples only

### Canonical vs Non-Canonical Tracks (NEW in v2.6.0)

| Track | Status | Definition Prefix | Canonical? | Value Model |
|-------|--------|-------------------|------------|-------------|
| **Strategy** | CANONICAL | `sd-*` | ✅ Reusable definitions | ✅ Canonical |
| **OrgOps** | CANONICAL | `pd-*` | ✅ Reusable definitions | ✅ Canonical |
| **Commercial** | CANONICAL | `cd-*` | ✅ Reusable definitions | ✅ Canonical |
| **Product** | EXAMPLES | `fd-*` | ❌ Product-specific | ❌ Placeholder |

**Why this matters**: Strategy, OrgOps, and Commercial definitions describe universal business processes that work across organizations. Product features are unique to each product and cannot be standardized.

---

## Part 1: Core Entity Definitions

### 1.1 Organization & Foundation (North Star)

These entities are **stable** (reviewed annually, not per-cycle).

#### `Organization`
```
Organization {
  id: string (PK)                    -- e.g., "org-acme-corp"
  name: string (required)
  legal_entity: string (nullable)
  created_at: timestamp
  updated_at: timestamp
}
```

#### `Purpose`
```
Purpose {
  id: string (PK)
  organization_id: string (FK → Organization)
  statement: string (200-1000 chars, required)
  problem_we_solve: string (required)
  who_we_serve: string (required)
  impact_we_seek: string (required)
  created_at: timestamp
  updated_at: timestamp
}
```

#### `Vision`
```
Vision {
  id: string (PK)
  organization_id: string (FK → Organization)
  vision_statement: string (required)
  timeframe: string                  -- e.g., "5-10 years"
  success_looks_like: string[]       -- array of success indicators
  not_the_vision: string[]           -- explicit exclusions
  created_at: timestamp
  updated_at: timestamp
}
```

#### `Mission`
```
Mission {
  id: string (PK)
  organization_id: string (FK → Organization)
  mission_statement: string (required)
  what_we_do: string (required)
  how_we_deliver: string (required)
  who_we_serve_specifically: string (required)
  boundaries: string[]               -- what we explicitly don't do
  created_at: timestamp
  updated_at: timestamp
}
```

#### `OrganizationalValue`
```
OrganizationalValue {
  id: string (PK)
  organization_id: string (FK → Organization)
  value: string (required)           -- the value name
  definition: string (required)
  behaviors_we_expect: string[]
  behaviors_we_reject: string[]
  example_decision: string (nullable)
  sort_order: integer
  created_at: timestamp
}
```

#### `ValueConflict`
```
ValueConflict {
  id: string (PK)
  organization_id: string (FK → Organization)
  value_a_id: string (FK → OrganizationalValue)
  value_b_id: string (FK → OrganizationalValue)
  resolution_principle: string       -- how to resolve when they conflict
  example_scenario: string (nullable)
  created_at: timestamp
}
```

#### `CoreBelief`
```
CoreBelief {
  id: string (PK)
  organization_id: string (FK → Organization)
  category: enum {about_our_market, about_our_users, about_our_approach, about_value_creation}
  belief_statement: string (required)
  evidence: string (nullable)
  created_at: timestamp
  updated_at: timestamp
}
```

#### `PortfolioMaturitySummary` (NEW in v2.5.0)
```
PortfolioMaturitySummary {
  id: string (PK)
  organization_id: string (FK → Organization)
  product_line: string (3-80 chars, required)   -- e.g., "Core Platform", "Mobile App"
  overall_position: enum {discovery, validation, scalability, growth}
  product_track_maturity: enum {hypothetical, emerging, proven, scaled}
  strategy_track_maturity: enum {hypothetical, emerging, proven, scaled}
  org_ops_track_maturity: enum {hypothetical, emerging, proven, scaled}
  commercial_track_maturity: enum {hypothetical, emerging, proven, scaled}
  current_milestone: enum {none, problem_approach_fit, value_recipient_fit, sustainable_domain_fit}
  milestone_notes: string (500 chars max, nullable)
  focus_recommendation: string (300 chars max, nullable)
  created_at: timestamp
  updated_at: timestamp
}
```

#### `MaturityTheme` (NEW in v2.5.0)
```
MaturityTheme {
  id: string (PK)
  organization_id: string (FK → Organization)
  theme: string (300 chars max, required)        -- pattern observed across portfolio
  implication: string (300 chars max, nullable)  -- strategic/resource allocation implications
  created_at: timestamp
}
```

---

### 1.2 Insight & Analysis Entities

These entities capture **market intelligence** and feed into strategy formulation.

#### `TrendAnalysis`
```
TrendAnalysis {
  id: string (PK)
  organization_id: string (FK → Organization)
  trend_type: enum {technology, market, user_behavior, regulatory, competitive}
  title: string (required)
  description: string (required)
  impact_assessment: string
  timeframe: string                  -- when trend will materialize
  confidence_level: enum {low, medium, high}
  source: string
  created_at: timestamp
  updated_at: timestamp
}
```

#### `MarketDefinition`
```
MarketDefinition {
  id: string (PK)
  organization_id: string (FK → Organization)
  tam: string                        -- Total Addressable Market
  sam: string                        -- Serviceable Addressable Market
  som: string                        -- Serviceable Obtainable Market
  market_stage: string
  growth_rate: string
  created_at: timestamp
  updated_at: timestamp
}
```

#### `MarketSegment`
```
MarketSegment {
  id: string (PK)
  market_definition_id: string (FK → MarketDefinition)
  name: string (required)
  description: string
  size: string
  characteristics: string[]
  created_at: timestamp
}
```

#### `Competitor`
```
Competitor {
  id: string (PK)
  organization_id: string (FK → Organization)
  competitor_type: enum {direct, indirect, substitute}
  name: string (required)
  description: string
  strengths: string[]
  weaknesses: string[]
  market_share: string (nullable)
  positioning: string
  created_at: timestamp
  updated_at: timestamp
}
```

#### `SwotItem`
```
SwotItem {
  id: string (PK)
  organization_id: string (FK → Organization)
  category: enum {strength, weakness, opportunity, threat}
  description: string (required)
  impact_level: enum {low, medium, high}
  created_at: timestamp
}
```

#### `TargetUser`
```
TargetUser {
  id: string (PK)
  organization_id: string (FK → Organization)
  persona_name: string (required)
  description: string
  created_at: timestamp
  updated_at: timestamp
}
```

#### `UserProblem`
```
UserProblem {
  id: string (PK)
  target_user_id: string (FK → TargetUser)
  problem_statement: string (required)
  severity: enum {low, medium, high, critical}
  frequency: string
  current_workaround: string (nullable)
  created_at: timestamp
}
```

#### `JobToBeDone`
```
JobToBeDone {
  id: string (PK)
  target_user_id: string (FK → TargetUser)
  job_statement: string (required)   -- "When [situation], I want to [motivation], so I can [outcome]"
  job_type: enum {functional, emotional, social}
  importance: enum {low, medium, high, critical}
  satisfaction_current: integer (1-10)
  created_at: timestamp
}
```

---

### 1.3 Opportunity Entities

#### `Opportunity`
```
Opportunity {
  id: string (PK)                    -- pattern: "opp-{descriptive-slug}"
  organization_id: string (FK → Organization)
  title: string (10-100 chars, required)
  description: string (200-1500 chars, required)
  status: enum {identified, validated, invalidated, deferred, roadmap}
  confidence_level: enum {low, medium, high}
  created_at: timestamp
  updated_at: timestamp
  validated_at: timestamp (nullable)
}
```

#### `OpportunityContext`
```
OpportunityContext {
  id: string (PK)
  opportunity_id: string (FK → Opportunity)
  target_segment: string (20-200 chars, required)
  market_size: string (50-500 chars)
  urgency: string (50-500 chars)
  created_at: timestamp
}
```

#### `OpportunityPainPoint`
```
OpportunityPainPoint {
  id: string (PK)
  opportunity_id: string (FK → Opportunity)
  description: string (30-300 chars, required)
  sort_order: integer
  created_at: timestamp
}
```

#### `OpportunityEvidence`
```
OpportunityEvidence {
  id: string (PK)
  opportunity_id: string (FK → Opportunity)
  evidence_type: enum {quantitative, qualitative, competitive}
  source: string (10-150 chars, required)
  insight: string (30-400 chars, required)
  created_at: timestamp
}
```

#### `ValueHypothesis`
```
ValueHypothesis {
  id: string (PK)
  opportunity_id: string (FK → Opportunity)
  user_value: string (100-400 chars, required)
  business_value: string (100-400 chars, required)
  strategic_fit: string (50-400 chars, nullable)
  created_at: timestamp
  updated_at: timestamp
}
```

#### `SuccessIndicator`
```
SuccessIndicator {
  id: string (PK)
  opportunity_id: string (FK → Opportunity)
  metric: string (10-150 chars, required)
  target: string (20-300 chars, required)
  created_at: timestamp
}
```

---

### 1.4 Strategy Entities

#### `Strategy`
```
Strategy {
  id: string (PK)                    -- pattern: "strat-{slug}"
  opportunity_id: string (FK → Opportunity)
  organization_id: string (FK → Organization)
  status: enum {draft, active, superseded, archived}
  created_at: timestamp
  updated_at: timestamp
}
```

#### `Positioning`
```
Positioning {
  id: string (PK)
  strategy_id: string (FK → Strategy)
  unique_value_proposition: string (required)
  target_customer_profile: string (required)
  category: string                   -- market category
  created_at: timestamp
  updated_at: timestamp
}
```

#### `CompetitiveMoat`
```
CompetitiveMoat {
  id: string (PK)
  strategy_id: string (FK → Strategy)
  differentiation: string (required)
  barriers_to_entry: string
  created_at: timestamp
}
```

#### `CompetitiveAdvantage`
```
CompetitiveAdvantage {
  id: string (PK)
  competitive_moat_id: string (FK → CompetitiveMoat)
  advantage: string (required)
  sustainability: enum {low, medium, high}
  created_at: timestamp
}
```

#### `BusinessModel`
```
BusinessModel {
  id: string (PK)
  strategy_id: string (FK → Strategy)
  revenue_model: string (required)
  pricing_strategy: string (required)
  unit_economics: string
  created_at: timestamp
  updated_at: timestamp
}
```

#### `GrowthEngine`
```
GrowthEngine {
  id: string (PK)
  business_model_id: string (FK → BusinessModel)
  engine_type: string (required)     -- e.g., "viral", "paid", "sticky"
  description: string
  primary_metric: string
  created_at: timestamp
}
```

#### `StrategicConstraint`
```
StrategicConstraint {
  id: string (PK)
  strategy_id: string (FK → Strategy)
  constraint: string (required)
  impact: string
  created_at: timestamp
}
```

#### `StrategicTradeoff`
```
StrategicTradeoff {
  id: string (PK)
  strategy_id: string (FK → Strategy)
  tradeoff: string (required)        -- what we're choosing between
  decision: string                   -- what we decided
  rationale: string
  created_at: timestamp
}
```

#### `StrategicRisk`
```
StrategicRisk {
  id: string (PK)
  strategy_id: string (FK → Strategy)
  risk: string (required)
  probability: enum {low, medium, high}
  impact: enum {low, medium, high}
  mitigation: string
  created_at: timestamp
}
```

---

### 1.5 Strategy Foundations

#### `ProductVision`
```
ProductVision {
  id: string (PK)
  organization_id: string (FK → Organization)
  opportunity_id: string (FK → Opportunity, nullable)
  vision_statement: string (required)
  success_indicators: string[]
  vision_alignment: string           -- how it aligns with org vision
  created_at: timestamp
  updated_at: timestamp
}
```

#### `ValueProposition`
```
ValueProposition {
  id: string (PK)
  organization_id: string (FK → Organization)
  headline: string (required)
  target_segment: string (required)
  functional_value: string (required)
  emotional_value: string
  economic_value: string
  created_at: timestamp
  updated_at: timestamp
}
```

#### `StrategicPhase`
```
StrategicPhase {
  id: string (PK)
  organization_id: string (FK → Organization)
  phase_number: integer (required)
  name: string (required)
  description: string
  focus_areas: string[]
  success_criteria: string[]
  timeframe: string
  created_at: timestamp
}
```

#### `InformationArchitecture`
```
InformationArchitecture {
  id: string (PK)
  organization_id: string (FK → Organization)
  mental_model: string               -- how users think about the product
  primary_structure: string          -- main organizational pattern
  interaction_patterns: string[]
  created_at: timestamp
  updated_at: timestamp
}
```

---

## Part 2: Roadmap & OKR Entities

### 2.1 Roadmap Structure

#### `Roadmap`
```
Roadmap {
  id: string (PK)                    -- pattern: "rm-{descriptive-slug}"
  strategy_id: string (FK → Strategy)
  organization_id: string (FK → Organization)
  cycle: integer (1-100, required)
  timeframe_start: date
  timeframe_end: date
  status: enum {draft, active, completed, archived}
  created_at: timestamp
  updated_at: timestamp
  completed_at: timestamp (nullable)
}
```

#### `RoadmapTrack`
```
RoadmapTrack {
  id: string (PK)
  roadmap_id: string (FK → Roadmap)
  track_type: enum {product, strategy, org_ops, commercial}  -- THE FOUR TRACKS
  track_objective: string (required)
  created_at: timestamp
}
```

### 2.2 OKR Hierarchy

#### `Objective` (OKR)
```
Objective {
  id: string (PK)                    -- pattern: "okr-{track}-{number}" e.g., "okr-p-001"
  roadmap_track_id: string (FK → RoadmapTrack)
  objective_statement: string (required)
  rationale: string
  sort_order: integer
  created_at: timestamp
}
```

#### `KeyResult`
```
KeyResult {
  id: string (PK)                    -- pattern: "kr-{track}-{number}" e.g., "kr-p-001"
  objective_id: string (FK → Objective)
  description: string (required)
  target: string (required)          -- measurable target
  current_value: string (nullable)   -- tracked during execution
  status: enum {not_started, in_progress, at_risk, completed, missed}
  
  -- TRL (Technology Readiness Level) Fields
  trl_start: integer (1-9, nullable)
  trl_target: integer (1-9, nullable)
  trl_progression: string (nullable) -- e.g., "3→5→7"
  
  -- Hypothesis Testing Fields
  technical_hypothesis: string (nullable)
  experiment_design: string (nullable)
  success_criteria: string (nullable)
  uncertainty_addressed: string (nullable)
  
  created_at: timestamp
  updated_at: timestamp
}
```

#### `KeyResultValueModelTarget` (NEW in v2.5.0)
```
KeyResultValueModelTarget {
  id: string (PK)
  key_result_id: string (FK → KeyResult)
  track: enum {product, strategy, org_ops, commercial}
  component_path: string (required)  -- e.g., "core-platform.data-management.csv-import"
  target_maturity: enum {emerging, proven, scaled}  -- cannot be 'hypothetical'
  maturity_rationale: string (300 chars max, nullable)
  created_at: timestamp
}
```

### 2.3 Assumptions & Dependencies

#### `RoadmapAssumption`
```
RoadmapAssumption {
  id: string (PK)                    -- pattern: "asm-{track}-{number}" e.g., "asm-p-001"
  roadmap_track_id: string (FK → RoadmapTrack)
  assumption_type: enum {market, user, technical, business, regulatory}
  statement: string (required)
  criticality: enum {low, medium, high, critical}
  confidence: enum {low, medium, high}
  validation_approach: string
  created_at: timestamp
  updated_at: timestamp
}
```

#### `AssumptionKRLink` (M:N Join Table)
```
AssumptionKRLink {
  assumption_id: string (FK → RoadmapAssumption)
  key_result_id: string (FK → KeyResult)
  PRIMARY KEY (assumption_id, key_result_id)
}
```

#### `CrossTrackDependency`
```
CrossTrackDependency {
  id: string (PK)
  roadmap_id: string (FK → Roadmap)
  from_kr_id: string (FK → KeyResult)
  to_kr_id: string (FK → KeyResult)
  dependency_type: enum {blocks, enables, informs, requires}
  description: string
  created_at: timestamp
}
```

### 2.4 Solution Scaffold

#### `SolutionComponent`
```
SolutionComponent {
  id: string (PK)
  roadmap_track_id: string (FK → RoadmapTrack)
  name: string (required)
  description: string
  maps_to_value_model: string        -- value model path e.g., "Product.Operate.Monitoring"
  priority: enum {must_have, should_have, could_have, wont_have}
  created_at: timestamp
}
```

### 2.5 Execution Plan

#### `ExecutionMilestone`
```
ExecutionMilestone {
  id: string (PK)
  roadmap_id: string (FK → Roadmap)
  name: string (required)
  description: string
  target_date: date
  actual_date: date (nullable)
  status: enum {planned, in_progress, completed, delayed, cancelled}
  created_at: timestamp
  updated_at: timestamp
}
```

#### `CriticalPathItem`
```
CriticalPathItem {
  id: string (PK)
  roadmap_id: string (FK → Roadmap)
  item_description: string (required)
  sequence_order: integer
  estimated_duration: string
  dependencies: string[]             -- references to other critical path items
  created_at: timestamp
}
```

---

## Part 3: Value Model Entities

The Value Model is the **hierarchical capability structure** for each of the four tracks.

### 3.1 Value Model Core

#### `ValueModel`
```
ValueModel {
  id: string (PK)
  organization_id: string (FK → Organization)
  track_name: enum {Product, Strategy, OrgOps, Commercial}  -- THE FOUR PILLARS
  version: string
  status: enum {draft, active, deprecated}
  description: string
  activation_notes: string
  packaged_default: boolean (default: false)  -- true if EPF framework template
  created_at: timestamp
  updated_at: timestamp
}
```

#### `ValueModelTrackMaturity` (NEW in v2.5.0)
```
ValueModelTrackMaturity {
  id: string (PK)
  value_model_id: string (FK → ValueModel)
  overall_stage: enum {hypothetical, emerging, proven, scaled}
  stage_override: boolean (default: false)  -- true if manually set vs calculated
  value_domain: string (5-100 chars)         -- environment where maturity is assessed
  current_milestone: enum {none, problem_approach_fit, value_recipient_fit, sustainable_domain_fit}
  l1_hypothetical_count: integer (default: 0)
  l1_emerging_count: integer (default: 0)
  l1_proven_count: integer (default: 0)
  l1_scaled_count: integer (default: 0)
  created_at: timestamp
  updated_at: timestamp
}
```

#### `TrackMaturityMilestoneCriteria` (NEW in v2.5.0)
```
TrackMaturityMilestoneCriteria {
  id: string (PK)
  track_maturity_id: string (FK → ValueModelTrackMaturity)
  description: string (10-300 chars, required)
  status: enum {not_met, in_progress, met}
  sort_order: integer
  created_at: timestamp
}
```

#### `ValueModelLayer` (L1)
```
ValueModelLayer {
  id: string (PK)                    -- e.g., "operate", "decide", "execute" (kebab-case)
  value_model_id: string (FK → ValueModel)
  name: string (required)            -- display name e.g., "Core Platform"
  description: string (50-1000 chars)
  sort_order: integer
  created_at: timestamp
}
```

#### `LayerSolutionStep` (NEW in v2.5.0)
```
LayerSolutionStep {
  id: string (PK)
  layer_id: string (FK → ValueModelLayer)
  step: string (30-150 chars, required)     -- implementation action
  outcome: string (30-200 chars, required)  -- resulting capability
  sort_order: integer
  created_at: timestamp
}
```

#### `LayerMaturitySummary` (NEW in v2.5.0)
```
LayerMaturitySummary {
  id: string (PK)
  layer_id: string (FK → ValueModelLayer)
  calculated_stage: enum {hypothetical, emerging, proven, scaled}
  stage_override: boolean (default: false)
  l2_hypothetical_count: integer (default: 0)
  l2_emerging_count: integer (default: 0)
  l2_proven_count: integer (default: 0)
  l2_scaled_count: integer (default: 0)
  updated_at: timestamp
}
```

#### `ValueModelComponent` (L2)
```
ValueModelComponent {
  id: string (PK)                    -- e.g., "data-management", "analytics" (kebab-case)
  layer_id: string (FK → ValueModelLayer)
  name: string (required)            -- display name e.g., "Data Management"
  description: string (30-800 chars)
  sort_order: integer
  created_at: timestamp
}
```

#### `ComponentMaturitySummary` (NEW in v2.5.0)
```
ComponentMaturitySummary {
  id: string (PK)
  component_id: string (FK → ValueModelComponent)
  calculated_stage: enum {hypothetical, emerging, proven, scaled}
  stage_override: boolean (default: false)
  l3_hypothetical_count: integer (default: 0)
  l3_emerging_count: integer (default: 0)
  l3_proven_count: integer (default: 0)
  l3_scaled_count: integer (default: 0)
  updated_at: timestamp
}
```

#### `ValueModelSubComponent` (L3)
```
ValueModelSubComponent {
  id: string (PK)                    -- e.g., "csv-import", "sso-auth" (kebab-case)
  component_id: string (FK → ValueModelComponent)
  name: string (required)            -- customer-facing name e.g., "CSV Import"
  active: boolean (default: false)   -- is this capability currently active?
  premium: boolean (default: false)  -- is this a premium/paid capability?
  uvp: string (300 chars max, nullable)  -- unique value proposition
  sort_order: integer
  created_at: timestamp
  updated_at: timestamp
}
```

#### `SubComponentMaturity` (NEW in v2.5.0)
```
SubComponentMaturity {
  id: string (PK)
  sub_component_id: string (FK → ValueModelSubComponent)
  stage: enum {hypothetical, emerging, proven, scaled} (default: hypothetical)
  stage_override: boolean (default: false)
  milestone_achieved: enum {none, problem_approach_fit, value_recipient_fit, sustainable_domain_fit} (default: none)
  milestone_notes: string (500 chars max, nullable)
  updated_at: timestamp
}
```

#### `SubComponentMaturityEvidence` (NEW in v2.5.0)
```
SubComponentMaturityEvidence {
  id: string (PK)
  maturity_id: string (FK → SubComponentMaturity)
  evidence_type: enum {usage_metric, customer_feedback, retention_data, nps_score, business_impact, revenue_data, qualitative_observation, experiment_result}
  description: string (10-500 chars, required)
  evidence_date: date (nullable)
  source: string (100 chars max, nullable)
  created_at: timestamp
}
```

**Computed Path**: Full path is `{track_name}.{layer_id}.{component_id}.{subcomponent_id}` (e.g., `product.core-platform.data-management.csv-import`)

### 3.2 Maturity Emergence Rules (NEW in v2.5.0)

**The 80% Rule**: Maturity emerges upward through the hierarchy:
- L3 → L2: If 80%+ of L3 sub-components are at stage X, L2 component is at stage X
- L2 → L1: If 80%+ of L2 components are at stage X, L1 layer is at stage X  
- L1 → Track: If 80%+ of L1 layers are at stage X, Track is at stage X

**Maturity Stages**:
| Stage | Description | Evidence Required |
|-------|-------------|-------------------|
| `hypothetical` | Value proposition defined, not validated | None (starting state) |
| `emerging` | Early signals of value delivery | Initial adoption, positive feedback, early metrics |
| `proven` | Consistent value delivery to target recipients | Retention, satisfaction, measurable outcomes |
| `scaled` | Sustainable value at scale | Unit economics work, scalable delivery, repeatable |

**Universal Milestones**:
| Milestone | Description | Generalizes From |
|-----------|-------------|------------------|
| `problem_approach_fit` | Approach validated for solving real problem | Problem-Solution Fit (PSF) |
| `value_recipient_fit` | Recipients receive and value what we deliver | Product-User Fit (PUF) |
| `sustainable_domain_fit` | Sustainable value delivery in operating domain | Product-Market Fit (PMF) |

---

## Part 4: Feature Definition Entities

Features are the **bridge between EPF strategy and implementation tools**.

### 4.1 Feature Core

#### `FeatureDefinition`
```
FeatureDefinition {
  id: string (PK)                    -- pattern: "fd-{number}" e.g., "fd-007"
  organization_id: string (FK → Organization)
  name: string (required)
  slug: string (required)            -- URL-safe identifier
  status: enum {draft, ready, in_progress, delivered}
  
  -- Definition fields
  job_to_be_done: string (required)
  solution_approach: string
  
  created_at: timestamp
  updated_at: timestamp
  delivered_at: timestamp (nullable)
}
```

### 4.2 Strategic Context (N:M Relationships)

#### `FeatureValueModelLink` (N:M Join Table)
```
FeatureValueModelLink {
  feature_id: string (FK → FeatureDefinition)
  value_model_path: string           -- e.g., "Product.Operate.Monitoring"
  PRIMARY KEY (feature_id, value_model_path)
}
```

#### `FeatureTrackLink` (N:M Join Table)
```
FeatureTrackLink {
  feature_id: string (FK → FeatureDefinition)
  track_type: enum {product, strategy, org_ops, commercial}
  PRIMARY KEY (feature_id, track_type)
}
```

#### `FeatureAssumptionLink` (N:M Join Table)
```
FeatureAssumptionLink {
  feature_id: string (FK → FeatureDefinition)
  assumption_id: string (FK → RoadmapAssumption)
  PRIMARY KEY (feature_id, assumption_id)
}
```

### 4.3 Feature Capabilities

#### `FeatureCapability`
```
FeatureCapability {
  id: string (PK)                    -- pattern: "cap-{number}" e.g., "cap-001"
  feature_id: string (FK → FeatureDefinition)
  name: string (required)
  description: string (required)
  sort_order: integer
  created_at: timestamp
}
```

### 4.4 Feature Personas (Exactly 4 Required per Schema)

#### `FeaturePersona`
```
FeaturePersona {
  id: string (PK)                    -- pattern: "persona-{slug}"
  feature_id: string (FK → FeatureDefinition)
  name: string (required)
  role: string (required)
  
  -- Narrative fields (each ≥200 chars per schema)
  current_situation: string (≥200 chars, required)
  transformation_moment: string (≥200 chars, required)
  emotional_resolution: string (≥200 chars, required)
  
  sort_order: integer (1-4)          -- exactly 4 personas required
  created_at: timestamp
}
```

### 4.5 Feature Contexts

#### `FeatureContext`
```
FeatureContext {
  id: string (PK)                    -- pattern: "ctx-{number}" e.g., "ctx-001"
  feature_id: string (FK → FeatureDefinition)
  context_type: enum {screen, modal, widget, notification, background, api}
  name: string (required)
  description: string
  created_at: timestamp
}
```

#### `ContextInteraction`
```
ContextInteraction {
  id: string (PK)
  context_id: string (FK → FeatureContext)
  interaction_description: string (required)
  sort_order: integer
  created_at: timestamp
}
```

#### `ContextDataDisplayed`
```
ContextDataDisplayed {
  id: string (PK)
  context_id: string (FK → FeatureContext)
  data_description: string (required)
  sort_order: integer
  created_at: timestamp
}
```

### 4.6 Feature Scenarios

#### `FeatureScenario`
```
FeatureScenario {
  id: string (PK)                    -- pattern: "scn-{number}" e.g., "scn-001"
  feature_id: string (FK → FeatureDefinition)
  name: string (required)
  actor: string (required)           -- who performs the action
  context: string (required)         -- in what situation
  trigger: string (required)         -- what initiates the scenario
  action: string (required)          -- what the user does
  outcome: string (required)         -- expected result
  sort_order: integer
  created_at: timestamp
}
```

#### `ScenarioAcceptanceCriteria`
```
ScenarioAcceptanceCriteria {
  id: string (PK)
  scenario_id: string (FK → FeatureScenario)
  criterion: string (required)
  sort_order: integer
  created_at: timestamp
}
```

### 4.7 Feature Dependencies

#### `FeatureDependency`
```
FeatureDependency {
  id: string (PK)
  feature_id: string (FK → FeatureDefinition)
  depends_on_feature_id: string (FK → FeatureDefinition)
  dependency_type: enum {requires, enables, related, based_on}
  reason: string (≥30 chars, required)
  created_at: timestamp
}
```

---

## Part 4A: Canonical Track Definitions (NEW in v2.6.0)

EPF v2.6.0 introduces **canonical definitions** for three tracks (Strategy, OrgOps, Commercial). These are reusable process definitions that work across organizations. Product feature definitions remain product-specific.

### 4A.1 Track Definition Base (Shared Fields)

All track definitions share a common base structure:

#### `TrackDefinition` (Abstract Base)
```
TrackDefinition {
  id: string (PK)                    -- pattern: "{prefix}-{number}" e.g., "sd-005", "pd-023", "cd-010"
  organization_id: string (FK → Organization, nullable)  -- null = canonical EPF definition
  name: string (3-120 chars, required)
  slug: string (required)            -- URL-safe identifier
  track: enum {strategy, org_ops, commercial} (required)
  status: enum {draft, ready, active, deprecated} (default: draft)
  
  -- Value model linking
  contributes_to: string[]           -- array of value model paths
  
  created_at: timestamp
  updated_at: timestamp
}
```

### 4A.2 Strategy Definition (sd-*)

#### `StrategyDefinition`
```
StrategyDefinition extends TrackDefinition {
  id: string (PK)                    -- pattern: "sd-{number}" e.g., "sd-005"
  track: 'strategy' (required)
  
  -- Maturity tiers
  current_tier: integer (1-3, default: 1)
  
  created_at: timestamp
  updated_at: timestamp
}
```

#### `StrategyDefinitionMaturityTier`
```
StrategyDefinitionMaturityTier {
  id: string (PK)
  definition_id: string (FK → StrategyDefinition)
  tier: integer (1-3, required)
  description: string (required)
  
  -- Tier 1 fields
  includes: string[] (nullable)      -- basic capabilities
  effort: string (nullable)          -- e.g., "2-4 hours"
  
  -- Tier 2+ fields (adds to previous tier)
  adds: string[] (nullable)          -- additional capabilities
  
  created_at: timestamp
}
```

### 4A.3 OrgOps Definition (pd-*)

#### `OrgOpsDefinition`
```
OrgOpsDefinition extends TrackDefinition {
  id: string (PK)                    -- pattern: "pd-{number}" e.g., "pd-023"
  track: 'org_ops' (required)
  
  -- Maturity tiers
  current_tier: integer (1-3, default: 1)
  
  created_at: timestamp
  updated_at: timestamp
}
```

### 4A.4 Commercial Definition (cd-*)

#### `CommercialDefinition`
```
CommercialDefinition extends TrackDefinition {
  id: string (PK)                    -- pattern: "cd-{number}" e.g., "cd-010"
  track: 'commercial' (required)
  
  -- Maturity tiers
  current_tier: integer (1-3, default: 1)
  
  created_at: timestamp
  updated_at: timestamp
}
```

### 4A.5 Track Definition Counts (v2.6.0)

| Track | Prefix | Canonical Count | Schema |
|-------|--------|-----------------|--------|
| Strategy | sd-* | 39 definitions | `strategy_definition_schema.json` |
| OrgOps | pd-* | 54 definitions | `org_ops_definition_schema.json` |
| Commercial | cd-* | 38 definitions | `commercial_definition_schema.json` |
| Product | fd-* | 22 examples (not canonical) | `feature_definition_schema.json` |

**Total Canonical Definitions: 131**

### 4A.6 Commercial vs OrgOps Boundary (Clarification)

A key distinction in EPF v2.6.0:

| Aspect | Commercial Track (cd-*) | OrgOps Track (pd-*) |
|--------|------------------------|---------------------|
| **Focus** | Investor ACQUISITION | Investor RELATIONS |
| **When** | Pre-investment, fundraising | Post-investment, ongoing |
| **Examples** | Pitch decks, term sheets, roadshows | Board meetings, quarterly reports, governance |
| **Value Model** | `Commercial.FINANCING` | `OrgOps.Governance`, `OrgOps.Financial` |
| **Practitioner** | CFO, Founder during fundraise | CFO, Legal, Board Secretary ongoing |

---

## Part 5: Product Portfolio Entities

For organizations with **multiple product lines**.

### 5.1 Portfolio Structure

#### `Portfolio`
```
Portfolio {
  id: string (PK)                    -- pattern: "portfolio-{slug}"
  organization_id: string (FK → Organization)
  name: string (required)
  description: string
  version: string
  created_at: timestamp
  updated_at: timestamp
}
```

#### `ProductLine`
```
ProductLine {
  id: string (PK)                    -- pattern: "pl-{slug}" e.g., "pl-software"
  portfolio_id: string (FK → Portfolio)
  name: string (required)
  codename: string (nullable)        -- internal codename
  product_type: enum {software, hardware, service, platform, data, hybrid, other}
  description: string
  value_model_id: string (FK → ValueModel)
  status: enum {concept, development, active, mature, sunset, deprecated}
  
  -- Versioning
  current_version: string
  version_strategy: enum {semver, date_based, codename, continuous}
  release_cadence: string
  
  created_at: timestamp
  updated_at: timestamp
}
```

#### `ProductLineTargetMarket`
```
ProductLineTargetMarket {
  id: string (PK)
  product_line_id: string (FK → ProductLine)
  market_type: enum {segment, vertical, geography}
  value: string (required)
  created_at: timestamp
}
```

#### `ProductLineComponent`
```
ProductLineComponent {
  id: string (PK)
  product_line_id: string (FK → ProductLine)
  component_ref: string (required)   -- reference to value model component
  role: enum {core, supporting, optional}
  created_at: timestamp
}
```

### 5.2 Product Line Relationships

#### `ProductLineRelationship`
```
ProductLineRelationship {
  id: string (PK)                    -- pattern: "plr-{slug}"
  from_product_line_id: string (FK → ProductLine)
  to_product_line_id: string (FK → ProductLine)
  relationship_type: enum {controls, monitors, integrates_with, depends_on, enhances, enables, complements, bundles_with}
  description: string
  bidirectional: boolean (default: false)
  created_at: timestamp
}
```

#### `IntegrationPoint`
```
IntegrationPoint {
  id: string (PK)
  relationship_id: string (FK → ProductLineRelationship)
  from_component: string (required)
  to_component: string (required)
  integration_type: enum {api, data_flow, control_signal, physical, business_process}
  description: string
  created_at: timestamp
}
```

### 5.3 Brands & Offerings

#### `Brand`
```
Brand {
  id: string (PK)                    -- pattern: "brand-{slug}"
  portfolio_id: string (FK → Portfolio)
  name: string (required)
  brand_type: enum {master, product, sub, endorsed, ingredient}
  description: string
  status: enum {planned, active, transitioning, deprecated, retired}
  created_at: timestamp
  updated_at: timestamp
}
```

#### `BrandProductLineLink` (M:N Join Table)
```
BrandProductLineLink {
  brand_id: string (FK → Brand)
  product_line_id: string (FK → ProductLine)
  PRIMARY KEY (brand_id, product_line_id)
}
```

#### `BrandComponentLink` (M:N Join Table)
```
BrandComponentLink {
  brand_id: string (FK → Brand)
  component_ref: string              -- value model component path
  PRIMARY KEY (brand_id, component_ref)
}
```

#### `Offering`
```
Offering {
  id: string (PK)                    -- pattern: "offering-{slug}"
  portfolio_id: string (FK → Portfolio)
  brand_id: string (FK → Brand, nullable)
  name: string (required)
  description: string
  pricing_model: string
  target_segment: string
  status: enum {planned, active, deprecated}
  created_at: timestamp
  updated_at: timestamp
}
```

---

## Part 6: AIM Phase Entities (Assessment & Calibration)

### 6.1 Assessment Report

#### `AssessmentReport`
```
AssessmentReport {
  id: string (PK)
  roadmap_id: string (FK → Roadmap)
  cycle: integer (required)
  assessment_date: date
  created_at: timestamp
}
```

#### `OKRAssessment`
```
OKRAssessment {
  id: string (PK)
  assessment_report_id: string (FK → AssessmentReport)
  objective_id: string (FK → Objective)
  assessment_narrative: string (100-2000 chars, required)
  created_at: timestamp
}
```

#### `KeyResultOutcome`
```
KeyResultOutcome {
  id: string (PK)
  okr_assessment_id: string (FK → OKRAssessment)
  key_result_id: string (FK → KeyResult)
  target: string (required)
  actual: string (required)
  status: enum {exceeded, met, partially_met, missed}
  created_at: timestamp
}
```

#### `KeyResultLearning`
```
KeyResultLearning {
  id: string (PK)
  key_result_outcome_id: string (FK → KeyResultOutcome)
  learning: string (30-300 chars, required)
  sort_order: integer
  created_at: timestamp
}
```

#### `AssessmentDataPoint`
```
AssessmentDataPoint {
  id: string (PK)
  okr_assessment_id: string (FK → OKRAssessment)
  data_type: enum {quantitative, qualitative}
  
  -- For quantitative
  metric: string (nullable)
  target: string (nullable)
  actual: string (nullable)
  variance: string (nullable)
  
  -- For qualitative
  source: string (nullable)
  insight: string (nullable)
  
  created_at: timestamp
}
```

#### `CrossFunctionalInsight`
```
CrossFunctionalInsight {
  id: string (PK)
  okr_assessment_id: string (FK → OKRAssessment)
  insight: string (50-300 chars, required)
  sort_order: integer
  created_at: timestamp
}
```

### 6.2 Assumption Validation

#### `AssumptionValidation`
```
AssumptionValidation {
  id: string (PK)
  assessment_report_id: string (FK → AssessmentReport)
  assumption_id: string (FK → RoadmapAssumption)
  validation_status: enum {validated, invalidated, inconclusive, pending}
  evidence: string
  confidence_change: enum {increased, decreased, unchanged}
  created_at: timestamp
}
```

### 6.3 Calibration Memo

#### `CalibrationMemo`
```
CalibrationMemo {
  id: string (PK)
  roadmap_id: string (FK → Roadmap)
  cycle: integer (required)
  assessment_date: date (nullable)
  decision: enum {persevere, pivot, pull_the_plug, pending_assessment}
  confidence: enum {low, medium, high}
  reasoning: string (100-2000 chars, required)
  created_at: timestamp
}
```

#### `CalibrationLearning`
```
CalibrationLearning {
  id: string (PK)
  calibration_memo_id: string (FK → CalibrationMemo)
  learning_type: enum {validated_assumption, invalidated_assumption, surprise}
  learning: string (30-300 chars, required)
  sort_order: integer
  created_at: timestamp
}
```

#### `NextCycleFocus`
```
NextCycleFocus {
  id: string (PK)
  calibration_memo_id: string (FK → CalibrationMemo)
  focus_type: enum {continue_building, stop_building, start_exploring}
  description: string (30-200 chars, required)
  sort_order: integer
  created_at: timestamp
}
```

#### `NextReadyInput`
```
NextReadyInput {
  id: string (PK)
  calibration_memo_id: string (FK → CalibrationMemo)
  input_type: enum {opportunity_update, strategy_update}
  content: string (100-1000 chars, required)
  created_at: timestamp
}
```

#### `NewAssumption`
```
NewAssumption {
  id: string (PK)
  calibration_memo_id: string (FK → CalibrationMemo)
  assumption: string (50-300 chars, required)
  sort_order: integer
  created_at: timestamp
}
```

#### `NextStep`
```
NextStep {
  id: string (PK)
  calibration_memo_id: string (FK → CalibrationMemo)
  step: string (20-200 chars, required)
  owner: string (nullable)
  due_date: date (nullable)
  sort_order: integer
  created_at: timestamp
}
```

---

## Part 7: Mappings (Traceability)

Links value model capabilities to implementation artifacts.

#### `ImplementationMapping`
```
ImplementationMapping {
  id: string (PK)
  organization_id: string (FK → Organization)
  sub_component_path: string (required)  -- e.g., "Product.Operate.Monitoring"
  created_at: timestamp
  updated_at: timestamp
}
```

#### `MappingArtifact`
```
MappingArtifact {
  id: string (PK)
  mapping_id: string (FK → ImplementationMapping)
  artifact_type: enum {code, design, documentation, test}
  url: string (required)             -- URL to the artifact
  description: string (5-300 chars)
  created_at: timestamp
}
```

---

## Part 8: AIM Trigger Configuration

#### `AIMTriggerConfig`
```
AIMTriggerConfig {
  id: string (PK)
  organization_id: string (FK → Organization)
  adoption_level: integer (0-3)
  
  -- Calendar trigger
  cadence_days: integer              -- run AIM every N days
  
  -- ROI threshold trigger
  roi_threshold_enabled: boolean
  minimum_roi_percent: integer
  evaluation_window_days: integer
  
  -- Assumption invalidation trigger
  assumption_trigger_enabled: boolean
  critical_assumption_threshold: integer
  
  -- Opportunity trigger
  opportunity_trigger_enabled: boolean
  
  created_at: timestamp
  updated_at: timestamp
}
```

#### `CriticalAssumptionWatch`
```
CriticalAssumptionWatch {
  id: string (PK)
  trigger_config_id: string (FK → AIMTriggerConfig)
  assumption_id: string (FK → RoadmapAssumption)
  created_at: timestamp
}
```

---

## Part 9: Entity Relationship Summary

### Primary Relationships Diagram (Conceptual)

```
Organization (1)
  ├── Purpose (1)
  ├── Vision (1)
  ├── Mission (1)
  ├── OrganizationalValue (N)
  │     └── ValueConflict (N:N via ValueConflict table)
  ├── CoreBelief (N)
  ├── TrendAnalysis (N)
  ├── MarketDefinition (1)
  │     └── MarketSegment (N)
  ├── Competitor (N)
  ├── SwotItem (N)
  ├── TargetUser (N)
  │     ├── UserProblem (N)
  │     └── JobToBeDone (N)
  ├── Opportunity (N)
  │     ├── OpportunityContext (1)
  │     ├── OpportunityPainPoint (N)
  │     ├── OpportunityEvidence (N)
  │     ├── ValueHypothesis (1)
  │     └── SuccessIndicator (N)
  ├── Strategy (N)
  │     ├── Positioning (1)
  │     ├── CompetitiveMoat (1)
  │     │     └── CompetitiveAdvantage (N)
  │     ├── BusinessModel (1)
  │     │     └── GrowthEngine (N)
  │     ├── StrategicConstraint (N)
  │     ├── StrategicTradeoff (N)
  │     └── StrategicRisk (N)
  ├── Roadmap (N)
  │     ├── RoadmapTrack (4: product, strategy, org_ops, commercial)
  │     │     ├── Objective (N)
  │     │     │     └── KeyResult (N)
  │     │     ├── RoadmapAssumption (N)
  │     │     │     └── AssumptionKRLink (N:M → KeyResult)
  │     │     └── SolutionComponent (N)
  │     ├── CrossTrackDependency (N)
  │     ├── ExecutionMilestone (N)
  │     └── CriticalPathItem (N)
  ├── ValueModel (4: Product, Strategy, OrgOps, Commercial)
  │     └── ValueModelLayer (N)
  │           └── ValueModelComponent (N)
  │                 └── ValueModelSubComponent (N)
  ├── FeatureDefinition (N)
  │     ├── FeatureValueModelLink (N:M → ValueModel paths)
  │     ├── FeatureTrackLink (N:M → Tracks)
  │     ├── FeatureAssumptionLink (N:M → RoadmapAssumption)
  │     ├── FeatureCapability (N)
  │     ├── FeaturePersona (exactly 4)
  │     ├── FeatureContext (N)
  │     │     ├── ContextInteraction (N)
  │     │     └── ContextDataDisplayed (N)
  │     ├── FeatureScenario (N)
  │     │     └── ScenarioAcceptanceCriteria (N)
  │     └── FeatureDependency (N → FeatureDefinition)
  ├── Portfolio (N)
  │     ├── ProductLine (N)
  │     │     ├── ProductLineTargetMarket (N)
  │     │     ├── ProductLineComponent (N)
  │     │     └── ProductLineRelationship (N:N via relationship table)
  │     │           └── IntegrationPoint (N)
  │     ├── Brand (N)
  │     │     ├── BrandProductLineLink (N:M → ProductLine)
  │     │     └── BrandComponentLink (N:M → components)
  │     └── Offering (N)
  ├── AssessmentReport (N)
  │     ├── OKRAssessment (N)
  │     │     ├── KeyResultOutcome (N)
  │     │     │     └── KeyResultLearning (N)
  │     │     ├── AssessmentDataPoint (N)
  │     │     └── CrossFunctionalInsight (N)
  │     └── AssumptionValidation (N)
  ├── CalibrationMemo (N)
  │     ├── CalibrationLearning (N)
  │     ├── NextCycleFocus (N)
  │     ├── NextReadyInput (N)
  │     ├── NewAssumption (N)
  │     └── NextStep (N)
  ├── ImplementationMapping (N)
  │     └── MappingArtifact (N)
  └── AIMTriggerConfig (1)
        └── CriticalAssumptionWatch (N)
```

---

## Part 10: ID Patterns & Conventions

### Standard ID Patterns (Regex)

| Entity Type | Pattern | Example |
|-------------|---------|---------|
| Organization | `^org-[a-z0-9-]+$` | `org-acme-corp` |
| Opportunity | `^opp-[a-z0-9-]+$` | `opp-enterprise-workspace` |
| Strategy | `^strat-[a-z0-9-]+$` | `strat-mobile-first` |
| Roadmap | `^rm-[a-z0-9-]+$` | `rm-q1-2026` |
| Objective | `^okr-[psoc]-\d{3}$` | `okr-p-001` (product) |
| Key Result | `^kr-[psoc]-\d{3}$` | `kr-s-002` (strategy) |
| Assumption | `^asm-[psoc]-\d{3}$` | `asm-c-001` (commercial) |
| Feature Definition | `^fd-\d{3}$` | `fd-007` |
| Strategy Definition | `^sd-\d{3}$` | `sd-005` |
| OrgOps Definition | `^pd-\d{3}$` | `pd-023` |
| Commercial Definition | `^cd-\d{3}$` | `cd-010` |
| Capability | `^cap-\d{3}$` | `cap-001` |
| Context | `^ctx-\d{3}$` | `ctx-002` |
| Scenario | `^scn-\d{3}$` | `scn-005` |
| Portfolio | `^portfolio-[a-z0-9-]+$` | `portfolio-main` |
| Product Line | `^pl-[a-z0-9-]+$` | `pl-software` |
| Relationship | `^plr-[a-z0-9-]+$` | `plr-sw-hw-control` |
| Brand | `^brand-[a-z0-9-]+$` | `brand-premium` |
| Offering | `^offering-[a-z0-9-]+$` | `offering-enterprise` |

### Track Definition Prefixes (NEW in v2.6.0)

| Track | Definition Prefix | Count | Schema |
|-------|-------------------|-------|--------|
| Product | `fd-*` | 22 examples | `feature_definition_schema.json` |
| Strategy | `sd-*` | 39 canonical | `strategy_definition_schema.json` |
| Org/Ops | `pd-*` | 54 canonical | `org_ops_definition_schema.json` |
| Commercial | `cd-*` | 38 canonical | `commercial_definition_schema.json` |

### Track Prefixes (for OKRs/KRs/Assumptions)

| Track | Prefix | Used In |
|-------|--------|---------|
| Product | `p` | `okr-p-*`, `kr-p-*`, `asm-p-*` |
| Strategy | `s` | `okr-s-*`, `kr-s-*`, `asm-s-*` |
| Org/Ops | `o` | `okr-o-*`, `kr-o-*`, `asm-o-*` |
| Commercial | `c` | `okr-c-*`, `kr-c-*`, `asm-c-*` |

### Value Model Path Convention

Format: `{Track}.{L2_Theme}.{L3_Capability}`

Examples:
- `Product.Operate.Monitoring`
- `Strategy.Align.Vision`
- `OrgOps.Develop.Velocity`
- `Commercial.Acquire.Discovery`

---

## Part 11: Lifecycle States

### Document/Entity Lifecycle Enums

| Context | States |
|---------|--------|
| Opportunity | `identified → validated → roadmap` OR `identified → invalidated → archived` OR `identified → deferred` |
| Strategy | `draft → active → superseded → archived` |
| Roadmap | `draft → active → completed → archived` |
| Feature Definition | `draft → ready → in_progress → delivered` |
| Key Result | `not_started → in_progress → at_risk → completed` OR `missed` |
| Product Line | `concept → development → active → mature → sunset → deprecated` |
| Brand | `planned → active → transitioning → deprecated → retired` |
| Value Model | `draft → active → deprecated` |
| Calibration Decision | `persevere` OR `pivot` OR `pull_the_plug` OR `pending_assessment` |
| Confidence | `low → medium → high` |
| KR Outcome Status | `exceeded`, `met`, `partially_met`, `missed` |
| Assumption Validation | `validated`, `invalidated`, `inconclusive`, `pending` |

### Value Model Maturity Enums (NEW in v2.5.0)

| Context | States |
|---------|--------|
| Maturity Stage | `hypothetical → emerging → proven → scaled` |
| Maturity Milestone | `none → problem_approach_fit → value_recipient_fit → sustainable_domain_fit` |
| Milestone Criterion Status | `not_met → in_progress → met` |
| Evidence Type | `usage_metric`, `customer_feedback`, `retention_data`, `nps_score`, `business_impact`, `revenue_data`, `qualitative_observation`, `experiment_result` |
| Portfolio Position | `discovery → validation → scalability → growth` |

---

## Part 12: Implementation Recommendations

### Database Technology Considerations

1. **Relational (PostgreSQL recommended)**
   - Strong foreign key enforcement for traceability
   - JSON columns for flexible arrays (e.g., `string[]` fields)
   - Full-text search for opportunity/feature content
   - Enums for lifecycle states

2. **Schema Design Notes**
   - Use UUIDs for primary keys (or ULID for sortability)
   - Add `organization_id` foreign key to most tables for multi-tenancy
   - Implement soft deletes with `deleted_at` timestamp
   - Add `version` column for optimistic locking on frequently updated entities

3. **Indexing Strategy**
   - Index all foreign keys
   - Composite indexes on `(organization_id, status)` for filtered queries
   - Full-text indexes on `description`, `name` fields
   - Index `value_model_path` for mapping lookups

4. **Normalization Notes**
   - The YAML files aggregate data that should be split into separate tables
   - Arrays in YAML (e.g., `pain_points[]`, `learnings[]`) become child tables
   - Nested objects become separate entities with foreign keys
   - N:M relationships use explicit join tables

### Migration from YAML

When migrating from YAML artifacts:

1. **Parse organization-level data first** (North Star entities)
2. **Create value models** for all four tracks
3. **Import insights and opportunities** 
4. **Link strategies** to opportunities
5. **Import roadmaps** with all OKRs, KRs, assumptions
6. **Create features** and link to value model paths
7. **Import assessment and calibration data** for historical cycles
8. **Import maturity data** (NEW in v2.5.0): Parse L3 maturity evidence, calculate L2/L1/Track maturity using 80% rule

### Value Model Maturity Implementation Notes (NEW in v2.5.0)

**Calculation Logic:**

```sql
-- 80% Rule: Calculate L2 component stage from L3 sub-components
-- Stage threshold: If 80%+ of L3 sub-components at stage X, L2 is at stage X

-- 1. Count L3 sub-components by stage for each L2 component
-- 2. Calculate percentage at each stage
-- 3. Apply 80% threshold (highest stage with 80%+ coverage)
-- 4. Respect stage_override flag (manual override takes precedence)
```

**Recommended Triggers/Materialized Views:**
- Maintain `*_distribution` counts via triggers on INSERT/UPDATE/DELETE of child entities
- Recalculate `calculated_stage` when distribution changes
- Consider materialized views for expensive cross-table maturity aggregations

**KR → Maturity Link (KeyResultValueModelTarget):**
- When KR status = 'completed', check if evidence advances target component
- Suggested workflow: KR completion triggers notification for VMM review
- Do NOT auto-advance maturity—require human confirmation with evidence

**API Design Considerations:**
- Provide both raw maturity data and calculated/aggregated views
- Include `stage_override` in responses so UI can indicate manual vs calculated
- Consider read-only endpoints for calculated fields (prevent direct manipulation)

---

## Appendix: Quick Reference Tables

### Entity Count by Phase

| Phase | Entity Count | Key Entities |
|-------|--------------|--------------|
| Foundation (North Star) | 9 | Organization, Purpose, Vision, Mission, Values, PortfolioMaturitySummary, MaturityTheme |
| Insight | 9 | Trends, Market, Competitors, SWOT, Users |
| Opportunity | 6 | Opportunity, Context, Evidence, Hypothesis |
| Strategy | 10 | Strategy, Positioning, Moat, BusinessModel |
| Roadmap | 11 | Roadmap, Tracks, OKRs, KRs, Assumptions, KeyResultValueModelTarget |
| Value Model | 12 | ValueModel, Layer, Component, SubComponent, TrackMaturity, LayerMaturity, ComponentMaturity, SubComponentMaturity, MaturityEvidence, MilestoneCriteria, LayerSolutionStep |
| Feature | 12 | Feature, Capabilities, Personas, Scenarios |
| Track Definitions | 4 | TrackDefinition, StrategyDefinition, OrgOpsDefinition, CommercialDefinition |
| Portfolio | 8 | Portfolio, ProductLines, Brands, Offerings |
| Assessment | 8 | Reports, Outcomes, Learnings, Validation |
| Calibration | 6 | Memo, Learnings, Focus, NextSteps |
| Mappings | 2 | Mapping, Artifact |

**Total Distinct Entities: ~87** (includes 11 VMM entities from v2.5.0, 4 track definition entities from v2.6.0)

### New Entities in v2.6.0 (Canonical Track Definitions)

| Entity | Purpose | Canonical Count |
|--------|---------|-----------------|
| StrategyDefinition (sd-*) | Reusable strategy process definitions | 39 |
| OrgOpsDefinition (pd-*) | Reusable operations process definitions | 54 |
| CommercialDefinition (cd-*) | Reusable commercial process definitions | 38 |
| StrategyDefinitionMaturityTier | Tier 1/2/3 maturity levels | N per definition |

**Total Canonical Definitions: 131** (Strategy 39 + OrgOps 54 + Commercial 38)

### New Entities in v2.5.0 (Value Model Maturity)

| Entity | Purpose | Linked To |
|--------|---------|----------|
| ValueModelTrackMaturity | Track-level maturity | ValueModel (1:1) |
| TrackMaturityMilestoneCriteria | Next milestone evidence | TrackMaturity (1:N) |
| LayerSolutionStep | L1 implementation steps | Layer (1:N) |
| LayerMaturitySummary | L1 maturity calculation | Layer (1:1) |
| ComponentMaturitySummary | L2 maturity calculation | Component (1:1) |
| SubComponentMaturity | L3 maturity assessment | SubComponent (1:1) |
| SubComponentMaturityEvidence | Evidence for L3 maturity | SubComponentMaturity (1:N) |
| KeyResultValueModelTarget | KR → VMM link | KeyResult (1:1) |
| PortfolioMaturitySummary | Executive maturity view | Organization (1:N) |
| MaturityTheme | Cross-portfolio patterns | Organization (1:N) |

### Key N:M Relationships

| Relationship | Join Table | Notes |
|--------------|------------|-------|
| Feature ↔ ValueModel | FeatureValueModelLink | Via path strings |
| Feature ↔ Track | FeatureTrackLink | 4 possible tracks |
| Feature ↔ Assumption | FeatureAssumptionLink | Tests assumptions |
| Assumption ↔ KeyResult | AssumptionKRLink | Links KRs to assumptions |
| Brand ↔ ProductLine | BrandProductLineLink | Broad branding |
| Brand ↔ Component | BrandComponentLink | Ingredient branding |
| Feature ↔ Feature | FeatureDependency | Self-referential |
| Value ↔ Value | ValueConflict | Conflict resolution |
| KeyResult → ValueModelPath | KeyResultValueModelTarget | NEW: KR maturity advancement |

### Key 1:1 and 1:N Relationships for VMM (NEW in v2.5.0)

| Parent Entity | Child Entity | Cardinality | Notes |
|---------------|--------------|-------------|-------|
| ValueModel | ValueModelTrackMaturity | 1:1 | Track-level maturity |
| TrackMaturity | TrackMaturityMilestoneCriteria | 1:N | Evidence for next milestone |
| Layer | LayerSolutionStep | 1:N | Implementation steps |
| Layer | LayerMaturitySummary | 1:1 | Calculated from L2 |
| Component | ComponentMaturitySummary | 1:1 | Calculated from L3 |
| SubComponent | SubComponentMaturity | 1:1 | Primary maturity assessment |
| SubComponentMaturity | SubComponentMaturityEvidence | 1:N | Evidence records |
| Organization | PortfolioMaturitySummary | 1:N | One per product line |
| Organization | MaturityTheme | 1:N | Cross-portfolio patterns |

### Key Relationships for Track Definitions (NEW in v2.6.0)

| Parent Entity | Child Entity | Cardinality | Notes |
|---------------|--------------|-------------|-------|
| Organization | TrackDefinition | 1:N | Custom definitions (null org_id = canonical) |
| TrackDefinition | MaturityTier | 1:N | Tier 1/2/3 per definition |
| TrackDefinition | ValueModel | N:M | Via contributes_to paths |

---

*Document updated for EPF v2.6.0 (Canonical Track Definitions, Commercial/OrgOps separation). Generated for implementation planning. Ready for coding agent handoff.*
