# Investor Memo Generator

This output generator creates comprehensive investor memos from EPF data for fundraising, partnerships, and strategic discussions.

## 📋 Before You Start - Decision Tree

**Are you sure you want to generate investor materials?**

```
┌──────────────────────────────────────────────────┐
│ Do you have complete EPF strategic artifacts?   │
│ - North Star (vision, personas, design)         │
│ - Strategy Formula (market, positioning, moat)  │
│ - Strategy Foundations (value prop, sequencing) │
│ - Roadmap Recipe (OKRs, Key Results)           │
└──────────────────────────────────────────────────┘
         │                            │
        YES                          NO
         │                            │
         ▼                            ▼
┌──────────────────────┐    ┌────────────────────┐
│ Do you have FIRE     │    │ Complete missing   │
│ feature definitions? │    │ EPF artifacts first│
│ (3-5 features min)   │    └────────────────────┘
└──────────────────────┘              │
         │                            │
        YES                          STOP
         │
         ▼
┌──────────────────────────────────────┐
│ Is your product positioning clear?   │
│ - Target market defined              │
│ - Competitive moat articulated       │
│ - Value props differentiated         │
└──────────────────────────────────────┘
         │                      │
        YES                    NO
         │                      │
         ▼                      ▼
┌──────────────────┐   ┌────────────────────┐
│ Do you have:     │   │ Refine strategy    │
│ - Market size    │   │ artifacts before   │
│ - Growth metrics │   │ creating investor  │
│ - Team info      │   │ materials          │
└──────────────────┘   └────────────────────┘
         │                      │
        YES                    STOP
         │
         ▼
┌────────────────────────────────────┐
│ ✅ READY TO GENERATE               │
│                                    │
│ Next steps:                        │
│ 1. Open wizard.instructions.md    │
│ 2. Execute data extraction phase  │
│ 3. Generate all 5 documents       │
│ 4. Validate with validator.sh     │
│ 5. Review for consistency         │
└────────────────────────────────────┘
```

**Key Decision Point:** Investor materials require COMPLETE strategic foundation. Gaps will be obvious to investors.

---

## Quick Start

### 1. Generate Investor Memo

Follow the wizard to generate a complete investor memo:

```bash
# Ask your AI assistant
"Generate an investor memo for {product} using the EPF output generator"

# Output: docs/EPF/_instances/{product}/outputs/investor-memo/{product}-investor-memo-{date}.md
```

### 2. Validate Investor Memo

```bash
bash docs/EPF/outputs/investor-memo/validator.sh \
  docs/EPF/_instances/emergent/outputs/investor-memo/emergent-investor-memo-2025-12-31.md
```

### 3. Fix Issues

The validator will identify:
- **Errors** (must fix): Missing sections, placeholder text, broken traceability
- **Warnings** (review): Weak problem statements, missing evidence, formatting issues

### 4. Use Investor Memo

Export to PDF and use for:
- **Seed/Series A fundraising** - Complete investment case
- **Strategic partnerships** - Business model and market opportunity
- **Board presentations** - Quarterly updates and strategic decisions
- **Due diligence** - Comprehensive product and market documentation

## Files

| File | Purpose |
|------|---------|
| `wizard.instructions.md` | Complete instructions for generating investor memos (1,341 lines) |
| `validator.sh` | Validation script checking structure, semantics, traceability |
| `schema.json` | JSON Schema defining input parameters |
| `README.md` | This file |

## Validation Layers

The validator performs 4 layers of checks:

### Layer 1: Schema Structure
- 10 required sections present:
  - Executive Summary
  - Problem & Opportunity
  - Solution & Product
  - Market Analysis
  - Business Model
  - Go-to-Market Strategy
  - Competitive Landscape
  - Product Roadmap
  - Team & Execution
  - Financials & Ask
- Metadata block present (product_name, generated_date, epf_version)
- EPF Traceability section present

### Layer 2: Semantic Rules
- No placeholder text (XXX, [TODO], [TBD], {{...}})
- Problem statements specific (not generic "companies struggle with...")
- Financial projections include numbers (revenue, costs, runway)
- Team section includes roles and relevant experience
- Market sizing includes TAM, SAM, SOM calculations
- Competitive analysis includes 3+ competitors

### Layer 3: Traceability
- Roadmap KR references (kr-p-XXX format)
- North Star references (purpose, vision)
- Value Model references (UVPs, capabilities)
- Strategy Formula references (positioning, target customer)
- At least 10 distinct EPF source references

### Layer 4: Content Quality
- Executive summary length (200-500 words)
- Section balance (no section >50% of total length)
- Consistent tone and terminology
- Proper heading hierarchy
- No broken internal links

## Exit Codes

- `0` - Valid, ready to share
- `1` - Invalid (errors found, must fix)
- `2` - File not found
- `3` - Warnings only (review recommended)

## Environment Variables

```bash
# Treat warnings as errors (strict mode)
VALIDATION_STRICT=true bash validator.sh investor-memo.md

# Minimum number of EPF source references (default: 10)
VALIDATION_MIN_REFERENCES=10 bash validator.sh investor-memo.md

# Minimum number of competitors to analyze (default: 3)
VALIDATION_MIN_COMPETITORS=3 bash validator.sh investor-memo.md
```

## Common Issues

### Error: Found placeholder text: {{company_name}}

**Problem:** Template variables not replaced during generation

**Fix:** This typically happens if EPF source files are missing critical data:
1. Check `00_north_star.yaml` for organization name
2. Check `04_strategy_formula.yaml` for company description
3. Regenerate with complete source files

### Error: Problem statement too generic

**Problem:** Problem section uses generic language like "companies struggle with data management"

**Fix:** Replace with specific pain points from personas:
- ❌ Generic: "Companies need better knowledge management"
- ✅ Specific: "Engineering teams waste 15+ hours/week searching for tribal knowledge across Confluence, Notion, Jira, and Slack, leading to duplicated work and frustrated developers"

Source persona pain points from:
```yaml
# In 00_north_star.yaml or value_models/product.value_model.yaml
personas[].current_situation
personas[].transformation_moment
```

### Error: Missing EPF traceability section

**Problem:** Investor memo doesn't include traceability to EPF sources

**Fix:** Add section at end of document:
```markdown
## EPF Traceability

This investor memo is generated from the following EPF artifacts:

**Strategy & Vision:**
- North Star: [Purpose, Vision, Mission] (ref: 00_north_star.yaml)
- Strategy Formula: [Positioning, Target Customer, Competitive Moat] (ref: 04_strategy_formula.yaml)

**Product & Value:**
- Value Model: [UVPs, Capabilities, JTBD] (ref: value_models/product.value_model.yaml)
- Roadmap Recipe: [Current Focus, Key Initiatives] (ref: 05_roadmap_recipe.yaml)

**Key References:**
- KR-P-001: [Description] (ref: 05_roadmap_recipe.yaml, line 123)
- KR-P-002: [Description] (ref: 05_roadmap_recipe.yaml, line 456)
...
```

### Warning: Market sizing unclear

**Problem:** TAM/SAM/SOM calculations missing or incomplete

**Fix:** Add structured market sizing in "Market Analysis" section:
```markdown
### Market Size

**Total Addressable Market (TAM):** $15B
- Global knowledge management software market
- 50,000 enterprise customers worldwide
- Average spend: $300K/year

**Serviceable Addressable Market (SAM):** $1.8B (12% of TAM)
- English-speaking markets (US, UK, EU, Canada, Australia)
- Enterprise customers with 500+ employees
- Using legacy systems (Confluence, Notion, SharePoint)

**Serviceable Obtainable Market (SOM):** $180M (10% of SAM, Year 3)
- Penetration: 600 customers
- Average deal size: $300K
- Focus: Engineering-first companies in tech/SaaS sector
```

Source data from `04_strategy_formula.yaml`:
```yaml
strategy_formula.market_strategy.market_size
strategy_formula.market_strategy.addressable_market
```

### Warning: Competitive analysis incomplete

**Problem:** Fewer than 3 competitors analyzed

**Fix:** Add competitive analysis section with at least 3 direct competitors:
```markdown
### Competitive Landscape

| Competitor | Strengths | Weaknesses | Differentiation |
|------------|-----------|------------|-----------------|
| Confluence | Market leader, integrations | Poor search, siloed | Real-time graph, AI-powered |
| Notion | Great UX, flexible | No knowledge graph | Structured relationships |
| Guru | Browser extension | Surface-level | Deep context understanding |
```

Source from `04_strategy_formula.yaml`:
```yaml
strategy_formula.competitive_strategy.competitive_landscape[]
strategy_formula.competitive_strategy.differentiation
```

## Best Practices

### 1. Version Control
Store investor memos in `outputs/investor-memo/` directory:
```
docs/EPF/_instances/{product}/outputs/investor-memo/
  {product}-investor-memo-2025-12-31.md
  {product}-investor-memo-2026-01-15.md  (updated after pivot)
  {product}-investor-memo-2026-04-01.md  (Series A version)
```

### 2. Naming Convention
Use date suffix and optional context:
```
{product}-investor-memo-{YYYY-MM-DD}.md
{product}-investor-memo-{YYYY-MM-DD}-seed-round.md
{product}-investor-memo-{YYYY-MM-DD}-series-a.md
```

### 3. Customization by Audience
Generate different versions for different investors:
- **VC firms** - Emphasize market size, growth, competitive moat
- **Angel investors** - Emphasize team, traction, capital efficiency
- **Strategic investors** - Emphasize partnerships, synergies, market access
- **Grant programs** - Emphasize innovation, R&D, social impact

### 4. Keep Updated
- Regenerate after major milestones (product launches, key hires, funding rounds)
- Update financials monthly
- Refresh market analysis quarterly
- Maintain version history for comparison

### 5. Export to PDF
Use consistent branding:
```bash
# Using pandoc with custom template
pandoc investor-memo.md \
  --template=company-template.latex \
  --pdf-engine=xelatex \
  -o investor-memo.pdf

# Or use markdown-pdf
markdown-pdf investor-memo.md \
  --stylesheet company-styles.css \
  --out investor-memo.pdf
```

## Related Documentation

- [Wizard Instructions](./wizard.instructions.md) - Complete generation guide
- [EPF Validation System](../VALIDATION_README.md) - Overview of all validators
- [SkatteFUNN Validator](../skattefunn-application/README.md) - Another example
- [Context Sheet Validator](../context-sheet/README.md) - Another example

## Investor Memo Structure

### Standard 10-Section Format

1. **Executive Summary** (1 page) - Elevator pitch, key metrics, ask
2. **Problem & Opportunity** (2-3 pages) - Pain points, market gap, urgency
3. **Solution & Product** (2-3 pages) - How it works, key features, differentiation
4. **Market Analysis** (2-3 pages) - TAM/SAM/SOM, trends, customer segments
5. **Business Model** (1-2 pages) - Pricing, unit economics, revenue streams
6. **Go-to-Market Strategy** (2 pages) - Customer acquisition, channels, partnerships
7. **Competitive Landscape** (2 pages) - Competitors, positioning, moat
8. **Product Roadmap** (1-2 pages) - Current state, 12-month plan, vision
9. **Team & Execution** (1-2 pages) - Key people, advisors, execution track record
10. **Financials & Ask** (2-3 pages) - Projections, use of funds, milestones

**Total:** 15-25 pages (adjust with customization in v2.0 🎯)

## Use Cases

### Seed Fundraising
```
Focus: Problem validation, early traction, team quality
Sections: Problem (detailed), Solution (overview), Team (detailed)
Length: 15-18 pages
```

### Series A Fundraising
```
Focus: Product-market fit, unit economics, growth trajectory
Sections: Market Analysis (detailed), Business Model (detailed), Financials (detailed)
Length: 20-25 pages
```

### Strategic Partnerships
```
Focus: Market alignment, synergies, co-selling opportunities
Sections: Market Analysis, Go-to-Market, Competitive Landscape
Length: 12-15 pages
```

### Board Presentations
```
Focus: Progress vs. plan, key decisions, resource needs
Sections: Executive Summary, Product Roadmap, Financials
Length: 10-12 pages
```

## Version History

- **v2.1.0** (2026-01-03) - Added README.md, standardized with skattefunn pattern
- **v2.0.0** (2026-01-01) - Shell validator with 4-layer validation
- **v1.0.0** (2025-11-20) - Initial release
