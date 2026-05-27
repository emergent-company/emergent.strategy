# Roadmap Enrichment Wizard - TRL Fields & Enhanced Tracking

**Version**: 1.0  
**Target Schema**: roadmap_recipe_schema.json v1.13.0+  
**Estimated Time**: 4-6 hours for full roadmap enrichment  
**Value**: Strategic clarity on innovation vs execution + learning maturity tracking

---

## Overview

This wizard guides you through enriching your roadmap with TRL (Technology Readiness Level) fields and hypothesis-driven validation tracking. These fields enable:

1. **Innovation Maturity Tracking**: Distinguish learning/experimentation (TRL 1-6) from execution (TRL 7-9)
2. **Strategic Clarity**: Make explicit which work involves resolving uncertainty vs applying proven methods
3. **Cross-Track Learning**: Track maturity in Product, Strategy, Org&Ops, and Commercial domains
4. **Hypothesis Validation**: Document what you're learning and how you'll validate it

**Important**: EPF focuses on **WHY/HOW (strategic)**, not **WHAT (execution)**. TRL fields track learning and innovation maturity, not budgets or funding mechanisms.

---

## Pre-Migration Checklist

Before starting, ensure you have:

- [ ] **Backup created**: `cp 05_roadmap_recipe.yaml 05_roadmap_recipe.yaml.backup`
- [ ] **Schema reviewed**: Read [schemas/roadmap_recipe_schema.json](../schemas/roadmap_recipe_schema.json)
- [ ] **TRL framework understood**: Read [schemas/UNIVERSAL_TRL_FRAMEWORK.md](../schemas/UNIVERSAL_TRL_FRAMEWORK.md)
- [ ] **Template reviewed**: See [templates/READY/05_roadmap_recipe.yaml](../templates/READY/05_roadmap_recipe.yaml) for examples across all 4 tracks
- [ ] **Validation tool ready**: Ensure `ajv-cli` or `validate-schemas.sh` is available

---

## Step 1: Identify Innovation-Focused Key Results

Not all Key Results need TRL fields. TRL is for **innovation work** (resolving uncertainty), not routine execution.

### For each Key Result, ask these questions:

1. **Does this involve resolving genuine uncertainty?**
   - YES: Novel approach, unproven at this scale, experimental
   - NO: Applying proven methods, routine execution

2. **Is this advancing state-of-the-art (for your context)?**
   - YES: New territory for your team/market/domain
   - NO: Standard practices, established patterns

3. **Will you learn something that could fail?**
   - YES: Hypothesis-driven, validation required
   - NO: Low-risk execution, predictable outcome

**If YES to all 3** → Add TRL fields (innovation work)  
**If NO to any** → Skip TRL fields (execution work)

### Examples by Track

**Product Track Innovation (TRL 2→5)**
- Novel algorithm with unproven performance
- New architecture pattern not validated at scale
- Integration approach with uncertain technical feasibility

**Strategy Track Innovation (TRL 3→5)**
- Untested market positioning approach
- New segment with unknown product-market fit
- Experimental go-to-market motion

**Org&Ops Track Innovation (TRL 2→5)**
- New async-first planning process
- Novel team structure without precedent
- Experimental hiring/onboarding approach

**Commercial Track Innovation (TRL 4→7)**
- Usage-based pricing model with uncertain unit economics
- New sales motion without proven conversion rates
- Experimental customer success playbook

---

## Step 2: Assess Starting TRL (trl_start)

For each innovation-focused Key Result, determine current maturity.

### Universal TRL Scale (NASA-derived)

**TRL 1**: Basic principles observed (early research, conceptual)  
**TRL 2**: Technology concept formulated (hypothesis defined, approach conceptualized)  
**TRL 3**: Experimental proof of concept (POC validated in lab/controlled environment)  
**TRL 4**: Technology validated in lab (prototype works in controlled conditions)  
**TRL 5**: Technology validated in relevant environment (realistic conditions, not production)  
**TRL 6**: Technology demonstrated in relevant environment (system-level demo, close to production)  
**TRL 7**: System prototype in operational environment (pilot/beta, real users)  
**TRL 8**: System complete and qualified (production-ready, proven at small scale)  
**TRL 9**: Actual system proven in operational conditions (production, validated at scale)

### Track-Specific Interpretations

**Product (Technical Maturity)**
- TRL 1-3: Research, concept, early POC
- TRL 4-6: Prototype, integration, system demo
- TRL 7-9: Pilot, production, proven at scale

**Strategy (Market/Positioning Maturity)**
- TRL 1-3: Market hypothesis, concept testing, initial validation
- TRL 4-6: Segment validation, positioning tested, GTM approach proven in pilots
- TRL 7-9: GTM at scale, proven market position, defensible competitive advantage

**Org&Ops (Process/Method Maturity)**
- TRL 1-3: Process concept, paper-based approach, small team pilot
- TRL 4-6: Process tested with multiple teams, workflows validated, tooling integrated
- TRL 7-9: Organization-wide deployment, proven efficiency, cultural adoption

**Commercial (Business Model Maturity)**
- TRL 1-3: Pricing hypothesis, small customer tests, initial conversion data
- TRL 4-6: Model validated with pilot cohorts, unit economics proven at small scale
- TRL 7-9: Scaled pricing, proven LTV:CAC, sustainable growth

### Determining Your trl_start

Ask: **What is the current state of this approach/technology/method?**

```yaml
# Example: Product track - Novel caching approach
trl_start: 3  # We have a POC that works in isolated tests
              # but haven't validated with realistic load patterns
```

```yaml
# Example: Strategy track - New market segment
trl_start: 2  # We've defined the segment hypothesis and customer profile
              # but haven't validated with real prospects yet
```

```yaml
# Example: Org&Ops track - Async planning process
trl_start: 4  # Tested with 2 pilot teams, basic workflows proven
              # but not integrated with existing systems
```

```yaml
# Example: Commercial track - Usage-based pricing
trl_start: 5  # Validated with 20 pilot customers, unit economics look promising
              # but not proven at scale or across all segments
```

---

## Step 3: Define Target TRL (trl_target)

Determine the desired maturity level after completing this Key Result.

### Key Principles

1. **Must be ≥ trl_start**: Can't go backwards (if you do, you're not learning, you're unlearning)
2. **Typically 1-3 levels per cycle**: Single-level jumps are common, 2-3 levels ambitious but achievable
3. **>3 level jumps are suspicious**: May indicate KR needs decomposition into multiple cycles
4. **Common progressions**:
   - TRL 2→3 (concept to POC)
   - TRL 3→5 (POC to validation)
   - TRL 4→6 (lab to demo)
   - TRL 5→7 (validation to pilot)
   - TRL 7→9 (pilot to production)

### Examples

```yaml
# Realistic single-level progression
trl_start: 4  # Lab prototype
trl_target: 5  # Validated in relevant environment
# This cycle: Take working prototype, test with realistic data/load

# Ambitious but justified two-level jump
trl_start: 3  # Experimental POC
trl_target: 5  # Validated in relevant environment
# This cycle: Refine POC, build integrated prototype, validate with real scenarios

# Suspicious three-level jump (consider decomposing)
trl_start: 2  # Concept formulated
trl_target: 5  # Validated in relevant environment
# Warning: Going from concept to validation in one cycle is very ambitious
# Consider breaking into two KRs: 2→3 (build POC), then 3→5 (validate)
```

### Determining Your trl_target

Ask: **What maturity will we achieve if this Key Result succeeds?**

```yaml
# Product: Novel caching approach
trl_start: 3
trl_target: 5
# Goal: Take POC → validated prototype with realistic load testing
```

```yaml
# Strategy: New market segment
trl_start: 2
trl_target: 4
# Goal: Take hypothesis → validated segment with 50+ qualified leads
```

```yaml
# Org&Ops: Async planning process
trl_start: 4
trl_target: 6
# Goal: Take pilot process → demonstrated across 5 teams with metrics
```

```yaml
# Commercial: Usage-based pricing
trl_start: 5
trl_target: 7
# Goal: Take pilot validation → operational model with 100+ customers
```

---

## Step 4: Add TRL Progression Summary (trl_progression)

This is a human-readable summary for quick filtering and reporting.

### Format

```yaml
trl_progression: "TRL X → TRL Y"
```

Where X = trl_start, Y = trl_target

### Examples

```yaml
trl_progression: "TRL 2 → TRL 3"  # Concept to POC
trl_progression: "TRL 3 → TRL 5"  # POC to validation
trl_progression: "TRL 4 → TRL 6"  # Lab to demo
trl_progression: "TRL 5 → TRL 7"  # Validation to pilot
trl_progression: "TRL 7 → TRL 9"  # Pilot to production
```

---

## Step 5: Define Technical Hypothesis (technical_hypothesis)

State what you're trying to prove. This should be **falsifiable** and **measurable**.

### Good Hypothesis Structure

```
A [specific approach/technology/method] can achieve [quantifiable outcome] 
under [defined conditions/constraints]
```

### Examples by Track

**Product**:
```yaml
technical_hypothesis: "A semantic search algorithm based on sentence transformers can achieve >85% precision @10 results for technical documentation queries, compared to 60% with keyword search"
```

**Strategy**:
```yaml
technical_hypothesis: "A developer-first positioning (vs enterprise-first) can capture 40% of Series A startups in Nordic region within 6 months, based on community-led growth"
```

**Org&Ops**:
```yaml
technical_hypothesis: "An async-first planning process can maintain >80% team alignment score while reducing synchronous meeting time by 60%, compared to traditional sprint planning"
```

**Commercial**:
```yaml
technical_hypothesis: "A usage-based pricing model can achieve €50+ ARPU with <20% monthly churn in SMB segment, creating sustainable unit economics with LTV:CAC >3:1"
```

### Anti-Patterns to Avoid

❌ **Too vague**: "Improve the product"  
❌ **Not measurable**: "Make users happier"  
❌ **Not falsifiable**: "Build a better system" (what would disprove this?)  
❌ **Too certain**: "Will increase revenue by 50%" (hypothesis, not guarantee)

---

## Step 6: Design Validation Experiment (experiment_design)

Describe HOW you'll test the hypothesis. Be specific about methods and metrics.

### Good Experiment Structure

```
[Action 1] → [Action 2] → [Measurement method] → [Success criteria]
```

### Examples

**Product**:
```yaml
experiment_design: "Implement semantic search alongside keyword search → Run A/B test with 1000 users over 2 weeks → Track precision @10, user satisfaction, and query reformulation rate → Compare metrics between variants"
```

**Strategy**:
```yaml
experiment_design: "Launch developer-focused content campaign → Track inbound leads and community engagement → Qualify leads by segment → Measure conversion to trial and activation rate in developer vs enterprise segments"
```

**Org&Ops**:
```yaml
experiment_design: "Pilot async planning with 3 teams for 2 sprints → Track alignment survey scores and meeting time → Compare with 3 control teams using traditional planning → Measure velocity and coordination overhead"
```

**Commercial**:
```yaml
experiment_design: "Launch usage-based pricing for 50 new signups → Track usage patterns, revenue per user, and churn → Compare with cohort on fixed pricing → Analyze unit economics and customer feedback"
```

---

## Step 7: Define Success Criteria (success_criteria)

State the quantitative thresholds that indicate hypothesis validation.

### Good Success Criteria

- **Quantitative**: Numbers, percentages, ratios
- **Specific**: Clear thresholds
- **Multi-dimensional**: Consider multiple metrics
- **Realistic**: Based on benchmarks or baseline

### Examples

**Product**:
```yaml
success_criteria: ">85% precision @10 results, >70% user satisfaction score, <15% query reformulation rate, demonstrating semantic search superiority over keyword baseline (60% precision)"
```

**Strategy**:
```yaml
success_criteria: "40% of inbound leads from developer segment, >20% trial conversion rate, 60% activation within 7 days, indicating developer-first positioning resonance"
```

**Org&Ops**:
```yaml
success_criteria: ">80% alignment score in async teams, 60% reduction in meeting hours, <10% velocity loss, <15% increase in coordination overhead compared to control teams"
```

**Commercial**:
```yaml
success_criteria: "€50+ ARPU, <20% monthly churn, LTV:CAC >3:1, >70% of users exceeding base tier within 3 months, demonstrating sustainable usage-based model"
```

---

## Step 8: Identify Uncertainty Being Addressed (uncertainty_addressed)

State the core technical/strategic uncertainty you're resolving.

### Good Uncertainty Statements

```
Whether [approach] can [desired outcome] given [constraint/risk]
```

### Examples

**Product**:
```yaml
uncertainty_addressed: "Whether semantic search accuracy is sufficient for technical domain queries where precision is critical, vs general consumer search where 60-70% precision is acceptable. Risk: poor accuracy leads to user frustration and abandonment."
```

**Strategy**:
```yaml
uncertainty_addressed: "Whether developer segment has stronger product-market fit than enterprise segment for community-led growth model. Risk: targeting wrong segment delays PMF and wastes GTM resources."
```

**Org&Ops**:
```yaml
uncertainty_addressed: "Whether distributed async teams can maintain velocity and alignment comparable to co-located synchronous teams. Risk: coordination overhead and reduced cohesion offset efficiency gains from meeting reduction."
```

**Commercial**:
```yaml
uncertainty_addressed: "Whether usage-based pricing aligns incentives sufficiently to drive customer value realization and retention. Risk: complexity confuses users or unit economics don't support growth."
```

---

## Step 9: Add Fields to Your Roadmap

Now apply what you've defined to your roadmap YAML.

### Full Example: Product Track

```yaml
product:
  track_objective: "Deliver core product capabilities that solve user problems"
  
  okrs:
    - id: "okr-p-001"
      objective: "Prove semantic search viability for technical documentation"
      key_results:
        - id: "kr-p-001"
          description: "Validate semantic search accuracy for technical queries"
          target: ">85% precision @10 results vs 60% keyword baseline"
          measurement_method: "A/B test with 1000 users, track precision and satisfaction"
          baseline: "Current keyword search: 60% precision, 55% satisfaction"
          
          # === TRL Fields for Innovation Tracking ===
          trl_start: 3  # POC exists, works in isolated tests
          trl_target: 5  # Validated in realistic production-like environment
          trl_progression: "TRL 3 → TRL 5"
          
          technical_hypothesis: "A semantic search algorithm based on sentence transformers can achieve >85% precision @10 results for technical documentation queries, compared to 60% with keyword search"
          
          experiment_design: "Implement semantic search alongside keyword search → Run A/B test with 1000 users over 2 weeks → Track precision @10, user satisfaction, and query reformulation rate → Compare metrics between variants"
          
          success_criteria: ">85% precision @10 results, >70% user satisfaction score, <15% query reformulation rate, demonstrating semantic search superiority over keyword baseline (60% precision)"
          
          uncertainty_addressed: "Whether semantic search accuracy is sufficient for technical domain queries where precision is critical, vs general consumer search where 60-70% precision is acceptable. Risk: poor accuracy leads to user frustration and abandonment."
```

### Full Example: Strategy Track

```yaml
strategy:
  track_objective: "Establish market position and validate strategic assumptions"
  
  okrs:
    - id: "okr-s-001"
      objective: "Validate developer-first market positioning"
      key_results:
        - id: "kr-s-001"
          description: "Prove developer segment has stronger PMF than enterprise"
          target: "40% of inbound leads from developer segment"
          measurement_method: "Track lead sources, segment qualification, conversion rates"
          baseline: "Current: 20% developer leads, 80% enterprise (unvalidated mix)"
          
          # === TRL Fields for Strategy Innovation ===
          trl_start: 2  # Hypothesis formulated, no real validation yet
          trl_target: 4  # Segment validated with real prospects and conversion data
          trl_progression: "TRL 2 → TRL 4"
          
          technical_hypothesis: "A developer-first positioning (vs enterprise-first) can capture 40% of Series A startups in Nordic region within 6 months, based on community-led growth"
          
          experiment_design: "Launch developer-focused content campaign → Track inbound leads and community engagement → Qualify leads by segment → Measure conversion to trial and activation rate in developer vs enterprise segments"
          
          success_criteria: "40% of inbound leads from developer segment, >20% trial conversion rate, 60% activation within 7 days, indicating developer-first positioning resonance"
          
          uncertainty_addressed: "Whether developer segment has stronger product-market fit than enterprise segment for community-led growth model. Risk: targeting wrong segment delays PMF and wastes GTM resources."
```

### Full Example: Org&Ops Track

```yaml
org_ops:
  track_objective: "Build organizational capabilities to execute strategy"
  
  okrs:
    - id: "okr-o-001"
      objective: "Validate async-first planning for distributed teams"
      key_results:
        - id: "kr-o-001"
          description: "Prove async planning maintains alignment with 60% less meetings"
          target: ">80% alignment score, 60% meeting reduction"
          measurement_method: "Weekly alignment surveys, meeting time tracking vs control teams"
          baseline: "Current: 75% alignment, 12 hours/week in planning meetings"
          
          # === TRL Fields for Process Innovation ===
          trl_start: 4  # Piloted with 2 teams, basic workflows work
          trl_target: 6  # Demonstrated with 5 teams, metrics proven
          trl_progression: "TRL 4 → TRL 6"
          
          technical_hypothesis: "An async-first planning process can maintain >80% team alignment score while reducing synchronous meeting time by 60%, compared to traditional sprint planning"
          
          experiment_design: "Pilot async planning with 3 teams for 2 sprints → Track alignment survey scores and meeting time → Compare with 3 control teams using traditional planning → Measure velocity and coordination overhead"
          
          success_criteria: ">80% alignment score in async teams, 60% reduction in meeting hours, <10% velocity loss, <15% increase in coordination overhead compared to control teams"
          
          uncertainty_addressed: "Whether distributed async teams can maintain velocity and alignment comparable to co-located synchronous teams. Risk: coordination overhead and reduced cohesion offset efficiency gains from meeting reduction."
```

### Full Example: Commercial Track

```yaml
commercial:
  track_objective: "Establish sustainable revenue generation model"
  
  okrs:
    - id: "okr-c-001"
      objective: "Validate usage-based pricing creates sustainable unit economics"
      key_results:
        - id: "kr-c-001"
          description: "Prove usage-based model achieves target ARPU and retention"
          target: "€50+ ARPU, <20% monthly churn, LTV:CAC >3:1"
          measurement_method: "Track cohort usage, revenue, retention, CAC across 50 customers"
          baseline: "Current fixed pricing: €35 ARPU, 25% churn, LTV:CAC 2:1"
          
          # === TRL Fields for Business Model Innovation ===
          trl_start: 5  # Validated with 20 pilot customers, promising unit economics
          trl_target: 7  # Operational at scale with 100+ customers, proven model
          trl_progression: "TRL 5 → TRL 7"
          
          technical_hypothesis: "A usage-based pricing model can achieve €50+ ARPU with <20% monthly churn in SMB segment, creating sustainable unit economics with LTV:CAC >3:1"
          
          experiment_design: "Launch usage-based pricing for 50 new signups → Track usage patterns, revenue per user, and churn → Compare with cohort on fixed pricing → Analyze unit economics and customer feedback"
          
          success_criteria: "€50+ ARPU, <20% monthly churn, LTV:CAC >3:1, >70% of users exceeding base tier within 3 months, demonstrating sustainable usage-based model"
          
          uncertainty_addressed: "Whether usage-based pricing aligns incentives sufficiently to drive customer value realization and retention. Risk: complexity confuses users or unit economics don't support growth."
```

---

## Step 10: Validate Your Enriched Roadmap

After adding TRL fields, validate the roadmap.

### Validation Checklist

```bash
# 1. Backup check
ls -la 05_roadmap_recipe.yaml.backup  # Ensure backup exists

# 2. JSON Schema validation
cd docs/EPF
./scripts/validate-schemas.sh _instances/twentyfirst/READY/05_roadmap_recipe.yaml

# 3. Field coverage analysis
./scripts/analyze-field-coverage.sh _instances/twentyfirst/READY/05_roadmap_recipe.yaml

# 4. Version alignment check
./scripts/check-version-alignment.sh _instances/twentyfirst
```

### Expected Results

✅ **Schema validation**: PASS (all required fields present, types correct)  
✅ **Field coverage**: 70-90% (significant improvement from pre-enrichment)  
✅ **Version alignment**: CURRENT (artifact version matches schema)

### Common Validation Errors

**Error**: `trl_target < trl_start`  
**Fix**: Ensure target ≥ start (can't go backwards)

**Error**: `trl_progression doesn't match trl_start/trl_target`  
**Fix**: Make sure format is "TRL X → TRL Y" where X=start, Y=target

**Error**: `technical_hypothesis is too vague`  
**Fix**: Add quantifiable outcome and specific conditions

---

## Step 11: Update Artifact Version

After successful enrichment, update the version header:

```yaml
# Before
# EPF v1.9.6 | Twenty First Product | Cycle 1

# After
# EPF v1.13.0 | Twenty First Product | Cycle 1 | Enriched with TRL tracking
```

---

## Completion Checklist

- [ ] All innovation-focused KRs have TRL fields
- [ ] Routine execution KRs appropriately skip TRL (not all work is R&D)
- [ ] TRL progressions are realistic (typically 1-3 levels per cycle)
- [ ] Hypotheses are falsifiable and measurable
- [ ] Experiment designs are specific with clear methods
- [ ] Success criteria are quantitative with thresholds
- [ ] Uncertainties address genuine risks
- [ ] Schema validation passes
- [ ] Field coverage improved (check with analyze-field-coverage.sh)
- [ ] Version header updated to v1.13.0
- [ ] Backup preserved for rollback if needed

---

## Estimated Time Investment

**Minimal enrichment** (TRL fields only, 2-3 KRs): 2-3 hours  
**Moderate enrichment** (TRL + hypothesis fields, 5-7 KRs): 4-6 hours  
**Comprehensive enrichment** (all tracks, 10-15 KRs): 8-10 hours

---

## Value Unlocked

✅ **Strategic clarity**: Explicit distinction between learning (TRL 1-6) and execution (TRL 7-9)  
✅ **Innovation tracking**: Visibility into maturity progression across all 4 tracks  
✅ **Hypothesis validation**: Structured approach to resolving uncertainties  
✅ **Cross-functional learning**: Shared language for innovation across Product, Strategy, Org&Ops, Commercial  
✅ **Decision support**: Data for prioritizing innovation investments vs execution bets

---

## Troubleshooting

### "I don't know what TRL to assign"

Start with TRL scale reference and ask: "If I had to demo this today, what would I show?"
- Can only describe concept = TRL 2
- Have working POC = TRL 3-4
- Can demo with realistic data = TRL 5-6
- Running in production pilot = TRL 7
- Proven at scale = TRL 8-9

### "All our KRs seem like TRL 7-9"

That's okay! Not all work is innovation. If you're executing proven methods:
- Skip TRL fields (they're optional for routine work)
- Focus on clear measurement_method and target instead
- TRL is for uncertainty resolution, not all work

### "My TRL progression is TRL 2 → TRL 8"

That's a red flag. 6-level jump in one cycle is unrealistic.
- Break into multiple cycles: TRL 2→4 (cycle 1), 4→6 (cycle 2), 6→8 (cycle 3)
- Or recalibrate: Maybe you're really at TRL 5 already

### "This takes too long"

Start with highest-value KRs:
1. KRs with most uncertainty (biggest innovation bets)
2. KRs blocking other work (critical path dependencies)
3. KRs with most strategic value

You don't need to enrich all KRs at once.

---

## Next Steps

After roadmap enrichment:
1. Run health check: `./scripts/check-version-alignment.sh _instances/twentyfirst`
2. Review field coverage: `./scripts/analyze-field-coverage.sh _instances/twentyfirst/READY`
3. Consider feature definition enrichment: See [feature_enrichment.wizard.md](./feature_enrichment.wizard.md)

---

**Questions?** See [UNIVERSAL_TRL_FRAMEWORK.md](../schemas/UNIVERSAL_TRL_FRAMEWORK.md) for detailed TRL guidance across all tracks.
