import 'reflect-metadata';
import { describe, it, beforeAll, beforeEach, afterAll, expect } from 'vitest';
import { GraphService } from '../../../../src/modules/graph/graph.service';
import { DatabaseService } from '../../../../src/common/database/database.service';
import { AppConfigService } from '../../../../src/common/config/config.service';
import { withMultiplicities } from '../helpers/helpers/schema-registry.stub';
import { getTestDbServiceConfig } from '../../e2e/test-db-config';

// This spec focuses purely on violation scenarios using a stubbed schema registry
// instead of inserting relationship_type_schemas rows. This keeps the feedback loop
// fast and isolates GraphService logic.

async function seedProject(db: DatabaseService) {
    const org = await db.query<{ id: string }>(`INSERT INTO kb.orgs(name) VALUES ($1) RETURNING id`, ['neg-mult-org-' + Date.now()]);
    const project = await db.query<{ id: string }>(`INSERT INTO kb.projects(organization_id, name) VALUES ($1,$2) RETURNING id`, [org.rows[0].id, 'neg-proj-' + Date.now()]);
    return { orgId: org.rows[0].id, projectId: project.rows[0].id };
}

let seedSeq = 0;
async function seedObjects(graph: GraphService, db: DatabaseService, orgId: string, projectId: string) {
    await db.setTenantContext(orgId, projectId);
    const prefix = `n${seedSeq++}`;
    const a = await graph.createObject({ type: 'Node', key: `${prefix}-a`, properties: {}, organization_id: orgId, project_id: projectId } as any);
    await db.setTenantContext(orgId, projectId);
    const b = await graph.createObject({ type: 'Node', key: `${prefix}-b`, properties: {}, organization_id: orgId, project_id: projectId } as any);
    await db.setTenantContext(orgId, projectId);
    const c = await graph.createObject({ type: 'Node', key: `${prefix}-c`, properties: {}, organization_id: orgId, project_id: projectId } as any);
    return { a, b, c };
}

// Note: Prior deadlocks appeared due to test file level parallelization in the
// broader suite, not intra-file concurrency. We avoid explicit parallel helpers
// here and keep deterministic object key prefixes via incrementing seedSeq.
describe('Graph Relationship Multiplicity (negative via stub)', () => {
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

        // Build stub with per-type multiplicities (no DB schema rows needed)
        const schemaRegistryStub = withMultiplicities({
            ONE_SRC: { src: 'one', dst: 'many' },
            ONE_DST: { src: 'many', dst: 'one' },
            ONE_ONE: { src: 'one', dst: 'one' }
        });
        graph = new GraphService(db as any, schemaRegistryStub as any);
        const seeded = await seedProject(db);
        projectId = seeded.projectId; orgId = seeded.orgId;
    });

    beforeEach(async () => {
        await db.setTenantContext(null, null);
    });

    afterAll(async () => {
        // Close DB connections to ensure clean shutdown & release any remaining locks
        await db?.onModuleDestroy?.();
    });

    it('violates one-src multiplicity on second relationship from same src', async () => {
        const { a, b, c } = await seedObjects(graph, db, orgId, projectId);
        await db.setTenantContext(orgId, projectId);
        await graph.createRelationship({ type: 'ONE_SRC', src_id: a.id, dst_id: b.id, properties: {} }, orgId, projectId);
        await db.setTenantContext(orgId, projectId);
        await expect(graph.createRelationship({ type: 'ONE_SRC', src_id: a.id, dst_id: c.id, properties: {} }, orgId, projectId))
            .rejects.toMatchObject({ response: { code: 'relationship_multiplicity_violation', side: 'src', type: 'ONE_SRC' } });
    });

    it('violates one-dst multiplicity on second relationship to same dst', async () => {
        const { a, b, c } = await seedObjects(graph, db, orgId, projectId);
        await db.setTenantContext(orgId, projectId);
        await graph.createRelationship({ type: 'ONE_DST', src_id: a.id, dst_id: b.id, properties: {} }, orgId, projectId);
        await db.setTenantContext(orgId, projectId);
        await expect(graph.createRelationship({ type: 'ONE_DST', src_id: c.id, dst_id: b.id, properties: {} }, orgId, projectId))
            .rejects.toMatchObject({ response: { code: 'relationship_multiplicity_violation', side: 'dst', type: 'ONE_DST' } });
    });

    it('violates one-one multiplicity for src then dst sides separately', async () => {
        const { a, b, c } = await seedObjects(graph, db, orgId, projectId);
        await db.setTenantContext(orgId, projectId);
        await graph.createRelationship({ type: 'ONE_ONE', src_id: a.id, dst_id: b.id, properties: {} }, orgId, projectId);
        // src side violation
        await db.setTenantContext(orgId, projectId);
        await expect(graph.createRelationship({ type: 'ONE_ONE', src_id: a.id, dst_id: c.id, properties: {} }, orgId, projectId))
            .rejects.toMatchObject({ response: { code: 'relationship_multiplicity_violation', side: 'src', type: 'ONE_ONE' } });
        // dst side violation (need new src since b already used as dst)
        const { a: a2 } = await seedObjects(graph, db, orgId, projectId);
        await db.setTenantContext(orgId, projectId);
        await expect(graph.createRelationship({ type: 'ONE_ONE', src_id: a2.id, dst_id: b.id, properties: {} }, orgId, projectId))
            .rejects.toMatchObject({ response: { code: 'relationship_multiplicity_violation', side: 'dst', type: 'ONE_ONE' } });
    });
});
