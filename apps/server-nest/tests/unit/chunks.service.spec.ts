import { describe, it, expect } from 'vitest';
import { ChunksService } from '../../src/modules/chunks/chunks.service';
import { DatabaseService } from '../../src/common/database/database.service';

// Lightweight mock implementing needed surface of DatabaseService without full connection.
class MockDb extends DatabaseService {
    private calls = 0;
    constructor() { // @ts-expect-error config unused in mock
        super({});
    }
    override isOnline() { return true; }
    // First invocation throws missing column (simulating embedding/created_at absent), second returns fallback row.
    override async query() {
        this.calls += 1;
        if (this.calls === 1) {
            const err: any = new Error('column c.embedding does not exist');
            err.code = '42703';
            throw err;
        }
        return { rows: [{ id: 'a', document_id: 'd', chunk_index: 0, text: 'Hello', filename: null, source_url: null, embedding: null }], rowCount: 1 } as any;
    }
}

describe('ChunksService list resilience', () => {
    it('falls back when embedding column missing', async () => {
        const db = new MockDb();
        const service = new ChunksService(db);
        const items = await service.list('d');
        expect(items).toHaveLength(1);
        expect(items[0].hasEmbedding).toBe(false);
        expect(items[0].text).toBe('Hello');
    });

    it('lists with embedding present (no fallback path)', async () => {
        const db: any = { query: async () => ({ rows: [{ id: 'c1', document_id: 'doc1', chunk_index: 1, text: 'Embedded text', embedding: [0.1], filename: 'file.txt', source_url: null, created_at: new Date().toISOString() }] }) };
        const service = new ChunksService(db);
        const items = await service.list('doc1');
        expect(items).toHaveLength(1);
        expect(items[0].hasEmbedding).toBe(true);
        expect(items[0].documentTitle).toBe('file.txt');
    });

    it('lists all when no documentId provided', async () => {
        const db: any = { query: async () => ({ rows: [{ id: 'x', document_id: 'docX', chunk_index: 0, text: 'All docs', embedding: null, filename: null, source_url: 'http://example', created_at: new Date().toISOString() }] }) };
        const service = new ChunksService(db);
        const items = await service.list();
        expect(items[0].documentTitle).toContain('http://example');
        expect(items[0].index).toBe(0);
    });
});
