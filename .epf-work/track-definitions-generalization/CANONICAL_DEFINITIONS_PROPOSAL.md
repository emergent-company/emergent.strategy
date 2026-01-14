# Canonical Track Definitions: Complete Library Proposal

**Date:** 2026-01-11  
**Status:** Strategic plan for EPF enhancement

---

## The Insight

### Current Asymmetry

| Track | Value Model | Definitions Library |
|-------|-------------|---------------------|
| **Product** | PLACEHOLDER (product-specific) | 21 example templates in `features/` |
| **Strategy** | CANONICAL (27 L3 items) | ❌ None |
| **OrgOps** | CANONICAL (51 L3 items) | ❌ None |
| **Commercial** | CANONICAL (24 L3 items) | ❌ None |

### The Opportunity

Since Strategy, OrgOps, and Commercial value models are **canonical** (standardized across organizations), their definition templates can also be:

1. **Directly usable** - not just examples, but ready-to-adopt procedures
2. **Best-practice encoded** - incorporate industry knowledge
3. **Organization-agnostic** - work for any company using EPF

This transforms EPF from a "framework" into a **startup operating system** with 100+ ready-to-use operational procedures.

---

## Scope Analysis

### L3 Sub-components by Track

| Track | L3 Count | Definition Prefix |
|-------|----------|-------------------|
| Strategy | 27 | `sd-` |
| OrgOps | 51 | `pd-` |
| Commercial | 24 | `pd-` → `cd-` |
| **Total** | **102** | |

### Strategy Track L3s (27 items)

**STRATEGIC ROADMAP (L1)**
- Vision & Mission: long-term-organizational-purpose, vision-statement-development, organizational-aspirations
- Goal Prioritization: high-priority-goals, alignment-with-mission, key-result-identification-okrs
- Long-term Initiatives: resource-allocation-strategies, multi-year-planning, scenario-modeling

**TACTICAL ROADMAP (L1)**
- Actionable Priorities: short-term-goals, cross-team-dependencies, timeline-management
- Iterative Execution Plan: phased-rollouts, outcome-tracking, feedback-loops

**STRATEGIC COMMUNICATIONS (L1)**
- Identity Definition: naming-conventions, core-values-and-tone, consistency-guidelines
- Market Positioning: value-proposition, unique-differentiators, target-audience-narratives
- Narrative Building: core-story-development, elevator-pitches, organizational-history
- Engagement Strategies: internal-messaging, public-relations, investor-updates

### OrgOps Track L3s (51 items)

**TALENT MANAGEMENT (L1)** - 18 items
- Onboarding: orientation-programs, training-sessions, system-access-and-setup
- Training Programs: skill-specific-training, leadership-workshops, external-certifications
- Career Progression: mentorship-programs, promotion-guidelines, succession-planning
- Feedback & Performance: performance-reviews, 360-degree-feedback, goal-setting-frameworks
- Compensation & Benefits: salary-benchmarking, bonus-structures, health-and-wellness-programs

**CULTURE & INTERNAL COMMUNICATIONS (L1)** - 12 items
- Values & Principles: code-of-conduct, mission-reinforcement, diversity-and-inclusion-initiatives
- Collaboration Protocols: meeting-etiquette, decision-making-frameworks, knowledge-sharing-platforms
- Feedback Mechanisms: pulse-surveys, retrospectives, anonymous-suggestion-boxes
- Internal Events: all-hands-meetings, team-building-activities, celebrations-and-milestones

**FINANCIAL & LEGAL (L1)** - 15 items
- Budgeting: departmental-budgets, financial-forecasting, resource-allocation
- Accounting: bookkeeping, financial-reporting, audit-and-compliance
- Compliance: regulatory-adherence, policy-management, ethical-guidelines
- Risk Management: risk-assessment-frameworks, business-continuity-planning, insurance-and-liabilities
- Financial Transactions: payroll-processing, invoice-management, expense-reimbursement

**FACILITIES & IT (L1)** - 9 items
- Infrastructure: office-space-planning, remote-work-infrastructure, health-and-safety-protocols
- IT Systems: network-security, software-licensing, it-support-helpdesk
- Tools & Platforms: productivity-tools, collaboration-platforms, data-management-systems

### Commercial Track L3s (24 items)

**BUSINESS DEVELOPMENT & PARTNERSHIPS (L1)** - 9 items
- Strategic Partnerships: partnership-scouting, negotiation-frameworks, partnership-metrics
- Alliance Management: stakeholder-relationship-management, agreement-reviews, joint-ventures
- Collaboration Models: revenue-sharing-agreements, co-marketing-initiatives, technology-integrations

**BRAND & POSITIONING (L1)** - 6 items
- Brand Identity: logo-and-visual-guidelines, brand-voice-and-tone, brand-storytelling
- Market Differentiation: differentiator-messaging, pricing-strategies, packaging-models

**SALES & MARKETING (L1)** - 12 items
- Lead Generation: email-marketing-campaigns, social-media-outreach, seo-strategies
- Campaign Execution: multichannel-campaigns, ad-spend-optimization, campaign-performance-analytics
- Customer Retention: loyalty-programs, personalization-strategies, customer-support-systems

---

## Proposed Directory Structure

```
/definitions/                           # NEW top-level canonical directory
├── README.md                           # Overview and usage guide
├── strategy/                           # 27 strategy definitions
│   ├── README.md
│   ├── sd-001-vision-statement-development.yaml
│   ├── sd-002-okr-planning-cycle.yaml
│   ├── sd-003-scenario-modeling.yaml
│   └── ... (27 total)
├── org_ops/                            # 51 process definitions
│   ├── README.md
│   ├── pd-001-engineering-onboarding.yaml
│   ├── pd-002-performance-review-cycle.yaml
│   ├── pd-003-quarterly-budgeting.yaml
│   └── ... (51 total)
└── commercial/                         # 24 commercial definitions
    ├── README.md
    ├── cd-001-partnership-development.yaml
    ├── cd-002-brand-voice-guidelines.yaml
    ├── cd-003-email-campaign-execution.yaml
    └── ... (24 total)

/features/                              # EXISTING - Product track examples
├── 01-technical/
├── 02-business/
├── 03-ux/
└── 04-cross-cutting/
```

### Alternative: Unified Structure

```
/definitions/
├── product/                            # Move features/ here
│   ├── 01-technical/
│   └── ...
├── strategy/
├── org_ops/
└── commercial/
```

---

## Definition Template Structure

### Base Structure (All Tracks)

```yaml
# Track Definition: {L3 Name}
# Track: {Strategy|OrgOps|Commercial}
# Contributes to: {L1}.{L2}.{L3}

id: "{prefix}-{number}"
name: "{Human Readable Name}"
slug: "{kebab-case-name}"
status: "ready"  # These are canonical, so 'ready' by default
track: "{track_name}"

strategic_context:
  contributes_to:
    - "{Track}.{L2}.{L3}"
  related_definitions: []  # Cross-track dependencies

definition:
  purpose: |
    Why this procedure exists and what value it delivers.
    
  inputs:
    - name: ""
      description: ""
      source: ""
      
  outputs:
    - name: ""
      description: ""
      consumer: ""
      
  actors:
    - role: ""
      responsibility: ""
      
  success_criteria:
    - description: ""
      measurable: true
      target: ""

execution:
  phases:
    - name: ""
      duration: ""
      activities: []
      deliverables: []
      
  cadence: ""  # How often, or trigger-based
  
  tools_recommended: []  # Suggested tools (not mandated)

governance:
  owner: ""
  review_frequency: ""
  escalation_path: ""

adaptation_notes: |
  Guidance for customizing this template for specific organizational context.
  
references:
  - name: ""
    url: ""
    type: "book|article|framework"
```

### Track-Specific Additions

**Strategy Definitions:**
```yaml
strategic_context:
  ready_artifacts_affected:
    - artifact: "04_strategy_formula"
      sections: ["positioning", "differentiation"]
      
decision_framework:
  key_questions: []
  evaluation_criteria: []
  common_options: []
```

**OrgOps Definitions:**
```yaml
operational_context:
  current_state_assessment:
    metrics_to_measure: []
    common_pain_points: []
    
  target_state:
    ideal_outcomes: []
    metrics_targets: []
    
compliance:
  regulatory_requirements: []
  documentation_required: []
```

**Commercial Definitions:**
```yaml
commercial_context:
  target_audience:
    segments: []
    personas: []
    
  metrics:
    leading_indicators: []
    lagging_indicators: []
    benchmarks: []
    
enablement:
  collateral_needed: []
  skills_required: []
```

---

## Implementation Approach

### Phase 1: Foundation (Week 1)
1. Create `track_definition_base_schema.json`
2. Create track extension schemas (strategy, org_ops, commercial)
3. Create `/definitions/` directory structure
4. Create README for each track

### Phase 2: OrgOps Definitions (Weeks 2-3) - Start here
**Why OrgOps first:**
- Most concrete/actionable (processes have clear steps)
- 51 items = largest coverage
- Immediately valuable for any startup
- Easier to validate (processes are well-understood)

Priority order:
1. Onboarding (orientation, training, access) - every org needs this
2. Performance (reviews, feedback, goals) - critical for scaling
3. Budgeting (forecasting, allocation) - essential for sustainability

### Phase 3: Commercial Definitions (Weeks 4-5)
Priority order:
1. Brand Identity - foundational
2. Lead Generation - revenue enablement
3. Partnerships - growth acceleration

### Phase 4: Strategy Definitions (Weeks 6-7)
Priority order:
1. OKR Planning - most requested
2. Vision/Mission - foundational
3. Communications - stakeholder alignment

### Phase 5: Validation & Polish (Week 8)
1. Cross-reference validation
2. Wizard updates
3. Integration specification updates
4. Documentation

---

## Quality Standards for Canonical Definitions

### Must-Haves
- [ ] Immediately usable by any organization
- [ ] Industry best practices encoded
- [ ] Tool-agnostic (recommend, don't mandate)
- [ ] Clear adaptation guidance
- [ ] Cross-references to related definitions
- [ ] Success metrics that are measurable

### Nice-to-Haves
- [ ] References to authoritative sources (books, frameworks)
- [ ] Common pitfalls section
- [ ] Maturity levels (basic → intermediate → advanced)
- [ ] Integration points with other tracks

---

## Value Proposition

### For Startups
"Adopt EPF and get 100+ battle-tested operational procedures ready to use"

### For Scale-ups  
"Your ops runbook already written - just customize and execute"

### For Enterprises
"Standardized operating model that accelerates M&A integration"

---

## Open Questions

1. **Naming convention**: Keep `features/` separate or unify under `definitions/`?

2. **Granularity**: One definition per L3, or some L3s need multiple definitions?

3. **Versioning**: How to handle definition evolution vs value model evolution?

4. **Customization markers**: How to indicate which parts are meant to be customized?

5. **Maturity tiers**: Should definitions have basic/intermediate/advanced variants?

---

## Estimated Effort

| Phase | Items | Est. Hours per Item | Total Hours |
|-------|-------|---------------------|-------------|
| Foundation | 3 schemas + structure | 8 | 24 |
| OrgOps | 51 definitions | 2 | 102 |
| Commercial | 24 definitions | 2 | 48 |
| Strategy | 27 definitions | 2.5 | 68 |
| Validation | - | - | 24 |
| **Total** | **102 definitions** | - | **~266 hours** |

With AI assistance for first drafts, this could be reduced to ~80-100 hours of human review/refinement.

---

## Next Steps

1. **Decision**: Approve this direction and scope
2. **Schema**: Create base + extension schemas
3. **Prototype**: Create 3-5 OrgOps definitions as proof of concept
4. **Review**: Validate structure with real usage
5. **Scale**: Generate remaining definitions with AI assistance
6. **Polish**: Human review and refinement
