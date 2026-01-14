# Generalizing Feature Definitions to All Tracks

**Date:** 2026-01-11  
**Context:** Extending the product feature definition pattern to Strategy, OrgOps, and Commercial tracks

---

## Current State Analysis

### The Product Pattern (Well-Established)

```
Product Value Model                    Feature Definition
├── L1 Layers (Themes)                 ├── strategic_context.contributes_to[]
├── L2 Components (Groupings)    ←→    │   (paths like "Product.Operate.Monitoring")
└── L3 Sub-components (Features)       ├── definition.capabilities[]
                                       ├── definition.personas[]
                                       ├── implementation.scenarios[]
                                       └── implementation.contexts[]
```

**What feature definitions capture for Product:**
1. **WHY** (Job-to-be-done, value propositions, personas)
2. **WHAT** (Capabilities - discrete units of value)
3. **HOW it feels** (Scenarios, contexts, design guidance)
4. **WHERE it connects** (strategic_context.contributes_to → Value Model paths)

**What feature definitions do NOT capture:**
- Technical implementation details (APIs, database schemas)
- Actual code or executable procedures
- DevOps/infrastructure concerns

### The Gap in Other Tracks

Current value models for Strategy, OrgOps, and Commercial have:
- L1/L2/L3 hierarchy ✓
- activation status ✓
- maturity tracking ✓

But they **lack the equivalent of feature definitions** - structured descriptions of HOW value is generated.

---

## Conceptual Framework: "Value Generation Procedures"

### Insight: Feature Definitions Are Procedure Descriptions

A feature definition describes **how a portion of value is generated** - it's a "procedure" that:
- Has inputs (user context, data, triggers)
- Has actors (personas who execute/benefit)
- Has steps (scenarios showing flow)
- Has outputs (value delivered, outcomes)

But it's NOT:
- The detailed procedure (that's implementation spec)
- The executable procedure (that's code)

### Applying This to Other Tracks

| Track | Value Model Describes | "Procedure" Would Describe | Analog Name |
|-------|----------------------|---------------------------|-------------|
| **Product** | What capabilities we build | How users accomplish outcomes | Feature Definition |
| **Strategy** | Strategic positions/moves | How strategic outcomes are achieved | **Initiative Definition**? |
| **OrgOps** | Operational capabilities | How operational outcomes are delivered | **Process Definition**? |
| **Commercial** | Revenue/partnership motions | How commercial outcomes happen | **Motion Definition**? |

---

## Option 1: Track-Specific Definitions (Different Schemas)

Create separate schemas tailored to each track's nature:

### Strategy: "Initiative Definition" 
Focus on strategic moves, experiments, positioning

```yaml
# initiative_definition_schema.json
id: "init-001"
name: "Enterprise Market Expansion"
strategic_context:
  contributes_to: ["Strategy.MarketExpansion.EnterpriseGTM"]
definition:
  strategic_hypothesis: "When we [do X], we believe [outcome Y] because [evidence Z]"
  stakeholders:  # Instead of personas
    - id: "exec-sponsor"
      role: "Executive Sponsor"
      accountability: "Budget approval, strategic alignment"
    - id: "execution-lead"
      role: "Execution Lead"
      accountability: "Delivery, progress reporting"
  success_criteria:
    - metric: "Enterprise pipeline value"
      target: "$5M in 6 months"
  risks_and_mitigations: [...]
execution:
  phases:
    - name: "Discovery"
      outcomes: ["ICP validated", "3 pilot customers identified"]
    - name: "Pilot"
      outcomes: ["2 closed deals", "Sales playbook drafted"]
```

### OrgOps: "Process Definition"
Focus on operational procedures, capabilities, efficiency

```yaml
# process_definition_schema.json
id: "proc-001"  
name: "Engineering Onboarding Excellence"
strategic_context:
  contributes_to: ["OrgOps.TalentManagement.Onboarding"]
definition:
  operational_objective: "When [new engineers join], they [reach productivity] within [30 days]"
  process_owners:  # Instead of personas
    - role: "HR Lead"
      responsibility: "Administrative onboarding"
    - role: "Engineering Manager"
      responsibility: "Technical ramp-up"
    - role: "Buddy"
      responsibility: "Cultural integration"
  current_state:
    time_to_productivity: "60 days average"
    pain_points: [...]
  target_state:
    time_to_productivity: "30 days"
    enablers: [...]
execution:
  stages:  # Process stages
    - stage: "Pre-boarding"
      activities: ["Equipment order", "Account setup", "Buddy assignment"]
    - stage: "Week 1"
      activities: ["Orientation", "Codebase tour", "First commit"]
```

### Commercial: "Motion Definition"
Focus on revenue motions, sales plays, partnership activities

```yaml
# motion_definition_schema.json
id: "motion-001"
name: "Product-Led Growth Flywheel"
strategic_context:
  contributes_to: ["Commercial.RevenueGeneration.ProductLedGrowth"]
definition:
  commercial_hypothesis: "When [users experience core value], they [convert to paid] at [X rate]"
  motion_actors:  # Instead of personas
    - role: "Free User"
      journey: "Discovers → Activates → Converts"
    - role: "Growth PM"
      accountability: "Funnel optimization"
    - role: "Sales (inbound)"
      accountability: "High-intent conversion"
  funnel_stages:
    - stage: "Acquisition"
      metrics: ["Signups/month", "CAC"]
    - stage: "Activation"
      metrics: ["Day 1 retention", "Core action completion"]
    - stage: "Conversion"
      metrics: ["Trial→Paid %", "Time to convert"]
execution:
  experiments: [...]
  playbooks: [...]
```

---

## Option 2: Generalized "Value Generation Definition" (Single Schema)

Create ONE schema that works across all tracks with track-specific extensions:

```yaml
# value_generation_definition_schema.json
id: "vgd-001"
name: "..."
track: "product|strategy|org_ops|commercial"  # NEW: declares which track

strategic_context:
  contributes_to: ["Track.L2.L3"]  # Works for any track
  tracks: ["product"]  # Can contribute to multiple

definition:
  value_hypothesis: "When [context], [actor] can [action], resulting in [outcome]"
  
  # Generic "who's involved" - replaces track-specific terminology
  actors:
    - id: "..."
      type: "beneficiary|executor|sponsor|owner"  # Generalized roles
      description: "..."
      
  # Generic capabilities/outcomes
  value_units:  # Replaces "capabilities"
    - id: "vu-001"
      name: "..."
      description: "..."
      
  # Track-specific extensions (only relevant fields appear)
  track_specific:
    # Product-specific (if track == product)
    personas: [...]  # Rich user narratives
    architecture_patterns: [...]
    
    # Strategy-specific (if track == strategy)
    strategic_hypothesis: "..."
    success_criteria: [...]
    risks: [...]
    
    # OrgOps-specific (if track == org_ops)
    process_stages: [...]
    current_state: {...}
    target_state: {...}
    
    # Commercial-specific (if track == commercial)
    funnel_metrics: [...]
    revenue_impact: {...}

execution:
  # Generalized scenarios - works for any track
  scenarios:
    - id: "scn-001"
      actor: "..."
      context: "..."
      trigger: "..."
      action: "..."
      outcome: "..."
```

---

## Recommendation: Hybrid Approach

**Core insight:** The STRUCTURE is generalizable, but the VOCABULARY and FOCUS differ by track.

### Proposed Architecture

1. **Base Schema** (`value_generation_base_schema.json`)
   - Common fields: id, name, slug, status, strategic_context
   - Common patterns: actors, value_units, scenarios
   - Extension point: `track_extensions`

2. **Track Extension Schemas** (referenced by base)
   - `product_extensions_schema.json` - personas, architecture, design_guidance
   - `strategy_extensions_schema.json` - hypothesis, success_criteria, risks
   - `org_ops_extensions_schema.json` - process_stages, SLAs, ownership
   - `commercial_extensions_schema.json` - funnel, revenue, playbooks

3. **Composite Schemas** (what validators use)
   - `feature_definition_schema.json` - base + product_extensions (KEEP existing)
   - `initiative_definition_schema.json` - base + strategy_extensions (NEW)
   - `process_definition_schema.json` - base + org_ops_extensions (NEW)
   - `motion_definition_schema.json` - base + commercial_extensions (NEW)

### Benefits
- **Preserves** existing feature_definition_schema (no breaking change)
- **Extracts** reusable patterns into base schema
- **Enables** track-specific validation and guidance
- **Maintains** appropriate vocabulary per track

---

## Key Questions to Resolve

1. **Naming Convention**: Keep "feature" for all tracks, or use track-specific terms?
   - "Feature" implies product functionality
   - "Initiative/Process/Motion" are more domain-appropriate
   - But training users on 4 different concepts has overhead

2. **Granularity Alignment**: Should Strategy/OrgOps/Commercial definitions match L3 granularity?
   - Product: 1 feature definition ≈ 1-3 L3 sub-components
   - Strategy: 1 initiative definition ≈ 1 strategic objective?
   - OrgOps: 1 process definition ≈ 1 major operational process?

3. **Instance Structure**: Where do these live?
   - Current: `_instances/{product}/FIRE/feature_definitions/`
   - Proposed: `_instances/{product}/FIRE/{track}_definitions/`
   - Or: `_instances/{product}/FIRE/definitions/{track}/`

4. **Validation Scripts**: Extend existing or create new?
   - `validate-feature-quality.sh` → `validate-definition-quality.sh`?

---

## Next Steps

1. **Decide on naming**: Feature vs track-specific terminology
2. **Draft base schema**: Extract common patterns from current feature_definition_schema
3. **Draft one extension**: Start with Strategy (most different from Product)
4. **Prototype wizard**: Create initiative_definition.wizard.md
5. **Update validation**: Extend or create parallel validators
6. **Update docs**: Integration spec, guides, README

---

## Questions for Discussion

1. Is the "procedure that generates value but isn't the detailed procedure" framing correct?

2. Should we keep the current feature_definition_schema.json unchanged and add parallel schemas, or refactor into base + extensions?

3. What's the right granularity for Strategy/OrgOps/Commercial definitions?
