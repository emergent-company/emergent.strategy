# SkatteFUNN Wizard Fix: Added Phase 0.0 (Project Information Collection)

**Date:** 2026-01-02  
**Issue:** Wizard generated budget/timeline data without asking user  
**Root Cause:** EPF roadmap is strategic (TRL, hypotheses) but wizard needed tactical data (budgets, dates)  
**Solution:** Added Phase 0.0 to collect user input BEFORE Phase 0

---

## Problem Statement

After successfully fixing the template format issue (wizard now uses template.md instead of inventing structure), user identified a **critical data collection gap**:

> "It seemed to not ask for budget and time line? It needs to do that, as it should not invent this or refer to earlier runs, so it can not know this without asking the user. The roadmap in EPF does not contain specific times or costs as that belongs outside EPF."

**Evidence:**
- Wizard generated application with:
  * Total budget: 4,960,200 NOK (NOT asked from user)
  * Timeline: 36 months, 2025-01-01 to 2027-12-31 (NOT asked from user)
  * Yearly breakdown: 2025 (1.7M), 2026 (2.4M), 2027 (0.8M) (NOT asked from user)
- Data source: Unknown (likely AI estimation based on KR descriptions)
- **Violation:** EPF should be strategic (TRL progression, technical hypotheses), NOT tactical (specific budgets, calendar dates)

---

## Investigation Findings

**Phase Structure BEFORE Fix:**
```
Phase 0: R&D Eligibility Validation (TRL 2-7 filtering)
  └─ References: user_input.budget_period (undefined!)
  
Phase 0.5: Interactive Key Result Selection
  └─ User selects which KRs to include
  └─ Displays: kr['estimated_budget'], kr['estimated_duration']
  └─ Problem: Shows budget/duration but doesn't collect it
  
Phase 1-4: EPF extraction, content synthesis, assembly
  └─ Uses: budget_period, total_budget (undefined!)
  
Phase 5: Budget Allocation
  └─ Distributes budget across work packages
  └─ Problem: Allocates budget that was never collected from user
```

**Missing Data Collection:**
- Total project budget (NOK)
- Project start date (YYYY-MM-DD)
- Project end date (YYYY-MM-DD)
- Organization details (name, org number, contacts)
- Project roles (creator, org representative, project leader)

**Scope Separation Principle:**
- **EPF Roadmap (Strategic):** Key Results, TRL progression (2→6), technical hypotheses, uncertainties, experiment designs
- **SkatteFUNN Application (Tactical):** Specific NOK amounts, calendar dates, work package timelines, cost code percentages
- **Violation:** Wizard assumed tactical data existed in strategic artifacts

---

## Solution: Phase 0.0 (Project Information Collection)

Added comprehensive user input collection phase that runs BEFORE Phase 0 (TRL filtering).

### Phase 0.0 Structure

**Step 0.0.1: Collect Organization Information**
- Organization name (legal entity)
- Organization number (9 digits)
- Manager/CEO name
- Role 1: Creator of Application (name, email, phone)
- Role 2: Organization Representative (name, email, phone)
- Role 3: Project Leader (name, email, phone)
- Allows same person in multiple roles

**Step 0.0.2: Collect Project Timeline**
- Project start date (YYYY-MM-DD)
- Project end date (YYYY-MM-DD)
- Validation:
  * End date > start date
  * Duration ≤ 48 months (SkatteFUNN maximum)
  * Reasonable date formats
- Calculates: duration_months, duration_days
- Allows retroactive applications (costs already incurred)

**Step 0.0.3: Collect Budget Information**
- Total R&D budget (NOK)
- Validation:
  * Budget > 0
  * Warning if > 25,000,000 NOK (annual SkatteFUNN maximum)
- Calculates: years covered by project
- Example guidance: "2-5M NOK typical for multi-year projects"

**Step 0.0.4: Collect EPF Instance Path**
- Path to EPF instance directory
- Example: docs/EPF/_instances/emergent
- Validation:
  * Path exists
  * Contains READY/ folder
  * Required files present: 00_north_star.yaml, 05_roadmap_recipe.yaml
- Stores: instance_path, ready_path

**Step 0.0.5: Confirmation Summary**
- Display all collected information
- User confirmation before proceeding
- Creates user_input object available to all subsequent phases

### User Input Object Structure

```python
user_input = {
    'organization': {
        'name': str,
        'org_number': str (9 digits),
        'manager_name': str,
        'creator': {'name': str, 'email': str, 'phone': str},
        'org_representative': {'name': str, 'email': str, 'phone': str},
        'project_leader': {'name': str, 'email': str, 'phone': str}
    },
    'timeline': {
        'start_date': date,
        'end_date': date,
        'duration_months': int,
        'duration_days': int,
        'application_date': date
    },
    'budget': {
        'total_budget': int (NOK),
        'years_covered': [int],
        'num_years': int
    },
    'epf': {
        'instance_path': str,
        'ready_path': str
    }
}
```

---

## Updated Phase Flow

**NEW Phase Structure:**
```
Phase 0.0: Project Information Collection (NEW!)
  └─ Collects: organization, timeline, budget, EPF path
  └─ Creates: user_input object
  └─ Output: Confirmation summary
  
Phase 0: R&D Eligibility Validation
  └─ Uses: user_input['epf']['ready_path']
  └─ Uses: user_input['timeline']['start_date'], user_input['timeline']['end_date']
  └─ Uses: user_input['budget']['total_budget']
  └─ Creates: budget_period from user_input
  
Phase 0.5: Interactive Key Result Selection
  └─ Uses: budget_period (from Phase 0)
  └─ User selects which TRL 2-7 KRs to include
  
Phase 1: Pre-flight Validation
  └─ Uses: user_input for template variable preparation
  
Phase 2: EPF Data Extraction
  └─ Uses: user_input['epf']['ready_path'] to load YAML files
  
Phase 3: Content Synthesis
  └─ Uses: user_input['organization'], user_input['timeline']
  
Phase 4: Document Assembly
  └─ Uses: user_input for ALL template variable substitutions
  
Phase 5: Budget Allocation
  └─ Uses: user_input['budget']['total_budget']
  └─ Allocates across selected work packages
```

---

## Code Changes

**1. Added Phase 0.0 (lines 19-352)**
- 5 interactive collection steps
- Comprehensive validation for each input
- EPF path validation
- Confirmation summary

**2. Updated Phase 0 (line 373)**
```python
# OLD (undefined reference):
roadmap_path = f"{user_input.epf_sources.instance_path}/READY/05_roadmap_recipe.yaml"

# NEW (uses Phase 0.0 data):
roadmap_path = f"{user_input['epf']['ready_path']}/05_roadmap_recipe.yaml"
```

**3. Updated Phase 0.5 (line 639)**
```python
# OLD (undefined fields):
budget_period = {
    'start_date': user_input.timeline.project_start,
    'end_date': user_input.timeline.project_end,
    'total_budget': user_input.budget.total_amount
}

# NEW (uses Phase 0.0 data):
budget_period = {
    'start_date': user_input['timeline']['start_date'],
    'end_date': user_input['timeline']['end_date'],
    'total_budget': user_input['budget']['total_budget']
}
```

**4. All Subsequent Phases**
- Now have access to complete user_input object
- No more undefined references
- No more invented/estimated data

---

## Validation Strategy

**Test Scenario:**
- User provides: 3,250,000 NOK, 2025-01-01 to 2027-12-31
- Expected output: Application shows EXACTLY 3,250,000 NOK and 2025-2027 timeline
- NOT: 4,960,200 NOK or any other invented values

**Success Criteria:**
- ✅ User is prompted for: organization, timeline, budget, EPF path
- ✅ All inputs validated (dates, budget > 0, org number format)
- ✅ User-provided values appear in generated application exactly
- ✅ No invented/estimated budget or timeline data
- ✅ Budget allocation across work packages sums to user's total
- ✅ EPF files remain strategic (no tactical data added)
- ✅ Wizard is "watertight" for both template format AND data collection

**Validator Checks:**
- Section 1 organization details match user_input
- Section 2 timeline matches user_input dates
- Section 5 total budget matches user_input exactly
- Yearly breakdown sums to total budget
- Work package timelines fit within project period

---

## Benefits

**1. Data Integrity**
- All budget/timeline data comes from user (reproducible, auditable)
- No AI estimation or invention
- No dependency on EPF containing tactical data

**2. Scope Separation**
- EPF remains strategic (TRL, hypotheses, uncertainties)
- SkatteFUNN application is tactical (budgets, dates, allocations)
- Clear boundary between product strategy and implementation planning

**3. User Control**
- User explicitly provides all critical values
- Validation catches errors early (invalid dates, excessive budgets)
- Confirmation summary before proceeding

**4. Maintainability**
- Single source of truth (user_input object)
- All phases use consistent data structure
- Easy to add more collected fields if needed

**5. Compliance**
- Organization details required for official submission
- Contact persons for SkatteFUNN communication
- Accurate budget for tax deduction calculation

---

## Next Steps

**Test End-to-End:**
1. Run complete wizard with Phase 0.0
2. Provide Emergent test data:
   - Organization: Emergent (by Eyedea), org number: 123456789
   - Timeline: 2025-01-01 to 2027-12-31 (36 months)
   - Budget: 3,250,000 NOK
   - EPF path: docs/EPF/_instances/emergent
3. Verify Phase 0.0 prompts appear correctly
4. Verify generated application uses exact user values
5. Run validator.sh to check consistency
6. Compare with previous application to see improvements

**Additional Enhancements (Future):**
- Add cost code percentage collection (optional, use defaults)
- Add industry sector selection (for Section 1)
- Add project type (new project vs continuation)
- Add partner organization collection (if applicable)

---

## Files Modified

**docs/EPF/outputs/skattefunn-application/wizard.instructions.md**
- Added Phase 0.0 (lines 19-352): Project Information Collection
- Updated Phase 0 (line 373): Uses user_input['epf']['ready_path']
- Updated Phase 0.5 (line 639): Uses user_input['timeline'] and user_input['budget']
- Updated overview diagram (lines 10-18): Added Phase 0.0 to phase list
- Total lines: 3112 → 3471 (+359 lines)

**Status:** ✅ READY FOR TESTING
