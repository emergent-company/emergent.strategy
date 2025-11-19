import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

/**
 * E2E test for document duplicate detection and "disappearing document" bug
 *
 * This test specifically targets the bug where:
 * 1. User uploads a document to an empty project
 * 2. Backend returns alreadyExists=true with a document ID
 * 3. Frontend shows empty list (document "disappeared")
 *
 * Root cause hypothesis:
 * - Document exists in database with content_hash
 * - Upload to same project detects duplicate correctly
 * - But document list query might have different project_id filter
 * - Or document has wrong project_id in database
 */

let ctx: E2EContext;
let ctx2: E2EContext;

interface IngestResponse {
  documentId?: string;
  id?: string;
  chunks?: number;
  alreadyExists?: boolean;
}

interface Document {
  id: string;
  filename?: string;
  name?: string;
  projectId?: string;
  content_hash?: string;
}

const testDocumentContent = `# Test Document

This is a test document for duplicate detection.

## People
- Alice Johnson works at Tech Corp
- Bob Smith is the CTO

## Locations
- Seattle office
- Portland headquarters
`;

async function uploadDocument(
  ctx: E2EContext,
  content: string,
  filename: string
): Promise<{ status: number; json: IngestResponse }> {
  const form = new FormData();
  form.append('projectId', ctx.projectId);
  form.append('filename', filename);
  form.append('file', new Blob([content], { type: 'text/markdown' }), filename);

  const res = await fetch(`${ctx.baseUrl}/ingest/upload`, {
    method: 'POST',
    headers: { ...authHeader('all', 'duplicate-test') },
    body: form as any,
  });

  const json = (await res.json()) as IngestResponse;
  return { status: res.status, json };
}

async function listDocuments(ctx: E2EContext): Promise<Document[]> {
  const res = await fetch(`${ctx.baseUrl}/documents`, {
    method: 'GET',
    headers: {
      ...authHeader('all', 'duplicate-test'),
      'x-project-id': ctx.projectId,
    },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to list documents: ${res.status} ${await res.text()}`
    );
  }

  return await res.json();
}

describe('Document Duplicate Detection - Disappearing Document Bug', () => {
  beforeAll(async () => {
    ctx = await createE2EContext('duplicate-test-1');
    ctx2 = await createE2EContext('duplicate-test-2');
  });

  beforeEach(async () => {
    await ctx.cleanup();
    await ctx2.cleanup();
  });

  afterAll(async () => {
    await ctx.close();
    await ctx2.close();
  });

  describe('Duplicate detection within same project', () => {
    it('should upload new document and list it successfully', async () => {
      // 1. Upload document to empty project
      const uploadRes = await uploadDocument(
        ctx,
        testDocumentContent,
        'test-duplicate.md'
      );

      expectStatusOneOf(uploadRes.status, [200, 201], 'first upload');
      expect(uploadRes.json.alreadyExists).toBeFalsy();

      const docId = uploadRes.json.documentId || uploadRes.json.id;
      expect(docId).toBeTruthy();
      expect(uploadRes.json.chunks).toBeGreaterThan(0);

      // 2. List documents - should contain the uploaded document
      const docs = await listDocuments(ctx);

      expect(docs.length).toBe(1);
      expect(docs[0].id).toBe(docId);
      expect(docs[0].filename || docs[0].name).toBe('test-duplicate.md');
    });

    it('should detect duplicate and still show document in list', async () => {
      // 1. First upload
      const upload1 = await uploadDocument(
        ctx,
        testDocumentContent,
        'test-duplicate.md'
      );
      expectStatusOneOf(upload1.status, [200, 201], 'first upload');
      const docId1 = upload1.json.documentId || upload1.json.id;
      expect(upload1.json.alreadyExists).toBeFalsy();

      // 2. Upload same document again (duplicate)
      const upload2 = await uploadDocument(
        ctx,
        testDocumentContent,
        'test-duplicate.md'
      );
      expectStatusOneOf(upload2.status, [200, 201, 409], 'duplicate upload');

      if (upload2.status !== 409) {
        const docId2 = upload2.json.documentId || upload2.json.id;
        expect(docId2).toBe(docId1); // Same document ID
        expect(upload2.json.alreadyExists).toBe(true);
        expect(upload2.json.chunks).toBe(0); // No new chunks
      }

      // 3. List documents - should still show the document (BUG: it disappears!)
      const docs = await listDocuments(ctx);

      expect(docs.length).toBe(1);
      expect(docs[0].id).toBe(docId1);
      expect(docs[0].filename || docs[0].name).toBe('test-duplicate.md');
    });
  });

  describe('Duplicate detection is project-scoped', () => {
    it('should allow same document in different projects', async () => {
      // Upload to project 1
      const upload1 = await uploadDocument(
        ctx,
        testDocumentContent,
        'test-cross-project.md'
      );
      expectStatusOneOf(upload1.status, [200, 201], 'upload to project 1');
      const docId1 = upload1.json.documentId || upload1.json.id;
      expect(upload1.json.alreadyExists).toBeFalsy();

      // Upload same content to project 2 (should NOT be duplicate)
      const upload2 = await uploadDocument(
        ctx2,
        testDocumentContent,
        'test-cross-project.md'
      );
      expectStatusOneOf(upload2.status, [200, 201], 'upload to project 2');
      const docId2 = upload2.json.documentId || upload2.json.id;

      // Different document IDs
      expect(docId2).not.toBe(docId1);
      expect(upload2.json.alreadyExists).toBeFalsy();
      expect(upload2.json.chunks).toBeGreaterThan(0);

      // Both should be visible in their respective projects
      const docs1 = await listDocuments(ctx);
      const docs2 = await listDocuments(ctx2);

      expect(docs1.length).toBe(1);
      expect(docs1[0].id).toBe(docId1);

      expect(docs2.length).toBe(1);
      expect(docs2[0].id).toBe(docId2);
    });

    it('should not show document from different project in list', async () => {
      // Upload to project 1
      const upload1 = await uploadDocument(
        ctx,
        testDocumentContent,
        'test-isolation.md'
      );
      expectStatusOneOf(upload1.status, [200, 201], 'upload to project 1');
      const docId1 = upload1.json.documentId || upload1.json.id;

      // List documents in project 2 - should NOT include document from project 1
      const docs2 = await listDocuments(ctx2);

      const foundInProject2 = docs2.find((d) => d.id === docId1);
      expect(foundInProject2).toBeUndefined();

      // Verify it IS in project 1
      const docs1 = await listDocuments(ctx);
      const foundInProject1 = docs1.find((d) => d.id === docId1);
      expect(foundInProject1).toBeTruthy();
    });
  });

  describe('Bug reproduction: empty project shows alreadyExists=true', () => {
    it('should NOT report alreadyExists when uploading to truly empty project', async () => {
      // Ensure project is completely empty
      const emptyDocs = await listDocuments(ctx);
      expect(emptyDocs.length).toBe(0);

      // Upload new document
      const upload = await uploadDocument(
        ctx,
        testDocumentContent,
        'test-new.md'
      );
      expectStatusOneOf(upload.status, [200, 201], 'upload to empty project');

      // Should NOT be marked as already exists
      expect(upload.json.alreadyExists).toBeFalsy();
      expect(upload.json.chunks).toBeGreaterThan(0);

      const docId = upload.json.documentId || upload.json.id;
      expect(docId).toBeTruthy();

      // Document should appear in list
      const docs = await listDocuments(ctx);
      expect(docs.length).toBe(1);
      expect(docs[0].id).toBe(docId);
    });
  });
});
