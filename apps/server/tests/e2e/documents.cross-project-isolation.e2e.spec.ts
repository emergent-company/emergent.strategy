import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

// Ensures documents are not accessible across projects (GET + DELETE should 404/403 when mismatched project headers or unauthorized project).

let ctxA: E2EContext;
let ctxB: E2EContext;

describe('Documents Cross-Project Isolation E2E', () => {
  beforeAll(async () => {
    ctxA = await createE2EContext('docs-x-a');
    ctxB = await createE2EContext('docs-x-b');
  });
  beforeEach(async () => {
    await ctxA.cleanup();
    await ctxB.cleanup();
  });
  afterAll(async () => {
    await ctxA.close();
    await ctxB.close();
  });

  async function createDoc(ctx: E2EContext, label: string) {
    const res = await fetch(`${ctx.baseUrl}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader('all', label),
        'x-project-id': ctx.projectId,
      },
      body: JSON.stringify({
        filename: `${label}.txt`,
        content: 'secret',
        projectId: ctx.projectId,
      }),
    });
    expectStatusOneOf(res.status, [200, 201], 'create doc cross-project');
    const json = await res.json();
    return json.id as string;
  }

  it('prevents accessing document from another project', async () => {
    const docId = await createDoc(ctxA, 'docs-x-a');

    const getOther = await fetch(`${ctxB.baseUrl}/documents/${docId}`, {
      headers: {
        ...authHeader('all', 'docs-x-b'),
        'x-project-id': ctxB.projectId,
        'x-org-id': ctxB.orgId,
      },
    });
    expect([403, 404]).toContain(getOther.status);

    const delOther = await fetch(`${ctxB.baseUrl}/documents/${docId}`, {
      method: 'DELETE',
      headers: {
        ...authHeader('all', 'docs-x-b'),
        'x-project-id': ctxB.projectId,
        'x-org-id': ctxB.orgId,
      },
    });
    expect([403, 404]).toContain(delOther.status);

    // Owner project can still get & delete
    const getOwn = await fetch(`${ctxA.baseUrl}/documents/${docId}`, {
      headers: {
        ...authHeader('all', 'docs-x-a'),
        'x-project-id': ctxA.projectId,
        'x-org-id': ctxA.orgId,
      },
    });
    expect(getOwn.status).toBe(200);
    const delOwn = await fetch(`${ctxA.baseUrl}/documents/${docId}`, {
      method: 'DELETE',
      headers: {
        ...authHeader('all', 'docs-x-a'),
        'x-project-id': ctxA.projectId,
        'x-org-id': ctxA.orgId,
      },
    });
    expect([200, 204]).toContain(delOwn.status);
  });

  it('RLS filters document list by project - only shows own project documents', async () => {
    // Create 1 document in project A
    const docA1 = await createDoc(ctxA, 'docs-x-a-rls-1');

    // Create 1 document in project B
    const docB1 = await createDoc(ctxB, 'docs-x-b-rls-1');

    // List documents with project A context - should only see A's documents
    const listA = await fetch(`${ctxA.baseUrl}/documents`, {
      headers: {
        ...authHeader('all', 'docs-x-a'),
        'x-project-id': ctxA.projectId,
        'x-org-id': ctxA.orgId,
      },
    });
    expect(listA.status).toBe(200);
    const docsA = await listA.json();
    expect(Array.isArray(docsA)).toBe(true);
    expect(docsA.length).toBe(1);
    const idsA = docsA.map((d: any) => d.id);
    expect(idsA).toContain(docA1);
    expect(idsA).not.toContain(docB1); // ✅ Project B document should NOT be visible

    // List documents with project B context - should only see B's documents
    const listB = await fetch(`${ctxB.baseUrl}/documents`, {
      headers: {
        ...authHeader('all', 'docs-x-b'),
        'x-project-id': ctxB.projectId,
        'x-org-id': ctxB.orgId,
      },
    });
    expect(listB.status).toBe(200);
    const docsB = await listB.json();
    expect(Array.isArray(docsB)).toBe(true);
    expect(docsB.length).toBe(1);
    const idsB = docsB.map((d: any) => d.id);
    expect(idsB).toContain(docB1);
    expect(idsB).not.toContain(docA1); // ✅ Project A documents should NOT be visible

    // Verify all documents have correct projectId field
    docsA.forEach((doc: any) => {
      expect(doc.projectId).toBe(ctxA.projectId);
    });
    docsB.forEach((doc: any) => {
      expect(doc.projectId).toBe(ctxB.projectId);
    });
  });
});
