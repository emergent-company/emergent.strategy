# Roadmap

## v0 (Prototype)
- Minimal stack: Postgres+pgvector, LangChain ingestion service, object storage, MCP server skeleton.
- Ingest: file-drop HTTP, GitHub Issues, PDFs/MD/DOCX via Unstructured.
- Hybrid search: vector + FTS; simple weighted fusion.
- MCP: facts.search, facts.fetch; bearer auth.

## v1
- Sources: Jira, PRs/reviews, Slack export, Confluence/Notion.
- Graph: basic entities (Feature, Ticket, Decision) and edges; expand tool.
- Observability: metrics, traces; admin dashboard.
- Security: SSO, RLS; audit log.

## v1.1
- Meetings: transcript ingestion; summarization; speakers.
- Propose_spec tool with templated outputs and citations.
- Cost controls & background re-embedding.

## v2
- Managed deployment patterns; scale to 5M+ chunks.
- Advanced graph extraction and cross-doc lineage.
- UI for curation and conflict resolution.

## Graph Search Pagination (Bidirectional Cursor) – Tracking

Status: Delivered (core) / Follow-ups pending

### Capability Checklist
| Item | Status | Notes |
|------|--------|-------|
| Deterministic ordering (score DESC, id ASC) | ✅ | Implemented; ranks not stable cross-request (by design). |
| Forward pagination (`direction=forward`) | ✅ | Initial page + subsequent windows using `nextCursor`. |
| Backward pagination (`direction=backward`) | ✅ | Window strictly before cursor item (cursor excluded). |
| Cursor tolerance (id-only resolution for backward) | ✅ | Mitigates score drift & normalization changes. |
| Meta: `requested_limit` vs capped `limit` | ✅ | Hard cap=50; transparent in `meta.request`. |
| Meta: `total_estimate` | ✅ | Approximate size for UX; not exact COUNT. |
| Meta: `direction`, `hasNext/hasPrev`, `nextCursor/prevCursor` | ✅ | Implemented. |
| Channels & fusion metadata | ✅ | `meta.channels`, `fusion` describe retrieval composition. |
| Standalone spec (`graph-search-pagination.md`) | ✅ | Source of truth; linked from other specs. |
| Root + server README propagation | ✅ | Summary sections added. |
| E2E invariants tests (forward/backward) | ✅ | Stable assertion set (cursor exclusion, flags, direction). |
| Unit tests: backward + score drift tolerance | ✅ | Perturbation test ensures resilience. |
| Telemetry events (pagination metrics) | ✅ | `graph.search.page` event emitted (in-memory counters + optional console log). |
| Benchmark forward vs backward latency SLOs | ✅ | Mean & p95 parity (±5% or <5ms) enforced in performance spec (AT-GSP-11). |
| Potential `approxPosition` enhancement | ✅ | Implemented as `meta.approx_position_start` / `meta.approx_position_end` (AT-GSP-19). |
| Reuse cursor model (traversal pagination retrofit) | ✅ | Implemented by adding cursor pagination to existing /graph/traverse (depth/id ordering). |

### Acceptance Tests (Planned & Implemented)
| ID | Type | Description | Status |
|----|------|-------------|--------|
| AT-GSP-1 | UT | Forward first page returns <= limit, sets `hasPrev=false` | ✅ |
| AT-GSP-2 | UT | Forward second page excludes all items from first page | ✅ |
| AT-GSP-3 | UT | Backward page excludes cursor item and size ≤ limit | ✅ |
| AT-GSP-4 | UT | Score drift (perturbed cursor score) still resolves by id | ✅ |
| AT-GSP-5 | E2E | `meta.request.direction` echoes requested direction | ✅ |
| AT-GSP-6 | E2E | `hasNext/hasPrev` consistency with presence of cursors | ✅ |
| AT-GSP-7 | E2E | Switching forward→backward returns adjacent preceding window | ✅ |
| AT-GSP-8 | UT | `requested_limit` preserved when capped; `limit` shows effective | ✅ |
| AT-GSP-9 | UT | `total_estimate` ≥ returned item count | ✅ |
| AT-GSP-10 | E2E | Invalid (malformed) cursor gracefully treated as initial page | ✅ |
| AT-GSP-11 | PERF | p95 latency parity forward vs backward within ±5% | ✅ |
| AT-GSP-12 | IT | Telemetry event emitted with direction & limit fields | ✅ |
| AT-GSP-13 | UT | `prevCursor` of page N equals `cursor` of last item on page N-1 | ✅ |
| AT-GSP-14 | UT | `nextCursor` null when end-of-pool reached | ✅ |
| AT-GSP-15 | UT | Backward pagination from first page returns empty or start window with `hasPrev=false` | ✅ |
| AT-GSP-16 | E2E | Mixed direction navigation sequence returns no duplicate ids across pages (client dedupe logic example) | ✅ |
| AT-GSP-17 | UT | Cursor with unknown id falls back to forward semantics without error | ✅ |
| AT-GSP-18 | DOC | Spec cross-links validated (pagination spec ↔ roadmap ↔ dynamic graph) | ✅ |
| AT-GSP-19 | UT | `approx_position_start`/`end` expose 1-based range for page | ✅ |
| AT-GSP-20 | UT | Traverse forward first page invariants | ✅ |
| AT-GSP-21 | UT | Traverse second page disjoint from first | ✅ |
| AT-GSP-22 | UT | Traverse invalid cursor falls back to first page | ✅ |
| AT-GSP-23 | UT | Traverse backward page excludes cursor boundary item | ✅ |

Legend: ✅ = implemented, ⬜ = pending.

### Follow-Up Actions
1. Instrument telemetry: emit `graph.search.page` events (fields: query_hash, direction, requested_limit, effective_limit, total_estimate, hasNext, hasPrev, elapsed_ms).
2. Add PERF harness comparing forward vs backward pagination latency on seeded dataset.
3. Implement AT-GSP-10/11/12/13/15/16/17 tests; update statuses.
4. Evaluate adding optional `approxPosition` once pool hash or stable window estimator exists.
5. Decide alignment or divergence for `/graph/expand` pagination (reuse cursor encoding vs path-based token buckets).

Cross-References: `docs/spec/graph-search-pagination.md`, `docs/spec/19-dynamic-object-graph.md` (§20.2), server README (Graph Search Cursor Pagination Semantics).
