import { describe, it, expect, beforeEach } from 'vitest';
import { OrgsService } from '../src/modules/orgs/orgs.service';
import { ConflictException } from '@nestjs/common';

// Reusable error helpers
function pgError(code: string, message = code): any { return Object.assign(new Error(message), { code }); }

// Transactional fake client similar to projects.service tests
class FakeClient {
    public queries: { text: string; params?: any[] }[] = [];
    constructor(private scripts: Array<{ text: RegExp; result?: any; throw?: Error }>) { }
    async query(text: string, params?: any[]) {
        this.queries.push({ text, params });
        const script = this.scripts.find(s => s.text.test(text));
        if (!script) return { rows: [], rowCount: 0 };
        if (script.throw) throw script.throw;
        return script.result ?? { rows: [], rowCount: 0 };
    }
    release() { }
}

class FakeDb {
    constructor(private online: boolean, private clientFactory: () => FakeClient, private scriptedQueries: Array<{ text: RegExp; result?: any; throw?: Error }> = []) { }
    isOnline() { return this.online; }
    setOnline(v: boolean) { this.online = v; }
    async query<T = any>(text: string, params?: any[]) {
        const script = this.scriptedQueries.find(s => s.text.test(text));
        if (script) {
            if (script.throw) throw script.throw;
            return script.result ?? { rows: [], rowCount: 0 } as any;
        }
        const client = this.clientFactory();
        return client.query(text, params) as any;
    }
    async getClient() { return this.clientFactory(); }
}

function uuid(n: number) { return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`; }

describe('OrgsService', () => {
    it('list() offline returns in-memory array copy (initially empty)', async () => {
        const svc = new OrgsService(new FakeDb(false, () => new FakeClient([])) as any, {} as any);
        const res = await svc.list();
        expect(res).toEqual([]);
    });

    it('list() online maps rows', async () => {
        const client = new FakeClient([
            { text: /SELECT id, name, created_at, updated_at FROM kb\.orgs ORDER BY/, result: { rows: [{ id: uuid(1), name: 'Acme', created_at: '', updated_at: '' }], rowCount: 1 } },
        ]);
        const svc = new OrgsService(new FakeDb(true, () => client) as any, {} as any);
        const res = await svc.list();
        expect(res).toEqual([{ id: uuid(1), name: 'Acme' }]);
    });

    it('list() online table missing falls back to memory', async () => {
        const svc = new OrgsService(new FakeDb(true, () => new FakeClient([]), [{ text: /SELECT id, name, created_at, updated_at FROM kb\.orgs ORDER BY/, throw: pgError('42P01') }]) as any, {} as any);
        const res = await svc.list();
        expect(res).toEqual([]); // fallback copy
    });

    it('get() offline returns null when not found', async () => {
        const svc = new OrgsService(new FakeDb(false, () => new FakeClient([])) as any, {} as any);
        const res = await svc.get(uuid(9));
        expect(res).toBeNull();
    });

    it('get() online table missing returns null (fallback)', async () => {
        const svc = new OrgsService(new FakeDb(true, () => new FakeClient([]), [{ text: /SELECT id, name, created_at, updated_at FROM kb\.orgs WHERE/, throw: pgError('42P01') }]) as any, {} as any);
        const res = await svc.get(uuid(2));
        expect(res).toBeNull();
    });

    it('create() offline prevents duplicate names (case-insensitive)', async () => {
        const svc = new OrgsService(new FakeDb(false, () => new FakeClient([])) as any, {} as any);
        const first = await svc.create('Acme');
        expect(first.name).toBe('Acme');
        await expect(svc.create('acme')).rejects.toBeInstanceOf(ConflictException);
    });

    it('create() offline enforces 100 org limit', async () => {
        const svc = new OrgsService(new FakeDb(false, () => new FakeClient([])) as any, {} as any);
        for (let i = 0; i < 100; i++) {
            const o = await svc.create('Org' + i);
            expect(o.id).toBeTruthy();
        }
        await expect(svc.create('Overflow')).rejects.toThrow(/Organization limit reached/);
    });

    it('create() online limit check (count >=100) rejects', async () => {
        const svc = new OrgsService(new FakeDb(true, () => new FakeClient([]), [{ text: /SELECT COUNT\(\*\)::text as count FROM kb\.orgs/, result: { rows: [{ count: '100' }], rowCount: 1 } }]) as any, {} as any);
        await expect(svc.create('AcmeOnline')).rejects.toThrow(/Organization limit reached/);
    });

    it('create() online success without userId', async () => {
        const client = new FakeClient([
            { text: /BEGIN/ },
            { text: /INSERT INTO kb\.orgs/, result: { rows: [{ id: uuid(7), name: 'Solo', created_at: '', updated_at: '' }], rowCount: 1 } },
            { text: /COMMIT/ },
        ]);
        const svc = new OrgsService(new FakeDb(true, () => client, [{ text: /SELECT COUNT\(\*\)::text as count FROM kb\.orgs/, result: { rows: [{ count: '0' }], rowCount: 1 } }]) as any, {} as any);
        const res = await svc.create('Solo');
        expect(res).toEqual({ id: uuid(7), name: 'Solo' });
        expect(client.queries.some(q => /organization_memberships/.test(q.text))).toBe(false);
    });

    it('create() online success with userId inserts profile + membership', async () => {
        const client = new FakeClient([
            { text: /BEGIN/ },
            { text: /INSERT INTO kb\.orgs/, result: { rows: [{ id: uuid(8), name: 'WithUser', created_at: '', updated_at: '' }], rowCount: 1 } },
            { text: /INSERT INTO core\.user_profiles/ },
            { text: /INSERT INTO kb\.organization_memberships/ },
            { text: /COMMIT/ },
        ]);
        const svc = new OrgsService(new FakeDb(true, () => client, [{ text: /SELECT COUNT\(\*\)::text as count FROM kb\.orgs/, result: { rows: [{ count: '1' }], rowCount: 1 } }]) as any, {} as any);
        const res = await svc.create('WithUser', 'user-123');
        expect(res).toEqual({ id: uuid(8), name: 'WithUser' });
        expect(client.queries.some(q => /user_profiles/.test(q.text))).toBe(true);
        expect(client.queries.some(q => /organization_memberships/.test(q.text))).toBe(true);
    });

    it('create() online duplicate name translates unique violation', async () => {
        const client = new FakeClient([
            { text: /BEGIN/ },
            { text: /INSERT INTO kb\.orgs/, throw: pgError('23505', 'duplicate key value violates unique constraint') },
            { text: /ROLLBACK/ },
        ]);
        const svc = new OrgsService(new FakeDb(true, () => client, [{ text: /SELECT COUNT\(\*\)::text as count FROM kb\.orgs/, result: { rows: [{ count: '0' }], rowCount: 1 } }]) as any, {} as any);
        await expect(svc.create('DupOrg')).rejects.toBeInstanceOf(ConflictException);
    });

    it('create() online table missing falls back to memory path', async () => {
        const svc = new OrgsService(
            new FakeDb(
                true,
                () => new FakeClient([]),
                [
                    { text: /SELECT COUNT\(\*\)::text as count FROM kb\.orgs/, throw: pgError('42P01') },
                    { text: /SELECT id, name, created_at, updated_at FROM kb\.orgs ORDER BY/, throw: pgError('42P01') }
                ]
            ) as any,
            {} as any
        );
        const created = await svc.create('Fallback');
        expect(created.name).toBe('Fallback');
        // After fallback DB still "online" but subsequent list() should read in-memory because first query again throws 42P01
        const list = await svc.list();
        expect(list.find(o => o.name === 'Fallback')).toBeTruthy();
    });

    it('delete() offline removes existing org', async () => {
        const svc = new OrgsService(new FakeDb(false, () => new FakeClient([])) as any, {} as any);
        const a = await svc.create('LocalA');
        const removed = await svc.delete(a.id);
        expect(removed).toBe(true);
        const again = await svc.delete(a.id);
        expect(again).toBe(false);
    });

    it('delete() online returns true when row deleted', async () => {
        const svc = new OrgsService(
            new FakeDb(
                true,
                () => new FakeClient([]),
                [{ text: /DELETE FROM kb\.orgs/, result: { rows: [{ id: uuid(5) }], rowCount: 1 } }]
            ) as any,
            {} as any
        );
        const res = await svc.delete(uuid(5));
        expect(res).toBe(true);
    });

    it('delete() online table missing returns false', async () => {
        const svc = new OrgsService(new FakeDb(true, () => new FakeClient([]), [{ text: /DELETE FROM kb\.orgs/, throw: pgError('42P01') }]) as any, {} as any);
        const res = await svc.delete(uuid(6));
        expect(res).toBe(false);
    });
});
