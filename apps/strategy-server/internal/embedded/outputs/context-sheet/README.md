# Context Sheet Generator

This output generator creates AI Context Sheets from EPF data for use with external AI tools (ChatGPT, Claude, etc.).

## Quick Start

### 1. Generate Context Sheet

Follow the wizard to generate an up-to-date context sheet:

```bash
# Ask your AI assistant
"Generate a context sheet for {product} using the EPF output generator"

# Output: docs/EPF/_instances/{product}/outputs/context-sheet/{product}-context-sheet-{date}.md
```

### 2. Validate Context Sheet

```bash
bash docs/EPF/outputs/context-sheet/validator.sh \
  docs/EPF/_instances/emergent/outputs/context-sheet/emergent-context-sheet-2025-12-31.md
```

### 3. Fix Issues

The validator will identify:
- **Errors** (must fix): Missing metadata, invalid structure, missing required sections
- **Warnings** (review): Stale sources (>90 days old), missing best practices

### 4. Use Context Sheet

Copy the validated context sheet into your external AI tool (ChatGPT, Claude, Gemini) to provide product context for:
- Content creation (blog posts, landing pages, documentation)
- Marketing materials (email campaigns, social posts)
- Sales enablement (pitch decks, one-pagers)
- Team onboarding (new hires, contractors)

## Files

| File | Purpose |
|------|---------|
| `wizard.instructions.md` | Complete instructions for generating context sheets (555 lines) |
| `validator.sh` | Validation script checking structure, metadata, freshness |
| `schema.json` | JSON Schema defining input parameters |
| `README.md` | This file |

## Validation Layers

The validator performs 4 layers of checks:

### Layer 1: Metadata Structure
- HTML comment block present at top of file
- Required metadata fields: product_name, generated_date, epf_version, source_files
- Valid date format (YYYY-MM-DD)
- Valid EPF version format (X.Y.Z)

### Layer 2: Semantic Rules
- 8 required sections present:
  - Purpose & North Star
  - Strategic Positioning
  - Target Customers & Personas
  - Value Propositions
  - Key Capabilities
  - Current Focus & Roadmap
  - Success Metrics
  - Tone & Voice Guidelines
- Each section has substantive content (>100 chars)
- No placeholder text (XXX, [TODO], [TBD])

### Layer 3: Freshness Validation
- Source files checked for age
- **Warning** if any source >90 days old (stale)
- **Error** if any source >180 days old (critically stale)
- Recommendation to regenerate if sources updated

### Layer 4: Markdown Formatting
- Valid markdown structure
- Proper heading hierarchy (H1 → H2 → H3)
- No broken internal links
- Consistent formatting

## Exit Codes

- `0` - Valid, ready to use
- `1` - Invalid (errors found, must fix)
- `2` - File not found
- `3` - Stale sources (warning mode)

## Environment Variables

```bash
# Maximum source age before warning (default: 90 days)
VALIDATION_MAX_SOURCE_AGE=90 bash validator.sh context-sheet.md

# Maximum source age before error (default: 180 days)
VALIDATION_MAX_SOURCE_AGE_ERROR=180 bash validator.sh context-sheet.md

# Warn instead of fail on stale sources
VALIDATION_WARN_STALE=true bash validator.sh context-sheet.md

# Treat warnings as errors (strict mode)
VALIDATION_STRICT=true bash validator.sh context-sheet.md
```

## Common Issues

### Error: Missing metadata field: product_name

**Problem:** HTML comment block at top of file is missing or incomplete

**Fix:** Ensure file starts with complete metadata block:
```markdown
<!--
product_name: emergent
generated_date: 2025-12-31
epf_version: 2.1.0
source_files:
  - docs/EPF/_instances/emergent/00_north_star.yaml
  - docs/EPF/_instances/emergent/04_strategy_formula.yaml
  - docs/EPF/_instances/emergent/05_roadmap_recipe.yaml
  - docs/EPF/_instances/emergent/value_models/product.value_model.yaml
-->
```

### Error: Required section missing: Purpose & North Star

**Problem:** One of the 8 required sections is missing from the output

**Fix:** Regenerate the context sheet using the wizard. The generator should create all 8 sections automatically from EPF source files.

### Warning: Source file is stale (120 days old)

**Problem:** EPF source file hasn't been updated in >90 days, context sheet may be outdated

**Fix:**
1. Review the source file (e.g., `00_north_star.yaml`)
2. Update if needed based on recent product changes
3. Regenerate context sheet with fresh data

**Alternative:** If source file is still accurate, you can:
- Set `VALIDATION_WARN_STALE=true` to demote to warning
- Update source file timestamp: `touch docs/EPF/_instances/{product}/00_north_star.yaml`

### Error: Found placeholder text: [TODO]

**Problem:** Generated content contains unfilled placeholders

**Fix:** This typically happens if EPF source files have incomplete data:
1. Check source files for missing fields
2. Complete the EPF artifacts first
3. Regenerate context sheet

## When to Regenerate

Generate a fresh context sheet when:
- ✅ After completing an EPF cycle (READY → FIRE → AIM)
- ✅ After significant strategy updates (North Star, Strategy Formula)
- ✅ Before marketing campaigns or content sprints
- ✅ When onboarding new team members
- ✅ Quarterly, as part of EPF maintenance
- ✅ Before investor meetings or partnership discussions
- ✅ When validator shows stale sources (>90 days)

## Best Practices

### 1. Version Control
Store context sheets in `outputs/context-sheet/` directory:
```
docs/EPF/_instances/{product}/outputs/context-sheet/
  {product}-context-sheet-2025-12-31.md
  {product}-context-sheet-2026-01-15.md
  {product}-context-sheet-2026-04-01.md
```

### 2. Naming Convention
Use date suffix for version tracking:
```
{product}-context-sheet-{YYYY-MM-DD}.md
```

### 3. Share with Team
- Commit context sheets to git for team access
- Update internal wiki/documentation links
- Include in onboarding materials
- Reference in AI tool prompts

### 4. Keep Fresh
- Set calendar reminder to regenerate quarterly
- Regenerate after major product updates
- Monitor source file freshness with validator

## Related Documentation

- [Wizard Instructions](./wizard.instructions.md) - Complete generation guide
- [EPF Validation System](../VALIDATION_README.md) - Overview of all validators
- [SkatteFUNN Validator](../skattefunn-application/README.md) - Another example
- [Investor Memo Validator](../investor-memo/README.md) - Another example

## Use Cases

### Content Creation
```
Context: {paste context sheet}

Task: Write a blog post about {topic} for our target audience
```

### Marketing Copy
```
Context: {paste context sheet}

Task: Create 5 LinkedIn posts highlighting our key value propositions
```

### Sales Enablement
```
Context: {paste context sheet}

Task: Generate a 1-page sales sheet for enterprise customers
```

### Documentation
```
Context: {paste context sheet}

Task: Write onboarding documentation for new developers
```

## Version History

- **v2.1.0** (2026-01-03) - Added README.md, standardized with skattefunn pattern
- **v2.0.0** (2025-12-31) - Shell validator with 4-layer validation
- **v1.0.0** (2025-11-15) - Initial release
