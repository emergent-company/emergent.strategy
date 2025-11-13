import { describe, it, expect } from 'vitest';
import type { GraphObjectDto, GraphTraversalResult } from '../../../src/modules/graph/graph.types';

describe('graph.types import', () => {
    it('allows constructing a minimal object dto & traversal result shape', () => {
        const dto: GraphObjectDto = { id: '1', canonical_id: '1', version: 1, type: 'node', properties: {}, labels: [], created_at: new Date().toISOString() };
        const traversal: GraphTraversalResult = { roots: ['1'], nodes: [{ id: '1', depth: 0, type: 'node', labels: [] }], edges: [], truncated: false, max_depth_reached: 0 };
        expect(dto.id).toBe('1');
        expect(traversal.roots).toEqual(['1']);
    });
});
