import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeAll } from 'vitest';
import { GraphModule } from './graph.module';
import { DatabaseModule } from '../../common/database/database.module';
import { AppConfigModule } from '../../common/config/config.module';
import { DatabaseService } from '../../common/database/database.service';
import { GraphVectorSearchService } from './graph-vector-search.service';
import { v4 as uuid } from 'uuid';

// NOTE: Avoid true zero-norm vectors for cosine distance; pgvector cannot compute cosine similarity with a zero vector.
// We add a tiny epsilon (1e-6) in first dimension for base vectors used in ordering tests.
const EPS = 0.000001;
function baseVec(): number[] { const v = Array(32).fill(0).map(() => 0 as number); v[0] = EPS; return v; }

// Helper to create simple objects with provided vector for deterministic ordering.
async function ensureOrgProject(db: DatabaseService) {
    const org = await db.query<{ id: string }>('SELECT id FROM kb.orgs LIMIT 1');
    let orgId = org.rowCount ? org.rows[0].id : undefined;
    if (!orgId) {
        const res = await db.query<{ id: string }>(`INSERT INTO kb.orgs(name) VALUES('test-org') RETURNING id`);
        orgId = res.rows[0].id;
    }
    const proj = await db.query<{ id: string }>('SELECT id FROM kb.projects LIMIT 1');
    let projectId = proj.rowCount ? proj.rows[0].id : undefined;
    if (!projectId) {
        const res = await db.query<{ id: string }>(`INSERT INTO kb.projects(organization_id, name) VALUES($1,'test-project') RETURNING id`, [orgId]);
        projectId = res.rows[0].id;
    }
    return { orgId: orgId!, projectId: projectId! };
}

async function insertObject(db: DatabaseService, vec: number[], type: string): Promise<string> {
    const { orgId, projectId } = await ensureOrgProject(db);
    const id = uuid();
    const literal = '[' + vec.join(',') + ']';
    await db.query(`INSERT INTO kb.graph_objects(id, organization_id, project_id, type, key, properties, embedding_vec, canonical_id, version) VALUES ($1,$2,$3,$4,$5,'{}',$6::vector,$1,1)`, [id, orgId, projectId, type, type.toLowerCase() + '-key', literal]);
    return id;
}

describe('GraphVectorSearchService', () => {
    let db: DatabaseService;
    let svc: GraphVectorSearchService;
    let orgId: string; let projectId: string;

    beforeAll(async () => {
        process.env.DB_AUTOINIT = 'true';
        const mod = await Test.createTestingModule({
            imports: [DatabaseModule, AppConfigModule, GraphModule],
        }).compile();
        db = mod.get(DatabaseService);
        svc = mod.get(GraphVectorSearchService);
    });

    it('returns nearest neighbors in ascending distance order', async () => {
        if (!db.isOnline()) return; // skip if DB offline via SKIP_DB
        // Check column existence; skip if missing (older PG without pgvector)
        const col = await db.query<{ exists: boolean }>(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='kb' AND table_name='graph_objects' AND column_name='embedding_vec') as exists`);
        if (!col.rowCount || !col.rows[0].exists) {
            return; // silently skip
        }
        // Seed three vectors around query baseline epsilon vector
        const a = await insertObject(db, baseVec(), 'TestA');
        const b = await insertObject(db, (() => { const v = baseVec(); v[0] = 0.1; return v; })(), 'TestB');
        const c = await insertObject(db, (() => { const v = baseVec(); v[0] = 0.2; return v; })(), 'TestC');
        const results = await svc.searchByVector(baseVec(), { limit: 3 });
        expect(results.length).toBeGreaterThanOrEqual(3);
        const order = results.slice(0, 3).map(r => r.id);
        // Expect perfect zero first (a), then b (0.1), then c (0.2)
        expect(order[0]).toBe(a);
        expect(order[1]).toBe(b);
        expect(order[2]).toBe(c);
    });

    it('applies type filter', async () => {
        if (!db.isOnline()) return;
        const a = await insertObject(db, baseVec(), 'TypeFilterA');
        await insertObject(db, baseVec(), 'TypeFilterB');
        const res = await svc.searchByVector(baseVec(), { limit: 10, type: 'TypeFilterA' });
        expect(res.find(r => r.id === a)).toBeTruthy();
        // Ensure no TypeFilterB present
        const anyB = await db.query<{ id: string }>(`SELECT id FROM kb.graph_objects WHERE type='TypeFilterB'`);
        if (anyB.rowCount) {
            const present = res.some(r => anyB.rows.some(x => x.id === r.id));
            expect(present).toBe(false);
        }
    });

    it('applies labelsAll containment and labelsAny overlap filters', async () => {
        if (!db.isOnline()) return;
        const { orgId: o, projectId: p } = await ensureOrgProject(db); orgId = o; projectId = p;
        const baseLiteral = '[' + baseVec().join(',') + ']';
        const idAll = uuid();
        await db.query(`INSERT INTO kb.graph_objects(id, organization_id, project_id, type, key, labels, properties, embedding_vec, canonical_id, version) VALUES ($1,$2,$3,'LabType','lab-all','$4','{}',$5::vector,$1,1)`, [idAll, orgId, projectId, ['alpha', 'beta', 'shared'], baseLiteral]);
        const idAny = uuid();
        await db.query(`INSERT INTO kb.graph_objects(id, organization_id, project_id, type, key, labels, properties, embedding_vec, canonical_id, version) VALUES ($1,$2,$3,'LabType','lab-any','$4','{}',$5::vector,$1,1)`, [idAny, orgId, projectId, ['gamma', 'shared'], baseLiteral]);
        const contain = await svc.searchByVector(baseVec(), { limit: 10, labelsAll: ['alpha', 'shared'] });
        expect(contain.find(r => r.id === idAll)).toBeTruthy();
        expect(contain.find(r => r.id === idAny)).toBeFalsy();
        const overlap = await svc.searchByVector(baseVec(), { limit: 10, labelsAny: ['gamma', 'zzz'] });
        expect(overlap.find(r => r.id === idAny)).toBeTruthy();
        const none = await svc.searchByVector(baseVec(), { limit: 10, labelsAny: ['nope'] });
        expect(none.find(r => r.id === idAny)).toBeFalsy();
    });

    it('applies keyPrefix filter', async () => {
        if (!db.isOnline()) return;
        const baseLiteral2 = '[' + baseVec().join(',') + ']';
        const id1 = uuid();
        await db.query(`INSERT INTO kb.graph_objects(id, organization_id, project_id, type, key, properties, embedding_vec, canonical_id, version) VALUES ($1,NULL,NULL,'KeyType','pref-123','{}',$2::vector,$1,1)`, [id1, baseLiteral2]);
        const id2 = uuid();
        await db.query(`INSERT INTO kb.graph_objects(id, organization_id, project_id, type, key, properties, embedding_vec, canonical_id, version) VALUES ($1,NULL,NULL,'KeyType','other-123','{}',$2::vector,$1,1)`, [id2, baseLiteral2]);
        const res = await svc.searchByVector(baseVec(), { limit: 10, keyPrefix: 'pref-' });
        expect(res.find(r => r.id === id1)).toBeTruthy();
        expect(res.find(r => r.id === id2)).toBeFalsy();
    });
});
