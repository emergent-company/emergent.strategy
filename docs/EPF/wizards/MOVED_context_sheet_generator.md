# 🚨 MOVED: Context Sheet Generator

**This wizard has been moved to `/docs/EPF/outputs/` as of 2025-12-30.**

## New Location

**Old**: `docs/EPF/wizards/context_sheet_generator.wizard.md` *(You are here)*  
**New**: [`docs/EPF/outputs/wizards/context_sheet_generator.wizard.md`](../outputs/wizards/context_sheet_generator.wizard.md)

## Why the Move?

Context sheets are **output artifacts** (generated FROM EPF data), not core EPF methodology artifacts. The new `/outputs/` structure provides:

- 📋 **Schema validation** against `context_sheet.schema.json`
- 🧪 **Automated validation** via `validate-context-sheet.ts`
- 📄 **Template management** in `/outputs/templates/`
- 🔗 **Clear separation** between EPF framework and derived outputs
- 📊 **Better organization** alongside other output types

## Usage

Use the new wizard location:

```
"Generate a context sheet for [product] using the EPF output generator"
```

The AI assistant will automatically use the new wizard at:
```
docs/EPF/outputs/wizards/context_sheet_generator.wizard.md
```

## Migration Status

- ✅ **2025-12-30**: New wizard created in `/outputs/`
- ✅ **2025-12-30**: Schema and validation added
- ⏳ **2026-01-31**: Remove this legacy file (30-day grace period)

## Update Your References

If you have documentation, scripts, or automation referencing this file:

### Update Paths
```bash
# Old
docs/EPF/wizards/context_sheet_generator.wizard.md

# New
docs/EPF/outputs/wizards/context_sheet_generator.wizard.md
```

### Update Commands
```bash
# If you reference this in scripts
find . -type f -exec sed -i '' 's|docs/EPF/wizards/context_sheet_generator|docs/EPF/outputs/wizards/context_sheet_generator|g' {} +
```

## See Also

- [New Wizard](../outputs/wizards/context_sheet_generator.wizard.md) - Updated version with schema support
- [Context Sheet Schema](../outputs/schemas/context_sheet.schema.json) - Output validation schema
- [Outputs README](../outputs/README.md) - Overview of EPF outputs architecture
- [Validation Guide](../outputs/validation/README.md) - How to validate outputs

---

**This file will be removed on**: 2026-01-31  
**Use instead**: [`docs/EPF/outputs/wizards/context_sheet_generator.wizard.md`](../outputs/wizards/context_sheet_generator.wizard.md)
