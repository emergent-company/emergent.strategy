import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeAll } from 'vitest';
import { Module } from '@nestjs/common';
import { GraphModule } from '../../../src/modules/graph/graph.module';
import { DatabaseModule } from '../../../src/common/database/database.module';
import { AppConfigModule } from '../../../src/common/config/config.module';
import { AppConfigService } from '../../../src/common/config/config.service';
import { DatabaseService } from '../../../src/common/database/database.service';
import { GraphVectorSearchService } from '../../../src/modules/graph/graph-vector-search.service';
import { v4 as uuid } from 'uuid';
// Shared deterministic vector helpers
import { baseVec } from '../../utils/vector-helpers';
import { DummySha256EmbeddingProvider } from '../../../src/modules/graph/embedding.provider';
import { GoogleVertexEmbeddingProvider } from '../../../src/modules/graph/google-vertex-embedding.provider';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { EmbeddingJobsService } from '../../../src/modules/graph/embedding-jobs.service';

// Stub to avoid TypeRegistryModule's repository creation
@Module({
  providers: [
    {
      provide: 'TypeRegistryService',
      useValue: {
        getTypeRegistry: () => Promise.resolve([]),
        createTypeRegistry: () => Promise.resolve({}),
      },
    },
  ],
  exports: ['TypeRegistryService'],
})
class StubTypeRegistryModule {}

// Stub to avoid GraphModule's repository creation
@Module({
  imports: [AppConfigModule],
  providers: [
    { provide: GraphService, useValue: {} },
    { provide: EmbeddingJobsService, useValue: {} },
    { provide: GraphVectorSearchService, useValue: {} },
    {
      provide: 'EMBEDDING_PROVIDER',
      useFactory: (config: AppConfigService) => {
        const provider = process.env.EMBEDDING_PROVIDER || 'unset';
        if (provider === 'dummy') return new DummySha256EmbeddingProvider();
        if (provider === 'vertex' || provider === 'google')
          return new GoogleVertexEmbeddingProvider(config);
        return new DummySha256EmbeddingProvider();
      },
      inject: [AppConfigService],
    },
  ],
  exports: ['EMBEDDING_PROVIDER'],
})
class StubGraphModule {}

async function ensureOrgProject(db: DatabaseService) {
  const org = await db.query<{ id: string }>('SELECT id FROM kb.orgs LIMIT 1');
  let orgId = org.rowCount ? org.rows[0].id : undefined;
  if (!orgId) {
    const res = await db.query<{ id: string }>(
      `INSERT INTO kb.orgs(name) VALUES('test-org') RETURNING id`
    );
    orgId = res.rows[0].id;
  }
  const proj = await db.query<{ id: string }>(
    'SELECT id FROM kb.projects LIMIT 1'
  );
  let projectId = proj.rowCount ? proj.rows[0].id : undefined;
  if (!projectId) {
    const res = await db.query<{ id: string }>(
      `INSERT INTO kb.projects(organization_id, name) VALUES($1,'test-project') RETURNING id`,
      [orgId]
    );
    projectId = res.rows[0].id;
  }
  return { orgId: orgId!, projectId: projectId! };
}

async function insertObject(
  db: DatabaseService,
  vec: number[],
  type: string
): Promise<string> {
  const { orgId, projectId } = await ensureOrgProject(db);
  const id = uuid();
  const literal = '[' + vec.join(',') + ']';
  await db.query(
    `INSERT INTO kb.graph_objects(id, organization_id, project_id, type, key, properties, embedding_vec, canonical_id, version) VALUES ($1,$2,$3,$4,$5,'{}',$6::vector,$1,1)`,
    [id, orgId, projectId, type, type.toLowerCase() + '-key', literal]
  );
  return id;
}

describe('GraphVectorSearchService', () => {
  let db: DatabaseService;
  let svc: GraphVectorSearchService;

  beforeAll(async () => {
    process.env.DB_AUTOINIT = 'true';

    const { TypeRegistryModule } = await import(
      '../../../src/modules/type-registry/type-registry.module'
    );
    const mod = await Test.createTestingModule({
      imports: [DatabaseModule, AppConfigModule, GraphModule],
    })
      .overrideModule(TypeRegistryModule)
      .useModule(StubTypeRegistryModule)
      .overrideModule(GraphModule)
      .useModule(StubGraphModule)
      .compile();
    db = mod.get(DatabaseService);
    svc = mod.get(GraphVectorSearchService);
  });

  it('returns nearest neighbors in ascending distance order', async () => {
    if (!db.isOnline()) return; // skip if DB offline via SKIP_DB
    const col = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='kb' AND table_name='graph_objects' AND column_name='embedding_vec') as exists`
    );
    if (!col.rowCount || !col.rows[0].exists) return; // skip silently
    const a = await insertObject(db, baseVec(), 'TestA');
    const b = await insertObject(
      db,
      (() => {
        const v = baseVec();
        v[0] = 0.1;
        return v;
      })(),
      'TestB'
    );
    const c = await insertObject(
      db,
      (() => {
        const v = baseVec();
        v[0] = 0.2;
        return v;
      })(),
      'TestC'
    );
    const results = await svc.searchByVector(baseVec(), { limit: 3 });
    expect(results.length).toBeGreaterThanOrEqual(3);
    const order = results.slice(0, 3).map((r) => r.id);
    expect(order[0]).toBe(a);
    expect(order[1]).toBe(b);
    expect(order[2]).toBe(c);
  });

  it('applies type filter', async () => {
    if (!db.isOnline()) return;
    const a = await insertObject(db, baseVec(), 'TypeFilterA');
    await insertObject(db, baseVec(), 'TypeFilterB');
    const res = await svc.searchByVector(baseVec(), {
      limit: 10,
      type: 'TypeFilterA',
    });
    expect(res.find((r) => r.id === a)).toBeTruthy();
    const anyB = await db.query<{ id: string }>(
      `SELECT id FROM kb.graph_objects WHERE type='TypeFilterB'`
    );
    if (anyB.rowCount) {
      const present = res.some((r) => anyB.rows.some((x) => x.id === r.id));
      expect(present).toBe(false);
    }
  });

  it('applies labelsAll containment and labelsAny overlap filters', async () => {
    if (!db.isOnline()) return;
    const ids = await ensureOrgProject(db);
    const baseLiteral = '[' + baseVec().join(',') + ']';
    const idAll = uuid();
    await db.query(
      `INSERT INTO kb.graph_objects(id, organization_id, project_id, type, key, labels, properties, embedding_vec, canonical_id, version) VALUES ($1,$2,$3,'LabType','lab-all','$4','{}',$5::vector,$1,1)`,
      [
        idAll,
        ids.orgId,
        ids.projectId,
        ['alpha', 'beta', 'shared'],
        baseLiteral,
      ]
    );
    const idAny = uuid();
    await db.query(
      `INSERT INTO kb.graph_objects(id, organization_id, project_id, type, key, labels, properties, embedding_vec, canonical_id, version) VALUES ($1,$2,$3,'LabType','lab-any','$4','{}',$5::vector,$1,1)`,
      [idAny, ids.orgId, ids.projectId, ['gamma', 'shared'], baseLiteral]
    );
    const contain = await svc.searchByVector(baseVec(), {
      limit: 10,
      labelsAll: ['alpha', 'shared'],
    });
    expect(contain.find((r) => r.id === idAll)).toBeTruthy();
    expect(contain.find((r) => r.id === idAny)).toBeFalsy();
    const overlap = await svc.searchByVector(baseVec(), {
      limit: 10,
      labelsAny: ['gamma', 'zzz'],
    });
    expect(overlap.find((r) => r.id === idAny)).toBeTruthy();
    const none = await svc.searchByVector(baseVec(), {
      limit: 10,
      labelsAny: ['nope'],
    });
    expect(none.find((r) => r.id === idAny)).toBeFalsy();
  });

  it('applies keyPrefix filter', async () => {
    if (!db.isOnline()) return;
    const baseLiteral2 = '[' + baseVec().join(',') + ']';
    const id1 = uuid();
    await db.query(
      `INSERT INTO kb.graph_objects(id, organization_id, project_id, type, key, properties, embedding_vec, canonical_id, version) VALUES ($1,NULL,NULL,'KeyType','pref-123','{}',$2::vector,$1,1)`,
      [id1, baseLiteral2]
    );
    const id2 = uuid();
    await db.query(
      `INSERT INTO kb.graph_objects(id, organization_id, project_id, type, key, properties, embedding_vec, canonical_id, version) VALUES ($1,NULL,NULL,'KeyType','other-123','{}',$2::vector,$1,1)`,
      [id2, baseLiteral2]
    );
    const res = await svc.searchByVector(baseVec(), {
      limit: 10,
      keyPrefix: 'pref-',
    });
    expect(res.find((r) => r.id === id1)).toBeTruthy();
    expect(res.find((r) => r.id === id2)).toBeFalsy();
  });

  it('applies distance threshold via minScore/maxDistance alias', async () => {
    if (!db.isOnline()) return;
    // Construct three vectors with growing cosine distance from query (baseVec)
    // baseVec distance to itself ~0
    const near = await insertObject(db, baseVec(), 'DistNear');
    // Slightly different first component -> small distance
    const midVec = (() => {
      const v = baseVec();
      v[0] = 0.1;
      return v;
    })();
    const mid = await insertObject(db, midVec, 'DistMid');
    // Orthogonal-ish vector: put epsilon at second index only
    const farVec = (() => {
      const v = Array(32).fill(0);
      v[1] = 1;
      return v;
    })();
    const far = await insertObject(db, farVec, 'DistFar');

    const all = await svc.searchByVector(baseVec(), { limit: 10 });
    const idxNear = all.findIndex((r) => r.id === near);
    const idxMid = all.findIndex((r) => r.id === mid);
    const idxFar = all.findIndex((r) => r.id === far);
    expect(idxNear).toBeGreaterThanOrEqual(0);
    expect(idxMid).toBeGreaterThan(idxNear);
    expect(idxFar).toBeGreaterThan(idxMid);

    // Use a tight threshold (maxDistance alias) to include only near & mid
    // Cosine distance between base(eps) and modified first component 0.1 should be small (<0.2) while far should be ~1.
    const filtered = await svc.searchByVector(baseVec(), {
      limit: 10,
      minScore: 0.2,
    }); // legacy param meaning max allowed distance
    expect(filtered.find((r) => r.id === near)).toBeTruthy();
    expect(filtered.find((r) => r.id === mid)).toBeTruthy();
    expect(filtered.find((r) => r.id === far)).toBeFalsy();

    // Now apply stricter threshold using preferred alias maxDistance (service now supports it directly)
    const strict = await svc.searchByVector(baseVec(), {
      limit: 10,
      maxDistance: 0.05,
      minScore: 0.5,
    }); // maxDistance must override minScore
    expect(strict.find((r) => r.id === near)).toBeTruthy();
    expect(strict.find((r) => r.id === mid)).toBeFalsy(); // mid excluded by tighter maxDistance
    expect(strict.find((r) => r.id === far)).toBeFalsy();
  });

  it('treats maxDistance as precedence over minScore when both supplied', async () => {
    if (!db.isOnline()) return;
    const v1 = await insertObject(db, baseVec(), 'AliasPrecBase');
    const v2 = await insertObject(
      db,
      (() => {
        const v = baseVec();
        v[0] = 0.06;
        return v;
      })(),
      'AliasPrecMid'
    );
    const all = await svc.searchByVector(baseVec(), { limit: 10 });
    expect(all.find((r) => r.id === v1)).toBeTruthy();
    expect(all.find((r) => r.id === v2)).toBeTruthy();
    // Provide minScore large but maxDistance tight so mid should be excluded
    const filtered = await svc.searchByVector(baseVec(), {
      limit: 10,
      minScore: 0.5,
      maxDistance: 0.05,
    });
    expect(filtered.find((r) => r.id === v1)).toBeTruthy();
    expect(filtered.find((r) => r.id === v2)).toBeFalsy();
  });

  it('returns empty array for zero-dimension query vector', async () => {
    if (!db.isOnline()) return;
    const res = await svc.searchByVector([], {} as any);
    expect(res.length).toBe(0);
  });

  it('applies orgId + projectId filters together', async () => {
    if (!db.isOnline()) return;
    const orgA = (
      await db.query<{ id: string }>(
        `INSERT INTO kb.orgs(name) VALUES($1) RETURNING id`,
        ['org-filter-a-' + uuid().slice(0, 8)]
      )
    ).rows[0].id;
    const projA = (
      await db.query<{ id: string }>(
        `INSERT INTO kb.projects(organization_id,name) VALUES($1,$2) RETURNING id`,
        [orgA, 'proj-filter-a-' + uuid().slice(0, 8)]
      )
    ).rows[0].id;
    const orgB = (
      await db.query<{ id: string }>(
        `INSERT INTO kb.orgs(name) VALUES($1) RETURNING id`,
        ['org-filter-b-' + uuid().slice(0, 8)]
      )
    ).rows[0].id;
    const projB = (
      await db.query<{ id: string }>(
        `INSERT INTO kb.projects(organization_id,name) VALUES($1,$2) RETURNING id`,
        [orgB, 'proj-filter-b-' + uuid().slice(0, 8)]
      )
    ).rows[0].id;
    const vecLiteral = '[' + baseVec().join(',') + ']';
    const idA = uuid();
    await db.query(
      `INSERT INTO kb.graph_objects(id, organization_id, project_id, type, key, properties, embedding_vec, canonical_id, version) VALUES ($1,$2,$3,'OrgProjType','a-key','{}',$4::vector,$1,1)`,
      [idA, orgA, projA, vecLiteral]
    );
    const idB = uuid();
    await db.query(
      `INSERT INTO kb.graph_objects(id, organization_id, project_id, type, key, properties, embedding_vec, canonical_id, version) VALUES ($1,$2,$3,'OrgProjType','b-key','{}',$4::vector,$1,1)`,
      [idB, orgB, projB, vecLiteral]
    );
    const filtered = await svc.searchByVector(baseVec(), {
      limit: 10,
      orgId: orgA,
      projectId: projA,
    });
    expect(filtered.find((r) => r.id === idA)).toBeTruthy();
    expect(filtered.find((r) => r.id === idB)).toBeFalsy();
  });
});
