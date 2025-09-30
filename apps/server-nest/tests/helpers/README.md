# FakeGraphDb Test Helper

Unified in-memory emulator used by GraphService unit-style tests to avoid Postgres while still exercising SQL construction logic.

## Goals
- Provide deterministic, side‑effect free storage for graph objects & relationships.
- Mirror critical SQL query patterns (regex matched) used by `GraphService` for:
  - Object create / patch / history / search
  - Relationship create / patch (versioning & multiplicity), history, search, listEdges
  - Traversal edge selection (DISTINCT ON heads)
- Support evolution of query patterns (DISTINCT ON head selection + outer filters) without rewriting every test.

## Feature Flags
Use `makeFakeGraphDb({ ...flags })` to enable subsets for narrower tests:

| Flag | Purpose | Affects Patterns |
|------|---------|------------------|
| `enableHistory` | Enables version history listing queries (`canonical_id` + `ORDER BY version DESC`). | object & relationship history selects |
| `enableSearch` | Enables DISTINCT ON head + outer `created_at ASC` search queries. | object & relationship search |
| `enableTraversal` | Enables traversal edge DISTINCT ON queries (used by traverse & expand). | listEdges/traversal edge selection |
| `enableRelationships` | Enables relationship create/patch/listEdges/search. | relationship CRUD/search |
| `strict` | Throws on unmatched SQL to surface missing pattern emulation. | All |
| `recordQueries` | Records every executed SQL + params for later inspection. | All |

Flags allow minimal emulation surface per spec to reduce accidental pattern acceptance.

## Supported Query Patterns (Regex Summaries)
- Object uniqueness: `WHERE project_id IS NOT DISTINCT FROM $1 AND type=$2 AND key=$3`
- Object insert: `INSERT INTO kb.graph_objects(type, key, properties, labels, version, canonical_id...`.
- Object patch: `INSERT INTO kb.graph_objects(type, key, properties, labels, version, canonical_id, supersedes_id...`.
- Object history: `FROM kb.graph_objects WHERE canonical_id=$1[ AND version < $2] ORDER BY version DESC`.
- Object search heads: inner `SELECT DISTINCT ON (canonical_id)` + outer `ORDER BY t.created_at ASC`.
- Relationship head (multiplicity): `SELECT * FROM kb.graph_relationships ... ORDER BY version DESC LIMIT 1`.
- Relationship insert / patch: `INSERT INTO kb.graph_relationships(org_id, project_id, type, src_id, dst_id, properties, version, canonical_id[, supersedes_id]...)`.
- Relationship history: `FROM kb.graph_relationships WHERE canonical_id=$1[ AND version < $2] ORDER BY version DESC`.
- Relationship search: inner `SELECT DISTINCT ON (r.canonical_id)` + outer `ORDER BY h.created_at ASC`.
- listEdges / traversal: DISTINCT ON (canonical_id) with directional `WHERE` referencing `src_id` / `dst_id` and outer tombstone filter.

## Head Selection Semantics
All DISTINCT ON patterns mimic production strategy: select head (highest version) for each canonical id (including tombstones), then filter `deleted_at IS NULL` only in the outer query.

## Extension Guidelines
1. Add new SQL pattern **before** changing service queries so tests fail loudly if helper not updated.
2. Keep regexes as specific as practical; prefer conjunctions (e.g. require `ORDER BY h.created_at ASC`) to disambiguate overlapping patterns.
3. When adding pagination or new filter columns, extract parameter positions with regex capture (e.g. `/h.src_id = \$(\d+)/`) instead of assuming order.
4. Deterministic timestamps: object `created_at` increments by +10ms per insert; relationships likewise, ensuring stable cursor comparisons.
5. Avoid leaking production-only behavior (locks, indexes) — no-ops are fine.
6. When adding complex flows, enable `recordQueries` in a test and assert expected sequence to prevent silent regression.

## Troubleshooting
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| History test returns 0 versions | Missing history regex or canonical_id mismatch | Add history pattern & ensure patch inserts preserve canonical_id |
| Search test returns 0 items | Search query matched earlier generic pattern (e.g. listEdges) | Tighten regex for listEdges; add discriminators (directional WHERE) |
| Relationship patch says not head | Newer-version check regex mismatch | Update `SELECT id FROM ... version > $2` pattern |

## Adding New Patterns
Use approach:
```ts
if (/SELECT .* FROM kb\.graph_objects WHERE some_col=\$1 AND other=\$2/i.test(sql)) {
  // emulate
}
```
Place more specific patterns **above** broader ones.

## When NOT To Use FakeGraphDb
- Cross-module integration or RLS enforcement (needs real DB).
- Performance benchmarking realism (consider dedicated scripts hitting a test DB).

## Future Ideas
- Lightweight query recorder for asserting number of roundtrips.
- Optional strict mode to throw on unmatched queries.
- Objects benchmark parity (create + patch) mirroring relationships.

---
Maintainers: Update this file whenever new graph query patterns are added.
