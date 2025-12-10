/**
 * Extraction Tests Shared Library
 *
 * Central exports for all shared utilities used by extraction tests.
 *
 * Usage:
 * ```ts
 * import { CONFIG, createJsonModel, runTests, logger } from './lib/index.js';
 * ```
 */

// Configuration
export { CONFIG } from './config.js';
export type { ExtractionConfig } from './config.js';

// Types
export type {
  ExtractedEntity,
  ExtractionResult,
  TestRunResult,
  TestSummary,
  TestConfig,
  LogLevel,
} from './types.js';

// Model utilities
export {
  createModel,
  createJsonModel,
  createTextModel,
  invokeWithTimeout,
} from './model.js';
export type { ModelOptions } from './model.js';

// Prompts and schemas
export {
  TEST_DOCUMENTS,
  JSON_SCHEMAS,
  ZOD_SCHEMAS,
  ENTITY_TYPES,
  createJsonExtractionPrompt,
  createStructuredExtractionPrompt,
  createResponseSchema,
} from './prompts.js';
export type {
  EntityTypeDefinition,
  TestDocumentKey,
  SchemaKey,
} from './prompts.js';

// Statistics
export {
  mean,
  stdDev,
  min,
  max,
  percentile,
  calculateStats,
  createSummary,
  formatDuration,
  createTimer,
  timed,
} from './stats.js';

// Logger
export { logger, c } from './logger.js';
export {
  printHeader,
  printSubHeader,
  printEntity,
  printExtractionResult,
  printTestSummary,
  printRunProgress,
  printMultiTestSummary,
  logDebug,
  logInfo,
  logWarn,
  logError,
  logSuccess,
} from './logger.js';

// Tracing (Langfuse)
export {
  initLangfuse,
  getLangfuse,
  isTracingEnabled,
  createTestTrace,
  createGeneration,
  endGeneration,
  createSpan,
  endSpan,
  scoreTrace,
  finalizeTrace,
  flushTraces,
  shutdownTracing,
  withTracing,
  withGeneration,
} from './tracing.js';
export type { TestTraceContext } from './tracing.js';

// Test runner
export {
  runTest,
  runTests,
  quickRun,
  createTest,
  parseRunsFromArgs,
} from './runner.js';
export type { RunnerOptions } from './runner.js';
