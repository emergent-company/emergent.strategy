import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import {
  createConversation,
  streamConversation,
  assertDeterministicOrdering,
} from './utils/chat';

let ctx: E2EContext;

describe('Chat Streaming Ordering', () => {
  beforeAll(async () => {
    ctx = await createE2EContext('chat-sse-order');
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

  it('emits frames in deterministic order (tokens -> citations? -> summary -> done)', async () => {
    const convo = await createConversation(ctx, 'Ordering test', {
      isPrivate: false,
      userSuffix: 'chat-sse-order',
    });
    const stream = await streamConversation(ctx, convo.conversationId, {
      userSuffix: 'chat-sse-order',
    });
    // Basic sanity expectations mirrored from original test
    expect(stream.errors.length).toBe(0);
    expect(stream.tokens.length).toBe(5);
    assertDeterministicOrdering(stream, 5);
  });
});
