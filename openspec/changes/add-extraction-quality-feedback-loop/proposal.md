# Add Extraction Quality Feedback Loop

## Summary

Create a feedback loop where human-verified extractions are exported to Vertex AI for Gemini fine-tuning, continuously improving extraction quality over time.

## Problem Statement

The current extraction system:

1. Uses LangChain with Gemini for entity and relationship extraction
2. Has a human review workflow for low-confidence extractions
3. Accumulates verified corrections in the database
4. **Discards this valuable training signal** - corrections don't improve future extractions

Each human correction represents labeled training data that could teach the model:

- Domain-specific entity types (architecture components, capabilities, etc.)
- Relationship patterns unique to enterprise architecture
- What corrections humans commonly make

## Scope

This proposal covers:

1. JSONL export format compatible with Vertex AI supervised fine-tuning
2. Training data export service with filtering options (project, organization, or global scope)
3. Cloud Storage integration for dataset upload
4. Quality metrics for training data selection
5. Vertex AI fine-tuning job automation (general and project-specific models)
6. Model registry integration for storing and selecting fine-tuned models

Out of scope (follow-up proposals):

- A/B testing between base and fine-tuned models
- Continuous fine-tuning pipeline with automated triggers

## Solution Overview

### Multi-Layer Training Architecture

The system supports a two-tier training approach:

1. **General Model (Organization-wide):**

   - Trained on verified extractions across all projects in an organization
   - Learns common enterprise architecture patterns, entity types, and relationships
   - Provides improved baseline for all new projects
   - Updated periodically as more verified data accumulates

2. **Project-Specific Model (Optional layer):**
   - Fine-tuned on top of the general model using project-specific verified data
   - Learns domain-specific terminology, custom entity types, unique relationship patterns
   - Only triggered when project has sufficient verified examples (e.g., 100+)
   - Stored in Vertex AI Model Registry with project association

```
┌─────────────────┐
│  Base Gemini    │  (Google's pre-trained model)
└────────┬────────┘
         │ Fine-tune on ALL org verified data
         ▼
┌─────────────────┐
│  General Model  │  (Shared across org, stored in Model Registry)
└────────┬────────┘
         │ Fine-tune on project-specific data
         ▼
┌─────────────────┐
│  Project Model  │  (Per-project, inherits from General)
└─────────────────┘
```

**Model Selection at Extraction Time:**

1. If project has custom fine-tuned model → use project model
2. Else if organization has general model → use general model
3. Else → use base Gemini

### Training Data Format

Vertex AI expects JSONL with conversation structure:

```jsonl
{
  "systemInstruction": {
    "parts": [
      {
        "text": "..."
      }
    ]
  },
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "..."
        }
      ]
    },
    {
      "role": "model",
      "parts": [
        {
          "text": "..."
        }
      ]
    }
  ]
}
```

Each training example will contain:

- **System instruction:** The extraction system prompt with entity type definitions
- **User content:** Document chunk text (the input)
- **Model content:** Verified extraction result as JSON (entities + relationships)

### Data Selection Criteria

Training data includes extractions where:

1. `status = 'accepted'` (verified by human or auto-accepted with high confidence)
2. `reviewed_by IS NOT NULL` (explicitly reviewed) OR `extraction_confidence >= 0.85` (high confidence auto-accept)
3. Entity has meaningful properties (not empty/minimal)
4. Relationships reference valid entities

### Export Pipeline

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Graph Objects  │────▶│  Export Service  │────▶│  JSONL File     │
│  (verified)     │     │  - Format        │     │  (local/GCS)    │
│                 │     │  - Filter        │     │                 │
│  Relationships  │     │  - Validate      │     └─────────────────┘
│  (verified)     │     │                  │              │
│                 │     │  Source Chunks   │              ▼
│  Document       │     │  - Reconstruct   │     ┌─────────────────┐
│  Chunks         │────▶│    input         │     │  Vertex AI      │
└─────────────────┘     └──────────────────┘     │  Dataset        │
                                                 └─────────────────┘
```

## Benefits

1. **Quality Improvement Loop:** Each human correction improves future extractions
2. **Domain Adaptation:** Model learns architecture-specific entity types
3. **Relationship Learning:** Fine-tuned Gemini learns your specific relationship patterns
4. **Cost Efficiency:** Better model = fewer review cycles needed
5. **Incremental Learning:** New corrections continuously improve dataset
6. **Shared Improvements:** General model improvements benefit all projects
7. **Project Specialization:** Project-specific models learn unique domain terminology

## Risks and Mitigations

| Risk                                | Mitigation                                                     |
| ----------------------------------- | -------------------------------------------------------------- |
| Low volume of verified data         | Start with high-confidence auto-accepts + reviewed             |
| Inconsistent human annotations      | Include annotation guidelines in training                      |
| Model drift from corrections        | Version datasets, track fine-tuning experiments                |
| Training data leakage               | Ensure test sets are held out from training                    |
| Project model overfitting           | Require minimum 100 examples before project-specific training  |
| Model version management complexity | Store model metadata (parent, training date) in Model Registry |
| Cost of multiple fine-tuned models  | Only create project models when threshold met                  |

## Success Metrics

- Export at least 100 verified extraction examples per project
- Training data passes Vertex AI validation
- General fine-tuned model shows measurable improvement on held-out test set
- Project-specific models show additional improvement on project-specific test data
- Reduced `needs_review` rate on new extractions
- Model selection correctly prioritizes project → general → base

## Dependencies

- Verified extractions in database (already exists)
- GCP service account with Storage and Vertex AI permissions
- Extraction job linkage to source chunks (already exists)
- Vertex AI Model Registry access for storing fine-tuned models

## Prerequisites

### Soft Delete for Chunks

**Problem:** Training data is constructed by tracing from verified `GraphObject` → `ObjectExtractionJob` → `Chunk`. Currently, chunks are **hard deleted** when documents are re-processed, breaking this chain and losing training data.

**Solution:** Add soft delete to the `kb.chunks` table:

```sql
ALTER TABLE kb.chunks ADD COLUMN deleted_at TIMESTAMPTZ;
```

**Why this matters:**

1. User reviews happen at the **object level** (GraphObject)
2. Training data must reconstruct the original input (chunk text)
3. If chunk is deleted, we lose the ability to create training examples
4. Soft delete preserves chunks for training while hiding them from normal queries

**Data flow preserved:**

```
GraphObject (verified by user)
    ↓ extraction_job_id
ObjectExtractionJob
    ↓ chunk_id
Chunk (soft deleted but still accessible)
    ↓ text
Training Example Input ✓
```

This migration must be completed before training data export can work reliably.

## References

- [Vertex AI Supervised Fine-Tuning](https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-supervised-tuning)
- [Training Data Format](https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-supervised-tuning-prepare)
- [Model Registry](https://cloud.google.com/vertex-ai/docs/model-registry/introduction)
- Current extraction system: `apps/server/src/modules/extraction-jobs/`
