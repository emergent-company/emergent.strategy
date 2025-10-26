import type { E2EContext } from '../e2e-context';
import { authHeader } from '../auth-helpers';

export interface Conversation { conversationId: string; title: string; }

export async function createConversation(ctx: E2EContext, message: string, opts?: { isPrivate?: boolean; userSuffix?: string }): Promise<Conversation> {
    const res = await fetch(`${ctx.baseUrl}/chat/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader('all', opts?.userSuffix), 'x-project-id': ctx.projectId, 'x-org-id': ctx.orgId },
        body: JSON.stringify({ message, isPrivate: opts?.isPrivate ?? false })
    });
    if (res.status !== 201) throw new Error(`createConversation failed status=${res.status}`);
    return res.json();
}

export type StreamFrame = any; // Narrowed in classifier helpers below

export interface StreamResult {
    raw: string;
    frames: StreamFrame[];
    tokens: StreamFrame[];
    citations?: any[];
    summary?: StreamFrame;
    done?: StreamFrame;
    errors: StreamFrame[];
}

export async function streamConversation(ctx: E2EContext, id: string, opts?: { userSuffix?: string }): Promise<StreamResult> {
    const res = await fetch(`${ctx.baseUrl}/chat/${id}/stream`, { headers: { ...authHeader('all', opts?.userSuffix), 'x-project-id': ctx.projectId, 'x-org-id': ctx.orgId } });
    if (res.status !== 200) throw new Error(`streamConversation failed status=${res.status}`);
    const body = await res.text();
    const events = body.split(/\n\n/).filter(e => e.trim().length > 0);
    const frames: StreamFrame[] = events.map(ev => {
        const m = ev.match(/^data: (.*)$/m); if (!m) return null; try { return JSON.parse(m[1]); } catch { return null; }
    }).filter(Boolean) as any[];
    const tokens = frames.filter(f => typeof f.message === 'string' && /^token-\d+\s*$/.test(f.message));
    const citationsFrame = frames.find(f => Array.isArray(f.citations));
    const summary = frames.find(f => f.summary === true);
    const done = frames.find(f => f.done === true);
    const errors = frames.filter(f => f.error);
    return { raw: body, frames, tokens, citations: citationsFrame?.citations, summary, done, errors };
}

export function assertDeterministicOrdering(result: StreamResult, expectedTokenCount: number) {
    const { tokens, summary, done, errors, frames, citations } = result;
    if (errors.length) throw new Error(`Unexpected error frames: ${JSON.stringify(errors)}`);
    if (tokens.length !== expectedTokenCount) throw new Error(`Expected ${expectedTokenCount} tokens got ${tokens.length}`);
    if (!summary) throw new Error('Missing summary frame');
    if (!done) throw new Error('Missing done frame');
    const indexOf = (f: any) => frames.indexOf(f);
    const tokenPositions = tokens.map(indexOf);
    for (let i = 1; i < tokenPositions.length; i++) {
        if (tokenPositions[i] <= tokenPositions[i - 1]) throw new Error('Token order not strictly ascending');
    }
    const lastTokenPos = Math.max(...tokenPositions);
    if (indexOf(summary) <= lastTokenPos) throw new Error('Summary appears before last token');
    if (indexOf(done) <= indexOf(summary)) throw new Error('Done appears before summary');
    if (citations) {
        const citPos = indexOf(frames.find(f => Array.isArray(f.citations))!);
        if (citPos <= lastTokenPos) throw new Error('Citations before last token');
        if (citPos >= indexOf(summary)) throw new Error('Citations after summary');
    }
    if (indexOf(done) !== frames.length - 1) throw new Error('Done not last frame');
}
