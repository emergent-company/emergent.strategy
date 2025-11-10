import { describe, it, expect } from 'vitest';
import { pruneGraphResult, pruneNode, FieldStrategy, estimatePayloadReduction, FIELD_SALIENCE } from '../../../src/modules/graph/utils/field-pruning.util';
import { TraversalNode, TraversalEdge, GraphTraversalResult } from '../../../src/modules/graph/graph.types';

describe('Field Pruning Utility', () => {
    describe('FIELD_SALIENCE', () => {
        it('should define salience scores for all node fields', () => {
            expect(FIELD_SALIENCE['node.id']).toBe(1.0);
            expect(FIELD_SALIENCE['node.type']).toBe(0.9);
            expect(FIELD_SALIENCE['node.depth']).toBe(0.9);
            expect(FIELD_SALIENCE['node.key']).toBe(0.7);
            expect(FIELD_SALIENCE['node.labels']).toBe(0.7);
            expect(FIELD_SALIENCE['node.phaseIndex']).toBe(0.5);
            expect(FIELD_SALIENCE['node.paths']).toBe(0.3);
        });

        it('should define essential scores for all edge fields', () => {
            expect(FIELD_SALIENCE['edge.id']).toBe(1.0);
            expect(FIELD_SALIENCE['edge.type']).toBe(1.0);
            expect(FIELD_SALIENCE['edge.src_id']).toBe(1.0);
            expect(FIELD_SALIENCE['edge.dst_id']).toBe(1.0);
        });
    });

    describe('pruneNode', () => {
        const fullNode: TraversalNode = {
            id: 'node-1',
            depth: 1,
            type: 'Document',
            key: 'doc-key-1',
            labels: ['Important'],
            phaseIndex: 2,
            paths: [
                ['root', 'node-1'],
                ['root', 'intermediate', 'node-1']
            ]
        };

        describe('FULL strategy', () => {
            it('should keep all fields', () => {
                const pruned = pruneNode(fullNode, FieldStrategy.FULL);
                expect(pruned).toEqual(fullNode);
                expect(pruned.id).toBe('node-1');
                expect(pruned.type).toBe('Document');
                expect(pruned.depth).toBe(1);
                expect(pruned.key).toBe('doc-key-1');
                expect(pruned.labels).toEqual(['Important']);
                expect(pruned.phaseIndex).toBe(2);
                expect(pruned.paths).toHaveLength(2);
            });
        });

        describe('COMPACT strategy (threshold 0.6)', () => {
            it('should keep high-salience fields and exclude low-salience fields', () => {
                const pruned = pruneNode(fullNode, FieldStrategy.COMPACT);

                // Should keep: id (1.0), type (0.9), depth (0.9), key (0.7), labels (0.7)
                expect(pruned.id).toBe('node-1');
                expect(pruned.type).toBe('Document');
                expect(pruned.depth).toBe(1);
                expect(pruned.key).toBe('doc-key-1');
                expect(pruned.labels).toEqual(['Important']);

                // Should exclude: phaseIndex (0.5), paths (0.3)
                expect(pruned.phaseIndex).toBeUndefined();
                expect(pruned.paths).toBeUndefined();
            });

            it('should handle nodes without optional fields', () => {
                const minimalNode: TraversalNode = {
                    id: 'node-2',
                    depth: 0,
                    type: 'Root',
                    key: null,
                    labels: []
                };

                const pruned = pruneNode(minimalNode, FieldStrategy.COMPACT);
                expect(pruned.id).toBe('node-2');
                expect(pruned.type).toBe('Root');
                expect(pruned.depth).toBe(0);
                expect(pruned.key).toBeNull();
                expect(pruned.labels).toEqual([]);
                expect(pruned.phaseIndex).toBeUndefined();
                expect(pruned.paths).toBeUndefined();
            });
        });

        describe('MINIMAL strategy (threshold 0.85)', () => {
            it('should keep only essential fields', () => {
                const pruned = pruneNode(fullNode, FieldStrategy.MINIMAL);

                // Should keep: id (1.0), type (0.9), depth (0.9), labels (required)
                expect(pruned.id).toBe('node-1');
                expect(pruned.type).toBe('Document');
                expect(pruned.depth).toBe(1);
                expect(pruned.labels).toEqual(['Important']); // Always included (required field)

                // Should exclude: key (0.7), phaseIndex (0.5), paths (0.3)
                expect(pruned.key).toBeUndefined();
                expect(pruned.phaseIndex).toBeUndefined();
                expect(pruned.paths).toBeUndefined();
            });
        });

        describe('edge cases', () => {
            it('should handle node with null key', () => {
                const node: TraversalNode = {
                    id: 'node-3',
                    depth: 2,
                    type: 'Folder',
                    key: null,
                    labels: ['System']
                };

                const pruned = pruneNode(node, FieldStrategy.COMPACT);
                expect(pruned.key).toBeNull();
            });

            it('should handle node with empty labels', () => {
                const node: TraversalNode = {
                    id: 'node-4',
                    depth: 1,
                    type: 'Entity',
                    key: 'entity-1',
                    labels: []
                };

                const pruned = pruneNode(node, FieldStrategy.COMPACT);
                expect(pruned.labels).toEqual([]);
            });

            it('should handle node with empty paths array', () => {
                const node: TraversalNode = {
                    id: 'node-5',
                    depth: 1,
                    type: 'Item',
                    key: 'item-1',
                    labels: [],
                    paths: []
                };

                const pruned = pruneNode(node, FieldStrategy.FULL);
                expect(pruned.paths).toEqual([]);
            });
        });
    });

    describe('pruneGraphResult', () => {
        const sampleResult: GraphTraversalResult = {
            roots: ['root-1', 'root-2'],
            nodes: [
                {
                    id: 'root-1',
                    depth: 0,
                    type: 'Root',
                    key: 'root-key-1',
                    labels: ['Entry'],
                    phaseIndex: 0,
                    paths: []
                },
                {
                    id: 'node-1',
                    depth: 1,
                    type: 'Document',
                    key: 'doc-1',
                    labels: ['Important'],
                    phaseIndex: 1,
                    paths: [
                        ['root-1', 'node-1']
                    ]
                }
            ],
            edges: [
                {
                    id: 'edge-1',
                    type: 'CONTAINS',
                    src_id: 'root-1',
                    dst_id: 'node-1'
                }
            ],
            truncated: false,
            max_depth_reached: 1,
            total_nodes: 2,
            has_next_page: false,
            has_previous_page: false,
            next_cursor: null,
            previous_cursor: null,
            approx_position_start: 0,
            approx_position_end: 1,
            page_direction: 'forward'
        };

        describe('FULL strategy', () => {
            it('should return result unchanged', () => {
                const pruned = pruneGraphResult(sampleResult, FieldStrategy.FULL);
                expect(pruned).toEqual(sampleResult);
                expect(pruned.nodes[0].phaseIndex).toBe(0);
                expect(pruned.nodes[1].paths).toHaveLength(1);
            });
        });

        describe('COMPACT strategy', () => {
            it('should prune low-salience fields from all nodes', () => {
                const pruned = pruneGraphResult(sampleResult, FieldStrategy.COMPACT);

                // Metadata should be unchanged
                expect(pruned.roots).toEqual(['root-1', 'root-2']);
                expect(pruned.edges).toEqual(sampleResult.edges);
                expect(pruned.truncated).toBe(false);
                expect(pruned.total_nodes).toBe(2);

                // Nodes should be pruned
                expect(pruned.nodes).toHaveLength(2);
                expect(pruned.nodes[0].id).toBe('root-1');
                expect(pruned.nodes[0].key).toBe('root-key-1');
                expect(pruned.nodes[0].labels).toEqual(['Entry']);
                expect(pruned.nodes[0].phaseIndex).toBeUndefined(); // Removed (0.5 < 0.6)
                expect(pruned.nodes[0].paths).toBeUndefined(); // Removed (0.3 < 0.6)

                expect(pruned.nodes[1].id).toBe('node-1');
                expect(pruned.nodes[1].key).toBe('doc-1');
                expect(pruned.nodes[1].phaseIndex).toBeUndefined();
                expect(pruned.nodes[1].paths).toBeUndefined();
            });
        });

        describe('MINIMAL strategy', () => {
            it('should keep only essential fields', () => {
                const pruned = pruneGraphResult(sampleResult, FieldStrategy.MINIMAL);

                expect(pruned.nodes[0].id).toBe('root-1');
                expect(pruned.nodes[0].type).toBe('Root');
                expect(pruned.nodes[0].depth).toBe(0);
                expect(pruned.nodes[0].labels).toEqual(['Entry']); // Always included (required)
                expect(pruned.nodes[0].key).toBeUndefined(); // Removed (0.7 < 0.85)
                expect(pruned.nodes[0].phaseIndex).toBeUndefined();
                expect(pruned.nodes[0].paths).toBeUndefined();
            });
        });

        describe('edge preservation', () => {
            it('should never prune edge fields regardless of strategy', () => {
                const prunedFull = pruneGraphResult(sampleResult, FieldStrategy.FULL);
                const prunedCompact = pruneGraphResult(sampleResult, FieldStrategy.COMPACT);
                const prunedMinimal = pruneGraphResult(sampleResult, FieldStrategy.MINIMAL);

                // All strategies should preserve complete edges
                [prunedFull, prunedCompact, prunedMinimal].forEach(result => {
                    expect(result.edges).toEqual(sampleResult.edges);
                    expect(result.edges[0]).toHaveProperty('id');
                    expect(result.edges[0]).toHaveProperty('type');
                    expect(result.edges[0]).toHaveProperty('src_id');
                    expect(result.edges[0]).toHaveProperty('dst_id');
                });
            });
        });

        describe('metadata preservation', () => {
            it('should preserve high-salience metadata and exclude low-salience in MINIMAL', () => {
                const pruned = pruneGraphResult(sampleResult, FieldStrategy.MINIMAL);

                // High salience (>= 0.85) - should be preserved
                expect(pruned.roots).toEqual(sampleResult.roots);
                expect(pruned.truncated).toBe(sampleResult.truncated); // 0.9 >= 0.85
                expect(pruned.max_depth_reached).toBe(sampleResult.max_depth_reached); // Required field
                expect(pruned.has_next_page).toBe(sampleResult.has_next_page); // 0.9 >= 0.85
                expect(pruned.has_previous_page).toBe(sampleResult.has_previous_page); // 0.9 >= 0.85
                expect(pruned.next_cursor).toBe(sampleResult.next_cursor); // 0.9 >= 0.85
                expect(pruned.previous_cursor).toBe(sampleResult.previous_cursor); // 0.9 >= 0.85

                // Low salience (< 0.85) - should be excluded
                expect(pruned.total_nodes).toBeUndefined(); // 0.7 < 0.85
                expect(pruned.approx_position_start).toBeUndefined(); // 0.5 < 0.85
                expect(pruned.approx_position_end).toBeUndefined(); // 0.5 < 0.85
                expect(pruned.page_direction).toBeUndefined(); // 0.5 < 0.85
            });
        });

        describe('empty results', () => {
            it('should handle empty nodes array', () => {
                const emptyResult: GraphTraversalResult = {
                    ...sampleResult,
                    nodes: [],
                    edges: [],
                    total_nodes: 0
                };

                const pruned = pruneGraphResult(emptyResult, FieldStrategy.COMPACT);
                expect(pruned.nodes).toEqual([]);
                expect(pruned.edges).toEqual([]);
            });
        });
    });

    describe('estimatePayloadReduction', () => {
        it('should return 0% for FULL strategy', () => {
            expect(estimatePayloadReduction(FieldStrategy.FULL)).toBe(0);
        });

        it('should return ~25% for COMPACT strategy', () => {
            const reduction = estimatePayloadReduction(FieldStrategy.COMPACT);
            expect(reduction).toBeGreaterThanOrEqual(20);
            expect(reduction).toBeLessThanOrEqual(30);
        });

        it('should return ~45% for MINIMAL strategy', () => {
            const reduction = estimatePayloadReduction(FieldStrategy.MINIMAL);
            expect(reduction).toBeGreaterThanOrEqual(40);
            expect(reduction).toBeLessThanOrEqual(50);
        });

        it('should return increasing reduction percentages', () => {
            const fullReduction = estimatePayloadReduction(FieldStrategy.FULL);
            const compactReduction = estimatePayloadReduction(FieldStrategy.COMPACT);
            const minimalReduction = estimatePayloadReduction(FieldStrategy.MINIMAL);

            expect(fullReduction).toBeLessThan(compactReduction);
            expect(compactReduction).toBeLessThan(minimalReduction);
        });
    });

    describe('Strategy Threshold Integration', () => {
        it('should respect salience thresholds for each strategy', () => {
            const testNode: TraversalNode = {
                id: 'test',
                depth: 1,
                type: 'Test',
                key: 'test-key',
                labels: ['Label'],
                phaseIndex: 1,
                paths: [['test']]
            };

            // FULL: threshold 0.0 - all fields pass
            const full = pruneNode(testNode, FieldStrategy.FULL);
            expect(full.phaseIndex).toBeDefined();
            expect(full.paths).toBeDefined();

            // COMPACT: threshold 0.6 - phaseIndex (0.5) and paths (0.3) excluded
            const compact = pruneNode(testNode, FieldStrategy.COMPACT);
            expect(compact.key).toBeDefined(); // 0.7 >= 0.6
            expect(compact.phaseIndex).toBeUndefined(); // 0.5 < 0.6
            expect(compact.paths).toBeUndefined(); // 0.3 < 0.6

            // MINIMAL: threshold 0.85 - only id/type/depth pass
            const minimal = pruneNode(testNode, FieldStrategy.MINIMAL);
            expect(minimal.key).toBeUndefined(); // 0.7 < 0.85
            expect(minimal.phaseIndex).toBeUndefined();
            expect(minimal.paths).toBeUndefined();
        });
    });
});
