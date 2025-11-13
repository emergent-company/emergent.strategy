import { createHash } from 'crypto';

/**
 * JSON Pointer path diff generator per spec Section 5.17
 * Generates structured change summaries for object versioning and merge conflict detection.
 *
 * Format (RFC 6901 JSON Pointer paths):
 * {
 *   added: { "/path": value },
 *   removed: ["/path"],
 *   updated: { "/path": { from, to } or { from_hash, to_hash, truncated: true } },
 *   paths: ["/path1", "/path2", ...],
 *   meta: { added: N, removed: N, updated: N, propBytesBefore: N, propBytesAfter: N }
 * }
 */

export interface DiffSummary {
  added?: Record<string, any>;
  removed?: string[];
  updated?: Record<
    string,
    {
      from?: any;
      to?: any;
      from_hash?: string;
      to_hash?: string;
      truncated?: boolean;
    }
  >;
  paths: string[];
  meta: {
    added: number;
    removed: number;
    updated: number;
    propBytesBefore: number;
    propBytesAfter: number;
    /** True if updated details were elided due to size cap */
    elided?: boolean;
  };
}

export interface DiffOptions {
  /** Strings longer than this are hashed */
  stringTruncateThreshold?: number;
  /** JSON objects larger than this (serialized) are hashed */
  objectTruncateThreshold?: number;
  /** Maximum serialized size for entire change_summary */
  maxChangeSummaryBytes?: number;
  /** Floating point tolerance for near-equality */
  floatTolerance?: number;
}

const DEFAULT_OPTIONS: Required<DiffOptions> = {
  stringTruncateThreshold: 256,
  objectTruncateThreshold: 2048,
  maxChangeSummaryBytes: 16 * 1024,
  floatTolerance: 0,
};

/**
 * Escape special characters in JSON Pointer path component per RFC 6901
 * ~ becomes ~0, / becomes ~1
 */
function escapePointer(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Hash large values for truncation
 */
function hashValue(value: any): string {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  return (
    'sha256:' + createHash('sha256').update(json).digest('hex').substring(0, 16)
  );
}

/**
 * Summarize a value for diff output (truncate or hash if large)
 */
function summarizeValue(value: any, opts: Required<DiffOptions>): any {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (value.length > opts.stringTruncateThreshold) {
      return { truncated: true, hash: hashValue(value) };
    }
    return value;
  }

  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    if (json.length > opts.objectTruncateThreshold) {
      return { truncated: true, hash: hashValue(value) };
    }
    return value;
  }

  return value;
}

/**
 * Check if two values are equal (with optional float tolerance)
 */
function valuesEqual(a: any, b: any, opts: Required<DiffOptions>): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined)
    return a === b;

  // Float tolerance
  if (
    typeof a === 'number' &&
    typeof b === 'number' &&
    opts.floatTolerance > 0
  ) {
    return Math.abs(a - b) < opts.floatTolerance;
  }

  // Type mismatch
  if (typeof a !== typeof b) return false;

  // Deep equality for objects/arrays
  if (typeof a === 'object') {
    const aJson = JSON.stringify(a);
    const bJson = JSON.stringify(b);
    return aJson === bJson;
  }

  return false;
}

/**
 * Recursively diff two objects
 */
function diffObjects(
  oldObj: any,
  newObj: any,
  basePath: string,
  result: {
    added: Map<string, any>;
    removed: Set<string>;
    updated: Map<string, any>;
  },
  opts: Required<DiffOptions>
): void {
  // Handle null/undefined
  if (oldObj === null || oldObj === undefined) {
    if (newObj !== null && newObj !== undefined) {
      result.added.set(basePath, summarizeValue(newObj, opts));
    }
    return;
  }
  if (newObj === null || newObj === undefined) {
    result.removed.add(basePath);
    return;
  }

  // Handle type mismatch
  const oldType = Array.isArray(oldObj) ? 'array' : typeof oldObj;
  const newType = Array.isArray(newObj) ? 'array' : typeof newObj;

  if (oldType !== newType) {
    result.updated.set(basePath, {
      from: summarizeValue(oldObj, opts),
      to: summarizeValue(newObj, opts),
    });
    return;
  }

  // Handle scalars and arrays (treat arrays as atomic values)
  if (oldType !== 'object' || Array.isArray(oldObj)) {
    if (!valuesEqual(oldObj, newObj, opts)) {
      result.updated.set(basePath, {
        from: summarizeValue(oldObj, opts),
        to: summarizeValue(newObj, opts),
      });
    }
    return;
  }

  // Handle objects
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const sortedKeys = Array.from(allKeys).sort();

  for (const key of sortedKeys) {
    const path =
      basePath === ''
        ? `/${escapePointer(key)}`
        : `${basePath}/${escapePointer(key)}`;
    const oldVal = oldObj[key];
    const newVal = newObj[key];

    if (!(key in oldObj)) {
      result.added.set(path, summarizeValue(newVal, opts));
    } else if (!(key in newObj)) {
      result.removed.add(path);
    } else {
      // Both present - check if we should recurse or treat as atomic
      const oldValType = Array.isArray(oldVal) ? 'array' : typeof oldVal;
      const newValType = Array.isArray(newVal) ? 'array' : typeof newVal;

      // Check if objects are large - if so, treat as atomic (don't recurse)
      const shouldTreatAsAtomic =
        oldValType === 'object' &&
        newValType === 'object' &&
        !Array.isArray(oldVal) &&
        !Array.isArray(newVal) &&
        (JSON.stringify(oldVal).length > opts.objectTruncateThreshold ||
          JSON.stringify(newVal).length > opts.objectTruncateThreshold);

      if (shouldTreatAsAtomic) {
        // Large object - treat as atomic value
        if (!valuesEqual(oldVal, newVal, opts)) {
          result.updated.set(path, {
            from: summarizeValue(oldVal, opts),
            to: summarizeValue(newVal, opts),
          });
        }
      } else if (
        oldValType === 'object' &&
        newValType === 'object' &&
        !Array.isArray(oldVal) &&
        !Array.isArray(newVal)
      ) {
        // Small object - recurse
        diffObjects(oldVal, newVal, path, result, opts);
      } else if (oldValType === 'array' && newValType === 'array') {
        diffArrays(oldVal, newVal, path, result, opts);
      } else if (!valuesEqual(oldVal, newVal, opts)) {
        result.updated.set(path, {
          from: summarizeValue(oldVal, opts),
          to: summarizeValue(newVal, opts),
        });
      }
    }
  }
}

/**
 * Diff arrays (positional comparison)
 */
function diffArrays(
  oldArr: any[],
  newArr: any[],
  basePath: string,
  result: {
    added: Map<string, any>;
    removed: Set<string>;
    updated: Map<string, any>;
  },
  opts: Required<DiffOptions>
): void {
  const maxLen = Math.max(oldArr.length, newArr.length);

  for (let i = 0; i < maxLen; i++) {
    const path = `${basePath}/${i}`;

    if (i >= newArr.length) {
      result.removed.add(path);
    } else if (i >= oldArr.length) {
      result.added.set(path, summarizeValue(newArr[i], opts));
    } else {
      const oldVal = oldArr[i];
      const newVal = newArr[i];
      const oldType = Array.isArray(oldVal) ? 'array' : typeof oldVal;
      const newType = Array.isArray(newVal) ? 'array' : typeof newVal;

      if (
        oldType === 'object' &&
        newType === 'object' &&
        !Array.isArray(oldVal) &&
        !Array.isArray(newVal)
      ) {
        diffObjects(oldVal, newVal, path, result, opts);
      } else if (oldType === 'array' && newType === 'array') {
        diffArrays(oldVal, newVal, path, result, opts);
      } else if (!valuesEqual(oldVal, newVal, opts)) {
        result.updated.set(path, {
          from: summarizeValue(oldVal, opts),
          to: summarizeValue(newVal, opts),
        });
      }
    }
  }
}

/**
 * Generate diff summary between two objects
 */
export function generateDiff(
  oldObj: Record<string, any> | null | undefined,
  newObj: Record<string, any> | null | undefined,
  options: DiffOptions = {}
): DiffSummary {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const old = oldObj || {};
  const neu = newObj || {};

  const result = {
    added: new Map<string, any>(),
    removed: new Set<string>(),
    updated: new Map<string, any>(),
  };

  diffObjects(old, neu, '', result, opts);

  // Convert to final format
  const added =
    result.added.size > 0 ? Object.fromEntries(result.added) : undefined;
  const removed =
    result.removed.size > 0 ? Array.from(result.removed).sort() : undefined;
  const updated =
    result.updated.size > 0 ? Object.fromEntries(result.updated) : undefined;

  const allPaths = [
    ...Array.from(result.added.keys()),
    ...Array.from(result.removed),
    ...Array.from(result.updated.keys()),
  ].sort();

  const oldBytes = JSON.stringify(old).length;
  const newBytes = JSON.stringify(neu).length;

  const summary: DiffSummary = {
    ...(added && { added }),
    ...(removed && { removed }),
    ...(updated && { updated }),
    paths: allPaths,
    meta: {
      added: result.added.size,
      removed: result.removed.size,
      updated: result.updated.size,
      propBytesBefore: oldBytes,
      propBytesAfter: newBytes,
    },
  };

  // Check size cap
  const summaryBytes = JSON.stringify(summary).length;
  if (summaryBytes > opts.maxChangeSummaryBytes) {
    // Elide updated details, keep paths
    return {
      paths: allPaths,
      meta: {
        added: result.added.size,
        removed: result.removed.size,
        updated: result.updated.size,
        propBytesBefore: oldBytes,
        propBytesAfter: newBytes,
        elided: true,
      },
    };
  }

  return summary;
}

/**
 * Compute SHA-256 content hash of properties (deterministic key ordering)
 */
export function computeContentHash(
  properties: Record<string, any> | null | undefined
): Buffer {
  const props = properties || {};
  // Sort keys for deterministic hash
  const sorted = Object.keys(props)
    .sort()
    .reduce((acc, key) => {
      acc[key] = props[key];
      return acc;
    }, {} as Record<string, any>);
  const json = JSON.stringify(sorted);
  return createHash('sha256').update(json).digest();
}

/**
 * Check if change summary represents no-op (no actual changes)
 */
export function isNoOpChange(
  changeSummary: DiffSummary | null | undefined
): boolean {
  if (!changeSummary) return true;
  return (
    changeSummary.meta.added === 0 &&
    changeSummary.meta.removed === 0 &&
    changeSummary.meta.updated === 0
  );
}

/**
 * Extract all changed paths from change summary
 */
export function extractChangedPaths(
  changeSummary: DiffSummary | null | undefined
): string[] {
  return changeSummary?.paths || [];
}

/**
 * Check if two change summaries have overlapping paths
 */
export function hasOverlappingPaths(
  summary1: DiffSummary | null | undefined,
  summary2: DiffSummary | null | undefined
): boolean {
  const paths1 = new Set(extractChangedPaths(summary1));
  const paths2 = extractChangedPaths(summary2);
  return paths2.some((p) => paths1.has(p));
}
