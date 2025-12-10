# LangFuse Extraction Evaluation System

This document describes the LangFuse-based evaluation system for measuring and improving extraction quality in the LangGraph extraction pipeline.

## Overview

The evaluation system enables systematic measurement of extraction quality by comparing extracted entities and relationships against human-annotated "golden" datasets. Results are tracked in LangFuse for experiment comparison and regression detection.

### Key Concepts

| Term               | Description                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| **Golden Dataset** | Human-annotated dataset items with expected entities and relationships |
| **Experiment**     | A run of the extraction pipeline against all items in a dataset        |
| **Scores**         | Metrics computed by comparing extracted vs expected output             |
| **Trace**          | LangFuse trace linking extraction run to dataset item                  |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        LangFuse Cloud                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │   Datasets   │  │    Traces    │  │   Experiment Runs    │   │
│  │  (golden)    │  │   (scored)   │  │   (aggregated)       │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ API
                              │
┌─────────────────────────────────────────────────────────────────┐
│                       Server Application                         │
│  ┌──────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │ LangfuseService  │  │  Evaluators    │  │  Experiment    │   │
│  │ (SDK wrapper)    │◄─┤ (scoring)      │◄─┤  Service       │   │
│  └──────────────────┘  └────────────────┘  └────────────────┘   │
│          │                     ▲                    ▲            │
│          │                     │                    │            │
│          ▼                     │                    │            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            LangGraph Extraction Provider                  │   │
│  │  (performs actual entity/relationship extraction)         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────────┐
│                        CLI Scripts                               │
│  ┌────────────────────────┐  ┌──────────────────────────────┐   │
│  │ seed-evaluation-dataset│  │ run-extraction-experiment    │   │
│  │ (creates golden data)  │  │ (runs & scores experiments)  │   │
│  └────────────────────────┘  └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Metrics

### Entity Metrics

| Metric               | Formula                | Description                             |
| -------------------- | ---------------------- | --------------------------------------- |
| **entity_precision** | matched / extracted    | How many extracted entities are correct |
| **entity_recall**    | matched / expected     | How many expected entities were found   |
| **entity_f1**        | 2 × (P × R) / (P + R)  | Harmonic mean of precision and recall   |
| **type_accuracy**    | correct_type / matched | How often entity types are correct      |

### Relationship Metrics

| Metric                     | Formula               | Description                                  |
| -------------------------- | --------------------- | -------------------------------------------- |
| **relationship_precision** | matched / extracted   | How many extracted relationships are correct |
| **relationship_recall**    | matched / expected    | How many expected relationships were found   |
| **relationship_f1**        | 2 × (P × R) / (P + R) | Harmonic mean of precision and recall        |

### Overall Quality

| Metric              | Formula                                 | Description          |
| ------------------- | --------------------------------------- | -------------------- |
| **overall_quality** | 0.6 × entity_f1 + 0.4 × relationship_f1 | Weighted combination |

## Matching Algorithm

### Entity Matching

Entities are matched using fuzzy string matching:

1. **Normalize names**: lowercase, trim whitespace
2. **Compute Levenshtein similarity**: 1 - (edit_distance / max_length)
3. **Match if similarity ≥ 0.85** (configurable threshold)
4. **Greedy matching**: Best matches first, no duplicate assignments

```typescript
// Example: "Ruth" matches "ruth" (1.0), "Naomi" matches "naomi" (1.0)
// "Boaz" matches "Boaz the Kinsman" (0.5) - NO MATCH (below threshold)
```

### Relationship Matching

Relationships are matched using normalized string comparison:

1. **Format**: `source_name--relationship_type-->target_name`
2. **Normalize**: lowercase all components
3. **Exact match required** on formatted string

```typescript
// Expected: "ruth--married_to-->boaz"
// Extracted: "Ruth--MARRIED_TO-->Boaz" → normalized: "ruth--married_to-->boaz" ✓
```

## Dataset Schema

Dataset items must conform to the JSON Schema at:
`apps/server/src/modules/extraction-jobs/evaluation/schemas/extraction-dataset.schema.json`

### Input Structure

```typescript
interface ExtractionDatasetInput {
  document_text: string; // Text to extract from
  document_type?: string; // Optional type hint
  object_schemas: Record<string, unknown>; // Entity type definitions
  relationship_schemas?: Record<string, unknown>; // Relationship definitions
  allowed_types?: string[]; // Optional type filter
  available_tags?: string[]; // Optional tag list
}
```

### Expected Output Structure

```typescript
interface ExtractionExpectedOutput {
  entities: Array<{
    name: string; // Human-readable name
    type: string; // Entity type (e.g., "Person")
    description?: string; // Optional description
    properties?: Record<string, unknown>; // Additional properties
  }>;
  relationships: Array<{
    source_name: string; // Source entity name
    target_name: string; // Target entity name
    relationship_type: string; // Relationship type
    description?: string; // Optional description
  }>;
}
```

### Metadata (Optional)

```typescript
interface ExtractionDatasetMetadata {
  source_trace_id?: string; // If from real extraction
  document_category?: 'narrative' | 'legal' | 'technical' | 'other';
  difficulty?: 'easy' | 'medium' | 'hard';
  notes?: string; // Human notes
  tags?: string[]; // Filtering tags
}
```

## Usage

### 1. Seed a Golden Dataset

Use the CLI script to create a dataset in LangFuse:

```bash
# Set environment variables
export LANGFUSE_PUBLIC_KEY=pk-lf-xxx
export LANGFUSE_SECRET_KEY=sk-lf-xxx
export LANGFUSE_HOST=https://cloud.langfuse.com

# Run the seed script
npx tsx scripts/seed-extraction-evaluation-dataset.ts
```

This creates the `extraction-evaluation-ruth-v1` dataset with 5 annotated examples from the Book of Ruth.

### 2. Run an Experiment

```bash
npx tsx scripts/run-extraction-experiment.ts \
  --dataset extraction-evaluation-ruth-v1 \
  --name "baseline-gpt4o-v1"
```

### 3. View Results in LangFuse

1. Go to LangFuse Dashboard → Datasets
2. Select `extraction-evaluation-ruth-v1`
3. Click on experiment runs to see:
   - Per-item scores
   - Aggregated metrics
   - Trace details with timing

### 4. Validate Dataset Items

Before uploading custom dataset items, validate against the JSON schema:

```typescript
import Ajv from 'ajv';
import { extractionDatasetSchema } from '@server/modules/extraction-jobs/evaluation';

const ajv = new Ajv();
const validate = ajv.compile(extractionDatasetSchema);

const item = {
  input: {
    document_text: 'John works at Acme Corp in New York.',
    object_schemas: {
      Person: { name: 'Person', description: 'A human being' },
      Organization: { name: 'Organization', description: 'A company' },
      Location: { name: 'Location', description: 'A place' },
    },
  },
  expected_output: {
    entities: [
      { name: 'John', type: 'Person' },
      { name: 'Acme Corp', type: 'Organization' },
      { name: 'New York', type: 'Location' },
    ],
    relationships: [
      {
        source_name: 'John',
        target_name: 'Acme Corp',
        relationship_type: 'WORKS_AT',
      },
      {
        source_name: 'Acme Corp',
        target_name: 'New York',
        relationship_type: 'LOCATED_IN',
      },
    ],
  },
  metadata: {
    difficulty: 'easy',
    document_category: 'other',
    notes: 'Simple corporate relationship example',
  },
};

if (!validate(item)) {
  console.error('Validation errors:', validate.errors);
} else {
  console.log('Item is valid!');
}
```

## File Locations

| File                                                                                        | Description                   |
| ------------------------------------------------------------------------------------------- | ----------------------------- |
| `apps/server/src/modules/extraction-jobs/evaluation/types.ts`                               | TypeScript type definitions   |
| `apps/server/src/modules/extraction-jobs/evaluation/evaluators.ts`                          | Scoring functions             |
| `apps/server/src/modules/extraction-jobs/evaluation/extraction-experiment.service.ts`       | NestJS experiment service     |
| `apps/server/src/modules/extraction-jobs/evaluation/schemas/extraction-dataset.schema.json` | JSON Schema for validation    |
| `apps/server/src/modules/langfuse/langfuse.service.ts`                                      | LangFuse SDK wrapper          |
| `scripts/seed-extraction-evaluation-dataset.ts`                                             | Golden dataset seeding script |
| `scripts/run-extraction-experiment.ts`                                                      | Experiment runner script      |
| `apps/server/tests/unit/extraction-jobs/evaluation/evaluators.spec.ts`                      | Unit tests for evaluators     |

## Configuration

### Environment Variables

| Variable              | Description                                     | Required |
| --------------------- | ----------------------------------------------- | -------- |
| `LANGFUSE_PUBLIC_KEY` | LangFuse public API key                         | Yes      |
| `LANGFUSE_SECRET_KEY` | LangFuse secret API key                         | Yes      |
| `LANGFUSE_HOST`       | LangFuse API host (default: cloud.langfuse.com) | No       |

### Tuning Parameters

| Parameter            | Default | Location                                     |
| -------------------- | ------- | -------------------------------------------- |
| Similarity threshold | 0.85    | `evaluators.ts:DEFAULT_SIMILARITY_THRESHOLD` |
| Entity weight        | 0.6     | `evaluators.ts:evaluateExtraction()`         |
| Relationship weight  | 0.4     | `evaluators.ts:evaluateExtraction()`         |

## Best Practices

### Creating Golden Datasets

1. **Start small**: Begin with 10-20 diverse examples
2. **Cover edge cases**: Include varying difficulty levels
3. **Use consistent naming**: Maintain consistent entity naming across items
4. **Document decisions**: Use metadata.notes for annotation rationale
5. **Version datasets**: Include version in dataset name (e.g., `v1`, `v2`)

### Running Experiments

1. **Name experiments descriptively**: Include model, prompt version, date
2. **Compare incrementally**: Change one variable at a time
3. **Track regressions**: Set up alerts for score drops
4. **Archive old experiments**: Keep history for reference

### Interpreting Results

| Score Range | Interpretation                         |
| ----------- | -------------------------------------- |
| 0.9 - 1.0   | Excellent - production ready           |
| 0.7 - 0.9   | Good - minor improvements needed       |
| 0.5 - 0.7   | Fair - significant improvements needed |
| < 0.5       | Poor - major issues to address         |

## Troubleshooting

### Common Issues

**LangFuse connection fails**

- Verify `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set
- Check network connectivity to LangFuse host
- Ensure API keys have correct permissions

**Low recall scores**

- Check if entity names in expected output match document text
- Verify entity types are in `allowed_types` if specified
- Review extraction prompts for coverage

**Low precision scores**

- Review extraction prompts for over-extraction
- Consider adding more specific type constraints
- Check for duplicate entity extraction

**Type accuracy issues**

- Verify object_schemas include all expected types
- Check type name consistency (case-sensitive matching)
- Review LLM prompt instructions for type assignment

## Future Enhancements

- [ ] Partial relationship matching (fuzzy relationship types)
- [ ] Property-level comparison for entities
- [ ] Automated dataset generation from production traces
- [ ] A/B testing integration for prompt variants
- [ ] Real-time monitoring dashboards
