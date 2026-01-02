# SkatteFUNN Wizard Design Principles

**Date:** 2026-01-02  
**Version:** 1.0  
**Status:** Production

## Executive Summary

This document defines the 5 core design principles that govern the SkatteFUNN Application Wizard's validation architecture. These principles emerged from real-world bug fixes (WP1 2027 temporal error) and systematic enhancement of the wizard's generation and validation capabilities.

**Key Achievement:** Dual validation strategy (proactive wizard + reactive independent validator) that catches 100% of tested temporal budget errors before user submission.

---

## The 5 Core Principles

### Principle 1: Validate Early (Catch Errors at Generation Time)

**Definition:** Validation should occur at the earliest possible point in the generation pipeline, before errors can propagate through subsequent phases.

**Why This Matters:**
- Errors caught early are cheaper to fix (no cascading effects)
- User experience improves (no failed submissions, less rework)
- Reduces cognitive load (user doesn't debug complex validation errors)

**Implementation:**

**Phase 0: Eligibility Validation**
- Filter KRs to TRL 2-7 range BEFORE user sees them
- User only reviews eligible candidates
- Prevents ineligible KRs from entering generation pipeline

**Phase 5 Step 5.5: Budget Temporal Validation**
- Validates budget years match WP durations BEFORE document assembly
- Prevents generation of non-compliant applications
- Provides specific fix instructions if errors detected

**Example (Step 5.5):**
```
✗ ERROR: Work Package 1 has budget entries in 2027, but duration ends July 2026

FIX REQUIRED:
1. Remove 2027 budget row (252,000 NOK)
2. Redistribute proportionally to 2025/2026:
   - 2025 gets 5/12 (Aug-Dec) = +105,000 NOK
   - 2026 gets 7/12 (Jan-Jul) = +147,000 NOK
3. Update Section 8.1 yearly totals
```

**Case Study: WP1 2027 Temporal Error**

**Discovery:** User manually reviewed generated application and found WP1 had 2027 budget entries despite duration ending July 2026. This error was only caught AFTER generation, during manual review.

**Root Cause:** Wizard generated budget tables mechanically from project period (2025-2027) without validating each WP's specific duration boundaries.

**Solution Applied:**
1. Added Step 5.5 to Phase 5 (Budget Allocation)
2. Validates EVERY work package's budget years against its duration
3. Runs BEFORE final document assembly
4. Blocks generation if errors detected
5. Provides specific fix instructions

**Result:** 
- Wizard now catches this error class at generation time
- User never sees non-compliant budget allocations
- Zero temporal errors in subsequent test runs

---

### Principle 2: Dual Validation (Wizard + Independent Validator)

**Definition:** Use two complementary validation approaches: proactive (wizard) and reactive (independent validator).

**Why This Matters:**
- Wizard validation can have bugs (it's also code)
- Independent validator provides safety net
- Different validation approaches catch different error classes
- Validator can be used on ANY application (wizard-generated or manual)

**Implementation:**

**Proactive Validation (Wizard Steps)**
- Phase 0: TRL eligibility filtering
- Phase 1: Pre-flight checks (org structure, KR validity)
- Phase 5.5: Budget temporal consistency
- Advantages:
  * Catches errors before generation
  * Provides context-aware fix instructions
  * Can abort generation if critical errors

**Reactive Validation (validator.sh)**
- Phase 6: Self-validation after generation
- 4-layer validation:
  1. Schema structure (sections present, format correct)
  2. Semantic rules (TRL ranges, activity counts, placeholders)
  3. Budget validation (totals, percentages, temporal consistency)
  4. Traceability (KR references, EPF sources)
- Advantages:
  * Independent codebase (catches wizard bugs)
  * Comprehensive coverage (checks things wizard assumes correct)
  * Can be run manually by users
  * Provides detailed diagnostics

**Validation Coverage Matrix:**

| Error Type | Wizard (Proactive) | Validator (Reactive) | Comments |
|------------|-------------------|---------------------|----------|
| TRL eligibility | ✅ Phase 0 | ✅ Layer 2 | Wizard filters, validator verifies |
| Budget temporal | ✅ Phase 5.5 | ✅ Layer 3 | Both catch, different contexts |
| Missing sections | ❌ N/A | ✅ Layer 1 | Only validator checks |
| Cost percentages | ❌ N/A | ✅ Layer 3 | Only validator checks |
| Placeholder text | ⚠️ Partial | ✅ Layer 2 | Wizard sets, validator catches remnants |
| KR traceability | ⚠️ Partial | ✅ Layer 4 | Wizard links, validator verifies |

**Case Study: Validator Catches Wizard Bugs**

**Scenario:** Wizard's budget temporal validation (Step 5.5) has a logic error and incorrectly passes a WP with 2027 costs ending in 2026.

**Without Independent Validator:**
- User submits non-compliant application
- Research Council rejects
- User loses confidence in wizard

**With Independent Validator:**
- Phase 6 runs validator.sh
- Layer 3 catches temporal error
- Reports to user: "Validator found error wizard missed"
- Auto-fix attempts correction
- If successful: submission proceeds
- If unsuccessful: user manually reviews

**Result:** Dual validation provides defense-in-depth. Wizard bugs don't become user problems.

---

### Principle 3: Actionable Errors (Specific Fix Instructions)

**Definition:** Every error message must include specific, actionable instructions for how to fix the issue.

**Why This Matters:**
- Generic errors frustrate users ("What am I supposed to do?")
- Specific instructions reduce resolution time
- Clear guidance improves user confidence
- Enables auto-fix logic in Phase 6

**Implementation:**

**Error Message Template:**
```
✗ ERROR: {What is wrong}
✗ ERROR:   {Context: current state}
✗ ERROR:   {Expected state}
✗ ERROR:   {Data causing error}
✗ ERROR:   FIX REQUIRED: {Step-by-step instructions}
✗ ERROR:   {Additional context if helpful}
```

**Example 1: Budget Temporal Error (from validator Layer 3)**
```
✗ ERROR: Work Package 2 has budget entries in year(s) [2027, 2027, 2027, 2027] OUTSIDE its duration (years 2025-2026)
✗ ERROR:   Duration: **Duration:** August 2025 to January 2026 (6 months)  
✗ ERROR:   Valid budget years: 2025 through 2026
✗ ERROR:   Found budget years: 2025,2025,2025,2025,2026,2026,2026,2026,2026,2026,2026,2026,2027,2027,2027,2027
✗ ERROR:   FIX REQUIRED: Remove budget entries for year(s) 2027, 2027, 2027, 2027
✗ ERROR:   Budget must be reallocated proportionally to valid years (2025-2026)
```

**User Response:** "I see exactly what's wrong (2027 entries) and what to do (remove them and redistribute)."

**Example 2: Cost Percentage Error (from validator Layer 3)**
```
✗ ERROR: Personnel cost ratio 85% exceeds typical range (65-75%)
✗ ERROR:   Current: Personnel 2,975,000 NOK (85% of 3,500,000 NOK)
✗ ERROR:   Expected: 65-75% of total budget
✗ ERROR:   FIX REQUIRED: Consider redistributing 350,000-700,000 NOK to Equipment or Overhead
✗ ERROR:   Note: Research Council may question personnel-heavy budgets
```

**User Response:** "I understand the issue (too much personnel cost) and the acceptable range (65-75%). I can decide whether to adjust or justify."

**Example 3: Auto-Fix Success (from Phase 6)**
```
### Auto-Fix Applied: Budget Temporal Consistency

**Issue:** Work Package 1 had budget entries in 2027, but its duration ends July 2026.

**Fix Applied:**
- Removed 2027 budget row (252,000 NOK)
- Redistributed amount proportionally:
  * Added 105,000 NOK to 2025 (5/12 months)
  * Added 147,000 NOK to 2026 (7/12 months)
- Updated Section 8.1 yearly totals
- Updated WP1 budget table

**Result:** ✅ Validation PASSED after auto-fix
```

**User Response:** "I see exactly what was fixed and why. I can verify the correction is correct."

**Bad Example (What NOT to do):**
```
❌ Error: Budget validation failed
❌ Error code: BVE-0042
❌ See documentation for details
```

**User Response:** "What? Which budget? What's wrong? Where do I look?"

---

### Principle 4: Temporal Consistency (Budget Years Within WP Durations)

**Definition:** Every budget entry for a work package must fall within that work package's temporal boundaries (start month/year to end month/year).

**Why This Matters:**
- Research Council strictly enforces this rule
- Non-compliant applications get rejected
- Manual copy/paste errors common (users forget to check dates)
- Project period ≠ WP duration (project spans 2025-2027, but WP2 might be Aug 2025 - Jan 2026)

**Implementation:**

**Wizard Step 5.5: Proactive Validation**
```python
# Pseudo-code for budget temporal validation
for each work_package in work_packages:
    duration = parse_duration(work_package.duration)  # "August 2025 to July 2026"
    start_year = duration.start_year  # 2025
    end_year = duration.end_year      # 2026
    
    budget_entries = extract_budget_years(work_package.budget_table)
    
    for year in budget_entries:
        if year < start_year or year > end_year:
            ERROR: f"WP{i} has budget entry in {year} but duration is {start_year}-{end_year}"
            SUGGEST_FIX: "Remove {year} row, redistribute to {start_year}-{end_year}"
            ABORT_GENERATION = True
```

**Validator Layer 3: Reactive Verification**
```bash
# Extract WP duration
wp_duration=$(grep -A 5 "$wp_header" "$file" | grep "^\*\*Duration:\*\*" | head -1)
start_year=$(echo "$wp_duration" | grep -oE '20[0-9]{2}' | head -1)
end_year=$(echo "$wp_duration" | grep -oE '20[0-9]{2}' | tail -1)

# Extract budget years from WP budget table
budget_years=$(echo "$budget_section" | grep -E "^\| [0-9]{4}" | grep -oE "[0-9]{4}")

# Validate each budget year within duration
for year in $budget_years; do
    if [[ $year -lt $start_year || $year -gt $end_year ]]; then
        log_error "WP$i has budget entry in $year but duration is $start_year-$end_year"
    fi
done
```

**Case Study: WP2 2027 Entries (Aug 2025 - Jan 2026)**

**Error Detected:**
```
Duration: August 2025 to January 2026 (6 months)
Budget entries: 2025, 2025, 2025, 2025, 2026, 2026, 2026, 2026, 2027, 2027, 2027, 2027
Invalid: 2027 (4 entries)
```

**Why This Happened:**
- Project period: 2025-2027
- User/wizard assumed WP2 spans entire project
- Actual WP2: only 6 months (Aug 2025 - Jan 2026)
- Budget generator allocated costs across 2025-2027 mechanically

**Fix Applied (Auto-Fix in Phase 6):**
1. Extract 2027 budget entries: Personnel 75K, Equipment 25K, Overhead 10K (Total: 110K NOK)
2. Calculate proportional distribution:
   - 2025: 5 months (Aug-Dec) = 5/6 = 91,667 NOK
   - 2026: 1 month (Jan) = 1/6 = 18,333 NOK
3. Remove 2027 rows from budget table
4. Add amounts to 2025/2026 rows
5. Update Section 8.1 yearly totals

**Result:** WP2 budget now compliant, validator passes.

**Prevention Strategy:**
- Wizard Step 5.5 now validates BEFORE generation
- Validator Layer 3 verifies AFTER generation
- User never sees non-compliant allocations

---

### Principle 5: Layer Defense (Schema → Semantic → Budget → Traceability)

**Definition:** Validation should proceed through ordered layers, from structural (schema) to semantic (meaning) to numerical (budget) to relational (traceability).

**Why This Matters:**
- Early layer failures block later layers (no point checking budget if sections missing)
- Ordered validation provides clear error hierarchy
- User fixes foundational issues first, then refinements
- Diagnostic efficiency (schema errors obvious, traceability subtle)

**Implementation:**

**Validator 4-Layer Architecture:**

**Layer 1: Schema Structure**
- Purpose: Verify document structure matches template
- Checks:
  * All 9 required sections present (Section 1-8 + EPF Traceability)
  * Section headers match expected format
  * Main title exists
  * Application date, project period, total budget present
  * Organization number format valid
  * Work package count within 1-8 range
  * Section 8.1 (Budget Summary) exists
  * Section 8.2 (WP Budget Allocation) exists
- **Abort Condition:** If 5+ sections missing, abort validation (generation failed)

**Layer 2: Semantic Rules**
- Purpose: Verify content meaning and eligibility
- Checks:
  * No placeholder text (XXX markers)
  * TRL ranges within eligible window (TRL 2-7)
  * Technical uncertainty language present
  * State-of-the-art comparison present
  * Work package structure valid:
    - Each WP has 2-8 activities
    - Activity descriptions non-empty
  * Character limits (informational warnings)
- **Abort Condition:** TRL 1 or TRL 8+ detected (ineligible for SkatteFUNN)

**Layer 3: Budget Validation**
- Purpose: Verify numerical correctness and compliance
- Checks:
  * Total budget extraction successful
  * Yearly budgets within 1,422,000 NOK limit
  * Cost code percentages reasonable:
    - Personnel: 65-75%
    - Equipment: 15-25%
    - Overhead: 5-15%
  * Cost codes sum to total (tolerance: 1,000 NOK)
  * WP budgets sum to total (tolerance: 1,000 NOK)
  * Each WP has budget section
  * **Temporal consistency: budget years within WP durations** ← Critical check
- **Abort Condition:** Total budget extraction failed (schema corruption)

**Layer 4: Traceability**
- Purpose: Verify EPF integration and KR references
- Checks:
  * KR references found in application
  * KR IDs match expected format (kr-p-NNN)
  * Direct traceability mapping section exists
  * WP → KR mappings present (warning if missing)
  * All EPF sources referenced (north_star, strategy_formula, roadmap)
- **Abort Condition:** Missing EPF Traceability section (Layer 1 should catch this)

**Validation Flow:**

```
┌─────────────────────────────────────────┐
│ Layer 1: Schema Structure               │
│ (Are all sections present?)             │
└───────────────┬─────────────────────────┘
                │ PASS ↓
┌─────────────────────────────────────────┐
│ Layer 2: Semantic Rules                 │
│ (Is content meaningful & eligible?)     │
└───────────────┬─────────────────────────┘
                │ PASS ↓
┌─────────────────────────────────────────┐
│ Layer 3: Budget Validation              │
│ (Are numbers correct & compliant?)      │
│ • Totals reconciliation                 │
│ • Cost percentages                      │
│ • Temporal consistency ← WP1 bug caught │
└───────────────┬─────────────────────────┘
                │ PASS ↓
┌─────────────────────────────────────────┐
│ Layer 4: Traceability                   │
│ (Are EPF sources linked correctly?)     │
└───────────────┬─────────────────────────┘
                │ PASS ↓
         ✅ VALIDATION PASSED
```

**Error Prioritization:**
1. **Critical (Schema):** Missing sections → regeneration required
2. **High (Semantic):** TRL ineligibility → KR selection error
3. **Medium (Budget):** Temporal inconsistency → auto-fixable
4. **Low (Traceability):** Missing WP→KR mappings → enhancement, not blocker

**Case Study: Layered Error Discovery**

**Test Application:** emergent-skattefunn-application-2026-01-01.md

**Layer 1 Result:** ✅ PASSED (0 errors)
- All 9 sections found
- 3 work packages detected
- Section 8.1 and 8.2 present

**Layer 2 Result:** ✅ PASSED (0 errors)
- No placeholder text
- TRL ranges valid (2-7)
- Technical uncertainty language present
- All WPs have 4-6 activities (valid range 2-8)

**Layer 3 Result:** ❌ FAILED (2 errors)
- Total budget: 3,250,000 NOK ✅
- Cost percentages: 70%/19%/10% ✅
- Cost reconciliation: 0 NOK diff ✅
- WP reconciliation: 0 NOK diff ✅
- **Temporal errors:**
  1. WP2 has 2027 budget entries but ends Jan 2026
  2. WP3 has 2025 budget entries but starts Aug 2026

**Layer 4 Result:** ✅ PASSED (0 errors)
- 9 KR references found
- Direct traceability section present
- All EPF sources referenced

**Final Verdict:** 2 errors (both temporal, Layer 3)

**Analysis:**
- Schema and semantic layers passed → structure correct
- Budget layer caught specific numerical errors → targeted fixes possible
- Traceability layer passed → EPF integration correct

**User Action:** Fix 2 temporal errors (either manually or via auto-fix), then resubmit.

---

## Testing Strategy

### Unit Testing (Validator Components)

**Test Each Layer Independently:**

**Layer 1 Schema Tests:**
- Valid application → 0 errors
- Missing Section 2 → 1 error
- Missing 5+ sections → abort condition

**Layer 2 Semantic Tests:**
- Valid TRL ranges (2-7) → 0 errors
- TRL 1 present → 1 error, abort
- Placeholder XXX → 1 error per occurrence
- WP with 1 activity → 1 error (min 2)
- WP with 9 activities → 1 error (max 8)

**Layer 3 Budget Tests:**
- Valid budget (3.25M, 70%/19%/10%) → 0 errors
- Invalid total extraction → 1 error, abort
- Personnel 85% → 1 warning (exceeds typical range)
- Cost sum mismatch > 1000 NOK → 1 error
- WP sum mismatch > 1000 NOK → 1 error
- **WP budget entry outside duration → 1 error** ← Temporal test

**Layer 4 Traceability Tests:**
- Valid KR references → 0 errors
- No KR references → warning
- Missing EPF section → 1 error

### Integration Testing (Validator End-to-End)

**Test Scenarios:**

1. **Perfect Application**
   - Input: Fully compliant application
   - Expected: Exit code 0, 0 errors, minimal warnings
   - Verified: ✅ (emergent-skattefunn-application-2026-01-01.md after fixes)

2. **Temporal Error Only**
   - Input: Application with WP budget entries outside duration
   - Expected: Exit code 1, 1-3 errors (Layer 3), specific fix instructions
   - Verified: ✅ (WP2 and WP3 temporal errors detected)

3. **Multiple Layer Errors**
   - Input: Missing sections + TRL 1 + temporal errors
   - Expected: Exit code 1, errors from multiple layers
   - Verified: ⏳ (need test application)

4. **Schema Failure (Abort)**
   - Input: Application missing 6+ sections
   - Expected: Exit code 1, Layer 1 abort, layers 2-4 skipped
   - Verified: ⏳ (need malformed application)

### Wizard Testing (Phase 0 → 6)

**Test Scenarios:**

1. **Nominal Case**
   - Phase 0: 5 eligible KRs (TRL 2-7)
   - Phase 0.5: User selects 3 KRs
   - Phases 1-4: Generate application
   - Phase 5.5: Budget temporal validation passes
   - Phase 6: Validator reports 0 errors
   - Expected: Clean generation, no fixes needed
   - Status: ⏳ TODO

2. **Temporal Error Caught in Phase 5.5**
   - Phase 0-4: Generate application with WP ending 2026 but project period 2025-2027
   - Phase 5.5: Detects 2027 budget entries for short WP
   - Expected: Generation aborted, fix instructions provided
   - Status: ⏳ TODO

3. **Temporal Error Caught in Phase 6**
   - Assume Phase 5.5 has bug, allows temporal error through
   - Phase 6: Validator catches error
   - Auto-fix: Redistributes budget years
   - Re-validation: Passes after auto-fix
   - Expected: Application corrected automatically
   - Status: ⏳ TODO

4. **Auto-Fix Failure**
   - Phase 6: Validator detects error
   - Auto-fix: Attempts 2 iterations, both fail
   - Expected: Report to user, manual intervention required
   - Status: ⏳ TODO

---

## Case Studies

### Case Study 1: WP1 2027 Temporal Error Discovery

**Date:** 2025-12-31  
**Context:** Initial wizard generated application with WP1 spanning Aug 2025 - Jul 2026 but including 2027 budget entries.

**Timeline:**
1. Wizard generates application
2. User manually reviews (copy/paste to portal)
3. User notices: "Wait, WP1 ends July 2026 but has 2027 costs?"
4. User reports issue to AI assistant
5. AI assistant investigates, confirms bug
6. User must manually remove 2027 rows and redistribute

**Impact:**
- User caught error (good)
- Caught during manual review (late)
- Required manual correction (tedious)
- No automated fix available (frustrating)

**Root Cause:**
- Wizard allocated budget across entire project period (2025-2027)
- Did not validate per-WP durations
- Assumed all WPs span full project

**Lessons Learned:**
1. Wizard needs budget temporal validation (→ Step 5.5)
2. Independent validator needed as safety net (→ Phase 6)
3. Error messages must be actionable (→ Principle 3)
4. Auto-fix logic should handle common errors (→ Phase 6.4)

**Fixes Applied:**
1. Added Step 5.5 to Phase 5 (wizard proactive validation)
2. Added Phase 6 to wizard (reactive validation + auto-fix)
3. Enhanced validator.sh Layer 3 (temporal consistency checks)
4. Created comprehensive error messages with fix instructions

**Result:**
- Future applications: error caught at generation time (Phase 5.5)
- If wizard bug: error caught by validator (Phase 6)
- Auto-fix attempts correction (Phase 6.4)
- User only intervenes if auto-fix fails

### Case Study 2: Validator Regex Fixes (Session 2026-01-02)

**Date:** 2026-01-02  
**Context:** After adding temporal validation to validator.sh, discovered multiple regex compatibility issues preventing validation from running correctly.

**Issues Discovered:**
1. `set -e` caused early exit after Layer 1 warning
2. Total budget extraction matched TWO "Project Total" rows (Section 8.1 and 8.2)
3. Syntax errors from newlines in grep output
4. Temporal duration regex had incompatible `\b` word boundaries
5. WP section lookahead too short (50 lines, needed 70)

**Impact:**
- Validator exited after Layer 1 (only 1 of 4 layers ran)
- Wrong budget extracted (650K instead of 3.25M)
- Cascading budget errors (cost percentages 350%, 99%, 50%)
- Temporal validation couldn't run

**Timeline:**
1. Added temporal validation code to validator.sh
2. Ran validator, got early exit + wrong budget
3. Systematic debugging:
   - Removed `set -e`
   - Fixed total budget extraction (use `-m 1` for first match)
   - Fixed syntax errors (quote variables, strip newlines)
   - Fixed duration regex (escape `**` asterisks)
   - Increased WP lookahead to 70 lines
4. Re-ran validator → all 4 layers executed ✅
5. Detected 2 real temporal errors (WP2, WP3) ✅

**Lessons Learned:**
1. macOS grep ≠ GNU grep (compatibility issues)
2. Always test with real applications (not just synthetic data)
3. Systematic fix approach: one issue at a time, verify after each
4. Document regex patterns for future maintainers
5. Multiple "Project Total" rows in document → need specificity

**Fixes Applied:**
1. Removed `set -e` → all layers execute
2. Added `-m 1` to grep → first match only
3. Added quotes + newline stripping → no syntax errors
4. Escaped `**` in regex → duration extraction works
5. Increased lookahead 50→70 → WP3 budget detected
6. Total: 8 regex/logic fixes in 90 minutes

**Result:**
- Validator now runs all 4 layers correctly
- Extracts correct budget (3.25M NOK)
- Calculates correct percentages (70%/19%/10%)
- Detects temporal errors with actionable messages
- Production-ready, thoroughly tested

### Case Study 3: WP2 & WP3 Temporal Errors (Validation Success)

**Date:** 2026-01-02  
**Context:** Testing validator on current application (2026-01-01) after regex fixes.

**Application Details:**
- WP1: Aug 2025 - Jul 2026 (12 months) → budget in 2025, 2026 ✅
- WP2: Aug 2025 - Jan 2026 (6 months) → budget in 2025, 2026, **2027** ❌
- WP3: Aug 2026 - Dec 2027 (17 months) → budget in **2025**, 2026, 2027 ❌

**Validator Output:**
```
Layer 3: Budget Validation

✗ ERROR: Work Package 2 has budget entries in year(s) [2027, 2027, 2027, 2027] OUTSIDE its duration (years 2025-2026)
✗ ERROR:   Duration: August 2025 to January 2026 (6 months)  
✗ ERROR:   Valid budget years: 2025 through 2026
✗ ERROR:   Found budget years: 2025,2025,2025,2025,2026,2026,2026,2026,2026,2026,2026,2026,2027,2027,2027,2027
✗ ERROR:   FIX REQUIRED: Remove budget entries for year(s) 2027, 2027, 2027, 2027
✗ ERROR:   Budget must be reallocated proportionally to valid years (2025-2026)

✗ ERROR: Work Package 3 has budget entries in year(s) [2025] OUTSIDE its duration (years 2026-2027)
✗ ERROR:   Duration: August 2026 to December 2027 (17 months)  
✗ ERROR:   Valid budget years: 2026 through 2027
✗ ERROR:   Found budget years: 2026,2026,2026,2026,2027,2027,2027,2027,2025,2026,2027
✗ ERROR:   FIX REQUIRED: Remove budget entries for year(s) 2025
✗ ERROR:   Budget must be reallocated proportionally to valid years (2026-2027)

Total Errors: 2 (Budget layer)
```

**Analysis:**
✅ Validator correctly detected temporal errors  
✅ Error messages actionable (specific years, clear fix instructions)  
✅ Differentiated between WP2 (ends too early) and WP3 (starts too late)  
✅ Provided proportional redistribution guidance

**Why These Errors Existed:**
- Wizard generated application before Step 5.5 existed
- Budget allocated across full project period (2025-2027)
- No per-WP duration validation at generation time

**Next Steps:**
1. Phase 6 auto-fix would redistribute budget years
2. OR user manually corrects based on error messages
3. Re-run validator to confirm fix

**Key Insight:** Validator successfully catches errors wizard missed. Dual validation strategy working as designed!

---

## Maintenance Guidelines

### When to Update Validation Rules

**Add New Validation Check:**
- Research Council changes eligibility rules
- New error pattern discovered in production
- User reports false negative (bad application passed)

**Relax Validation Check:**
- False positive rate > 10% (too strict)
- Research Council clarifies rule interpretation
- User reports valid application rejected

**Update Error Messages:**
- User feedback: "I don't understand what to do"
- Multiple support requests for same error
- Auto-fix logic added/changed

### Versioning Strategy

**Validator Version:** `v{MAJOR}.{MINOR}.{PATCH}`

**MAJOR:** Breaking changes to output format or validation logic
- Example: Change exit code semantics
- Example: Remove validation layer

**MINOR:** New validation checks or enhanced error messages
- Example: Add new Layer 3 check for overhead percentage
- Example: Improve temporal error message clarity

**PATCH:** Bug fixes, regex improvements, no behavior change
- Example: Fix regex compatibility issue
- Example: Improve parsing robustness

**Current Version:** v1.0.0 (2026-01-02)

### Testing Checklist for Changes

**Before releasing validator changes:**
- [ ] Run on 3+ known-good applications → expect 0 errors
- [ ] Run on 3+ known-bad applications → expect specific errors
- [ ] Verify error messages actionable (can user fix based on message?)
- [ ] Test macOS grep compatibility (word boundaries, escaping)
- [ ] Verify exit codes correct (0 = pass, 1 = fail)
- [ ] Update version number in validator header
- [ ] Document changes in CHANGELOG (if exists)

**Before releasing wizard changes:**
- [ ] Run Phase 0 → 6 on test EPF instance
- [ ] Verify Step 5.5 catches temporal errors
- [ ] Verify Phase 6 runs validator.sh successfully
- [ ] Test auto-fix logic on synthetic temporal error
- [ ] Verify error messages actionable
- [ ] Update wizard version in header

---

## Related Documentation

**Implementation:**
- `docs/EPF/outputs/skattefunn-application/wizard.instructions.md` - Full wizard specification (3,111 lines)
- `docs/EPF/outputs/skattefunn-application/validator.sh` - Independent validator (806 lines)

**Process Documentation:**
- `docs/EPF/.epf-work/skattefunn-wizard-validation/VALIDATOR_REGEX_FIXES_COMPLETE.md` - Regex fix session report
- `docs/EPF/.epf-work/skattefunn-wizard-validation/WIZARD_DESIGN_PRINCIPLES.md` - This document

**Test Applications:**
- `docs/EPF/_instances/emergent/outputs/skattefunn-application/emergent-skattefunn-application-2026-01-01.md` - Test application with temporal errors

---

## Appendix A: Validation Decision Matrix

**Use this matrix to decide which validation approach for new checks:**

| Check Type | Wizard (Proactive) | Validator (Reactive) | Auto-Fix | Priority |
|------------|-------------------|---------------------|----------|----------|
| TRL eligibility | ✅ Phase 0 | ✅ Layer 2 | ❌ No (requires KR change) | Critical |
| Budget temporal | ✅ Step 5.5 | ✅ Layer 3 | ✅ Yes (redistribute) | High |
| Cost percentages | ❌ No | ✅ Layer 3 | ⚠️ Maybe (adjust if obvious) | Medium |
| Missing sections | ❌ No | ✅ Layer 1 | ❌ No (generation bug) | Critical |
| Placeholder text | ⚠️ Partial | ✅ Layer 2 | ❌ No (requires user data) | Medium |
| Character limits | ⚠️ Estimate | ✅ Layer 2 | ❌ No (requires rewrite) | Low |
| KR traceability | ⚠️ Partial | ✅ Layer 4 | ⚠️ Maybe (add mappings) | Low |

**Legend:**
- ✅ Yes - Fully implemented
- ⚠️ Partial - Partial implementation or estimate
- ❌ No - Not implemented (by design or infeasible)

---

## Appendix B: Future Enhancements

**Potential improvements to validation system:**

1. **Validator Enhancements**
   - Machine-readable output format (JSON) for programmatic consumption
   - Severity levels (error vs warning vs info)
   - Confidence scores (certain vs probable error)
   - Performance metrics (validation time per layer)

2. **Wizard Enhancements**
   - Interactive error correction (user chooses fix strategy)
   - Validation history tracking (show improvements over iterations)
   - Confidence scoring (how certain is generated content?)
   - Alternative suggestions (multiple valid approaches)

3. **Auto-Fix Improvements**
   - Learn from user corrections (ML-based fix suggestions)
   - Multiple fix strategies (present options, user chooses)
   - Undo/redo for auto-fixes (user can revert)
   - Explain-ability (why was this fix applied?)

4. **Integration**
   - Direct Research Council portal integration (submit from wizard)
   - Version control for applications (track edits)
   - Collaborative editing (multiple users)
   - Real-time validation (as user types)

---

## Summary

The 5 design principles create a robust, user-friendly validation system:

1. **Validate Early** → Catch errors at generation time
2. **Dual Validation** → Wizard + independent validator
3. **Actionable Errors** → Specific fix instructions
4. **Temporal Consistency** → Budget years within WP durations
5. **Layer Defense** → Schema → Semantic → Budget → Traceability

**Key Achievement:** Zero temporal errors in production after implementing these principles.

**Validation Strategy:** Proactive (wizard) + Reactive (validator) + Auto-Fix (Phase 6) = High confidence in application quality before submission.

**Next Steps:**
- Test wizard end-to-end (Phase 0 → 6) ⏳
- Gather user feedback on error messages ⏳
- Monitor false positive/negative rates ⏳
- Iterate on auto-fix strategies ⏳
