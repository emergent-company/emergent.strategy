# Design: LangFuse Evaluation for LangGraph Extractions

## Context

The Emergent platform uses a LangGraph-based extraction pipeline to extract entities and relationships from documents. The pipeline consists of multiple nodes:

- **Document Router**: Classifies document type and selects processing strategy
- **Entity Extractor**: Extracts entities with types, names, descriptions, and properties
- **Relationship Builder**: Identifies relationships between extracted entities
- **Identity Resolver**: Deduplicates entities and resolves to canonical UUIDs
- **Quality Auditor**: Validates extraction quality and suggests improvements

Currently, extraction quality is evaluated manually by reviewing traces in LangFuse. This design introduces systematic evaluation using LangFuse's evaluation module.

## Goals

1. Enable systematic, reproducible extraction quality measurement
2. Support comparison of different model/prompt configurations
3. Create reusable evaluation datasets for regression testing
4. Provide actionable metrics for extraction tuning decisions

## Non-Goals

1. Real-time production scoring (online evaluation) - focus on offline/experiment evaluation first
2. Automatic model selection based on scores - manual decision-making initially
3. Complex multi-stage evaluation pipelines - keep evaluators simple and composable

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         LangFuse Cloud/Self-Hosted               │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │   Datasets   │  │  Experiments │  │  Scores & Metrics     │  │
│  │              │  │  (Runs)      │  │                       │  │
│  │ - Input text │  │ - Traces     │  │ - Entity precision    │  │
│  │ - Expected   │  │ - Linked to  │  │ - Relationship recall │  │
│  │   entities   │  │   dataset    │  │ - Type accuracy       │  │
│  │ - Expected   │  │   items      │  │ - Custom evaluators   │  │
│  │   relations  │  │              │  │                       │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ SDK Calls
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                      NestJS Server                               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              ExtractionExperimentService                     ││
│  │  - loadDataset(name)                                        ││
│  │  - runExperiment(datasetName, config)                       ││
│  │  - evaluateItem(extractedOutput, expectedOutput)            ││
│  │  - scoreTrace(traceId, scores)                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              LangGraph Extraction Pipeline                   ││
│  │  EntityExtractor → RelationshipBuilder → IdentityResolver   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Decisions

### D1: Dataset Schema Design

**Decision**: Use a structured schema for extraction evaluation datasets.

**Schema**:

```typescript
interface ExtractionDatasetItem {
  input: {
    document_text: string;
    document_type?: string;
    object_schemas: Record<string, ObjectSchema>;
    allowed_types?: string[];
  };
  expected_output: {
    entities: Array<{
      name: string;
      type: string;
      description?: string;
      properties?: Record<string, any>;
    }>;
    relationships: Array<{
      source_name: string;
      target_name: string;
      relationship_type: string;
    }>;
  };
  metadata?: {
    source_trace_id?: string;
    document_category?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    notes?: string;
  };
}
```

**Rationale**:

- Matches the extraction pipeline's input/output structure
- Supports schema-aware extraction (object_schemas)
- Includes metadata for filtering and analysis

### D2: Experiment Execution Strategy

**Decision**: Use LangFuse's SDK-based experiment runner with custom evaluators.

**Approach**:

```typescript
// Pseudocode for experiment execution
async function runExtractionExperiment(
  datasetName: string,
  config: ExperimentConfig
) {
  const dataset = await langfuse.getDataset(datasetName);

  for (const item of dataset.items) {
    // Create trace linked to dataset item
    const trace = langfuse.trace({
      name: `extraction-experiment-${config.name}`,
    });

    // Run extraction pipeline
    const result = await extractionPipeline.run(item.input, {
      traceId: trace.id,
    });

    // Link trace to dataset item
    await item.link(trace, config.name, { metadata: config.metadata });

    // Compute and record scores
    const scores = evaluateExtraction(result, item.expectedOutput);
    for (const score of scores) {
      langfuse.score({ traceId: trace.id, ...score });
    }
  }
}
```

**Rationale**:

- Full control over extraction invocation
- Custom evaluators can implement domain-specific metrics
- Traces are linked to dataset items for comparison in LangFuse UI

### D3: Evaluation Metrics

**Decision**: Implement a layered set of metrics, starting simple.

**Phase 1 Metrics (MVP)**:
| Metric | Type | Description |
|--------|------|-------------|
| `entity_precision` | Numeric (0-1) | Extracted entities matching expected / total extracted |
| `entity_recall` | Numeric (0-1) | Expected entities found / total expected |
| `entity_f1` | Numeric (0-1) | Harmonic mean of precision and recall |
| `relationship_accuracy` | Numeric (0-1) | Correct relationships / total relationships extracted |
| `type_accuracy` | Numeric (0-1) | Entities with correct type / total entities |

**Phase 2 Metrics (Future)**:

- Property completeness score
- Semantic similarity for descriptions (embedding-based)
- LLM-as-a-Judge for nuanced quality assessment

**Entity Matching Strategy**:

- Match by name (case-insensitive, fuzzy matching with threshold)
- Consider type in matching score
- Handle synonyms via alias mapping

### D4: Integration with Existing LangfuseService

**Decision**: Extend `LangfuseService` with evaluation methods rather than creating a separate service.

**New Methods**:

```typescript
// In LangfuseService
async getDataset(name: string): Promise<DatasetClient | null>;
async createDatasetItem(datasetName: string, item: DatasetItemInput): Promise<void>;
async linkTraceToDatasetItem(traceId: string, itemId: string, runName: string): Promise<void>;
async scoreTrace(traceId: string, scores: Score[]): Promise<void>;
```

**Rationale**:

- Keeps LangFuse integration centralized
- Reuses existing client initialization and error handling
- Maintains single point of configuration

### D5: CLI vs API for Experiments

**Decision**: Provide a CLI script for running experiments, not an API endpoint.

**Implementation**: `scripts/run-extraction-experiment.ts`

**Arguments**:

- `--dataset`: Dataset name in LangFuse
- `--name`: Experiment run name
- `--model`: Model to use for extraction
- `--prompt-label`: Prompt label (e.g., 'production', 'staging')

**Rationale**:

- Experiments are development/testing activities, not production operations
- CLI is simpler to implement and use
- Avoids exposing experiment endpoints that could be misused
- Can be integrated into CI later via script execution

## Alternatives Considered

### A1: Custom Evaluation Database

**Considered**: Store evaluation datasets and results in PostgreSQL alongside application data.

**Rejected Because**:

- Duplicates LangFuse functionality
- Requires building UI for dataset management
- Loses LangFuse's built-in comparison and visualization features

### A2: Use LangFuse UI-based Experiments

**Considered**: Configure experiments entirely through LangFuse UI with managed evaluators.

**Rejected Because**:

- Extraction pipeline is complex (multi-node LangGraph)
- Custom evaluators needed for entity/relationship matching
- SDK approach provides more control and programmatic access

### A3: External Evaluation Framework (DeepEval, Ragas)

**Considered**: Use dedicated LLM evaluation frameworks.

**Rejected Because**:

- Already invested in LangFuse for observability
- LangFuse evaluation is sufficient for extraction use cases
- Reduces tool sprawl and integration complexity

## Risks & Trade-offs

### R1: Dataset Quality

**Risk**: Poor-quality datasets lead to misleading evaluation results.

**Mitigation**:

- Start with manually curated golden examples
- Include diverse document types
- Document dataset creation guidelines
- Review datasets periodically

### R2: Metric Gaming

**Risk**: Optimizing for specific metrics may degrade overall quality.

**Mitigation**:

- Use multiple metrics (precision + recall + f1)
- Include qualitative review alongside quantitative scores
- Consider LLM-as-a-Judge for holistic assessment (Phase 2)

### R3: Computational Cost

**Risk**: Running experiments consumes LLM tokens.

**Mitigation**:

- Keep datasets small initially (10-20 items)
- Cache extraction results when possible
- Run experiments on-demand, not continuously

## Migration Plan

1. **Create initial dataset** in LangFuse with 10-15 golden examples
2. **Implement ExtractionExperimentService** with basic experiment runner
3. **Add precision/recall evaluators** for entities
4. **Run baseline experiment** with current extraction configuration
5. **Document baseline scores** as quality threshold
6. **Iterate on prompts** using experiment comparisons

## Open Questions

1. **Fuzzy entity matching threshold**: What Levenshtein distance threshold for name matching?

   - Tentative: 0.85 similarity for match

2. **Relationship matching semantics**: Should "A influences B" match "A affects B"?

   - Tentative: Exact relationship type match initially; semantic matching in Phase 2

3. **Multi-run aggregation**: How to aggregate scores across multiple experiment runs?
   - Tentative: Use LangFuse's built-in experiment comparison; add custom aggregation if needed
