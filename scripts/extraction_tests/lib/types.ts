/**
 * Shared types for extraction tests
 */

export interface ExtractedEntity {
  name: string;
  type: string;
  description?: string;
  confidence?: number;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ExtractionResult {
  success: boolean;
  entities: ExtractedEntity[];
  durationMs: number;
  error?: string;
  promptLength?: number;
  tokenUsage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  /** Number of entities with non-empty properties */
  entitiesWithProperties?: number;
  /** Total count of all properties across all entities */
  totalPropertyCount?: number;
  /** Raw response text (for debugging) */
  rawResponse?: string;
}

export interface TestRunResult {
  runNumber: number;
  result: ExtractionResult;
  timestamp: Date;
}

export interface TestSummary {
  testName: string;
  method: string;
  runs: TestRunResult[];
  stats: {
    successRate: number;
    avgDurationMs: number;
    minDurationMs: number;
    maxDurationMs: number;
    stdDevMs: number;
    avgEntities: number;
    totalRuns: number;
    successfulRuns: number;
  };
}

export interface TestConfig {
  name: string;
  description: string;
  method:
    | 'json_prompting'
    | 'function_calling'
    | 'structured_output'
    | 'json_freeform'
    | 'text_generation';
  run: () => Promise<ExtractionResult>;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
