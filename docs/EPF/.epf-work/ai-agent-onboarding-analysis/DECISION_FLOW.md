# AI Agent Decision Flow with EPF

```
┌─────────────────────────────────────────────────────────────────┐
│  User adds EPF to product repo (git subtree add ...)           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  User asks: "Help me get started with EPF"                     │
│             "Create a roadmap"                                  │
│             "Document our strategy"                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  AI Agent searches workspace for context                        │
│  - Semantic search: "getting started", "EPF", "onboarding"     │
│  - File search: README.md, .github/*, docs/*                   │
│  ✨ NEW: Discovers `.ai-agent-first-contact.md`               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: Location Check (CRITICAL)                             │
│                                                                 │
│  Agent runs: pwd                                                │
│  ├─ /path/to/epf (canonical)                                   │
│  │  └─> ❌ STOP! Read CANONICAL_PURITY_RULES.md               │
│  │      Never create instances here!                           │
│  │                                                              │
│  └─ /path/to/product/docs/EPF (product repo)                  │
│     └─> ✅ Correct! Continue to Step 2                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: User Intent Routing                                   │
│                                                                 │
│  Match user request to action:                                  │
│                                                                 │
│  "Get started"                                                  │
│  ├─> Ask: "How many people?"                                   │
│  │   ├─ 1-2: Level 0 (North Star, 2hrs)                       │
│  │   ├─ 3-5: Level 1 (Evidence+Roadmap, 4-6hrs)               │
│  │   ├─ 6-15: Level 2 (Full value models)                     │
│  │   └─ 15+: Level 3 (Governance)                             │
│  │                                                              │
│  "Create roadmap"                                               │
│  ├─> Check: Does North Star exist?                             │
│  │   ├─ NO: Start with North Star first                       │
│  │   └─ YES: Proceed to roadmap wizard                        │
│  │                                                              │
│  "Create features"                                              │
│  ├─> Check: How many features?                                 │
│  │   ├─ 1-5: Lightweight (lean_start Step 5)                  │
│  │   └─ 6+: Full feature wizard                               │
│  │                                                              │
│  "Validate work"                                                │
│  └─> Run validation scripts in order                           │
│      (health check → instance → content quality)               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: Pre-Generation Checklist (MANDATORY)                  │
│                                                                 │
│  Before generating ANY artifact:                                │
│  ☐ Location: In product repo? (not canonical)                  │
│  ☐ Schema: Read schemas/{artifact}_schema.json?                │
│  ☐ Example: Read validated example artifact?                   │
│  ☐ Wizard: Consulted appropriate wizard?                       │
│  ☐ Memory: Generating from schema (NOT training data)?         │
│                                                                 │
│  ❌ If any unchecked → STOP, complete checklist first          │
│  ✅ All checked → Proceed to generation                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: Follow Wizard Instructions                            │
│                                                                 │
│  For Level 0-1 (most common):                                   │
│  → wizards/lean_start.agent_prompt.md                          │
│     ├─ Step 1: North Star (5 questions, 2hrs)                 │
│     ├─ Step 2: Evidence (if Level 1, 1-2hrs)                  │
│     ├─ Step 3: Roadmap (if Level 1, 1-2hrs)                   │
│     └─ Step 4-5: Value model + Features (if Level 1, 1-2hrs)  │
│                                                                 │
│  Wizard provides:                                               │
│  - Exact questions to ask user                                  │
│  - YAML generation templates                                    │
│  - Validation commands                                          │
│  - Time estimates                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: Generate Artifacts (Schema-First)                     │
│                                                                 │
│  Process:                                                       │
│  1. Read schema: schemas/north_star_schema.json                │
│  2. Read example: (if available)                               │
│  3. Follow wizard prompts                                       │
│  4. Generate YAML using schema as template                      │
│  5. Save to: _instances/{product}/READY/00_north_star.yaml    │
│                                                                 │
│  ⚠️  CRITICAL: Use schema structure, NOT memory                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: Validate Before Committing (MANDATORY)                │
│                                                                 │
│  Run in order:                                                  │
│  1. ./scripts/epf-health-check.sh                              │
│     └─> Framework integrity, version consistency               │
│                                                                 │
│  2. ./scripts/validate-instance.sh _instances/{product}        │
│     └─> Structure, naming, metadata                            │
│                                                                 │
│  3. ./scripts/check-content-readiness.sh _instances/{product}  │
│     └─> Template detection, placeholder content                │
│                                                                 │
│  ❌ Validation fails → Fix issues, re-validate                 │
│  ✅ All pass → Ready to commit                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  SUCCESS: Valid EPF Artifacts Created ✅                       │
│                                                                 │
│  User can now:                                                  │
│  - Commit artifacts to git                                      │
│  - Start building MVP (reference North Star, Roadmap)          │
│  - Add team members (they read same artifacts)                 │
│  - Scale organically (add artifacts as complexity grows)       │
│                                                                 │
│  Time saved vs. traditional approach:                           │
│  - Level 0: ~25 mins per artifact (schema-first)               │
│  - Level 1: ~304-620 hours per year (AI-assisted)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Common Failure Paths (What We're Preventing)

### ❌ Failure Path 1: Generate from Memory

```
User: "Create a feature definition"
Agent: *doesn't read first-contact file*
      *generates from training data memory*
      *uses v1.x structure (outdated)*
Result: Schema validation fails
        User: "Why doesn't this work?"
        Wasted time: ~25 minutes
```

**✅ Prevention**: First-contact file → Pre-generation checklist → Schema-first mandate

---

### ❌ Failure Path 2: Wrong Location

```
User: "Create roadmap for twentyfirst product"
Agent: *in canonical EPF repo (/path/to/epf)*
       *creates: _instances/twentyfirst/READY/05_roadmap_recipe.yaml*
Result: Canonical repo pollution
        Purity rules violated
        User has to clean up + re-commit
```

**✅ Prevention**: First-contact file → Location check (Step 1) → STOP if canonical

---

### ❌ Failure Path 3: Skip Validation

```
User: "Create North Star"
Agent: *generates artifact*
       *doesn't validate*
       *commits directly*
Result: Invalid artifact in git history
        Discovered later when running health check
        Git history cleanup needed
```

**✅ Prevention**: First-contact file → Standard workflow → Validation before commit

---

### ❌ Failure Path 4: Wrong Wizard

```
User: "Help me get started" (solo founder)
Agent: *doesn't ask team size*
       *uses full Pathfinder wizard (Level 2-3)*
       *creates comprehensive artifacts*
Result: Analysis paralysis, 20+ hours wasted
        User overwhelmed, doesn't finish
```

**✅ Prevention**: First-contact file → User intent routing → Ask team size → Level 0

---

## Success Metrics Dashboard (Future)

```
┌─────────────────────────────────────────────────────────────────┐
│  EPF AI Agent Success Metrics                                   │
│  (Track in product repos with EPF)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📊 Time to First Valid Artifact                               │
│     Current: Unknown                                            │
│     Target:  <3 hours (Level 0)                                │
│     Status:  Need baseline data                                │
│                                                                 │
│  📊 Validation Error Rate (First Generation)                   │
│     Current: Unknown                                            │
│     Target:  <10%                                              │
│     Status:  Need baseline data                                │
│                                                                 │
│  📊 User Rework Cycles (per artifact)                          │
│     Current: Unknown (anecdotal: 1-2 cycles common)           │
│     Target:  ≤1 cycle                                          │
│     Status:  Need baseline data                                │
│                                                                 │
│  📊 Wizard Consultation Rate                                    │
│     Current: Unknown                                            │
│     Target:  90%+ of sessions                                  │
│     Status:  Need tracking mechanism                           │
│                                                                 │
│  📊 Schema-First Compliance                                     │
│     Current: Unknown                                            │
│     Target:  95%+ (read schema before generating)             │
│     Status:  Need tracking mechanism                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**How to measure (future work)**:
- Add telemetry to validation scripts (opt-in)
- Git log analysis (time between artifact creation and first commit)
- Session recordings with user permission
- Qualitative feedback from users

---

## Implementation Checklist

### Phase 1: Immediate ✅ DONE

- [x] Analyze current state (gap analysis)
- [x] Design solution (first-contact file structure)
- [x] Create `.ai-agent-first-contact.md`
- [x] Create analysis documentation
- [x] Create summary documentation
- [ ] **TODO: Test with real AI agents** ⭐ NEXT STEP
- [ ] **TODO: Enhance `.github/copilot-instructions.md`**
- [ ] **TODO: Create `scripts/epf-status.sh`**
- [ ] **TODO: Decide on version bump (MINOR vs PATCH)**
- [ ] **TODO: Commit to canonical EPF repo**

### Phase 2: Near-Term (After testing)

- [ ] Create `wizards/WIZARD_SELECTOR.md`
- [ ] Add AI guidance to schema description fields
- [ ] Comprehensive multi-agent testing
- [ ] Refine based on feedback

### Phase 3: Long-Term (Future)

- [ ] "Migrate Existing Product" workflow guide
- [ ] AI agent testing suite (automated)
- [ ] Interactive wizard selector CLI
- [ ] Telemetry for success metrics

---

## Questions for User Decision

1. **Version bump**: MINOR (2.4.0) or PATCH (2.3.4)?
   - MINOR: New feature (agent discovery system)
   - PATCH: Documentation improvement

2. **Testing approach**: Manual or automated first?
   - Manual: Use Copilot in test repo, observe behavior
   - Automated: Write test script that simulates agent queries

3. **Commit strategy**: Direct to main or PR?
   - Direct: Low risk, documentation change
   - PR: Get review, ensure quality

4. **Next priority**: Test first or enhance `.github/copilot-instructions.md`?
   - Test first: Validate solution works
   - Enhance first: Complete Phase 1 before testing

**Recommendation**: 
1. Manual testing first (validate solution)
2. MINOR version bump (2.4.0) - new capability
3. Direct to main (documentation, low risk)
4. Enhance copilot-instructions after testing confirms approach
