# .epf-work/ - Temporary Work Directory

**Purpose:** This directory contains temporary analysis documents, AI reasoning logs, and work-in-progress insights created during EPF framework development and maintenance.

## What Belongs Here

✅ **Temporary analysis documents:**
- Ecosystem analysis (feature_definition, README audit)
- Completion reports for development phases
- Enhancement proposals and fix plans
- Validation results and testing reports
- AI agent decision logs and reasoning

✅ **Work-in-progress insights:**
- Schema evolution analysis
- Cross-reference validation reports
- Component integration documentation
- Version fix planning documents

✅ **Historical development context:**
- Documents explaining past decisions
- Rework learnings and post-mortems
- Migration plans and alignment proposals

## What Does NOT Belong Here

❌ **Permanent framework documentation:**
- Guides → `docs/guides/` (conceptual how-to documentation)
- Technical guides → `docs/guides/technical/` (advanced framework internals)
- Root-level docs → `MAINTENANCE.md`, `CANONICAL_PURITY_RULES.md`, `README.md`

❌ **Templates and schemas:**
- Templates → `templates/READY/`, `templates/FIRE/`, `templates/AIM/`
- Schemas → `schemas/` (JSON Schema definitions)
- Wizards → `wizards/` (step-by-step creation guides)

❌ **Examples and reference:**
- Feature examples → `definitions/product/` (validated feature definition examples)
- Other track definitions → `definitions/strategy/`, `definitions/org_ops/`, `definitions/commercial/` (canonical)
- Instance examples → `_instances/` (product-specific content)

## Directory Contents

### Analysis Documents (Current Session)
- `ANALYSIS_README_AUDIT.md` - Audit of 10 README files (Dec 2025)
- `ANALYSIS_FEATURE_DEFINITION_ECOSYSTEM.md` - 6-component ecosystem review (Dec 2025)
- `AI_INSTRUCTION_CONSOLIDATION_COMPLETE.md` - AI instruction consolidation (Dec 2025)
- `AI_INSTRUCTION_FILES_ANALYSIS.md` - Analysis of instruction files (Dec 2025)

### Schema Evolution Documents (Dec 2024-2025)
- `COMPONENT_1_SCHEMA_ENHANCEMENT_COMPLETE.md` - Schema v2.0 enhancement completion
- `COMPONENT_1_SCHEMA_VALIDATION_ENHANCEMENT.md` - Validation enhancement work
- `COMPONENT_1_SCHEMA_VALIDATION_FEATURE_DEF.md` - Feature definition validation
- `COMPONENT_2_INTEGRATION_SPEC_ENHANCEMENT.md` - Integration spec enhancements
- `COMPONENT_5_COMPLETE_SUMMARY.md` - Component 5 completion summary
- `COMPONENT_5_CROSS_REFERENCE_VALIDATION.md` - Cross-reference validation
- `COMPONENT_5_TESTING_COMPLETE.md` - Testing completion report
- `SCHEMA_ALIGNMENT_COMPLETE.md` - Schema alignment completion
- `SCHEMA_ENHANCEMENT_COMPLETE.md` - Schema enhancement completion
- `SCHEMA_VALIDATION_ALIGNMENT_PROPOSAL.md` - Schema-validator alignment proposal
- `VALUE_PROPOSITIONS_REMOVAL_COMPLETE.md` - Value propositions removal work

### Planning Documents
- `VERSION_FIX_PLAN.md` - Version inconsistency fix plan (v1.13.0)
- `EPF_DOCUMENTATION_REVIEW.md` - Comprehensive documentation review (2911 lines)

## Document Lifecycle

1. **Created:** During development, analysis, or framework improvements
2. **Referenced:** Used to inform decisions and document reasoning
3. **Retained:** Kept as historical context for future maintainers
4. **Never promoted:** These documents remain temporary/historical (not moved to permanent docs)

## Maintenance Policy

- **Do not delete:** These documents provide valuable historical context
- **Do not promote to docs/:** If content is valuable long-term, extract patterns into permanent guides
- **Add new analysis here:** Any new temporary analysis or AI reasoning should be added to this directory
- **Update this README:** When adding new document categories, update this file

## Related Directories

- `docs/` - Permanent framework documentation
- `docs/guides/` - Conceptual guides for artifact creation
- `docs/guides/technical/` - Advanced technical documentation
- `_legacy/` - Deprecated but preserved framework content

---

**Last updated:** 2025-12-28  
**EPF Version:** v2.0.0
