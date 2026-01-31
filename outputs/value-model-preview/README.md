# Value Model Preview Generator

> **Type**: Output Generator  
> **Purpose**: Generate shareable HTML previews of EPF value models  
> **Output**: Single-file HTML (gist-friendly, no external dependencies)

---

## Quick Start

Ask your AI assistant:

```
"Generate an HTML preview for the emergent-core value model"
```

Or for multiple models:

```
"Generate an HTML portfolio preview for all Emergent value models"
```

---

## Output Formats

| Format | Command | Description |
|--------|---------|-------------|
| Single Model | `--format=single` | One value model → one HTML file |
| Portfolio | `--format=portfolio` | All track models → combined dashboard |
| Comparison | `--format=comparison` | Side-by-side track comparison |

---

## Output Location

Generated previews are saved to:

```
docs/EPF/_instances/{product}/outputs/value-model-previews/
├── {track}.value_model.html           # Single model previews
├── portfolio.html                      # Combined portfolio view
└── comparison.html                     # Track comparison view
```

---

## Features

- **Single-file HTML** - Embeds all CSS, works in GitHub Gist
- **Responsive design** - Mobile-friendly layout
- **Dark/light mode** - Automatic theme detection
- **Additional data injection** - Add custom sections (KPIs, roadmap links, notes)
- **Maturity visualization** - Color-coded maturity stages
- **Interactive navigation** - Collapsible layers and components

---

## Files in This Generator

| File | Purpose |
|------|---------|
| `schema.json` | Validates input parameters |
| `wizard.instructions.md` | Generation logic (follow this!) |
| `template.html` | Base HTML template with placeholders |
| `validator.sh` | Validates generated output |

---

## Validation

After generating, validate with:

```bash
bash docs/EPF/outputs/value-model-preview/validator.sh path/to/output.html
```

---

## See Also

- [GENERATOR_GUIDE.md](../GENERATOR_GUIDE.md) - How generators work
- [AI_INSTRUCTIONS.md](../AI_INSTRUCTIONS.md) - Instructions for AI assistants
- [Value Model Schema](../../schemas/value_model_schema.json) - Source data schema
