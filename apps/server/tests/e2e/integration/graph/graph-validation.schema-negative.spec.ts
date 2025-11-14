import 'reflect-metadata';
import { describe, it, beforeAll, expect } from 'vitest';
import { DatabaseService } from '../../../../src/common/database/database.service';
import { SchemaRegistryService } from '../../../../src/modules/graph/schema-registry.service';
import { GraphService } from '../../../../src/modules/graph/graph.service';
import { AppConfigService } from '../../../../src/common/config/config.service';
import { getTestDbServiceConfig } from '../../e2e/test-db-config';

/** Negative schema validation test using object_type_schemas table */

describe('Graph Validation - schema negative', () => {
    let db: DatabaseService; let graph: GraphService; let orgId: string; let projectId: string; let schemaRegistry: SchemaRegistryService;

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        process.env.DB_AUTOINIT = 'true';
        const dbServiceConfig = getTestDbServiceConfig();
        const fakeConfig: any = {
            skipDb: false, autoInitDb: true,
            ...dbServiceConfig,
        } satisfies Partial<AppConfigService>;
        db = new DatabaseService(fakeConfig as AppConfigService);
        await db.onModuleInit();
        schemaRegistry = new SchemaRegistryService(db);
        graph = new GraphService(db as any, schemaRegistry as any);
        // Seed org + project
        const org = await db.query<{ id: string }>(`INSERT INTO kb.orgs(name) VALUES ($1) RETURNING id`, ['org-sx-' + Date.now()]);
        const proj = await db.query<{ id: string }>(`INSERT INTO kb.projects(organization_id, name) VALUES ($1,$2) RETURNING id`, [org.rows[0].id, 'proj-sx-' + Date.now()]);
        orgId = org.rows[0].id; projectId = proj.rows[0].id;
        // Register schema requiring 'title' into object_type_schemas
        await db.query(`INSERT INTO kb.object_type_schemas(project_id, type, json_schema) VALUES ($1,$2,$3)`, [projectId, 'TypedNode', { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }]);
    });

    it('rejects object creation missing required property per schema', async () => {
        let caught: any;
        try {
            await graph.createObject({ type: 'TypedNode', key: 'k1', properties: { /* missing title */ }, organization_id: orgId, project_id: projectId } as any);
        } catch (e: any) {
            caught = e;
        }
        expect(caught).toBeTruthy();
        // Nest BadRequestException stores payload on 'response'
        expect(caught.response?.code).toBe('object_schema_validation_failed');
        expect(Array.isArray(caught.response?.errors)).toBe(true);
    });

    it('allows object creation when schema satisfied', async () => {
        const obj = await graph.createObject({ type: 'TypedNode', key: 'k2', properties: { title: 'Hello' }, organization_id: orgId, project_id: projectId } as any);
        expect(obj.properties.title).toBe('Hello');
    });
});
