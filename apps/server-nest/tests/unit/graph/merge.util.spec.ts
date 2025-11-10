import { describe, it, expect } from 'vitest';
import {
  pairIndependentHeads,
  MergeHeadRow,
} from '../../../src/modules/graph/merge.util';

function mkRow(
  kind: 'target' | 'source',
  id: string,
  type: string,
  key: string,
  canonical: string,
  hash: string
): MergeHeadRow {
  return kind === 'target'
    ? {
        canonical_id: canonical,
        target_id: id,
        target_type: type,
        target_key: key,
        target_hash: hash,
      }
    : {
        canonical_id: canonical,
        source_id: id,
        source_type: type,
        source_key: key,
        source_hash: hash,
      };
}

describe('pairIndependentHeads', () => {
  it('combines independent target/source rows with same (type,key)', () => {
    const rows: MergeHeadRow[] = [
      mkRow('target', 't1', 'doc', 'A', 'c1', 'hashT'),
      mkRow('source', 's1', 'doc', 'A', 'c2', 'hashS'),
    ];
    const res = pairIndependentHeads(rows);
    expect(res.length).toBe(1);
    const r = res[0];
    expect(r.target_id).toBe('t1');
    expect(r.source_id).toBe('s1');
    expect(r.canonical_id).toBe('c1'); // target canonical retained
  });

  it('does not duplicate when already paired (same canonical id)', () => {
    const paired: MergeHeadRow[] = [
      {
        canonical_id: 'c1',
        target_id: 't1',
        target_type: 'doc',
        target_key: 'A',
        target_hash: 'h1',
        source_id: 's1',
        source_type: 'doc',
        source_key: 'A',
        source_hash: 'h1',
      },
    ];
    const res = pairIndependentHeads(paired);
    expect(res).toHaveLength(1);
  });

  it('leaves unrelated single-side rows untouched', () => {
    const rows: MergeHeadRow[] = [
      mkRow('target', 't1', 'doc', 'A', 'c1', 'h1'), // only on target
      mkRow('source', 's1', 'doc', 'B', 'c2', 'h2'), // only on source different key
    ];
    const res = pairIndependentHeads(rows);
    expect(res).toHaveLength(2);
  });
});
