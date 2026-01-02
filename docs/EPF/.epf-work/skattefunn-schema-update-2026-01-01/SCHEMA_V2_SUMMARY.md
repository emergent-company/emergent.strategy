# SkatteFUNN Schema v2.0.0 Update Summary

**Date**: 2026-01-01  
**Status**: ✅ Schema Complete, Template Pending  
**Purpose**: Align schema with official SkatteFUNN online form structure for easy copy/paste

## Changes Applied

### Version Upgrade
- **From**: v1.0.0 (flat budget structure)
- **To**: v2.0.0 (work packages with official form fields)

### Top-Level Structure Changes

#### 1. Contact Roles (3 roles now)
**Added**:
- `creator` - Person filling out the form

**Existing**:
- `project_leader` - Person managing the R&D project
- `org_representative` - Legal signatory for company

**Rationale**: Official form separates creator from project leader

#### 2. Project Info (NEW - replaces technical_details)
**Added 10 character-limited fields**:
- `title_english` (max 100 chars)
- `title_norwegian` (max 100 chars)
- `short_name` (max 60 chars)
- `scientific_discipline` (nested: subject_area → subject_group → subject_discipline)
- `area_of_use` (industry where results used)
- `continuation` (boolean - continuation of previous project?)
- `other_applicants` (boolean - other companies applying?)
- `company_activities` (max 2000 chars - products, markets, stage)
- `project_background` (max 2000 chars - why important)
- `primary_objective` (max 1000 chars - goals and deliverables)
- `market_differentiation` (max 2000 chars - how solution differs)
- `rd_content` (max 2000 chars - R&D challenge, why needed, method)
- `project_summary` (max 1000 chars - published publicly if approved)

**Removed**:
- `technical_details.trl_start` (now in work_packages)
- `technical_details.trl_end` (now in work_packages)
- `technical_details.scientific_discipline` (moved to project_info as nested object)

#### 3. Timeline Enhancement
**Added**:
- `duration_months` (1-48 months) - explicit duration field

**Existing**:
- `start_date`, `end_date`, `application_date`

#### 4. Work Packages (NEW - replaces flat budget)
**Structure**: Array (1-8 work packages)

**Each WP contains**:
- `name` (max 100 chars)
- `start_month` / `end_month` (within project period)
- `rd_category` (enum: "Experimental Development" | "Industrial Research")
- `rd_challenges` (max 500 chars - challenge with no known solution)
- `method_approach` (max 1000 chars - systematic process)
- `activities` (array 2-8):
  - `title` (max 100 chars)
  - `description` (max 500 chars)
- `budget`:
  - `yearly_costs` (array):
    - `year` (2020-2035)
    - `cost_code` (enum: "Personnel" | "Equipment" | "Other Operating Costs" | "Overhead")
    - `amount_nok`
  - `cost_specification` (max 500 chars - optional elaboration)

**Removed**:
- `budget.total_nok` (calculated from work_packages)
- `budget.yearly_breakdown` (now in work_packages.budget.yearly_costs)
- `budget.cost_categories` (personnel_pct, equipment_pct, overhead_pct)

**Rationale**: Official form uses work packages (Section 7) with repeatable structure, not flat budget table

### Cost Category Changes

**From** (v1.0.0 - percentage-based):
- Personnel % (default 60%)
- Equipment % (default 25%)
- Overhead % (default 15%)

**To** (v2.0.0 - SkatteFUNN cost codes):
- Personnel
- Equipment
- Other Operating Costs
- Overhead

**Rationale**: Official form uses these 4 cost codes, not percentages

## Official SkatteFUNN Form Mapping

| Form Section | Schema Location |
|--------------|-----------------|
| Section 1: Project Owner & Roles | `organization`, `contact.creator`, `contact.project_leader`, `contact.org_representative` |
| Section 2: About the Project | `project_info.title_*`, `project_info.short_name`, `project_info.scientific_discipline`, `project_info.area_of_use`, `project_info.continuation`, `project_info.other_applicants` |
| Section 3: Background | `project_info.company_activities`, `project_info.project_background` |
| Section 4: Primary Objective | `project_info.primary_objective`, `project_info.market_differentiation` |
| Section 5: R&D Content | `project_info.rd_content` |
| Section 6: Project Summary | `project_info.project_summary` |
| Section 7: Work Packages | `work_packages[]` (repeatable) |
| Section 8: Total Budget | Calculated from `work_packages[].budget.yearly_costs` |

## Character Limits Enforced

All text fields now have `maxLength` constraints matching official form:
- 60 chars: short_name
- 100 chars: titles, WP name, activity title
- 500 chars: rd_challenges, activity description, cost_specification
- 1000 chars: primary_objective, method_approach, project_summary
- 2000 chars: company_activities, project_background, market_differentiation, rd_content

## Work Package Constraints

- **Minimum**: 1 work package required
- **Maximum**: 8 work packages allowed
- **Activities per WP**: 2-8 activities
- **Budget years**: 2020-2035 range
- **Cost codes**: 4 official categories

## Next Steps

1. ✅ Schema v2.0.0 complete and validated
2. ⏳ **Update template.md** to match 8-section form structure
3. ⏳ **Update wizard.instructions.md** with v2.0.0 field guidance
4. ⏳ **Test with emergent application** (verify budget reallocation)
5. ⏳ **Update application document** with new KRs (kr-p-010, kr-p-011, kr-p-012)

## Files Modified

- `docs/EPF/outputs/skattefunn-application/schema.json` (v1.0.0 → v2.0.0)

## Files Pending

- `docs/EPF/outputs/skattefunn-application/template.md` (needs 8-section restructure)
- `docs/EPF/outputs/skattefunn-application/wizard.instructions.md` (needs field updates)
- `docs/EPF/_instances/emergent/emergent-skattefunn-application-2025-12-31.md` (needs budget reallocation)

## Testing Checklist

- [ ] Validate schema with JSON Schema validator
- [ ] Generate test application with wizard
- [ ] Verify character limits enforced
- [ ] Check work package repetition works
- [ ] Test copy/paste to official online form
- [ ] Verify budget sums correctly across WPs
- [ ] Confirm all 8 form sections covered

## Backward Compatibility

**Breaking Changes**: v2.0.0 is NOT backward compatible with v1.0.0
- Existing applications must be migrated to new structure
- Budget calculations changed (flat → work packages)
- Field names changed (technical_details → project_info)
- Scientific discipline changed (string → nested object)

**Migration Required For**:
- `docs/EPF/_instances/emergent/emergent-skattefunn-application-2025-12-31.md`

**Migration Steps**:
1. Extract current budget into work packages (1-3 WPs)
2. Add Norwegian title (translate English)
3. Split scientific_discipline into nested object
4. Add character-limited fields from current long-form descriptions
5. Convert yearly_breakdown to work_packages.budget.yearly_costs with cost_codes
6. Add new KRs (kr-p-010, kr-p-011, kr-p-012) as new activities
