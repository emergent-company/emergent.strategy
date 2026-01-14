# Revised Analysis: Track Definitions Across All Four Tracks

**Date:** 2026-01-11  
**Status:** Revised based on thorough value model analysis

---

## Corrected Understanding

### The Core Pattern (for ALL tracks)

```
Value Model                    Track Definition                 Output
(WHAT value)                   (HOW to generate it)             (Deliverable)
─────────────────────────────────────────────────────────────────────────────
L1/L2/L3 hierarchy    →    Procedure description    →    Actual execution
describing value            for practitioners to            by humans/agents
to be delivered             follow or implement
```

**Key insight from user:**
- Feature definitions are INPUT for coders (humans/agents) to generate runnable code
- Similarly, track definitions for OTHER tracks are INPUT for practitioners to generate their outputs
- Track definitions are NOT the outputs themselves

### What Each Track's Definitions Enable

| Track | Value Model Describes | Definition Is Input For | Practitioners Generate |
|-------|----------------------|-------------------------|----------------------|
| **Product** | Capabilities to build | Feature Definitions | Coders → Code |
| **Strategy** | Strategic capabilities | Strategy Definitions | Strategists → READY artifacts |
| **OrgOps** | Operational capabilities | Process Definitions | Ops team → Running processes |
| **Commercial** | Commercial capabilities | Commercial Definitions | Commercial team → Activities |

---

## Canonical Value Model Analysis

### Strategy Track (strategy.value_model.yaml)

**Description:** "Defines, communicates, and executes the company's overarching strategy."

**L1 Layers:**
1. **STRATEGIC ROADMAP** - Long-term direction
   - User Insight, Vision & Mission, Goal Prioritization, Long-term Initiatives
2. **TACTICAL ROADMAP** - Short-term execution
   - Actionable Priorities, Iterative Execution Plan
3. **STRATEGIC COMMUNICATIONS** - Messaging & positioning
   - Identity Definition, Market Positioning, Narrative Building, Engagement Strategies

**Who generates this value?** Strategy team, leadership, comms team

**What would a "Strategy Definition" describe?**
- How to develop vision statements (procedure for Vision & Mission)
- How to run scenario modeling sessions (procedure for Long-term Initiatives)
- How to build investor updates (procedure for Engagement Strategies)

**Output of following these definitions:** READY artifacts, positioning documents, OKRs, narratives

---

### Commercial Track (commercial.value_model.yaml)

**Description:** "Drives market positioning, revenue generation, AND partnerships."

**L1 Layers:**
1. **BUSINESS DEVELOPMENT AND PARTNERSHIPS** - NOT just revenue!
   - Investor Relations, Strategic Partnerships, Alliance Management, Collaboration Models
2. **BRAND & POSITIONING** - Identity and differentiation
   - Brand Identity, Market Differentiation, Competitive Positioning
3. **SALES AND MARKETING** - Customer acquisition & retention
   - Lead Generation, Campaign Execution, Customer Retention, Content Production

**Who generates this value?** BD team, marketing, sales, partnerships team

**What would a "Commercial Definition" describe?**
- How to run partnership scouting (procedure for Strategic Partnerships)
- How to execute a multichannel campaign (procedure for Campaign Execution)
- How to build loyalty programs (procedure for Customer Retention)
- How to manage investor relations (procedure for Investor Relations)

**Output of following these definitions:** Partnerships, campaigns, brand assets, customer relationships

---

### OrgOps Track (org_ops.value_model.yaml)

**Description:** "Builds and maintains the company's operational and cultural engine."

**L1 Layers:**
1. **TALENT MANAGEMENT** - People lifecycle
   - Workforce Planning, Onboarding, Training, Career Progression, Feedback, Compensation
2. **CULTURE & INTERNAL COMMUNICATIONS** - How we work together
   - Values & Principles, Collaboration Protocols, Feedback Mechanisms, Internal Events
3. **FINANCIAL & LEGAL** - Business operations
   - Budgeting, Accounting, Compliance, Risk Management, Financial Transactions
4. **FACILITIES & IT** - Infrastructure
   - Infrastructure Management, IT Systems, Tools & Platforms, Data Compliance
5. **COMPANY GOVERNANCE & COMPLIANCE** - Oversight
   - Board, Shareholders, Strategy Execution

**Who generates this value?** HR, finance, legal, IT, facilities, leadership

**What would a "Process Definition" describe?**
- How to run onboarding (procedure for Onboarding)
- How to conduct performance reviews (procedure for Feedback & Performance)
- How to manage budgeting cycles (procedure for Budgeting)
- How to handle incident response (procedure for IT Systems)

**Output of following these definitions:** Running processes, policies, trained people, compliant operations

---

### Product Track (product.value_model.yaml)

**Description:** "Defines the value your product delivers to users."

**Structure:** Product-specific (not canonical), but follows L1/L2/L3 pattern
- User-facing layers (apps, experiences)
- Service layers (capabilities, integrations)
- Infrastructure layers (reliability, operations)

**Who generates this value?** Product team, engineering, design

**What does a Feature Definition describe?**
- How to build specific capabilities (procedure for L3 sub-components)
- User personas, scenarios, contexts, design guidance
- Input for coders to generate working code

**Output of following these definitions:** Working product features (code)

---

## Commonalities Across All Four Tracks

### Shared Pattern

Every track definition needs to describe:

1. **Strategic Context** - Which L2/L3 value model paths does this contribute to?
2. **Value Hypothesis** - What outcome does following this procedure achieve?
3. **Actors/Practitioners** - Who follows this procedure?
4. **Inputs** - What do they need to start?
5. **Steps/Phases** - What do they do?
6. **Outputs** - What do they produce?
7. **Success Criteria** - How do we know it worked?
8. **Dependencies** - What must exist first?

### Track-Specific Vocabulary

| Concept | Product | Strategy | OrgOps | Commercial |
|---------|---------|----------|--------|------------|
| **Actors** | Personas (users) | Stakeholders | Roles (RACI) | Segments/Personas |
| **Steps** | Scenarios | Strategy phases | Process stages | Motion stages |
| **Outputs** | Features (code) | READY artifacts, decisions | Running processes | Relationships, revenue |
| **Context** | UI screens, APIs | Planning sessions, reviews | Meetings, systems | Channels, touchpoints |
| **Success** | Acceptance criteria | OKR achievement | SLAs, metrics | KPIs, conversion |

---

## Revised Hybrid Schema Architecture

### Base Schema (Common to ALL tracks)

```yaml
# track_definition_base_schema.json
id: string (pattern per track)
name: string
slug: string
status: draft|ready|in-progress|delivered|deprecated
track: product|strategy|org_ops|commercial

strategic_context:
  contributes_to: [L2.L3 paths in value model]
  assumptions_tested: [roadmap assumption IDs]

definition:
  value_hypothesis: string  # When [context], [actor] can [action], achieving [outcome]
  
  actors:  # Generic - interpretation varies by track
    - id: string
      name: string
      type: beneficiary|executor|owner|sponsor
      description: string
      
  inputs:  # What's needed to start
    - name: string
      description: string
      source: string
      
  outputs:  # What's produced
    - name: string
      description: string
      consumer: string
      
  value_units:  # Discrete deliverables (capabilities for Product, outcomes for others)
    - id: string
      name: string
      description: string

execution:
  phases:  # Generic term - scenarios/stages/steps per track
    - id: string
      name: string
      description: string
      activities: [strings]
      outcomes: [strings]
      
  success_criteria:
    - description: string
      measurable: boolean
      target: string

dependencies:
  requires: [{id, name, reason}]
  enables: [{id, name, reason}]

boundaries:
  non_goals: [strings]
  constraints: [strings]
```

### Track Extensions

**Product Extension** (feature_definition)
```yaml
# Additional fields for Product track
definition:
  job_to_be_done: string
  solution_approach: string
  personas: [4 rich persona objects]  # Renamed from actors
  capabilities: [cap objects]  # Renamed from value_units
  architecture_patterns: [...]

implementation:
  design_guidance: {...}
  contexts: [UI/email/API contexts]
  scenarios: [rich user scenarios]  # Renamed from phases
  external_integrations: [...]
```

**Strategy Extension** (strategy_definition)
```yaml
# Additional fields for Strategy track
definition:
  strategic_question: string  # What decision/direction does this address?
  stakeholders: [...]  # Who's involved in strategy work
  strategic_options: [...]  # Options being evaluated
  decision_criteria: [...]  # How to choose

execution:
  discovery_phase: {...}  # Gather insights
  synthesis_phase: {...}  # Form options
  decision_phase: {...}  # Make choice
  communication_phase: {...}  # Roll out

artifacts_produced:  # READY artifacts this generates
  - type: insight_analysis|strategy_formula|roadmap_recipe
    sections_affected: [...]
```

**OrgOps Extension** (process_definition)
```yaml
# Additional fields for OrgOps track
definition:
  process_objective: string
  process_owners: [RACI-style ownership]
  current_state: {metrics, pain_points}
  target_state: {metrics, improvements}

execution:
  process_stages: [stage objects with inputs/outputs/SLAs]
  tools_and_systems: [...]
  cadence: string  # How often, triggers
  
governance:
  review_frequency: string
  escalation_path: string
  compliance_requirements: [...]
```

**Commercial Extension** (commercial_definition)
```yaml
# Additional fields for Commercial track
definition:
  commercial_objective: string  # Broader than just revenue
  target_audience: {ICP, segments, personas}
  value_proposition: string
  
execution:
  motion_stages: [...]  # For sales/marketing motions
  relationship_stages: [...]  # For partnerships
  touchpoints: [...]  # Channels, interactions
  
metrics:
  leading_indicators: [...]
  lagging_indicators: [...]
  targets: {...}

enablement:
  collateral: [...]  # Materials needed
  training: [...]  # Skills needed
  tools: [...]  # Systems used
```

---

## Instance Structure (Revised)

```
_instances/{product}/FIRE/
├── definitions/
│   ├── product/                    # Feature definitions (fd-*)
│   │   ├── fd-001-document-upload.yaml
│   │   └── fd-002-entity-extraction.yaml
│   ├── strategy/                   # Strategy definitions (sd-*)
│   │   ├── sd-001-market-positioning.yaml
│   │   └── sd-002-okr-planning-cycle.yaml
│   ├── org_ops/                    # Process definitions (pd-*)
│   │   ├── pd-001-engineering-onboarding.yaml
│   │   └── pd-002-quarterly-planning.yaml
│   └── commercial/                 # Commercial definitions (cd-*)
│       ├── cd-001-partnership-development.yaml
│       └── cd-002-enterprise-sales-motion.yaml
├── value_models/
│   ├── product.value_model.yaml
│   ├── strategy.value_model.yaml
│   ├── org_ops.value_model.yaml
│   └── commercial.value_model.yaml
└── workflows/
```

---

## ID Patterns

| Track | Pattern | Example |
|-------|---------|---------|
| Product | `fd-{number}` | fd-001, fd-042 |
| Strategy | `sd-{number}` | sd-001, sd-015 |
| OrgOps | `pd-{number}` | pd-001, pd-008 |
| Commercial | `cd-{number}` | cd-001, cd-023 |

---

## Key Corrections from Previous Analysis

1. **Strategy definitions ARE needed** - they're input for strategists to produce READY artifacts (not the artifacts themselves)

2. **Commercial is broader than revenue** - includes partnerships, brand, investor relations, not just sales/marketing

3. **All tracks follow same pattern** - describe procedures that practitioners follow to generate value

4. **Outputs vary by track** - but the definition structure (actors, inputs, phases, outputs, criteria) is common

---

## Next Steps

1. Create `track_definition_base_schema.json` with common fields
2. Refactor `feature_definition_schema.json` to extend base (preserve backwards compatibility)
3. Create `strategy_definition_schema.json`
4. Create `process_definition_schema.json` (OrgOps)
5. Create `commercial_definition_schema.json`
6. Create corresponding wizards for each track
7. Update validation scripts to handle all definition types
8. Update integration_specification.yaml with new artifacts
