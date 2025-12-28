# EPF Documentation

Complete documentation for the Emergent Product Framework (EPF).

## Quick Start

**New to EPF?** Start here:

1. **Understand the framework**: Read `../README.md` in the root directory
2. **Learn strategic concepts**: Browse `guides/` directory
3. **Get practical**: Follow `guides/INSTANTIATION_GUIDE.md` step-by-step
4. **Dive deeper**: Explore `technical/` for EPF architecture

## Documentation Structure

```
docs/
├── README.md (this file)       # Documentation navigation
├── guides/                     # Conceptual guides (read to understand)
│   ├── NORTH_STAR_GUIDE.md            # Strategic foundation guide
│   ├── STRATEGY_FOUNDATIONS_GUIDE.md  # Strategic pillars guide
│   ├── PRODUCT_PORTFOLIO_GUIDE.md     # Portfolio structure guide
│   ├── TRACK_BASED_ARCHITECTURE.md    # Architectural model guide
│   ├── INSTANTIATION_GUIDE.md         # Complete workflow guide
│   └── README.md                      # Guide index
└── technical/                  # EPF technical documentation
    └── (EPF's own architecture docs)
```

## What's in This Directory

### guides/

**Purpose**: Conceptual guides explaining EPF's strategic artifacts, principles, and workflows.

**When to use**: 
- Before creating EPF artifacts (understand what you're building)
- When making strategic decisions (understand principles)
- When learning EPF concepts (understand philosophy)

**What you'll find**:
- Strategic foundation guides (North Star, Strategy Foundations, Product Portfolio)
- Architectural guides (Track-Based Architecture)
- Workflow guides (Instantiation Guide)

**See**: `guides/README.md` for comprehensive guide catalog

### technical/

**Purpose**: EPF's own technical documentation and architecture.

**When to use**:
- When contributing to EPF itself
- When understanding EPF internals
- When customizing EPF for your needs

**What you'll find**:
- EPF architecture documentation
- Development guides for EPF maintainers
- Technical specifications

## Guide-Template-Schema Pattern

EPF uses a three-part system:

```
Guide (Markdown)          Templates (YAML)         Schemas (JSON)
docs/guides/      →      ../templates/     →     ../schemas/
     ↓                        ↓                       ↓
Read to understand      Copy to create          Validates result
    WHY/HOW              structured format      technical correctness
```

**Example**:
1. Read `guides/NORTH_STAR_GUIDE.md` to understand purpose and approach
2. Copy `../templates/READY/00_north_star.yaml` to your instance
3. Fill in the YAML with your content
4. Validate with `../schemas/north_star_schema.json`

## Related Documentation

- **Templates**: `../templates/` - Structured YAML formats to copy and fill
- **Schemas**: `../schemas/` - JSON schemas for validating artifacts
- **Scripts**: `../scripts/` - Automation scripts (validation, sync)
- **Wizards**: `../wizards/` - AI-assisted artifact creation (coming soon)
- **Instances**: `../_instances/` - Example product instances

## Key Documents

| Document | Location | Purpose |
|----------|----------|---------|
| EPF Overview | `../README.md` | Introduction to EPF |
| Maintenance Guide | `../MAINTENANCE.md` | How to manage EPF |
| Canonical Purity Rules | `../CANONICAL_PURITY_RULES.md` | Repository standards |
| North Star Philosophy | `../NORTH_STAR.md` | EPF's own North Star |
| Integration Spec | `../integration_specification.yaml` | Product integration patterns |
| Product Portfolio | `../PRODUCT_PORTFOLIO.md` | EPF product structure |
| Track Architecture | `../TRACK_BASED_ARCHITECTURE.md` | Development model |

## Common Workflows

### Creating a New Product Instance

1. Read `guides/INSTANTIATION_GUIDE.md` (complete step-by-step workflow)
2. Set up directory: `mkdir -p _instances/{your-product}/READY FIRE AIM`
3. Follow phase-by-phase instructions in guide
4. Validate with `../scripts/validate-schemas.sh`

### Understanding a Concept

1. Check `guides/README.md` for relevant guide
2. Read the guide thoroughly
3. Look at corresponding template for structure
4. Check existing instances for examples

### Making Strategic Decisions

1. Review your North Star (`_instances/{product}/READY/00_north_star.yaml`)
2. Check Strategy Foundations for principles
3. Verify alignment with Product Portfolio
4. Reference Feature Definitions for tactical context

### Contributing to EPF

1. Read `../MAINTENANCE.md` for processes
2. Read `../CANONICAL_PURITY_RULES.md` for standards
3. Make changes in canonical EPF repository
4. Sync to product repositories with `../scripts/sync-repos.sh`

## Documentation Principles

### Guides are Conceptual

- **Purpose**: Explain WHY and HOW
- **Audience**: Product leaders, strategists, contributors
- **Format**: Narrative Markdown with examples
- **Usage**: Read before creating artifacts

### Templates are Operational

- **Purpose**: Provide structure for creating artifacts
- **Audience**: Anyone creating EPF instances
- **Format**: Structured YAML with placeholders and comments
- **Usage**: Copy, fill, and customize

### Schemas are Technical

- **Purpose**: Enforce data correctness
- **Audience**: Automation tools, validators
- **Format**: JSON Schema specifications
- **Usage**: Automated validation

## Getting Help

### Resources

- **Conceptual questions**: Read guides in `guides/`
- **Structural questions**: Check templates in `../templates/`
- **Validation errors**: Review schemas in `../schemas/`
- **Process questions**: See `../MAINTENANCE.md`

### Support

- Open issue in canonical EPF repository
- Consult EPF maintainers
- Review other product instances for patterns

## Version

This documentation corresponds to EPF version defined in `../VERSION`.

For changelog and version history, see `../VERSION`.

## Contributing

To improve documentation:

1. Create proposal in canonical EPF repository
2. Follow standards in `../CANONICAL_PURITY_RULES.md`
3. Update relevant guides, templates, and schemas together
4. Maintain guide-template-schema relationships
5. Test with actual product instances

See `../MAINTENANCE.md` for detailed contribution process.

---

**Remember**: Documentation is a living system. It evolves as EPF evolves. If you find gaps or opportunities for improvement, contribute back to make EPF better for everyone.
