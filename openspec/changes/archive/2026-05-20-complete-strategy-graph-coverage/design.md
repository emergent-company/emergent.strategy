## Context

The EPF semantic engine decomposes EPF YAML artifacts into a Memory graph, but currently covers only a fraction of the strategic content. The decomposer handles product features thoroughly but misses most of the insight, strategy, and foundation artifacts that form the strategic backbone. Non-product track definitions (strategy, org_ops, commercial) have zero coverage.

This creates a fundamentally incomplete graph where propagation circuits can't trace how market changes affect positioning, which affects feature priorities, which affects team processes, which affects go-to-market. The braided cross-track nature of EPF is lost in the graph.

### Stakeholders

- Strategic managers (complete cross-track visibility)
- AI agents (full strategy context for decisions)
- Propagation circuit (complete cascade paths across all 4 tracks)

## Goals / Non-Goals

### Goals

- Every section of every READY artifact is decomposed into typed graph objects
- Non-product track definitions are decomposed with their unique properties
- Cross-artifact relationships connect insights → strategy → execution → assessment
- Propagation cascades can trace from any tier 1 change to tier 7 implications across all 4 tracks
- New object types follow existing patterns (inertia tier, source_artifact, section_path)

### Non-Goals

- Changing the YAML schema or artifact structure (decompose what exists)
- Populating non-product track definitions in the emergent instance (separate content task)
- AIM artifact decomposition (assessment reports, calibration memos — future work)
- Semantic-only relationships (remain in `semantic-edges`)

## Decisions

### Decision 1: Granular types over generic containers

**Rationale:** `Competitor`, `WhiteSpace`, `Strength` are more useful as separate graph types than a generic `InsightEntry` with a `type` field. Separate types enable:
- Type-specific queries (`epf_graph_list type=Competitor`)
- Type-specific propagation rules (Threats have different cascade behavior than Strengths)
- Clear UIs where each type gets its own icon, color, and category

**Trade-off:** More types means more code. But each type is ~15 lines in schema.go and ~20 lines in the decomposer.

### Decision 2: SWOT entries are 4 separate types, not one `SWOTEntry`

**Rationale:** Strengths, Weaknesses, Opportunities, and Threats have different fields and different strategic implications:
- Strengths: `{evidence, strategic_value}` — used by `leverages` edges
- Weaknesses: `{impact, mitigation}` — internal risks to address
- Opportunities: `{how_to_exploit, priority}` — overlap with insight_opportunity
- Threats: `{likelihood, mitigation}` — external risks, used by `mitigates` edges

Collapsing them into one type loses these distinctions.

### Decision 3: `TrackDefinition` as a unified type for all 3 non-product tracks

**Rationale:** Strategy, OrgOps, and Commercial definitions share 80% of their structure (base schema). Track-specific fields (compliance, revenue_impact, decision_frameworks) are stored as properties. A single `TrackDefinition` type with a `track` property is cleaner than 3 separate types.

### Decision 4: Cross-artifact relationships are structurally inferred, not semantic

**Rationale:** Relationships like `competes_with` (Positioning mentions competitor by name), `targets_segment` (Feature serves segment), and `requires_process` (Feature references process ID) can be deterministically inferred from text matching and ID references in the YAML. No embedding similarity needed.

### Decision 5: Phase the implementation — READY artifacts first, FIRE definitions second

**Rationale:** All READY artifact data exists today in the emergent instance. Non-product track definitions exist in canonical-epf but not in the emergent instance yet. Doing READY first delivers immediate value; FIRE definitions can be added when instances start using them.

## Risks / Trade-offs

- **Schema reconciliation scope:** Adding 14 object types means the auto-reconciliation from v0.32.0 will install a larger schema. The reconciliation is additive-only so no breakage risk.
- **Graph size:** ~60% more objects and relationships. The Memory API and propagation circuit handle this fine (tested with 958 objects).
- **Decomposer complexity:** decompose.go grows significantly. Mitigated by putting new extraction in decompose_extra.go and using consistent patterns.
- **Over-granularity risk:** 14 new types might be too many. However, they map 1:1 to distinct EPF concepts that already have different YAML schemas, so the granularity is justified.
