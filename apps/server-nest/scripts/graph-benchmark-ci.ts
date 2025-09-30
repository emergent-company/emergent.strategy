#!/usr/bin/env ts-node
/*
 * CI Graph Benchmark Threshold Guard
 * Runs the synthetic benchmark with fixed parameters (or honors env overrides)
 * then enforces p95 latency thresholds per depth. Fails (exit 1) if violated.
 *
 * Threshold config via env (defaults in parens):
 *   GRAPH_BENCH_NODES (1000)
 *   GRAPH_BENCH_BRANCH (3)
 *   GRAPH_BENCH_DEPTH (3)
 *   GRAPH_BENCH_ROOTS (3)
 *   GRAPH_BENCH_LIMIT (150)
 *   GRAPH_BENCH_RUNS (3)
 *   GRAPH_BENCH_WARMUP (1)
 *   GRAPH_BENCH_P95_DEPTH1_MS (20)
 *   GRAPH_BENCH_P95_DEPTH2_MS (40)
 *   GRAPH_BENCH_P95_DEPTH3_MS (60)
 *
 * Implementation detail: invokes the main benchmark script in-process (import) so we can capture
 * the aggregated JSON programmatically without re‑parsing stdout. To avoid refactor churn, we do a
 * light wrapper: temporarily monkey‑patch console.log to intercept final summary line if necessary.
 */
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';

interface AggregateSummary { scenario: string; depth: number; p95_ms: number; }

function envInt(name: string, def: number): number { const v = process.env[name]; return v && /^\d+$/.test(v) ? parseInt(v, 10) : def; }

const params = {
    nodes: envInt('GRAPH_BENCH_NODES', 1000),
    branch: envInt('GRAPH_BENCH_BRANCH', 3),
    depth: envInt('GRAPH_BENCH_DEPTH', 3),
    roots: envInt('GRAPH_BENCH_ROOTS', 3),
    limit: envInt('GRAPH_BENCH_LIMIT', 150),
    runs: envInt('GRAPH_BENCH_RUNS', 3),
    warmup: envInt('GRAPH_BENCH_WARMUP', 1),
};

const thresholds = {
    d1: envInt('GRAPH_BENCH_P95_DEPTH1_MS', 20),
    d2: envInt('GRAPH_BENCH_P95_DEPTH2_MS', 40),
    d3: envInt('GRAPH_BENCH_P95_DEPTH3_MS', 60),
};

function runBenchmark(): any {
    const script = path.resolve(__dirname, 'graph-benchmark.ts');
    const args = [script, `--nodes=${params.nodes}`, `--branch=${params.branch}`, `--depth=${params.depth}`, `--roots=${params.roots}`, `--limit=${params.limit}`, `--runs=${params.runs}`, `--warmup=${params.warmup}`];
    const r = spawnSync('ts-node', args, { encoding: 'utf8' });
    if (r.status !== 0) {
        console.error('[ci-bench] benchmark process failed', r.stderr || r.stdout);
        process.exit(1);
    }
    // Extract final JSON summary (last JSON block). We look for a line starting with '{' and containing 'aggregated'.
    const lines = (r.stdout || '').split(/\n/).reverse();
    let jsonLine: string | undefined;
    for (const line of lines) {
        if (line.trim().startsWith('{') && line.includes('"aggregated"')) { jsonLine = line.trim(); break; }
    }
    if (!jsonLine) {
        console.error('[ci-bench] could not locate JSON summary in output');
        fs.writeFileSync(path.resolve(process.cwd(), 'ci-bench-debug.log'), r.stdout || '');
        process.exit(1);
    }
    try { return JSON.parse(jsonLine); } catch (e) {
        console.error('[ci-bench] failed to parse summary JSON', e); process.exit(1);
    }
}

const result = runBenchmark();
const aggregated: AggregateSummary[] = result.aggregated || [];

function findScenario(depth: number): AggregateSummary | undefined {
    return aggregated.find(a => a.depth === depth);
}

interface Violation { depth: number; p95: number; threshold: number; }
const violations: Violation[] = [];
const d1 = findScenario(1); if (d1 && d1.p95_ms > thresholds.d1) violations.push({ depth: 1, p95: d1.p95_ms, threshold: thresholds.d1 });
const d2 = findScenario(2); if (d2 && d2.p95_ms > thresholds.d2) violations.push({ depth: 2, p95: d2.p95_ms, threshold: thresholds.d2 });
const d3 = findScenario(3); if (d3 && d3.p95_ms > thresholds.d3) violations.push({ depth: 3, p95: d3.p95_ms, threshold: thresholds.d3 });

if (violations.length) {
    console.error('\n[ci-bench] PERFORMANCE REGRESSION DETECTED');
    for (const v of violations) {
        console.error(`  depth ${v.depth} p95=${v.p95.toFixed(2)}ms > threshold=${v.threshold}ms`);
    }
    console.error('\nAggregate:', JSON.stringify(aggregated, null, 2));
    process.exit(1);
}

console.log('[ci-bench] All p95 latency thresholds satisfied.');
console.log('Params:', params);
console.log('Thresholds:', thresholds);
console.log('Aggregate:', JSON.stringify(aggregated, null, 2));
