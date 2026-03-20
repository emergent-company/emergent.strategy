# Change: Complete strategy graph coverage across all 4 EPF tracks

## Why

EPF is a braided holistic strategy framework where strategy propagates across 4 tracks (Product, Strategy, OrgOps, Commercial) that mutually influence each other. But the decomposer only graphs a fraction of this:

- **Insight analyses** — 2 of 18 sections decomposed (trends + target_users). Missing: competitive landscape, SWOT, market structure, white spaces, hypotheses, validation status, strategic tensions, opportunity convergence
- **Strategy formula** — only positioning/moat decomposed. Missing: ecosystem differentiation, value creation, business model, constraints, trade-offs, risks, success metrics
- **Strategy foundations** — not decomposed at all. Missing: product vision, value proposition, strategic sequencing, information architecture
- **Insight opportunity** — not decomposed at all. Missing: opportunity with context, evidence, value hypothesis
- **Non-product track definitions** — zero decomposition code for strategy/org_ops/commercial definitions (131 canonical definitions exist)
- **Mappings** — `FIRE/mappings.yaml` (code-to-value-model traceability) is not decomposed at all, losing the strategy ↔ implementation bridge
- **Value models** — already decomposed for all 4 tracks (confirmed working)
- **Roadmap** — already decomposed for all 4 tracks (confirmed working)

This means the strategy graph is fundamentally incomplete. Propagation circuits can't trace how a market change (insight) affects positioning (strategy formula), which affects which features to prioritize (product), which affects team processes (org_ops), which affects go-to-market (commercial). The braided cross-track nature of EPF is lost.

### Evidence from production

The emergent instance has:
- `01_insight_analyses.yaml` — 667 lines with 18 sections, but only trends/personas reach the graph
- `02_strategy_foundations.yaml` — 308 lines, none in the graph
- `03_insight_opportunity.yaml` — 115 lines, none in the graph
- `04_strategy_formula.yaml` — 557 lines, only 2 of 8 sections in the graph
- 4 non-product value models (strategy, org_ops, commercial) — already decomposed
- Roadmap OKRs across all 4 tracks — already decomposed
- 0 non-product track definitions — schemas exist, instances don't yet

## What Changes

### Phase 1: Complete READY artifact decomposition

Expand the decomposer to extract all sections from existing READY artifacts:

**Insight analyses (16 new sections):**
- `Competitor` objects from `competitive_landscape.direct_competitors[]` and `strategy_tools[]`
- `MarketSegment` objects from `market_structure.segments[]`
- `WhiteSpace` objects from `white_spaces[]`
- `Strength`, `Weakness`, `Opportunity`, `Threat` objects from SWOT sections
- `Hypothesis` objects from `problem_solution_hypotheses[]` and `validation_status[]`
- `KeyInsight` objects from `key_insights[]`
- `MarketDynamic` objects from `market_dynamics[]`

**Strategy foundations (4 new sections):**
- `ProductVision` from `strategy_foundations.product_vision`
- `ValueProposition` from `strategy_foundations.value_proposition`
- `StrategicPhase` objects from `strategy_foundations.strategic_sequencing.phases[]`
- `DesignPrinciple` objects from `strategy_foundations.information_architecture.design_principles[]`

**Insight opportunity:**
- `Opportunity` from `opportunity` (reuse existing type with additional properties)

**Strategy formula (6 new sections):**
- `EcosystemComponent` from `strategy.ecosystem_differentiation.ecosystem_components[]`
- `ValueDriver` from `strategy.value_creation.value_drivers[]`
- `PricingTier` from `strategy.business_model.pricing_tiers[]`
- `StrategicConstraint` from `strategy.constraints[]`
- `TradeOff` from `strategy.trade_offs[]`
- `StrategicRisk` from `strategy.risks[]`

### Phase 1d: Mappings decomposition

Decompose `FIRE/mappings.yaml` to connect the value model to implementation artifacts:

- Create `MappingArtifact` objects from each artifact entry (type, url, description)
- Create `implements` edges from MappingArtifact to ValueModelComponent
- This bridges the strategy graph to external code, completing the strategy ↔ implementation traceability that EPF provides

### Phase 2: Non-product track definition decomposition (FIRE phase completion)

Add a `decomposeTrackDefinitions()` function that handles strategy (`sd-*`), org_ops (`pd-*`), and commercial (`cd-*`) definitions:

- Create `TrackDefinition` objects with shared base fields (purpose, outcome, owner, steps, cadence)
- Create `PractitionerScenario` objects from `practitioner_scenarios[]`
- Create `contributes_to` edges to value model components
- Create `related_definitions` edges between definitions (requires/enables/follows)
- Track-specific properties: compliance (org_ops), revenue_impact (commercial), decision_frameworks (strategy)

### Phase 3: Cross-artifact relationship inference

Add new structural relationship types that connect insights to strategy to execution:

- `competes_with` — Positioning → Competitor
- `addresses_white_space` — Feature → WhiteSpace
- `mitigates` — Feature/Capability → Threat/StrategicRisk
- `leverages` — Feature → Strength
- `targets_segment` — Feature → MarketSegment
- `validates_hypothesis` — Capability → Hypothesis
- `informs_sequencing` — StrategicPhase → OKR (which phase drives which cycle OKRs)
- `requires_process` — Feature → TrackDefinition (product needs org_ops/commercial processes)

### New graph object types (14)

| Type | Source | Inertia Tier |
|------|--------|-------------|
| `Competitor` | insight_analyses.competitive_landscape | 2 |
| `MarketSegment` | insight_analyses.market_structure | 2 |
| `WhiteSpace` | insight_analyses.white_spaces | 2 |
| `Strength` | insight_analyses.strengths (SWOT) | 2 |
| `Weakness` | insight_analyses.weaknesses (SWOT) | 2 |
| `Threat` | insight_analyses.threats (SWOT) | 2 |
| `Hypothesis` | insight_analyses.hypotheses + validation | 3 |
| `KeyInsight` | insight_analyses.key_insights | 2 |
| `ValueProposition` | strategy_foundations.value_proposition | 3 |
| `StrategicPhase` | strategy_foundations.strategic_sequencing | 3 |
| `ValueDriver` | strategy_formula.value_creation | 3 |
| `StrategicRisk` | strategy_formula.risks | 3 |
| `TrackDefinition` | FIRE/definitions/strategy\|org_ops\|commercial | 5 |
| `PractitionerScenario` | track_definition.practitioner_scenarios | 6 |

### New structural relationship types (8)

| Type | From → To | Inference |
|------|-----------|-----------|
| `competes_with` | Positioning → Competitor | Competitor name mentioned in positioning |
| `addresses_white_space` | Feature → WhiteSpace | Feature JTBD overlaps with white space gap |
| `mitigates` | Feature → Threat/StrategicRisk | Feature capabilities address threat |
| `leverages` | Feature → Strength | Feature capitalizes on organizational strength |
| `targets_segment` | Feature → MarketSegment | Feature serves segment's unmet needs |
| `validates_hypothesis` | Capability → Hypothesis | Proven capability validates hypothesis |
| `requires_process` | Feature → TrackDefinition | Product feature requires org_ops/commercial process |
| `related_definition` | TrackDefinition → TrackDefinition | Explicit related_definitions[] references |

## Impact

- Affected specs: `epf-semantic-engine`
- Affected code: `apps/epf-cli/internal/decompose/`
- Graph impact per instance: ~950 → ~1500+ objects, ~2400 → ~4000+ relationships
- Cascade depth: Market insight → Competitive position → Feature priority → Process design → Commercial execution
- Complete braided strategy propagation across all 4 tracks

## Phasing

| Phase | Scope | Priority |
|-------|-------|----------|
| Phase 1a | Insight analyses expansion (16 sections) | High — data exists today |
| Phase 1b | Strategy formula expansion (6 sections) | High — data exists today |
| Phase 1c | Strategy foundations + insight opportunity | High — data exists today |
| Phase 2 | Non-product track definition decomposition | Medium — needs instance content |
| Phase 3 | Cross-artifact relationship inference | Medium — depends on Phase 1 |

## References

- EPF White Paper: "Every claim requires evidence. Opinions are fine in discussions, but once codified in strategy, assertions must be grounded."
- Integration specification: 4-level information architecture with cross-track strategy propagation
