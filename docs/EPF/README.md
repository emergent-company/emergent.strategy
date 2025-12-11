# Emergent Product Framework (EPF) Repository - v1.11.0

This repository contains the complete skeleton for managing product, strategy, org & ops, and commercial development using the Emergent Product Framework. It is designed to be an **executable operating system**, managed by a human-in-the-loop with the assistance of an AI Knowledge Agent.

## What's New in v1.11.0

* **Enhanced Strategy Formula Schema:** Major expansion of `strategy_formula_schema.json` to support richer strategic documentation:
  - **Competitive Advantages**: Now supports structured objects with `name`, `description`, `defensibility`, and `evidence` fields (in addition to simple strings)
  - **Competitor Analysis**: New `vs_competitors` array with detailed competitor-by-competitor analysis including `their_strength`, `our_angle`, `wedge`, and `key_differences`
  - **Competitive Positioning Summary**: New section for summarizing positioning options and unique combinations
  - **Ecosystem Differentiation**: New top-level section for documenting ecosystem components, synergies, and expansion vectors
  - **Success Metrics**: New section with `leading_indicators` and `lagging_indicators` for measuring strategy success
  - **Enhanced Risk Tracking**: Risks now support `likelihood`, `impact`, and `monitoring` fields
  - **Validation Fields**: New `confidence_rationale` and `next_validation_needed` fields
  - **Change Log**: Top-level `change_log` array for tracking document evolution
  - **Flexible Fields**: Most array fields now support both simple strings and structured objects using `oneOf`
* **Backward Compatible**: All existing strategy formula documents remain valid

### Migration from v1.10.1

1. **No action required** if your strategy formulas use simple string arrays
2. **Optional enhancement**: Expand your `advantages`, `constraints`, `risks`, etc. to use the richer object format
3. **Update _meta.yaml:** Set `epf_version: "1.11.0"`

## What's New in v1.10.1

* **Product Portfolio Support (NEW):** New `product_portfolio.yaml` artifact and schema for organizations with multiple product lines:
  - **Product Lines**: Track distinct products with their own value models (software, hardware, services)
  - **Product Line Relationships**: Document how products interact (controls, monitors, integrates_with)
  - **Brand Architecture**: Flexible brand identities at various granularities (product_lines, components, offerings)
  - **Offerings**: Concrete commercial implementations that customers purchase
  - See `PRODUCT_PORTFOLIO.md` for complete documentation and examples
* **New Schema**: `schemas/product_portfolio_schema.json` for validating portfolio artifacts
* **Fixed North Star Template**: YAML structure corrected for `value_conflicts` placement
* **Enhanced Validation**: `scripts/epf-health-check.sh` now validates version consistency across all files

### Migration from v1.9.7

1. **No action required** if you have a single product
2. **For multi-product organizations:** Create `product_portfolio.yaml` in your instance using the template
3. **Update _meta.yaml:** Set `epf_version: "1.10.1"`

## What's New in v1.9.7

* **Work Packages Fully Removed:** EPF no longer contains any work package references. Key Results (KRs) are the lowest level EPF defines. Work packages are created by spec-driven development tools (Linear, Jira, etc.) that consume EPF's output.
* **Clear Boundary Definition:**
  - **EPF owns:** North Star → Analyses → Opportunity → Strategy → OKRs → Key Results → Feature Definitions
  - **Spec tools own:** Work Packages → Tasks → Tickets → Pull Requests
* **KRs as "Meta Work Packages":** Key Results are measurable strategic milestones. They are handed off to implementation tools which decompose them into work packages.
* **Referential Integrity Rules (NEW):** Formal rules for ID references across artifacts:
  - Forward references MUST resolve (e.g., `linked_to_kr` must point to existing KR)
  - Deletion requires cascade check (search and update all referencing files)
  - Feature Definition ↔ KR bidirectional integrity enforced
  - Automated validation script provided in `MAINTENANCE.md`
* **Updated Schemas:** `roadmap_recipe_schema.json` and `assessment_report_schema.json` no longer contain work package definitions.
* **Simplified Roadmap:** `05_roadmap_recipe.yaml` contains only OKRs, assumptions, solution scaffold, and KR-level execution planning.
* **KR-Level Assessment:** `assessment_report.yaml` tracks outcomes at the Key Result level with learnings, not work package completion status.
* **Updated Wizards:** All agent prompts (Pathfinder, Synthesizer, Product Architect) updated to reflect KR-based workflow.

### Migration from v1.9.6

1. **No action required** if you weren't using work packages in your instance
2. **Update _meta.yaml:** Set `epf_version: "1.9.7"`
3. **Update any custom tooling:** If you built integrations that consumed work packages from EPF, migrate to consuming KRs instead

## What's New in v1.9.6

* **Work Packages Scope Clarified:** EPF no longer defines work packages. Work packages and tasks belong entirely to the spec-driven tools domain. This creates a cleaner separation of concerns:
  - **EPF owns:** Objectives → Key Results → Feature Definitions
  - **Spec tools own:** Work Packages → Tasks
* **KRs are the "Meta Work Packages":** Key Results define measurable milestones. They are the highest-level unit that gets handed off to spec-driven tools. EPF does not decompose KRs into work packages - that's the tool's responsibility.
* **Feature Definitions as Primary Interface:** Feature definitions translate KR intent into capabilities, scenarios, and boundaries that spec-driven tools consume. They are the "API" between EPF and implementation.
* **Roadmap Simplified:** The `05_roadmap_recipe.yaml` now contains only:
  - OKRs (Objectives and Key Results)
  - Riskiest Assumptions
  - Solution Scaffold (components, architecture principles, constraints)
  - Cross-track dependencies (between KRs, not work packages)
  - Timeline and milestones
* **Integration Specification Updated:** `integration_specification.yaml` v1.2.0 reflects the corrected work hierarchy.

## What's New in v1.9.5

* **Feature Definitions as Implementation Bridge:** The `/phases/FIRE/feature_definitions/` directory now has formal guidance for creating feature definition documents that bridge EPF strategy to spec-driven implementation tools.
* **N:M Value Model Mapping:** Feature definitions explicitly support many-to-many relationships with value model components - features often cross-cut multiple L2/L3 components.
* **Tool-Agnostic Export Format:** Feature definitions are designed to be consumed by external spec-driven development tools (e.g., specification frameworks, AI coding agents) without EPF being coupled to any specific tool.
* **Lean Documentation Principles:** New framework philosophy emphasizes that git handles versioning and history - EPF artifacts should not duplicate what can be inferred from repository state.
* **Immutable Ledger for AI Context:** Decision history and what NOT to do is as important as what to do - git history provides organizational memory for AI agents.

## What's New in v1.9.4

* **North Star Document:** New `00_north_star.yaml` captures organizational-level strategic foundation:
  - **Purpose:** Why the organization exists
  - **Vision:** Where we imagine being in 5-10 years (organizational, not product-specific)
  - **Mission:** What we do to deliver value
  - **Values:** Normative rules for behavior and decisions
  - **Core Beliefs:** First principles that underpin all reasoning
* **Stability Layer:** North Star is reviewed annually or during major pivots, providing stable context for cycle-specific work
* **File Renumbering:** All READY phase files renumbered to accommodate North Star at position 00:
  - `00_north_star.yaml` (NEW - organizational foundation)
  - `01_insight_analyses.yaml` (was 00 - cycle analyses)
  - `02_strategy_foundations.yaml` (was 01 - cycle strategy foundations)
  - `03_insight_opportunity.yaml` (was 02 - cycle opportunity)
  - `04_strategy_formula.yaml` (was 03 - cycle formula)
  - `05_roadmap_recipe.yaml` (was 04 - cycle roadmap)
* **Alignment Tracking:** North Star explicitly documents how it informs each READY phase artifact
* **Consistency Protocol:** All cycle-specific work must align with North Star

## What's New in v1.9.3

* **Strategic Foundations Document:** New `01_strategy_foundations.yaml` captures four core strategic artifacts: Product Vision, Value Proposition, Strategic Sequencing, and Information Architecture. These are living documents that inform the strategy formula.
* **Two-Tier Strategy Phase:** STRATEGY phase now has two artifacts:
  - `01_strategy_foundations.yaml` - Strategic foundations (living document, refined through AIM)
  - `03_strategy_formula.yaml` - Winning formula synthesized from foundations
* **File Renumbering:** READY phase files renumbered to accommodate foundations:
  - `00_insight_analyses.yaml` (unchanged)
  - `01_strategy_foundations.yaml` (NEW)
  - `02_insight_opportunity.yaml` (was 01)
  - `03_strategy_formula.yaml` (was 02)
  - `04_roadmap_recipe.yaml` (was 03)
* **Consistency Protocol:** Changes to foundations trigger updates to strategy formula, similar to how analyses inform opportunity.
* **Enhanced Calibration:** `calibration_memo.yaml` now includes `foundations_updates` for feedback loop.

## What's New in v1.9.2

* **Track-Based Roadmap Structure:** The roadmap (`05_roadmap_recipe.yaml`) is now organized by four parallel tracks (Product, Strategy, Org/Ops, Commercial) to align with the four value models in the FIRE phase. Each track has its own OKRs, assumptions, and solution scaffold.
* **Cross-Track Dependency Management:** New `cross_track_dependencies` section explicitly maps dependencies between Key Results across tracks.
* **Updated Roadmap Schema:** `roadmap_recipe_schema.json` now validates the track-based structure with proper ID prefixes (p/s/o/c).
* **Track-Specific Assessment:** `assessment_report.yaml` now organizes assessments by track for clearer performance tracking.
* **Specialized INSIGHT Agents:** Four new specialized agents (`01_trend_scout`, `02_market_mapper`, `03_internal_mirror`, `04_problem_detective`) help teams quickly establish first-draft foundational analyses following the 80/20 principle.

## What's New in v1.9.1

* **Three-Stage READY Phase:** The READY phase is now formally structured as INSIGHT → STRATEGY → ROADMAP, providing a complete progression from opportunity identification to execution planning.
* **New READY Artifacts:** Three new comprehensive artifacts replace the simple legacy files:
  - `01_insight_opportunity.yaml` - Captures market opportunities with evidence and value hypothesis
  - `02_strategy_formula.yaml` - Defines competitive positioning, business model, and winning formula
  - `03_roadmap_recipe.yaml` - Consolidates OKRs, assumptions, solution scaffold, and execution plan
* **Enhanced Schemas:** Three new schemas validate the READY phase artifacts with full traceability support
* **Updated AI Agents:** Pathfinder and Synthesizer agent prompts now guide teams through the full three-stage READY flow
* **Enhanced AIM Phase:** Assessment and calibration artifacts now reference roadmaps and provide structured inputs for the next READY cycle
* **Legacy Archive:** Original simple files moved to `_legacy` folders to prevent confusion

## What's New in v1.9.0

* **Formalized Workflow Architecture:** This version introduces a new `/phases/FIRE/workflows` directory to formalize the management of state machines and their configurations. This promotes a more robust, scalable, and configurable approach to building product features.
* **Feature Definition Artifacts:** A new `/phases/FIRE/feature_definitions` directory has been added to store detailed, human-readable product feature definition documents.
* **New `workflow_schema.json`:** A new schema is included to validate the structure of state machine definitions and their corresponding configuration files.
* **Enhanced `value_model_schema.json`:** The value model schema has been updated to include an optional `premium: boolean` flag for L3 sub-components, allowing for clear distinction of premium features.

## Core Philosophy

EPF is built on a few key principles:
1. **READY → FIRE → AIM:** A core operating loop focused on learning and calibration under uncertainty.
2. **80/20 Principle:** We focus on the 20% of work that yields 80% of the learning and value.
3. **De-risking through Falsification:** We prioritize testing our riskiest assumptions and aim to disprove them quickly to accelerate learning.
4. **Traceability:** Every piece of work is traceable from a strategic objective down to its implementation and resulting outcome.
5. **Lean Documentation:** Git handles versioning and history - EPF artifacts should not duplicate what can be inferred from repository state.
6. **Immutable Ledger:** Decision history (including what NOT to do) provides organizational memory for AI agents and team members.

## Work Hierarchy and Handoff Point

EPF defines a clear hierarchy of work, with a defined handoff point to spec-driven implementation tools:

```
EPF DOMAIN                              SPEC-DRIVEN TOOL DOMAIN
──────────────────────────────────────  ──────────────────────────────
Objective (O)                           
  │ "What are we trying to achieve?"    
  │                                     
  └──► Key Result (KR)                  
        │ "Measurable milestone"        
        │ (the meta work package)       
        │                               
        └──► Feature Definition          
              │ "Capabilities,          
              │  scenarios, boundaries" 
              │                         
        ══════╪═════════════════════════  ◄── HANDOFF POINT
              │                         
              └──────────────────────────► Work Packages
                                            │ "Buildable units"
                                            │
                                            └──► Tasks
                                                  "Atomic implementation"
```

### Key Principles

- **Objectives set direction.** They answer "What are we trying to achieve?"
- **Key Results are the meta work packages.** They define measurable milestones that get handed off.
- **Feature Definitions are the interface.** They translate KR intent into capabilities, scenarios, and boundaries that tools can parse.
- **Work Packages and Tasks belong to spec tools.** EPF doesn't define or track implementation-level decomposition - that's the tool's domain.

See `integration_specification.yaml` for the complete machine-readable contract.

## Feature Definitions: The Bridge to Implementation

Feature definitions are the **primary output** of EPF that gets consumed by external implementation tools. They bridge the gap between EPF's strategic artifacts (value model, roadmap) and spec-driven development tools (specification frameworks, AI coding agents, etc.).

### Purpose

While the value model answers **WHY** something is valuable (the value generation perspective), feature definitions answer **WHAT** will be built (the implementation perspective). They translate strategic intent into actionable specifications.

### N:M Mapping to Value Model

Feature definitions do NOT map 1:1 to value model components:
- A single feature may contribute value to multiple L2/L3 components
- A single L2/L3 component may receive value from multiple features
- This many-to-many relationship is by design - features are cross-cutting concerns

**Example:** A "Digital Twin" feature might contribute to:
- `Product.Operate.Monitoring` (real-time visibility)
- `Product.Optimize.Recommendations` (AI-driven suggestions)
- `Commercial.Trust.Verification` (audit trail)

### Loose References for Traceability

Feature definitions maintain loose references to:
- `contributes_to`: Which value model L2/L3 paths receive value
- `tracks`: Which roadmap track(s) this feature belongs to
- `assumptions_tested`: Which assumptions from the roadmap this feature helps validate

These are **pointers for traceability**, not rigid dependencies.

### Tool-Agnostic Design

EPF is intentionally agnostic about which spec-driven development tools consume feature definitions:
- Feature definitions define WHAT needs to exist
- External tools (OpenSpec, SpecIt, AI coding agents, etc.) define HOW to implement
- The interface is the feature definition file itself - tools learn to parse it

**For tool developers:** See `integration_specification.yaml` for the machine-readable contract that defines:
- What EPF provides (artifacts, schemas, locations)
- What EPF expects from tools (traceability, anti-patterns)
- Recommended tool behaviors (on read, on complete, on assumption invalidation)
- Example prompts for AI-based tools

### Lean Documentation Approach

Feature definitions follow the lean documentation principle:
- **One file per feature** - no complex folder hierarchies
- **Git handles versioning** - no version fields or change history in the YAML
- **Minimal structure** - only what's needed for implementation tools to consume
- **Let AI infer** - context that can be derived from git history doesn't need explicit documentation

## The READY Phase Structure

The READY phase is subdivided into three sequential sub-phases:

### 1. INSIGHT → Big Opportunity Identified
- Conduct foundational analyses: Trends, Market, Internal (SWOT), User/Problem
- Synthesize insights from analyses to identify opportunity convergence
- Validate opportunities with evidence (quantitative and qualitative)
- Define clear value hypothesis
- Outputs:
  - `01_insight_analyses.yaml` - Living document with 4 foundational analyses
  - `03_insight_opportunity.yaml` - Clear opportunity statement synthesized from analyses

### 2. STRATEGY → Winning Formula Identified
- Define strategic foundations: Product vision, Value proposition, Strategic sequencing, Information architecture
- Ensure foundations are consistent with INSIGHT findings and organizational North Star
- Define competitive positioning and unique value proposition
- Articulate the business model and growth engines
- Identify strategic risks and trade-offs
- Outputs:
  - `02_strategy_foundations.yaml` - Living document with 4 strategic foundations
  - `04_strategy_formula.yaml` - Winning formula synthesized from foundations

### 3. ROADMAP → Recipe for Solution Identified
- Set OKRs and identify riskiest assumptions **per track** (Product, Strategy, Org/Ops, Commercial)
- Create solution scaffold (high-level architecture) for each track
- Define work packages with clear traceability within and across tracks
- Build execution plan with cross-track dependencies and milestones
- Output: `05_roadmap_recipe.yaml` - organized by four tracks, feeds into corresponding value models in FIRE phase

## How to Use This Repository

This skeleton provides the complete directory structure, schemas, and placeholder artifacts. Your team's workflow will involve populating and updating these artifacts as you move through the EPF cycles. The AI Knowledge Agent should use the schemas in the `/schemas` directory to validate all artifacts and assist users via the prompts in the `/wizards` directory.

### Important Files for Maintenance

- **`MAINTENANCE.md`** - Complete consistency checklist for human maintainers
- **`.ai-agent-instructions.md`** - Protocol for AI agents to automatically maintain repository consistency

**Note:** Any change to the EPF repository MUST be followed by a consistency check. AI agents should automatically perform this check using the protocol in `.ai-agent-instructions.md`.

### Workflow
0. **Before Starting EPF Cycles:**
   - Review/Create `00_north_star.yaml` (Purpose, Vision, Mission, Values, Core Beliefs)
   - This provides stable organizational context for all cycles
   - Update only during major strategic shifts or annual review

1. **READY Phase:**
   - Step 1a: Complete/Update `01_insight_analyses.yaml` (INSIGHT - foundational analyses)
   - Step 1b: Complete `03_insight_opportunity.yaml` (INSIGHT - opportunity synthesis)
   - Step 2a: Complete/Update `02_strategy_foundations.yaml` (STRATEGY - strategic foundations)
   - Step 2b: Complete `04_strategy_formula.yaml` (STRATEGY - winning formula synthesis)
   - Step 3: Complete `05_roadmap_recipe.yaml` (ROADMAP) - organized by four tracks:
     - **Product track:** OKRs, assumptions, work packages for core product development
     - **Strategy track:** OKRs, assumptions, work packages for market positioning
     - **Org/Ops track:** OKRs, assumptions, work packages for operational capabilities
     - **Commercial track:** OKRs, assumptions, work packages for go-to-market
   - Note: `01_insight_analyses.yaml` and `02_strategy_foundations.yaml` are living documents that get refined through AIM learnings
   - Note: `00_north_star.yaml` is reviewed annually or during major strategic shifts
   - Note: Original `okrs.yaml`, `assumptions.yaml`, `work_packages.yaml` are now legacy - use the track-based roadmap instead

2. **FIRE Phase:**
   - Execute work packages defined in the roadmap
   - Detail the value models
   - Create feature definitions
   - Maintain traceability via mappings

3. **AIM Phase:**
   - Generate assessment report
   - Create calibration memo
   - Feed learnings back into next READY cycle

### AI Agent Prompts

The `wizards/` directory contains AI agent persona prompts:

**Phase Orchestrators:**
- **pathfinder.agent_prompt.md**: Guides teams through READY phase (all three stages)
- **product_architect.agent_prompt.md**: Guides teams through FIRE phase
- **synthesizer.agent_prompt.md**: Guides teams through AIM phase

**Specialized INSIGHT Analysis Agents** (for 80/20 first-draft creation):
- **01_trend_scout.agent_prompt.md**: Rapid trend analysis (~30 min)
- **02_market_mapper.agent_prompt.md**: Quick market landscape mapping (~45 min)
- **03_internal_mirror.agent_prompt.md**: Honest SWOT assessment (~45 min)
- **04_problem_detective.agent_prompt.md**: User/problem validation (~50 min)

**When to use specialized agents:** For first-time EPF setup or new product initiatives, use the four specialized agents sequentially to quickly establish first versions of the foundational analyses (~2.5-3 hours total). This 80/20 approach gets you to 80% confidence with 20% of the effort. After completing all four analyses, the Pathfinder can help synthesize the opportunity statement and guide through Strategy and Roadmap phases.
