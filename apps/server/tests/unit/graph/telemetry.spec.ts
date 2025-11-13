import { describe, it, expect } from 'vitest';
import { GraphTraversalResult, TraversalNode } from '../../../src/modules/graph/graph.types';

describe('Graph Traversal Telemetry', () => {
    describe('GraphTraversalResult type', () => {
        it('should allow query_time_ms field', () => {
            const result: GraphTraversalResult = {
                roots: ['root-1'],
                nodes: [],
                edges: [],
                truncated: false,
                max_depth_reached: 1,
                query_time_ms: 123.45,
            };

            expect(result.query_time_ms).toBe(123.45);
        });

        it('should allow result_count field', () => {
            const result: GraphTraversalResult = {
                roots: ['root-1'],
                nodes: [],
                edges: [],
                truncated: false,
                max_depth_reached: 1,
                result_count: 42,
            };

            expect(result.result_count).toBe(42);
        });

        it('should allow both telemetry fields together', () => {
            const result: GraphTraversalResult = {
                roots: ['root-1', 'root-2'],
                nodes: [
                    { id: 'root-1', depth: 0, type: 'Document', key: 'doc-1', labels: [] },
                    { id: 'root-2', depth: 0, type: 'Document', key: 'doc-2', labels: [] },
                ],
                edges: [],
                truncated: false,
                max_depth_reached: 0,
                total_nodes: 2,
                query_time_ms: 87.25,
                result_count: 2,
            };

            expect(result.query_time_ms).toBe(87.25);
            expect(result.result_count).toBe(2);
            expect(result.nodes).toHaveLength(2);
        });

        it('should allow telemetry fields to be optional', () => {
            const result: GraphTraversalResult = {
                roots: [],
                nodes: [],
                edges: [],
                truncated: false,
                max_depth_reached: 0,
                // No telemetry fields - should still be valid
            };

            expect(result.query_time_ms).toBeUndefined();
            expect(result.result_count).toBeUndefined();
        });
    });

    describe('telemetry field semantics', () => {
        it('should use query_time_ms to represent milliseconds with decimal precision', () => {
            const result: GraphTraversalResult = {
                roots: ['root-1'],
                nodes: [],
                edges: [],
                truncated: false,
                max_depth_reached: 1,
                query_time_ms: 142.78, // Two decimal places for precision
            };

            expect(result.query_time_ms).toBeGreaterThan(0);
            expect(typeof result.query_time_ms).toBe('number');
        });

        it('should use result_count to represent total nodes found', () => {
            const nodes: TraversalNode[] = [
                { id: 'n1', depth: 0, type: 'A', key: null, labels: [] },
                { id: 'n2', depth: 1, type: 'B', key: null, labels: [] },
                { id: 'n3', depth: 1, type: 'C', key: null, labels: [] },
            ];

            const result: GraphTraversalResult = {
                roots: ['n1'],
                nodes: nodes.slice(0, 2), // Paginated - only 2 returned
                edges: [],
                truncated: false,
                max_depth_reached: 1,
                total_nodes: 3,
                result_count: 3, // Total found, not just returned
            };

            expect(result.result_count).toBe(3);
            expect(result.nodes).toHaveLength(2); // Fewer returned due to pagination
        });
    });

    describe('integration with existing fields', () => {
        it('should not conflict with pagination metadata', () => {
            const result: GraphTraversalResult = {
                roots: ['root-1'],
                nodes: [{ id: 'root-1', depth: 0, type: 'Doc', key: null, labels: [] }],
                edges: [],
                truncated: false,
                max_depth_reached: 1,
                total_nodes: 50,
                has_next_page: true,
                has_previous_page: false,
                next_cursor: 'cursor-abc',
                previous_cursor: null,
                approx_position_start: 0,
                approx_position_end: 9,
                page_direction: 'forward',
                query_time_ms: 234.56,
                result_count: 50,
            };

            expect(result).toHaveProperty('has_next_page');
            expect(result).toHaveProperty('query_time_ms');
            expect(result).toHaveProperty('result_count');
            expect(result.total_nodes).toBe(50);
            expect(result.result_count).toBe(50); // Should match total_nodes
        });

        it('should work with minimal result structure', () => {
            const result: GraphTraversalResult = {
                roots: [],
                nodes: [],
                edges: [],
                truncated: false,
                max_depth_reached: 0,
                query_time_ms: 5.12,
                result_count: 0,
            };

            expect(result.nodes).toHaveLength(0);
            expect(result.query_time_ms).toBe(5.12);
            expect(result.result_count).toBe(0);
        });
    });
});
