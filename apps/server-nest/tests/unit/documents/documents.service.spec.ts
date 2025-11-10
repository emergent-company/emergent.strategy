import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DocumentsService } from '../../../src/modules/documents/documents.service';
import { DatabaseService } from '../../../src/common/database/database.service';

// Mock repository factory
function createMockRepository(methods: Partial<any> = {}) {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    ...methods,
  };
}

// Mock DataSource (for raw SQL queries)
class FakeDataSource {
  constructor(private rows: any[]) {}
  async query(text: string, params?: any[]) {
    let rows = this.rows;
    if (params && params.length) {
      const limit = params[0];
      if (typeof limit === 'number') rows = rows.slice(0, limit);
    }
    // DataSource.query() returns array directly, not { rows, rowCount }
    return rows;
  }
}

// Mock DatabaseService
class FakeDb extends DatabaseService {
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    super({} as any);
  }
  isOnline() {
    return true;
  }
}

// Mock HashService
class FakeHashService {
  sha256(content: string): string {
    return `mock-hash-${content.length}`;
  }
}

function makeRow(id: number) {
  const ts = new Date(Date.now() - id * 1000).toISOString();
  return {
    id: `00000000-0000-4000-8000-${id.toString().padStart(12, '0')}`,
    filename: `f${id}.md`,
    source_url: null,
    mime_type: 'text/markdown',
    created_at: ts,
    updated_at: ts,
  };
}

describe('DocumentsService pagination', () => {
  it('returns nextCursor when results hit limit', async () => {
    const rows = [makeRow(1), makeRow(2), makeRow(3)];
    const docRepo = createMockRepository();
    const chunkRepo = createMockRepository();
    const projectRepo = createMockRepository();
    const dataSource = new FakeDataSource(rows);
    const db = new FakeDb();
    const hash = new FakeHashService();
    const svc = new DocumentsService(
      docRepo as any,
      chunkRepo as any,
      projectRepo as any,
      dataSource as any,
      db as any,
      hash as any
    );
    const { items, nextCursor } = await svc.list(2);
    expect(items.length).toBe(2);
    expect(nextCursor).toBeTruthy();
    const decoded = svc.decodeCursor(nextCursor!);
    expect(decoded).toHaveProperty('id');
  });

  it('omits nextCursor when fewer than limit', async () => {
    const rows = [makeRow(1)];
    const docRepo = createMockRepository();
    const chunkRepo = createMockRepository();
    const projectRepo = createMockRepository();
    const dataSource = new FakeDataSource(rows);
    const db = new FakeDb();
    const hash = new FakeHashService();
    const svc = new DocumentsService(
      docRepo as any,
      chunkRepo as any,
      projectRepo as any,
      dataSource as any,
      db as any,
      hash as any
    );
    const { items, nextCursor } = await svc.list(5);
    expect(items.length).toBe(1);
    expect(nextCursor).toBeNull();
  });

  it('decodeCursor handles invalid input gracefully', () => {
    const docRepo = createMockRepository();
    const chunkRepo = createMockRepository();
    const projectRepo = createMockRepository();
    const dataSource = new FakeDataSource([]);
    const db = new FakeDb();
    const hash = new FakeHashService();
    const svc = new DocumentsService(
      docRepo as any,
      chunkRepo as any,
      projectRepo as any,
      dataSource as any,
      db as any,
      hash as any
    );
    expect(svc.decodeCursor('invalid$$')).toBeUndefined();
  });
});

// Extended coverage for creation, deletion, filters, cursor, and helpers
describe('DocumentsService extended behaviour', () => {
  // Mock DataSource with scriptable query responses
  class ScriptableDataSource {
    public calls: { text: string; params?: any[] }[] = [];
    constructor(
      public handlers: Array<{
        match: RegExp | string;
        respond: (text: string, params?: any[]) => any[];
      }>
    ) {}
    async query(text: string, params?: any[]) {
      this.calls.push({ text, params });
      const h = this.handlers.find((h) =>
        typeof h.match === 'string'
          ? text.includes(h.match)
          : h.match.test(text)
      );
      if (!h) throw new Error('Unexpected query: ' + text);
      // DataSource.query() returns array directly, not { rows, rowCount }
      return h.respond(text, params);
    }
  }

  function makeDoc(id: string, createdOffset = 0) {
    const ts = new Date(Date.now() - createdOffset).toISOString();
    return {
      id,
      organization_id: 'org-1',
      project_id: 'proj-1',
      filename: `file-${id}.txt`,
      source_url: null,
      mime_type: 'text/plain',
      created_at: ts,
      updated_at: ts,
      chunks: 2,
    };
  }

  it('list builds WHERE with org, project, and cursor', async () => {
    const rows = [makeDoc('a', 0), makeDoc('b', 1000), makeDoc('c', 2000)]; // already descending-ish
    const dataSource = new ScriptableDataSource([
      {
        match: 'FROM kb.documents',
        respond: (_text, params) => {
          // params: [limit+1, orgId, projectId, cursor.createdAt, cursor.id]
          expect(params?.length).toBe(5);
          return rows;
        },
      },
    ]);
    const docRepo = createMockRepository();
    const chunkRepo = createMockRepository();
    const projectRepo = createMockRepository();
    const db = new FakeDb();
    const hash = new FakeHashService();
    const svc = new DocumentsService(
      docRepo as any,
      chunkRepo as any,
      projectRepo as any,
      dataSource as any,
      db as any,
      hash as any
    );
    const cursor = Buffer.from(
      JSON.stringify({ createdAt: rows[1].created_at, id: rows[1].id }),
      'utf8'
    ).toString('base64url');
    const decoded = svc.decodeCursor(cursor)!; // ensure decode path success
    const res = await svc.list(2, decoded, {
      orgId: 'org-1',
      projectId: 'proj-1',
    });
    expect(res.items.length).toBe(2); // limit page slice
    expect(res.nextCursor).toBeTruthy(); // extra row -> cursor present
    const last = res.items[res.items.length - 1];
    expect(last.id).toBeDefined();
  });

  it('create throws when projectId missing', async () => {
    const dataSource = new ScriptableDataSource([]);
    const docRepo = createMockRepository();
    const chunkRepo = createMockRepository();
    const projectRepo = createMockRepository();
    const db = new FakeDb();
    const hash = new FakeHashService();
    const svc = new DocumentsService(
      docRepo as any,
      chunkRepo as any,
      projectRepo as any,
      dataSource as any,
      db as any,
      hash as any
    );
    await expect(
      svc.create({ orgId: 'o1', filename: 'a.txt', content: 'x' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create throws when projectId unknown (no row inserted)', async () => {
    const dataSource = new ScriptableDataSource([
      {
        match: 'INSERT INTO kb.documents',
        respond: () => [],
      },
    ]);
    const docRepo = createMockRepository();
    const chunkRepo = createMockRepository();
    const projectRepo = createMockRepository({
      findOne: vi.fn().mockResolvedValue(null), // Project not found
    });
    const db = new FakeDb();
    const hash = new FakeHashService();
    const svc = new DocumentsService(
      docRepo as any,
      chunkRepo as any,
      projectRepo as any,
      dataSource as any,
      db as any,
      hash as any
    );
    await expect(
      svc.create({
        orgId: 'o1',
        projectId: 'p-x',
        filename: 'a.txt',
        content: 'x',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create succeeds and maps row', async () => {
    const now = new Date();
    const savedDoc = {
      id: 'new-id',
      organizationId: 'o1',
      projectId: 'p1',
      filename: 'f.txt',
      content: 'hello',
      contentHash: 'mock-hash-5',
      sourceUrl: null,
      mimeType: 'text/plain',
      createdAt: now,
      updatedAt: now,
      integrationMetadata: null,
    };
    // Service uses documentRepository.create() and .save(), not raw SQL
    const docRepo = createMockRepository({
      create: vi.fn().mockReturnValue(savedDoc),
      save: vi.fn().mockResolvedValue(savedDoc),
    });
    const chunkRepo = createMockRepository();
    const projectRepo = createMockRepository({
      findOne: vi.fn().mockResolvedValue({ id: 'p1', organizationId: 'o1' }),
    });
    const dataSource = new ScriptableDataSource([]);
    const db = new FakeDb();
    const hash = new FakeHashService();
    const svc = new DocumentsService(
      docRepo as any,
      chunkRepo as any,
      projectRepo as any,
      dataSource as any,
      db as any,
      hash as any
    );
    const doc = await svc.create({
      orgId: 'o1',
      projectId: 'p1',
      filename: 'f.txt',
      content: 'hello',
    });
    expect(doc.id).toBe('new-id');
    expect(doc.name).toBe('f.txt');
    expect(doc.createdAt).toBe(now.toISOString());
  });

  it('get returns null when not found', async () => {
    const dataSource = new ScriptableDataSource([
      { match: 'WHERE d.id =', respond: () => [] },
    ]);
    const docRepo = createMockRepository();
    const chunkRepo = createMockRepository();
    const projectRepo = createMockRepository();
    const db = new FakeDb();
    const hash = new FakeHashService();
    const svc = new DocumentsService(
      docRepo as any,
      chunkRepo as any,
      projectRepo as any,
      dataSource as any,
      db as any,
      hash as any
    );
    expect(await svc.get('x')).toBeNull();
  });

  it('get maps row with source_url fallback name when filename null', async () => {
    const doc: any = makeDoc('r1');
    doc.filename = null;
    doc.source_url = 'https://example.com/file.pdf';
    const dataSource = new ScriptableDataSource([
      { match: 'WHERE d.id =', respond: () => [doc] },
    ]);
    const docRepo = createMockRepository();
    const chunkRepo = createMockRepository();
    const projectRepo = createMockRepository();
    const db = new FakeDb();
    const hash = new FakeHashService();
    const svc = new DocumentsService(
      docRepo as any,
      chunkRepo as any,
      projectRepo as any,
      dataSource as any,
      db as any,
      hash as any
    );
    const got = await svc.get('r1');
    expect(got?.name).toBe('https://example.com/file.pdf');
  });

  it('getProjectOrg returns null and then org id', async () => {
    const projectRepo = createMockRepository({
      findOne: vi
        .fn()
        .mockResolvedValueOnce(null) // First call returns null
        .mockResolvedValueOnce({ organizationId: 'org-77' }), // Second call returns org
    });
    const dataSource = new ScriptableDataSource([]);
    const docRepo = createMockRepository();
    const chunkRepo = createMockRepository();
    const db = new FakeDb();
    const hash = new FakeHashService();
    const svc = new DocumentsService(
      docRepo as any,
      chunkRepo as any,
      projectRepo as any,
      dataSource as any,
      db as any,
      hash as any
    );
    expect(await svc.getProjectOrg('p1')).toBeNull();
    expect(await svc.getProjectOrg('p1')).toBe('org-77');
  });

  it('delete returns true when a row deleted and false otherwise', async () => {
    const docRepo = createMockRepository({
      delete: vi
        .fn()
        .mockResolvedValueOnce({ affected: 1 }) // First call: row deleted
        .mockResolvedValueOnce({ affected: 0 }), // Second call: no row deleted
    });
    const dataSource = new ScriptableDataSource([]);
    const chunkRepo = createMockRepository();
    const projectRepo = createMockRepository();
    const db = new FakeDb();
    const hash = new FakeHashService();
    const svc = new DocumentsService(
      docRepo as any,
      chunkRepo as any,
      projectRepo as any,
      dataSource as any,
      db as any,
      hash as any
    );
    expect(await svc.delete('d1')).toBe(true);
    expect(await svc.delete('d2')).toBe(false);
  });
});
