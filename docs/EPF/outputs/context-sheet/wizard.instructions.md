# Context Sheet Generator Wizard

> **Type**: Output Generator  
> **Purpose**: Generate an up-to-date AI Context Sheet from EPF instance files for use with external AI tools  
> **Output**: Markdown file with structured product context  

---

## Overview

The Context Sheet is a **derived output artifact** that summarizes your product's EPF data in a format optimized for external AI tools (ChatGPT, Claude, etc.). It is NOT part of the EPF methodology itself—it's generated FROM EPF artifacts.

**This generator belongs in `/outputs/` because:**
- It READS EPF data but doesn't modify it
- It produces external-facing documentation
- It's regenerable at any time without loss
- It's consumed outside the EPF workflow

---

## When to Run This Wizard

Run this generator when:
- ✅ After completing an EPF cycle (READY → FIRE → AIM)
- ✅ After significant updates to strategy_formula or value models
- ✅ Before a marketing campaign or content creation sprint
- ✅ When onboarding new team members who will use external AI tools
- ✅ Quarterly, as part of your EPF maintenance routine
- ✅ Before investor meetings or partnership discussions

---

## Quick Start

Ask your AI assistant:

```
"Generate a context sheet for [product-name] using the EPF output generator"
```

Example:
```
"Generate a context sheet for emergent using the EPF output generator"
```

---

## Instructions for AI Assistant

When the user asks to "generate context sheet", "update context sheet", or "refresh AI context", follow these steps:

### Step 1: Identify Product and Locate EPF Instance

```
Product name: {product}
EPF instance location: docs/EPF/_instances/{product}/
```

Verify the EPF instance exists and contains:
- `00_north_star.yaml`
- `04_strategy_formula.yaml`
- `05_roadmap_recipe.yaml`
- `value_models/product.value_model.yaml`

### Step 2: Read Source Files

Read these files from the product's EPF instance:

```yaml
# Core strategy and positioning
docs/EPF/_instances/{product}/00_north_star.yaml      
# Purpose, Vision, Mission, Values, Core Beliefs

docs/EPF/_instances/{product}/04_strategy_formula.yaml 
# Positioning, Target Customer, Competitive Moat, Business Model

docs/EPF/_instances/{product}/05_roadmap_recipe.yaml   
# Current Focus, Key Initiatives, Active Work Packages

docs/EPF/_instances/{product}/value_models/product.value_model.yaml 
# Capabilities, JTBD, UVPs, Feature Details
```

### Step 3: Extract Structured Data

From each file, extract the following using YAML path notation:

#### From `00_north_star.yaml`

```yaml
north_star.purpose.statement → Purpose
north_star.vision.statement → Vision
north_star.mission.statement → Mission
north_star.values[]:
  - name → Value Name
  - description → Value Description
north_star.core_beliefs[].belief → Core Beliefs (for tone guidance)
north_star.success_metrics[] → Success Metrics
```

#### From `04_strategy_formula.yaml`

```yaml
strategy.positioning.unique_value_proposition → UVP
strategy.positioning.target_customer_profile → Target Customer
strategy.positioning.category → Category/Positioning
strategy.positioning.differentiators[] → Key Differentiators
strategy.competitive_moat.advantages[] → Competitive Advantages
strategy.competitive_moat.differentiation → Competitive Positioning
strategy.business_model.revenue_model → Business Model
strategy.current_cycle_focus → Current Focus
strategy.constraints[] → Strategic Constraints
```

#### From `05_roadmap_recipe.yaml`

```yaml
# Find the current/active milestone
milestones[].status == "in_progress" OR "planned" → Current Milestone
  .strategic_focus → Key Initiatives
  .work_packages[] where status == "active" → What's Being Built Now
  .completion_criteria[] → Success Criteria
```

#### From `product.value_model.yaml`

```yaml
high_level_model.product_mission → Product Mission
high_level_model.product_goals[] → Product Goals
high_level_model.needs_addressed[] → User Needs Addressed
high_level_model.values_delivered[] → Value Delivered to Users

# For each layer in the value model
layers[]:
  .name → Layer Name
  .jtbd → Jobs-to-be-Done Statement
  .uvp → Layer-Level UVP
  .components[]:
    .subs[] where active == true → Active Capabilities
    .subs[] where premium == true → Premium Features
    .subs[] where planned == true → Planned Features
```

### Step 4: Generate Context Sheet

Use the template at `docs/EPF/outputs/templates/context_sheet_template.md` and fill in all placeholders with the extracted data.

**Processing rules:**
1. Replace all `{PLACEHOLDER}` variables with actual values
2. Format lists consistently (bullet points, numbered lists as appropriate)
3. Remove empty sections (e.g., if no premium features exist)
4. Ensure markdown formatting is valid
5. Add generation metadata header (see Step 5)

### Step 5: Add Generation Metadata

Prepend this metadata block to the top of the generated file:

```markdown
<!--
  EPF OUTPUT ARTIFACT: AI Context Sheet
  ==========================================
  Type: External Output (NOT core EPF artifact)
  Generated: {current_date_iso8601}
  Generator: context_sheet_generator.wizard.md
  Generator Version: 1.0.0
  EPF Version: {epf_version from _meta.yaml}
  
  Source Files:
    - 00_north_star.yaml (last modified: {timestamp}, version: {version})
    - 04_strategy_formula.yaml (last modified: {timestamp})
    - 05_roadmap_recipe.yaml (last modified: {timestamp})
    - value_models/product.value_model.yaml (last modified: {timestamp}, version: {version})
  
  Regeneration:
    Command: "Generate a context sheet for {product} using the EPF output generator"
    Recommended: After EPF updates, before external AI tool usage
  
  Validation:
    Schema: docs/EPF/outputs/context-sheet/schema.json
    Command: npm run validate:output -- --type context-sheet --file [this file]
  
  ⚠️  This is a DERIVED artifact. EPF source files are the source of truth.
      If data seems outdated, regenerate this file from EPF sources.
-->
```

### Step 6: Save Output

Save the generated context sheet to:
```
docs/EPF/_instances/{product}/outputs/context-sheets/{product}_context_sheet.md
```

Create the directory if it doesn't exist:
```bash
mkdir -p docs/EPF/_instances/{product}/outputs/context-sheets
```

### Step 7: Report Summary

After generation, report to the user:

```
✅ Context Sheet Generated Successfully

📄 Output Location:
   docs/EPF/_instances/{product}/outputs/context-sheets/{product}_context_sheet.md

📊 Content Summary:
   - Purpose/Vision/Mission: [extracted from North Star]
   - Target Customer: [extracted from Strategy]
   - {N} Core Values
   - {N} Capability Areas
   - {N} Active Features
   - {N} Premium Features
   - {N} Jobs-to-be-Done
   - Current Focus: [extracted from Roadmap]

🔍 Source Files (Timestamp):
   - 00_north_star.yaml: {last_modified}
   - 04_strategy_formula.yaml: {last_modified}
   - 05_roadmap_recipe.yaml: {last_modified}
   - product.value_model.yaml: {last_modified}

✨ Next Steps:
   1. Review the generated context sheet
   2. Validate: npm run validate:output -- --type context-sheet --file [path]
   3. Copy to external AI tools as needed
   4. Regenerate after significant EPF updates
```

---

## Output Structure

The generated context sheet follows this structure:

```markdown
# [Product Name] AI Context Sheet

## Quick Reference
- Purpose, Vision, Mission
- Target Customer
- Positioning Statement

## Product Overview
- What it does
- Who it's for
- Why it exists

## Core Capabilities
- Capability area 1
  - Feature 1.1
  - Feature 1.2
- Capability area 2
  - Feature 2.1
  - Feature 2.2

## Jobs-to-be-Done
- JTBD 1: [When situation, I want to do, so I can achieve]
- JTBD 2: [When situation, I want to do, so I can achieve]

## Value Propositions
- For [user type]: [value delivered]

## Current Focus
- Strategic priority
- Active initiatives
- What's being built

## Out of Scope
- What we explicitly don't do

## Premium/Paid Features
- Feature requiring upgrade
- Feature requiring subscription

## Technical Context
- Stack/platform info (if relevant)
- Integration points
```

---

## Validation

After generation, validate the output:

### Automatic Validation

```bash
npm run validate:output -- --type context-sheet \
  --file docs/EPF/_instances/{product}/outputs/context-sheets/{product}_context_sheet.md
```

This checks:
- Schema compliance (all required sections present)
- No unreplaced placeholders
- Valid markdown formatting
- Source file freshness (warnings if sources are stale)

### Manual Validation Checklist

- [ ] All `{PLACEHOLDER}` text replaced
- [ ] Product capabilities match what's actually built (`active: true` in value model)
- [ ] Premium features correctly identified (`premium: true`)
- [ ] Out-of-scope section is accurate
- [ ] Current focus matches actual roadmap state
- [ ] No confidential information exposed
- [ ] Tone matches brand voice (check against core beliefs)
- [ ] User types/personas are accurate
- [ ] Jobs-to-be-Done follow the correct format
- [ ] Dates and versions in metadata are correct

---

## Usage Examples

### Example 1: Generate Fresh Context Sheet

```
User: Generate a context sheet for emergent

AI: I'll generate a context sheet from your EPF instance files.

[Reads source files]
[Extracts data]
[Generates from template]
[Saves output]

✅ Context Sheet Generated

Output: docs/EPF/_instances/emergent/outputs/context-sheets/emergent_context_sheet.md

Summary:
- 4 core values
- 5 capability areas
- 28 active features
- 3 premium features
- 5 Jobs-to-be-Done
- Current focus: AI-powered knowledge extraction

The context sheet is ready for use with external AI tools.
```

### Example 2: Update Specific Section

```
User: Update the product capabilities section of the context sheet based on the latest value model

AI: I'll regenerate just the capabilities section from the current value model.

[Reads product.value_model.yaml]
[Extracts active capabilities]
[Updates context sheet]

✅ Capabilities Section Updated

Changes detected:
- Added 3 new features
- Removed 1 deprecated feature
- Updated 2 feature descriptions

The context sheet now reflects the current value model.
```

### Example 3: Validate Freshness

```
User: Is the context sheet up to date?

AI: Let me check the context sheet against current EPF source files.

[Compares timestamps]
[Checks for data consistency]

⚠️  Context Sheet May Be Outdated

Source file changes detected:
- 04_strategy_formula.yaml modified 2 days ago (positioning updated)
- product.value_model.yaml modified 3 hours ago (2 new features added)

Recommendation: Regenerate the context sheet to reflect latest changes.

Command: "Generate a context sheet for emergent using the EPF output generator"
```

---

## Advanced Options

### Partial Updates

Update only specific sections without full regeneration:

```
"Update the [section] section of the context sheet for [product]"
```

Supported sections:
- `overview` - Product overview and positioning
- `capabilities` - Feature listing
- `jtbd` - Jobs-to-be-Done
- `focus` - Current strategic focus
- `premium` - Premium features

### Custom Formatting

Generate context sheets in different formats:

```
"Generate a context sheet for [product] in [format]"
```

Supported formats:
- `markdown` (default) - Standard markdown
- `json` - Structured JSON
- `yaml` - YAML format
- `txt` - Plain text (for character-limited tools)

### Filtered Output

Generate context sheets with filtered data:

```
"Generate a context sheet for [product] without [section]"
```

Example:
```
"Generate a context sheet for emergent without premium features or pricing information"
```

---

## Automation

### Git Hook Integration

Add a post-merge hook to prompt for regeneration:

```bash
# !/bin/bash
# .git/hooks/post-merge

# Check if EPF source files changed
if git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD | grep -q "docs/EPF/_instances/.*/00_north_star.yaml\|04_strategy_formula.yaml\|05_roadmap_recipe.yaml\|value_model.yaml"; then
  echo "⚠️  EPF source files changed. Consider regenerating context sheet."
  echo "Command: Ask AI to 'regenerate context sheet for [product]'"
fi
```

**Note:** Remove the space after the hash symbol in the shebang when creating the actual file.

### CI/CD Integration

Add a GitHub Action to auto-generate on EPF updates:

```yaml
# .github/workflows/regenerate-outputs.yml
name: Regenerate EPF Outputs

on:
  push:
    paths:
      - 'docs/EPF/_instances/*/00_north_star.yaml'
      - 'docs/EPF/_instances/*/04_strategy_formula.yaml'
      - 'docs/EPF/_instances/*/05_roadmap_recipe.yaml'
      - 'docs/EPF/_instances/*/value_models/*.yaml'

jobs:
  regenerate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Regenerate Context Sheets
        run: npm run regenerate:context-sheets
      - name: Commit Changes
        run: |
          git config user.name "EPF Bot"
          git config user.email "bot@example.com"
          git add docs/EPF/_instances/*/outputs/
          git commit -m "chore: regenerate context sheets [skip ci]"
          git push
```

---

## Troubleshooting

### Missing Data

**Problem**: Template shows empty sections or `{PLACEHOLDER}` text.

**Solution**: 
1. Check if source EPF files have the required data
2. Verify YAML paths in extraction step
3. Ensure EPF instance is complete and validated

### Outdated Context Sheet

**Problem**: Context sheet doesn't reflect recent EPF changes.

**Solution**: Regenerate the context sheet:
```
"Regenerate context sheet for [product]"
```

### Validation Errors

**Problem**: Schema validation fails.

**Solution**:
1. Check schema version compatibility
2. Review validation error messages
3. Ensure all required sections are present
4. Regenerate with latest wizard version

### Confidential Data Exposure

**Problem**: Context sheet contains sensitive information.

**Solution**:
1. Review core beliefs and values for guidance on what's shareable
2. Remove specific pricing, metrics, or internal strategy details
3. Use filtered output to exclude sensitive sections
4. Edit generated file manually if needed

---

## Related Resources

### Files in this Generator
- **Schema**: [`schema.json`](./schema.json) - Input validation
- **Validator**: [`validator.sh`](./validator.sh) - Output validation
- **Wizard**: [`wizard.instructions.md`](./wizard.instructions.md) - This file

### Documentation
- **Outputs Overview**: [`../README.md`](../README.md)
- **Core EPF Framework**: [`../../README.md`](../../README.md)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-30 | Initial version, moved to `/outputs/` structure |
| 0.9.0 | 2025-12-11 | Original version in `/wizards/` (deprecated) |

---

**Need Help?** Ask your AI assistant for guidance on EPF output generation.
