import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// Chat Streaming Ordering E2E
// Ensures frame ordering contract:
//  tokens (token-0..token-4 in ascending index) -> optional citations -> summary -> done
//  - No summary before all tokens
//  - No tokens after summary
//  - Done frame is last
//  - If citations frame exists it appears after final token and before summary
//  - Exactly one summary and one done frame; at most one citations frame
//  - Error frame MUST NOT appear in success path
// This gives clients a deterministic progression for progressive rendering & stats.

let ctx: E2EContext;

describe('Chat Streaming Ordering', () => {
  beforeAll(async () => { ctx = await createE2EContext('chat-sse-order'); });
  beforeEach(async () => { await ctx.cleanup(); });
  afterAll(async () => { await ctx.close(); });

  it('emits frames in deterministic order (tokens -> citations? -> summary -> done)', async () => {
    // Create conversation
    const createRes = await fetch(`${ctx.baseUrl}/chat/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader('all', 'chat-sse-order'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId },
      body: JSON.stringify({ message: 'Ordering test', isPrivate: false })
    });
    expect(createRes.status).toBe(201);
    const convo = await createRes.json();

    const res = await fetch(`${ctx.baseUrl}/chat/${convo.conversationId}/stream`, {
      headers: { ...authHeader('all', 'chat-sse-order'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId }
    });
    expect(res.status).toBe(200);
    const text = await res.text();

    const rawEvents = text.split(/\n\n/).filter(e => e.trim().length > 0);
    // Parse JSON payloads out of each SSE line (single data: line per event expected)
    const frames = rawEvents.map(ev => {
      const m = ev.match(/^data: (.*)$/m);
      expect(m, `Missing data: prefix in event -> ${ev}`).toBeTruthy();
      try { return JSON.parse(m![1]); } catch (e) { throw new Error(`Bad JSON frame: ${m![1]} (${e})`); }
    });

    // Classify frames
    const tokenFrames = frames.filter(f => typeof f.message === 'string' && /^token-\d+$/.test(f.message));
    const summaryFrames = frames.filter(f => f.summary === true);
    const doneFrames = frames.filter(f => f.done === true);
    const citationFrames = frames.filter(f => Array.isArray(f.citations));
    const errorFrames = frames.filter(f => f.error);

    // Expectations
    expect(errorFrames.length).toBe(0);
    expect(tokenFrames.length).toBe(5);
    expect(summaryFrames.length).toBe(1);
    expect(doneFrames.length).toBe(1);
    expect(citationFrames.length).toBeLessThanOrEqual(1);

    // Ordering indexes in original sequence
    const indexOf = (f: any) => frames.indexOf(f);

    // Verify token sequence order & indices
    for (let i = 0; i < 5; i++) {
      const frame = tokenFrames.find(f => f.message === `token-${i}`);
      expect(frame, `Missing token-${i}`).toBeTruthy();
      if (frame) {
        expect(frame.index).toBe(i);
        expect(frame.total).toBe(5);
      }
    }
    const tokenPositions = tokenFrames.map(indexOf);
    // Ensure strictly ascending order in stream
    for (let i = 1; i < tokenPositions.length; i++) {
      expect(tokenPositions[i]).toBeGreaterThan(tokenPositions[i - 1]);
    }

    const lastTokenPos = Math.max(...tokenPositions);
    const summaryPos = indexOf(summaryFrames[0]);
    const donePos = indexOf(doneFrames[0]);
    expect(summaryPos).toBeGreaterThan(lastTokenPos); // summary after all tokens
    expect(donePos).toBeGreaterThan(summaryPos); // done after summary

    if (citationFrames.length === 1) {
      const citPos = indexOf(citationFrames[0]);
      expect(citPos).toBeGreaterThan(lastTokenPos); // after tokens
      expect(citPos).toBeLessThan(summaryPos); // before summary
    }

    // Ensure nothing appears after done
    expect(donePos).toBe(frames.length - 1);
  });
});
