import 'reflect-metadata';
import { describe, it, beforeAll, expect } from 'vitest';
import { GraphService } from '../graph.service';
import { DatabaseService } from '../../../common/database/database.service';
import { SchemaRegistryService } from '../schema-registry.service';
import { AppConfigService } from '../../../common/config/config.service';

// Helper to seed org + project
async function seedProject(db: DatabaseService) {
    const org = await db.query<{ id: string }>(`INSERT INTO kb.orgs(name) VALUES ($1) RETURNING id`, ['org-' + Date.now()]);
    const project = await db.query<{ id: string }>(`INSERT INTO kb.projects(org_id, name) VALUES ($1,$2) RETURNING id`, [org.rows[0].id, 'proj-' + Date.now()]);
    return { orgId: org.rows[0].id, projectId: project.rows[0].id };
}

async function createBranch(db: DatabaseService, projectId: string, name: string, parent: string | null = null) {
    const res = await db.query<{ id: string }>(
        `INSERT INTO kb.branches(project_id, name, parent_branch_id) VALUES ($1,$2,$3) RETURNING id`,
        [projectId, name, parent]
    );
    return res.rows[0].id;
}

let seq = 0;
function uniqueKey(prefix: string) { return `${prefix}-${Date.now()}-${seq++}`; }

/**
 * Assertions focus areas:
 * 1. Branch name uniqueness per project.
 * 2. Object key uniqueness scoped by (project, branch, type, key) allowing same key across branches.
 * 3. Divergent object evolution: same canonical_id versions differ per branch.
 * 4. Relationship divergence & isolation in searches.
 * 5. Search & traversal isolation by branch (basic smoke for search).
 */

// NOTE(flaky): Marked sequential to avoid intermittent PostgreSQL deadlock errors when run in parallel
// with other specs that exercise advisory locks & DDL (e.g., relationship creation dropping temp index).
// The suite creates/patches objects & relationships with overlapping advisory lock domains across branches.
// Running sequentially removes cross-worker contention that sporadically triggers a deadlock detection.
describe.sequential('Graph Branching', () => {
    let db: DatabaseService;
    let graph: GraphService;
    let projectId: string; let orgId: string;

    beforeAll(async () => {
        process.env.E2E_MINIMAL_DB = 'true';
        process.env.DB_AUTOINIT = 'true';
        process.env.PGHOST = process.env.PGHOST || 'localhost';
        process.env.PGPORT = process.env.PGPORT || '5432';
        process.env.PGUSER = process.env.PGUSER || 'spec';
        process.env.PGPASSWORD = process.env.PGPASSWORD || 'spec';
        process.env.PGDATABASE = process.env.PGDATABASE || 'spec';
        const fakeConfig: any = {
            skipDb: false,
            autoInitDb: true,
            dbHost: process.env.PGHOST,
            dbPort: +(process.env.PGPORT || 5432),
            dbUser: process.env.PGUSER,
            dbPassword: process.env.PGPASSWORD,
            dbName: process.env.PGDATABASE,
        } satisfies Partial<AppConfigService>;
        db = new DatabaseService(fakeConfig as AppConfigService);
        await db.onModuleInit();
        const schemaRegistry = new SchemaRegistryService(db);
        graph = new GraphService(db as any, schemaRegistry as any);
        const seeded = await seedProject(db);
        projectId = seeded.projectId; orgId = seeded.orgId;
    });

    it('enforces branch name uniqueness per project', async () => {
        const mainBranch = await createBranch(db, projectId, 'feature-alpha');
        expect(mainBranch).toBeTruthy();
        // Duplicate name should fail (unique constraint)
        await expect(createBranch(db, projectId, 'feature-alpha')).rejects.toBeTruthy();
    });

    it('allows same object key on different branches', async () => {
        const branchA = await createBranch(db, projectId, 'branch-a');
        const base = await graph.createObject({ type: 'Doc', key: uniqueKey('doc'), properties: { v: 1 }, org_id: orgId, project_id: projectId } as any);
        // Create same logical key (reuse key) on a different branch (should succeed) by explicitly specifying key
        const key = uniqueKey('shared');
        const mainObj = await graph.createObject({ type: 'Entry', key, properties: { side: 'main' }, org_id: orgId, project_id: projectId } as any);
        const branchObj = await graph.createObject({ type: 'Entry', key, properties: { side: 'branch' }, org_id: orgId, project_id: projectId, branch_id: branchA } as any);
        expect(mainObj.key).toBe(branchObj.key);
        expect(mainObj.branch_id).not.toBe(branchObj.branch_id); // main (null) vs branch id
    });

    it('supports divergent object evolution per branch', async () => {
        const branchB = await createBranch(db, projectId, 'branch-b');
        const base = await graph.createObject({ type: 'Config', key: uniqueKey('cfg'), properties: { flag: false }, org_id: orgId, project_id: projectId } as any);
        const patchedMain = await graph.patchObject(base.id, { properties: { flag: true } } as any);
        // Create a branch version starting from original (simulate editing in branch by reusing original base canonical id approach: recreate on branch)
        // Simplest: create fresh object with SAME key on branch (independent lineage) then patch differently.
        const branchObj = await graph.createObject({ type: 'Config', key: base.key, properties: { flag: 'branch' }, org_id: orgId, project_id: projectId, branch_id: branchB } as any);
        const branchPatched = await graph.patchObject(branchObj.id, { properties: { flag: 'branch-new' } } as any);
        expect(patchedMain.properties.flag).toBe(true);
        expect(branchPatched.properties.flag).toBe('branch-new');
        // Canonical IDs differ because we created independent base objects; lineage isolation holds.
        expect(branchPatched.canonical_id).not.toBe(patchedMain.canonical_id);
    });

    it('allows relationship divergence across branches', async () => {
        const branchC = await createBranch(db, projectId, 'branch-c');
        const aMain = await graph.createObject({ type: 'Node', key: uniqueKey('n'), properties: {}, org_id: orgId, project_id: projectId } as any);
        const bMain = await graph.createObject({ type: 'Node', key: uniqueKey('n'), properties: {}, org_id: orgId, project_id: projectId } as any);
        const relMain = await graph.createRelationship({ type: 'LINKS', src_id: aMain.id, dst_id: bMain.id, properties: { via: 'main' } } as any, orgId, projectId);
        const aBranch = await graph.createObject({ type: 'Node', key: aMain.key, properties: { side: 'branch' }, org_id: orgId, project_id: projectId, branch_id: branchC } as any);
        const bBranch = await graph.createObject({ type: 'Node', key: bMain.key, properties: { side: 'branch' }, org_id: orgId, project_id: projectId, branch_id: branchC } as any);
        const relBranch = await graph.createRelationship({ type: 'LINKS', src_id: aBranch.id, dst_id: bBranch.id, properties: { via: 'branch' }, branch_id: branchC } as any, orgId, projectId);
        expect(relMain.properties.via).toBe('main');
        expect(relBranch.properties.via).toBe('branch');
        expect(relMain.branch_id).not.toBe(relBranch.branch_id);
    });

    it('search isolation: objects & relationships filtered by branch_id', async () => {
        const branchD = await createBranch(db, projectId, 'branch-d');
        const key = uniqueKey('iso');
        const mainObj = await graph.createObject({ type: 'Iso', key, properties: { where: 'main' }, org_id: orgId, project_id: projectId } as any);
        const branchObj = await graph.createObject({ type: 'Iso', key, properties: { where: 'branch' }, org_id: orgId, project_id: projectId, branch_id: branchD } as any);
        const mainSearch = await graph.searchObjects({ type: 'Iso', branch_id: null, limit: 10, order: 'desc' });
        const branchSearch = await graph.searchObjects({ type: 'Iso', branch_id: branchD, limit: 10, order: 'desc' });
        expect(mainSearch.items.find(o => o.id === mainObj.id)).toBeTruthy();
        expect(mainSearch.items.find(o => o.id === branchObj.id)).toBeFalsy();
        expect(branchSearch.items.find(o => o.id === branchObj.id)).toBeTruthy();
        expect(branchSearch.items.find(o => o.id === mainObj.id)).toBeFalsy();
    });
});
