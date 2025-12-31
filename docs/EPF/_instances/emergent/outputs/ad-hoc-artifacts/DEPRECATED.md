# 🚨 DEPRECATED: ad-hoc-artifacts Directory

**This directory is deprecated as of 2025-12-30.**

## Migration Notice

The `ad-hoc-artifacts/` directory has been replaced with a more structured approach for managing EPF-derived outputs.

### Old Structure (Deprecated)
```
docs/EPF/_instances/{product}/ad-hoc-artifacts/
├── 2025-12-11_investor_memo.md
├── 2025-12-11_investor_faq.md
└── README.md
```

### New Structure (Current)
```
docs/EPF/_instances/{product}/outputs/
├── context-sheets/
│   └── {product}_context_sheet.md
├── investor-materials/
│   ├── investor_memo.md
│   ├── investor_faq.md
│   └── one_pager.md
├── marketing/
│   └── product_brief.md
└── README.md
```

## Why the Change?

The new `/outputs/` structure provides:

1. **Better Organization** - Outputs grouped by type/purpose
2. **Schema Validation** - JSON schemas define expected structure
3. **Automated Generation** - Wizard-driven output creation
4. **Traceability** - Clear linkage to EPF source files
5. **Version Control** - Track which EPF version generated outputs
6. **Quality Assurance** - Validation scripts ensure correctness

## Migration Path

### For Existing Files

**Option 1: Automated Migration (Recommended)**

```bash
npm run migrate:ad-hoc-to-outputs -- --product emergent
```

This script will:
- Identify output types from filenames
- Move files to appropriate `/outputs/` subdirectories
- Add metadata headers for traceability
- Preserve original files (with `.migrated` suffix)

**Option 2: Manual Migration**

1. Identify the output type (context sheet, investor memo, etc.)
2. Move file to appropriate subdirectory in `/outputs/`
3. Add metadata header (see template below)
4. Validate: `npm run validate:output -- --file [new-path]`

### Metadata Template

Add this header to migrated files:

```markdown
<!--
  EPF OUTPUT ARTIFACT
  ==================
  Type: [Context Sheet | Investor Memo | Marketing Brief | etc.]
  Migrated From: ad-hoc-artifacts/[original-filename]
  Migration Date: 2025-12-30
  Original Created: [date from filename or git log]
  
  ⚠️  IMPORTANT: This file was migrated from ad-hoc-artifacts.
      To regenerate with latest EPF data, use:
      "[Generate [output-type] for [product]]"
  
  Source Files: [Add EPF sources if known, otherwise mark as "Unknown - regeneration recommended"]
-->
```

## Mapping Guide

| Old Filename Pattern | New Location | Output Type |
|---------------------|-------------|-------------|
| `*_context_sheet.md` | `outputs/context-sheets/` | Context Sheet |
| `*_investor_memo*.md` | `outputs/investor-materials/` | Investor Memo |
| `*_investor_faq*.md` | `outputs/investor-materials/` | Investor FAQ |
| `*_one_page*.md` | `outputs/investor-materials/` | One Pager |
| `*_product_brief*.md` | `outputs/marketing/` | Product Brief |
| `*_sales_*.md` | `outputs/sales-enablement/` | Sales Material |
| `*_partner_*.md` | `outputs/partner-docs/` | Partner Doc |
| Other `.md` files | `outputs/misc/` | Miscellaneous |

## Timeline

- **2025-12-30**: `/outputs/` structure introduced, `ad-hoc-artifacts/` marked deprecated
- **2026-01-31**: Migration reminder (30 days)
- **2026-03-01**: `ad-hoc-artifacts/` scheduled for removal (files will be archived)

## Action Required

If you have files in `ad-hoc-artifacts/`:

1. ✅ **By 2026-01-31**: Migrate to `/outputs/` structure
2. ✅ **By 2026-01-31**: Update any automation/scripts referencing old paths
3. ✅ **By 2026-02-15**: Validate migrated outputs
4. ✅ **By 2026-03-01**: Confirm no dependencies on `ad-hoc-artifacts/`

## New Workflow

Instead of manually creating ad-hoc files, use output generators:

### Old Approach (Deprecated)
```
User: "Create an investor memo"
AI: [Manually writes memo, saves to ad-hoc-artifacts/]
Result: Unstructured, no validation, no traceability
```

### New Approach (Current)
```
User: "Generate an investor memo for emergent"
AI: [Uses investor_memo_generator.wizard.md]
    [Reads EPF sources: north_star, strategy_formula, etc.]
    [Applies template from /outputs/templates/]
    [Validates against schema]
    [Saves to /outputs/investor-materials/]
Result: Structured, validated, traceable to EPF sources
```

## Support

For migration help or questions:

1. Check [`docs/EPF/outputs/README.md`](../../outputs/README.md) - New outputs documentation
2. Run migration script: `npm run migrate:ad-hoc-to-outputs --help`
3. Ask AI assistant: "Help me migrate ad-hoc artifacts to outputs structure"

## Files in This Directory

The files in this directory remain for historical reference until **2026-03-01**:

- `2025-12-11_investor_memo.md` → Migrate to `outputs/investor-materials/`
- `2025-12-11_investor_faq.md` → Migrate to `outputs/investor-materials/`
- `2025-12-11_investor_memo_executive_summary.md` → Migrate to `outputs/investor-materials/`
- `2025-12-11_investor_memo_one_page_pitch.md` → Migrate to `outputs/investor-materials/`
- `2025-12-11_investor_materials_index.md` → Migrate to `outputs/investor-materials/`
- `2025-12-28_epf_v2_health_check.md` → Migrate to `outputs/internal-reports/`

**After 2026-03-01**, this directory will be removed and files archived to:
```
docs/EPF/_instances/{product}/_archive/ad-hoc-artifacts-{date}/
```

---

**Last Updated**: 2025-12-30  
**Deprecation Status**: DEPRECATED - Do not add new files here  
**Migration Deadline**: 2026-01-31  
**Removal Date**: 2026-03-01
