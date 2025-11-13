import { TemporalFilterDto } from './dto/temporal-filter.dto';

/**
 * Build SQL WHERE clause for temporal filtering.
 *
 * @param filter Temporal filter configuration
 * @param tableAlias Optional table alias prefix (e.g., 'o' for 'o.created_at')
 * @returns Object with sqlClause and parameters array
 *
 * Examples:
 * - valid_from mode: "valid_from <= $1 AND (valid_to IS NULL OR valid_to > $1)"
 * - created_at mode: "created_at <= $1"
 * - updated_at mode: "updated_at <= $1"
 */
export function buildTemporalFilterClause(
  filter: TemporalFilterDto,
  tableAlias?: string
): { sqlClause: string; params: any[] } {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const field = filter.field ?? 'valid_from';
  const asOfTimestamp = filter.asOf;

  let sqlClause: string;

  if (field === 'valid_from') {
    // Check that item was valid at the asOf timestamp:
    // - Must have started (valid_from <= asOf)
    // - Must not have ended yet (valid_to IS NULL OR valid_to > asOf)
    sqlClause = `${prefix}valid_from <= $1 AND (${prefix}valid_to IS NULL OR ${prefix}valid_to > $1)`;
  } else if (field === 'created_at') {
    // Only include items created before or at asOf
    sqlClause = `${prefix}created_at <= $1`;
  } else if (field === 'updated_at') {
    // Only include items last updated before or at asOf
    sqlClause = `${prefix}updated_at <= $1`;
  } else {
    throw new Error(`Invalid temporal filter field: ${field}`);
  }

  return {
    sqlClause,
    params: [asOfTimestamp],
  };
}
