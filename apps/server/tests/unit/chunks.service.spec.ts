import { describe, it, expect, vi } from 'vitest';
import { ChunksService } from '../../src/modules/chunks/chunks.service';
import { NotFoundException } from '@nestjs/common';

// Mock DatabaseService for testing
function createMockDbService(
  options: {
    listRows?: any[];
    checkRows?: any[];
    docRows?: any[];
    chunkCountRows?: any[];
    deleteError?: Error;
  } = {}
) {
  const {
    listRows = [],
    checkRows = [],
    docRows = [],
    chunkCountRows = [{ count: '0' }],
    deleteError,
  } = options;

  return {
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT c.id, c.document_id')) {
        return { rows: listRows };
      }
      if (sql.includes('SELECT id FROM kb.chunks')) {
        return { rows: checkRows };
      }
      if (sql.includes('SELECT id, filename, source_url FROM kb.documents')) {
        return { rows: docRows };
      }
      if (sql.includes('SELECT COUNT(*)::text as count FROM kb.chunks')) {
        return { rows: chunkCountRows };
      }
      if (sql.includes('DELETE FROM kb.chunks')) {
        if (deleteError) {
          throw deleteError;
        }
        return { rows: [] };
      }
      return { rows: [] };
    }),
    runWithTenantContext: vi
      .fn()
      .mockImplementation(
        async (_projectId: string, fn: () => Promise<any>) => {
          return fn();
        }
      ),
  };
}

// Mock Repository (not used but required by constructor)
function createMockRepository() {
  return {};
}

describe('ChunksService', () => {
  describe('list', () => {
    it('lists chunks with document info', async () => {
      const mockRows = [
        {
          id: 'chunk-1',
          document_id: 'doc-1',
          chunk_index: 0,
          text: 'Hello world',
          embedding: null,
          filename: 'test.txt',
          source_url: null,
        },
      ];
      const db = createMockDbService({ listRows: mockRows });
      const repo = createMockRepository();
      const service = new ChunksService(repo as any, db as any);

      const items = await service.list('doc-1', 'project-1');

      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('chunk-1');
      expect(items[0].documentId).toBe('doc-1');
      expect(items[0].documentTitle).toBe('test.txt');
      expect(items[0].hasEmbedding).toBe(false);
      expect(db.runWithTenantContext).toHaveBeenCalledWith(
        'project-1',
        expect.any(Function)
      );
    });

    it('uses source_url as title when filename is null', async () => {
      const mockRows = [
        {
          id: 'chunk-2',
          document_id: 'doc-2',
          chunk_index: 1,
          text: 'Content',
          embedding: [0.1],
          filename: null,
          source_url: 'http://example.com',
        },
      ];
      const db = createMockDbService({ listRows: mockRows });
      const repo = createMockRepository();
      const service = new ChunksService(repo as any, db as any);

      const items = await service.list(undefined, 'project-1');

      expect(items[0].documentTitle).toBe('http://example.com');
      expect(items[0].hasEmbedding).toBe(true);
    });

    it('runs without tenant context when no projectId provided', async () => {
      const mockRows = [
        {
          id: 'chunk-3',
          document_id: 'doc-3',
          chunk_index: 0,
          text: 'No project',
          embedding: null,
          filename: 'doc.pdf',
          source_url: null,
        },
      ];
      const db = createMockDbService({ listRows: mockRows });
      const repo = createMockRepository();
      const service = new ChunksService(repo as any, db as any);

      const items = await service.list();

      expect(items).toHaveLength(1);
      expect(db.runWithTenantContext).not.toHaveBeenCalled();
      expect(db.query).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes a chunk successfully', async () => {
      const db = createMockDbService({ checkRows: [{ id: 'chunk-1' }] });
      const repo = createMockRepository();
      const service = new ChunksService(repo as any, db as any);

      await service.delete('chunk-1', 'project-1');

      expect(db.runWithTenantContext).toHaveBeenCalledWith(
        'project-1',
        expect.any(Function)
      );
    });

    it('throws NotFoundException when chunk does not exist', async () => {
      const db = createMockDbService({ checkRows: [] });
      const repo = createMockRepository();
      const service = new ChunksService(repo as any, db as any);

      await expect(service.delete('nonexistent', 'project-1')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('bulkDelete', () => {
    it('deletes multiple chunks and returns summary', async () => {
      const db = createMockDbService({ checkRows: [{ id: 'chunk-1' }] });
      const repo = createMockRepository();
      const service = new ChunksService(repo as any, db as any);

      const result = await service.bulkDelete(
        ['chunk-1', 'chunk-2'],
        'project-1'
      );

      expect(result.totalDeleted).toBe(2);
      expect(result.totalFailed).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
    });

    it('handles partial failures', async () => {
      let callCount = 0;
      const db = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('SELECT id FROM kb.chunks')) {
            callCount++;
            // First chunk exists, second doesn't
            if (callCount === 1) {
              return { rows: [{ id: 'chunk-1' }] };
            }
            return { rows: [] };
          }
          return { rows: [] };
        }),
        runWithTenantContext: vi
          .fn()
          .mockImplementation(
            async (_projectId: string, fn: () => Promise<any>) => {
              return fn();
            }
          ),
      };
      const repo = createMockRepository();
      const service = new ChunksService(repo as any, db as any);

      const result = await service.bulkDelete(
        ['chunk-1', 'nonexistent'],
        'project-1'
      );

      expect(result.totalDeleted).toBe(1);
      expect(result.totalFailed).toBe(1);
      expect(
        result.results.find((r) => r.chunkId === 'nonexistent')?.success
      ).toBe(false);
    });
  });

  describe('deleteByDocument', () => {
    it('deletes all chunks for a document', async () => {
      const db = createMockDbService({
        docRows: [{ id: 'doc-1', filename: 'test.pdf', source_url: null }],
        chunkCountRows: [{ count: '5' }],
      });
      const repo = createMockRepository();
      const service = new ChunksService(repo as any, db as any);

      const result = await service.deleteByDocument('doc-1', 'project-1');

      expect(result.documentId).toBe('doc-1');
      expect(result.documentTitle).toBe('test.pdf');
      expect(result.chunksDeleted).toBe(5);
      expect(result.success).toBe(true);
      expect(db.runWithTenantContext).toHaveBeenCalledWith(
        'project-1',
        expect.any(Function)
      );
    });

    it('uses source_url as title when filename is null', async () => {
      const db = createMockDbService({
        docRows: [
          { id: 'doc-2', filename: null, source_url: 'http://example.com' },
        ],
        chunkCountRows: [{ count: '3' }],
      });
      const repo = createMockRepository();
      const service = new ChunksService(repo as any, db as any);

      const result = await service.deleteByDocument('doc-2', 'project-1');

      expect(result.documentTitle).toBe('http://example.com');
      expect(result.chunksDeleted).toBe(3);
    });

    it('throws NotFoundException when document does not exist', async () => {
      const db = createMockDbService({ docRows: [] });
      const repo = createMockRepository();
      const service = new ChunksService(repo as any, db as any);

      await expect(
        service.deleteByDocument('nonexistent', 'project-1')
      ).rejects.toThrow(NotFoundException);
    });

    it('returns zero chunks deleted when document has no chunks', async () => {
      const db = createMockDbService({
        docRows: [{ id: 'doc-3', filename: 'empty.pdf', source_url: null }],
        chunkCountRows: [{ count: '0' }],
      });
      const repo = createMockRepository();
      const service = new ChunksService(repo as any, db as any);

      const result = await service.deleteByDocument('doc-3', 'project-1');

      expect(result.chunksDeleted).toBe(0);
      expect(result.success).toBe(true);
    });
  });

  describe('bulkDeleteByDocuments', () => {
    it('deletes chunks for multiple documents', async () => {
      let docQueryCount = 0;
      let chunkCountQueryCount = 0;
      const db = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (
            sql.includes('SELECT id, filename, source_url FROM kb.documents')
          ) {
            docQueryCount++;
            if (docQueryCount === 1) {
              return {
                rows: [{ id: 'doc-1', filename: 'doc1.pdf', source_url: null }],
              };
            }
            return {
              rows: [{ id: 'doc-2', filename: 'doc2.pdf', source_url: null }],
            };
          }
          if (sql.includes('SELECT COUNT(*)::text as count FROM kb.chunks')) {
            chunkCountQueryCount++;
            if (chunkCountQueryCount === 1) {
              return { rows: [{ count: '5' }] };
            }
            return { rows: [{ count: '10' }] };
          }
          if (sql.includes('DELETE FROM kb.chunks')) {
            return { rows: [] };
          }
          return { rows: [] };
        }),
        runWithTenantContext: vi
          .fn()
          .mockImplementation(
            async (_projectId: string, fn: () => Promise<any>) => {
              return fn();
            }
          ),
      };
      const repo = createMockRepository();
      const service = new ChunksService(repo as any, db as any);

      const result = await service.bulkDeleteByDocuments(
        ['doc-1', 'doc-2'],
        'project-1'
      );

      expect(result.totalDocuments).toBe(2);
      expect(result.totalChunksDeleted).toBe(15);
      expect(result.totalFailed).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
    });

    it('handles partial failures in bulk delete', async () => {
      let docQueryCount = 0;
      const db = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (
            sql.includes('SELECT id, filename, source_url FROM kb.documents')
          ) {
            docQueryCount++;
            if (docQueryCount === 1) {
              return {
                rows: [{ id: 'doc-1', filename: 'doc1.pdf', source_url: null }],
              };
            }
            // Second document not found
            return { rows: [] };
          }
          if (sql.includes('SELECT COUNT(*)::text as count FROM kb.chunks')) {
            return { rows: [{ count: '5' }] };
          }
          if (sql.includes('DELETE FROM kb.chunks')) {
            return { rows: [] };
          }
          return { rows: [] };
        }),
        runWithTenantContext: vi
          .fn()
          .mockImplementation(
            async (_projectId: string, fn: () => Promise<any>) => {
              return fn();
            }
          ),
      };
      const repo = createMockRepository();
      const service = new ChunksService(repo as any, db as any);

      const result = await service.bulkDeleteByDocuments(
        ['doc-1', 'nonexistent'],
        'project-1'
      );

      expect(result.totalDocuments).toBe(2);
      expect(result.totalChunksDeleted).toBe(5);
      expect(result.totalFailed).toBe(1);
      expect(
        result.results.find((r) => r.documentId === 'doc-1')?.success
      ).toBe(true);
      expect(
        result.results.find((r) => r.documentId === 'nonexistent')?.success
      ).toBe(false);
    });
  });
});
