# Proposal: Improve epf-cli Feedback for AI Agents

## Problem Statement

AI agents (like OpenCode/Claude) struggle to efficiently fix EPF validation errors because:

1. **Error output is overwhelming and unstructured** - 50+ errors dumped at once with no grouping
2. **Errors lack field paths** - "expected object, but got string" doesn't say _which_ field
3. **No fix prioritization** - Critical blockers mixed with minor issues
4. **Templates/examples are invisible** - Exist but never surfaced to agents
5. **No actionable fix plans** - Agents must mentally diff schema vs content

## Current Pain Points (Real Session)

From attempting to fix `veilag/READY/01_insight_analyses.yaml`:

```
❌ Schema Validation: 9/11 files valid
    • /Users/.../01_insight_analyses.yaml
      - expected object, but got string    <- Which field?
      - expected object, but got string    <- Where?
      - expected object, but got string    <- 50 more of these...
      - value must be one of "high", "medium", "low"   <- What field uses this enum?
      - length must be >= 30, but got 6    <- Which string is too short?
```

The agent had to:

1. Run `epf-cli schemas show insight_analyses` (500+ lines of output)
2. Manually correlate errors with schema fields
3. Create a 13-item todo list just to track what to fix
4. Fix one field, run health check again, repeat

## Proposed Solution

### 1. Structured Error Output with Field Paths

**New command: `epf-cli validate --ai-friendly`**

```yaml
# Output format optimized for AI consumption
file: READY/01_insight_analyses.yaml
artifact_type: insight_analyses
total_errors: 47
grouped_errors:
  - section: key_insights
    errors:
      - field: key_insights[0]
        error: 'expected object, but got string'
        expected_structure:
          insight: string (min 50 chars)
          strategic_implication: string (min 50 chars)
          supporting_trends: array<string> (min 2 items)
        current_value: 'AI-driven development makes...'
        fix_action: 'Convert string to object with insight, strategic_implication, supporting_trends fields'

  - section: market_definition.tam
    errors:
      - field: market_definition.tam
        error: 'expected object, but got string'
        expected_structure:
          size: string (min 10 chars)
          calculation_method: string (min 30 chars)
        current_value: '60,000-100,000 road usage...'
        fix_action: 'Convert to object with size and calculation_method fields'
```

### 2. Fix Plan Generation

**New command: `epf-cli validate --fix-plan`**

Outputs a prioritized, chunked fix plan:

```yaml
fix_plan:
  file: READY/01_insight_analyses.yaml
  total_fixes: 12
  estimated_chunks: 3 # For context management

  chunks:
    - chunk: 1
      description: 'Fix type mismatches in top-level fields'
      priority: critical
      fixes:
        - section: key_insights
          current_type: array<string>
          required_type: array<object>
          example_from_template: |
            key_insights:
              - insight: "Synthesized observation..."
                strategic_implication: "What this means for strategy..."
                supporting_trends:
                  - "Technology trend name"
                  - "User behavior trend name"

        - section: market_definition
          fields: [tam, sam, som]
          current_type: string
          required_type: object

    - chunk: 2
      description: 'Fix enum values and constraints'
      priority: high
      fixes:
        - field: target_users[0].problems[0].severity
          current: 'major'
          allowed: ['critical', 'high', 'medium', 'low']
          suggestion: 'high'

    - chunk: 3
      description: 'Fix string length constraints'
      priority: medium
      fixes:
        - field: direct_competitors[0].strengths[0]
          current_length: 6
          min_required: 30
          current_value: 'N/A - no direct...'
          action: 'Expand to at least 30 characters'
```

### 3. Example Injection from Templates

**Enhanced `epf-cli schemas show --with-examples`**

```bash
$ epf-cli schemas show insight_analyses --path key_insights --with-examples
```

```yaml
# Field: key_insights
type: array<object>
required: false
constraints:
  min_items: none
  max_items: none

item_structure:
  insight: string [required]
    min_length: 50
    max_length: 500
  strategic_implication: string [required]
    min_length: 50
    max_length: 400
  supporting_trends: array<string> [required]
    min_items: 2
    max_items: 6

# Example from template:
example: |
  key_insights:
    - insight: "AI-driven development makes previously uneconomical niche markets viable - a single developer can build platforms that required full teams"
      strategic_implication: "We can enter this market profitably where traditional economics would not support investment"
      supporting_trends:
        - "AI-driven coding enables rapid development"
        - "No direct competitors in this space"

# From your current file (line 92-96):
current: |
  key_insights:
    - "AI-driven development makes..."   # <- This is just a string, needs to be object
```

### 4. Section-by-Section Validation

**New command: `epf-cli validate --section <path>`**

Validate only a specific section to enable incremental fixing:

```bash
$ epf-cli validate READY/01_insight_analyses.yaml --section key_insights
$ epf-cli validate READY/01_insight_analyses.yaml --section market_definition.tam
```

### 5. Template Diffing

**New command: `epf-cli diff --template`**

Show structural differences between file and template:

```bash
$ epf-cli diff READY/01_insight_analyses.yaml --template
```

```diff
key_insights:
-  - "String value"                    # Current (wrong)
+  - insight: "..."                    # Template (correct)
+    strategic_implication: "..."
+    supporting_trends: [...]

market_definition:
   tam:
-    "60,000-100,000 associations"     # Current (string)
+    size: "..."                        # Template (object)
+    calculation_method: "..."
```

## Implementation Plan

### Phase 1: Structured Error Output

1. Enhance `extractValidationErrors` to include JSON path
2. Add `--ai-friendly` flag to `validate` command
3. Group errors by section
4. Include expected structure from schema

### Phase 2: Fix Plan Generation

1. Analyze errors and group into logical chunks
2. Prioritize by error type (type mismatch > enum > length)
3. Generate actionable fix descriptions
4. Include examples from templates

### Phase 3: Template Integration

1. Add `--with-examples` flag to `schemas show`
2. Implement `diff --template` command
3. Surface template content alongside schema

### Phase 4: Incremental Validation

1. Add `--section` flag to validate command
2. Support partial re-validation after fixes

## Success Criteria

1. AI agent can fix a failing EPF file in 2-3 iterations instead of 10+
2. No need to manually correlate errors with schema
3. Fix plans are chunked appropriately for context management
4. Templates/examples are automatically surfaced when relevant

## Alternatives Considered

1. **Auto-fix everything** - Too risky, content decisions need human/AI judgment
2. **Interactive wizard** - Doesn't work for batch AI workflows
3. **GUI editor** - Outside epf-cli scope, could complement later

## Dependencies

- Existing `validate` command
- Template loader (already exists)
- Schema loader (already exists)
