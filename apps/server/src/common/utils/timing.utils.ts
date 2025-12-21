/**
 * Timing utilities for measuring async operation durations.
 *
 * Eliminates the common pattern of:
 * ```ts
 * const startTime = Date.now();
 * const result = await someOperation();
 * const durationMs = Date.now() - startTime;
 * this.logger.log(`Operation took ${durationMs}ms`);
 * ```
 *
 * @example
 * const { result, durationMs } = await measureDurationAsync(() =>
 *   this.someService.heavyOperation()
 * );
 * this.logger.log(`Operation completed in ${durationMs}ms`);
 */

/**
 * Result of a timed async operation.
 */
export interface TimedResult<T> {
  /** The result of the async operation */
  result: T;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Measure the duration of an async function.
 *
 * @param fn - Async function to measure
 * @returns Object containing the result and duration in milliseconds
 *
 * @example
 * const { result, durationMs } = await measureDurationAsync(() =>
 *   this.db.query('SELECT * FROM large_table')
 * );
 * this.logger.log(`Query returned ${result.rows.length} rows in ${durationMs}ms`);
 */
export async function measureDurationAsync<T>(
  fn: () => Promise<T>
): Promise<TimedResult<T>> {
  const startTime = Date.now();
  const result = await fn();
  const durationMs = Date.now() - startTime;
  return { result, durationMs };
}

/**
 * Measure the duration of a sync function.
 *
 * @param fn - Sync function to measure
 * @returns Object containing the result and duration in milliseconds
 *
 * @example
 * const { result, durationMs } = measureDurationSync(() =>
 *   JSON.parse(largeJsonString)
 * );
 */
export function measureDurationSync<T>(fn: () => T): TimedResult<T> {
  const startTime = Date.now();
  const result = fn();
  const durationMs = Date.now() - startTime;
  return { result, durationMs };
}

/**
 * Create a simple stopwatch for manual timing.
 *
 * @returns Object with elapsed() method that returns ms since creation
 *
 * @example
 * const timer = createStopwatch();
 * await step1();
 * this.logger.log(`Step 1: ${timer.elapsed()}ms`);
 * await step2();
 * this.logger.log(`Total: ${timer.elapsed()}ms`);
 */
export function createStopwatch(): { elapsed: () => number } {
  const startTime = Date.now();
  return {
    elapsed: () => Date.now() - startTime,
  };
}

/**
 * Format duration in human-readable form.
 *
 * @param durationMs - Duration in milliseconds
 * @returns Formatted string (e.g., "1.5s", "250ms", "2m 30s")
 *
 * @example
 * formatDuration(150)    // "150ms"
 * formatDuration(1500)   // "1.5s"
 * formatDuration(90000)  // "1m 30s"
 */
export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.round((durationMs % 60000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
