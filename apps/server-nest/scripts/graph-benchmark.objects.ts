/*
 * Object micro-benchmark (developer aid, not formal perf test)
 * Measures createObject + patchObject cycles using FakeGraphDb.
 */
/* eslint-disable no-console */
import { performance } from 'perf_hooks';
import { randomUUID } from 'crypto';

class DummySchemaRegistry { async getObjectValidator() { return null; } async getRelationshipMultiplicity() { return { src: 'many', dst: 'many' }; } async getRelationshipValidator() { return null; } }

async function loadFakeDb() {
    const mod = require('../tests/helpers/fake-graph-db.ts');
    return mod.makeFakeGraphDb({ enableHistory: true });
}

class FakeDatabaseService {
    constructor(private impl: any) { }
    async getClient() { return { query: (s: string, p?: any[]) => this.impl.query(s, p), release() { } }; }
    async query<T = any>(sql: string, params?: any[]) { return this.impl.query(sql, params); }
}

async function main() {
    const iterations = parseInt(process.env.GRAPH_BENCH_ITERS || '3000', 10);
    const warmup = Math.min(300, Math.floor(iterations * 0.1));
    const fakeDb = await loadFakeDb();
    const { GraphService } = require('../src/modules/graph/graph.service');
    const service = new GraphService(new FakeDatabaseService(fakeDb), new DummySchemaRegistry());

    // Warmup
    for (let i = 0; i < warmup; i++) {
        const key = 'k' + i;
        await service.createObject({ type: 'node', key, properties: { i } });
        await service.patchObject('o_' + (i + 1), { properties: { j: i } });
    }
    fakeDb.objects = []; // reset

    const start = performance.now();
    let versions = 0;
    for (let i = 0; i < iterations; i++) {
        const key = 'bench_' + i;
        const created = await service.createObject({ type: 'node', key, properties: { n: i } });
        const patched = await service.patchObject(created.id, { properties: { n: i, p: true } });
        versions += patched.version;
    }
    const elapsedMs = performance.now() - start;
    const ops = iterations * 2;
    console.log(JSON.stringify({
        benchmark: 'graph.objects.create+patch',
        iterations,
        operations: ops,
        elapsed_ms: Math.round(elapsedMs),
        ops_per_sec: +(ops / (elapsedMs / 1000)).toFixed(1),
        avg_ms_per_op: +(elapsedMs / ops).toFixed(4),
        versions_written: versions,
        node: process.version
    }, null, 2));
}

main().catch(e => { console.error('Benchmark failed', e); process.exit(1); });
