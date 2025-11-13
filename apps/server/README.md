# Server (NestJS)

This service provides the API (NestJS) layer for org/project management, documents, ingestion, chat, search, and invitations.

## Scripts

Common development / test scripts (run from repo root or from this directory):

- Build: `npm --prefix apps/server-nest run build`
- OpenAPI generate: `npm --prefix apps/server-nest run gen:openapi`
- Unit tests: `npm --prefix apps/server-nest test`
- E2E tests: `npm --prefix apps/server-nest test:e2e`
- Scenario test(s): `RUN_SCENARIOS=1 npm --prefix apps/server-nest run test:scenarios`

### Scenario Tests

Scenario specs (in `tests/scenarios/`) are heavier end‑to‑end flows (provision org & project, ingest, chat stream, citations). They are skipped by default to keep CI fast. Enable them explicitly:

```bash
RUN_SCENARIOS=1 npm --prefix apps/server-nest run test:scenarios
```

Optional flags:
- `SCENARIO_DEBUG=1` – extra logging
- `GOOGLE_API_KEY=<key>` & `CHAT_MODEL_ENABLED=true` – exercise real model path; otherwise synthetic token streaming is used

### Environment Files

Sample env for scenario runs: `.env.e2e.scenarios.example` (copy to `.env.e2e.scenarios` or export vars).

Key vars:
- `CHAT_MODEL_ENABLED` – toggle real model usage
- `GOOGLE_API_KEY` – if set with model enabled, responses stream actual model output
- `DEBUG_AUTH_SCOPES=1` – adds debug headers for scope resolution

### Authorization Overview

Roles (org/project membership) are resolved to scopes server‑side; test tokens can grant full scope set (`e2e-all`) or minimal (`with-scope`). Guard enforces required scopes on annotated handlers.

### Cascades & Atomic Inserts

See `README.cte-cascade.md` for details on ON DELETE CASCADE strategy and guarded CTE insert pattern preventing race conditions.

### OpenAPI Regression Guard

A hash test locks path+tag structure. After intentional spec changes, update the expected hash in the regression test. Regenerate spec with `npm --prefix apps/server-nest run gen:openapi`.

Detailed policy & guard tests: [docs/openapi-regression.md](./docs/openapi-regression.md)

### Troubleshooting

- Missing scenario tests: ensure `RUN_SCENARIOS=1` is set.
- Scope 403s when expecting allow: confirm token variant (`authHeader('all', ...)`) and required header context (`x-project-id`, `x-org-id`).
- Chat streaming empty: check `CHAT_MODEL_ENABLED` and key presence; otherwise synthetic tokens are expected.

---
*See root `SETUP.md` for full repository bootstrap instructions.*

## Branch Merge Dry-Run (MVP)

The merge preview endpoint enumerates divergent canonical graph objects between a **source** branch and a **target** branch without mutating data.

Route:
```
POST /graph/branches/:targetBranchId/merge
Content-Type: application/json
```

Request body:
```json
{
	"sourceBranchId": "<uuid>",
	"limit": 200
}
```
Fields:
- `sourceBranchId` (required): Branch whose changes you want to merge into the `targetBranchId` path parameter.
- `limit` (optional): Soft cap (<= hard server cap) on number of divergent objects to enumerate. Default hard cap controlled by `GRAPH_MERGE_ENUM_HARD_LIMIT` (default 500). If more exist, response sets `truncated: true`.

Classification statuses (`status`):
- `added` – Object exists only in source branch (new canonical object).
- `unchanged` – Object identical (same `content_hash`) or only exists in target (no action required).
- `fast_forward` – Object changed in source, unchanged in target (safe to adopt source version).
- `conflict` – Object changed in both source and target with overlapping changed paths and differing final content (manual resolution required).

Example successful response (truncated):
```json
{
	"targetBranchId": "11111111-1111-1111-1111-111111111111",
	"sourceBranchId": "22222222-2222-2222-2222-222222222222",
	"limit": 200,
	"truncated": false,
	"counts": {
		"added": 3,
		"fast_forward": 5,
		"conflict": 2,
		"unchanged": 120
	},
	"objects": [
		{
			"canonical_id": "c1",
			"status": "fast_forward",
			"source": { "version_id": "v-s1", "content_hash": "sha256:abc...", "paths": ["/intro.md"] },
			"target": { "version_id": "v-t1", "content_hash": "sha256:def...", "paths": ["/intro.md"] }
		},
		{
			"canonical_id": "c9",
			"status": "conflict",
			"source": { "version_id": "v-s9", "content_hash": "sha256:123...", "paths": ["/config/app.yaml"] },
			"target": { "version_id": "v-t9", "content_hash": "sha256:456...", "paths": ["/config/app.yaml"] }
		}
	]
}
```

Notes / Limitations (MVP):
1. Ancestor (LCA) narrowing not yet applied: conflicts are based on direct head path overlap; some false positives possible if paths diverged independently after a shared ancestor.
2. Execution (write) merge is not implemented; this endpoint is read-only and ignores any future `execute` flag.
3. Performance: Each enumerated row triggers a classification pass; tune via `GRAPH_MERGE_ENUM_HARD_LIMIT` env var.
4. Telemetry: Summary event always recorded in-memory; optional logging controlled via env flags below.

### Telemetry Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `GRAPH_MERGE_TELEMETRY_LOG` | (unset) | When set to `true`, logs a single `graph.merge.dry_run` summary event with counts after each dry-run. |
| `GRAPH_MERGE_OBJECT_TELEMETRY_LOG` | (unset) | When `true`, logs one `graph.merge.object` event per enumerated object (only if total objects <= `GRAPH_MERGE_OBJECT_TELEMETRY_MAX`). |
| `GRAPH_MERGE_OBJECT_TELEMETRY_MAX` | `50` | Maximum number of objects allowed for per-object telemetry emission to avoid log flooding. |

Future phases will add: ancestor-aware diff minimization, transactional execute path producing merged versions, and structured telemetry events for observability.

## Graph Merge Dry-Run (MVP)
A non-mutating endpoint to classify differences between two branches (added / unchanged / fast_forward / conflict).

Documentation: [docs/graph-merge.md](./docs/graph-merge.md)

## Graph Traversal Benchmark

The synthetic traversal benchmark (`scripts/graph-benchmark.ts`) seeds a predictable directed graph and measures traversal latency for depths 1–3 (or a user‑specified max) using the existing `GraphService.traverse` API.

### Running (Real Database)

Requires Postgres reachable with the usual env vars (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`). The script will auto‑init schema when `DB_AUTOINIT=1` (set automatically if not present).

```
cd apps/server-nest
npx ts-node scripts/graph-benchmark.ts --nodes 2000 --branch 3 --depth 3 --roots 5 --limit 100 --runs 5
```

Flags:
- `--nodes` (default 1500) approximate number of object nodes to insert
- `--branch` (default 3) synthetic out-degree per node
- `--depth` (default 3) maximum depth scenarios consider (script still runs depth1..min(depth,3))
- `--roots` (default 3) number of starting root nodes for traversal
- `--limit` (default 100) traversal page limit
- `--runs` (default 1) number of repeated executions per scenario for statistics

### Fallback (No Database Available)

Set `GRAPH_BENCH_FAKE_DB=1` to run a deterministic in‑memory simulation (latencies will reflect only JS execution, not storage I/O):

```
GRAPH_BENCH_FAKE_DB=1 npx ts-node scripts/graph-benchmark.ts --nodes 1500 --branch 3 --depth 3 --roots 3 --limit 100 --runs 5
```

Output lines:
```
[run] depth2#3/5 depth=2 nodes=... in 42ms
[run:fallback] depth3#2/5 ...
```

### JSON & Historical Persistence

Each raw run and aggregated scenario summary is appended (JSONL) to `apps/server-nest/logs/graph-benchmark.jsonl` with fields:

Raw record (`type:"raw"`):
```
{
	"type": "raw",
	"timestamp": "2025-09-27T12:34:56.789Z",
	"git_commit": "abc1234",
	"fake_db": false,
	"params": { ... top-level run parameters ... },
	"scenario": "depth2",
	"depth": 2,
	"elapsed_ms": 37,
	"nodes_returned": 85,
	"total_nodes": 120,
	"truncated": true,
	"run_index": 2
}
```

Aggregated summary (`type:"aggregate"`):
```
{
	"type": "aggregate",
	"scenario": "depth2",
	"runs": 5,
	"min_ms": 34,
	"p50_ms": 36,
	"p95_ms": 39,
	"max_ms": 40,
	"mean_ms": 36.2,
	...
}
```

### Interpreting Results
Use `p50_ms` and `p95_ms` across runs as emerging baseline SLO candidates (e.g. maintain depth2 traversal p95 < 75ms for current dataset size). Track drift by diffing recent aggregate entries filtered per `git_commit`.

### Future Enhancements (Optional)
- CSV export (derive from JSONL)
- Scenario parameter matrix (multiple branching factors in one invocation)
- Automatic warm-up phase exclusion

### Reporting Utility
Generate a quick summary table (latest aggregates per scenario):

```
npm --prefix apps/server-nest run bench:report -- --limit 5
```

Flags:
- `--limit <n>`: Number of aggregate history entries per scenario (default 5)
- `--since <ISO>`: Filter records newer than an ISO timestamp
- `--scenario depth1,depth2`: Restrict to listed scenarios
- `--json`: Machine-readable JSON output
- `--csv`: CSV summary (latest row per scenario)
- `--regress <pct>`: Highlight if latest p95 > previous p95 by more than pct
- `--status`: Non-zero (2) exit if regression threshold exceeded (CI gating)
- `--warmup <n>` (benchmark script): Exclude the first N runs per scenario from aggregate stats (still logged with `warmup:true`). Use this when the first traversal shows noticeable cache/JIT effects.

Example JSON output:
```
npm --prefix apps/server-nest run bench:report -- --json --scenario depth2
```

This reads `logs/graph-benchmark.jsonl`. If absent, it exits with an error.

---

## Graph Search Cursor Pagination Semantics

The graph search endpoint supports bidirectional (forward & backward) cursor pagination over a fused result
pool. Key properties:

### Ordering & Fusion
Results are produced by a weighted z‑score fusion of lexical and vector candidate scores.
Ordering is: descending fused score, then ascending `object_id` as a deterministic tie‑breaker. Because
each request re‑derives normalization statistics, absolute rank values can shift slightly between requests
for the same query (non‑material for cursor navigation, but avoid strict cross‑request rank assertions in tests).

### Cursors
Each item includes a `cursor` (Base64URL JSON): `{ s: <rounded_score_6dp>, id: <object_id> }`.
The server only requires the `id` when resolving a backward cursor (score tolerance). This avoids
floating‑point equality pitfalls.

### Request Shape
```
pagination: {
	limit?: number;          // requested page size (server hard caps at 50)
	cursor?: string | null;  // opaque cursor from prior response meta or item
	direction?: 'forward' | 'backward'; // defaults to 'forward'
}
```

If `direction` is omitted, forward pagination is used.

### Response Meta Fields (subset)
```
meta: {
	total_estimate: number;      // size of fused pool (not page count)
	request: {
		limit: number;             // effective limit after capping
		requested_limit: number;   // original client request
		direction?: 'forward' | 'backward';
	}
	nextCursor: string | null;   // forward: next page; backward: earlier (further backward) page
	prevCursor: string | null;   // forward: previous page start; backward: later (toward original cursor)
	hasNext: boolean;            // indicates usability of nextCursor in the current direction model
	hasPrev: boolean;            // indicates availability of prevCursor
}
```

### Directional Rules
Forward (`direction=forward` or default):
* `nextCursor` → items strictly after the last item of current page.
* `prevCursor` (when present) points just before the first item of current page.

Backward (`direction=backward`):
* The supplied cursor identifies the first item of the forward page you are stepping back from.
* Returned page contains items immediately preceding that cursor item (cursor item excluded).
* `nextCursor` lets you continue moving further backward (earlier in the pool).
* `prevCursor` points to the last item of the current backward slice (so the client can move forward again toward its original position).

### Client Guidance
* Treat cursors as opaque.
* Always honor `limit` echo in `meta.request.limit` (server may cap).
* Do not rely on cross‑request `rank` comparisons; instead, track identity via `object_id` if needed.
* To reverse direction (e.g., after several backward steps), send the latest `prevCursor` with `direction:'forward'`.

### Testing Notes
Internal tests only assert stable invariants (no overlap in forward windows; absence of cursor item in backward window; direction echo; cursor flag consistency). This keeps tests resilient to benign ordering perturbations caused by floating normalization changes.

Full standalone spec: `docs/spec/graph-search-pagination.md`.
