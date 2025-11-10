import { describe, it, expect } from 'vitest';
import {
    generateDiff,
    computeContentHash,
    isNoOpChange,
    extractChangedPaths,
    hasOverlappingPaths,
    type DiffSummary,
} from '../../../src/modules/graph/diff.util';

describe('diff.util', () => {
    describe('generateDiff', () => {
        // AT-P0-DIFF-1: Added/removed/updated classification correct for nested objects & arrays
        it('AT-P0-DIFF-1: correctly classifies added, removed, and updated fields', () => {
            const oldObj = {
                keepSame: 'unchanged',
                toRemove: 'gone',
                toUpdate: 'old value',
                nested: {
                    keepSame: 1,
                    toRemove: 2,
                    toUpdate: 3,
                },
            };

            const newObj = {
                keepSame: 'unchanged',
                toUpdate: 'new value',
                added: 'fresh',
                nested: {
                    keepSame: 1,
                    toUpdate: 30,
                    added: 4,
                },
            };

            const diff = generateDiff(oldObj, newObj);

            // Check added
            expect(diff.added).toBeDefined();
            expect(diff.added?.['/added']).toBe('fresh');
            expect(diff.added?.['/nested/added']).toBe(4);

            // Check removed
            expect(diff.removed).toBeDefined();
            expect(diff.removed).toContain('/toRemove');
            expect(diff.removed).toContain('/nested/toRemove');

            // Check updated
            expect(diff.updated).toBeDefined();
            expect(diff.updated?.['/toUpdate']).toEqual({ from: 'old value', to: 'new value' });
            expect(diff.updated?.['/nested/toUpdate']).toEqual({ from: 3, to: 30 });

            // Check meta
            expect(diff.meta.added).toBe(2);
            expect(diff.meta.removed).toBe(2);
            expect(diff.meta.updated).toBe(2);

            // Check paths (union of all changes, sorted)
            expect(diff.paths).toContain('/added');
            expect(diff.paths).toContain('/toRemove');
            expect(diff.paths).toContain('/toUpdate');
            expect(diff.paths).toContain('/nested/added');
            expect(diff.paths).toContain('/nested/toRemove');
            expect(diff.paths).toContain('/nested/toUpdate');
        });

        it('handles arrays positionally', () => {
            const oldObj = { items: ['a', 'b', 'c'] };
            const newObj = { items: ['a', 'x', 'c', 'd'] };

            const diff = generateDiff(oldObj, newObj);

            // Index 1 updated, index 3 added
            expect(diff.updated?.['/items/1']).toEqual({ from: 'b', to: 'x' });
            expect(diff.added?.['/items/3']).toBe('d');
            expect(diff.meta.updated).toBe(1);
            expect(diff.meta.added).toBe(1);
        });

        it('handles array removals', () => {
            const oldObj = { items: ['a', 'b', 'c'] };
            const newObj = { items: ['a'] };

            const diff = generateDiff(oldObj, newObj);

            expect(diff.removed).toContain('/items/1');
            expect(diff.removed).toContain('/items/2');
            expect(diff.meta.removed).toBe(2);
        });

        it('handles nested arrays', () => {
            const oldObj = { matrix: [[1, 2], [3, 4]] };
            const newObj = { matrix: [[1, 2], [3, 5]] };

            const diff = generateDiff(oldObj, newObj);

            expect(diff.updated?.['/matrix/1/1']).toEqual({ from: 4, to: 5 });
            expect(diff.meta.updated).toBe(1);
        });

        it('handles type changes', () => {
            const oldObj = { field: 'string' };
            const newObj = { field: 42 };

            const diff = generateDiff(oldObj, newObj);

            expect(diff.updated?.['/field']).toEqual({ from: 'string', to: 42 });
        });

        // AT-P0-DIFF-2: Large field hashed with truncated=true
        it('AT-P0-DIFF-2: truncates large strings', () => {
            const longString = 'x'.repeat(300);
            const oldObj = { text: longString };
            const newObj = { text: longString + 'y' };

            const diff = generateDiff(oldObj, newObj, { stringTruncateThreshold: 256 });

            expect(diff.updated?.['/text']?.from).toHaveProperty('truncated', true);
            expect(diff.updated?.['/text']?.from).toHaveProperty('hash');
            expect(diff.updated?.['/text']?.to).toHaveProperty('truncated', true);
            expect(diff.updated?.['/text']?.to).toHaveProperty('hash');
        });

        it('AT-P0-DIFF-2: truncates large objects', () => {
            const largeObj = { data: 'x'.repeat(3000) };
            const oldObj = { nested: largeObj };
            const newObj = { nested: { ...largeObj, extra: 'y' } };

            const diff = generateDiff(oldObj, newObj, { objectTruncateThreshold: 2048 });

            expect(diff.updated?.['/nested']?.from).toHaveProperty('truncated', true);
            expect(diff.updated?.['/nested']?.from).toHaveProperty('hash');
        });

        // AT-P0-DIFF-3: No-op update (identical properties) does not create noise
        it('AT-P0-DIFF-3: detects no-op changes', () => {
            const obj = { a: 1, b: 'test', c: { nested: true } };
            const diff = generateDiff(obj, obj);

            expect(diff.meta.added).toBe(0);
            expect(diff.meta.removed).toBe(0);
            expect(diff.meta.updated).toBe(0);
            expect(diff.paths).toHaveLength(0);
            expect(isNoOpChange(diff)).toBe(true);
        });

        it('AT-P0-DIFF-3: detects no-op with null/undefined', () => {
            expect(isNoOpChange(generateDiff(null, null))).toBe(true);
            expect(isNoOpChange(generateDiff(undefined, undefined))).toBe(true);
            expect(isNoOpChange(generateDiff({}, {}))).toBe(true);
        });

        // AT-P0-DIFF-4: Conflict path overlap detection
        it('AT-P0-DIFF-4: detects overlapping changed paths', () => {
            const base = { a: 1, b: 2, c: 3 };
            const v1 = { a: 10, b: 2, c: 3 }; // Changed 'a'
            const v2 = { a: 100, b: 2, c: 30 }; // Changed 'a' and 'c'

            const diff1 = generateDiff(base, v1);
            const diff2 = generateDiff(base, v2);

            expect(hasOverlappingPaths(diff1, diff2)).toBe(true); // Both changed 'a'
            expect(extractChangedPaths(diff1)).toContain('/a');
            expect(extractChangedPaths(diff2)).toContain('/a');
            expect(extractChangedPaths(diff2)).toContain('/c');
        });

        it('AT-P0-DIFF-4: detects non-overlapping paths', () => {
            const base = { a: 1, b: 2, c: 3 };
            const v1 = { a: 10, b: 2, c: 3 }; // Changed 'a'
            const v2 = { a: 1, b: 20, c: 3 }; // Changed 'b'

            const diff1 = generateDiff(base, v1);
            const diff2 = generateDiff(base, v2);

            expect(hasOverlappingPaths(diff1, diff2)).toBe(false);
        });

        it('handles null and undefined values', () => {
            const oldObj = { a: null, b: undefined, c: 'text' };
            const newObj = { a: 'now string', b: null, d: 'added' };

            const diff = generateDiff(oldObj, newObj);

            expect(diff.updated?.['/a']).toEqual({ from: null, to: 'now string' });
            expect(diff.updated?.['/b']).toEqual({ from: undefined, to: null });
            expect(diff.removed).toContain('/c');
            expect(diff.added?.['/d']).toBe('added');
        });

        it('escapes JSON Pointer special characters', () => {
            const oldObj = { 'a~b': 1, 'c/d': 2 };
            const newObj = { 'a~b': 10, 'c/d': 2 };

            const diff = generateDiff(oldObj, newObj);

            // ~ becomes ~0, / becomes ~1
            expect(diff.updated).toHaveProperty('/a~0b');
            expect(diff.paths).toContain('/a~0b');
        });

        it('handles deep nesting', () => {
            const oldObj = { l1: { l2: { l3: { l4: { value: 'old' } } } } };
            const newObj = { l1: { l2: { l3: { l4: { value: 'new' } } } } };

            const diff = generateDiff(oldObj, newObj);

            expect(diff.updated?.['/l1/l2/l3/l4/value']).toEqual({ from: 'old', to: 'new' });
            expect(diff.meta.updated).toBe(1);
        });

        it('respects maxChangeSummaryBytes cap', () => {
            // Create two large objects with many differences
            // Each field change will be in the 'updated' section with both from and to values
            const oldObj: any = {};
            const newObj: any = {};
            for (let i = 0; i < 50; i++) {
                oldObj[`field${i}`] = `old_value_${i}_${'x'.repeat(50)}`;
                newObj[`field${i}`] = `new_value_${i}_${'y'.repeat(50)}`;
            }

            const diff = generateDiff(oldObj, newObj, { maxChangeSummaryBytes: 1024 });

            // Should elide updated details but keep paths
            expect(diff.paths.length).toBeGreaterThan(0);
            expect(diff.meta.elided).toBe(true);
            expect(diff.updated).toBeUndefined(); // Details elided
            expect(diff.added).toBeUndefined();
            expect(diff.removed).toBeUndefined();
        });

        it('handles float tolerance', () => {
            const oldObj = { value: 1.0000001 };
            const newObj = { value: 1.0000002 };

            const diffStrict = generateDiff(oldObj, newObj, { floatTolerance: 0 });
            expect(diffStrict.meta.updated).toBe(1);

            const diffTolerant = generateDiff(oldObj, newObj, { floatTolerance: 1e-6 });
            expect(diffTolerant.meta.updated).toBe(0);
        });
    });

    describe('computeContentHash', () => {
        it('produces consistent hash for same content', () => {
            const obj = { b: 2, a: 1, c: 3 };
            const hash1 = computeContentHash(obj);
            const hash2 = computeContentHash(obj);
            expect(hash1.equals(hash2)).toBe(true);
        });

        it('produces consistent hash regardless of key order', () => {
            const obj1 = { a: 1, b: 2, c: 3 };
            const obj2 = { c: 3, b: 2, a: 1 };
            const hash1 = computeContentHash(obj1);
            const hash2 = computeContentHash(obj2);
            expect(hash1.equals(hash2)).toBe(true);
        });

        it('produces different hash for different content', () => {
            const obj1 = { a: 1 };
            const obj2 = { a: 2 };
            const hash1 = computeContentHash(obj1);
            const hash2 = computeContentHash(obj2);
            expect(hash1.equals(hash2)).toBe(false);
        });

        it('handles null and undefined', () => {
            const hash1 = computeContentHash(null);
            const hash2 = computeContentHash(undefined);
            const hash3 = computeContentHash({});
            expect(hash1.equals(hash2)).toBe(true);
            expect(hash1.equals(hash3)).toBe(true);
        });

        it('produces SHA-256 digest', () => {
            const obj = { test: 'data' };
            const hash = computeContentHash(obj);
            expect(hash).toBeInstanceOf(Buffer);
            expect(hash.length).toBe(32); // SHA-256 produces 32 bytes
        });
    });

    describe('extractChangedPaths', () => {
        it('extracts all paths from diff', () => {
            const diff: DiffSummary = {
                added: { '/a': 1 },
                removed: ['/b'],
                updated: { '/c': { from: 1, to: 2 } },
                paths: ['/a', '/b', '/c'],
                meta: { added: 1, removed: 1, updated: 1, propBytesBefore: 10, propBytesAfter: 12 },
            };
            const paths = extractChangedPaths(diff);
            expect(paths).toEqual(['/a', '/b', '/c']);
        });

        it('returns empty array for null/undefined', () => {
            expect(extractChangedPaths(null)).toEqual([]);
            expect(extractChangedPaths(undefined)).toEqual([]);
        });
    });

    describe('hasOverlappingPaths', () => {
        it('detects overlap', () => {
            const diff1: DiffSummary = {
                paths: ['/a', '/b'],
                meta: { added: 0, removed: 0, updated: 2, propBytesBefore: 0, propBytesAfter: 0 },
            };
            const diff2: DiffSummary = {
                paths: ['/b', '/c'],
                meta: { added: 0, removed: 0, updated: 2, propBytesBefore: 0, propBytesAfter: 0 },
            };
            expect(hasOverlappingPaths(diff1, diff2)).toBe(true);
        });

        it('detects no overlap', () => {
            const diff1: DiffSummary = {
                paths: ['/a', '/b'],
                meta: { added: 0, removed: 0, updated: 2, propBytesBefore: 0, propBytesAfter: 0 },
            };
            const diff2: DiffSummary = {
                paths: ['/c', '/d'],
                meta: { added: 0, removed: 0, updated: 2, propBytesBefore: 0, propBytesAfter: 0 },
            };
            expect(hasOverlappingPaths(diff1, diff2)).toBe(false);
        });

        it('handles null/undefined', () => {
            const diff: DiffSummary = {
                paths: ['/a'],
                meta: { added: 1, removed: 0, updated: 0, propBytesBefore: 0, propBytesAfter: 0 },
            };
            expect(hasOverlappingPaths(null, diff)).toBe(false);
            expect(hasOverlappingPaths(diff, null)).toBe(false);
            expect(hasOverlappingPaths(null, null)).toBe(false);
        });
    });

    describe('isNoOpChange', () => {
        it('detects no-op', () => {
            const diff: DiffSummary = {
                paths: [],
                meta: { added: 0, removed: 0, updated: 0, propBytesBefore: 10, propBytesAfter: 10 },
            };
            expect(isNoOpChange(diff)).toBe(true);
        });

        it('detects changes', () => {
            const diff: DiffSummary = {
                paths: ['/a'],
                added: { '/a': 1 },
                meta: { added: 1, removed: 0, updated: 0, propBytesBefore: 0, propBytesAfter: 5 },
            };
            expect(isNoOpChange(diff)).toBe(false);
        });

        it('handles null/undefined', () => {
            expect(isNoOpChange(null)).toBe(true);
            expect(isNoOpChange(undefined)).toBe(true);
        });
    });
});
