import 'reflect-metadata';
import { describe, it, beforeAll, beforeEach, expect } from 'vitest';
import { GraphService } from '../../../../src/modules/graph/graph.service';
import { DatabaseService } from '../../../../src/common/database/database.service';
import { SchemaRegistryService } from '../../../../src/modules/graph/schema-registry.service';
import { AppConfigService } from '../../../../src/common/config/config.service';
import { BadRequestException } from '@nestjs/common';
import { getTestDbServiceConfig } from '../../e2e/test-db-config';

// We rely on the real AppConfigModule to construct AppConfigService with validation so that
// DatabaseService receives a properly wired instance. Environment defaults are injected below.

/** Utility to insert a relationship type schema row with multiplicity metadata */
async function upsertRelType(db: DatabaseService, projectId: string | null, type: string, multiplicity: { src: 'one' | 'many'; dst: 'one' | 'many' }) {
    // Insert a base row; simplest approach: always insert new version head
    await db.query(
        `INSERT INTO kb.relationship_type_schemas(organization_id, project_id, type, version, supersedes_id, canonical_id, json_schema, multiplicity)
     VALUES ($1,$2,$3,1, NULL, gen_random_uuid(), $4, $5)
     ON CONFLICT DO NOTHING`,
        [null, projectId, type, { type: 'object', additionalProperties: true }, multiplicity]
    );
}

async function seedProject(db: DatabaseService) {
    const org = await db.query<{ id: string }>(`INSERT INTO kb.orgs(name) VALUES ($1) RETURNING id`, ['mult-org-' + Date.now()]);
    const project = await db.query<{ id: string }>(`INSERT INTO kb.projects(organization_id, name) VALUES ($1,$2) RETURNING id`, [org.rows[0].id, 'proj-' + Date.now()]);
    return { orgId: org.rows[0].id, projectId: project.rows[0].id };
}

let seedSeq = 0;
async function seedObjects(graph: GraphService, orgId: string, projectId: string) {
    // Use a monotonically increasing prefix to ensure (project_id,type,key) uniqueness across tests.
    const prefix = `t${seedSeq++}`;
    const a = await graph.createObject({ type: 'Node', key: `${prefix}-a`, properties: {}, organization_id: orgId, project_id: projectId } as any);
    const b = await graph.createObject({ type: 'Node', key: `${prefix}-b`, properties: {}, organization_id: orgId, project_id: projectId } as any);
    const c = await graph.createObject({ type: 'Node', key: `${prefix}-c`, properties: {}, organization_id: orgId, project_id: projectId } as any);
    return { a, b, c };
}

describe('Graph Relationship Multiplicity', () => {
    let graph: GraphService;
    let db: DatabaseService;
    let projectId: string; let orgId: string;

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        const dbServiceConfig = getTestDbServiceConfig();
        process.env.DB_AUTOINIT = 'true';
        const fakeConfig: any = {
            skipDb: false,
            autoInitDb: true,
            ...dbServiceConfig,
        } satisfies Partial<AppConfigService>;
        db = new DatabaseService(fakeConfig as AppConfigService);
        await db.onModuleInit();
        const schemaRegistry = new SchemaRegistryService(db);
        graph = new GraphService(db as any, schemaRegistry as any);
        const seeded = await seedProject(db);
        projectId = seeded.projectId; orgId = seeded.orgId;
    });

    beforeEach(async () => {
        await db.setTenantContext(orgId, projectId);
    });

    it('enforces src one multiplicity', async () => {
        const { a, b, c } = await seedObjects(graph, orgId, projectId);
        await upsertRelType(db, projectId, 'FRIEND_OF', { src: 'one', dst: 'many' });
        await graph.createRelationship({ type: 'FRIEND_OF', src_id: a.id, dst_id: b.id, properties: {} }, orgId, projectId);
        await expect(graph.createRelationship({ type: 'FRIEND_OF', src_id: a.id, dst_id: c.id, properties: {} }, orgId, projectId))
            .rejects.toMatchObject({ response: { code: 'relationship_multiplicity_violation', side: 'src' } });
    });

    it('enforces dst one multiplicity', async () => {
        const { a, b, c } = await seedObjects(graph, orgId, projectId);
        await upsertRelType(db, projectId, 'LIKES', { src: 'many', dst: 'one' });
        await graph.createRelationship({ type: 'LIKES', src_id: a.id, dst_id: b.id, properties: {} }, orgId, projectId);
        await expect(graph.createRelationship({ type: 'LIKES', src_id: c.id, dst_id: b.id, properties: {} }, orgId, projectId))
            .rejects.toMatchObject({ response: { code: 'relationship_multiplicity_violation', side: 'dst' } });
    });

    it('enforces one-to-one multiplicity on both sides', async () => {
        const { a, b, c } = await seedObjects(graph, orgId, projectId);
        await upsertRelType(db, projectId, 'OWNS', { src: 'one', dst: 'one' });
        await graph.createRelationship({ type: 'OWNS', src_id: a.id, dst_id: b.id, properties: {} }, orgId, projectId);
        // Second with same src different dst fails (src side)
        await expect(graph.createRelationship({ type: 'OWNS', src_id: a.id, dst_id: c.id, properties: {} }, orgId, projectId))
            .rejects.toMatchObject({ response: { code: 'relationship_multiplicity_violation', side: 'src' } });
        // Second with different src same dst (should fail dst side). Need fresh pair
        const { a: a2, b: b2 } = await seedObjects(graph, orgId, projectId);
        await expect(graph.createRelationship({ type: 'OWNS', src_id: a2.id, dst_id: b.id, properties: {} }, orgId, projectId))
            .rejects.toMatchObject({ response: { code: 'relationship_multiplicity_violation', side: 'dst' } });
    });

    it('allows many-to-many multiplicity', async () => {
        const { a, b, c } = await seedObjects(graph, orgId, projectId);
        await upsertRelType(db, projectId, 'MENTIONS', { src: 'many', dst: 'many' });
        const rels = [
            { src_id: a.id, dst_id: b.id },
            { src_id: a.id, dst_id: c.id },
            { src_id: c.id, dst_id: b.id },
        ];
        for (const r of rels) {
            let attempts = 0;
            while (true) {
                try {
                    await graph.createRelationship({ type: 'MENTIONS', src_id: r.src_id, dst_id: r.dst_id, properties: {} }, orgId, projectId);
                    break;
                } catch (e: any) {
                    const msg = (e && e.message) || '';
                    if (/(deadlock detected)/i.test(msg) && attempts < 2) { attempts++; await new Promise(res => setTimeout(res, 25)); continue; }
                    throw e;
                }
            }
        }
    });
});
