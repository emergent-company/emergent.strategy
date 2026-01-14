# Hybrid Schema Design: Track Definitions

**Date:** 2026-01-11  
**Status:** Draft proposal for discussion

---

## Core Insight: What "Procedure" Means Per Track

Each track's value is generated through different types of "procedures":

| Track | Value Model Describes | Procedure Delivers Value Via | Procedure Type |
|-------|----------------------|------------------------------|----------------|
| **Product** | Capabilities for users | Features users interact with | Feature Definition |
| **Strategy** | Strategic positions | Iterations on READY artifacts | Strategy Cycle |
| **OrgOps** | Operational capabilities | Processes people follow | Process Definition |
| **Commercial** | Revenue/partnership motions | Playbooks/motions executed | Playbook Definition |

**Key insight:** Strategy is meta-procedural - its "procedures" are about refining strategy itself (READY artifacts), not delivering external value directly.

---

## Proposed Schema Architecture

```
schemas/
├── track_definition_base_schema.json    # Common structure (NEW)
├── feature_definition_schema.json       # Product track (EXISTS - extends base)
├── process_definition_schema.json       # OrgOps track (NEW - extends base)
├── playbook_definition_schema.json      # Commercial track (NEW - extends base)
└── strategy_cycle_schema.json           # Strategy track (NEW - different pattern)
```

---

## 1. Base Schema: `track_definition_base_schema.json`

Common fields across Product, OrgOps, Commercial (NOT Strategy - see below):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "track_definition_base_schema.json",
  "title": "EPF Track Definition Base Schema",
  "version": "1.0.0",
  "description": "Base schema for track-specific value generation definitions. Extended by feature_definition (Product), process_definition (OrgOps), and playbook_definition (Commercial).",
  
  "type": "object",
  "required": ["id", "name", "slug", "status", "track", "strategic_context", "definition"],
  
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique identifier. Pattern varies by track."
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "description": "Human-readable name"
    },
    "slug": {
      "type": "string",
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"
    },
    "status": {
      "type": "string",
      "enum": ["draft", "ready", "in-progress", "delivered", "deprecated"]
    },
    "track": {
      "type": "string",
      "enum": ["product", "org_ops", "commercial"],
      "description": "Which track this definition belongs to"
    },
    
    "strategic_context": {
      "type": "object",
      "required": ["contributes_to"],
      "properties": {
        "contributes_to": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^(Product|Commercial|Strategy|OrgOps)\\.[A-Za-z]+\\.[A-Za-z]+"
          },
          "minItems": 1,
          "description": "Value Model L2/L3 paths this definition contributes to"
        },
        "assumptions_tested": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^asm-(p|s|o|c)-[0-9]+$"
          },
          "description": "Roadmap assumptions validated by this definition"
        }
      }
    },
    
    "definition": {
      "type": "object",
      "required": ["value_hypothesis", "actors", "value_units"],
      "properties": {
        "value_hypothesis": {
          "type": "string",
          "minLength": 30,
          "description": "When [context], [actor] can [action], resulting in [outcome]"
        },
        "actors": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": ["id", "name", "type"],
            "properties": {
              "id": { "type": "string" },
              "name": { "type": "string" },
              "type": {
                "type": "string",
                "enum": ["beneficiary", "executor", "owner", "sponsor"]
              },
              "description": { "type": "string" }
            }
          },
          "description": "Who is involved in this value generation"
        },
        "value_units": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": ["id", "name", "description"],
            "properties": {
              "id": { "type": "string" },
              "name": { "type": "string" },
              "description": { "type": "string" }
            }
          },
          "description": "Discrete units of value delivered (capabilities, outputs, deliverables)"
        }
      }
    },
    
    "execution": {
      "type": "object",
      "properties": {
        "scenarios": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "name", "actor", "context", "trigger", "action", "outcome"],
            "properties": {
              "id": { "type": "string" },
              "name": { "type": "string" },
              "actor": { "type": "string" },
              "context": { "type": "string" },
              "trigger": { "type": "string" },
              "action": { "type": "string" },
              "outcome": { "type": "string" },
              "success_criteria": {
                "type": "array",
                "items": { "type": "string" }
              }
            }
          }
        }
      }
    },
    
    "dependencies": {
      "type": "object",
      "properties": {
        "requires": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "name", "reason"],
            "properties": {
              "id": { "type": "string" },
              "name": { "type": "string" },
              "reason": { "type": "string", "minLength": 30 }
            }
          }
        },
        "enables": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "name", "reason"],
            "properties": {
              "id": { "type": "string" },
              "name": { "type": "string" },
              "reason": { "type": "string", "minLength": 30 }
            }
          }
        }
      }
    },
    
    "boundaries": {
      "type": "object",
      "properties": {
        "non_goals": {
          "type": "array",
          "items": { "type": "string" }
        },
        "constraints": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  }
}
```

---

## 2. Track Extensions

### 2a. Product Extension (feature_definition_schema.json)

Extends base with product-specific fields. **Preserves existing schema** - just refactored:

```json
{
  "allOf": [
    { "$ref": "track_definition_base_schema.json" },
    {
      "properties": {
        "id": { "pattern": "^fd-[0-9]+$" },
        "track": { "const": "product" },
        
        "definition": {
          "properties": {
            "job_to_be_done": { "type": "string" },
            "solution_approach": { "type": "string" },
            "capabilities": { "...existing..." },
            "personas": { "...existing 4 persona structure..." },
            "architecture_patterns": { "...existing..." }
          }
        },
        
        "implementation": {
          "properties": {
            "design_guidance": { "...existing..." },
            "contexts": { "...existing UI contexts..." },
            "scenarios": { "...existing rich scenarios..." },
            "external_integrations": { "...existing..." }
          }
        }
      }
    }
  ]
}
```

### 2b. OrgOps Extension (process_definition_schema.json)

For operational processes, internal procedures:

```json
{
  "allOf": [
    { "$ref": "track_definition_base_schema.json" },
    {
      "properties": {
        "id": { "pattern": "^proc-[0-9]+$" },
        "track": { "const": "org_ops" },
        
        "definition": {
          "properties": {
            "process_objective": {
              "type": "string",
              "description": "When [trigger], [team/role] follows [process], achieving [operational outcome]"
            },
            "process_owners": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "role": { "type": "string" },
                  "responsibility": { "type": "string" },
                  "accountable_for": { "type": "string" }
                }
              },
              "description": "RACI-style ownership"
            },
            "current_state": {
              "type": "object",
              "properties": {
                "pain_points": { "type": "array", "items": { "type": "string" } },
                "metrics": {
                  "type": "object",
                  "description": "Current performance (cycle time, error rate, etc.)"
                }
              }
            },
            "target_state": {
              "type": "object",
              "properties": {
                "outcomes": { "type": "array", "items": { "type": "string" } },
                "metrics": {
                  "type": "object",
                  "description": "Target performance"
                }
              }
            }
          }
        },
        
        "execution": {
          "properties": {
            "process_stages": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": { "type": "string" },
                  "name": { "type": "string" },
                  "description": { "type": "string" },
                  "inputs": { "type": "array", "items": { "type": "string" } },
                  "outputs": { "type": "array", "items": { "type": "string" } },
                  "owner": { "type": "string" },
                  "sla": { "type": "string" }
                }
              },
              "description": "Process stages with inputs/outputs/SLAs"
            },
            "tools_and_systems": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Tools used to execute this process"
            }
          }
        }
      }
    }
  ]
}
```

### 2c. Commercial Extension (playbook_definition_schema.json)

For revenue motions, sales plays, partnership activities:

```json
{
  "allOf": [
    { "$ref": "track_definition_base_schema.json" },
    {
      "properties": {
        "id": { "pattern": "^play-[0-9]+$" },
        "track": { "const": "commercial" },
        
        "definition": {
          "properties": {
            "commercial_hypothesis": {
              "type": "string",
              "description": "When [segment/trigger], [motion] drives [revenue outcome] at [unit economics]"
            },
            "target_segment": {
              "type": "object",
              "properties": {
                "icp": { "type": "string", "description": "Ideal Customer Profile" },
                "buyer_personas": { "type": "array", "items": { "type": "string" } },
                "qualification_criteria": { "type": "array", "items": { "type": "string" } }
              }
            },
            "value_proposition": {
              "type": "string",
              "description": "Why this segment buys from us"
            }
          }
        },
        
        "execution": {
          "properties": {
            "funnel_stages": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "stage": { "type": "string" },
                  "activities": { "type": "array", "items": { "type": "string" } },
                  "metrics": { "type": "array", "items": { "type": "string" } },
                  "conversion_target": { "type": "string" }
                }
              }
            },
            "sales_enablement": {
              "type": "object",
              "properties": {
                "collateral": { "type": "array", "items": { "type": "string" } },
                "talk_tracks": { "type": "array", "items": { "type": "string" } },
                "objection_handling": { "type": "array", "items": { "type": "string" } }
              }
            },
            "revenue_model": {
              "type": "object",
              "properties": {
                "pricing": { "type": "string" },
                "deal_size_range": { "type": "string" },
                "sales_cycle": { "type": "string" },
                "unit_economics": { "type": "object" }
              }
            }
          }
        }
      }
    }
  ]
}
```

---

## 3. Strategy Track: Different Pattern

Strategy is fundamentally different - it's about **iterating on READY artifacts**, not delivering discrete value units. It should use existing structures:

### Option A: No separate definition schema needed

Strategy's "procedures" ARE the READY artifacts themselves:
- `01_insight_analyses.yaml` - procedure for gathering insights
- `02_strategy_foundations.yaml` - procedure for establishing strategy
- `05_roadmap_recipe.yaml` - procedure for planning execution

The **value model** for Strategy describes strategic capabilities.
The **READY artifacts** describe how those capabilities are exercised.

No separate "strategy_definition" needed - the cycle of INSIGHT → STRATEGY → ROADMAP → AIM IS the procedure.

### Option B: Strategy Cycle Schema (lightweight)

If we want explicit tracking of strategy iterations:

```json
{
  "id": { "pattern": "^cycle-[0-9]+$" },
  "cycle_name": "Q1 2026 Strategy Cycle",
  "strategic_context": {
    "contributes_to": ["Strategy.StrategicRoadmap.GoalPrioritization"]
  },
  "cycle_focus": {
    "primary_questions": ["Which market segment to prioritize?"],
    "assumptions_to_test": ["asm-s-001"],
    "artifacts_to_refine": ["01_insight_analyses", "04_strategy_formula"]
  },
  "inputs": {
    "market_signals": [...],
    "performance_data": [...],
    "stakeholder_input": [...]
  },
  "outputs": {
    "decisions_made": [...],
    "artifacts_updated": [...],
    "next_cycle_focus": [...]
  }
}
```

**Recommendation:** Start with Option A (no separate schema). Strategy track's "procedures" are already captured in READY/AIM cycle. Only add Option B if there's explicit need to track cycles formally.

---

## 4. Instance Structure

```
_instances/{product}/FIRE/
├── feature_definitions/          # Product track (existing)
│   ├── fd-001-document-upload.yaml
│   └── fd-002-entity-extraction.yaml
├── process_definitions/          # OrgOps track (NEW)
│   ├── proc-001-engineering-onboarding.yaml
│   └── proc-002-incident-response.yaml
├── playbook_definitions/         # Commercial track (NEW)
│   ├── play-001-enterprise-sales-motion.yaml
│   └── play-002-plg-conversion.yaml
├── value_models/                 # All 4 tracks
│   ├── product.value_model.yaml
│   ├── strategy.value_model.yaml
│   ├── org_ops.value_model.yaml
│   └── commercial.value_model.yaml
└── workflows/
```

---

## 5. Validation Scripts

Extend existing validators:

```bash
# Generalized quality validator
validate-definition-quality.sh [feature|process|playbook] path/to/file.yaml

# Track-specific shortcuts (call generalized)
validate-feature-quality.sh path/to/fd-*.yaml        # Existing
validate-process-quality.sh path/to/proc-*.yaml      # New
validate-playbook-quality.sh path/to/play-*.yaml     # New

# Cross-reference validators (extend to all tracks)
validate-value-model-references.sh definitions/      # All definition types
```

---

## 6. Wizards

```
wizards/
├── feature_definition.wizard.md          # Existing
├── process_definition.wizard.md          # NEW
├── playbook_definition.wizard.md         # NEW
└── definition_enrichment.wizard.md       # NEW - generic enrichment
```

---

## Migration Path

1. **Phase 1:** Create base schema (extract common patterns from feature_definition_schema)
2. **Phase 2:** Refactor feature_definition_schema to extend base (no breaking change)
3. **Phase 3:** Create process_definition_schema for OrgOps
4. **Phase 4:** Create playbook_definition_schema for Commercial
5. **Phase 5:** Update validators and wizards
6. **Phase 6:** Document in guides and integration_specification

---

## Questions Resolved

1. ✅ **Naming:** Track-specific (feature/process/playbook) - clearer than generic
2. ✅ **Strategy pattern:** Different - uses READY artifacts directly, no separate definition
3. ✅ **Granularity:** Process/Playbook ≈ 1-3 L3 sub-components (same as features)
4. ✅ **Schema approach:** Hybrid with base + extensions (preserves existing)
