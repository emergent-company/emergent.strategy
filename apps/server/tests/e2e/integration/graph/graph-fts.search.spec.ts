import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { GraphModule } from '../../../../src/modules/graph/../graph/graph.module';
import { DatabaseModule } from '../../../../src/common/database/database.module';
import { AppConfigModule } from '../../../../src/common/config/config.module';
import { GraphService } from '../../../../src/modules/graph/../graph/graph.service';

// Basic FTS search tests verifying ranking & filtering using inline-populated tsvector.
// Relies on autoInit to build schema in test mode.

describe('Graph FTS Search', () => {
  let service: GraphService;
  let db: any;

  let orgId: string;
  let projectId: string;
  beforeAll(async () => {
    process.env.DB_AUTOINIT = '1';
    process.env.SKIP_MIGRATIONS = '1'; // Skip real migrations in unit tests
    process.env.NODE_ENV = 'test';
    const mod = await Test.createTestingModule({
      imports: [AppConfigModule, DatabaseModule, GraphModule],
    }).compile();
    service = mod.get(GraphService);
    db = (service as any).db;
    // Seed org + project (minimal schema path creates tables)
    await db.setTenantContext(null, null);
    const resOrg = await db.query(
      `INSERT INTO kb.orgs(name) VALUES ('fts_test_org') ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id`
    );
    orgId = resOrg.rows[0].id;
    const resProj = await db.query(
      `INSERT INTO kb.projects(organization_id, name) VALUES ($1,'fts_test_project') ON CONFLICT(organization_id, lower(name)) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [orgId]
    );
    projectId = resProj.rows[0].id;
  });

  beforeEach(async () => {
    await db.setTenantContext(null, null);
  });

  it('returns ranked matches for query term', async () => {
    const base = { organization_id: orgId, project_id: projectId } as any;
    const uniqueToken =
      'tok_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).slice(2, 6);
    const suffix = uniqueToken;
    // Clean prior docs with this random key prefix just in case (likely none)
    await (service as any).db.query(
      `DELETE FROM kb.graph_objects WHERE key LIKE $1`,
      ['a_' + suffix + '%']
    );
    await (service as any).db.query(
      `DELETE FROM kb.graph_objects WHERE key LIKE $1`,
      ['b_' + suffix + '%']
    );
    await (service as any).db.query(
      `DELETE FROM kb.graph_objects WHERE key LIKE $1`,
      ['c_' + suffix + '%']
    );
    const a = await service.createObject({
      ...base,
      type: 'doc',
      key: 'a_' + suffix,
      properties: {
        title: 'Alpha Node',
        description: 'Contains unique ' + uniqueToken + ' token',
      },
      labels: ['test'],
    });
    await service.createObject({
      ...base,
      type: 'doc',
      key: 'b_' + suffix,
      properties: {
        title: 'Beta Node',
        description: 'Mentions nothing special',
      },
      labels: ['test'],
    });
    const c = await service.createObject({
      ...base,
      type: 'doc',
      key: 'c_' + suffix,
      properties: {
        title: 'Gamma Node',
        notes: uniqueToken + ' appears twice: ' + uniqueToken,
      },
      labels: ['test'],
    });

    const res = await service.searchObjectsFts({ q: uniqueToken, limit: 15 });
    expect(res.items.length).toBeGreaterThanOrEqual(2);
    // Object c should rank >= a due to two occurrences (heuristic; ts_rank counts frequency)
    const ids = res.items.map((i) => i.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(c.id);
    const rankC = res.items.find((i) => i.id === c.id)!.rank;
    const rankA = res.items.find((i) => i.id === a.id)!.rank;
    expect(rankC).toBeGreaterThanOrEqual(rankA);
  });

  it('applies type filter', async () => {
    await service.createObject({
      organization_id: orgId,
      project_id: projectId,
      type: 'note',
      key: 'n1_' + Date.now().toString(36),
      properties: { body: 'lorem ipsum delta' },
      labels: ['filter'],
    } as any);
    const resAll = await service.searchObjectsFts({ q: 'delta', limit: 5 });
    const resFiltered = await service.searchObjectsFts({
      q: 'delta',
      type: 'note',
      limit: 5,
    });
    expect(resFiltered.items.length).toBeGreaterThan(0);
    // Every item in filtered set should have requested type
    for (const it of resFiltered.items) expect(it.type).toBe('note');
    // Filter should not increase count
    expect(resFiltered.items.length).toBeLessThanOrEqual(resAll.items.length);
  });

  it('returns empty for empty query', async () => {
    const res = await service.searchObjectsFts({ q: '   ', limit: 5 });
    expect(res.items).toHaveLength(0);
  });
});
