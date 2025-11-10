import { describe, it, expect, beforeEach } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { SchemaRegistryService } from '../../../src/modules/graph/schema-registry.service';

// Provide minimal stubs/mocks for db interactions used in traverse.
class StubDb {
    async query(sql: string, params: any[]): Promise<any> {
        if (sql.includes('FROM kb.graph_objects')) {
            // Return a single fake object per id
            return { rowCount: 1, rows: [{ id: params[0], type: 'TestType', key: null, labels: [], deleted_at: null }] };
        }
        if (sql.includes('FROM kb.graph_relationships')) {
            // No relationships to keep traversal trivial
            return { rowCount: 0, rows: [] };
        }
        return { rowCount: 0, rows: [] };
    }
}

class StubSchemaRegistry extends SchemaRegistryService {
    constructor() { super({} as any); }
    // Override to avoid DB access in tests
    async getObjectValidator(): Promise<any> { return undefined; }
    async getRelationshipValidator(): Promise<any> { return undefined; }
}

function makeService() {
    const svc = new GraphService(new StubDb() as any, new StubSchemaRegistry() as any);
    return svc;
}

describe('GraphService traversal telemetry', () => {
    let service: any;
    beforeEach(() => { service = makeService(); });

    it('emits traversal telemetry event with required fields', async () => {
        const res = await service.traverse({ root_ids: ['a'], max_depth: 1, limit: 10 } as any);
        expect(res.nodes.length).toBeGreaterThan(0);
        expect(service.telemetry).toBeTruthy();
        expect(service.telemetry.traverseEvents).toBe(1);
        const evt = service.telemetry.lastTraverse;
        expect(evt.type).toBe('graph.traverse.page');
        expect(evt.roots_count).toBe(1);
        expect(evt.requested_limit).toBe(10);
        expect(typeof evt.total_nodes).toBe('number');
        expect(typeof evt.page_item_count).toBe('number');
        expect(evt.has_next_page).toBe(false);
        expect(evt.has_previous_page).toBe(false);
        expect(evt.truncated).toBe(false);
        expect(typeof evt.max_depth_requested).toBe('number');
        expect(typeof evt.max_depth_reached).toBe('number');
        expect(typeof evt.approx_position_start).toBe('number');
        expect(typeof evt.approx_position_end).toBe('number');
        expect(typeof evt.next_cursor_set).toBe('boolean');
        expect(typeof evt.prev_cursor_set).toBe('boolean');
        expect(typeof evt.ts).toBe('number');
        expect(typeof evt.elapsed_ms).toBe('number');
        expect(evt.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    it('emits telemetry for backward pagination direction', async () => {
        // First call to seed a cursor (forward)
        const first = await service.traverse({ root_ids: ['a'], max_depth: 1, limit: 1 } as any);
        const fCursor = first.next_cursor;
        // Backward page from cursor (should have previous page if cursor existed and nodes > 1)
        const back = await service.traverse({ root_ids: ['a'], max_depth: 1, limit: 1, cursor: fCursor, page_direction: 'backward' } as any);
        expect(service.telemetry.traverseEvents).toBeGreaterThan(1);
        const evt = service.telemetry.lastTraverse;
        expect(evt.page_direction).toBe('backward');
        // Cursor flags should reflect direction (we don't assert specific has_previous/next due to synthetic data simplicity)
        expect(typeof evt.has_next_page).toBe('boolean');
        expect(typeof evt.has_previous_page).toBe('boolean');
    });
});
