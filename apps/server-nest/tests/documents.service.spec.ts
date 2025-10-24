import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
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

// Extended coverage for creation, deletion, filters, cursor, and helpers
describe('DocumentsService extended behaviour', () => {
    class ScriptableDb {
        public calls: { text: string; params?: any[] }[] = [];
        constructor(public handlers: Array<{ match: RegExp | string; respond: (text: string, params?: any[]) => { rows: any[]; rowCount: number } }>) { }
        async query(text: string, params?: any[]) {
            this.calls.push({ text, params });
            const h = this.handlers.find(h => typeof h.match === 'string' ? text.includes(h.match) : h.match.test(text));
            if (!h) throw new Error('Unexpected query: ' + text);
            return h.respond(text, params);
        }
    }

    function makeDoc(id: string, createdOffset = 0) {
        const ts = new Date(Date.now() - createdOffset).toISOString();
        return { id, org_id: 'org-1', project_id: 'proj-1', filename: `file-${id}.txt`, source_url: null, mime_type: 'text/plain', created_at: ts, updated_at: ts, chunks: 2 };
    }

    it('list builds WHERE with org, project, and cursor', async () => {
        const rows = [makeDoc('a', 0), makeDoc('b', 1000), makeDoc('c', 2000)]; // already descending-ish
        const db = new ScriptableDb([
            {
                match: 'FROM kb.documents',
                respond: (_text, params) => {
                    // params: [limit+1, orgId, projectId, cursor.createdAt, cursor.id]
                    expect(params?.length).toBe(5);
                    return { rows, rowCount: rows.length };
                },
            },
        ]);
        const svc = new DocumentsService(db as any);
        const cursor = Buffer.from(JSON.stringify({ createdAt: rows[1].created_at, id: rows[1].id }), 'utf8').toString('base64url');
        const decoded = svc.decodeCursor(cursor)!; // ensure decode path success
        const res = await svc.list(2, decoded, { orgId: 'org-1', projectId: 'proj-1' });
        expect(res.items.length).toBe(2); // limit page slice
        expect(res.nextCursor).toBeTruthy(); // extra row -> cursor present
        const last = res.items[res.items.length - 1];
        expect(last.id).toBeDefined();
    });

    it('create throws when projectId missing', async () => {
        const db = new ScriptableDb([]);
        const svc = new DocumentsService(db as any);
        await expect(svc.create({ orgId: 'o1', filename: 'a.txt', content: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('create throws when projectId unknown (no row inserted)', async () => {
        const db = new ScriptableDb([
            {
                match: 'INSERT INTO kb.documents',
                respond: () => ({ rows: [], rowCount: 0 }),
            },
        ]);
        const svc = new DocumentsService(db as any);
        await expect(svc.create({ orgId: 'o1', projectId: 'p-x', filename: 'a.txt', content: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('create succeeds and maps row', async () => {
        const inserted = makeDoc('new-id');
        inserted.chunks = 0;
        inserted.filename = 'f.txt';
        const db = new ScriptableDb([
            {
                match: 'INSERT INTO kb.documents',
                respond: () => ({ rows: [inserted], rowCount: 1 }),
            },
        ]);
        const svc = new DocumentsService(db as any);
        const doc = await svc.create({ orgId: 'o1', projectId: 'p1', filename: 'f.txt', content: 'hello' });
        expect(doc.id).toBe('new-id');
        expect(doc.chunks).toBe(0);
        expect(doc.name).toBe('f.txt');
    });

    it('get returns null when not found', async () => {
        const db = new ScriptableDb([
            { match: 'WHERE d.id =', respond: () => ({ rows: [], rowCount: 0 }) },
        ]);
        const svc = new DocumentsService(db as any);
        expect(await svc.get('x')).toBeNull();
    });

    it('get maps row with source_url fallback name when filename null', async () => {
        const doc: any = makeDoc('r1');
        doc.filename = null;
        doc.source_url = 'https://example.com/file.pdf';
        const db = new ScriptableDb([
            { match: 'WHERE d.id =', respond: () => ({ rows: [doc], rowCount: 1 }) },
        ]);
        const svc = new DocumentsService(db as any);
        const got = await svc.get('r1');
        expect(got?.name).toBe('https://example.com/file.pdf');
    });

    it('getProjectOrg returns null and then org id', async () => {
        const db = new ScriptableDb([
            { match: 'FROM kb.projects', respond: () => ({ rows: [], rowCount: 0 }) },
        ]);
        const svc = new DocumentsService(db as any);
        expect(await svc.getProjectOrg('p1')).toBeNull();
        // second handler returns row
        db.handlers.unshift({ match: 'FROM kb.projects', respond: () => ({ rows: [{ organization_id: 'org-77' }], rowCount: 1 }) } as any);
        expect(await svc.getProjectOrg('p1')).toBe('org-77');
    });

    it('delete returns true when a row deleted and false otherwise', async () => {
        const db = new ScriptableDb([
            { match: 'DELETE FROM kb.chunks', respond: () => ({ rows: [], rowCount: 0 }) },
            { match: 'DELETE FROM kb.documents', respond: () => ({ rows: [], rowCount: 1 }) },
        ]);
        const svc = new DocumentsService(db as any);
        expect(await svc.delete('d1')).toBe(true);
        // swap documents delete to return 0
        db.handlers = [
            { match: 'DELETE FROM kb.chunks', respond: () => ({ rows: [], rowCount: 0 }) },
            { match: 'DELETE FROM kb.documents', respond: () => ({ rows: [], rowCount: 0 }) },
        ];
        expect(await svc.delete('d2')).toBe(false);
    });
});