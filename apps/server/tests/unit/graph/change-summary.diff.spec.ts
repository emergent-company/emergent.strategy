import { describe, it, expect } from 'vitest';
import { diffProperties } from '../../../src/graph/change-summary';

function makeBigObject(size: number, suffix: string) {
  const obj: Record<string, any> = {};
  for (let i = 0; i < size; i++) {
    obj['k' + i] = suffix + i;
  }
  return obj;
}

describe('diffProperties', () => {
  it('returns null for no-op (identical objects)', () => {
    const prev = { a: 1, nested: { x: true } };
    const next = { a: 1, nested: { x: true } };
    const diff = diffProperties(prev, next);
    expect(diff).toBeNull();
  });

  it('detects added properties', () => {
    const diff = diffProperties({}, { a: 1, b: { c: 2 } });
    expect(diff).not.toBeNull();
    expect(diff?.added).toBeTruthy();
    // Added paths appear with JSON Pointer style (/prop[/nested])
    expect(Object.keys(diff!.added!)).toContain('/a');
    expect(Object.keys(diff!.added!)).toContain('/b');
    expect(diff!.meta.added).toBe(2);
    expect(diff!.paths).toEqual(['/a', '/b']);
    expect(diff!.meta.noOp).toBeUndefined();
  });

  it('detects removed properties', () => {
    const diff = diffProperties({ a: 1, b: 2 }, { a: 1 });
    expect(diff).not.toBeNull();
    expect(diff!.removed).toContain('/b');
    expect(diff!.meta.removed).toBe(1);
  });

  it('detects updated scalar property', () => {
    const diff = diffProperties({ a: 1 }, { a: 2 });
    expect(diff).not.toBeNull();
    expect(diff!.updated).toHaveProperty('/a');
    const u = (diff!.updated as any)['/a'];
    expect(u.from).toBe(1);
    expect(u.to).toBe(2);
    expect(diff!.meta.updated).toBe(1);
  });

  it('hashes & truncates large string additions', () => {
    const large = 'x'.repeat(300); // > default threshold 256
    const diff = diffProperties({}, { big: large });
    expect(diff).not.toBeNull();
    const addedVal: any = diff!.added!['/big'];
    expect(addedVal).toBeTruthy();
    // Large value additions are summarized with to_hash + truncated flag
    expect(addedVal.to_hash).toMatch(/^sha256:/);
    expect(addedVal.truncated).toBe(true);
    expect(diff!.meta.added).toBe(1);
  });

  it('marks summary truncated when exceeding maxSummaryBytes and elides updated details', () => {
    // Create lots of updated keys to inflate size then set very small maxSummaryBytes
    const prev = makeBigObject(20, 'p');
    const next = makeBigObject(20, 'n');
    const diff = diffProperties(prev, next, { maxSummaryBytes: 200 });
    expect(diff).not.toBeNull();
    expect(diff!.meta.truncated).toBe(true);
    // When truncated due to size, updated is replaced by elided summary
    if (diff!.updated && !('elided' in (diff!.updated as any))) {
      // If compaction heuristic didn't trigger (edge case) ensure test still passes logically
      // but normally we expect elided true
      // Force fail to surface regression in compaction path
      throw new Error(
        'Expected updated to be elided when meta.truncated is true'
      );
    }
    expect((diff!.updated as any).elided).toBe(true);
  });
});
