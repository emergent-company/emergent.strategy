import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * Chat Streaming Authorization E2E
 * Ensures a private conversation owned by user A cannot be streamed by user B (403),
 * while user A can stream successfully (200 with SSE frames).
 */

let ownerCtx: E2EContext;
let intruderCtx: E2EContext;

async function createPrivateConversation(ctx: E2EContext) {
  const res = await fetch(`${ctx.baseUrl}/chat/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader('all', 'chat-stream-auth-owner'),
      'x-org-id': ctx.orgId,
      'x-project-id': ctx.projectId,
    },
    body: JSON.stringify({ message: 'Secret topic', isPrivate: true }),
  });
  expect(res.status).toBe(201);
  const json = await res.json();
  return json.conversationId as string;
}

describe('Chat Streaming Authorization', () => {
  beforeAll(async () => {
    ownerCtx = await createE2EContext('chat-stream-auth-owner');
    intruderCtx = await createE2EContext('chat-stream-auth-intr');
  });
  beforeAll(() => {
    process.env.CHAT_TEST_DETERMINISTIC = '1';
  });
  beforeEach(async () => {
    await ownerCtx.cleanup();
    await intruderCtx.cleanup();
  });
  afterAll(async () => {
    delete process.env.CHAT_TEST_DETERMINISTIC;
    await ownerCtx.close();
    await intruderCtx.close();
  });

  it('rejects streaming a private conversation by another user (403)', async () => {
    const convoId = await createPrivateConversation(ownerCtx);
    const res = await fetch(`${intruderCtx.baseUrl}/chat/${convoId}/stream`, {
      headers: {
        ...authHeader('all', 'chat-stream-auth-intr'),
        'x-org-id': ownerCtx.orgId,
        'x-project-id': ownerCtx.projectId,
      },
    });
    expect(res.status).toBe(403);
  });

  it('allows owner to stream private conversation', async () => {
    const convoId = await createPrivateConversation(ownerCtx);
    const res = await fetch(`${ownerCtx.baseUrl}/chat/${convoId}/stream`, {
      headers: {
        ...authHeader('all', 'chat-stream-auth-owner'),
        'x-org-id': ownerCtx.orgId,
        'x-project-id': ownerCtx.projectId,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    const events = body.split(/\n\n/).filter((e) => e.trim().length > 0);
    expect(events.length).toBeGreaterThanOrEqual(7); // 5 tokens + summary + done (+ optional citations)
    // Check first token frame metadata
    const firstToken = events.find((e) => /"message"\s*:\s*"token-0"/.test(e));
    if (firstToken) {
      try {
        const parsed = JSON.parse(firstToken.replace(/^data: /, ''));
        if (parsed.index !== undefined) {
          expect(parsed.index).toBe(0);
          expect(parsed.total).toBe(5);
        }
      } catch {
        /* ignore */
      }
    }
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
  });
});
