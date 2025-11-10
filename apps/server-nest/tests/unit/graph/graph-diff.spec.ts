import { describe, it, expect } from 'vitest';
import { diffProperties } from '../../../src/graph/change-summary';

// NOTE: This focuses on unit-level verification of diffProperties utility without DB.

describe('diffProperties', () => {
  it('detects added, removed, and updated fields with JSON Pointer paths (including array growth)', () => {
    const prev = {
      title: 'Old',
      count: 1,
      nested: { a: 1, b: 2 },
      tags: ['x', 'y'],
    };
    const next = {
      title: 'New',
      count: 1,
      nested: { a: 1, c: 3 },
      tags: ['x', 'y', 'z'],
      extra: true,
    };
    const diff = diffProperties(prev, next)!;
    // Added paths: /nested/c, /tags/2 (new array element), /extra
    expect(diff.meta.added).toBe(3);
    // Removed: /nested/b
    expect(diff.meta.removed).toBe(1);
    // Updated scalar: /title only
    expect(diff.meta.updated).toBe(1);
    expect(diff.added).toHaveProperty('/nested/c', 3);
    expect(diff.added).toHaveProperty('/extra', true);
    expect(diff.added).toHaveProperty('/tags/2', 'z');
    expect(diff.removed).toContain('/nested/b');
    expect(diff.updated).toHaveProperty('/title');
    expect(diff.paths).toEqual(
      expect.arrayContaining([
        '/title',
        '/nested/c',
        '/nested/b',
        '/tags/2',
        '/extra',
      ])
    );
  });

  it('hashes large string values and marks truncated', () => {
    const large = 'a'.repeat(300);
    const prev = { big: large };
    const next = { big: large + 'b' };
    const diff = diffProperties(prev, next)!;
    const entry = diff.updated?.['/big'];
    expect(entry).toBeTruthy();
    expect(entry.truncated).toBe(true);
    expect(entry.from_hash).toMatch(/^sha256:/);
    expect(entry.to_hash).toMatch(/^sha256:/);
  });

  it('returns null on no-op', () => {
    const doc = { a: 1, b: { c: 2 } };
    const diff = diffProperties(doc, JSON.parse(JSON.stringify(doc)));
    expect(diff).toBeNull();
  });

  it('elides updated block when exceeding max size', () => {
    const prev: Record<string, number> = {};
    const next: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      prev['k' + i] = i;
      next['k' + i] = i + 1;
    }
    const diff = diffProperties(prev, next, { maxSummaryBytes: 512 })!; // force compaction
    expect(diff.meta.truncated).toBe(true);
    // updated replaced with count + elided
    expect((diff.updated as any).elided).toBe(true);
  });

  it('diffs arrays positionally', () => {
    const prev = { arr: [1, 2, 3] };
    const next = { arr: [1, 4, 3, 5] };
    const diff = diffProperties(prev, next)!;
    // Updated index 1, added index 3
    expect(diff.updated).toHaveProperty('/arr/1');
    expect(diff.added).toHaveProperty('/arr/3', 5);
    // No removal
    expect(diff.meta.removed).toBe(0);
  });
});
