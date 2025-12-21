/**
 * Common utility exports.
 *
 * Re-exports utilities for convenient importing:
 * ```ts
 * import { measureDurationAsync, ChunkerService } from '@/common/utils';
 * ```
 */

// Timing utilities
export {
  measureDurationAsync,
  measureDurationSync,
  createStopwatch,
  formatDuration,
  TimedResult,
} from './timing.utils';

// Chunking utilities
export * from './chunking';

// Services are typically imported via the UtilsModule, but can be re-exported here
// export { ChunkerService } from './chunker.service';
// export { HashService } from './hash.service';
