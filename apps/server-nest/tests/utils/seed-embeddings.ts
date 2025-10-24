import { DatabaseService } from '../../src/common/database/database.service';
import { v4 as uuid } from 'uuid';

export interface SeedEmbeddingOptions {
    count: number;            // number of objects to insert
    baseVector?: number[];    // optional base vector (length 32)
    variance?: number;        // small value to add per object index (default 0.01)
    typePrefix?: string;      // object type prefix (default 'VecSeed')
    orgId?: string;           // reuse existing org if provided
    projectId?: string;       // reuse existing project if provided
}

export interface SeedEmbeddingResult {
    ids: string[];
    orgId: string;
    projectId: string;
    vectors: number[][];
}

async function ensureOrgProject(db: DatabaseService, orgId?: string, projectId?: string) {
    if (orgId && projectId) return { orgId, projectId };
    const orgRes = await db.query<{ id: string }>('SELECT id FROM kb.orgs LIMIT 1');
    let resolvedOrg = orgRes.rowCount ? orgRes.rows[0].id : undefined;
    if (!resolvedOrg) {
        const ins = await db.query<{ id: string }>(`INSERT INTO kb.orgs(name) VALUES('seed-org') RETURNING id`);
        resolvedOrg = ins.rows[0].id;
    }
    const projRes = await db.query<{ id: string }>('SELECT id FROM kb.projects LIMIT 1');
    let resolvedProj = projRes.rowCount ? projRes.rows[0].id : undefined;
    if (!resolvedProj) {
        const ins = await db.query<{ id: string }>(`INSERT INTO kb.projects(organization_id, name) VALUES($1,'seed-project') RETURNING id`, [resolvedOrg]);
        resolvedProj = ins.rows[0].id;
    }
    return { orgId: resolvedOrg!, projectId: resolvedProj! };
}

/**
 * Inserts deterministic embedding vectors for test robustness.
 * Each vector = baseVector (defaults zero[32]) plus a single dimension perturbation based on index.
 */
export async function seedEmbeddings(db: DatabaseService, opts: SeedEmbeddingOptions): Promise<SeedEmbeddingResult> {
    const { count, baseVector = Array(32).fill(0), variance = 0.01, typePrefix = 'VecSeed' } = opts;
    if (baseVector.length !== 32) throw new Error('baseVector must be length 32');
    const { orgId, projectId } = await ensureOrgProject(db, opts.orgId, opts.projectId);
    const ids: string[] = [];
    const vectors: number[][] = [];
    for (let i = 0; i < count; i++) {
        const id = uuid();
        const vec = baseVector.slice();
        vec[i % 32] = Number((vec[i % 32] + variance * (i + 1)).toFixed(6));
        const literal = '[' + vec.join(',') + ']';
        const type = `${typePrefix}${i + 1}`;
        await db.query(
            `INSERT INTO kb.graph_objects(id, organization_id, project_id, type, key, properties, embedding_vec, canonical_id, version)
       VALUES ($1,$2,$3,$4,$5,'{}',$6::vector,$1,1)`,
            [id, orgId, projectId, type, type.toLowerCase() + '-key', literal]
        );
        ids.push(id);
        vectors.push(vec);
    }
    return { ids, orgId, projectId, vectors };
}
