// Utility for pairing target/source branch head rows that represent the same logical object
// even when created independently (different canonical_id) but sharing (type,key).
// This isolates heuristic logic for easier unit testing and future replacement once
// true branching shares canonical history.

export interface MergeHeadRow {
  canonical_id: string;
  target_id?: string;
  source_id?: string;
  target_hash?: string;
  source_hash?: string;
  target_change?: any;
  source_change?: any;
  target_props?: any;
  source_props?: any;
  target_type?: string;
  source_type?: string;
  target_key?: string;
  source_key?: string;
  // Relationship specific optional fields (ignored for object pairing when absent)
  target_src_id?: string;
  source_src_id?: string;
  target_dst_id?: string;
  source_dst_id?: string;
}

export function pairIndependentHeads(rows: MergeHeadRow[]): MergeHeadRow[] {
  if (!rows.length) return rows;
  const byKey = new Map<
    string,
    { targetRow?: MergeHeadRow; sourceRow?: MergeHeadRow }
  >();
  for (const r of rows) {
    if (r.target_id) {
      const k = `${r.target_type || ''}|${r.target_key || ''}`;
      const entry = byKey.get(k) || {};
      entry.targetRow = r;
      byKey.set(k, entry);
    }
    if (r.source_id) {
      const k = `${r.source_type || ''}|${r.source_key || ''}`;
      const entry = byKey.get(k) || {};
      entry.sourceRow = r;
      byKey.set(k, entry);
    }
  }
  const toRemove = new Set<MergeHeadRow>();
  const combined: MergeHeadRow[] = [];
  for (const [, entry] of byKey) {
    if (entry.targetRow && entry.sourceRow) {
      if (
        entry.targetRow.canonical_id !== entry.sourceRow.canonical_id &&
        !entry.targetRow.source_id &&
        !entry.sourceRow.target_id
      ) {
        toRemove.add(entry.targetRow);
        toRemove.add(entry.sourceRow);
        combined.push({
          canonical_id: entry.targetRow.canonical_id,
          target_id: entry.targetRow.target_id,
          source_id: entry.sourceRow.source_id,
          target_hash: entry.targetRow.target_hash,
          source_hash: entry.sourceRow.source_hash,
          target_change: entry.targetRow.target_change,
          source_change: entry.sourceRow.source_change,
          target_props: entry.targetRow.target_props,
          source_props: entry.sourceRow.source_props,
          target_type: entry.targetRow.target_type,
          source_type: entry.sourceRow.source_type,
          target_key: entry.targetRow.target_key,
          source_key: entry.sourceRow.source_key,
        });
      }
    }
  }
  return combined.length
    ? rows.filter((r) => !toRemove.has(r)).concat(combined)
    : rows;
}

// Relationship variant pairing on (type, src_id, dst_id) triple when canonical histories differ.
export function pairIndependentRelationshipHeads(
  rows: MergeHeadRow[]
): MergeHeadRow[] {
  if (!rows.length) return rows;
  const byTriple = new Map<
    string,
    { targetRow?: MergeHeadRow; sourceRow?: MergeHeadRow }
  >();
  for (const r of rows) {
    if (r.target_id) {
      const k = `t|${r.target_type || ''}|${r.target_src_id || ''}|${
        r.target_dst_id || ''
      }`;
      const entry = byTriple.get(k) || {};
      entry.targetRow = r;
      byTriple.set(k, entry);
    }
    if (r.source_id) {
      const k = `s|${r.source_type || ''}|${r.source_src_id || ''}|${
        r.source_dst_id || ''
      }`;
      const entry = byTriple.get(k) || {};
      entry.sourceRow = r;
      byTriple.set(k, entry);
    }
  }
  const toRemove = new Set<MergeHeadRow>();
  const combined: MergeHeadRow[] = [];
  for (const [, entry] of byTriple) {
    if (entry.targetRow && entry.sourceRow) {
      if (
        entry.targetRow.canonical_id !== entry.sourceRow.canonical_id &&
        !entry.targetRow.source_id &&
        !entry.sourceRow.target_id
      ) {
        toRemove.add(entry.targetRow);
        toRemove.add(entry.sourceRow);
        combined.push({
          canonical_id: entry.targetRow.canonical_id,
          target_id: entry.targetRow.target_id,
          source_id: entry.sourceRow.source_id,
          target_hash: entry.targetRow.target_hash,
          source_hash: entry.sourceRow.source_hash,
          target_change: entry.targetRow.target_change,
          source_change: entry.sourceRow.source_change,
          target_props: entry.targetRow.target_props,
          source_props: entry.sourceRow.source_props,
          target_type: entry.targetRow.target_type,
          source_type: entry.sourceRow.source_type,
          target_src_id: entry.targetRow.target_src_id,
          target_dst_id: entry.targetRow.target_dst_id,
          source_src_id: entry.sourceRow.source_src_id,
          source_dst_id: entry.sourceRow.source_dst_id,
        });
      }
    }
  }
  return combined.length
    ? rows.filter((r) => !toRemove.has(r)).concat(combined)
    : rows;
}

// Explicit export to guarantee module context under legacy module detection modes.
export const __mergeUtilModule = true;
