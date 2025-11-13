import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrgsService } from '../../../src/modules/orgs/orgs.service';
import { ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../../src/common/database/database.service';

// ========== Pattern 5 Level 3 Infrastructure ==========

function createMockRepository(methods = {}) {
  const mockQueryBuilder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getCount: vi.fn().mockResolvedValue(0),
    getMany: vi.fn().mockResolvedValue([]),
    getOne: vi.fn().mockResolvedValue(null),
  };

  return {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
    create: vi.fn().mockImplementation((entity) => entity),
    delete: vi.fn().mockResolvedValue({ affected: 1 }),
    count: vi.fn().mockResolvedValue(0),
    createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
    ...methods,
  };
}

// Reusable error helpers
function pgError(code: string, message = code): any {
  return Object.assign(new Error(message), { code });
}

// Transactional fake client similar to projects.service tests
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

class FakeDataSource {
  private queryRunnerInstance?: FakeQueryRunner;

  constructor(
    private scripts: Array<{ text: RegExp; result?: any; throw?: Error }> = []
  ) {}

  async query(text: string, params?: any[]) {
    const script = this.scripts.find((s) => s.text.test(text));
    if (!script) {
      // Fallback: check if query contains key parts
      const lowerText = text.toLowerCase().replace(/\s+/g, ' ');
      const fallbackScript = this.scripts.find((s) => {
        const source = s.text.source.toLowerCase();
        // Extract key parts from regex (remove special chars)
        const keyParts = source.match(/[a-z_]+/g) || [];
        return (
          keyParts.length > 0 &&
          keyParts.every((part) => lowerText.includes(part))
        );
      });
      if (!fallbackScript) return [];
      if (fallbackScript.throw) throw fallbackScript.throw;
      return fallbackScript.result?.rows ?? fallbackScript.result ?? [];
    }
    if (script.throw) throw script.throw;
    return script.result?.rows ?? script.result ?? [];
  }

  createQueryRunner() {
    if (!this.queryRunnerInstance) {
      this.queryRunnerInstance = new FakeQueryRunner();
    }
    return this.queryRunnerInstance;
  }
}

class FakeQueryRunner {
  private saveCounter = 0;

  manager = {
    save: vi.fn().mockImplementation((entity: any) => {
      this.saveCounter++;
      // If entity doesn't have ID, generate one
      if (!entity.id) {
        entity.id = uuid(this.saveCounter);
      }
      return Promise.resolve(entity);
    }),
  };

  async connect() {}
  async startTransaction() {}
  async commitTransaction() {}
  async rollbackTransaction() {}
  async release() {}
}

class FakeDb extends DatabaseService {
  constructor(
    private isDbOnline: boolean = true,
    private clientFactory?: () => FakeClient
  ) {
    super({} as any);
  }
  isOnline() {
    return this.isDbOnline;
  }
  setOnline(v: boolean) {
    this.isDbOnline = v;
  }
  async getClient(): Promise<any> {
    return this.clientFactory ? this.clientFactory() : new FakeClient([]);
  }
  async runWithTenantContext<T>(
    tenantId: string,
    projectId: string | null,
    callback: () => Promise<T>
  ): Promise<T> {
    return callback();
  }
}

function createMockConfig() {
  return {
    get: vi.fn().mockReturnValue(undefined),
  };
}

function uuid(n: number) {
  return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
}

describe('OrgsService', () => {
  it('list() offline returns in-memory array copy (initially empty)', async () => {
    const orgRepo = createMockRepository();
    const membershipRepo = createMockRepository();
    const dataSource = new FakeDataSource();
    const db = new FakeDb(false);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );
    const res = await svc.list();
    expect(res).toEqual([]);
  });

  it('list() online maps rows for supplied user membership', async () => {
    const orgRepo = createMockRepository();
    const membershipRepo = createMockRepository();
    const dataSource = new FakeDataSource([
      {
        text: /FROM kb\.orgs.*INNER JOIN kb\.organization_memberships/s,
        result: {
          rows: [{ id: uuid(1), name: 'Acme', created_at: '', updated_at: '' }],
          rowCount: 1,
        },
      },
    ]);
    const db = new FakeDb(true);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );
    const res = await svc.list('user-123');
    expect(res).toEqual([{ id: uuid(1), name: 'Acme' }]);
  });

  it('list() online table missing falls back to memory', async () => {
    const orgRepo = createMockRepository();
    const membershipRepo = createMockRepository();
    const dataSource = new FakeDataSource([
      {
        text: /SELECT o.id, o.name, o.created_at, o.updated_at[\s\S]*FROM kb\.orgs o[\s\S]*INNER JOIN kb\.organization_memberships om[\s\S]*WHERE om.user_id = \$1/,
        throw: pgError('42P01'),
      },
    ]);
    const db = new FakeDb(true);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );
    const res = await svc.list('user-123');
    expect(res).toEqual([]); // fallback copy
  });

  it('get() offline returns null when not found', async () => {
    const orgRepo = createMockRepository();
    const membershipRepo = createMockRepository();
    const dataSource = new FakeDataSource();
    const db = new FakeDb(false);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );
    const res = await svc.get(uuid(9));
    expect(res).toBeNull();
  });

  it('get() online table missing returns null (fallback)', async () => {
    const orgRepo = createMockRepository();
    const membershipRepo = createMockRepository();
    const dataSource = new FakeDataSource([
      {
        text: /SELECT id, name, created_at, updated_at FROM kb\.orgs WHERE/,
        throw: pgError('42P01'),
      },
    ]);
    const db = new FakeDb(true);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );
    const res = await svc.get(uuid(2));
    expect(res).toBeNull();
  });

  it('create() offline prevents duplicate names (case-insensitive)', async () => {
    const orgRepo = createMockRepository();
    const membershipRepo = createMockRepository();
    const dataSource = new FakeDataSource();
    const db = new FakeDb(false);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );
    const first = await svc.create('Acme');
    expect(first.name).toBe('Acme');
    await expect(svc.create('acme')).rejects.toBeInstanceOf(ConflictException);
  });

  it('create() offline enforces 100 org limit', async () => {
    const orgRepo = createMockRepository();
    const membershipRepo = createMockRepository();
    const dataSource = new FakeDataSource();
    const db = new FakeDb(false);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );
    for (let i = 0; i < 100; i++) {
      const o = await svc.create('Org' + i);
      expect(o.id).toBeTruthy();
    }
    await expect(svc.create('Overflow')).rejects.toThrow(
      /Organization limit reached/
    );
  });

  it('create() online limit check (count >=100) rejects for user', async () => {
    const orgRepo = createMockRepository();
    // Configure membershipRepo to return count >= 100
    const mockQueryBuilder = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getCount: vi.fn().mockResolvedValue(100), // Return limit count
      getMany: vi.fn().mockResolvedValue([]),
      getOne: vi.fn().mockResolvedValue(null),
    };
    const membershipRepo = createMockRepository({
      createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
    });
    const dataSource = new FakeDataSource();
    const db = new FakeDb(true);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );
    await expect(svc.create('AcmeOnline', 'user-123')).rejects.toThrow(
      /Organization limit reached/
    );
  });

  it('create() online success without userId', async () => {
    const orgRepo = createMockRepository({
      create: vi.fn().mockImplementation((dto) => ({ ...dto, id: undefined })),
    });
    const membershipRepo = createMockRepository();
    const dataSource = new FakeDataSource();
    const db = new FakeDb(true);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );
    const res = await svc.create('Solo');
    expect(res).toEqual({ id: uuid(1), name: 'Solo' });
  });

  it('create() online success with userId inserts membership record', async () => {
    const orgRepo = createMockRepository({
      create: vi.fn().mockImplementation((dto) => ({ ...dto, id: undefined })),
    });
    const membershipRepo = createMockRepository({
      create: vi.fn().mockImplementation((dto) => ({ ...dto, id: undefined })),
    });
    const mockQueryBuilder = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getCount: vi.fn().mockResolvedValue(1), // User has 1 org
      getMany: vi.fn().mockResolvedValue([]),
      getOne: vi.fn().mockResolvedValue(null),
    };
    membershipRepo.createQueryBuilder = vi
      .fn()
      .mockReturnValue(mockQueryBuilder);

    const dataSource = new FakeDataSource();
    const db = new FakeDb(true);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );
    const res = await svc.create('WithUser', 'user-123');
    expect(res).toEqual({ id: uuid(1), name: 'WithUser' });

    // Verify membership was created
    const queryRunner = dataSource.createQueryRunner();
    expect(queryRunner.manager.save).toHaveBeenCalledTimes(2); // org + membership
  });

  it('create() online duplicate name translates unique violation', async () => {
    const orgRepo = createMockRepository({
      create: vi.fn().mockImplementation((dto) => ({ ...dto, id: undefined })),
    });
    const membershipRepo = createMockRepository();

    // Make QueryRunner.manager.save() throw 23505 error on first save (org)
    const dataSource = new FakeDataSource();
    const queryRunner = dataSource.createQueryRunner();
    queryRunner.manager.save = vi.fn().mockImplementation(() => {
      throw pgError('23505', 'duplicate key value violates unique constraint');
    });

    const db = new FakeDb(true);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );
    await expect(svc.create('DupOrg')).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('create() online table missing falls back to memory path', async () => {
    const orgRepo = createMockRepository({
      create: vi.fn().mockImplementation((dto) => ({ ...dto, id: undefined })),
    });
    const membershipRepo = createMockRepository();

    // Make QueryRunner.manager.save() throw 42P01 error to trigger fallback
    const dataSource = new FakeDataSource();
    const queryRunner = dataSource.createQueryRunner();
    queryRunner.manager.save = vi.fn().mockImplementation(() => {
      throw pgError('42P01', 'relation "kb.orgs" does not exist');
    });

    const db = new FakeDb(true);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );

    const created = await svc.create('Fallback');
    expect(created.name).toBe('Fallback');
    expect(created.id).toBeTruthy();
    expect(created.id).toMatch(/^mem_/); // In-memory ID format

    // Verify fallback is persistent: list() should return in-memory data
    const list = await svc.list();
    expect(list.find((o) => o.name === 'Fallback')).toBeTruthy();
  });

  it('delete() offline removes existing org', async () => {
    const orgRepo = createMockRepository();
    const membershipRepo = createMockRepository();
    const dataSource = new FakeDataSource();
    const db = new FakeDb(false);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );
    const a = await svc.create('LocalA');
    const removed = await svc.delete(a.id);
    expect(removed).toBe(true);
    const again = await svc.delete(a.id);
    expect(again).toBe(false);
  });

  it('delete() online returns true when row deleted', async () => {
    const orgRepo = createMockRepository();
    const membershipRepo = createMockRepository();
    const dataSource = new FakeDataSource([
      {
        text: /DELETE FROM kb\.orgs/,
        result: { rows: [{ id: uuid(5) }], rowCount: 1 },
      },
    ]);
    const db = new FakeDb(true);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );
    const res = await svc.delete(uuid(5));
    expect(res).toBe(true);
  });

  it('delete() online table missing returns false', async () => {
    const orgRepo = createMockRepository({
      delete: vi.fn().mockImplementation(() => {
        throw pgError('42P01', 'relation "kb.orgs" does not exist');
      }),
    });
    const membershipRepo = createMockRepository();
    const dataSource = new FakeDataSource();
    const db = new FakeDb(true);
    const cfg = createMockConfig();
    const svc = new OrgsService(
      orgRepo as any,
      membershipRepo as any,
      dataSource as any,
      db as any,
      cfg as any
    );
    const res = await svc.delete(uuid(6));
    expect(res).toBe(false); // Not found in in-memory fallback
  });
});
