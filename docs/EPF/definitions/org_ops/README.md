# OrgOps Process Definitions

Process definitions for organizational operations. These are canonical templates usable by any organization to run operational processes.

## Categories (by L1 Value Model Layer)

### Talent Management
Onboarding, training, performance, career progression, compensation.

### Culture & Communications  
Values, collaboration protocols, feedback mechanisms, internal events.

### Financial & Legal
Budgeting, accounting, compliance, risk management, transactions.

### Facilities & IT
Infrastructure, IT systems, tools and platforms.

## Definition Index

### Priority 1: Foundational (Every org needs)

| ID | Name | L2.L3 Path | Status |
|----|------|------------|--------|
| pd-001 | [New Hire Orientation](talent-management/pd-001-new-hire-orientation.yaml) | Onboarding.orientation-programs | ready |
| pd-002 | System Access Setup | Onboarding.system-access-and-setup | draft |
| pd-003 | Team Communication Norms | Collaboration.meeting-etiquette | draft |
| pd-004 | Decision Making Framework | Collaboration.decision-making-frameworks | draft |
| pd-005 | Monthly Budgeting | Budgeting.departmental-budgets | draft |

### Priority 2: Scale Enablers (When growing)

| ID | Name | L2.L3 Path | Status |
|----|------|------------|--------|
| pd-006 | Performance Review Cycle | Performance.performance-reviews | draft |
| pd-007 | Goal Setting Framework | Performance.goal-setting-frameworks | draft |
| pd-008 | Skills Training Program | Training.skill-specific-training | draft |
| pd-009 | Pulse Survey Process | Feedback.pulse-surveys | draft |
| pd-010 | Financial Forecasting | Budgeting.financial-forecasting | draft |

### Priority 3: Maturity Markers (Established orgs)

| ID | Name | L2.L3 Path | Status |
|----|------|------------|--------|
| pd-011 | 360 Feedback Process | Performance.360-degree-feedback | draft |
| pd-012 | Career Progression Framework | Career.promotion-guidelines | draft |
| pd-013 | Succession Planning | Career.succession-planning | draft |
| pd-014 | Compliance Audit Process | Compliance.audit-and-compliance | draft |
| pd-015 | Business Continuity Plan | Risk.business-continuity-planning | draft |

## Schema

Process definitions are validated against:
- Base: `schemas/track_definition_base_schema.json`
- Extension: `schemas/org_ops_definition_schema.json`

## Usage

```bash
# Validate a definition
./scripts/validate-schemas.sh definitions/org_ops/talent-management/pd-001-new-hire-orientation.yaml
```
