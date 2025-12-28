# EPF Track Balance & Portfolio Viability Analysis

**Date:** 2025-12-28  
**EPF Version:** 2.0.0  
**Analyst:** AI Assistant  
**Issue Raised By:** User (nikolai)

---

## Problem Statement

**User's Observation:**
> "EPF is a braided model in the sense that in the FIRE phase, where investments into value generation is actually happening, there is an interconnection and mutual contribution between the activities and investments in each track. Having more short term ambitious goals than your financing and organization can deliver makes no sense for example. So it is important that those 4 tracks are well balanced. Right now I don't think we have any process for evaluating and balancing this?"

**Core Issue:** EPF currently lacks a **portfolio viability assessment mechanism** to ensure the 4 tracks (Product, Strategy, OrgOps, Commercial) are:
1. **Mutually supportive** (not pulling in conflicting directions)
2. **Resource-balanced** (ambitions match available capacity/funding)
3. **Sequentially coherent** (dependencies properly ordered)
4. **Strategically aligned** (all tracks serve the same north star)

---

## Current State Analysis

### What EPF Has Today

#### 1. Track Structure ✅
- **Location:** `05_roadmap_recipe.yaml`
- **Structure:** 4 parallel tracks with independent OKRs
- **Alignment:** Each track aligns with corresponding value model

#### 2. Cross-Track Dependencies ✅
- **Location:** `roadmap.cross_track_dependencies[]`
- **Format:** KR → KR dependencies with types (requires/informs/enables)
- **Purpose:** Express sequencing constraints between tracks

Example:
```yaml
cross_track_dependencies:
  - from_kr: "kr-p-001"        # Product prototype
    to_kr: "kr-c-001"          # Commercial validation
    dependency_type: "requires"
    description: "Commercial needs prototype for demos"
```

#### 3. Post-Cycle Assessment ✅
- **Location:** `assessment_report.yaml` (AIM phase)
- **Coverage:** Track-by-track OKR assessment
- **Insights:** "Cross-track dependencies that created value or friction"

### What EPF Lacks Today ❌

#### 1. **Pre-Cycle Viability Assessment**
- No mechanism to evaluate **BEFORE committing** to a roadmap
- Can't answer: "Is this roadmap actually achievable given our constraints?"
- Risk: Teams commit to infeasible plans, discover late in cycle

#### 2. **Resource Constraint Modeling**
- No way to express: "We have 5 engineers, €200K budget, 12 weeks"
- No validation that ambitions fit within constraints
- Risk: Over-commitment leading to partial delivery across all tracks

#### 3. **Balanced Portfolio Guidance**
- No assessment of whether 4 tracks are "braided" effectively
- Can't detect: "Product track has 10 KRs, Strategy has 1 KR" (imbalanced)
- Risk: Some tracks over-invested, others neglected

#### 4. **Conflict Detection**
- No validation that tracks aren't pulling in opposite directions
- Can't detect: "Product KR requires fast MVP, OrgOps KR requires 6-month hiring plan"
- Risk: Internal contradictions discovered late

#### 5. **Iterative Balancing Workflow**
- No process for adjusting roadmap based on viability feedback
- Current: Create roadmap → Execute → Assess (linear, no pre-flight check)
- Missing: Create roadmap → **Balance Check** → Adjust → Execute → Assess

---

## Gap Analysis

### Critical Gaps

| Gap | Impact | Severity |
|-----|--------|----------|
| **No pre-cycle viability check** | Teams commit to infeasible plans | HIGH |
| **No resource constraint modeling** | Ambitions exceed capacity | HIGH |
| **No portfolio balance assessment** | Imbalanced investment across tracks | MEDIUM |
| **No conflict detection** | Contradictory goals discovered late | MEDIUM |
| **No iterative refinement process** | One-shot planning with no feedback loop | MEDIUM |

### Why This Matters

**EPF's "Braided Model" Philosophy:**
- Product can't succeed without Strategy (market positioning)
- Strategy can't succeed without Commercial (revenue validation)
- Commercial can't succeed without Product (actual offering)
- OrgOps can't succeed without all three (nothing to operate)

**Without balance checking:**
- Product team builds features nobody can sell (Commercial underfunded)
- Strategy team creates market position nobody can deliver (Product underfunded)
- Commercial team validates demand nobody can support (OrgOps underfunded)
- OrgOps team builds processes for products that don't exist (Product behind schedule)

**Current Process Risk:**
```
READY Phase (Weeks 1-2)
├── Create roadmap with 4 tracks
├── Set ambitious OKRs per track
└── Commit to execution

FIRE Phase (Weeks 3-14)
├── Execute in parallel
├── Discover conflicts (week 5)
├── Discover resource constraints (week 7)
├── Discover dependencies (week 9)
└── Partial delivery across all tracks

AIM Phase (Week 15)
└── Assess: "Tracks were imbalanced, had conflicts, exceeded capacity"
```

**Desired Process:**
```
READY Phase (Weeks 1-3) ← Extended to allow balancing
├── Create initial roadmap (week 1)
├── **Balance Check** (week 2)
│   ├── Viability assessment
│   ├── Conflict detection
│   ├── Resource validation
│   └── Portfolio balance review
├── Adjust roadmap based on feedback
└── Commit to balanced, viable plan

FIRE Phase (Weeks 4-15)
└── Execute with confidence (fewer surprises)

AIM Phase (Week 16)
└── Assess: "Balanced plan executed well" (or pivoted intentionally)
```

---

## Proposed Solution

### AI-Powered Balance Assessment Wizard

**Name:** `balance_checker.agent_prompt.md`

**Location:** `wizards/balance_checker.agent_prompt.md`

**Purpose:** Interactive AI agent that evaluates roadmap viability across all 4 tracks and guides iterative balancing.

### Wizard Responsibilities

#### 1. Resource Constraint Validation
- **Input:** Team size, budget, timeframe, skills inventory
- **Analysis:** Calculate total "capacity points" available
- **Check:** Do KRs across all tracks fit within capacity?
- **Output:** "Your 4 tracks require 150 capacity points, you have 100" (OVER-COMMITTED)

#### 2. Track Balance Assessment
- **Input:** OKRs across all 4 tracks
- **Analysis:** Compare investment levels (# of KRs, complexity, dependencies)
- **Check:** Is one track significantly under/over-invested?
- **Output:** "Product: 8 KRs, Strategy: 1 KR, OrgOps: 2 KRs, Commercial: 1 KR" (IMBALANCED)

#### 3. Cross-Track Conflict Detection
- **Input:** OKRs + cross_track_dependencies
- **Analysis:** Check for contradictory goals or impossible sequences
- **Check:** Do any KRs conflict in timing, resources, or intent?
- **Output:** "kr-p-001 (fast MVP) conflicts with kr-o-001 (6-month hiring plan)"

#### 4. Dependency Coherence Check
- **Input:** cross_track_dependencies[] array
- **Analysis:** Build dependency graph, check for cycles or bottlenecks
- **Check:** Is critical path achievable within timeframe?
- **Output:** "Critical path: Product → Commercial → Strategy = 16 weeks (exceeds 12-week cycle)"

#### 5. Strategic Alignment Verification
- **Input:** OKRs across tracks + north_star.yaml
- **Analysis:** Check that all tracks serve the same strategic vision
- **Check:** Are tracks pulling toward the same goal?
- **Output:** "Product focuses on SMB, Commercial targets enterprise (MISALIGNED)"

### Wizard Workflow

```
┌─────────────────────────────────────────────────┐
│ STEP 1: Gather Context                          │
├─────────────────────────────────────────────────┤
│ - Read 05_roadmap_recipe.yaml (4 tracks)        │
│ - Read 00_north_star.yaml (strategic anchor)    │
│ - Ask user: Team size, budget, timeframe        │
│ - Ask user: Known constraints (hiring freeze,   │
│   budget cuts, key dependencies)                │
└─────────────────────────────────────────────────┘
                    ⬇
┌─────────────────────────────────────────────────┐
│ STEP 2: Resource Analysis                       │
├─────────────────────────────────────────────────┤
│ - Calculate capacity per track                  │
│ - Compare to KR requirements                    │
│ - Flag over/under-allocation                    │
│ - **Output:** Resource viability score (0-100)  │
└─────────────────────────────────────────────────┘
                    ⬇
┌─────────────────────────────────────────────────┐
│ STEP 3: Balance Assessment                      │
├─────────────────────────────────────────────────┤
│ - Count KRs per track                           │
│ - Assess complexity per track                   │
│ - Check for "ghost tracks" (underfunded)        │
│ - **Output:** Portfolio balance score (0-100)   │
└─────────────────────────────────────────────────┘
                    ⬇
┌─────────────────────────────────────────────────┐
│ STEP 4: Conflict Detection                      │
├─────────────────────────────────────────────────┤
│ - Parse all OKRs for contradictions             │
│ - Check dependency graph for cycles             │
│ - Validate sequencing against timeframe         │
│ - **Output:** Coherence score (0-100)           │
└─────────────────────────────────────────────────┘
                    ⬇
┌─────────────────────────────────────────────────┐
│ STEP 5: Strategic Alignment Check               │
├─────────────────────────────────────────────────┤
│ - Compare OKRs to north star                    │
│ - Check for directional consistency             │
│ - Flag competing priorities                     │
│ - **Output:** Alignment score (0-100)           │
└─────────────────────────────────────────────────┘
                    ⬇
┌─────────────────────────────────────────────────┐
│ STEP 6: Generate Balance Report                 │
├─────────────────────────────────────────────────┤
│ OVERALL VIABILITY: 65/100 (NEEDS WORK)          │
│                                                  │
│ ✓ Strategic Alignment: 85/100 (GOOD)            │
│ ⚠ Resource Viability: 45/100 (OVER-COMMITTED)   │
│ ⚠ Portfolio Balance: 60/100 (PRODUCT-HEAVY)     │
│ ✗ Coherence: 50/100 (DEPENDENCY CONFLICTS)      │
│                                                  │
│ CRITICAL ISSUES:                                 │
│ 1. Over-committed by 50 capacity points          │
│ 2. Product track has 8 KRs, Strategy has 1      │
│ 3. Circular dependency: kr-p-003 ↔ kr-c-002      │
│                                                  │
│ RECOMMENDATIONS:                                 │
│ 1. Reduce Product KRs from 8 to 5               │
│ 2. Add 2 Strategy KRs to balance portfolio      │
│ 3. Break circular dependency (make kr-p-003     │
│    inform kr-c-002 instead of require)          │
│ 4. Extend timeframe from 12 to 14 weeks OR      │
│    reduce scope by 30%                          │
└─────────────────────────────────────────────────┘
                    ⬇
┌─────────────────────────────────────────────────┐
│ STEP 7: Iterative Refinement                    │
├─────────────────────────────────────────────────┤
│ - User adjusts roadmap based on feedback        │
│ - Re-run balance check                          │
│ - Iterate until viability score > 75            │
│ - **Output:** Balanced roadmap ready for FIRE   │
└─────────────────────────────────────────────────┘
```

### Example Balance Report Output

```yaml
# balance_assessment.yaml (ephemeral artifact, not tracked in EPF)
roadmap_id: "roadmap-001"
assessment_date: "2025-12-28"

overall_viability_score: 65 # 0-100 (75+ recommended for execution)
status: "needs_balancing" # viable, needs_balancing, not_viable

scores:
  resource_viability: 45    # Capacity vs requirements
  portfolio_balance: 60     # Investment distribution across tracks
  coherence: 50             # Dependencies and conflicts
  strategic_alignment: 85   # Alignment with north star

resource_analysis:
  total_capacity_points: 100
  required_capacity_points: 150
  over_commitment: 50 # 50% over capacity
  
  by_track:
    product:
      krs: 8
      estimated_capacity: 60
      available_capacity: 40
      status: "over_committed"
    strategy:
      krs: 1
      estimated_capacity: 10
      available_capacity: 20
      status: "under_utilized"
    org_ops:
      krs: 2
      estimated_capacity: 20
      available_capacity: 20
      status: "balanced"
    commercial:
      krs: 1
      estimated_capacity: 10
      available_capacity: 20
      status: "under_utilized"

balance_assessment:
  status: "imbalanced"
  issues:
    - type: "track_imbalance"
      severity: "medium"
      description: "Product track has 8 KRs (67% of total), Strategy has 1 KR (8%)"
      recommendation: "Redistribute: Product 5 KRs, Strategy 3 KRs, OrgOps 2 KRs, Commercial 2 KRs"

conflict_detection:
  status: "conflicts_found"
  issues:
    - type: "circular_dependency"
      severity: "high"
      description: "kr-p-003 requires kr-c-002, but kr-c-002 requires kr-p-003"
      recommendation: "Change kr-p-003 → kr-c-002 from 'requires' to 'informs'"
    
    - type: "timing_conflict"
      severity: "medium"
      description: "kr-p-001 (fast MVP, 2 weeks) conflicts with kr-o-001 (6-month hiring plan)"
      recommendation: "Either: (1) Accept MVP with current team, (2) Delay MVP until hiring complete"

critical_path_analysis:
  longest_path_weeks: 16
  cycle_timeframe_weeks: 12
  status: "exceeds_timeframe"
  recommendation: "Reduce scope by 25% OR extend timeframe to 16 weeks"

recommendations:
  priority_high:
    - "Reduce Product KRs from 8 to 5 (remove lowest-priority)"
    - "Break circular dependency: kr-p-003 ↔ kr-c-002"
    - "Extend timeframe from 12 to 14 weeks"
  
  priority_medium:
    - "Add 2 Strategy KRs to balance portfolio"
    - "Add 1 Commercial KR to balance portfolio"
    - "Resolve timing conflict between kr-p-001 and kr-o-001"
  
  priority_low:
    - "Consider adding risk mitigation KRs in OrgOps track"

next_steps:
  - "Revise roadmap based on recommendations"
  - "Re-run balance assessment"
  - "Target viability score > 75 before committing to FIRE phase"
```

---

## Implementation Plan

### Phase 1: Create Balance Checker Wizard (3-4 hours)

#### Deliverables:
1. **`wizards/balance_checker.agent_prompt.md`** (AI agent prompt)
   - Context gathering instructions
   - Analysis algorithms (capacity calc, balance scoring, conflict detection)
   - Report generation template
   - Iterative refinement workflow

2. **`templates/READY/balance_assessment.yaml`** (optional output artifact)
   - Structure for balance report
   - Not required by EPF (ephemeral artifact)
   - Useful for documentation and iteration tracking

3. **Update `README.md`** - Add balance checking to READY phase workflow

4. **Update `.ai-agent-instructions.md`** - Add balance checking to consistency protocol

#### Wizard Sections:

**Section 1: Role & Mission**
```markdown
You are the Balance Checker - an AI agent that evaluates roadmap viability 
across EPF's 4 tracks (Product, Strategy, OrgOps, Commercial). Your mission 
is to ensure the roadmap is:
1. Resource-viable (ambitions match capacity)
2. Portfolio-balanced (tracks are mutually supportive)
3. Conflict-free (no contradictory goals)
4. Strategically aligned (all tracks serve north star)
```

**Section 2: Context Gathering**
- Read roadmap_recipe.yaml (all 4 tracks)
- Read north_star.yaml (strategic anchor)
- Ask user: Team size, budget, timeframe, constraints
- Ask user: Known risks (hiring freeze, budget cuts, dependencies)

**Section 3: Analysis Algorithms**
- **Resource Viability:** Capacity points calculation methodology
- **Portfolio Balance:** KR distribution scoring (ideal: 30/30/20/20 split)
- **Conflict Detection:** Dependency graph analysis, timing checks
- **Strategic Alignment:** OKR ↔ north star consistency checks

**Section 4: Report Generation**
- Overall viability score (0-100)
- Per-track analysis
- Critical issues list
- Prioritized recommendations
- Next steps

**Section 5: Iterative Refinement**
- Workflow for adjusting roadmap
- Re-running assessment
- Convergence criteria (viability > 75)

### Phase 2: Validation & Testing (1-2 hours)

1. **Create test roadmap** with known imbalances
2. **Run balance checker** to verify it catches issues
3. **Iterate on scoring algorithms** based on real data
4. **Document examples** in wizard prompt

### Phase 3: Integration (1 hour)

1. **Update READY phase workflow** in README.md:
   ```
   READY Phase
   ├── INSIGHT Sub-phase (Week 1)
   ├── STRATEGY Sub-phase (Week 2)
   └── ROADMAP Sub-phase (Weeks 3-4) ← EXTENDED
       ├── Create initial roadmap (Week 3)
       ├── Balance assessment (Week 3-4)
       ├── Iterative refinement (Week 4)
       └── Commit to FIRE (End Week 4)
   ```

2. **Add to consistency protocol** (.ai-agent-instructions.md):
   - STEP 3: Add "Run balance check before FIRE phase"
   - Validate viability score > 75 before committing

3. **Update Pathfinder wizard** to mention balance checking:
   ```markdown
   After creating roadmap, use balance_checker.agent_prompt.md to 
   validate viability before committing to FIRE phase.
   ```

---

## Expected Impact

### Positive Outcomes

| Outcome | Impact | Measurement |
|---------|--------|-------------|
| **Reduced over-commitment** | Teams commit to achievable plans | Fewer "partially met" KRs |
| **Better resource allocation** | Capacity matches ambitions | Higher completion rates |
| **Balanced portfolio** | All 4 tracks get appropriate investment | More even track distribution |
| **Early conflict detection** | Contradictions caught before execution | Fewer mid-cycle pivots |
| **Higher confidence** | Teams trust the plan | Less stress, better morale |

### Risk Mitigation

| Risk | Current State | After Balance Checker |
|------|---------------|----------------------|
| Over-commitment | Discovered in FIRE phase (week 7) | Caught in READY phase (week 3) |
| Imbalanced tracks | Discovered in AIM phase assessment | Prevented before execution |
| Circular dependencies | Cause execution stalls | Detected and fixed upfront |
| Resource conflicts | Multiple teams fight for same capacity | Allocated explicitly |
| Strategic drift | Tracks pursue conflicting goals | Alignment verified |

### Adoption Strategy

**Phase 1 (Weeks 1-4): Optional Tool**
- Introduce as optional wizard
- Use in 2-3 cycles to gather feedback
- Refine scoring algorithms

**Phase 2 (Weeks 5-8): Recommended Practice**
- Add to README.md as recommended step
- Document success stories
- Create video tutorial

**Phase 3 (Weeks 9-12): Required Protocol**
- Add to consistency protocol
- Enforce viability score > 75 before FIRE
- Track adoption metrics

---

## Alternative Approaches Considered

### Alternative 1: Manual Checklist
- **Pro:** Simple, no AI needed
- **Con:** Subjective, no scoring, easy to skip
- **Verdict:** Not sufficient for complex multi-track balancing

### Alternative 2: Automated Validation Script
- **Pro:** Fast, consistent, scriptable
- **Con:** Can't handle qualitative factors (strategic alignment, team dynamics)
- **Verdict:** Good for dependency checks, insufficient for balance assessment

### Alternative 3: Post-Cycle Assessment Only
- **Pro:** Uses existing AIM phase, no new process
- **Con:** Too late (after execution), can't prevent over-commitment
- **Verdict:** Necessary but not sufficient (need pre-cycle check)

### Alternative 4: Separate Balance Document
- **Pro:** Keeps roadmap lean
- **Con:** Yet another artifact to maintain, may diverge from roadmap
- **Verdict:** Balance assessment should be ephemeral (wizard output, not tracked)

**Chosen Approach:** AI-powered wizard with iterative refinement
- **Why:** Balances automation (scoring) with human judgment (context)
- **Why:** Interactive dialogue addresses qualitative factors
- **Why:** Iterative refinement allows experimentation
- **Why:** Ephemeral artifact (no maintenance burden)

---

## Open Questions

1. **Should balance_assessment.yaml be tracked in git?**
   - **Pro:** Creates audit trail of balancing iterations
   - **Con:** Adds maintenance burden (yet another artifact)
   - **Recommendation:** NO - keep ephemeral (wizard outputs to stdout/markdown)

2. **What's the ideal viability threshold?**
   - **Recommendation:** 75+ for execution, 85+ for high-confidence plans
   - **Rationale:** Allows some flexibility, not overly rigid

3. **Should balance checking be required or optional?**
   - **Recommendation:** Start optional (Phases 1-2), make required after validation (Phase 3)
   - **Rationale:** Need real-world feedback before enforcing

4. **How to handle emergency pivots mid-cycle?**
   - **Recommendation:** Re-run balance checker when roadmap changes significantly
   - **Rationale:** Ensure pivots are viable, not just reactive

5. **Should balance checker integrate with spec-driven tools?**
   - **Recommendation:** Future enhancement (Phase 2+)
   - **Rationale:** Start with EPF-native solution, integrate later if needed

---

## Recommendation

**PROCEED WITH IMPLEMENTATION:**

✅ **High Value:** Addresses critical gap in EPF's READY phase  
✅ **Low Risk:** Additive change (no breaking changes to existing artifacts)  
✅ **Natural Fit:** Aligns with EPF's AI-agent-assisted philosophy  
✅ **Iterative:** Can refine based on real-world usage  
✅ **User-Validated:** Addresses user's direct observation of framework gap  

**Next Steps:**
1. User approval of approach
2. Create `wizards/balance_checker.agent_prompt.md` (3-4 hours)
3. Test with EPF's own roadmap (1 hour)
4. Integrate into documentation (1 hour)
5. Deploy and gather feedback (2-3 cycles)

---

## Appendix: Example Balance Scenarios

### Scenario 1: Over-Committed Product Track
**Symptom:** 10 Product KRs, 1 Strategy KR, 1 OrgOps KR, 1 Commercial KR  
**Analysis:** 77% of capacity allocated to Product, other tracks neglected  
**Recommendation:** Redistribute to 5/3/2/3 split  
**Root Cause:** Product team excited, other tracks under-resourced

### Scenario 2: Circular Dependency
**Symptom:** kr-p-001 requires kr-c-001, kr-c-001 requires kr-p-001  
**Analysis:** Impossible to sequence, will cause stall  
**Recommendation:** Change one to "informs" instead of "requires"  
**Root Cause:** Unclear handoff points between tracks

### Scenario 3: Timeline Mismatch
**Symptom:** 20 KRs total, 12-week cycle, critical path = 18 weeks  
**Analysis:** Exceeds timeframe by 50%  
**Recommendation:** Reduce scope to 12 KRs OR extend to 18 weeks  
**Root Cause:** Ambition exceeds realistic capacity

### Scenario 4: Strategic Misalignment
**Symptom:** Product targets SMB, Commercial targets Enterprise  
**Analysis:** Contradictory customer segments  
**Recommendation:** Align on single segment OR split into 2 roadmaps  
**Root Cause:** Lack of clarity in north star

### Scenario 5: Ghost Track
**Symptom:** OrgOps has 0 KRs, but other tracks depend on hiring/process changes  
**Analysis:** Critical enabler track is unfunded  
**Recommendation:** Add 2-3 OrgOps KRs to support other tracks  
**Root Cause:** Operational work seen as "not strategic"

---

**End of Analysis**
