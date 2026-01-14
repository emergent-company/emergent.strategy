# Reality Baseline Protocol

> **Purpose**: Core principles for establishing and maintaining the Living Reality Assessment  
> **Version**: 1.0.0 | **Created**: 2026-01-14  
> **Applies to**: All EPF touchpoints (wizards, agents, scripts)

## Overview

The **Living Reality Assessment** is EPF's mechanism for capturing and evolving the organization's current reality across all four tracks (Product, Strategy, Org/Ops, Commercial). Unlike static documentation, it evolves through emergence - updated by signals from execution, not assumptions.

**This protocol defines how any EPF-aware agent should:**
1. Check for baseline existence
2. Help establish baseline conversationally (not force wizard paths)
3. Update baseline through emergence
4. Maintain track coherence awareness

---

## Core Principles

### 1. Baseline Awareness

**Principle:** Any EPF-aware agent should know if a Living Reality Assessment exists and offer to help create/update it.

**Implementation:**
```
Before any strategic work, check:
  _instances/{product}/AIM/baseline/living_reality_assessment.yaml

If missing → Offer to help establish (don't force, don't block)
If exists → Use as context, offer to update if stale
```

**Conversation patterns:**
- "I notice you don't have a reality baseline yet. Would you like to spend 5-15 minutes capturing your current state? This helps me give you better guidance."
- "Your reality baseline was last updated 3 cycles ago. Should we refresh it based on what's changed?"
- "Before we dive into roadmapping, let me understand where you are. Do you have a baseline I can reference, or should we create one together?"

### 2. Signal-Driven Updates

**Principle:** Track health signals flow from execution into reality baseline, not vice versa.

**Implementation:**
```
Reality updates triggered by:
  ✅ AIM cycle signals (THA collection)
  ✅ External changes (team, funding, market)
  ✅ Milestone achievements
  ✅ Constraint changes
  ❌ NOT by speculation or planning
```

**Key distinction:**
- **READY phase** = Planning what we want to achieve (forward-looking)
- **FIRE phase** = Executing the plan (action)
- **AIM phase** = Measuring what actually happened → **This is where reality updates**

Reality baseline reflects **what IS**, not **what we hope will be**.

### 3. Evolution, Not Snapshots

**Principle:** Reality documents evolve through emergence; append to history, don't replace.

**Implementation:**
```yaml
evolution_log:
  - cycle_reference: "C3"
    timestamp: "2026-01-14T10:30:00Z"
    trigger: "aim_signals"
    summary: "Strategy track moved from implicit to explicit after defining clear growth thesis"
    changes:
      - section: "track_baselines"
        field: "strategy.maturity"
        change_type: "updated"
        previous_value: "implicit"
        new_value: "explicit"
        reason: "Completed growth thesis document with measurable hypotheses"
```

**Benefits:**
- Pattern recognition over time ("we always slow down in Q4")
- Audit trail for decisions
- Validates that emergence is happening
- Informs future recalibrations with historical context

### 4. Track Coherence

**Principle:** All tracks matter; attention imbalance is itself a signal.

**Implementation:**
```
When assessing any track, consider:
  - Is attention proportional to current needs?
  - Are signals showing strain in neglected tracks?
  - Is strong velocity in one track masking decay in another?

Surface observations like:
  "Product velocity is accelerating, but Org track shows stretched capacity. 
   This could indicate burnout risk. Should we discuss attention rebalancing?"
```

**Track interdependencies:**
- Product ←→ Org/Ops: Building fast without ops creates debt
- Strategy ←→ Commercial: Vision without revenue path is fantasy
- All tracks ←→ Product: Everything serves the product mission

---

## Lifecycle Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    LIFECYCLE STAGES                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   BOOTSTRAP (Cycle 0)                                            │
│   ├── Initial collection (5-45 min by adoption level)           │
│   ├── lifecycle_stage: "bootstrap"                               │
│   ├── cycles_completed: 0                                        │
│   └── evolution_log: [{ trigger: "bootstrap_complete" }]        │
│                                                                  │
│           ↓                                                      │
│                                                                  │
│   MATURING (Cycles 1-3)                                          │
│   ├── THA signals updating track_baselines                       │
│   ├── lifecycle_stage: "maturing"                                │
│   ├── evolution_log growing with each cycle                     │
│   └── Patterns emerging but sample size still small             │
│                                                                  │
│           ↓                                                      │
│                                                                  │
│   EVOLVED (Cycles 4+)                                            │
│   ├── Rich history enables pattern recognition                  │
│   ├── lifecycle_stage: "evolved"                                 │
│   ├── Trend analysis meaningful                                  │
│   └── Predictive insights possible                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## What Evolves vs What Stays Stable

| Section | Stability | Update Trigger |
|---------|-----------|----------------|
| `metadata.lifecycle_stage` | Progresses | After cycle thresholds |
| `metadata.cycles_completed` | Increments | Each AIM cycle |
| `adoption_context` | **Stable** | Team size, funding, org type changes |
| `track_baselines` | **Evolving** | THA signals each cycle |
| `existing_assets` | Stable | New artifacts created |
| `constraints` | Stable | Hard constraint changes only |
| `capability_gaps` | **Evolving** | Gaps mitigated, new ones discovered |
| `current_focus` | **Evolving** | Attention rebalances each cycle |
| `evolution_log` | **Append-only** | Every change recorded |

---

## Baseline Collection Patterns

### Quick Baseline (5-10 minutes) - Adoption Level 0

For solo founders, capture essentials conversationally:

```
"Tell me about your product in 2-3 sentences."
"What stage are you at? (idea / MVP building / MVP live / growth)"
"What's your biggest bottleneck right now?"
"How do you make money, or plan to?"
"What's your runway situation?"
```

Output:
- Product track baseline (maturity, current activities)
- Key constraint (usually time or money)
- Primary focus area

### Standard Baseline (15-30 minutes) - Adoption Level 1

For small teams, add:

```
"Beyond product building, what other activities are you doing?"
  → Strategy (fundraising, market research, partnerships)
  → Commercial (sales, marketing, customer success)
  → Org/Ops (hiring, processes, tools)

"Where does each of those stand?"
  → Just me doing it ad-hoc (implicit)
  → We have some structure (explicit)
  → We have metrics (measured)

"What would break first if you 3x'd your pace?"
```

### Comprehensive Baseline (30-45 minutes) - Adoption Level 2+

For larger teams, systematic:

```
For each track (Product, Strategy, Org/Ops, Commercial):
  - Maturity level (absent → implicit → explicit → measured → optimized)
  - Current status (not_applicable / not_started / emerging / established / mature)
  - Key activities (what's actually happening)
  - Pain points (what's hard or broken)
  - Strengths (what's working well)
```

---

## Update Triggers and Thresholds

### When to Update CRA

| Trigger | Threshold | Action |
|---------|-----------|--------|
| **AIM cycle complete** | THA collected | Compare signals to baselines, update if delta |
| **Team size change** | ±2 people or 50% | Update adoption_context |
| **Funding event** | Any | Update constraints, adoption_context |
| **Major pivot** | Strategic direction change | Comprehensive refresh |
| **Track maturity shift** | Signal moves 2+ levels | Update track_baselines |
| **Coherence warning** | 2+ cycles of imbalance | Surface for discussion |

### Significant Delta Detection

```yaml
# Signal movement that triggers CRA update:
velocity_signal:
  - accelerating → blocked  # 3-level drop
  - stable → blocked        # 2-level drop
  - Any 2+ level change in single cycle

quality_signal:
  - excellent → degrading   # 2-level drop
  - healthy → critical      # 2-level drop
  - Any 2+ level change in single cycle

# Coherence triggers:
coherence_status:
  - healthy → critical      # Skip warning, immediate attention
  - healthy → warning       # Surface for discussion
  - warning for 2+ cycles   # Escalate to action
```

---

## Integration with EPF Phases

### READY Phase (Planning)
- **Read** baseline for context
- **Don't update** during planning (reality ≠ plans)
- Use track baselines to inform realistic OKRs
- Use constraints to bound ambition appropriately

### FIRE Phase (Execution)
- Baseline provides context for decisions
- Major external changes can trigger update
- Otherwise, reality updates happen in AIM

### AIM Phase (Measurement)
- **Primary update point**
- Synthesizer collects THA signals
- Compares signals to current baselines
- Updates CRA if significant deltas
- Appends to evolution_log
- Surfaces coherence observations

---

## Conversational Update Flow

During any EPF work, an agent can update reality baseline conversationally:

```
Agent: "I notice you mentioned your team grew from 3 to 5 people. 
        That moves you from Adoption Level 0 to Level 1. 
        Should I update your reality baseline to reflect this?"

User: "Yes, and we also hired someone for DevOps."

Agent: "Great. I'll update:
        - adoption_context.team_size: 5
        - adoption_context.adoption_level: 1
        - track_baselines.org_ops: implicit → emerging (now someone owns it)
        - evolution_log: team growth, new DevOps capability"
```

No wizard required. Emergence happens through natural conversation.

---

## Schema References

- **Living Reality Assessment**: `schemas/current_reality_assessment_schema.json`
- **Track Health Assessment**: `schemas/track_health_assessment_schema.json`
- **AIM Trigger Config**: `schemas/aim_trigger_config_schema.json`

## Template References

- **Living Reality Assessment Template**: `templates/AIM/living_reality_assessment.yaml`
- **Track Health Signals Template**: `templates/AIM/track_health_signals.yaml`

## Related Wizards

- **Lean Start**: Initial baseline collection for L0-1
- **Pathfinder**: Uses baseline for L2+ READY phase
- **Synthesizer**: Updates baseline during AIM phase

---

## Summary

The Living Reality Assessment is not another artifact to maintain - it's the **ground truth** that all EPF work builds upon. By establishing clear principles for when and how it evolves, we enable:

1. **Conversational flexibility** - No forced wizard paths
2. **Emergence-driven updates** - Reality changes based on signals, not speculation
3. **Track coherence** - Imbalances surface naturally
4. **Historical insight** - Evolution log enables pattern recognition

Every EPF touchpoint should embody these principles, not just reference them.
