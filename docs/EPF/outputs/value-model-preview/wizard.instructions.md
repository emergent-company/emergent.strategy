# Value Model Preview Generator - Wizard Instructions

**Version:** 1.0.0  
**Schema Version:** 1.0.0  
**Purpose:** Generate shareable HTML previews of EPF value models  
**Output Format:** Single-file HTML (embedded CSS, no dependencies)  
**Target Audience:** Stakeholders, investors, team members, external collaborators

---

## 🤖 FOR AI ASSISTANTS: READ THIS BEFORE PROCEEDING

⚠️ **STOP - DO NOT CREATE CUSTOM CODE**

If you are an AI assistant asked to generate a value model preview:

❌ **DO NOT** create a custom Python/Node/etc script  
❌ **DO NOT** try to "optimize" or "simplify" this wizard  
❌ **DO NOT** skip phases or combine steps  
❌ **DO NOT** fetch external CSS frameworks  

✅ **DO** follow this wizard EXACTLY as written  
✅ **DO** execute each phase sequentially  
✅ **DO** use the `template.html` file as the base  
✅ **DO** validate with `validator.sh` (must be 0 errors)  

**Why this matters:**
- The template contains carefully designed embedded CSS
- Single-file output is critical for gist/sharing compatibility
- The structured approach ensures all value model data is captured

**This wizard IS the implementation.**

**See also:** `docs/EPF/outputs/AI_INSTRUCTIONS.md` for complete guidance.

---

## Overview

This wizard generates **shareable HTML previews** of EPF value models that:

- Work as single files (embedded CSS, no external dependencies)
- Can be uploaded to GitHub Gist for instant sharing
- Support dark/light themes automatically
- Display layers, components, and sub-components with visual hierarchy
- Allow injection of additional custom data sections

### Output Formats

| Format | Use Case | Output |
|--------|----------|--------|
| `single` | One value model | `{track}.value_model.html` |
| `portfolio` | All models | `portfolio.html` |
| `comparison` | Side-by-side | `comparison.html` |

---

## Phase 0: Pre-flight Validation

### Step 0.1: Identify Product and Collect Parameters

Gather the following from user request:

```yaml
Required:
  product: "{product-name}"  # e.g., "emergent"
  format: "single|portfolio|comparison"

Optional:
  models: []                  # Specific models, or auto-discover all
  theme: "auto|light|dark"    # Default: auto
  title: ""                   # Custom title, or auto-generate
  subtitle: ""                # Optional subtitle
  show_maturity: true         # Show maturity badges
  show_activation_status: true
  show_premium_flags: true
  collapsible_layers: true
  include_description: true
  include_solution_steps: false
  additional_data: []         # Custom sections to inject
```

### Step 0.2: Verify EPF Instance Exists

Check that product's EPF instance has value models:

```
docs/EPF/_instances/{product}/FIRE/value_models/
```

**Required files** (at least one):
- `*.value_model.yaml` files

**Auto-discovery command:**
```bash
ls docs/EPF/_instances/{product}/FIRE/value_models/*.value_model.yaml
```

### Step 0.3: Create Output Directory

Ensure output directory exists:

```bash
mkdir -p docs/EPF/_instances/{product}/outputs/value-model-previews/
```

---

## Phase 1: Read Source Data

### Step 1.1: Load Value Model File(s)

For each value model file to process:

```yaml
# Read the YAML file
file: docs/EPF/_instances/{product}/FIRE/value_models/{model}.value_model.yaml
```

### Step 1.2: Extract Core Fields

From each value model, extract:

```yaml
# Required fields
track_name: string         # "Product", "Strategy", "OrgOps", "Commercial"
version: string            # e.g., "1.0.0"
status: string             # "active", "placeholder", "deprecated"
description: string        # High-level description

# Optional fields
packaged_default: boolean
activation_notes: string
high_level_model: object   # Product-specific metadata
track_maturity: object     # Maturity assessment
layers: array              # L1 layers with components
```

### Step 1.3: Normalize Layer Structure

For each layer in `layers[]`:

```yaml
layer:
  id: string               # Unique identifier
  name: string             # Display name
  description: string      # Layer purpose
  solution_steps: array    # Optional implementation steps
  components: array        # L2 components
```

For each component in `layer.components[]`:

```yaml
component:
  id: string
  name: string
  description: string
  is_premium: boolean      # Premium flag
  status: string           # "active", "planned", "deprecated"
  sub_components: array    # L3 sub-components
```

For each sub_component:

```yaml
sub_component:
  id: string
  name: string
  status: string           # "active", "planned", "deprecated"
  value_proposition: string
  is_premium: boolean
```

---

## Phase 2: Prepare Template Variables

### Step 2.1: Generate Metadata Variables

```yaml
GENERATED_AT: "{ISO 8601 timestamp}"      # e.g., "2026-01-27T14:30:00Z"
GENERATED_DATE: "{human readable date}"   # e.g., "January 27, 2026"
THEME: "{auto|light|dark}"                # From parameters or default "auto"
```

### Step 2.2: Generate Header Variables

```yaml
TRACK_NAME: "{track_name from value model}"
TITLE: "{custom title OR track_name + ' Value Model'}"
SUBTITLE: "{custom subtitle OR description excerpt}"
VERSION: "{version from value model}"
STATUS: "{status from value model}"
STATUS_CLASS: "{status}"                   # For CSS class
```

### Step 2.3: Generate Maturity Variables (if enabled)

If `show_maturity: true` and `track_maturity` exists:

```yaml
MATURITY: "{track_maturity.overall_stage}"  # e.g., "emerging"
MATURITY_CLASS: "{maturity lowercase}"       # For CSS class
```

### Step 2.4: Prepare Description

If `include_description: true`:

```yaml
DESCRIPTION: "{description from value model}"
```

### Step 2.5: Prepare Layers Array

Transform each layer into template format:

```yaml
LAYERS:
  - id: "{layer.id}"
    name: "{layer.name}"
    description: "{layer.description}"
    components:
      - id: "{component.id}"
        name: "{component.name}"
        description: "{component.description}"
        is_premium: {true|false}
        status: "{status}"
        sub_components:
          - id: "{sub.id}"
            name: "{sub.name}"
            status: "{sub.status}"
            value_proposition: "{sub.value_proposition}"
    solution_steps: # If include_solution_steps: true
      - step: "{step.step}"
        outcome: "{step.outcome}"
```

### Step 2.6: Prepare Additional Data Sections

If `additional_data` provided, split by position:

```yaml
ADDITIONAL_DATA_BEFORE: # position: "before_layers"
  - title: "{section.title}"
    content: "{section.content}"

ADDITIONAL_DATA_AFTER:  # position: "after_layers"
  - title: "{section.title}"
    content: "{section.content}"
```

### Step 2.7: Prepare Footer

```yaml
FOOTER_TEXT: "{custom footer OR null for default}"
```

---

## Phase 3: Generate HTML Output

### Step 3.1: Load Template

Read the template file:

```
docs/EPF/outputs/value-model-preview/template.html
```

### Step 3.2: Replace Simple Placeholders

Replace all `{{VARIABLE}}` placeholders with their values:

| Placeholder | Value |
|-------------|-------|
| `{{THEME}}` | Theme setting |
| `{{TITLE}}` | Document title |
| `{{TRACK_NAME}}` | Track badge text |
| `{{SUBTITLE}}` | Subtitle text |
| `{{VERSION}}` | Version number |
| `{{STATUS}}` | Status text |
| `{{STATUS_CLASS}}` | Status CSS class |
| `{{MATURITY}}` | Maturity stage |
| `{{MATURITY_CLASS}}` | Maturity CSS class |
| `{{DESCRIPTION}}` | Description text |
| `{{GENERATED_AT}}` | ISO timestamp |
| `{{GENERATED_DATE}}` | Human date |
| `{{FOOTER_TEXT}}` | Footer content |

### Step 3.3: Process Conditional Blocks

Handle `{{#if VARIABLE}}...{{/if}}` blocks:

- If variable is truthy, keep content between tags
- If variable is falsy/empty, remove entire block including tags

Example:
```html
{{#if SUBTITLE}}
<p class="header__subtitle">{{SUBTITLE}}</p>
{{/if}}
```

### Step 3.4: Process Loop Blocks

Handle `{{#each ARRAY}}...{{/each}}` blocks:

- For each item in array, duplicate the content
- Replace item properties with `{{property}}`
- `{{@index_plus_one}}` = 1-based index

Example:
```html
{{#each LAYERS}}
<section class="layer" id="layer-{{id}}">
  <span class="layer__number">{{@index_plus_one}}</span>
  <span class="layer__name">{{name}}</span>
  ...
</section>
{{/each}}
```

### Step 3.5: Nested Loops

Process nested loops (components within layers, sub_components within components):

```html
{{#each LAYERS}}
  {{#each components}}
    {{#each sub_components}}
      <div class="sub-component sub-component--{{status}}">
        <span class="sub-component__name">{{name}}</span>
      </div>
    {{/each}}
  {{/each}}
{{/each}}
```

### Step 3.6: Clean Up

Remove any remaining template syntax that wasn't matched:
- Empty `{{#if}}...{{/if}}` blocks
- Unreplaced `{{VARIABLE}}` placeholders (warn if found)

---

## Phase 4: Write Output File

### Step 4.1: Determine Output Filename

**For single format:**
```
{track_name_lowercase}.value_model.html
```

Example: `product.value_model.html`

**For portfolio format:**
```
portfolio.html
```

**For comparison format:**
```
comparison.html
```

**Or use custom filename if provided:**
```
{output_filename}.html
```

### Step 4.2: Write to Output Directory

```
docs/EPF/_instances/{product}/outputs/value-model-previews/{filename}
```

### Step 4.3: Report Generation

Output to user:

```
✅ Generated: docs/EPF/_instances/{product}/outputs/value-model-previews/{filename}

Preview contains:
- Track: {track_name}
- Version: {version}
- Status: {status}
- Layers: {layer_count}
- Components: {component_count}
- Sub-components: {sub_component_count}

To validate:
  bash docs/EPF/outputs/value-model-preview/validator.sh {output_path}

To share:
  1. Copy file contents
  2. Create new GitHub Gist
  3. Name file with .html extension
  4. Share gist URL
```

---

## Phase 5: Validation

### Step 5.1: Run Validator

```bash
bash docs/EPF/outputs/value-model-preview/validator.sh {output_path}
```

### Step 5.2: Check Results

- **0 errors**: Output is valid and ready to use
- **Warnings only**: Output works but could be improved
- **Errors**: Must fix before output is usable

### Step 5.3: Common Issues

| Issue | Solution |
|-------|----------|
| Unreplaced placeholders | Check Phase 3 variable replacement |
| Missing layers | Verify value model has `layers` array |
| Missing styles | Ensure template.html was loaded correctly |
| External dependencies | Template should be self-contained |

---

## Portfolio Format (Multiple Models)

When `format: "portfolio"`:

### Additional Phase 2 Steps

**Step 2.8: Aggregate All Models**

Read all value model files and create portfolio structure:

```yaml
PORTFOLIO_MODELS:
  - track: "Product"
    title: "{high_level_model.product_line_name OR track_name}"
    version: "{version}"
    status: "{status}"
    layer_count: {count}
    component_count: {count}
    sub_component_count: {count}
    maturity: "{track_maturity.overall_stage}"
    
  - track: "Strategy"
    # ... etc
```

### Modified Phase 3: Portfolio Template

Use portfolio layout section from template:

```html
<div class="portfolio-grid">
  {{#each PORTFOLIO_MODELS}}
  <div class="portfolio-card">
    <span class="portfolio-card__track">{{track}}</span>
    <h2 class="portfolio-card__title">{{title}}</h2>
    <div class="portfolio-card__stats">
      <span>{{layer_count}} layers</span>
      <span>{{component_count}} components</span>
    </div>
  </div>
  {{/each}}
</div>
```

---

## Comparison Format (Side-by-Side)

When `format: "comparison"`:

### Additional Phase 2 Steps

**Step 2.9: Create Comparison Structure**

Organize models for side-by-side display:

```yaml
COMPARISON_TRACKS:
  - track: "Product"
    model: {full model data}
  - track: "Strategy"
    model: {full model data}
  # etc...
```

### Modified Phase 3: Comparison Layout

Generate two-column or grid layout comparing tracks.

---

## Additional Data Examples

### Example 1: KPI Section

```yaml
additional_data:
  - title: "Key Performance Indicators"
    content: |
      | Metric | Current | Target |
      |--------|---------|--------|
      | Active Users | 1,200 | 5,000 |
      | NPS Score | 42 | 50 |
      | Feature Adoption | 67% | 80% |
    position: "before_layers"
```

### Example 2: Roadmap Links

```yaml
additional_data:
  - title: "Related Roadmap Items"
    content: |
      - **Q1 2026**: Core Platform enhancements
      - **Q2 2026**: Enterprise features rollout
      - **Q3 2026**: Integration marketplace
    position: "after_layers"
```

### Example 3: Team Assignments

```yaml
additional_data:
  - title: "Team Ownership"
    content: |
      **Core Platform**: Platform Team (5 engineers)
      **Integrations**: Integrations Squad (3 engineers)
      **Analytics**: Data Team (2 engineers)
    position: "after_layers"
```

---

## Quick Reference: User Prompts

**Generate single model:**
```
"Generate an HTML preview for the emergent-core value model"
```

**Generate portfolio:**
```
"Generate an HTML portfolio preview for all Emergent value models"
```

**With custom options:**
```
"Generate an HTML preview for the strategy value model with dark theme and include solution steps"
```

**With additional data:**
```
"Generate an HTML preview for the product value model and add a section for Q1 2026 roadmap priorities"
```

---

## Template Placeholders Reference

| Placeholder | Type | Description |
|-------------|------|-------------|
| `{{THEME}}` | string | Theme setting (auto/light/dark) |
| `{{TITLE}}` | string | Document title |
| `{{TRACK_NAME}}` | string | Track name for badge |
| `{{SUBTITLE}}` | string | Optional subtitle |
| `{{VERSION}}` | string | Value model version |
| `{{STATUS}}` | string | Status text |
| `{{STATUS_CLASS}}` | string | Status for CSS class |
| `{{MATURITY}}` | string | Maturity stage text |
| `{{MATURITY_CLASS}}` | string | Maturity for CSS class |
| `{{DESCRIPTION}}` | string | High-level description |
| `{{GENERATED_AT}}` | string | ISO 8601 timestamp |
| `{{GENERATED_DATE}}` | string | Human-readable date |
| `{{FOOTER_TEXT}}` | string | Custom footer or null |
| `{{LAYERS}}` | array | Layer objects |
| `{{ADDITIONAL_DATA_BEFORE}}` | array | Sections before layers |
| `{{ADDITIONAL_DATA_AFTER}}` | array | Sections after layers |

---

## Validation Checklist

Before considering generation complete:

- [ ] HTML file created in output directory
- [ ] No template placeholders remain unreplaced
- [ ] File opens correctly in browser
- [ ] All layers display with correct hierarchy
- [ ] Status badges show correct colors
- [ ] Theme switching works (if auto)
- [ ] File works when uploaded to GitHub Gist
- [ ] `validator.sh` returns 0 errors

---

## Troubleshooting

### "File not found" when loading template

Ensure you're reading from:
```
docs/EPF/outputs/value-model-preview/template.html
```

### Styles not appearing

Check that the entire `<style>` block was preserved. Do not strip CSS.

### Layers not collapsing

Ensure JavaScript section at bottom of template was preserved.

### Gist preview not working

- Filename must end in `.html`
- Check for external resource references (should be none)
- Verify DOCTYPE is first line

### Wrong track colors

Status classes must match exactly:
- `status-badge--active`
- `status-badge--planned`
- `status-badge--deprecated`
- `status-badge--placeholder`
