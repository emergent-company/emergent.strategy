import { PredicateDto, PredicateOperator } from './dto/predicate.dto';

/**
 * Evaluate a property value against a JSON Pointer path.
 * Implements RFC 6901 JSON Pointer resolution.
 *
 * @param obj Object to extract value from
 * @param path JSON Pointer path (e.g., "/status", "/metadata/priority")
 * @returns Extracted value or undefined if path doesn't exist
 */
export function resolveJsonPointer(obj: any, path: string): any {
  if (!path || !path.startsWith('/')) return undefined;
  if (path === '/') return obj;

  const parts = path
    .slice(1)
    .split('/')
    .map((part) =>
      // Unescape JSON Pointer special characters
      part.replace(/~1/g, '/').replace(/~0/g, '~')
    );

  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Evaluate a predicate against an object's properties.
 *
 * @param obj Object (or properties JSONB) to test
 * @param predicate Predicate to evaluate
 * @returns true if predicate matches, false otherwise
 */
export function evaluatePredicate(obj: any, predicate: PredicateDto): boolean {
  const value = resolveJsonPointer(obj, predicate.path);

  switch (predicate.operator) {
    case 'exists':
      return value !== null && value !== undefined;

    case 'notExists':
      return value === null || value === undefined;

    case 'equals':
      return value === predicate.value;

    case 'notEquals':
      return value !== predicate.value;

    case 'contains':
      if (typeof value === 'string' && typeof predicate.value === 'string') {
        return value.includes(predicate.value);
      }
      if (Array.isArray(value)) {
        return value.includes(predicate.value);
      }
      return false;

    case 'greaterThan':
      if (typeof value === 'number' && typeof predicate.value === 'number') {
        return value > predicate.value;
      }
      if (typeof value === 'string' && typeof predicate.value === 'string') {
        return value > predicate.value;
      }
      return false;

    case 'lessThan':
      if (typeof value === 'number' && typeof predicate.value === 'number') {
        return value < predicate.value;
      }
      if (typeof value === 'string' && typeof predicate.value === 'string') {
        return value < predicate.value;
      }
      return false;

    case 'greaterThanOrEqual':
      if (typeof value === 'number' && typeof predicate.value === 'number') {
        return value >= predicate.value;
      }
      if (typeof value === 'string' && typeof predicate.value === 'string') {
        return value >= predicate.value;
      }
      return false;

    case 'lessThanOrEqual':
      if (typeof value === 'number' && typeof predicate.value === 'number') {
        return value <= predicate.value;
      }
      if (typeof value === 'string' && typeof predicate.value === 'string') {
        return value <= predicate.value;
      }
      return false;

    case 'in':
      if (!Array.isArray(predicate.value)) return false;
      return predicate.value.includes(value);

    case 'notIn':
      if (!Array.isArray(predicate.value)) return false;
      return !predicate.value.includes(value);

    case 'matches':
      if (typeof value !== 'string' || typeof predicate.value !== 'string')
        return false;
      try {
        const regex = new RegExp(predicate.value);
        return regex.test(value);
      } catch {
        return false; // Invalid regex
      }

    default:
      return false;
  }
}

/**
 * Evaluate multiple predicates with AND logic.
 *
 * @param obj Object to test
 * @param predicates Array of predicates (all must match)
 * @returns true if all predicates match, false otherwise
 */
export function evaluatePredicates(
  obj: any,
  predicates: PredicateDto[]
): boolean {
  if (!predicates || predicates.length === 0) return true;
  return predicates.every((p) => evaluatePredicate(obj, p));
}
