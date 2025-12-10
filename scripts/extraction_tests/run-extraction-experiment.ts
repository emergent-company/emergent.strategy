#!/usr/bin/env tsx
/**
 * Run Extraction Experiment
 *
 * CLI script for running extraction evaluation experiments against LangFuse datasets.
 * This allows comparing different model/prompt configurations on the same dataset.
 *
 * Usage:
 *   npx tsx scripts/run-extraction-experiment.ts --dataset <name> --name <experiment-name>
 *
 * Examples:
 *   # Run experiment with default settings
 *   npx tsx scripts/run-extraction-experiment.ts --dataset extraction-golden --name baseline-v1
 *
 *   # Run with specific model and prompt label
 *   npx tsx scripts/run-extraction-experiment.ts \
 *     --dataset extraction-golden \
 *     --name gemini-2.0 \
 *     --model gemini-2.0-flash-001 \
 *     --prompt-label production
 *
 *   # Dry run (no actual extraction, just validates dataset)
 *   npx tsx scripts/run-extraction-experiment.ts --dataset extraction-golden --name test --dry-run
 *
 * Prerequisites:
 *   - LangFuse configured (LANGFUSE_* environment variables)
 *   - Vertex AI configured for extraction
 *   - Dataset created in LangFuse with proper schema
 */

import { config } from 'dotenv';
import { Langfuse } from 'langfuse-node';
import { parseArgs } from 'util';
import {
  evaluateExtraction,
  aggregateScores,
} from '../apps/server/src/modules/extraction-jobs/evaluation/evaluators';
import type {
  ExtractionDatasetInput,
  ExtractionExpectedOutput,
  ExtractionEvaluationResult,
  ExtractionScoreType,
} from '../apps/server/src/modules/extraction-jobs/evaluation/types';

// Load environment variables
config();

interface CliArgs {
  dataset: string;
  name: string;
  model?: string;
  promptLabel?: string;
  dryRun: boolean;
  help: boolean;
}

function printUsage(): void {
  console.log(`
Run Extraction Experiment

Usage:
  npx tsx scripts/run-extraction-experiment.ts [options]

Options:
  --dataset <name>       LangFuse dataset name (required)
  --name <name>          Experiment run name (required)
  --model <name>         Model to use for extraction (optional)
  --prompt-label <name>  Prompt label to use (optional, e.g., 'production', 'staging')
  --dry-run              Skip actual extraction, just validate dataset
  --help                 Show this help message

Examples:
  # Run baseline experiment
  npx tsx scripts/run-extraction-experiment.ts \\
    --dataset extraction-golden \\
    --name baseline-v1

  # Compare with different model
  npx tsx scripts/run-extraction-experiment.ts \\
    --dataset extraction-golden \\
    --name gemini-2.0-test \\
    --model gemini-2.0-flash-001

  # Dry run to validate dataset format
  npx tsx scripts/run-extraction-experiment.ts \\
    --dataset extraction-golden \\
    --name test \\
    --dry-run
`);
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      dataset: { type: 'string', short: 'd' },
      name: { type: 'string', short: 'n' },
      model: { type: 'string', short: 'm' },
      'prompt-label': { type: 'string', short: 'p' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  return {
    dataset: values.dataset as string,
    name: values.name as string,
    model: values.model as string | undefined,
    promptLabel: values['prompt-label'] as string | undefined,
    dryRun: values['dry-run'] as boolean,
    help: values.help as boolean,
  };
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logError(message: string): void {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
}

async function main(): Promise<void> {
  const args = parseCliArgs();

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.dataset || !args.name) {
    console.error('Error: --dataset and --name are required');
    printUsage();
    process.exit(1);
  }

  // Validate LangFuse configuration
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const baseUrl = process.env.LANGFUSE_HOST || process.env.LANGFUSE_BASE_URL;

  if (!secretKey || !publicKey) {
    logError('LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY are required');
    process.exit(1);
  }

  log('='.repeat(60));
  log('Extraction Experiment Runner');
  log('='.repeat(60));
  log(`Dataset: ${args.dataset}`);
  log(`Experiment Name: ${args.name}`);
  log(`Model: ${args.model ?? '(default)'}`);
  log(`Prompt Label: ${args.promptLabel ?? '(default)'}`);
  log(`Dry Run: ${args.dryRun}`);
  log('='.repeat(60));

  // Initialize LangFuse
  const langfuse = new Langfuse({
    publicKey,
    secretKey,
    baseUrl,
  });

  try {
    // Fetch dataset
    log(`Fetching dataset "${args.dataset}"...`);
    const dataset = await langfuse.getDataset(args.dataset);
    log(`Loaded dataset with ${dataset.items.length} items`);

    const results: ExtractionEvaluationResult[] = [];
    const errors: Array<{ itemId: string; error: string }> = [];
    const startTime = Date.now();

    // Process each dataset item
    for (let i = 0; i < dataset.items.length; i++) {
      const item = dataset.items[i];
      log(`Processing item ${i + 1}/${dataset.items.length} (${item.id})`);

      try {
        const input = item.input as ExtractionDatasetInput;
        const expectedOutput = item.expectedOutput as ExtractionExpectedOutput;

        if (!input?.document_text || !input?.object_schemas) {
          throw new Error('Dataset item missing required input fields');
        }
        if (!expectedOutput?.entities) {
          throw new Error('Dataset item missing expected output');
        }

        // Create trace for this item
        const trace = langfuse.trace({
          name: `extraction-experiment-${args.name}`,
          input,
          metadata: {
            experiment_name: args.name,
            dataset_name: args.dataset,
            dataset_item_id: item.id,
            model: args.model,
            prompt_label: args.promptLabel,
            dry_run: args.dryRun,
          },
          tags: ['experiment', args.name],
        });

        let evaluationResult: ExtractionEvaluationResult;

        if (args.dryRun) {
          // Dry run - create empty result
          log(`  [Dry run] Skipping extraction`);
          evaluationResult = {
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
              (r) =>
                `${r.source_name}--${r.relationship_type}-->${r.target_name}`
            ),
            extra_relationships: [],
          };
        } else {
          // TODO: Run actual extraction
          // For now, skip actual extraction until LangGraphExtractionProvider
          // can be instantiated outside of NestJS context
          log(`  [Not implemented] Actual extraction requires NestJS context`);
          log(`  Using empty extraction result for scoring demonstration`);

          // Simulate empty extraction for demonstration
          evaluationResult = evaluateExtraction([], [], expectedOutput);
        }

        // Link trace to dataset item
        await item.link(trace, args.name, {
          description: `Experiment run: ${args.name}`,
          metadata: {
            model: args.model,
            prompt_label: args.promptLabel,
          },
        });

        // Score the trace
        for (const score of evaluationResult.scores) {
          langfuse.score({
            traceId: trace.id,
            name: score.name,
            value: score.value,
            comment: score.comment,
          });
        }

        // Update trace with output
        trace.update({
          output: {
            evaluation: evaluationResult,
          },
        });

        results.push(evaluationResult);
        log(
          `  Scores: entity_f1=${evaluationResult.scores
            .find((s) => s.name === 'entity_f1')
            ?.value.toFixed(3)}`
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logError(`Item ${item.id}: ${errorMessage}`);
        errors.push({ itemId: item.id, error: errorMessage });
      }
    }

    // Aggregate scores
    const aggregatedScores = aggregateScores(results);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Flush to ensure all data is sent
    await langfuse.flushAsync();

    // Print summary
    log('');
    log('='.repeat(60));
    log('EXPERIMENT COMPLETE');
    log('='.repeat(60));
    log(`Duration: ${duration}s`);
    log(`Items Processed: ${results.length}/${dataset.items.length}`);
    log(`Errors: ${errors.length}`);
    log('');

    // Print aggregated scores
    log('AGGREGATED SCORES:');
    log('-'.repeat(60));

    const scoreOrder = [
      'entity_precision',
      'entity_recall',
      'entity_f1',
      'type_accuracy',
      'relationship_precision',
      'relationship_recall',
      'relationship_f1',
      'overall_quality',
    ];

    for (const scoreName of scoreOrder) {
      const stats = aggregatedScores[scoreName];
      if (stats) {
        const bar = '█'.repeat(Math.round(stats.mean * 20));
        const emptyBar = '░'.repeat(20 - Math.round(stats.mean * 20));
        log(
          `${scoreName.padEnd(25)} ${bar}${emptyBar} ` +
            `mean=${stats.mean.toFixed(3)} ` +
            `(min=${stats.min.toFixed(3)}, max=${stats.max.toFixed(
              3
            )}, σ=${stats.stdDev.toFixed(3)})`
        );
      }
    }

    log('');

    // Print errors if any
    if (errors.length > 0) {
      log('ERRORS:');
      log('-'.repeat(60));
      for (const error of errors) {
        logError(`Item ${error.itemId}: ${error.error}`);
      }
      log('');
    }

    log('='.repeat(60));
    log(
      `View results in LangFuse: Datasets > ${args.dataset} > Runs > ${args.name}`
    );
    log('='.repeat(60));

    await langfuse.shutdownAsync();
    process.exit(0);
  } catch (error) {
    logError(
      `Experiment failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    await langfuse.shutdownAsync();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
