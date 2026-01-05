# EPF Field Importance Taxonomy - Value & Effort Calculation Methodology

**Purpose**: Explain how ROI values and effort estimates in the field importance taxonomy are calculated  
**Audience**: Framework maintainers, AI agents, product teams using EPF  
**Status**: Living document - update as we gather actual data from instances

---

## TL;DR

The values in `field-importance-taxonomy.json` are:
1. **Manually defined** based on research and estimates (not auto-calculated)
2. **Specific to Norwegian context** for SkatteFUNN (NOK 5.5M/year)
3. **Generalizable estimates** for other fields (effort hours, qualitative value)
4. **Refinable** based on actual data from product instances

---

## Field: TRL Fields (CRITICAL) 🇳🇴

### Value: "Up to NOK 5.5M per year"

**Source**: Norwegian SkatteFUNN R&D tax credit program (Skattefunn.no)

**Actual Calculation**:

```
SkatteFUNN Tax Credit Limits (2024-2025):
├─ Small enterprises (<50 employees, <NOK 50M revenue)
│   └─ 25% tax credit on R&D costs up to NOK 25M
│       = Max NOK 6.25M per year
│
├─ Medium/large enterprises (>50 employees OR >NOK 50M revenue)
│   └─ 19% tax credit on R&D costs up to NOK 11M
│       = Max NOK 2.09M per year
│
└─ Collaboration premium (with research institutions)
    └─ Additional 2% credit on collaboration costs
        = Extra NOK 500K+ per year

Conservative estimate for typical Norwegian SaaS (50-200 employees):
  R&D costs: NOK 20-30M per year (engineering salaries + overhead)
  Tax credit @ 19%: NOK 3.8M - 5.5M per year
  
We use "Up to NOK 5.5M" as upper-bound estimate.
```

**Important Caveats**:
1. **Not all companies qualify** - Must be Norwegian-registered with tax obligations
2. **Not all work qualifies** - Only genuine R&D (resolving technical uncertainty), not ordinary development
3. **Application required** - Must document TRL progression, technical hypothesis, innovation narrative
4. **Annual application** - Credit claimed year-by-year (can span multiple years per project)
5. **Approval rate ~85%** - Applications can be rejected if work deemed non-innovative

**How to Calculate for Specific Company**:

```python
# Step 1: Identify company size
if employees < 50 and revenue_NOK < 50_000_000:
    max_rd_costs = 25_000_000
    credit_rate = 0.25
else:
    max_rd_costs = 11_000_000
    credit_rate = 0.19

# Step 2: Estimate annual R&D costs
engineering_team_size = 20  # Number of engineers doing R&D
avg_salary_with_overhead = 1_200_000  # NOK per engineer per year (salary + employer costs)
annual_rd_costs = engineering_team_size * avg_salary_with_overhead
# Example: 20 × 1.2M = NOK 24M

# Step 3: Calculate eligible costs (capped at program limits)
eligible_costs = min(annual_rd_costs, max_rd_costs)

# Step 4: Calculate tax credit
tax_credit = eligible_costs * credit_rate
# Example: 24M × 0.19 = NOK 4.56M per year

# Step 5: Add collaboration premium if applicable
if has_research_collaboration:
    collaboration_costs = 5_000_000  # Example
    collaboration_premium = collaboration_costs * 0.02
    tax_credit += collaboration_premium
    # Example: 5M × 0.02 = +NOK 100K

print(f"Estimated SkatteFUNN value: NOK {tax_credit:,.0f} per year")
```

**twentyfirst Example** (Hypothetical):
- **Company size**: ~30 employees (small enterprise)
- **Engineering team**: ~10 engineers doing R&D
- **Annual R&D costs**: 10 × NOK 1.2M = NOK 12M
- **Tax credit @ 25%**: NOK 3M per year
- **3-year project**: NOK 9M total benefit

---

## Field: TRL Fields - Effort Estimate

### Effort: "4-6 hours for full roadmap"

**Breakdown** (for roadmap with ~15-20 Key Results):

```
Activity Breakdown:
├─ Read TRL documentation & framework (30 min)
│   └─ UNIVERSAL_TRL_FRAMEWORK.md, SkatteFUNN guidelines
│
├─ Identify R&D-qualifying KRs (45 min)
│   └─ Review all KRs, ask: "Does this resolve technical uncertainty?"
│   └─ Estimated: ~30-40% of KRs qualify (5-8 out of 20)
│
├─ Assess TRL start per KR (60 min)
│   └─ Map current maturity (TRL 1-9) for each R&D KR
│   └─ 10-15 min per KR × 5 KRs = 50-75 min
│
├─ Define TRL target per KR (30 min)
│   └─ Identify target maturity after cycle
│   └─ 5-8 min per KR × 5 KRs = 25-40 min
│
├─ Write trl_progression narratives (90 min)
│   └─ Articulate innovation journey (50-200 chars)
│   └─ 15-20 min per KR × 5 KRs = 75-100 min
│
├─ Formulate technical_hypothesis (90 min)
│   └─ Describe technical uncertainty being resolved
│   └─ 15-20 min per KR × 5 KRs = 75-100 min
│
└─ Review & validation (30 min)
    └─ Ensure consistency, run schema validation
    
Total: 5.75 hours (rounded to 4-6 hours for variability)
```

**Variability Factors**:
- **Team familiarity**: First time = 6 hours, experienced team = 4 hours
- **R&D clarity**: Clear innovation = faster, exploratory work = slower
- **Documentation quality**: Well-documented tech = easier TRL assessment
- **Number of R&D KRs**: Fewer R&D KRs = less time (3 KRs might be 3 hours)

**Actual Effort Tracking** (to be updated as instances enrich):
```
Instance         | R&D KRs | Actual Hours | Notes
-----------------|---------|--------------|------------------
twentyfirst      | TBD     | TBD          | Not yet enriched
emergent         | TBD     | TBD          | Not yet enriched
lawmatics        | TBD     | TBD          | Not yet enriched
```

---

## Field: Resource Planning Fields (HIGH)

### Value: "Better capacity planning, burn rate tracking, board transparency"

**Qualitative Value** (not monetary):
1. **Capacity Planning** - Know if you have enough engineers to hit targets
2. **Burn Rate** - CFO can forecast runway more accurately
3. **Board Reporting** - "We budgeted X, spent Y" shows execution discipline
4. **Hiring Justification** - "We need 2 more engineers for Q2 roadmap" backed by data

**Quantitative Proxies** (if needed):
- **Cost of bad planning**: Over-commitment → missed deadlines → customer churn
- **Runway visibility**: Better burn rate tracking → avoid emergency fundraising
- **Investor confidence**: Budget discipline → higher valuation (hard to quantify)

### Effort: "1-2 hours for full roadmap"

**Breakdown**:

```
Activity Breakdown:
├─ Gather engineering cost data (15 min)
│   └─ Average loaded cost per engineer (salary + benefits + overhead)
│   └─ Typical monthly/quarterly rates
│
├─ Estimate duration per KR (30 min)
│   └─ Work with tech lead: "How long will this take?"
│   └─ 3-5 min per KR × 15 KRs = 45 min
│
├─ Estimate FTE allocation per KR (20 min)
│   └─ "2 engineers full-time for 8 weeks" = 4 person-months
│   └─ 1-2 min per KR × 15 KRs = 15-30 min
│
├─ Calculate budget per KR (15 min)
│   └─ FTE × duration × loaded cost
│   └─ Example: 2 FTE × 2 months × 75K NOK/month = 300K NOK
│
└─ Create budget_breakdown (10 min)
    └─ Split by category: engineering, design, PM, infrastructure
    
Total: 1.5 hours (rounded to 1-2 hours)
```

**twentyfirst Example**:

```yaml
# kr-p-001: Group structures MVP
estimated_budget: "450K NOK"
estimated_duration: "12 weeks"
budget_breakdown:
  engineering: "300K NOK (2 FTE × 3 months × 50K/month)"
  design: "50K NOK (0.5 FTE × 3 months × 33K/month)"
  pm: "50K NOK (0.25 FTE × 3 months × 67K/month)"
  infrastructure: "20K NOK (DB, hosting, SaaS tools)"
  validation: "30K NOK (pilot customer support, user research)"
```

---

## Field: Hypothesis Testing Fields (MEDIUM)

### Value: "Learning-focused execution, faster pivots, reduced sunk cost"

**Qualitative Value**:
1. **Pivot Faster** - Identify failures early (2 weeks vs 3 months)
2. **Reduce Waste** - Stop investing in non-viable paths sooner
3. **Evidence-Based** - Replace "I think" with "We tested and found..."
4. **Team Alignment** - Clear success criteria = everyone knows what "done" means

**Lean Startup Math** (if needed):
- **Cost of late pivot**: Building full product when MVP would reveal failure
- **Example**: 3 engineers × 3 months × 75K NOK/month = 675K NOK wasted
- **Early validation**: 1 engineer × 2 weeks × 75K/month = 37.5K NOK
- **Savings**: 675K - 37.5K = 637.5K NOK saved (or 17x ROI on early testing)

### Effort: "2-3 hours for full roadmap"

**Breakdown**:

```
Activity Breakdown:
├─ Identify high-risk KRs (20 min)
│   └─ Which KRs have critical assumptions? (not all KRs need hypothesis testing)
│   └─ Estimated: ~30-40% of KRs are high-risk (5-8 out of 20)
│
├─ Define success_criteria per KR (60 min)
│   └─ "What metrics prove this worked?"
│   └─ 10-15 min per high-risk KR × 5 KRs = 50-75 min
│
├─ Articulate uncertainty_addressed (45 min)
│   └─ "What assumptions are we testing?"
│   └─ 8-10 min per KR × 5 KRs = 40-50 min
│
└─ Design experiment per KR (60 min)
    └─ "How will we test this cheaply?"
    └─ 10-15 min per KR × 5 KRs = 50-75 min
    
Total: 3 hours (rounded to 2-3 hours for variability)
```

---

## How to Refine These Estimates

### Step 1: Track Actual Data

When someone enriches an artifact, record:
```yaml
enrichment_log:
  - artifact: twentyfirst/05_roadmap_recipe.yaml
    date: 2026-01-15
    fields_added: [trl_start, trl_target, trl_progression, technical_hypothesis]
    actual_effort_hours: 5.5
    team_size: 1 person (Product Manager)
    team_familiarity: "First time using TRL framework"
    value_realized: "SkatteFUNN application submitted 2026-02-01"
```

### Step 2: Update Taxonomy

After collecting 5-10 data points:
```json
{
  "critical": {
    "effort_hours": "4-6 hours (based on 8 actual enrichments, avg 5.2h, range 3.5-7h)",
    "actual_data": [
      {"instance": "twentyfirst", "hours": 5.5, "rd_krs": 6},
      {"instance": "emergent", "hours": 4.2, "rd_krs": 4}
    ]
  }
}
```

### Step 3: Build Effort Calculator

Eventually, create a formula:
```python
def estimate_trl_effort(num_rd_krs, team_familiarity):
    """
    Estimate effort to add TRL fields to roadmap.
    
    Args:
        num_rd_krs: Number of R&D-qualifying Key Results (0-20)
        team_familiarity: 'first_time', 'some_experience', 'expert'
    
    Returns:
        Estimated hours as a float
    """
    base_effort = {
        'first_time': 1.5,      # hours per KR
        'some_experience': 1.0,
        'expert': 0.7
    }
    
    setup_overhead = {
        'first_time': 1.0,      # Read docs, understand TRL
        'some_experience': 0.3,
        'expert': 0.1
    }
    
    effort = setup_overhead[team_familiarity] + (num_rd_krs * base_effort[team_familiarity])
    return round(effort, 1)

# Example usage:
print(estimate_trl_effort(5, 'first_time'))  # ~8.5 hours
print(estimate_trl_effort(5, 'expert'))      # ~3.6 hours
```

---

## Summary

| Field Category | Value Source | Effort Source | Confidence Level |
|----------------|--------------|---------------|------------------|
| TRL (CRITICAL) | SkatteFUNN program limits (public data) | Manual estimate, needs validation | **Medium** (value: high, effort: unproven) |
| Budget (HIGH) | Qualitative reasoning | Manual estimate | **Low** (needs actual data) |
| Hypothesis (MEDIUM) | Lean Startup principles | Manual estimate | **Low** (needs actual data) |

**Action Items**:
1. ✅ Document calculation methodology (this file)
2. ⏳ Track actual enrichment efforts as instances enrich
3. ⏳ Build effort calculator after 5-10 data points
4. ⏳ Update taxonomy with actual ranges (not just estimates)
5. ⏳ Add regional variations (non-Norwegian companies won't use SkatteFUNN)

---

**Last Updated**: 2026-01-08  
**Next Review**: After first 3 instances complete TRL enrichment (track actual hours)
