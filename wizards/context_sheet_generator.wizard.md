# ⚠️ DEPRECATED - Context Sheet Generator Has Moved

> **This wizard has been relocated to the standardized outputs/ structure.**  
> **New location**: [`docs/EPF/outputs/context-sheet/wizard.instructions.md`](../outputs/context-sheet/wizard.instructions.md)

---

## 🔄 Why This Move?

Context sheets are **external output artifacts** (derived from EPF data, consumed outside EPF workflow), not core EPF methodology wizards. The new outputs/ structure:

- ✅ Clearly separates EPF framework from generated artifacts
- ✅ Provides standardized structure (schema, wizard, validator, README)
- ✅ Makes generators more discoverable
- ✅ Enables validation and quality checks

---

## 🚀 How to Use the New Generator

**Command for AI Assistant:**
```
"Generate a context sheet for [product] using the EPF output generator"
```

Example:
```
"Generate a context sheet for twentyfirst using the EPF output generator"
```

**Key phrase**: "using the EPF output generator" - this ensures AI uses the correct location.

---

## 📍 New Locations

- **Generator instructions**: [`docs/EPF/outputs/context-sheet/wizard.instructions.md`](../outputs/context-sheet/wizard.instructions.md)
- **Output schema**: [`docs/EPF/outputs/context-sheet/schema.json`](../outputs/context-sheet/schema.json)
- **Validator**: [`docs/EPF/outputs/context-sheet/validator.sh`](../outputs/context-sheet/validator.sh)
- **Generated outputs**: `docs/EPF/_instances/{product}/outputs/context-sheets/`

---

## 🗂️ All Available Output Generators

See [`docs/EPF/outputs/README.md`](../outputs/README.md) for:
- Context Sheet generator (AI context summaries)
- Investor Memo generator (fundraising materials)
- SkatteFUNN Application generator (Norwegian R&D tax)

---

**This file will be removed in a future EPF version.**  
**For now, it serves as a redirect to prevent confusion.**
