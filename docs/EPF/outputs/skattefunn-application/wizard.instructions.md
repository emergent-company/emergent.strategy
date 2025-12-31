# SkatteFUNN Application Generator - Wizard Instructions

**Version:** 1.1.0  
**Purpose:** Generate Norwegian R&D Tax Deduction Scheme applications from EPF data  
**Output Format:** Markdown document following Research Council of Norway requirements

---

## ⚠️ CRITICAL: ALWAYS RUN PHASES IN ORDER - DO NOT SKIP

This wizard MUST be executed sequentially. Each phase depends on the previous one.

## Generation Process Overview

### ✅ Phase 0: R&D Eligibility Validation (MANDATORY - TRL 2-7 filtering)
### ✅ **Phase 0.5: Interactive Key Result Selection (MANDATORY - User chooses which KRs to include)**
### Phase 1: Pre-flight Validation
### Phase 2: EPF Data Extraction
### Phase 3: Content Synthesis (Frascati Compliance)
### Phase 4: Document Assembly
### Phase 5: Budget Allocation

**⚠️ STOP AFTER PHASE 0.5 AND GET USER CONFIRMATION BEFORE PROCEEDING TO PHASE 1**

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
roadmap_path = f"{user_input.epf_sources.instance_path}/READY/05_roadmap_recipe.yaml"
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
# Execute full validation pipeline
budget_period = {
    'start_date': user_input.timeline.project_start,
    'end_date': user_input.timeline.project_end,
    'total_budget': user_input.budget.total_amount
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
- Maximum 100 characters

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

### Section Structure

```markdown
# SkatteFUNN - Tax Deduction Scheme Application

**Application Date:** {timeline.application_date}  
**Status:** Draft  
**Project Period:** {timeline.start_date} to {timeline.end_date} ({duration} months)

---

## 1. Project Owner

{organization.name} (Org. No.: {organization.org_number})  
**Manager:** {organization.manager_name}

---

## 2. Roles in the Project

### Mandatory Roles

| Name | Role | Organisation | E-mail | Phone | Access |
|------|------|--------------|--------|-------|--------|
| {contact.project_leader.name} | Creator of Application | {org.name} | {email} | {phone} | Delete, Submit, Edit, Read, Withdraw, ChangeAccess |
| {contact.org_representative.name} | Organisation Representative | {org.name} | {email} | {phone} | Edit, Read, Approve |
| {contact.project_leader.name} | Project Leader | {org.name} | {email} | {phone} | Delete, Submit, Edit, Read, Withdraw, ChangeAccess |

---

## 3. Project Details

### 3.1 General Information

**Title (English):** {synthesized_title}

**Project Short Name:** {org_name_short}-{product_name}-RD

**Scientific Discipline:** {technical_details.scientific_discipline}

### 3.2 Project Background and Company Activities

**Company Activities:**
{synthesized_from: north_star.mission.what_we_do}

**Project Background:**
{synthesized_content - see Synthesis Rule 2}

### 3.3 Objectives and Innovation

**Primary Objective:**
{synthesized_content - see Synthesis Rule 3}

**R&D Content and Technical Challenges:**
{synthesized_content - see Synthesis Rule 4}

**State-of-the-Art Comparison:**
{synthesized_content - see Synthesis Rule 5}

**Project Summary:**
{Combine above sections into 200-300 word executive summary}

**Technology Readiness Level:**
- Starting TRL: {technical_details.trl_start}
- Target TRL: {technical_details.trl_end}

**Frascati Criteria Compliance:**
✓ **Novel:** {Explain how project generates new findings}
✓ **Creative:** {Explain original concepts/hypotheses}
✓ **Uncertain:** {Explain technical unpredictability}
✓ **Systematic:** {Explain planned methodology}
✓ **Transferable:** {Explain how results advance field}

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

## AI Assistant Execution Checklist

**Before starting generation, the AI assistant MUST confirm:**

- [ ] ✅ Phase 0 complete: TRL 2-7 filtering executed, eligible KRs identified
- [ ] ✅ **Phase 0.5 complete: User reviewed ALL eligible KRs and made explicit selection**
- [ ] ⚠️ **STOP: Did I show the user ALL eligible KRs and let them choose? If NO, STOP NOW.**
- [ ] ✅ User confirmed selected KRs and budget allocation
- [ ] ✅ Only proceeding to document generation AFTER user confirmation

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
Phase 5: Budget Allocation
    ↓
Final Output: Application Document
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
