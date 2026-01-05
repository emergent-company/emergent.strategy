# EPF Guides

> **Last updated**: EPF v1.13.0 | **Status**: Current

This directory contains **conceptual guides** that explain EPF artifacts, their purpose, and how to create them effectively.

## Purpose

Guides provide:
- **Conceptual understanding** of each artifact type
- **Strategic context** for why the artifact matters
- **Best practices** for creating high-quality artifacts
- **Examples** of well-crafted artifacts

## How to Use Guides

### 1. Read Before Creating

Before copying a template, read the corresponding guide to understand:
- **What** the artifact is and its role in EPF
- **Why** it matters for product strategy/execution
- **When** to create or update it
- **How** to approach filling it out
- **What** good looks like (examples)

### 2. Reference During Creation

Keep guides open while working on templates:
- Clarify field meanings
- Check examples for inspiration
- Verify you're covering all important aspects
- Ensure strategic alignment

### 3. Return for Refinement

Use guides to improve existing artifacts:
- Check if you missed important elements
- Validate strategic coherence
- Learn from evolved best practices

## Guide-Template-Schema Pattern

Every EPF artifact follows this pattern:

```
Guide (Markdown)    →  Read to understand the concept
   ↓                   (explains WHY and HOW)
   ↓
Template (YAML)     →  Copy to create your instance
   ↓                   (structured format to fill out)
   ↓
Schema (JSON)       →  Validates your work
                       (ensures technical correctness)
```

**Workflow**:
1. **Read guide** → Understand purpose and approach
2. **Copy template** → Get structured format
3. **Fill content** → Create your artifact
4. **Validate schema** → Ensure correctness

## Available Guides

### Getting Started

| Guide | Purpose | When to Read |
|-------|---------|--------------|
| `ADOPTION_GUIDE.md` | **NEW:** Choose your starting level (0-3), escalate organically as complexity grows | **First time adopting EPF** - read before INSTANTIATION_GUIDE |
| `INSTANTIATION_GUIDE.md` | Complete workflow for creating product instance from scratch | After choosing adoption level - detailed artifact creation steps |
| `HEALTH_CHECK_GUIDE.md` | **NEW:** 3-tier validation system (compliance, coverage, alignment), migration workflows | **When validating artifacts** - understand beyond schema compliance |

### Strategic Foundation Guides (READY Phase)

| Guide | Template | Schema | Purpose |
|-------|----------|--------|---------|
| `NORTH_STAR_GUIDE.md` | `templates/READY/00_north_star.yaml` | `schemas/north_star_schema.json` | Organizational strategic foundation |
| `STRATEGY_FOUNDATIONS_GUIDE.md` | `templates/READY/02_strategy_foundations.yaml` | `schemas/strategy_foundations_schema.json` | Strategic pillars and principles |
| `VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md` | `templates/FIRE/value_model.yaml` | `schemas/value_model_schema.json` | Business value articulation system |
| `PRODUCT_PORTFOLIO_GUIDE.md` | `templates/READY/product_portfolio.yaml` | `schemas/product_portfolio_schema.json` | Product lines, brands, offerings |

### Reference Guides

| Guide | Purpose |
|-------|---------|
| `VALUE_MODEL_ANTI_PATTERNS_REFERENCE.md` | Common pitfalls in value model creation and how to avoid them |
| `UNIVERSAL_TRL_FRAMEWORK.md` | **NEW:** Complete TRL 1-9 scale guidance for all tracks (Product, Strategy, OrgOps, Commercial) |

### Architectural Guides

| Guide | Purpose |
|-------|---------|
| `TRACK_BASED_ARCHITECTURE.md` | EPF's track-based product development model (Learning vs Execution) |

### Workflow & Process Guides

| Guide | Purpose |
|-------|---------|
| `FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md` | End-to-end walkthrough for creating schema-compliant feature definitions |
| `VERSION_MANAGEMENT_AUTOMATED.md` | Automated version management using bump-version.sh script |

### Technical Documentation (Advanced)

Technical guides are located in `technical/` subdirectory:

| Guide | Purpose | Audience |
|-------|---------|----------|
| `technical/EPF_SCHEMA_V2_QUALITY_SYSTEM.md` | Comprehensive quality system for EPF schemas | Schema maintainers, framework developers |
| `technical/HEALTH_CHECK_ENHANCEMENT.md` | Enhanced health check system for instance validation | Framework developers, automation maintainers |
| `technical/schema_enhancement_recommendations.md` | Schema v2.0 evolution (from 8-hour rework learnings, Dec 2025) | Schema designers, product architects |

**Total: 13 guides** (10 main directory + 3 technical subdirectory)

## Guide Structure

Each guide typically contains:

1. **Introduction**
   - What the artifact is
   - Why it matters
   - When to create/update it

2. **Conceptual Framework**
   - Core concepts and terminology
   - Strategic principles
   - Relationships to other artifacts

3. **Creation Guidance**
   - How to approach the work
   - What to include
   - Common pitfalls to avoid

4. **Structure Explanation**
   - Detailed field-by-field guidance
   - Examples for each section
   - Best practices

5. **Examples**
   - Real-world examples (anonymized or reference)
   - Good vs. poor examples
   - Common patterns

6. **Validation**
   - How to check quality
   - Schema validation steps
   - Peer review guidelines

## Related Documentation

- **`../templates/`** - YAML template files to copy and customize
- **`../schemas/`** - JSON schemas for validation
- **`../scripts/validate-schemas.sh`** - Validation script
- **`../wizards/`** - AI-assisted artifact creation wizards
- **`INSTANTIATION_GUIDE.md`** - Complete workflow guide

## Technical Documentation

For technical/architectural documentation about EPF itself:
- See `../technical/` directory
- See root-level files: `README.md`, `MAINTENANCE.md`, `CANONICAL_PURITY_RULES.md`

## Adding New Guides

When adding new guides:

1. Create guide in this directory with `_GUIDE.md` suffix
2. Follow standard guide structure (see above)
3. Create corresponding template in `../templates/`
4. Create corresponding schema in `../schemas/`
5. Update this README with guide entry
6. Update `INSTANTIATION_GUIDE.md` if part of workflow
7. Add cross-references from template to guide

## Notes

- Guides are **conceptual and educational**
- Templates are **operational and structured**
- Schemas are **validation and enforcement**
- All three work together to support artifact creation

## Related Resources

- **Templates Directory**: [../../templates/](../../templates/) - All EPF artifact templates organized by phase
- **Schemas Directory**: [../../schemas/](../../schemas/) - JSON schemas for validation
- **Wizards Directory**: [../../wizards/](../../wizards/) - Interactive AI-guided artifact creation
- **Guide**: [INSTANTIATION_GUIDE.md](./INSTANTIATION_GUIDE.md) - Complete workflow for creating EPF instances
- **Root**: [../../README.md](../../README.md) - EPF framework overview and structure
