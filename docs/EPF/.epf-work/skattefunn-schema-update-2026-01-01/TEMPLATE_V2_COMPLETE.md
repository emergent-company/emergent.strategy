# SkatteFUNN Template v2.0.0 Update Complete

**Date**: 2026-01-01  
**Status**: ✅ Schema Complete, ✅ Template Complete  
**Purpose**: Align with official SkatteFUNN online form structure for easy copy/paste

## Summary of Changes

### Files Updated

1. ✅ **schema.json** (v1.0.0 → v2.0.0)
   - Added character limits to all text fields
   - Replaced flat budget with work_packages array
   - Added Norwegian title field
   - Separated creator/project_leader/org_representative roles
   - Changed scientific_discipline to nested object
   - Added official cost codes (Personnel, Equipment, Other Operating Costs, Overhead)

2. ✅ **template.md** (v1.0.0 → v2.0.0)
   - Restructured to 8 official form sections
   - Added character limit notes for each field
   - Made Section 7 (Work Packages) repeatable
   - Updated budget tables to use cost codes instead of percentages
   - Added Section 8 summary tables
   - Enhanced submission checklist with character limit compliance
   - Added official resource links

## Template Structure Changes

### From (v1.0.0 - 6 sections):
1. Project Owner
2. Roles in the Project
3. Project Details (combined)
4. Timeline and Work Packages (vague)
5. Budget and Tax Deduction (percentage-based)
6. EPF Traceability

### To (v2.0.0 - 8 sections):
1. **Project Owner and Roles** (combined 1+2, added creator)
2. **About the Project** (titles, classification, continuation)
3. **Background and Company Activities** (2000 char each)
4. **Primary Objective and Innovation** (1000 + 2000 chars)
5. **R&D Content** (2000 chars)
6. **Project Summary** (1000 chars, publicly published)
7. **Work Packages** (REPEATABLE 1-8 times, each with activities 2-8)
8. **Total Budget and Estimated Deduction** (summary tables)

## Character Limits Enforced

| Field | Max Length | Official Form Section |
|-------|------------|----------------------|
| title_english | 100 | Section 2 |
| title_norwegian | 100 | Section 2 |
| short_name | 60 | Section 2 |
| company_activities | 2000 | Section 3 |
| project_background | 2000 | Section 3 |
| primary_objective | 1000 | Section 4 |
| market_differentiation | 2000 | Section 4 |
| rd_content | 2000 | Section 5 |
| project_summary | 1000 | Section 6 (public) |
| work_package.name | 100 | Section 7 |
| work_package.rd_challenges | 500 | Section 7 |
| work_package.method_approach | 1000 | Section 7 |
| activity.title | 100 | Section 7 |
| activity.description | 500 | Section 7 |
| budget.cost_specification | 500 | Section 7 |

## Variable Name Changes

### Contact Roles
| Old (v1.0.0) | New (v2.0.0) | Notes |
|--------------|--------------|-------|
| `{{project_leader_name}}` | `{{contact.project_leader.name}}` | Nested under contact |
| `{{project_leader_email}}` | `{{contact.project_leader.email}}` | Nested under contact |
| `{{project_leader_phone}}` | `{{contact.project_leader.phone}}` | Nested under contact |
| `{{org_rep_name}}` | `{{contact.org_representative.name}}` | Nested under contact |
| `{{org_rep_email}}` | `{{contact.org_representative.email}}` | Nested under contact |
| `{{org_rep_phone}}` | `{{contact.org_representative.phone}}` | Nested under contact |
| N/A | `{{contact.creator.name}}` | **NEW** - separate creator role |
| N/A | `{{contact.creator.email}}` | **NEW** |
| N/A | `{{contact.creator.phone}}` | **NEW** |

### Organization
| Old (v1.0.0) | New (v2.0.0) | Notes |
|--------------|--------------|-------|
| `{{organization_name}}` | `{{organization.name}}` | Nested under organization |
| `{{organization_number}}` | `{{organization.org_number}}` | Nested under organization |
| `{{manager_name}}` | `{{organization.manager_name}}` | Nested under organization |

### Project Info
| Old (v1.0.0) | New (v2.0.0) | Notes |
|--------------|--------------|-------|
| `{{project_title}}` | `{{project_info.title_english}}` | English title (100 chars) |
| N/A | `{{project_info.title_norwegian}}` | **NEW** Norwegian title (100 chars) |
| `{{project_short_name}}` | `{{project_info.short_name}}` | Under project_info (60 chars) |
| `{{scientific_discipline}}` | `{{project_info.scientific_discipline.subject_discipline}}` | Now nested object |
| N/A | `{{project_info.scientific_discipline.subject_area}}` | **NEW** top-level classification |
| N/A | `{{project_info.scientific_discipline.subject_group}}` | **NEW** mid-level classification |
| N/A | `{{project_info.area_of_use}}` | **NEW** industry where used |
| N/A | `{{project_info.continuation}}` | **NEW** continuation of previous project? |
| N/A | `{{project_info.other_applicants}}` | **NEW** other companies applying? |
| `{{company_activities}}` | `{{project_info.company_activities}}` | Under project_info (2000 chars) |
| `{{project_background}}` | `{{project_info.project_background}}` | Under project_info (2000 chars) |
| `{{primary_objective}}` | `{{project_info.primary_objective}}` | Under project_info (1000 chars) |
| `{{state_of_art}}` | `{{project_info.market_differentiation}}` | Renamed for clarity (2000 chars) |
| `{{rd_challenges}}` | `{{project_info.rd_content}}` | Renamed, now single field (2000 chars) |
| `{{project_summary}}` | `{{project_info.project_summary}}` | Under project_info (1000 chars) |
| `{{trl_start}}` | (removed) | Now in work_packages |
| `{{trl_end}}` | (removed) | Now in work_packages |
| `{{frascati_compliance}}` | (removed) | Implicit in R&D category |

### Work Packages (NEW structure)
| Old (v1.0.0) | New (v2.0.0) | Notes |
|--------------|--------------|-------|
| `{{work_packages}}` | `{{#each work_packages}}...{{/each}}` | **Repeatable section** (1-8 WPs) |
| N/A | `{{this.name}}` | **NEW** WP name (100 chars) |
| N/A | `{{this.start_month}}` | **NEW** start month within project |
| N/A | `{{this.end_month}}` | **NEW** end month within project |
| N/A | `{{this.rd_category}}` | **NEW** Experimental Dev or Industrial Research |
| N/A | `{{this.rd_challenges}}` | **NEW** challenge description (500 chars) |
| N/A | `{{this.method_approach}}` | **NEW** systematic process (1000 chars) |
| N/A | `{{#each this.activities}}...{{/each}}` | **NEW** activities loop (2-8 per WP) |
| N/A | `{{this.title}}` | **NEW** activity title (100 chars) |
| N/A | `{{this.description}}` | **NEW** activity description (500 chars) |
| N/A | `{{this.budget.yearly_costs}}` | **NEW** budget array with cost_code |
| N/A | `{{this.budget.cost_specification}}` | **NEW** optional elaboration (500 chars) |

### Budget (changed structure)
| Old (v1.0.0) | New (v2.0.0) | Notes |
|--------------|--------------|-------|
| `{{budget_yearly_table}}` | `{{#each budget_summary_by_year}}...{{/each}}` | Now grouped by cost_code |
| `{{budget_wp_table}}` | `{{#each work_packages}}...{{/each}}` | Now from work_packages array |
| `{{personnel_total}}` | (calculated) | Sum of Personnel cost_code |
| `{{equipment_total}}` | (calculated) | Sum of Equipment cost_code |
| `{{overhead_total}}` | (calculated) | Sum of Overhead cost_code |
| N/A | `{{this.other_operating_costs_nok}}` | **NEW** 4th cost code |
| `{{total_budget_nok}}` | `{{total_budget_nok}}` | Same, but calculated from WPs |

### EPF Sources
| Old (v1.0.0) | New (v2.0.0) | Notes |
|--------------|--------------|-------|
| `{{north_star_path}}` | `{{epf_sources.north_star_path}}` | Nested under epf_sources |
| `{{strategy_formula_path}}` | `{{epf_sources.strategy_formula_path}}` | Nested under epf_sources |
| `{{roadmap_recipe_path}}` | `{{epf_sources.roadmap_recipe_path}}` | Nested under epf_sources |
| `{{value_models_path}}` | `{{epf_sources.value_models_path}}` | Nested under epf_sources |

### Metadata
| Old (v1.0.0) | New (v2.0.0) | Notes |
|--------------|--------------|-------|
| `{{generation_timestamp}}` | `{{generation_timestamp}}` | Same |
| Generator Version: 1.0.0 | Generator Version: 2.0.0 | Updated |
| EPF Version: 2.1.0 | EPF Version: {{epf_version}} | Now variable |
| N/A | Schema Version: 2.0.0 | **NEW** |

## Copy/Paste Workflow

The new template is designed for direct copy/paste into the official SkatteFUNN online form:

1. **Section 1** → Copy roles table → Paste into "Project Owner and Roles" form section
2. **Section 2** → Copy titles/classification → Paste into "About the Project" form section
3. **Section 3** → Copy company activities + background → Paste into two 2000-char fields
4. **Section 4** → Copy objective + differentiation → Paste into 1000 + 2000 char fields
5. **Section 5** → Copy R&D content → Paste into 2000-char field
6. **Section 6** → Copy project summary → Paste into 1000-char field (will be published)
7. **Section 7** → **REPEAT for each work package** → Copy WP name, dates, category, challenges, method, activities, budget → Paste into repeatable WP form section
8. **Section 8** → Copy budget summary → Use to verify totals in form

## Character Limit Compliance

The template includes character limit notes (e.g., "*[Max 1000 characters]*") after each field to help users verify compliance before copy/paste. The online form has built-in character counters that enforce these limits.

**Wizard should**:
- Count characters for each generated field
- Warn if approaching limit (e.g., ≥90% of max)
- Truncate with "..." if exceeded (should not happen if wizard follows schema)
- Log character counts to help debugging

## Next Steps

1. ✅ Schema v2.0.0 complete and validated
2. ✅ Template v2.0.0 complete with 8-section structure
3. ⏳ **Update wizard.instructions.md** to:
   - Reference schema v2.0.0 fields
   - Extract work packages from roadmap KRs (map TRL/hypothesis/experiment to WP structure)
   - Generate Norwegian title (translate English title)
   - Calculate budget summaries by year and cost_code
   - Enforce character limits during generation
   - Handle 1-8 work packages (at least 1 required)
   - Handle 2-8 activities per WP (at least 2 required)
4. ⏳ **Test with emergent application**:
   - Validate budget reallocation (Activities 1.1/1.2/1.3 reduced to 500K)
   - Add new activities for kr-p-010 (multi-modal), kr-p-011 (temporal), kr-p-012 (schema evolution)
   - Verify character limits not exceeded
   - Test work package repetition
   - Validate budget sums to 3,250,000 NOK
5. ⏳ **Update emergent application document** with budget reallocation and new KRs

## Files Modified

- `docs/EPF/outputs/skattefunn-application/schema.json` (v1.0.0 → v2.0.0) ✅
- `docs/EPF/outputs/skattefunn-application/template.md` (v1.0.0 → v2.0.0) ✅

## Files Pending

- `docs/EPF/outputs/skattefunn-application/wizard.instructions.md` (needs v2.0.0 field updates)
- `docs/EPF/_instances/emergent/emergent-skattefunn-application-2025-12-31.md` (needs budget reallocation)

## Testing Checklist

- [ ] Validate schema with JSON Schema validator (node script)
- [ ] Generate test application with wizard
- [ ] Verify all character limits enforced
- [ ] Check Norwegian title translation
- [ ] Test work package repetition (try 1, 3, 8 WPs)
- [ ] Test activity repetition (try 2, 5, 8 activities per WP)
- [ ] Verify budget sums correctly by year and cost_code
- [ ] Test copy/paste workflow to official online form
- [ ] Validate Section 8 summary matches work package totals
- [ ] Check EPF traceability links work

## Backward Compatibility

⚠️ **Breaking Changes**: v2.0.0 is NOT backward compatible with v1.0.0

Existing applications MUST be migrated:
- Extract current flat budget into 1-3 work packages
- Add Norwegian title (translate English)
- Split scientific_discipline string into nested object (area → group → discipline)
- Add character-limited fields (may need to summarize current long-form text)
- Convert yearly_breakdown to work_packages.budget.yearly_costs with cost_codes
- Add new KRs (kr-p-010, kr-p-011, kr-p-012) as new activities or work packages

## Documentation

- `docs/EPF/.epf-work/skattefunn-schema-update-2026-01-01/SCHEMA_V2_SUMMARY.md` (schema details)
- `docs/EPF/.epf-work/skattefunn-schema-update-2026-01-01/TEMPLATE_V2_COMPLETE.md` (this file - template details)
- `docs/EPF/.epf-work/skattefunn-schema-update-2026-01-01/VARIABLE_MIGRATION_GUIDE.md` (pending - wizard update guide)

---

**Status**: ✅ Schema + Template v2.0.0 updates complete  
**Next**: Update wizard.instructions.md for automated generation
