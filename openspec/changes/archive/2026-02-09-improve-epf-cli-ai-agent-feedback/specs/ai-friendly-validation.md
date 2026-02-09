# Spec: AI-Friendly Validation Output

## Overview

Enhance `epf-cli validate` to output structured, actionable error information that AI agents can efficiently process and act upon.

## Command Interface

```bash
# New flags
epf-cli validate <path> --ai-friendly    # YAML output optimized for AI
epf-cli validate <path> --fix-plan       # Generate prioritized fix plan
epf-cli validate <path> --section <path> # Validate specific section only

# Combinations
epf-cli validate file.yaml --ai-friendly --fix-plan  # Both
```

## Output Schema: `--ai-friendly`

```yaml
# ai_friendly_validation_result.yaml
file: string # Relative path to file
artifact_type: string # e.g., "insight_analyses"
schema_version: string # Schema version used
valid: boolean
error_count: integer
errors_by_section:
  - section: string # Top-level field name (e.g., "key_insights")
    error_count: integer
    errors:
      - path: string # Full JSON path (e.g., "key_insights[0]")
        line: integer # Line number in YAML (if determinable)
        error_type: enum # type_mismatch | missing_required | invalid_enum | constraint_violation | unknown_field
        message: string # Human-readable error message
        details:
          expected_type: string # For type_mismatch
          actual_type: string # For type_mismatch
          expected_structure: # For type_mismatch with objects
            field_name:
              type: string
              required: boolean
              constraints: object
          allowed_values: array # For invalid_enum
          constraint: string # For constraint_violation (e.g., "minLength: 30")
          current_value: any # The actual value that failed
        fix_hint: string # Actionable suggestion
```

## Output Schema: `--fix-plan`

```yaml
# fix_plan.yaml
file: string
artifact_type: string
total_errors: integer
total_chunks: integer
estimated_tokens_per_chunk: integer # For context management

chunks:
  - chunk_number: integer
    priority: enum # critical | high | medium | low
    description: string # What this chunk fixes
    estimated_lines_changed: integer
    errors:
      - path: string
        error_type: string
        fix_action: string # Specific action to take
        example_from_template: string # YAML snippet from template (if available)
        current_value: any # What's there now

recommended_fix_order:
  - chunk_number: integer
    reason: string # Why this order
```

## Error Type Classification

| Error Type             | Priority | Description              | Example                                  |
| ---------------------- | -------- | ------------------------ | ---------------------------------------- |
| `type_mismatch`        | critical | Wrong YAML type          | `expected object, got string`            |
| `missing_required`     | critical | Required field absent    | `missing properties: 'insight'`          |
| `invalid_enum`         | high     | Value not in allowed set | `must be one of "high", "medium", "low"` |
| `constraint_violation` | medium   | Length/count limits      | `length must be >= 30`                   |
| `unknown_field`        | low      | Field not in schema      | `additionalProperties not allowed`       |

## Implementation Details

### 1. Parsing JSON Path from Errors

The jsonschema library provides `InstanceLocation` which is a JSON pointer:

```go
// Current: err.InstanceLocation = "/key_insights/0"
// Need to convert to: "key_insights[0]"

func formatPath(jsonPointer string) string {
    // Convert /foo/0/bar to foo[0].bar
}
```

### 2. Determining Error Type

```go
func classifyError(message string) ErrorType {
    switch {
    case strings.Contains(message, "expected") && strings.Contains(message, "but got"):
        return TypeMismatch
    case strings.Contains(message, "missing properties"):
        return MissingRequired
    case strings.Contains(message, "must be one of"):
        return InvalidEnum
    case strings.Contains(message, "length must be"):
        return ConstraintViolation
    case strings.Contains(message, "additionalProperties"):
        return UnknownField
    default:
        return Unknown
    }
}
```

### 3. Extracting Expected Structure

For type mismatches, look up the schema for that path:

```go
func getExpectedStructure(schema *jsonschema.Schema, path string) map[string]FieldInfo {
    // Navigate schema to the failing path
    // Extract properties with types and constraints
}
```

### 4. Chunking Strategy

```go
func generateChunks(errors []EnhancedError) []Chunk {
    // Group by section first
    // Within section, group by error type
    // Target ~5-10 errors per chunk
    // Critical errors in earlier chunks
}
```

## Example Usage Scenario

### Before (Current Output)

```
❌ Schema Validation: 9/11 files valid
    • READY/01_insight_analyses.yaml
      - expected object, but got string
      - expected object, but got string
      - value must be one of "high", "medium", "low"
      ...47 more errors...
```

### After (AI-Friendly Output)

```yaml
file: READY/01_insight_analyses.yaml
artifact_type: insight_analyses
valid: false
error_count: 50
errors_by_section:
  - section: key_insights
    error_count: 4
    errors:
      - path: key_insights[0]
        error_type: type_mismatch
        message: "Expected object with insight, strategic_implication, supporting_trends fields"
        details:
          expected_type: object
          actual_type: string
          expected_structure:
            insight:
              type: string
              required: true
              constraints: {minLength: 50, maxLength: 500}
            strategic_implication:
              type: string
              required: true
              constraints: {minLength: 50, maxLength: 400}
            supporting_trends:
              type: array
              required: true
              constraints: {minItems: 2, maxItems: 6}
          current_value: "AI-driven development makes previously uneconomical..."
        fix_hint: "Convert string to object with three required fields"

  - section: market_definition
    error_count: 3
    errors:
      - path: market_definition.tam
        error_type: type_mismatch
        ...
```

### Fix Plan Output

```yaml
file: READY/01_insight_analyses.yaml
total_errors: 50
total_chunks: 4

chunks:
  - chunk_number: 1
    priority: critical
    description: "Fix type mismatches - convert strings to objects"
    errors:
      - path: key_insights
        fix_action: "Change array of strings to array of objects"
        example_from_template: |
          key_insights:
            - insight: "Synthesized observation from trend analysis..."
              strategic_implication: "What this means for our strategy..."
              supporting_trends:
                - "Technology trend"
                - "Market trend"

  - chunk_number: 2
    priority: critical
    description: "Fix market_definition structure"
    ...

recommended_fix_order:
  - chunk_number: 1
    reason: "key_insights is a top-level section; fixing its structure may resolve dependent errors"
  - chunk_number: 2
    reason: "market_definition is another top-level section with multiple nested type mismatches"
```

## Success Metrics

1. AI agent can parse output without additional processing
2. Fix plan chunks are appropriately sized (~5-10 errors)
3. Critical errors are surfaced first
4. Template examples are included where relevant
5. Agent can fix file in 2-3 iterations instead of 10+

## Test Cases

1. File with all error types present
2. File with only type mismatches
3. File with deeply nested errors
4. File that's mostly valid (1-2 errors)
5. Completely invalid file (100+ errors)
