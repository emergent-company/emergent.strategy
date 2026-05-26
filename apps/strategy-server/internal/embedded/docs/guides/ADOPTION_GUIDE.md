# EPF Adoption Guide: Start Simple, Scale Organically

> **Last updated**: EPF v2.0.0 | **Status**: Current

Complete guide for adopting EPF based on your team size, complexity, and organizational maturity. EPF is designed for **organic growth** - you don't implement "full EPF" on day one. You start minimal and add artifacts as complexity emerges.

## Philosophy: Emergence Applies to Adoption

The Emergent Product Framework gets its name from emergence - complex, coherent systems arising from simple rules consistently applied. **This principle applies to EPF adoption itself:**

- **You don't design the strategy upfront** - it emerges from validated artifacts
- **You don't adopt "full EPF" upfront** - it emerges from organizational need
- **Start with 1-2 artifacts** - when you feel coordination pain, add the next type

Like a coral reef growing one polyp at a time, EPF grows one artifact at a time.

---

## The AI-Enabled Small Team Era

**Why EPF matters more than ever:** We are entering an era where **1-5 person teams can build products that previously required 20-50 people**. AI amplifies capability across multiple layers—strategy synthesis, code generation, design automation, data analysis, content creation. While "single-founder unicorns" may be hyperbole, the trend is clear: small teams building complex, scalable products.

**The new challenge:** Traditional product frameworks assume team size drives process complexity. They create adoption cliffs:
- **Small teams:** "Just talk, don't need formal PM"
- **Medium teams:** "Add some structure now"
- **Large teams:** "Now you need enterprise framework"

This forces framework migrations—Slack → Notion → JIRA → Confluence → consultant engagement. Each migration loses context. Each tool has different structure. **Migration debt compounds.**

**EPF's solution:** A **product operating system** that scales from Day 1 to Day 1000 without architectural rewrites:
- **Start minimal:** 2-3 hours (Level 0) vs 2-3 weeks (traditional frameworks)
- **Scale organically:** Add artifacts only when complexity emerges
- **AI-augmented:** Wizards do heavy lifting, humans provide judgment
- **No migrations:** Same framework, same Git repo, same structure forever

**Strategic continuity example:**
- **Person #1 (solo founder):** Documents strategy in YAML, Git-tracked (Day 1)
- **Person #5:** Reads same artifacts, understands strategy (6 months later)
- **Person #15:** Sees strategic evolution in Git history (18 months later)
- **Person #30:** Contributes to same framework, no "legacy docs" (30 months later)

**Why this matters:** Small AI-enabled teams can build **complex products** fast. But complexity without structure creates chaos. EPF provides just-enough structure that grows with you—no overhead when tiny, no migration when scaling.

---

## The Escalation Model

EPF defines 4 escalation levels based on team size and strategic complexity. Each level adds artifacts as organizational coordination demands increase.

### Quick Decision Matrix

| Your Situation | Team Size | Start At | Add Next When | Timeline |
|----------------|-----------|----------|---------------|----------|
| Solo founder | 1 | **Level 0** | Evidence when you pivot | Week 1 |
| Small startup | 2-5 | **Level 0 → 1** | Roadmap when planning quarters | Month 1-3 |
| Growing startup | 6-15 | **Level 1 → 2** | Value models when investors ask | Month 6-12 |
| Product org | 15-50+ | **Level 2 → 3** | Full validation when coordination breaks | Month 12-24 |
| Open source | 10-100 | **Level 1** | Evidence when debates arise | Month 3-6 |
| Enterprise team | 20-200 | **Level 2 or 3** | Depends on chaos level | Quarter 1-2 |

**Growth principle:** Start with 1-2 artifacts. When you feel coordination pain (miscommunication, lost context, unclear priorities), add the next artifact type. The system grows **as your strategic complexity grows.**

---

## Escalation Level 0: Solo Founder / 1-2 People

**When to use:** Just you, or you + 1 co-founder/early hire

**Time investment:** 2-3 hours initial setup, 30 minutes per quarter

### What You Start With

**Minimum viable EPF:**
1. **North Star only** (1 YAML file, `00_north_star.yaml`)
   - Purpose: Why you exist
   - Vision: Where you're going
   - Mission: How you'll get there
   - Values: Principles guiding decisions
   - 3-year targets: Measurable outcomes

2. **1-2 Feature Definitions** (optional, if building specific features)
   - High-level capability descriptions
   - Don't need full personas/scenarios yet

**What you DON'T need yet:**
- ❌ Evidence artifacts (you're validating hypotheses through building)
- ❌ Roadmap (strategy is in your head, changes daily)
- ❌ Value models (obvious what delivers value)
- ❌ Validation scripts (overhead not justified)

### Why This Works

- **North Star clarifies vision** - even for yourself, writing it down forces clarity
- **When teammate #2 joins** - they read 1 file and understand product direction
- **When you pivot** - update North Star, git diff shows strategic evolution
- **No coordination overhead** - you're building, not coordinating

### Time Breakdown

- **Week 1:** 2 hours creating North Star (use wizard if available)
- **Quarterly:** 30 minutes reviewing/updating North Star

**AI Acceleration Example:**
- **Traditional approach:** 2-4 weeks (40-80 hours) - market research, strategy workshops, document writing
- **EPF + AI approach:** 2-3 hours - Pathfinder wizard interview (30 min), AI generates North Star (15 min), human reviews (60 min), validation (15 min)
- **Savings:** 95-97% time reduction, $6,000-$12,000 cost savings (assuming $150/hour rate)

**What AI does:** Synthesizes your answers into complete North Star YAML with vision, mission, values, targets. Validates schema compliance. You focus on strategic thinking, not document formatting.

### Escalate to Level 1 When

**Triggers:**
- Hit first strategic question ("Should we pivot to B2B?")
- Add person #3 to team
- Facing decision you need to document for future reference
- Realize you're repeating same explanations to new people

**Signal:** You're saying "I wish I had written down why we decided X" more than once per month

---

## Escalation Level 1: Small Team (3-5 People)

**When to use:** Small startup with 3-5 people, starting to coordinate work

**Time investment:** 4-6 hours per quarter for planning, minimal daily overhead

### What You Add to Level 0

**New artifacts:**
1. **Evidence artifacts** (`READY/01_insight_analyses.yaml`, `READY/02_strategy_foundations.yaml`)
   - Document why you're making decisions
   - Capture market insights, competitive analysis, technology trends
   - Record strategic hypotheses with supporting evidence

2. **Simple Roadmap** (`READY/05_roadmap_recipe.yaml`)
   - 1-2 OKRs per quarter
   - Focus on **Product track only** initially (defer Strategy/OrgOps/Commercial)
   - List key assumptions you're testing
   - Define work packages (2-4 per quarter)

3. **Balance checker** (optional, use wizard before committing to quarters)
   - Validates roadmap isn't over-committed
   - Checks resource capacity vs. planned work
   - Catches circular dependencies

**What you DON'T need yet:**
- ❌ All 4 tracks (Product + Strategy + OrgOps + Commercial) - too complex
- ❌ Value models - still obvious what drives value
- ❌ Full feature quality validation - overhead not justified
- ❌ Cross-team coordination artifacts - only one team

### Why This Works

- **Evidence artifacts** prevent "we thought we knew but were wrong" mistakes
- **Roadmap** forces quarterly planning discipline (no more reactive scrambling)
- **Assumptions tracking** makes hypotheses explicit and testable
- **Still lean** - ~10 artifacts total, mostly READY phase

### Time Breakdown

- **Quarter start (READY):** 4-6 hours
  - 2 hours: Update evidence (market shifts, competitor moves)
  - 2 hours: Define OKRs and key assumptions
  - 1-2 hours: Break down into work packages
- **During quarter (FIRE):** Minimal overhead - work package tracking in existing tools (Linear, GitHub)
- **Quarter end (AIM):** 2 hours retrospective

**When to Run AIM (Level 1):**

At this level, use **simple trigger logic**:

1. **Calendar trigger** (baseline): End of each 90-day cycle (quarterly)
   - Minimum: Once per quarter, even if nothing dramatic happened
   - Ensures regular reflection and strategic continuity

2. **Pivot trigger** (critical): When core assumption fails
   - **Example:** Week 3 user testing shows your target user doesn't have the problem
   - **Response:** Run lightweight AIM immediately (90 minutes: assess what failed, decide pivot direction)
   - **Cost:** $225-$300 (vs. $10K-$30K wasted continuing wrong direction for 10 more weeks)

3. **Opportunity trigger** (strategic): Unexpected high-value signal
   - **Example:** Feature built for use case A gets 80% adoption for use case B
   - **Response:** Quick AIM to evaluate reallocation (2 hours: analyze data, discuss implications, update roadmap)
   - **ROI:** Capture opportunity 6-10 weeks earlier than waiting for quarterly retro

**At Level 1, keep it lightweight:** You're still small enough to pivot fast. Don't need formal ROI calculations—just ask "Is continuing this direction obviously wrong?" If yes, stop and recalibrate immediately.

**AI Acceleration Example:**
- **Traditional approach:** 2-4 weeks per quarter (80-160 hours) - research, workshops, alignment meetings, documentation
- **EPF + AI approach:** 4-6 hours per quarter - Pathfinder generates evidence (45 min), roadmap (60 min), humans refine (2-3 hours), AI validates (15 min)
- **Savings:** 94-97% time reduction, ~$12,000-$24,000 per quarter cost savings

**What AI does:** Rapid evidence capture (4 questions → structured YAML), MVP-focused roadmap generation (Product track full, other tracks minimal), balance checking (flags over-commitment, circular dependencies). You focus on decisions, not synthesis.

**Annual impact (4 quarters):** Save 304-620 hours and $48,000-$96,000 compared to traditional approach

### Escalate to Level 2 When

**Triggers:**
- You have 2+ product lines or offerings
- Team grows to 6+ people
- Investors asking "What's the strategy?"
- You're making same strategic mistakes repeatedly
- Debates about priorities take >30 minutes (no shared context)

**Signal:** Coordination cost (meetings, explanations, alignment) exceeds 10% of team time

---

## Escalation Level 2: Growing Startup (6-15 People)

**When to use:** Growing startup with multiple products/teams, facing cross-functional complexity

**Time investment:** 8-12 hours per quarter for PM team, scales because artifacts are validated

### What You Add to Level 1

**New artifacts:**
1. **All 4 tracks in Roadmap** (Product, Strategy, OrgOps, Commercial)
   - Product track: Core product development
   - Strategy track: Market positioning, competitive moves
   - OrgOps track: Team structure, hiring, processes
   - Commercial track: Sales, marketing, partnerships
   - Explicit cross-track dependencies

2. **Value Models** (`FIRE/value_models/*.yaml`)
   - Define product value hierarchy (L1 layers → L2 components → L3 sub-components)
   - Map features to business outcomes
   - Quantify which capabilities drive which revenue/retention metrics

3. **Feature-to-Assumption Traceability**
   - Link every feature to assumptions it tests
   - Track validation status (supported, refuted, inconclusive)
   - Enable data-driven pivots

4. **Quarterly AIM Retrospectives** (`AIM/assessment_*.yaml`, `AIM/calibration_*.yaml`)
   - Formal assessment of OKR achievement
   - Assumption validation with evidence
   - Calibration decisions (persevere, pivot, pull-the-plug)

**What you DON'T need yet:**
- ❌ Full schema enforcement (validation scripts) - manual review sufficient
- ❌ Cross-team value model coordination - teams still small enough to self-organize
- ❌ Portfolio-level strategic view - not managing multiple products strategically yet

### Why This Works

- **4 tracks** capture cross-functional complexity (engineering sees product, sales sees commercial, etc.)
- **Value models** answer "why are we building this?" for every feature
- **Traceability** enables "If we delay feature X, what's the impact?" queries
- **Quarterly retrospectives** prevent strategy drift

### Time Breakdown

- **Quarter start (READY):** 6-8 hours
  - 3 hours: Update all 4 tracks with OKRs
  - 2 hours: Identify riskiest assumptions
  - 2-3 hours: Define work packages across tracks
- **During quarter (FIRE):** 2-4 hours per month updating value models
- **Quarter end (AIM):** 4 hours
  - 2 hours: Data synthesis (analytics, interviews, reports)
  - 2 hours: Calibration discussion and memo

**When to Run AIM (Level 2):**

At this level, **formalize trigger conditions** with lightweight ROI assessment:

1. **Calendar trigger** (baseline): Quarterly (every 90 days)
   - Full assessment: OKR scoring, assumption validation, cross-track calibration
   - Always run this—ensures systematic reflection even when execution feels smooth

2. **ROI threshold trigger** (primary): New knowledge suggests >$10K potential waste
   - **Example:** Week 4 analytics show feature adoption 60% below projection, burns $3K/week in wasted capacity
   - **Calculation:** 8 weeks remaining × $3K/week = $24K potential waste > $600 AIM cost (4 hours)
   - **Response:** Run AIM immediately, decide persevere/pivot/pull-the-plug
   - **ROI:** 40x return ($24K saved vs. $600 invested)

3. **Assumption invalidation trigger** (critical): RAT (Riskiest Assumption Test) fails
   - **Example:** Planned enterprise sales motion, but 3 prospect interviews reveal deal cycles are 18 months (not 6)
   - **Response:** Emergency AIM to recalibrate commercial track (3-4 hours: update assumptions, adjust roadmap, reallocate resources)
   - **Impact:** Avoid 6 months building wrong sales infrastructure

4. **Cross-track misalignment trigger** (coordination): Dependencies break
   - **Example:** Product track commits to Q2 launch, but OrgOps track hasn't hired engineers (4-month lag)
   - **Response:** Lightweight AIM focused on timeline recalibration (2-3 hours)
   - **Prevention:** Catch coordination failure before crisis, not after

**Level 2 trigger discipline:**
- **Weekly check** (15 minutes): Product leader reviews key metrics, assumption tests, cross-track blockers
- **Ask:** "Is waiting for quarterly AIM economically rational?" If no, trigger immediately
- **Use Synthesizer** (future): AI monitors thresholds, flags when AIM ROI > 20x

**Why this matters at Level 2:** You have 6-15 people, $50K-$150K monthly burn. Wrong direction for 1 month = $50K-$150K wasted. AIM costs $600-$900 (4-6 hours). **Trigger threshold should be ~$10K** (10-15x ROI minimum).

**AI Acceleration Example (per quarter):**
- **Traditional approach:** 3-6 weeks (120-240 hours) - full analysis, cross-functional workshops, value modeling, feature specs, assessment
- **EPF + AI approach:** 8-12 hours per quarter - AI-generated artifacts (READY 6-8 hrs, FIRE 2-4 hrs/month, AIM 4 hrs), humans provide strategic input and refinement
- **Savings:** 90-95% time reduction, ~$18,000-$36,000 per quarter cost savings

**What AI does at this level:**
- **READY:** Pathfinder generates all 4 tracks (Product full, others with placeholders), identifies cross-track dependencies, runs balance checker
- **FIRE:** Product Architect creates value models (L1/L2/L3 hierarchy), maps features to components, validates traceability
- **AIM:** Synthesizer ingests analytics + interviews + reports, assesses OKR performance, validates assumptions, recommends calibration

**Key efficiency:** AI handles synthesis and validation (90% of work), humans focus on strategic decisions and domain knowledge (10% of work, 100% of value)

**Annual impact (4 quarters):** Save 432-912 hours and $72,000-$144,000 compared to traditional approach

### Escalate to Level 3 When

**Triggers:**
- Team grows to 15+ people
- Multiple product teams operating independently
- Enterprise sales cycles requiring strategic consistency
- Leadership asking "How do all these initiatives connect?"
- Cross-team dependencies causing frequent conflicts

**Signal:** Teams are stepping on each other's toes, or making decisions that contradict overall strategy

---

## Escalation Level 3: Product Organization (15-50+ People)

**When to use:** Product organization with multiple teams, complex portfolio, enterprise-level coordination

**Time investment:** 20-30 hours per quarter per product team (but replaces 50+ hours of coordination meetings)

### What You Add to Level 2

**New artifacts:**
1. **Full Schema Enforcement**
   - Run all validation scripts before committing
   - Enforce feature quality standards (4 personas, 200+ char narratives, scenarios, acceptance criteria)
   - Validate cross-references (no broken dependency links)
   - Check value model coherence

2. **Cross-Team Value Model Coordination**
   - Shared value model components across teams
   - Explicit feature dependencies between teams
   - Portfolio-level value tracking (which teams deliver which outcomes)

3. **Strategic Portfolio View**
   - Multi-product instances in one EPF repository
   - Product portfolio YAML (`product_portfolio.yaml`) defining relationships
   - Cross-product value models (platform capabilities used by multiple products)

4. **Leadership Uses EPF for Strategy Review**
   - Quarterly strategy reviews use EPF artifacts directly
   - Board decks generated from EPF knowledge graph (15 min vs 10-15 hours manual)
   - Strategic decisions documented in EPF (git history = decision audit trail)

**This is "full EPF."** But you grew into it over 12-24 months.

### Why This Works

- **Schema enforcement** prevents "garbage in, garbage out" (AI agents can't work with invalid artifacts)
- **Cross-team coordination** scales communication (artifacts replace 80% of alignment meetings)
- **Portfolio view** enables leadership to see entire strategy at once
- **Leadership integration** makes EPF the source of truth (not a PM side project)

### Time Breakdown

- **Quarter start (READY):** 15-20 hours per team
  - 8 hours: Cross-team planning session (all teams)
  - 5 hours: Team-specific roadmap refinement
  - 2-4 hours: Dependency mapping and conflict resolution
- **During quarter (FIRE):** 4-6 hours per month per team
  - Feature definitions with full quality validation
  - Value model updates with cross-team coherence checks
- **Quarter end (AIM):** 10-15 hours
  - 5 hours: Multi-source data synthesis per team
  - 3 hours: Cross-team learnings synthesis
  - 2-4 hours: Portfolio-level calibration discussion

**When to Run AIM (Level 3):**

At enterprise scale, **automate trigger monitoring** with AI-powered probes:

1. **Calendar trigger** (baseline): Quarterly per team (every 90 days)
   - Full assessment with cross-team synthesis
   - Portfolio-level calibration discussion
   - Required regardless of other triggers

2. **ROI threshold trigger** (primary): Automated monitoring via Synthesizer probe
   - **Weekly probe** (15-30 min automated): AI reviews metrics, assumption tests, cross-team blockers
   - **Threshold calculation:** Potential waste > 20x AIM cost (~$600-$900 per team = trigger at >$12K-$18K waste)
   - **Example:** Team A's feature shows 70% below adoption target, burns $5K/week capacity, 6 weeks remaining = $30K waste
   - **Response:** Auto-flag for immediate AIM, product leader reviews probe output (30 min), triggers calibration if confirmed
   - **ROI:** 30-50x (save $30K vs. $600-$900 AIM cost)

3. **Cross-team dependency failure trigger** (coordination critical)
   - **Example:** Team B commits to Q3 feature requiring Team A's platform capability, but Team A delayed to Q4
   - **Detection:** Dependency validation script flags misalignment during weekly check
   - **Response:** Urgent cross-team AIM (4-6 hours: assess impact, negotiate timeline, update both roadmaps)
   - **Prevention:** Catch coordination failure 8-10 weeks early, before crisis mode

4. **Portfolio-level strategic shift trigger** (leadership-initiated)
   - **Example:** Competitor launches disruptive feature, requires strategic pivot across 3 teams
   - **Response:** Emergency portfolio AIM (1-2 days: assess threat, reallocate resources, update multi-team roadmaps)
   - **Impact:** Coordinate response across organization in days, not weeks

5. **Assumption cascade trigger** (systemic learning)
   - **Example:** Team A's RAT invalidates assumption shared by Team B and Team C
   - **Detection:** Cross-reference validation identifies shared assumption across teams
   - **Response:** Multi-team AIM to recalibrate all affected roadmaps (6-8 hours total, 2-3 hours per team)
   - **Strategic value:** Propagate learning instantly across organization, prevent 3 teams making same mistake

**Level 3 automation framework:**

**Today (manual):**
- Product leadership reviews weekly summary (30 min)
- Asks: "Any team heading off-cliff that warrants immediate AIM?"
- Triggers ad-hoc AIM when ROI obvious

**Near-term (AI probe):**
- Synthesizer runs weekly automated check (15 min):
  * Ingests: Team metrics, assumption test results, dependency status, cross-team blockers
  * Outputs: "Continue all teams" or "Recommend AIM for Team X (ROI: 35x)"
- Product leadership reviews probe output (15 min), approves/declines trigger

**Future (automated callbacks):**
- Analytics integration monitors thresholds continuously
- Triggers AIM when: Metric drops >30% below target, critical dependency breaks, assumption fails across 2+ teams
- Example: Team A adoption drops 40% → Auto-trigger AIM with pre-generated assessment draft
- Product leader confirms (30 min review), proceeds with calibration

**Why automation matters at Level 3:**
- **Scale:** 3-5 teams × 4 metrics each = 12-20 signals to monitor
- **Coordination cost:** Manual monitoring = 2-3 hours/week across teams
- **AI advantage:** Automated probe = 15 min/week, catches patterns humans miss
- **ROI:** Probe costs $40-$60/week (15 min), saves $20K-$50K per early-detected failure (ROI: 300-1000x)

**Enterprise trigger discipline:**
- Each team has $200K-$500K quarterly budget
- Wrong direction for 1 month = $65K-$165K wasted
- AIM costs $600-$900 per team
- **Trigger threshold: $12K-$18K** (20-30x ROI minimum)
- **Probe frequency: Weekly** (compromise between responsiveness and overhead)

**Trade-off:** This sounds like a lot of time, but it replaces:
- ~30 hours/quarter of coordination meetings
- ~15 hours/quarter of strategic alignment sessions
- ~10 hours/quarter of "why are we building this?" debates
- ~5 hours/quarter of board deck preparation

**Net result:** Typically neutral or positive time impact, with vastly better strategic clarity

**AI Acceleration Example (per quarter per team):**
- **Traditional approach:** 8-12 weeks (320-480 hours) - enterprise PM process with consultants, workshops, documentation, validation, coordination
- **EPF + AI approach:** 20-30 hours per quarter - AI generates and validates all artifacts, humans focus on cross-team coordination and strategic decisions
- **Savings:** 91-94% time reduction, ~$48,000-$72,000 per quarter per team cost savings

**What AI does at enterprise scale:**
- **Full automation:** Schema validation, cross-reference checking, dependency mapping, circular dependency detection
- **Portfolio synthesis:** AI correlates patterns across teams, identifies strategic gaps, recommends resource reallocation
- **Board deck generation:** 15 minutes to generate strategy deck from knowledge graph (vs 10-15 hours manual PowerPoint creation)
- **Strategic queries:** "Which features depend on platform-auth?" → instant answers via knowledge graph traversal

**Multi-team impact (3 teams, annual):**
- Traditional: 3,840-5,760 hours, $576,000-$864,000
- EPF + AI: 240-360 hours, $36,000-$54,000
- **Total savings: 3,600-5,400 hours and $540,000-$810,000**

**The strategic advantage:** At enterprise scale, EPF + AI replaces coordination overhead with automated coherence. Teams move from 60% time in meetings to 90% time building, while maintaining strategic alignment.

---

## The One True Anti-Pattern: Client Services

**When EPF doesn't fit:**

### Client Services / Agency Work

**Why EPF is wrong fit:**
- **Client owns strategy** (not you) - EPF assumes strategy control
- **Project duration too short** (2-6 months) - EPF benefits accrue over 12+ months
- **Handoff required** (client won't maintain EPF artifacts) - EPF assumes continuous ownership

**What to use instead:** Traditional project management (Asana, JIRA) with client-facing documentation

**Exception:** Use EPF for **YOUR agency's strategy**, not client delivery projects. If you're building a recurring product offering, EPF applies to that product.

---

## Growth Triggers Reference

Use this checklist to know when to escalate to the next level:

### Level 0 → Level 1 Triggers

- [ ] Team size: 3+ people
- [ ] Strategic questions arising monthly (pivot decisions, market choices)
- [ ] New team members need 1+ days to understand context
- [ ] You're explaining same rationale repeatedly
- [ ] Evidence for decisions scattered across Slack/email

### Level 1 → Level 2 Triggers

- [ ] Team size: 6+ people
- [ ] 2+ product lines or major initiatives
- [ ] Investors asking "What's the strategy?"
- [ ] Cross-functional coordination issues (eng vs sales priorities)
- [ ] Debates about priorities take >30 minutes
- [ ] Coordination cost >10% of team time

### Level 2 → Level 3 Triggers

- [ ] Team size: 15+ people
- [ ] Multiple independent product teams
- [ ] Enterprise sales requiring strategic consistency
- [ ] Leadership can't see how initiatives connect
- [ ] Cross-team dependencies causing conflicts
- [ ] Board meetings require 10+ hours of deck prep

---

## Special Cases

### Open Source Projects (10-100 Contributors)

**Recommended level:** Level 1

**Why:**
- Evidence artifacts document project direction (prevents "benevolent dictator" problems)
- Roadmap makes priorities transparent to contributors
- Assumptions tracking helps community understand design decisions
- Coordination overhead is async (documentation critical)

**Time:** Maintainers invest 4-6 hours per quarter, community references artifacts continuously

### Enterprise Teams in Large Orgs

**Recommended level:** Level 2 or 3 (depends on autonomy)

**If autonomous** (full product ownership): Level 2-3 as described above

**If embedded** (shared services, platform): Level 1-2 with focus on:
- Interface contracts (what your team provides to other teams)
- Dependency management (what you rely on from other teams)
- Cross-team value models (your contribution to org-wide outcomes)

### Multiple Products in One Company

**Recommended approach:** Separate instances per product, shared portfolio view

**Structure:**
```
docs/EPF/_instances/
  product-a/           # Level 2-3 instance
  product-b/           # Level 2-3 instance
  product-c/           # Level 2-3 instance
  product_portfolio.yaml  # Portfolio view (Level 3)
```

**Coordination:** Product portfolio YAML defines cross-product relationships, shared platform capabilities, org-wide OKRs

---

## Migration Paths

### Currently Using Nothing → Start EPF

1. **Week 1:** Create North Star (Level 0) - 2 hours
2. **Month 1-3:** Add Evidence + Roadmap (Level 1) - 6 hours initial, 4-6 hours/quarter
3. **Month 6-12:** Add Value Models + 4 tracks (Level 2) - 10 hours initial, 8-12 hours/quarter
4. **Month 12-24:** Add Full Validation (Level 3) - 20 hours initial, 20-30 hours/quarter

### Currently Using Confluence/Notion → Migrate to EPF

1. **Don't migrate everything** - EPF is not a wiki
2. **Start with North Star** - synthesize strategy from scattered docs
3. **Add Evidence** - move market analysis, competitive intel to structured artifacts
4. **Add Roadmap** - convert initiatives/epics to OKRs and assumptions
5. **Keep Confluence** for reference docs, use EPF for strategy

**Timeline:** 2-4 weeks for initial migration, then follow escalation model

### Currently Using OKRs Alone → Add EPF

**Good news:** You're already at Level 1 (OKRs = part of Roadmap)

**Add to existing OKRs:**
1. **North Star** - give OKRs long-term context
2. **Evidence** - ground OKRs in market reality
3. **Assumptions** - make OKR hypotheses explicit
4. **Value Models** - connect features to OKRs

**Timeline:** 1-2 weeks to add missing artifacts, then continue OKR cadence

---

## Success Metrics by Level

How do you know EPF is working at each level?

### Level 0 Success Indicators

- ✅ New teammate understands vision in <1 hour
- ✅ Strategic pivots documented in git history
- ✅ You can explain "why we exist" consistently

### Level 1 Success Indicators

- ✅ Quarterly planning takes 1 day (not 1 week)
- ✅ Evidence-based decisions (not HiPPO - highest paid person's opinion)
- ✅ Team can trace work back to strategic goals

### Level 2 Success Indicators

- ✅ Cross-functional alignment takes 1 meeting (not 3-5)
- ✅ Features traceable to business outcomes
- ✅ Investor/board questions answerable in real-time
- ✅ "Why are we building this?" never asked (value model exists)

### Level 3 Success Indicators

- ✅ Board decks generated in 15 minutes (not 10-15 hours)
- ✅ Cross-team conflicts resolved via artifact review (not meetings)
- ✅ New PM onboards in 3 days (not 2-3 weeks)
- ✅ Leadership uses EPF for strategy reviews (not PowerPoint)

---

## Common Mistakes to Avoid

### Mistake 1: Starting Too Big

**Wrong:** "Let's implement full EPF (Level 3) from day one!"

**Why wrong:** Overhead exceeds value for small teams, creates rejection

**Right:** Start at appropriate level for team size, escalate when pain emerges

---

### Mistake 2: Skipping Evidence

**Wrong:** "Let's jump straight to roadmap without evidence artifacts"

**Why wrong:** Roadmap becomes opinion-based, not grounded in reality

**Right:** Evidence → Strategy → Roadmap (always in that order)

---

### Mistake 3: Never Escalating

**Wrong:** "We're 20 people but still using Level 1 (no value models)"

**Why wrong:** Coordination pain exceeds EPF overhead, missing benefits

**Right:** Watch for escalation triggers, add artifacts when pain appears

---

### Mistake 4: Over-Engineering

**Wrong:** "Our solo founder startup needs full validation scripts!"

**Why wrong:** Validation overhead exceeds strategic value at small scale

**Right:** Add validation when coordination breaks, not before

---

### Mistake 5: Treating EPF as Documentation

**Wrong:** "EPF is where we document what we already decided"

**Why wrong:** Artifacts become stale, team ignores them

**Right:** EPF is where strategy is MADE (not documented after the fact)

---

## Getting Help

**If you're stuck deciding which level to start:**
- Solo founder? → Start Level 0
- Small team (3-5)? → Start Level 1
- Growing team (6-15)? → Start Level 1, plan for Level 2 in 6 months
- Product org (15+)? → Start Level 2, plan for Level 3 in 12 months

**If you're unsure when to escalate:**
- Track coordination pain (time spent in alignment meetings)
- When coordination cost >10% of team time → escalate

**If EPF feels like too much overhead:**
- You're probably at wrong level (too high for team size)
- Scale back to previous level, add artifacts incrementally

**For more guidance:**
- See `INSTANTIATION_GUIDE.md` for step-by-step artifact creation
- See `NORTH_STAR_GUIDE.md` for Level 0 starting point
- See `wizards/README.md` for AI-assisted artifact creation

---

## Philosophy: No One Starts with "Full EPF"

**The key insight:** EPF is not a binary system ("all-or-nothing"). It's a **gradual emergence** of strategic clarity as organizational complexity grows.

- **1 person:** North Star (30 minutes) → vision clarity
- **3-5 people:** Add Evidence + Roadmap (4-6 hours/quarter) → strategic alignment
- **6-15 people:** Add Value Models + 4 tracks (8-12 hours/quarter) → cross-functional coherence
- **15-50+ people:** Add Full Validation (20-30 hours/quarter) → portfolio-level strategy

**You grow into it, like a coral reef: one polyp at a time.**

The system emerges as your strategic complexity emerges. That's why it's called the **Emergent** Product Framework.

---

**Last updated:** EPF v2.0.0 (2025-12-29)  
**Status:** Current  
**Related guides:** INSTANTIATION_GUIDE.md, NORTH_STAR_GUIDE.md, wizards/balance_checker.agent_prompt.md
