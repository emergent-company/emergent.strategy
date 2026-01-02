# SkatteFUNN Wizard v2.0.0 - Fix Verification

**Date:** 2 January 2026  
**Fixes Applied:** Step 4.0 (template reading), Step 4.2 (validation), warnings added  
**Status:** ✅ READY FOR END-TO-END TESTING

---

## Changes Applied to wizard.instructions.md

### Change 1: Added Step 4.0 (Template Loading) ✅

**Location:** Before "Phase 4: Document Assembly" (was line 1513, now ~1515)

**What Was Added:**
- Explicit instruction to read `template.md` using read_file tool
- Regex extraction of 8 section titles
- Validation that all sections present
- Character limit extraction from template comments
- Storage in `template_structure` variable
- Warning that Step 4.1 embedded structure is REFERENCE ONLY

**Key Instructions:**
```python
template_path = "docs/EPF/outputs/skattefunn-application/template.md"
template_content = read_file(template_path)  # MUST use read_file tool

# Extract and validate 8 required sections
required_sections = [
    "## Section 1: Project Owner and Roles",
    ...
]
```

### Change 2: Added Step 4.2 (Validation) ✅

**Location:** After embedded structure (was line 1821, now ~1903)

**What Was Added:**
- Warning that embedded structure is REFERENCE ONLY
- Pre-generation validation checklist
- Post-generation validation (section presence, section order)
- Explicit instructions on what to do vs what NOT to do

**Key Warnings:**
- ❌ DO NOT invent alternative section numbering (## 1., ## 2.)
- ❌ DO NOT use embedded structure as template
- ✅ MUST use section titles from template_structure['sections']

### Change 3: Renamed Section Heading ✅

**Old:** "### Template Variable Mapping (Schema v2.0.0)"  
**New:** "### Step 4.1: Template Variable Mapping (Schema v2.0.0)"

Added numbering for consistency with new Step 4.0 and Step 4.2.

---

## Verification Checklist

### Schema Alignment ✅

**File:** `docs/EPF/outputs/skattefunn-application/schema.json`

**Verified:**
- ✅ Defines 8-section structure through nested properties
- ✅ Character limits match template requirements:
  * title_english: maxLength 100
  * company_activities: maxLength 2000
  * project_background: maxLength 2000
  * primary_objective: maxLength 1000
  * market_differentiation: maxLength 2000
  * rd_content: maxLength 2000
  * project_summary: maxLength 1000
  * WP name: maxLength 100
  * WP rd_challenges: maxLength 500
  * WP method_approach: maxLength 1000
  * Activity title: maxLength 100
  * Activity description: maxLength 500
  * Cost specification: maxLength 500
- ✅ Work package constraints: 1-8 WPs, 2-8 activities per WP
- ✅ Budget structure: yearly_costs array with cost codes

**Conclusion:** Schema correctly aligned with template.md requirements.

---

## Test Protocol

### Phase 0-3 (Data Extraction)

**Expected Behavior:**
1. Phase 0: Load roadmap, filter TRL 2-7 KRs
2. Phase 0.5: Present eligible KRs, user selects Option A (9 KRs)
3. Phase 1: Pre-flight validation (EPF files exist)
4. Phase 2: EPF data extraction (North Star, Strategy, Roadmap)
5. Phase 3: Content synthesis (company activities, R&D content, objectives)

**No Changes:** These phases work correctly.

### Phase 4 (Document Assembly) - CRITICAL CHANGES

**Step 4.0: Template Loading (NEW)**

**Expected AI Behavior:**
1. ✅ AI reads Step 4.0 instruction
2. ✅ AI calls `read_file("docs/EPF/outputs/skattefunn-application/template.md")`
3. ✅ AI extracts 8 section titles using regex
4. ✅ AI validates all sections present
5. ✅ AI stores in `template_structure` variable
6. ✅ AI prints confirmation: "Template validation complete"

**Verification Points:**
- [ ] Did AI call read_file tool for template.md?
- [ ] Did AI extract exactly 8 section titles?
- [ ] Did AI store template_structure for later use?
- [ ] Did AI see warning about embedded structure being REFERENCE ONLY?

**Step 4.1: Variable Mapping (UNCHANGED)**

**Expected AI Behavior:**
1. ✅ AI maps EPF data to template variables
2. ✅ AI understands this is just data preparation
3. ✅ AI does NOT generate output yet

**Step 4.2: Output Generation (NEW)**

**Expected AI Behavior:**
1. ✅ AI reads pre-generation checklist
2. ✅ AI validates all required data present
3. ✅ AI generates output using `template_structure['sections']`
4. ✅ AI uses exact section titles from template.md
5. ✅ AI performs post-generation validation
6. ❌ AI does NOT invent alternative numbering (## 1., ## 2.)

**Verification Points:**
- [ ] Did AI run pre-generation checklist?
- [ ] Did output use "## Section 1:" not "## 1."?
- [ ] Did output use "## Section 2:" not "## 2."?
- [ ] Did all 8 sections have correct titles?
- [ ] Did AI run post-generation validation?

### Phase 5 (Budget Allocation)

**Expected Behavior:**
1. Generate work packages from selected KRs
2. Calculate budget summaries
3. Validate budget reconciliation

**No Changes:** This phase works correctly.

### Output Validation

**Expected Output Structure:**
```markdown
# SkatteFUNN - Tax Deduction Scheme Application

## Section 1: Project Owner and Roles  ← CORRECT
## Section 2: About the Project        ← CORRECT
## Section 3: Background and Company Activities  ← CORRECT
## Section 4: Primary Objective and Innovation  ← CORRECT
## Section 5: R&D Content  ← CORRECT
## Section 6: Project Summary  ← CORRECT
## Section 7: Work Packages  ← CORRECT
## Section 8: Total Budget and Estimated Tax Deduction  ← CORRECT
```

**NOT:**
```markdown
## 1. Organization Information  ← WRONG
## 2. Project Details  ← WRONG
```

**Validator Test:**
```bash
cd docs/EPF/_instances/emergent/outputs/skattefunn-application
bash ../../../../skattefunn-application/validator.sh emergent-skattefunn-application-2026-01-01.md
```

**Expected Result:**
- ✅ Layer 1 (Schema): Pass (all sections present with correct titles)
- ⚠️ Layer 2-4: May have false positives (validator bugs documented)

---

## Success Criteria

### Critical Success (Must Pass)

1. ✅ AI calls read_file for template.md in Step 4.0
2. ✅ AI extracts 8 section titles correctly
3. ✅ Output uses "## Section N:" format (not "## N.")
4. ✅ All 8 sections present in correct order
5. ✅ Character limits respected

### Nice-to-Have Success

6. ✅ Validator Layer 1 passes (schema validation)
7. ✅ AI prints validation checkpoints
8. ✅ No manual regeneration needed

---

## Test Execution Steps

1. **Start Fresh Session:**
   - New AI session (clear context)
   - Open wizard.instructions.md
   - Confirm user wants to generate SkatteFUNN application

2. **Execute Phases 0-3:**
   - Provide user inputs (organization, timeline, budget)
   - Observe Phase 0 TRL filtering
   - Observe Phase 0.5 KR selection (user confirms 9 KRs)
   - Let Phases 1-3 run automatically

3. **Observe Phase 4 Closely:**
   - **STOP at Step 4.0 start**
   - **Watch for read_file call**
   - Verify AI reads template.md
   - Verify AI extracts sections
   - Continue to Step 4.1 (variable mapping)
   - Continue to Step 4.2 (output generation)
   - **Watch for section titles in output**

4. **Verify Output:**
   - Open generated file
   - Check section titles: `## Section 1:` format
   - Check all 8 sections present
   - Check character limits respected

5. **Run Validator:**
   - Execute validator.sh script
   - Accept Layer 1 pass as success
   - Document Layer 2-4 false positives if any

6. **Compare with Previous Generation:**
   - Previous (wrong): `## 1. Organization Information`
   - Current (correct): `## Section 1: Project Owner and Roles`

---

## Expected Issues (Known Validator Bugs)

These are NOT wizard failures, just validator bugs:

1. **False Positive: "[Not entered]" Pattern**
   - Validator regex matches any character (N, o, t, space, e, n, t, r, d)
   - Ignore warnings about this pattern

2. **False Positive: "TRL 1" Pattern**
   - Validator pattern `"TRL 1[^0-9]"` matches "Activity 1" followed by "TRL"
   - Ignore warnings about TRL 1 in activities

3. **Insufficient Context Window**
   - Validator `-A 20` may not capture full WP structure
   - If "Activities" section appears >20 lines after WP header, validator misses it
   - Manually verify WP structure has Activities section

4. **Premature Exit**
   - Validator may exit after org number warning
   - Layers 2-4 may not run
   - Re-run validator with fixed org number to see full validation

---

## Rollback Plan

If test fails:

1. **Identify Failure Point:**
   - Did AI read template.md? (If NO: Step 4.0 instruction unclear)
   - Did AI use correct sections? (If NO: Step 4.0 validation failed)
   - Did output match template? (If NO: Step 4.2 generation logic unclear)

2. **Restore Backup:**
   ```bash
   cp docs/EPF/outputs/skattefunn-application/wizard.instructions.md.backup \
      docs/EPF/outputs/skattefunn-application/wizard.instructions.md
   ```

3. **Revise Instructions:**
   - Make Step 4.0 more explicit
   - Add more validation checkpoints
   - Clarify Step 4.2 generation algorithm

4. **Re-test:**
   - Apply revised instructions
   - Run test protocol again

---

## Post-Test Actions

### If Test Passes ✅

1. Delete backup file (keep changes)
2. Update todo list: Test complete
3. Document wizard design principles
4. Mark application ready for user submission

### If Test Fails ❌

1. Analyze failure mode
2. Document root cause
3. Revise fix approach
4. Apply updated fix
5. Re-test

---

## Test Status

**Preparation:** ✅ Complete
- [x] Backup created
- [x] Changes applied
- [x] Schema verified
- [x] Test protocol defined

**Execution:** ⏳ Ready to run
- [ ] Fresh wizard session started
- [ ] Phases 0-3 completed
- [ ] Phase 4 Step 4.0 observed (template read)
- [ ] Phase 4 Step 4.2 observed (output generation)
- [ ] Output verified (section titles correct)
- [ ] Validator run (Layer 1 pass expected)

**Next:** User initiates wizard execution for end-to-end test.
