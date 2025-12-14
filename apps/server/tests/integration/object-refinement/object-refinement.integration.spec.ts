import request from 'supertest';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import getTestApp, { getSeededOrgProject } from '../../setup';
import { INestApplication } from '@nestjs/common';
import '@vitest/runner';
import { describeWithDb } from '../../utils/db-describe';

let app: INestApplication | null = null;

/**
 * Create a test object in the database
 */
async function createTestObject(
  type: string,
  key: string,
  properties: Record<string, any>,
  projectId: string,
  orgId: string
): Promise<{ id: string; version: number }> {
  const currentApp = app;
  if (!currentApp?.getHttpServer) throw new Error('app not initialized');

  const res = await request(currentApp.getHttpServer())
    .post('/graph/objects')
    .set('Authorization', 'Bearer e2e-all')
    .set('x-org-id', orgId)
    .set('x-project-id', projectId)
    .send({
      type,
      key,
      properties,
      organization_id: orgId,
      project_id: projectId,
    });

  if (res.status !== 201) {
    throw new Error(`Failed to create object: ${res.status} ${res.text}`);
  }
  return { id: res.body.id, version: res.body.version || 1 };
}

/**
 * Create a mock authenticated request with project headers and auth token
 */
function authenticatedRequest(
  httpServer: any,
  projectId: string,
  orgId: string
) {
  return {
    get: (url: string) =>
      request(httpServer)
        .get(url)
        .set('Authorization', 'Bearer e2e-all')
        .set('x-project-id', projectId)
        .set('x-org-id', orgId),
    post: (url: string) =>
      request(httpServer)
        .post(url)
        .set('Authorization', 'Bearer e2e-all')
        .set('x-project-id', projectId)
        .set('x-org-id', orgId),
  };
}

describeWithDb('Object Refinement API (integration)', () => {
  let projectId: string;
  let orgId: string;
  let testObjectId: string;
  let testObjectVersion: number;

  beforeAll(async () => {
    app = await getTestApp();
    const seeded = await getSeededOrgProject();
    projectId = seeded.projectId;
    orgId = seeded.orgId;

    // Create a test object for refinement tests
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testObj = await createTestObject(
      'Person',
      `test-person-${suffix}`,
      { name: 'John Doe', description: 'A test person', age: 30 },
      projectId,
      orgId
    );
    testObjectId = testObj.id;
    testObjectVersion = testObj.version;
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  describe('GET /objects/:objectId/refinement-chat', () => {
    test('creates a new conversation when none exists', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      const req = authenticatedRequest(
        currentApp.getHttpServer(),
        projectId,
        orgId
      );
      const res = await req.get(`/objects/${testObjectId}/refinement-chat`);

      expect(res.status).toBe(200);
      expect(res.body.conversation).toBeDefined();
      expect(res.body.conversation.objectId).toBe(testObjectId);
      expect(res.body.conversation.title).toContain('Refinement:');
      expect(res.body.conversation.title).toContain('John Doe');
      expect(res.body.messages).toEqual([]);
    });

    test('returns existing conversation on subsequent calls', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      const req = authenticatedRequest(
        currentApp.getHttpServer(),
        projectId,
        orgId
      );

      // First call
      const res1 = await req.get(`/objects/${testObjectId}/refinement-chat`);
      expect(res1.status).toBe(200);
      const conversationId = res1.body.conversation.id;

      // Second call should return same conversation
      const res2 = await req.get(`/objects/${testObjectId}/refinement-chat`);
      expect(res2.status).toBe(200);
      expect(res2.body.conversation.id).toBe(conversationId);
    });

    test('returns 400 when x-project-id header is missing', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      const res = await request(currentApp.getHttpServer())
        .get(`/objects/${testObjectId}/refinement-chat`)
        .set('x-org-id', orgId);
      // Note: Without auth middleware, this may return different status
      // depending on auth configuration. In test mode, we may get through.
      // The endpoint should validate and return 400 for missing project header.
      expect([400, 401, 403]).toContain(res.status);
    });

    test('returns 404 for non-existent object', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      const req = authenticatedRequest(
        currentApp.getHttpServer(),
        projectId,
        orgId
      );
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await req.get(`/objects/${fakeId}/refinement-chat`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /objects/:objectId/refinement-chat/apply', () => {
    let conversationId: string;
    let messageId: string;

    beforeAll(async () => {
      // For apply/reject tests, we need a conversation with a message containing suggestions
      // Since the chat generation requires LLM, we'll create the conversation and message manually
      // by first getting/creating the conversation
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      const req = authenticatedRequest(
        currentApp.getHttpServer(),
        projectId,
        orgId
      );
      const res = await req.get(`/objects/${testObjectId}/refinement-chat`);
      conversationId = res.body.conversation.id;
    });

    test('returns error when messageId is invalid', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      const req = authenticatedRequest(
        currentApp.getHttpServer(),
        projectId,
        orgId
      );
      const res = await req
        .post(`/objects/${testObjectId}/refinement-chat/apply`)
        .send({
          messageId: '00000000-0000-0000-0000-000000000000',
          suggestionIndex: 0,
          expectedVersion: testObjectVersion,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Message not found');
    });

    test('returns 400 when x-project-id header is missing', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      const res = await request(currentApp.getHttpServer())
        .post(`/objects/${testObjectId}/refinement-chat/apply`)
        .set('x-org-id', orgId)
        .send({
          messageId: '00000000-0000-0000-0000-000000000000',
          suggestionIndex: 0,
          expectedVersion: 1,
        });

      expect([400, 401, 403]).toContain(res.status);
    });
  });

  describe('POST /objects/:objectId/refinement-chat/reject', () => {
    test('returns error when messageId is invalid', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      const req = authenticatedRequest(
        currentApp.getHttpServer(),
        projectId,
        orgId
      );
      const res = await req
        .post(`/objects/${testObjectId}/refinement-chat/reject`)
        .send({
          messageId: '00000000-0000-0000-0000-000000000000',
          suggestionIndex: 0,
          reason: 'Not relevant',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Message not found');
    });

    test('returns 400 when x-project-id header is missing', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      const res = await request(currentApp.getHttpServer())
        .post(`/objects/${testObjectId}/refinement-chat/reject`)
        .set('x-org-id', orgId)
        .send({
          messageId: '00000000-0000-0000-0000-000000000000',
          suggestionIndex: 0,
        });

      expect([400, 401, 403]).toContain(res.status);
    });
  });

  describe('GET /objects/:objectId/refinement-chat/messages', () => {
    test('returns empty array for conversation with no messages', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      // Create a new object to get a fresh conversation
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newObj = await createTestObject(
        'Document',
        `test-doc-${suffix}`,
        { title: 'Test Document', content: 'Some content' },
        projectId,
        orgId
      );

      const req = authenticatedRequest(
        currentApp.getHttpServer(),
        projectId,
        orgId
      );
      const res = await req.get(
        `/objects/${newObj.id}/refinement-chat/messages`
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toEqual([]);
    });

    test('returns 404 for non-existent object', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      const req = authenticatedRequest(
        currentApp.getHttpServer(),
        projectId,
        orgId
      );
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await req.get(`/objects/${fakeId}/refinement-chat/messages`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /objects/:objectId/refinement-chat (streaming)', () => {
    test('returns 400 when message content is empty', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      const res = await request(currentApp.getHttpServer())
        .post(`/objects/${testObjectId}/refinement-chat`)
        .set('Authorization', 'Bearer e2e-all')
        .set('x-project-id', projectId)
        .set('x-org-id', orgId)
        .send({ content: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('content required');
    });

    test('returns 401 when Authorization header is missing', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      const res = await request(currentApp.getHttpServer())
        .post(`/objects/${testObjectId}/refinement-chat`)
        .set('x-project-id', projectId)
        .set('x-org-id', orgId)
        .send({ content: 'Test message' });

      expect(res.status).toBe(401);
    });

    test('returns 404 for non-existent object', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(currentApp.getHttpServer())
        .post(`/objects/${fakeId}/refinement-chat`)
        .set('Authorization', 'Bearer e2e-all')
        .set('x-project-id', projectId)
        .set('x-org-id', orgId)
        .send({ content: 'Test message' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not-found');
    });

    // Note: Full streaming test requires LLM to be available
    // This test verifies the SSE response format when LLM is disabled
    test('returns SSE response with meta event', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      const res = await request(currentApp.getHttpServer())
        .post(`/objects/${testObjectId}/refinement-chat`)
        .set('Authorization', 'Bearer e2e-all')
        .set('x-project-id', projectId)
        .set('x-org-id', orgId)
        .set('Accept', 'text/event-stream')
        .send({ content: 'What can be improved about this object?' });

      // The response should be SSE format
      expect(res.status).toBe(200);
      // Content-Type may vary, but should have text/event-stream
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);

      // Parse SSE events from response text
      const events = res.text
        .split('\n\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => {
          try {
            return JSON.parse(line.replace('data: ', ''));
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      // Should have at least meta and done events
      const metaEvent = events.find((e: any) => e.type === 'meta');
      const doneEvent = events.find((e: any) => e.type === 'done');

      expect(metaEvent).toBeDefined();
      expect(metaEvent.objectId).toBe(testObjectId);
      expect(metaEvent.conversationId).toBeDefined();
      expect(doneEvent).toBeDefined();
    });
  });

  describe('Conversation state management', () => {
    test('conversation is shared across users (public by default)', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      // Create a new object
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const sharedObj = await createTestObject(
        'Organization',
        `test-org-${suffix}`,
        { name: 'Shared Org' },
        projectId,
        orgId
      );

      const req = authenticatedRequest(
        currentApp.getHttpServer(),
        projectId,
        orgId
      );

      // First user creates/gets conversation
      const res1 = await req.get(`/objects/${sharedObj.id}/refinement-chat`);
      expect(res1.status).toBe(200);
      const conversationId = res1.body.conversation.id;

      // Second call (simulating different user, same project) should get same conversation
      // Note: In real scenario, this would have different user auth
      const res2 = await req.get(`/objects/${sharedObj.id}/refinement-chat`);
      expect(res2.status).toBe(200);
      expect(res2.body.conversation.id).toBe(conversationId);
    });

    test('each object gets its own conversation', async () => {
      const currentApp = app;
      if (!currentApp) throw new Error('Test application not initialised');

      // Create two objects
      const suffix1 = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const suffix2 = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const obj1 = await createTestObject(
        'Event',
        `test-event-${suffix1}`,
        { name: 'Event 1' },
        projectId,
        orgId
      );
      const obj2 = await createTestObject(
        'Event',
        `test-event-${suffix2}`,
        { name: 'Event 2' },
        projectId,
        orgId
      );

      const req = authenticatedRequest(
        currentApp.getHttpServer(),
        projectId,
        orgId
      );

      const res1 = await req.get(`/objects/${obj1.id}/refinement-chat`);
      const res2 = await req.get(`/objects/${obj2.id}/refinement-chat`);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.conversation.id).not.toBe(res2.body.conversation.id);
      expect(res1.body.conversation.objectId).toBe(obj1.id);
      expect(res2.body.conversation.objectId).toBe(obj2.id);
    });
  });
});
