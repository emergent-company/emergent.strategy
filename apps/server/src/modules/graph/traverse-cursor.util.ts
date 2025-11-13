export interface TraverseCursorPayload {
  d: number;
  id: string;
}

export function encodeTraverseCursor(depth: number, id: string): string {
  const payload: TraverseCursorPayload = { d: depth, id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeTraverseCursor(
  cursor: string | null | undefined
): TraverseCursorPayload | null {
  if (!cursor) return null;
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (typeof parsed.d === 'number' && typeof parsed.id === 'string')
      return { d: parsed.d, id: parsed.id };
    return null;
  } catch {
    return null;
  }
}
