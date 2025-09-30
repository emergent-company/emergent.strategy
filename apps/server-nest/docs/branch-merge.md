# Branch Merge (Dry-Run + Execute)

This document describes the current branch merge capability in the Graph module, its data model assumptions, classification rules, apply semantics, and roadmap.

## Goals
- Provide a deterministic summary of differences between a source branch and a target branch.
- Allow safe application (fast-forward style) of non-conflicting changes.
- Preserve conflict detection for overlapping divergent edits.
- Maintain idempotence: re‑running an execute merge with no new source changes performs no additional writes.

## Endpoint
`POST /graph/branches/:targetBranchId/merge`

### Request DTO (BranchMergeRequestDto)
```jsonc
{
  "sourceBranchId": "uuid",          // Required
  "limit": 500,                       // Optional enumeration cap (hard-capped by server env hard limit)
  "execute": false                    // Optional: if true and no conflicts, apply changes
}
```

### Response DTO (BranchMergeSummaryDto) Core Fields
- `targetBranchId`, `sourceBranchId`
- `dryRun: boolean` (false when execute path taken)
- Counts: `unchanged_count`, `added_count`, `fast_forward_count`, `conflict_count`, `total_objects`
- `objects[]`: ordered list of object summaries
- Optional: `applied: true`, `applied_objects: number` (only when execute occurred)
- Optional: `truncated` (true if enumeration exceeded requested limit)

### Object Summary Fields
| Field | Description |
|-------|-------------|
| `canonical_id` | Logical grouping id (best-effort; objects with same (type,key) but different canonical lineages are unified heuristically) |
| `status` | One of `added`, `unchanged`, `fast_forward`, `conflict` |
| `source_head_id` / `target_head_id` | Latest version ids on respective branches (if present) |
| `source_paths` / `target_paths` | Change summary path arrays (fallback ['/'] when unavailable) |
| `conflicts` | Sorted list of conflicting path strings (only for `conflict` status) |

## Classification Logic (MVP + Superset Heuristic)
1. `added`: object only exists on source branch.
2. `unchanged`: both branches have heads with identical `content_hash` (byte equality of SHA-256 hash of sorted properties).
3. `conflict`: both exist and have divergent hashes AND overlapping changed paths that are not purely a subset-superset additive change.
4. `fast_forward`: both exist, divergent hashes, and either (a) non-overlapping change paths OR (b) source properties are a strict superset of target with identical overlapping values.

Deterministic ordering: bucket by status priority
`conflict(0) < fast_forward(1) < added(2) < unchanged(3)` and then by `canonical_id` ascending. A defensive comparator runs after bucket assembly to ensure stability.

## Apply Semantics (`execute=true`)
- Guard: Any conflict blocks apply. Summary returns with `applied` omitted.
- `added`: Source head is cloned into target branch as a brand new object (new canonical lineage, version =1 on that branch).
- `fast_forward`: Target head is *patched* with only properties absent on target (source-only new keys). No overwrites of existing keys. This yields a new version on target. If source added no new keys relative to target, nothing is written for that object.
- `unchanged` / `conflict`: No action.
- Summary includes `applied=true` and `applied_objects` (# of create + patch operations performed). Field omitted if zero to keep payload lean.

### Idempotence
Running the same execute again without additional source divergence performs zero writes because:
- `added` objects already exist on target (now classified as `unchanged`).
- `fast_forward` patches have already added new keys; reclassification becomes `unchanged`.

## Limits & Truncation
Enumeration respects a hard server cap `GRAPH_MERGE_ENUM_HARD_LIMIT` (default 500). Request `limit` is clipped to this value. If more rows exist, `truncated: true` is returned and counts/objects reflect only enumerated set.

## Current Non-Goals
- True three-way merge (no LCA / ancestor traversal yet).
- Conflict resolution inputs (manual choice or path-level resolution) – conflicts only block apply.
- Deletion / tombstone merges.
- Relationship-level merge (objects only).

## Roadmap (Planned Enhancements)
| Feature | Rationale | Outline |
|---------|-----------|---------|
| Three-way merge (LCA) | Reduce false conflicts; allow proper divergent evolution | Track shared canonical lineage & ancestor content hashes to classify fast-forward vs true conflict more precisely |
| Conflict resolution API | Allow merging despite conflicts | Accept per-object (or per-path) resolution directives; apply chosen property set |
| Partial apply (subset) | Large merges w/ selective application | Add `include_canonical_ids` or `exclude_statuses` filters on execute pass |
| Overwrite fast-forward option | Allow updating differing values when safe | Strategy flag: `strategy: overwrite_newer|additive` |
| Batch transactional apply | Consistency across multiple object changes | Wrap all apply operations in a single transaction for all-or-nothing semantics |
| Relationship merge | Complete graph fidelity | Extend enumeration & classification to relationships w/ analogous statuses |
| Extended telemetry events | Better observability | Emit separate `graph.merge.execute` event with applied stats |

## Operational Considerations
- Each object mutation (create/patch) participates in existing advisory locking semantics (object key or canonical id), preventing head races under concurrent merges.
- Superset heuristic intentionally conservative: avoids accidental overwrites; may classify some benign overwrites as conflicts until overwrite strategy is implemented.
- Potential performance improvement: batch SELECT source head rows instead of per-object queries (low priority at current scale).

## Testing Summary
Added tests:
- `APPLY-1`: Added + fast_forward -> applied clone + patch; post-dry-run shows no conflicts.
- `APPLY-2`: Conflict scenario -> apply blocked; `applied` fields omitted.

Planned test: Idempotent second execute (to be added) to assert zero additional changes.

## Example Dry-Run Response (abridged)
```json
{
  "targetBranchId": "...",
  "sourceBranchId": "...",
  "dryRun": true,
  "total_objects": 3,
  "unchanged_count": 1,
  "added_count": 1,
  "fast_forward_count": 1,
  "conflict_count": 0,
  "objects": [
    { "canonical_id": "a", "status": "fast_forward", "source_head_id": "...", "target_head_id": "..." },
    { "canonical_id": "b", "status": "added", "source_head_id": "..." },
    { "canonical_id": "c", "status": "unchanged", "source_head_id": "...", "target_head_id": "..." }
  ]
}
```

## Example Execute Response (abridged, success)
```json
{
  "dryRun": false,
  "applied": true,
  "applied_objects": 2,
  "fast_forward_count": 1,
  "added_count": 1,
  "conflict_count": 0
}
```

## Appendix: Object & Relationship Search Ordering Semantics

The `searchObjects` and `searchRelationships` APIs support an optional `order` parameter controlling chronological enumeration of current (head) versions:

| Parameter | Allowed | Default | Meaning |
|-----------|---------|---------|---------|
| `order` | `asc` \| `desc` | `asc` | Asc = oldest→newest, Desc = newest→oldest |

### Cursor Rules
The service uses `created_at` timestamps as cursors. The pagination predicate differs by direction:

| Direction | Predicate (Objects & Relationships) | Next Cursor Source |
|-----------|-------------------------------------|--------------------|
| `asc` | `created_at > cursor` | `created_at` of last item in page |
| `desc` | `created_at < cursor` | `created_at` of last item in page |

`next_cursor` is always the timestamp of the final enumerated item (independent of direction), enabling clients to treat the cursor field uniformly.

### When to Use Descending Order
- Branch or debugging views needing the freshest writes first.
- Small page sizes where recent objects/relationships must appear without multiple requests.

### Backward Compatibility
Existing clients omitting `order` retain original ascending semantics. Supplying an invalid value silently falls back to `asc`.

### Examples
```
GET /graph/objects/search?type=Iso&limit=25          # ascending (legacy default)
GET /graph/objects/search?type=Iso&limit=25&order=desc
```

Relationship parity: `searchRelationships` now accepts `order=asc|desc` with identical cursor semantics (newest-first when `desc`). Existing clients without `order` continue to receive ascending ordering.

---
*Last updated: 2025-09-29*
