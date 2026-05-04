# Feature Definition Enrichment Wizard - v2.0 Persona Upgrade

**Version**: 1.0  
**Target Schema**: feature_definition_schema.json v2.0.0+  
**Estimated Time**: 1-2 hours per feature definition  
**Breaking Change**: v2.0.0 renames `contexts` → `personas` and enhances persona structure

---

## Overview

This wizard guides you through upgrading feature definitions from v1.x to v2.0, which includes:

1. **Field rename**: `contexts` → `personas` (BREAKING CHANGE)
2. **Enhanced persona structure**: Richer user insights and transformation moments
3. **Improved strategic clarity**: Better connection between personas and value proposition

**Important**: This is a **breaking change**. Feature definitions using `contexts` will fail v2.0.0 schema validation.

---

## Pre-Migration Checklist

- [ ] **Backup created**: `cp fd-XXX_feature.yaml fd-XXX_feature.yaml.backup`
- [ ] **Schema reviewed**: Read [schemas/feature_definition_schema.json](../schemas/feature_definition_schema.json) v2.0.0
- [ ] **Understand personas vs contexts**: Personas are richer user archetypes with transformation journeys
- [ ] **Template reviewed**: See [templates/FIRE/feature_definition_template.yaml](../templates/FIRE/feature_definition_template.yaml)

---

## Understanding the v2.0 Change

### What Changed?

**v1.x (contexts)**:
```yaml
feature:
  contexts:
    - role: "Board Member"
      situation: "Managing multiple companies"
      pain_points: ["Manual tracking", "Scattered documents"]
```

**v2.0 (personas)**:
```yaml
feature:
  personas:
    - name: "Busy Board Member Bjørn"
      current_situation: "Juggles 5 board seats, drowning in email, missing deadlines"
      transformation_moment: "When he realizes one forgotten signature could cost millions"
      emotional_resolution: "Relief and confidence from centralized governance visibility"
      demographics:
        role: "Professional Board Member"
        experience: "15+ years"
      psychographics:
        values: ["Efficiency", "Risk mitigation", "Reputation"]
        pain_points: ["Information overload", "Context switching", "Accountability anxiety"]
```

### Why the Change?

1. **Richer user understanding**: Demographics + psychographics + emotional journey
2. **Transformation focus**: Captures the "aha moment" when users realize they need the solution
3. **Emotional resonance**: Documents the emotional payoff, not just functional benefits
4. **Product-market fit**: Better foundation for messaging, positioning, and feature prioritization

---

## Step 1: Rename contexts → personas

This is mechanical - just rename the field.

### Before (v1.x)

```yaml
feature:
  id: "fd-001"
  name: "Group Structures"
  contexts:
    - role: "Board Member"
      # ...
```

### After (v2.0)

```yaml
feature:
  id: "fd-001"
  name: "Group Structures"
  personas:
    - name: "Busy Board Member Bjørn"  # Add persona name
      # ...
```

**Action**: Search and replace `contexts:` with `personas:` in your feature definition.

---

## Step 2: Add Persona Names

Each persona needs a memorable name that captures their essence.

### Good Persona Naming

**Format**: `[Adjective] [Role] [Alliterative Name]`

**Examples**:
- "Busy Board Member Bjørn" (emphasizes time pressure)
- "Compliance-Conscious CFO Clara" (emphasizes risk awareness)
- "Founder Frida" (simple, memorable)
- "Growth-Stage CEO Sven" (emphasizes company stage)
- "First-Time Chairperson Per" (emphasizes inexperience/learning)

### Converting Role → Name

**v1.x role**: "Board Member"  
**v2.0 name**: "Busy Board Member Bjørn"

**v1.x role**: "CFO managing group structures"  
**v2.0 name**: "Compliance-Conscious CFO Clara"

**v1.x role**: "Founder with multiple companies"  
**v2.0 name**: "Serial Founder Frida"

---

## Step 3: Expand current_situation

Describe the persona's daily reality in vivid, specific terms.

### Good Current Situation

- **Specific**: Concrete details about their work
- **Relatable**: Others in this role will recognize themselves
- **Problem-rich**: Surfaces multiple pain points naturally
- **Emotional**: Hints at frustration, anxiety, overwhelm

### Examples

**Generic (avoid)**:
```yaml
current_situation: "Manages governance for several companies"
```

**Specific (good)**:
```yaml
current_situation: "Juggles 5 board seats across 3 industries, receives 200+ emails daily, tracks deadlines in a messy spreadsheet, regularly scrambles to find the right version of documents hours before board meetings, lives in fear of missing a critical compliance deadline"
```

**Generic (avoid)**:
```yaml
current_situation: "CFO handling group consolidation"
```

**Specific (good)**:
```yaml
current_situation: "Manages consolidated reporting for 8 subsidiary companies, manually reconciles intercompany transactions in Excel, spends 2 weeks every quarter compiling board packs from scattered sources, constantly anxious about audit findings or regulatory non-compliance"
```

### Conversion Guide

Take your v1.x `situation` field and:
1. **Add quantitative details**: How many X? How often?
2. **Name specific tools/methods**: Excel, email, Post-its
3. **Surface emotional state**: Anxious, overwhelmed, frustrated
4. **Describe failure modes**: What goes wrong? What keeps them up at night?

---

## Step 4: Define transformation_moment

This is the **"aha moment"** when the persona realizes they need your solution.

### Good Transformation Moment

- **Specific trigger event**: Not general dissatisfaction, but a concrete incident
- **Emotional impact**: Shame, fear, relief, anger - strong feeling
- **Consequence awareness**: They see what's at stake
- **Action-inducing**: Moves them from passive suffering to active seeking

### Examples by Persona Type

**Board Member**:
```yaml
transformation_moment: "When he realizes one forgotten signature on a loan guarantee could expose him to personal liability for millions of kroner, destroying his reputation built over 20 years"
```

**CFO**:
```yaml
transformation_moment: "The moment the auditors flag a €500K intercompany error that could have been caught with proper system controls, leading to an embarrassing board discussion and delayed annual report"
```

**Founder**:
```yaml
transformation_moment: "After missing a Brønnøysund filing deadline for the third time, facing potential fines and realizing her manual tracking system doesn't scale as her portfolio grows"
```

**CEO**:
```yaml
transformation_moment: "During due diligence for Series B, when investors request comprehensive governance documentation and she realizes they have nothing centralized, jeopardizing the funding round"
```

### Identifying Transformation Moments

Ask:
1. **What goes wrong?** What specific failure or near-miss triggers awareness?
2. **What's at stake?** Money, reputation, compliance, relationships?
3. **Why now?** Why can't they keep doing it the old way?
4. **What emotion?** Fear, shame, anger, frustration?

---

## Step 5: Describe emotional_resolution

This is the **emotional payoff** - how the persona *feels* after using your solution.

### Good Emotional Resolution

- **Positive emotion**: Relief, confidence, pride, peace of mind
- **Contrasts with current state**: From anxious → confident
- **Specific to transformation**: Directly addresses the fear/pain from transformation moment
- **Aspirational**: The feeling they want, the person they want to be

### Examples

**Board Member**:
```yaml
emotional_resolution: "Relief and confidence from knowing every obligation is tracked and visible, sleeping soundly knowing he won't be blindsided by missed deadlines or liability exposure, feeling like a professional with systems, not an amateur with spreadsheets"
```

**CFO**:
```yaml
emotional_resolution: "Peace of mind from real-time consolidated view and audit-ready documentation, confidence presenting to board knowing numbers are reconciled and defensible, pride in running a finance function that sets the standard"
```

**Founder**:
```yaml
emotional_resolution: "Liberation from governance anxiety, confidence to focus on growth knowing compliance is systematically handled, pride in presenting professional governance to investors, feeling like a credible scale-up founder, not a disorganized solopreneur"
```

**CEO**:
```yaml
emotional_resolution: "Executive confidence from governance readiness, stress relief from knowing due diligence won't uncover organizational chaos, pride in demonstrating maturity to board and investors"
```

### Identifying Emotional Resolution

Ask:
1. **What fear is eliminated?** (Transformation moment → Resolution)
2. **What confidence is gained?** What can they do now that they couldn't before?
3. **What identity shift?** Amateur → Professional, Reactive → Proactive
4. **What freedom?** What can they focus on instead?

---

## Step 6: Add Demographics

Factual, objective characteristics of the persona.

### Core Demographics

```yaml
demographics:
  role: "Professional Board Member"  # Job title or function
  experience: "15+ years in governance"  # Seniority/expertise
  company_stage: "Growth to mature companies"  # Optional: context
  company_size: "50-500 employees"  # Optional: scale
  industry: "Tech, Finance, Healthcare"  # Optional: sector focus
```

### Examples by Role

**Board Member**:
```yaml
demographics:
  role: "Professional Board Member / Chairperson"
  experience: "15+ years, typically 3-7 board seats"
  company_stage: "Growth-stage to mature (Series B+, >50 employees)"
  typical_portfolio: "Mix of investment boards, advisory roles, and governance positions"
```

**CFO**:
```yaml
demographics:
  role: "Group CFO or Finance Director"
  experience: "10+ years in finance, 3+ years in leadership"
  company_stage: "Multi-entity groups (holding + 3-10 subsidiaries)"
  company_size: "50-500 employees across group"
```

**Founder**:
```yaml
demographics:
  role: "Serial Founder / Portfolio Entrepreneur"
  experience: "2-4 companies founded, 5-15 years entrepreneurship"
  company_stage: "Managing 2-5 active companies simultaneously"
  company_size: "Typically 5-50 employees per company"
```

---

## Step 7: Add Psychographics

Psychological characteristics - values, motivations, pain points, behaviors.

### Core Psychographics

```yaml
psychographics:
  values: ["What they care about deeply"]
  motivations: ["What drives their behavior"]
  pain_points: ["Current frustrations"]
  behaviors: ["How they currently work"]
  goals: ["What they're trying to achieve"]
```

### Examples by Role

**Board Member**:
```yaml
psychographics:
  values:
    - "Fiduciary duty and personal liability protection"
    - "Professional reputation and credibility"
    - "Efficiency and time leverage (high opportunity cost)"
  motivations:
    - "Avoid personal financial or reputational risk"
    - "Serve effectively without excessive time burden"
    - "Maintain portfolio of high-quality board seats"
  pain_points:
    - "Information overload from multiple board positions"
    - "Anxiety about missing critical deadlines or obligations"
    - "Context switching between different company systems and cultures"
    - "Lack of visibility into compliance and risk exposure"
  behaviors:
    - "Relies heavily on email and PDF attachments"
    - "Maintains personal spreadsheets or calendars for tracking"
    - "Often prepares for meetings at the last minute"
    - "Depends on company secretary or admin support for reminders"
  goals:
    - "Fulfill board obligations without consuming excessive time"
    - "Maintain clear visibility of all governance matters"
    - "Protect personal assets and reputation"
    - "Be respected as a professional, effective board member"
```

**CFO**:
```yaml
psychographics:
  values:
    - "Accuracy and auditability (fear of errors)"
    - "Compliance and risk mitigation"
    - "Efficiency and process optimization"
  motivations:
    - "Deliver clean audits and timely reporting"
    - "Demonstrate value to CEO/board through financial clarity"
    - "Reduce month-end and quarter-end stress"
  pain_points:
    - "Manual consolidation is error-prone and time-consuming"
    - "Lack of real-time visibility into group financial position"
    - "Intercompany reconciliation nightmares"
    - "Board and investor requests are ad-hoc fire drills"
  behaviors:
    - "Lives in Excel for consolidation and reporting"
    - "Sends multiple follow-up emails for missing data"
    - "Works late nights during closing periods"
    - "Maintains complex version control for board materials"
  goals:
    - "Present accurate, timely financials to board and investors"
    - "Pass audits without major findings"
    - "Reduce time spent on low-value data gathering"
    - "Be seen as strategic partner, not just bookkeeper"
```

**Founder**:
```yaml
psychographics:
  values:
    - "Growth and scaling (compliance seen as friction)"
    - "Speed and agility (bureaucracy as enemy)"
    - "Investor and stakeholder confidence"
  motivations:
    - "Focus on product and growth, not governance admin"
    - "Present professional image to investors and customers"
    - "Scale companies without scaling operational overhead"
  pain_points:
    - "Governance seen as distraction from 'real work'"
    - "Fear of missing compliance deadlines due to inattention"
    - "Embarrassment when investors find organizational chaos"
    - "Difficulty delegating governance without expensive staff"
  behaviors:
    - "Procrastinates on governance tasks until last minute"
    - "Relies on accountant or lawyer for deadline reminders"
    - "Often discovers requirements after they're overdue"
    - "Copies governance setup from one company to others haphazardly"
  goals:
    - "Automate governance so it doesn't consume founder time"
    - "Avoid compliance failures and associated fines/embarrassment"
    - "Present organized, credible company to investors during fundraising"
    - "Scale governance without hiring expensive overhead"
```

---

## Step 8: Consolidate and Validate

Now assemble your enriched persona.

### Complete v2.0 Persona Example

```yaml
personas:
  - name: "Busy Board Member Bjørn"
    
    current_situation: "Juggles 5 board seats across 3 industries (tech, healthcare, finance), receives 200+ governance-related emails per week, tracks obligations in a messy spreadsheet that's always out of date, regularly scrambles to find the right document version hours before board meetings, lives in constant low-level anxiety about missing a critical deadline that could expose him to personal liability"
    
    transformation_moment: "When he realizes one forgotten signature on a loan guarantee could expose him to personal liability for millions of kroner, destroying the reputation he's built over 20 years, and that his current ad-hoc system is a ticking time bomb as his portfolio grows"
    
    emotional_resolution: "Relief and confidence from centralized governance visibility across all board positions, sleeping soundly knowing he won't be blindsided by missed deadlines or hidden liability exposure, feeling like a professional with systems rather than an amateur juggling spreadsheets, able to focus on strategic contribution instead of administrative firefighting"
    
    demographics:
      role: "Professional Board Member / Chairperson"
      experience: "15+ years in governance, typically holds 3-7 concurrent board seats"
      company_stage: "Growth-stage to mature companies (Series B+, >50 employees)"
      typical_portfolio: "Mix of investor board seats, advisory roles, and independent director positions"
    
    psychographics:
      values:
        - "Fiduciary duty and personal liability protection"
        - "Professional reputation and credibility in business community"
        - "Time efficiency and leverage (high opportunity cost per hour)"
      motivations:
        - "Avoid personal financial or reputational risk from governance failures"
        - "Serve effectively on multiple boards without excessive time burden"
        - "Maintain portfolio of high-quality board positions"
      pain_points:
        - "Information overload from juggling multiple board contexts"
        - "Constant anxiety about missing critical deadlines or obligations"
        - "Mental overhead from context switching between different companies"
        - "Lack of visibility into personal risk exposure across portfolio"
      behaviors:
        - "Relies heavily on email and PDF attachments for board materials"
        - "Maintains personal tracking in spreadsheets or calendar apps"
        - "Often prepares for board meetings at the last minute"
        - "Depends on company secretaries or admins for reminders and follow-up"
      goals:
        - "Fulfill all board obligations without consuming excessive personal time"
        - "Maintain clear visibility of governance matters across all positions"
        - "Protect personal assets and professional reputation"
        - "Be respected as an effective, professional board member"
```

### Validation Checklist

- [ ] **Persona name** is memorable and descriptive
- [ ] **Current situation** is specific with quantitative details
- [ ] **Transformation moment** describes a concrete triggering event with stakes
- [ ] **Emotional resolution** contrasts with current emotional state
- [ ] **Demographics** provides factual role/experience context
- [ ] **Psychographics** captures values, motivations, pain points, behaviors, goals
- [ ] **Overall coherence**: Transformation moment → Emotional resolution makes sense
- [ ] **Empathy test**: Would someone in this role recognize themselves?

---

## Step 9: Schema Validation

Validate your v2.0 feature definition.

```bash
# Validate against v2.0 schema
cd docs/EPF
./scripts/validate-schemas.sh _instances/twentyfirst/FIRE/feature_definitions/fd-XXX_feature.yaml

# Check field coverage
./scripts/analyze-field-coverage.sh _instances/twentyfirst/FIRE/feature_definitions/fd-XXX_feature.yaml
```

### Expected Results

✅ **Schema validation**: PASS (personas field recognized, contexts deprecated)  
✅ **Field coverage**: 80-95% (rich persona data significantly improves coverage)

### Common Errors

**Error**: `should NOT have additional properties: contexts`  
**Fix**: You forgot to rename `contexts` → `personas`

**Error**: `personas[0] should have required property 'name'`  
**Fix**: Add persona name field

**Error**: `personas[0].current_situation is too short`  
**Fix**: Expand to at least 50 characters with specific details

---

## Step 10: Update Version Header

```yaml
# Before
# Feature Definition v1.9.6

# After  
# Feature Definition v2.0.0 - Enhanced personas with transformation tracking
```

---

## Batch Migration: All Feature Definitions

If you have multiple feature definitions to migrate:

```bash
# Backup all feature definitions
cp -r _instances/twentyfirst/FIRE/feature_definitions _instances/twentyfirst/FIRE/feature_definitions.backup

# Use version alignment checker to identify which need migration
./scripts/check-version-alignment.sh _instances/twentyfirst
```

Based on the twentyfirst instance, **16 feature definitions** need v2.0 migration (currently using `contexts`).

### Prioritization Strategy

**High priority** (3-5 features):
- Core features with strongest product-market fit
- Features mentioned most in sales/customer conversations
- Features with clearest persona archetypes

**Medium priority** (5-8 features):
- Supporting features with decent usage
- Features needed for complete workflows

**Low priority** (remaining):
- Speculative or future features
- Features with unclear personas

Start with high-priority features (3-5), validate schema and coverage improvements, then batch the rest.

---

## Estimated Time

**Per feature definition**:
- Simple persona (1 persona): 1 hour
- Moderate (2-3 personas): 1.5-2 hours  
- Complex (4+ personas): 2-3 hours

**For twentyfirst instance (16 features)**:
- High-priority batch (5 features): 5-8 hours
- Full migration (16 features): 20-30 hours (can be spread over weeks)

**Efficiency tip**: Batch similar roles (e.g., all CFO personas, all board member personas) to reuse psychographic research.

---

## Value Unlocked

✅ **Richer user understanding**: Demographics + psychographics + emotional journey  
✅ **Product-market fit insights**: Transformation moments reveal core value props  
✅ **Better messaging**: Emotional resolutions inform positioning and marketing  
✅ **Prioritization clarity**: High-stakes transformation moments = high-value features  
✅ **Team alignment**: Shared, vivid user understanding across product, design, sales  

---

## Example: Full Before/After Migration

### Before (v1.x - contexts)

```yaml
feature:
  id: "fd-001"
  name: "Group Structures"
  contexts:
    - role: "Board Member"
      situation: "Managing multiple companies with different governance structures"
      pain_points:
        - "Hard to track all obligations"
        - "Documents scattered across systems"
```

### After (v2.0 - personas)

```yaml
feature:
  id: "fd-001"
  name: "Group Structures"
  personas:
    - name: "Busy Board Member Bjørn"
      
      current_situation: "Juggles 5 board seats across 3 industries, receives 200+ governance emails weekly, tracks deadlines in outdated spreadsheet, constantly anxious about missing critical obligations that could expose him to personal liability"
      
      transformation_moment: "When he realizes one forgotten signature on a loan guarantee could expose him to millions in personal liability, destroying his 20-year reputation, and that his ad-hoc tracking system is a ticking time bomb"
      
      emotional_resolution: "Relief and confidence from centralized governance visibility, sleeping soundly knowing he won't be blindsided by missed deadlines, feeling like a professional with systems instead of an amateur juggling spreadsheets"
      
      demographics:
        role: "Professional Board Member / Chairperson"
        experience: "15+ years, 3-7 concurrent board seats"
        company_stage: "Growth to mature (Series B+, >50 employees)"
      
      psychographics:
        values: ["Fiduciary duty", "Professional reputation", "Time efficiency"]
        motivations: ["Avoid personal risk", "Serve effectively without time burden"]
        pain_points: ["Information overload", "Deadline anxiety", "Context switching", "Visibility gaps"]
        behaviors: ["Email/PDF reliance", "Spreadsheet tracking", "Last-minute prep"]
        goals: ["Fulfill obligations efficiently", "Clear visibility", "Protect reputation"]
```

**Coverage improvement**: 35% → 87% (52 percentage point increase)

---

## Troubleshooting

### "I don't know enough about my users to write transformation moments"

**Solution**: User research time!
1. Interview 3-5 customers in this persona category
2. Ask: "What made you realize you needed this solution?"
3. Listen for the specific incident/moment
4. Document emotional tone (frustration, fear, relief)

### "My personas feel generic/lifeless"

**Solution**: Add specificity
- Replace "many" with numbers: "5 board seats", "200 emails"
- Name tools/methods: "Excel", "email threads", "Post-its"
- Include failure modes: "forgot signature", "missed deadline"
- Surface emotions: "anxious", "overwhelmed", "relieved"

### "I have too many personas per feature"

**Solution**: Consolidate or split
- If >4 personas per feature, consider splitting into multiple feature definitions
- Merge similar personas (e.g., "CFO" and "Finance Director" might be same persona)
- Focus on 2-3 primary personas, list others as "also serves" without full detail

### "Transformation moment feels forced"

**Solution**: It might not be a transformation moment, just dissatisfaction
- Good: "When X happened, I realized Y was at stake"
- Bad: "I was generally frustrated and wanted something better"
- Real transformation moments have:
  - **Specific trigger**: Concrete event or realization
  - **Stakes**: What's lost if problem persists
  - **Urgency**: Why they can't keep limping along

---

## Next Steps

After feature definition enrichment:
1. Run schema validation: `./scripts/validate-schemas.sh`
2. Check version alignment: `./scripts/check-version-alignment.sh _instances/twentyfirst`
3. Review field coverage: `./scripts/analyze-field-coverage.sh`
4. Use enriched personas for messaging and roadmap prioritization

---

**Questions?** See [feature_definition_schema.json](../schemas/feature_definition_schema.json) for complete v2.0 specification.
