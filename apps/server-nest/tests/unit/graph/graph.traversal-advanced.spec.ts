import { describe, test, expect, beforeEach } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { makeSchemaRegistryStub } from '../helpers/schema-registry.stub';
import { makeFakeGraphDb } from '../helpers/fake-graph-db';

/**
 * Phase 3 Priority #3: Advanced Traversal Features
 * 
 * Tests for:
 * - 3a: Phased Traversal (edgePhases)
 * - 3b: Property Predicate Filtering (nodeFilter, edgeFilter)
 * - 3c: Path Enumeration (returnPaths, maxPathsPerNode)
 */

describe('GraphService Advanced Traversal - Phase 3', () => {
    let svc: GraphService;
    let db: ReturnType<typeof makeFakeGraphDb>;

    beforeEach(async () => {
        db = makeFakeGraphDb({ enableTraversal: true });
        const schemaRegistryStub = makeSchemaRegistryStub();
        svc = new GraphService(db as any, schemaRegistryStub as any);
    });

    describe('3a: Phased Traversal (edgePhases)', () => {
        test('executes two phases sequentially with different relationship types', async () => {
            // Create graph: A -DEPENDS_ON-> B -IMPLEMENTED_BY-> C
            await svc.createObject({ type: 'Requirement', key: 'req-A', labels: ['Requirement'], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Requirement', key: 'req-B', labels: ['Requirement'], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Implementation', key: 'impl-C', labels: ['Implementation'], project_id: 'proj' } as any);
            await svc.createRelationship({ type: 'DEPENDS_ON', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
            await svc.createRelationship({ type: 'IMPLEMENTED_BY', src_id: 'o_2', dst_id: 'o_3' }, 'org', 'proj');

            const result = await svc.traverse({
                root_ids: ['o_1'],
                edgePhases: [
                    { relationshipTypes: ['DEPENDS_ON'], direction: 'out', maxDepth: 1 },
                    { relationshipTypes: ['IMPLEMENTED_BY'], direction: 'out', maxDepth: 1 }
                ]
            });

            const nodeIds = result.nodes.map(n => n.id);
            expect(nodeIds).toContain('o_1'); // root (phase 0)
            expect(nodeIds).toContain('o_2'); // discovered in phase 1
            expect(nodeIds).toContain('o_3'); // discovered in phase 2

            // Check phaseIndex assignments
            const nodeA = result.nodes.find(n => n.id === 'o_1');
            const nodeB = result.nodes.find(n => n.id === 'o_2');
            const nodeC = result.nodes.find(n => n.id === 'o_3');

            expect(nodeA?.phaseIndex).toBe(0); // root
            expect(nodeB?.phaseIndex).toBe(1); // phase 1
            expect(nodeC?.phaseIndex).toBe(2); // phase 2
        });

        test('phase with maxDepth=0 includes only starting nodes', async () => {
            // Create graph: A -> B -> C
            await svc.createObject({ type: 'Node', key: 'a', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'b', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'c', labels: [], project_id: 'proj' } as any);
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_2', dst_id: 'o_3' }, 'org', 'proj');

            const result = await svc.traverse({
                root_ids: ['o_1'],
                edgePhases: [
                    { relationshipTypes: ['LINKS'], direction: 'out', maxDepth: 0 }
                ]
            });

            const nodeIds = result.nodes.map(n => n.id);
            expect(nodeIds).toContain('o_1'); // root
            expect(nodeIds).not.toContain('o_2'); // not reached (maxDepth=0)
            expect(nodeIds).not.toContain('o_3');
        });

        test('phase direction filters correctly (in vs out)', async () => {
            // Create graph: A -> B <- C
            await svc.createObject({ type: 'Node', key: 'a', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'b', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'c', labels: [], project_id: 'proj' } as any);
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_3', dst_id: 'o_2' }, 'org', 'proj');

            // Traverse from B following incoming edges only
            const result = await svc.traverse({
                root_ids: ['o_2'],
                edgePhases: [
                    { relationshipTypes: ['LINKS'], direction: 'in', maxDepth: 1 }
                ]
            });

            const nodeIds = result.nodes.map(n => n.id);
            expect(nodeIds).toContain('o_2'); // root
            expect(nodeIds).toContain('o_1'); // incoming from A
            expect(nodeIds).toContain('o_3'); // incoming from C
        });

        test('phase objectTypes filter excludes non-matching nodes', async () => {
            // Create graph: TypeA -> TypeB -> TypeA
            await svc.createObject({ type: 'TypeA', key: 'a', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'TypeB', key: 'b', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'TypeA', key: 'c', labels: [], project_id: 'proj' } as any);
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_2', dst_id: 'o_3' }, 'org', 'proj');

            const result = await svc.traverse({
                root_ids: ['o_1'],
                edgePhases: [
                    { relationshipTypes: ['LINKS'], direction: 'out', maxDepth: 2, objectTypes: ['TypeA'] }
                ]
            });

            const nodeIds = result.nodes.map(n => n.id);
            expect(nodeIds).toContain('o_1'); // TypeA
            expect(nodeIds).not.toContain('o_2'); // TypeB - filtered out
            expect(nodeIds).toContain('o_3'); // TypeA - reachable through B but B is filtered
        });

        test('phase labels filter includes only matching nodes', async () => {
            // Create graph with different labels
            await svc.createObject({ type: 'Node', key: 'a', labels: ['Important'], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'b', labels: ['Regular'], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'c', labels: ['Important'], project_id: 'proj' } as any);
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_2', dst_id: 'o_3' }, 'org', 'proj');

            const result = await svc.traverse({
                root_ids: ['o_1'],
                edgePhases: [
                    { relationshipTypes: ['LINKS'], direction: 'out', maxDepth: 2, labels: ['Important'] }
                ]
            });

            const nodeIds = result.nodes.map(n => n.id);
            expect(nodeIds).toContain('o_1'); // Important
            expect(nodeIds).not.toContain('o_2'); // Regular - filtered out
            // o_3 may or may not be reached depending on whether B blocks traversal
        });

        test('empty phase (no matching edges) stops further phases', async () => {
            // Create graph: A -LINKS-> B
            await svc.createObject({ type: 'Node', key: 'a', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'b', labels: [], project_id: 'proj' } as any);
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');

            const result = await svc.traverse({
                root_ids: ['o_1'],
                edgePhases: [
                    { relationshipTypes: ['NONEXISTENT'], direction: 'out', maxDepth: 1 },
                    { relationshipTypes: ['LINKS'], direction: 'out', maxDepth: 1 }
                ]
            });

            const nodeIds = result.nodes.map(n => n.id);
            expect(nodeIds).toContain('o_1'); // root
            expect(nodeIds).not.toContain('o_2'); // phase 1 found nothing, phase 2 never executed
        });
    });

    describe('3b: Property Predicate Filtering', () => {
        test('nodeFilter with equals operator', async () => {
            // Create nodes with different status values
            await svc.createObject({
                type: 'Task',
                key: 'task1',
                labels: [],
                properties: { status: 'active' },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'Task',
                key: 'task2',
                labels: [],
                properties: { status: 'inactive' },
                project_id: 'proj'
            } as any);

            const result = await svc.traverse({
                root_ids: ['o_1', 'o_2'],
                nodeFilter: { path: '/status', operator: 'equals', value: 'active' }
            });

            expect(result.nodes.length).toBe(1);
            expect(result.nodes[0].id).toBe('o_1');
        });

        test('nodeFilter with notEquals operator', async () => {
            await svc.createObject({
                type: 'Task',
                key: 'task1',
                labels: [],
                properties: { status: 'draft' },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'Task',
                key: 'task2',
                labels: [],
                properties: { status: 'published' },
                project_id: 'proj'
            } as any);

            const result = await svc.traverse({
                root_ids: ['o_1', 'o_2'],
                nodeFilter: { path: '/status', operator: 'notEquals', value: 'draft' }
            });

            expect(result.nodes.length).toBe(1);
            expect(result.nodes[0].id).toBe('o_2');
        });

        test('nodeFilter with greaterThan operator', async () => {
            await svc.createObject({
                type: 'Item',
                key: 'item1',
                labels: [],
                properties: { priority: 5 },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'Item',
                key: 'item2',
                labels: [],
                properties: { priority: 10 },
                project_id: 'proj'
            } as any);

            const result = await svc.traverse({
                root_ids: ['o_1', 'o_2'],
                nodeFilter: { path: '/priority', operator: 'greaterThan', value: 7 }
            });

            expect(result.nodes.length).toBe(1);
            expect(result.nodes[0].id).toBe('o_2');
        });

        test('nodeFilter with lessThanOrEqual operator', async () => {
            await svc.createObject({
                type: 'Item',
                key: 'item1',
                labels: [],
                properties: { score: 75 },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'Item',
                key: 'item2',
                labels: [],
                properties: { score: 90 },
                project_id: 'proj'
            } as any);

            const result = await svc.traverse({
                root_ids: ['o_1', 'o_2'],
                nodeFilter: { path: '/score', operator: 'lessThanOrEqual', value: 80 }
            });

            expect(result.nodes.length).toBe(1);
            expect(result.nodes[0].id).toBe('o_1');
        });

        test('nodeFilter with in operator (array)', async () => {
            await svc.createObject({
                type: 'Item',
                key: 'item1',
                labels: [],
                properties: { category: 'tech' },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'Item',
                key: 'item2',
                labels: [],
                properties: { category: 'business' },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'Item',
                key: 'item3',
                labels: [],
                properties: { category: 'science' },
                project_id: 'proj'
            } as any);

            const result = await svc.traverse({
                root_ids: ['o_1', 'o_2', 'o_3'],
                nodeFilter: { path: '/category', operator: 'in', value: ['tech', 'science'] }
            });

            expect(result.nodes.length).toBe(2);
            const ids = result.nodes.map(n => n.id);
            expect(ids).toContain('o_1');
            expect(ids).toContain('o_3');
        });

        test('nodeFilter with contains operator (string)', async () => {
            await svc.createObject({
                type: 'Doc',
                key: 'doc1',
                labels: [],
                properties: { title: 'JavaScript Tutorial' },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'Doc',
                key: 'doc2',
                labels: [],
                properties: { title: 'Python Guide' },
                project_id: 'proj'
            } as any);

            const result = await svc.traverse({
                root_ids: ['o_1', 'o_2'],
                nodeFilter: { path: '/title', operator: 'contains', value: 'Script' }
            });

            expect(result.nodes.length).toBe(1);
            expect(result.nodes[0].id).toBe('o_1');
        });

        test('nodeFilter with matches operator (regex)', async () => {
            await svc.createObject({
                type: 'User',
                key: 'user1',
                labels: [],
                properties: { email: 'alice@example.com' },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'User',
                key: 'user2',
                labels: [],
                properties: { email: 'bob@test.org' },
                project_id: 'proj'
            } as any);

            const result = await svc.traverse({
                root_ids: ['o_1', 'o_2'],
                nodeFilter: { path: '/email', operator: 'matches', value: '.*@example\\.com$' }
            });

            expect(result.nodes.length).toBe(1);
            expect(result.nodes[0].id).toBe('o_1');
        });

        test('nodeFilter with exists operator', async () => {
            await svc.createObject({
                type: 'Item',
                key: 'item1',
                labels: [],
                properties: { description: 'Has description' },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'Item',
                key: 'item2',
                labels: [],
                properties: {},
                project_id: 'proj'
            } as any);

            const result = await svc.traverse({
                root_ids: ['o_1', 'o_2'],
                nodeFilter: { path: '/description', operator: 'exists', value: true }
            });

            expect(result.nodes.length).toBe(1);
            expect(result.nodes[0].id).toBe('o_1');
        });

        test('nodeFilter with notExists operator', async () => {
            await svc.createObject({
                type: 'Item',
                key: 'item1',
                labels: [],
                properties: { optional: 'value' },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'Item',
                key: 'item2',
                labels: [],
                properties: {},
                project_id: 'proj'
            } as any);

            const result = await svc.traverse({
                root_ids: ['o_1', 'o_2'],
                nodeFilter: { path: '/optional', operator: 'notExists', value: true }
            });

            expect(result.nodes.length).toBe(1);
            expect(result.nodes[0].id).toBe('o_2');
        });

        test('edgeFilter excludes edges that do not match predicate', async () => {
            // Create nodes and edges with confidence scores
            await svc.createObject({ type: 'Node', key: 'a', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'b', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'c', labels: [], project_id: 'proj' } as any);

            await svc.createRelationship({
                type: 'LINKS',
                src_id: 'o_1',
                dst_id: 'o_2',
                properties: { confidence: 0.9 }
            }, 'org', 'proj');
            await svc.createRelationship({
                type: 'LINKS',
                src_id: 'o_1',
                dst_id: 'o_3',
                properties: { confidence: 0.3 }
            }, 'org', 'proj');

            const result = await svc.traverse({
                root_ids: ['o_1'],
                edgeFilter: { path: '/confidence', operator: 'greaterThan', value: 0.5 },
                max_depth: 1
            });

            const nodeIds = result.nodes.map(n => n.id);
            expect(nodeIds).toContain('o_1'); // root
            expect(nodeIds).toContain('o_2'); // reached via high confidence edge
            expect(nodeIds).not.toContain('o_3'); // low confidence edge filtered
        });

        test('nodeFilter with nested JSON Pointer path', async () => {
            await svc.createObject({
                type: 'Item',
                key: 'item1',
                labels: [],
                properties: { metadata: { verified: true } },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'Item',
                key: 'item2',
                labels: [],
                properties: { metadata: { verified: false } },
                project_id: 'proj'
            } as any);

            const result = await svc.traverse({
                root_ids: ['o_1', 'o_2'],
                nodeFilter: { path: '/metadata/verified', operator: 'equals', value: true }
            });

            expect(result.nodes.length).toBe(1);
            expect(result.nodes[0].id).toBe('o_1');
        });

        test('combined nodeFilter and edgeFilter work together', async () => {
            // Create graph with both node and edge properties
            await svc.createObject({
                type: 'Node',
                key: 'a',
                labels: [],
                properties: { active: true },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'Node',
                key: 'b',
                labels: [],
                properties: { active: true },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'Node',
                key: 'c',
                labels: [],
                properties: { active: false },
                project_id: 'proj'
            } as any);

            await svc.createRelationship({
                type: 'LINKS',
                src_id: 'o_1',
                dst_id: 'o_2',
                properties: { weight: 10 }
            }, 'org', 'proj');
            await svc.createRelationship({
                type: 'LINKS',
                src_id: 'o_1',
                dst_id: 'o_3',
                properties: { weight: 5 }
            }, 'org', 'proj');

            const result = await svc.traverse({
                root_ids: ['o_1'],
                nodeFilter: { path: '/active', operator: 'equals', value: true },
                edgeFilter: { path: '/weight', operator: 'greaterThanOrEqual', value: 8 },
                max_depth: 1
            });

            const nodeIds = result.nodes.map(n => n.id);
            expect(nodeIds).toContain('o_1'); // active=true
            expect(nodeIds).toContain('o_2'); // active=true, edge weight=10
            expect(nodeIds).not.toContain('o_3'); // active=false (node filtered)
        });
    });

    describe('3c: Path Enumeration', () => {
        test('returnPaths includes single path for linear chain', async () => {
            // Create chain: A -> B -> C
            await svc.createObject({ type: 'Node', key: 'a', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'b', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'c', labels: [], project_id: 'proj' } as any);
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_2', dst_id: 'o_3' }, 'org', 'proj');

            const result = await svc.traverse({
                root_ids: ['o_1'],
                returnPaths: true,
                max_depth: 2
            });

            const nodeA = result.nodes.find(n => n.id === 'o_1');
            const nodeB = result.nodes.find(n => n.id === 'o_2');
            const nodeC = result.nodes.find(n => n.id === 'o_3');

            expect(nodeA?.paths).toEqual([['o_1']]);
            expect(nodeB?.paths).toEqual([['o_1', 'o_2']]);
            expect(nodeC?.paths).toEqual([['o_1', 'o_2', 'o_3']]);
        });

        test('returnPaths includes multiple paths for diamond graph', async () => {
            // Create diamond: A -> B -> D, A -> C -> D
            await svc.createObject({ type: 'Node', key: 'a', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'b', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'c', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'd', labels: [], project_id: 'proj' } as any);
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_3' }, 'org', 'proj');
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_2', dst_id: 'o_4' }, 'org', 'proj');
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_3', dst_id: 'o_4' }, 'org', 'proj');

            const result = await svc.traverse({
                root_ids: ['o_1'],
                returnPaths: true,
                max_depth: 2
            });

            const nodeD = result.nodes.find(n => n.id === 'o_4');
            expect(nodeD?.paths).toBeDefined();
            expect(nodeD?.paths?.length).toBe(2);

            // Should have both paths to D
            const pathStrings = nodeD?.paths?.map(p => p.join('->'));
            expect(pathStrings).toContain('o_1->o_2->o_4');
            expect(pathStrings).toContain('o_1->o_3->o_4');
        });

        test('maxPathsPerNode limits number of paths tracked', async () => {
            // Create graph where node is reachable via many paths
            // A -> B1 -> C, A -> B2 -> C, A -> B3 -> C
            await svc.createObject({ type: 'Node', key: 'a', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'b1', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'b2', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'b3', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'c', labels: [], project_id: 'proj' } as any);
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_3' }, 'org', 'proj');
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_4' }, 'org', 'proj');
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_2', dst_id: 'o_5' }, 'org', 'proj');
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_3', dst_id: 'o_5' }, 'org', 'proj');
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_4', dst_id: 'o_5' }, 'org', 'proj');

            const result = await svc.traverse({
                root_ids: ['o_1'],
                returnPaths: true,
                maxPathsPerNode: 2,
                max_depth: 2
            });

            const nodeC = result.nodes.find(n => n.id === 'o_5');
            expect(nodeC?.paths?.length).toBeLessThanOrEqual(2);
        });

        test('paths not included when returnPaths is false or undefined', async () => {
            await svc.createObject({ type: 'Node', key: 'a', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'b', labels: [], project_id: 'proj' } as any);
            await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');

            const result = await svc.traverse({
                root_ids: ['o_1'],
                returnPaths: false,
                max_depth: 1
            });

            result.nodes.forEach(node => {
                expect(node.paths).toBeUndefined();
            });
        });

        test('paths work with phased traversal', async () => {
            // Create graph: A -TYPE1-> B -TYPE2-> C
            await svc.createObject({ type: 'Node', key: 'a', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'b', labels: [], project_id: 'proj' } as any);
            await svc.createObject({ type: 'Node', key: 'c', labels: [], project_id: 'proj' } as any);
            await svc.createRelationship({ type: 'TYPE1', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
            await svc.createRelationship({ type: 'TYPE2', src_id: 'o_2', dst_id: 'o_3' }, 'org', 'proj');

            const result = await svc.traverse({
                root_ids: ['o_1'],
                returnPaths: true,
                edgePhases: [
                    { relationshipTypes: ['TYPE1'], direction: 'out', maxDepth: 1 },
                    { relationshipTypes: ['TYPE2'], direction: 'out', maxDepth: 1 }
                ]
            });

            const nodeC = result.nodes.find(n => n.id === 'o_3');
            expect(nodeC?.paths).toEqual([['o_1', 'o_2', 'o_3']]);
            expect(nodeC?.phaseIndex).toBe(2);
        });

        test('root node has path containing only itself', async () => {
            await svc.createObject({ type: 'Node', key: 'a', labels: [], project_id: 'proj' } as any);

            const result = await svc.traverse({
                root_ids: ['o_1'],
                returnPaths: true,
                max_depth: 0
            });

            expect(result.nodes.length).toBe(1);
            expect(result.nodes[0].paths).toEqual([['o_1']]);
        });
    });

    describe('Combined Features', () => {
        test('phased traversal + predicate filtering + path enumeration all work together', async () => {
            // Create complex graph with properties
            await svc.createObject({
                type: 'Requirement',
                key: 'req1',
                labels: [],
                properties: { priority: 10 },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'Requirement',
                key: 'req2',
                labels: [],
                properties: { priority: 5 },
                project_id: 'proj'
            } as any);
            await svc.createObject({
                type: 'Implementation',
                key: 'impl1',
                labels: [],
                properties: { status: 'complete' },
                project_id: 'proj'
            } as any);

            await svc.createRelationship({ type: 'DEPENDS', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
            await svc.createRelationship({ type: 'IMPLEMENTS', src_id: 'o_2', dst_id: 'o_3' }, 'org', 'proj');

            const result = await svc.traverse({
                root_ids: ['o_1'],
                edgePhases: [
                    { relationshipTypes: ['DEPENDS'], direction: 'out', maxDepth: 1 },
                    { relationshipTypes: ['IMPLEMENTS'], direction: 'out', maxDepth: 1 }
                ],
                nodeFilter: { path: '/priority', operator: 'greaterThanOrEqual', value: 5 },
                returnPaths: true
            });

            // All nodes should pass filter (req1:10, req2:5, impl1:no priority so skipped)
            const nodeIds = result.nodes.map(n => n.id);
            expect(nodeIds).toContain('o_1');
            expect(nodeIds).toContain('o_2');
            // o_3 should be filtered out (no priority property)

            // Check phaseIndex and paths
            const node2 = result.nodes.find(n => n.id === 'o_2');
            expect(node2?.phaseIndex).toBe(1);
            expect(node2?.paths).toEqual([['o_1', 'o_2']]);
        });
    });
});
