# Schema-Validator Alignment Proposal

## Current State Analysis

### Schema Says (feature_definition_schema.json)
- **Personas field**: NOT in required array for `definition` section
- **Persona count**: `minItems: 4, maxItems: 4` constraint on `value_propositions` array
- **Narrative fields**: `minLength: 200` on current_situation, transformation_moment, emotional_resolution
- **Field names**: Uses `value_propositions` array with `persona` field inside each item

### Validator Says (validate-feature-quality.sh)
- **Personas field**: Checks `.definition.personas` (different field name!)
- **Persona count**: Enforces "exactly 4 personas" with error message "required by schema v2.0"
- **Narrative fields**: Checks `current_situation`, `transformation_moment`, `emotional_resolution` ≥200 chars
- **Field names**: Expects `personas` array with `name` field inside each persona

### Critical Discrepancies

1. **Field Name Mismatch**: Schema uses `value_propositions` but validator checks `personas`
2. **Structure Mismatch**: Schema uses `persona` (singular) field inside items, validator expects `name` field
3. **Requirement Mismatch**: Schema doesn't require personas/value_propositions, but validator enforces as required
4. **Documentation Mismatch**: Schema describes rich 3-paragraph narratives but field is named "value_propositions"

## Root Cause

The schema was written to describe "value propositions" as the primary artifact (business value focus), but evolved to use "personas" terminology during implementation (user-centric focus). The validator was updated to use `personas` field, but the schema was never synchronized.

## Recommendation: YES, Update Schema

**Why Update Schema Instead of Validator:**

1. **Terminology Clarity**: "Personas" is clearer than "value_propositions" for user-centric narratives
2. **Current Practice**: All 7 files now use `personas` field successfully
3. **Tool Consistency**: Implementation tools expect `personas` field based on validator
4. **Semantic Accuracy**: These are persona narratives with value props embedded, not standalone value propositions

## Proposed Schema Changes

### Change 1: Rename Field from value_propositions to personas

**Current (lines ~162-200):**
```json
"value_propositions": {
  "type": "array",
  "minItems": 4,
  "maxItems": 4,
  "items": {
    "type": "object",
    "required": ["persona", "current_situation", ...],
    "properties": {
      "persona": {
        "type": "string",
        "description": "The user persona this narrative describes..."
```

**Proposed:**
```json
"personas": {
  "type": "array",
  "minItems": 4,
  "maxItems": 4,
  "items": {
    "type": "object",
    "required": ["id", "name", "role", "description", "goals", "pain_points", "usage_context", "technical_proficiency", "current_situation", "transformation_moment", "emotional_resolution"],
    "properties": {
      "id": {
        "type": "string",
        "pattern": "^[a-z]+(-[a-z]+)*$",
        "description": "Unique identifier for the persona (kebab-case)",
        "examples": ["power-user", "business-user", "administrator", "new-user"]
      },
      "name": {
        "type": "string",
        "description": "Persona name/title (e.g., 'Power User', 'Business User')",
        "examples": ["Power User", "Business User", "Administrator", "New User"]
      },
      "role": {
        "type": "string",
        "description": "Primary role or job function of this persona",
        "examples": ["Advanced user requiring comprehensive control", "Daily workflow user", "System administrator"]
      },
      "description": {
        "type": "string",
        "minLength": 50,
        "description": "Detailed persona description explaining who they are and their context"
      },
      "goals": {
        "type": "array",
        "items": { "type": "string" },
        "minItems": 3,
        "description": "Key goals this persona wants to achieve (array of 3+ items)"
      },
      "pain_points": {
        "type": "array",
        "items": { "type": "string" },
        "minItems": 3,
        "description": "Key pain points this persona experiences (array of 3+ items)"
      },
      "usage_context": {
        "type": "string",
        "description": "How and when this persona uses the feature"
      },
      "technical_proficiency": {
        "type": "string",
        "enum": ["basic", "intermediate", "advanced"],
        "description": "Technical skill level of this persona"
      },
      "current_situation": {
        "type": "string",
        "minLength": 200,
        "description": "Rich narrative paragraph (200+ chars) describing current frustrations and challenges"
      },
      "transformation_moment": {
        "type": "string",
        "minLength": 200,
        "description": "Rich narrative paragraph (200+ chars) describing the breakthrough moment"
      },
      "emotional_resolution": {
        "type": "string",
        "minLength": 200,
        "description": "Rich narrative paragraph (200+ chars) describing lasting positive impact"
      }
    }
  },
  "description": "Exactly 4 persona profiles with complete attributes and rich narratives showing transformation from pain to value.",
  "$comment": "Personas capture user archetypes who will use this feature. Each persona includes: (1) Identity attributes (id, name, role, description), (2) Motivations (goals, pain_points), (3) Context (usage_context, technical_proficiency), (4) Value narratives (current_situation, transformation_moment, emotional_resolution). The 3-paragraph narrative structure shows the full journey: pain → breakthrough → lasting impact. Exactly 4 personas required to ensure diverse perspective consideration. Tools consume personas for: UX design (empathy mapping), documentation (audience-specific), testing (user scenarios), sales (positioning)."
}
```

### Change 2: Add personas to required array

**Current (line ~103):**
```json
"required": ["job_to_be_done", "solution_approach", "capabilities"]
```

**Proposed:**
```json
"required": ["job_to_be_done", "solution_approach", "capabilities", "personas"]
```

### Change 3: Update description (line ~6)

**Current:**
```json
"description": "Schema for validating feature definition files... Version 2.0: Enhanced with prescriptive quality constraints (exactly 4 personas, 3-paragraph narratives, top-level scenarios...)"
```

Keep as-is (already mentions personas correctly).

### Change 4: Update $comment (line ~7)

**Current:**
```json
"$comment": "This schema validates YAML feature definition files... They capture WHAT users need (job-to-be-done), WHY it matters (value propositions)..."
```

**Proposed:**
```json
"$comment": "This schema validates YAML feature definition files... They capture WHAT users need (job-to-be-done), WHY it matters (persona value narratives), HOW it works (capabilities, scenarios)..."
```

## Benefits of Alignment

1. **Single Source of Truth**: Schema becomes authoritative, validator implements schema
2. **Tool Interoperability**: All tools can use same field names and structure
3. **Validation Accuracy**: Schema validation tools (yq, jsonschema) will catch errors
4. **Documentation Clarity**: Field names match their semantic purpose (personas, not value props)
5. **Future-Proofing**: New persona attributes can be added to schema, validator auto-enforces
6. **Type Safety**: Generated TypeScript types will be correct

## Implementation Plan

1. **Update Schema**: Apply changes above to `schemas/feature_definition_schema.json`
2. **Validate Files**: Run `yq` validation against new schema on all 7 files
3. **Test Validator**: Confirm validator still passes all 7 files
4. **Update Documentation**: Update any docs referencing `value_propositions` to use `personas`
5. **Version Bump**: Consider bumping schema to v2.1.0 (breaking change in field names)

## Migration Impact

**Impact on Existing Files**: ✅ ZERO - All 7 files already use `personas` field with correct structure

**Impact on Tools**: ✅ MINIMAL - Validator already uses `personas`, schema catching up

**Impact on Documentation**: ⚠️ MODERATE - Need to update any references to `value_propositions`

## Decision

**Recommendation**: Proceed with schema update. The discrepancy creates confusion and blocks schema-based validation tools. All files already comply with proposed schema, so risk is minimal.

**Alternative (Not Recommended)**: Update validator to match schema (use `value_propositions`). This would require:
- Renaming `personas` → `value_propositions` in all 7 files
- Renaming `name` → `persona` in all 28 personas (7 files × 4 personas)
- Less semantic clarity (these ARE personas with value narratives, not standalone value props)

---

Generated: 2025-12-27
Status: Awaiting approval
