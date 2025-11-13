import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductVersionService } from '../../../src/modules/graph/product-version.service';

// Reusable error helper
function pgError(code: string, message = code): any {
  return Object.assign(new Error(message), { code });
}

// Fake transactional client
class FakeClient {
  public queries: { text: string; params?: any[] }[] = [];
  constructor(
    private scripts: Array<{ text: RegExp; result?: any; throw?: Error }>
  ) {}
  async query(text: string, params?: any[]) {
    this.queries.push({ text, params });
    const script = this.scripts.find((s) => s.text.test(text));
    if (!script) return { rows: [], rowCount: 0 };
    if (script.throw) throw script.throw;
    return script.result ?? { rows: [], rowCount: 0 };
  }
  release() {}
}

class FakeDb {
  constructor(
    private clientFactory: () => FakeClient,
    private scriptedQueries: Array<{
      text: RegExp;
      result?: any;
      throw?: Error;
    }> = []
  ) {}
  async query<T = any>(text: string, params?: any[]) {
    const script = this.scriptedQueries.find((s) => s.text.test(text));
    if (script) {
      if (script.throw) throw script.throw;
      return script.result ?? ({ rows: [], rowCount: 0 } as any);
    }
    return { rows: [], rowCount: 0 } as any;
  }
  async getClient() {
    return this.clientFactory();
  }
}

// Mock Repository factory
function createMockRepository(methods: Record<string, any> = {}) {
  return {
    findOne: methods.findOne ?? (async () => null),
    find: methods.find ?? (async () => []),
    count: methods.count ?? (async () => 0),
    save: methods.save ?? (async (entity: any) => entity),
    create: methods.create ?? ((data: any) => data),
    update: methods.update ?? (async () => ({ affected: 1 })),
    delete: methods.delete ?? (async () => ({ affected: 1 })),
    createQueryBuilder:
      methods.createQueryBuilder ??
      (() => ({
        where: () => ({
          andWhere: () => ({
            orderBy: () => ({ take: () => ({ getMany: async () => [] }) }),
          }),
        }),
      })),
  };
}

function uuid(n: number) {
  return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
}

describe('ProductVersionService', () => {
  it('create() inserts snapshot and enumerates object heads', async () => {
    const projectId = uuid(1);
    const orgId = uuid(2);
    const client = new FakeClient([
      { text: /BEGIN/ },
      { text: /pg_advisory_xact_lock/ },
      {
        text: /SELECT id FROM kb\.product_versions WHERE project_id/,
        result: { rows: [], rowCount: 0 },
      },
      {
        text: /INSERT INTO kb\.product_versions/,
        result: {
          rows: [
            {
              id: uuid(100),
              organization_id: orgId,
              project_id: projectId,
              name: 'v1.0.0',
              description: 'First release',
              base_product_version_id: null,
              created_at: '2025-01-01T00:00:00Z',
            },
          ],
          rowCount: 1,
        },
      },
      {
        text: /SELECT DISTINCT ON.*canonical_id.*FROM kb\.graph_objects.*WHERE project_id/s,
        result: {
          rows: [
            { canonical_id: uuid(10), id: uuid(11) },
            { canonical_id: uuid(20), id: uuid(21) },
          ],
          rowCount: 2,
        },
      },
      { text: /INSERT INTO kb\.product_version_members/ },
      { text: /COMMIT/ },
    ]);
    const mockProductVersionRepo = createMockRepository();
    const mockMemberRepo = createMockRepository();
    const mockDataSource = {} as any;
    const svc = new ProductVersionService(
      mockProductVersionRepo as any,
      mockMemberRepo as any,
      mockDataSource,
      new FakeDb(() => client) as any
    );
    const result = await svc.create(projectId, {
      name: 'v1.0.0',
      description: 'First release',
    });
    expect(result.id).toBe(uuid(100));
    expect(result.name).toBe('v1.0.0');
    expect(result.description).toBe('First release');
    expect(result.member_count).toBe(2);
    expect(result.base_product_version_id).toBeNull();
    // Ensure membership insert called
    expect(
      client.queries.some((q) =>
        /INSERT INTO kb\.product_version_members/.test(q.text)
      )
    ).toBe(true);
  });

  it('create() rejects duplicate name (case-insensitive)', async () => {
    const projectId = uuid(1);
    const orgId = uuid(2);
    const client = new FakeClient([
      { text: /BEGIN/ },
      { text: /pg_advisory_xact_lock/ },
      {
        text: /SELECT id FROM kb\.product_versions WHERE project_id/,
        result: { rows: [{ id: uuid(99) }], rowCount: 1 },
      },
    ]);
    const mockProductVersionRepo = createMockRepository();
    const mockMemberRepo = createMockRepository();
    const mockDataSource = {} as any;
    const svc = new ProductVersionService(
      mockProductVersionRepo as any,
      mockMemberRepo as any,
      mockDataSource,
      new FakeDb(() => client) as any
    );
    await expect(
      svc.create(projectId, { name: 'Duplicate' })
    ).rejects.toThrow('product_version_name_exists');
  });

  it('create() validates base_product_version_id exists', async () => {
    const projectId = uuid(1);
    const orgId = uuid(2);
    const baseId = uuid(50);
    const client = new FakeClient([
      { text: /BEGIN/ },
      { text: /pg_advisory_xact_lock/ },
      {
        text: /SELECT id FROM kb\.product_versions WHERE project_id.*LOWER/,
        result: { rows: [], rowCount: 0 },
      },
      {
        text: /SELECT id FROM kb\.product_versions WHERE id/,
        result: { rows: [], rowCount: 0 },
      },
    ]);
    const mockProductVersionRepo = createMockRepository();
    const mockMemberRepo = createMockRepository();
    const mockDataSource = {} as any;
    const svc = new ProductVersionService(
      mockProductVersionRepo as any,
      mockMemberRepo as any,
      mockDataSource,
      new FakeDb(() => client) as any
    );
    await expect(
      svc.create(projectId, {
        name: 'v2.0.0',
        base_product_version_id: baseId,
      })
    ).rejects.toThrow('base_product_version_not_found');
  });

  it('create() links base snapshot when provided', async () => {
    const projectId = uuid(1);
    const orgId = uuid(2);
    const baseId = uuid(50);
    const client = new FakeClient([
      { text: /BEGIN/ },
      { text: /pg_advisory_xact_lock/ },
      {
        text: /SELECT id FROM kb\.product_versions WHERE project_id.*LOWER/,
        result: { rows: [], rowCount: 0 },
      },
      {
        text: /SELECT id FROM kb\.product_versions WHERE id/,
        result: { rows: [{ id: baseId }], rowCount: 1 },
      },
      {
        text: /INSERT INTO kb\.product_versions/,
        result: {
          rows: [
            {
              id: uuid(101),
              organization_id: orgId,
              project_id: projectId,
              name: 'v2.0.0',
              description: null,
              base_product_version_id: baseId,
              created_at: '2025-01-02T00:00:00Z',
            },
          ],
          rowCount: 1,
        },
      },
      {
        text: /SELECT DISTINCT ON.*canonical_id.*FROM kb\.graph_objects/s,
        result: {
          rows: [{ canonical_id: uuid(10), id: uuid(12) }],
          rowCount: 1,
        },
      },
      { text: /INSERT INTO kb\.product_version_members/ },
      { text: /COMMIT/ },
    ]);
    const mockProductVersionRepo = createMockRepository();
    const mockMemberRepo = createMockRepository();
    const mockDataSource = {} as any;
    const svc = new ProductVersionService(
      mockProductVersionRepo as any,
      mockMemberRepo as any,
      mockDataSource,
      new FakeDb(() => client) as any
    );
    const result = await svc.create(projectId, {
      name: 'v2.0.0',
      base_product_version_id: baseId,
    });
    expect(result.base_product_version_id).toBe(baseId);
  });

  it('create() handles zero objects gracefully', async () => {
    const projectId = uuid(1);
    const orgId = uuid(2);
    const client = new FakeClient([
      { text: /BEGIN/ },
      { text: /pg_advisory_xact_lock/ },
      {
        text: /SELECT id FROM kb\.product_versions WHERE project_id/,
        result: { rows: [], rowCount: 0 },
      },
      {
        text: /INSERT INTO kb\.product_versions/,
        result: {
          rows: [
            {
              id: uuid(102),
              organization_id: orgId,
              project_id: projectId,
              name: 'empty',
              description: null,
              base_product_version_id: null,
              created_at: '2025-01-03T00:00:00Z',
            },
          ],
          rowCount: 1,
        },
      },
      {
        text: /SELECT DISTINCT ON.*canonical_id.*FROM kb\.graph_objects/s,
        result: { rows: [], rowCount: 0 },
      },
      { text: /COMMIT/ },
    ]);
    const mockProductVersionRepo = createMockRepository();
    const mockMemberRepo = createMockRepository();
    const mockDataSource = {} as any;
    const svc = new ProductVersionService(
      mockProductVersionRepo as any,
      mockMemberRepo as any,
      mockDataSource,
      new FakeDb(() => client) as any
    );
    const result = await svc.create(projectId, { name: 'empty' });
    expect(result.member_count).toBe(0);
    // No membership insert when rowCount is 0
    expect(
      client.queries.some((q) =>
        /INSERT INTO kb\.product_version_members/.test(q.text)
      )
    ).toBe(false);
  });

  it('create() rejects empty name', async () => {
    const projectId = uuid(1);
    const mockProductVersionRepo = createMockRepository();
    const mockMemberRepo = createMockRepository();
    const mockDataSource = {} as any;
    const svc = new ProductVersionService(
      mockProductVersionRepo as any,
      mockMemberRepo as any,
      mockDataSource,
      new FakeDb(() => new FakeClient([])) as any
    );
    await expect(svc.create(projectId, { name: '   ' })).rejects.toThrow(
      'name_required'
    );
  });

  it('get() returns snapshot with member count', async () => {
    const projectId = uuid(1);
    const snapshotId = uuid(100);

    // Mock repository methods for get()
    const mockProductVersionRepo = createMockRepository({
      findOne: async () => ({
        id: snapshotId,
        projectId: projectId,
        name: 'v1.0.0',
        description: 'Release',
        baseProductVersionId: null,
        createdAt: new Date('2025-01-01T00:00:00Z'),
      }),
    });

    const mockMemberRepo = createMockRepository({
      count: async () => 42,
    });

    const mockDataSource = {} as any;
    const svc = new ProductVersionService(
      mockProductVersionRepo as any,
      mockMemberRepo as any,
      mockDataSource,
      new FakeDb(() => new FakeClient([])) as any
    );

    const result = await svc.get(projectId, snapshotId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(snapshotId);
    expect(result!.name).toBe('v1.0.0');
    expect(result!.member_count).toBe(42);
  });

  it('get() returns null when not found', async () => {
    const projectId = uuid(1);
    const snapshotId = uuid(999);

    // Mock repository to return null (not found)
    const mockProductVersionRepo = createMockRepository({
      findOne: async () => null,
    });

    const mockMemberRepo = createMockRepository();
    const mockDataSource = {} as any;
    const svc = new ProductVersionService(
      mockProductVersionRepo as any,
      mockMemberRepo as any,
      mockDataSource,
      new FakeDb(() => new FakeClient([])) as any
    );

    const result = await svc.get(projectId, snapshotId);
    expect(result).toBeNull();
  });
});
