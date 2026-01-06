/**
 * Common utility exports.
 *
 * Re-exports utilities for convenient importing:
 * ```ts
 * import { measureDurationAsync, ChunkerService } from '@/common/utils';
 * import { sanitizeForPostgres } from '@/common/utils';
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

// PostgreSQL sanitization utilities
export {
  sanitizeForPostgres,
  sanitizeForPostgresWithStats,
  sanitizeObjectForPostgres,
  needsPostgresSanitization,
  type SanitizeOptions,
  type SanitizeResult,
} from './postgres-sanitize';

// PPTX sanitization utilities (fixes Kreuzberg parsing bug)
export {
  sanitizePptx,
  needsPptxSanitization,
  isPptxFile,
  type PptxSanitizeResult,
} from './pptx-sanitize';

// Services are typically imported via the UtilsModule, but can be re-exported here
// export { ChunkerService } from './chunker.service';
// export { HashService } from './hash.service';
