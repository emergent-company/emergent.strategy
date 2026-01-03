# SkatteFUNN Application Template v2.0.0

This template defines the output structure for SkatteFUNN (Norwegian R&D Tax Deduction Scheme) applications, aligned with the official online form at https://kunde.forskningsradet.no/skattefunn/

**Variables are denoted with {{variable_name}} and will be replaced during generation.**  
**Character limits are enforced per official SkatteFUNN requirements.**

---

# SkatteFUNN - Tax Deduction Scheme Application

**Application Date:** {{application_date}}  
**Status:** Draft  
**Project Period:** {{start_date}} to {{end_date}} ({{duration_months}} months)

---

## Section 1: Project Owner and Roles

### 1.1 Project Owner

The Project Owner is responsible for running the project in accordance with the contract documents.

| Organisation Name | Organisation Number | Manager |
| --- | --- | --- |
| {{organization.name}} | {{organization.org_number}} | {{organization.manager_name}} |

### 1.2 Roles in the Project

Three mandatory roles required:

| Name | Role | E-mail | Phone | Access Rights |
| --- | --- | --- | --- | --- |
| {{contact.creator.name}} | **Creator of Application** | {{contact.creator.email}} | {{contact.creator.phone}} | Delete, Submit, Edit, Read, Withdraw, ChangeAccess |
| {{contact.org_representative.name}} | **Organisation Representative** | {{contact.org_representative.email}} | {{contact.org_representative.phone}} | Edit, Read, Approve |
| {{contact.project_leader.name}} | **Project Leader** | {{contact.project_leader.email}} | {{contact.project_leader.phone}} | Delete, Submit, Edit, Read, Withdraw, ChangeAccess |

---

## Section 2: About the Project

### 2.1 Project Title

**Title (English):** {{project_info.title_english}}  
*[Max 100 characters]*

**Title (Norwegian):** {{project_info.title_norwegian}}  
*[Max 100 characters]*

**Short Name:** {{project_info.short_name}}  
*[Max 60 characters]*

### 2.2 Scientific Classification

**Subject Area:** {{project_info.scientific_discipline.subject_area}}  
**Subject Group:** {{project_info.scientific_discipline.subject_group}}  
**Subject Discipline:** {{project_info.scientific_discipline.subject_discipline}}

### 2.3 Additional Information

**Area of Use:** {{project_info.area_of_use}}  
*(Industry where project results will be applied)*

**Continuation of Previous Project:** {{project_info.continuation}}  
**Other Companies Applying for This Project:** {{project_info.other_applicants}}

---

## Section 3: Background and Company Activities

### 3.1 Company Activities

{{project_info.company_activities}}

*[Max 2000 characters]*

*Describe your products/services, markets, and company stage (startup/scale-up/established).*

### 3.2 Project Background

{{project_info.project_background}}

*[Max 2000 characters]*

*Explain why this project is important for your company's development.*

---

## Section 4: Primary Objective and Innovation

### 4.1 Primary Objective

{{project_info.primary_objective}}

*[Max 1000 characters]*

*State concrete, verifiable goals and describe what new or improved goods/services will result.*

### 4.2 Market Differentiation

{{project_info.market_differentiation}}

*[Max 2000 characters]*

*Explain how your solution differs from existing products or competitor offerings (state-of-the-art comparison).*

---

## Section 5: R&D Content

{{project_info.rd_content}}

*[Max 2000 characters]*

*Describe the technical/scientific challenge with no known solution today, why R&D is required, and the systematic method you will use.*

---

## Section 6: Project Summary

{{project_info.project_summary}}

*[Max 1000 characters]*

*Brief summary of background, objectives, challenges, and approach. This will be published publicly if your application is approved.*

---

## Section 7: Work Packages

{{#each work_packages}}

### Work Package {{@index}}: {{this.name}}

**Duration:** Month {{this.start_month}} to Month {{this.end_month}}  
**R&D Category:** {{this.rd_category}}

#### R&D Challenges

{{this.rd_challenges}}

*[Max 500 characters]*

*Describe the challenge where no solution exists today.*

#### Method and Approach

{{this.method_approach}}

*[Max 1000 characters]*

*Describe the systematic process to solve the challenge.*

#### Activities

{{#each this.activities}}
##### Activity {{@index}}: {{this.title}}

*[Max 100 characters]*

{{this.description}}

*[Max 500 characters]*

{{/each}}

#### Budget

**Yearly Costs:**

| Year | Cost Code | Amount (NOK) |
|------|-----------|--------------|
{{#each this.budget.yearly_costs}}
| {{this.year}} | {{this.cost_code}} | {{this.amount_nok}} |
{{/each}}

**Cost Specification:**

{{this.budget.cost_specification}}

*[Max 500 characters - optional elaboration]*

{{/each}}


---

## Section 8: Total Budget and Estimated Tax Deduction

### 8.1 Budget Summary by Year and Cost Code

| Year | Cost Code | Amount (NOK) |
|------|-----------|--------------|
{{#each budget_summary_by_year}}
| {{this.year}} | **Personnel** | {{this.personnel_nok}} |
| {{this.year}} | **Equipment** | {{this.equipment_nok}} |
| {{this.year}} | **Other Operating Costs** | {{this.other_operating_costs_nok}} |
| {{this.year}} | **Overhead** | {{this.overhead_nok}} |
| {{this.year}} | **Year Total** | **{{this.year_total_nok}}** |
{{/each}}

**Grand Total:** **{{total_budget_nok}} NOK**

### 8.2 Budget Allocation by Work Package

| Work Package | Duration | Budget (NOK) |
|--------------|----------|--------------|
{{#each work_packages}}
| {{this.name}} | Month {{this.start_month}}-{{this.end_month}} | {{this.total_budget_nok}} |
{{/each}}
| **Total** | {{duration_months}} months | **{{total_budget_nok}} NOK** |

### 8.3 Estimated Tax Deduction

Based on SkatteFUNN rates:
- **Small companies** (<50 employees, <€10M revenue): **20% of eligible costs**
- **Large companies**: **18% of eligible costs**

**Estimated tax deduction (assuming {{company_size}} at {{tax_rate}}% rate):**

| Year | Eligible Costs (NOK) | Tax Deduction (NOK) |
|------|----------------------|---------------------|
{{#each tax_deduction_by_year}}
| {{this.year}} | {{this.eligible_costs_nok}} | {{this.deduction_nok}} |
{{/each}}
| **Total** | **{{total_eligible_costs_nok}}** | **{{total_tax_deduction_nok}}** |

> **Important Notes:**
> - Actual tax deduction calculated by Norwegian Tax Administration based on auditor-approved returns
> - Maximum base amount: **25 million NOK** per company per income year
> - Deduction applies only to approved R&D costs (personnel, equipment, overhead, subcontracting)
> - Overhead limited to **18% of wage costs** for R&D personnel
> - Equipment purchases must be used primarily (≥50%) for approved R&D activities

---

## EPF Traceability

This application was generated from the following EPF sources:

| EPF Source | Path | Used For |
|------------|------|----------|
| North Star | {{epf_sources.north_star_path}} | Vision, mission, problem context |
| Strategy Formula | {{epf_sources.strategy_formula_path}} | Technology strategy, differentiation |
| Roadmap Recipe | {{epf_sources.roadmap_recipe_path}} | Timeline, work packages, Key Results |
| Value Models | {{epf_sources.value_models_path}} | Problem definition, solution approach |

**Generated:** {{generation_timestamp}}  
**Generator Version:** 2.0.0  
**Schema Version:** 2.0.0  
**EPF Version:** {{epf_version}}

---

## Next Steps for Submission

### 1. Review for Accuracy
- ✓ Verify all organization details (name, org number, manager)
- ✓ Check contact information for all 3 roles (creator, org rep, project leader)
- ✓ Confirm timeline feasibility (start/end dates, duration)
- ✓ Validate character limits (counts shown above each field)

### 2. Technical Review
- Have technical lead review R&D challenge descriptions in each work package
- Ensure state-of-the-art comparison (market differentiation) is accurate
- Validate work package activities and timelines
- Confirm R&D category (Experimental Development vs Industrial Research) is correct

### 3. Budget Verification
- Confirm budget numbers match accounting records and projections
- Verify cost code allocations (Personnel, Equipment, Other Operating Costs, Overhead)
- Check compliance with 25M NOK annual cap per company
- Ensure overhead does not exceed 18% of R&D personnel wage costs
- Validate equipment costs relate primarily (≥50%) to approved R&D activities

### 4. Character Limit Compliance
Review all character-limited fields (use online form's built-in counter):
- Titles: 100 chars (English, Norwegian)
- Short name: 60 chars
- WP name: 100 chars
- Activity title: 100 chars
- WP challenges: 500 chars
- Activity description: 500 chars
- Cost specification: 500 chars
- Primary objective: 1000 chars
- WP method/approach: 1000 chars
- Project summary: 1000 chars
- Company activities: 2000 chars
- Project background: 2000 chars
- Market differentiation: 2000 chars
- R&D content: 2000 chars

### 5. Translation (if needed)
- This draft includes both English and Norwegian titles
- Research Council accepts applications in Norwegian or English
- If submitting in Norwegian, translate all section content
- Project summary will be published publicly in submitted language

### 6. Official Submission
- Submit via Research Council portal: https://kunde.forskningsradet.no/skattefunn/
- Copy/paste each section into the corresponding online form field
- Use character counters in online form to verify compliance
- Attach auditor documentation for historical costs (if retroactive application)
- Include organizational documents if this is your first SkatteFUNN application
- Ensure all 3 roles sign/approve in portal before final submission

### 7. Timeline Note
- SkatteFUNN accepts applications **year-round** (no deadlines)
- Processing time: typically **4-6 weeks** from submission
- Retroactive applications allowed (costs already incurred can be claimed)
- Approval valid for project duration (up to 48 months)

### 8. Questions and Support

**Contact Research Council of Norway SkatteFUNN team:**
- Email: skattefunn@forskningsradet.no
- Phone: +47 22 03 70 00
- Portal: https://kunde.forskningsradet.no/skattefunn/

**Official SkatteFUNN Resources:**
- Program guidelines: https://www.forskningsradet.no/en/apply-for-funding/who-can-apply/skattefunn/
- Cost eligibility rules: https://www.forskningsradet.no/en/apply-for-funding/who-can-apply/skattefunn/eligible-costs/
- FAQ: https://www.forskningsradet.no/en/apply-for-funding/who-can-apply/skattefunn/frequently-asked-questions/

**Norwegian Tax Administration (for approved projects):**
- Tax deduction claims: https://www.skatteetaten.no/en/business-and-organisation/tax-and-duties/tax-deduction-research-and-development/
- Auditor requirements: https://www.skatteetaten.no/en/business-and-organisation/tax-and-duties/tax-deduction-research-and-development/auditor-certification/

---

**End of Application**