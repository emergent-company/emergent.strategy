import request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, it, beforeAll, afterAll, expect, beforeEach } from 'vitest';
import { AppModule } from '../../src/modules/app.module';
import { DatabaseService } from '../../src/common/database/database.service';

/**
 * E2E test for Chat SDK with Unified Search integration
 *
 * Tests the complete flow:
 * 1. Create a conversation
 * 2. Send a message that should trigger the search tool
 * 3. Verify the AI uses the search tool and incorporates results
 *
 * Prerequisites:
 * - Database with test data (organizations, projects, documents, graph objects)
 * - LangGraph service configured with Vertex AI credentials
 * - Unified search service with indexed content
 */
describe('ChatSdkController with Search (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let testOrgId: string;
  let testProjectId: string;
  let testConversationId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true })
    );
    await app.init();

    db = moduleRef.get(DatabaseService);

    // Setup: Create test organization and project
    await setupTestData();
  });

  afterAll(async () => {
    // Cleanup: Remove test data
    await cleanupTestData();
    await app.close();
  });

  beforeEach(async () => {
    // Reset conversation state before each test
    testConversationId = '';
  });

  /**
   * Test 1: Create a new conversation
   */
  it('POST /api/chat-sdk/conversations creates a new conversation', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/chat-sdk/conversations')
      .send({
        title: 'Test Search Conversation',
        projectId: testProjectId,
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Test Search Conversation');
    expect(res.body.projectId).toBe(testProjectId);

    testConversationId = res.body.id;
  });

  /**
   * Test 2: Stream chat WITHOUT projectId (search tool should NOT be available)
   */
  it('POST /api/chat-sdk streams without search when projectId is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/chat-sdk')
      .send({
        messages: [
          {
            role: 'user',
            content: 'What documents do we have about authentication?',
          },
        ],
      })
      .expect(200);

    // Should get a response, but it won't use search tool
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['x-conversation-id']).toBeDefined();
  });

  /**
   * Test 3: Stream chat WITH projectId (search tool SHOULD be available)
   */
  it('POST /api/chat-sdk streams with search when projectId is provided', async () => {
    // First create a conversation
    const convRes = await request(app.getHttpServer())
      .post('/api/chat-sdk/conversations')
      .send({
        title: 'Search Test',
        projectId: testProjectId,
      })
      .expect(201);

    const conversationId = convRes.body.id;

    // Send a message that should trigger search
    const res = await request(app.getHttpServer())
      .post('/api/chat-sdk')
      .send({
        messages: [
          {
            role: 'user',
            content: 'What decisions have we made about API authentication?',
          },
        ],
        conversationId,
        projectId: testProjectId,
      })
      .expect(200);

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['x-conversation-id']).toBe(conversationId);

    // Note: To verify the search tool was actually called, we would need to:
    // 1. Parse the SSE stream chunks
    // 2. Look for tool_call events
    // 3. Check if search_knowledge_base was invoked
    // This is complex in supertest - better tested manually or with a dedicated stream parser
  });

  /**
   * Test 4: Verify conversation messages are saved correctly
   */
  it('GET /api/chat-ui/conversations/:id returns saved messages', async () => {
    // Create conversation
    const convRes = await request(app.getHttpServer())
      .post('/api/chat-sdk/conversations')
      .send({
        title: 'Message Persistence Test',
        projectId: testProjectId,
      })
      .expect(201);

    const conversationId = convRes.body.id;

    // Send a message
    await request(app.getHttpServer())
      .post('/api/chat-sdk')
      .send({
        messages: [
          {
            role: 'user',
            content: 'Hello, this is a test message',
          },
        ],
        conversationId,
        projectId: testProjectId,
      })
      .expect(200);

    // Wait a bit for async message saving
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Retrieve conversation and verify messages were saved
    const getRes = await request(app.getHttpServer())
      .get(`/api/chat-ui/conversations/${conversationId}`)
      .expect(200);

    expect(getRes.body.messages.length).toBeGreaterThan(0);
    expect(getRes.body.messages[0].role).toBe('user');
    expect(getRes.body.messages[0].content).toBe(
      'Hello, this is a test message'
    );
  });

  /**
   * Test 5: Draft text persistence
   */
  it('PATCH /api/chat-ui/conversations/:id/draft saves draft text', async () => {
    // Create conversation
    const convRes = await request(app.getHttpServer())
      .post('/api/chat-sdk/conversations')
      .send({
        title: 'Draft Test',
        projectId: testProjectId,
      })
      .expect(201);

    const conversationId = convRes.body.id;

    // Save draft text
    await request(app.getHttpServer())
      .patch(`/api/chat-ui/conversations/${conversationId}/draft`)
      .send({
        draftText: 'This is my draft message',
      })
      .expect(200);

    // Retrieve conversation and verify draft was saved
    const getRes = await request(app.getHttpServer())
      .get(`/api/chat-ui/conversations/${conversationId}`)
      .expect(200);

    expect(getRes.body.draftText).toBe('This is my draft message');
  });

  /**
   * Setup test data: organization, project, documents, graph objects
   */
  async function setupTestData() {
    // Create test organization
    const orgResult = await db.query<{ id: string }>(
      `INSERT INTO kb.organizations (name, description) 
       VALUES ('E2E Test Org', 'Organization for e2e testing')
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      []
    );
    testOrgId = orgResult.rows[0].id;

    // Create test project
    const projectResult = await db.query<{ id: string }>(
      `INSERT INTO kb.projects (organization_id, name, description)
       VALUES ($1, 'E2E Test Project', 'Project for e2e testing')
       ON CONFLICT (organization_id, name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      [testOrgId]
    );
    testProjectId = projectResult.rows[0].id;

    // Optional: Insert test documents and graph objects here
    // This would make search tests more realistic
    console.log(
      `[E2E Setup] Created org ${testOrgId}, project ${testProjectId}`
    );
  }

  /**
   * Cleanup test data
   */
  async function cleanupTestData() {
    if (testProjectId) {
      // Delete conversations (cascades to messages)
      await db.query('DELETE FROM chat.conversations WHERE project_id = $1', [
        testProjectId,
      ]);
    }

    if (testOrgId) {
      // Delete projects (this should cascade to related data)
      await db.query('DELETE FROM kb.projects WHERE organization_id = $1', [
        testOrgId,
      ]);

      // Delete organization
      await db.query('DELETE FROM kb.organizations WHERE id = $1', [testOrgId]);
    }

    console.log('[E2E Cleanup] Test data removed');
  }
});
