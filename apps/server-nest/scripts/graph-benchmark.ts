#!/usr/bin/env ts-node
/*
 * Synthetic graph traversal benchmark.
 * Goal: generate a predictable branching-factor graph and measure traversal latency
 * for depths 1..3 with varying root counts and limits. Uses existing GraphService
 * API directly (in-process) against a live Postgres (ensure DB_AUTOINIT=true or run migrations).
 *
 * Usage:
 *   npx ts-node scripts/graph-benchmark.ts --nodes 2000 --branch 3 --depth 3 --roots 5 --limit 100 --runs 5 --warmup 1
 *
 * Defaults tuned for fast local runs (< a few seconds). Adjust params for deeper analysis.
 */
import { DatabaseService } from '../src/common/database/database.service';
import { AppConfigService } from '../src/common/config/config.service';
import { GraphService } from '../src/modules/graph/graph.service';
import { SchemaRegistryService } from '../src/modules/graph/schema-registry.service';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

interface Args { [k: string]: string | number | boolean; }
function parseArgs(): Args {
    const out: Args = {};
    for (let i = 2; i < process.argv.length; i++) {
        const a = process.argv[i];
        if (a.startsWith('--')) {
            const [k, v] = a.substring(2).split('=');
            out[k] = v === undefined ? true : (/^\d+$/.test(v) ? parseInt(v, 10) : v);
        }
    }
    return out;
}

(async () => {
    const args = parseArgs();
    const targetNodes = (args.nodes as number) || 1500;
    const branching = (args.branch as number) || 3; // edges per node (approx)
    const maxDepth = (args.depth as number) || 3;
    const rootsCount = (args.roots as number) || 3;
    const pageLimit = (args.limit as number) || 100;
    const fakeMode = process.env.GRAPH_BENCH_FAKE_DB === '1';
    const runs = (args.runs as number) || 1; // number of repetitions per scenario for stats
    const warmup = Math.min((args.warmup as number) || 0, runs - 1 < 0 ? 0 : runs - 1); // warmup runs excluded from aggregates

    function gitCommit(): string | undefined {
        try {
            const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] });
            return r.status === 0 ? r.stdout.toString('utf8').trim() : undefined;
        } catch { return undefined; }
    }

    // Resolve JSONL output path (workspace root /logs)
    const jsonlPath = path.resolve(__dirname, '../../logs/graph-benchmark.jsonl');
    fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });
    const runMeta = {
        timestamp: new Date().toISOString(),
        git_commit: gitCommit(),
        fake_db: false as boolean,
        params: { targetNodes, branching, maxDepth, rootsCount, pageLimit, runs, warmup },
    };

    function appendRecord(rec: Record<string, unknown>) {
        try {
            fs.appendFileSync(jsonlPath, JSON.stringify(rec) + '\n');
        } catch (err) {
            console.warn('[warn] failed to append JSONL record', err);
        }
    }

    const config = new AppConfigService(process.env as any);
    // Force auto init for schema when DB_AUTOINIT not already set.
    if (!process.env.DB_AUTOINIT) (process.env as any).DB_AUTOINIT = '1';
    let graph: GraphService | undefined;
    let objectIds: string[] = [];
    let orgId: string | null = null;
    let projectId: string | null = null;
    if (!fakeMode) {
        const db = new DatabaseService(config);
        await db.onModuleInit();
        if (!db.isOnline()) {
            if (process.env.GRAPH_BENCH_FAKE_DB === '1') {
                console.warn('[fallback] Database offline – switching to fake in-memory benchmark mode. Metrics are NOT representative of real DB latency.');
            } else {
                console.error('Database offline – cannot run benchmark. Set GRAPH_BENCH_FAKE_DB=1 to allow synthetic fallback.');
                process.exit(1);
            }
        } else {
            const schemaRegistry = new SchemaRegistryService(db);
            graph = new GraphService(db, schemaRegistry);
            // Ensure org + project (reuse if already present)
            const orgRes = await db.query<{ id: string }>(`SELECT id FROM kb.orgs ORDER BY created_at ASC LIMIT 1`);
            if (orgRes.rowCount === 0) {
                const created = await db.query<{ id: string }>(`INSERT INTO kb.orgs(name) VALUES ('bench-org') RETURNING id`);
                orgId = created.rows[0].id;
            } else { orgId = orgRes.rows[0].id; }
            const projRes = await db.query<{ id: string }>(`SELECT id FROM kb.projects WHERE org_id = $1 ORDER BY created_at ASC LIMIT 1`, [orgId]);
            if (projRes.rowCount === 0) {
                const created = await db.query<{ id: string }>(`INSERT INTO kb.projects(org_id, name) VALUES ($1,'bench-project') RETURNING id`, [orgId]);
                projectId = created.rows[0].id;
            } else { projectId = projRes.rows[0].id; }

            // ----- Seed synthetic objects -----
            console.log(`[seed] creating ~${targetNodes} objects (org=${orgId} project=${projectId})`);
            for (let i = 0; i < targetNodes; i++) {
                const res = await db.query<{ id: string }>(
                    `INSERT INTO kb.graph_objects(org_id, project_id, type, key, version, canonical_id, properties, labels)
           VALUES ($1,$2,'BenchmarkNode',$3,1,gen_random_uuid(),'{}'::jsonb,ARRAY['bench'])
           RETURNING id`, [orgId, projectId, `node_${i}`]
                );
                objectIds.push(res.rows[0].id);
            }
            // ----- Seed relationships with approximate branching factor -----
            console.log(`[seed] creating relationships (branching=${branching})`);
            let rels = 0;
            for (let i = 0; i < objectIds.length; i++) {
                for (let b = 1; b <= branching; b++) {
                    const dstIndex = (i * branching + b) % objectIds.length;
                    if (dstIndex === i) continue;
                    await db.query(
                        `INSERT INTO kb.graph_relationships(org_id, project_id, type, src_id, dst_id, version, canonical_id, properties)
             VALUES ($1,$2,'bench_edge',$3,$4,1,gen_random_uuid(),'{}'::jsonb)`,
                        [orgId, projectId, objectIds[i], objectIds[dstIndex]]
                    );
                    rels++;
                }
            }
            console.log(`[seed] inserted ${rels} relationships`);
        }
    }

    // Fake mode (or fallback) seeding purely in memory
    if (fakeMode || (!graph && process.env.GRAPH_BENCH_FAKE_DB === '1')) {
        runMeta.fake_db = true;
        console.log(`[seed:fallback] generating in-memory graph nodes=${targetNodes} branching=${branching}`);
        objectIds = Array.from({ length: targetNodes }, (_, i) => `fake_${i}`);
    }

    const roots = objectIds.slice(0, rootsCount);
    const scenarios = [
        { label: 'depth1', maxDepth: 1 },
        { label: 'depth2', maxDepth: Math.min(2, maxDepth) },
        { label: 'depth3', maxDepth: Math.min(3, maxDepth) },
    ];

    interface RawRun { scenario: string; depth: number; elapsed_ms: number; nodes_returned: number; total_nodes: number; truncated: boolean; warmup: boolean; };
    const rawRuns: RawRun[] = [];

    for (const s of scenarios) {
        for (let i = 0; i < runs; i++) {
            const start = Date.now();
            if (graph && !runMeta.fake_db) {
                const res = await graph.traverse({ root_ids: roots, max_depth: s.maxDepth, limit: pageLimit } as any);
                const ms = Date.now() - start;
                const record: RawRun = {
                    scenario: s.label,
                    depth: s.maxDepth,
                    elapsed_ms: ms,
                    nodes_returned: res.nodes.length ?? 0,
                    total_nodes: (res as any).total_nodes ?? res.nodes.length ?? 0,
                    truncated: Boolean((res as any).truncated),
                    warmup: i < warmup
                };
                rawRuns.push(record);
                appendRecord({ type: 'raw', run_index: i, ...runMeta, ...record });
                console.log(`[run${i < warmup ? ':warmup' : ''}] ${s.label}#${i + 1}/${runs} depth=${s.maxDepth} nodes=${res.nodes.length}/${res.total_nodes} truncated=${res.truncated} in ${ms}ms`);
            } else {
                // In-memory traversal simulation (approximate BFS over synthetic deterministic edges)
                const visited = new Set<string>();
                const queue: Array<{ id: string; depth: number }> = roots.map(r => ({ id: r, depth: 0 }));
                while (queue.length) {
                    const { id, depth } = queue.shift()!;
                    if (visited.has(id)) continue;
                    visited.add(id);
                    if (visited.size >= pageLimit) break;
                    if (depth >= s.maxDepth) continue;
                    const idx = parseInt(id.split('_').pop() || '0', 10);
                    for (let b = 1; b <= branching; b++) {
                        const dstIndex = (idx * branching + b) % objectIds.length;
                        if (dstIndex === idx) continue;
                        queue.push({ id: `fake_${dstIndex}`, depth: depth + 1 });
                    }
                }
                const ms = Date.now() - start;
                const totalReachable = Math.min(objectIds.length, rootsCount * Math.pow(branching, s.maxDepth));
                const record: RawRun = {
                    scenario: s.label,
                    depth: s.maxDepth,
                    elapsed_ms: ms,
                    nodes_returned: visited.size,
                    total_nodes: totalReachable,
                    truncated: visited.size < totalReachable,
                    warmup: i < warmup,
                };
                rawRuns.push(record);
                appendRecord({ type: 'raw', run_index: i, ...runMeta, ...record });
                console.log(`[run${i < warmup ? ':warmup' : ':fallback'}] ${s.label}#${i + 1}/${runs} depth=${s.maxDepth} nodes=${record.nodes_returned}/${record.total_nodes} truncated=${record.truncated} in ${ms}ms`);
            }
        }
    }

    function percentile(sorted: number[], p: number): number {
        if (!sorted.length) return 0;
        const idx = (p / 100) * (sorted.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        if (lo === hi) return sorted[lo];
        const t = idx - lo;
        return sorted[lo] + (sorted[hi] - sorted[lo]) * t;
    }

    const aggregated = scenarios.map(s => {
        const scenarioRuns = rawRuns.filter(r => r.scenario === s.label);
        const activeRuns = scenarioRuns.filter(r => !r.warmup);
        const runsFor = activeRuns.map(r => r.elapsed_ms).sort((a, b) => a - b);
        const nodesReturned = activeRuns.map(r => r.nodes_returned);
        const totalNodes = rawRuns.find(r => r.scenario === s.label)?.total_nodes ?? 0;
        const truncatedAny = activeRuns.some(r => r.truncated);
        const mean = runsFor.reduce((a, b) => a + b, 0) / (runsFor.length || 1);
        const summary = {
            scenario: s.label,
            depth: s.maxDepth,
            runs: runsFor.length,
            warmup_excluded: warmup,
            min_ms: runsFor[0] || 0,
            p50_ms: percentile(runsFor, 50),
            p95_ms: percentile(runsFor, 95),
            max_ms: runsFor[runsFor.length - 1] || 0,
            mean_ms: Math.round(mean * 100) / 100,
            last_run_ms: runsFor[runsFor.length - 1] || 0,
            nodes_returned_last: nodesReturned[nodesReturned.length - 1] || 0,
            total_nodes: totalNodes,
            truncated_any: truncatedAny,
        };
        appendRecord({ type: 'aggregate', ...runMeta, ...summary });
        return summary;
    });

    // Summary
    console.log('\nBenchmark Summary (JSON)');
    console.log(JSON.stringify({ ...runMeta, aggregated, raw: rawRuns }, null, 2));
    process.exit(0);
})();
