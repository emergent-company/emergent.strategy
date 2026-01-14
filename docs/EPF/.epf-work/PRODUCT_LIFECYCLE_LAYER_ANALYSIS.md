# Product Lifecycle Layer Analysis

> **Purpose**: Analyze how to incorporate the Product Lifecycle / S-Curve model into EPF  
> **Working Document**: Session 2026-01-11  
> **Status**: In Progress

---

## Executive Summary

EPF currently has a 3-layer architecture:
1. **READY-FIRE-AIM Cycles** (operational rhythm, weeks-months)
2. **Escalation Levels 0-3** (team size / complexity maturity)
3. **TRL 1-9** (innovation maturity for individual Key Results)

The user proposes adding a **Product Lifecycle Layer** that sits ABOVE READY-FIRE-AIM cycles, describing the overall arc from idea to scale. This maps the "user value ladder" with key milestones.

---

## The Proposed Model: User Value Ladder

### Visualization

```
                    ^
                    |  GROWTH PHASE
   Actual           |  "Pour growth money into the machine"
   Customer         |     
   Value            |  ────────────● Product-Market Fit
                    |              │  "Scalable business model"
                    |       ╔══════╧═══════╗
                    |       ║   SCALE      ║
                    |       ║   "Unit economics work"
                    |       ╚══════╤═══════╝
                    |              │
   ─────────────────┼──────────────┼── Product-User Fit ── "Users find value"
                    |       ╔══════╧═══════╗
   Hypothetical     |       ║  VALIDATION  ║
   Value            |       ║  "Learning if it works"
                    |       ╚══════╤═══════╝
                    |              │
                    |       ● Problem-Solution Fit
                    |       │  "Confirmed we solve a real problem"
                    |       ╔══════╧═══════╗
                    |       ║  DISCOVERY   ║
                    |       ║  "All hypotheses"
                    |       ╚══════════════╝
                    |
                    └────────────────────────────────────────────> Time
```

### Key Concepts

| Phase | Zone | Focus | Primary Questions |
|-------|------|-------|-------------------|
| **Discovery** | Hypothetical Value | Market + User + Problem understanding | Does this solve a real pain point? |
| **Validation** | Crossing to Actual Value | Solution + Implementation understanding | Do people actually use and enjoy this? |
| **Scalability** | Actual Value | Optimization + Business model | Can we build a sustainable business? |
| **Growth** | Exponential Value | Scaling | How fast can we expand this proven model? |

### Key Milestones (Level Transitions)

| Milestone | What It Means | Evidence Required |
|-----------|---------------|-------------------|
| **Problem-Solution Fit** | Confirmed solution addresses real problem | Qualitative user validation |
| **Product-User Fit** | Users find real value in product | Usage metrics, retention, satisfaction |
| **Product-Market Fit** | Viable business model with sufficient market | Revenue, unit economics, market size |

---

## Current EPF Concepts That Map to This

### 1. Escalation Levels (Team Size Focus)
EPF already has a growth model, but it's based on **team size / organizational complexity**:
- Level 0: Solo (1-2 people)
- Level 1: Small team (3-5)
- Level 2: Growing startup (6-15)
- Level 3: Product org (15-50+)

This is **organizational maturity**, not **product maturity**.

### 2. TRL (Technology Readiness Levels) - Innovation Maturity
EPF has TRL 1-9 for tracking **innovation/learning maturity** on individual Key Results:
- TRL 1-3: Concept/research (early learning)
- TRL 4-6: Validation/demonstration (proof of concept)
- TRL 7-9: Deployment/scaling (production)

This is **innovation maturity per KR**, not **product lifecycle position**.

### 3. READY-FIRE-AIM (Operational Cycle)
The core operational rhythm:
- READY: Strategic alignment (what to build, why)
- FIRE: Traceable execution (build, measure)
- AIM: Retrospective calibration (learn, adapt)

This is the **execution mechanism**, not the lifecycle context.

---

## Gap Analysis: What's Missing

1. **No explicit "Product Maturity Stage" concept**
   - EPF doesn't currently ask "Where are we on the S-curve?"
   - Cycles don't adapt based on product lifecycle position

2. **No milestone-based progression model**
   - PSF → PUF → PMF milestones aren't tracked
   - No validation criteria for "graduating" between stages

3. **No lifecycle-appropriate READY/FIRE/AIM configuration**
   - Discovery-phase cycles should be hypothesis-heavy, short, learning-focused
   - Growth-phase cycles should be execution-heavy, longer, optimization-focused

4. **No "Hypothetical vs Actual Value" framing**
   - The critical insight that early work is in the "below zero line" zone
   - Forces acknowledgment that value is unproven until Product-User Fit

---

## Proposed EPF Enhancement: Product Lifecycle Context (PLC)

### Option A: Add as North Star Context

Add a `product_lifecycle_context` section to North Star:

```yaml
north_star:
  # ... existing purpose, vision, mission, values ...
  
  product_lifecycle_context:
    current_stage: discovery | validation | scalability | growth
    target_milestone: problem_solution_fit | product_user_fit | product_market_fit | growth_machine
    
    milestone_status:
      problem_solution_fit:
        achieved: false
        evidence: null
        achieved_date: null
        
      product_user_fit:
        achieved: false
        evidence: null
        achieved_date: null
        
      product_market_fit:
        achieved: false
        evidence: null
        achieved_date: null
    
    current_cycle_focus:
      primary_question: "Does this solve a real pain point?"
      value_zone: hypothetical | actual
      key_assumptions_to_test: 
        - "Users have this problem frequently"
        - "Our solution reduces time by 50%"
```

**Pros**: Lives in the stable North Star; reviewed annually
**Cons**: North Star is meant to be stable; lifecycle stage changes more frequently

### Option B: Add as Roadmap Context (Preferred)

Each roadmap operates WITHIN a product lifecycle stage:

```yaml
roadmap:
  id: roadmap-mvp-2024-q1
  
  product_lifecycle_context:
    stage: discovery
    target_milestone: problem_solution_fit
    
    milestone_criteria:
      problem_solution_fit:
        required_evidence:
          - type: user_interviews
            threshold: "20+ users confirm problem exists"
            status: pending
          - type: prototype_validation
            threshold: "80%+ say 'this would help'"
            status: pending
        estimated_timeline: "2024 Q1-Q2"
        
    cycle_configuration:
      duration: "4 weeks"  # Shorter in discovery
      emphasis: "learning over building"
      key_question: "Does this solve a real problem?"
      acceptable_outcome: "Validated or invalidated hypothesis"
```

**Pros**: Lifecycle context is cycle-specific; roadmap is the right planning layer
**Cons**: Adds complexity to already-rich roadmap schema

### Option C: New Top-Level Artifact (Strategy Formula Level)

Create a new `product_lifecycle.yaml` or enhance `strategy_formula.yaml`:

```yaml
product_lifecycle:
  id: lifecycle-acme-product
  last_updated: 2024-01-15
  
  current_position:
    stage: discovery
    sub_phase: understanding_user
    value_zone: hypothetical
    
  progression:
    - milestone: idea_inception
      achieved: 2023-06-01
      
    - milestone: problem_solution_fit
      target: 2024-Q2
      achieved: null
      
    - milestone: product_user_fit
      target: 2024-Q4
      achieved: null
      
    - milestone: product_market_fit
      target: 2025-Q3
      achieved: null
      
  current_cycle_context:
    roadmap_id: roadmap-mvp-2024-q1
    primary_question: "Does this solve a real pain point?"
    key_hypotheses:
      - id: hyp-001
        statement: "Legal professionals spend 10+ hours/week on document review"
        validation_method: "User interviews (n=20)"
        status: testing
```

**Pros**: Clean separation; explicit lifecycle tracking; referenceable from roadmap
**Cons**: Another artifact to maintain; adds complexity

### Option D: Enhance Strategy Formula (Minimal Addition)

The Strategy Formula already bridges Opportunity → Strategy → Roadmap. Add lifecycle context there:

```yaml
strategy:
  id: strat-mvp-2024
  opportunity_id: opp-legal-doc-automation
  
  product_lifecycle:
    current_stage: discovery
    target_milestone: problem_solution_fit
    value_zone: hypothetical
    
    stage_focus:
      primary_question: "Does this solve a real pain point?"
      success_criteria:
        - "20+ users confirm problem exists (user interviews)"
        - "Prototype gets 80%+ 'this would help' response"
      
    milestones_achieved:
      - name: idea_inception
        date: 2023-06-01
        evidence: "Founder personal pain point + 10 initial conversations"
```

**Pros**: Minimal new complexity; Strategy Formula is the right abstraction level
**Cons**: Strategy Formula may get too heavy

---

## Recommendation: Layered Approach

### 1. Add Product Lifecycle Stage to North Star (Stable Context)
The "current stage" is relatively stable (you're in Discovery for months, not days):

```yaml
north_star:
  product_maturity:
    lifecycle_stage: discovery | validation | scalability | growth
    last_major_milestone: null | problem_solution_fit | product_user_fit | product_market_fit
    next_target_milestone: problem_solution_fit
```

### 2. Add Milestone Criteria to Roadmap (Cycle-Specific Goals)
Each roadmap cycle is working toward the next milestone:

```yaml
roadmap:
  lifecycle_context:
    target_milestone: problem_solution_fit
    milestone_criteria:
      - evidence_type: user_interviews
        threshold: "20+ confirm problem"
        status: in_progress
```

### 3. Link Cycle Configuration to Lifecycle Stage
Different stages suggest different READY/FIRE/AIM configurations:

| Stage | Cycle Duration | READY Focus | FIRE Focus | AIM Focus |
|-------|----------------|-------------|------------|-----------|
| Discovery | 2-4 weeks | Hypothesis generation | Lightweight experiments | Rapid pivots |
| Validation | 4-8 weeks | Feature hypothesis | MVP/prototype building | Usage validation |
| Scalability | 8-12 weeks | Growth hypothesis | Optimization, efficiency | Unit economics |
| Growth | 12+ weeks | Expansion hypothesis | Scaling execution | Market expansion |

---

## Next Steps

1. **Get user feedback** on preferred approach (A, B, C, D, or hybrid)
2. **Design schema additions** for chosen approach
3. **Create wizard** for product lifecycle assessment
4. **Add to adoption guide** how lifecycle stage affects EPF usage
5. **Update white paper** with lifecycle layer concept

---

## Open Questions

1. Should lifecycle stage be in North Star (stable) or Strategy Formula (per-strategy)?
2. Should milestones be binary (achieved/not) or have confidence levels?
3. How does this relate to TRL? (TRL = innovation maturity, PLC = product maturity?)
4. Should we prescribe cycle configurations per stage, or just suggest?
5. How do multi-product companies handle this? (Each product has own lifecycle position)

