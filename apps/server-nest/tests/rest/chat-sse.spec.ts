import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { BootstrappedApp } from '../utils/test-app';
import { bootstrapTestApp } from '../utils/test-app';

let ctx: BootstrappedApp;

async function collectSse(url: string): Promise<any[]> {
    const res = await fetch(url, { headers: { Accept: 'text/event-stream' } });
    expect(res.status).toBe(200);
    const reader = (res as any).body?.getReader();
    if (!reader) return [];
    const chunks: Uint8Array[] = [];
    // Read until stream ends (controller completes after emitting done event)
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
    }
    const buffer = Buffer.concat(chunks);
    const text = new TextDecoder().decode(buffer);
    // Each event separated by double newlines; lines starting with data:
    const dataLines = text.split(/\n\n/).flatMap(block => block.split('\n').filter(l => l.startsWith('data:')));
    return dataLines.map(l => {
        const payload = l.replace(/^data:\s*/, '');
        try { return JSON.parse(payload); } catch { return payload; }
    });
}

describe('Chat SSE stream', () => {
    beforeAll(async () => { ctx = await bootstrapTestApp(); });
    afterAll(async () => { await ctx.close(); });

    it('streams tokens then DONE', async () => {
        // Create a conversation first
        const create = await fetch(`${ctx.baseUrl}/chat/conversations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Stream seed' }) });
        const cj: any = await create.json();
        const events = await collectSse(`${ctx.baseUrl}/chat/${cj.id}/stream`);
        expect(events.length).toBeGreaterThanOrEqual(6); // 5 tokens + done
        const token0 = events.find(e => typeof e === 'object' && e.message === 'token-0');
        expect(token0).toBeTruthy();
        const last = events[events.length - 1];
        expect(last).toHaveProperty('done', true);
        expect(last).toHaveProperty('message', '[DONE]');
    });
});
