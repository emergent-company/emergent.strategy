# North Star: Organizational Strategic Foundation

> **Last updated**: EPF v1.13.0 | **Status**: Current

## Overview

As of EPF v1.9.4, the framework includes an **organizational-level strategic foundation** that sits above cycle-specific work: the **North Star** (`00_north_star.yaml`).

## What is the North Star?

The North Star is your organization's enduring strategic context - the foundational elements that remain relatively stable across multiple EPF cycles. It answers five fundamental questions:

1. **Purpose:** Why do we exist?
2. **Vision:** Where do we imagine being in 5-10 years?
3. **Mission:** What do we do to deliver value?
4. **Values:** How do we behave and conduct ourselves?
5. **Core Beliefs:** What first principles underpin our reasoning?

## North Star vs. Cycle-Specific Strategy

| Aspect | North Star (`00_north_star.yaml`) | Cycle Strategy (`02_strategy_foundations.yaml`, `04_strategy_formula.yaml`) |
|--------|-----------------------------------|-----------------------------------------------------------------------------|
| **Scope** | Organization-wide | Cycle-specific product/initiative |
| **Timeframe** | 5-10 years | 3-6 months (one cycle) |
| **Stability** | Changes rarely (annual review or major pivot) | Living documents that evolve through cycles |
| **Focus** | Why we exist, who we serve broadly | How we win in a specific opportunity |
| **Example Vision** | "A world where every team works with clarity" | "Remote managers have passive visibility in 3-5 years" |
| **Review Cadence** | Annual or event-triggered | Every cycle (AIM phase) |

## The Five Elements Explained

### 1. Purpose - Why We Exist

**What:** The fundamental reason your organization exists - the problem you exist to solve in the world.

**Example:**
- "We exist to eliminate preventable suffering in healthcare"
- "We exist to help teams do their best work without burnout"
- "We exist to democratize access to world-class education"

**Why it matters:** Purpose gives meaning to work and helps attract aligned team members and customers.

### 2. Vision - Where We Imagine Being

**What:** A vivid, inspiring picture of the future (5-10 years) when you've made meaningful progress toward your purpose.

**Example:**
- "A world where every child has access to personalized learning"
- "Every team works with clarity, alignment, and joy"
- "Healthcare decisions are always informed by the best evidence"

**Why it matters:** Vision provides long-term direction and helps everyone see what success looks like.

### 3. Mission - What We Do

**What:** The concrete activities and offerings that fulfill your purpose and move you toward your vision.

**Example:**
- "We build AI-powered learning platforms that adapt to each student's needs"
- "We create workflow tools that eliminate coordination overhead for distributed teams"
- "We provide clinical decision support that synthesizes the latest evidence"

**Why it matters:** Mission defines your scope - what you do and don't do.

### 4. Values - How We Behave

**What:** Normative rules that guide decisions, behaviors, and culture. These are the non-negotiables.

**Example Values:**
- Customer obsession
- Bias for action
- Ownership
- Transparency
- Excellence
- Simplicity

**Why it matters:** Values resolve trade-offs when competing priorities clash. They define "how we do things here."

**Structure in North Star:**
Each value includes:
- Definition (what it means)
- Expected behaviors (what we do)
- Rejected behaviors (what we don't do)
- Example decision (how it shaped a real choice)

### 5. Core Beliefs - First Principles

**What:** Fundamental assumptions and beliefs that guide your deductive reasoning. These are the "axioms" from which you derive strategy.

**Example Beliefs:**
- About market: "SaaS is moving from seat-based to usage-based pricing"
- About users: "People hire tools for jobs, not features"
- About approach: "The best products emerge from rapid iteration with users"
- About value: "Network effects create the strongest moats"
- About competition: "Incumbents can't disrupt themselves"

**Why it matters:** Beliefs explain your strategic choices. When you make decisions, you're reasoning from these first principles.

**Structure in North Star:**
Each belief includes:
- The belief statement
- Implication (therefore, we...)
- Evidence (what supports this)
- Counter-evidence tracking (what might challenge it)

## How North Star Informs EPF Cycles

The North Star provides **context and constraints** for all cycle-specific work:

```
00_north_star.yaml (stable organizational foundation)
    ↓ informs and constrains
01_insight_analyses.yaml (cycle analyses)
    ↓
03_insight_opportunity.yaml (cycle opportunity)
    ↓
02_strategy_foundations.yaml (cycle strategy foundations)
    ↓
04_strategy_formula.yaml (cycle formula)
    ↓
05_roadmap_recipe.yaml (cycle roadmap)
```

**Specific Connections:**

| North Star Element | Informs Cycle Artifact | How |
|-------------------|------------------------|-----|
| **Purpose** | Opportunity | Opportunities should advance our purpose |
| **Vision** | Product Vision | Cycle product vision is a step toward organizational vision |
| **Mission** | Opportunity & Strategy | Opportunities must be in scope of mission |
| **Values** | Roadmap & Execution | Work is conducted according to values |
| **Core Beliefs** | All analyses | Analyses should validate or challenge beliefs |

## When to Review/Update North Star

### Annual Review (Scheduled)
- Set a calendar date (e.g., every January)
- Review all five elements
- Confirm they still resonate
- Update if organizational direction has shifted

### Event-Based Review (Triggered)
Review when:
- **Major market disruption** - Core beliefs may need updating
- **Significant competitive shift** - Mission or positioning may need refinement
- **Fundamental technology change** - Beliefs about approach may change
- **Business model pivot** - Mission and possibly purpose need rethinking
- **Leadership change** - New leadership may bring different vision/values

### What Changes When
- **Purpose:** Almost never (only in existential pivots)
- **Vision:** Occasionally (timeframe may shift, picture may evolve)
- **Mission:** Sometimes (as you expand or focus)
- **Values:** Rarely (unless cultural reset needed)
- **Core Beliefs:** Regularly (as evidence accumulates)

## Creating Your North Star

### For Existing Organizations

If you're an established organization adding EPF:

1. **Purpose:** Interview founders/leaders - "Why did we start this? What problem compelled us?"
2. **Vision:** Extrapolate from current strategy - "If we execute well for 5-10 years, what changes?"
3. **Mission:** Document current scope - "What do we actually do today?"
4. **Values:** Observe culture - "What behaviors do we reward? What principles guide tough decisions?"
5. **Core Beliefs:** Make implicit explicit - "When we strategize, what assumptions are we making?"

### For New Organizations/Products

If you're starting fresh:

1. **Purpose:** Start here - "Why are we doing this at all?"
2. **Vision:** Paint the future - "What world are we trying to create?"
3. **Mission:** Define scope - "What will we actually build/do?"
4. **Values:** Choose deliberately - "What culture do we want?"
5. **Core Beliefs:** State hypotheses - "What must be true for our approach to work?"

## Using North Star in Practice

### Before Each Cycle
**Pathfinder Agent:** "Let's review the North Star. Has anything changed? Does it still resonate?"

### During INSIGHT Phase
- Check if trends align with/challenge core beliefs
- Validate if opportunity advances purpose
- Confirm opportunity is within mission scope

### During STRATEGY Phase
- Product vision should be a step toward organizational vision
- Value proposition should reflect mission
- Strategic sequencing should align with beliefs

### During AIM Phase (Calibration)
- **Learnings may challenge beliefs** - document counter-evidence
- **Values may be tested** - note if we behaved consistently
- **Vision timing may shift** - adjust if market moves faster/slower

## Example: How North Star Shapes Cycles

**North Star:**
- Purpose: "We exist to help teams do their best work without burnout"
- Vision: "Every distributed team works with clarity and joy"
- Mission: "We build workflow intelligence tools for remote teams"

---

## Related Resources

- **Template**: [00_north_star.yaml](../../templates/READY/00_north_star.yaml) - Template for documenting organizational purpose, vision, and mission
- **Schema**: [north_star_schema.json](../../schemas/north_star_schema.json) - Validation schema for North Star strategic foundation
- **Guide**: [STRATEGY_FOUNDATIONS_GUIDE.md](./STRATEGY_FOUNDATIONS_GUIDE.md) - Cycle-specific strategy that operates within North Star boundaries
- **Guide**: [INSTANTIATION_GUIDE.md](./INSTANTIATION_GUIDE.md) - Guidelines for creating and maintaining EPF instances
- Values: Simplicity, Speed, User obsession
- Belief: "Async-first is the future of knowledge work"

**Cycle Opportunity (must align):**
- ✅ "Remote managers struggle with coordination overhead" → Aligns with purpose
- ❌ "Enterprise needs better compliance reporting" → Off-mission

**Cycle Strategy (must align):**
- Product Vision: "In 3-5 years, remote managers have effortless visibility" → Step toward organizational vision
- Value Prop: "Eliminate status update meetings" → Serves mission
- Sequencing: "Start with async-first early adopters" → Validates belief

**Cycle Roadmap (must align):**
- Value: "Simplicity" → Work packages must prioritize simple UX
- Value: "Speed" → Bias toward shipping and learning
- Belief: "Async-first" → Build for async patterns, not just remote versions of office tools

## Benefits of North Star

1. **Strategic Coherence:** All cycles ladder up to enduring goals
2. **Decision Clarity:** Values and beliefs resolve trade-offs
3. **Team Alignment:** Everyone knows why we exist and where we're going
4. **Focus:** Clear mission boundaries prevent scope creep
5. **Resilience:** Purpose and vision provide stability through cycles
6. **Learning:** Beliefs can be validated or challenged systematically

## See Also

- `00_north_star.yaml` - Complete template with all five elements
- `README.md` - Workflow showing North Star review before cycles
- `wizards/pathfinder.agent_prompt.md` - Guidance for using North Star
- `STRATEGY_FOUNDATIONS.md` - How cycle strategy relates to North Star
