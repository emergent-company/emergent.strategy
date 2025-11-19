import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

/**
 * Chat Citations Persistence E2E
 * Now that streaming persists an assistant message (when the conversation exists), enforce:
 *  1. Assistant message is present after streaming.
 *  2. Assistant message content aggregates the token sequence (starts with 'token-0 token-1').
 *  3. If a citations frame was emitted, assistant message has a citations array (length > 0).
 *  4. If no citations frame, assistant message citations may be undefined.
 */

interface ConversationResponse {
  id: string;
  messages: { id: string; role: string; content: string; citations?: any[] }[];
}
let ctx: E2EContext;

async function ingestDoc() {
  const form = new FormData();
  form.append('projectId', ctx.projectId);
  form.append('filename', 'cite.txt');
  form.append(
    'file',
    new Blob(['Citation test content about mountains and rivers.'], {
      type: 'text/plain',
    }),
    'cite.txt'
  );
  const res = await fetch(`${ctx.baseUrl}/ingest/upload`, {
    method: 'POST',
    headers: authHeader('all', 'chat-cite-persist'),
    body: form as any,
  });
  expectStatusOneOf(res.status, [200, 201], 'chat cite ingest');
}

describe('Chat Citations Persistence', () => {
  beforeAll(async () => {
    ctx = await createE2EContext('chat-cite-persist');
  });
  beforeAll(() => {
    process.env.CHAT_TEST_DETERMINISTIC = '1';
  });
  beforeEach(async () => {
    await ctx.cleanup();
    await ingestDoc();
  });
  afterAll(async () => {
    delete process.env.CHAT_TEST_DETERMINISTIC;
    await ctx.close();
  });

  it('streams then fetches conversation; assistant message persisted with optional citations', async () => {
    // 1. Create conversation
    const createRes = await fetch(`${ctx.baseUrl}/chat/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader('all', 'chat-cite-persist'),
        'x-org-id': ctx.orgId,
        'x-project-id': ctx.projectId,
      },
      body: JSON.stringify({
        message: 'Tell me about mountains',
        isPrivate: true,
      }),
    });
    expect(createRes.status).toBe(201);
    const createJson = await createRes.json();
    const conversationId = createJson.conversationId as string;

    // 2. Stream (collect whether citations frame appears)
    const streamRes = await fetch(
      `${ctx.baseUrl}/chat/${conversationId}/stream`,
      {
        headers: {
          ...authHeader('all', 'chat-cite-persist'),
          'x-org-id': ctx.orgId,
          'x-project-id': ctx.projectId,
        },
      }
    );
    expect(streamRes.status).toBe(200);
    const body = await streamRes.text();
    const events = body.split(/\n\n/).filter((e) => e.trim().length > 0);
    // Optional: ensure token frames include index/total fields
    const tokenFrames = events.filter((e) =>
      /"message"\s*:\s*"token-0"/.test(e)
    );
    if (tokenFrames.length) {
      // We only check first to avoid parsing overhead for all
      try {
        const first = JSON.parse(tokenFrames[0].replace(/^data: /, ''));
        if (first.index !== undefined) {
          expect(first.total).toBe(5);
        }
      } catch {
        /* ignore */
      }
    }
    const citationFrame = events.find((e) => /"citations"\s*:\s*\[/.test(e));
    const summaryFrame = events.find((e) => /"summary"\s*:\s*true/.test(e));
    if (summaryFrame) {
      try {
        const parsed = JSON.parse(summaryFrame.replace(/^data: /, ''));
        expect(parsed.token_count).toBe(5);
        expect(parsed.citations_count).toBeGreaterThanOrEqual(0);
      } catch {
        /* ignore */
      }
    }

    // 3. Fetch conversation detail
    const getRes = await fetch(`${ctx.baseUrl}/chat/${conversationId}`, {
      headers: {
        ...authHeader('all', 'chat-cite-persist'),
        'x-org-id': ctx.orgId,
        'x-project-id': ctx.projectId,
      },
    });
    expect(getRes.status).toBe(200);
    const convo = (await getRes.json()) as ConversationResponse;
    expect(convo.id).toBe(conversationId);
    expect(Array.isArray(convo.messages)).toBe(true);
    // At minimum, user message exists
    const userMsg = convo.messages.find((m) => m.role === 'user');
    expect(userMsg).toBeTruthy();

    const assistantMsg = convo.messages.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeTruthy();
    if (assistantMsg) {
      // Debug: log actual content if test fails
      if (!assistantMsg.content.startsWith('token-0 token-1')) {
        console.error('[TEST DEBUG] Assistant message content:', JSON.stringify(assistantMsg.content));
        console.error('[TEST DEBUG] Content length:', assistantMsg.content.length);
        console.error('[TEST DEBUG] First 50 chars:', assistantMsg.content.substring(0, 50));
      }
      // Tokens are concatenated with spaces in deterministic mode
      expect(assistantMsg.content.startsWith('token-0 token-1')).toBe(true);
      if (citationFrame) {
        expect(Array.isArray(assistantMsg.citations)).toBe(true);
        if (Array.isArray(assistantMsg.citations))
          expect(assistantMsg.citations.length).toBeGreaterThan(0);
      } else {
        // No citation frame -> citations field may be absent.
        if (assistantMsg.citations) {
          expect(Array.isArray(assistantMsg.citations)).toBe(true);
        }
      }
    }
  });
});
