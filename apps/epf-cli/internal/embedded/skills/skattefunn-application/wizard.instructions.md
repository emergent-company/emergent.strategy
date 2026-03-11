# SkatteFUNN Application Generator - Wizard Instructions

**Version:** 2.0.0  
**Schema Version:** 2.0.0  
**Template Version:** 2.0.0  
**Purpose:** Generate Norwegian R&D Tax Deduction Scheme applications from EPF data  
**Output Format:** Markdown document following Research Council of Norway official form structure (8 sections)

---

## 🤖 FOR AI ASSISTANTS: READ THIS BEFORE PROCEEDING

⚠️ **STOP - DO NOT CREATE CUSTOM CODE**

If you are an AI assistant asked to generate a SkatteFUNN application:

❌ **DO NOT** create a custom Python/Node/etc script  
❌ **DO NOT** try to "optimize" or "simplify" this wizard  
❌ **DO NOT** skip phases or combine steps  
❌ **DO NOT** invent your own synthesis logic  

✅ **DO** follow this 1,868-line wizard EXACTLY as written  
✅ **DO** execute each phase sequentially (0 → 0.5 → 1 → 2 → 3 → 4 → 5)  
✅ **DO** stop at Phase 0.5 for mandatory user selection  
✅ **DO** use the official `template.md` structure  
✅ **DO** validate with `validator.sh` (must be 0 errors)  

**Why this matters:**
- This wizard encodes **Frascati Manual** R&D classification rules (international standard)
- SkatteFUNN applications must pass **Research Council of Norway** validation
- Custom code WILL fail with 10-20+ validation errors
- The template structure is legally required - deviations are rejected

**This wizard IS the implementation.** It has been battle-tested on real applications. Your job is to EXECUTE it, not rewrite it.

**See also:** `docs/EPF/outputs/AI_INSTRUCTIONS.md` for complete guidance.

---

## ⚠️ CRITICAL: ALWAYS RUN PHASES IN ORDER - DO NOT SKIP

This wizard MUST be executed sequentially. Each phase depends on the previous one.

## Generation Process Overview

### ✅ **Phase 0.0: Project Information Collection (MANDATORY - User provides timeline, budget, organization)**
### ✅ Phase 0: R&D Eligibility Validation (MANDATORY - TRL 2-7 filtering)
### ✅ **Phase 0.5: Interactive Key Result Selection (MANDATORY - User chooses which KRs to include)**
### Phase 1: Pre-flight Validation
### Phase 2: EPF Data Extraction
### Phase 3: Content Synthesis (Frascati Compliance)
### Phase 4: Document Assembly
### Phase 5: Budget Allocation

**⚠️ STOP AFTER PHASE 0.5 AND GET USER CONFIRMATION BEFORE PROCEEDING TO PHASE 1**

---

## Phase 0.0: Project Information Collection

⚠️ **MANDATORY FIRST STEP - EPF DOES NOT CONTAIN THIS INFORMATION**

**Critical Context:** The EPF roadmap contains strategic Key Results with TRL progression and technical hypotheses, but it does NOT contain:
- Specific project start/end dates (EPF has phases/cycles, not calendar dates)
- Total budget amounts (EPF has strategic goals, not detailed financial planning)
- Organization details (name, org number, contact persons)

These are **implementation details** that exist outside EPF and must be provided by the user.

### Step 0.0.1: Collect Organization Information

```python
print("=" * 80)
print("📋 SKATTEFUNN APPLICATION SETUP - Organization Information")
print("=" * 80)
print()
print("First, I need information about your organization.")
print("This information is required for Section 1 of the application.")
print()

# Organization details
org_name = input("Organization name (legal entity): ").strip()
if not org_name:
    print("❌ Organization name is required")
    exit(1)

org_number = input("Organization number (9 digits): ").strip()
if not org_number or len(org_number) != 9 or not org_number.isdigit():
    print("❌ Valid 9-digit organization number is required")
    exit(1)

manager_name = input("Manager/CEO name: ").strip()
if not manager_name:
    print("❌ Manager name is required")
    exit(1)

print()
print("The SkatteFUNN application requires 3 mandatory roles:")
print("1. Creator of Application (person submitting)")
print("2. Organization Representative (person approving)")
print("3. Project Leader (person managing R&D activities)")
print()
print("Note: The same person can fill multiple roles.")
print()

# Role 1: Creator
print("--- Role 1: Creator of Application ---")
creator_name = input("Name: ").strip()
creator_email = input("Email: ").strip()
creator_phone = input("Phone (format: +47 XX XX XX XX): ").strip()

# Role 2: Organization Representative
print()
print("--- Role 2: Organization Representative ---")
print(f"Use same person as Creator ({creator_name})? [Y/n]: ", end='')
same_as_creator = input().strip().lower()

if same_as_creator in ['y', 'yes', '']:
    org_rep_name = creator_name
    org_rep_email = creator_email
    org_rep_phone = creator_phone
else:
    org_rep_name = input("Name: ").strip()
    org_rep_email = input("Email: ").strip()
    org_rep_phone = input("Phone: ").strip()

# Role 3: Project Leader
print()
print("--- Role 3: Project Leader ---")
print(f"Use same person as Creator ({creator_name})? [Y/n]: ", end='')
same_as_creator_pl = input().strip().lower()

if same_as_creator_pl in ['y', 'yes', '']:
    project_leader_name = creator_name
    project_leader_email = creator_email
    project_leader_phone = creator_phone
else:
    project_leader_name = input("Name: ").strip()
    project_leader_email = input("Email: ").strip()
    project_leader_phone = input("Phone: ").strip()

# Store organization data
organization_info = {
    'name': org_name,
    'org_number': org_number,
    'manager_name': manager_name,
    'creator': {
        'name': creator_name,
        'email': creator_email,
        'phone': creator_phone
    },
    'org_representative': {
        'name': org_rep_name,
        'email': org_rep_email,
        'phone': org_rep_phone
    },
    'project_leader': {
        'name': project_leader_name,
        'email': project_leader_email,
        'phone': project_leader_phone
    }
}

print()
print("✅ Organization information collected")
print()
```

### Step 0.0.2: Collect Project Timeline

```python
print("=" * 80)
print("📅 PROJECT TIMELINE")
print("=" * 80)
print()
print("SkatteFUNN applications need specific start and end dates.")
print("Note: EPF roadmap has phases/cycles but not calendar dates.")
print()
print("Guidelines:")
print("- Applications can be retroactive (costs already incurred can be claimed)")
print("- Maximum project duration: 48 months (4 years)")
print("- Projects can span multiple calendar years")
print()

# Project start date
while True:
    start_date_str = input("Project start date (YYYY-MM-DD): ").strip()
    try:
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
        break
    except ValueError:
        print("❌ Invalid date format. Use YYYY-MM-DD (e.g., 2025-01-01)")

# Project end date
while True:
    end_date_str = input("Project end date (YYYY-MM-DD): ").strip()
    try:
        end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
        
        # Validate end date is after start date
        if end_date <= start_date:
            print("❌ End date must be after start date")
            continue
        
        # Calculate duration
        duration_days = (end_date - start_date).days
        duration_months = round(duration_days / 30.44)  # Average month length
        
        # Validate maximum duration (48 months)
        if duration_months > 48:
            print(f"❌ Project duration is {duration_months} months (maximum 48 months allowed)")
            print(f"   Consider splitting into multiple applications or shortening timeline")
            continue
        
        print(f"✅ Project duration: {duration_months} months ({duration_days} days)")
        break
        
    except ValueError:
        print("❌ Invalid date format. Use YYYY-MM-DD (e.g., 2027-12-31)")

# Store timeline data
timeline_info = {
    'start_date': start_date,
    'end_date': end_date,
    'duration_months': duration_months,
    'duration_days': duration_days,
    'application_date': datetime.now().date()
}

print()
print("✅ Project timeline collected")
print()
```

### Step 0.0.3: Collect Budget Information

```python
print("=" * 80)
print("💰 TOTAL BUDGET")
print("=" * 80)
print()
print("SkatteFUNN requires a total R&D budget for the project period.")
print("Note: EPF roadmap defines strategic goals, not detailed budgets.")
print()
print("Guidelines:")
print("- Maximum base: 25 million NOK per company per income year")
print("- Budget should cover: Personnel, Equipment, Other Operating Costs, Overhead")
print("- We'll allocate this total across work packages based on selected Key Results")
print()

while True:
    total_budget_str = input("Total R&D budget (NOK, e.g., 3250000): ").strip()
    try:
        total_budget = int(total_budget_str.replace(' ', '').replace(',', ''))
        
        if total_budget <= 0:
            print("❌ Budget must be positive")
            continue
        
        if total_budget > 25_000_000:
            print(f"⚠️  WARNING: Budget ({total_budget:,} NOK) exceeds SkatteFUNN annual maximum (25M NOK)")
            print(f"   You can still apply, but only 25M NOK per year is eligible for tax deduction")
            confirm = input("   Continue with this budget? [y/N]: ").strip().lower()
            if confirm not in ['y', 'yes']:
                continue
        
        print(f"✅ Total budget: {total_budget:,} NOK")
        break
        
    except ValueError:
        print("❌ Invalid number format. Enter digits only (e.g., 3250000)")

# Calculate years covered by project
years_covered = []
current_year = start_date.year
while current_year <= end_date.year:
    years_covered.append(current_year)
    current_year += 1

print(f"   Project spans {len(years_covered)} calendar years: {', '.join(map(str, years_covered))}")

# Store budget data
budget_info = {
    'total_budget': total_budget,
    'years_covered': years_covered,
    'num_years': len(years_covered)
}

print()
print("✅ Budget information collected")
print()
```

### Step 0.0.4: Collect EPF Instance Path

```python
print("=" * 80)
print("📁 EPF INSTANCE PATH")
print("=" * 80)
print()
print("Finally, I need the path to your EPF instance (READY phase artifacts).")
print()
print("Example: docs/EPF/_instances/emergent")
print("This directory should contain READY/ folder with:")
print("  - 00_north_star.yaml")
print("  - 04_strategy_formula.yaml")
print("  - 05_roadmap_recipe.yaml")
print("  - (other EPF artifacts)")
print()

while True:
    epf_instance_path = input("EPF instance path: ").strip()
    
    # Validate path exists
    ready_path = f"{epf_instance_path}/READY"
    if not os.path.exists(ready_path):
        print(f"❌ Path does not exist: {ready_path}")
        print(f"   Make sure you're providing the path to the EPF instance directory")
        continue
    
    # Check for required files
    required_files = [
        '00_north_star.yaml',
        '05_roadmap_recipe.yaml'
    ]
    
    missing_files = []
    for filename in required_files:
        filepath = f"{ready_path}/{filename}"
        if not os.path.exists(filepath):
            missing_files.append(filename)
    
    if missing_files:
        print(f"❌ Missing required EPF files in {ready_path}:")
        for filename in missing_files:
            print(f"   - {filename}")
        continue
    
    print(f"✅ EPF instance found: {epf_instance_path}")
    break

# Store EPF path
epf_info = {
    'instance_path': epf_instance_path,
    'ready_path': ready_path
}

print()
print("✅ EPF instance path collected")
print()
```

### Step 0.0.5: Confirmation Summary

```python
print("=" * 80)
print("✅ PROJECT INFORMATION COLLECTION COMPLETE")
print("=" * 80)
print()
print("Summary of collected information:")
print()
print(f"Organization: {organization_info['name']} ({organization_info['org_number']})")
print(f"Project Period: {timeline_info['start_date']} to {timeline_info['end_date']} ({timeline_info['duration_months']} months)")
print(f"Total Budget: {budget_info['total_budget']:,} NOK across {budget_info['num_years']} years")
print(f"EPF Instance: {epf_info['instance_path']}")
print()
print(f"Contact Persons:")
print(f"  - Creator: {organization_info['creator']['name']} ({organization_info['creator']['email']})")
print(f"  - Org Representative: {organization_info['org_representative']['name']}")
print(f"  - Project Leader: {organization_info['project_leader']['name']}")
print()
print("Proceeding to Phase 0: R&D Eligibility Validation...")
print()

# Store all user input for later phases
user_input = {
    'organization': organization_info,
    'timeline': timeline_info,
    'budget': budget_info,
    'epf': epf_info
}
```

**⚠️ CRITICAL:** This user_input object is now available for ALL subsequent phases. Do NOT invent or assume any of these values in later phases.

---

## Phase 0: R&D Eligibility Validation

**⚠️ CRITICAL: This phase is MANDATORY. Do not proceed without passing validation.**

SkatteFUNN only funds **technical R&D** (TRL 2-7), not product development. The roadmap uses universal TRL scale (1-9) across all tracks, but SkatteFUNN applications MUST filter to TRL 2-7 only.

**TRL Scope:**
- **TRL 1**: Basic research - too early for SkatteFUNN (excluded from application)
- **TRL 2-7**: R&D phase - SkatteFUNN eligible (included in application)
- **TRL 8-9**: Production/operations - proven methods (excluded from application)

All Key Results in the roadmap MUST have TRL fields (trl_start, trl_target, trl_progression), but only TRL 2-7 KRs will be included in the application.

### Step 0.1: Load Roadmap and Validate TRL Fields

```python
# Use EPF path collected in Phase 0.0
roadmap_path = f"{user_input['epf']['ready_path']}/05_roadmap_recipe.yaml"
roadmap_data = load_yaml(roadmap_path)

# Extract ALL tracks (product, strategy, org_ops, commercial, research_and_development)
tracks = roadmap_data.get('roadmap', {}).get('tracks', {})

if not tracks:
    print("❌ No tracks found in roadmap")
    exit(1)

# Validate that ALL KRs have TRL fields
all_krs = []
missing_trl_errors = []

for track_name, track_data in tracks.items():
    for okr in track_data.get('okrs', []):
        for kr in okr.get('key_results', []):
            kr_ref = f"{track_name}/{okr['id']}/{kr['id']}"
            
            # Check required TRL fields
            if 'trl_start' not in kr:
                missing_trl_errors.append(f"{kr_ref}: missing 'trl_start'")
            if 'trl_target' not in kr:
                missing_trl_errors.append(f"{kr_ref}: missing 'trl_target'")
            if 'trl_progression' not in kr:
                missing_trl_errors.append(f"{kr_ref}: missing 'trl_progression'")
            
            if missing_trl_errors:
                continue
                
            all_krs.append({
                'track': track_name,
                'okr_id': okr['id'],
                'okr_objective': okr['objective'],
                'kr': kr,
                'kr_ref': kr_ref
            })

if missing_trl_errors:
    print("❌ TRL validation failed - missing required fields:")
    for error in missing_trl_errors[:10]:  # Show first 10 errors
        print(f"   - {error}")
    if len(missing_trl_errors) > 10:
        print(f"   ... and {len(missing_trl_errors) - 10} more errors")
    print("\n💡 All Key Results MUST have: trl_start, trl_target, trl_progression")
    print("   See: docs/EPF/schemas/UNIVERSAL_TRL_FRAMEWORK.md")
    exit(1)

print(f"✅ Found {len(all_krs)} Key Results with TRL fields across {len(tracks)} tracks")
```

**If TRL fields missing:** Show error and reference UNIVERSAL_TRL_FRAMEWORK.md.

### Step 0.2: Filter to SkatteFUNN-Eligible KRs (TRL 2-7 Only)

```python
def filter_skattefunn_eligible_krs(all_krs, budget_period):
    """
    Filter Key Results to only include TRL 2-7 (SkatteFUNN eligible).
    Exclude TRL 1 (too early) and TRL 8-9 (production, not R&D).
    
    Returns: (eligible_krs: list, excluded_krs: list, errors: list)
    """
    eligible_krs = []
    excluded_krs = []
    errors = []
    
    for kr_data in all_krs:
        kr = kr_data['kr']
        kr_ref = kr_data['kr_ref']
        
        # Parse TRL range
        trl_start = kr.get('trl_start')
        trl_target = kr.get('trl_target')
        
        # Validate TRL values
        if not isinstance(trl_start, int) or not isinstance(trl_target, int):
            errors.append(f"{kr_ref}: trl_start/trl_target must be integers (got {type(trl_start).__name__}/{type(trl_target).__name__})")
            continue
        
        if trl_start < 1 or trl_start > 9:
            errors.append(f"{kr_ref}: trl_start={trl_start} outside valid range (1-9)")
            continue
            
        if trl_target < 1 or trl_target > 9:
            errors.append(f"{kr_ref}: trl_target={trl_target} outside valid range (1-9)")
            continue
        
        if trl_target < trl_start:
            errors.append(f"{kr_ref}: trl_target ({trl_target}) cannot be less than trl_start ({trl_start})")
            continue
        
        # Check SkatteFUNN eligibility (TRL 2-7 only)
        if trl_start >= 2 and trl_target <= 7:
            # ELIGIBLE: Both start and target within TRL 2-7
            
            # Validate R&D fields for eligible KRs
            required_rnd_fields = {
                'technical_hypothesis': 'What technical/business question are you testing?',
                'experiment_design': 'How will you test this hypothesis?',
                'success_criteria': 'What measurable outcome proves success?',
                'uncertainty_addressed': 'What is unpredictable about this?',
                'estimated_duration': 'How long will this activity take?',
                'estimated_budget': 'How much will this cost?'
            }
            
            missing_fields = []
            for field, explanation in required_rnd_fields.items():
                if field not in kr or not kr[field]:
                    missing_fields.append(f"  - {field}: {explanation}")
            
            if missing_fields:
                errors.append(f"{kr_ref} (TRL {trl_start}→{trl_target}): Missing R&D fields:\n" + "\n".join(missing_fields))
                continue
            
            # Check if KR timeline overlaps with budget period
            kr_timeline = estimate_kr_timeline(kr, kr_data['okr_objective'])
            if overlaps_with_budget_period(kr_timeline, budget_period):
                eligible_krs.append(kr_data)
            else:
                excluded_krs.append({
                    **kr_data,
                    'exclusion_reason': f"Timeline outside budget period ({kr_timeline['start']} to {kr_timeline['end']})"
                })
        
        elif trl_start == 1 or trl_target == 1:
            # EXCLUDED: TRL 1 (basic research, too early)
            excluded_krs.append({
                **kr_data,
                'exclusion_reason': f"TRL 1 not eligible for SkatteFUNN (basic research phase)"
            })
        
        elif trl_start >= 8 or trl_target >= 8:
            # EXCLUDED: TRL 8-9 (production/operations, proven methods)
            excluded_krs.append({
                **kr_data,
                'exclusion_reason': f"TRL {trl_start}→{trl_target} not eligible for SkatteFUNN (production phase, not R&D)"
            })
        
        else:
            # EXCLUDED: Spans across eligibility boundary (e.g., TRL 1→3, TRL 6→8)
            excluded_krs.append({
                **kr_data,
                'exclusion_reason': f"TRL {trl_start}→{trl_target} spans outside TRL 2-7 eligibility window"
            })
    
    return eligible_krs, excluded_krs, errors
```

### Step 0.3: Validate Budget Coverage

```python
def validate_budget_coverage(eligible_krs, total_budget, budget_period):
    """
    Ensure TRL 2-7 Key Results collectively justify the total budget.
    
    Returns: (valid: bool, coverage_report: dict)
    """
    # Sum estimated budgets from eligible TRL 2-7 KRs
    total_eligible_budget = sum(kr_data['kr']['estimated_budget'] for kr_data in eligible_krs)
    
    coverage_percentage = (total_eligible_budget / total_budget) * 100 if total_budget > 0 else 0
    budget_gap = total_budget - total_eligible_budget
    
    # Requirements:
    # - Must cover at least 80% of total budget (20% tolerance for overhead/contingency)
    # - Must have at least 5 distinct R&D activities (not just 1-2 big experiments)
    
    valid = (
        coverage_percentage >= 80 and
        len(eligible_krs) >= 5 and
        budget_gap >= 0  # Can't exceed budget
    )
    
    coverage_report = {
        'total_budget': total_budget,
        'total_eligible_budget': total_eligible_budget,
        'coverage_percentage': coverage_percentage,
        'budget_gap': budget_gap,
        'num_eligible_activities': len(eligible_krs),
        'valid': valid,
        'issues': []
    }
    
    if coverage_percentage < 80:
        coverage_report['issues'].append(
            f"TRL 2-7 budget ({total_eligible_budget:,} NOK) covers only {coverage_percentage:.1f}% of total budget. "
            f"Need {total_budget * 0.8:,.0f} NOK minimum (80% threshold). "
            f"Add more TRL 2-7 KRs or reduce TRL 1/8-9 work."
        )
    
    if len(eligible_krs) < 5:
        coverage_report['issues'].append(
            f"Only {len(eligible_krs)} TRL 2-7 activities found. Need at least 5 distinct experiments/validations."
        )
    
    if budget_gap < 0:
        coverage_report['issues'].append(
            f"TRL 2-7 budgets exceed total budget by {abs(budget_gap):,} NOK. Reduce individual KR budgets."
        )
    
    return valid, coverage_report
```

### Step 0.4: Validate Timeline Coverage

```python
def validate_timeline_coverage(eligible_krs, budget_period):
    """
    Ensure TRL 2-7 activities span the entire SkatteFUNN period (no large gaps).
    
    Returns: (valid: bool, timeline_report: dict)
    """
    # Sort eligible KRs by start date
    sorted_krs = sorted(eligible_krs, key=lambda x: estimate_kr_timeline(x['kr'], x['okr_objective'])['start_date'])
    
    gaps = []
    last_end_date = budget_period['start_date']
    
    for kr_data in sorted_krs:
        kr_timeline = estimate_kr_timeline(kr_data['kr'], kr_data['okr_objective'])
        kr_start = kr_timeline['start_date']
        gap_months = months_between(last_end_date, kr_start)
        
        # Flag gaps > 3 months (suggests missing R&D activities)
        if gap_months > 3:
            gaps.append({
                'start': last_end_date,
                'end': kr_start,
                'duration_months': gap_months
            })
        
        last_end_date = max(last_end_date, kr_timeline['end_date'])
    
    # Check if TRL 2-7 activities reach the end of budget period
    final_gap_months = months_between(last_end_date, budget_period['end_date'])
    if final_gap_months > 3:
        gaps.append({
            'start': last_end_date,
            'end': budget_period['end_date'],
            'duration_months': final_gap_months
        })
    
    valid = len(gaps) == 0
    
    timeline_report = {
        'budget_period': budget_period,
        'trl_2_7_span': {
            'start': sorted_krs[0]['timeline']['start_date'] if sorted_krs else None,
            'end': sorted_krs[-1]['timeline']['end_date'] if sorted_krs else None
        },
        'gaps': gaps,
        'valid': valid
    }
    
    return valid, timeline_report
```

### Step 0.5: Execute Validation and Report Results

```python
# Build budget_period from user_input collected in Phase 0.0
budget_period = {
    'start_date': user_input['timeline']['start_date'],
    'end_date': user_input['timeline']['end_date'],
    'total_budget': user_input['budget']['total_budget']
}

print("🔍 Validating SkatteFUNN eligibility (TRL 2-7 filter)...")
print(f"   Budget period: {budget_period['start_date']} to {budget_period['end_date']}")
print(f"   Total budget: {budget_period['total_budget']:,} NOK")
print()

# Step 1: Load roadmap and validate TRL fields on ALL KRs
all_krs = []  # ... (from Step 0.1)

print(f"✅ Found {len(all_krs)} Key Results with TRL fields across all tracks")

# Step 2: Filter to TRL 2-7 only (SkatteFUNN eligible)
eligible_krs, excluded_krs, filtering_errors = filter_skattefunn_eligible_krs(all_krs, budget_period)

if filtering_errors:
    print("❌ TRL filtering validation failed:")
    for error in filtering_errors[:10]:
        print(f"   - {error}")
    if len(filtering_errors) > 10:
        print(f"   ... and {len(filtering_errors) - 10} more errors")
    print()
    print("💡 Fix TRL field validation errors in roadmap")
    exit(1)

print(f"✅ Filtered to {len(eligible_krs)} TRL 2-7 Key Results (SkatteFUNN eligible)")

if excluded_krs:
    print(f"   Excluded {len(excluded_krs)} Key Results:")
    
    # Group exclusions by reason
    trl1_count = sum(1 for kr in excluded_krs if 'TRL 1' in kr['exclusion_reason'])
    trl89_count = sum(1 for kr in excluded_krs if 'TRL 8' in kr['exclusion_reason'] or 'TRL 9' in kr['exclusion_reason'])
    span_count = sum(1 for kr in excluded_krs if 'spans outside' in kr['exclusion_reason'])
    timeline_count = sum(1 for kr in excluded_krs if 'Timeline outside' in kr['exclusion_reason'])
    
    if trl1_count > 0:
        print(f"     • {trl1_count} at TRL 1 (basic research, too early)")
    if trl89_count > 0:
        print(f"     • {trl89_count} at TRL 8-9 (production, not R&D)")
    if span_count > 0:
        print(f"     • {span_count} spanning outside TRL 2-7")
    if timeline_count > 0:
        print(f"     • {timeline_count} outside budget period")
    print()

# Step 3: Validate budget coverage
budget_valid, budget_report = validate_budget_coverage(eligible_krs, budget_period['total_budget'], budget_period)

print(f"   TRL 2-7 Budget: {budget_report['total_eligible_budget']:,} NOK ({budget_report['coverage_percentage']:.1f}% of total)")
print(f"   Eligible Activities: {budget_report['num_eligible_activities']} experiments")

if not budget_valid:
    print("❌ Budget coverage validation failed:")
    for issue in budget_report['issues']:
        print(f"   - {issue}")
    print()
    show_interactive_guidance_expand_eligible_activities(budget_report, excluded_krs)
    exit(1)

print("✅ Budget coverage validated (≥80% TRL 2-7)")

# Step 4: Validate timeline coverage
timeline_valid, timeline_report = validate_timeline_coverage(eligible_krs, budget_period)

if not timeline_valid:
    print("❌ Timeline coverage validation failed:")
    print(f"   Found {len(timeline_report['gaps'])} gaps in TRL 2-7 activity timeline:")
    for gap in timeline_report['gaps']:
        print(f"   - {gap['start']} to {gap['end']} ({gap['duration_months']} months)")
    print()
    show_interactive_guidance_fill_timeline_gaps(timeline_report)
    exit(1)

print("✅ Timeline coverage validated")
print()

# Step 5: Present eligible KRs for user selection
selected_krs = present_kr_selection_interface(eligible_krs, budget_report)

if not selected_krs:
    print("❌ No Key Results selected. Cannot generate application.")
    exit(1)

# Recalculate budget with user selection
selected_budget = sum(kr_data['kr']['estimated_budget'] for kr_data in selected_krs)
selected_coverage = (selected_budget / budget_period['total_budget']) * 100 if budget_period['total_budget'] > 0 else 0

print()
print("🎉 SkatteFUNN application scope confirmed!")
print(f"   Selected: {len(selected_krs)} Key Results (from {len(eligible_krs)} eligible)")
print(f"   Selected budget: {selected_budget:,} NOK ({selected_coverage:.1f}% of total)")
print()
print("📝 Proceeding with application generation using selected Key Results...")
```

**Note:** The `selected_krs` list contains user-approved TRL 2-7 Key Results. All subsequent phases (Work Package generation, budget allocation, narrative synthesis) will use this curated list.

---

---

## Phase 0.5: Interactive Key Result Selection

⚠️ **MANDATORY STEP - DO NOT SKIP OR AUTOMATE WITHOUT USER INPUT**

After validation passes, you MUST present eligible TRL 2-7 KRs to the user for review and selection. 

**Why this step exists:**
- Not all eligible KRs need to be included in a specific application
- User may want to split R&D across multiple applications (e.g., Core in 2025, EPF-Runtime in 2026)
- User may want to prioritize certain KRs based on strategic importance
- User may want to adjust budget allocation across KRs

**Before proceeding to document generation, you MUST:**
1. Show ALL eligible KRs with their details (TRL, hypothesis, budget)
2. Ask user which KRs to include
3. Get explicit confirmation from user
4. Only then proceed to Phase 1

### Selection Interface Implementation

```python
def present_kr_selection_interface(eligible_krs, budget_report):
    """
    Present eligible TRL 2-7 Key Results for user review and selection.
    
    User can:
    - Review each KR's details (description, TRL, hypothesis, budget)
    - Select which KRs to include in THIS application
    - See running totals (selected KRs, budget, coverage %)
    
    Returns: list of selected KR data objects
    """
    
    print("=" * 80)
    print("📋 KEY RESULT SELECTION - Review TRL 2-7 Eligible Activities")
    print("=" * 80)
    print()
    print(f"Found {len(eligible_krs)} eligible Key Results from your roadmap.")
    print(f"Total eligible budget: {budget_report['total_eligible_budget']:,} NOK")
    print()
    print("ℹ️  Not all eligible KRs need to be included in this specific application.")
    print("   Review each KR and select which ones to include.")
    print()
    
    # Group KRs by track for organized presentation
    krs_by_track = {}
    for kr_data in eligible_krs:
        track = kr_data['track']
        if track not in krs_by_track:
            krs_by_track[track] = []
        krs_by_track[track].append(kr_data)
    
    # Track selections
    selected = {}  # kr_ref -> bool
    
    # Present KRs grouped by track
    for track_name in sorted(krs_by_track.keys()):
        track_krs = krs_by_track[track_name]
        
        print(f"\n{'─' * 80}")
        print(f"🎯 {track_name.upper().replace('_', ' ')} TRACK - {len(track_krs)} KRs")
        print(f"{'─' * 80}\n")
        
        for i, kr_data in enumerate(track_krs, 1):
            kr = kr_data['kr']
            kr_ref = kr_data['kr_ref']
            
            print(f"[{i}] {kr['id']} - {kr['description'][:80]}")
            print(f"    TRL: {kr['trl_start']} → {kr['trl_target']} ({kr['trl_progression']})")
            print(f"    Budget: {kr['estimated_budget']:,} NOK")
            print(f"    Duration: {kr.get('estimated_duration', 'Not specified')}")
            
            # Show key R&D fields (truncated)
            if 'technical_hypothesis' in kr and kr['technical_hypothesis']:
                hypothesis_preview = kr['technical_hypothesis'][:100] + "..." if len(kr['technical_hypothesis']) > 100 else kr['technical_hypothesis']
                print(f"    Hypothesis: {hypothesis_preview}")
            
            if 'uncertainty_addressed' in kr and kr['uncertainty_addressed']:
                uncertainty_preview = kr['uncertainty_addressed'][:100] + "..." if len(kr['uncertainty_addressed']) > 100 else kr['uncertainty_addressed']
                print(f"    Uncertainty: {uncertainty_preview}")
            
            print()
            
            # Ask user to include/exclude
            while True:
                response = input(f"    Include in application? [Y/n/details]: ").strip().lower()
                
                if response == 'details' or response == 'd':
                    # Show full details
                    print("\n    " + "─" * 76)
                    print(f"    FULL DETAILS: {kr['id']}")
                    print("    " + "─" * 76)
                    print(f"    Description: {kr['description']}")
                    print(f"    TRL Progression: {kr['trl_progression']}")
                    print(f"    \n    Technical Hypothesis:\n    {kr.get('technical_hypothesis', 'N/A')}")
                    print(f"    \n    Experiment Design:\n    {kr.get('experiment_design', 'N/A')}")
                    print(f"    \n    Success Criteria:\n    {kr.get('success_criteria', 'N/A')}")
                    print(f"    \n    Uncertainty Addressed:\n    {kr.get('uncertainty_addressed', 'N/A')}")
                    print(f"    \n    Duration: {kr.get('estimated_duration', 'N/A')}")
                    print(f"    Budget: {kr['estimated_budget']:,} NOK")
                    if 'budget_breakdown' in kr:
                        print(f"    Budget Breakdown: Personnel {kr['budget_breakdown'].get('personnel', 0)}%, "
                              f"Equipment {kr['budget_breakdown'].get('equipment', 0)}%, "
                              f"Overhead {kr['budget_breakdown'].get('overhead', 0)}%")
                    print("    " + "─" * 76 + "\n")
                    continue
                
                elif response in ['y', 'yes', '']:
                    selected[kr_ref] = True
                    print(f"    ✅ Included\n")
                    break
                
                elif response in ['n', 'no']:
                    selected[kr_ref] = False
                    print(f"    ⏭️  Skipped\n")
                    break
                
                else:
                    print("    Invalid response. Enter 'y' (yes), 'n' (no), or 'details' for full info.")
    
    # Show selection summary
    selected_krs = [kr_data for kr_data in eligible_krs if selected.get(kr_data['kr_ref'], False)]
    selected_budget = sum(kr_data['kr']['estimated_budget'] for kr_data in selected_krs)
    selected_coverage = (selected_budget / budget_report['total_budget']) * 100 if budget_report['total_budget'] > 0 else 0
    
    print("\n" + "=" * 80)
    print("📊 SELECTION SUMMARY")
    print("=" * 80)
    print(f"Selected: {len(selected_krs)} of {len(eligible_krs)} eligible Key Results")
    print(f"Selected Budget: {selected_budget:,} NOK ({selected_coverage:.1f}% of total)")
    print()
    
    # Validate minimum requirements still met
    if len(selected_krs) < 5:
        print("⚠️  WARNING: Selected only {len(selected_krs)} KRs (minimum 5 recommended)")
        print("   SkatteFUNN requires diverse R&D activities. Consider including more KRs.")
        print()
    
    if selected_coverage < 80:
        print(f"⚠️  WARNING: Selected budget covers only {selected_coverage:.1f}% of total (minimum 80% recommended)")
        print("   Include more KRs to justify the full budget amount.")
        print()
    
    # Group by track for summary
    selected_by_track = {}
    for kr_data in selected_krs:
        track = kr_data['track']
        if track not in selected_by_track:
            selected_by_track[track] = []
        selected_by_track[track].append(kr_data)
    
    print("Selected KRs by track:")
    for track_name, track_krs in sorted(selected_by_track.items()):
        track_budget = sum(kr_data['kr']['estimated_budget'] for kr_data in track_krs)
        print(f"  • {track_name}: {len(track_krs)} KRs ({track_budget:,} NOK)")
    print()
    
    # Confirm selection
    while True:
        confirm = input("Proceed with this selection? [Y/n/restart]: ").strip().lower()
        
        if confirm in ['y', 'yes', '']:
            return selected_krs
        
        elif confirm in ['n', 'no']:
            print("\n❌ Selection cancelled. Exiting wizard.")
            return []
        
        elif confirm == 'restart' or confirm == 'r':
            print("\n🔄 Restarting selection process...\n")
            return present_kr_selection_interface(eligible_krs, budget_report)
        
        else:
            print("Invalid response. Enter 'y' (proceed), 'n' (cancel), or 'restart'.")
```

---

### Step 0.6: Interactive Guidance - Insufficient TRL 2-7 Coverage

**If budget coverage < 80% or fewer than 5 eligible activities:**

```markdown
❌ **Insufficient TRL 2-7 Coverage for SkatteFUNN**

**Issue:** Your roadmap has {len(eligible_krs)} TRL 2-7 Key Results covering {coverage_percentage:.1f}% of budget.

**SkatteFUNN Requirements:**
- ✅ Minimum 5 distinct R&D activities (experiments/validations)
- ✅ Minimum 80% of total budget for TRL 2-7 work
- Current: {len(eligible_krs)} activities, {coverage_percentage:.1f}% coverage

**Your Current Roadmap:**
- Total KRs: {len(all_krs)}
- TRL 2-7 (eligible): {len(eligible_krs)} ({budget_report['total_eligible_budget']:,} NOK)
- TRL 1 (too early): {trl1_count} KRs
- TRL 8-9 (production): {trl89_count} KRs
- Outside budget period: {timeline_count} KRs

**Why this matters:** SkatteFUNN only funds **innovation work** (TRL 2-7), not:
- TRL 1: Basic research (too early, no clear application)
- TRL 8-9: Production operations (proven methods, no uncertainty)

---

**ACTION OPTIONS:**

## Option A: Add More TRL 2-7 Key Results

Add innovation KRs across ANY track (product, strategy, org_ops, commercial). Examples:

### Product Track (Technical Innovation)
```yaml
key_results:
  - id: kr-p-015
    description: Validate hybrid vector+graph search improves accuracy >20%
    trl_start: 3
    trl_target: 5
    trl_progression: "TRL 3 → TRL 5"
    technical_hypothesis: "Combining vector similarity with graph traversal will outperform pure vector search for multi-hop reasoning tasks"
    experiment_design: "Build 3 prototype implementations: (1) pure vector, (2) pure graph, (3) hybrid. Benchmark on 500 test queries with known correct answers."
    success_criteria: "Hybrid approach achieves >20% higher accuracy than vector-only baseline (measured by F1 score)"
    uncertainty_addressed: "Unknown if hybrid approach complexity justifies accuracy gains, or if graph traversal overhead negates benefits"
    estimated_duration: "3 months"
    estimated_budget: 420000
    budget_breakdown:
      personnel: 70
      equipment: 20
      overhead: 10
```

### Strategy Track (Market Innovation)
```yaml
key_results:
  - id: kr-s-008
    description: Validate enterprise buyers prefer self-service vs sales-led onboarding
    trl_start: 2
    trl_target: 4
    trl_progression: "TRL 2 → TRL 4"
    technical_hypothesis: "B2B SaaS buyers in 50-200 person companies prefer self-service signup with immediate product access over scheduled demos"
    experiment_design: "Launch dual-track onboarding: (A) instant signup + trial, (B) demo request + sales call. Track conversion rates, time-to-value, and customer satisfaction for 100 leads per track."
    success_criteria: "Self-service track converts >15% to paid (vs <10% sales-led) AND achieves 3x faster time-to-first-value"
    uncertainty_addressed: "Unknown if mid-market buyers trust self-service for complex knowledge management tools, or require human validation"
    estimated_duration: "4 months"
    estimated_budget: 280000
```

### OrgOps Track (Process Innovation)
```yaml
key_results:
  - id: kr-o-006
    description: Test if weekly retrospectives reduce sprint planning time by >30%
    trl_start: 2
    trl_target: 4
    trl_progression: "TRL 2 → TRL 4"
    technical_hypothesis: "Continuous knowledge capture via weekly retrospectives reduces next-sprint planning time because less context reconstruction needed"
    experiment_design: "Run 8-week A/B test: Team A (weekly retros + lightweight planning), Team B (traditional bi-weekly planning). Measure planning duration, decision quality, team satisfaction."
    success_criteria: "Team A planning takes <2 hours (vs 3+ hours Team B) with equal/better sprint outcomes"
    uncertainty_addressed: "Unknown if retro overhead pays off via planning efficiency, or if it's net-negative on total time investment"
    estimated_duration: "2 months"
    estimated_budget: 180000
```

## Option B: Reduce TRL 8-9 Work Scope

Review your {trl89_count} TRL 8-9 KRs:
{list_excluded_trl89_krs(excluded_krs)}

**Consider:** Can any of these be reframed as innovation (TRL 2-7) instead of execution?

Example reframe:
- ❌ "Deploy AI chat to 1000 users" (TRL 8 → 9, execution)
- ✅ "Validate AI chat handles 1000 concurrent users <500ms p95" (TRL 6 → 7, validation)

## Option C: Adjust Budget Period

If most TRL 2-7 work happens AFTER your selected period, consider:
- Shift start date later (when innovation begins)
- Extend end date (to capture more R&D phases)

---

**Next Steps:**
1. Update roadmap with additional TRL 2-7 KRs OR adjust scope
2. Ensure each TRL 2-7 KR has ALL required fields (hypothesis, experiment, criteria, etc.)
3. Re-run wizard validation
```

```yaml
roadmap:
  tracks:
    # ... existing product, strategy, org_ops tracks ...
    
    research_and_development:
      track_objective: "Resolve technical uncertainties blocking production-grade system"
      
      okrs:
        - id: "okr-rd-001"
          objective: "Validate hybrid storage architecture for knowledge graphs"
          trl_range: "TRL 2 → TRL 5"
          
          key_results:
            - id: "kr-rd-001"
              description: "PostgreSQL pgvector latency hypothesis validated"
              technical_hypothesis: "PostgreSQL with GIN indexes can achieve <200ms p95 for hybrid vector-graph queries at 10k object scale"
              experiment_design: |
                - Create synthetic dataset (10k objects, 50k relationships)
                - Test 3 indexing strategies: GIN only, BRIN+GIN, Partitioning+GIN
                - Benchmark 100 query patterns (semantic + graph traversal)
                - Measure p95 latency, index size, write throughput impact
              success_criteria: "At least 1 strategy achieves <200ms p95 with <30% write degradation"
              uncertainty_addressed: "Unknown if general-purpose DB matches specialized graph DB performance; literature lacks hybrid workload benchmarks"
              trl_progression: "TRL 3 → TRL 4"
              measurement_method: "Automated benchmarking suite with statistical analysis"
              estimated_duration: "2 months"
              estimated_budget: 180000
              budget_breakdown:
                personnel: 126000  # 70%
                equipment: 36000   # 20%
                overhead: 18000    # 10%
              deliverables:
                - "Benchmark dataset (open-source)"
                - "Performance comparison white paper"
                - "Selected indexing strategy with justification"
```

3. Repeat for all technical uncertainties in your project
4. Ensure R&D activities cover your budget period ({budget_start} to {budget_end})
5. Sum `estimated_budget` across all KRs should equal ~{total_budget:,} NOK

**Need help?** See examples in: `docs/EPF/outputs/skattefunn-application/ROADMAP_R&D_ALIGNMENT_ANALYSIS.md`

## Option 2: Convert Existing Product KRs (Faster but Lower Quality)

Your existing roadmap has product-focused Key Results like:
{list_existing_product_krs()}

I can help you **convert these to R&D format** by extracting the technical uncertainties:

**Example conversion:**
- Product KR: "Knowledge Graph supports 10,000+ objects with <200ms query"
- R&D KR: "Validate storage architecture hypothesis: Can PostgreSQL+pgvector achieve target latency?"

Would you like me to:
1. Analyze your existing KRs
2. Suggest R&D reformulations
3. Generate template R&D track structure

[Y/N]?

---

**After creating R&D track:** Re-run this wizard to generate the SkatteFUNN application.
```

### Step 0.7: Interactive Guidance - Insufficient R&D Budget Coverage

**If R&D KRs don't cover 80% of budget:**

```markdown
⚠️ **Insufficient R&D Activities for Budget Period**

**Issue:** Your R&D Key Results total {total_rnd_budget:,} NOK, which is only {coverage_percentage:.1f}% of your {total_budget:,} NOK budget.

**SkatteFUNN requirement:** At least 80% of budget must be traceable to specific R&D activities (experiments, prototypes, validations).

**Current R&D activities ({num_rnd_activities} found):**
{list_rnd_krs_with_budgets()}

**Missing R&D budget:** {budget_gap:,} NOK

---

**Why is this happening?**

Likely causes:
1. You estimated R&D activity costs too low (not accounting for full FTE time, cloud costs, API usage)
2. You have planned R&D work that isn't documented as Key Results yet
3. Your budget includes non-R&D costs (production infrastructure, marketing, sales)

**What is eligible for SkatteFUNN?**
✅ Engineer time spent on experiments and prototypes  
✅ Cloud compute for benchmarking and testing  
✅ LLM API costs for testing different approaches  
✅ Development tools and software licenses  
✅ Research literature and dataset creation  
✅ Technical writing and documentation  

❌ Production infrastructure (not experimentation)  
❌ Marketing and sales activities  
❌ Customer support and operations  

---

**ACTION OPTIONS:**

## Option A: Add More R&D Activities (Recommended)

Break down your technical uncertainties into more granular experiments:

**Example:** Instead of one large "Validate extraction accuracy" KR, create:
1. "Test 5 prompt engineering strategies for entity extraction" (3 months, 270k NOK)
2. "Create ground truth dataset with 1,000 labeled documents" (1 month, 90k NOK)
3. "Benchmark API cost optimization techniques" (2 months, 180k NOK)
4. "Validate extraction consistency across document types" (2 months, 180k NOK)

**Guidance:** You need approximately {(budget_gap / 180000):.0f} more R&D Key Results at ~180k NOK each.

**Template for new R&D KR:**
```yaml
- id: "kr-rd-00X"
  description: "[What technical question?]"
  technical_hypothesis: "[Your hypothesis to test]"
  experiment_design: |
    - [Step 1: Setup]
    - [Step 2: Measure]
    - [Step 3: Analyze]
  success_criteria: "[Measurable outcome]"
  uncertainty_addressed: "[What is unpredictable?]"
  trl_progression: "TRL X → TRL Y"
  estimated_duration: "N months"
  estimated_budget: 180000
```

## Option B: Increase Existing R&D Budgets

Review your current R&D activities. Are the budgets realistic?

**Common underestimates:**
- Engineer time: Should be 2-3 FTE-months × 90k NOK/FTE-month = 180-270k per experiment
- Cloud costs: R&D testing can be 5-10k NOK/month (not just a few hundred)
- LLM API costs: 5-10k calls during experimentation = 50-100k NOK depending on models

**Review checklist:**
{show_budget_review_checklist_for_each_kr()}

## Option C: Reduce Total Budget (Last Resort)

If you truly cannot justify {total_budget:,} NOK in R&D activities, consider:
- Reducing budget to match actual R&D scope: {total_rnd_budget * 1.25:,.0f} NOK (with 25% overhead buffer)
- Focusing on fewer, deeper experiments rather than broad coverage
- Extending timeline to spread R&D activities (but stay within 48-month max)

---

**Next step:** Update your roadmap, then re-run the wizard.
```

### Step 0.8: Interactive Guidance - Timeline Gaps

**If R&D activities don't cover the full budget period:**

```markdown
⚠️ **Timeline Gaps in R&D Activities**

**Issue:** Your R&D Key Results don't continuously span the budget period ({budget_start} to {budget_end}).

**Gaps found ({num_gaps}):**
{list_gaps_with_durations()}

**Why this matters:** SkatteFUNN funding is for continuous R&D work. Gaps suggest:
1. Periods where you're not doing R&D (then why claim those costs?)
2. Missing R&D activities that should be planned
3. Phases transitioning from R&D to pure product development (not eligible)

---

**ACTION REQUIRED:**

## Fill Timeline Gaps with R&D Activities

For each gap, identify what technical work happens during that period:

**Gap 1: {gap_1_start} to {gap_1_end} ({gap_1_months} months)**

Possible R&D activities:
- Integration experiments combining earlier validated components
- Performance optimization and scalability testing
- User study validating technical approach effectiveness
- Failure mode analysis and robustness testing
- Documentation of findings and knowledge transfer

Add as new Key Results with proper R&D structure (hypothesis, experiment, uncertainty).

## OR: Adjust Timeline

If no R&D happens during gaps:
1. Shorten your SkatteFUNN period to exclude non-R&D phases
2. Split into multiple SkatteFUNN applications (one per R&D phase)
3. Reduce budget to match actual R&D duration

---

**Next step:** Update roadmap timeline, then re-run the wizard.
```

---

## Phase 1: Pre-flight Validation

Before starting generation, verify all required inputs and EPF sources.

### Step 1.1: Validate User Parameters

Check against `schema.json`:
- Organization details (name, org_number pattern, manager)
- Contact information (email formats, Norwegian phone numbers)
- Timeline (start/end dates, max 48 months duration)
- Budget (total ≤ 25M NOK, yearly breakdown sums correctly)
- Technical details (TRL 1-7 range, valid scientific discipline)

**Action if invalid:** Halt with specific error messages pointing to schema violations.

### Step 1.2: Verify EPF Instance Structure

```bash
EPF_INSTANCE="{user_input.epf_sources.instance_path}"

Required files:
- $EPF_INSTANCE/READY/00_north_star.yaml
- $EPF_INSTANCE/READY/04_strategy_formula.yaml
- $EPF_INSTANCE/READY/05_roadmap_recipe.yaml
- $EPF_INSTANCE/FIRE/value_models/*.value_model.yaml (min 1 file)
```

**Action if missing:** Output missing files report with guidance.

### Step 1.3: Check Required EPF Fields

For each EPF file, verify critical fields exist and are non-empty:

**North Star (00_north_star.yaml)**
- `vision.tagline` → Used for project title
- `mission.what_we_do` → Used for company activities
- `context.problem_space` → Used for project background
- `vision.long_term_goal` → Used for primary objective

**Strategy Formula (04_strategy_formula.yaml)**
- `technology.innovation_areas` → Used for R&D content
- `core_competencies` → Used for scientific discipline mapping
- `differentiation.technical` → Used for state-of-the-art comparison

**Roadmap Recipe (05_roadmap_recipe.yaml)**
- `phases[]` array → Must have at least 2 phases
- `phases[].name` → Used for work package names
- `phases[].duration_months` → Used for timeline and budget allocation
- `phases[].milestones[]` → Used for activity descriptions

**Value Models (FIRE/value_models/*.value_model.yaml)**
- `problem.description` → Used for problem statement
- `problem.current_limitations` → Used for state-of-the-art comparison
- `solution.technical_approach` → Used for R&D challenge description
- `solution.innovation_points` → Used for novelty demonstration

**Action if missing critical fields:** Output detailed report:

```markdown
⚠️ **EPF Data Incomplete - Generation Blocked**

The following required fields are missing for SkatteFUNN application:

**Critical (must be filled):**
- [ ] `north_star.yaml` → `context.problem_space`
  *Needed for:* Section 3.2 - Project Background
  *Impact:* Cannot explain the knowledge gap

- [ ] `strategy_formula.yaml` → `technology.innovation_areas`
  *Needed for:* Section 3.3 - R&D Content
  *Impact:* Cannot demonstrate technical uncertainty

**Recommended (generation degraded if missing):**
- [ ] `roadmap_recipe.yaml` → `phases[].milestones[]`
  *Needed for:* Section 4 - Work Packages
  *Impact:* Will use generic phase descriptions

**Action Required:**
1. Complete the marked EPF sections
2. Re-run the generator
3. Or proceed with manual input substitution (not recommended)
```

---

## Phase 2: EPF Data Extraction

Load and parse all EPF YAML files. Store in structured format for synthesis.

### Extract Pattern

```yaml
# Pseudo-structure of extracted data
extracted_data:
  vision:
    tagline: "{north_star.vision.tagline}"
    long_term_goal: "{north_star.vision.long_term_goal}"
  mission:
    what_we_do: "{north_star.mission.what_we_do}"
  context:
    problem_space: "{north_star.context.problem_space}"
  technology:
    innovation_areas: "{strategy_formula.technology.innovation_areas[]}"
    core_competencies: "{strategy_formula.core_competencies[]}"
  roadmap:
    phases: "{roadmap_recipe.phases[]}"
    total_duration_months: sum(phases[].duration_months)
  value_models:
    - problem: "{value_model_1.problem}"
      solution: "{value_model_1.solution}"
    - problem: "{value_model_2.problem}"
      solution: "{value_model_2.solution}"
```

### Generate Norwegian Title (Required for v2.0.0)

```python
def generate_norwegian_title(english_title):
    """
    Generate Norwegian translation of project title.
    Schema v2.0.0 requires both title_english and title_norwegian.
    
    Maximum length: 100 characters (enforced by official form)
    """
    # If user_input already has title_norwegian, use it
    if hasattr(user_input.project_info, 'title_norwegian') and user_input.project_info.title_norwegian:
        norwegian_title = user_input.project_info.title_norwegian
    else:
        # Interactive translation prompt
        print(f"📝 English title: {english_title}")
        print(f"   Length: {len(english_title)} characters")
        print()
        norwegian_title = input("Enter Norwegian translation (max 100 chars): ").strip()
    
    # Enforce character limit
    if len(norwegian_title) > 100:
        print(f"⚠️ Title too long ({len(norwegian_title)} chars). Truncating to 100 chars...")
        norwegian_title = norwegian_title[:97] + "..."
    
    return norwegian_title

# Usage in Phase 2
synthesized_title_english = synthesize_project_title(extracted_data)
synthesized_title_norwegian = generate_norwegian_title(synthesized_title_english)
```

---

## Phase 3: Content Synthesis (Frascati Compliance)

Transform EPF content into SkatteFUNN-compliant language. **This is the core intelligence of the generator.**

### Synthesis Rule 1: Project Title

**Input:** `north_star.vision.tagline`  
**Output Pattern:** Technical capability statement (not marketing)

```
❌ Bad: "Emergent - Empower AI with Product Intelligence"
✅ Good: "Development of a Novel Metadata Framework for Autonomous Agent Context Construction"
```

**Transformation Logic:**
- Remove marketing language
- Focus on the technical capability being developed
- Use phrases like: "Development of...", "Novel approach to...", "Advanced system for..."
- **ENFORCE: Maximum 100 characters** (official form limit)
- If synthesized text > 100 chars, trim and warn user

### Synthesis Rule 2: Project Background (Section 3.2)

**Inputs:** 
- `north_star.context.problem_space`
- `value_models[].problem.description`
- `strategy_formula.market.landscape` (if available)

**Output Pattern:** Problem → Gap → Need for R&D

```markdown
**Structure:**
1. Current situation in the industry (2-3 sentences)
2. The specific technical limitation or knowledge gap (2-3 sentences)
3. Why existing solutions are insufficient (2-3 sentences)
4. The need for systematic R&D (1-2 sentences)

**Language Requirements:**
- Use "state-of-the-art" terminology
- Cite specific existing approaches by name (RAG, vector databases, etc.)
- Explain WHY they fail technically (not just that they're "not good enough")
- Avoid business/market language - focus on technical/scientific gap
- **ENFORCE: Maximum 2000 characters** (official form limit for background/activities fields)
```

**Example Transformation:**

```yaml
# EPF Input
context.problem_space: "AI agents struggle to understand product context"

# SkatteFUNN Output
"Current AI agent architectures (e.g., OpenAI Assistants, LangChain agents) 
require manual context injection for every interaction, creating a significant 
scalability bottleneck. Existing approaches using Retrieval-Augmented Generation 
(RAG) and vector databases capture syntactic similarity but fail to represent 
semantic relationships between product features, business rules, and user intent.

The fundamental technical limitation lies in the lack of a systematic framework 
for representing evolving product knowledge in a machine-readable, inference-capable 
format. Current solutions treat product documentation as static text rather than 
dynamic knowledge graphs with temporal and causal relationships.

This knowledge gap necessitates R&D into novel metadata architectures that enable 
autonomous agents to construct context-aware representations from heterogeneous 
documentation sources without manual intervention."
```

### Synthesis Rule 3: Primary Objective (Section 3.3)

**Input:** `north_star.vision.long_term_goal`  
**Output Pattern:** SMART goal with technical focus

```markdown
**Structure:**
Main Goal: [Technical capability to be achieved]
- **ENFORCE: Maximum 1000 characters** (official form limit)

Sub-goals:
1. [Specific technical outcome 1]
2. [Specific technical outcome 2]
3. [Specific technical outcome 3]
4. [Specific technical outcome 4]
5. [Specific technical outcome 5]

**Language Requirements:**
- Use measurable/verifiable outcomes
- Focus on technical capabilities, not business results
- Avoid: "Increase revenue", "Improve user satisfaction"
- Use: "Achieve X% accuracy", "Reduce latency to Y ms", "Enable Z capability"
```

**Example Transformation:**

```yaml
# EPF Input
vision.long_term_goal: "Enable AI agents to deeply understand any product"

# SkatteFUNN Output
**Main Goal:** 
Develop and validate a metadata-driven framework that enables autonomous AI 
agents to construct accurate, context-aware representations of product capabilities 
from heterogeneous documentation sources with ≥90% semantic fidelity.

**Sub-goals:**
1. Design a novel knowledge representation schema that captures product features, 
   business rules, and temporal evolution in a machine-readable format
2. Implement automated extraction algorithms that convert unstructured product 
   documentation into structured metadata graphs
3. Develop inference mechanisms that enable agents to reason about product 
   capabilities and constraints without explicit instruction
4. Create validation frameworks to measure context fidelity and agent decision 
   quality in product-specific scenarios
5. Demonstrate system effectiveness through pilot deployment with ≥3 distinct 
   product domains
```

### Synthesis Rule 4: R&D Challenges (Section 3.3) ⭐ **MOST CRITICAL**

**Inputs:**
- `strategy_formula.technology.innovation_areas`
- `value_models[].solution.technical_approach`
- `value_models[].problem.current_limitations`

**Output Pattern:** Technical Uncertainty Statement

```markdown
**Structure:**
The primary R&D challenges lie in [broad area]:

1. **[Challenge Name 1]**: [What is uncertain and WHY it's unpredictable]
   - Technical uncertainty: [Specific unknown]
   - Why existing approaches fail: [Technical reason]
   - Proposed investigation: [Systematic approach]

2. **[Challenge Name 2]**: [repeat structure]

3. **[Challenge Name 3]**: [repeat structure]

**Language Requirements:**
- Use "technical uncertainty", "unpredictable outcomes", "systematic investigation"
- Explain WHY outcomes cannot be known in advance
- Avoid: "it's complex", "it takes time", "requires expertise"
- Use: "non-deterministic behavior", "emergent properties", "novel integration challenges"
```

**Mandatory Phrases to Include:**
- "The main technical uncertainty lies in..."
- "Existing algorithms/methods fail to..."
- "The unpredictability stems from..."
- "Systematic R&D is required because..."

**Example Transformation:**

```yaml
# EPF Input
technology.innovation_areas:
  - "MCP-first architecture for AI tools"
  - "Dynamic context graph generation"
  - "Product metadata extraction"

# SkatteFUNN Output
**The primary R&D challenges lie in three interconnected domains:**

**1. Novel Knowledge Representation for Product Intelligence**
The main technical uncertainty lies in designing a metadata schema that captures 
both explicit product features and implicit business rules in a format that supports 
automated reasoning. Existing ontology approaches (OWL, RDF) are too rigid for 
rapidly evolving product documentation, while unstructured formats (Markdown, PDF) 
lack the semantic structure needed for agent inference.

The unpredictability stems from the need to balance expressiveness (capturing 
complex product logic) with computability (enabling real-time agent queries). 
Traditional knowledge graphs require manual curation, while fully automated 
extraction produces semantically shallow representations.

Systematic R&D is required to investigate hybrid architectures that combine 
rule-based extraction with machine learning-based semantic enhancement, where 
the optimal balance point cannot be determined without empirical testing across 
diverse product domains.

**2. Context-Aware Agent Architecture**
Existing AI agent frameworks (OpenAI Assistants, LangChain) fail to maintain 
consistent product context across multi-turn interactions due to stateless 
design patterns. The technical challenge is not simply "using AI" but developing 
novel mechanisms for persistent, evolving context that updates as product 
capabilities change.

The unpredictability arises from the non-deterministic nature of LLM outputs 
combined with the need for deterministic product constraint enforcement. Naive 
approaches produce hallucinations or outdated recommendations when product 
features evolve.

**3. Validation Framework for Context Fidelity**
No existing methodology exists for quantitatively measuring whether an AI agent 
"understands" a product correctly. The R&D challenge involves creating novel 
evaluation metrics that correlate with real-world agent decision quality, which 
requires systematic investigation as existing accuracy metrics (BLEU, ROUGE) 
are insufficient for reasoning tasks.
```

### Synthesis Rule 5: State-of-the-Art Comparison

**Inputs:**
- `value_models[].problem.current_limitations`
- `strategy_formula.differentiation.technical`

**Output Pattern:** Comparative technical analysis

```markdown
**Structure:**
Current approaches in [domain] rely on [Method A], [Method B], and [Method C].

[Method A] limitations:
- [Technical limitation 1]
- [Technical limitation 2]

[Method B] limitations:
- [Technical limitation 1]
- [Technical limitation 2]

Our R&D addresses these gaps through [novel approach], which has not been 
systematically investigated in [relevant literature/industry].

**Requirements:**
- Name specific existing solutions/frameworks
- Cite technical papers or industry standards (if known)
- Explain failures in technical terms, not business terms
```

### Synthesis Rule 6: Work Package Generation (Section 4) ⭐ **REWRITTEN FOR R&D VALIDATION**

**⚠️ CRITICAL CHANGE:** Work Packages are now **directly mapped** from validated R&D Key Results, NOT synthesized from roadmap phases.

**Input:** Validated R&D Key Results from Phase 0 (already checked for budget/timeline coverage)  
**Output Pattern:** WP1, WP2, WP3... each corresponding to 1-3 related R&D KRs

### Step 6.1: Group R&D KRs into Work Packages

```python
def group_rnd_krs_into_work_packages(validated_rnd_krs):
    """
    Group R&D Key Results into logical Work Packages.
    
    Strategy:
    1. Group by OKR (all KRs under same OKR → 1 WP)
    2. OR group by TRL progression (all KRs advancing same TRL level → 1 WP)
    3. OR group by timeline (concurrent KRs → 1 WP, sequential KRs → separate WPs)
    4. Aim for 3-7 Work Packages total (not too granular, not too coarse)
    
    Returns: list of WorkPackage objects
    """
    work_packages = []
    
    # Strategy: Group by OKR (recommended approach)
    okr_groups = group_by_okr(validated_rnd_krs)
    
    wp_number = 1
    for okr_id, krs in okr_groups.items():
        okr_objective = krs[0]['okr_objective']
        
        # Calculate WP timeline (span of all KRs)
        wp_start = min(kr['timeline']['start_date'] for kr in krs)
        wp_end = max(kr['timeline']['end_date'] for kr in krs)
        wp_duration = months_between(wp_start, wp_end)
        
        # Sum budgets
        wp_budget = sum(kr['kr']['estimated_budget'] for kr in krs)
        
        work_packages.append({
            'wp_id': f"WP{wp_number}",
            'name': okr_objective,  # Use OKR objective as WP name
            'start_date': wp_start,
            'end_date': wp_end,
            'duration_months': wp_duration,
            'budget': wp_budget,
            'rnd_krs': krs  # Store associated R&D KRs
        })
        
        wp_number += 1
    
    return work_packages
```

### Step 6.2: Generate Work Package Content (Direct Mapping)

**For each Work Package:**

```markdown
### WP{N}: {wp.name}
**Duration:** {wp.duration_months} months  
**Period:** {wp.start_date.strftime('%B %Y')} to {wp.end_date.strftime('%B %Y')}  
**Budget:** {wp.budget:,} NOK

**Technical Objective:**
{wp.rnd_krs[0]['okr_objective']}  ← Direct from roadmap OKR

**R&D Activities:**

{For each R&D KR in this WP:}

#### Activity {N}.{M}: {kr.description}

**Technical Hypothesis:**
{kr.technical_hypothesis}  ← Direct from roadmap, NO SYNTHESIS

**Experiment Design:**
{kr.experiment_design}  ← Direct from roadmap, NO SYNTHESIS
- {Step 1 from experiment_design}
- {Step 2 from experiment_design}
- {Step 3 from experiment_design}
- ...

**Success Criteria:**
{kr.success_criteria}  ← Direct from roadmap, NO SYNTHESIS

**Uncertainty Addressed:**
{kr.uncertainty_addressed}  ← Direct from roadmap, NO SYNTHESIS

**TRL Progression:**
{kr.trl_progression}  ← Direct from roadmap, NO SYNTHESIS

**Measurement Method:**
{kr.measurement_method if present else 'Quantitative analysis of experimental results'}

**Expected Deliverables:**
{For each deliverable in kr.deliverables:}
- {deliverable}  ← Direct from roadmap, NO SYNTHESIS

**Duration:** {kr.estimated_duration}  
**Allocated Budget:** {kr.estimated_budget:,} NOK

{End R&D KR loop}
```

### Step 6.3: Validate Work Package Integrity

**After generating all Work Packages, verify:**

```python
def validate_work_packages(work_packages, total_budget, budget_period):
    """
    Final sanity checks before document assembly.
    """
    issues = []
    
    # Check 1: Budget reconciliation
    total_wp_budget = sum(wp['budget'] for wp in work_packages)
    if abs(total_wp_budget - total_budget) > 1000:  # Allow 1k NOK rounding
        issues.append(
            f"Work Package budgets ({total_wp_budget:,} NOK) don't match "
            f"total budget ({total_budget:,} NOK). Difference: {total_wp_budget - total_budget:,} NOK"
        )
    
    # Check 2: Timeline coverage
    earliest_start = min(wp['start_date'] for wp in work_packages)
    latest_end = max(wp['end_date'] for wp in work_packages)
    
    if earliest_start > budget_period['start_date']:
        issues.append(f"Work Packages start {earliest_start}, but budget period starts {budget_period['start_date']}")
    
    if latest_end < budget_period['end_date']:
        issues.append(f"Work Packages end {latest_end}, but budget period ends {budget_period['end_date']}")
    
    # Check 3: No overlapping WP IDs
    wp_ids = [wp['wp_id'] for wp in work_packages]
    if len(wp_ids) != len(set(wp_ids)):
        issues.append("Duplicate Work Package IDs found")
    
    # Check 4: Every WP has at least 1 R&D KR
    for wp in work_packages:
        if len(wp['rnd_krs']) == 0:
            issues.append(f"{wp['wp_id']} has no R&D Key Results")
    
    if issues:
        print("⚠️ Work Package validation issues:")
        for issue in issues:
            print(f"   - {issue}")
        return False
    
    return True
```

### Example: Direct Mapping Output

**Roadmap R&D KR:**
```yaml
- id: "kr-rd-001"
  description: "PostgreSQL pgvector latency hypothesis validated"
  technical_hypothesis: "PostgreSQL with GIN indexes can achieve <200ms p95 for hybrid vector-graph queries at 10k object scale"
  experiment_design: |
    - Create synthetic dataset (10k objects, 50k relationships)
    - Test 3 indexing strategies: GIN only, BRIN+GIN, Partitioning+GIN
    - Benchmark 100 query patterns (semantic + graph traversal)
    - Measure p95 latency, index size, write throughput impact
  success_criteria: "At least 1 strategy achieves <200ms p95 with <30% write degradation"
  uncertainty_addressed: "Unknown if general-purpose DB matches specialized graph DB performance"
  trl_progression: "TRL 3 → TRL 4"
  estimated_duration: "2 months"
  estimated_budget: 180000
```

**Generated Work Package Section:**
```markdown
#### Activity 1.1: PostgreSQL pgvector latency hypothesis validated

**Technical Hypothesis:**
PostgreSQL with GIN indexes can achieve <200ms p95 for hybrid vector-graph 
queries at 10k object scale

**Experiment Design:**
- Create synthetic dataset (10k objects, 50k relationships)
- Test 3 indexing strategies: GIN only, BRIN+GIN, Partitioning+GIN
- Benchmark 100 query patterns (semantic + graph traversal)
- Measure p95 latency, index size, write throughput impact

**Success Criteria:**
At least 1 strategy achieves <200ms p95 with <30% write degradation

**Uncertainty Addressed:**
Unknown if general-purpose DB matches specialized graph DB performance; 
literature lacks hybrid workload benchmarks

**TRL Progression:**
TRL 3 → TRL 4

**Measurement Method:**
Quantitative analysis of experimental results

**Expected Deliverables:**
- Benchmark dataset (open-source)
- Performance comparison white paper
- Selected indexing strategy with justification

**Duration:** 2 months  
**Allocated Budget:** 180,000 NOK
```

**Key Difference from Old Approach:**

| Aspect | OLD (Synthesis) | NEW (Validation) |
|--------|-----------------|------------------|
| **Input Source** | Roadmap phases (milestones) | Roadmap R&D KRs (technical_hypothesis) |
| **Content Generation** | AI synthesizes plausible R&D | Copy exact fields from roadmap |
| **Hypothesis Source** | Inferred from milestone text | Explicit `technical_hypothesis` field |
| **Experiment Design** | AI generates generic steps | Exact `experiment_design` from roadmap |
| **Budget Origin** | Calculated from phase duration | Explicit `estimated_budget` per KR |
| **Validity** | ⚠️ Fictional (not committed to) | ✅ Real (from strategic plans) |
| **Traceability** | ❌ No roadmap link | ✅ Direct KR-to-WP mapping |

**Important:** If a Work Package contains non-R&D activities (TRL 8-9 like "Launch marketplace", "Onboard customers"), those MUST be excluded. The wizard should have already filtered these during Phase 0 validation.

---

## Phase 4: Document Assembly

**⚠️ STOP - MANDATORY PRE-FLIGHT CHECK**

**Before proceeding with Phase 4, answer these questions honestly:**

1. **Have you completed Phases 0-3?** [Y/N]
   - Phase 0: R&D eligibility validation (TRL 2-7 filtering)
   - Phase 0.5: Interactive KR selection (user chose which KRs)
   - Phase 1: Pre-flight validation (EPF data completeness)
   - Phase 2: EPF data extraction (loaded YAML files)
   - Phase 3: Content synthesis (Frascati-compliant language)

2. **Do you have all required data in memory?** [Y/N]
   - `selected_krs` - List of Key Results chosen in Phase 0.5
   - `extracted_data` - Parsed EPF YAML content from Phase 2
   - `synthesized_content` - Generated text fields from Phase 3
   - `work_packages` - Built from selected KRs in Phase 5

3. **Are you about to read template.md file?** [Y/N]
   - You MUST use `read_file` tool to load template.md
   - You MUST use template.md content as base for output
   - You will NOT invent your own structure

**If ANY answer is "N", STOP immediately:**
- ❌ Do NOT proceed to Step 4.0
- ❌ Do NOT generate any output
- ❌ Go back and complete missing phases

**If ALL answers are "Y", proceed to Step 4.0.**

---

### The ONLY Valid Generation Approach

```
✅ CORRECT:
   Load template.md → Parse structure → Replace {{variables}} → Write output

❌ WRONG:
   Invent structure → Use wizard reference → Generate content → Write output
```

**⚠️ CRITICAL: MUST read template.md file BEFORE generating output.**

### Step 4.0: Load and Validate Template (MANDATORY)

**Purpose:** Load the authoritative template file and extract structure/limits.

**Why This Step Exists:** The embedded structure example in Step 4.1 is for REFERENCE ONLY. The actual authoritative source is `template.md`. Without reading this file, the AI will generate non-compliant output.

```python
# Read the authoritative template file
template_path = "docs/EPF/outputs/skattefunn-application/template.md"
print(f"📖 Reading template from: {template_path}")

# MUST use read_file tool - do not skip this step
template_content = read_file(template_path)
print(f"✅ Template loaded ({len(template_content)} characters, {template_content.count(chr(10))} lines)")

# Extract section titles from template using regex
import re
section_pattern = r'^## Section \d+:.*$'
template_sections = re.findall(section_pattern, template_content, re.MULTILINE)

print(f"✅ Found {len(template_sections)} sections in template")

# Verify all 8 required sections present
required_sections = [
    "## Section 1: Project Owner and Roles",
    "## Section 2: About the Project",
    "## Section 3: Background and Company Activities",
    "## Section 4: Primary Objective and Innovation",
    "## Section 5: R&D Content",
    "## Section 6: Project Summary",
    "## Section 7: Work Packages",
    "## Section 8: Total Budget and Estimated Tax Deduction"
]

# Validate template structure
missing_sections = []
for section_title in required_sections:
    if section_title not in template_content:
        missing_sections.append(section_title)

if missing_sections:
    print("❌ Template validation failed - missing sections:")
    for section in missing_sections:
        print(f"   - {section}")
    raise ValueError(f"Template incomplete: {len(missing_sections)} sections missing")

print("✅ Template validation complete - all 8 sections present")
print("\n📋 Section titles to use (from template.md):")
for i, section in enumerate(required_sections, 1):
    print(f"   {i}. {section}")

# Extract character limits from template comments
# Format: {{variable}} <!-- max N characters -->
# Example: {{project_info.title_english}} <!-- max 100 characters -->
char_limits = {}
limit_pattern = r'{{([^}]+)}}[^<]*<!-- max (\d+) characters -->'
for match in re.finditer(limit_pattern, template_content):
    field_name = match.group(1)
    limit = int(match.group(2))
    char_limits[field_name] = limit

print(f"\n✅ Extracted {len(char_limits)} character limits from template")
if char_limits:
    print("📏 Character limits found:")
    for field, limit in sorted(char_limits.items())[:5]:  # Show first 5
        print(f"   - {field}: {limit} chars")
    if len(char_limits) > 5:
        print(f"   ... and {len(char_limits) - 5} more")

# Store for use in generation
template_structure = {
    'sections': required_sections,
    'char_limits': char_limits,
    'full_content': template_content
}

print("\n⚠️  CRITICAL: You MUST use template.md content - DO NOT invent structure")
print("⚠️  The ONLY valid approach: Load template.md → Replace variables → Write output")
print("⚠️  Step 4.1 shows variable mapping ONLY (not document structure)")
```

**Validation Checklist Before Proceeding:**

- [ ] ✅ template.md file read successfully
- [ ] ✅ All 8 section titles extracted
- [ ] ✅ Character limits extracted from comments
- [ ] ✅ Template structure stored in memory
- [ ] ✅ You understand: template.md is THE structure (not Step 4.1)
- [ ] ✅ You will use template_structure['full_content'] as base for output
- [ ] ✅ You will ONLY replace {{variables}} with actual values

**If ANY checkbox is unchecked, DO NOT proceed to Step 4.1.**

**If you proceed without loading template.md, you will generate INVALID output.**

---

### Step 4.1: Build Template Variable Dictionary (DO NOT Generate Structure Yet)

```python
# Map extracted and synthesized data to template variables
template_vars = {
    # Organization (nested structure)
    'organization': {
        'name': user_input.organization.name,
        'org_number': user_input.organization.org_number,
        'manager_name': user_input.organization.manager_name
    },
    
    # Contact (3 roles: creator, project_leader, org_representative)
    'contact': {
        'creator': {
            'name': user_input.contact.creator.name,
            'email': user_input.contact.creator.email,
            'phone': user_input.contact.creator.phone
        },
        'project_leader': {
            'name': user_input.contact.project_leader.name,
            'email': user_input.contact.project_leader.email,
            'phone': user_input.contact.project_leader.phone
        },
        'org_representative': {
            'name': user_input.contact.org_representative.name,
            'email': user_input.contact.org_representative.email,
            'phone': user_input.contact.org_representative.phone
        }
    },
    
    # Project Info (nested with character limits enforced)
    'project_info': {
        'title_english': synthesized_title_english[:100],  # Truncate if needed
        'title_norwegian': synthesized_title_norwegian[:100],
        'short_name': user_input.project_info.short_name[:60],
        'scientific_discipline': {
            'subject_area': user_input.project_info.scientific_discipline.subject_area,
            'subject_group': user_input.project_info.scientific_discipline.subject_group,
            'subject_discipline': user_input.project_info.scientific_discipline.subject_discipline
        },
        'area_of_use': user_input.project_info.area_of_use,
        'continuation': user_input.project_info.continuation,
        'other_applicants': user_input.project_info.other_applicants,
        'company_activities': synthesized_company_activities[:2000],
        'project_background': synthesized_project_background[:2000],
        'primary_objective': synthesized_primary_objective[:1000],
        'market_differentiation': synthesized_market_differentiation[:2000],
        'rd_content': synthesized_rd_content[:2000],
        'project_summary': synthesized_project_summary[:1000]
    },
    
    # Timeline
    'timeline': {
        'start_date': user_input.timeline.start_date,
        'end_date': user_input.timeline.end_date,
        'duration_months': user_input.timeline.duration_months,
        'application_date': user_input.timeline.application_date
    },
    
    # Work Packages (array, populated in Phase 5)
    'work_packages': []  # Will be built from selected KRs
}
```

**⚠️ DO NOT INVENT DOCUMENT STRUCTURE - You MUST use template.md**

The document structure is defined in `template.md` (loaded in Step 4.0).  
Your ONLY job in this step is to map extracted data to template variables.

**Proceed immediately to Step 4.2 for template variable substitution.**

### Step 4.2: Template Variable Substitution and Document Generation (Incremental)

**⚠️ CRITICAL: Use incremental generation to avoid token limits**

**Why Incremental Generation:**
- With 12 work packages, full document ~2600 lines (exceeds single response token limit)
- Generate section by section, write incrementally to avoid hitting limits
- Provide progress feedback after each section

**Incremental Generation Approach:**

```python
# Step 1: Set up output file path
output_filename = f"emergent-skattefunn-application-{date.today().isoformat()}.md"
output_path = os.path.join(OUTPUT_DIR, output_filename)

print(f"📝 Starting incremental document generation")
print(f"   Output: {output_path}")
print(f"   Strategy: Write sections incrementally to avoid token limits\n")

# Step 2: Build replacement dictionary for simple variables
replacements = {
    # Organization
    '{{organization.name}}': template_vars['organization']['name'],
    '{{organization.org_number}}': template_vars['organization']['org_number'],
    '{{organization.manager_name}}': template_vars['organization']['manager_name'],
    
    # Timeline
    '{{application_date}}': template_vars['application_date'],
    '{{start_date}}': template_vars['start_date'],
    '{{end_date}}': template_vars['end_date'],
    '{{duration_months}}': str(template_vars['duration_months']),
    
    # Contact roles (all 3 mandatory roles)
    '{{contact.creator.name}}': template_vars['contact']['creator']['name'],
    '{{contact.creator.email}}': template_vars['contact']['creator']['email'],
    '{{contact.creator.phone}}': template_vars['contact']['creator']['phone'],
    '{{contact.project_leader.name}}': template_vars['contact']['project_leader']['name'],
    '{{contact.project_leader.email}}': template_vars['contact']['project_leader']['email'],
    '{{contact.project_leader.phone}}': template_vars['contact']['project_leader']['phone'],
    '{{contact.org_representative.name}}': template_vars['contact']['org_representative']['name'],
    '{{contact.org_representative.email}}': template_vars['contact']['org_representative']['email'],
    '{{contact.org_representative.phone}}': template_vars['contact']['org_representative']['phone'],
    
    # Project info
    '{{project_info.title_english}}': template_vars['project_info']['title_english'],
    '{{project_info.title_norwegian}}': template_vars['project_info']['title_norwegian'],
    '{{project_info.short_name}}': template_vars['project_info']['short_name'],
    '{{project_info.scientific_discipline.subject_area}}': template_vars['project_info']['scientific_discipline']['subject_area'],
    '{{project_info.scientific_discipline.subject_group}}': template_vars['project_info']['scientific_discipline']['subject_group'],
    '{{project_info.scientific_discipline.subject_discipline}}': template_vars['project_info']['scientific_discipline']['subject_discipline'],
    '{{project_info.area_of_use}}': template_vars['project_info']['area_of_use'],
    '{{project_info.continuation}}': template_vars['project_info']['continuation'],
    '{{project_info.other_applicants}}': template_vars['project_info']['other_applicants'],
    '{{project_info.company_activities}}': template_vars['project_info']['company_activities'],
    '{{project_info.project_background}}': template_vars['project_info']['project_background'],
    '{{project_info.primary_objective}}': template_vars['project_info']['primary_objective'],
    '{{project_info.market_differentiation}}': template_vars['project_info']['market_differentiation'],
    '{{project_info.rd_content}}': template_vars['project_info']['rd_content'],
    '{{project_info.project_summary}}': template_vars['project_info']['project_summary'],
    
    # Budget
    '{{total_budget_nok}}': f"{template_vars['total_budget_nok']:,}",
    '{{company_size}}': template_vars.get('company_size', 'small company'),
    '{{tax_rate}}': str(template_vars.get('tax_rate', 20)),
    '{{total_eligible_costs_nok}}': f"{template_vars['total_eligible_costs_nok']:,}",
    '{{total_tax_deduction_nok}}': f"{template_vars['total_tax_deduction_nok']:,}",
    
    # EPF traceability
    '{{epf_sources.north_star_path}}': template_vars['epf_sources']['north_star_path'],
    '{{epf_sources.strategy_formula_path}}': template_vars['epf_sources']['strategy_formula_path'],
    '{{epf_sources.roadmap_recipe_path}}': template_vars['epf_sources']['roadmap_recipe_path'],
    '{{epf_sources.value_models_path}}': template_vars['epf_sources'].get('value_models_path', 'N/A'),
    '{{generation_timestamp}}': datetime.now().isoformat(),
    '{{epf_version}}': template_vars.get('epf_version', '2.0.2'),
}

def apply_replacements(content, replacements_dict):
    """Helper: Apply variable replacements to content"""
    for placeholder, value in replacements_dict.items():
        content = content.replace(placeholder, str(value))
    return content

# Step 3: Extract sections from template for incremental writing
template_content = template_structure['full_content']

# Find section boundaries (assumes template uses "## Section N: Title" format)
section_pattern = r'(## Section \d+:.*?)(?=## Section \d+:|$)'
section_matches = re.finditer(section_pattern, template_content, re.DOTALL)
sections = {m.group(0).split(':')[0].strip(): m.group(0) for m in section_matches}

print(f"📋 Extracted {len(sections)} sections from template\n")

# Step 4: Generate and write header + Sections 1-6 (non-loop sections)
print("📝 Generating header and Sections 1-6...")

header_content = template_content.split('## Section 1:')[0]  # Extract document header
header_content = apply_replacements(header_content, replacements)

with open(output_path, 'w', encoding='utf-8') as f:
    f.write(header_content)

print("✅ Header written\n")

# Write Sections 1-6 (replace variables in each)
for section_num in range(1, 7):
    section_key = f"## Section {section_num}"
    if section_key in sections:
        print(f"📝 Generating Section {section_num}...")
        section_content = sections[section_key]
        section_content = apply_replacements(section_content, replacements)
        
        with open(output_path, 'a', encoding='utf-8') as f:
            f.write(section_content)
        
        print(f"✅ Section {section_num} written\n")

# Step 5: Generate Section 7 (Work Packages) - one WP at a time to avoid token limit
print(f"📝 Generating Section 7: Work Packages (1-{len(template_vars['work_packages'])})...\n")

# Write Section 7 header
section_7_header = """## Section 7: Work Packages

This section describes the individual work packages that comprise the R&D project.

"""
with open(output_path, 'a', encoding='utf-8') as f:
    f.write(section_7_header)

print("✅ Section 7 header written")

# Generate each work package individually
for i, wp in enumerate(template_vars['work_packages'], 1):
    print(f"📝 Generating Work Package {i}/{len(template_vars['work_packages'])}: {wp['name'][:50]}...")
    
    # Build work package content
    wp_content = f"""
### Work Package {i}: {wp['name']}

**Duration:** {wp['start_date']} to {wp['end_date']} ({wp['duration_months']} months)

**Key Challenges:**
{wp['challenges']}

**Research Method:**
{wp['method']}

**Specific Activities:**
{wp['activities']}

**Budget Allocation:**

| Cost Category | Amount (NOK) | Percentage |
|--------------|--------------|------------|
| Personnel | {wp['budget']['personnel']:,} | {wp['budget']['personnel_pct']:.1f}% |
| Equipment | {wp['budget']['equipment']:,} | {wp['budget']['equipment_pct']:.1f}% |
| Overhead | {wp['budget']['overhead']:,} | {wp['budget']['overhead_pct']:.1f}% |
| **Total** | **{wp['budget']['total']:,}** | **100%** |

**EPF Traceability:**
- KR ID: {wp['kr_id']}
- Roadmap Phase: {wp['roadmap_phase']}
- TRL Progression: {wp['trl_start']} → {wp['trl_end']}

---
"""
    
    with open(output_path, 'a', encoding='utf-8') as f:
        f.write(wp_content)
    
    print(f"✅ Work Package {i}/{len(template_vars['work_packages'])} written\n")

# Step 6: Generate Section 8 (Budget Summary)
print("📝 Generating Section 8: Total Budget and Tax Deduction...\n")

section_8_content = f"""## Section 8: Total Budget and Estimated Tax Deduction

### Budget Summary by Year

| Year | Personnel (NOK) | Equipment (NOK) | Overhead (NOK) | Total (NOK) |
|------|----------------|-----------------|----------------|-------------|
"""

# Add yearly budget rows
for year_data in template_vars['budget_summary_by_year']:
    section_8_content += f"""| {year_data['year']} | {year_data['personnel']:,} | {year_data['equipment']:,} | {year_data['overhead']:,} | {year_data['total']:,} |
"""

section_8_content += f"""| **Total** | **{template_vars['total_personnel_nok']:,}** | **{template_vars['total_equipment_nok']:,}** | **{template_vars['total_overhead_nok']:,}** | **{template_vars['total_budget_nok']:,}** |

### Work Package Budget Allocation

| Work Package | Duration | Total Cost (NOK) | Personnel | Equipment | Overhead |
|-------------|----------|------------------|-----------|-----------|----------|
"""

# Add work package rows
for wp in template_vars['work_packages']:
    section_8_content += f"""| WP{wp['number']}: {wp['name'][:40]} | {wp['duration_months']}m | {wp['budget']['total']:,} | {wp['budget']['personnel']:,} | {wp['budget']['equipment']:,} | {wp['budget']['overhead']:,} |
"""

section_8_content += f"""
### Tax Deduction Calculation

**Company Size:** {template_vars.get('company_size', 'Small company')} ({template_vars.get('tax_rate', 20)}% deduction rate)

**Total Eligible R&D Costs:** {template_vars['total_eligible_costs_nok']:,} NOK

**Estimated Tax Deduction:** {template_vars['total_tax_deduction_nok']:,} NOK

#### Tax Deduction by Year

| Year | Eligible Costs (NOK) | Tax Deduction (NOK) |
|------|---------------------|---------------------|
"""

# Add yearly tax deduction rows
for year_data in template_vars['tax_deduction_by_year']:
    section_8_content += f"""| {year_data['year']} | {year_data['eligible_costs']:,} | {year_data['tax_deduction']:,} |
"""

section_8_content += f"""| **Total** | **{template_vars['total_eligible_costs_nok']:,}** | **{template_vars['total_tax_deduction_nok']:,}** |

---

**Document Generation Details:**
- Generated: {template_vars.get('generation_timestamp', datetime.now().isoformat())}
- EPF Version: {template_vars.get('epf_version', '2.0.2')}
- Work Packages: {len(template_vars['work_packages'])}
- Total Budget: {template_vars['total_budget_nok']:,} NOK
- Project Duration: {template_vars.get('duration_months', 'N/A')} months
"""

with open(output_path, 'a', encoding='utf-8') as f:
    f.write(section_8_content)

print("✅ Section 8 written\n")

# Step 7: Final validation
print(f"✅ Application generation complete: {output_path}")

# Count lines in generated file
with open(output_path, 'r', encoding='utf-8') as f:
    line_count = len(f.readlines())

print(f"   Total lines: {line_count}")
print(f"   Work packages: {len(template_vars['work_packages'])}")
print(f"   Budget: {template_vars['total_budget_nok']:,} NOK\n")

# Verify no unreplaced variables remain
with open(output_path, 'r', encoding='utf-8') as f:
    final_content = f.read()

unreplaced = re.findall(r'{{[^}]+}}', final_content)
if unreplaced:
    print(f"⚠️  WARNING: {len(unreplaced)} unreplaced variables found:")
    for var in unreplaced[:10]:  # Show first 10
        print(f"   - {var}")
    if len(unreplaced) > 10:
        print(f"   ... and {len(unreplaced) - 10} more")
else:
    print("✅ All template variables replaced successfully")

print("\n🎉 Incremental generation complete - no token limit issues!")
```

**Pre-Generation Validation:**

```python
# Before starting incremental generation, verify you have everything needed
pre_gen_checklist = {
    'template_loaded': template_structure is not None,
    'template_has_content': 'full_content' in template_structure and len(template_structure['full_content']) > 1000,
    'sections_extracted': len(template_structure['sections']) == 8,
    'char_limits_extracted': len(template_structure['char_limits']) > 0,
    'variables_populated': template_vars is not None,
    'work_packages_generated': len(template_vars.get('work_packages', [])) > 0,
    'budget_calculated': 'total_budget_nok' in template_vars,
    'output_dir_exists': os.path.exists(OUTPUT_DIR)
}

print("\n🔍 Pre-Generation Validation:")
all_passed = True
for check_name, passed in pre_gen_checklist.items():
    status = "✅" if passed else "❌"
    print(f"   {status} {check_name}")
    if not passed:
        all_passed = False

if not all_passed:
    print("\n❌ Pre-generation validation failed. Cannot proceed with document generation.")
    print("   Review Phase 3 (Content Synthesis) and Phase 5 (Budget Allocation) outputs.")
    sys.exit(1)

print("\n✅ All pre-generation checks passed. Proceeding with incremental generation...\n")
```

**Generation Strategy:**
- **Sections 1-6:** Generate from template with variable replacement, write individually
- **Section 7:** Generate each work package separately (avoid token limit with 12 WPs)
- **Section 8:** Generate budget tables with yearly/WP breakdowns
- **Progress feedback:** "✅ Section N written" after each section
- **Final validation:** Check for unreplaced variables, count lines, verify output

**Proceed to Step 4.2 above to execute incremental generation.**

---

if not all_passed:
    print("\n❌ Pre-generation validation FAILED")
    print("   STOP: You cannot generate output without template.md content")
    print("   Go back to Step 4.0 and load template.md")
    raise ValueError("Pre-generation validation failed. Cannot proceed.")

print("\n✅ All pre-generation checks passed")
print("📝 Ready to generate output using template structure")
```

**Post-Generation Validation:**

```python
# After generating output_content, validate before writing file

required_sections = template_structure['sections']

# 1. Check all sections present
print("\n🔍 Post-Generation Validation:")
missing_sections = []
for section_title in required_sections:
    if section_title not in output_content:
        missing_sections.append(section_title)
        print(f"   ❌ Missing: {section_title}")
    else:
        print(f"   ✅ Found: {section_title}")

if missing_sections:
    raise ValueError(f"Generated content missing {len(missing_sections)} required sections. "
                    f"This indicates you did NOT use template.md as base.")

# 2. Check section order
section_positions = []
for section_title in required_sections:
    pos = output_content.find(section_title)
    section_positions.append((section_title, pos))

section_positions.sort(key=lambda x: x[1])
order_correct = True
for i, (title, pos) in enumerate(section_positions):
    expected_title = required_sections[i]
    if title != expected_title:
        print(f"   ❌ Section order incorrect at position {i}: found '{title}', expected '{expected_title}'")
        order_correct = False

if not order_correct:
    raise ValueError("Section order incorrect. This indicates you did NOT use template.md as base.")

print("✅ Post-generation validation complete")
print("✅ Output uses correct template structure")
print("✅ Ready to write to file")
```

---

## Phase 5: Work Package Generation from Selected KRs

**⚠️ CRITICAL:** Work packages are built DIRECTLY from selected KRs (from Phase 0.5), NOT synthesized.

### Step 5.1: Create Work Package Structure

```python
def create_work_packages_from_selected_krs(selected_krs, project_start_date, budget_period):
    """
    Convert selected Key Results into SkatteFUNN Work Packages.
    Each KR becomes one Work Package (1-8 WPs allowed).
    
    Returns: list of work_package dicts ready for template
    """
    work_packages = []
    
    for i, kr_data in enumerate(selected_krs, 1):
        kr = kr_data['kr']
        
        # Calculate WP timeline in project months
        start_month = calculate_project_month(kr.get('start_date'), project_start_date)
        end_month = calculate_project_month(kr.get('end_date'), project_start_date)
        
        # Determine R&D category based on TRL progression
        if kr['trl_start'] <= 3:
            rd_category = "Industrial Research"  # TRL 2-3 = exploratory
        else:
            rd_category = "Experimental Development"  # TRL 4-7 = applied
        
        # Extract activities from KR (2-8 required per WP)
        activities = generate_activities_from_kr(kr)
        
        if len(activities) < 2:
            # Pad with documentation activity
            activities.append({
                'title': 'Documentation and Knowledge Transfer',
                'description': 'Document findings, create technical reports, transfer knowledge to team.'
            })
        
        # Build budget allocation by year
        budget_nok = kr.get('estimated_budget', 0)
        yearly_costs = allocate_budget_by_year(
            budget_nok, 
            start_month, 
            end_month, 
            kr.get('budget_breakdown', {'personnel': 0.7, 'equipment': 0.2, 'overhead': 0.1})
        )
        
        # Create work package
        work_package = {
            'name': truncate(kr.get('description', f'Work Package {i}'), 100),
            'start_month': start_month,
            'end_month': end_month,
            'rd_category': rd_category,
            'rd_challenges': truncate(kr.get('uncertainty_addressed', ''), 500),
            'method_approach': truncate(
                f"{kr.get('experiment_design', '')} {kr.get('measurement_method', '')}", 
                1000
            ),
            'activities': activities,
            'budget': {
                'yearly_costs': yearly_costs,
                'cost_specification': truncate(kr.get('budget_notes', 'See detailed budget breakdown'), 500)
            },
            'total_budget_nok': budget_nok
        }
        
        work_packages.append(work_package)
    
    # Validate 1-8 WPs
    if len(work_packages) < 1 or len(work_packages) > 8:
        raise ValueError(f"Invalid WP count: {len(work_packages)} (must be 1-8)")
    
    return work_packages


def generate_activities_from_kr(kr):
    """
    Extract 2-8 activities from KR deliverables or experiment steps.
    Each activity needs title (≤100 chars) and description (≤500 chars).
    """
    activities = []
    
    # Try extracting from deliverables first
    deliverables = kr.get('deliverables', [])
    
    if deliverables and len(deliverables) >= 2:
        for deliverable in deliverables[:8]:  # Max 8
            activities.append({
                'title': truncate(deliverable.get('title', 'Activity'), 100),
                'description': truncate(deliverable.get('description', ''), 500)
            })
    else:
        # Parse experiment_design into steps
        experiment_steps = parse_experiment_steps(kr.get('experiment_design', ''))
        
        for step in experiment_steps[:8]:
            activities.append({
                'title': truncate(step.get('title', 'Experiment Step'), 100),
                'description': truncate(step.get('description', ''), 500)
            })
    
    # Ensure 2-8 activities
    if len(activities) < 2:
        # Add generic activities to meet minimum
        activities.extend([
            {
                'title': 'Experimentation and Testing',
                'description': 'Execute systematic experiments to test hypothesis and measure outcomes.'
            },
            {
                'title': 'Analysis and Documentation',
                'description': 'Analyze results, document findings, and prepare technical reports.'
            }
        ])
    
    return activities[:8]  # Enforce maximum


def allocate_budget_by_year(total_budget_nok, start_month, end_month, budget_breakdown):
    """
    Distribute KR budget across years using cost codes.
    
    Args:
        total_budget_nok: Total KR budget
        start_month: Start month in project timeline (1-based)
        end_month: End month in project timeline
        budget_breakdown: Dict with keys: personnel, equipment, overhead (as ratios 0-1)
    
    Returns: List of {year, cost_code, amount_nok} dicts
    """
    # Calculate months per year
    duration_months = end_month - start_month + 1
    years_covered = set()
    
    # Determine which calendar years are covered
    # (This requires project_start_date context - simplified example)
    # In real implementation, map project months to calendar years
    
    yearly_costs = []
    
    # Simplified: assume linear distribution across years
    # Real implementation should map project months to calendar years properly
    
    # For each cost code, create yearly allocations
    cost_codes = {
        'Personnel': budget_breakdown.get('personnel', 0.7),
        'Equipment': budget_breakdown.get('equipment', 0.2),
        'Other Operating Costs': budget_breakdown.get('other_operating', 0),
        'Overhead': budget_breakdown.get('overhead', 0.1)
    }
    
    for cost_code, ratio in cost_codes.items():
        if ratio > 0:
            amount = int(total_budget_nok * ratio)
            yearly_costs.append({
                'year': 2025,  # Placeholder - calculate from project timeline
                'cost_code': cost_code,
                'amount_nok': amount
            })
    
    return yearly_costs


def truncate(text, max_length):
    """Truncate text to max_length, adding ellipsis if needed."""
    if not text:
        return ""
    if len(text) <= max_length:
        return text
    return text[:max_length-3] + "..."


def calculate_project_month(date_str, project_start_date):
    """Convert date to project month number (1-based)."""
    # Implementation depends on date format in roadmap
    # Return integer month number relative to project start
    pass
```

### Step 5.2: Generate Budget Summaries

```python
def calculate_budget_summaries(work_packages):
    """
    Generate Section 8 summary tables from work package budgets.
    
    Returns: Dict with budget_summary_by_year and totals
    """
    # Aggregate by year and cost code
    budget_by_year = {}
    
    for wp in work_packages:
        for year_cost in wp['budget']['yearly_costs']:
            year = year_cost['year']
            cost_code = year_cost['cost_code']
            amount = year_cost['amount_nok']
            
            if year not in budget_by_year:
                budget_by_year[year] = {
                    'personnel_nok': 0,
                    'equipment_nok': 0,
                    'other_operating_costs_nok': 0,
                    'overhead_nok': 0
                }
            
            # Map cost code to summary field
            if cost_code == 'Personnel':
                budget_by_year[year]['personnel_nok'] += amount
            elif cost_code == 'Equipment':
                budget_by_year[year]['equipment_nok'] += amount
            elif cost_code == 'Other Operating Costs':
                budget_by_year[year]['other_operating_costs_nok'] += amount
            elif cost_code == 'Overhead':
                budget_by_year[year]['overhead_nok'] += amount
    
    # Calculate year totals
    budget_summary_by_year = []
    for year in sorted(budget_by_year.keys()):
        year_data = budget_by_year[year]
        year_total = sum([
            year_data['personnel_nok'],
            year_data['equipment_nok'],
            year_data['other_operating_costs_nok'],
            year_data['overhead_nok']
        ])
        year_data['year'] = year
        year_data['year_total_nok'] = year_total
        budget_summary_by_year.append(year_data)
    
    # Calculate project totals
    total_budget_nok = sum(wp['total_budget_nok'] for wp in work_packages)
    
    # Estimate tax deduction (20% for small companies, 18% for large)
    # Assume small company unless specified
    company_size = user_input.get('company_size', 'small')
    tax_rate = 0.20 if company_size == 'small' else 0.18
    estimated_tax_deduction_nok = int(total_budget_nok * tax_rate)
    
    return {
        'budget_summary_by_year': budget_summary_by_year,
        'total_budget_nok': total_budget_nok,
        'estimated_tax_deduction_nok': estimated_tax_deduction_nok
    }
```

### Step 5.3: Update Template Variables

```python
# After generating work packages and summaries
work_packages = create_work_packages_from_selected_krs(selected_krs, project_start_date, budget_period)
summaries = calculate_budget_summaries(work_packages)

# Add to template variables (from Phase 4)
template_vars['work_packages'] = work_packages
template_vars['budget_summary_by_year'] = summaries['budget_summary_by_year']
template_vars['total_budget_nok'] = summaries['total_budget_nok']
template_vars['estimated_tax_deduction_nok'] = summaries['estimated_tax_deduction_nok']
```

### Step 5.4: Budget Validation

```python
# Validate budget reconciliation
total_wp_budget = sum(wp['total_budget_nok'] for wp in work_packages)
user_specified_budget = user_input.budget.total_nok

tolerance = 1000  # 1,000 NOK tolerance
if abs(total_wp_budget - user_specified_budget) > tolerance:
    print(f"⚠️ WARNING: Work package budgets ({total_wp_budget:,} NOK) "
          f"don't match specified total ({user_specified_budget:,} NOK)")
    print(f"   Difference: {abs(total_wp_budget - user_specified_budget):,} NOK")
    print(f"   Please verify KR estimated_budget values in roadmap")

# Validate cost code ratios
total_personnel = sum(
    year_cost['amount_nok'] 
    for wp in work_packages 
    for year_cost in wp['budget']['yearly_costs'] 
    if year_cost['cost_code'] == 'Personnel'
)
personnel_ratio = total_personnel / total_wp_budget if total_wp_budget > 0 else 0

if not (0.65 <= personnel_ratio <= 0.75):
    print(f"⚠️ WARNING: Personnel ratio ({personnel_ratio:.1%}) outside typical 65-75% range")
    print(f"   Typical for software R&D projects")
```

### Step 5.5: Budget Temporal Consistency Validation ⚠️ **CRITICAL**

**Purpose:** Ensure budget allocations respect work package temporal boundaries. 

**Problem Statement:** Each work package has a defined duration (start date to end date). Budget table entries MUST only include years within that duration. A WP running "August 2025 to July 2026" cannot have budget entries for 2027.

**Validation Algorithm:**

```python
def validate_budget_temporal_consistency(work_packages):
    """
    Validate that each WP's budget entries only cover years within its duration.
    
    Prevents critical error: WP ending July 2026 having 2027 budget entries.
    """
    errors = []
    warnings = []
    
    for wp_idx, wp in enumerate(work_packages, start=1):
        # Extract WP temporal boundaries
        wp_start_date = wp['start_date']  # e.g., "August 2025"
        wp_end_date = wp['end_date']      # e.g., "July 2026"
        
        # Parse years from dates
        wp_start_year = extract_year(wp_start_date)  # e.g., 2025
        wp_end_year = extract_year(wp_end_date)      # e.g., 2026
        
        # Extract all budget years for this WP
        budget_years = set()
        for year_cost in wp['budget']['yearly_costs']:
            budget_years.add(year_cost['year'])
        
        # CRITICAL VALIDATION: Budget years ⊆ [start_year, end_year]
        invalid_years = []
        for year in budget_years:
            if year < wp_start_year or year > wp_end_year:
                invalid_years.append(year)
        
        if invalid_years:
            error_msg = (
                f"❌ ERROR: WP{wp_idx} '{wp['title']}' has budget entries "
                f"in year(s) {invalid_years} OUTSIDE its duration "
                f"({wp_start_date} to {wp_end_date} = years {wp_start_year}-{wp_end_year})"
            )
            errors.append(error_msg)
            print(error_msg)
            
            # Show detailed breakdown
            print(f"   WP{wp_idx} Duration: {wp_start_date} → {wp_end_date}")
            print(f"   Valid Years: {wp_start_year} through {wp_end_year}")
            print(f"   Budget Years: {sorted(budget_years)}")
            print(f"   INVALID: {invalid_years}")
            print()
        
        # PROPORTIONAL ALLOCATION VALIDATION
        # Check if budget is proportional to active months in each year
        total_wp_months = calculate_months_duration(wp_start_date, wp_end_date)
        
        for year in sorted(budget_years):
            if year < wp_start_year or year > wp_end_year:
                continue  # Already flagged as error
            
            # Count active months in this year
            active_months = count_active_months_in_year(
                wp_start_date, wp_end_date, year
            )
            
            # Expected budget proportion
            expected_proportion = active_months / total_wp_months
            
            # Actual budget for this year
            year_budget = sum(
                yc['amount_nok'] 
                for yc in wp['budget']['yearly_costs'] 
                if yc['year'] == year
            )
            actual_proportion = year_budget / wp['total_budget_nok']
            
            # Allow 5% tolerance for rounding
            proportion_diff = abs(expected_proportion - actual_proportion)
            if proportion_diff > 0.05:
                warning_msg = (
                    f"⚠️ WARNING: WP{wp_idx} year {year} budget proportion "
                    f"({actual_proportion:.1%}) differs from active months proportion "
                    f"({expected_proportion:.1%} = {active_months}/{total_wp_months} months)"
                )
                warnings.append(warning_msg)
                print(warning_msg)
    
    # Summary
    print("\n" + "=" * 70)
    print("Budget Temporal Consistency Validation Summary")
    print("=" * 70)
    if errors:
        print(f"❌ {len(errors)} ERROR(S) FOUND - MUST FIX BEFORE GENERATION")
        for error in errors:
            print(f"   {error}")
        print("\nFIX REQUIRED: Budget years must be within WP duration boundaries")
        print("EXAMPLE FIX:")
        print("   WP1 duration: Aug 2025 - Jul 2026 (12 months)")
        print("   Valid years: [2025, 2026]")
        print("   Budget allocation:")
        print("     2025: 1,830,000 × (5 months / 12 months) = 762,500 NOK")
        print("     2026: 1,830,000 × (7 months / 12 months) = 1,067,500 NOK")
        print("     2027: MUST NOT EXIST (WP ends July 2026)")
        raise ValueError("Budget temporal consistency errors - cannot proceed")
    
    if warnings:
        print(f"⚠️ {len(warnings)} WARNING(S) - Review recommended")
        for warning in warnings:
            print(f"   {warning}")
    else:
        print("✅ All work package budgets temporally consistent")
        print("   Budget years match WP durations")
        print("   Budget allocations proportional to active months")
    print("=" * 70 + "\n")
    
    return len(errors) == 0


def extract_year(date_str):
    """
    Extract year from date string like 'August 2025' or 'July 2026'.
    
    Args:
        date_str: Date string in format "Month YYYY"
    
    Returns: Integer year (e.g., 2025)
    """
    # Simple implementation - extract 4-digit year
    import re
    match = re.search(r'\b(20\d{2})\b', date_str)
    if match:
        return int(match.group(1))
    raise ValueError(f"Could not extract year from date: {date_str}")


def calculate_months_duration(start_date, end_date):
    """
    Calculate total months between start and end dates.
    
    Args:
        start_date: "Month YYYY" format (e.g., "August 2025")
        end_date: "Month YYYY" format (e.g., "July 2026")
    
    Returns: Integer number of months (inclusive)
    """
    from datetime import datetime
    
    # Parse dates
    start = datetime.strptime(start_date, "%B %Y")
    end = datetime.strptime(end_date, "%B %Y")
    
    # Calculate months difference
    months = (end.year - start.year) * 12 + (end.month - start.month) + 1
    return months


def count_active_months_in_year(start_date, end_date, year):
    """
    Count how many months of a WP fall within a specific calendar year.
    
    Args:
        start_date: WP start date "Month YYYY"
        end_date: WP end date "Month YYYY"
        year: Calendar year to check (e.g., 2025)
    
    Returns: Integer count of active months in that year
    
    Example:
        WP runs "August 2025" to "July 2026"
        count_active_months_in_year(..., ..., 2025) → 5 (Aug, Sep, Oct, Nov, Dec)
        count_active_months_in_year(..., ..., 2026) → 7 (Jan, Feb, Mar, Apr, May, Jun, Jul)
    """
    from datetime import datetime
    
    start = datetime.strptime(start_date, "%B %Y")
    end = datetime.strptime(end_date, "%B %Y")
    
    # Year boundaries
    year_start = datetime(year, 1, 1)
    year_end = datetime(year, 12, 31)
    
    # Find overlap
    overlap_start = max(start, year_start)
    overlap_end = min(end, year_end)
    
    if overlap_start > overlap_end:
        return 0  # No overlap
    
    # Count months in overlap
    months = (overlap_end.year - overlap_start.year) * 12 + \
             (overlap_end.month - overlap_start.month) + 1
    
    return months


# Execute validation BEFORE generating application
print("\n🔍 Validating budget temporal consistency...")
if not validate_budget_temporal_consistency(work_packages):
    print("\n❌ CRITICAL: Budget validation failed. Fix errors before proceeding.")
    sys.exit(1)
else:
    print("\n✅ Budget validation passed. Proceeding to application generation...")
```

**Why This Matters:**

1. **Prevents Invalid Applications:**
   - WP ending July 2026 cannot have 2027 costs → immediate rejection
   - Budget years outside WP duration = nonsensical application

2. **Ensures Proportional Allocation:**
   - WP running 6 months (5 in 2025, 1 in 2026) should have ~5:1 budget split
   - Not even 50/50 split (which wizard was generating incorrectly)

3. **Catches Logic Errors Early:**
   - Fails fast during generation, not during submission
   - Provides specific fix examples in error messages

**Integration Point:**

This validation runs at the END of Phase 5, after all work packages and budgets are generated but BEFORE writing the final application document. If validation fails, wizard halts and shows detailed error messages with fix examples.

**Expected Output (Successful):**

```
🔍 Validating budget temporal consistency...

======================================================================
Budget Temporal Consistency Validation Summary
======================================================================
✅ All work package budgets temporally consistent
   Budget years match WP durations
   Budget allocations proportional to active months
======================================================================

✅ Budget validation passed. Proceeding to application generation...
```

**Expected Output (Error - Before Fix):**

```
🔍 Validating budget temporal consistency...

❌ ERROR: WP1 'Knowledge Graph, Extraction & MCP Server' has budget entries 
in year(s) [2027] OUTSIDE its duration (August 2025 to July 2026 = years 2025-2026)
   WP1 Duration: August 2025 → July 2026
   Valid Years: 2025 through 2026
   Budget Years: [2025, 2026, 2027]
   INVALID: [2027]

======================================================================
Budget Temporal Consistency Validation Summary
======================================================================
❌ 1 ERROR(S) FOUND - MUST FIX BEFORE GENERATION
   ❌ ERROR: WP1 'Knowledge Graph, Extraction & MCP Server' has budget entries in year(s) [2027] OUTSIDE its duration (August 2025 to July 2026 = years 2025-2026)

FIX REQUIRED: Budget years must be within WP duration boundaries
EXAMPLE FIX:
   WP1 duration: Aug 2025 - Jul 2026 (12 months)
   Valid years: [2025, 2026]
   Budget allocation:
     2025: 1,830,000 × (5 months / 12 months) = 762,500 NOK
     2026: 1,830,000 × (7 months / 12 months) = 1,067,500 NOK
     2027: MUST NOT EXIST (WP ends July 2026)
ValueError: Budget temporal consistency errors - cannot proceed
```

---

## 4. Timeline and Work Packages

**Project Duration:** {timeline.start_date} to {timeline.end_date} ({total_months} months)

{For each work package - see Synthesis Rule 6}

---

## 5. Budget and Tax Deduction

### 5.1 Total Budget Overview

| Year | Months Active | Amount (NOK) | Monthly Rate |
|------|---------------|--------------|--------------|
{For each year in budget.yearly_breakdown}

**Total Project Budget:** {budget.total_nok:,} NOK

### 5.2 Budget Allocation by Work Package

{Generated by Phase 5 algorithm}

### 5.3 Cost Category Breakdown

| Category | Percentage | Amount (NOK) | Description |
|----------|------------|--------------|-------------|
| Personnel | {cost_categories.personnel_pct}% | {calculated} | Salaries for R&D staff |
| Equipment & Tools | {cost_categories.equipment_pct}% | {calculated} | Computing infrastructure, software licenses |
| Overhead | {cost_categories.overhead_pct}% | {calculated} | Facilities, administration |
| **Total** | **100%** | **{budget.total_nok:,}** | |

### 5.4 Estimated Tax Deduction

Based on SkatteFUNN rates:
- Small companies (<50 employees, <€10M revenue): **20% of eligible costs**
- Large companies: **18% of eligible costs**

**Estimated tax deduction (assuming small company):**
- 2025: {0.20 * budget_2025:,} NOK
- 2026: {0.20 * budget_2026:,} NOK
- 2027: {0.20 * budget_2027:,} NOK
- **Total estimated deduction:** {0.20 * budget.total_nok:,} NOK

> **Note:** Actual tax deduction calculated by Norwegian Tax Administration based on auditor-approved returns. Maximum base amount: 25 million NOK per company per income year.

---

## 6. EPF Traceability

This application was generated from the following EPF sources:

| EPF Source | Path | Used For |
|------------|------|----------|
| North Star | {epf_sources.instance_path}/READY/00_north_star.yaml | Vision, mission, problem context |
| Strategy Formula | {epf_sources.instance_path}/READY/04_strategy_formula.yaml | Technology strategy, differentiation |
| Roadmap Recipe | {epf_sources.instance_path}/READY/05_roadmap_recipe.yaml | Timeline, work packages |
| Value Models | {epf_sources.instance_path}/FIRE/value_models/*.yaml | Problem definition, solution approach |

**Generated:** {ISO_8601_timestamp}  
**Generator Version:** 1.0.0  
**EPF Version:** 2.1.0
```

---

## Phase 5: Budget Allocation Algorithm ⭐ **REWRITTEN FOR R&D VALIDATION**

**⚠️ CRITICAL CHANGE:** Budget allocation now uses **explicit budgets from R&D KRs**, NOT calculated from phase durations.

### Step 5.1: Extract Work Package Budgets from R&D KRs

```python
# Pseudo-code
total_budget = budget.total_nok
work_packages = group_rnd_krs_into_work_packages(validated_rnd_krs)  # From Phase 0

# Budget already allocated at R&D KR level
for wp in work_packages:
    # Sum budgets from constituent R&D KRs
    wp.budget = sum(kr['kr']['estimated_budget'] for kr in wp['rnd_krs'])
    
    # Extract cost category breakdown from R&D KRs
    # (Each KR should have budget_breakdown: {personnel, equipment, overhead})
    wp.costs = {
        'personnel': sum(kr['kr']['budget_breakdown']['personnel'] for kr in wp['rnd_krs']),
        'equipment': sum(kr['kr']['budget_breakdown']['equipment'] for kr in wp['rnd_krs']),
        'overhead': sum(kr['kr']['budget_breakdown']['overhead'] for kr in wp['rnd_krs'])
    }

# Validate total matches user input
total_wp_budget = sum(wp.budget for wp in work_packages)
if abs(total_wp_budget - total_budget) > 1000:  # 1k NOK tolerance
    raise ValueError(
        f"R&D KR budgets ({total_wp_budget:,} NOK) don't match "
        f"application budget ({total_budget:,} NOK). "
        f"Check roadmap estimated_budget fields."
    )
```

### Step 5.2: Cost Category Validation (Already in R&D KRs)

**Cost Category Definitions** (for roadmap authors when creating R&D KRs):

**Personnel (typically 65-75% for software R&D):**
- R&D engineers/developers (implementation, testing) - typically 80% of personnel costs
- R&D/Product manager (planning, coordination, documentation) - typically 10-15% of personnel costs
- Research scientists (algorithm design, validation) - if applicable
- Data scientists (ground truth creation, evaluation) - if applicable  
- Technical writers (documentation of R&D findings) - typically 5% of personnel costs

**Equipment (typically 15-25% for software R&D):**
- Cloud infrastructure (compute, storage, databases) - R&D scale, not production (~5-10k NOK/month)
- LLM API costs (Gemini, GPT-4, Claude for experiments) - bursty usage during testing (~5-10k calls/month)
- Development tools (IDEs, profilers, testing frameworks, CI/CD)
- Software licenses (monitoring, observability, collaboration tools)
- Note: Software R&D has lower equipment costs than hardware/lab-based R&D

**Overhead (typically 10-15%):**
- Administration costs (project coordination, financial tracking)
- Office space allocation
- Compliance consulting (GDPR, security audits, IP strategy)
- Knowledge dissemination (conference attendance, publication fees, open-source contribution)

**Important:** Software R&D is personnel-intensive. Equipment costs should reflect R&D-scale cloud/API usage, not production hosting. Use 70/20/10 split as default for software projects.

**R&D KR Budget Breakdown Example:**
```yaml
- id: "kr-rd-001"
  # ... other R&D KR fields ...
  estimated_budget: 180000
  budget_breakdown:
    personnel: 126000  # 70% (2 FTE-months × 63k NOK/FTE-month)
    equipment: 36000   # 20% (Cloud 15k + API 15k + Tools 6k)
    overhead: 18000    # 10%
```

### Step 5.3: Generate Budget Table (Direct from R&D KRs)

```markdown
| Work Package | Duration | Budget (NOK) | Personnel | Equipment | Overhead |
|--------------|----------|--------------|-----------|-----------|----------|
| WP1: {wp.name} | {wp.duration_months}m | {wp.budget:,} | {wp.costs.personnel:,} | {wp.costs.equipment:,} | {wp.costs.overhead:,} |
| WP2: {wp.name} | {wp.duration_months}m | {wp.budget:,} | {wp.costs.personnel:,} | {wp.costs.equipment:,} | {wp.costs.overhead:,} |
| ... |
| **Total** | **{sum(wp.duration_months)}m** | **{sum(wp.budget):,}** | **{sum(wp.costs.personnel):,}** | **{sum(wp.costs.equipment):,}** | **{sum(wp.costs.overhead):,}** |
```

**Budget Reconciliation Check:**
```python
# Ensure categories match expected split
total_personnel = sum(wp.costs['personnel'] for wp in work_packages)
total_equipment = sum(wp.costs['equipment'] for wp in work_packages)
total_overhead = sum(wp.costs['overhead'] for wp in work_packages)

personnel_pct = (total_personnel / total_budget) * 100
equipment_pct = (total_equipment / total_budget) * 100
overhead_pct = (total_overhead / total_budget) * 100

# Warn if outside typical software R&D ranges
if not (65 <= personnel_pct <= 75):
    print(f"⚠️ Personnel ({personnel_pct:.1f}%) outside typical 65-75% range for software R&D")

if not (15 <= equipment_pct <= 25):
    print(f"⚠️ Equipment ({equipment_pct:.1f}%) outside typical 15-25% range for software R&D")

if not (10 <= overhead_pct <= 15):
    print(f"⚠️ Overhead ({overhead_pct:.1f}%) outside typical 10-15% range")
```

**Key Difference from Old Approach:**

| Aspect | OLD (Synthesis) | NEW (Validation) |
|--------|-----------------|------------------|
| **Budget Source** | Calculated from phase duration/complexity | Explicit `estimated_budget` in R&D KRs |
| **Cost Split Method** | Apply percentage to calculated total | Explicit `budget_breakdown` in R&D KRs |
| **Allocation Logic** | Duration weight (70%) + milestone count (30%) | Sum of KR budgets per Work Package |
| **Validation** | ⚠️ Hope budget adds up correctly | ✅ Verify R&D KR budgets match total |
| **Traceability** | ❌ No link between budget and activities | ✅ Each WP budget = sum of KR budgets |

---

## Quality Assurance Checklist ⭐ **UPDATED FOR R&D VALIDATION**

Before outputting the final document, verify:

### Phase 0: R&D Eligibility (CRITICAL - NEW)
- [ ] ✅ **Roadmap contains `research_and_development` track** (NOT just product/strategy tracks)
- [ ] ✅ **All R&D KRs have required fields:** technical_hypothesis, experiment_design, success_criteria, uncertainty_addressed, trl_progression, estimated_duration, estimated_budget
- [ ] ✅ **R&D budget coverage ≥80%** (sum of R&D KR budgets covers at least 80% of total application budget)
- [ ] ✅ **Timeline coverage validated** (no gaps >3 months between R&D activities)
- [ ] ✅ **TRL ranges within eligibility window** (all R&D KRs have TRL 2-7, no TRL 8-9)
- [ ] ✅ **At least 5 distinct R&D activities** (granular enough to demonstrate systematic investigation)

### Phase 1: Pre-flight Validation (Standard)
- [ ] All placeholder fields filled (no `[Not entered]`)
- [ ] Timeline within 1-48 month range
- [ ] Budget ≤ 25M NOK per year
- [ ] Norwegian terminology correct (FoU, forskningsutvikling, etc.)
- [ ] All EPF source files referenced in traceability section

### Phase 3: Content Quality (Frascati Compliance)
- [ ] R&D challenges explain **technical uncertainty** (not just complexity/difficulty)
- [ ] State-of-the-art comparison names **specific existing solutions** (not generic "current approaches")
- [ ] Frascati criteria explicitly addressed (novelty, creativity, uncertainty, systematic, transferable/reproducible)
- [ ] Language uses SkatteFUNN vocabulary: "systematic investigation", "unpredictable outcomes", "technical uncertainty"

### Phase 3-5: Work Package Validation (CRITICAL - NEW)
- [ ] ✅ **Work Packages directly map to R&D KRs** (no synthesized content, all activities traced to roadmap)
- [ ] ✅ **Each WP activity has hypothesis/experiment/success criteria FROM roadmap** (copied exactly, not paraphrased)
- [ ] ✅ **WP budgets = sum of R&D KR budgets** (no calculated allocations, explicit from roadmap)
- [ ] ✅ **Budget reconciliation passes** (sum of WP budgets = total application budget within 1k NOK tolerance)
- [ ] Work package dates align with R&D KR timelines
- [ ] Cost category percentages within typical ranges (Personnel 65-75%, Equipment 15-25%, Overhead 10-15%)
- [ ] No TRL 8-9 activities included (market launch, sales, production operations excluded)

### Traceability Requirements (NEW)
- [ ] ✅ **Every Work Package references specific R&D KR IDs** (e.g., "WP1 contains kr-rd-001, kr-rd-002, kr-rd-003")
- [ ] ✅ **Every technical hypothesis traced to roadmap** (can find exact text in 05_roadmap_recipe.yaml)
- [ ] ✅ **Every experiment design copied from roadmap** (no AI-generated test plans)
- [ ] ✅ **Every budget amount matches roadmap estimated_budget** (not calculated by wizard)

**If ANY Phase 0 or Work Package Validation checks fail:** ❌ **DO NOT GENERATE APPLICATION**  
→ Show interactive guidance instead (Step 0.6, 0.7, or 0.8 depending on failure type)

---

## Error Handling

### If EPF Data Insufficient

Output partial document with clearly marked sections:

```markdown
⚠️ **INCOMPLETE SECTION - MANUAL INPUT REQUIRED**

**Missing EPF Data:** {field_name}  
**Needed For:** {section_name}  
**Impact:** {explanation}

**Guidance:**
{Suggestions for completing this section based on SkatteFUNN requirements}

---
```

### If Budget Exceeds Cap

```markdown
⚠️ **BUDGET COMPLIANCE WARNING**

Year {year} budget ({amount:,} NOK) exceeds SkatteFUNN maximum (25,000,000 NOK).

**Action Required:**
- Reduce budget for {year} to ≤25M NOK, OR
- Split project into multiple applications across different legal entities

Tax deduction calculation limited to 25M NOK base amount.
```

---

## Output File Naming

```
{org_name_slug}-skattefunn-application-{YYYY-MM-DD}.md
```

Example: `outblocks-skattefunn-application-2025-12-31.md`

---

## Post-Generation Recommendations

Include at end of document:

```markdown
---

## Next Steps for Submission

1. **Review for Accuracy**
   - Verify all organization details
   - Check contact information
   - Confirm timeline feasibility

2. **Technical Review**
   - Have technical lead review R&D challenge descriptions
   - Ensure state-of-the-art comparison is accurate
   - Validate work package activities

3. **Budget Verification**
   - Confirm budget numbers match accounting records
   - Verify cost category allocations
```

---

## Phase 6: Self-Validation

**Purpose:** Run independent validator on generated application to catch any errors before user submission.

### Step 6.0: Prepare for Validation

**Action:** Inform user that self-validation will now run.

**Message to user:**
```
I'll now perform self-validation on the generated application in two steps:

Step 1: Character Limit Enforcement
- Scan for all character count violations
- Automatically trim content to meet limits
- Preserve meaning and technical accuracy

Step 2: Independent Validator (validator.sh)
- Layer 1: Schema Structure (all required sections present)
- Layer 2: Semantic Rules (TRL ranges, placeholders, activity counts)
- Layer 3: Budget Validation (totals, percentages, temporal consistency)
- Layer 4: Traceability (KR references, EPF sources)

This typically takes 10-15 seconds...
```

### Step 6.1: Character Limit Enforcement (Auto-Trim)

**Purpose:** Detect and automatically fix all character limit violations BEFORE running validator.sh.

**Character Limits (from template.md):**
- Section 2.1: Project titles (100 chars EN/NO, 60 chars short name)
- Section 4.1: Primary Objective (1000 chars)
- Section 4.2: Market Differentiation (2000 chars)
- Section 5: R&D Content (2000 chars)
- Section 6: Project Summary (1000 chars)
- Work Package Challenges: 500 chars
- Work Package Methods: 1000 chars
- Activity Titles: 100 chars
- Activity Descriptions: 500 chars

**Process:**

1. **Read the generated application file completely**

2. **Scan for all character count markers**
   - Pattern: `*[Max {limit} characters: {actual}/{limit}]*`
   - Example: `*[Max 500 characters: 588/500]*`
   - Also detect warning markers: `⚠️ *[Exceeded by {N} characters - will trim]*`

3. **Identify violations**
   - Parse actual vs limit: `actual > limit` = violation
   - Extract line numbers and section context
   - Build list of violations: `[(line_num, actual, limit, section_name)]`

4. **For each violation, apply intelligent trimming:**

   **Trimming Strategy:**
   ```python
   def trim_text_intelligently(text, target_length):
       """
       Trim text to target_length while preserving meaning and readability.
       
       Rules:
       1. Remove filler phrases first
       2. Condense verbose explanations
       3. Use shorter synonyms
       4. Preserve technical terms and key details
       5. Maintain sentence boundaries (don't cut mid-sentence)
       6. Keep first and last sentences if possible (thesis + conclusion)
       """
       
       # Step 1: Remove common filler phrases
       fillers = [
           "it is important to note that",
           "it should be noted that",
           "in order to",
           "for the purpose of",
           "with the aim of",
           "it is worth mentioning",
           "as previously mentioned",
           "as mentioned earlier",
           "at this point in time",
           "due to the fact that"
       ]
       
       for filler in fillers:
           text = text.replace(filler, "")
       
       # Step 2: Condense parentheticals
       # "(e.g., example one, example two, example three)" → "(e.g., examples)"
       
       # Step 3: Check length
       if len(text) <= target_length:
           return text.strip()
       
       # Step 4: Sentence-level trimming (preserve first + last)
       sentences = text.split('. ')
       if len(sentences) > 2:
           # Keep first and last, trim middle
           first = sentences[0]
           last = sentences[-1]
           middle = sentences[1:-1]
           
           # Try removing middle sentences until fits
           while len('. '.join([first, last])) > target_length and middle:
               middle.pop(0)  # Remove from middle first
           
           result = '. '.join([first] + middle + [last])
           if len(result) <= target_length:
               return result.strip()
       
       # Step 5: Hard truncate at sentence boundary (last resort)
       truncated = text[:target_length]
       last_period = truncated.rfind('. ')
       if last_period > target_length * 0.8:  # If we're >80% there
           return truncated[:last_period + 1].strip()
       else:
           # No good sentence boundary, truncate at word
           last_space = truncated.rfind(' ')
           return truncated[:last_space].strip() + "..."
   ```

5. **Update the application file:**
   - For each violation:
     a. Extract the text content (between heading and character marker)
     b. Apply `trim_text_intelligently(text, limit)`
     c. Replace old text with trimmed text
     d. Update character count marker: `*[Max {limit} characters: {new_actual}/{limit}]*`
     e. Remove warning marker: `⚠️ *[Exceeded by X characters - will trim]*`
   
6. **Verify all violations fixed:**
   - Re-scan file for character count markers
   - Ensure all show `actual <= limit`
   - Count fixes applied

7. **Report to user:**
   ```markdown
   ### Character Limit Enforcement Complete
   
   **Violations Found:** {N}
   **Violations Fixed:** {N}
   
   **Details:**
   - Section 4.1 Challenge: 588/500 → 498/500 (trimmed 90 chars)
   - WP1 Activity 1: 523/500 → 497/500 (trimmed 26 chars)
   - WP2 Method: 1082/1000 → 998/1000 (trimmed 84 chars)
   - ... (list all fixes)
   
   **Trimming Preserved:**
   ✅ Technical accuracy
   ✅ Key details and hypotheses
   ✅ Sentence readability
   ✅ Meaning and context
   
   **Verification:**
   ✅ All character limits now compliant
   ✅ No warning markers remaining
   ✅ Ready for validator.sh
   ```

**Implementation Notes:**

- **Extract text sections** using line ranges from character markers
- **Common sections requiring trimming:**
  - Work Package R&D Challenges (500 char limit)
  - Work Package Methods (1000 char limit)
  - Activity descriptions (500 char limit)
  - Section 4.1 Primary Objective (1000 char limit)
  - Section 5 R&D Content (2000 char limit)

- **Preserve formatting:**
  - Keep markdown structure (bold, italics)
  - Maintain list formats
  - Don't break technical terms across lines

- **Quality checks:**
  - Verify trimmed text still reads naturally
  - Ensure no orphaned words or broken sentences
  - Maintain professional tone

**Example Before/After:**

**Before (588 chars):**
```
Can structured feature definition format bridge product vision and engineering 
implementation while supporting AI-assisted development? Challenge: design 
specification structure capturing functional requirements, technical constraints, 
acceptance criteria in machine-readable format usable by both humans and AI coding 
agents. Unknown: whether format reduces specification ambiguity, enables automated 
validation, and improves dev team alignment. It is important to note that failure 
mode: specifications remain ambiguous, AI agents misinterpret requirements, format 
adds overhead without value.
```

**After (497 chars):**
```
Can structured feature definition format bridge product vision and engineering 
implementation while supporting AI-assisted development? Challenge: design 
specification structure capturing functional requirements, technical constraints, 
acceptance criteria in machine-readable format usable by both humans and AI coding 
agents. Unknown: whether format reduces specification ambiguity, enables automated 
validation, and improves dev team alignment. Failure mode: specifications remain 
ambiguous, AI agents misinterpret requirements, format adds overhead without value.
```

**Changes:** Removed filler "It is important to note that" (27 chars + spaces = 30 chars saved).

---

### Step 6.2: Execute Validator

**Command:** Run validator.sh on the generated application file (AFTER character limit enforcement).

**Location:** `docs/EPF/outputs/skattefunn-application/validator.sh`

**Syntax:**
```bash
bash validator.sh /path/to/generated-application.md
```

**Expected Output Format:**
```
╔═══════════════════════════════════════════════════════╗
║      SkatteFUNN Application Validator v1.0.0         ║
╚═══════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Layer 1: Schema Structure
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Found section: ## Section 1: Project Owner and Roles
...
✗ ERROR: Missing section: ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Validation Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Errors by Layer:
  Schema:        0
  Semantic:      0
  Budget:        0
  Traceability:  0

Total Errors:    0
Total Warnings:  3

Exit Code: 0 (VALIDATION PASSED) or 1 (VALIDATION FAILED)
```

### Step 6.3: Parse Validator Output

**Parse the following information from validator output:**

1. **Exit Code**
   - `0` = Validation passed (0 errors)
   - `1` = Validation failed (1+ errors)

2. **Error Counts by Layer**
   - Schema errors (missing sections, wrong format)
   - Semantic errors (TRL issues, placeholder text, activity counts)
   - Budget errors (totals mismatch, temporal consistency, percentages)
   - Traceability errors (missing KR references, EPF sources)

3. **Specific Error Messages**
   - Each error line starts with `✗ ERROR:`
   - Extract error details for root cause analysis

4. **Warning Counts**
   - Warnings don't block submission but should be reviewed
   - Lines starting with `⚠ WARNING:`

### Step 6.4: Report Results to User

**Scenario A: Zero Errors (Exit Code 0)**

**Message:**
```markdown
## ✅ Validation PASSED

The application passed all validation checks!

**Summary:**
- ✅ Layer 1 (Schema): 0 errors
- ✅ Layer 2 (Semantic): 0 errors  
- ✅ Layer 3 (Budget): 0 errors
- ✅ Layer 4 (Traceability): 0 errors

⚠️ Warnings: {N}
{List warnings if any}

**Status:** Application is ready for review and submission.

**Next Steps:**
1. Review the generated application for accuracy
2. Verify budget numbers match your accounting records
3. Copy content to SkatteFUNN portal when ready
```

**Action:** Proceed to Phase 7 (completion).

---

**Scenario B: Warnings Only (Exit Code 0 but warnings present)**

**Message:**
```markdown
## ✅ Validation PASSED (with warnings)

The application passed validation but has {N} warnings:

{List each warning with context}

**Warnings Explanation:**
- Most warnings are informational reminders
- Common warnings:
  * "Organization number format may be incorrect" - Check XXX XXX XXX format
  * "Work Package X missing some cost code categories" - Usually acceptable
  * "No explicit WP → KR mappings" - Traceability section exists but could be enhanced
  * Character limit checks - Verify manually during copy/paste

**Status:** Application is acceptable for submission. Review warnings and decide if fixes needed.
```

**Action:** User decides whether to address warnings or proceed.

---

**Scenario C: Errors Present (Exit Code 1)**

**Analyze error type and determine if auto-fixable:**

**Auto-Fixable Errors (attempt automatic correction):**
1. **Budget Temporal Errors**
   - WP has budget entries outside its duration
   - **Fix:** Redistribute budget years to match WP duration
   - **Example:** WP1 ends July 2026 but has 2027 costs → move to 2025/2026

2. **Section Order Errors**
   - Section 4 and Section 5 swapped
   - **Fix:** Reorder sections

3. **Missing Budget Subsections**
   - WP missing #### Budget section
   - **Fix:** Add budget breakdown from Section 8.2 data

**Non-Fixable Errors (require user input):**
1. **Missing Required Sections**
   - Indicates generation failure
   - **Action:** Report to user, request re-generation

2. **TRL Ineligibility (TRL 1 or TRL 8+)**
   - Cannot auto-correct without changing KR selection
   - **Action:** Report to user, suggest KR filtering

3. **Placeholder Text (XXX)**
   - Requires real data from user
   - **Action:** Report locations, ask user to provide info

### Step 6.5: Auto-Fix Attempt (if errors are auto-fixable)

**Maximum Iterations:** 2

**Process:**
1. Identify error type from validator output
2. Apply appropriate fix logic
3. Re-run validator
4. If still failing after 2 attempts, report to user

**Example: Budget Temporal Error Fix**

**Validator Error:**
```
✗ ERROR: Work Package 1 has budget entries in year(s) [2027] OUTSIDE its duration (years 2025-2026)
✗ ERROR:   Duration: August 2025 to July 2026 (12 months)
✗ ERROR:   Valid budget years: 2025 through 2026
```

**Fix Logic:**
1. Extract WP1 duration: Aug 2025 - Jul 2026
2. Identify invalid years: 2027
3. Extract 2027 budget amount: {amount}
4. Calculate proportional distribution:
   - 2025: 5 months (Aug-Dec) = 5/12 of WP budget
   - 2026: 7 months (Jan-Jul) = 7/12 of WP budget
5. Remove 2027 row from WP1 budget table
6. Add 2027 amount proportionally to 2025 and 2026
7. Update Section 8.1 yearly totals
8. Update Section 8.3 yearly totals (if exists)

**Report to User:**
```markdown
### Auto-Fix Applied: Budget Temporal Consistency

**Issue:** Work Package 1 had budget entries in 2027, but its duration ends July 2026.

**Fix Applied:**
- Removed 2027 budget row (252,000 NOK)
- Redistributed amount proportionally:
  * Added 105,000 NOK to 2025 (5/12 months)
  * Added 147,000 NOK to 2026 (7/12 months)
- Updated Section 8.1 yearly totals
- Updated WP1 budget table

**Re-running validator...**
```

### Step 6.6: Final Validation Report

**After auto-fix attempts (or if no auto-fix needed):**

**Message:**
```markdown
## Validation Final Report

**Iterations:** {N}/2

**Final Status:** {PASSED | FAILED}

**Errors Remaining:** {N}
{List any errors that could not be auto-fixed}

**Warnings:** {N}
{List warnings if any}

---

**Recommendations:**
{Provide specific guidance based on remaining errors}

**Status:** 
- If 0 errors: ✅ Ready for submission
- If 1-5 errors: ⚠️ Requires manual fixes (listed above)
- If 6+ errors: ❌ Significant issues detected, recommend re-generation
```

### Step 6.7: Abort Conditions

**Abort generation and report to user if:**

1. **Critical Schema Failures**
   - 5+ missing required sections
   - Indicates generation process failed
   - **Action:** Offer to re-run Phases 1-5

2. **Validation Script Errors**
   - validator.sh returns unexpected output
   - Script crashes or times out
   - **Action:** Report technical issue, continue without validation

3. **Cannot Parse Validator Output**
   - Output format doesn't match expected structure
   - **Action:** Show raw output to user, continue without parsing

### Validation Output Parsing Examples

**Example 1: Parse Error Count**
```
Input: "Total Errors:    3"
Extract: errors = 3
```

**Example 2: Parse Temporal Error**
```
Input: "✗ ERROR: Work Package 2 has budget entries in year(s) [2027, 2027] OUTSIDE its duration (years 2025-2026)"
Extract:
  - wp_number = 2
  - invalid_years = [2027, 2027]
  - valid_range = (2025, 2026)
```

**Example 3: Parse Warning**
```
Input: "⚠ WARNING: Work Package 1 missing some cost code categories"
Extract:
  - warning_type = "missing_cost_codes"
  - wp_number = 1
```

---

## AI Assistant Execution Checklist

**Before starting generation, the AI assistant MUST confirm:**

- [ ] ✅ Phase 0 complete: TRL 2-7 filtering executed, eligible KRs identified
- [ ] ✅ **Phase 0.5 complete: User reviewed ALL eligible KRs and made explicit selection**
- [ ] ⚠️ **STOP: Did I show the user ALL eligible KRs and let them choose? If NO, STOP NOW.**
- [ ] ✅ User confirmed selected KRs and budget allocation
- [ ] ✅ Only proceeding to document generation AFTER user confirmation
- [ ] ✅ Phase 6 Step 6.1: Character limit enforcement will run automatically (auto-trim violations)
- [ ] ✅ Phase 6 Step 6.2: Self-Validation will run automatically after character enforcement
- [ ] ✅ Validator output will be parsed and auto-fixes attempted (max 2 iterations)

**Red flags that indicate I skipped Phase 0.5:**
- ❌ I did not show the user a list of eligible KRs
- ❌ I did not ask the user which ones to include
- ❌ I assumed all eligible KRs should be included automatically
- ❌ I proceeded directly from eligibility validation to document generation

**If ANY red flag is true, STOP immediately and execute Phase 0.5.**

---

## Summary of Phase Dependencies

```
Phase 0: Eligibility Validation
    ↓ (outputs: eligible_krs list)
Phase 0.5: User Selection ← ⚠️ MANDATORY INTERACTIVE STEP
    ↓ (outputs: selected_krs list)
Phase 1: Pre-flight Validation
    ↓
Phase 2: Data Extraction
    ↓
Phase 3: Content Synthesis
    ↓
Phase 4: Document Assembly
    ↓
Phase 5: Budget Allocation (includes Step 5.5: Budget Temporal Validation)
    ↓
Phase 6: Self-Validation
    ├─ Step 6.1: Character Limit Enforcement (auto-trim violations)
    ├─ Step 6.2: Run validator.sh (4-layer validation)
    ├─ Step 6.3: Parse validator output
    ├─ Step 6.4: Report results to user
    ├─ Step 6.5: Auto-fix budget/temporal errors (max 2 iterations)
    ├─ Step 6.6: Final validation report
    └─ Step 6.7: Abort conditions (if critical failures)
    ↓
Final Output: Application Document (character limits enforced, validated & ready for submission)
```

**Remember: selected_krs (from Phase 0.5) != eligible_krs (from Phase 0)**
   - Check compliance with 25M NOK cap

4. **Translation (if needed)**
   - This draft is in English
   - Research Council accepts applications in English
   - Consider Norwegian version for clarity

5. **Official Submission**
   - Submit via Research Council portal: https://kunde.forskningsradet.no/
   - Attach auditor documentation for historical costs (2025 budget)
   - Include organizational documents if first application

6. **Timeline Note**
   - SkatteFUNN accepts applications year-round
   - Processing time: typically 4-6 weeks
   - Retroactive applications allowed (costs already incurred)

**Questions?**
Contact Research Council of Norway SkatteFUNN team:
- Email: skattefunn@forskningsradet.no
- Phone: +47 22 03 70 00
```
