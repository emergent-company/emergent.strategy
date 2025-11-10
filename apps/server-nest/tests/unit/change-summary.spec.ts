import { describe, it, expect } from 'vitest';
import { diffProperties } from '../../src/graph/change-summary';

describe('change-summary diffProperties', () => {
  it('detects added, removed, updated fields including nested', () => {
    const prev = { title: 'Old', meta: { a: 1, b: 2 }, arr: [1, 2] };
    const next = {
      title: 'New',
      meta: { a: 1, c: 3 },
      arr: [1, 2, 3],
      extra: true,
    };
    const summary = diffProperties(prev, next)!;
    expect(summary.meta.added).toBeGreaterThan(0);
    expect(summary.meta.updated).toBeGreaterThan(0);
    expect(summary.paths).toContain('/title');
    expect(summary.paths).toContain('/meta/b');
    expect(summary.paths).toContain('/meta/c');
    expect(summary.added).toHaveProperty('/arr/2');
    expect(summary.removed).toContain('/meta/b');
    expect(summary.updated).toHaveProperty('/title');
  });

  it('returns null for no-op', () => {
    const obj = { a: 1, nested: { b: 2 } };
    const summary = diffProperties(obj, JSON.parse(JSON.stringify(obj)));
    expect(summary).toBeNull();
  });

  it('hashes large strings', () => {
    const big = 'x'.repeat(300);
    const prev = { a: big };
    const next = { a: big + 'y' };
    const summary = diffProperties(prev, next, { largeStringThreshold: 64 })!;
    expect(summary.updated).toBeDefined();
    const upd = summary.updated!['/a'];
    expect(upd.truncated).toBe(true);
    expect(upd.to_hash).toMatch(/^sha256:/);
  });

  it('compacts when exceeding size cap', () => {
    const prev: any = {};
    const next: any = {};
    for (let i = 0; i < 200; i++) {
      prev['k' + i] = i;
      next['k' + i] = i + 1;
    }
    const summary = diffProperties(prev, next, { maxSummaryBytes: 1024 })!;
    expect(summary.meta.truncated).toBe(true);
  });
});
