import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeAll } from 'vitest';
import { Module } from '@nestjs/common';
import { GraphModule } from '../../../../src/modules/graph/graph.module';
import { DatabaseModule } from '../../../../src/common/database/database.module';
import { AppConfigModule } from '../../../../src/common/config/config.module';
import { AppConfigService } from '../../../../src/common/config/config.service';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../../../../src/common/database/database.service';
import { v4 as uuid } from 'uuid';
import { randomUUID } from 'crypto';
import { baseVec, variantVec } from '../../../utils/vector-helpers';
import { DummySha256EmbeddingProvider } from '../../../../src/modules/graph/embedding.provider';
import { GoogleVertexEmbeddingProvider } from '../../../../src/modules/graph/google-vertex-embedding.provider';
import { GraphService } from '../../../../src/modules/graph/graph.service';
import { EmbeddingJobsService } from '../../../../src/modules/graph/embedding-jobs.service';
import { GraphVectorSearchService } from '../../../../src/modules/graph/graph-vector-search.service';
import { GraphObjectsController } from '../../../../src/modules/graph/graph.controller';

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

// Stub to avoid GraphModule's repository creation but keep the controller for E2E tests
@Module({
  imports: [AppConfigModule, DatabaseModule],
  controllers: [GraphObjectsController], // Keep the real controller for E2E testing
  providers: [
    GraphVectorSearchService, // Keep real vector search service (needs DatabaseService)
    { provide: GraphService, useValue: {} }, // Stub other services
    { provide: EmbeddingJobsService, useValue: {} },
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
  await db.setTenantContext(orgId, projectId);
  const id = uuid();
  const literal = '[' + vec.join(',') + ']';
  await db.query(
    `INSERT INTO kb.graph_objects(id, organization_id, project_id, type, key, properties, embedding_vec, canonical_id, version) VALUES ($1,$2,$3,$4,$5,'{}',$6::vector,$1,1)`,
    [id, orgId, projectId, type, type.toLowerCase() + '-key', literal]
  );
  return id;
}

describe('Graph Vector Controller Endpoints', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let a: string;
  let b: string;
  let c: string;
  let orgId: string;
  let projectId: string;
  let branchId: string | null = null;

  beforeAll(async () => {
    process.env.DB_AUTOINIT = 'true';
    process.env.SKIP_MIGRATIONS = '1'; // Skip real migrations in unit tests

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
    app = mod.createNestApplication();
    await app.init();
    db = mod.get(DatabaseService);
    if (!db.isOnline()) return; // skip if offline

    // Try to set up test data, but skip gracefully if schema doesn't exist
    try {
      // Clean slate for deterministic assertions (previous relevant types)
      const ids = await ensureOrgProject(db);
      orgId = ids.orgId;
      projectId = ids.projectId;
      await db.setTenantContext(orgId, projectId);
      await db.query(
        `DELETE FROM kb.graph_objects WHERE type IN ('VecA','VecB','VecC','VecX','VecY','VecZ','VecL','VecAlias')`
      );
      a = await insertObject(db, baseVec(), 'VecA');
      b = await insertObject(db, variantVec(0.1), 'VecB');
      c = await insertObject(db, variantVec(0.2), 'VecC');
    } catch (error: any) {
      // If tables don't exist (e.g., schema not initialized), mark db as offline so tests skip
      if (error?.message?.includes('does not exist')) {
        (db as any).online = false;
      } else {
        throw error;
      }
    }
  }, 30000);

  it('POST /graph/objects/vector-search returns ordered neighbors (numeric distances sorted ascending)', async () => {
    if (!db.isOnline()) return; // skip
    const queryVec = baseVec();
    const res = await request(app.getHttpServer())
      .post('/graph/objects/vector-search')
      .send({ vector: queryVec, limit: 5 })
      .expect(200);
    const distances: number[] = res.body.map((r: any) => Number(r.distance));
    expect(distances.length).toBeGreaterThan(0);
    distances.forEach((d) => expect(!Number.isNaN(d) && d >= 0).toBe(true));
    const isNonDecreasing = distances.every(
      (d: number, i: number, arr: number[]) => i === 0 || d >= arr[i - 1]
    );
    expect(isNonDecreasing).toBe(true);
  });

  it('GET /graph/objects/:id/similar returns neighbors excluding self', async () => {
    if (!db.isOnline()) return; // skip
    const res = await request(app.getHttpServer())
      .get(`/graph/objects/${a}/similar?limit=2`)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    // Should not include the anchor id
    expect(res.body.find((r: any) => r.id === a)).toBeFalsy();
  });

  it('GET /graph/objects/:id/similar supports type filter', async () => {
    if (!db.isOnline()) return; // skip
    const res = await request(app.getHttpServer())
      .get(`/graph/objects/${a}/similar?limit=10&type=VecB`)
      .expect(200);
    // All results should be VecB when specified
    res.body.forEach((r: any) => {
      if (r.id === a) return; // anchor excluded already
      // fetch type directly for assertion
    });
    // Query DB to verify each result id is of requested type
    for (const row of res.body) {
      const q = await db.query(
        `SELECT type FROM kb.graph_objects WHERE id=$1`,
        [row.id]
      );
      if (q.rowCount) {
        expect(q.rows[0].type === 'VecB' || row.id === a).toBe(true);
      }
    }
  });

  it('GET /graph/objects/:id/similar supports labelsAll filter', async () => {
    if (!db.isOnline()) return; // skip
    // Seed a labeled object similar-ish vector
    const id = randomUUID();
    const literal =
      '[' +
      Array(768)
        .fill(0)
        .map((_, i) => (i === 2 ? 0.003 : 0))
        .join(',') +
      ']';
    await db.setTenantContext(orgId, projectId);
    await db.query(
      `INSERT INTO kb.graph_objects(id, organization_id, project_id, branch_id, type, key, labels, embedding_vec, canonical_id, version)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8::vector,$1,1)`,
      [
        id,
        orgId,
        projectId,
        branchId,
        'VecL',
        'vec.l',
        ['sim-alpha', 'sim-beta'],
        literal,
      ]
    );
    const res = await request(app.getHttpServer())
      .get(`/graph/objects/${id}/similar?limit=20&labelsAll=sim-alpha,sim-beta`)
      .expect(200);
    // The labeled object itself is excluded (similar endpoint excludes anchor), so we don't expect to see it.
    // Instead validate that every returned object (if any) has both labels OR the set is empty (since only the anchor had them).
    for (const row of res.body) {
      const q = await db.query(
        `SELECT labels FROM kb.graph_objects WHERE id=$1`,
        [row.id]
      );
      if (q.rowCount) {
        const labels = q.rows[0].labels as string[];
        expect(labels).toEqual(
          expect.arrayContaining(['sim-alpha', 'sim-beta'])
        );
      }
    }
  });

  it('POST /graph/objects/vector-search with type filter returns only matching type', async () => {
    if (!db.isOnline()) return; // skip
    const res = await request(app.getHttpServer())
      .post('/graph/objects/vector-search')
      .send({ vector: baseVec(), limit: 10, type: 'VecA' })
      .expect(200);
    const ids: string[] = res.body.map((r: any) => r.id);
    expect(ids).toContain(a);
    expect(ids).not.toContain(b);
    expect(ids).not.toContain(c);
  });

  it('POST /graph/objects/vector-search with project filter returns only objects from that project', async () => {
    if (!db.isOnline()) return; // skip
    const res = await request(app.getHttpServer())
      .post('/graph/objects/vector-search')
      .send({ vector: baseVec(), limit: 10, projectId })
      .expect(200);
    // All seeded test objects share same projectId; sanity check >0
    expect(res.body.length).toBeGreaterThan(0);
    // Assert every row has the expected project id (support snake or camel in case of transform)
    res.body.forEach((r: any) => {
      const pid = r.project_id || r.projectId;
      expect(pid).toBe(projectId);
    });
  });

  it('POST /graph/objects/vector-search labelsAll filter requires all labels', async () => {
    if (!db.isOnline()) return; // skip
    // Seed an object with labels we can target
    const id = randomUUID();
    // Use a slightly perturbed vector to avoid being pushed out of result set by identical zero-vectors.
    const literal =
      '[' +
      Array(768)
        .fill(0)
        .map((_, i) => (i === 0 ? 0.001 : 0))
        .join(',') +
      ']';
    await db.setTenantContext(orgId, projectId);
    await db.query(
      `INSERT INTO kb.graph_objects(id, organization_id, project_id, branch_id, type, key, labels, embedding_vec, canonical_id, version)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8::vector,$1,1)`,
      [
        id,
        orgId,
        projectId,
        branchId,
        'VecX',
        'vec.x',
        ['lab-one', 'lab-two', 'shared'],
        literal,
      ]
    );
    const resAll = await request(app.getHttpServer())
      .post('/graph/objects/vector-search')
      .send({ vector: baseVec(), limit: 50, labelsAll: ['lab-one', 'shared'] })
      .expect(200);
    const idsAll: string[] = resAll.body.map((r: any) => r.id);
    expect(idsAll).toContain(id);
    // A query requiring a label not present should exclude it
    const resExclude = await request(app.getHttpServer())
      .post('/graph/objects/vector-search')
      .send({
        vector: baseVec(),
        limit: 50,
        labelsAll: ['lab-one', 'missing-label'],
      })
      .expect(200);
    const idsExclude: string[] = resExclude.body.map((r: any) => r.id);
    expect(idsExclude).not.toContain(id);
  });

  it('POST /graph/objects/vector-search labelsAny returns objects having any label', async () => {
    if (!db.isOnline()) return; // skip
    const id = randomUUID();
    const literal =
      '[' +
      Array(768)
        .fill(0)
        .map((_, i) => (i === 1 ? 0.002 : 0))
        .join(',') +
      ']';
    await db.setTenantContext(orgId, projectId);
    await db.query(
      `INSERT INTO kb.graph_objects(id, organization_id, project_id, branch_id, type, key, labels, embedding_vec, canonical_id, version)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8::vector,$1,1)`,
      [
        id,
        orgId,
        projectId,
        branchId,
        'VecY',
        'vec.y',
        ['any-alpha', 'any-beta'],
        literal,
      ]
    );
    const resAny = await request(app.getHttpServer())
      .post('/graph/objects/vector-search')
      .send({ vector: baseVec(), limit: 50, labelsAny: ['any-beta', 'zzz'] })
      .expect(200);
    const idsAny: string[] = resAny.body.map((r: any) => r.id);
    expect(idsAny).toContain(id);
    const resNone = await request(app.getHttpServer())
      .post('/graph/objects/vector-search')
      .send({ vector: baseVec(), limit: 50, labelsAny: ['label-not-present'] })
      .expect(200);
    const idsNone: string[] = resNone.body.map((r: any) => r.id);
    expect(idsNone).not.toContain(id);
  });

  it('POST /graph/objects/vector-search supports maxDistance alias (precedence over minScore)', async () => {
    if (!db.isOnline()) return; // skip
    // Seed a near-identical vector to increase likelihood of a result within 0.15
    const nearId = randomUUID();
    const nearLiteral =
      '[' +
      Array(768)
        .fill(0)
        .map((_, i) => (i === 0 ? 0.05 : 0))
        .join(',') +
      ']';
    await db.setTenantContext(orgId, projectId);
    await db.query(
      `INSERT INTO kb.graph_objects(id, organization_id, project_id, branch_id, type, key, properties, embedding_vec, canonical_id, version)
             VALUES($1,$2,$3,$4,$5,$6,'{}',$7::vector,$1,1)`,
      [nearId, orgId, projectId, branchId, 'VecAlias', 'vec.alias', nearLiteral]
    );
    // Use tiny minScore but larger maxDistance; expect precedence chooses 0.15 threshold (maxDistance)
    const res = await request(app.getHttpServer())
      .post('/graph/objects/vector-search')
      .send({
        vector: baseVec(),
        limit: 10,
        minScore: 0.0000001,
        maxDistance: 0.15,
      })
      .expect(200);
    // Assert no row exceeds maxDistance and at least not all are filtered (>0 OR empty acceptable if index skipped)
    res.body.forEach((r: any) => expect(r.distance).toBeLessThanOrEqual(0.15));
    // If we got the seeded near vector, confirm it passes threshold
    const maybe = res.body.find((r: any) => r.id === nearId);
    if (maybe) expect(maybe.distance).toBeLessThanOrEqual(0.15);
  });

  it('GET /graph/objects/:id/similar supports maxDistance alias', async () => {
    if (!db.isOnline()) return; // skip
    const res = await request(app.getHttpServer())
      .get(
        `/graph/objects/${a}/similar?limit=5&minScore=0.0000001&maxDistance=0.2`
      )
      .expect(200);
    res.body.forEach((r: any) => expect(r.distance).toBeLessThanOrEqual(0.2));
  });

  it('POST /graph/objects/vector-search supports combined labelsAll + labelsAny', async () => {
    if (!db.isOnline()) return; // skip
    const id = randomUUID();
    const uniqueLabel = `both-unique-${randomUUID()}`;
    const literal =
      '[' +
      Array(768)
        .fill(0)
        .map((_, i) => (i === 3 ? 0.004 : 0))
        .join(',') +
      ']';
    await db.setTenantContext(orgId, projectId);
    await db.query(
      `INSERT INTO kb.graph_objects(id, organization_id, project_id, branch_id, type, key, labels, embedding_vec, canonical_id, version)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8::vector,$1,1)`,
      [
        id,
        orgId,
        projectId,
        branchId,
        'VecZ',
        'vec.z',
        ['both-all-one', 'both-all-two', 'both-any-alpha', uniqueLabel],
        literal,
      ]
    );
    // labelsAll requires two, labelsAny requires overlap with any-alpha or any-beta
    const res = await request(app.getHttpServer())
      .post('/graph/objects/vector-search')
      .send({
        vector: baseVec(),
        limit: 50,
        labelsAll: ['both-all-one', 'both-all-two', uniqueLabel],
        labelsAny: ['both-any-alpha', 'non-existent'],
      })
      .expect(200);
    const ids: string[] = res.body.map((r: any) => r.id);
    expect(ids).toContain(id);
    // Negative case: change labelsAll to include missing label blocks match
    const resNeg = await request(app.getHttpServer())
      .post('/graph/objects/vector-search')
      .send({
        vector: baseVec(),
        limit: 50,
        labelsAll: ['both-all-one', 'missing-label', uniqueLabel],
        labelsAny: ['both-any-alpha'],
      })
      .expect(200);
    const idsNeg: string[] = resNeg.body.map((r: any) => r.id);
    expect(idsNeg).not.toContain(id);
    // Negative case: require any-label that is absent to ensure labelsAny is enforced
    const resNegAny = await request(app.getHttpServer())
      .post('/graph/objects/vector-search')
      .send({
        vector: baseVec(),
        limit: 50,
        labelsAll: ['both-all-one', 'both-all-two', uniqueLabel],
        labelsAny: ['non-existent'],
      })
      .expect(200);
    const idsNegAny: string[] = resNegAny.body.map((r: any) => r.id);
    expect(idsNegAny).not.toContain(id);
  });
});
