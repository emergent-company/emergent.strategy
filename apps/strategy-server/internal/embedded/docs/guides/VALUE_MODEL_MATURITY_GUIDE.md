# Value Model Maturity (VMM) Guide

> **EPF Version**: 2.5.0+  
> **Last Updated**: 2026-01-11  
> **Status**: Active

---

## What is Value Model Maturity?

**Value Model Maturity (VMM)** is a system for tracking where each Value Model component is on its journey from hypothetical to scaled value delivery. VMM answers the question: "How proven is the value we're claiming to deliver?"

Unlike traditional product lifecycle models that focus on market adoption, VMM tracks **value delivery maturity** across all four EPF tracks:

| Track | What VMM Tracks | Value Domain Example |
|-------|-----------------|---------------------|
| **Product** | Are our features actually delivering value to users? | Target market, user segments |
| **Strategy** | Is our strategic positioning resonating in the market? | Competitive landscape, thought leadership |
| **OrgOps** | Are our processes and culture enabling the team? | Organizational context, team capabilities |
| **Commercial** | Is our business model sustainable? | Customer base, unit economics |

---

## Core Concepts

### Maturity Stages

VMM uses four maturity stages that apply universally across all tracks:

| Stage | Description | Key Question | Evidence Required |
|-------|-------------|--------------|-------------------|
| **Hypothetical** | We believe this delivers value, but have no evidence | "Will this work?" | None (starting state) |
| **Emerging** | Early signals of value (pilot users, initial metrics trending positive) | "Is this starting to work?" | Initial adoption, positive feedback |
| **Proven** | Consistent value delivery to target recipients | "Does this reliably work?" | Retention, satisfaction, measurable outcomes |
| **Scaled** | Sustainable value delivery at scale | "Does this work at scale?" | Unit economics, scalable delivery, repeatability |

### Maturity Milestones

VMM uses generalized milestone names that work across all tracks (not just Product-Market Fit):

| Milestone | Description | Stage Transition |
|-----------|-------------|------------------|
| **Problem-Approach Fit** | Our approach addresses a real problem in this domain | Hypothetical → Emerging |
| **Value-Recipient Fit** | Recipients actually receive and value what we deliver | Emerging → Proven |
| **Sustainable-Domain Fit** | We can sustain value delivery in our operating domain | Proven → Scaled |

### The Zero Line: Hypothetical vs Actual Value

A critical concept in VMM is the **zero line** - the threshold where value transitions from hypothetical (promised) to actual (delivered):

```
                 SCALED ──────────────── 📈 Growth
                    │
                 PROVEN ──────────────── ✅ Sustainable-Domain Fit
                    │
                EMERGING ─────────────── ✅ Value-Recipient Fit  
                    │
═══════════════════ ZERO LINE ═══════════════════
                    │
              HYPOTHETICAL ───────────── ❓ Unvalidated
```

**Above the zero line**: Value is being delivered and measured  
**Below the zero line**: Value is promised but not yet validated

The transition from Hypothetical to Emerging represents crossing the zero line - this is when you achieve **Problem-Approach Fit**.

---

## How VMM Works: Bidirectional Emergence

VMM uses a **bottom-up evidence model** with **top-down strategic guidance**:

### Bottom-Up: Evidence Emerges Upward

```
Track Level    ←── Calculated from L1 layers (80% rule)
    ↑
L1 Layers      ←── Calculated from L2 components (80% rule)  
    ↑
L2 Components  ←── Calculated from L3 sub-components (80% rule)
    ↑
L3 Sub-components  ←── ASSESSED HERE (with evidence)
```

**The 80% Rule**: A parent element achieves a maturity stage when 80%+ of its children are at that stage. This prevents claiming "proven" when most components are still hypothetical.

### Top-Down: Strategy Informs Focus

While maturity EMERGES from bottom-up evidence, strategy INFORMS where to focus:

- **North Star**: Defines purpose, vision, and strategic beliefs
- **Roadmap**: Sets KRs that target specific Value Model components
- **VMM**: Shows which components are mature vs need attention

---

## VMM Structure in Value Models

### Track Level (Top)

```yaml
track_maturity:
  overall_stage: "emerging"      # Calculated from L1 distribution
  stage_override: false          # True if manually set
  value_domain: "Target market"  # Where maturity is assessed
  current_milestone: "problem_approach_fit"
  next_milestone_criteria:
    - description: "Achieve 60% feature adoption across active users"
      status: "in_progress"
    - description: "Reduce churn to <5% monthly"
      status: "not_met"
  l1_distribution:
    hypothetical: 1
    emerging: 2
    proven: 1
    scaled: 0
```

### L1 Layer Level

```yaml
layers:
  - id: core-platform
    name: Core Platform
    maturity_summary:
      calculated_stage: "emerging"
      stage_override: false
      l2_distribution:
        hypothetical: 1
        emerging: 3
        proven: 1
        scaled: 0
```

### L2 Component Level

```yaml
components:
  - id: data-management
    name: Data Management
    maturity_summary:
      calculated_stage: "proven"
      stage_override: false
      l3_distribution:
        hypothetical: 0
        emerging: 1
        proven: 5
        scaled: 2
```

### L3 Sub-Component Level (Where Assessment Happens)

```yaml
sub_components:
  - id: csv-import
    name: CSV Import
    active: true
    uvp: "Import thousands of records in seconds"
    maturity:
      stage: "proven"
      stage_override: false
      evidence:
        - type: "usage_metric"
          description: "CSV Import used by 847 customers weekly, 99.2% success rate"
          date: "2026-01-10"
          source: "Analytics dashboard"
        - type: "customer_feedback"
          description: "Feature cited as 'essential' in 23 customer interviews"
          date: "2025-12-15"
          source: "User research"
      milestone_achieved: "value_recipient_fit"
      milestone_notes: "Crossed from emerging to proven after hitting 500+ weekly users with <1% error rate"
```

---

## Evidence Types

VMM supports multiple evidence types to capture different signals:

| Evidence Type | Description | Example |
|---------------|-------------|---------|
| `usage_metric` | Quantitative usage data | "1000 DAU, 5 min avg session" |
| `customer_feedback` | Qualitative user input | "Feature cited as essential in 23 interviews" |
| `retention_data` | User retention signals | "90-day retention 68% for users of this feature" |
| `nps_score` | Net Promoter Score data | "NPS 67 from enterprise customers" |
| `business_impact` | Business outcome data | "Reduced support tickets by 40%" |
| `revenue_data` | Revenue attribution | "Feature drives 30% of enterprise upsells" |
| `qualitative_observation` | Observed behavior | "Users complete workflow without documentation" |
| `experiment_result` | A/B test or experiment outcome | "Variant A converted 23% better" |

---

## VMM and TRL: Parallel Systems

VMM and TRL (Technology Readiness Level) are **parallel and independent** systems:

| Aspect | VMM | TRL |
|--------|-----|-----|
| **What it tracks** | Value delivery maturity | Innovation/learning maturity |
| **Where it lives** | Value Model (persistent) | Roadmap KRs (per-cycle) |
| **Granularity** | L3 sub-component level | Individual KR level |
| **Time horizon** | Cumulative across cycles | Single cycle progression |
| **Purpose** | "Is value being delivered?" | "Is learning advancing?" |

**They complement each other:**
- A KR might advance from TRL 3→5 (learning progress) while targeting a Value Model component that moves from Hypothetical→Emerging (value delivery proof)
- The KR's `value_model_target` field links roadmap execution to VMM

---

## VMM and Feature Maturity: The Capability View

**EPF v2.8.0** introduced an optional `feature_maturity` section in Feature Definitions that brings VMM visibility to the feature level.

### Why Feature Maturity?

While VMM operates at the Value Model L3 sub-component level, practitioners working with Feature Definitions often want to know:
- "Which capabilities within this feature are proven vs hypothetical?"
- "What KR execution advanced this capability's maturity?"
- "Is this feature ready for production scaling or still experimental?"

Feature Maturity provides this visibility **without duplicating** VMM—it uses the same 4-stage vocabulary but applies it at capability granularity within features.

### The Three Maturity Systems

| System | Where It Lives | Granularity | Updated By |
|--------|---------------|-------------|------------|
| **TRL (1-9)** | Roadmap KRs | Per KR, per cycle | Cycle execution |
| **VMM (4 stages)** | Value Model L3 | Sub-component level | Evidence accumulation |
| **Feature Maturity** | Feature Definition | Per capability | KR completion |

### How They Connect

```
┌─────────────────────────────────────────────────────────────────┐
│                    ROADMAP (Cycle N)                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ KR: "Validate graph query performance with 100 users"    │   │
│  │ TRL: 4 → 6 (within cycle)                                │   │
│  │ value_model_target: Product.Decide.Analysis              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
              │                             │
              │ advances                    │ advances
              ▼                             ▼
┌─────────────────────────────┐  ┌─────────────────────────────┐
│     FEATURE DEFINITION      │  │        VALUE MODEL          │
│  ┌───────────────────────┐  │  │  ┌───────────────────────┐  │
│  │ capability: cap-001   │  │  │  │ L3: Analysis          │  │
│  │ stage: emerging       │  │  │  │ stage: emerging       │  │
│  │ delivered_by_kr: kr-p │  │  │  │ evidence: [100 user   │  │
│  └───────────────────────┘  │  │  │           validation] │  │
│  feature_maturity:          │  │  └───────────────────────┘  │
│  overall_stage: emerging    │  │                             │
└─────────────────────────────┘  └─────────────────────────────┘
```

### Feature Maturity Structure

```yaml
feature_maturity:
  overall_stage: "emerging"  # hypothetical | emerging | proven | scaled
  capability_maturity:
    - capability_id: "cap-001"
      stage: "emerging"
      delivered_by_kr: "kr-p-001"  # Which KR advanced this
      evidence: "Validated with 100 beta users showing 40% time savings"
    - capability_id: "cap-002"
      stage: "hypothetical"
      evidence: "Design complete, awaiting implementation"
  last_advanced_by_kr: "kr-p-001"
  last_assessment_date: "2025-01-18"
```

### The Minimum Rule

A feature's `overall_stage` is determined by its **least mature capability**:
- If one capability is "hypothetical" and four are "proven", the feature is "hypothetical"
- This ensures honest assessment: a feature can't be "proven" until all capabilities have evidence

### When to Update Feature Maturity

1. **After KR completion**: When a KR advances a capability, update `delivered_by_kr` and `stage`
2. **During calibration**: AIM phase reviews may reveal evidence gaps
3. **Before scaling decisions**: Check all capabilities are at target maturity before major investment

### Relationship to Value Model

Feature Maturity **does not replace** VMM:
- VMM remains the authoritative source for value delivery maturity
- Feature Maturity provides a practitioner-friendly view at the feature level
- Both use the same 4-stage vocabulary for consistency
- Features `contributes_to` Value Model paths—Feature Maturity shows progress on those contributions

**See:** [Feature Definition Implementation Guide](FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md) for detailed feature_maturity documentation.

---

## Linking Roadmap KRs to Value Model Maturity

In `roadmap_recipe.yaml`, KRs can specify which Value Model component they advance:

```yaml
key_results:
  - id: "kr-p-001"
    description: "Achieve 1000 DAU showing product-market fit"
    target: "1000 DAU"
    trl_start: 3
    trl_target: 5
    value_model_target:
      track: "product"
      component_path: "core-platform.data-management.csv-import"
      target_maturity: "proven"
      maturity_rationale: "1000 DAU demonstrates consistent value delivery to target users, meeting proven stage criteria"
```

When this KR is achieved:
1. TRL advances from 3→5 (learning milestone)
2. The targeted sub-component gains evidence for "proven" maturity
3. This evidence propagates upward through 80% rule calculations

---

## Calculating Maturity: The 80% Rule

### How It Works

1. **Start at L3**: Each sub-component has an assessed maturity stage
2. **Calculate L2**: Count sub-components at each stage. If 80%+ are at stage X, component is at stage X
3. **Calculate L1**: Count components at each stage. Apply 80% rule
4. **Calculate Track**: Count layers at each stage. Apply 80% rule

### Example Calculation

**L2 Component "Data Management" with 6 sub-components:**

| Sub-component | Stage |
|---------------|-------|
| CSV Import | proven |
| Excel Import | proven |
| API Connector | proven |
| Bulk Export | proven |
| Data Validation | emerging |
| Scheduled Sync | hypothetical |

Distribution: 4 proven (67%), 1 emerging (17%), 1 hypothetical (17%)

**Result**: Component is at "emerging" (67% < 80% threshold for proven)

If CSV Import advanced to "scaled" instead of "proven":
- Distribution: 3 proven (50%), 1 scaled (17%), 1 emerging (17%), 1 hypothetical (17%)
- Result: Still "emerging" (no stage has 80%+)

### Override Capability

When the 80% rule doesn't capture business reality, use `stage_override: true`:

```yaml
maturity_summary:
  calculated_stage: "proven"  # Actually reflects override, not calculation
  stage_override: true        # Indicates human judgment applied
```

**Use cases for override:**
- One critical sub-component represents disproportionate value
- Strategic decision to claim different maturity (with justification)
- Temporary adjustment during transitions

---

## VMM in North Star: Strategic Maturity Context

At the North Star level, emerged maturity provides executive-level visibility:

```yaml
strategic_maturity_context:
  portfolio_summary:
    - product_line: "Core Platform"
      overall_position: "validation"  # discovery | validation | scalability | growth
      track_maturity:
        product: "proven"
        strategy: "emerging"
        org_ops: "proven"
        commercial: "emerging"
      current_milestone: "value_recipient_fit"
      focus_recommendation: "Strategy track needs focus - GTM positioning not yet resonating"
  
  maturity_themes:
    - theme: "Strong Product, weak Commercial across portfolio"
      implication: "Pricing and monetization should be Q2 priority"
  
  last_maturity_review: "2026-01-10"
```

This section is **descriptive, not prescriptive** - it reflects emerged maturity from Value Models, updated during North Star reviews.

---

## Best Practices

### 1. Start at L3 with Evidence

Don't guess maturity at high levels. Start with specific evidence for each L3 sub-component:

✅ **Good**: "CSV Import is proven because 847 customers use it weekly with 99.2% success rate"  
❌ **Bad**: "Data Management is probably proven because it feels mature"

### 2. Be Conservative with Maturity Claims

The 80% rule is intentionally conservative. Don't override to inflate maturity:

✅ **Good**: Override when one critical component represents disproportionate value  
❌ **Bad**: Override because "we need to show progress to investors"

### 3. Link KRs to Value Model Components

Use the `value_model_target` field in roadmap KRs to connect execution to maturity:

✅ **Good**: KR targets specific L3 sub-component with maturity advancement rationale  
❌ **Bad**: KRs floating without connection to Value Model

### 4. Review Maturity During Calibration

VMM updates naturally during AIM phase:
- Assessment reveals evidence gaps
- Calibration adjusts maturity claims based on evidence
- North Star review captures emerged portfolio view

### 5. Use Generalized Milestone Names

The milestone names work across all tracks:

| Instead of... | Use... |
|---------------|--------|
| Product-Market Fit | Value-Recipient Fit (applies to all tracks) |
| Product-User Fit | Value-Recipient Fit (users are recipients) |
| Problem-Solution Fit | Problem-Approach Fit (solution is an approach) |

---

## Common Patterns

### Pattern 1: Product-Heavy, Strategy-Light

```yaml
track_maturity:
  product: "proven"
  strategy: "hypothetical"
  org_ops: "emerging"
  commercial: "hypothetical"
```

**Diagnosis**: Strong product, but unclear positioning and weak monetization.  
**Action**: Focus roadmap on Strategy and Commercial track KRs.

### Pattern 2: Unbalanced Portfolio

```yaml
portfolio_summary:
  - product_line: "Enterprise Suite"
    track_maturity: {product: scaled, strategy: scaled, org_ops: proven, commercial: proven}
  - product_line: "SMB Product"
    track_maturity: {product: emerging, strategy: hypothetical, org_ops: hypothetical, commercial: hypothetical}
```

**Diagnosis**: Enterprise mature, SMB still in discovery.  
**Action**: SMB needs focused investment or strategic decision.

### Pattern 3: Ghost Track

One track shows "hypothetical" across all components despite product being live:

**Diagnosis**: Track has been neglected - no evidence collected.  
**Action**: Either acknowledge gap and invest, or deprecate track if not strategic.

---

## FAQ

### Q: How often should maturity be updated?

**A**: L3 evidence should be updated continuously as data becomes available. L2/L1/Track calculations update automatically (or manually during reviews). North Star strategic context is updated during annual reviews.

### Q: Can maturity go backwards?

**A**: Yes, if evidence contradicts previous assessment. Example: Feature was "proven" but usage dropped significantly → re-assess as "emerging" with updated evidence.

### Q: What if I don't have 80% at any stage?

**A**: Use the highest stage that any component has achieved. For mixed distributions, the calculated stage is the "floor" of where you are.

### Q: Should new products start at "hypothetical"?

**A**: Yes. All new products and features start at "hypothetical" until evidence proves otherwise. This is the honest starting point.

### Q: How does VMM relate to roadmap prioritization?

**A**: VMM informs prioritization by showing maturity gaps. The Balance Checker wizard can use VMM data to recommend focus areas.

---

## Related Documentation

- [EPF README](../../README.md) - Framework overview
- [ADOPTION_GUIDE](ADOPTION_GUIDE.md) - Getting started with EPF
- [Balance Checker Wizard](../../wizards/balance_checker.agent_prompt.md) - Roadmap viability assessment
- [Value Model Schema](../../schemas/value_model_schema.json) - Technical schema reference
- [Roadmap Recipe Schema](../../schemas/roadmap_recipe_schema.json) - KR value_model_target field

---

*Value Model Maturity provides the strategic lens for understanding where you are on the journey from hypothesis to proven value delivery. Use it to maintain honesty about what's validated vs what's assumed, and to focus investment where maturity gaps exist.*
