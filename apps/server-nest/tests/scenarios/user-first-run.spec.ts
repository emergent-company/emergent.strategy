import './setup-chat-debug'; // must be first to ensure env + debug flags present before app bootstrap
import { describe, it, expect } from 'vitest';
import { createE2EContext } from '../e2e/e2e-context';
import { authHeader } from '../e2e/auth-helpers';
import { HttpClient } from './helpers/http-client';
import { uploadPlainText } from './helpers/ingestion';
import { createConversation, streamConversation } from './helpers/chat';

// Gate: only run when explicitly enabled to avoid default CI cost.
const RUN = process.env.RUN_SCENARIO_E2E === '1' || process.env.RUN_SCENARIOS === '1';

const CHAT_FLAGS = { key: !!process.env.GOOGLE_API_KEY, enabled: process.env.CHAT_MODEL_ENABLED === 'true' };
// console.log('chat flags', CHAT_FLAGS);

// This scenario covers: first ingestion -> private conversation -> streaming citations
(RUN ? describe : describe.skip)('Scenario: first time user end-to-end', () => {
    it('provisions org & project, ingests a document, creates a chat, streams answer with optional citations', async () => {
        const ctx = await createE2EContext('scenario');
        type ProjectResp = { id: string; name: string; orgId: string };
        let projectResp: ProjectResp | null = null;
        let orgResp: { id: string; name: string } | null = null;
        let convId: string | null = null;
        let frames: any[] = [];
        try {
            const baseHeaders = { ...authHeader('all', ctx.userSub) };
            const client = new HttpClient(ctx.baseUrl, baseHeaders);
            const step = async (name: string, fn: () => Promise<void>) => {
                // eslint-disable-next-line no-console
                console.log(`\n[scenario-step] ${name} START`);
                const t0 = Date.now();
                try { await fn(); } finally {
                    // eslint-disable-next-line no-console
                    console.log(`[scenario-step] ${name} END +${Date.now() - t0}ms`);
                }
            };

            await step('provision org & project (API, real DB)', async () => {
                orgResp = await client.post<{ id: string; name: string }>('/orgs', { name: `Scenario Org ${Date.now()}` });
                expect(orgResp.id).toBeTruthy();
                projectResp = await client.post<{ id: string; name: string; orgId: string }>(
                    '/projects',
                    { name: `Scenario Project ${Date.now()}`, orgId: orgResp.id },
                );
                expect(projectResp.id).toBeTruthy();
                const headers = { ...baseHeaders, 'x-org-id': orgResp.id, 'x-project-id': projectResp.id };
                // @ts-expect-error mutate for simplicity
                client._defaultHeaders = headers;
            });

            await step('ingest document', async () => {
                const UNIQUE_FACT = 'The internal codename for Mars in our private 2025 mission brief is ARES-ALPHA-EXPERIMENT-42 and only this document states that.';
                const ingest = await uploadPlainText(client, projectResp!.id, `Scenario RAG context about planets. ${UNIQUE_FACT}`, 'planets.txt');
                expect(ingest).toHaveProperty('documentId');
                expect(typeof ingest.chunks).toBe('number');
            });

            await step('create private conversation', async () => {
                const created = await createConversation(client, 'Tell me about Mars', projectResp!.id);
                expect(created).toHaveProperty('conversationId');
                convId = created.conversationId;
                const conversationContext = await (client as any).get(`/chat/${convId}`);
                // eslint-disable-next-line no-console
                console.log('[scenario-chat] conversation context:', JSON.stringify(conversationContext, null, 2));
            });

            await step('stream answer', async () => {
                frames = await streamConversation(client, convId!, projectResp!.id);
            });

            await step('assert frames & citations', async () => {
                const metaFrame = frames.find(f => f.meta);
                if (process.env.CHAT_MODEL_ENABLED === 'true') {
                    // Expect meta frame to reflect enabled state when key present
                    expect(metaFrame, 'Expected initial meta frame in stream').toBeTruthy();
                    if (metaFrame) {
                        // eslint-disable-next-line no-console
                        console.log('[scenario-chat] meta frame:', metaFrame);
                    }
                    // Also expect a later preview meta frame containing truncated model content (added when E2E_DEBUG_CHAT=1)
                    const previewMeta = frames.find(f => f.meta && typeof f.meta.model_content_preview === 'string');
                    expect(previewMeta, 'Expected model_content_preview meta frame when debug + model enabled').toBeTruthy();
                    if (previewMeta) {
                        expect(previewMeta.meta.model_content_preview.length).toBeGreaterThan(0);
                        expect(previewMeta.meta.model_content_preview.length).toBeLessThanOrEqual(400);
                        // eslint-disable-next-line no-console
                        console.log('[scenario-chat] model_content_preview length=', previewMeta.meta.model_content_preview.length);
                    }
                }
                // Debug print raw frames (truncated token list to avoid log spam)
                const rawTokens = frames.filter(f => typeof f.message === 'string' && !f.summary && !f.done).map(f => f.message as string);
                const preview = rawTokens.slice(0, 20);
                // eslint-disable-next-line no-console
                console.log('[scenario-chat] streamed frame count=', frames.length, 'tokens(total)=', rawTokens.length, 'preview=', preview);
                const citationsFrameDebug = frames.find(f => Array.isArray(f.citations));
                if (citationsFrameDebug) {
                    // eslint-disable-next-line no-console
                    console.log('[scenario-chat] citations:', citationsFrameDebug.citations);
                }
                const syntheticTokens = frames.filter(f => typeof f.message === 'string' && /^token-\d+$/.test(f.message));
                const modelTokenFrames = frames.filter(f => typeof f.message === 'string' && !/^token-\d+$/.test(f.message) && !f.done && !f.summary);
                const modelTokenTexts = modelTokenFrames.map(f => f.message as string);
                if (CHAT_FLAGS.key && CHAT_FLAGS.enabled) {
                    const fullAnswer = modelTokenTexts.join(' ');
                    // eslint-disable-next-line no-console
                    console.log('[scenario-chat] full answer (reconstructed):', fullAnswer);
                }
                if (CHAT_FLAGS.key && CHAT_FLAGS.enabled) {
                    // Prefer meta preview (exact model assembled content slice) for deterministic assertion
                    const previewMeta = frames.find(f => f.meta && typeof f.meta.model_content_preview === 'string');
                    const previewText = (previewMeta?.meta?.model_content_preview || '').toLowerCase();
                    const aggregated = modelTokenTexts.join(' ').toLowerCase();
                    const codenamePresent = /ares-alpha/.test(previewText) || /ares-alpha/.test(aggregated);
                    expect(codenamePresent, 'Expected unique private codename from ingested doc in model output (preview or tokens)').toBeTruthy();
                }

                if (CHAT_FLAGS.key && CHAT_FLAGS.enabled) {
                    // Expect real model path: should have at least one non-synthetic token
                    expect(modelTokenFrames.length, 'Expected real model tokens but only synthetic token-* frames were seen').toBeGreaterThan(0);
                } else {
                    // Fallback path: ensure synthetic tokens present
                    expect(syntheticTokens.length).toBeGreaterThan(0);
                }
                const summary = frames.find(f => f.summary === true);
                expect(summary).toBeTruthy();
                const done = frames.find(f => f.done === true);
                expect(done).toBeTruthy();

                // Citations (if embeddings enabled & retrieval found something)
                const citationsFrame = frames.find(f => Array.isArray(f.citations));
                if (citationsFrame) {
                    // Minimal shape assertions
                    expect(citationsFrame.citations[0]).toHaveProperty('documentId');
                    expect(citationsFrame.citations[0]).toHaveProperty('text');
                }
            });
        } finally {
            // Cleanup user-specific artifacts
            // (ctx.cleanup removes chat + docs for the generated user/project)
            // cleanup artifacts for dynamically created project (chat + docs) then base context
            if (projectResp) {
                const projId = (projectResp as ProjectResp).id;
                await ctx.cleanupProjectArtifacts(projId);
            }
            await ctx.cleanup();
            await ctx.close();
        }
    }, 60_000);
});
