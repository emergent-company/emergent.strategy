# Context Sheet Generator Wizard

> **Purpose**: Generate an up-to-date AI Context Sheet from your EPF instance files. Run this wizard whenever your EPF instance changes significantly (after completing a cycle, updating strategy, or adding features).

## When to Run This Wizard

- After completing an EPF cycle (READY → FIRE → AIM)
- After significant updates to strategy_formula or value models
- Before a marketing campaign or content creation sprint
- When onboarding new team members who will use external AI tools
- Quarterly, as part of your EPF maintenance routine

## Instructions for AI Assistant

When the user asks to "generate context sheet", "update context sheet", or "refresh AI context", follow these steps:

### Step 1: Gather Source Data

Read these files from the product's EPF instance (replace `{product}` with actual product name):

```
docs/EPF/_instances/{product}/00_north_star.yaml      → Purpose, Vision, Mission, Values
docs/EPF/_instances/{product}/04_strategy_formula.yaml → Positioning, Target Customer, Competitive Moat
docs/EPF/_instances/{product}/05_roadmap_recipe.yaml   → Current Focus, Key Initiatives
docs/EPF/_instances/{product}/value_models/product.value_model.yaml → Capabilities, JTBD, UVPs
```

### Step 2: Extract Key Information

From each file, extract:

**From 00_north_star.yaml:**
- `north_star.purpose.statement` → Purpose
- `north_star.vision.statement` → Vision
- `north_star.mission.statement` → Mission
- `north_star.values[].name` and `.description` → Values
- `north_star.core_beliefs[].belief` → Core beliefs (for tone guidance)

**From 04_strategy_formula.yaml:**
- `strategy.positioning.unique_value_proposition` → UVP
- `strategy.positioning.target_customer_profile` → Target Customer
- `strategy.positioning.category` → Category/Positioning
- `strategy.competitive_moat.advantages[]` → Differentiators
- `strategy.competitive_moat.differentiation` → Competitive positioning
- `strategy.business_model.revenue_model` → Business model context
- `strategy.current_cycle_focus` → Current focus

**From 05_roadmap_recipe.yaml:**
- Current milestone's `strategic_focus` → Key initiatives
- Active work packages → What's being built now

**From product.value_model.yaml:**
- `high_level_model.product_mission` → Product mission
- `high_level_model.product_goals[]` → Product goals
- `high_level_model.needs_addressed[]` → User needs
- `high_level_model.values_delivered[]` → Value delivered
- `layers[].jtbd` → Jobs-to-be-Done statements
- `layers[].uvp` → Layer-level UVPs
- `layers[].components[].subs[]` where `active: true` → Active capabilities
- `layers[].components[].subs[]` where `premium: true` → Premium features

### Step 3: Generate Context Sheet

Use the template at `docs/EPF/wizards/context_sheet_template.md` and fill in all placeholders with the extracted data.

### Step 4: Output Location

Save the generated context sheet to:
```
docs/EPF/_instances/{product}/context-sheets/{product}_context_sheet.md
```

### Step 5: Update Metadata

Add generation metadata at the top of the file:
```markdown
<!-- 
  AUTO-GENERATED CONTEXT SHEET
  Generated: {current_date}
  EPF Version: {epf_version from _meta.yaml}
  Source files:
    - 00_north_star.yaml (v{version})
    - 04_strategy_formula.yaml
    - 05_roadmap_recipe.yaml
    - product.value_model.yaml (v{version})
  
  To regenerate: Ask AI assistant to "regenerate context sheet for {product}"
-->
```

---

## Quick Prompts

**Generate fresh context sheet:**
> "Generate a fresh AI context sheet for {product-name} from the EPF instance files"

**Update specific section:**
> "Update the product capabilities section of the context sheet based on the latest value model"

**Validate context sheet:**
> "Compare the current context sheet against the EPF instance files and report any outdated information"

---

## Automation Options

### Option 1: Manual (Recommended for now)
Run this wizard manually when EPF instance changes significantly.

### Option 2: Git Hook (Advanced)
Add a pre-commit hook that detects changes to EPF instance files and prompts for context sheet regeneration.

### Option 3: CI/CD Integration (Future)
Add a GitHub Action that auto-generates context sheet on PR merge to main when EPF files change.

---

## Validation Checklist

After generating, verify:

- [ ] All placeholders filled (no `{PLACEHOLDER}` text remaining)
- [ ] Product capabilities match what's actually built (check `active: true` in value model)
- [ ] Premium features correctly identified
- [ ] Out-of-scope section is accurate
- [ ] Current focus matches actual roadmap
- [ ] No confidential information exposed (pricing details, internal metrics)
- [ ] Tone matches brand voice

---

## Example Usage

```
User: Generate a fresh context sheet for twentyfirst

AI Assistant: I'll generate an updated context sheet from your EPF instance files.

[Reads 00_north_star.yaml, 04_strategy_formula.yaml, 05_roadmap_recipe.yaml, product.value_model.yaml]

[Generates context sheet using template]

[Saves to docs/EPF/_instances/twentyfirst/context-sheets/twentyfirst_context_sheet.md]

Done! Context sheet updated with:
- Purpose/Vision/Mission from North Star
- Target customer and positioning from Strategy Formula
- Current cycle focus from Roadmap
- 5 capability areas with 23 specific features from Value Model
- 3 Jobs-to-be-Done statements
- 4 user-type-specific value propositions

The context sheet is ready to copy-paste into external AI tools.
```

## Related Resources

- **Template**: [context_sheet_template.md](./context_sheet_template.md) - Base template used to generate product-specific context sheets
- **Guide**: [INSTANTIATION_GUIDE.md](../docs/guides/INSTANTIATION_GUIDE.md) - Guidelines for creating and maintaining EPF instances
- **Schema**: [value_model_schema.json](../schemas/value_model_schema.json) - Structure for product value models used in context sheets
