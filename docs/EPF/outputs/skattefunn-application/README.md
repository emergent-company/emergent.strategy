# SkatteFUNN Application Generator

This output generator creates Norwegian R&D Tax Deduction (SkatteFUNN) applications from EPF data.

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
- 6 required sections present (Owner, Roles, Details, Timeline, Budget, Traceability)
- Application metadata complete
- Organization number format (9 digits)
- Frascati criteria section present

### Layer 2: Semantic Rules
- No placeholder text (XXX, [TODO], [TBD])
- All R&D activity fields present
- TRL ranges eligible (TRL 2-7 only)
- All 5 Frascati criteria addressed
- Technical uncertainty language present

### Layer 3: Budget Validation
- Yearly budgets ≤ 25M NOK
- Cost categories within typical ranges (70% personnel, 20% equipment, 10% overhead)
- Cost categories sum to 100%
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

### Error: Found placeholder text: XXX

**Problem:** Phone number placeholder not replaced: `+47 XXX XX XXX`

**Fix:** Update Section 2 (Roles) with actual phone number:
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

### Warning: Personnel cost outside typical range

**Problem:** Personnel allocation outside 65-75% typical for software R&D

**Fix:**
- Review budget breakdown in Section 5.3
- Document justification if non-typical allocation is correct
- Consider if equipment/overhead allocations are reasonable

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

- **v1.0.0** (2025-12-31) - Initial release
  - 4-layer validation (schema, semantic, budget, traceability)
  - Budget reconciliation with 1,000 NOK tolerance
  - TRL range checking (2-7 eligibility)
  - Frascati criteria verification
  - Roadmap KR traceability validation
