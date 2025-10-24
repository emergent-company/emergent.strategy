import { beforeAll, afterAll, afterEach, describe, test, expect } from 'vitest';
import supertest from 'supertest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * Phase 3 Priority #3: Advanced Graph Traversal Features (E2E)
 * 
 * Tests for:
 * - 3a: Phased Traversal (edgePhases)
 * - 3b: Property Predicate Filtering (nodeFilter, edgeFilter)
 * - 3c: Path Enumeration (returnPaths, maxPathsPerNode)
 */

describe('Graph Advanced Traversal (E2E) - Phase 3', () => {
    let ctx: Awaited<ReturnType<typeof createE2EContext>>;
    let request: supertest.SuperTest<supertest.Test>;
    const contextHeaders = () => ({
        ...authHeader('default'),
        'x-org-id': ctx.orgId,
        'x-project-id': ctx.projectId,
    });

    beforeAll(async () => {
        ctx = await createE2EContext('graph-traverse-advanced');
        request = supertest(ctx.baseUrl);
    });

    afterAll(async () => {
        await ctx.close();
    });

    afterEach(async () => {
        if (ctx) {
            await ctx.cleanupProjectArtifacts(ctx.projectId);
        }
    });

    async function createObj(type: string, key: string, properties: any = {}, labels: string[] = []): Promise<any> {
        const res = await request
            .post('/graph/objects')
            .set(contextHeaders())
            .send({ type, key, properties, labels, organization_id: ctx.orgId, project_id: ctx.projectId })
            .expect(201);
        return res.body;
    }

    async function relate(type: string, src: string, dst: string, properties: any = {}): Promise<any> {
        const res = await request
            .post('/graph/relationships')
            .set(contextHeaders())
            .send({ type, src_id: src, dst_id: dst, properties, organization_id: ctx.orgId, project_id: ctx.projectId })
            .expect(201);
        return res.body;
    }

    describe('3a: Phased Traversal', () => {
        test('two-phase traversal: dependencies then implementations', async () => {
            // Scenario: Software requirement depends on another, which has implementations
            // Req1 -DEPENDS_ON-> Req2 -IMPLEMENTED_BY-> Impl1, Impl2
            const req1 = await createObj('Requirement', 'REQ-001', { priority: 'high' });
            const req2 = await createObj('Requirement', 'REQ-002', { priority: 'medium' });
            const impl1 = await createObj('Implementation', 'IMPL-001', { status: 'complete' });
            const impl2 = await createObj('Implementation', 'IMPL-002', { status: 'in-progress' });

            await relate('DEPENDS_ON', req1.id, req2.id);
            await relate('IMPLEMENTED_BY', req2.id, impl1.id);
            await relate('IMPLEMENTED_BY', req2.id, impl2.id);

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [req1.id],
                    edgePhases: [
                        { relationshipTypes: ['DEPENDS_ON'], direction: 'out', maxDepth: 1 },
                        { relationshipTypes: ['IMPLEMENTED_BY'], direction: 'out', maxDepth: 1 }
                    ]
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(req1.id);
            expect(nodeIds).toContain(req2.id);
            expect(nodeIds).toContain(impl1.id);
            expect(nodeIds).toContain(impl2.id);

            // Verify phaseIndex
            const nodesById = Object.fromEntries(body.nodes.map((n: any) => [n.id, n]));
            expect(nodesById[req1.id].phaseIndex).toBe(0); // root
            expect(nodesById[req2.id].phaseIndex).toBe(1); // phase 1
            expect(nodesById[impl1.id].phaseIndex).toBe(2); // phase 2
            expect(nodesById[impl2.id].phaseIndex).toBe(2); // phase 2
        });

        test('three-phase traversal with type filters per phase', async () => {
            // Complex dependency chain with different node types per phase
            const doc = await createObj('Document', 'DOC-1', {});
            const req1 = await createObj('Requirement', 'REQ-1', {});
            const req2 = await createObj('Requirement', 'REQ-2', {});
            const test1 = await createObj('Test', 'TEST-1', {});

            await relate('DOCUMENTS', doc.id, req1.id);
            await relate('DEPENDS_ON', req1.id, req2.id);
            await relate('TESTED_BY', req2.id, test1.id);

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [doc.id],
                    edgePhases: [
                        {
                            relationshipTypes: ['DOCUMENTS'],
                            direction: 'out',
                            maxDepth: 1,
                            objectTypes: ['Requirement']
                        },
                        {
                            relationshipTypes: ['DEPENDS_ON'],
                            direction: 'out',
                            maxDepth: 1,
                            objectTypes: ['Requirement']
                        },
                        {
                            relationshipTypes: ['TESTED_BY'],
                            direction: 'out',
                            maxDepth: 1,
                            objectTypes: ['Test']
                        }
                    ]
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(doc.id);
            expect(nodeIds).toContain(req1.id);
            expect(nodeIds).toContain(req2.id);
            expect(nodeIds).toContain(test1.id);
            expect(body.nodes).toHaveLength(4);
        });

        test('phase with bidirectional search (direction: both)', async () => {
            // Graph: A <- B -> C (B is root, search both directions)
            const a = await createObj('Node', 'A', {});
            const b = await createObj('Node', 'B', {});
            const c = await createObj('Node', 'C', {});

            await relate('LINKS', a.id, b.id);
            await relate('LINKS', b.id, c.id);

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [b.id],
                    edgePhases: [
                        { relationshipTypes: ['LINKS'], direction: 'both', maxDepth: 1 }
                    ]
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(a.id);
            expect(nodeIds).toContain(b.id);
            expect(nodeIds).toContain(c.id);
        });

        test('phase maxDepth limits expansion within that phase', async () => {
            // Linear chain: A -> B -> C -> D -> E
            const nodes = [];
            for (let i = 0; i < 5; i++) {
                nodes.push(await createObj('Node', `N${i}`, {}));
            }
            for (let i = 0; i < 4; i++) {
                await relate('CHAIN', nodes[i].id, nodes[i + 1].id);
            }

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [nodes[0].id],
                    edgePhases: [
                        { relationshipTypes: ['CHAIN'], direction: 'out', maxDepth: 2 }
                    ]
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(nodes[0].id); // root
            expect(nodeIds).toContain(nodes[1].id); // depth 1
            expect(nodeIds).toContain(nodes[2].id); // depth 2
            expect(nodeIds).not.toContain(nodes[3].id); // depth 3 - excluded
            expect(nodeIds).not.toContain(nodes[4].id); // depth 4 - excluded
        });
    });

    describe('3b: Property Predicate Filtering', () => {
        test('nodeFilter with equals operator filters nodes by property', async () => {
            const active1 = await createObj('Task', 'T1', { status: 'active', priority: 5 });
            const active2 = await createObj('Task', 'T2', { status: 'active', priority: 10 });
            const inactive = await createObj('Task', 'T3', { status: 'inactive', priority: 3 });

            await relate('LINKS', active1.id, inactive.id);
            await relate('LINKS', active2.id, inactive.id);

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [active1.id, active2.id, inactive.id],
                    nodeFilter: {
                        path: '/status',
                        operator: 'equals',
                        value: 'active'
                    },
                    max_depth: 0
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(active1.id);
            expect(nodeIds).toContain(active2.id);
            expect(nodeIds).not.toContain(inactive.id);
        });

        test('nodeFilter with greaterThan operator on numeric property', async () => {
            const high = await createObj('Item', 'HIGH', { priority: 100, name: 'High Priority' });
            const med = await createObj('Item', 'MED', { priority: 50, name: 'Medium Priority' });
            const low = await createObj('Item', 'LOW', { priority: 10, name: 'Low Priority' });

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [high.id, med.id, low.id],
                    nodeFilter: {
                        path: '/priority',
                        operator: 'greaterThan',
                        value: 40
                    },
                    max_depth: 0
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(high.id);
            expect(nodeIds).toContain(med.id);
            expect(nodeIds).not.toContain(low.id);
        });

        test('nodeFilter with in operator matches array of values', async () => {
            const tech = await createObj('Item', 'TECH', { category: 'technology' });
            const biz = await createObj('Item', 'BIZ', { category: 'business' });
            const sci = await createObj('Item', 'SCI', { category: 'science' });
            const art = await createObj('Item', 'ART', { category: 'art' });

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [tech.id, biz.id, sci.id, art.id],
                    nodeFilter: {
                        path: '/category',
                        operator: 'in',
                        value: ['technology', 'science']
                    },
                    max_depth: 0
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(tech.id);
            expect(nodeIds).toContain(sci.id);
            expect(nodeIds).not.toContain(biz.id);
            expect(nodeIds).not.toContain(art.id);
        });

        test('nodeFilter with contains operator on string property', async () => {
            const js = await createObj('Doc', 'JS', { title: 'JavaScript Guide for Beginners' });
            const py = await createObj('Doc', 'PY', { title: 'Python Tutorial' });
            const ts = await createObj('Doc', 'TS', { title: 'TypeScript in Action' });

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [js.id, py.id, ts.id],
                    nodeFilter: {
                        path: '/title',
                        operator: 'contains',
                        value: 'Script'
                    },
                    max_depth: 0
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(js.id);
            expect(nodeIds).toContain(ts.id);
            expect(nodeIds).not.toContain(py.id);
        });

        test('nodeFilter with matches operator uses regex', async () => {
            const email1 = await createObj('User', 'U1', { email: 'alice@example.com' });
            const email2 = await createObj('User', 'U2', { email: 'bob@test.org' });
            const email3 = await createObj('User', 'U3', { email: 'charlie@example.net' });

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [email1.id, email2.id, email3.id],
                    nodeFilter: {
                        path: '/email',
                        operator: 'matches',
                        value: '.*@example\\.(com|net)$'
                    },
                    max_depth: 0
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(email1.id);
            expect(nodeIds).toContain(email3.id);
            expect(nodeIds).not.toContain(email2.id);
        });

        test('nodeFilter with exists operator checks property presence', async () => {
            const withDesc = await createObj('Item', 'WITH', { description: 'Has description' });
            const withoutDesc = await createObj('Item', 'WITHOUT', {});

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [withDesc.id, withoutDesc.id],
                    nodeFilter: {
                        path: '/description',
                        operator: 'exists',
                        value: true
                    },
                    max_depth: 0
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(withDesc.id);
            expect(nodeIds).not.toContain(withoutDesc.id);
        });

        test('nodeFilter with nested JSON Pointer path', async () => {
            const verified = await createObj('Item', 'VERIFIED', {
                metadata: { verified: true, timestamp: 12345 }
            });
            const unverified = await createObj('Item', 'UNVERIFIED', {
                metadata: { verified: false, timestamp: 12346 }
            });

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [verified.id, unverified.id],
                    nodeFilter: {
                        path: '/metadata/verified',
                        operator: 'equals',
                        value: true
                    },
                    max_depth: 0
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(verified.id);
            expect(nodeIds).not.toContain(unverified.id);
        });

        test('edgeFilter filters relationships during traversal', async () => {
            // Graph: A -[confidence:0.9]-> B, A -[confidence:0.3]-> C
            const a = await createObj('Node', 'A', {});
            const b = await createObj('Node', 'B', {});
            const c = await createObj('Node', 'C', {});

            await relate('LINKS', a.id, b.id, { confidence: 0.9 });
            await relate('LINKS', a.id, c.id, { confidence: 0.3 });

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [a.id],
                    edgeFilter: {
                        path: '/confidence',
                        operator: 'greaterThanOrEqual',
                        value: 0.5
                    },
                    max_depth: 1
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(a.id);
            expect(nodeIds).toContain(b.id); // high confidence edge
            expect(nodeIds).not.toContain(c.id); // low confidence edge filtered

            // Check that only high-confidence edge is included
            expect(body.edges).toHaveLength(1);
            expect(body.edges[0].dst_id).toBe(b.id);
        });

        test('combined nodeFilter and edgeFilter work together', async () => {
            // Create complex scenario with both filters
            const high = await createObj('Task', 'HIGH', { priority: 100, status: 'active' });
            const med = await createObj('Task', 'MED', { priority: 50, status: 'active' });
            const low = await createObj('Task', 'LOW', { priority: 10, status: 'inactive' });

            await relate('BLOCKS', high.id, med.id, { strength: 8 });
            await relate('BLOCKS', high.id, low.id, { strength: 2 });

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [high.id],
                    nodeFilter: {
                        path: '/status',
                        operator: 'equals',
                        value: 'active'
                    },
                    edgeFilter: {
                        path: '/strength',
                        operator: 'greaterThan',
                        value: 5
                    },
                    max_depth: 1
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(high.id);
            expect(nodeIds).toContain(med.id); // active + strong edge
            expect(nodeIds).not.toContain(low.id); // inactive OR weak edge
        });
    });

    describe('3c: Path Enumeration', () => {
        test('returnPaths includes path for linear chain', async () => {
            // A -> B -> C
            const a = await createObj('Node', 'A', {});
            const b = await createObj('Node', 'B', {});
            const c = await createObj('Node', 'C', {});

            await relate('NEXT', a.id, b.id);
            await relate('NEXT', b.id, c.id);

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [a.id],
                    returnPaths: true,
                    max_depth: 2
                })
                .expect(200);

            const body = res.body;
            const nodesById = Object.fromEntries(body.nodes.map((n: any) => [n.id, n]));

            expect(nodesById[a.id].paths).toEqual([[a.id]]);
            expect(nodesById[b.id].paths).toEqual([[a.id, b.id]]);
            expect(nodesById[c.id].paths).toEqual([[a.id, b.id, c.id]]);
        });

        test('returnPaths includes multiple paths for diamond graph', async () => {
            // Diamond: A -> B -> D, A -> C -> D
            const a = await createObj('Node', 'A', {});
            const b = await createObj('Node', 'B', {});
            const c = await createObj('Node', 'C', {});
            const d = await createObj('Node', 'D', {});

            await relate('PATH', a.id, b.id);
            await relate('PATH', a.id, c.id);
            await relate('PATH', b.id, d.id);
            await relate('PATH', c.id, d.id);

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [a.id],
                    returnPaths: true,
                    max_depth: 2
                })
                .expect(200);

            const body = res.body;
            const nodesById = Object.fromEntries(body.nodes.map((n: any) => [n.id, n]));

            // Node D should have two paths
            expect(nodesById[d.id].paths).toHaveLength(2);

            const pathStrings = nodesById[d.id].paths.map((p: string[]) => p.join('->'));
            expect(pathStrings).toContain(`${a.id}->${b.id}->${d.id}`);
            expect(pathStrings).toContain(`${a.id}->${c.id}->${d.id}`);
        });

        test('maxPathsPerNode limits paths tracked per node', async () => {
            // Create graph where one node has many incoming paths
            // A -> B1 -> D, A -> B2 -> D, A -> B3 -> D, A -> B4 -> D
            const a = await createObj('Node', 'A', {});
            const bs = [];
            for (let i = 0; i < 4; i++) {
                const b = await createObj('Node', `B${i}`, {});
                bs.push(b);
                await relate('CONVERGE', a.id, b.id);
            }
            const d = await createObj('Node', 'D', {});
            for (const b of bs) {
                await relate('CONVERGE', b.id, d.id);
            }

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [a.id],
                    returnPaths: true,
                    maxPathsPerNode: 2,
                    max_depth: 2
                })
                .expect(200);

            const body = res.body;
            const nodesById = Object.fromEntries(body.nodes.map((n: any) => [n.id, n]));

            // D should have at most 2 paths despite 4 possible routes
            expect(nodesById[d.id].paths.length).toBeLessThanOrEqual(2);
        });

        test('paths not included when returnPaths is false', async () => {
            const a = await createObj('Node', 'A', {});
            const b = await createObj('Node', 'B', {});
            await relate('NEXT', a.id, b.id);

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [a.id],
                    returnPaths: false,
                    max_depth: 1
                })
                .expect(200);

            const body = res.body;

            body.nodes.forEach((node: any) => {
                expect(node.paths).toBeUndefined();
            });
        });

        test('paths work with phased traversal', async () => {
            // A -TYPE1-> B -TYPE2-> C
            const a = await createObj('Node', 'A', {});
            const b = await createObj('Node', 'B', {});
            const c = await createObj('Node', 'C', {});

            await relate('TYPE1', a.id, b.id);
            await relate('TYPE2', b.id, c.id);

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [a.id],
                    returnPaths: true,
                    edgePhases: [
                        { relationshipTypes: ['TYPE1'], direction: 'out', maxDepth: 1 },
                        { relationshipTypes: ['TYPE2'], direction: 'out', maxDepth: 1 }
                    ]
                })
                .expect(200);

            const body = res.body;
            const nodesById = Object.fromEntries(body.nodes.map((n: any) => [n.id, n]));

            expect(nodesById[c.id].paths).toEqual([[a.id, b.id, c.id]]);
            expect(nodesById[c.id].phaseIndex).toBe(2);
        });

        test('paths with filters show only paths through filtered nodes', async () => {
            // Graph with property filtering affecting paths
            // A -[w:10]-> B(active) -[w:5]-> C(inactive)
            // A -[w:8]-> D(active)
            const a = await createObj('Node', 'A', { status: 'active' });
            const b = await createObj('Node', 'B', { status: 'active' });
            const c = await createObj('Node', 'C', { status: 'inactive' });
            const d = await createObj('Node', 'D', { status: 'active' });

            await relate('WEIGHTED', a.id, b.id, { weight: 10 });
            await relate('WEIGHTED', b.id, c.id, { weight: 5 });
            await relate('WEIGHTED', a.id, d.id, { weight: 8 });

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [a.id],
                    returnPaths: true,
                    nodeFilter: {
                        path: '/status',
                        operator: 'equals',
                        value: 'active'
                    },
                    max_depth: 2
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            // C is filtered out
            expect(nodeIds).not.toContain(c.id);

            // B and D should have paths
            const nodesById = Object.fromEntries(body.nodes.map((n: any) => [n.id, n]));
            expect(nodesById[b.id].paths).toEqual([[a.id, b.id]]);
            expect(nodesById[d.id].paths).toEqual([[a.id, d.id]]);
        });
    });

    describe('Combined Features - Real-world Scenarios', () => {
        test('software dependency analysis with phased traversal, filtering, and paths', async () => {
            // Scenario: Find all implementations of high-priority requirements
            // Use phases: requirements -> dependencies -> implementations
            // Filter: only high priority (>=7), only complete implementations
            // Track paths to understand dependency chains

            const req1 = await createObj('Requirement', 'REQ-HIGH', { priority: 10, status: 'open' });
            const req2 = await createObj('Requirement', 'REQ-LOW', { priority: 3, status: 'open' });
            const dep1 = await createObj('Dependency', 'DEP-1', { priority: 8, type: 'library' });
            const impl1 = await createObj('Implementation', 'IMPL-1', { status: 'complete' });
            const impl2 = await createObj('Implementation', 'IMPL-2', { status: 'draft' });

            await relate('DEPENDS_ON', req1.id, dep1.id);
            await relate('DEPENDS_ON', req2.id, dep1.id);
            await relate('IMPLEMENTED_BY', dep1.id, impl1.id);
            await relate('IMPLEMENTED_BY', dep1.id, impl2.id);

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [req1.id, req2.id],
                    edgePhases: [
                        { relationshipTypes: ['DEPENDS_ON'], direction: 'out', maxDepth: 1 },
                        { relationshipTypes: ['IMPLEMENTED_BY'], direction: 'out', maxDepth: 1 }
                    ],
                    nodeFilter: {
                        path: '/priority',
                        operator: 'greaterThanOrEqual',
                        value: 7
                    },
                    returnPaths: true
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            // req1 (priority 10) and dep1 (priority 8) should be included
            expect(nodeIds).toContain(req1.id);
            expect(nodeIds).toContain(dep1.id);
            // req2 (priority 3) should be filtered out
            expect(nodeIds).not.toContain(req2.id);

            // Implementations don't have priority, so they won't pass filter
            // This demonstrates the filter working across phases
        });

        test('knowledge graph exploration with multiple entry points and path tracking', async () => {
            // Scenario: Start from multiple concepts, find related concepts via "related_to"
            // Track which concepts and through what paths

            const concept1 = await createObj('Concept', 'AI', { domain: 'technology' });
            const concept2 = await createObj('Concept', 'ML', { domain: 'technology' });
            const concept3 = await createObj('Concept', 'NN', { domain: 'technology' });
            const concept4 = await createObj('Concept', 'Art', { domain: 'creative' });

            await relate('RELATED_TO', concept1.id, concept2.id, { strength: 0.9 });
            await relate('RELATED_TO', concept2.id, concept3.id, { strength: 0.8 });
            await relate('RELATED_TO', concept1.id, concept4.id, { strength: 0.2 });

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [concept1.id],
                    returnPaths: true,
                    nodeFilter: {
                        path: '/domain',
                        operator: 'equals',
                        value: 'technology'
                    },
                    edgeFilter: {
                        path: '/strength',
                        operator: 'greaterThan',
                        value: 0.5
                    },
                    max_depth: 2
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(concept1.id);
            expect(nodeIds).toContain(concept2.id);
            expect(nodeIds).toContain(concept3.id);
            expect(nodeIds).not.toContain(concept4.id); // different domain OR weak edge

            // Verify path through technology concepts
            const nodesById = Object.fromEntries(body.nodes.map((n: any) => [n.id, n]));
            expect(nodesById[concept3.id].paths).toEqual([[concept1.id, concept2.id, concept3.id]]);
        });

        test('infrastructure dependency mapping with phased search and edge filtering', async () => {
            // Real-world: Find all systems affected by a service
            // Phase 1: Direct dependencies
            // Phase 2: Dependent services
            // Filter edges by criticality

            const service = await createObj('Service', 'AUTH-SVC', { tier: 'core' });
            const db = await createObj('Database', 'USER-DB', { tier: 'core' });
            const cache = await createObj('Cache', 'SESSION-CACHE', { tier: 'support' });
            const api = await createObj('API', 'USER-API', { tier: 'core' });

            await relate('USES', service.id, db.id, { criticality: 'high' });
            await relate('USES', service.id, cache.id, { criticality: 'low' });
            await relate('DEPENDS_ON', api.id, db.id, { criticality: 'high' });

            const res = await request
                .post('/graph/traverse')
                .set(contextHeaders())
                .send({
                    root_ids: [service.id],
                    edgePhases: [
                        { relationshipTypes: ['USES'], direction: 'out', maxDepth: 1 },
                        { relationshipTypes: ['DEPENDS_ON'], direction: 'in', maxDepth: 1 }
                    ],
                    edgeFilter: {
                        path: '/criticality',
                        operator: 'equals',
                        value: 'high'
                    },
                    returnPaths: true
                })
                .expect(200);

            const body = res.body;
            const nodeIds = body.nodes.map((n: any) => n.id);

            expect(nodeIds).toContain(service.id);
            expect(nodeIds).toContain(db.id); // high criticality
            expect(nodeIds).not.toContain(cache.id); // low criticality filtered
            expect(nodeIds).toContain(api.id); // high criticality dependent via database
        });
    });
});
