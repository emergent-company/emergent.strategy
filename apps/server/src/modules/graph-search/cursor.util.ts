// Reusable opaque cursor helpers for deterministic forward pagination.
// Encodes score (rounded to 6 decimals) and id; consumers must ensure stable ordering.
export interface GraphCursorPayload {
  s: number;
  id: string;
  p?: number;
}
/**
 * Encode cursor with score (rounded), id, and optional positional index p (zero-based within fused pool).
 * p is included for contiguous, deterministic forward pagination without score/id boundary gaps.
 */
export function encodeGraphCursor(
  score: number,
  id: string,
  p?: number
): string {
  const payload: GraphCursorPayload = { s: Number(score.toFixed(6)), id };
  if (p !== undefined) payload.p = p;
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeGraphCursor(cursor: string): GraphCursorPayload | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
