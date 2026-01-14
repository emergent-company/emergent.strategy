# Track Definitions: Implementation Plan

**Date:** 2026-01-11  
**Status:** Approved direction, ready for implementation

---

## Confirmed Decisions

| Decision | Choice |
|----------|--------|
| Directory structure | **Unified** `/definitions/` with all 4 tracks |
| Starting track | **OrgOps** (most concrete, 51 items) |
| Maturity tiers | **Yes** - basic → intermediate → advanced |
| Definition scope | **Narrow/focused** - MVP-first, iterate to expand |

---

## Directory Structure

```
/definitions/                           # NEW unified directory
├── README.md                           # Overview, navigation, maturity model
├── product/                            # MIGRATED from features/
│   ├── README.md
│   ├── technical/                      # Was 01-technical
│   ├── business/                       # Was 02-business
│   ├── ux/                             # Was 03-ux
│   └── cross-cutting/                  # Was 04-cross-cutting
├── strategy/                           # NEW - 27 definitions
│   ├── README.md
│   ├── strategic-roadmap/              # L1 grouping
│   ├── tactical-roadmap/
│   └── strategic-communications/
├── org_ops/                            # NEW - 51 definitions
│   ├── README.md
│   ├── talent-management/              # L1 grouping
│   ├── culture-communications/
│   ├── financial-legal/
│   └── facilities-it/
└── commercial/                         # NEW - 24 definitions
    ├── README.md
    ├── business-development/           # L1 grouping
    ├── brand-positioning/
    └── sales-marketing/
```

**Migration note:** `features/` → `definitions/product/` with subcategory rename (remove numeric prefixes)

---

## Maturity Tier Model

Each definition template includes a **maturity** field indicating implementation depth:

### Tier Definitions

| Tier | Name | Description | Target Org Size | Typical Effort |
|------|------|-------------|-----------------|----------------|
| 1 | **Basic** | Minimum viable process. Essential steps only. | 1-10 people | 1-2 days |
| 2 | **Intermediate** | Adds automation, metrics, documentation. | 10-50 people | 1-2 weeks |
| 3 | **Advanced** | Full governance, integrations, optimization. | 50+ people | 1+ months |

### Tier Content Pattern

```yaml
maturity:
  current_tier: 1  # What this definition covers
  
  tier_1_basic:
    description: "Minimum viable implementation"
    includes:
      - "Core process steps"
      - "Essential inputs/outputs"
      - "Single owner assignment"
    effort: "1-2 days"
    
  tier_2_intermediate:
    description: "Adds structure and measurement"
    builds_on: "tier_1_basic"
    adds:
      - "Defined metrics and targets"
      - "Documentation templates"
      - "Basic automation"
      - "Review cadence"
    effort: "1-2 weeks"
    
  tier_3_advanced:
    description: "Full organizational capability"
    builds_on: "tier_2_intermediate"
    adds:
      - "Cross-functional governance"
      - "Tool integrations"
      - "Continuous improvement loops"
      - "Audit and compliance"
    effort: "1+ months"
```

### Progressive Disclosure

- **Canonical templates** start at Tier 1 (basic)
- Each template includes **tier_2_intermediate** and **tier_3_advanced** sections with guidance for upgrading
- Organizations can adopt basic and grow into intermediate/advanced as they scale

---

## Narrow Scope Principle

### Definition Sizing Guidelines

| Aspect | Guideline |
|--------|-----------|
| **Single responsibility** | One definition = one outcome/deliverable |
| **Time to value** | Basic tier implementable in 1-2 days |
| **Scope boundary** | If >5 actors involved, consider splitting |
| **Complexity test** | If >10 steps in core process, consider splitting |

### Example: Splitting Wide Definitions

**Before (too wide):**
- `pd-001-onboarding.yaml` - covers ALL employee onboarding

**After (narrow/focused):**
- `pd-001-engineering-onboarding.yaml` - developer-specific setup
- `pd-002-sales-onboarding.yaml` - sales-specific training
- `pd-003-onboarding-orientation.yaml` - company-wide day-1 orientation
- `pd-004-onboarding-systems-access.yaml` - IT access provisioning

**Benefit:** Each narrow definition can be:
- Implemented independently
- Owned by different people
- Evolved at different paces
- Combined in workflows

### Composition Over Monoliths

Narrow definitions can reference each other:
```yaml
related_definitions:
  - id: pd-003
    relationship: "follows"
    description: "After orientation, continue with role-specific onboarding"
  - id: pd-004
    relationship: "parallel"
    description: "Systems access runs parallel to orientation"
```

---

## Definition Template (Narrow + Tiered)

```yaml
# Track Definition Template
# Version: 1.0.0

id: "{track-prefix}-{number}"  # pd-001, sd-001, cd-001, fd-001
name: "{Focused Outcome Name}"
slug: "{kebab-case-slug}"
track: "{product|strategy|org_ops|commercial}"
status: "ready"

# Value model alignment
contributes_to:
  - "{Track}.{L2}.{L3}"

# Maturity model
maturity:
  current_tier: 1
  tier_progression:
    tier_1_basic:
      includes: []
      effort: "1-2 days"
    tier_2_intermediate:
      adds: []
      effort: "1-2 weeks"  
    tier_3_advanced:
      adds: []
      effort: "1+ months"

# Core definition (Tier 1 scope)
definition:
  purpose: |
    Single sentence describing what this achieves.
    
  outcome: |
    What exists after successful execution that didn't exist before.
    
  inputs:
    - name: ""
      source: ""
      
  outputs:
    - name: ""
      consumer: ""
      
  owner: ""  # Role, not person
  
  steps:  # Keep to 5-7 for Tier 1
    - step: 1
      action: ""
      responsible: ""
      
  success_criteria:
    - ""

# Relationships
related_definitions:
  - id: ""
    relationship: "requires|enables|follows|parallel"
    description: ""

# Adaptation guidance
adaptation:
  customize: []  # What orgs should change
  preserve: []   # What should stay standard
```

---

## OrgOps Definitions: Prioritized List

Starting with OrgOps (51 L3 items), organized by implementation priority:

### Priority 1: Foundational (Implement First)

Every org needs these immediately:

| ID | Name | L1.L2.L3 Path |
|----|------|---------------|
| pd-001 | New Hire Orientation | TalentManagement.Onboarding.orientation-programs |
| pd-002 | System Access Setup | TalentManagement.Onboarding.system-access-and-setup |
| pd-003 | Team Communication Norms | Culture.Collaboration.meeting-etiquette |
| pd-004 | Decision Making Framework | Culture.Collaboration.decision-making-frameworks |
| pd-005 | Monthly Budgeting | Financial.Budgeting.departmental-budgets |

### Priority 2: Scale Enablers (When Growing)

Needed as org grows beyond founding team:

| ID | Name | L1.L2.L3 Path |
|----|------|---------------|
| pd-006 | Performance Review Cycle | TalentManagement.Performance.performance-reviews |
| pd-007 | Goal Setting Framework | TalentManagement.Performance.goal-setting-frameworks |
| pd-008 | Skills Training Program | TalentManagement.Training.skill-specific-training |
| pd-009 | Pulse Survey Process | Culture.Feedback.pulse-surveys |
| pd-010 | Financial Forecasting | Financial.Budgeting.financial-forecasting |

### Priority 3: Maturity Markers (Established Orgs)

Signs of organizational maturity:

| ID | Name | L1.L2.L3 Path |
|----|------|---------------|
| pd-011 | 360 Feedback Process | TalentManagement.Performance.360-degree-feedback |
| pd-012 | Career Progression Framework | TalentManagement.Career.promotion-guidelines |
| pd-013 | Succession Planning | TalentManagement.Career.succession-planning |
| pd-014 | Compliance Audit Process | Financial.Compliance.audit-and-compliance |
| pd-015 | Business Continuity Plan | Financial.Risk.business-continuity-planning |

### Full OrgOps Backlog

(Remaining 36 definitions to be prioritized after initial 15)

---

## Phase 1 Implementation: Proof of Concept

### Step 1: Create Schema Foundation

1. Create `track_definition_base_schema.json`
   - Common fields: id, name, slug, track, status, contributes_to
   - Maturity tier structure
   - Related definitions structure
   
2. Create track extension schemas
   - `org_ops_definition_schema.json` (extends base)
   - Later: strategy, commercial, product (migrate existing)

### Step 2: Create Directory Structure

1. Create `/definitions/` with track subdirectories
2. Create README.md files explaining structure
3. **Do NOT migrate** `features/` yet - do that after validation

### Step 3: Create 5 OrgOps Definitions (Priority 1)

Create narrow, Tier-1 definitions for:
- pd-001 through pd-005

### Step 4: Validate & Iterate

1. Review definitions for scope (narrow enough?)
2. Test maturity tier clarity
3. Verify value model references work
4. Get feedback before scaling

### Step 5: Scale to Full OrgOps

Create remaining 46 definitions using validated pattern.

### Step 6: Migrate Product + Add Strategy/Commercial

1. Move `features/` → `definitions/product/`
2. Create Strategy definitions (27)
3. Create Commercial definitions (24)

---

## Estimated Timeline

| Phase | Scope | Duration |
|-------|-------|----------|
| Foundation | Schemas + structure | 1 day |
| PoC | 5 OrgOps definitions | 1 day |
| Validate | Review + iterate | 1 day |
| OrgOps Complete | Remaining 46 | 3-5 days |
| Migration | Move features/ | 1 day |
| Strategy | 27 definitions | 2-3 days |
| Commercial | 24 definitions | 2 days |
| **Total** | **102 definitions** | **~2 weeks** |

---

## Next Steps

1. [ ] Create `track_definition_base_schema.json`
2. [ ] Create `/definitions/` directory structure
3. [ ] Create pd-001 through pd-005 (Priority 1 OrgOps)
4. [ ] Validate pattern, iterate
5. [ ] Scale to remaining definitions
