# Investor Memo Package Generator

**Purpose**: Generate complete investor materials package including comprehensive memo, executive summary, one-page pitch, FAQ, and materials index from EPF strategic planning artifacts.

**Output Location**: `docs/EPF/_instances/{product}/outputs/investor-materials/{YYYY-MM-DD}/`

**Schema**: `schema.json`

**Validation**: `validator.sh`

---

## 🤖 FOR AI ASSISTANTS: READ THIS BEFORE PROCEEDING

⚠️ **STOP - DO NOT CREATE CUSTOM CODE**

If you are an AI assistant asked to generate investor materials:

❌ **DO NOT** create a custom Python/Node/etc script  
❌ **DO NOT** try to "optimize" or "simplify" this wizard  
❌ **DO NOT** skip phases or combine steps  
❌ **DO NOT** invent your own narrative structure  

✅ **DO** follow this 1,342-line wizard EXACTLY as written  
✅ **DO** execute each phase sequentially  
✅ **DO** use the official `template.md` structures (5 separate documents)  
✅ **DO** validate with `validator.sh` (must be 0 errors)  

**Why this matters:**
- This wizard encodes **seed-stage investor expectations** (tested with 20+ funds)
- The package structure is designed for **different reading contexts** (partner meeting vs quick scan)
- Custom code WILL produce generic content that fails to differentiate your product
- The multi-document approach is strategic - investors use different docs at different stages

**This wizard IS the implementation.** It has been refined through actual fundraising cycles. Your job is to EXECUTE it, not rewrite it.

**See also:** `docs/EPF/outputs/AI_INSTRUCTIONS.md` for complete guidance.

---

## Overview

This wizard generates a **complete investor materials package** suitable for seed-stage fundraising, consisting of:

1. **Comprehensive Investor Memo** (30-40 pages) - Deep due diligence document
2. **Executive Summary** (12-15 pages) - Partner evaluation and initial interest
3. **One-Page Pitch** (4-6 pages) - Quick screening and introductions
4. **Investor FAQ** (20-30 pages) - Q&A reference and objection handling
5. **Materials Index** (8-10 pages) - Package navigation and document guide

### Target Audience

- **Seed investors** evaluating early-stage B2B SaaS / AI infrastructure companies
- **Technical investors** who appreciate product-led growth and developer tools
- **Strategic partners** considering investment or partnership opportunities

### Expected Time Investment

- **Data extraction**: 45-60 minutes (gather EPF sources, validate completeness)
- **Content generation**: 2-3 hours (all 5 documents with proper formatting)
- **Review & refinement**: 1-2 hours (validate against schema, check consistency)
- **Total**: 4-6 hours for complete polished package

---

## Prerequisites

### Required EPF Sources

1. **North Star** (`00_north_star.yaml`)
   - Vision, mission, values
   - Design philosophy
   - User personas and jobs-to-be-done

2. **Strategy Formula** (`04_strategy_formula.yaml`)
   - Market analysis (trends, segments, competition)
   - Strategic positioning
   - Value propositions and moats

3. **Roadmap Recipe** (`05_roadmap_recipe.yaml`)
   - Strategic phases and milestones
   - Key results and metrics
   - Timeline and priorities

4. **Value Models** (`value_models/*.yaml`)
   - Product capabilities
   - Pricing tiers
   - Business model and unit economics

5. **Insight Analyses** (optional but recommended)
   - Competitive research
   - Market sizing data
   - Customer validation evidence

### Validation Checklist

Before generating, ensure:

- [ ] All required EPF files exist and are up-to-date (< 30 days old)
- [ ] North Star has clear vision, mission, target users, and JTBD
- [ ] Strategy Formula includes TAM/SAM/SOM market sizing
- [ ] Roadmap Recipe has 3-5 year strategic phases defined
- [ ] Value Models cover all product lines with pricing
- [ ] Financial projections exist (5-year ARR targets)
- [ ] Team information available (founders, key hires, advisors)
- [ ] Traction metrics available (users, revenue, growth rate)

---

## Generation Steps

### Step 1: Initialize Package Metadata

Create metadata header for all documents:

```yaml
metadata:
  generated_at: "{ISO 8601 timestamp}"
  epf_version: "{EPF version from EPF/README.md}"
  product_name: "{from north_star.yaml → vision.product_name}"
  round_type: "seed"  # or "pre-seed", "series-a", etc.
  package_version: "1.0"
  last_updated: "{human-readable date}"
  epf_sources:
    north_star: "docs/EPF/_instances/{product}/00_north_star.yaml"
    strategy_formula: "docs/EPF/_instances/{product}/04_strategy_formula.yaml"
    roadmap_recipe: "docs/EPF/_instances/{product}/05_roadmap_recipe.yaml"
    value_models:
      - "docs/EPF/_instances/{product}/value_models/{model1}.yaml"
      - "docs/EPF/_instances/{product}/value_models/{model2}.yaml"
    insight_analyses:  # optional
      - "docs/EPF/_instances/{product}/insight_analyses/{analysis}.md"
  contact_info:
    company: "{company name}"
    website: "{company website}"
    email: "{investor relations email}"
```

**Extraction Pattern**:
- `product_name`: `north_star.yaml → vision.what_we_build`
- `epf_version`: `docs/EPF/README.md → ## Version`
- `contact_info`: Manual input or from team documentation

---

### Step 2: Generate Comprehensive Investor Memo

**Target**: 30-40 pages, 45-60 minute read time, deep due diligence document

#### Section 1: Executive Summary (600-800 words)

**Content Requirements**:
- Problem statement in 2-3 sentences
- Solution overview with key differentiators
- Market opportunity (TAM/SAM/SOM)
- Traction highlights (key metrics)
- Investment ask and use of funds

**EPF Source Mapping**:
```yaml
# Problem Statement
north_star.yaml → jobs_to_be_done[*].struggles_when
north_star.yaml → jobs_to_be_done[*].desired_outcome

# Solution Overview
north_star.yaml → vision.what_we_build
value_models[*].yaml → capabilities[*].description

# Market Opportunity
strategy_formula.yaml → market_analysis.segments[*].size
strategy_formula.yaml → market_analysis.trends[*].impact

# Traction
roadmap_recipe.yaml → cycles[0].krs[*].target  # Q1 metrics
# Manual: actual traction data (users, revenue, growth)

# Investment Ask
# Manual: funding amount, use of funds allocation
```

**Generation Template**:
```markdown
# {Product Name}: Comprehensive Investor Memo

**{Tagline from north_star.yaml → vision.tagline}**

---

## Executive Summary

**The Problem**: {Synthesize from jobs_to_be_done[*].struggles_when}

**The Opportunity**: {Extract from market_analysis.segments[*] showing TAM/SAM/SOM}

**Our Solution**: {Describe from vision.what_we_build and capabilities[*]}

**Traction**: {List key metrics from roadmap KRs and actual data}

**The Ask**: {State funding round, amount, and primary use cases}

---
```

#### Section 2: Problem Statement (1000-1500 words)

**Content Requirements**:
- User pain points with evidence (statistics, quotes)
- Market evidence (research, analyst reports)
- Why now / timing factors
- Consequences of unsolved problem

**EPF Source Mapping**:
```yaml
# User Pain Points
north_star.yaml → personas[*].context
north_star.yaml → jobs_to_be_done[*].struggles_when
north_star.yaml → jobs_to_be_done[*].desired_outcome

# Market Evidence
strategy_formula.yaml → market_analysis.trends[*]
  → trend_name
  → evidence
  → impact
  → timing

# Supporting Data
insight_analyses/*.md → competitive research
insight_analyses/*.md → market sizing documents
```

**Generation Pattern**:
1. Open with compelling statistic (from trends.evidence)
2. Describe user context and struggles (from personas and JTBD)
3. Present market evidence (from trends)
4. Explain consequences (synthesize from desired_outcomes)
5. Set up timing rationale (from trends.timing)

#### Section 3: Market Opportunity (2000-2500 words)

**Content Requirements**:
- TAM/SAM/SOM sizing with methodology
- Market trends analysis (5-7 key trends)
- Target customer segments
- Go-to-market motion

**EPF Source Mapping**:
```yaml
# Market Sizing
strategy_formula.yaml → market_analysis.segments[*]
  → name
  → size
  → characteristics
  → needs

# Trends
strategy_formula.yaml → market_analysis.trends[*]
  → trend_name
  → description
  → evidence
  → impact (high/medium/low)
  → timing (near/mid/far)
  → implication

# Target Segments
north_star.yaml → personas[*]
  → name
  → context
  → characteristics
```

**Generation Template**:
```markdown
## 3. Market Opportunity

### Size & Growth

**TAM (Total Addressable Market)**: ${size} {from segments[0].size}
- {segments[0].description}

**SAM (Serviceable Addressable Market)**: ${size} {from segments[1].size}
- {segments[1].description}

**SOM (Serviceable Obtainable Market)**: ${size} {from segments[2].size}
- {segments[2].description}

### Key Market Trends

{For each trend in trends[*] where impact="high" and timing="near"}

**{trend.trend_name}** ({impact}, {timing})
- **Description**: {trend.description}
- **Evidence**: {trend.evidence}
- **Impact**: {trend.impact}
- **Implication**: {trend.implication}

{End for each}

### Target Customer Segments

{For each persona in personas[*]}

**{persona.name}**
- **Context**: {persona.context}
- **Size**: {calculate from segments[*].size}
- **Characteristics**: {persona.characteristics}
- **Needs**: {from corresponding jobs_to_be_done}
- **Willingness to Pay**: {from value_models → pricing_strategy}

{End for each}
```

#### Section 4: Product & Technology (3000-4000 words)

**Content Requirements**:
- Product philosophy and approach
- Core capabilities overview
- Technical architecture highlights
- Competitive differentiation
- Technology moats

**EPF Source Mapping**:
```yaml
# Philosophy
north_star.yaml → design_philosophy
  → name
  → description
  → principles[*]

# Product Portfolio
value_models[*].yaml → product_name
value_models[*].yaml → capabilities[*]
  → name
  → description
  → job_alignment

# Competitive Positioning
strategy_formula.yaml → competitive_landscape[*]
  → competitor_name
  → strengths
  → our_angle
  → wedge_strategy

# Technology Moats
strategy_formula.yaml → moats[*]
  → moat_type
  → description
  → evidence
```

**Generation Template**:
```markdown
## 4. Product & Technology

### Our Philosophy: {design_philosophy.name}

**Core Belief**: {design_philosophy.description}

{design_philosophy.principles[*] as bullet points}

### Product Portfolio

{For each value_model in value_models[*]}

#### **{value_model.product_name}** ({value_model.product_type})

{value_model.description}

**Core Capabilities:**
{For each capability in value_model.capabilities[*]}

{n}. **{capability.name}**
   - {capability.description}
   - **Job Alignment**: {capability.job_alignment}
   - **Technical Approach**: {capability.implementation_notes if available}

{End for each capability}

{End for each value_model}

### Competitive Differentiation

{For each competitor in competitive_landscape[*]}

#### vs. {competitor.name}

- **Their Strength**: {competitor.strengths}
- **Our Angle**: {competitor.our_angle}
- **Wedge Strategy**: {competitor.wedge_strategy}

{End for each}

### Technology Moats

{For each moat in moats[*]}

**{n}. {moat.moat_type}**
- **Description**: {moat.description}
- **Evidence**: {moat.evidence}
- **Defensibility**: {moat.durability assessment}

{End for each}
```

#### Section 5: Business Model & Economics (2000-2500 words)

**Content Requirements**:
- Revenue model overview
- Pricing tiers and rationale
- Unit economics targets
- Growth engines and CAC/LTV

**EPF Source Mapping**:
```yaml
# Revenue Model
value_models[*].yaml → pricing_strategy
  → model_type
  → tiers[*]
    → name
    → price
    → limits
    → target_segment

# Unit Economics
strategy_formula.yaml → financial_assumptions
  → cac_target
  → ltv_target
  → ltv_cac_ratio
  → payback_period
  → gross_margin

# Growth Engines
strategy_formula.yaml → growth_strategy
  → acquisition_channels[*]
  → retention_strategy
```

**Generation Template**:
```markdown
## 5. Business Model & Economics

### Revenue Model

**Pricing Philosophy**: {pricing_strategy.philosophy}

### Pricing Tiers

| Tier | Price | Limits | Target |
|------|-------|--------|--------|
{For each tier in pricing_strategy.tiers[*]}
| **{tier.name}** | {tier.price} | {tier.limits} | {tier.target_segment} |
{End for each}

### Unit Economics Targets

- **CAC (Customer Acquisition Cost)**: {financial_assumptions.cac_target}
- **LTV (Lifetime Value)**: {financial_assumptions.ltv_target}
- **LTV:CAC Ratio**: {financial_assumptions.ltv_cac_ratio}
- **Payback Period**: {financial_assumptions.payback_period}
- **Gross Margin**: {financial_assumptions.gross_margin}

### Growth Engines

{For each channel in growth_strategy.acquisition_channels[*]}

**{n}. {channel.name}**
- **Approach**: {channel.description}
- **Efficiency**: {channel.expected_cac}
- **Scale Potential**: {channel.scalability}

{End for each}
```

#### Section 6: Strategic Roadmap & Milestones (2500-3000 words)

**Content Requirements**:
- Multi-phase market entry strategy
- Key milestones and success criteria
- Current quarter KRs
- Timeline and dependencies

**EPF Source Mapping**:
```yaml
# Strategic Phases
roadmap_recipe.yaml → phases[*]
  → name
  → time_horizon
  → target_segment
  → value_delivered
  → success_criteria
  → rationale

# Current Quarter KRs
roadmap_recipe.yaml → cycles[0]  # Q1 or current cycle
  → cycle_name
  → okrs[*]
    → track
    → objective
    → key_results[*]

# Milestones
roadmap_recipe.yaml → milestones[*]
  → date
  → description
  → dependencies
```

**Generation Template**:
```markdown
## 6. Strategic Roadmap & Milestones

### Three-Phase Market Entry

{For each phase in phases[*]}

#### **Phase {n}: {phase.name}** ({phase.time_horizon})

**Target**: {phase.target_segment}

**Value Delivered**:
{phase.value_delivered as bullet list}

**Success Criteria**:
{For each criterion in phase.success_criteria[*]}
- {criterion}
{End for each}

**Strategic Rationale**: {phase.rationale}

{End for each phase}

### {cycles[0].cycle_name} Key Results (Current Focus)

{For each okr in cycles[0].okrs[*]}

#### {okr.track} Track

**OKR**: {okr.objective}

{For each kr in okr.key_results[*]}
- {kr}
{End for each}

{End for each okr}

### Key Milestones Timeline

{For each milestone in milestones[*] sorted by date}
- **{milestone.date}**: {milestone.description}
{End for each}
```

#### Section 7: Team & Execution (1500-2000 words)

**Content Requirements**:
- Core team overview and expertise
- Track record and credibility
- Execution strategy and approach
- Key hiring priorities

**EPF Source Mapping**:
```yaml
# Team Information
# Manual or from separate team documentation:
# - Founder backgrounds
# - Key team members
# - Advisors and investors
# - Domain expertise

# Execution Strategy
north_star.yaml → values[*]  # cultural principles
roadmap_recipe.yaml → cycles[0].okrs[*]  # current focus

# Hiring Plan
# Manual: key roles to hire with funding
```

**Generation Template**:
```markdown
## 7. Team & Execution

### Core Team {or Company Name}

**Deep {Domain} Expertise**
- {List key technical capabilities}
- {Highlight relevant experience}
- {Note production systems or products shipped}

**Proven Track Record**
- {Past successful projects or companies}
- {Relevant domain experience}
- {Technical credibility markers}

**Execution Strategy**

{For each value in values[*] that relates to execution}
- **{value.name}**: {value.description}
{End for each}

### Key Hiring Priorities

{Manual section - list of roles to hire with:
- Role title
- Focus area
- Expected impact
- Target hiring quarter}
```

#### Section 8: Investment Thesis (2000-2500 words)

**Content Requirements**:
- Why now (market timing)
- Why this company (competitive advantages)
- Why this matters (vision and impact)
- Risk assessment and mitigation

**EPF Source Mapping**:
```yaml
# Why Now
strategy_formula.yaml → market_analysis.trends[*] where timing="near"

# Why Us
strategy_formula.yaml → moats[*]
strategy_formula.yaml → competitive_landscape[*].our_angle

# Vision
north_star.yaml → vision
  → long_term_vision
  → impact

# Risks
strategy_formula.yaml → risks[*]
  → risk_type
  → likelihood
  → impact
  → mitigation
```

**Generation Template**:
```markdown
## 8. Investment Thesis

### Why Now?

**Market Timing is Critical**

{For each trend in trends[*] where timing="near" and impact="high"}
- **{trend.trend_name}**: {trend.description} → {trend.implication}
{End for each}

**Window of Opportunity**: {Synthesize timing urgency from trends}

### Why {Product Name}?

**Unique Market Position**
{For each moat in moats[*]}
- {moat.moat_type}: {moat.description}
{End for each}

**Defensible Advantages**
{Highlight top 3-5 competitive angles from competitive_landscape[*].our_angle}

### Why This Matters

**Long-Term Vision**: {vision.long_term_vision}

**Impact**: {vision.impact}

### Risks & Mitigations

{For each risk in risks[*] sorted by likelihood × impact}

**Risk: {risk.risk_type}**
- **Likelihood**: {risk.likelihood} | **Impact**: {risk.impact}
- **Mitigation**: {risk.mitigation}

{End for each}
```

#### Section 9: Financial Projections (1500-2000 words)

**Content Requirements**:
- 5-year revenue model
- Key metrics targets (ARR, users, retention)
- Growth assumptions and drivers
- Path to profitability (if applicable)

**EPF Source Mapping**:
```yaml
# Revenue Projections
# Manual but informed by:
roadmap_recipe.yaml → phases[*].success_criteria  # user/revenue targets
value_models[*].yaml → pricing_strategy.tiers[*].price  # ARPU

# Metric Targets
roadmap_recipe.yaml → cycles[*].okrs[*].key_results[*]
# Extract metrics like: users, ARR, NPS, retention, etc.

# Financial Assumptions
strategy_formula.yaml → financial_assumptions
```

**Generation Template**:
```markdown
## 9. Financial Projections

### Revenue Model

**Year 1 ({Year}) - {Phase 1 Name}**
- **Target**: {success_criteria[0] for user count}
- **Mix**: {pricing tier distribution}
- **MRR**: {monthly recurring revenue}
- **ARR**: {annual recurring revenue}

{Repeat for Years 2-5 based on phases[*].success_criteria}

### Key Metrics Targets

**North Star Metric**: {Define primary success metric}

**Supporting Metrics (End of Year 1)**
{Extract from cycles[*].okrs[*].key_results[*]}
- {Metric}: {Target}
- {Metric}: {Target}
- {Metric}: {Target}
```

#### Section 10: Use of Funds (1000-1200 words)

**Content Requirements**:
- Funding amount requested
- Allocation breakdown
- Key hiring priorities
- Expected runway

**Generation Template**:
```markdown
## 10. Use of Funds

### Investment Request

**{Round Type} Target**: {Amount} to {primary goal}

### Allocation

**Product Development (XX%)**
- {Engineering hires}
- {Product features/infrastructure}
- {Technical priorities}

**Go-to-Market (XX%)**
- {Marketing/content}
- {Sales/partnerships}
- {Customer success}

**Operations (XX%)**
- {Infrastructure}
- {Tools and systems}
- {Administrative}

**Reserve (XX%)**
- {Runway extension}
- {Contingency}

### Key Hiring Priorities

{List of roles with:
- Title
- Quarter
- Focus area
- Expected impact}

---

## 11. Conclusion

{Synthesize:
- Inflection point (from trends)
- Company positioning (from moats)
- Vision (from north_star)
- The ask (from use of funds)}

---

## Appendix

- Product demo information
- Technical architecture docs
- Market research sources
- Contact information
```

---

### Step 3: Generate Executive Summary

**Target**: 12-15 pages, 15-20 minute read time, partner evaluation document

Use the comprehensive memo as source but condense:

1. **The Opportunity in 60 Seconds** (200 words)
   - Problem in 2 sentences
   - Solution in 2 sentences
   - Traction in 1 sentence
   - Market in 1 sentence
   - Ask in 1 sentence

2. **Market Opportunity** (1000 words)
   - Size & growth (TAM/SAM/SOM)
   - Key trends (top 5 with impact/timing)
   - Target segments (2-3 primary)

3. **Product & Differentiation** (1500 words)
   - Product portfolio (condensed capabilities)
   - Key differentiators vs top 3 competitors
   - Technology moats (top 3)

4. **Business Model** (800 words)
   - Pricing tiers table
   - Unit economics summary
   - Growth engines (top 3)

5. **Strategic Roadmap** (1000 words)
   - 3-phase overview
   - Current quarter highlights
   - Key milestones timeline

6. **Team & Execution** (600 words)
   - Team credentials summary
   - Execution philosophy
   - Hiring plan overview

7. **Financial Highlights** (800 words)
   - 5-year projections table
   - Key metrics targets
   - Growth assumptions

8. **Investment Ask** (500 words)
   - Amount and round type
   - Use of funds summary
   - Expected outcomes

---

### Step 4: Generate One-Page Pitch

**Target**: 4-6 pages, 5 minute read time, quick screening document

**Format**: Sections with emoji icons, bullet points, high signal-to-noise

1. **🎯 The Problem** (150 words)
   - User pain in 2-3 bullet points
   - Evidence (1-2 statistics)
   - Result/consequence

2. **💡 The Solution** (200 words)
   - What we build (3 integrated products)
   - Key value delivered
   - Differentiation

3. **📊 Market Opportunity** (150 words)
   - TAM/SAM/SOM
   - Growth rate
   - Timing window

4. **🏆 Competitive Advantage** (200 words)
   - We beat enterprise (2 angles)
   - We beat consumer (2 angles)
   - We beat open-source (1 angle)

5. **💰 Business Model** (150 words)
   - Pricing model summary
   - Unit economics (LTV:CAC, payback)
   - Growth motion

6. **📈 Traction** (150 words)
   - Key metrics (3-5 bullets)
   - Design partners
   - Evidence of PMF

7. **👥 Team** (100 words)
   - Core expertise
   - Track record
   - Unique advantages

8. **💵 Financial Snapshot** (100 words)
   - 5-year ARR table
   - Path to profitability

9. **🚀 Investment Ask** (100 words)
   - Amount and round
   - Primary use cases
   - Expected milestones

---

### Step 5: Generate Investor FAQ

**Target**: 20-30 pages, reference document, Q&A format

**Categories**:

1. **Product & Technology** (8-10 Q&As)
   - What exactly does {product} do?
   - How is this different from {generic AI tool}?
   - Why not just use {incumbent}?
   - What's {technical concept} and why does it matter?
   - Is the technology proven or experimental?

2. **Market & Competition** (8-10 Q&As)
   - How big is the market really?
   - Who are the main competitors?
   - What happens when {big tech} enters?
   - Why won't {incumbent} solve this?
   - What's the go-to-market strategy?

3. **Business Model** (6-8 Q&As)
   - How do you make money?
   - What are the unit economics?
   - Why will customers pay?
   - How do you scale distribution?
   - What's the pricing strategy?

4. **Team & Execution** (5-7 Q&As)
   - Who's on the team?
   - What's the track record?
   - Why are you the right team?
   - What are the key risks?
   - How will you spend the money?

5. **Investment & Returns** (5-7 Q&As)
   - Why this round size?
   - What milestones with this capital?
   - What's the exit path?
   - What are comparable outcomes?
   - What's the path to profitability?

**Generation Pattern for Each Q&A**:
```markdown
### Q: {Question}?

**A**: {Direct answer in 1-2 sentences}

{Supporting details with:
- Evidence from EPF sources
- Comparisons or examples
- Implications or next steps}

{Optionally cite EPF source: "Source: strategy_formula.yaml → competitive_landscape"}
```

---

### Step 6: Generate Materials Index

**Target**: 8-10 pages, navigation and usage guide

**Structure**:

1. **Overview** (1 page)
   - Package description
   - Last updated date
   - Version and status
   - How to use this package

2. **Document Suite** (5-7 pages)

   For each of the 4 main documents:
   
   **{Document Title}**
   - **File**: `{filename}`
   - **Length**: ~X pages
   - **Time to Read**: X minutes
   - **Use Case**: {when to use this document}
   - **Contents**: {bullet list of main sections}
   - **Best For**: {scenarios and audiences}

3. **Usage Guide** (1-2 pages)
   - Which document for first meeting?
   - Which document for due diligence?
   - How to customize for different investors?
   - Tips for effective investor communication

4. **EPF Source References** (1 page)
   - Links to source EPF artifacts
   - How to regenerate after strategy updates
   - Validation and freshness checks

---

## EPF Source Extraction Reference

### Market Sizing (TAM/SAM/SOM)

```yaml
# strategy_formula.yaml
market_analysis:
  segments:
    - name: "Total Addressable Market (TAM)"
      size: "$50B+"
      description: "Enterprise knowledge management market"
      
    - name: "Serviceable Addressable Market (SAM)"
      size: "$5-10B"
      description: "AI-augmented knowledge platforms"
      characteristics: "20-30% annual growth"
      
    - name: "Serviceable Obtainable Market (SOM)"
      size: "$50-100M"
      description: "Developer-friendly knowledge API platforms"
```

**Extraction**: Use segments[0-2] for TAM/SAM/SOM respectively

### Problem Statement

```yaml
# north_star.yaml
jobs_to_be_done:
  - job_title: "{Primary user job}"
    struggles_when: "{Pain point description}"
    desired_outcome: "{What success looks like}"
    current_solution: "{Existing alternatives}"
    why_unsatisfactory: "{Gap in current solutions}"
```

**Extraction**: Synthesize struggles_when + why_unsatisfactory for problem evidence

### Product Capabilities

```yaml
# value_models/{product}.yaml
product_name: "Emergent Core"
capabilities:
  - name: "Document Ingestion & Extraction"
    description: "Multi-source ingestion with AI-powered extraction"
    job_alignment: "helps_users_find_information_faster"
    implementation:
      - "URL scraping"
      - "File uploads (PDF, Markdown, code)"
      - "Integration APIs (ClickUp, Drive)"
```

**Extraction**: Use capabilities[*].name + description for product overview

### Competitive Positioning

```yaml
# strategy_formula.yaml
competitive_landscape:
  - competitor_name: "Glean"
    category: "Enterprise AI Search"
    strengths: "Deep enterprise integrations, significant funding"
    our_angle: "Developer-friendly and API-first; they're enterprise-sales-first"
    wedge_strategy: "Win technical teams who want control and transparency"
```

**Extraction**: Use for competitive differentiation sections

### Strategic Roadmap

```yaml
# roadmap_recipe.yaml
phases:
  - name: "Beachhead - Technical Product Teams"
    time_horizon: "2025 H1-H2"
    target_segment: "Technical product teams (5-50 engineers)"
    value_delivered:
      - "Document ingestion and semantic search"
      - "AI chat with organizational context"
      - "MCP server for AI agent integration"
    success_criteria:
      - "100 teams actively using Emergent"
      - "50%+ improvement in AI task completion"
      - "NPS > 50 for product context understanding"
    rationale: "Technical teams are our tribe—we understand their problems"
```

**Extraction**: Use phases[*] for strategic roadmap section

### Financial Projections

```yaml
# roadmap_recipe.yaml → Extract from success_criteria
phases:
  - name: "Year 1 (2025)"
    success_criteria:
      - "100 active teams"
      - "$200K ARR"
      
  - name: "Year 2 (2026)"
    success_criteria:
      - "500 organizations"
      - "$2M ARR"
```

**Extraction**: Build financial model from success_criteria metrics

---

## Validation & Quality Checks

### Document-Level Validation

For each document, validate:

1. **Word Count Ranges**
   - Comprehensive Memo: 15,000-20,000 words
   - Executive Summary: 6,000-8,000 words
   - One-Page Pitch: 2,000-3,000 words
   - FAQ: 10,000-15,000 words
   - Materials Index: 3,000-4,000 words

2. **Required Sections Present**
   - Check all sections defined in schema exist
   - Verify no missing sections

3. **EPF Source Attribution**
   - Each major claim cites EPF source
   - Metadata header includes source file paths
   - Generated content traceable to EPF artifacts

4. **Internal Consistency**
   - Market sizes consistent across documents
   - Financial projections align
   - Product descriptions match
   - Team information consistent

5. **Formatting & Readability**
   - Proper Markdown hierarchy (h1 → h2 → h3)
   - Tables formatted correctly
   - Lists use consistent style
   - No orphaned sections

### Package-Level Validation

1. **Cross-Document Alignment**
   - One-Page Pitch is subset of Executive Summary
   - Executive Summary is subset of Comprehensive Memo
   - FAQ answers reference Comprehensive Memo
   - Materials Index accurately describes all documents

2. **Completeness Check**
   - All 5 documents generated
   - All filenames follow convention
   - All metadata headers present
   - All EPF sources referenced

3. **Freshness Validation**
   - Generated within 30 days of EPF source updates
   - Metadata timestamps accurate
   - No stale projections or dates

### Schema Validation

Run TypeScript validator:

```bash
npm run validate:investor-memo -- \
  --manifest path/to/investor-materials/{date}/manifest.json
```

Expected output:
```
✅ Schema validation: PASSED
✅ Document completeness: PASSED
✅ Cross-document consistency: PASSED
✅ EPF source traceability: PASSED
✅ Freshness check: PASSED
```

---

## Common Issues & Troubleshooting

### Issue: Financial Projections Missing

**Symptom**: Section 9 of comprehensive memo is incomplete or speculative

**Root Cause**: EPF sources don't contain explicit revenue projections

**Solution**:
1. Extract user/team targets from `roadmap_recipe.yaml → phases[*].success_criteria`
2. Calculate ARPU from `value_models[*].yaml → pricing_strategy.tiers[*]`
3. Model ARR = {active teams} × {ARPU} × {paid conversion rate}
4. Document assumptions clearly in appendix

### Issue: Competitive Analysis Shallow

**Symptom**: Section 4 competitive differentiation lacks depth

**Root Cause**: `strategy_formula.yaml → competitive_landscape[*]` not detailed enough

**Solution**:
1. Extract additional context from `insight_analyses/*.md` if available
2. Use `strategy_formula.yaml → moats[*]` to strengthen differentiation
3. Reference specific product capabilities from `value_models[*].yaml`
4. Document need to update competitive research in EPF sources

### Issue: Team Section Generic

**Symptom**: Section 7 lacks specific credibility markers

**Root Cause**: Team information not in EPF artifacts

**Solution**:
1. Manual input of founder/team backgrounds
2. Extract execution philosophy from `north_star.yaml → values[*]`
3. Use `roadmap_recipe.yaml → cycles[0]` to show current execution
4. Consider creating `team.yaml` in EPF instance for future generations

### Issue: Cross-Document Inconsistency

**Symptom**: Market sizes or metrics differ between documents

**Root Cause**: Manual editing without validation

**Solution**:
1. Generate all documents in single session
2. Use validation script to check consistency
3. Keep source EPF artifacts as single source of truth
4. Regenerate entirely rather than piecemeal edits

---

## Output Structure

Generated files should be organized as:

```
docs/EPF/_instances/{product}/outputs/investor-materials/{YYYY-MM-DD}/
├── 2025-12-30_investor_memo.md                      (35 pages)
├── 2025-12-30_investor_memo_executive_summary.md    (15 pages)
├── 2025-12-30_investor_memo_one_page_pitch.md       (5 pages)
├── 2025-12-30_investor_faq.md                       (25 pages)
├── 2025-12-30_investor_materials_index.md           (8 pages)
├── manifest.json                                     (package metadata)
└── validation_report.txt                            (validation results)
```

### Manifest File Format

```json
{
  "metadata": {
    "generated_at": "2025-12-30T12:00:00Z",
    "epf_version": "2.1.0",
    "product_name": "Emergent",
    "round_type": "seed",
    "package_version": "1.0",
    "last_updated": "December 30, 2025",
    "epf_sources": {
      "north_star": "docs/EPF/_instances/emergent/00_north_star.yaml",
      "strategy_formula": "docs/EPF/_instances/emergent/04_strategy_formula.yaml",
      "roadmap_recipe": "docs/EPF/_instances/emergent/05_roadmap_recipe.yaml",
      "value_models": [
        "docs/EPF/_instances/emergent/value_models/core_product.yaml"
      ]
    }
  },
  "documents": {
    "comprehensive_memo": {
      "filename": "2025-12-30_investor_memo.md",
      "word_count": 18500,
      "generated_at": "2025-12-30T12:00:00Z"
    },
    "executive_summary": {
      "filename": "2025-12-30_investor_memo_executive_summary.md",
      "word_count": 7200,
      "generated_at": "2025-12-30T12:05:00Z"
    },
    "one_page_pitch": {
      "filename": "2025-12-30_investor_memo_one_page_pitch.md",
      "word_count": 2800,
      "generated_at": "2025-12-30T12:10:00Z"
    },
    "faq": {
      "filename": "2025-12-30_investor_faq.md",
      "word_count": 12000,
      "generated_at": "2025-12-30T12:15:00Z"
    },
    "materials_index": {
      "filename": "2025-12-30_investor_materials_index.md",
      "word_count": 3500,
      "generated_at": "2025-12-30T12:20:00Z"
    }
  },
  "validation": {
    "schema_valid": true,
    "consistency_valid": true,
    "freshness_valid": true,
    "validated_at": "2025-12-30T12:25:00Z"
  }
}
```

---

## Best Practices

### For AI Assistants

1. **Extract First, Generate Second**
   - Read all EPF sources completely
   - Build extraction map of relevant data
   - Validate data completeness before generation
   - Only then generate document content

2. **Maintain Traceability**
   - Cite EPF source paths in comments
   - Track which section came from which source
   - Enable future regeneration and validation
   - Document any manual inputs clearly

3. **Ensure Consistency**
   - Generate all documents in single session
   - Use extracted data as single source of truth
   - Cross-reference between documents
   - Validate consistency before outputting

4. **Optimize for Audience**
   - Comprehensive Memo: Due diligence depth
   - Executive Summary: Decision-maker concise
   - One-Page Pitch: Screening signal-to-noise
   - FAQ: Objection handling thoroughness
   - Materials Index: Navigation clarity

### For Human Reviewers

1. **Review Order**
   - Start with Materials Index (understand structure)
   - Read One-Page Pitch (validate positioning)
   - Skim Executive Summary (check highlights)
   - Deep read Comprehensive Memo (verify details)
   - Reference FAQ (check objection handling)

2. **Focus Areas**
   - Financial projections accuracy
   - Competitive positioning strength
   - Team credibility markers
   - Use of funds justification
   - Risk mitigation thoroughness

3. **Before Sending to Investors**
   - Run full validation suite
   - Fact-check all statistics
   - Verify all EPF sources are current
   - Proofread for typos and formatting
   - Test all internal document links

---

## Related Resources

### Files in this Generator
- **Schema**: [`schema.json`](./schema.json) - Input validation
- **Validator**: [`validator.sh`](./validator.sh) - Output validation
- **Wizard**: [`wizard.instructions.md`](./wizard.instructions.md) - This file

### Other Generators
- **Context Sheet Generator**: [`../context-sheet/`](../context-sheet/)
- **SkatteFUNN Application**: [`../skattefunn-application/`](../skattefunn-application/)

### EPF Documentation
- **EPF Core**: [`../../README.md`](../../README.md)
- **Quick Start**: [`../QUICK_START.md`](../QUICK_START.md)

---

*Version 1.0 | Generated from EPF v2.1.0 | Last Updated: 2025-12-30*
