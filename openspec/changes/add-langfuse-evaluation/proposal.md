# Change: Add LangFuse Evaluation for LangGraph Extractions

## Why

The LangGraph extraction pipeline (entity extraction, relationship building, identity resolution, quality auditing) currently lacks systematic evaluation capabilities. While we have LangFuse tracing for observability (`add-langfuse-observability`, `add-langfuse-prompt-management`), there's no way to:

1. **Measure extraction quality** - No metrics to evaluate whether entities and relationships are accurately extracted
2. **Compare model/prompt variations** - Cannot systematically test different models (gemini-1.5-flash vs gemini-1.5-pro) or prompt versions
3. **Track regression** - No baseline datasets to detect quality degradation after changes
4. **Tune extraction parameters** - No data-driven approach to optimize extraction prompts and configurations

LangFuse provides a comprehensive evaluation module with:

- **Datasets**: Curated input/expected-output pairs for testing
- **Experiments (Dataset Runs)**: Run extraction pipeline against datasets, compare results across runs
- **Scoring**: Numeric, categorical, and boolean scores for evaluation metrics
- **LLM-as-a-Judge**: Automated evaluation using LLM to score extraction quality
- **SDK Integration**: Programmatic experiment execution with custom evaluators

This change enables systematic extraction tuning by creating evaluation datasets, running experiments, and measuring quality improvements.

## What Changes

1. **Evaluation Dataset Management** (`extraction-evaluation` capability):

   - Define extraction evaluation dataset schema (input: document text + schemas, expected_output: entities + relationships)
   - Create seed datasets from existing high-quality extractions (production traces)
   - Support manual dataset item creation for edge cases and golden test cases
   - Organize datasets by document type (meetings, technical docs, requirements)

2. **Extraction Experiment Runner**:

   - Create `ExtractionExperimentService` that runs extraction pipeline against LangFuse datasets
   - Link each extraction trace to dataset items for comparison
   - Support parameterized experiments (model name, prompt version, temperature)
   - Record experiment metadata (model, prompt version, run timestamp)

3. **Evaluation Metrics & Scoring**:

   - **Entity Precision/Recall**: Compare extracted entities against expected entities
   - **Relationship Accuracy**: Compare extracted relationships against expected relationships
   - **Type Correctness**: Percentage of entities with correct type classification
   - **Property Completeness**: Percentage of expected properties extracted
   - **Confidence Correlation**: Correlation between model confidence and actual correctness
   - Custom evaluator functions for programmatic scoring

4. **LLM-as-a-Judge Evaluator (Optional)**:

   - Create managed evaluator for extraction quality assessment
   - Use rubric-based evaluation for entity completeness and relationship validity
   - Score extractions on dimensions: accuracy, completeness, relevance

5. **Integration with Existing Infrastructure**:
   - Extend `LangfuseService` with dataset and experiment methods
   - Create CLI script for running experiments (`scripts/run-extraction-experiment.ts`)
   - Add experiment results visualization guidance (LangFuse UI)

## Impact

**Benefits**:

- **Data-driven tuning**: Make prompt/model decisions based on measurable quality metrics
- **Regression detection**: Catch extraction quality degradation before production
- **A/B testing**: Compare different extraction configurations systematically
- **Quality baselines**: Establish and maintain extraction quality standards
- **Prompt optimization**: Identify which prompt versions perform best on specific document types

**Risks & Mitigations**:

- **Dataset creation effort**: Start with small, curated dataset (10-20 golden examples); expand based on production traces
- **Evaluation complexity**: Begin with simple precision/recall metrics; add LLM-as-a-Judge later
- **LangFuse dependency**: Evaluation requires LangFuse to be running; document this requirement

**Prerequisites**:

- LangFuse must be deployed and configured (`add-langfuse-observability` completed)
- LangFuse prompt management active (`add-langfuse-prompt-management` completed)

**Timeline**: 8-12 hours

- Phase 1: Dataset schema and seed data (2-3h)
- Phase 2: Experiment runner service (3-4h)
- Phase 3: Evaluator functions (2-3h)
- Phase 4: Documentation and CLI tooling (1-2h)

## Affected Specs

- New: `extraction-evaluation` - Extraction quality evaluation using LangFuse

## Open Questions

1. **Dataset Source**: Should initial datasets be manually created or derived from production traces with manual validation?

   - Recommendation: Start with production traces that were manually reviewed/corrected

2. **Evaluation Frequency**: Should experiments run on every prompt change, or on-demand?

   - Recommendation: On-demand initially, with option for CI integration later

3. **Score Thresholds**: What minimum scores should block deployment?
   - Recommendation: Define after establishing baselines; start with alerts only
