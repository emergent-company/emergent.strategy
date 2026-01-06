/**
 * PostgreSQL Text Sanitization Utilities
 *
 * Provides functions to sanitize text content before storing in PostgreSQL
 * to prevent "unsupported Unicode escape sequence" and other encoding errors.
 *
 * PostgreSQL's text and JSONB types have specific requirements:
 * - No null bytes (\u0000 or \x00)
 * - Valid Unicode escape sequences in JSONB (\uXXXX must have valid hex)
 * - No invalid surrogate pairs
 *
 * @see https://www.postgresql.org/docs/current/datatype-json.html
 */

/**
 * Options for sanitization behavior
 */
export interface SanitizeOptions {
  /**
   * Remove all control characters (except tab, newline, carriage return).
   * Default: true
   */
  removeControlChars?: boolean;

  /**
   * Handle invalid Unicode escape sequences that PostgreSQL can't parse.
   * Default: true
   */
  handleInvalidUnicodeEscapes?: boolean;

  /**
   * Replace removed characters with this string (empty = just remove).
   * Default: '' (remove without replacement)
   */
  replacement?: string;

  /**
   * Log sanitization stats if characters were removed.
   * Default: false
   */
  logStats?: boolean;
}

/**
 * Result of sanitization with statistics
 */
export interface SanitizeResult {
  /** The sanitized text */
  text: string;
  /** Whether any characters were removed/replaced */
  modified: boolean;
  /** Number of characters removed */
  removedCount: number;
  /** Original character count */
  originalLength: number;
  /** Final character count */
  finalLength: number;
}

/**
 * Default sanitization options
 */
const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
  removeControlChars: true,
  handleInvalidUnicodeEscapes: true,
  replacement: '',
  logStats: false,
};

/**
 * Sanitize text for PostgreSQL storage.
 *
 * Handles:
 * - Null bytes (\x00, \u0000) - completely unsupported by PostgreSQL text type
 * - Control characters (\x01-\x08, \x0B, \x0C, \x0E-\x1F) - can cause issues
 * - Invalid Unicode escape sequences (\uXXXX where XXXX is invalid)
 * - Invalid surrogate pairs
 *
 * @param text - The text to sanitize
 * @param options - Sanitization options
 * @returns Sanitized text safe for PostgreSQL
 *
 * @example
 * ```ts
 * // Basic usage
 * const safe = sanitizeForPostgres(unsafeText);
 *
 * // With options
 * const safe = sanitizeForPostgres(unsafeText, { replacement: '?' });
 *
 * // Get statistics
 * const result = sanitizeForPostgresWithStats(unsafeText);
 * if (result.modified) {
 *   console.log(`Removed ${result.removedCount} invalid characters`);
 * }
 * ```
 */
export function sanitizeForPostgres(
  text: string | null | undefined,
  options?: SanitizeOptions
): string {
  if (!text) return text ?? '';
  return sanitizeForPostgresWithStats(text, options).text;
}

/**
 * Sanitize text for PostgreSQL with detailed statistics.
 *
 * @param text - The text to sanitize
 * @param options - Sanitization options
 * @returns Object with sanitized text and statistics
 */
export function sanitizeForPostgresWithStats(
  text: string,
  options?: SanitizeOptions
): SanitizeResult {
  if (!text) {
    return {
      text: text ?? '',
      modified: false,
      removedCount: 0,
      originalLength: 0,
      finalLength: 0,
    };
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalLength = text.length;
  let sanitized = text;
  let totalRemoved = 0;

  // Step 1: Remove null bytes (always - these are never valid in PostgreSQL text)
  // This is the most common cause of "unsupported Unicode escape sequence" errors
  const nullBytePattern = /\x00/g;
  const nullMatches = sanitized.match(nullBytePattern);
  if (nullMatches) {
    totalRemoved += nullMatches.length;
    sanitized = sanitized.replace(nullBytePattern, opts.replacement);
  }

  // Step 2: Remove other problematic control characters
  // Keep: \x09 (tab), \x0A (newline), \x0D (carriage return)
  // Remove: \x01-\x08, \x0B, \x0C, \x0E-\x1F
  if (opts.removeControlChars) {
    const controlCharPattern = /[\x01-\x08\x0B\x0C\x0E-\x1F]/g;
    const controlMatches = sanitized.match(controlCharPattern);
    if (controlMatches) {
      totalRemoved += controlMatches.length;
      sanitized = sanitized.replace(controlCharPattern, opts.replacement);
    }
  }

  // Step 3: Handle invalid Unicode escape sequences
  // PostgreSQL JSONB throws "unsupported Unicode escape sequence" when it sees:
  // - \uXXXX where XXXX is not exactly 4 hex digits
  // - \u followed by non-hex characters
  // - Incomplete sequences like \u00 or \u123
  //
  // We escape the backslash in invalid sequences to prevent PostgreSQL from
  // trying to interpret them as Unicode escapes.
  if (opts.handleInvalidUnicodeEscapes) {
    // Pattern matches \u that is NOT followed by exactly 4 hex digits
    // This includes: \u, \u1, \u12, \u123, \uXXXX (non-hex), etc.
    const invalidUnicodePattern = /\\u(?![0-9a-fA-F]{4}(?![0-9a-fA-F]))/g;
    const unicodeMatches = sanitized.match(invalidUnicodePattern);
    if (unicodeMatches) {
      // Don't count as "removed" since we're escaping, not removing
      // But we are modifying the content
      sanitized = sanitized.replace(invalidUnicodePattern, '\\\\u');
    }

    // Also handle lone backslashes at end of string that might cause issues
    // when followed by content in concatenation
    if (sanitized.endsWith('\\') && !sanitized.endsWith('\\\\')) {
      sanitized = sanitized.slice(0, -1) + '\\\\';
    }
  }

  // Step 4: Remove invalid surrogate pairs (characters that can't be encoded in UTF-8)
  // These are Unicode code points in the range U+D800 to U+DFFF
  // They should only appear in valid pairs, lone surrogates are invalid
  const surrogatePattern = /[\uD800-\uDFFF]/g;
  const surrogateMatches = sanitized.match(surrogatePattern);
  if (surrogateMatches) {
    // Check if they're valid pairs or lone surrogates
    // A valid pair is a high surrogate (D800-DBFF) followed by low surrogate (DC00-DFFF)
    // For simplicity, we remove all lone surrogates
    const loneSurrogatePattern =
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
    const loneMatches = sanitized.match(loneSurrogatePattern);
    if (loneMatches) {
      totalRemoved += loneMatches.length;
      sanitized = sanitized.replace(loneSurrogatePattern, opts.replacement);
    }
  }

  const finalLength = sanitized.length;
  const modified = sanitized !== text;

  if (opts.logStats && modified) {
    console.log(
      `[PostgreSQL Sanitize] Cleaned text: ${originalLength} -> ${finalLength} chars (removed ${totalRemoved})`
    );
  }

  return {
    text: sanitized,
    modified,
    removedCount: totalRemoved,
    originalLength,
    finalLength,
  };
}

/**
 * Check if text contains characters that would need sanitization.
 * Useful for validation without modifying the text.
 *
 * @param text - The text to check
 * @returns true if the text contains problematic characters
 */
export function needsPostgresSanitization(
  text: string | null | undefined
): boolean {
  if (!text) return false;

  // Check for null bytes
  if (/\x00/.test(text)) return true;

  // Check for control characters
  if (/[\x01-\x08\x0B\x0C\x0E-\x1F]/.test(text)) return true;

  // Check for invalid Unicode escapes (common in PDF extraction)
  if (/\\u(?![0-9a-fA-F]{4}(?![0-9a-fA-F]))/.test(text)) return true;

  // Check for lone surrogates
  if (
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
      text
    )
  )
    return true;

  return false;
}

/**
 * Sanitize an object's string values recursively for PostgreSQL storage.
 * Useful for sanitizing entire metadata objects or JSON payloads.
 *
 * @param obj - The object to sanitize
 * @param options - Sanitization options
 * @returns A new object with all string values sanitized
 */
export function sanitizeObjectForPostgres<T>(
  obj: T,
  options?: SanitizeOptions
): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeForPostgres(obj, options) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      sanitizeObjectForPostgres(item, options)
    ) as unknown as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObjectForPostgres(value, options);
    }
    return result as T;
  }

  return obj;
}
