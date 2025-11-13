import { describe, it, expect, vi } from 'vitest';
import { ChunksService } from '../../src/modules/chunks/chunks.service';

// Pattern 5: TypeORM Migration Mismatch fix
// Service now uses TypeORM Repository with createQueryBuilder(), not DatabaseService.query()
// Mock Repository interface instead of raw SQL queries

function createMockRepository(shouldFailFirst = false) {
  let callCount = 0;

  return {
    createQueryBuilder: vi.fn(() => {
      callCount += 1;

      // First call fails with column missing error (for fallback testing)
      if (shouldFailFirst && callCount === 1) {
        return {
          leftJoinAndSelect: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          addOrderBy: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          getMany: vi
            .fn()
            .mockRejectedValue(
              Object.assign(new Error('column c.embedding does not exist'), {
                code: '42703',
              })
            ),
        };
      }

      // Successful query builder chain
      return {
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([
          {
            id: 'a',
            documentId: 'd',
            chunkIndex: 0,
            text: 'Hello',
            embedding: null,
            document: { filename: null, sourceUrl: null },
          },
        ]),
      };
    }),
  };
}

describe('ChunksService list resilience', () => {
  it('falls back when embedding column missing', async () => {
    const repo = createMockRepository(true);
    const service = new ChunksService(repo as any);
    const items = await service.list('d');
    expect(items).toHaveLength(1);
    expect(items[0].hasEmbedding).toBe(false);
    expect(items[0].text).toBe('Hello');
    // Verify fallback triggered (createQueryBuilder called twice)
    expect(repo.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it('lists with embedding present (no fallback path)', async () => {
    const repo = {
      createQueryBuilder: vi.fn(() => ({
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([
          {
            id: 'c1',
            documentId: 'doc1',
            chunkIndex: 1,
            text: 'Embedded text',
            embedding: [0.1],
            document: { filename: 'file.txt', sourceUrl: null },
          },
        ]),
      })),
    };
    const service = new ChunksService(repo as any);
    const items = await service.list('doc1');
    expect(items).toHaveLength(1);
    expect(items[0].hasEmbedding).toBe(true);
    expect(items[0].documentTitle).toBe('file.txt');
  });

  it('lists all when no documentId provided', async () => {
    const repo = {
      createQueryBuilder: vi.fn(() => ({
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([
          {
            id: 'x',
            documentId: 'docX',
            chunkIndex: 0,
            text: 'All docs',
            embedding: null,
            document: { filename: null, sourceUrl: 'http://example' },
          },
        ]),
      })),
    };
    const service = new ChunksService(repo as any);
    const items = await service.list();
    expect(items[0].documentTitle).toContain('http://example');
    expect(items[0].index).toBe(0);
  });
});
