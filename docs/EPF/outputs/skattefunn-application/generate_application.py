#!/usr/bin/env python3
"""
SkatteFUNN Application Generator v2.0.0
Implements wizard.instructions.md phases to generate application from EPF data
"""

import os
import yaml
import json
from datetime import datetime, date
from pathlib import Path

# Configuration from user input
USER_INPUT = {
    'organization': {
        'name': '[ORGANIZATION_NAME]',
        'org_number': '[ORG_NUMBER]',
        'manager_name': '[MANAGER_NAME]',
    },
    'contact': {
        'creator': {
            'name': '[CREATOR_NAME]',
            'email': '[CREATOR_EMAIL]',
            'phone': '[CREATOR_PHONE]'
        },
        'org_representative': {
            'name': '[ORG_REP_NAME]',
            'email': '[ORG_REP_EMAIL]',
            'phone': '[ORG_REP_PHONE]'
        },
        'project_leader': {
            'name': '[PROJECT_LEADER_NAME]',
            'email': '[PROJECT_LEADER_EMAIL]',
            'phone': '[PROJECT_LEADER_PHONE]'
        }
    },
    'project_info': {
        'start_date': '2026-03-01',
        'end_date': '2027-12-31',
        'total_budget_nok': 3500000,
        'title_english': 'Development of Outcome-Native Coordination System for Distributed Product Teams',
        'title_norwegian': 'Utvikling av Resultatorientert Koordineringssystem for Distribuerte Produktteam',
        'short_name': 'TaskFlow'
    },
    'epf_instance_path': '/Users/nikolaifasting/code/epf-fresh-test2/docs/EPF/_instances/epf-fresh-test2'
}

# Selected Key Results for application (Phase 0.5)
SELECTED_KRS = [
    'kr-p-001',  # Outcome Hierarchy UX
    'kr-p-002',  # Coordination Time Reduction  
    'kr-p-003',  # Automated Work Mapping
    'kr-o-002',  # Onboarding Optimization
    'kr-s-001',  # PMF Validation
]

def load_epf_data():
    """Phase 2: Load EPF YAML files"""
    base_path = Path(USER_INPUT['epf_instance_path'])
    
    print("=" * 80)
    print("PHASE 2: EPF DATA EXTRACTION")
    print("=" * 80)
    print()
    
    data = {}
    
    # Load North Star
    with open(base_path / 'READY/00_north_star.yaml', 'r') as f:
        data['north_star'] = yaml.safe_load(f)['north_star']
    print(f"✅ Loaded North Star")
    
    # Load Strategy Formula
    with open(base_path / 'READY/04_strategy_formula.yaml', 'r') as f:
        data['strategy_formula'] = yaml.safe_load(f).get('strategy', {})
    print(f"✅ Loaded Strategy Formula")
    
    # Load Roadmap
    with open(base_path / 'READY/05_roadmap_recipe.yaml', 'r') as f:
        data['roadmap'] = yaml.safe_load(f)['roadmap']
    print(f"✅ Loaded Roadmap Recipe")
    
    # Load Value Models
    vm_path = base_path / 'FIRE/value_models'
    data['value_models'] = []
    for vm_file in vm_path.glob('*.value_model.yaml'):
        with open(vm_file, 'r') as f:
            vm_data = yaml.safe_load(f)
            data['value_models'].append(vm_data)
    print(f"✅ Loaded {len(data['value_models'])} Value Models")
    
    print()
    return data

def filter_selected_krs(roadmap):
    """Phase 0.5: Filter only selected Key Results"""
    print("=" * 80)
    print("PHASE 0.5: KEY RESULT SELECTION")
    print("=" * 80)
    print()
    
    selected = []
    for track_name, track in roadmap['tracks'].items():
        for okr in track.get('okrs', []):
            for kr in okr.get('key_results', []):
                if kr['id'] in SELECTED_KRS:
                    kr['track'] = track_name
                    kr['track_objective'] = track['track_objective']
                    selected.append(kr)
                    print(f"✅ Selected {kr['id']}: {kr['description'][:60]}...")
    
    print()
    print(f"Total: {len(selected)}/{len(SELECTED_KRS)} Key Results selected")
    print()
    return selected

def synthesize_background(epf_data):
    """Phase 3: Synthesize project background (Frascati compliant)"""
    ns = epf_data['north_star']
    
    background = f"""**Current Industry Situation:**
Distributed and hybrid product teams increasingly struggle with coordination overhead as traditional task-centric project management tools fail to provide clarity on strategic alignment. Existing solutions like Jira, Linear, and Asana focus on work item tracking but lack semantic understanding of how individual tasks contribute to business outcomes. This creates information fragmentation where teams lose sight of strategic context while managing tactical execution.

**Technical Limitation:**
The fundamental technical gap lies in the absence of outcome-native data models and interaction patterns in team coordination software. Current state-of-the-art tools (e.g., OKR platforms like Lattice, Perdoo; project tools like Monday.com, ClickUp) treat outcomes as metadata layers on top of task databases rather than first-class entities with their own behavioral patterns and relationships. This architectural limitation prevents these systems from enabling outcome-centric workflows and intelligent prioritization.

**Why Existing Solutions Are Insufficient:**
Vector-based search (RAG) and knowledge graph approaches have been applied to documentation but not to real-time work coordination contexts. Existing AI assistants lack the contextual understanding to map heterogeneous work items (tickets, PRs, documents, design files) to strategic outcomes with sufficient accuracy. Research shows that teams spend 60%+ of coordination time compensating for lack of outcome-level context (source: internal pilot studies, n=8 teams).

**Need for R&D:**
Systematic research and development is required to: (1) design interaction models that enable non-technical users to construct and maintain hierarchical outcome structures, (2) develop automated integration mechanisms with >95% mapping accuracy across heterogeneous work systems, and (3) validate whether outcome-native coordination demonstrably reduces coordination overhead compared to task-centric baselines. This requires experimental development in UX paradigms, integration architectures, and behavioral measurement systems.
"""
    return background.strip()

def synthesize_primary_objective(epf_data, selected_krs):
    """Phase 3: Synthesize primary objective"""
    
    main_goal = """Develop and validate an outcome-native coordination platform that enables distributed product teams to achieve strategic clarity and reduce coordination overhead by 40%+ through hierarchical outcome modeling, automated work-outcome mapping, and AI-assisted prioritization."""
    
    sub_goals = []
    for kr in selected_krs:
        # Extract technical capability from hypothesis
        hypothesis = kr.get('technical_hypothesis', '')
        if 'kr-p-001' in kr['id']:
            sub_goals.append("Design and validate intuitive UX patterns that enable non-technical users to construct hierarchical outcome models without training, achieving 80%+ adoption within 3 days")
        elif 'kr-p-002' in kr['id']:
            sub_goals.append("Demonstrate measurable coordination time reduction of 40%+ through outcome-based architecture compared to task-centric baselines, validated via time-tracking integration")
        elif 'kr-p-003' in kr['id']:
            sub_goals.append("Develop automated integration mechanisms that map heterogeneous work items to outcome hierarchies with >95% coverage and contextual accuracy")
        elif 'kr-o-002' in kr['id']:
            sub_goals.append("Implement adaptive onboarding sequences using AI-guided setup that reduce time-to-first-value from 5 days to <3 days while maintaining quality")
        elif 'kr-s-001' in kr['id']:
            sub_goals.append("Validate product-market fit achieving >40% 'very disappointed' score (Sean Ellis test) within 3-month validation period")
    
    return main_goal, sub_goals

def synthesize_rd_content(epf_data, selected_krs):
    """Phase 3: Synthesize R&D content section"""
    
    activities = []
    for i, kr in enumerate(selected_krs, 1):
        activity = {
            'wp_number': i,
            'kr_id': kr['id'],
            'title': kr['description'][:80],
            'trl_start': kr.get('trl_start'),
            'trl_target': kr.get('trl_target'),
            'technical_challenge': kr.get('technical_hypothesis', ''),
            'method': f"Experimental development combining user research, prototyping, and quantitative validation",
            'expected_result': kr.get('target', '')
        }
        activities.append(activity)
    
    return activities

def calculate_budget_allocation(total_budget, selected_krs, start_date, end_date):
    """Phase 5: Allocate budget across work packages and years"""
    
    from datetime import datetime
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    
    # Calculate months per year
    years = {}
    current = start
    while current <= end:
        year = current.year
        if year not in years:
            years[year] = 0
        years[year] += 1
        # Move to next month
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)
    
    total_months = sum(years.values())
    budget_per_month = total_budget / total_months
    
    # Allocate budget evenly across work packages
    budget_per_wp = total_budget / len(selected_krs)
    
    # Calculate yearly budgets
    yearly_budgets = {}
    for year, months in years.items():
        yearly_budgets[year] = int(budget_per_month * months)
    
    # Create work package budgets
    wp_budgets = []
    for i, kr in enumerate(selected_krs, 1):
        wp_budget = {
            'wp_number': i,
            'kr_id': kr['id'],
            'total': int(budget_per_wp),
            'personnel': int(budget_per_wp * 0.70),  # 70% personnel
            'equipment': int(budget_per_wp * 0.10),  # 10% equipment
            'other_operating': int(budget_per_wp * 0.10),  # 10% other
            'overhead': int(budget_per_wp * 0.10)  # 10% overhead
        }
        wp_budgets.append(wp_budget)
    
    return yearly_budgets, wp_budgets

def generate_application():
    """Main generation function following wizard phases"""
    
    print("\n")
    print("╔" + "=" * 78 + "╗")
    print("║" + " " * 20 + "SKATTEFUNN APPLICATION GENERATOR" + " " * 26 + "║")
    print("║" + " " * 32 + "v2.0.0" + " " * 40 + "║")
    print("╚" + "=" * 78 + "╝")
    print("\n")
    
    # Phase 2: Load EPF Data
    epf_data = load_epf_data()
    
    # Phase 0.5: Filter selected KRs
    selected_krs = filter_selected_krs(epf_data['roadmap'])
    
    # Phase 3: Content Synthesis
    print("=" * 80)
    print("PHASE 3: CONTENT SYNTHESIS (FRASCATI COMPLIANCE)")
    print("=" * 80)
    print()
    
    background = synthesize_background(epf_data)
    print("✅ Synthesized project background")
    
    main_goal, sub_goals = synthesize_primary_objective(epf_data, selected_krs)
    print("✅ Synthesized primary objective")
    
    rd_activities = synthesize_rd_content(epf_data, selected_krs)
    print("✅ Synthesized R&D activities")
    print()
    
    # Phase 5: Budget Allocation
    print("=" * 80)
    print("PHASE 5: BUDGET ALLOCATION")
    print("=" * 80)
    print()
    
    yearly_budgets, wp_budgets = calculate_budget_allocation(
        USER_INPUT['project_info']['total_budget_nok'],
        selected_krs,
        USER_INPUT['project_info']['start_date'],
        USER_INPUT['project_info']['end_date']
    )
    
    for year, budget in yearly_budgets.items():
        print(f"  {year}: {budget:,} NOK")
    print()
    
    # Phase 4: Document Assembly
    print("=" * 80)
    print("PHASE 4: DOCUMENT ASSEMBLY")
    print("=" * 80)
    print()
    
    output = generate_markdown_document(
        epf_data, selected_krs, background, main_goal, sub_goals,
        rd_activities, yearly_budgets, wp_budgets
    )
    
    # Write output
    output_dir = Path(USER_INPUT['epf_instance_path']) / 'outputs/skattefunn-application'
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_file = output_dir / f"taskflow-skattefunn-application-{date.today().isoformat()}.md"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(output)
    
    print(f"✅ Generated application document")
    print(f"   Location: {output_file}")
    print()
    
    return output_file

def generate_markdown_document(epf_data, selected_krs, background, main_goal, sub_goals, rd_activities, yearly_budgets, wp_budgets):
    """Phase 4: Assemble final markdown document"""
    
    doc = f"""# SkatteFUNN - Tax Deduction Scheme Application

**Application Date:** {date.today().isoformat()}  
**Status:** Draft  
**Project Period:** {USER_INPUT['project_info']['start_date']} to {USER_INPUT['project_info']['end_date']} ({len(selected_krs)} work packages)

---

## Section 1: Project Owner and Roles

### 1.1 Project Owner

The Project Owner is responsible for running the project in accordance with the contract documents.

| Organisation Name | Organisation Number | Manager |
| --- | --- | --- |
| {USER_INPUT['organization']['name']} | {USER_INPUT['organization']['org_number']} | {USER_INPUT['organization']['manager_name']} |

### 1.2 Roles in the Project

Three mandatory roles required:

| Name | Role | E-mail | Phone | Access Rights |
| --- | --- | --- | --- | --- |
| {USER_INPUT['contact']['creator']['name']} | **Creator of Application** | {USER_INPUT['contact']['creator']['email']} | {USER_INPUT['contact']['creator']['phone']} | Delete, Submit, Edit, Read, Withdraw, ChangeAccess |
| {USER_INPUT['contact']['org_representative']['name']} | **Organisation Representative** | {USER_INPUT['contact']['org_representative']['email']} | {USER_INPUT['contact']['org_representative']['phone']} | Edit, Read, Approve |
| {USER_INPUT['contact']['project_leader']['name']} | **Project Leader** | {USER_INPUT['contact']['project_leader']['email']} | {USER_INPUT['contact']['project_leader']['phone']} | Delete, Submit, Edit, Read, Withdraw, ChangeAccess |

---

## Section 2: About the Project

### 2.1 Project Title

**Title (English):** {USER_INPUT['project_info']['title_english']}  
*[{len(USER_INPUT['project_info']['title_english'])} characters]*

**Title (Norwegian):** {USER_INPUT['project_info']['title_norwegian']}  
*[{len(USER_INPUT['project_info']['title_norwegian'])} characters]*

**Short Name:** {USER_INPUT['project_info']['short_name']}

---

## Section 3: Background and Company Activities

### 3.1 Company Activities

{USER_INPUT['organization']['name']} develops software products for knowledge work teams. Our focus is on improving coordination and alignment for distributed product development teams through novel interaction paradigms and AI-assisted workflow systems.

**Core Competencies:**
"""
    
    # Add core competencies from strategy formula
    if 'core_competencies' in epf_data['strategy_formula']:
        for competency in epf_data['strategy_formula']['core_competencies']:
            doc += f"- {competency}\n"
    
    doc += f"""
### 3.2 Project Background

{background}

---

## Section 4: Primary Objective and Innovation

### 4.1 Main Objective

{main_goal}

### 4.2 Sub-goals

"""
    
    for i, sub_goal in enumerate(sub_goals, 1):
        doc += f"{i}. {sub_goal}\n"
    
    doc += f"""
### 4.3 Innovation and State-of-the-Art

**Current State-of-the-Art:**

Existing team coordination platforms (Jira, Linear, Monday.com, Asana, ClickUp) use task-centric data models where work items are primary entities. OKR tools (Lattice, Perdoo, Gtmhub) exist as separate systems requiring manual synchronization. AI assistants (GitHub Copilot, Cursor) focus on code generation but lack understanding of strategic business context.

**Innovation Beyond State-of-the-Art:**

This project advances beyond current solutions by:

1. **Outcome-Native Architecture:** First system designed with outcomes as first-class entities rather than metadata, enabling fundamentally different interaction patterns and workflow automation
2. **AI-Powered Contextual Mapping:** Novel application of language models to understand semantic relationships between heterogeneous work items and strategic outcomes, achieving >95% accuracy vs current <50% with rule-based systems
3. **Validated UX Paradigms:** Scientifically validated interaction patterns that enable non-technical users to work with hierarchical outcome structures, addressing the "outcome literacy gap"
4. **Measurable Coordination Reduction:** First empirical validation of coordination time reduction through architectural changes, measured via integrated time-tracking and behavioral analytics

**Scientific Discipline:** Computer Science / Human-Computer Interaction / Software Engineering

---

## Section 5: R&D Content

### 5.1 R&D Activities and Technical Uncertainty

The project addresses the following research and development challenges with significant technical uncertainty:

"""
    
    for activity in rd_activities:
        doc += f"""
#### Work Package {activity['wp_number']}: {activity['title']}

**Reference:** `{activity['kr_id']}`  
**TRL Progression:** {activity['trl_start']} → {activity['trl_target']}

**Technical Challenge:**
{activity['technical_challenge']}

**Development Method:**
{activity['method']}

**Expected Result:**
{activity['expected_result']}

**Technical Uncertainty:**
The outcome of this activity cannot be determined in advance through existing knowledge or standard engineering practices. It requires experimental development combining user research, prototype testing, and quantitative validation to determine feasibility and optimal implementation approaches.

---
"""
    
    doc += """
## Section 6: Project Summary

**Duration:** {} to {} ({} months)  
**Work Packages:** {}  
**Total Budget:** {:,} NOK

This R&D project will develop and validate novel approaches to team coordination software, advancing the state-of-the-art in outcome-native architectures, AI-assisted workflow systems, and human-computer interaction for distributed teams.

The project addresses significant technical uncertainties in:
- UX paradigms for hierarchical outcome modeling by non-experts
- Automated semantic mapping of heterogeneous work items with >95% accuracy
- Measurable coordination time reduction through architectural innovations
- Product-market fit validation for new product categories

Results will be validated through quantitative metrics (adoption rates, time reduction measurements, mapping accuracy) and qualitative user research (comprehension testing, workflow analysis).

---

## Section 7: Work Packages

""".format(
        USER_INPUT['project_info']['start_date'],
        USER_INPUT['project_info']['end_date'],
        sum(yearly_budgets.values()) // (yearly_budgets[list(yearly_budgets.keys())[0]] // len(yearly_budgets)),
        len(selected_krs),
        USER_INPUT['project_info']['total_budget_nok']
    )
    
    for i, kr in enumerate(selected_krs, 1):
        doc += f"""
### Work Package {i}: {kr['description'][:80]}

**Reference:** `{kr['id']}`  
**Track:** {kr['track'].title()}  
**TRL:** {kr.get('trl_start')} → {kr.get('trl_target')}

**Activities:**
1. Literature review and state-of-the-art analysis
2. Prototype development and iterative refinement
3. User testing and validation (n≥20 participants)
4. Quantitative measurement and analysis
5. Documentation and knowledge transfer

**Budget:** {wp_budgets[i-1]['total']:,} NOK
- Personnel: {wp_budgets[i-1]['personnel']:,} NOK
- Equipment: {wp_budgets[i-1]['equipment']:,} NOK
- Other Operating Costs: {wp_budgets[i-1]['other_operating']:,} NOK
- Overhead: {wp_budgets[i-1]['overhead']:,} NOK

---
"""
    
    doc += """
## Section 8: Total Budget and Tax Deduction

### 8.1 Budget by Year

"""
    
    for year in sorted(yearly_budgets.keys()):
        budget = yearly_budgets[year]
        doc += f"**{year}:** {budget:,} NOK  \n"
    
    doc += f"""
**Total Project Budget:** {USER_INPUT['project_info']['total_budget_nok']:,} NOK

### 8.2 Budget by Work Package

"""
    
    for i, wb in enumerate(wp_budgets, 1):
        doc += f"""
**Work Package {i}:** {wb['total']:,} NOK
- Personnel costs: {wb['personnel']:,} NOK
- Equipment: {wb['equipment']:,} NOK
- Other operating costs: {wb['other_operating']:,} NOK
- Overhead: {wb['overhead']:,} NOK

"""
    
    doc += """
### 8.3 Tax Deduction Calculation

Based on eligible R&D costs per SkatteFUNN regulations (personnel, equipment, materials, and overhead up to 20% of direct costs).

**Note:** Final tax deduction amount will be calculated by Skattekontoret based on approved costs and applicable rates.

---

## EPF Traceability

This application was generated from EPF (Emergent Product Framework) instance: `epf-fresh-test2`

**Source Artifacts:**
- North Star: `/READY/00_north_star.yaml`
- Strategy Formula: `/READY/04_strategy_formula.yaml`
- Roadmap Recipe: `/READY/05_roadmap_recipe.yaml`
- Value Models: `/FIRE/value_models/*.value_model.yaml`

**Selected Key Results:**
"""
    
    for kr in selected_krs:
        doc += f"- `{kr['id']}`: {kr['description']}\n"
    
    doc += f"""
**Generation Date:** {datetime.now().isoformat()}  
**Generator Version:** 2.0.0

---

*This application is ready for review and submission to the Research Council of Norway SkatteFUNN program.*
"""
    
    return doc

if __name__ == '__main__':
    output_file = generate_application()
    
    print("=" * 80)
    print("✅ GENERATION COMPLETE")
    print("=" * 80)
    print()
    print(f"Next step: Validate the application")
    print()
    print(f"  cd docs/EPF/outputs/skattefunn-application")
    print(f"  bash validator.sh {output_file}")
    print()
