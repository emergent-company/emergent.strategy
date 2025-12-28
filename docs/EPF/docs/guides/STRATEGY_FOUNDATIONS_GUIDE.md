# Strategy Foundations: Living Strategic Artifacts

> **Last updated**: EPF v1.13.0 | **Status**: Current

## Overview

As of EPF v1.9.3, the STRATEGY phase includes a **two-tier structure**:

1. **Strategic Foundations** (`01_strategy_foundations.yaml`) - Living document with four core strategic artifacts
2. **Strategy Formula** (`03_strategy_formula.yaml`) - Winning formula synthesized from foundations

This mirrors the INSIGHT phase structure where analyses inform opportunity.

## The Four Strategic Foundations

### 1. Product Vision
**What:** Aspirational 3-5 year future state
**Purpose:** Inspire the team and provide long-term direction
**Key Elements:**
- Vision statement (2-3 sentences)
- Success indicators (observable outcomes)
- Alignment with trends and opportunity
- Competitive differentiation

**Why Living:** As you learn from cycles, your vision may expand, narrow, or shift timing.

### 2. Value Proposition
**What:** Clear articulation of value delivered (functional, emotional, economic)
**Purpose:** Define what users get and why it matters
**Key Elements:**
- Target segment (from User/Problem Analysis)
- Jobs-to-be-done and how you do them better
- Functional benefits, emotional value, economic impact
- Proof points and evidence
- Consistency checks against INSIGHT

**Why Living:** As you validate assumptions, you refine exactly what value resonates and how to articulate it.

### 3. Strategic Sequencing
**What:** Deliberate order of value delivery and market expansion
**Purpose:** Define "how we get there from here"
**Key Elements:**
- Sequencing principle (e.g., "land and expand")
- Phases with target segments, value delivered, success criteria
- Strategic rationale for each phase
- Dependencies and risks

**Why Living:** Actual execution teaches you what sequence works. You may accelerate, delay, or reorder phases.

### 4. Information Architecture
**What:** How users conceptualize, navigate, and interact with solution
**Purpose:** Ensure solution matches user mental models
**Key Elements:**
- Architecture philosophy (organizing principle)
- User mental model (what they think in terms of)
- Primary structure (navigation, objects, relationships)
- Interaction patterns
- Design principles

**Why Living:** User research and usability testing reveal what IA actually works vs. what you assumed.

## Why Separate from Strategy Formula?

**Foundations = The Building Blocks**
- More detailed and exploratory
- Revised as you learn
- Semi-structured (allows strategic thinking)
- Changed iteratively through cycles

**Formula = The Synthesis**
- Distilled positioning statement
- More stable across cycles
- Structured for traceability
- Changed strategically (pivots)

## Consistency Protocol

Changes cascade through the READY phase:

```
00_insight_analyses.yaml (trends, market, SWOT, user/problem)
    ↓ informs
02_insight_opportunity.yaml (opportunity statement)
    ↓ informs
01_strategy_foundations.yaml (vision, value prop, sequencing, IA)
    ↓ informs
03_strategy_formula.yaml (winning formula)
    ↓ informs
04_roadmap_recipe.yaml (execution plan)
```

**Change Triggers:**
- If INSIGHT changes → review and update foundations
- If foundations change → update strategy formula
- If strategy formula changes → update roadmap

The `01_strategy_foundations.yaml` file tracks:
- `consistency_validation` section - confirms alignment with INSIGHT
- `known_tensions` - documents trade-offs
- `change_log` - tracks what changed and why
- `triggered_updates` - lists downstream updates needed

## When to Update Foundations

**During READY Phase:**
- Initial creation: Define all four foundations before finalizing strategy formula
- Refinement: Iterate based on team discussions and validation

**During AIM Phase (Calibration):**
- `calibration_memo.yaml` includes `foundations_updates` field
- Specifies what to revise in next cycle based on learnings
- Examples:
  - Vision timing shifts based on market movement
  - Value prop refined based on what users actually valued
  - Sequencing reordered based on what unlocked traction
  - IA adjusted based on usability findings

## Example: How Foundations Inform Formula

**From Foundations:**
```yaml
product_vision:
  vision_statement: "A world where remote managers feel confident without micromanaging"

value_proposition:
  headline: "Passive visibility for confident remote management"
  functional_value: "Eliminate manual status collection"
  emotional_value: "Feel in control without interrupting team"

strategic_sequencing:
  phases:
    - phase: 1
      name: "Beachhead"
      target_segment: "First-time remote managers at SMBs"
      focus: "Solve hair-on-fire status update problem"
```

**To Formula:**
```yaml
positioning:
  unique_value_proposition: "We give first-time remote managers passive visibility so they can lead confidently without micromanaging"
  
  target_segment: "SMB first-time remote managers (50-person companies)"
  
  competitive_differentiation: "We eliminate status updates entirely through passive tracking, while competitors require manual updates"

competitive_moat:
  - type: "Network effects"
    description: "More team data = better intelligence"
  
business_model:
  revenue_model: "Freemium SaaS"
  entry_segment: "First-time remote managers (Beachhead)"
```

## Benefits of This Structure

1. **Strategic Depth:** Foundations provide richer context than formula alone
2. **Iterative Refinement:** Living documents evolve with learning
3. **Consistency Enforcement:** Explicit links ensure alignment
4. **Team Alignment:** Detailed foundations help everyone understand strategy
5. **Traceability:** Clear chain from insights → foundations → formula → roadmap

## AI Agent Support

The **Pathfinder agent** guides teams through both tiers:
1. First, complete four strategic foundations (with detailed prompts)
2. Then, synthesize into strategy formula

This ensures strategy is grounded in thorough strategic thinking, not just high-level positioning.

## Related Resources

- **Template**: [02_strategy_foundations.yaml](../../templates/READY/02_strategy_foundations.yaml) - Template for documenting product vision, value proposition, strategic thrusts, and success metrics
- **Template**: [04_strategy_formula.yaml](../../templates/READY/04_strategy_formula.yaml) - Template showing how to synthesize foundations into winning formula
- **Schema**: [strategy_foundations_schema.json](../../schemas/strategy_foundations_schema.json) - Validation schema for strategic foundations
- **Schema**: [strategy_formula_schema.json](../../schemas/strategy_formula_schema.json) - Validation schema for strategy formula
- **Guide**: [NORTH_STAR_GUIDE.md](./NORTH_STAR_GUIDE.md) - Organizational-level strategic foundation that shapes cycle strategy
- **Wizard**: [pathfinder.agent_prompt.md](../../wizards/pathfinder.agent_prompt.md) - AI assistant for creating strategic foundations
