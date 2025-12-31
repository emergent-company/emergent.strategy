# SkatteFUNN Application Template

This template defines the output structure for SkatteFUNN (Norwegian R&D Tax Deduction Scheme) applications.

**Variables are denoted with {{variable_name}} and will be replaced during generation.**

---

# SkatteFUNN - Tax Deduction Scheme Application

**Application Date:** {{application_date}}  
**Status:** Draft  
**Project Period:** {{start_date}} to {{end_date}} ({{duration_months}} months)

---

## 1. Project Owner

The Project Owner is responsible for running the project in accordance with the contract documents.

| Organisation name | Organisation number | Manager |
| --- | --- | --- |
| {{organization_name}} | {{organization_number}} | {{manager_name}} |

---

## 2. Roles in the Project

A project must have a project manager (responsible for scientific implementation) and an organisation representative (authorized to enter legal agreements).

### Mandatory Roles

| Name | Role | Organisation | E-mail | Phone | Access |
| --- | --- | --- | --- | --- | --- |
| {{project_leader_name}} | Creator of Application | {{organization_name}} | {{project_leader_email}} | {{project_leader_phone}} | Delete, Submit, Edit, Read, Withdraw, ChangeAccess |
| {{org_rep_name}} | Organisation Representative | {{organization_name}} | {{org_rep_email}} | {{org_rep_phone}} | Edit, Read, Approve |
| {{project_leader_name}} | Project Leader | {{organization_name}} | {{project_leader_email}} | {{project_leader_phone}} | Delete, Submit, Edit, Read, Withdraw, ChangeAccess |

---

## 3. Project Details

### 3.1 General Information

**Title (English):** {{project_title}}

**Project Short Name:** {{project_short_name}}

**Scientific Discipline:** {{scientific_discipline}}

### 3.2 Project Background and Company Activities

**Company Activities:**

{{company_activities}}

**Project Background:**

{{project_background}}

### 3.3 Objectives and Innovation

**Primary Objective:**

{{primary_objective}}

**R&D Content and Technical Challenges:**

{{rd_challenges}}

**State-of-the-Art Comparison:**

{{state_of_art}}

**Project Summary:**

{{project_summary}}

**Technology Readiness Level:**
- Starting TRL: {{trl_start}}
- Target TRL: {{trl_end}}

**Frascati Criteria Compliance:**

{{frascati_compliance}}

---

## 4. Timeline and Work Packages

**Project Duration:** {{start_date}} to {{end_date}} ({{duration_months}} months)

{{work_packages}}

---

## 5. Budget and Tax Deduction

### 5.1 Total Budget Overview

| Year | Months Active | Amount (NOK) | Monthly Rate (NOK) |
|------|---------------|--------------|-------------------|
{{budget_yearly_table}}

**Total Project Budget:** {{total_budget_nok}} NOK

### 5.2 Budget Allocation by Work Package

| Work Package | Duration | Budget (NOK) | Personnel (60%) | Equipment (25%) | Overhead (15%) |
|--------------|----------|--------------|-----------------|-----------------|----------------|
{{budget_wp_table}}

### 5.3 Cost Category Breakdown

| Category | Percentage | Amount (NOK) | Description |
|----------|------------|--------------|-------------|
| Personnel | 60% | {{personnel_total}} | Salaries for R&D staff |
| Equipment & Tools | 25% | {{equipment_total}} | Computing infrastructure, software licenses |
| Overhead | 15% | {{overhead_total}} | Facilities, administration |
| **Total** | **100%** | **{{total_budget_nok}}** | |

### 5.4 Estimated Tax Deduction

Based on SkatteFUNN rates:
- Small companies (<50 employees, <€10M revenue): **20% of eligible costs**
- Large companies: **18% of eligible costs**

**Estimated tax deduction (assuming small company at 20% rate):**

{{tax_deduction_breakdown}}

**Total estimated deduction:** {{total_tax_deduction}} NOK

> **Note:** Actual tax deduction calculated by Norwegian Tax Administration based on auditor-approved returns. Maximum base amount: 25 million NOK per company per income year.

---

## 6. EPF Traceability

This application was generated from the following EPF sources:

| EPF Source | Path | Used For |
|------------|------|----------|
| North Star | {{north_star_path}} | Vision, mission, problem context |
| Strategy Formula | {{strategy_formula_path}} | Technology strategy, differentiation |
| Roadmap Recipe | {{roadmap_recipe_path}} | Timeline, work packages |
| Value Models | {{value_models_path}} | Problem definition, solution approach |

**Generated:** {{generation_timestamp}}  
**Generator Version:** 1.0.0  
**EPF Version:** 2.1.0

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
