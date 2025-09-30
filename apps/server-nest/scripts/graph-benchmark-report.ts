#!/usr/bin/env ts-node
/*
 * Graph Benchmark Report
 *
 * Reads JSONL records from logs/graph-benchmark.jsonl (raw + aggregate) and produces a summary
 * table (latest per scenario) plus optional historical comparisons.
 *
 * Usage:
 *   npx ts-node scripts/graph-benchmark-report.ts [--limit 10] [--since <ISO>] [--json] [--csv]
 *
 * Flags:
 *   --limit <n>    Max number of aggregate records per scenario to include in history (default 5)
 *   --since <ISO>  Filter records to those with timestamp >= since (ISO8601)
 *   --json         Output machine-readable JSON instead of human table
 *   --csv          Output CSV aggregated latest rows (one per scenario)
 *   --regress <p>  Warn if latest p95 exceeds previous p95 by more than <p> percent
 *   --scenario <name>[,<name2>]  Restrict to specific scenarios
 *   --status       Exit code 2 if regression threshold exceeded
 */
import fs from 'fs';
import path from 'path';

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

interface AggregateRec {
    type: 'aggregate';
    timestamp: string;
    git_commit?: string;
    fake_db: boolean;
    params: any;
    scenario: string;
    depth: number;
    runs: number;
    min_ms: number;
    p50_ms: number;
    p95_ms: number;
    max_ms: number;
    mean_ms: number;
    last_run_ms: number;
    nodes_returned_last: number;
    total_nodes: number;
    truncated_any: boolean;
}

interface RawRec { type: 'raw'; timestamp: string; scenario: string; depth: number; elapsed_ms: number; run_index: number; }

const args = parseArgs();
const limit = (args.limit as number) || 5;
const since = args.since as string | undefined;
const jsonOut = !!args.json;
const scenarioFilter = (args.scenario as string | undefined)?.split(',').filter(Boolean);
const csvOut = !!args.csv;
const regressPct = args.regress ? Number(args.regress) : undefined;
const statusMode = !!args.status;

const logPath = path.resolve(__dirname, '../../logs/graph-benchmark.jsonl');
if (!fs.existsSync(logPath)) {
    console.error('No benchmark log file found at', logPath);
    process.exit(1);
}

const aggregates: AggregateRec[] = [];
const raw: RawRec[] = [];
const rawFile = fs.readFileSync(logPath, 'utf8');
const lines = rawFile.split('\n').filter(Boolean);
let malformed = 0;
for (const line of lines) {
    try {
        const obj = JSON.parse(line);
        if (since && obj.timestamp && obj.timestamp < since) continue;
        if (obj.type === 'aggregate') aggregates.push(obj as AggregateRec);
        else if (obj.type === 'raw') raw.push(obj as RawRec);
    } catch { malformed++; }
}

let filteredAgg = aggregates;
if (scenarioFilter?.length) {
    filteredAgg = filteredAgg.filter(a => scenarioFilter.includes(a.scenario));
}

// Sort newest first
filteredAgg.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

// Group by scenario
const byScenario: Record<string, AggregateRec[]> = {};
for (const a of filteredAgg) {
    (byScenario[a.scenario] ||= []).push(a);
}

// Trim history per scenario
for (const k of Object.keys(byScenario)) {
    byScenario[k] = byScenario[k].slice(0, limit);
}

// Helper to compute regression deltas (latest vs previous) per scenario
interface ScenarioDelta { scenario: string; p95_delta_ms?: number; p95_delta_pct?: number; regression?: boolean; }
const deltas: ScenarioDelta[] = [];
for (const [scenario, recs] of Object.entries(byScenario)) {
    if (recs.length >= 2) {
        const latest = recs[0];
        const prev = recs[1];
        const diff = latest.p95_ms - prev.p95_ms;
        const pct = prev.p95_ms ? (diff / prev.p95_ms) * 100 : 0;
        const regression = regressPct !== undefined ? pct > regressPct : false;
        deltas.push({ scenario, p95_delta_ms: diff, p95_delta_pct: pct, regression });
    } else {
        deltas.push({ scenario });
    }
}

if (jsonOut) {
    const out = Object.fromEntries(Object.entries(byScenario).map(([k, recs]) => [k, recs]));
    console.log(JSON.stringify({ scenarios: out, malformed_lines: malformed, deltas }, null, 2));
    process.exit(0);
}

if (csvOut) {
    // Latest only per scenario
    const header = ['scenario', 'depth', 'runs', 'p50_ms', 'p95_ms', 'mean_ms', 'min_ms', 'max_ms', 'truncated_any', 'fake_db', 'timestamp', 'git_commit', 'p95_delta_ms', 'p95_delta_pct'];
    console.log(header.join(','));
    for (const [scenario, recs] of Object.entries(byScenario)) {
        if (!recs.length) continue;
        const latest = recs[0];
        const delta = deltas.find(d => d.scenario === scenario);
        const row = [
            scenario,
            latest.depth,
            latest.runs,
            latest.p50_ms,
            latest.p95_ms,
            latest.mean_ms,
            latest.min_ms,
            latest.max_ms,
            latest.truncated_any ? 1 : 0,
            latest.fake_db ? 1 : 0,
            latest.timestamp,
            latest.git_commit || '',
            delta?.p95_delta_ms ?? '',
            delta?.p95_delta_pct?.toFixed(2) ?? ''
        ];
        console.log(row.join(','));
    }
    process.exit(0);
}

// Human-readable table
function pad(str: string, len: number): string { return str.length >= len ? str : str + ' '.repeat(len - str.length); }
const headers = ['SCENARIO', 'DEPTH', 'RUNS', 'P50(ms)', 'P95(ms)', 'ΔP95(ms)', 'ΔP95(%)', 'MEAN(ms)', 'MIN', 'MAX', 'TRUNC', 'FAKE', 'TIMESTAMP', 'COMMIT'];
const colWidths = [10, 5, 5, 8, 9, 9, 8, 9, 5, 5, 6, 5, 25, 8];

let output = '';
output += headers.map((h, i) => pad(h, colWidths[i])).join(' ') + '\n';
output += headers.map((_, i) => '-'.repeat(colWidths[i])).join(' ') + '\n';
for (const [scenario, recs] of Object.entries(byScenario)) {
    for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        const delta = deltas.find(d => d.scenario === scenario);
        const dMs = i === 0 && delta?.p95_delta_ms !== undefined ? delta.p95_delta_ms.toFixed(1) : '';
        const dPct = i === 0 && delta?.p95_delta_pct !== undefined ? (delta.p95_delta_pct as number).toFixed(1) + '%' : '';
        output += [
            scenario + (i ? `#${i + 1}` : ''),
            r.depth.toString(),
            r.runs.toString(),
            r.p50_ms.toFixed(1),
            r.p95_ms.toFixed(1),
            dMs,
            dPct,
            r.mean_ms.toFixed(1),
            r.min_ms.toFixed(0),
            r.max_ms.toFixed(0),
            r.truncated_any ? 'Y' : 'N',
            r.fake_db ? 'Y' : 'N',
            r.timestamp.replace('T', ' ').replace('Z', ''),
            r.git_commit?.slice(0, 8) || ''
        ].map((v, i2) => pad(v, colWidths[i2])).join(' ') + '\n';
    }
}

output += `\nMalformed lines: ${malformed}`;
if (regressPct !== undefined) {
    const offenders = deltas.filter(d => d.regression);
    if (offenders.length) {
        output += `\nRegression threshold ${regressPct}% exceeded in scenarios: ${offenders.map(o => o.scenario).join(', ')}`;
    } else {
        output += `\nNo regressions above ${regressPct}% threshold.`;
    }
    if (statusMode && offenders.length) {
        console.log(output.trimEnd());
        process.exit(2);
    }
}
console.log(output.trimEnd());
