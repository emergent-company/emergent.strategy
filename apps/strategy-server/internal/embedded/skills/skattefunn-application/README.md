# SkatteFUNN Application Generator

This output generator creates Norwegian R&D Tax Deduction (SkatteFUNN) applications from EPF data.

---

## 🤖 FOR AI ASSISTANTS: CRITICAL INSTRUCTIONS

**⚠️ BEFORE generating, READ:** [`../AI_INSTRUCTIONS.md`](../AI_INSTRUCTIONS.md)

**MUST DO:**
- ✅ Read and follow `wizard.instructions.md` (all 1,868 lines)
- ✅ Execute phases sequentially (Phase 0 → 0.5 → 1 → 2 → 3 → 4 → 5)
- ✅ Use `template.md` structure exactly
- ✅ Validate with `validator.sh` (must pass with 0 errors)

**NEVER DO:**
- ❌ Create custom Python/JS generator scripts
- ❌ Skip wizard and invent synthesis logic
- ❌ Skip Phase 0.5 (mandatory interactive KR selection)
- ❌ Ignore validator requirements

**Why:** Wizard contains Frascati Manual compliance rules, validated synthesis patterns, and exact template structure. Custom code will fail validation.

---

## 📋 Before You Start - Decision Tree

**Are you sure you want to generate a SkatteFUNN application?**

```
┌──────────────────────────────────────────────────┐
│ Do you have all required EPF artifacts?         │
│ - North Star (vision, mission)                  │
│ - Strategy Foundations (value proposition)      │
│ - Roadmap Recipe (OKRs with TRL data)          │
└──────────────────────────────────────────────────┘
         │                            │
        YES                          NO
         │                            │
         ▼                            ▼
┌──────────────────────┐    ┌────────────────────┐
│ Do your Key Results  │    │ Complete missing   │
│ have TRL data?       │    │ EPF artifacts first│
│ (trl_start/target)   │    └────────────────────┘
└──────────────────────┘              │
         │                            │
        YES                          STOP
         │
         ▼
┌──────────────────────────────────────┐
│ Are KRs in TRL 2-7 range?           │
│ (SkatteFUNN only covers R&D phase)  │
└──────────────────────────────────────┘
         │                      │
        YES                    NO
         │                      │
         ▼                      ▼
┌──────────────────┐   ┌────────────────────┐
│ Do you have:     │   │ Adjust TRL targets │
│ - Org info       │   │ or select different│
│ - Timeline       │   │ Key Results        │
│ - Budget         │   └────────────────────┘
└──────────────────┘            │
         │                      │
        YES                    STOP
         │
         ▼
┌────────────────────────────────────┐
│ ✅ READY TO GENERATE               │
│                                    │
│ Next steps:                        │
│ 1. Open wizard.instructions.md    │
│ 2. Execute Phase 0 (validation)   │
│ 3. Execute Phase 0.5 (selection)  │
│ 4. Continue through Phase 5       │
│ 5. Validate with validator.sh     │
└────────────────────────────────────┘
```

**Key Decision Point:** If you don't have TRL data or KRs are outside TRL 2-7, STOP and prepare data first.

---

## Quick Start

### 1. Generate Application

Follow the wizard to generate a complete SkatteFUNN application:

```bash
# Read the wizard instructions
cat docs/EPF/outputs/skattefunn-application/wizard.instructions.md

# Follow Phase 0-5 to generate application
# Output: docs/EPF/_instances/{product}/outputs/skattefunn-application/{product}-skattefunn-application-{date}.md
```

**⚠️ IMPORTANT:** The wizard includes a **MANDATORY interactive selection phase (Phase 0.5)** where you choose which R&D Key Results to include in the application. Do NOT skip this step!

### 2. Validate Application

```bash
bash docs/EPF/outputs/skattefunn-application/validator.sh \
  docs/EPF/_instances/emergent/outputs/skattefunn-application/emergent-skattefunn-application-2025-12-31.md
```

### 3. Fix Issues

The validator will identify:
- **Errors** (must fix): Schema violations, missing sections, placeholder text, budget math errors
- **Warnings** (review): Budget allocations outside typical ranges, missing best practices

### 4. Submit Application

Once validation passes, review the application and submit via:
- **Research Council Portal:** https://kunde.forskningsradet.no/
- **SkatteFUNN Email:** skattefunn@forskningsradet.no
- **Phone:** +47 22 03 70 00

## Files

| File | Purpose |
|------|---------|
| `wizard.instructions.md` | Complete instructions for generating applications (1,868 lines) |
| `validator.sh` | Validation script checking structure, semantics, budget, traceability |
| `schema.json` | JSON Schema defining input parameters |
| `template.md` | Base template structure |
| `README.md` | This file |

## Validation Layers

The validator performs 4 layers of checks:

### Layer 1: Schema Structure
- 8 required sections present (Project Owner & Roles, About Project, Background & Company Activities, Primary Objective & Innovation, R&D Content, Project Summary, Work Packages, Total Budget & Tax Deduction)
- EPF Traceability section present
- Application metadata complete
- Organization number format (9 digits)
- Character limits enforced (60, 100, 500, 1000, 2000 chars)

### Layer 2: Semantic Rules
- No placeholder text (XXX, [TODO], [TBD])
- All R&D activity fields present
- TRL ranges eligible (TRL 2-7 only)
- Technical uncertainty language present
- Work packages have 2-8 activities each

### Layer 3: Budget Validation
- Budget organized by work packages (1-8 WPs required)
- Each WP has 2-8 activities with allocated budgets
- Cost codes used: Personnel, Equipment, Other Operating Costs, Overhead
- Yearly budgets ≤ 25M NOK
- Budget sums by year and work package reconcile to total
- Work Package budgets reconcile to total

### Layer 4: Traceability
- Roadmap KR references (kr-p-XXX format)
- At least 5 distinct R&D activities
- Direct WP → KR mappings
- Required EPF sources referenced

## Exit Codes

- `0` - Valid, ready for submission
- `1` - Invalid (errors found, must fix)
- `2` - File not found
- `3` - Warnings only (review recommended)

## Environment Variables

```bash
# Treat warnings as errors (strict mode)
VALIDATION_STRICT=true bash validator.sh application.md

# Custom budget limit per year (default: 25M NOK)
VALIDATION_MAX_BUDGET_YEAR=25000000 bash validator.sh application.md

# Budget reconciliation tolerance (default: 1,000 NOK)
VALIDATION_BUDGET_TOLERANCE=1000 bash validator.sh application.md
```

## Common Issues

### Error: Character limit exceeded

**Problem:** Field exceeds official form character limit (e.g., project_summary > 1000 chars)

**Fix:** Trim text to fit within limits:
- Titles (English, Norwegian): 100 chars
- Short name: 60 chars
- Primary objective: 1000 chars
- Project summary: 1000 chars
- Company activities, background, differentiation, R&D content: 2000 chars
- WP challenges, activity descriptions: 500 chars

### Error: Found placeholder text: XXX

**Problem:** Phone number placeholder not replaced: `+47 XXX XX XXX`

**Fix:** Update Section 1 (Project Owner and Roles) with actual phone number:
```markdown
| Nikolai Fasting | Project Leader | Eyedea AS | nikolai@eyedea.no | +47 123 45 678 | ...
```

### Error: TRL 8 or TRL 9 found

**Problem:** SkatteFUNN only covers R&D phase (TRL 2-7), not production (TRL 8-9)

**Fix:** Remove production/operations activities or reframe as R&D challenges with technical uncertainty

### Error: Work Package budgets don't match total

**Problem:** Individual activity budgets don't sum correctly to WP totals or total application budget

**Fix:**
1. Verify each activity's `Allocated Budget` field
2. Sum activities per Work Package
3. Ensure WP totals sum to total application budget
4. Check for rounding errors (tolerance: 1,000 NOK)

### Warning: Cost code outside typical range

**Problem:** Cost allocation outside typical ranges (e.g., very low personnel costs for software R&D)

**Fix:**
- Review budget breakdown in Section 8.1 (Budget Summary by Year and Cost Code)
- Document justification if non-typical allocation is correct
- Typical software R&D: 65-75% Personnel, 15-25% Equipment, 5-15% Other Operating Costs, 5-10% Overhead

## SkatteFUNN Resources

- **Official Portal:** https://kunde.forskningsradet.no/
- **Email Support:** skattefunn@forskningsradet.no
- **Phone:** +47 22 03 70 00
- **Guidelines:** https://www.forskningsradet.no/skattefunn
- **Max Budget:** 25M NOK per company per year
- **Tax Deduction:** 20% (small companies) or 18% (large companies)

## Related Documentation

- [Wizard Instructions](./wizard.instructions.md) - Complete generation guide
- [EPF Validation System](../VALIDATION_README.md) - Overview of all validators
- [Context Sheet Validator](../context-sheet/validator.sh) - Example validator
- [Investor Memo Validator](../investor-memo/validator.sh) - Another example

## Version History

- **v2.0.1** (2026-01-03) - Validator bug fixes
  - Fixed budget temporal consistency validation (awk-based WP extraction eliminates false positives)
  - Added 8 work package maximum enforcement per SkatteFUNN regulations (already documented in schema)

- **v2.0.0** (2026-01-01) - Major restructure for official form compatibility
  - Restructured to 8 official form sections matching online application
  - Added character limit validation (60, 100, 500, 1000, 2000 chars)
  - Replaced flat budget with work packages array (1-8 WPs, 2-8 activities per WP)
  - Added Norwegian title, creator role, nested scientific_discipline
  - Changed cost categories from percentages to official cost codes (Personnel, Equipment, Other Operating Costs, Overhead)
  - Made Section 7 (Work Packages) repeatable for easy copy/paste workflow
  - Updated template variables to nested structure

- **v1.0.0** (2025-12-31) - Initial release
  - 4-layer validation (schema, semantic, budget, traceability)
  - Budget reconciliation with 1,000 NOK tolerance
  - TRL range checking (2-7 eligibility)
  - Frascati criteria verification
  - Roadmap KR traceability validation
