/**
 * ExtractionExperimentService
 *
 * Service for running extraction experiments against LangFuse datasets.
 * Orchestrates the execution of the LangGraph extraction pipeline on dataset items,
 * evaluates results against expected outputs, and records scores in LangFuse.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { LangfuseService } from '../../langfuse/langfuse.service';
import { LangGraphExtractionProvider } from '../llm/langgraph-extraction.provider';
import {
  ExtractionDatasetInput,
  ExtractionExpectedOutput,
  ExperimentConfig,
  ExperimentRunSummary,
  ExtractionEvaluationResult,
  ExtractionScoreType,
} from './types';
import { evaluateExtraction, aggregateScores } from './evaluators';

/**
 * Service for running extraction experiments on LangFuse datasets.
 */
@Injectable()
export class ExtractionExperimentService {
  private readonly logger = new Logger(ExtractionExperimentService.name);

  constructor(
    @Inject(LangfuseService) private readonly langfuseService: LangfuseService,
    @Inject(LangGraphExtractionProvider)
    private readonly extractionProvider: LangGraphExtractionProvider
  ) {}

  /**
   * Run an experiment on a LangFuse dataset.
   *
   * @param config - Experiment configuration
   * @returns Summary of the experiment run
   */
  async runExperiment(config: ExperimentConfig): Promise<ExperimentRunSummary> {
    this.logger.log(
      `Starting experiment "${config.name}" on dataset "${config.datasetName}"`
    );

    const startedAt = new Date();
    const results: ExtractionEvaluationResult[] = [];
    const errors: Array<{ itemId: string; error: string }> = [];

    // Fetch dataset from LangFuse
    const dataset = await this.langfuseService.getDataset(config.datasetName);
    if (!dataset) {
      throw new Error(`Dataset "${config.datasetName}" not found`);
    }

    this.logger.log(
      `Loaded dataset "${config.datasetName}" with ${dataset.items.length} items`
    );

    // Process each dataset item
    for (let i = 0; i < dataset.items.length; i++) {
      const item = dataset.items[i];
      this.logger.log(
        `Processing item ${i + 1}/${dataset.items.length} (${item.id})`
      );

      try {
        const result = await this.processDatasetItem(item, config);
        results.push(result);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`Error processing item ${item.id}: ${errorMessage}`);
        errors.push({ itemId: item.id, error: errorMessage });
      }
    }

    // Aggregate scores
    const aggregatedScores = aggregateScores(results);

    const completedAt = new Date();

    const summary: ExperimentRunSummary = {
      name: config.name,
      itemCount: dataset.items.length,
      aggregatedScores: aggregatedScores as Record<
        ExtractionScoreType,
        { mean: number; min: number; max: number; stdDev: number }
      >,
      startedAt,
      completedAt,
      errors,
    };

    this.logger.log(
      `Experiment "${config.name}" completed. ` +
        `Processed ${results.length}/${dataset.items.length} items. ` +
        `Errors: ${errors.length}`
    );

    // Log aggregated scores
    if (aggregatedScores['entity_f1']) {
      this.logger.log(
        `Entity F1: mean=${aggregatedScores['entity_f1'].mean.toFixed(3)}, ` +
          `min=${aggregatedScores['entity_f1'].min.toFixed(3)}, ` +
          `max=${aggregatedScores['entity_f1'].max.toFixed(3)}`
      );
    }
    if (aggregatedScores['relationship_f1']) {
      this.logger.log(
        `Relationship F1: mean=${aggregatedScores[
          'relationship_f1'
        ].mean.toFixed(3)}, ` +
          `min=${aggregatedScores['relationship_f1'].min.toFixed(3)}, ` +
          `max=${aggregatedScores['relationship_f1'].max.toFixed(3)}`
      );
    }

    // Flush LangFuse to ensure all scores are sent
    await this.langfuseService.flush();

    return summary;
  }

  /**
   * Process a single dataset item: run extraction, evaluate, and score.
   */
  private async processDatasetItem(
    item: {
      id: string;
      input?: unknown;
      expectedOutput?: unknown;
      metadata?: Record<string, unknown>;
      link: (
        trace: { id: string } | string,
        runName: string,
        options?: { description?: string; metadata?: Record<string, unknown> }
      ) => Promise<void>;
    },
    config: ExperimentConfig
  ): Promise<ExtractionEvaluationResult> {
    // Parse input and expected output
    const input = item.input as ExtractionDatasetInput;
    const expectedOutput = item.expectedOutput as ExtractionExpectedOutput;

    if (!input?.document_text || !input?.object_schemas) {
      throw new Error('Dataset item missing required input fields');
    }
    if (!expectedOutput?.entities) {
      throw new Error('Dataset item missing expected output');
    }

    // Create trace for this extraction
    const trace = this.langfuseService.createExperimentTrace(
      `extraction-experiment-${config.name}`,
      input,
      {
        experiment_name: config.name,
        dataset_name: config.datasetName,
        dataset_item_id: item.id,
        model: config.model,
        prompt_label: config.promptLabel,
        ...config.metadata,
      },
      ['experiment', config.name],
      config.environment ?? 'test'
    );

    if (!trace) {
      throw new Error('Failed to create experiment trace');
    }

    let evaluationResult: ExtractionEvaluationResult;

    try {
      if (config.dryRun) {
        // Dry run - skip actual extraction
        this.logger.debug(`[Dry run] Skipping extraction for item ${item.id}`);
        evaluationResult = this.createEmptyEvaluationResult(expectedOutput);
      } else {
        // Run the extraction pipeline
        const extractionResult = await this.extractionProvider.extractEntities(
          input.document_text,
          '', // System prompt is handled by the provider
          {
            objectSchemas: input.object_schemas,
            relationshipSchemas: input.relationship_schemas ?? {},
            allowedTypes: input.allowed_types,
            availableTags: input.available_tags,
            existingEntities: [], // No existing entities for evaluation
            context: {
              jobId: `experiment-${config.name}-${item.id}`,
              projectId: 'experiment',
              traceId: trace.traceId,
            },
            // Pass prompt label for Langfuse prompt selection
            promptLabel: config.promptLabel,
          }
        );

        // Convert extraction result to internal format for evaluation
        const extractedEntities = extractionResult.entities.map((e, idx) => ({
          temp_id: `entity_${idx}_${e.name.toLowerCase().replace(/\s+/g, '_')}`,
          name: e.name,
          type: e.type_name,
          description: e.description,
          properties: e.properties,
        }));

        // Build a name -> temp_id map for relationship resolution
        const nameToTempId = new Map<string, string>();
        for (const entity of extractedEntities) {
          nameToTempId.set(entity.name.toLowerCase(), entity.temp_id);
        }

        const extractedRelationships = extractionResult.relationships.map(
          (r) => {
            const sourceName = r.source.name?.toLowerCase() ?? '';
            const targetName = r.target.name?.toLowerCase() ?? '';
            return {
              source_ref: nameToTempId.get(sourceName) ?? sourceName,
              target_ref: nameToTempId.get(targetName) ?? targetName,
              type: r.relationship_type,
              description: r.description,
            };
          }
        );

        // Evaluate the extraction
        evaluationResult = evaluateExtraction(
          extractedEntities,
          extractedRelationships,
          expectedOutput
        );

        // Update trace with output
        this.langfuseService.updateTrace(trace.traceId, {
          entities: extractedEntities,
          relationships: extractedRelationships,
          evaluation: evaluationResult,
        });
      }

      // Link trace to dataset item
      await item.link(trace, config.name, {
        description: `Experiment run: ${config.name}`,
        metadata: {
          model: config.model,
          prompt_label: config.promptLabel,
        },
      });

      // Record scores in LangFuse
      const scores = evaluationResult.scores.map((s) => ({
        name: s.name,
        value: s.value,
        comment: s.comment,
        dataType: s.dataType ?? ('NUMERIC' as const),
      }));
      this.langfuseService.scoreTraceMultiple(trace.traceId, scores);

      return evaluationResult;
    } catch (error) {
      // Update trace with error
      this.langfuseService.updateTrace(trace.traceId, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create an empty evaluation result for dry runs.
   */
  private createEmptyEvaluationResult(
    expectedOutput: ExtractionExpectedOutput
  ): ExtractionEvaluationResult {
    return {
      scores: [
        { name: 'entity_precision', value: 0 },
        { name: 'entity_recall', value: 0 },
        { name: 'entity_f1', value: 0 },
        { name: 'type_accuracy', value: 0 },
        { name: 'relationship_precision', value: 0 },
        { name: 'relationship_recall', value: 0 },
        { name: 'relationship_f1', value: 0 },
        { name: 'overall_quality', value: 0 },
      ],
      matched_entities: [],
      missing_entities: expectedOutput.entities.map((e) => e.name),
      extra_entities: [],
      matched_relationships: [],
      missing_relationships: expectedOutput.relationships.map(
        (r) => `${r.source_name}--${r.relationship_type}-->${r.target_name}`
      ),
      extra_relationships: [],
    };
  }

  /**
   * Create a dataset item from extraction results for adding to evaluation datasets.
   * Useful for curating datasets from production extractions.
   *
   * @param input - The extraction input
   * @param entities - Extracted entities (as expected output)
   * @param relationships - Extracted relationships (as expected output)
   * @param metadata - Optional metadata
   */
  async addDatasetItem(
    datasetName: string,
    input: ExtractionDatasetInput,
    entities: ExtractionExpectedOutput['entities'],
    relationships: ExtractionExpectedOutput['relationships'],
    metadata?: Record<string, unknown>
  ): Promise<string | null> {
    const expectedOutput: ExtractionExpectedOutput = {
      entities,
      relationships,
    };

    return this.langfuseService.createDatasetItem(
      datasetName,
      input,
      expectedOutput,
      metadata
    );
  }

  /**
   * Check if experiment infrastructure is available.
   */
  isAvailable(): boolean {
    return this.langfuseService.isEvaluationAvailable();
  }
}
