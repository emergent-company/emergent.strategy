/*
 * Traversal benchmark (developer aid)
 * Simulates a small clustered graph then runs traverse() calls.
 */
/* eslint-disable no-console */
import { performance } from 'perf_hooks';

class DummySchemaRegistry { async getRelationshipMultiplicity() { return { src: 'many', dst: 'many' }; } async getRelationshipValidator() { return null; } async getObjectValidator() { return null; } }

async function loadFakeDb() {
    const mod = require('../tests/helpers/fake-graph-db.ts');
    return mod.makeFakeGraphDb({ enableTraversal: true, enableRelationships: true, enableHistory: false, enableSearch: false });
}

class FakeDatabaseService { constructor(private impl: any) { } async getClient() { return { query: (s: string, p?: any[]) => this.impl.query(s, p), release() { } }; } async query(s: string, p?: any[]) { return this.impl.query(s, p); } }

async function seed(db: any, clusters = 5, perCluster = 25) {
    // Create objects
    for (let c = 0; c < clusters; c++) {
        for (let i = 0; i < perCluster; i++) {
            db._insertObject({ type: 'node', key: `c${c}_n${i}`, properties: { cluster: c } });
        }
    }
    // Wire intra-cluster relationships (line + few chords)
    for (let c = 0; c < clusters; c++) {
        const members = db.objects.filter((o: any) => o.key.startsWith(`c${c}_`));
        for (let i = 0; i < members.length - 1; i++) {
            // relation create emulation: directly push row (simpler than invoking GraphService for bulk seed)
            db.relationships.push({ id: 'r_auto_' + db.relationships.length, org_id: null, project_id: 'proj', type: 'link', src_id: members[i].id, dst_id: members[i + 1].id, properties: {}, version: 1, supersedes_id: null, canonical_id: 'cr_auto_' + (db.relationships.length + 1), weight: 0, valid_from: null, valid_to: null, deleted_at: null, created_at: new Date(Date.now() + i * 5).toISOString() });
        }
    }
}

async function main() {
    const fakeDb = await loadFakeDb();
    await seed(fakeDb, 6, 35); // ~210 nodes
    const { GraphService } = require('../src/modules/graph/graph.service');
    const service = new GraphService(new FakeDatabaseService(fakeDb), new DummySchemaRegistry());

    const iterations = parseInt(process.env.GRAPH_BENCH_ITERS || '200', 10);
    const rootPool = fakeDb.objects.slice(0, 50).map((o: any) => o.id);

    // Warmup 5 traversals
    for (let i = 0; i < 5; i++) {
        await service.traverse({ root_ids: [rootPool[i]], max_depth: 2, max_nodes: 300, max_edges: 600, direction: 'both' });
    }

    const start = performance.now();
    let totalNodes = 0; let totalEdges = 0; let maxDepth = 0;
    for (let i = 0; i < iterations; i++) {
        const root = rootPool[i % rootPool.length];
        const res = await service.traverse({ root_ids: [root], max_depth: 2, max_nodes: 300, max_edges: 600, direction: 'both' });
        totalNodes += res.total_nodes;
        totalEdges += res.edges.length;
        if (res.max_depth_reached > maxDepth) maxDepth = res.max_depth_reached;
    }
    const elapsedMs = performance.now() - start;
    console.log(JSON.stringify({
        benchmark: 'graph.traverse',
        iterations,
        elapsed_ms: Math.round(elapsedMs),
        traversals_per_sec: +(iterations / (elapsedMs / 1000)).toFixed(1),
        avg_ms_per_traversal: +(elapsedMs / iterations).toFixed(3),
        avg_nodes_per_traversal: +(totalNodes / iterations).toFixed(1),
        avg_edges_per_traversal: +(totalEdges / iterations).toFixed(1),
        max_depth_reached: maxDepth,
        node: process.version
    }, null, 2));
}

main().catch(e => { console.error('Traversal benchmark failed', e); process.exit(1); });
