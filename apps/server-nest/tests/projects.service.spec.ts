import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectsService } from '../src/modules/projects/projects.service';

// Minimal transactional fake DB
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
    constructor(private clientFactory: () => FakeClient) { }
    async query<T = any>(text: string, params?: any[]) {
        // Simple non-transactional query path for list()
        const client = this.clientFactory();
        return client.query(text, params) as any;
    }
    async getClient() { return this.clientFactory(); }
}

function uuid(n: number) { return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`; }

describe('ProjectsService', () => {
    const noopTemplatePacks = () => ({
        assignTemplatePackToProject: vi.fn().mockResolvedValue(undefined),
    });
    const configWithDefault = (defaultId?: string | null) => ({
        extractionDefaultTemplatePackId: defaultId ?? undefined,
    });

    it('list returns empty for invalid orgId shape', async () => {
        const svc = new ProjectsService(
            new FakeDb(() => new FakeClient([])) as any,
            noopTemplatePacks() as any,
            configWithDefault() as any,
        );
        const res = await svc.list(10, 'not-a-uuid');
        expect(res).toEqual([]);
    });

    it('list returns rows mapped when no orgId', async () => {
        const client = new FakeClient([
            { text: /SELECT id, name, organization_id.* FROM kb\.projects ORDER BY/, result: { rows: [{ id: uuid(1), name: 'P1', organization_id: uuid(9) }], rowCount: 1 } },
        ]);
        const svc = new ProjectsService(
            new FakeDb(() => client) as any,
            noopTemplatePacks() as any,
            configWithDefault() as any,
        );
        const res = await svc.list(5);
        expect(res).toEqual([{ id: uuid(1), name: 'P1', orgId: uuid(9) }]);
    });

    it('create rejects blank name', async () => {
        const svc = new ProjectsService(
            new FakeDb(() => new FakeClient([])) as any,
            noopTemplatePacks() as any,
            configWithDefault() as any,
        );
        await expect(svc.create('  ')).rejects.toMatchObject({ response: { error: { code: 'validation-failed' } } });
    });

    it('create rejects missing orgId', async () => {
        const svc = new ProjectsService(
            new FakeDb(() => new FakeClient([])) as any,
            noopTemplatePacks() as any,
            configWithDefault() as any,
        );
        await expect(svc.create('Proj')).rejects.toMatchObject({ response: { error: { code: 'org-required' } } });
    });

    it('create rejects org not found', async () => {
        const client = new FakeClient([
            { text: /SELECT id FROM kb\.orgs/, result: { rows: [], rowCount: 0 } },
        ]);
        const svc = new ProjectsService(
            new FakeDb(() => client) as any,
            noopTemplatePacks() as any,
            configWithDefault() as any,
        );
        await expect(svc.create('Proj', uuid(1))).rejects.toMatchObject({ response: { error: { code: 'org-not-found' } } });
    });

    it('create success without userId', async () => {
        const client = new FakeClient([
            { text: /BEGIN/ },
            { text: /SELECT id FROM kb\.orgs/, result: { rows: [{ id: uuid(1) }], rowCount: 1 } },
            { text: /INSERT INTO kb\.projects/, result: { rows: [{ id: uuid(2), name: 'Proj', organization_id: uuid(1) }], rowCount: 1 } },
            { text: /COMMIT/ },
        ]);
        const templatePacks = noopTemplatePacks();
        const svc = new ProjectsService(
            new FakeDb(() => client) as any,
            templatePacks as any,
            configWithDefault() as any,
        );
        const res = await svc.create('Proj', uuid(1));
        expect(res).toEqual({ id: uuid(2), name: 'Proj', orgId: uuid(1) });
        // Ensure membership not inserted
        expect(client.queries.find(q => /project_memberships/.test(q.text))).toBeUndefined();
        expect(templatePacks.assignTemplatePackToProject).not.toHaveBeenCalled();
    });

    it('create success with userId inserts membership with profile upsert', async () => {
        const client = new FakeClient([
            { text: /BEGIN/ },
            { text: /SELECT id FROM kb\.orgs/, result: { rows: [{ id: uuid(1) }], rowCount: 1 } },
            { text: /INSERT INTO kb\.projects/, result: { rows: [{ id: uuid(3), name: 'Proj2', organization_id: uuid(1) }], rowCount: 1 } },
            { text: /INSERT INTO kb\.project_memberships/ },
            { text: /COMMIT/ },
        ]);
        const templatePacks = noopTemplatePacks();
        const svc = new ProjectsService(
            new FakeDb(() => client) as any,
            templatePacks as any,
            configWithDefault() as any,
        );
        const res = await svc.create('Proj2', uuid(1), 'user-123');
        expect(res).toEqual({ id: uuid(3), name: 'Proj2', orgId: uuid(1) });
        // User profile creation was removed - now handled separately by auth flow
        expect(client.queries.some(q => /user_profiles/.test(q.text))).toBe(false);
        expect(client.queries.some(q => /project_memberships/.test(q.text))).toBe(true);
        expect(templatePacks.assignTemplatePackToProject).not.toHaveBeenCalled();
    });

    it('create translates FK race deletion into org-not-found', async () => {
        const client = new FakeClient([
            { text: /BEGIN/ },
            { text: /SELECT id FROM kb\.orgs/, result: { rows: [{ id: uuid(1) }], rowCount: 1 } },
            { text: /INSERT INTO kb\.projects/, throw: new Error('insert or update on table "kb.projects" violates foreign key constraint "projects_organization_id_fkey"') },
            { text: /ROLLBACK/ },
        ]);
        const svc = new ProjectsService(
            new FakeDb(() => client) as any,
            noopTemplatePacks() as any,
            configWithDefault() as any,
        );
        await expect(svc.create('Proj3', uuid(1))).rejects.toMatchObject({ response: { error: { code: 'org-not-found' } } });
    });

    it('create translates duplicate name into duplicate code', async () => {
        const client = new FakeClient([
            { text: /BEGIN/ },
            { text: /SELECT id FROM kb\.orgs/, result: { rows: [{ id: uuid(1) }], rowCount: 1 } },
            { text: /INSERT INTO kb\.projects/, throw: new Error('duplicate key value violates unique constraint') },
            { text: /ROLLBACK/ },
        ]);
        const svc = new ProjectsService(
            new FakeDb(() => client) as any,
            noopTemplatePacks() as any,
            configWithDefault() as any,
        );
        await expect(svc.create('Proj4', uuid(1))).rejects.toMatchObject({ response: { error: { code: 'duplicate' } } });
    });

    it('delete returns false for invalid id shape', async () => {
        const svc = new ProjectsService(
            new FakeDb(() => new FakeClient([])) as any,
            noopTemplatePacks() as any,
            configWithDefault() as any,
        );
        const res = await svc.delete('not-a-uuid');
        expect(res).toBe(false);
    });

    it('delete returns true when rowCount > 0', async () => {
        const client = new FakeClient([
            { text: /DELETE FROM kb\.projects/, result: { rows: [{ id: uuid(9) }], rowCount: 1 } },
        ]);
        const svc = new ProjectsService(
            new FakeDb(() => client) as any,
            noopTemplatePacks() as any,
            configWithDefault() as any,
        );
        const res = await svc.delete(uuid(9));
        expect(res).toBe(true);
    });

    it('create installs default template pack when configured', async () => {
        const client = new FakeClient([
            { text: /BEGIN/ },
            { text: /SELECT id FROM kb\.orgs/, result: { rows: [{ id: uuid(5) }], rowCount: 1 } },
            { text: /INSERT INTO kb\.projects/, result: { rows: [{ id: uuid(6), name: 'Proj-default', organization_id: uuid(5) }], rowCount: 1 } },
            { text: /COMMIT/ },
        ]);
        const templatePacks = {
            assignTemplatePackToProject: vi.fn().mockResolvedValue(undefined),
        };
        const svc = new ProjectsService(
            new FakeDb(() => client) as any,
            templatePacks as any,
            configWithDefault(uuid(42)) as any,
        );
        const result = await svc.create('Proj-default', uuid(5), 'user-xyz');
        expect(result).toEqual({ id: uuid(6), name: 'Proj-default', orgId: uuid(5) });
        expect(templatePacks.assignTemplatePackToProject).toHaveBeenCalledWith(
            uuid(6),
            uuid(5),
            uuid(5),
            'user-xyz',
            { template_pack_id: uuid(42) },
        );
    });
});
