# EPF Instantiation Guide

> **Last updated**: EPF v1.13.0 | **Status**: Current

Complete workflow for creating an EPF instance for your product organization.

## Overview

This guide walks you through creating a complete EPF instance from scratch, including:
- Setting up directory structure
- Creating all strategic foundation artifacts (READY phase)
- Defining features and value models (FIRE phase)
- Creating assessment artifacts (AIM phase)
- Validating everything

**Time Estimate**: 2-4 weeks for initial instance creation (varies by organization size/complexity)

## Prerequisites

Before starting:
- [ ] Read `NORTH_STAR_GUIDE.md` to understand EPF philosophy
- [ ] Read root `README.md` to understand EPF structure
- [ ] Have access to canonical EPF repository
- [ ] Have stakeholder buy-in for strategic work
- [ ] Have 4-8 hours per week for focused strategic thinking

## Phase 0: Setup (30 minutes)

### 1. Create Instance Directory

```bash
# In your product repository (e.g., twentyfirst, emergent, lawmatics)
mkdir -p docs/EPF/_instances/{your-product}
cd docs/EPF/_instances/{your-product}
```

### 2. Create Phase Directories

```bash
mkdir -p READY FIRE AIM
```

### 3. Link to Canonical EPF

Add canonical EPF as git subtree (see `MAINTENANCE.md` in canonical EPF):

```bash
# From product repo root
git remote add epf git@github.com:eyedea-io/epf-canonical-definition.git
git subtree add --prefix=docs/EPF epf main --squash
```

## Phase 1: READY - Strategic Foundation (1-2 weeks)

Create strategic foundation artifacts that guide all product decisions.

### Artifact 1: North Star (2-4 hours)

**Purpose**: Define your organization's fundamental purpose and direction.

**Steps**:
1. Read `docs/guides/NORTH_STAR_GUIDE.md` thoroughly
2. Copy template: `cp ../../templates/READY/00_north_star.yaml READY/`
3. Gather stakeholders for workshop (2-3 hours)
4. Fill out sections collaboratively:
   - Purpose (why you exist)
   - Vision (future state)
   - Mission (how you achieve vision)
   - Values (principles guiding decisions)
   - Strategic intent (current focus)
5. Validate: `../../scripts/validate-schemas.sh READY/00_north_star.yaml`
6. Review with leadership team
7. Commit to repository

**Deliverable**: `READY/00_north_star.yaml` (validated)

### Artifact 2: Insight Analyses (4-8 hours)

**Purpose**: Analyze trends, markets, and technology to ground strategy in reality.

**Steps**:
1. Copy template: `cp ../../templates/READY/01_insight_analyses.yaml READY/`
2. Conduct research:
   - Industry trends (3-5 major trends)
   - Market analysis (segments, needs, competition)
   - Technology landscape (emerging tech, capabilities)
   - Customer insights (pain points, behaviors)
3. Document findings in template
4. Validate: `../../scripts/validate-schemas.sh READY/01_insight_analyses.yaml`
5. Share with team for feedback

**Deliverable**: `READY/01_insight_analyses.yaml` (validated)

### Artifact 3: Strategy Foundations (3-6 hours)

**Purpose**: Define strategic pillars and principles that guide decisions.

**Steps**:
1. Read `docs/guides/STRATEGY_FOUNDATIONS_GUIDE.md`
2. Copy template: `cp ../../templates/READY/02_strategy_foundations.yaml READY/`
3. Define strategic pillars (3-5 core themes)
4. Document strategic principles (decision-making rules)
5. Link to North Star and insights
6. Validate: `../../scripts/validate-schemas.sh READY/02_strategy_foundations.yaml`
7. Review with leadership

**Deliverable**: `READY/02_strategy_foundations.yaml` (validated)

### Artifact 4: Product Portfolio (2-4 hours)

**Purpose**: Define product lines, brands, and offerings structure.

**Steps**:
1. Read `docs/guides/PRODUCT_PORTFOLIO_GUIDE.md`
2. Copy template: `cp ../../templates/READY/product_portfolio.yaml READY/`
3. Define product lines (distinct value models)
4. Define product line relationships (integrations, dependencies)
5. Define brand architecture (master, product, sub-brands)
6. Define offerings (SKUs sold to customers)
7. Validate: `../../scripts/validate-schemas.sh READY/product_portfolio.yaml`
8. Review with product team

**Deliverable**: `READY/product_portfolio.yaml` (validated)

### Artifact 5: Insight Opportunities (2-4 hours)

**Purpose**: Identify strategic opportunities discovered from insights.

**Steps**:
1. Copy template: `cp ../../templates/READY/03_insight_opportunity.yaml READY/`
2. Review insight analyses
3. Identify opportunities (gaps, trends, unmet needs)
4. Prioritize by impact and feasibility
5. Validate: `../../scripts/validate-schemas.sh READY/03_insight_opportunity.yaml`

**Deliverable**: `READY/03_insight_opportunity.yaml` (validated)

### Artifact 6: Strategy Formula (2-3 hours)

**Purpose**: Define how you compete and win in the market.

**Steps**:
1. Copy template: `cp ../../templates/READY/04_strategy_formula.yaml READY/`
2. Define competitive positioning
3. Document differentiation factors
4. Specify go-to-market approach
5. Validate: `../../scripts/validate-schemas.sh READY/04_strategy_formula.yaml`

**Deliverable**: `READY/04_strategy_formula.yaml` (validated)

### Artifact 7: Roadmap Recipe (1-2 hours)

**Purpose**: Define high-level roadmap structure and priorities.

**Steps**:
1. Copy template: `cp ../../templates/READY/05_roadmap_recipe.yaml READY/`
2. Define roadmap themes (major initiatives)
3. Sequence themes by priority/dependency
4. Link to strategy foundations
5. Validate: `../../scripts/validate-schemas.sh READY/05_roadmap_recipe.yaml`

**Deliverable**: `READY/05_roadmap_recipe.yaml` (validated)

### Artifact 8: Balance Check (30-60 minutes) ✨ NEW

**Purpose**: Validate roadmap viability before committing to FIRE phase execution.

**Why This Matters**: EPF's "braided model" has 4 interdependent tracks (Product, Strategy, OrgOps, Commercial). Having more short-term ambitious goals than your financing and organization can deliver makes no sense. The Balance Checker prevents over-commitment, imbalanced portfolios, circular dependencies, and timeline infeasibility.

**Steps**:
1. **Prepare Context**:
   - Gather team size, budget, and constraint information
   - Ensure North Star (`00_north_star.yaml`) is complete
   - Ensure Roadmap (`05_roadmap_recipe.yaml`) is filled with real KRs
2. **Run Balance Checker**:
   - Open AI agent (GitHub Copilot, Claude, etc.)
   - Reference: `@wizards/balance_checker.agent_prompt.md`
   - Provide roadmap file and constraint data
3. **Review Viability Assessment**:
   - Overall score (threshold: ≥75/100 for FIRE phase commitment)
   - Resource Viability (30%): Capacity vs requirements
   - Portfolio Balance (25%): Track distribution (ideal: 35-45% Product, 20-30% Strategy, 15-25% OrgOps, 15-25% Commercial)
   - Coherence (25%): Dependency graph, circular detection, timeline feasibility
   - Strategic Alignment (20%): Semantic overlap with North Star
4. **Iterate if Needed** (if score < 75):
   - Review AI recommendations (prioritized by impact)
   - Adjust roadmap (add/remove KRs, rebalance tracks, resolve conflicts)
   - Re-run balance check
   - Repeat until viable (max 5 iterations recommended)
5. **Document Decision**:
   - Save balance assessment report to `.epf-work/balance_assessment_{cycle}.md`
   - Commit roadmap once viability confirmed
   - Note: Balance assessment is working artifact (ephemeral, not tracked in git)

**Deliverable**: Viable roadmap (score ≥75/100) ready for FIRE phase commitment

**Common Issues Caught**:
- **Over-commitment**: 120% capacity utilization → Reduce KRs or extend timeline
- **Imbalanced portfolio**: 80% Product, 0% Strategy → Rebalance tracks
- **Circular dependencies**: KR-A requires KR-B, KR-B requires KR-A → Resolve dependency conflict
- **Timeline infeasibility**: Critical path 20 weeks, cycle only 12 weeks → Adjust scope or timeline
- **Ghost tracks**: 0 OrgOps KRs but Product KRs depend on hiring → Add OrgOps KRs

**Pro Tip**: Run balance check early in roadmap planning (not at the end). It's easier to adjust when roadmap is still draft.

## Phase 2: FIRE - Execution (Ongoing)

Define features, value models, and workflows for product execution.

### Value Models (Per Product Line)

**Purpose**: Articulate value proposition and business model for each product line.

**Steps**:
1. Copy template: `cp ../../templates/FIRE/value_models/value_model.template.yaml FIRE/value_models/{product-line-id}.value_model.yaml`
2. Define value proposition components
3. Document business model
4. Link to product portfolio
4b. (Optional) Add layer-level `solution_steps` for complex layers:
   - 3-5 steps per layer explaining HOW value is delivered
   - Each step: implementation action + resulting capability
   - Particularly valuable for L3/L4 layers (service/infrastructure)
   - See `docs/guides/VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md` for examples
5. Validate against schema

**Deliverable**: One value model per product line

### Feature Definitions (Per Feature)

**Purpose**: Define features with strategic context and implementation guidance.

**Steps**:
1. Copy template: `cp ../../definitions/product/_template/feature_definition_template.yaml FIRE/feature_definitions/fd-{number}-{slug}.yaml`
2. Link to roadmap recipe and value models
3. Define capabilities, scenarios, contexts
4. Document success metrics
5. Validate against schema

**Deliverable**: One feature definition per feature (numbered: fd-001, fd-002, etc.)

### Mappings

**Purpose**: Map features to strategic context (themes, pillars, opportunities).

**Steps**:
1. Copy template: `cp ../../templates/FIRE/mappings.yaml FIRE/`
2. Map each feature to strategic elements
3. Verify alignment
4. Validate against schema

**Deliverable**: `FIRE/mappings.yaml` (validated)

### Workflows (As Needed)

**Purpose**: Define key processes and workflows.

**Steps**:
1. Copy relevant workflow templates from `../../templates/FIRE/workflows/`
2. Customize for your organization
3. Validate against schema

**Deliverable**: Workflow YAML files as needed

## Phase 3: AIM - Assessment (Quarterly)

Create assessment and calibration artifacts to track progress and adjust strategy.

### Assessment Report (Quarterly)

**Purpose**: Periodic assessment of product/market performance.

**Steps**:
1. Copy template: `cp ../../templates/AIM/assessment_report.yaml AIM/assessment_report_{YYYY-Q#}.yaml`
2. Conduct quarterly assessment workshop
3. Document findings, metrics, market changes
4. Identify issues and opportunities
5. Validate against schema

**Deliverable**: One assessment report per quarter

### Calibration Memo (As Needed)

**Purpose**: Document strategic adjustments based on learnings.

**Steps**:
1. Copy template: `cp ../../templates/AIM/calibration_memo.yaml AIM/calibration_memo_{YYYY-MM}.yaml`
2. Document what changed and why
3. Specify adjustments to strategy/roadmap
4. Link to assessment reports
5. Validate against schema

**Deliverable**: Calibration memos as strategic adjustments occur

## Validation

### Schema Validation

Run validation script on all artifacts:

```bash
# From canonical EPF directory
./scripts/validate-schemas.sh _instances/{your-product}
```

Fix any errors reported.

### Cross-Reference Validation

Check that:
- [ ] All feature definitions reference valid value models
- [ ] All mappings reference existing features and strategic elements
- [ ] Product portfolio references match feature definitions
- [ ] All IDs follow naming conventions (fd-001, vm-product-line-id, etc.)

### Quality Review

Review with stakeholders:
- [ ] North Star resonates with team
- [ ] Strategy foundations guide decisions
- [ ] Product portfolio accurately represents offerings
- [ ] Feature definitions are actionable
- [ ] Roadmap recipe aligns with strategy

## Maintenance

### Regular Updates

| Artifact | Update Frequency | Trigger |
|----------|------------------|---------|
| North Star | Annually | Major strategic shifts |
| Insight Analyses | Semi-annually | Market changes |
| Strategy Foundations | Annually | Strategy evolution |
| Product Portfolio | As needed | New products/brands |
| Roadmap Recipe | Quarterly | Roadmap adjustments |
| Feature Definitions | Ongoing | Feature development |
| Value Models | Semi-annually | Business model changes |
| Assessment Reports | Quarterly | End of quarter |
| Calibration Memos | As needed | Strategic adjustments |

### Sync with Canonical EPF

Pull updates from canonical EPF:

```bash
# From product repo root
./docs/EPF/scripts/sync-repos.sh pull
```

See `MAINTENANCE.md` for detailed sync instructions.

## Getting Help

### Resources

- **Guides**: `docs/guides/` - Conceptual explanations
- **Templates**: `templates/` - Structured formats
- **Schemas**: `schemas/` - Validation rules
- **Wizards**: `wizards/` - AI-assisted creation (coming soon)

### Common Issues

**"I don't know what to write in a section"**
→ Read the corresponding guide, check examples in guides, look at other product instances

**"Schema validation fails"**
→ Check error message for specific field, verify ID patterns match schema, ensure all required fields present

**"Our organization doesn't fit the structure"**
→ EPF is flexible - adapt templates to your needs, but preserve core relationships between artifacts

**"This feels like too much work"**
→ Start with North Star and Product Portfolio only, add other artifacts incrementally as value becomes clear

### Support

- Open issue in canonical EPF repository
- Consult with EPF maintainers
- Review other product instances for patterns

## Success Criteria

You've successfully instantiated EPF when:
- ✅ All READY phase artifacts created and validated
- ✅ At least one value model per product line
- ✅ Initial feature definitions for next quarter
- ✅ First assessment report completed
- ✅ Team references artifacts in decision-making
- ✅ Roadmap clearly traces to strategy
- ✅ New features link to strategic context

## Next Steps

After completing initial instantiation:

1. **Use in Decision-Making**: Reference artifacts when making product decisions
2. **Evolve Continuously**: Update artifacts as you learn and market changes
3. **Maintain Quarterly Rhythm**: Conduct regular assessments and calibrations
4. **Share Learnings**: Contribute improvements back to canonical EPF
5. **Scale to Team**: Train team members on using/updating artifacts

Remember: EPF is a living system. Initial creation is just the beginning - value comes from continuous use and evolution.

## Related Resources

- **Templates**: All templates in [templates/](../../templates/) directory organized by phase (READY, FIRE, AIM)
- **Schemas**: All validation schemas in [schemas/](../../schemas/) directory
- **Guide**: [README.md](./README.md) - Index of all EPF guides
- **Guide**: [NORTH_STAR_GUIDE.md](./NORTH_STAR_GUIDE.md) - Organizational strategic foundation
- **Guide**: [VERSION_MANAGEMENT_AUTOMATED.md](./VERSION_MANAGEMENT_AUTOMATED.md) - Version management protocols
