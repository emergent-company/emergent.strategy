import { describe, expect, test } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { OrgsService } from '../../../src/modules/orgs/orgs.service';
import { AppConfigService } from '../../../src/common/config/config.service';

// Fake DatabaseService capturing executed SQL
class FakeDb {
  public online = true;
  public queries: { sql: string; params?: any[] }[] = [];
  async query(sql: string, params?: any[]) {
    this.queries.push({
      sql: typeof sql === 'string' ? sql : String(sql),
      params,
    });
    if (
      /SELECT COUNT\(\*\)::text as count[\s\S]*FROM kb\.orgs o[\s\S]*INNER JOIN kb\.organization_memberships/i.test(
        sql
      )
    ) {
      return { rows: [{ count: '0' }], rowCount: 1 } as any;
    }
    if (/INSERT INTO kb\.orgs\(name\)/i.test(sql)) {
      return {
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            name: params?.[0],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      } as any;
    }
    if (/UPDATE kb\.graph_objects SET embedding=/i.test(sql)) {
      return { rowCount: 1 } as any;
    }
    return { rows: [], rowCount: 0 } as any;
  }
  async getClient() {
    const self = this;
    return {
      query: (sql: string, params?: any[]) => {
        const sqlText = typeof sql === 'string' ? sql : String(sql);
        if (/INSERT INTO kb\.organization_memberships/i.test(sqlText)) {
          self.queries.push({ sql: sqlText, params });
          const error: any = new Error('violates foreign key');
          error.code = '23503';
          throw error;
        }
        return self.query(sqlText, params);
      },
      release: () => {
        /* noop */
      },
    };
  }
  isOnline() {
    return this.online;
  }
}

// Minimal AppConfig stub
class FakeConfig extends AppConfigService {
  constructor() {
    super({} as any);
  }
}

describe('OrgsService.create handles missing user profiles', () => {
  test('translates foreign key violation into BadRequestException', async () => {
    const db = new FakeDb();
    const cfg = new FakeConfig();

    // Pattern 5: OrgsService now uses TypeORM Repository + DataSource
    // Mock membershipRepo.createQueryBuilder() for the user's org count check
    const mockMembershipRepo = {
      createQueryBuilder: () => ({
        where: () => ({
          getCount: async () => 0, // User has 0 orgs, below limit
        }),
      }),
      create: (data: any) => data, // Simple passthrough for entity creation
    } as any;

    const mockOrgRepo = {
      create: (data: any) => ({
        ...data,
        id: '11111111-1111-1111-1111-111111111111',
      }),
    } as any;

    // Mock DataSource with queryRunner for transaction handling
    const mockQueryRunner = {
      connect: async () => {},
      startTransaction: async () => {},
      manager: {
        save: async (entity: any) => {
          // First save (org) succeeds
          if (entity.name) return entity;
          // Second save (membership) triggers FK violation
          const error: any = new Error('violates foreign key');
          error.code = '23503';
          throw error;
        },
      },
      rollbackTransaction: async () => {},
      commitTransaction: async () => {},
      release: () => {},
    };

    const mockDataSource = {
      createQueryRunner: () => mockQueryRunner,
    } as any;

    const service = new OrgsService(
      mockOrgRepo,
      mockMembershipRepo,
      mockDataSource,
      db as any,
      cfg as any
    );

    // Service should catch FK violation (23503) and convert to BadRequestException
    await expect(
      service.create('Test Org', '00000000-0000-0000-0000-000000000001')
    ).rejects.toBeInstanceOf(BadRequestException);

    // Note: With TypeORM migration, the service no longer uses db.query() directly
    // The transaction is handled through DataSource.createQueryRunner()
    // So we cannot verify SQL queries via db.queries array anymore
  });
});
