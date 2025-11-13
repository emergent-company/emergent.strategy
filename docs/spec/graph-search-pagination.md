# Graph Search Cursor Pagination

_Last updated: 2025-09-26_

This document expands on the bidirectional cursor pagination semantics for the Graph Search endpoint.

## Overview
Graph Search fuses lexical (FTS) and vector (pgvector) candidate scores into a single ordered pool via weighted z‑score combination:
- If both channels present: 0.55 lexical / 0.45 vector
- If one channel missing: weight=1.0 for the present channel

Ordering: descending fused score, then ascending `object_id` as deterministic tie‑breaker. Because normalization stats are recomputed each request, exact ranks can shift across calls for the same query. Cursors, not numeric ranks, are the stable navigation primitive.

## Cursor Format
Each item includes a `cursor` (Base64URL‑encoded JSON). Two shapes are supported:
```jsonc
// Legacy (still accepted on input):
{ "s": <rounded_score_6_decimals>, "id": "<object_id>" }

// Current (adds positional index p for contiguous forward pagination):
{ "s": <rounded_score_6_decimals>, "id": "<object_id>", "p": <zero_based_index_in_fused_pool> }
```
`p` is optional when decoding. If present on a forward request, the server derives the next page start by taking all items **after** index `p`, eliminating the historical off‑by‑one gap risk that could appear with score/id boundary comparisons alone. If omitted, the server falls back to score/id boundary logic.

Backward navigation ignores `p` and locates the cursor item by `id` (tolerating score drift). If the item is not found the server reverts to forward boundary semantics (same as legacy behavior).

## Request Pagination Shape
```ts
interface PaginationInput {
  limit?: number;              // Desired page size (server hard cap = 50)
  cursor?: string | null;      // Opaque cursor from prior response (page boundary or item)
  direction?: 'forward' | 'backward'; // Defaults to 'forward'
}
```
Top-level legacy `limit` is still accepted but `pagination.limit` takes precedence.

## Response Meta (Relevant Fields)
```ts
interface GraphSearchMeta {
  total_estimate: number; // Fused pool size (not page count)
  nextCursor: string | null;
  prevCursor: string | null;
  hasNext: boolean;
  hasPrev: boolean;
  request: {
    limit: number;           // Effective limit after cap
    requested_limit: number; // Original client request
    direction?: 'forward' | 'backward';
  };
}
```

## Directional Semantics
### Forward (default)
- Start (no cursor): slice `[0, limit)`.
- With cursor containing `p`: slice `[p+1, p+1+limit)` — contiguous, no overlap.
- With legacy cursor (no `p`): find first item strictly after boundary `(score < s) OR (score == s AND id > i)` then slice `[startIndex, startIndex+limit)`.
- `nextCursor` (when another page exists) = cursor of last item in current slice (including its positional index `p`). This guarantees the next forward page starts immediately after the last returned item.
- `prevCursor` = cursor of the item immediately before page start (if any).

### Backward
- Cursor references the first item of the *forward* page you are stepping back from.
- Locate the cursor item by `id`; slice the preceding window *excluding* the cursor item: `[max(0, cursorPos - limit), cursorPos)`.
- `nextCursor` = cursor of item immediately before the new slice (continue going backward).
- `prevCursor` = cursor of last item in current slice (allows returning forward toward original position).

If the cursor item is not found (e.g., stale or pool changed radically), server falls back to forward semantics from the cursor boundary (consistent, non-error behavior).

## Stability & Testing Guidance
- Do NOT assert cross-request absolute rank relationships. Items can shift rank due to minor distribution changes.
- Safe invariants:
  - Forward windows are non-overlapping.
  - Backward page excludes the cursor item.
  - `direction` echoed in `meta.request.direction`.
  - Presence of `nextCursor` ↔ `hasNext`, likewise for `prevCursor` / `hasPrev`.

## Example Workflows
### Forward → Forward
1. `POST /graph/search { query, pagination: { limit: 10 } }` → items[0..9], `nextCursor=A`.
2. `POST /graph/search { query, pagination: { limit: 10, cursor: A } }` → items[10..19].

### Forward → Backward
1. Page 1 (cursor `A`).
2. Page 2 using `cursor: A` yields first item cursor `B`.
3. Backward request: `cursor: B, direction:'backward'` returns items just before `B`.

## Client Recommendations
| Concern | Recommendation |
|---------|----------------|
| Sizing | Respect `meta.request.limit`; design paging UI around it. |
| Caching | You may cache pages keyed by (query, cursor, direction). |
| Direction switch | Use the closest available `prevCursor`/`nextCursor` with explicit `direction`. |
| De-duplication | Track seen `object_id`s if you need a global set across mixed directions. |

## Error Handling
Invalid cursor (malformed / decoding fails): treated as initial page (no error). Clients SHOULD treat an unexpected empty page with `hasPrev=true` as end-of-pool forward or start-of-pool backward boundary condition.

## Future Extensions (Potential)
- Stable pool hash to allow clients to detect drift and invalidate cached pages.
- Window overlap hints for UI prefetch heuristics.
- Optional `anchorStrategy` parameter if alternate ordering modes are introduced.

---
See also: `apps/server/README.md` (inline summary) and root `README.md` section "Graph Search Pagination (Summary)".

## Acceptance Tests (AT-GSP Series)
The canonical list of pagination acceptance tests is tracked centrally in `docs/spec/10-roadmap.md` (Graph Search Pagination – Tracking). Summary below for quick reference:

| ID | Focus | In Spec? |
|----|-------|----------|
| AT-GSP-1 | Forward first page invariants | Yes |
| AT-GSP-2 | Forward non-overlap across pages | Yes |
| AT-GSP-3 | Backward window exclusion of cursor | Yes |
| AT-GSP-4 | Score drift tolerance (id-only match) | Yes |
| AT-GSP-5 | Direction echo in meta | Yes |
| AT-GSP-6 | Cursor presence ↔ hasNext/hasPrev | Yes |
| AT-GSP-7 | Forward→Backward adjacency correctness | Yes |
| AT-GSP-8 | requested_limit vs limit (capping transparency) | Yes |
| AT-GSP-9 | total_estimate sanity (≥ returned count) | Yes |
| AT-GSP-10 | Malformed cursor graceful fallback | Pending |
| AT-GSP-11 | Forward/backward latency parity SLO | Pending |
| AT-GSP-12 | Telemetry emission validation | Pending |
| AT-GSP-13 | prevCursor continuity across pages | Yes |
| AT-GSP-14 | End-of-pool nextCursor null | Yes |
| AT-GSP-15 | Backward from first page boundary behavior | Pending |
| AT-GSP-16 | Mixed direction de-duplication example | Pending |
| AT-GSP-17 | Unknown id cursor fallback forward semantics | Pending |
| AT-GSP-18 | Cross-spec doc link integrity | Yes |

Legend: Pending = test not yet implemented; Yes = implemented or covered by existing unit/E2E suite.
