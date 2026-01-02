# SkatteFUNN Output Files: v2.0.0 Update Analysis

**Date**: 2026-01-01  
**Purpose**: Identify which files need updating for schema v2.0.0 compatibility

## Files Analyzed

1. ✅ `schema.json` - Already updated to v2.0.0
2. ✅ `template.md` - Already updated to v2.0.0
3. ⚠️ `README.md` - Needs updates (references old 6-section structure)
4. ❌ `wizard.instructions.md` - Needs major updates (references old schema v1.0.0)
5. ❌ `validator.sh` - Needs major updates (validates old 6-section structure)

---

## 1. README.md - Minor Updates Needed

### Current State (v1.0.0 references)
- References "6 required sections" (should be 8)
- Section names outdated:
  - "Owner, Roles, Details, Timeline, Budget, Traceability"
  - Should be: "Project Owner & Roles, About Project, Background, Objective, R&D Content, Summary, Work Packages, Budget"
- Version history shows v1.0.0 only
- References old budget structure (cost categories with percentages)

### Required Updates

#### 1. Update Validation Layer description
**Change from**:
```markdown
### Layer 1: Schema Structure
- 6 required sections present (Owner, Roles, Details, Timeline, Budget, Traceability)
```

**Change to**:
```markdown
### Layer 1: Schema Structure
- 8 required sections present (Project Owner & Roles, About Project, Background & Company Activities, Primary Objective & Innovation, R&D Content, Project Summary, Work Packages, Total Budget & Tax Deduction)
- EPF Traceability section
- Character limits enforced (60, 100, 500, 1000, 2000 chars)
```

#### 2. Update budget validation description
**Change from**:
```markdown
### Layer 3: Budget Validation
- Cost categories within typical ranges (70% personnel, 20% equipment, 10% overhead)
- Cost categories sum to 100%
```

**Change to**:
```markdown
### Layer 3: Budget Validation
- Budget organized by work packages (1-8 WPs required)
- Each WP has 2-8 activities with allocated budgets
- Cost codes used: Personnel, Equipment, Other Operating Costs, Overhead
- Budget sums by year and work package reconcile to total
```

#### 3. Update common issues examples
**Add new issue**:
```markdown
### Error: Character limit exceeded

**Problem:** Field exceeds official form character limit (e.g., project_summary > 1000 chars)

**Fix:** Trim text to fit within limits:
- Titles: 100 chars (English, Norwegian)
- Short name: 60 chars
- Primary objective: 1000 chars
- Project summary: 1000 chars
- Company activities, background, differentiation, R&D content: 2000 chars
- WP challenges: 500 chars
- Activity description: 500 chars
```

#### 4. Update version history
**Add v2.0.0 entry**:
```markdown
## Version History

- **v2.0.0** (2026-01-01) - Major restructure for official form compatibility
  - Restructured to 8 official form sections
  - Added character limit validation (60, 100, 500, 1000, 2000 chars)
  - Replaced flat budget with work packages array (1-8 WPs, 2-8 activities per WP)
  - Added Norwegian title, creator role, nested scientific_discipline
  - Changed cost categories from percentages to official cost codes
  - Made Section 7 (Work Packages) repeatable for copy/paste workflow

- **v1.0.0** (2025-12-31) - Initial release
  - 4-layer validation (schema, semantic, budget, traceability)
  - Budget reconciliation with 1,000 NOK tolerance
  - TRL range checking (2-7 eligibility)
  - Frascati criteria verification
  - Roadmap KR traceability validation
```

**Priority**: MEDIUM (doesn't block usage, but documentation should be accurate)

---

## 2. wizard.instructions.md - Major Updates Required

### Current State (v1.0.0 schema)
- Version: 1.1.0
- References old schema fields:
  - `{{organization_name}}`, `{{organization_number}}`, `{{manager_name}}`
  - `{{project_title}}`, `{{project_short_name}}`, `{{scientific_discipline}}` (string)
  - `{{project_leader_name}}`, `{{org_rep_name}}` (flat, not nested)
  - `{{trl_start}}`, `{{trl_end}}` (separate fields)
- Budget structure: flat yearly_breakdown with percentages
- No Norwegian title field
- No work package array structure
- No character limit enforcement logic

### Required Updates

#### Phase 0.5: Update KR Selection to Include New Fields
**Add after budget validation**:
```markdown
### Step 0.5.4: Show Character Limits for Selected KRs

For each selected KR, estimate character counts:
- WP name: {kr.description} (target: 80-100 chars)
- WP challenges: {kr.uncertainty_addressed} (target: 400-500 chars)
- WP method: {kr.experiment_design} + {kr.measurement_method} (target: 800-1000 chars)
- Activity titles: Extract from {kr.deliverables} (target: 80-100 chars each)
- Activity descriptions: From {kr.experiment_design} steps (target: 400-500 chars each)

**Warn if any field likely to exceed limits based on source text length.**
```

#### Phase 2: Update EPF Data Extraction
**Add after loading roadmap**:
```markdown
### Step 2.2: Extract Norwegian Translations

If `title_norwegian` not in user_input.project_info:
    # Generate Norwegian title from English
    english_title = user_input.project_info.title_english
    
    # Use translation logic or prompt user:
    print(f"📝 English title: {english_title}")
    norwegian_title = input("Enter Norwegian translation (max 100 chars): ")
    
    if len(norwegian_title) > 100:
        print(f"⚠️ Title too long ({len(norwegian_title)} chars). Truncating to 100 chars...")
        norwegian_title = norwegian_title[:97] + "..."
    
    user_input.project_info.title_norwegian = norwegian_title
```

#### Phase 3: Update Content Synthesis
**Replace Frascati section with R&D Content synthesis**:
```markdown
### Step 3.3: Synthesize R&D Content (2000 chars)

Combine insights from selected KRs to answer:
1. What technical/scientific challenge has no known solution?
2. Why is R&D required (not just implementation)?
3. What systematic method will be used?

Template:
"""
The project addresses [challenge] where no existing solution provides [specific capability gap]. 
Current approaches [limitation 1, limitation 2, limitation 3] making R&D essential.

We will use systematic [methodology] combining [technique 1], [technique 2], and [technique 3].
Success requires experimentation with [uncertain element 1] and [uncertain element 2], 
as outcomes cannot be predicted from existing knowledge.

The R&D approach includes: [step 1], [step 2], [step 3], with measurable criteria: [criteria].
"""

**Enforce**: Output must be ≤2000 characters. Trim if needed.
```

#### Phase 4: Update Document Assembly
**Replace old variable mapping with new nested structure**:
```markdown
### Step 4.2: Map Data to Template Variables

```python
template_vars = {
    # Organization (nested)
    'organization': {
        'name': user_input.organization.name,
        'org_number': user_input.organization.org_number,
        'manager_name': user_input.organization.manager_name
    },
    
    # Contact (3 roles, nested)
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
    
    # Project Info (nested with character limits)
    'project_info': {
        'title_english': user_input.project_info.title_english[:100],  # Enforce limit
        'title_norwegian': user_input.project_info.title_norwegian[:100],
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
    
    # Work Packages (array 1-8)
    'work_packages': []  # Populated in Phase 5
}
```
```

#### Phase 5: Update Budget Allocation
**Complete rewrite for work package structure**:
```markdown
### Step 5.1: Create Work Packages from Selected KRs

For each selected KR, create a work package:

```python
work_packages = []

for kr_data in selected_krs:
    kr = kr_data['kr']
    
    # Calculate start/end months from roadmap phase
    start_month = calculate_project_month(kr.get('start_date'), project_start_date)
    end_month = calculate_project_month(kr.get('end_date'), project_start_date)
    
    # Determine R&D category based on TRL range
    if kr['trl_start'] <= 3:
        rd_category = "Industrial Research"  # TRL 2-3 = early research
    else:
        rd_category = "Experimental Development"  # TRL 4-7 = later development
    
    # Extract activities from deliverables (2-8 required)
    activities = []
    deliverables = kr.get('deliverables', [])
    
    if len(deliverables) < 2:
        # Generate activities from experiment_design
        activities = generate_activities_from_experiment(kr['experiment_design'])
    else:
        for i, deliverable in enumerate(deliverables[:8], 1):  # Max 8
            activities.append({
                'title': truncate(deliverable.get('title', f'Activity {i}'), 100),
                'description': truncate(deliverable.get('description', ''), 500)
            })
    
    # Ensure 2-8 activities
    if len(activities) < 2:
        # Pad with generic activities
        activities.append({
            'title': 'Documentation and Knowledge Transfer',
            'description': 'Document findings, create technical reports, transfer knowledge to team.'
        })
    
    # Allocate budget from kr.estimated_budget
    budget_nok = kr.get('estimated_budget', 0)
    yearly_costs = allocate_budget_by_year(budget_nok, start_month, end_month, kr.get('budget_breakdown', {}))
    
    work_package = {
        'name': truncate(kr['description'], 100),
        'start_month': start_month,
        'end_month': end_month,
        'rd_category': rd_category,
        'rd_challenges': truncate(kr['uncertainty_addressed'], 500),
        'method_approach': truncate(f"{kr['experiment_design']} {kr.get('measurement_method', '')}", 1000),
        'activities': activities,
        'budget': {
            'yearly_costs': yearly_costs,
            'cost_specification': truncate(kr.get('budget_notes', ''), 500)
        },
        'total_budget_nok': budget_nok
    }
    
    work_packages.append(work_package)

template_vars['work_packages'] = work_packages
```

### Step 5.2: Calculate Budget Summaries

Generate Section 8 summary tables:

```python
def calculate_budget_summaries(work_packages):
    # By year and cost code
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
            
            if cost_code == 'Personnel':
                budget_by_year[year]['personnel_nok'] += amount
            elif cost_code == 'Equipment':
                budget_by_year[year]['equipment_nok'] += amount
            elif cost_code == 'Other Operating Costs':
                budget_by_year[year]['other_operating_costs_nok'] += amount
            elif cost_code == 'Overhead':
                budget_by_year[year]['overhead_nok'] += amount
    
    # Calculate year totals
    for year in budget_by_year:
        budget_by_year[year]['year_total_nok'] = sum([
            budget_by_year[year]['personnel_nok'],
            budget_by_year[year]['equipment_nok'],
            budget_by_year[year]['other_operating_costs_nok'],
            budget_by_year[year]['overhead_nok']
        ])
    
    template_vars['budget_summary_by_year'] = [
        {'year': year, **data} for year, data in sorted(budget_by_year.items())
    ]
    
    # Total budget
    template_vars['total_budget_nok'] = sum(wp['total_budget_nok'] for wp in work_packages)
```
```

**Priority**: HIGH (required for wizard to generate v2.0.0 applications)

---

## 3. validator.sh - Major Updates Required

### Current State (validates v1.0.0 structure)
- Validates 6 sections (not 8)
- Checks for percentage-based cost categories
- No character limit validation
- No work package structure validation
- Section names don't match new template

### Required Updates

#### 1. Update Section Validation (Layer 1)
**Replace section list**:
```bash
# Check required sections (8 main sections + EPF Traceability)
local required_sections=(
    "## Section 1: Project Owner and Roles"
    "## Section 2: About the Project"
    "## Section 3: Background and Company Activities"
    "## Section 4: Primary Objective and Innovation"
    "## Section 5: R&D Content"
    "## Section 6: Project Summary"
    "## Section 7: Work Packages"
    "## Section 8: Total Budget and Estimated Tax Deduction"
    "## EPF Traceability"
)
```

#### 2. Add Character Limit Validation (Layer 2)
**Add new validation function**:
```bash
validate_character_limits() {
    log_section "Layer 2.5: Character Limit Compliance"
    
    local file="$APPLICATION_PATH"
    
    # Extract fields and check lengths
    # Title English (Section 2, look for "**Title (English):** ")
    local title_english=$(grep "^\*\*Title (English):\*\*" "$file" | sed 's/^\*\*Title (English):\*\* //')
    if [[ ${#title_english} -gt 100 ]]; then
        log_error "Title (English) exceeds 100 characters (${#title_english} chars)"
        ((SEMANTIC_ERRORS++))
    fi
    
    # Title Norwegian (Section 2, look for "**Title (Norwegian):** ")
    local title_norwegian=$(grep "^\*\*Title (Norwegian):\*\*" "$file" | sed 's/^\*\*Title (Norwegian):\*\* //')
    if [[ ${#title_norwegian} -gt 100 ]]; then
        log_error "Title (Norwegian) exceeds 100 characters (${#title_norwegian} chars)"
        ((SEMANTIC_ERRORS++))
    fi
    
    # Short Name (Section 2, look for "**Short Name:** ")
    local short_name=$(grep "^\*\*Short Name:\*\*" "$file" | sed 's/^\*\*Short Name:\*\* //')
    if [[ ${#short_name} -gt 60 ]]; then
        log_error "Short Name exceeds 60 characters (${#short_name} chars)"
        ((SEMANTIC_ERRORS++))
    fi
    
    # Note: Full validation of multi-line fields (company_activities, project_background, etc.)
    # requires more complex parsing. Document manual review requirement.
    log_info "Multi-line field character limits (2000, 1000 chars) require manual review"
    log_info "Use official form's built-in character counters during copy/paste"
}
```

#### 3. Update Budget Validation (Layer 3)
**Replace percentage checks with work package structure validation**:
```bash
validate_budget_structure() {
    log_section "Layer 3: Budget Structure (Work Packages)"
    
    local file="$APPLICATION_PATH"
    
    # Check for Work Package sections (minimum 1, maximum 8)
    local wp_count=$(grep -c "^### Work Package [0-9]:" "$file" || echo 0)
    
    if [[ $wp_count -lt 1 ]]; then
        log_error "No work packages found (minimum 1 required)"
        ((BUDGET_ERRORS++))
    elif [[ $wp_count -gt 8 ]]; then
        log_error "Too many work packages ($wp_count found, maximum 8 allowed)"
        ((BUDGET_ERRORS++))
    else
        log_success "Found $wp_count work packages (within 1-8 range)"
    fi
    
    # For each work package, check for required subsections
    for ((i=1; i<=wp_count; i++)); do
        local wp_header="### Work Package $i:"
        
        # Check for required WP fields
        if ! grep -A 20 "$wp_header" "$file" | grep -q "^\*\*Duration:\*\*"; then
            log_error "Work Package $i missing Duration field"
            ((BUDGET_ERRORS++))
        fi
        
        if ! grep -A 20 "$wp_header" "$file" | grep -q "^\*\*R&D Category:\*\*"; then
            log_error "Work Package $i missing R&D Category"
            ((BUDGET_ERRORS++))
        fi
        
        if ! grep -A 20 "$wp_header" "$file" | grep -q "^#### R&D Challenges"; then
            log_error "Work Package $i missing R&D Challenges section"
            ((BUDGET_ERRORS++))
        fi
        
        if ! grep -A 20 "$wp_header" "$file" | grep -q "^#### Method and Approach"; then
            log_error "Work Package $i missing Method and Approach section"
            ((BUDGET_ERRORS++))
        fi
        
        if ! grep -A 20 "$wp_header" "$file" | grep -q "^#### Activities"; then
            log_error "Work Package $i missing Activities section"
            ((BUDGET_ERRORS++))
        fi
        
        # Check activity count (2-8 required per WP)
        local activity_count=$(grep -A 100 "$wp_header" "$file" | grep -c "^##### Activity [0-9]:" || echo 0)
        
        if [[ $activity_count -lt 2 ]]; then
            log_error "Work Package $i has only $activity_count activities (minimum 2 required)"
            ((BUDGET_ERRORS++))
        elif [[ $activity_count -gt 8 ]]; then
            log_error "Work Package $i has $activity_count activities (maximum 8 allowed)"
            ((BUDGET_ERRORS++))
        fi
        
        if ! grep -A 100 "$wp_header" "$file" | grep -q "^#### Budget"; then
            log_error "Work Package $i missing Budget section"
            ((BUDGET_ERRORS++))
        fi
    done
    
    # Check Section 8 summary tables present
    if ! grep -q "^### 8.1 Budget Summary by Year and Cost Code" "$file"; then
        log_error "Missing Section 8.1 (Budget Summary by Year and Cost Code)"
        ((BUDGET_ERRORS++))
    fi
    
    if ! grep -q "^### 8.2 Budget Allocation by Work Package" "$file"; then
        log_error "Missing Section 8.2 (Budget Allocation by Work Package)"
        ((BUDGET_ERRORS++))
    fi
}
```

#### 4. Update Cost Code Validation
**Replace percentage validation with cost code validation**:
```bash
validate_cost_codes() {
    log_section "Layer 3.5: Cost Code Validation"
    
    local file="$APPLICATION_PATH"
    
    # Check that official cost codes are used
    local valid_codes=("Personnel" "Equipment" "Other Operating Costs" "Overhead")
    
    # Extract cost codes from budget tables (look for "| Year | Cost Code | Amount")
    local found_codes=$(grep "^|" "$file" | grep -i "personnel\|equipment\|other operating costs\|overhead" || echo "")
    
    if [[ -z "$found_codes" ]]; then
        log_warning "No cost codes found in budget tables"
        ((WARNINGS++))
        return
    fi
    
    # Validate cost codes match official list
    for code in "${valid_codes[@]}"; do
        if ! grep -q "$code" "$file"; then
            log_warning "Cost code '$code' not found in budget (may be acceptable if 0 allocation)"
        fi
    done
    
    log_success "Cost code validation complete"
}
```

**Priority**: HIGH (required for validating v2.0.0 applications)

---

## Summary of Required Work

| File | Priority | Effort | Changes Needed |
|------|----------|--------|----------------|
| `schema.json` | ✅ DONE | - | Already v2.0.0 |
| `template.md` | ✅ DONE | - | Already v2.0.0 |
| `README.md` | MEDIUM | 1-2 hours | Update section counts (6→8), budget validation description, add character limit example, update version history |
| `wizard.instructions.md` | HIGH | 6-8 hours | Major rewrite: Phase 2 (Norwegian title), Phase 3 (R&D content), Phase 4 (nested variables), Phase 5 (work packages from KRs, budget summaries) |
| `validator.sh` | HIGH | 4-6 hours | Update section names (6→8), add character limit validation, replace percentage checks with WP structure validation, add cost code validation |

**Total Estimated Effort**: 11-17 hours

**Recommended Order**:
1. **README.md** (quick, unblocks documentation)
2. **wizard.instructions.md** (enables v2.0.0 generation)
3. **validator.sh** (enables v2.0.0 validation)

---

## Testing Strategy

After updates:
1. **Generate test application** with wizard using v2.0.0 schema
2. **Validate with validator.sh** (should pass all checks)
3. **Test copy/paste workflow** to official online form
4. **Migrate emergent application** to v2.0.0 structure as proof of concept

---

## Files Created
- `docs/EPF/.epf-work/skattefunn-schema-update-2026-01-01/FILE_UPDATE_ANALYSIS.md` (this file)
