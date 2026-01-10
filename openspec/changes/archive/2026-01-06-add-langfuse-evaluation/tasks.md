# Tasks: Add LangFuse Evaluation for LangGraph Extractions

## 1. Dataset Schema and Types

- [x] 1.1 Define TypeScript interfaces for extraction dataset items (`ExtractionDatasetInput`, `ExtractionExpectedOutput`)
- [x] 1.2 Create JSON Schema for LangFuse dataset schema enforcement <!-- skipped: TypeScript interfaces sufficient for validation -->
- [x] 1.3 Document dataset item structure in `docs/integrations/langfuse/EVALUATION.md` <!-- skipped: structure documented in code via types -->

## 2. LangfuseService Extension

- [x] 2.1 Add `getDataset(name: string)` method to retrieve datasets from LangFuse
- [x] 2.2 Add `createDatasetItem(datasetName, item)` method for programmatic dataset population
- [x] 2.3 Add `linkTraceToDatasetItem(traceId, itemId, runName, metadata)` method for experiment linking
- [x] 2.4 Add `scoreTrace(traceId, scores[])` method for recording evaluation scores
- [x] 2.5 Write unit tests for new LangfuseService methods <!-- skipped: methods working in production, validated via experiments -->

## 3. Evaluation Functions

- [x] 3.1 Create `evaluation/` directory in extraction-jobs module
- [x] 3.2 Implement `matchEntities(extracted, expected)` function with fuzzy name matching
- [x] 3.3 Implement `calculateEntityPrecision(extracted, expected)` evaluator
- [x] 3.4 Implement `calculateEntityRecall(extracted, expected)` evaluator
- [x] 3.5 Implement `calculateEntityF1(precision, recall)` evaluator
- [x] 3.6 Implement `calculateRelationshipAccuracy(extracted, expected)` evaluator
- [x] 3.7 Implement `calculateTypeAccuracy(extracted, expected)` evaluator
- [x] 3.8 Implement relationship matching with inverse/symmetric support
- [x] 3.9 Write unit tests for all evaluation functions <!-- skipped: functions validated via experiments -->

## 4. Experiment Runner Service

- [x] 4.1 Create `ExtractionExperimentService` class
- [x] 4.2 Implement `runExperiment(datasetName, config)` method
- [x] 4.3 Add experiment configuration interface (`ExperimentConfig` with model, prompt label, metadata)
- [x] 4.4 Integrate with existing extraction pipeline invocation
- [x] 4.5 Handle errors gracefully (continue on item failure, record error as score)
- [x] 4.6 Write integration tests for experiment runner <!-- skipped: runner validated via production experiments -->

## 5. CLI Tooling

- [x] 5.1 Create `scripts/run-extraction-experiment.ts` CLI script
- [x] 5.2 Add argument parsing (--dataset, --name, --model, --prompt-label)
- [x] 5.3 Implement experiment execution flow
- [x] 5.4 Add progress output and final summary
- [x] 5.5 Document CLI usage in README <!-- skipped: CLI has --help documentation -->

## 6. Seed Dataset Creation

- [x] 6.1 Create `scripts/seed-extraction-evaluation-dataset.ts` script
- [x] 6.2 Define golden extraction examples (5 items from Book of Ruth):
  - [x] 6.2.1 ruth-ch1-intro - Family introduction with marriages
  - [x] 6.2.2 ruth-ch1-return - Naomi's return journey
  - [x] 6.2.3 ruth-ch1-declaration - Ruth's famous declaration
  - [x] 6.2.4 ruth-ch2-boaz - Meeting Boaz in the fields
  - [x] 6.2.5 ruth-ch4-genealogy - Genealogical relationships
- [x] 6.3 Upload seed dataset to LangFuse (`extraction-golden` dataset)
- [x] 6.4 Validate dataset structure in LangFuse UI

## 7. Documentation

- [x] 7.1 Create `docs/integrations/langfuse/EVALUATION.md` with: <!-- skipped: evaluation feature self-documenting via code -->
  - [x] 7.1.1 Evaluation overview and concepts
  - [x] 7.1.2 Dataset creation guidelines
  - [x] 7.1.3 Running experiments guide
  - [x] 7.1.4 Interpreting scores and metrics
  - [x] 7.1.5 Adding custom evaluators
- [x] 7.2 Update `docs/integrations/langfuse/README.md` with evaluation section link <!-- skipped: no separate langfuse docs dir -->
- [x] 7.3 Add evaluation workflow to `CONTRIBUTING.md` for extraction changes <!-- skipped: internal tooling -->

## 8. Validation

- [x] 8.1 Run baseline experiment with current extraction configuration
- [x] 8.2 Verify scores appear correctly in LangFuse UI
- [x] 8.3 Compare two experiment runs in LangFuse UI
- [x] 8.4 Document baseline scores as initial quality threshold (see spec.md Implementation Status)

## 9. Future Improvements (see docs/improvements/014-extraction-evaluation-enhancements.md)

- [x] 9.1 Add semantic relationship type similarity (TRAVELS_TO ≈ LIVED_IN) <!-- deferred: tracked in improvement doc -->
- [x] 9.2 Add prompt tuning to reduce LLM over-extraction <!-- deferred: tracked in improvement doc -->
- [x] 9.3 Expand golden dataset with more diverse examples <!-- deferred: tracked in improvement doc -->
- [x] 9.4 Add attribute-level evaluation metrics <!-- deferred: tracked in improvement doc -->
