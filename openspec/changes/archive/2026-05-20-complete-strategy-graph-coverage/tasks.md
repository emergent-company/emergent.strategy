## Phase 1a: Insight Analyses Expansion (16 new sections)

- [ ] 1.1 Add `Competitor` type to schema.go
- [ ] 1.2 Add `MarketSegment` type to schema.go
- [ ] 1.3 Add `WhiteSpace` type to schema.go
- [ ] 1.4 Add `Strength`, `Weakness`, `Opportunity`, `Threat` types to schema.go
- [ ] 1.5 Add `Hypothesis` type to schema.go
- [ ] 1.6 Add `KeyInsight` type to schema.go
- [ ] 1.7 Expand `rawInsightAnalyses` struct to include all 18 sections
- [ ] 1.8 Add `decomposeCompetitiveLandscape()` — Competitor objects from direct_competitors, strategy_tools, indirect_competitors
- [ ] 1.9 Add `decomposeMarketStructure()` — MarketSegment objects from segments[]
- [ ] 1.10 Add `decomposeWhiteSpaces()` — WhiteSpace objects from white_spaces[]
- [ ] 1.11 Add `decomposeSWOT()` — Strength, Weakness, Opportunity, Threat objects
- [ ] 1.12 Add `decomposeHypotheses()` — Hypothesis objects from hypotheses[] and validation_status[]
- [ ] 1.13 Add `decomposeKeyInsights()` — KeyInsight objects from key_insights[]
- [ ] 1.14 Add `decomposeMarketDynamics()` — market dynamics as Trend-tier objects
- [ ] 1.15 Add `decomposeStrategicImplications()` — captured as properties on KeyInsight objects
- [ ] 1.16 Update `validEPFObjectTypes` in MCP tools
- [ ] 1.17 Write tests for each new extraction function
- [ ] 1.18 Test on emergent instance — verify all 18 sections produce objects

## Phase 1b: Strategy Formula Expansion (6 sections)

- [ ] 2.1 Add `ValueDriver` type to schema.go
- [ ] 2.2 Add `StrategicRisk` type to schema.go
- [ ] 2.3 Expand `rawStrategyFormula` struct for remaining sections
- [ ] 2.4 Add `decomposeEcosystemDifferentiation()` — ecosystem components as strategy-tier objects
- [ ] 2.5 Add `decomposeValueCreation()` — ValueDriver objects from value_drivers[]
- [ ] 2.6 Add `decomposeBusinessModel()` — pricing and economics as strategy-tier object
- [ ] 2.7 Add `decomposeConstraintsTradeoffs()` — constraint/trade-off objects
- [ ] 2.8 Add `decomposeStrategicRisks()` — StrategicRisk objects from risks[]
- [ ] 2.9 Add `decomposeSuccessMetrics()` — north star and supporting metrics
- [ ] 2.10 Write tests for each new extraction function

## Phase 1c: Strategy Foundations + Insight Opportunity

- [ ] 3.1 Add `ValueProposition` type to schema.go
- [ ] 3.2 Add `StrategicPhase` type to schema.go
- [ ] 3.3 Add `Opportunity` type to schema.go (distinct from SWOT opportunity)
- [ ] 3.4 Add `rawStrategyFoundations` struct for full YAML structure
- [ ] 3.5 Add `decomposeStrategyFoundations()` — vision, value prop, sequencing, IA
- [ ] 3.6 Add `decomposeInsightOpportunity()` — opportunity with evidence and value hypothesis
- [ ] 3.7 Create `follows` edges between sequential StrategicPhase objects
- [ ] 3.8 Write tests for each new extraction function
- [ ] 3.9 Test on emergent instance — verify strategy foundations and opportunity produce objects

## Phase 1d: Mappings Decomposition

- [ ] 3.10 Add `MappingArtifact` type to schema.go (code, test, documentation, design artifacts linked to value model)
- [ ] 3.11 Add `rawMappings` struct for `FIRE/mappings.yaml` YAML structure
- [ ] 3.12 Add `decomposeMappings()` — scan per-track mapping entries
- [ ] 3.13 Create `implements` edges from MappingArtifact to ValueModelComponent
- [ ] 3.14 Create `contains` edges from Artifact node to each MappingArtifact
- [ ] 3.15 Write tests for mappings decomposition

## Phase 2: Non-Product Track Definitions (FIRE Phase Completion)

- [ ] 4.1 Add `TrackDefinition` type to schema.go
- [ ] 4.2 Add `PractitionerScenario` type to schema.go
- [ ] 4.3 Add `rawTrackDefinition` struct covering base + strategy/org_ops/commercial fields
- [ ] 4.4 Add `decomposeTrackDefinitions()` — scan FIRE/definitions/strategy|org_ops|commercial
- [ ] 4.5 Create `contributes_to` edges to value model components
- [ ] 4.6 Create `related_definition` edges from related_definitions[] entries
- [ ] 4.7 Extract `PractitionerScenario` objects with contains edges
- [ ] 4.8 Handle track-specific fields: compliance (org_ops), revenue_impact (commercial), decision_frameworks (strategy)
- [ ] 4.9 Write tests with fixture files for each track type
- [ ] 4.10 Handle empty/missing definition directories gracefully

## Phase 3: Cross-Artifact Relationships

- [ ] 5.1 Add `competes_with` relationship type to schema.go
- [ ] 5.2 Add `addresses_white_space` relationship type to schema.go
- [ ] 5.3 Add `mitigates` relationship type to schema.go
- [ ] 5.4 Add `leverages` relationship type to schema.go
- [ ] 5.5 Add `targets_segment` relationship type to schema.go
- [ ] 5.6 Add `validates_hypothesis` relationship type to schema.go
- [ ] 5.7 Add `requires_process` relationship type to schema.go
- [ ] 5.8 Add `related_definition` relationship type to schema.go
- [ ] 5.9 Implement `addCompetesWithEdges()` — match competitor names in positioning text
- [ ] 5.10 Implement `addMitigatesEdges()` — match feature capabilities to threats/risks
- [ ] 5.11 Implement `addValidatesHypothesisEdges()` — proven capabilities → hypotheses
- [ ] 5.12 Implement `addRequiresProcessEdges()` — feature references to process IDs
- [ ] 5.13 Write tests for each cross-artifact relationship
- [ ] 5.14 Verify cross-track cascade path: Belief → ... → Capability across 4 tracks

## Phase 4: Integration

- [ ] 6.1 Update MCP `validEPFObjectTypes` with all new types
- [ ] 6.2 Update `GenerateTemplatePack()` to include new types for reconciliation
- [ ] 6.3 Run full `go test ./...` — verify no regressions
- [ ] 6.4 Test `epf-cli ingest` on emergent instance — verify object/relationship count increase
- [ ] 6.5 Run `epf_quality_audit` — verify new objects appear in quality checks
- [ ] 6.6 Update AGENTS.md with complete type and relationship counts
- [ ] 6.7 Update decomposer header comment with expanded coverage
