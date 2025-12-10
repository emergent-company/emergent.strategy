/**
 * Statistics utilities for extraction tests
 */

import { TestRunResult, TestSummary } from './types.js';

/**
 * Calculate the mean of an array of numbers
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate the standard deviation of an array of numbers
 */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

/**
 * Calculate min of an array
 */
export function min(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

/**
 * Calculate max of an array
 */
export function max(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

/**
 * Calculate percentile of an array
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate test statistics from run results
 */
export function calculateStats(runs: TestRunResult[]): TestSummary['stats'] {
  const successfulRuns = runs.filter((r) => r.result.success);
  const durations = successfulRuns.map((r) => r.result.durationMs);
  const entityCounts = successfulRuns.map((r) => r.result.entities.length);

  return {
    successRate:
      runs.length > 0 ? (successfulRuns.length / runs.length) * 100 : 0,
    avgDurationMs: mean(durations),
    minDurationMs: min(durations),
    maxDurationMs: max(durations),
    stdDevMs: stdDev(durations),
    avgEntities: mean(entityCounts),
    totalRuns: runs.length,
    successfulRuns: successfulRuns.length,
  };
}

/**
 * Create a test summary from runs
 */
export function createSummary(
  testName: string,
  method: string,
  runs: TestRunResult[]
): TestSummary {
  return {
    testName,
    method,
    runs,
    stats: calculateStats(runs),
  };
}

/**
 * Format duration as human readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

/**
 * Timer utility for measuring execution time
 */
export function createTimer(): { stop: () => number } {
  const start = performance.now();
  return {
    stop: () => Math.round(performance.now() - start),
  };
}

/**
 * Execute a function and measure its duration
 */
export async function timed<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const timer = createTimer();
  const result = await fn();
  return { result, durationMs: timer.stop() };
}
