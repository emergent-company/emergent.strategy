import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { DatabaseService } from '../../../../src/common/database/database.service';
import { GraphService } from '../../../../src/modules/graph/graph.service';
import { SchemaRegistryService } from '../../../../src/modules/graph/schema-registry.service';
import { AppConfigService } from '../../../../src/common/config/config.service';
import { getTestDbServiceConfig } from '../../e2e/test-db-config';

/** Utility to seed org + project */
async function seedTenant(db: DatabaseService, label: string) {
    const org = await db.query<{ id: string }>(`INSERT INTO kb.orgs(name) VALUES ($1) RETURNING id`, ['org-' + label + '-' + Date.now()]);
    const project = await db.query<{ id: string }>(`INSERT INTO kb.projects(organization_id, name) VALUES ($1,$2) RETURNING id`, [org.rows[0].id, 'proj-' + label + '-' + Date.now()]);
    return { orgId: org.rows[0].id, projectId: project.rows[0].id };
}

async function createObject(graph: GraphService, db: DatabaseService, orgId: string, projectId: string, key: string) {
    await db.setTenantContext(orgId, projectId);
    return graph.createObject({ type: 'SecNode', key, properties: { v: key }, organization_id: orgId, project_id: projectId, labels: [] } as any);
}

describe('Graph RLS Security', () => {
    let db: DatabaseService; let graph: GraphService; let schema: SchemaRegistryService;
    let tenantA: { orgId: string; projectId: string }; let tenantB: { orgId: string; projectId: string };

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        process.env.DB_AUTOINIT = 'true';
        const dbServiceConfig = getTestDbServiceConfig();
        const fakeConfig: any = {
            skipDb: false,
            autoInitDb: true,
            ...dbServiceConfig,
        } satisfies Partial<AppConfigService>;
        db = new DatabaseService(fakeConfig as AppConfigService);
        await db.onModuleInit();
        schema = new SchemaRegistryService(db);
        graph = new GraphService(db as any, schema as any);
        tenantA = await seedTenant(db, 'A');
        tenantB = await seedTenant(db, 'B');
    });

    it('allows visibility of own tenant and hides others when context set', async () => {
        const a1 = await createObject(graph, db, tenantA.orgId, tenantA.projectId, 'a1');
        const b1 = await createObject(graph, db, tenantB.orgId, tenantB.projectId, 'b1');

        await db.setTenantContext(tenantA.orgId, tenantA.projectId);
        const resA = await db.query<{ id: string }>(`SELECT id FROM kb.graph_objects WHERE type='SecNode'`);
        expect(resA.rows.map(r => r.id)).toContain(a1.id);
        expect(resA.rows.map(r => r.id)).not.toContain(b1.id);

        await db.setTenantContext(tenantB.orgId, tenantB.projectId);
        const resB = await db.query<{ id: string }>(`SELECT id FROM kb.graph_objects WHERE type='SecNode'`);
        expect(resB.rows.map(r => r.id)).toContain(b1.id);
        expect(resB.rows.map(r => r.id)).not.toContain(a1.id);
    });

    it('treats empty tenant context as wildcard (bootstrap behavior)', async () => {
        await db.setTenantContext(null, null);
        const res = await db.query<{ id: string }>(`SELECT id FROM kb.graph_objects WHERE type='SecNode'`);
        expect(res.rows.length).toBeGreaterThanOrEqual(2);
    });

    it('prevents updating object from another tenant (filtered to zero rows)', async () => {
        const a2 = await createObject(graph, db, tenantA.orgId, tenantA.projectId, 'a2');
        await db.setTenantContext(tenantB.orgId, tenantB.projectId);
        const upd = await db.query(`UPDATE kb.graph_objects SET properties = jsonb_set(properties,'{hijack}', '"1"') WHERE id=$1`, [a2.id]);
        expect(upd.rowCount).toBe(0);
    });
});
