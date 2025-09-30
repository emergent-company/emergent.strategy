import { describe, it, expect } from 'vitest';
import { pairIndependentHeads, MergeHeadRow } from '../merge.util';

function row(partial: Partial<MergeHeadRow>): MergeHeadRow {
    return {
        canonical_id: partial.canonical_id || crypto.randomUUID(),
        ...partial,
    } as MergeHeadRow;
}

describe('pairIndependentHeads', () => {
    it('returns empty array unchanged', () => {
        expect(pairIndependentHeads([])).toEqual([]);
    });

    it('returns rows unchanged when no (type,key) overlap', () => {
        const rows: MergeHeadRow[] = [
            row({ canonical_id: 'c1', target_id: 't1', target_type: 'Doc', target_key: 'A' }),
            row({ canonical_id: 'c2', source_id: 's1', source_type: 'Doc', source_key: 'B' })
        ];
        const out = pairIndependentHeads(rows);
        expect(out).toHaveLength(2);
        expect(out.find(r => r.target_id === 't1')).toBeTruthy();
        expect(out.find(r => r.source_id === 's1')).toBeTruthy();
    });

    it('pairs independent heads with matching (type,key) across branches', () => {
        const tgt = row({ canonical_id: 't-can', target_id: 't1', target_type: 'Cfg', target_key: 'shared' });
        const src = row({ canonical_id: 's-can', source_id: 's1', source_type: 'Cfg', source_key: 'shared' });
        const out = pairIndependentHeads([tgt, src]);
        // original independent rows removed
        expect(out.some(r => r === tgt || r === src)).toBe(false);
        // combined synthetic row present
        const combined = out.find(r => r.target_id === 't1' && r.source_id === 's1');
        expect(combined).toBeTruthy();
        expect(combined?.canonical_id).toBe('t-can'); // uses target canonical id
    });

    it('does not pair when canonical ids already match (already a joined row scenario)', () => {
        const tgt = row({ canonical_id: 'same', target_id: 't1', target_type: 'Doc', target_key: 'k1' });
        const src = row({ canonical_id: 'same', source_id: 's1', source_type: 'Doc', source_key: 'k1' });
        const out = pairIndependentHeads([tgt, src]);
        // Nothing is removed; both remain because they share canonical history.
        expect(out).toHaveLength(2);
    });

    it('respects existing cross-populated rows (safety guard)', () => {
        // If a row already has both sides populated we should leave it as-is.
        const hybrid: MergeHeadRow = {
            canonical_id: 'c-hybrid',
            target_id: 't1',
            source_id: 's1',
            target_type: 'Doc',
            source_type: 'Doc',
            target_key: 'k',
            source_key: 'k'
        };
        const out = pairIndependentHeads([hybrid]);
        expect(out).toHaveLength(1);
        expect(out[0]).toBe(hybrid);
    });
});
