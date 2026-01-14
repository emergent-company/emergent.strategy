# Implementation Plan: Value Model Maturity (VMM)

> **Status**: ✅ COMPLETE  
> **Created**: 2026-01-11  
> **Completed**: 2026-01-11  
> **EPF Version**: 2.5.0 (MINOR release)  
> **Actual Effort**: ~4 hours

---

## Summary of Completed Work

### Phase 1: Schema Changes ✅ Complete

| Task | Status | Files Changed |
|------|--------|---------------|
| 1.1 Update value_model_schema.json | ✅ | Added `track_maturity`, `maturity_summary` (L1/L2), `maturity` (L3) |
| 1.2 Create maturity_schema.json | ⏭️ Skipped | Enums defined inline at each level |
| 1.3 Update roadmap_recipe_schema.json | ✅ | Added `value_model_target` field to KRs |
| 1.4 Update north_star_schema.json | ✅ | Added `strategic_maturity_context` section |

### Phase 2: Template Changes ✅ Complete

| Task | Status | Files Changed |
|------|--------|---------------|
| Update product.value_model.yaml | ✅ | Added `track_maturity` section |
| Update strategy.value_model.yaml | ✅ | Added `track_maturity` section |
| Update org_ops.value_model.yaml | ✅ | Added `track_maturity` section |
| Update commercial.value_model.yaml | ✅ | Added `track_maturity` section |

### Phase 3: Documentation ✅ Complete

| Task | Status | Files Changed |
|------|--------|---------------|
| Create VALUE_MODEL_MATURITY_GUIDE.md | ✅ | New comprehensive guide |
| Update README.md | ✅ | Added "What's New in v2.5.0" section |

### Phase 4: Version Bump ✅ Complete

| Task | Status | Files Changed |
|------|--------|---------------|
| Update VERSION | ✅ | 2.4.4 → 2.5.0 |
| Update README.md | ✅ | v2.4.4 → v2.5.0 |
| Update MAINTENANCE.md | ✅ | v2.4.2 → v2.5.0 |
| Update integration_specification.yaml | ✅ | 2.4.2 → 2.5.0 |

### Phases 5-6: Deferred

| Task | Status | Notes |
|------|--------|-------|
| Validation scripts | ⏭️ Deferred | Can be added in future PATCH release |
| Maturity assessment wizard | ⏭️ Deferred | Can be added in future PATCH release |
| EPF_DATABASE_OBJECT_MODEL.md | ⏭️ Deferred | Can be updated in future |

---

## VMM Feature Summary

**Value Model Maturity (VMM)** is now available in EPF v2.5.0. Key features:

### Maturity Stages (4 levels)
- `hypothetical` - Value not yet validated
- `emerging` - Early evidence of value
- `proven` - Consistent value delivery (Value-Recipient Fit)
- `scaled` - Sustainable value at scale (Sustainable-Domain Fit)

### Maturity Milestones (3 universal transitions)
- `problem_approach_fit` - Approach addresses real problem
- `value_recipient_fit` - Recipients receive and value delivery
- `sustainable_domain_fit` - Sustainable in operating domain

### Evidence-Based Assessment
- Maturity assessed at L3 sub-component level with evidence
- Evidence types: usage_metric, customer_feedback, retention_data, nps_score, business_impact, revenue_data, qualitative_observation, experiment_result
- Emerges upward to L2, L1, and Track using 80% rule

### KR Integration
- Roadmap KRs can target specific Value Model components via `value_model_target`
- Links execution (roadmap) to value delivery (Value Model maturity)

### Strategic Visibility
- North Star `strategic_maturity_context` provides portfolio-level view
- Supports multi-product companies with per-product-line maturity

---

## Executive Summary

This plan introduces **Value Model Maturity (VMM)** - a system for tracking where each Value Model component is on its journey from hypothesis to scaled value delivery. VMM is:

- **Calculated at L3, emerges upward** to L2 and L1
- **Evidence-based** with human override capability
- **Per product line** (multi-product companies have independent maturity per product)
- **Universal across all 4 tracks** (Product, Strategy, OrgOps, Commercial)

### Key Concepts

| Term | Definition |
|------|------------|
| **Value Model Maturity (VMM)** | The degree to which a Value Model component has transitioned from hypothetical to proven, scaled value delivery |
| **Maturity Stage** | One of: `hypothetical`, `emerging`, `proven`, `scaled` |
| **Evidence** | Documented proof of value delivery (metrics, user feedback, business outcomes) |
| **Value Domain** | The environment where maturity is gained (market, organization, competitive landscape, etc.) |
| **Maturity Milestone** | Key transitions: Problem-Approach Fit → Value-Recipient Fit → Sustainable-Domain Fit |

### Generalized Milestones (Not Market-Specific)

| Milestone | Generalized Name | Question Answered |
|-----------|------------------|-------------------|
| Problem-Solution Fit | **Problem-Approach Fit** | Does our approach address a real problem in this domain? |
| Product-User Fit | **Value-Recipient Fit** | Do recipients actually receive and value what we deliver? |
| Product-Market Fit | **Sustainable-Domain Fit** | Can we sustain value delivery in our operating domain? |

---

## Phase 1: Schema Changes (Priority 1)

### 1.1 Update `value_model_schema.json`

Add maturity fields at L3 (sub-component) level with calculated emergence to L2/L1.

**New Fields at L3 (sub_components):**
```json
{
  "maturity": {
    "type": "object",
    "properties": {
      "stage": {
        "type": "string",
        "enum": ["hypothetical", "emerging", "proven", "scaled"],
        "description": "Current maturity stage for this sub-component"
      },
      "stage_override": {
        "type": "boolean",
        "default": false,
        "description": "If true, stage was set manually rather than calculated from evidence"
      },
      "evidence": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "type": { "type": "string" },
            "description": { "type": "string" },
            "date": { "type": "string", "format": "date" },
            "confidence": { "type": "string", "enum": ["low", "medium", "high"] }
          }
        }
      },
      "milestone_achieved": {
        "type": "string",
        "enum": ["none", "problem_approach_fit", "value_recipient_fit", "sustainable_domain_fit"],
        "description": "Highest milestone achieved for this sub-component"
      },
      "trl_link": {
        "type": "string",
        "description": "Reference to KR with TRL tracking for this sub-component (e.g., 'kr-p-003')"
      }
    }
  }
}
```

**New Fields at L2 (components) - Calculated:**
```json
{
  "maturity_summary": {
    "type": "object",
    "properties": {
      "calculated_stage": {
        "type": "string",
        "enum": ["hypothetical", "emerging", "proven", "scaled"],
        "description": "Emerges from L3 sub-component maturity (e.g., if 80%+ of L3s are 'proven', L2 is 'proven')"
      },
      "stage_override": {
        "type": "boolean",
        "default": false
      },
      "l3_distribution": {
        "type": "object",
        "description": "Count of L3 sub-components in each stage"
      }
    }
  }
}
```

**New Fields at L1 (layers) - Calculated:**
```json
{
  "maturity_summary": {
    "type": "object",
    "properties": {
      "calculated_stage": {
        "type": "string",
        "enum": ["hypothetical", "emerging", "proven", "scaled"]
      },
      "stage_override": {
        "type": "boolean",
        "default": false
      },
      "l2_distribution": {
        "type": "object"
      }
    }
  }
}
```

**New Top-Level Field (track-level summary):**
```json
{
  "track_maturity": {
    "type": "object",
    "properties": {
      "overall_stage": {
        "type": "string",
        "enum": ["hypothetical", "emerging", "proven", "scaled"]
      },
      "value_domain": {
        "type": "string",
        "description": "The domain where this track's maturity is assessed (e.g., 'target market', 'competitive landscape', 'organization', 'customer base')"
      },
      "current_milestone": {
        "type": "string",
        "enum": ["none", "problem_approach_fit", "value_recipient_fit", "sustainable_domain_fit"]
      },
      "next_milestone_criteria": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "description": { "type": "string" },
            "status": { "type": "string", "enum": ["not_met", "in_progress", "met"] }
          }
        }
      }
    }
  }
}
```

### 1.2 Create `maturity_schema.json` (Supporting Schema)

Standalone schema defining the maturity model vocabulary:

```json
{
  "definitions": {
    "maturity_stage": {
      "type": "string",
      "enum": ["hypothetical", "emerging", "proven", "scaled"],
      "$comment": "hypothetical: We believe this creates value, no evidence yet. emerging: Early evidence of value (pilot users, initial metrics). proven: Consistent evidence across multiple recipients (paying customers, validated process). scaled: Value at scale, optimized and sustainable."
    },
    "maturity_milestone": {
      "type": "string", 
      "enum": ["none", "problem_approach_fit", "value_recipient_fit", "sustainable_domain_fit"],
      "$comment": "problem_approach_fit: Confirmed our approach addresses a real problem. value_recipient_fit: Recipients actually receive and value what we deliver. sustainable_domain_fit: We can sustain value delivery in our operating domain."
    },
    "value_domain": {
      "type": "string",
      "$comment": "The environment where maturity is gained. Examples: market (Product), competitive landscape (Strategy), organizational context (OrgOps), customer base (Commercial)"
    }
  }
}
```

### 1.3 Update `roadmap_recipe_schema.json`

Link KRs to Value Model components for maturity tracking:

```json
{
  "key_results": {
    "properties": {
      "value_model_target": {
        "type": "object",
        "description": "Which Value Model component(s) this KR advances",
        "properties": {
          "track": { "type": "string" },
          "component_path": { "type": "string", "description": "L1.L2.L3 path (e.g., 'CorePlatform.DataManagement.CSVImport')" },
          "target_maturity": { "type": "string", "enum": ["emerging", "proven", "scaled"] }
        }
      }
    }
  }
}
```

### 1.4 Update `north_star_schema.json`

Add section for emerged maturity context (descriptive, not prescriptive):

```json
{
  "strategic_maturity_context": {
    "type": "object",
    "description": "High-level maturity summary that emerges from Value Models. Reviewed during North Star updates (typically annually).",
    "properties": {
      "portfolio_summary": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "product_line": { "type": "string" },
            "overall_position": { "type": "string", "enum": ["discovery", "validation", "scalability", "growth"] },
            "track_maturity": {
              "type": "object",
              "properties": {
                "product": { "$ref": "#/definitions/maturity_stage" },
                "strategy": { "$ref": "#/definitions/maturity_stage" },
                "org_ops": { "$ref": "#/definitions/maturity_stage" },
                "commercial": { "$ref": "#/definitions/maturity_stage" }
              }
            }
          }
        }
      },
      "strategic_focus": {
        "type": "array",
        "description": "Emerges from maturity gaps (e.g., 'Accelerate Commercial track to match Product maturity')",
        "items": { "type": "string" }
      }
    }
  }
}
```

---

## Phase 2: Template Updates (Priority 2)

### 2.1 Update Value Model Templates

Add maturity fields to all 4 track templates:
- `templates/FIRE/value_models/product.value_model.yaml`
- `templates/FIRE/value_models/strategy.value_model.yaml`
- `templates/FIRE/value_models/org_ops.value_model.yaml`
- `templates/FIRE/value_models/commercial.value_model.yaml`

### 2.2 Update Roadmap Template

Add `value_model_target` to KR examples in:
- `templates/READY/05_roadmap_recipe.yaml`

### 2.3 Update North Star Template

Add `strategic_maturity_context` section to:
- `templates/READY/00_north_star.yaml`

---

## Phase 3: Documentation Updates (Priority 2)

### 3.1 Create New Concept Guide

Create `docs/guides/VALUE_MODEL_MATURITY_GUIDE.md`:
- Explain VMM concept and why it matters
- Define maturity stages with examples per track
- Explain evidence-based calculation vs human override
- Document the emergence pattern (L3 → L2 → L1 → Track → Portfolio)
- Provide worked examples for each track

### 3.2 Update White Paper

Add section to `docs/EPF_WHITE_PAPER.md`:
- The S-curve and User Value Ladder (your visualization)
- Hypothetical vs Actual Value threshold
- VMM as the mechanism for tracking position on S-curve
- Bidirectional emergence (bottom-up evidence, top-down guidance)

### 3.3 Update Adoption Guide

Update `docs/guides/ADOPTION_GUIDE.md`:
- How VMM relates to Escalation Levels (organizational maturity vs product maturity)
- When to start tracking maturity (Level 1+)
- Simplified maturity tracking for Level 0-1 vs full tracking at Level 2-3

### 3.4 Update README

Update main `README.md`:
- Add VMM to EPF conceptual overview
- Update the 4-layer diagram (add VMM layer)
- Link to VALUE_MODEL_MATURITY_GUIDE.md

---

## Phase 4: Wizard & Tooling (Priority 3)

### 4.1 Create Maturity Assessment Wizard

Create `wizards/maturity_assessment.agent_prompt.md`:
- Interview-style wizard to assess current maturity
- For each L3 sub-component: gather evidence, determine stage
- Calculate L2/L1 maturity from L3 responses
- Generate track-level maturity summary
- Identify maturity gaps and focus areas

### 4.2 Update Roadmap Enrichment Wizard

Update `wizards/roadmap_enrichment.wizard.md`:
- Link TRL fields to Value Model maturity
- Show how KR completion should advance component maturity
- Add maturity target setting for KRs

### 4.3 Create Maturity Visualization Script (Optional)

Create `scripts/visualize-maturity.sh`:
- Read Value Models and generate ASCII/Markdown maturity dashboard
- Show track-by-track maturity stages
- Highlight maturity gaps between tracks

---

## Phase 5: Validation & Integration (Priority 3)

### 5.1 Update Validation Scripts

Update `scripts/validate-schemas.sh`:
- Validate new maturity fields
- Check that maturity stages are consistent (L3 → L2 → L1)

### 5.2 Create Maturity Consistency Check

Create `scripts/check-maturity-consistency.sh`:
- Verify calculated maturity matches L3 evidence
- Flag mismatches between TRL (in roadmap) and VMM (in value model)
- Warn if track maturity varies significantly (may indicate imbalance)

### 5.3 Update EPF Health Check

Update `scripts/epf-health-check.sh`:
- Include maturity consistency in health check
- Report maturity distribution in instance summary

---

## Phase 6: Database Object Model (Priority 4)

### 6.1 Update EPF_DATABASE_OBJECT_MODEL.md

Add new entities and relationships:
- `SubComponentMaturity` entity
- `MaturityEvidence` entity
- Calculated fields for L2/L1/Track maturity
- Milestone tracking entities

---

## Implementation Order

| Phase | Priority | Estimated Hours | Dependencies |
|-------|----------|-----------------|--------------|
| Phase 1: Schema Changes | P1 | 4-6 hours | None |
| Phase 2: Template Updates | P2 | 2-3 hours | Phase 1 |
| Phase 3: Documentation | P2 | 6-8 hours | Phase 1, 2 |
| Phase 4: Wizards & Tooling | P3 | 4-6 hours | Phase 1, 2 |
| Phase 5: Validation | P3 | 2-3 hours | Phase 1, 2 |
| Phase 6: Database Model | P4 | 2-3 hours | Phase 1 |

**Total: 20-29 hours** (recommend 3-4 sessions)

---

## Version Impact

This is a **MINOR version bump** (new feature, backward compatible):
- Current: v2.4.4
- Target: v2.5.0

**Backward Compatibility:**
- All new maturity fields are optional
- Existing Value Models remain valid
- New fields can be adopted incrementally

---

## Open Decisions (To Confirm Before Starting)

1. **Maturity Stage Names**: Are `hypothetical`, `emerging`, `proven`, `scaled` the right terms?

2. **Milestone Names**: Proposed generalization:
   - Problem-Solution Fit → **Problem-Approach Fit**
   - Product-User Fit → **Value-Recipient Fit**  
   - Product-Market Fit → **Sustainable-Domain Fit**
   
   Are these the right abstractions?

3. **Value Domain Examples**:
   - Product track: "target market", "user base"
   - Strategy track: "competitive landscape", "partner ecosystem"
   - OrgOps track: "organizational context", "team culture"
   - Commercial track: "customer base", "revenue model"
   
   Should we define canonical examples or leave flexible?

4. **L2/L1 Calculation Rule**: 
   - Proposed: If 80%+ of child components are at stage X, parent is at stage X
   - Or: Parent is at minimum stage of children (most conservative)
   - Or: Parent is at weighted average of children
   
   Which rule?

5. **Integration with TRL**:
   - Should we require TRL tracking on all KRs that target Value Model components?
   - Or keep it optional (use when innovation/learning maturity matters)?

---

## Next Steps

1. **Confirm open decisions** above
2. **Start Phase 1** (schema changes) in next session
3. **Create working branch** for VMM feature
4. **Implement incrementally**, validating each phase

---

## Appendix: The Emergence Loop (For Documentation)

```
┌─────────────────────────────────────────────────────────────────┐
│                         NORTH STAR                               │
│                 (Purpose, Vision, Values)                        │
│                                                                  │
│  strategic_maturity_context: EMERGED from Value Models           │
│                           │                                      │
│              ┌────────────┴────────────┐                         │
│              ▼ guides                  ▲ updated by evidence     │
└──────────────────────────────────────────────────────────────────┘
               │                         │
               ▼                         ▲
┌─────────────────────────────────────────────────────────────────┐
│                      VALUE MODELS (×4 tracks)                    │
│                                                                  │
│  track_maturity: CALCULATED from L1 maturity                     │
│  L1 maturity: CALCULATED from L2 maturity                        │
│  L2 maturity: CALCULATED from L3 maturity                        │
│  L3 maturity: ASSESSED from evidence (+ TRL link)               │
│                           │                                      │
│              ┌────────────┴────────────┐                         │
│              ▼ shapes priorities       ▲ validated by execution  │
└──────────────────────────────────────────────────────────────────┘
               │                         │
               ▼                         ▲
┌─────────────────────────────────────────────────────────────────┐
│                         ROADMAP                                  │
│                                                                  │
│  KRs have: TRL (innovation maturity) + value_model_target        │
│  Completing KR → provides evidence → updates L3 maturity         │
│                           │                                      │
│              ┌────────────┴────────────┐                         │
│              ▼ executes                ▲ learns                  │
└──────────────────────────────────────────────────────────────────┘
               │                         │
               ▼                         ▲
┌─────────────────────────────────────────────────────────────────┐
│                    FIRE (Execution)                              │
│                                                                  │
│  Build, measure, learn → generates evidence                      │
│  Evidence flows up: KR → L3 → L2 → L1 → Track → Portfolio       │
└─────────────────────────────────────────────────────────────────┘
```

