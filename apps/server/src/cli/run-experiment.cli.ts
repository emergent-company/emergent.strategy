/**
 * NestJS CLI Script: Run Extraction Experiment
 *
 * This script bootstraps the NestJS application and runs an extraction experiment
 * against a LangFuse dataset using the full extraction pipeline.
 *
 * Usage:
 *   npx tsx apps/server/src/cli/run-experiment.cli.ts --dataset <name> --name <name> [options]
 *
 * Options:
 *   --dataset <name>       LangFuse dataset name (required)
 *   --name <name>          Experiment run name (required)
 *   --model <name>         Model to use for extraction (optional)
 *   --prompt-label <name>  Prompt label to use (optional)
 *   --environment <name>   LangFuse environment label (default: 'test')
 *   --dry-run              Skip actual extraction, just validate dataset
 */

import { NestFactory } from '@nestjs/core';
import { ExperimentModule } from './experiment.module';
import { ExtractionExperimentService } from '../modules/extraction-jobs/evaluation/extraction-experiment.service';
import { ExperimentConfig } from '../modules/extraction-jobs/evaluation/types';

interface CliArgs {
  dataset: string;
  name: string;
  model?: string;
  promptLabel?: string;
  environment?: string;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    dataset: '',
    name: '',
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--dataset':
        result.dataset = args[++i] || '';
        break;
      case '--name':
        result.name = args[++i] || '';
        break;
      case '--model':
        result.model = args[++i];
        break;
      case '--prompt-label':
        result.promptLabel = args[++i];
        break;
      case '--environment':
        result.environment = args[++i];
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--help':
        printUsage();
        process.exit(0);
    }
  }

  return result;
}

function printUsage(): void {
  console.log(`
Run Extraction Experiment (with full NestJS context)

Usage:
  npx tsx apps/server/src/cli/run-experiment.cli.ts [options]

Options:
  --dataset <name>       LangFuse dataset name (required)
  --name <name>          Experiment run name (required)
  --model <name>         Model to use for extraction (optional)
  --prompt-label <name>  Prompt label to use (optional)
  --environment <name>   LangFuse environment label (default: 'test')
  --dry-run              Skip actual extraction, just validate dataset
  --help                 Show this help message

Examples:
  # Run baseline experiment
  npx tsx apps/server/src/cli/run-experiment.cli.ts \\
    --dataset extraction-golden \\
    --name baseline-v1

  # Dry run to validate dataset format
  npx tsx apps/server/src/cli/run-experiment.cli.ts \\
    --dataset extraction-golden \\
    --name test \\
    --dry-run
`);
}

async function main() {
  const args = parseArgs();

  if (!args.dataset || !args.name) {
    console.error('Error: --dataset and --name are required');
    printUsage();
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Extraction Experiment Runner (NestJS)');
  console.log('='.repeat(60));
  console.log(`Dataset: ${args.dataset}`);
  console.log(`Experiment Name: ${args.name}`);
  console.log(`Model: ${args.model ?? '(default)'}`);
  console.log(`Prompt Label: ${args.promptLabel ?? '(default)'}`);
  console.log(`Environment: ${args.environment ?? 'test'}`);
  console.log(`Dry Run: ${args.dryRun}`);
  console.log('='.repeat(60));

  console.log('\nBootstrapping NestJS application...');

  // Bootstrap NestJS application with minimal dependencies
  const app = await NestFactory.createApplicationContext(ExperimentModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    // Get the experiment service
    const experimentService = app.get(ExtractionExperimentService);

    if (!experimentService.isAvailable()) {
      console.error(
        'Error: LangFuse evaluation is not available. Check LANGFUSE_* environment variables.'
      );
      process.exit(1);
    }

    console.log('Starting experiment...\n');

    // Build experiment config
    const config: ExperimentConfig = {
      name: args.name,
      datasetName: args.dataset,
      model: args.model,
      promptLabel: args.promptLabel,
      environment: args.environment ?? 'test',
      dryRun: args.dryRun,
    };

    // Run the experiment
    const summary = await experimentService.runExperiment(config);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('EXPERIMENT COMPLETE');
    console.log('='.repeat(60));
    console.log(
      `Duration: ${(
        (summary.completedAt.getTime() - summary.startedAt.getTime()) /
        1000
      ).toFixed(1)}s`
    );
    console.log(
      `Items Processed: ${summary.itemCount - summary.errors.length}/${
        summary.itemCount
      }`
    );
    console.log(`Errors: ${summary.errors.length}`);
    console.log('\nAGGREGATED SCORES:');
    console.log('-'.repeat(60));

    // Print scores with visual bars
    const scoreNames = [
      'entity_precision',
      'entity_recall',
      'entity_f1',
      'type_accuracy',
      'relationship_precision',
      'relationship_recall',
      'relationship_f1',
      'overall_quality',
    ] as const;

    for (const scoreName of scoreNames) {
      const scoreData = summary.aggregatedScores[scoreName];
      if (scoreData) {
        const barLength = Math.round(scoreData.mean * 20);
        const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
        console.log(
          `${scoreName.padEnd(25)} ${bar} mean=${scoreData.mean.toFixed(
            3
          )} (min=${scoreData.min.toFixed(3)}, max=${scoreData.max.toFixed(
            3
          )}, σ=${scoreData.stdDev.toFixed(3)})`
        );
      }
    }

    if (summary.errors.length > 0) {
      console.log('\nERRORS:');
      console.log('-'.repeat(60));
      for (const error of summary.errors) {
        console.log(`  ${error.itemId}: ${error.error}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(
      `View results in LangFuse: Datasets > ${args.dataset} > Runs > ${args.name}`
    );
    console.log('='.repeat(60));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
