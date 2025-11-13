# Graph Merge Dry-Run Endpoint

The **merge dry-run** API provides a lightweight classification of differences between two branches of graph objects.
It does **not** mutate data; it only reports what would happen if a merge were performed using current heuristic rules.

## Endpoint
```
POST /graph/branches/:targetBranchId/merge
```
Body:
```jsonc
{
  "sourceBranchId": "<uuid>",
  "limit": 200 // optional; upper bounded by hard limit (env)
}
```

## Response Shape (BranchMergeSummaryDto)
```jsonc
{
  "targetBranchId": "...",
  "sourceBranchId": "...",
  "dryRun": true,
  "total_objects": 3,
  "unchanged_count": 1,
  "added_count": 1,
  "fast_forward_count": 0,
  "conflict_count": 1,
  "objects": [
    {
      "canonical_id": "uuid-or-synthetic",
      "status": "added|unchanged|fast_forward|conflict",
      "source_head_id": "uuid|null",
      "target_head_id": "uuid|null",
      "source_paths": ["/title"],
      "target_paths": ["/title"],
      "conflicts": ["/title"] // only present for status "conflict"
    }
  ],
  "truncated": false,
  "hard_limit": 500
}
```

## Status Semantics
| Status | Meaning | Typical Action |
|--------|---------|----------------|
| `added` | Object exists only on source branch. | Create object on target. |
| `unchanged` | Content hashes equal or object only on target. | No action. |
| `fast_forward` | Object differs but changed property paths do not overlap. | Apply source changes cleanly. |
| `conflict` | Overlapping property paths changed independently. | Manual resolution required. |

## Heuristics (MVP)
1. Latest head per `canonical_id` per branch (`version` DESC) is selected.
2. Objects are paired primarily by `canonical_id`.
3. If **independently created** on both branches (different `canonical_id`) but sharing identical `(type, key)`, a post-processing step pairs them as one logical object.
4. Change detection uses stored `change_summary.paths` arrays recorded at creation / patch time via `diffProperties`.
5. Overlap is computed by intersecting source vs target changed path sets. Any intersection triggers `conflict`; otherwise `fast_forward`.
6. Object existing only on source ⇒ `added`; only on target ⇒ `unchanged`.
7. If hashes are equal, the object is `unchanged` regardless of path lists.

### Limit & Truncation
- Hard enumeration limit: `GRAPH_MERGE_ENUM_HARD_LIMIT` (default 500).
- Client `limit` param is capped by the hard limit.
- If more rows exist than enumerated, `truncated: true` is included in the response.

### Telemetry (Optional)
Set `GRAPH_MERGE_TELEMETRY_LOG=true` to log a summary event. Use `GRAPH_MERGE_OBJECT_TELEMETRY_LOG=true` to log per-object (capped by `GRAPH_MERGE_OBJECT_TELEMETRY_MAX`, default 50).

## Example
```bash
curl -s -X POST \
  http://localhost:3000/graph/branches/00000000-0000-0000-0000-000000000001/merge \
  -H 'Content-Type: application/json' \
  -d '{"sourceBranchId":"00000000-0000-0000-0000-000000000002","limit":100}' | jq
```

## Edge Cases / Notes
- If either branch id is unknown: `404 branch_not_found`.
- No objects enumerated ⇒ all counts zero.
- Independently created objects with identical (type,key) get paired; this is a transitional heuristic until *true branching* shares canonical history.
- Path sets can be broad on initial creation (all supplied properties). Later patches record only modified paths.

## Future Improvements
| Area | Potential Enhancement |
|------|-----------------------|
| Ancestry | Track and compare a lowest common ancestor version (LCA) instead of head-to-head path overlap. |
| Pairing | Remove (type,key) heuristic once branch cloning copies canonical_id lineage. |
| Granularity | Store per-path value hashes to differentiate semantically equal updates from conflicts. |
| Merge Preview | Optional diff payload summarizing prospective post-merge object for fast_forward cases. |
| Streaming | SSE pagination for very large branch comparisons. |

## Testing
Covered in:
- `tests/graph-merge.spec.ts` – added, conflict, empty divergence
- `tests/graph-merge-fastforward.spec.ts` – fast_forward scenario

## Breaking Changes Consideration
Any alteration of classification rules should update this doc and add/modify tests to ensure backward compatibility or highlight intentional changes.
