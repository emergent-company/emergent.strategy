# Branch Merge MVP – Minimal Viable Design

Status: Draft
Owners: Graph / Backend
Last Updated: 2025-09-29
Related Specs: `19-dynamic-object-graph.md` (branching concepts), `20-graph-overview.md` (marketing summary), `04-data-model.md` (core tables)

## 1. Goal & Non-Goals
**Goal (MVP):** Enable merging changes from a feature branch into a target branch (usually `main`) for versioned graph **objects** (nodes) with deterministic conflict detection leveraging existing per-version `change_summary` and version chains.

**Out of Scope (Defer):**
- Multi-object transactional merge (batch atomicity) – MVP processes objects independently.
- Relationship structural rebasing (will treat relationship rows similarly to objects only if explicitly included; automatic include deferred).
- Semantic merge strategies beyond scalar replace / fail.
- Auto conflict resolution / interactive partial acceptance.
- Release snapshot creation (covered separately in future milestone).
- Multi-merge-parent (>2 parents) resolution heuristics (only one source -> target in MVP).

## 2. User Stories
1. As a PM, I branch `feature/payment-retry`, edit 12 requirements, and want to merge them back to `main` producing new head versions or reporting conflicts.
2. As a developer, I request a dry-run merge to see which objects are changed vs conflicting before committing.
3. As an auditor, I need provenance: merged version must record both the prior target head and the source branch head used.

## 3. Key Concepts Recap (from `19-dynamic-object-graph.md`)
| Term | Meaning |
|------|---------|
| canonical_id | Logical identity across versions (across branches). |
| branch_id | Branch lane an object version belongs to. |
| supersedes_id | Previous version in same branch ancestry chain. |
| object_merge_parents | (Table) Records additional lineage (target & source parents) for merges. |
| change_summary | Structured diff of this version vs previous visible version on its branch (used for conflict detection). |

## 4. Data Model Additions / Confirmation
Already specified in Section 5.3 & 5.7 of dynamic graph spec – ensure these exist:
- `kb.objects.branch_id UUID NOT NULL`
- `kb.object_merge_parents(object_id, parent_object_id)`

No new columns required for MVP. We will, however, enforce an **application-level invariant**: a merged version row has **two** entries in `object_merge_parents` (target previous head + source head) and its own `supersedes_id` referencing the previous target head.

## 5. Merge Request API (MVP)
`POST /graph/branches/{targetBranchId}/merge`

### 5.1 Request Body
```jsonc
{
  "sourceBranchId": "<uuid>",
  "objectCanonicalIds": ["<uuid>", "<uuid>"] , // optional; if omitted process all diverged canonical ids (cap)
  "dryRun": false,
  "conflictStrategy": "fail" // reserved; only 'fail' supported MVP
}
```
Constraints:
- `sourceBranchId != targetBranchId`
- Branch lineage must show `sourceBranchId` is *not* an ancestor of `target` already merged (cyclic merges disallowed). MVP does **not** require source to descend from target.
- If `objectCanonicalIds` omitted, the service enumerates diverged objects up to `MERGE_ENUMERATION_CAP` (default 500). Larger sets require client to paginate & supply IDs.

### 5.2 Response (Success – Dry Run or Execute)
```jsonc
{
  "targetBranchId": "<uuid>",
  "sourceBranchId": "<uuid>",
  "dryRun": true,
  "summary": {
    "totalExamined": 42,
    "toMerge": 30,
    "conflicts": 2,
    "unchanged": 10
  },
  "results": [
    { "canonicalId": "<uuid>", "action": "merge", "newObjectId": "<uuid>", "sourceVersion": 5, "targetPrevVersion": 3 },
    { "canonicalId": "<uuid>", "action": "conflict", "reason": { "paths": ["/status","/title"], "message": "Divergent field edits" }, "sourceVersion": 4, "targetPrevVersion": 7 },
    { "canonicalId": "<uuid>", "action": "unchanged" }
  ]
}
```
On non-dry-run conflict detection: HTTP 409 with body identical except conflicting entries have `action: "conflict"`; no merges applied.

### 5.3 Error Codes
| HTTP | code | Meaning |
|------|------|---------|
| 400 | invalid_branch | Branch ids equal or invalid context. |
| 400 | enumeration_cap_exceeded | Diverged set > cap without explicit list. |
| 404 | branch_not_found | Source or target missing in project scope. |
| 409 | merge_conflict | Conflicts detected (dryRun=false). |

## 6. Divergence Enumeration
Definition: A canonical object diverged if the head version on source branch differs (different `content_hash`) from the *visible* version on target branch (which may fall back to ancestor branch via lazy semantics). Steps:
1. Collect source heads: `SELECT canonical_id, id, version, content_hash FROM kb.objects WHERE branch_id = $source AND deleted_at IS NULL`.
2. For each canonical, resolve target visible head using existing fallback algorithm.
3. If target head not present (object never modified or created in target lineage) → treat as **added** (merge action = create new version on target based on source head content). If `object was created only on source` we simply copy as new version (supersedes NULL). (Edge case: ensure new canonical id mapping in target – we reuse canonical_id.)
4. If content hashes equal → unchanged.
5. Else diverged candidate (requires conflict check).

Optimization: Hash join via temporary table of source heads to minimize per-object lookups.

## 7. Conflict Detection
We approximate 3-way merge using base = latest **common ancestor** between source head and target head.

### 7.1 Find Base
Walk backwards (following `supersedes_id` and optionally `object_merge_parents` for target) building ancestor sets until intersection. Given linear per-branch chains + limited merges, expect shallow depth (logically small). Implement iterative hash set intersection with depth cap `MERGE_ANCESTOR_SEARCH_CAP` (default 100). If no ancestor found within cap → treat entire document as conflicting (safe fallback).

### 7.2 Determine Changes
We leverage stored `change_summary.paths` for *each chain step*, but need aggregated path sets relative to base.
Algorithm for a version V vs base B:
1. If `V.id == B.id` → empty set.
2. Else accumulate `paths` from each version walking `supersedes_id` until base (exclusive) (stop early if path set size > `MERGE_PATH_ACCUM_CAP`, default 4096, then mark overflow and abort merge with conflict due to uncertainty).

### 7.3 Conflict Rule (MVP)
For any path P present in both source change set and target change set where source value ≠ target value (value equality = compare final materialized JSON at path in each head) → conflict.
Edge cases:
- Path removed in one, updated in other → conflict.
- Added-only vs unchanged → no conflict (merge applies addition).
- Both sides add same value (path absent in base, identical value) → no conflict.

### 7.4 Value Extraction
Resolve final values by direct JSON path navigation over `properties` object of head versions (NOT diff summaries). Large values hashed in `change_summary`—we intentionally fetch real values for accuracy (bounded by doc size). If either side hashed and not stored fully (future compaction scenario), fallback: if hashes differ → conflict; if equal → treat as identical.

## 8. Merge Application (Non Dry-Run)
For each non-conflicting diverged object:
1. New version row on target branch: copy source head `properties`, `title`, `status`, etc.
2. `supersedes_id = targetHead.id` (or NULL if no target head existed).
3. Recompute `version = (targetHead.version + 1)` (or 1 if new canonical on target).
4. Generate `change_summary` relative to target head (or null if new canonical) using existing diff utility (ensures audit clarity that a merge changed certain paths compared to previous target state).
5. Insert two rows in `object_merge_parents`: (newVersion.id, targetHead.id) and (newVersion.id, sourceHead.id) (if targetHead existed).
6. Set `content_hash` for dedupe.
7. Emit telemetry event `graph.merge.object` (fields below).

### 8.1 Telemetry Event: `graph.merge.object`
```json
{
  "type": "graph.merge.object",
  "canonical_id": "<uuid>",
  "target_branch": "<uuid>",
  "source_branch": "<uuid>",
  "action": "merge|added",
  "conflicted": false,
  "changed_paths": 12,
  "elapsed_ms": 4
}
```
Conflict events aggregated in a single `graph.merge.summary` post-run (include counts & duration buckets).

## 9. Relationship Merge (Optional Flag MVP)
Flag: `MERGE_RELATIONSHIPS_ENABLED` (default false). If enabled and `objectCanonicalIds` omitted (bulk mode):
- For each relationship whose endpoints (source & target objects) were merged or added, if relationship exists only on source branch (by canonical id pair + type uniqueness) create equivalent relationship version on target with `supersedes_id` NULL (new canonical) or referencing prior target version if exists with differing hash.
- Conflicts for relationships not computed (MVP) – duplicates with different properties on target create conflict entry with reason `relationship_property_divergence`.

## 10. Limits & Guardrails
| Guard | Default | Rationale |
|-------|---------|-----------|
| MERGE_ENUMERATION_CAP | 500 | Prevent accidental massive merges w/o listing. |
| MERGE_ANCESTOR_SEARCH_CAP | 100 | Bound ancestor walk cost. |
| MERGE_PATH_ACCUM_CAP | 4096 | Avoid huge memory on churny objects. |
| MERGE_APPLY_BATCH_SIZE | 100 | Transaction size for apply (commit every batch). |
| MERGE_TIMEOUT_MS | 15000 | Fail long merges to keep system responsive. |

## 11. Algorithmic Complexity
Let N = number of diverged objects, A = ancestor chain length (worst-case). Complexity:
- Enumeration: O(N) queries + head fallback lookups.
- Base discovery: O(A) set intersections (A small, typically < 20).
- Path accumulation: O(sum(paths_per_version)) truncated by cap.
- Overall expected: linear in number of real changes targeted.

## 12. Security & RLS
All object & branch reads/writes already tenant / project scoped. Merge endpoint enforces both branches belong to same project. Emit 403 if mismatch. Authorization scope: `graph:write` (TBD exact scope constant).

## 13. Observability & Metrics
Metrics (counters / histograms):
- `merge.objects.examined` (counter)
- `merge.objects.merged` (counter)
- `merge.objects.conflicted` (counter)
- `merge.duration.ms` (histogram per run & per object)
- `merge.conflict.paths.count` (histogram)
- `merge.batch.commit.ms` (histogram)

Log structured summary event per merge invocation including counts and timing, correlation id.

## 14. Acceptance Tests (MVP)
| ID | Description | Type |
|----|-------------|------|
| AT-MERGE-1 | Dry-run returns correct classification (merge vs unchanged vs conflict) | IT |
| AT-MERGE-2 | Conflict on divergent scalar path flagged (status vs status) | UT/IT |
| AT-MERGE-3 | No conflict when both sides unchanged or identical addition | UT |
| AT-MERGE-4 | Merge application creates new version with two merge parents | IT |
| AT-MERGE-5 | Added-only object (absent on target) merges as new canonical (supersedes NULL) | IT |
| AT-MERGE-6 | Enumeration cap triggers error when diverged set > cap without explicit list | UT |
| AT-MERGE-7 | Ancestor search cap exceeded yields conflict classification (safe fallback) | UT |
| AT-MERGE-8 | change_summary for merged version diffed against prior target head | UT |
| AT-MERGE-9 | Metrics counters increment appropriately (merged & conflicted) | IT |
| AT-MERGE-10 | RLS: cross-project branch merge attempt denied | SEC |

## 15. Rollout Plan
Phase | Action | Flag |
|------|--------|------|
| 1 | Implement dry-run enumeration + conflict detection only | `merge.execute.enabled=false` |
| 2 | Enable execute (apply) path behind flag | `merge.execute.enabled=true` |
| 3 | Add relationship merge (flag) | `merge.relationships.enabled=true` |
| 4 | Introduce alternative conflict strategies (source-wins) | `merge.strategy.source_wins=true` |
| 5 | UI / API pagination for large diverged sets | n/a |

## 16. Open Questions
- Should added-only merges preserve original `created_at`? (Likely no; use merge time for audit clarity but record source version id in parents.)
- Do we allow merging from target -> source (reverse) using same endpoint (swap params)? (Probably separate call or param.)
- Expose merged object diff summary directly in response? (Add optional `includeChangeSummary` flag.)
- Need limit on total conflicts returned? (Add cap if payload risk; maybe 100.)

## 17. Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Ancestor search degenerates if pathological merge chains | Depth cap fallback -> classify as conflict. |
| Large object properties cause slow diff | Use existing hashed truncation; diff already size-aware. |
| Unbounded merge enumeration if client omits list | Enumeration cap + explicit error messaging. |
| Partial success confusion | Dry-run default; execute only when user confident. Application layer can wrap execute in transaction batches. |

## 18. Future Enhancements (Beyond MVP)
- Multi-parent merges (octopus) & aggregated change provenance.
- Field-level strategy config stored in schema registry (`merge_strategies` map).
- Automatic pre-merge rebase suggestion (fast-forward detection & skip).
- Relationship topology conflict detection (edge deleted vs modified).
- Merge queue + background processing for large sets with progress polling.
- UI diff visualization (colored path summary; highlight conflicts).

## 19. Summary
This MVP introduces a safe, incremental merge capability leveraging existing versioning primitives without expanding schema surface. It prioritizes predictable conflict signaling, auditability (dual merge parents), and guardrails (enumeration & ancestor caps) to enable iterative refinement toward full multi-object semantic merges.
