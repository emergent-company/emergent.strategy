/**
 * Test runner with multi-run averaging support and Langfuse tracing
 */

import { CONFIG } from './config.js';
import {
  ExtractionResult,
  TestRunResult,
  TestSummary,
  TestConfig,
} from './types.js';
import { createSummary } from './stats.js';
import { logger } from './logger.js';
import {
  initLangfuse,
  isTracingEnabled,
  createTestTrace,
  createGeneration,
  endGeneration,
  scoreTrace,
  finalizeTrace,
  flushTraces,
  shutdownTracing,
  type TestTraceContext,
} from './tracing.js';

export interface RunnerOptions {
  /** Number of times to run each test (default: 3) */
  runs?: number;
  /** Number of warmup runs before measuring (default: 1) */
  warmupRuns?: number;
  /** Whether to print progress for each run */
  verbose?: boolean;
  /** Whether to skip warmup runs */
  skipWarmup?: boolean;
  /** Delay between runs in ms */
  delayBetweenRuns?: number;
  /** Enable Langfuse tracing (default: true if LANGFUSE_ENABLED=true) */
  enableTracing?: boolean;
}

const DEFAULT_OPTIONS: Required<RunnerOptions> = {
  runs: CONFIG.defaultRuns,
  warmupRuns: CONFIG.warmupRuns,
  verbose: true,
  skipWarmup: false,
  delayBetweenRuns: 500,
  enableTracing: true,
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a single test multiple times and collect statistics
 */
export async function runTest(
  testConfig: TestConfig,
  options: RunnerOptions = {}
): Promise<TestSummary> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const runs: TestRunResult[] = [];

  // Initialize tracing if enabled
  let traceCtx: TestTraceContext | null = null;
  if (opts.enableTracing) {
    initLangfuse();
    if (isTracingEnabled()) {
      traceCtx = createTestTrace(testConfig.name, {
        method: testConfig.method,
        description: testConfig.description,
        runs: opts.runs,
        warmupRuns: opts.warmupRuns,
      });
    }
  }

  if (opts.verbose) {
    logger.subHeader(`${testConfig.name} (${testConfig.method})`);
    console.log(logger.c.dim(`  ${testConfig.description}`));
    if (isTracingEnabled()) {
      console.log(logger.c.cyan(`  Langfuse tracing: enabled`));
    }
    console.log();
  }

  // Warmup runs (not measured)
  if (!opts.skipWarmup && opts.warmupRuns > 0) {
    if (opts.verbose) {
      console.log(
        logger.c.dim(
          `  Warming up (${opts.warmupRuns} run${
            opts.warmupRuns > 1 ? 's' : ''
          })...`
        )
      );
    }
    for (let i = 0; i < opts.warmupRuns; i++) {
      try {
        await testConfig.run();
      } catch {
        // Ignore warmup errors
      }
      if (i < opts.warmupRuns - 1) {
        await sleep(opts.delayBetweenRuns);
      }
    }
    if (opts.verbose) {
      console.log();
    }
  }

  // Measured runs
  if (opts.verbose) {
    console.log(
      logger.c.dim(
        `  Running ${opts.runs} measured test${opts.runs > 1 ? 's' : ''}...`
      )
    );
  }

  for (let i = 0; i < opts.runs; i++) {
    const runNumber = i + 1;
    const timestamp = new Date();

    // Create generation for this run
    const generation = createGeneration(
      traceCtx,
      `run-${runNumber}`,
      { runNumber, totalRuns: opts.runs },
      { method: testConfig.method }
    );

    try {
      const result = await testConfig.run();
      const runResult: TestRunResult = { runNumber, result, timestamp };
      runs.push(runResult);

      // End generation with success
      endGeneration(
        generation,
        {
          success: result.success,
          entityCount: result.entities.length,
          durationMs: result.durationMs,
        },
        result.tokenUsage
          ? {
              promptTokens: result.tokenUsage.input,
              completionTokens: result.tokenUsage.output,
              totalTokens:
                (result.tokenUsage.input ?? 0) +
                (result.tokenUsage.output ?? 0),
            }
          : undefined,
        result.success ? 'success' : 'error',
        result.error
      );

      if (opts.verbose) {
        logger.progress(runNumber, opts.runs, result);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const result: ExtractionResult = {
        success: false,
        entities: [],
        durationMs: 0,
        error: errorMessage,
      };
      const runResult: TestRunResult = { runNumber, result, timestamp };
      runs.push(runResult);

      // End generation with error
      endGeneration(generation, null, undefined, 'error', errorMessage);

      if (opts.verbose) {
        logger.progress(runNumber, opts.runs, result);
      }
    }

    // Delay between runs (except after last run)
    if (i < opts.runs - 1) {
      await sleep(opts.delayBetweenRuns);
    }
  }

  const summary = createSummary(testConfig.name, testConfig.method, runs);

  // Score the trace with summary metrics
  if (traceCtx) {
    scoreTrace(traceCtx, 'success_rate', summary.stats.successRate / 100);
    scoreTrace(traceCtx, 'avg_duration_ms', summary.stats.avgDurationMs);
    scoreTrace(traceCtx, 'avg_entities', summary.stats.avgEntities);
    finalizeTrace(
      traceCtx,
      {
        successRate: summary.stats.successRate,
        avgDurationMs: summary.stats.avgDurationMs,
        avgEntities: summary.stats.avgEntities,
        totalRuns: summary.stats.totalRuns,
        successfulRuns: summary.stats.successfulRuns,
      },
      summary.stats.successRate === 100 ? 'success' : 'error'
    );
  }

  return summary;
}

/**
 * Run multiple tests and collect all summaries
 */
export async function runTests(
  tests: TestConfig[],
  options: RunnerOptions = {}
): Promise<TestSummary[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const summaries: TestSummary[] = [];

  // Initialize tracing
  if (opts.enableTracing) {
    initLangfuse();
  }

  logger.header('Extraction Test Suite');
  console.log(
    `  ${logger.c.dim('Tests:')} ${tests.length}  ${logger.c.dim(
      'Runs each:'
    )} ${opts.runs}  ${logger.c.dim('Warmup:')} ${
      opts.skipWarmup ? 'off' : opts.warmupRuns
    }`
  );
  if (isTracingEnabled()) {
    console.log(`  ${logger.c.cyan('Langfuse tracing: enabled')}`);
  }

  for (const test of tests) {
    const summary = await runTest(test, opts);
    summaries.push(summary);

    // Small delay between different tests
    await sleep(1000);
  }

  // Print overall summary
  logger.multiSummary(summaries);

  // Flush and shutdown tracing
  if (opts.enableTracing && isTracingEnabled()) {
    console.log(logger.c.dim('\n  Flushing traces to Langfuse...'));
    await flushTraces();
    await shutdownTracing();
    console.log(logger.c.success('  Traces sent to Langfuse'));
  }

  return summaries;
}

/**
 * Quick run a single extraction function (no config wrapper needed)
 */
export async function quickRun(
  name: string,
  method: TestConfig['method'],
  fn: () => Promise<ExtractionResult>,
  options: RunnerOptions = {}
): Promise<TestSummary> {
  return runTest(
    {
      name,
      description: 'Quick run test',
      method,
      run: fn,
    },
    options
  );
}

/**
 * Create a test config object
 */
export function createTest(
  name: string,
  description: string,
  method: TestConfig['method'],
  run: () => Promise<ExtractionResult>
): TestConfig {
  return { name, description, method, run };
}

/**
 * Parse command line arguments for run count
 */
export function parseRunsFromArgs(
  defaultRuns: number = CONFIG.defaultRuns
): number {
  const args = process.argv.slice(2);
  const runsArg = args.find((arg) => arg.startsWith('--runs='));
  if (runsArg) {
    const runs = parseInt(runsArg.split('=')[1], 10);
    if (!isNaN(runs) && runs > 0) {
      return runs;
    }
  }
  // Also check for positional argument
  const numArg = args.find((arg) => /^\d+$/.test(arg));
  if (numArg) {
    return parseInt(numArg, 10);
  }
  return defaultRuns;
}
