import 'reflect-metadata';
import { describe, it, beforeAll, beforeEach, expect } from 'vitest';
import { DatabaseService } from '../../../../src/common/database/database.service';
import { SchemaRegistryService } from '../../../../src/modules/graph/schema-registry.service';
import { GraphService } from '../../../../src/modules/graph/graph.service';
import { AppConfigService } from '../../../../src/common/config/config.service';
import { getTestDbConfig, getTestDbServiceConfig } from '../../e2e/test-db-config';

async function seedProject(db: DatabaseService) {
    const org = await db.query<{ id: string }>(`INSERT INTO kb.orgs(name) VALUES ($1) RETURNING id`, ['org-' + Date.now()]);
    const project = await db.query<{ id: string }>(`INSERT INTO kb.projects(organization_id, name) VALUES ($1,$2) RETURNING id`, [org.rows[0].id, 'proj-' + Date.now()]);
    return { orgId: org.rows[0].id, projectId: project.rows[0].id };
}

async function createBranch(db: DatabaseService, projectId: string, name: string, parent: string | null = null) {
    const res = await db.query<{ id: string }>(
        `INSERT INTO kb.branches(project_id, name, parent_branch_id) VALUES ($1,$2,$3) RETURNING id`,
        [projectId, name, parent]
    );
    return res.rows[0].id;
}

let seq = 0; function uniqueKey(prefix: string) { return `${prefix}-${Date.now()}-${seq++}`; }

describe('Graph Validation', () => {
    let db: DatabaseService; let graph: GraphService; let orgId: string; let projectId: string; let secondProjectId: string; let secondOrgId: string;
    const setTenantContext = async (org: string | null, project: string | null) => {
        await db.setTenantContext(org, project);
    };

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        process.env.DB_AUTOINIT = 'true';

        // Use unified test database configuration
        const dbServiceConfig = getTestDbServiceConfig();

        const fakeConfig: any = {
            skipDb: false,
            autoInitDb: true,
            ...dbServiceConfig,
        } satisfies Partial<AppConfigService>;
        db = new DatabaseService(fakeConfig as AppConfigService);
        await db.onModuleInit();
        const schemaRegistry = new SchemaRegistryService(db);
        graph = new GraphService(db as any, schemaRegistry as any);
        const seeded = await seedProject(db); orgId = seeded.orgId; projectId = seeded.projectId;
        const seeded2 = await seedProject(db); secondOrgId = seeded2.orgId; secondProjectId = seeded2.projectId;
    });

    beforeEach(async () => {
        await setTenantContext(orgId, projectId);
    });

    it('deduplicates labels on object create', async () => {
        const key = uniqueKey('lab');
        await setTenantContext(orgId, projectId);
        const obj = await graph.createObject({ type: 'Thing', key, labels: ['A', 'B', 'A', 'B'], properties: { x: 1 }, organization_id: orgId, project_id: projectId } as any);
        expect(obj.labels.sort()).toEqual(['A', 'B']);
    });

    it('fails creating relationship when src missing', async () => {
        await setTenantContext(orgId, projectId);
        const a = await graph.createObject({ type: 'Node', key: uniqueKey('n'), properties: {}, organization_id: orgId, project_id: projectId } as any);
        await setTenantContext(orgId, projectId);
        await expect(graph.createRelationship({ type: 'LINKS', src_id: a.id, dst_id: '00000000-0000-0000-0000-000000000001', properties: {} } as any, orgId, projectId)).rejects.toThrow(/dst_object_not_found/);
    });

    it('fails creating relationship when endpoints on different projects', async () => {
        await setTenantContext(orgId, projectId);
        const obj1 = await graph.createObject({ type: 'Node', key: uniqueKey('p1'), properties: {}, organization_id: orgId, project_id: projectId } as any);
        await setTenantContext(secondOrgId, secondProjectId);
        const obj2 = await graph.createObject({ type: 'Node', key: uniqueKey('p2'), properties: {}, organization_id: secondOrgId, project_id: secondProjectId } as any);
        await setTenantContext(null, null);
        // With RLS enforced per project, the dst object from another project is invisible, yielding dst_object_not_found.
        await expect(graph.createRelationship({ type: 'LINKS', src_id: obj1.id, dst_id: obj2.id, properties: {} } as any, orgId, projectId)).rejects.toThrow(/dst_object_not_found/);
    });

    it('fails creating relationship with non-existent branch', async () => {
        await setTenantContext(orgId, projectId);
        const a = await graph.createObject({ type: 'Node', key: uniqueKey('n'), properties: {}, organization_id: orgId, project_id: projectId } as any);
        await setTenantContext(orgId, projectId);
        const b = await graph.createObject({ type: 'Node', key: uniqueKey('n'), properties: {}, organization_id: orgId, project_id: projectId } as any);
        await setTenantContext(orgId, projectId);
        await expect(graph.createRelationship({ type: 'LINKS', src_id: a.id, dst_id: b.id, properties: {}, branch_id: '11111111-1111-1111-1111-111111111111' } as any, orgId, projectId)).rejects.toThrow(/branch_not_found/);
    });

    it('fails relationship creation when endpoints on different branches and no branch specified', async () => {
        await setTenantContext(orgId, projectId);
        const br = await createBranch(db, projectId, 'val-branch');
        const baseKey = uniqueKey('split');
        await setTenantContext(orgId, projectId);
        const objMain = await graph.createObject({ type: 'Split', key: baseKey, properties: { side: 'main' }, organization_id: orgId, project_id: projectId } as any);
        await setTenantContext(orgId, projectId);
        const objBranch = await graph.createObject({ type: 'Split', key: baseKey, properties: { side: 'br' }, organization_id: orgId, project_id: projectId, branch_id: br } as any);
        await setTenantContext(orgId, projectId);
        await expect(graph.createRelationship({ type: 'LINKS', src_id: objMain.id, dst_id: objBranch.id, properties: {} } as any, orgId, projectId)).rejects.toThrow(/relationship_branch_mismatch/);
    });

    it('fails relationship creation when endpoints on branch but different branch passed explicitly', async () => {
        await setTenantContext(orgId, projectId);
        const br1 = await createBranch(db, projectId, 'val-branch-a');
        await setTenantContext(orgId, projectId);
        const br2 = await createBranch(db, projectId, 'val-branch-b');
        // Use distinct keys to avoid key collision across branches
        await setTenantContext(orgId, projectId);
        const a = await graph.createObject({ type: 'Node', key: uniqueKey('ka'), properties: {}, organization_id: orgId, project_id: projectId, branch_id: br1 } as any);
        await setTenantContext(orgId, projectId);
        const b = await graph.createObject({ type: 'Node', key: uniqueKey('kb'), properties: {}, organization_id: orgId, project_id: projectId, branch_id: br1 } as any);
        await setTenantContext(orgId, projectId);
        await expect(graph.createRelationship({ type: 'LINKS', src_id: a.id, dst_id: b.id, properties: {}, branch_id: br2 } as any, orgId, projectId)).rejects.toThrow(/relationship_branch_mismatch/);
    });

    // New edge error coverage tests
    it('fails creating object with duplicate (type,key) on same branch -> object_key_exists', async () => {
        const key = uniqueKey('dup');
        await setTenantContext(orgId, projectId);
        await graph.createObject({ type: 'Dup', key, properties: { v: 1 }, organization_id: orgId, project_id: projectId } as any);
        await setTenantContext(orgId, projectId);
        await expect(graph.createObject({ type: 'Dup', key, properties: { v: 2 }, organization_id: orgId, project_id: projectId } as any)).rejects.toThrow(/object_key_exists/);
    });

    it('fails patch with no effective change -> no_effective_change', async () => {
        const key = uniqueKey('nochange');
        await setTenantContext(orgId, projectId);
        const obj = await graph.createObject({ type: 'NC', key, properties: { a: 1 }, labels: ['L1'], organization_id: orgId, project_id: projectId } as any);
        await setTenantContext(orgId, projectId);
        // Same properties & labels (duplicate label in patch to test dedupe not counting as change)
        await expect(graph.patchObject(obj.id, { properties: { a: 1 }, labels: ['L1', 'L1'] } as any)).rejects.toThrow(/no_effective_change/);
    });

    it('fails restore when object not deleted -> not_deleted', async () => {
        const key = uniqueKey('restore');
        await setTenantContext(orgId, projectId);
        const obj = await graph.createObject({ type: 'R', key, properties: {}, organization_id: orgId, project_id: projectId } as any);
        await setTenantContext(orgId, projectId);
        await expect(graph.restoreObject(obj.id)).rejects.toThrow(/not_deleted/);
    });

    it('fails creating self-loop relationship -> self_loop_not_allowed', async () => {
        const key = uniqueKey('selfloop');
        await setTenantContext(orgId, projectId);
        const node = await graph.createObject({ type: 'Loop', key, properties: {}, organization_id: orgId, project_id: projectId } as any);
        await setTenantContext(orgId, projectId);
        await expect(graph.createRelationship({ type: 'LINKS', src_id: node.id, dst_id: node.id, properties: {} } as any, orgId, projectId)).rejects.toThrow(/self_loop_not_allowed/);
    });
});
