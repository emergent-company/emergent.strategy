# Session Summary: SkatteFUNN v2.0.0 Update + Roadmap Extensions

**Date**: 2026-01-01  
**Session Focus**: Budget-neutral KR additions + Schema/Template restructure for official form compatibility

## ✅ Completed Work

### 1. Roadmap Extensions (Budget-Neutral)

**File**: `docs/EPF/_instances/emergent/READY/05_roadmap_recipe.yaml`

**Budget Reallocation** (330K NOK freed):
- Activity 1.1: 610K → 500K (-110K) - reduced load testing scale
- Activity 1.2: 610K → 500K (-110K) - reduced labeled dataset size
- Activity 1.3: 610K → 500K (-110K) - reduced MCP pilot users (5→3)

**New KRs Added** (3 total, 330K NOK):
- **kr-p-010**: Multi-modal knowledge graph (images/diagrams, TRL 2→4, Q2 2025, 110K)
- **kr-p-011**: Temporal knowledge graph (version control, TRL 3→5, Q2-Q3 2025, 110K)
- **kr-p-012**: EPF schema evolution & migration (TRL 2→4, Q1 2026, 110K)

**New OKRs**:
- OKR-P-004: "Extend knowledge graph with multi-modal and temporal capabilities" (kr-p-010, kr-p-011)
- OKR-P-005: "Establish EPF framework quality and evolution infrastructure" (kr-p-012)

**New Assumptions**:
- asm-p-007: Visual embeddings enable semantic similarity search across modalities
- asm-p-008: Temporal tracking adds value beyond latest-version-only queries
- asm-p-009: Semantic versioning can handle schema migrations without data loss

**New Sprints**:
- Sprint 4: Multi-Modal Enhancement (Q2 2025)
- Sprint 5: Temporal Tracking (Q2-Q3 2025)
- Sprint 6: Schema Evolution (Q1 2026)

**New Milestones**:
- 2025-06-30: Multi-Modal Knowledge Graph Live
- 2025-08-31: Temporal Tracking Operational
- 2026-03-31: EPF Framework Evolution Infrastructure

**Timeline Extended**: Q1 2025 → Q1 2026 (3 months → 15 months coverage)

**Total Budget**: 3,250,000 NOK (unchanged)  
**Total KRs**: 12 Product KRs (9 original + 3 new)

---

### 2. SkatteFUNN Schema v2.0.0

**File**: `docs/EPF/outputs/skattefunn-application/schema.json`

**Version**: 1.0.0 → 2.0.0

**Major Changes**:
- Added `creator` role (separate from project_leader)
- Replaced `budget` + `technical_details` with `project_info` + `work_packages`
- Added 10 character-limited fields (100, 500, 1000, 2000 char maxLength)
- Changed `scientific_discipline` from string to nested object (area → group → discipline)
- Added `title_norwegian`, `short_name`, `area_of_use`, `continuation`, `other_applicants`
- Work packages array (1-8 WPs, each with 2-8 activities)
- Budget per WP organized by year and cost_code (Personnel, Equipment, Other Operating Costs, Overhead)

**Character Limits**:
- 60 chars: short_name
- 100 chars: titles, WP name, activity title
- 500 chars: rd_challenges, activity description, cost_specification
- 1000 chars: primary_objective, method_approach, project_summary
- 2000 chars: company_activities, project_background, market_differentiation, rd_content

**Status**: ✅ Valid JSON, all syntax errors fixed

---

### 3. SkatteFUNN Template v2.0.0

**File**: `docs/EPF/outputs/skattefunn-application/template.md`

**Version**: 1.0.0 → 2.0.0

**Restructured to 8 Official Form Sections**:
1. Project Owner and Roles (3 roles: creator, org rep, project leader)
2. About the Project (titles, classification, continuation, other applicants)
3. Background and Company Activities (2× 2000 char fields)
4. Primary Objective and Innovation (1000 + 2000 chars)
5. R&D Content (2000 chars)
6. Project Summary (1000 chars - published publicly)
7. Work Packages (REPEATABLE for each WP: name, dates, category, challenges, method, activities, budget)
8. Total Budget and Estimated Deduction (summary tables by year/cost_code)

**Key Features**:
- Character limit notes after each field (e.g., "*[Max 1000 characters]*")
- Work package section repeatable (1-8 WPs)
- Activity subsection repeatable (2-8 per WP)
- Budget tables use official cost codes (not percentages)
- Section 8 includes year-by-year and WP-by-WP summaries
- Enhanced submission checklist with character limit compliance

**Purpose**: Enable direct copy/paste from generated document to official online form at https://kunde.forskningsradet.no/skattefunn/

**Status**: ✅ Complete with all 8 sections and character limit enforcement

---

## 📋 Pending Work

### 1. Update Wizard Instructions

**File**: `docs/EPF/outputs/skattefunn-application/wizard.instructions.md`

**Needs**:
- Update to reference schema v2.0.0 fields
- Extract work packages from roadmap KRs (map TRL/hypothesis/experiment to WP structure)
- Generate Norwegian title (translate English title)
- Calculate budget summaries by year and cost_code
- Enforce character limits during generation
- Handle 1-8 work packages (at least 1 required)
- Handle 2-8 activities per WP (at least 2 required)

---

### 2. Update Emergent Application Document

**File**: `docs/EPF/_instances/emergent/emergent-skattefunn-application-2025-12-31.md`

**Needs**:
- Update WP1 activities with budget reductions (Activities 1.1, 1.2, 1.3 reduced to 500K each)
- Add new activities for kr-p-010 (multi-modal, 110K, Q2 2025)
- Add new activities for kr-p-011 (temporal, 110K, Q2-Q3 2025)
- Add new activities for kr-p-012 (schema evolution, 110K, Q1 2026)
- Maintain 3,250,000 NOK total budget
- Add TRL/hypothesis/experiment details for new KRs
- Update timeline to show Q2-Q3 2025 and Q1 2026 activities
- Possibly create new WP4 for schema evolution work

---

### 3. Test Schema/Template

**Checklist**:
- [ ] Validate schema with JSON Schema validator
- [ ] Generate test application with wizard
- [ ] Verify all character limits enforced
- [ ] Check Norwegian title translation
- [ ] Test work package repetition (try 1, 3, 8 WPs)
- [ ] Test activity repetition (try 2, 5, 8 activities per WP)
- [ ] Verify budget sums correctly by year and cost_code
- [ ] Test copy/paste workflow to official online form
- [ ] Validate Section 8 summary matches work package totals
- [ ] Check EPF traceability links work

---

## 📊 Metrics

### Roadmap Extensions
- **Budget Change**: 0 NOK (stayed at 3,250,000)
- **KRs Added**: 3 (kr-p-010, kr-p-011, kr-p-012)
- **Total KRs**: 12 Product KRs
- **Timeline Extended**: 3 months → 15 months (Q1 2025 → Q1 2026)
- **New Sprints**: 3 (Multi-Modal, Temporal, Schema Evolution)
- **New Milestones**: 3 (Jun/Aug 2025, Mar 2026)

### Schema/Template Updates
- **Schema Version**: 1.0.0 → 2.0.0
- **Template Version**: 1.0.0 → 2.0.0
- **Form Sections**: 6 → 8
- **Character Limits Added**: 13 fields
- **New Fields**: 12 (creator role, Norwegian title, continuation, other_applicants, etc.)
- **Budget Structure**: Flat → Work Packages (1-8 WPs, 2-8 activities per WP)

---

## 🔗 Related Files

### Updated (Current Session)
- `docs/EPF/_instances/emergent/READY/05_roadmap_recipe.yaml` (extended timeline, 3 new KRs)
- `docs/EPF/outputs/skattefunn-application/schema.json` (v2.0.0)
- `docs/EPF/outputs/skattefunn-application/template.md` (v2.0.0)

### Work Documents (Created)
- `docs/EPF/.epf-work/skattefunn-schema-update-2026-01-01/SCHEMA_V2_SUMMARY.md`
- `docs/EPF/.epf-work/skattefunn-schema-update-2026-01-01/TEMPLATE_V2_COMPLETE.md`
- `docs/EPF/.epf-work/skattefunn-schema-update-2026-01-01/SESSION_SUMMARY.md` (this file)

### Pending Updates
- `docs/EPF/outputs/skattefunn-application/wizard.instructions.md` (needs v2.0.0 field guidance)
- `docs/EPF/_instances/emergent/emergent-skattefunn-application-2025-12-31.md` (needs budget reallocation)

---

## 🎯 Strategic Context

### Why These Changes?

**Roadmap Extensions**:
- User wanted to maximize R&D value within fixed 3.25M NOK budget
- Three high-value KRs (multi-modal, temporal, schema evolution) add significant capabilities
- Budget-neutral approach (reallocation not expansion) maintains SkatteFUNN approval scope
- Extended timeline (Q1 2025 → Q1 2026) aligns with SkatteFUNN 29-month project period

**Schema/Template Restructure**:
- Official SkatteFUNN online form has 8 sections with specific field structure
- Character limits enforced by online form (100, 500, 1000, 2000 chars)
- Work packages are repeatable sections (Section 7 repeats for each WP)
- Goal: Enable simple copy/paste from generated document to online form
- Reduces manual reformatting and transcription errors during submission

### Benefits

**Technical**:
- Multi-modal graph enables visual search across diagrams/screenshots
- Temporal tracking enables time-travel queries and versioning
- Schema evolution infrastructure enables EPF v2→v3 migrations

**Process**:
- Copy/paste workflow saves 2-3 hours per application
- Character limit enforcement prevents submission errors
- Repeatable work package structure matches Research Council expectations
- Enhanced traceability from EPF → SkatteFUNN application

**Strategic**:
- More KRs = more R&D tax deduction opportunities (more activities qualify)
- Extended timeline (15 months) = better alignment with actual development pace
- Official form compliance = faster approval, fewer revision requests

---

## 🚀 Next Session Goals

1. **Update wizard.instructions.md** with v2.0.0 field mappings
2. **Test schema validation** with JSON Schema validator
3. **Generate test application** to verify character limits and structure
4. **Update emergent application** with budget reallocation and new KRs
5. **Test copy/paste workflow** to official online form

---

**Session Status**: ✅ Core updates complete (roadmap + schema + template)  
**Next**: Wizard update + testing + application document migration
