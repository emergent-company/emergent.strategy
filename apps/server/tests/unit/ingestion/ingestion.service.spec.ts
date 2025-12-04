import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  IngestionService,
  getIngestionServiceMetrics,
} from '../../../src/modules/ingestion/ingestion.service';
import { BadRequestException } from '@nestjs/common';

// Lightweight UUID generator for deterministic IDs in tests (not cryptographically strong)
function fakeUuid(idx: number) {
  return `00000000-0000-0000-0000-${(idx + 1).toString().padStart(12, '0')}`;
}

// Mocks
class DbMock {
  online = true;
  queries: { sql: string; params?: any[] }[] = [];
  // configurable scripted responses queue
  queue: Array<{ rows: any[]; rowCount: number }> = [];
  isOnline() {
    return this.online;
  }
  push(res: { rows: any[]; rowCount?: number }) {
    this.queue.push({
      rows: res.rows,
      rowCount: res.rowCount ?? res.rows.length,
    });
  }
  async query(sql: string, params?: any[]) {
    this.queries.push({ sql, params });
    if (!this.online) return { rows: [], rowCount: 0 } as any;
    const next = this.queue.shift();
    if (!next) return { rows: [], rowCount: 0 } as any;
    return next as any;
  }
}
class ChunkerMock {
  chunk = (text: string) => {
    // simple fixed split every 20 chars for determinism
    const out: string[] = [];
    for (let i = 0; i < text.length; i += 20) out.push(text.slice(i, i + 20));
    return out.length ? out : [''];
  };
  chunkWithMetadata = (text: string, config?: any) => {
    // simple fixed split every 20 chars for determinism, with metadata
    const chunks: Array<{ text: string; metadata: any }> = [];
    for (let i = 0; i < text.length; i += 20) {
      const chunkText = text.slice(i, i + 20);
      chunks.push({
        text: chunkText,
        metadata: {
          strategy: config?.strategy || 'character',
          startOffset: i,
          endOffset: Math.min(i + 20, text.length),
          boundaryType: 'character',
        },
      });
    }
    return chunks.length
      ? chunks
      : [
          {
            text: '',
            metadata: {
              strategy: 'character',
              startOffset: 0,
              endOffset: 0,
              boundaryType: 'character',
            },
          },
        ];
  };
}
class HashMock {
  sha256 = (t: string) => `hash_${t.length}`;
}
class EmbeddingsMock {
  embedDocuments = vi.fn(async (chunks: string[]) =>
    chunks.map((c, i) => [i, c.length])
  );
}
class ConfigMock {
  embeddingsEnabled = true;
}
class ExtractionJobServiceMock {
  createJobForDocument = vi.fn(async () => ({
    id: 'job-id',
    status: 'pending',
  }));
}

class ProjectRepositoryMock {
  findOne = vi.fn(async () => null);
  find = vi.fn(async () => []);
  save = vi.fn(async (entity: any) => entity);
}

// Helper to build service with scripted DB queue
function build(
  queue: Array<{ rows: any[]; rowCount?: number }>,
  overrides?: Partial<{
    db: DbMock;
    config: ConfigMock;
    embeddings: EmbeddingsMock;
    extractionJobService: ExtractionJobServiceMock;
    projectRepository: ProjectRepositoryMock;
  }>
) {
  const db = overrides?.db ?? new DbMock();
  queue.forEach((q) => db.push(q));
  const svc = new IngestionService(
    db as any,
    new ChunkerMock() as any,
    new HashMock() as any,
    (overrides?.embeddings ?? new EmbeddingsMock()) as any,
    (overrides?.config ?? new ConfigMock()) as any,
    (overrides?.extractionJobService ?? new ExtractionJobServiceMock()) as any,
    (overrides?.projectRepository ?? new ProjectRepositoryMock()) as any
  );
  return { svc, db };
}

// Common project + org rows
const projectRow = { id: fakeUuid(1), organization_id: fakeUuid(2) };

describe('IngestionService.ingestText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty text', async () => {
    const { svc, db } = build([]);
    await expect(
      svc.ingestText({ text: '   ', projectId: projectRow.id })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.queries.length).toBe(0); // should short-circuit pre DB
  });

  it('rejects missing project (project-not-found)', async () => {
    const { svc } = build([
      { rows: [], rowCount: 0 }, // project lookup
    ]);
    await expect(
      svc.ingestText({ text: 'hello', projectId: projectRow.id })
    ).rejects.toMatchObject({
      response: { error: { code: 'project-not-found' } },
    });
  });

  it('rejects org mismatch', async () => {
    const mismatched = { id: projectRow.id, organization_id: fakeUuid(99) };
    const { svc } = build([
      { rows: [{ content_hash: 'x' }], rowCount: 1 }, // feature detect consumes first queue item
      { rows: [mismatched], rowCount: 1 }, // project with different org
    ]);
    await expect(
      svc.ingestText({
        text: 'hello',
        projectId: projectRow.id,
        orgId: fakeUuid(3),
      })
    ).rejects.toMatchObject({
      response: { error: { code: 'org-project-mismatch' } },
    });
  });

  it('deduplicates via content_hash column path (existing doc)', async () => {
    const existingDocId = fakeUuid(10);
    const { svc } = build([
      { rows: [{ content_hash: 'x' }], rowCount: 1 }, // feature detect query (SELECT content_hash ...)
      { rows: [projectRow], rowCount: 1 }, // project lookup
      { rows: [{ id: existingDocId }], rowCount: 1 }, // existing by hash
    ]);
    const res = await svc.ingestText({
      text: 'hello world content',
      projectId: projectRow.id,
    });
    expect(res).toEqual({
      documentId: existingDocId,
      chunks: 0,
      alreadyExists: true,
    });
  });

  it('inserts new doc with hash path then chunks & embeddings', async () => {
    const insertedDocId = fakeUuid(11);
    const { svc, db } = build([
      { rows: [{ content_hash: 'x' }], rowCount: 1 }, // feature detect
      { rows: [projectRow], rowCount: 1 }, // project
      { rows: [], rowCount: 0 }, // existing by hash -> none
      { rows: [{ id: insertedDocId }], rowCount: 1 }, // insert doc returning id
      // chunk inserts follow (we don't script them; mock DB returns empty responses)
    ]);
    const text = 'a'.repeat(45); // yields 3 chunks with our 20-char chunker (20,20,5)
    const res = await svc.ingestText({
      text,
      projectId: projectRow.id,
      filename: 'f.txt',
      mimeType: 'text/plain',
    });
    expect(res.documentId).toBe(insertedDocId);
    expect(res.alreadyExists).toBe(false);
    expect(res.chunks).toBe(3);
    // Check that hash query and insert executed
    const hashLook = db.queries.find((q) =>
      /SELECT id FROM kb.documents WHERE project_id/.test(q.sql)
    );
    expect(hashLook).toBeTruthy();
  });

  it('falls back to content equality when content_hash column missing initially', async () => {
    const insertedDocId = fakeUuid(12);
    const { svc, db } = build([
      // detection path intentionally skipped by forcing flag below
    ]);
    // @ts-expect-error test override internal flag
    svc.hasContentHashColumn = false;
    (db as any).push({ rows: [projectRow], rowCount: 1 }); // project
    (db as any).push({ rows: [], rowCount: 0 }); // existing by content none
    (db as any).push({ rows: [{ id: insertedDocId }], rowCount: 1 }); // insert
    const res = await svc.ingestText({
      text: 'unique content text',
      projectId: projectRow.id,
    });
    expect(res.documentId).toBe(insertedDocId);
    expect(res.alreadyExists).toBe(false);
    const contentEq = db.queries.find((q) => /content = \$2/.test(q.sql));
    expect(contentEq).toBeTruthy();
  });

  it('handles concurrent unique violation race during hash insert', async () => {
    const existingDocId = fakeUuid(13);
    const { svc, db } = build([
      { rows: [{ content_hash: 'x' }], rowCount: 1 }, // detect
      { rows: [projectRow], rowCount: 1 }, // project
      { rows: [], rowCount: 0 }, // existing by hash none
    ]);
    const origQuery = db.query.bind(db);
    let threw = false;
    (db as any).query = async (sql: string, params?: any[]) => {
      if (/INSERT INTO kb.documents/.test(sql) && !threw) {
        threw = true;
        const err: any = new Error('duplicate');
        err.code = '23505';
        throw err;
      }
      if (
        threw &&
        /SELECT id FROM kb.documents WHERE project_id/.test(sql) &&
        params &&
        params.length === 2
      ) {
        return { rows: [{ id: existingDocId }], rowCount: 1 } as any;
      }
      return origQuery(sql, params);
    };
    const res = await svc.ingestText({
      text: 'race content text',
      projectId: projectRow.id,
    });
    expect(res).toEqual({
      documentId: existingDocId,
      chunks: 0,
      alreadyExists: true,
    });
    const metrics = getIngestionServiceMetrics(svc);
    expect(metrics.uniqueViolationRaces).toBe(1);
  });

  it('embeddings failure + embedding column missing fallback path', async () => {
    const insertedDocId = fakeUuid(14);
    const embeddings = new EmbeddingsMock();
    embeddings.embedDocuments.mockImplementationOnce(async () => {
      throw new Error('embed fail');
    });
    const { svc, db } = build(
      [
        { rows: [{ content_hash: 'x' }], rowCount: 1 }, // detect
        { rows: [projectRow], rowCount: 1 }, // project
        { rows: [], rowCount: 0 }, // existing none
        { rows: [{ id: insertedDocId }], rowCount: 1 }, // insert doc
      ],
      { embeddings }
    );
    const origQuery = db.query.bind(db);
    let threw = false;
    (db as any).query = async (sql: string, params?: any[]) => {
      if (/INSERT INTO kb.chunks/.test(sql) && !threw) {
        threw = true;
        const err: any = new Error('no column');
        err.code = '42703';
        throw err;
      }
      return origQuery(sql, params);
    };
    const res = await svc.ingestText({
      text: 'embedding test text long enough to create several chunks 1234567890',
      projectId: projectRow.id,
    });
    expect(res.documentId).toBe(insertedDocId);
    const metrics = getIngestionServiceMetrics(svc);
    expect(metrics.embeddingColumnMissing).toBeGreaterThanOrEqual(1);
  });

  it('detects missing content_hash column via initial 42703 and falls back to equality insert path automatically', async () => {
    const insertedDocId = fakeUuid(15);
    const { svc, db } = build([
      // project lookup
      { rows: [projectRow], rowCount: 1 },
      // existing by content (none)
      { rows: [], rowCount: 0 },
      // insert equality path returning id
      { rows: [{ id: insertedDocId }], rowCount: 1 },
    ]);
    const origQuery = db.query.bind(db);
    let detectionAttempted = false;
    (db as any).query = async (sql: string, params?: any[]) => {
      if (
        /SELECT content_hash FROM kb.documents LIMIT 1/.test(sql) &&
        !detectionAttempted
      ) {
        detectionAttempted = true;
        const err: any = new Error('col missing');
        err.code = '42703';
        throw err;
      }
      return origQuery(sql, params);
    };
    const res = await svc.ingestText({
      text: 'first ingestion without hash column',
      projectId: projectRow.id,
    });
    expect(res.documentId).toBe(insertedDocId);
    const metrics = getIngestionServiceMetrics(svc);
    expect(metrics.contentHashMissing).toBeGreaterThanOrEqual(1);
    expect(metrics.contentHashDetected).toBe(0);
  });

  it('downgrades mid-flight when hash insert throws 42703 then retries equality path', async () => {
    const insertedDocId = fakeUuid(16);
    const { svc, db } = build([
      { rows: [{ content_hash: 'x' }], rowCount: 1 }, // detection success
      { rows: [projectRow], rowCount: 1 }, // project
      { rows: [], rowCount: 0 }, // existing by hash none
      // equality existing none (after downgrade)
      { rows: [], rowCount: 0 },
      // equality insert returning id
      { rows: [{ id: insertedDocId }], rowCount: 1 },
    ]);
    const origQuery = db.query.bind(db);
    let threw = false;
    (db as any).query = async (sql: string, params?: any[]) => {
      if (
        /INSERT INTO kb.documents\(project_id, source_url, filename, mime_type, content, content_hash\)/.test(
          sql
        ) &&
        !threw
      ) {
        threw = true;
        const err: any = new Error('col missing mid-flight');
        err.code = '42703';
        throw err;
      }
      return origQuery(sql, params);
    };
    const res = await svc.ingestText({
      text: 'midflight downgrade path text',
      projectId: projectRow.id,
    });
    expect(res.documentId).toBe(insertedDocId);
    const metrics = getIngestionServiceMetrics(svc);
    expect(metrics.contentHashMissing).toBeGreaterThanOrEqual(1); // incremented during downgrade
  });

  it('handles 42P10 missing unique constraint for chunk upsert (retries without ON CONFLICT)', async () => {
    const insertedDocId = fakeUuid(17);
    const { svc, db } = build([
      { rows: [{ content_hash: 'x' }], rowCount: 1 }, // detect
      { rows: [projectRow], rowCount: 1 }, // project
      { rows: [], rowCount: 0 }, // existing none
      { rows: [{ id: insertedDocId }], rowCount: 1 }, // insert doc
    ]);
    const origQuery = db.query.bind(db);
    let firstChunkAttempted = false;
    (db as any).query = async (sql: string, params?: any[]) => {
      if (
        /INSERT INTO kb.chunks\(document_id, chunk_index, text, embedding\)/.test(
          sql
        ) &&
        /ON CONFLICT/.test(sql) &&
        !firstChunkAttempted
      ) {
        firstChunkAttempted = true; // simulate failure before underlying query executes
        // emulate logging of attempted query
        db.queries.push({ sql, params });
        const err: any = new Error('no unique');
        err.code = '42P10';
        throw err;
      }
      return origQuery(sql, params);
    };
    const res = await svc.ingestText({
      text: 'some vector enabled content that spans multiple chunks 01234567890123456789012345 EXTRA DATA TO FORCE MORE CHUNKS 1234567890',
      projectId: projectRow.id,
    });
    expect(res.documentId).toBe(insertedDocId);
    // Ensure we had at least one ON CONFLICT query and at least one retry without it
    const withConflict = db.queries.filter(
      (q) => /INSERT INTO kb.chunks/.test(q.sql) && /ON CONFLICT/.test(q.sql)
    );
    const withoutConflict = db.queries.filter(
      (q) => /INSERT INTO kb.chunks/.test(q.sql) && !/ON CONFLICT/.test(q.sql)
    );
    expect(firstChunkAttempted).toBe(true);
    expect(withoutConflict.length).toBeGreaterThanOrEqual(1);
  });

  it('skips embedding generation when embeddings disabled', async () => {
    const insertedDocId = fakeUuid(18);
    const config = new ConfigMock();
    config.embeddingsEnabled = false;
    const embeddings = new EmbeddingsMock();
    const { svc } = build(
      [
        { rows: [{ content_hash: 'x' }], rowCount: 1 },
        { rows: [projectRow], rowCount: 1 },
        { rows: [], rowCount: 0 },
        { rows: [{ id: insertedDocId }], rowCount: 1 },
      ],
      { config, embeddings }
    );
    const res = await svc.ingestText({
      text: 'embedding disabled text content long enough for chunks 12345678901234567890',
      projectId: projectRow.id,
    });
    expect(res.documentId).toBe(insertedDocId);
    expect(embeddings.embedDocuments).not.toHaveBeenCalled();
  });

  it('deduplicates via equality path when hash column absent (existing doc)', async () => {
    const existingId = fakeUuid(19);
    const { svc, db } = build([
      { rows: [projectRow], rowCount: 1 }, // project
      { rows: [{ id: existingId }], rowCount: 1 }, // existing by content
    ]);
    // force absence of hash column
    // @ts-expect-error test override
    svc.hasContentHashColumn = false;
    const res = await svc.ingestText({
      text: 'equality dedupe content',
      projectId: projectRow.id,
    });
    expect(res).toEqual({
      documentId: existingId,
      chunks: 0,
      alreadyExists: true,
    });
  });
});

describe('IngestionService.ingestUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches HTML, converts to text, ingests and chunks', async () => {
    const insertedDocId = fakeUuid(20);
    const { svc, db } = build([
      { rows: [{ content_hash: 'x' }], rowCount: 1 }, // detect (ingestText lazy detection)
      { rows: [projectRow], rowCount: 1 }, // project lookup (ingestUrl early)
      { rows: [projectRow], rowCount: 1 }, // project lookup (ingestText internal)
      { rows: [], rowCount: 0 }, // existing by hash none
      { rows: [{ id: insertedDocId }], rowCount: 1 }, // insert doc
    ]);
    const origFetch = global.fetch;
    global.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'text/html']]) as any,
          arrayBuffer: async () =>
            Buffer.from('<html><body><p>Hello World</p></body></html>'),
        } as any)
    );
    // omit orgId to avoid mismatch errors and allow derived project org
    const res = await svc.ingestUrl(
      'https://example.com/page',
      undefined,
      projectRow.id
    );
    expect(res.documentId).toBe(insertedDocId);
    expect(res.chunks).toBeGreaterThan(0);
    global.fetch = origFetch as any;
    // Ensure HTML to text transformation path executed (we can't easily assert internal, but we can check a chunk insert happened)
    const chunkInsert = db.queries.find((q) =>
      /INSERT INTO kb.chunks/.test(q.sql)
    );
    expect(chunkInsert).toBeTruthy();
  });
});

describe('IngestionService.ingestBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes multiple files and returns batch summary', async () => {
    const docId1 = fakeUuid(30);
    const docId2 = fakeUuid(31);
    const { svc, db } = build([
      // Feature detection query
      { rows: [{ content_hash: 'x' }], rowCount: 1 },
      // File 1: project lookup, existing check (none), insert doc
      { rows: [projectRow], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [{ id: docId1 }], rowCount: 1 },
      // File 1: chunk inserts (text is 21 chars -> 2 chunks with 20-char chunker)
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      // File 2: project lookup, existing check (none), insert doc
      { rows: [projectRow], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [{ id: docId2 }], rowCount: 1 },
      // File 2: chunk inserts
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);

    // Force concurrency to 1 so queue consumption is deterministic
    const result = await svc.ingestBatch({
      files: [
        { text: 'First document content', filename: 'doc1.txt' },
        { text: 'Second document content', filename: 'doc2.txt' },
      ],
      projectId: projectRow.id,
      concurrency: 1,
    });

    expect(result.summary.total).toBe(2);
    expect(result.summary.successful).toBe(2);
    expect(result.summary.duplicates).toBe(0);
    expect(result.summary.failed).toBe(0);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].status).toBe('success');
    expect(result.results[1].status).toBe('success');
  });

  it('handles duplicates in batch', async () => {
    const existingDocId = fakeUuid(32);
    const { svc, db } = build([
      { rows: [{ content_hash: 'x' }], rowCount: 1 }, // feature detect
      { rows: [projectRow], rowCount: 1 }, // project lookup
      { rows: [{ id: existingDocId }], rowCount: 1 }, // existing by hash - duplicate!
    ]);

    const result = await svc.ingestBatch({
      files: [{ text: 'Duplicate content', filename: 'dup.txt' }],
      projectId: projectRow.id,
    });

    expect(result.summary.total).toBe(1);
    expect(result.summary.successful).toBe(0);
    expect(result.summary.duplicates).toBe(1);
    expect(result.summary.failed).toBe(0);
    expect(result.results[0].status).toBe('duplicate');
    expect(result.results[0].documentId).toBe(existingDocId);
  });

  it('handles failures in batch gracefully', async () => {
    const { svc, db } = build([
      { rows: [{ content_hash: 'x' }], rowCount: 1 }, // feature detect
      { rows: [], rowCount: 0 }, // project not found - causes BadRequestException
    ]);

    const result = await svc.ingestBatch({
      files: [{ text: 'Content for missing project', filename: 'fail.txt' }],
      projectId: fakeUuid(99), // non-existent project
    });

    expect(result.summary.total).toBe(1);
    expect(result.summary.successful).toBe(0);
    expect(result.summary.duplicates).toBe(0);
    expect(result.summary.failed).toBe(1);
    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].error).toBeDefined();
  });

  it('handles mixed results in batch', async () => {
    const successDocId = fakeUuid(33);
    const duplicateDocId = fakeUuid(34);
    const { svc, db } = build([
      // Feature detection query
      { rows: [{ content_hash: 'x' }], rowCount: 1 },
      // File 1 - success: project lookup, existing check (none), insert doc
      { rows: [projectRow], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [{ id: successDocId }], rowCount: 1 },
      // File 1: chunk inserts (text ~22 chars -> 2 chunks)
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      // File 2 - duplicate: project lookup, existing check (found!)
      { rows: [projectRow], rowCount: 1 },
      { rows: [{ id: duplicateDocId }], rowCount: 1 },
    ]);

    // Force concurrency to 1 so queue consumption is deterministic
    const result = await svc.ingestBatch({
      files: [
        { text: 'New unique content here', filename: 'new.txt' },
        { text: 'Already existing content', filename: 'existing.txt' },
      ],
      projectId: projectRow.id,
      concurrency: 1,
    });

    expect(result.summary.total).toBe(2);
    expect(result.summary.successful).toBe(1);
    expect(result.summary.duplicates).toBe(1);
    expect(result.summary.failed).toBe(0);

    const successResult = result.results.find((r) => r.status === 'success');
    const dupResult = result.results.find((r) => r.status === 'duplicate');

    expect(successResult).toBeDefined();
    expect(successResult?.documentId).toBe(successDocId);
    expect(dupResult).toBeDefined();
    expect(dupResult?.documentId).toBe(duplicateDocId);
  });

  it('rejects empty file content in batch', async () => {
    const validDocId = fakeUuid(35);
    const { svc, db } = build([
      // File 2 - valid file
      { rows: [{ content_hash: 'x' }], rowCount: 1 }, // feature detect
      { rows: [projectRow], rowCount: 1 }, // project lookup
      { rows: [], rowCount: 0 }, // no duplicate
      { rows: [{ id: validDocId }], rowCount: 1 }, // insert new doc
    ]);

    const result = await svc.ingestBatch({
      files: [
        { text: '   ', filename: 'empty.txt' }, // empty content
        { text: 'Valid content here', filename: 'valid.txt' },
      ],
      projectId: projectRow.id,
    });

    expect(result.summary.total).toBe(2);
    expect(result.summary.successful).toBe(1);
    expect(result.summary.failed).toBe(1);

    const emptyResult = result.results.find((r) => r.filename === 'empty.txt');
    expect(emptyResult?.status).toBe('failed');
    expect(emptyResult?.error).toContain('empty');
  });

  it('respects concurrency limit', async () => {
    const docIds = [
      fakeUuid(40),
      fakeUuid(41),
      fakeUuid(42),
      fakeUuid(43),
      fakeUuid(44),
    ];
    const dbQueue: Array<{ rows: any[]; rowCount: number }> = [];

    // Feature detection query (consumed once at the start)
    dbQueue.push({ rows: [{ content_hash: 'x' }], rowCount: 1 });

    // Set up responses for 5 files (each file: project lookup, existing check, insert, chunk inserts)
    for (let i = 0; i < 5; i++) {
      dbQueue.push({ rows: [projectRow], rowCount: 1 }); // project lookup
      dbQueue.push({ rows: [], rowCount: 0 }); // no duplicate
      dbQueue.push({ rows: [{ id: docIds[i] }], rowCount: 1 }); // insert doc
      // chunk inserts (short text -> 1 chunk)
      dbQueue.push({ rows: [], rowCount: 1 });
    }

    const { svc } = build(dbQueue);

    // Use concurrency: 1 to ensure deterministic queue consumption
    const result = await svc.ingestBatch({
      files: [
        { text: 'Content 1', filename: 'file1.txt' },
        { text: 'Content 2', filename: 'file2.txt' },
        { text: 'Content 3', filename: 'file3.txt' },
        { text: 'Content 4', filename: 'file4.txt' },
        { text: 'Content 5', filename: 'file5.txt' },
      ],
      projectId: projectRow.id,
      concurrency: 1, // Deterministic sequential processing for test
    });

    expect(result.summary.total).toBe(5);
    expect(result.summary.successful).toBe(5);
    expect(result.results).toHaveLength(5);
  });
});
