# EPF Outputs Quick Start Guide

Get started with EPF output generation in 5 minutes.

## What Are EPF Outputs?

**Outputs** are external artifacts generated FROM your EPF data:
- 📋 Context sheets for AI tools (ChatGPT, Claude, etc.)
- 💼 Investor materials (memos, FAQs, pitch decks)
- 📢 Marketing collateral (product briefs, positioning docs)
- 💰 Sales enablement (battle cards, competitive analysis)

**Key difference**: Outputs are DERIVED from EPF, not part of EPF methodology.

## Quick Commands

### Generate a Context Sheet

Ask your AI assistant:
```
"Generate a context sheet for [product-name] using the EPF output generator"
```

Example:
```
"Generate a context sheet for emergent using the EPF output generator"
```

### Validate an Output

```bash
npx tsx docs/EPF/outputs/validation/validate-context-sheet.ts \
  docs/EPF/_instances/emergent/outputs/context-sheets/emergent_context_sheet.md
```

### Check Available Output Types

```bash
cat docs/EPF/outputs/README.md | grep "| \*\*" | head -10
```

## Output Locations

Outputs are stored in your product instance:

```
docs/EPF/_instances/{product}/outputs/
├── context-sheets/          # AI context for external tools
├── investor-materials/      # Memos, FAQs, pitch decks
├── marketing/               # Product briefs, positioning
├── sales-enablement/        # Battle cards, competitive docs
└── internal-reports/        # Health checks, status updates
```

## How It Works

1. **AI reads** your EPF source files:
   - `00_north_star.yaml` - Purpose, vision, values
   - `04_strategy_formula.yaml` - Positioning, competitive moat
   - `05_roadmap_recipe.yaml` - Current focus, initiatives
   - `value_models/*.yaml` - Capabilities, features, UVPs

2. **AI extracts** relevant data using YAML path mappings

3. **AI applies** template from `/outputs/templates/`

4. **AI validates** against schema in `/outputs/schemas/`

5. **AI saves** to `/outputs/{type}/` in your product instance

6. **You copy** to external tools as needed

## When to Regenerate

Regenerate outputs when:
- ✅ EPF cycle completes (READY → FIRE → AIM)
- ✅ Strategy changes (new positioning, target customer)
- ✅ Features added/removed (value model updates)
- ✅ Before investor meetings or marketing campaigns
- ✅ Quarterly maintenance (ensure freshness)

## Available Output Types

| Type | Status | Command |
|------|--------|---------|
| Context Sheet | ✅ Ready | `"Generate a context sheet for [product]"` |
| Investor Memo | 🔄 In Progress | Coming soon |
| Marketing Brief | ⏳ Planned | Coming soon |
| Sales Battlecard | ⏳ Planned | Coming soon |

## Example: Context Sheet Workflow

### 1. Initial Generation

```
You: "Generate a context sheet for emergent"

AI: [Reads EPF sources]
    [Extracts data]
    [Applies template]
    [Validates]
    [Saves to outputs/context-sheets/]

✅ Done! Context sheet saved.
```

### 2. Review Generated File

```bash
open docs/EPF/_instances/emergent/outputs/context-sheets/emergent_context_sheet.md
```

### 3. Validate

```bash
npx tsx docs/EPF/outputs/validation/validate-context-sheet.ts \
  docs/EPF/_instances/emergent/outputs/context-sheets/emergent_context_sheet.md

✅ Validation passed - context sheet is valid!
```

### 4. Use with External AI

Copy content from context sheet → Paste into ChatGPT/Claude session → Now AI has full product context!

## Common Patterns

### Update After EPF Changes

```
You: "My strategy_formula just changed. Should I update the context sheet?"

AI: "Yes! Let me regenerate it with the latest data."
    [Regenerates context sheet]
    
✅ Context sheet updated with new positioning.
```

### Check Freshness

```
You: "Is my context sheet up to date?"

AI: [Compares timestamps]
    
⚠️  Source file modified 2 days ago: 04_strategy_formula.yaml
    Recommendation: Regenerate context sheet.
```

### Generate Multiple Formats

```
You: "Generate a context sheet for emergent in JSON format"

AI: [Generates both .md and .json versions]

✅ Markdown: outputs/context-sheets/emergent_context_sheet.md
✅ JSON: outputs/context-sheets/emergent_context_sheet.json
```

## Troubleshooting

### "No metadata found in context sheet"

**Cause**: File missing metadata header  
**Fix**: Regenerate using wizard

### "Source file not found"

**Cause**: EPF instance incomplete  
**Fix**: Create missing EPF artifacts first

### "Placeholder text remaining"

**Cause**: EPF source missing required data  
**Fix**: Complete EPF artifacts before generating outputs

### "Source file very old"

**Cause**: EPF sources haven't been updated recently  
**Fix**: Update EPF sources, then regenerate outputs

## Next Steps

1. **Read full documentation**: [`outputs/README.md`](./README.md)

2. **Explore schemas**: [`outputs/schemas/`](./schemas/)

3. **Learn wizards**: [`outputs/wizards/`](./wizards/)

4. **Understand validation**: [`outputs/validation/README.md`](./validation/README.md)

5. **See implementation summary**: [`outputs/IMPLEMENTATION_SUMMARY.md`](./IMPLEMENTATION_SUMMARY.md)

## Need Help?

Ask your AI assistant:
- "Explain EPF outputs architecture"
- "How do I add a new output type?"
- "What's the difference between EPF artifacts and outputs?"
- "Show me examples of output generation"

---

**Ready to generate your first output?** 🚀

Try: `"Generate a context sheet for [your-product] using the EPF output generator"`
