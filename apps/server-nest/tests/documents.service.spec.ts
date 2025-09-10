import { describe, it, expect } from 'vitest';
import { DocumentsService } from '../src/modules/documents/documents.service';

class FakeDb {
    constructor(private rows: any[]) { }
    async query(text: string, params?: any[]) {
        let rows = this.rows;
        if (params && params.length) {
            const limit = params[0];
            if (typeof limit === 'number') rows = rows.slice(0, limit);
        }
        return { rows, rowCount: rows.length } as any;
    }
}

function makeRow(id: number) {
    const ts = new Date(Date.now() - id * 1000).toISOString();
    return { id: `00000000-0000-4000-8000-${id.toString().padStart(12, '0')}`, filename: `f${id}.md`, source_url: null, mime_type: 'text/markdown', created_at: ts, updated_at: ts };
}

describe('DocumentsService pagination', () => {
    it('returns nextCursor when results hit limit', async () => {
        const rows = [makeRow(1), makeRow(2), makeRow(3)];
        const svc = new DocumentsService(new FakeDb(rows) as any);
        const { items, nextCursor } = await svc.list(2);
        expect(items.length).toBe(2);
        expect(nextCursor).toBeTruthy();
        const decoded = svc.decodeCursor(nextCursor!);
        expect(decoded).toHaveProperty('id');
    });

    it('omits nextCursor when fewer than limit', async () => {
        const rows = [makeRow(1)];
        const svc = new DocumentsService(new FakeDb(rows) as any);
        const { items, nextCursor } = await svc.list(5);
        expect(items.length).toBe(1);
        expect(nextCursor).toBeNull();
    });

    it('decodeCursor handles invalid input gracefully', () => {
        const svc = new DocumentsService(new FakeDb([]) as any);
        expect(svc.decodeCursor('invalid$$')).toBeUndefined();
    });
});