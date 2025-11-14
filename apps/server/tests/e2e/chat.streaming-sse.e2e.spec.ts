import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// SSE streaming test for GET /chat/:id/stream
// Verifies:
//  - 200 status and text/event-stream content type
//  - Emits deterministic token sequence token-0..token-4 followed by a DONE frame
//  - Each frame follows "data: {json}\n\n" format
//  - Final frame contains done: true and message: '[DONE]'
//  - Conversation id may be arbitrary (endpoint currently does not validate existence)

let ctx: E2EContext;

describe('Chat Streaming SSE E2E', () => {
  beforeAll(async () => {
    ctx = await createE2EContext('chat-sse');
  });
  beforeAll(() => {
    process.env.CHAT_TEST_DETERMINISTIC = '1';
  });
  beforeEach(async () => {
    await ctx.cleanup();
  });
  afterAll(async () => {
    delete process.env.CHAT_TEST_DETERMINISTIC;
    await ctx.close();
  });

  it('streams deterministic token frames then DONE', async () => {
    // Create a conversation first (required after validation tightening)
    const createRes = await fetch(`${ctx.baseUrl}/chat/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader('all', 'chat-sse'),
        'x-org-id': ctx.orgId,
        'x-project-id': ctx.projectId,
      },
      body: JSON.stringify({
        message: 'Hello streaming test',
        isPrivate: false,
      }),
    });
    expect(createRes.status).toBe(201);
    const createJson = await createRes.json();
    const convoId = createJson.conversationId as string;
    const res = await fetch(`${ctx.baseUrl}/chat/${convoId}/stream`, {
      headers: {
        ...authHeader('all', 'chat-sse'),
        'x-org-id': ctx.orgId,
        'x-project-id': ctx.projectId,
      },
    });
    expect(res.status).toBe(200);
    const ctype = res.headers.get('content-type') || '';
    expect(ctype.includes('text/event-stream')).toBe(true);
    const body = await res.text();
    // Split on double newlines which terminate SSE events
    const rawEvents = body.split(/\n\n/).filter((e) => e.trim().length > 0);
    // Parse lines starting with data:
    const payloads = rawEvents.map((ev) => {
      const m = ev.match(/^data: (.*)$/m);
      expect(m, `Event missing data: prefix -> ${ev}`).toBeTruthy();
      try {
        return JSON.parse(m![1]);
      } catch (err) {
        throw new Error(`Invalid JSON in SSE frame: ${m![1]} (${err})`);
      }
    });
    // Expect at least 7 frames now: 5 tokens + summary + done (+ optional citations)
    expect(payloads.length).toBeGreaterThanOrEqual(7);
    const tokens = payloads.filter(
      (p) => p.message && p.message.startsWith('token-')
    );
    for (let i = 0; i < 5; i++) {
      const frame = tokens.find(
        (t) => t.message && t.message.trim() === `token-${i}`
      );
      expect(frame).toBeTruthy();
      if (frame) {
        expect(frame.index).toBe(i);
        expect(frame.total).toBe(5);
      }
    }
    const summary = payloads.find((p) => p.summary === true);
    expect(summary).toBeTruthy();
    if (summary) {
      expect(summary.token_count).toBe(5);
      expect(typeof summary.citations_count).toBe('number');
      expect(summary.citations_count).toBeGreaterThanOrEqual(0);
    }
    const done = payloads.find((p) => p.done === true);
    expect(done).toBeTruthy();
    if (done) expect(done.message).toBe('[DONE]');
  });
});
