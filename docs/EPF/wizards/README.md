# EPF Wizards

AI-assisted artifact creation and validation guides.

---

## What Are Wizards?

**Wizards** are AI agent prompts that guide step-by-step creation of EPF artifacts. They differ from:

- **Guides** (`docs/guides/`) - Conceptual explanations (read to understand **WHY**)
- **Templates** (`templates/`) - Structured formats (copy to create **WHAT**)
- **Wizards** (`wizards/`) - AI-assisted workflows (use to create **HOW**)

Wizards provide conversational, adaptive guidance for AI agents assisting humans through EPF workflows.

### EPF's Scope: Strategic Artifacts Only

**IMPORTANT:** EPF wizards help create **strategic artifacts** (value models + feature definitions), NOT technical implementation (implementation specs + code).

EPF uses Simon Sinek's WHY-HOW-WHAT framework. Each level contains overlapping WHY-HOW-WHAT elements. The WHAT from one level becomes context for the next level's HOW decisions. This tight coupling ensures emergence.

| Level | Artifact | WHY-HOW-WHAT | EPF Creates (✅) | Engineering Creates (❌) |
|-------|----------|--------------|------------------|--------------------------|
| **1** | Value Model | WHY + HOW (strategic) | ✅ Purpose, value drivers, capabilities | - |
| **2** | Feature Definition | HOW + WHAT (tactical/strategic) | ✅ Scenarios, contexts, outcomes, criteria | - |
| **3** | Implementation Spec | HOW + WHAT (technical) | - | ❌ APIs, schemas, architecture |
| **4** | Code | WHAT (concrete) | - | ❌ Source code, tests, deployments |

**Critical Distinction:** Feature definitions contain strategic WHAT (outcomes like "Alert within 30 seconds"), NOT technical WHAT (endpoints like "WebSocket `/ws/alerts`").

**Handoff Point:** EPF artifacts (Levels 1-2: strategic WHY+HOW) → Engineering artifacts (Levels 3-4: technical HOW+WHAT)

Wizards guide you through creating outcome-oriented strategic specifications. Engineering teams use your EPF artifacts to create technical specifications and code.

---

## When to Use Wizards

**Use wizards when:**

1. User asks to create EPF artifact (feature, roadmap, value model, etc.)
2. User requests AI assistance with EPF workflow
3. Before committing to FIRE phase (use `balance_checker`)
4. Creating complex artifacts from scratch (features with personas, scenarios, contexts)
5. User mentions phase name + "help" (e.g., "help me with READY phase")

**Don't use wizards when:**

- User just wants to read/understand concepts (use guides instead)
- User asks for validation only (use scripts instead)
- Simple template copying without AI assistance

---

## Wizard Types

### Onboarding (Start Here) ✨

| Wizard | Purpose | When to Use | Duration |
|--------|---------|-------------|----------|
| [`start_epf.agent_prompt.md`](start_epf.agent_prompt.md) ✨ **NEW** | Interactive onboarding for new users | User says "start epf", "help me with epf", "what is epf?" | 5-10 min |

**The Start EPF wizard is the entry point for users new to EPF.** It provides:
- Friendly introduction to EPF concepts
- Interactive questions to determine the best path
- Routing to appropriate wizards based on team size and goals
- Option to explore on their own or abort anytime

**Trigger phrases:** "start epf", "begin epf", "help me with epf", "what is epf?", "how do I use epf?", "I'm new to epf"

---

### Phase-Level Agents (Complete Workflows)

These guide entire EPF phases from start to finish.

| Wizard | Phase | Adoption Level | Purpose | Duration | Output |
|--------|-------|----------------|---------|----------|--------|
| [`lean_start.agent_prompt.md`](lean_start.agent_prompt.md) | **READY** | **Level 0-1** | Minimal viable READY phase for solo founders and small teams | 2-6 hours | North Star + lightweight artifacts |
| [`pathfinder.agent_prompt.md`](pathfinder.agent_prompt.md) | **READY** | **Level 2+** | Complete READY phase with comprehensive analysis | 8-12 hours | All 6 READY artifacts |
| [`product_architect.agent_prompt.md`](product_architect.agent_prompt.md) | **FIRE** | **All levels** | Guide feature definitions + value models | Ongoing | Feature definitions, value models, workflows |
| [`synthesizer.agent_prompt.md`](synthesizer.agent_prompt.md) | **AIM** | **All levels** | Guide assessment + calibration | 4-6 hours | Assessment report, calibration memo |

**Choosing the right READY wizard:**

**Use Lean Start when:**
- Solo founder or 1-2 person team (Level 0)
- Small team 3-5 people, first time with EPF (Level 1)
- User says: "I want to start lean", "minimum viable EPF", "just getting started"
- User mentions: "MVP", "solo founder", "quick start"
- Time available: 2-6 hours (not 8-12 hours)

**Use Pathfinder when:**
- Team size 6+ people (Level 2+)
- Need comprehensive strategic analysis
- Investors asking "What's the strategy?"
- User says: "Let's do full READY phase", "complete strategic planning"
- Time available: 8-12 hours for deep analysis

**General usage:**
- User says: "Let's do the READY phase" → Ask team size, use appropriate wizard
- User says: "Help me create features" → Use Product Architect
- User says: "Let's assess our last cycle" → Use Synthesizer

---

### READY Sub-Wizards (Insight Analysis - 01)

These are specialized wizards for creating `01_insight_analyses.yaml` content. Use them to gather input before running full pathfinder.

| Wizard | Purpose | Duration | Output |
|--------|---------|----------|--------|
| [`01_trend_scout.agent_prompt.md`](01_trend_scout.agent_prompt.md) | Rapid trend analysis | 30-45 min | Trends section for `01_insight_analyses` |
| [`02_market_mapper.agent_prompt.md`](02_market_mapper.agent_prompt.md) | Market dynamics analysis | 45-60 min | Market forces section for `01_insight_analyses` |
| [`03_internal_mirror.agent_prompt.md`](03_internal_mirror.agent_prompt.md) | Internal capability assessment | 45-60 min | Org state section for `01_insight_analyses` |
| [`04_problem_detective.agent_prompt.md`](04_problem_detective.agent_prompt.md) | Deep problem investigation | 60-90 min | Problem insights for `01_insight_analyses` + `03_insight_opportunity` |

**When to use:**
- User says: "Analyze trends in [domain]"
- User says: "What are the market dynamics?"
- User says: "Assess our internal capabilities"
- User says: "Investigate this problem deeply"
- Before running pathfinder (gather insights first)

**Workflow:**
1. Run 1-4 sub-wizards to gather insights (parallel or sequential)
2. Synthesize results into `01_insight_analyses.yaml`
3. Continue with pathfinder for remaining READY artifacts

---

### Specialized Wizards

#### AIM Trigger Assessment (NEW in v2.0.0) ✨

| Wizard | Purpose | When to Use | Duration |
|--------|---------|-------------|----------|
| [`aim_trigger_assessment.agent_prompt.md`](aim_trigger_assessment.agent_prompt.md) | Decide if immediate AIM warranted based on ROI | Weekly monitoring or when unexpected signal arises | 10-30 min assessment |

**Why this matters:** Traditional frameworks treat retrospectives as calendar-driven (quarterly only). EPF treats AIM as **investment decision**—run when ROI justifies cost, not just on calendar. Waiting 8-10 weeks to discover you're building the wrong thing can waste $20K-$100K+.

**Core principle:** AIM costs $300-$1,500 (2-10 hours depending on level). Wrong direction costs $5K-$50K+ per week. **Trigger when savings > cost.**

**When to use:**
- Weekly monitoring check (routine)
- User says: "Should we recalibrate now or wait?"
- Metric dropped significantly
- Assumption test failed (RAT result)
- Unexpected opportunity emerged
- Cross-team dependency broke (Level 3)
- Team debate about continuing current direction

**Trigger conditions assessed:**
1. **ROI threshold:** Potential waste > 10-30x AIM cost
2. **Assumption invalidation:** Critical RAT fails
3. **Opportunity capture:** 10x+ impact signal with high confidence
4. **Dependency failure:** Cross-team blocker (Level 3)

**Example flow:**
```markdown
Week 3 of quarter:
1. Routine weekly check: Feature adoption 60% below target
2. Use aim_trigger_assessment wizard
3. Calculate: $3K/week waste × 7 weeks remaining = $21K potential waste
4. ROI: $21K / $600 AIM cost = 35x → TRIGGER IMMEDIATELY
5. Run AIM session, pivot before wasting more resources
```

**Success criteria:** Clear go/no-go decision with documented ROI calculation

---

#### Balance Checker

| Wizard | Purpose | When to Use | Duration |
|--------|---------|-------------|----------|
| [`balance_checker.agent_prompt.md`](balance_checker.agent_prompt.md) | Roadmap viability assessment | After creating `05_roadmap_recipe.yaml`, **before FIRE phase** | 30-60 min |

**Why this matters:** EPF's "braided model" has 4 interdependent tracks (Product, Strategy, OrgOps, Commercial). Balance checker prevents:
- Over-commitment (ambitions exceed capacity)
- Imbalanced portfolios (one track dominates)
- Circular dependencies (Track A blocks Track B blocks Track A)
- Timeline infeasibility (dependencies create impossible sequencing)

**Success criteria:** Viability score ≥ 75/100 before FIRE phase commitment

**When to use:**
- User says: "Is this roadmap viable?"
- User says: "Check if we're over-committed"
- User mentions: "Balance check" or "viability assessment"
- Workflow reaches: "Balance Assessment" step after roadmap creation
- Before committing resources to FIRE phase

**Example flow:**
```markdown
1. User creates 05_roadmap_recipe.yaml
2. AI Agent: "Let's run a balance check before FIRE phase"
3. Use balance_checker wizard → assess viability
4. If score < 75/100: Recommend adjustments, iterate
5. If score ≥ 75/100: Proceed to FIRE with confidence
```

---

#### Feature Definition Wizard

| Wizard | Purpose | When to Use | Duration |
|--------|---------|-------------|----------|
| [`feature_definition.wizard.md`](feature_definition.wizard.md) | Step-by-step feature creation | Creating feature definitions in FIRE phase | 45-60 min per feature |

**Schema v2.0 requirements:**
- Exactly 4 personas (with 200+ char narratives each)
- 8-field scenario structure (actor, context, trigger, action, outcome, acceptance_criteria)
- Structured contexts (key_interactions, data_displayed arrays)
- Rich dependencies (30+ char rationale)

**When to use:**
- User says: "Create a feature definition"
- User says: "Define a new feature"
- Creating features during FIRE phase
- Need schema v2.0 compliant output

**Integrates with:**
- Guide: `docs/guides/FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md`
- Template: `definitions/product/_template/feature_definition_template.yaml`
- Validator: `scripts/validate-feature-quality.sh`

---

#### Context Sheet Generator

| Wizard | Purpose | When to Use | Duration |
|--------|---------|-------------|----------|
| [`context_sheet_generator.wizard.md`](context_sheet_generator.wizard.md) | Generate user context documentation | Creating user/stakeholder context sheets | 20-30 min per sheet |

**When to use:**
- User says: "Create a context sheet for [persona]"
- Need to document user context for features
- Creating persona documentation

**Template:** [`context_sheet_template.md`](context_sheet_template.md)

---

## Usage Patterns

### Standard Workflow (Artifact Creation)

```
1. Read Guide          → Understand concept
   ├─ docs/guides/
   └─ Why does this artifact exist?

2. Copy Template       → Get structure
   ├─ templates/
   └─ What fields do I need to fill?

3. Use Wizard          → Fill content with AI assistance
   ├─ wizards/         ← YOU ARE HERE
   └─ How do I create quality content?

4. Validate            → Ensure correctness
   ├─ scripts/validate-*
   └─ Does this meet schema requirements?
```

### Example: Feature Definition Creation

```markdown
1. **Read**: `docs/guides/FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md`
   - Understand personas, scenarios, contexts, dependencies

2. **Copy**: `definitions/product/_template/feature_definition_template.yaml`
   - Get blank YAML structure

3. **Use Wizard**: `wizards/feature_definition.wizard.md` OR `wizards/product_architect.agent_prompt.md`
   - AI guides through 7-step creation process
   - Ensures 4 personas, proper scenarios, rich dependencies

4. **Validate**: `scripts/validate-feature-quality.sh definitions/product/path/to/feature.yaml`
   - Check schema compliance
   - Verify persona count, narrative lengths, scenario structure
```

---

## Naming Conventions

**File naming patterns:**

- `*.agent_prompt.md` - **AI agent personas** (conversational, adaptive, context-aware)
  - Examples: `pathfinder.agent_prompt.md`, `balance_checker.agent_prompt.md`
  - Style: Conversational, asks questions, adapts to user responses

- `*.wizard.md` - **Step-by-step guides** (structured, sequential, procedural)
  - Examples: `feature_definition.wizard.md`, `context_sheet_generator.wizard.md`
  - Style: Numbered steps, clear outputs, validation checkpoints

- `##_*.agent_prompt.md` - **READY sub-wizards** (numbered by recommended sequence)
  - Examples: `01_trend_scout.agent_prompt.md`, `02_market_mapper.agent_prompt.md`
  - Style: Specialized analysis focused on one insight domain

**Templates vs Prompts:**
- `*.template.md` - Blank format to copy (e.g., `context_sheet_template.md`)
- `*.agent_prompt.md` - Instructions for AI agent to guide user through filling template

---

## Quick Reference

### By User Intent

| User Says... | Use This Wizard |
|--------------|-----------------|
| "Let's do the READY phase" | `pathfinder.agent_prompt.md` |
| "Create a feature definition" | `feature_definition.wizard.md` or `product_architect.agent_prompt.md` |
| "Is this roadmap viable?" | `balance_checker.agent_prompt.md` |
| "Analyze trends in [domain]" | `01_trend_scout.agent_prompt.md` |
| "What are market dynamics?" | `02_market_mapper.agent_prompt.md` |
| "Assess our capabilities" | `03_internal_mirror.agent_prompt.md` |
| "Investigate this problem" | `04_problem_detective.agent_prompt.md` |
| "Create context sheet" | `context_sheet_generator.wizard.md` |
| "Help with FIRE phase" | `product_architect.agent_prompt.md` |
| "Assess our last cycle" | `synthesizer.agent_prompt.md` |

### By EPF Phase

| Phase | Primary Wizard | Supporting Wizards |
|-------|----------------|-------------------|
| **READY** | `pathfinder.agent_prompt.md` | `01_trend_scout`, `02_market_mapper`, `03_internal_mirror`, `04_problem_detective`, `balance_checker` |
| **FIRE** | `product_architect.agent_prompt.md` | `feature_definition.wizard`, `context_sheet_generator` |
| **AIM** | `synthesizer.agent_prompt.md` | _(none - AIM is retrospective)_ |

### By Artifact Type

| Creating This... | Use This Wizard |
|------------------|-----------------|
| `00_north_star.yaml` | `pathfinder` (Step 1) |
| `01_insight_analyses.yaml` | `pathfinder` (Step 2) + sub-wizards (01-04) |
| `02_strategy_foundations.yaml` | `pathfinder` (Step 3) |
| `03_insight_opportunity.yaml` | `pathfinder` (Step 4) |
| `04_strategy_formula.yaml` | `pathfinder` (Step 5) |
| `05_roadmap_recipe.yaml` | `pathfinder` (Step 6) + `balance_checker` (validation) |
| Feature definitions | `product_architect` or `feature_definition.wizard` |
| Value models | `product_architect` |
| Workflows | `product_architect` |
| Assessment report | `synthesizer` |
| Calibration memo | `synthesizer` |

---

## Integration with EPF Ecosystem

### Wizards + Guides + Templates + Scripts

```
Documentation Layer (Read)
├─ docs/guides/          → Conceptual understanding (WHY/HOW)
│  └─ NORTH_STAR_GUIDE.md
│
Template Layer (Copy)
├─ templates/            → Structured formats (WHAT)
│  └─ READY/00_north_star.yaml
│
Wizard Layer (Create)    ← YOU ARE HERE
├─ wizards/              → AI-assisted creation (HOW with guidance)
│  └─ pathfinder.agent_prompt.md
│
Validation Layer (Verify)
└─ scripts/              → Automated validation (CORRECT)
   └─ validate-schemas.sh
```

**Flow:**
1. **Understand** (docs/guides/) → **Structure** (templates/) → **Create** (wizards/) → **Validate** (scripts/)

### Cross-References

- **Guides Directory**: [`../docs/guides/`](../docs/guides/) - Conceptual understanding
- **Templates Directory**: [`../templates/`](../templates/) - Structured formats
- **Scripts Directory**: [`../scripts/`](../scripts/) - Validation tools
- **Schemas Directory**: [`../schemas/`](../schemas/) - JSON Schema definitions
- **Product Definitions**: [`../definitions/product/`](../definitions/product/) - Feature definition **examples** (not canonical templates)

---

## For AI Agents: How to Use This Directory

**When user requests artifact creation:**

1. **Identify artifact type** from user request
2. **Look up wizard** in Quick Reference tables above
3. **Read wizard file** to understand guidance approach
4. **Follow wizard instructions** step-by-step with user
5. **Validate output** using scripts (if mentioned in wizard)

**Example:**

```markdown
User: "Let's create a feature definition for user authentication"

AI Agent reasoning:
1. Artifact type: Feature definition
2. Quick Reference → Use: product_architect.agent_prompt.md or feature_definition.wizard.md
3. Read: wizards/feature_definition.wizard.md (more structured for single feature)
4. Follow 7-step wizard process with user
5. Validate: scripts/validate-feature-quality.sh path/to/feature.yaml
```

**When user mentions phase name:**

```markdown
User: "Help me with the READY phase"

AI Agent reasoning:
1. Phase: READY
2. By EPF Phase table → Primary wizard: pathfinder.agent_prompt.md
3. Read: wizards/pathfinder.agent_prompt.md
4. Guide user through 6-step READY workflow (artifacts 00-05)
5. Before FIRE commitment: Run balance_checker.agent_prompt.md
```

---

## Version History

- **v2.0.0** (2025-12-28): Added `balance_checker.agent_prompt.md` for roadmap viability assessment
- **v1.12.0**: Added `feature_definition.wizard.md` with schema v2.0 compliance guidance
- **v1.11.0**: Enhanced `product_architect.agent_prompt.md` with value model creation guidance
- **v1.0.0**: Initial wizard collection (pathfinder, product_architect, synthesizer, READY sub-wizards)

---

## Related Documentation

- **Main README**: [`../README.md`](../README.md) - EPF overview and framework introduction
- **Guides**: [`../docs/guides/README.md`](../docs/guides/README.md) - Complete guide catalog
- **Templates**: [`../templates/README.md`](../templates/README.md) - Template structure and usage
- **Scripts**: [`../scripts/README.md`](../scripts/README.md) - Validation and automation tools
- **Maintenance**: [`../MAINTENANCE.md`](../MAINTENANCE.md) - EPF maintenance protocol
- **Copilot Instructions**: [`../.github/copilot-instructions.md`](../.github/copilot-instructions.md) - AI agent quick start

---

**Questions?** Check the main documentation in `docs/` or refer to `MAINTENANCE.md` for comprehensive AI agent guidance.
