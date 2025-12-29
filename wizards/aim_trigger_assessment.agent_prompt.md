# AIM Trigger Assessment Wizard

**Purpose:** Help you decide whether to run AIM immediately (based on ROI) or wait for scheduled quarterly AIM. EPF treats AIM as an **investment decision**—run it when savings exceed cost, not just on calendar.

**When to use this wizard:**
- Weekly monitoring check (5-10 minutes)
- When unexpected signal arises (assumption fails, opportunity emerges, dependency breaks)
- When team debates "Should we recalibrate now or wait?"

**Philosophy:** Traditional frameworks treat retrospectives as **overhead** (minimize frequency). EPF treats them as **investment** (optimize timing). This wizard quantifies the ROI of running AIM immediately vs. waiting.

---

## Step 1: Context Check

**Answer these questions:**

1. **When is your next scheduled AIM?**
   - Date: ________________ (from `aim_trigger_config.yaml`)
   - Weeks until scheduled AIM: ______

2. **What is your AIM cost?**
   - Adoption Level 0-1: ~$300-$600 (2-4 hours)
   - Adoption Level 2: ~$600-$900 (4-6 hours)
   - Adoption Level 3: ~$900-$1,500 (6-10 hours per team)
   - Your AIM cost: $______

3. **What triggered this assessment?**
   - [ ] Weekly monitoring check (routine)
   - [ ] Metric dropped significantly
   - [ ] Assumption test failed
   - [ ] Unexpected opportunity emerged
   - [ ] Cross-team dependency broke
   - [ ] Team debate about direction

---

## Step 2: Waste Signal Analysis

For each potential waste signal, calculate **potential waste if you wait** for scheduled AIM:

### Signal Template (repeat for each signal):

**Signal name:** ________________________________
(e.g., "Feature adoption 60% below target")

**Evidence:**
- Metric: __________________________ (e.g., "adoption_rate")
- Target: _________ | Actual: _________ | Gap: _________
- Duration observed: ________ (days/weeks)

**Cost calculation:**
- Weekly waste: $________ (team capacity burned on wrong thing)
- Weeks until scheduled AIM: ________ (from Step 1)
- **Total potential waste: $________ (weekly × weeks remaining)**

**Confidence:**
- [ ] High (80%+ certain this is waste)
- [ ] Medium (50-80% certain)
- [ ] Low (< 50% certain)

---

### Common Waste Signals (use as checklist):

**Feature-level signals:**
- [ ] **Adoption below target** (users aren't using feature)
  * Weekly waste = (dev capacity on feature) / (adoption rate)
  * Example: 2 devs @ $10K/week, 20% adoption = $8K/week waste
  
- [ ] **Churn spike** (users leaving after feature launch)
  * Weekly waste = (dev capacity) + (lost revenue)
  * Example: 1 dev @ $5K/week + $3K MRR churn = $8K/week
  
- [ ] **Performance degradation** (feature slowing product)
  * Weekly waste = (dev capacity fixing bugs) + (opportunity cost)
  * Example: 1 dev @ $5K/week + $5K/week in lost deals = $10K/week

**Strategic signals:**
- [ ] **Market shift** (competitor pivot, regulatory change)
  * Weekly waste = (team building for wrong market)
  * Example: 5 devs @ $25K/week building B2C when market went B2B = $25K/week
  
- [ ] **Velocity decline** (team slowing down, maybe wrong architecture)
  * Weekly waste = (lost productivity)
  * Example: Team was 30 pts/week, now 15 pts/week = $12K/week at $400/pt

**Cross-team signals (Level 3):**
- [ ] **Dependency failure** (Team A blocked by Team B)
  * Weekly waste = (blocked team capacity)
  * Example: 3 devs @ $15K/week waiting for platform API = $15K/week

---

## Step 3: ROI Calculation

**Sum all potential waste signals:**
- Signal 1 waste: $________
- Signal 2 waste: $________
- Signal 3 waste: $________
- **Total potential waste: $________**

**Compare to AIM cost:**
- Total potential waste: $________ (A)
- AIM cost: $________ (B, from Step 1)
- **ROI: ________ (A ÷ B)**

**ROI interpretation:**
- **ROI < 5x:** Probably wait for scheduled AIM (low ROI, high uncertainty)
- **ROI 5-10x:** Consider triggering if confidence is high
- **ROI 10-20x:** Strong case for immediate AIM
- **ROI > 20x:** Trigger immediately (economically irrational to wait)

---

## Step 4: Assumption Check

**If any critical assumption failed, AIM is urgent regardless of ROI:**

Review your `aim_trigger_config.yaml` → `critical_assumptions`:

For each critical assumption:

**Assumption ID:** ________
**Assumption text:** ___________________________________________

**Test result:**
- [ ] Validated (evidence supports assumption)
- [ ] Inconclusive (not enough data)
- [ ] **Invalidated** (evidence contradicts assumption) ← URGENT

**If invalidated:**
- Criticality: [ ] Critical (immediate AIM) | [ ] High (AIM within 1 week) | [ ] Medium (quarterly)
- Downstream impact: ____________________________________
  (What features/roadmap items depend on this assumption?)

**Critical or High + Invalidated = Trigger AIM immediately, regardless of ROI**

---

## Step 5: Opportunity Assessment

**If unexpected high-value signal emerged:**

**Opportunity description:**
____________________________________________________________
(e.g., "Feature built for use case A, but 80% of users using for case B which is 5x larger market")

**Impact multiplier:** ________ (how much bigger is opportunity vs. current plan?)
- 2-5x: Incremental improvement
- 5-10x: Major pivot potential
- 10x+: Company-defining opportunity

**Confidence:**
- [ ] High (80%+ certain this is real)
- [ ] Medium (50-80% certain)
- [ ] Low (<50% certain, need more data)

**Time sensitivity:**
- [ ] Window closing (competitor will copy, market will shift)
- [ ] Stable (opportunity will persist for months)
- [ ] Unclear

**Decision:**
- **Impact 10x+ AND High confidence:** Trigger AIM immediately (strategic pivot potential)
- **Impact 5-10x AND High confidence:** Trigger AIM within 1 week
- **Impact 2-5x OR Medium confidence:** Wait for scheduled AIM, gather more evidence

---

## Step 6: Decision Matrix

Use this matrix to make final decision:

| Condition | Action | Timeline |
|-----------|--------|----------|
| **ROI > 20x** OR **Critical assumption failed** | **TRIGGER AIM** | Within 24-48 hours |
| **ROI 10-20x** OR **Opportunity 10x+ with high confidence** | **TRIGGER AIM** | Within 3-5 days |
| **ROI 5-10x** AND **High confidence waste** | **Consider triggering** | Within 1 week |
| **ROI < 5x** AND **No critical failures** | **Wait for scheduled AIM** | Quarterly (normal) |

**Your situation:**
- ROI: ________ (from Step 3)
- Critical assumption failed: [ ] Yes [ ] No
- Opportunity multiplier: ________ (from Step 5)
- Confidence: [ ] High [ ] Medium [ ] Low

**Recommended action:** ______________________________

---

## Step 7: Trigger Decision Documentation

**If you decide to TRIGGER immediate AIM:**

Document in git commit:
```
AIM triggered (off-cycle): [REASON]

Trigger type: [roi_threshold / assumption_invalidation / opportunity / dependency_failure]
ROI calculation: $[WASTE] potential waste vs $[COST] AIM cost = [X]x ROI
Critical assumption: [ID if applicable]
Opportunity: [Description if applicable]

Evidence:
- [Signal 1]: [Metric], [Gap], [Waste calculation]
- [Signal 2]: [Metric], [Gap], [Waste calculation]

Decision: Run AIM immediately, expected to save $[WASTE] by catching issue [X] weeks early.

Next scheduled AIM: [DATE] (unchanged)
```

**If you decide to WAIT for scheduled AIM:**

Document monitoring result:
```
AIM trigger assessment: Continue to scheduled AIM

Signals reviewed:
- [Signal 1]: [Metric], gap acceptable
- [Signal 2]: [Metric], monitoring

ROI calculation: $[WASTE] potential waste vs $[COST] AIM cost = [X]x ROI (below 5x threshold)
Decision: Wait for scheduled AIM on [DATE], waste level doesn't justify immediate recalibration

Action: Continue monitoring weekly
```

---

## Step 8: Run AIM Session (if triggered)

If you triggered immediate AIM, proceed with standard AIM workflow:

1. **Assessment phase** (1-2 hours):
   - Synthesizer ingests recent data (metrics, feedback, assumption tests)
   - Generate `assessment_report.yaml` documenting:
     * What happened since last AIM
     * Which assumptions validated/invalidated
     * OKR progress (if in-quarter)
     * Evidence for waste signals

2. **Calibration phase** (1-2 hours):
   - Team discusses: Persevere, pivot, or pull-the-plug?
   - Generate `calibration_memo.yaml` documenting:
     * Decision (continue / adjust / stop)
     * Rationale (evidence supporting decision)
     * Roadmap adjustments (if any)
     * Updated assumptions

3. **Roadmap update** (30-60 min):
   - Update `05_roadmap_recipe.yaml` with calibration decisions
   - Update feature priorities if needed
   - Document strategic shift in git history

4. **Communicate** (30 min):
   - Share calibration memo with team
   - Update stakeholders on strategic shift
   - Document lessons learned

**Total time: 3-5 hours (Level 1-2), 6-10 hours (Level 3 with cross-team)**

**ROI validation:**
- Waste avoided: $________ (from Step 3)
- AIM cost: $________ (actual time spent)
- Actual ROI: ________ (waste avoided ÷ cost)

---

## Adoption Level Guidance

**Level 0 (Solo Founder):**
- Use this wizard when you feel "something's off"
- Keep it lightweight: Steps 1-3 only (10 minutes)
- Trigger threshold: ROI > 10x (more aggressive, lower overhead)
- AIM response: 90-minute quick recalibration (not full formal process)

**Level 1 (Small Team):**
- Use this wizard weekly (10-15 minutes)
- Full assessment: Steps 1-6
- Trigger threshold: ROI > 10-20x
- AIM response: 2-3 hours (lightweight assessment + calibration)

**Level 2 (Growing Startup):**
- Use this wizard weekly (15-30 minutes)
- Full assessment including cross-track impacts
- Trigger threshold: ROI > 20x (more conservative, higher coordination cost)
- AIM response: 4-6 hours (full assessment, cross-functional calibration)

**Level 3 (Product Org):**
- Automate monitoring via probe (future capability)
- Product leader reviews probe output weekly (15 minutes)
- This wizard used when probe flags potential trigger
- Trigger threshold: ROI > 20-30x per team
- AIM response: 6-10 hours (multi-team coordination, portfolio-level calibration)

---

## Future Automation (Probe-Based)

**Vision (Level 2-3):**

Instead of manual weekly checks, Synthesizer runs automated probe:

**Input:**
- Analytics data (adoption, engagement, retention)
- Assumption test results (from RATs)
- Cross-team dependency status
- Support ticket themes
- Sales pipeline signals

**Process:**
- AI calculates waste signals automatically
- Computes ROI for immediate AIM vs. waiting
- Flags when ROI > threshold

**Output (weekly probe report):**
```
AIM Trigger Probe Report - Week of [DATE]

Status: CONTINUE / INVESTIGATE / TRIGGER_AIM

Signals monitored:
- Feature adoption: 65% of target (↓ from 75% last week)
- Velocity: 22 pts/week (stable)
- NPS: 38 (↑ from 35)
- Assumption tests: 2 pending, 0 failed

Potential waste calculation:
- Adoption gap: $3K/week × 8 weeks = $24K
- ROI if AIM now: $24K / $600 = 40x

Recommendation: TRIGGER_AIM (ROI > 20x threshold)
Confidence: High (multiple data sources confirm adoption issue)

Suggested AIM focus:
1. Investigate adoption barriers (user feedback shows confusion)
2. Evaluate pivot to simpler onboarding flow
3. Consider pull-the-plug if <30% adoption after 2 more weeks
```

**Product leader action:** Review report (15 min), approve/decline trigger

This reduces weekly monitoring from 30 minutes (manual) to 15 minutes (review probe output).

---

## Key Takeaway

**Traditional approach:** Wait for quarterly retro, might be building wrong thing for 8-10 weeks

**EPF approach:** Run this wizard weekly (10-30 min). If ROI > threshold, trigger AIM immediately. Catch mistakes early, save $20K-$100K+ per cycle.

**Economic logic:** AIM costs $300-$1,500 depending on level. Wrong direction costs $5K-$50K+ per week. **Trigger when savings > cost**, regardless of calendar.

**Calendar is fallback, not driver.** Data should drive AIM timing, with quarterly as minimum cadence.
