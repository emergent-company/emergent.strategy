import { describe, it, expect } from 'vitest';
import { getActivatedItemParentKeys } from '../../../src/utils/sidebar/activation';

interface Item { id: string; url: string }

const flat: Item[] = [
    { id: 'home', url: '/admin' },
    { id: 'docs', url: '/admin/documents' },
    { id: 'deep', url: '/admin/deep' }
];

describe('getActivatedItemParentKeys', () => {
    it('returns set containing matching id when url matches', () => {
        const active = getActivatedItemParentKeys(flat, '/admin/documents');
        expect([...active]).toEqual(['docs']);
    });

    it('returns empty array when no match', () => {
        const active = getActivatedItemParentKeys(flat, '/admin/unknown');
        expect(active.size).toBe(0);
    });

    it('prefers first match in depth-first traversal', () => {
        const dupFlat: Item[] = [
            { id: 'x', url: '/same' },
            { id: 'y', url: '/same' }
        ];
        const active = getActivatedItemParentKeys(dupFlat, '/same');
        expect(active.size).toBe(1);
        expect([...active][0]).toBe('x');
    });
});
