# Universal TRL Framework for EPF

**Version**: 1.0.0  
**Purpose**: Define how Technology Readiness Levels (TRL) apply across all EPF tracks

## Philosophy

TRL tracks **maturity progression** and **learning journeys**, not execution details.

- **TRL 1-6**: Learning/experimentation phase (resolving uncertainty)
- **TRL 7-9**: Execution phase (scaling proven approaches)
- **No TRL**: Routine execution work (using established methods)

**Key Insight**: TRL is about the **approach/method maturity**, not project completion percentage.

---

## The Full TRL Scale (1-9)

### Learning Phase (TRL 1-6)

**TRL 1: Basic principles observed**  
- Earliest research stage
- Observing fundamental principles
- Paper studies, thought experiments
- Example: "We notice group management is a pain point"

**TRL 2: Technology concept formulated**  
- Hypothesis articulated
- Approach conceptualized but not tested
- Example: "We believe graph-based model will solve multi-parent scenarios"

**TRL 3: Experimental proof of concept**  
- Initial validation in controlled environment
- Lab/prototype demonstrates feasibility
- Example: "Graph model works with 10-node test dataset"

**TRL 4: Technology validated in lab**  
- Prototype functions in controlled conditions
- Multiple test scenarios successful
- Example: "Prototype handles various graph topologies in development environment"

**TRL 5: Technology validated in relevant environment**  
- Works in realistic (but not production) conditions
- Staging environment, pilot with friendly users
- Example: "System handles 100-node graphs with real-ish data in staging"

**TRL 6: Technology demonstrated in relevant environment**  
- System-level demonstration close to production
- Limited pilot with real users and data
- Example: "5 pilot customers using graph features in production"

### Execution Phase (TRL 7-9)

**TRL 7: System prototype in operational environment**  
- Running in production with real users
- Still considered "prototype" - learning operational characteristics
- Example: "Graph features live in production, monitoring real-world usage patterns"

**TRL 8: System complete and qualified**  
- Production-ready, proven at small scale
- Known performance characteristics
- Example: "Graph model proven with 50+ customers, predictable performance"

**TRL 9: Actual system proven in operational conditions**  
- Validated at scale, production standard
- Reliable, maintained, documented
- Example: "Graph model standard across 500+ customers, SLA guarantees met"

---

## Track-Specific Interpretations

### Product Track (Technical Maturity)

**TRL 1-3**: Research, concept, early POC  
- TRL 1: Research phase (e.g., "AI models could improve extraction")
- TRL 2: Concept formulated (e.g., "Fine-tuned embeddings for domain docs")
- TRL 3: POC validated (e.g., "POC extracts entities with 70% precision")

**TRL 4-6**: Prototype, integration, system demo  
- TRL 4: Lab prototype (e.g., "Works with test documents")
- TRL 5: Staging validation (e.g., "Handles real document types")
- TRL 6: Limited production (e.g., "5 customers using in production")

**TRL 7-9**: Pilot, production, proven at scale  
- TRL 7: Production pilot (e.g., "Monitoring real usage, learning edge cases")
- TRL 8: Small-scale production (e.g., "50 customers, predictable performance")
- TRL 9: Proven at scale (e.g., "500+ customers, SLA guarantees")

### Strategy Track (Market Positioning Maturity)

**TRL 1-3**: Market hypothesis, concept testing, initial validation  
- TRL 1: Hypothesis (e.g., "Enterprise segment might value group features")
- TRL 2: Concept (e.g., "Enterprise pricing model defined: $50K/year")
- TRL 3: Initial test (e.g., "3 customers express willingness to pay")

**TRL 4-6**: Segment validation, positioning tested, GTM proven in pilots  
- TRL 4: Segment validation (e.g., "Target profile validated with 10+ conversations")
- TRL 5: Positioning tested (e.g., "Messaging resonates in sales calls")
- TRL 6: Pilot GTM (e.g., "5 pilot customers validate pricing and positioning")

**TRL 7-9**: GTM at scale, proven market position, competitive advantage  
- TRL 7: Scaling GTM (e.g., "Sales playbook being refined with 20+ deals")
- TRL 8: Proven position (e.g., "Predictable win rates, known competitive dynamics")
- TRL 9: Market leadership (e.g., "Defensible position, category creation")

### OrgOps Track (Process Maturity)

**TRL 1-3**: Process concept, paper-based approach, small team pilot  
- TRL 1: Concept (e.g., "Customer success process could reduce churn")
- TRL 2: Defined approach (e.g., "Success playbook documented")
- TRL 3: Team pilot (e.g., "One CSM tests playbook with 5 customers")

**TRL 4-6**: Process tested with multiple teams, workflows validated  
- TRL 4: Multi-team test (e.g., "3 CSMs using playbook")
- TRL 5: Workflow integration (e.g., "Playbook integrated with CRM, refined")
- TRL 6: Department-wide (e.g., "All CSMs trained and using playbook")

**TRL 7-9**: Organization-wide deployment, proven efficiency  
- TRL 7: Org adoption (e.g., "Process standard across all customer-facing teams")
- TRL 8: Proven efficiency (e.g., "Metrics show 30% efficiency gain")
- TRL 9: Cultural standard (e.g., "Process is 'how we work', continuously improved")

### Commercial Track (Business Model Maturity)

**TRL 1-3**: Pricing hypothesis, small customer tests, initial conversion  
- TRL 1: Hypothesis (e.g., "Freemium model might drive adoption")
- TRL 2: Model defined (e.g., "Free tier features defined, upgrade path clear")
- TRL 3: Initial test (e.g., "First 10 free users, 2 upgrade")

**TRL 4-6**: Model validated with cohorts, unit economics proven at small scale  
- TRL 4: Cohort validation (e.g., "100 free users, 15% conversion")
- TRL 5: Economics tested (e.g., "LTV:CAC >3:1 with 100-user cohort")
- TRL 6: Scaled cohort (e.g., "1000 users, economics hold, payback <12 months")

**TRL 7-9**: Scaled pricing, proven LTV:CAC, sustainable growth  
- TRL 7: Scale testing (e.g., "10K users, monitoring cohort behavior at scale")
- TRL 8: Proven economics (e.g., "50K users, predictable LTV, CAC, churn")
- TRL 9: Growth engine (e.g., "Sustainable growth, optimized funnel, repeatable")

---

## Decision Framework

### Should I use TRL fields?

**YES - Use TRL when:**
- ✅ Resolving technical/market/process/business model **uncertainty**
- ✅ Validating **unproven approaches**
- ✅ **Learning** what works before scaling
- ✅ Work involves genuine **innovation** or **experimentation**

**NO - Skip TRL when:**
- ❌ Executing **proven, routine work**
- ❌ Using established methods with known outcomes
- ❌ Simple feature additions without innovation
- ❌ Work is purely operational execution

### What TRL should I assign?

**Ask: "If I had to demonstrate this TODAY, what could I show?"**

- **Nothing yet, just concept** → TRL 1-2
- **POC or prototype** → TRL 3-4
- **Staging/pilot with real users** → TRL 5-6
- **Production with real customers** → TRL 7-8
- **Proven at scale, SLA guarantees** → TRL 9

### What about TRL progression?

**Common patterns:**
- TRL 2→3: Concept to proof
- TRL 3→5: POC to validation
- TRL 4→6: Lab to demonstration
- TRL 5→7: Validation to operational
- TRL 7→9: Pilot to production

**Red flags:**
- 🚩 Jumps >3 levels in one cycle (e.g., TRL 2→6) - probably too ambitious
- 🚩 All KRs at TRL 7-9 but you're launching new products - might be miscalibrated
- 🚩 All KRs at TRL 1-3 - might be too early for execution focus

---

## Common Questions

### "My entire roadmap is TRL 1-6. Is that wrong?"

**No!** If you're in a learning/pilot phase, this is **exactly right**.

Example: Early-stage product, new market entry, innovation phase - everything is experimentation. TRL 1-6 roadmaps are **appropriate** for:
- Pilots and MVPs
- New market validation
- Innovation R&D work
- Strategic pivots

### "My entire roadmap is TRL 7-9. Is that wrong?"

**Maybe.** Ask:
- Are you truly executing proven methods? → TRL 7-9 is correct
- Or are you executing but haven't proven the approach yet? → You might be at TRL 5-6

**Counter-question**: If your approach is proven (TRL 7-9), why track TRL at all? You might be better served omitting TRL fields and focusing on execution metrics.

### "I have no TRL fields. Is that a problem?"

**No!** TRL is **optional**.

Use TRL when:
- Applying for R&D funding (often required)
- Managing innovation portfolio (learning vs execution balance)
- High uncertainty work (tracking maturity progression)

Skip TRL when:
- Executing routine work
- Using proven approaches
- Low uncertainty projects

### "Can TRL go backwards?"

**Technically no** (schema enforces trl_target ≥ trl_start), but in reality:
- Discovering fundamental issues may require "starting over" with new approach
- In new cycle, reset to appropriate TRL for new approach
- Document learning in cycle retrospective

### "What's the difference between TRL 6 and TRL 7?"

**TRL 6**: System-level demo, still **learning if it works**  
**TRL 7**: Production use, now **learning how to operate it**

The transition from TRL 6→7 is critical:
- TRL 6: "Can we build it? Does it work?"
- TRL 7: "How does it behave in production? What breaks? How do we monitor/maintain?"

---

## Examples from twentyfirst Roadmap

### TRL 1-6 Examples (Learning Phase)

**kr-p-003**: Graph architecture innovation  
- **trl_start: 3** (experimental POC validated)
- **trl_target: 6** (demonstrated with real customers)
- **Why**: New graph-based model, proving it scales

**kr-s-001**: Enterprise pricing validation  
- **trl_start: 2** (pricing concept formulated)
- **trl_target: 4** (pricing validated with pilot cohort)
- **Why**: Never sold at $50K+, validating willingness to pay

**kr-o-001**: Enterprise support process  
- **trl_start: 1** (concept of white-glove support)
- **trl_target: 5** (process validated with pilot customers)
- **Why**: New support model, proving team can deliver

### TRL 7-9 Examples (Execution Phase)

*Note: twentyfirst roadmap has **no TRL 7-9 KRs** because entire cycle is pilot/validation. This is **correct and intentional**.*

**Hypothetical TRL 7-9 example:**

If twentyfirst had a KR like:
> "Migrate 500 existing customers to new group features with <5% churn"

This would be:
- **trl_start: 7** (features proven in pilot, now scaling)
- **trl_target: 9** (migration process proven at scale)
- **Why**: Features work (proven in pilot), now executing rollout

---

## Integration with Other EPF Fields

### TRL + technical_hypothesis
- **TRL 1-6**: Hypothesis is **critical** (what are we testing?)
- **TRL 7-9**: Hypothesis is **optional** (method is proven)

### TRL + experiment_design
- **TRL 1-6**: Experiment design is **critical** (how do we validate?)
- **TRL 7-9**: May describe rollout/deployment instead

### TRL + success_criteria
- **TRL 1-6**: Success = "Did we prove the approach works?"
- **TRL 7-9**: Success = "Did we execute efficiently at scale?"

### TRL + uncertainty_addressed
- **TRL 1-6**: Technical/market/process uncertainty
- **TRL 7-9**: Operational/scaling risks

---

## Maintenance

**Last Updated**: 2026-01-05  
**Schema Version**: Compatible with roadmap_recipe_schema.json v2.3.2+

**Referenced By**:
- `schemas/roadmap_recipe_schema.json` (trl_start description)
- `schemas/field-importance-taxonomy.json` (TRL context)
- `wizards/roadmap_enrichment.wizard.md` (TRL guidance)

**Related Documentation**:
- NASA TRL scale (original source)
- EPF HEALTH_CHECK_GUIDE.md (TRL coverage analysis)
