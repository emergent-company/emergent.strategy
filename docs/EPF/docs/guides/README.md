# EPF Guides

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

### Strategic Foundation Guides

| Guide | Template | Schema | Purpose |
|-------|----------|--------|---------|
| `NORTH_STAR_GUIDE.md` | `templates/READY/00_north_star.yaml` | `schemas/north_star_schema.json` | Organizational strategic foundation |
| `STRATEGY_FOUNDATIONS_GUIDE.md` | `templates/READY/02_strategy_foundations.yaml` | `schemas/strategy_foundations_schema.json` | Strategic pillars and principles |
| `PRODUCT_PORTFOLIO_GUIDE.md` | `templates/READY/product_portfolio.yaml` | `schemas/product_portfolio_schema.json` | Product lines, brands, offerings |

### Architectural Guides

| Guide | Purpose |
|-------|---------|
| `TRACK_BASED_ARCHITECTURE.md` | EPF's track-based product development model |

### Workflow Guides

| Guide | Purpose |
|-------|---------|
| `INSTANTIATION_GUIDE.md` | Complete workflow for creating product instance |

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
