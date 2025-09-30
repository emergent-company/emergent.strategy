/*
 * Relationship micro-benchmark (developer aid, not a formal perf test)
 *
 * Measures basic throughput of createRelationship + patchRelationship cycles
 * using the in-memory FakeGraphDb test helper so contributors can spot
 * accidental slowdowns in validation / pattern matching logic.
 *
 * Usage (from repo root):
 *   npx ts-node apps/server-nest/scripts/graph-benchmark.relationships.ts
 * or add npm script:
 *   "bench:graph:relationships": "ts-node apps/server-nest/scripts/graph-benchmark.relationships.ts"
 */

/* eslint-disable no-console */
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';

// Minimal shape compatible with GraphService expectations
class DummySchemaRegistry {
    async getRelationshipMultiplicity(_projectId: string, _type: string) {
        return { src: 'many', dst: 'many' } as const; // simplest path
    }
    async getRelationshipValidator() { return null; }
    async getObjectValidator() { return null; }
}

// Dynamically import FakeGraphDb from tests helper (keeps benchmark collocated with evolving patterns)
async function loadFakeDb() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../tests/helpers/fake-graph-db.ts');
    if (!mod.makeFakeGraphDb) throw new Error('makeFakeGraphDb not exported');
    return mod.makeFakeGraphDb({ enableRelationships: true });
}

// Light wrapper implementing subset of DatabaseService used by GraphService
class FakeDatabaseService {
    constructor(private impl: any) { }
    async getClient() { return { query: (s: string, p?: any[]) => this.impl.query(s, p), release() {/* no-op */ } }; }
    async query<T = any>(sql: string, params?: any[]) { return this.impl.query(sql, params); }
}

async function main() {
    const iterations = parseInt(process.env.GRAPH_BENCH_ITERS || '2000', 10); // each iteration creates + patches same rel
    const warmup = Math.min(200, Math.floor(iterations * 0.1));
    const fakeDb = await loadFakeDb();
    const { GraphService } = require('../src/modules/graph/graph.service');
    const service = new GraphService(new FakeDatabaseService(fakeDb), new DummySchemaRegistry());

    // Pre-create two objects ids we can reference (we only need their ids, FakeGraphDb does not enforce FK)
    const srcId = randomUUID();
    const dstId = randomUUID();
    // Seed object rows directly into backing arrays for realism of created_at spacing
    fakeDb._insertObject({ id: srcId, type: 'node', key: 'src', labels: [], properties: {} });
    fakeDb._insertObject({ id: dstId, type: 'node', key: 'dst', labels: [], properties: {} });

    // Warmup (JIT / caches / branch prediction in Node, though tiny) – ignored in metrics
    for (let i = 0; i < warmup; i++) {
        const relType = 'relType';
        await service.createRelationship({ type: relType, src_id: srcId, dst_id: dstId, properties: { i } }, 'org', 'proj');
        const created = await service.createRelationship({ type: relType, src_id: srcId, dst_id: dstId, properties: { i, updated: true } }, 'org', 'proj');
        // created may be head reuse (no diff) or new version depending on properties diff
        if (!created) throw new Error('unexpected');
    }

    // Reset relationship store to exclude warmup artifacts
    fakeDb._resetRelationships();

    const start = performance.now();
    let versions = 0;
    for (let i = 0; i < iterations; i++) {
        const relType = 'relType';
        const created = await service.createRelationship({ type: relType, src_id: srcId, dst_id: dstId, properties: { n: i } }, 'org', 'proj');
        const patched = await service.createRelationship({ type: relType, src_id: srcId, dst_id: dstId, properties: { n: i, p: true } }, 'org', 'proj');
        versions += (patched.version || 1);
        if (!created || !patched) throw new Error('create/patch failed');
    }
    const elapsedMs = performance.now() - start;
    const ops = iterations * 2; // create + patch attempts
    const opsPerSec = (ops / (elapsedMs / 1000)).toFixed(1);
    console.log(JSON.stringify({
        benchmark: 'graph.relationships.create+patch',
        iterations,
        operations: ops,
        elapsed_ms: Math.round(elapsedMs),
        ops_per_sec: Number(opsPerSec),
        avg_ms_per_op: +(elapsedMs / ops).toFixed(4),
        versions_written: versions,
        node: process.version
    }, null, 2));
}

main().catch(err => {
    console.error('Benchmark failed', err);
    process.exit(1);
});
