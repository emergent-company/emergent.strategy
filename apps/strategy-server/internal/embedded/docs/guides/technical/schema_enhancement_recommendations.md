# Schema Enhancement Recommendations for EPF Feature Definitions

> **Last updated**: EPF v1.13.0 | **Status**: Current

**Date:** 2025-12-16  
**Context:** Lessons learned from emergent instance rework (9 feature definitions)  
**Goal:** Make feature definitions "correct by construction" rather than "correct by rework"

## Executive Summary

The systematic rework of 9 emergent feature definitions revealed critical gaps between the **current schema documentation** and the **implicit patterns required for high-quality feature definitions**. This document codifies those implicit patterns into explicit schema enhancements.

**Quantitative Impact of Rework:**
- 36 personas enriched (4 per file × 9 files)
- 42 scenarios extracted from embedded contexts to top-level
- 128 contexts enriched with mandatory fields
- ~1,350 lines of non-EPF content removed
- **Total effort:** ~8 hours of systematic rework

**Root Cause:** Schema was insufficiently prescriptive, allowing ambiguity in:
1. Persona structure and count
2. Scenario placement
3. Context field requirements
4. Allowed vs disallowed content
5. Dependency format

## Current Schema Gaps

### 1. Value Propositions Section

**Current Schema:**
```json
"value_propositions": {
  "type": "array",
  "items": {
    "required": ["persona", "current_pain", "value_delivered"],
    "properties": {
      "persona": {"type": "string"},
      "current_pain": {"type": "string"},
      "value_delivered": {"type": "string"},
      "emotional_outcome": {"type": "string"}
    }
  }
}
```

**Problems:**
- ❌ No constraint on persona COUNT (allows 1-5+, should be exactly 4)
- ❌ No guidance on narrative DEPTH (allows single sentences, needs multi-paragraph)
- ❌ No structure for field CONTENT (allows technical descriptions, needs character-driven stories)
- ❌ Field names don't match validated pattern (current_pain → current_situation, etc.)
- ❌ No requirement for concrete details (character names, metrics, scenarios)

**What Emerged from Rework:**
- ✅ Exactly **4 personas** required (not 2-3, not 5+)
- ✅ Each persona needs **3 distinct paragraphs** with specific purposes:
  1. **current_situation**: Deep dive into pain points with specific metrics, examples, and daily friction
  2. **transformation_moment**: First concrete experience of value delivery with specific scenario
  3. **emotional_resolution**: Long-term emotional and professional transformation
- ✅ Each paragraph needs **character names** ("Sarah, a compliance officer...")
- ✅ Each paragraph needs **specific metrics** ("spends 12 hours per month...")
- ✅ Each paragraph needs **concrete scenarios** (not abstract descriptions)

### 2. Scenarios Section

**Current Schema:**
```json
"scenarios": {
  "type": "array",
  "items": {
    "required": ["id", "actor", "action", "outcome"],
    "properties": {
      "id": {"pattern": "^scn-[0-9]+$"},
      "actor": {"type": "string"},
      "action": {"type": "string"},
      "outcome": {"type": "string"},
      "acceptance_criteria": {
        "type": "array",
        "items": {"type": "string"}
      }
    }
  }
}
```

**Problems:**
- ❌ No explicit requirement that scenarios be **top-level** (not embedded in contexts)
- ❌ Missing required fields that emerged: **context**, **trigger**, **name**
- ❌ No constraint preventing scenarios embedded in contexts.user_actions

**What Emerged from Rework:**
- ✅ Scenarios MUST be at **top level of implementation section**
- ✅ Scenarios MUST NOT be embedded in contexts
- ✅ Required fields: id, name, actor, context, trigger, action, outcome, acceptance_criteria

### 3. Contexts Section

**Current Schema:**
```json
"contexts": {
  "type": "array",
  "items": {
    "required": ["id", "type", "name", "description"],
    "properties": {
      "key_elements": {"type": "array"},
      "user_actions": {"type": "array"},
      "data_displayed": {"type": "array"}
    }
  }
}
```

**Problems:**
- ❌ key_elements, user_actions, data_displayed are **optional** (should be required)
- ❌ No constraint preventing scenarios embedded in user_actions
- ❌ No guidance on field naming (key_elements vs key_interactions)

**What Emerged from Rework:**
- ✅ **key_interactions** field is REQUIRED (not key_elements)
- ✅ **data_displayed** field is REQUIRED
- ✅ user_actions should contain ONLY atomic actions, NOT full scenarios
- ✅ Contexts should describe WHAT is presented, not HOW it's implemented

### 4. Dependencies Section

**Current Schema:**
```json
"dependencies": {
  "properties": {
    "requires": {
      "type": "array",
      "items": {"pattern": "^fd-[0-9]+$"}
    },
    "enables": {
      "type": "array",
      "items": {"pattern": "^fd-[0-9]+$"}
    }
  }
}
```

**Problems:**
- ❌ Only allows strings (fd-001), but rework used objects with id/name/reason
- ❌ No guidance on WHY dependencies exist (just IDs)
- ❌ Doesn't support rich dependency relationships

**What Emerged from Rework:**
- ✅ Dependencies should be objects with: **id**, **name**, **reason**
- ✅ Reason field explains WHY the dependency exists (not just THAT it exists)
- ✅ Creates more traceable feature dependency graph

### 5. Content Restrictions (Not in Current Schema)

**Current Schema:**
- ✅ Uses `additionalProperties: false` at root
- ❌ Doesn't explicitly forbid common anti-patterns

**What Emerged from Rework:**
- ❌ **technical_specifications** section - NOT ALLOWED (too implementation-focused)
- ❌ **validation_criteria** section - NOT ALLOWED (too technical)
- ❌ **risks_and_mitigations** section - NOT ALLOWED (not EPF schema)
- ❌ **current_state** section - NOT ALLOWED (not EPF schema)
- ❌ **testing_requirements** section - NOT ALLOWED (implementation concern)

## Recommended Schema Enhancements

### Enhancement 1: Prescriptive Value Propositions

**Add to schema:**
```json
"value_propositions": {
  "type": "array",
  "minItems": 4,
  "maxItems": 4,
  "description": "EXACTLY 4 personas required - each with 3-paragraph narrative (current_situation, transformation_moment, emotional_resolution)",
  "items": {
    "type": "object",
    "required": ["persona", "current_situation", "transformation_moment", "emotional_resolution"],
    "properties": {
      "persona": {
        "type": "string",
        "minLength": 10,
        "description": "Persona role with character name (e.g., 'Data Analyst (Maya)')"
      },
      "current_situation": {
        "type": "string",
        "minLength": 200,
        "description": "Rich paragraph (200+ chars) with character name, specific metrics (hours, costs, errors), concrete daily scenarios showing pain points"
      },
      "transformation_moment": {
        "type": "string",
        "minLength": 200,
        "description": "Rich paragraph (200+ chars) describing first concrete value delivery experience with specific scenario"
      },
      "emotional_resolution": {
        "type": "string",
        "minLength": 200,
        "description": "Rich paragraph (200+ chars) describing long-term emotional and professional transformation"
      }
    },
    "additionalProperties": false
  }
}
```

**Rationale:**
- Enforces exactly 4 personas (from empirical evidence)
- Requires 3-paragraph structure with specific purposes
- Minimum character counts prevent superficial descriptions
- Field names match validated pattern (not current_pain/value_delivered)

### Enhancement 2: Explicit Scenario Placement

**Add to schema:**
```json
"scenarios": {
  "type": "array",
  "minItems": 1,
  "description": "Top-level scenarios array - MUST NOT be embedded in contexts. Each scenario must have all required fields.",
  "items": {
    "type": "object",
    "required": ["id", "name", "actor", "context", "trigger", "action", "outcome", "acceptance_criteria"],
    "properties": {
      "id": {
        "type": "string",
        "pattern": "^scn-[0-9]+$"
      },
      "name": {
        "type": "string",
        "minLength": 10,
        "description": "Descriptive scenario name (e.g., 'Upload and Process Document')"
      },
      "actor": {
        "type": "string",
        "description": "User role performing this scenario (e.g., 'Content Manager')"
      },
      "context": {
        "type": "string",
        "description": "Where this scenario takes place (e.g., 'Document Upload Interface')"
      },
      "trigger": {
        "type": "string",
        "description": "What initiates this scenario (e.g., 'User clicks Upload button')"
      },
      "action": {
        "type": "string",
        "minLength": 30,
        "description": "Detailed description of what happens (not just 'user uploads document')"
      },
      "outcome": {
        "type": "string",
        "minLength": 30,
        "description": "What results from this scenario"
      },
      "acceptance_criteria": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "string",
          "minLength": 20
        },
        "description": "Testable acceptance criteria (Given/When/Then style preferred)"
      }
    },
    "additionalProperties": false
  }
}
```

**Add to contexts:**
```json
"contexts": {
  "items": {
    "properties": {
      "user_actions": {
        "type": "array",
        "items": {
          "type": "string",
          "maxLength": 100,
          "description": "Atomic user actions only (e.g., 'Click upload button', 'Select file'). Full scenarios belong in top-level scenarios array."
        },
        "description": "Individual atomic actions users can take - NOT full scenarios"
      }
    }
  }
}
```

**Rationale:**
- Makes scenario placement unambiguous (top-level only)
- Adds required fields that emerged (name, context, trigger)
- Prevents scenarios embedded in contexts via maxLength constraint
- Minimum character counts prevent shallow descriptions

### Enhancement 3: Required Context Fields

**Update schema:**
```json
"contexts": {
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id", "type", "name", "description", "key_interactions", "data_displayed"],
    "properties": {
      "key_interactions": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "string",
          "minLength": 20
        },
        "description": "Key user interactions in this context (what users DO). Use action verbs."
      },
      "data_displayed": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "string",
          "minLength": 10
        },
        "description": "Key data or information shown in this context (what users SEE)"
      }
    },
    "additionalProperties": false
  }
}
```

**Rationale:**
- Makes key_interactions and data_displayed REQUIRED (not optional)
- Enforces at least one item in each array
- Minimum character counts prevent placeholder values
- Separates WHAT users do (interactions) from WHAT they see (data)

### Enhancement 4: Rich Dependencies

**Update schema:**
```json
"dependencies": {
  "type": "object",
  "description": "Feature dependencies with rich explanations",
  "properties": {
    "requires": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "reason"],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^fd-[0-9]+$"
          },
          "name": {
            "type": "string",
            "description": "Human-readable feature name"
          },
          "reason": {
            "type": "string",
            "minLength": 30,
            "description": "Why this dependency exists - specific technical or product reason"
          }
        }
      },
      "description": "Features this feature depends on (prerequisites)"
    },
    "enables": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "reason"],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^fd-[0-9]+$"
          },
          "name": {
            "type": "string",
            "description": "Human-readable feature name"
          },
          "reason": {
            "type": "string",
            "minLength": 30,
            "description": "What this feature enables - specific value or capability unlocked"
          }
        }
      },
      "description": "Features that depend on this feature"
    }
  }
}
```

**Rationale:**
- Changes from string IDs to rich objects
- Requires explanation of WHY dependencies exist
- Creates more traceable feature graph
- Helps identify circular dependencies and architectural issues

### Enhancement 5: Explicit Content Restrictions

**Add to root schema description:**
```json
{
  "description": "Schema for validating feature definition files. CONTENT RESTRICTIONS: The following sections are NOT ALLOWED and will cause validation failure: technical_specifications, validation_criteria, risks_and_mitigations, current_state, testing_requirements. Feature definitions are product-focused, not implementation-focused.",
  "additionalProperties": false
}
```

**Add validation note:**
```json
"x-validation-notes": {
  "forbidden_sections": [
    "technical_specifications",
    "validation_criteria", 
    "risks_and_mitigations",
    "current_state",
    "testing_requirements"
  ],
  "rationale": "Feature definitions bridge strategy to implementation but remain product-focused. Technical specifications belong in implementation tools (OpenSpec, Linear, etc.), not EPF."
}
```

**Rationale:**
- Makes anti-patterns explicit
- Prevents drift toward implementation documentation
- Reinforces EPF's strategic focus
- Helps AI agents avoid common mistakes

## Recommended Process Enhancements

### 1. Enhanced Wizard Guidance

**Create:** `/wizards/feature_definition.wizard.md`

**Content should include:**
- Step-by-step walkthrough matching schema exactly
- Examples of GOOD vs BAD persona narratives
- Checklist for each section
- Common mistakes and how to avoid them
- Reference to emergent rework as anti-pattern example

**Example section:**
```markdown
## Step 3: Value Propositions (Exactly 4 Personas)

You MUST create exactly 4 personas, each with 3 rich paragraphs.

### Persona 1: [Role]

**current_situation** (200+ characters):
Start with character name. Include:
- Specific metrics (hours, costs, errors)
- Concrete daily scenarios
- Emotional state

Example:
"Sarah, a compliance officer at a mid-sized financial firm, spends 12 hours per month manually tracking document expiration dates across 15 different systems..."

**transformation_moment** (200+ characters):
Describe first concrete value experience...

**emotional_resolution** (200+ characters):
Describe long-term transformation...

### Common Mistakes ❌
- ❌ Only 2-3 personas (need exactly 4)
- ❌ Single-sentence descriptions (need multi-paragraph narratives)
- ❌ Abstract descriptions (need character names and metrics)
- ❌ Technical focus (need user perspective)
```

### 2. Pre-Creation Validation Checklist

**Add to product_architect agent prompt:**

```markdown
## Before Creating Feature Definition

Run this validation checklist:

1. **Persona Validation:**
   - [ ] Exactly 4 personas planned
   - [ ] Each persona has character name
   - [ ] Each persona has 3 paragraphs (current_situation, transformation_moment, emotional_resolution)
   - [ ] Each paragraph is 200+ characters
   - [ ] Includes specific metrics (hours, costs, errors)
   - [ ] Includes concrete scenarios (not abstract descriptions)

2. **Scenario Validation:**
   - [ ] All scenarios at top level (not embedded in contexts)
   - [ ] Each scenario has: id, name, actor, context, trigger, action, outcome, acceptance_criteria
   - [ ] Action and outcome are 30+ characters (detailed, not superficial)
   - [ ] Acceptance criteria use Given/When/Then format

3. **Context Validation:**
   - [ ] Each context has key_interactions array (what users DO)
   - [ ] Each context has data_displayed array (what users SEE)
   - [ ] user_actions contains only atomic actions (not full scenarios)

4. **Dependency Validation:**
   - [ ] Each dependency has id, name, and reason (not just ID)
   - [ ] Reason explains WHY (30+ characters)

5. **Content Restriction Validation:**
   - [ ] NO technical_specifications section
   - [ ] NO validation_criteria section
   - [ ] NO risks_and_mitigations section
   - [ ] NO current_state section
   - [ ] Focus is product/value/JTBD, not implementation

If any checkbox is unchecked, DO NOT create the feature definition yet. Ask user for clarification.
```

### 3. Reference Instance Updates

**Update lawmatics and huma-blueprint instances:**

Add prominent header to each feature definition:

```yaml
# This feature definition follows EPF v2.0 enhanced schema
# - Exactly 4 personas with 3-paragraph narratives
# - Top-level scenarios (not embedded in contexts)
# - Required context fields: key_interactions, data_displayed
# - Rich dependencies with id/name/reason structure
# - No technical_specifications or implementation details
```

### 4. Schema Validation Tooling

**Create:** `/scripts/validate-feature-definition.mjs`

```javascript
/**
 * Enhanced validation beyond JSON Schema
 * Checks implicit patterns that JSON Schema can't express
 */

function validateEnhancedSchema(featureDefinition) {
  const errors = [];
  
  // 1. Persona count validation
  const personas = featureDefinition.definition.value_propositions;
  if (!personas || personas.length !== 4) {
    errors.push(`FAIL: Must have exactly 4 personas (found ${personas?.length || 0})`);
  }
  
  // 2. Persona narrative depth validation
  personas?.forEach((persona, i) => {
    if (!persona.current_situation || persona.current_situation.length < 200) {
      errors.push(`FAIL: Persona ${i+1} current_situation too short (need 200+ chars)`);
    }
    if (!persona.transformation_moment || persona.transformation_moment.length < 200) {
      errors.push(`FAIL: Persona ${i+1} transformation_moment too short (need 200+ chars)`);
    }
    if (!persona.emotional_resolution || persona.emotional_resolution.length < 200) {
      errors.push(`FAIL: Persona ${i+1} emotional_resolution too short (need 200+ chars)`);
    }
    // Check for character names (heuristic: contains "," after first word)
    if (!persona.current_situation.match(/^[A-Z][a-z]+,/)) {
      errors.push(`WARN: Persona ${i+1} should start with character name (e.g., "Sarah, a...")`);
    }
  });
  
  // 3. Scenario placement validation
  const scenarios = featureDefinition.implementation?.scenarios;
  if (!scenarios || scenarios.length === 0) {
    errors.push(`FAIL: Must have scenarios at top level of implementation section`);
  }
  
  // 4. Context required fields validation
  const contexts = featureDefinition.implementation?.contexts || [];
  contexts.forEach((ctx, i) => {
    if (!ctx.key_interactions || ctx.key_interactions.length === 0) {
      errors.push(`FAIL: Context ${i+1} missing required key_interactions array`);
    }
    if (!ctx.data_displayed || ctx.data_displayed.length === 0) {
      errors.push(`FAIL: Context ${i+1} missing required data_displayed array`);
    }
  });
  
  // 5. Dependency structure validation
  const deps = featureDefinition.dependencies;
  if (deps?.requires) {
    deps.requires.forEach((dep, i) => {
      if (typeof dep === 'string') {
        errors.push(`FAIL: Dependency requires[${i}] must be object with id/name/reason, not string`);
      } else if (!dep.reason || dep.reason.length < 30) {
        errors.push(`FAIL: Dependency requires[${i}] reason too short (need 30+ chars explaining WHY)`);
      }
    });
  }
  
  // 6. Content restriction validation
  const forbidden = ['technical_specifications', 'validation_criteria', 'risks_and_mitigations', 'current_state', 'testing_requirements'];
  forbidden.forEach(section => {
    if (featureDefinition[section]) {
      errors.push(`FAIL: Forbidden section '${section}' present (not allowed in EPF feature definitions)`);
    }
  });
  
  return errors;
}
```

## Implementation Roadmap

### Phase 1: Schema Update (Week 1)
1. Update `feature_definition_schema.json` with all enhancements
2. Update schema description with content restrictions
3. Test schema against emergent files (should all validate)

### Phase 2: Wizard Creation (Week 1)
1. Create `feature_definition.wizard.md` with step-by-step guidance
2. Include examples of good/bad patterns
3. Add validation checklist

### Phase 3: Agent Prompt Update (Week 1)
1. Update `product_architect.agent_prompt.md` with pre-creation checklist
2. Add explicit warnings about common mistakes
3. Include reference to emergent rework as learning example

### Phase 4: Validation Tooling (Week 2)
1. Create `validate-feature-definition.mjs` script
2. Add to CI/CD pipeline for pull requests
3. Add pre-commit hook for feature definition changes

### Phase 5: Reference Updates (Week 2)
1. Add schema version headers to lawmatics instances
2. Add schema version headers to huma-blueprint instances
3. Update instance README files with validation instructions

### Phase 6: Documentation (Week 2)
1. Update main EPF README with schema version info
2. Create migration guide for existing instances
3. Add this document to `/docs/schema_evolution/`

## Success Metrics

**Before Enhancement (Emergent Experience):**
- ❌ 9 files created incorrectly on first attempt
- ❌ Required 36 persona enrichments
- ❌ Required 42 scenario extractions
- ❌ Required 128 context enrichments
- ❌ Required removal of ~1,350 lines non-EPF content
- ❌ Total rework effort: ~8 hours

**After Enhancement (Target):**
- ✅ Feature definitions correct on first creation
- ✅ No persona enrichment needed (already have 4 with 3 paragraphs)
- ✅ No scenario extraction needed (already top-level)
- ✅ No context enrichment needed (already have required fields)
- ✅ No content removal needed (validation prevents forbidden sections)
- ✅ Rework effort: 0 hours

**Validation Strategy:**
1. Create 3 new test feature definitions using enhanced schema
2. Measure compliance rate (should be 100%)
3. Measure rework required (should be 0%)
4. User satisfaction survey (AI agents find guidance clear?)

## Conclusion

The emergent rework revealed that the current EPF schema is **underspecified** rather than **wrong**. The patterns that emerged through rework were **always implicit** in high-quality feature definitions—they just weren't **explicit** in the schema.

By codifying these implicit patterns into explicit constraints, we can ensure future feature definitions are "correct by construction" rather than "correct by rework".

**Key Principle:** Schema should encode **not just what's allowed**, but **what's required for quality**.

## Appendices

### Appendix A: Emergent Pattern Analysis

**Pattern 1: Exactly 4 Personas**
- fd-001: 2→4 personas
- fd-002: 3→4 personas
- fd-003: 3→4 personas
- fd-004: 2→4 personas
- fd-005: 3→4 personas
- fd-006: 2→4 personas
- fd-007: 3→4 personas
- fd-008: 3→4 personas
- fd-009: 3→4 personas
- **Conclusion:** 4 is the validated optimal count (not a range)

**Pattern 2: 3-Paragraph Structure**
- All 36 enriched personas follow: current_situation → transformation_moment → emotional_resolution
- Average paragraph length: 250-350 characters
- All include character names, metrics, concrete scenarios
- **Conclusion:** 3-paragraph structure with specific purposes is validated pattern

**Pattern 3: Top-Level Scenarios**
- All 42 scenarios extracted from contexts to top-level
- 0 scenarios left embedded in contexts
- All scenarios gained required fields: name, context, trigger
- **Conclusion:** Top-level placement is mandatory, not optional

### Appendix B: Validation Examples

**GOOD Persona Example:**
```yaml
- persona: "Data Analyst (Maya)"
  current_situation: |
    Maya, a data analyst at a healthcare analytics firm, spends 8 hours per week manually 
    building relationship queries across patient records, treatment protocols, and outcome data. 
    She must remember complex SQL joins, maintain 15+ saved query templates, and constantly 
    worry about missing critical connections that could reveal treatment patterns. When her VP 
    asks "which treatments are most effective for patients with comorbidity X?", she faces 3 
    hours of query construction, often discovering halfway through that she needs additional 
    data relationships she hadn't initially considered.
  transformation_moment: |
    The first time Maya asks "show me connections between treatment protocols and patient 
    outcomes for diabetes patients," the knowledge graph instantly visualizes 47 relationship 
    types she hadn't considered...
  emotional_resolution: |
    Six months later, Maya has become the analytics team's strategic advisor rather than 
    query builder...
```

**BAD Persona Example (Too Brief):**
```yaml
- persona: "Data Analyst"
  current_pain: "Hard to query relationships"
  value_delivered: "Graph makes it easy"
  emotional_outcome: "Less stressed"
```

**GOOD Scenario Example:**
```yaml
- id: scn-001
  name: "Upload and Process Document"
  actor: "Content Manager"
  context: "Document Upload Interface"
  trigger: "User clicks 'Upload Document' button"
  action: |
    User selects PDF file, enters metadata (title, category, tags), confirms upload. 
    System queues document for LLM processing, shows processing status with progress 
    bar and estimated completion time. User receives notification when processing 
    completes and can view extracted entities and relationships.
  outcome: "Document is chunked, embedded, and indexed in knowledge graph with 
    extracted entities and relationships ready for search and chat"
  acceptance_criteria:
    - "Given a valid PDF file, when user uploads with metadata, then system queues 
      for processing within 5 seconds"
    - "Given document in processing queue, when LLM completes extraction, then user 
      receives notification within 1 minute"
```

**BAD Scenario Example (Too Brief, Embedded in Context):**
```yaml
contexts:
  - id: ctx-001
    user_actions:
      - "Upload document and see it get processed"  # ❌ This is a full scenario, not atomic action
```

### Appendix C: Migration Guide for Existing Instances

**For instances created before schema v2.0:**

1. **Count Your Personas**
   - If < 4: Add personas to reach exactly 4
   - If > 4: Consolidate or split features
   
2. **Enrich Persona Narratives**
   - Replace current_pain → current_situation (200+ chars)
   - Replace value_delivered → transformation_moment (200+ chars)
   - Add emotional_resolution (200+ chars)
   - Add character names, metrics, concrete scenarios
   
3. **Extract Scenarios**
   - Move all scenarios from contexts.user_actions to top-level scenarios array
   - Add required fields: name, context, trigger
   - Ensure action and outcome are detailed (30+ chars)
   
4. **Enrich Contexts**
   - Add key_interactions array (what users DO)
   - Add data_displayed array (what users SEE)
   
5. **Enrich Dependencies**
   - Convert string IDs to objects with id/name/reason
   - Add 30+ character explanations for each dependency
   
6. **Remove Forbidden Content**
   - Delete technical_specifications section
   - Delete validation_criteria section
   - Delete risks_and_mitigations section
   - Delete current_state section

7. **Validate**
   - Run `node scripts/validate-feature-definition.mjs your-file.yaml`
   - Fix any errors
   - Commit with message: "feat: migrate to EPF schema v2.0"

## Related Resources

- **Schema**: [feature_definition_schema.json](../../../schemas/feature_definition_schema.json) - JSON Schema for feature definitions (current version)
- **Guide**: [EPF_SCHEMA_V2_QUALITY_SYSTEM.md](./EPF_SCHEMA_V2_QUALITY_SYSTEM.md) - Complete v2.0 quality system design
- **Template**: [feature_definition.yaml](../../../templates/FIRE/feature_definition.yaml) - Template implementing schema recommendations
- **Script**: [validate-feature-definition.mjs](../../../scripts/validate-feature-definition.mjs) - Validation script for quality enforcement
- **Wizard**: [feature_definition.wizard.md](../../../wizards/feature_definition.wizard.md) - Human-guided creation following v2.0 standards
