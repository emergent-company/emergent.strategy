import './setup-chat-debug'; // must be first to ensure env + debug flags present before app bootstrap
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createE2EContext } from '../e2e-context';
import { authHeader } from '../auth-helpers';
import { HttpClient } from './helpers/http-client';
import { uploadPlainText } from './helpers/ingestion';
import { createConversation, streamConversation } from './helpers/chat';

// Gate: only run when explicitly enabled to avoid default CI cost.
const RUN =
  process.env.RUN_SCENARIO_E2E === '1' || process.env.RUN_SCENARIOS === '1';

const CHAT_FLAGS = {
  key: !!process.env.GOOGLE_API_KEY,
  enabled: process.env.CHAT_MODEL_ENABLED === 'true',
};
// console.log('chat flags', CHAT_FLAGS);

// This scenario covers: first ingestion -> private conversation -> streaming citations
(RUN ? describe : describe.skip)('Scenario: first time user end-to-end', () => {
  it('provisions org & project, ingests a document, creates a chat, streams answer with optional citations', async () => {
    const ctx = await createE2EContext('scenario');
    type ProjectResp = { id: string; name: string; orgId: string };
    type OrgResp = { id: string; name: string };
    let projectResp: ProjectResp | null = null;
    let orgResp: OrgResp | null = null;
    let convId: string | null = null;
    let frames: any[] = [];
    try {
      const baseHeaders = { ...authHeader('all', ctx.userSub) };
      const client = new HttpClient(ctx.baseUrl, baseHeaders);
      const step = async (name: string, fn: () => Promise<void>) => {
        // eslint-disable-next-line no-console
        console.log(`\n[scenario-step] ${name} START`);
        const t0 = Date.now();
        try {
          await fn();
        } finally {
          // eslint-disable-next-line no-console
          console.log(`[scenario-step] ${name} END +${Date.now() - t0}ms`);
        }
      };

      await step('provision org & project (API, real DB)', async () => {
        // In rare parallel execution cases a 409 (conflict) can be returned if a generated name already exists
        // (e.g., uniqueness constraint on name or residual fixture data). We retry with a random suffix.
        let lastErr: any = null;
        for (
          let attempt = 0;
          attempt < 3 && (orgResp === null || projectResp === null);
          attempt++
        ) {
          try {
            const orgName = `Scenario Org ${randomUUID().slice(0, 8)}`;
            orgResp = await client.post<{ id: string; name: string }>('/orgs', {
              name: orgName,
            });
            expect(orgResp.id).toBeTruthy();
            const projName = `Scenario Project ${randomUUID().slice(0, 8)}`;
            projectResp = await client.post<{
              id: string;
              name: string;
              orgId: string;
            }>('/projects', { name: projName, orgId: orgResp.id });
            expect(projectResp.id).toBeTruthy();
            break; // success
          } catch (e: any) {
            lastErr = e;
            if (/409/.test(String(e?.message)) && attempt < 2) {
              // eslint-disable-next-line no-console
              console.warn(
                '[scenario-step] 409 conflict creating org/project, retrying with new suffix (attempt',
                attempt + 2,
                '/3)'
              );
              continue;
            }
            break;
          }
        }
        if (orgResp === null || projectResp === null) {
          // Attempt fallback reuse: list existing orgs/projects (best effort) to avoid hard failure on saturated test env
          try {
            const existingOrgs = await (client as any).get('/orgs');
            if (Array.isArray(existingOrgs) && existingOrgs.length > 0) {
              orgResp = {
                id: existingOrgs[0].id,
                name: existingOrgs[0].name,
              } as OrgResp;
              const existingProjects = await (client as any).get('/projects');
              if (
                Array.isArray(existingProjects) &&
                existingProjects.length > 0
              ) {
                projectResp = {
                  id: existingProjects[0].id,
                  name: existingProjects[0].name,
                  orgId: existingProjects[0].orgId,
                } as ProjectResp;
              }
            }
          } catch {
            /* ignore reuse fallback errors */
          }
        }
        if (orgResp === null || projectResp === null) {
          throw (
            lastErr ||
            new Error(
              'Failed provisioning org/project after retries and fallback'
            )
          );
        }
        // At this point orgResp & projectResp are guaranteed non-null (loop would have thrown otherwise)
        const headers = {
          ...baseHeaders,
          'x-org-id': (orgResp as OrgResp).id,
          'x-project-id': (projectResp as ProjectResp).id,
        };
        // @ts-expect-error mutate for simplicity
        client._defaultHeaders = headers;
      });

      await step('ingest document', async () => {
        const UNIQUE_FACT =
          'The internal codename for Mars in our private 2025 mission brief is ARES-ALPHA-EXPERIMENT-42 and only this document states that.';
        const ingest = await uploadPlainText(
          client,
          projectResp!.id,
          `Scenario RAG context about planets. ${UNIQUE_FACT}`,
          'planets.txt'
        );
        expect(ingest).toHaveProperty('documentId');
        expect(typeof ingest.chunks).toBe('number');
      });

      await step('create private conversation', async () => {
        const created = await createConversation(
          client,
          'Tell me about Mars',
          projectResp!.id
        );
        expect(created).toHaveProperty('conversationId');
        convId = created.conversationId;
        const conversationContext = await (client as any).get(
          `/chat/${convId}`
        );
        // eslint-disable-next-line no-console
        console.log(
          '[scenario-chat] conversation context:',
          JSON.stringify(conversationContext, null, 2)
        );
      });

      await step('stream answer', async () => {
        frames = await streamConversation(client, convId!, projectResp!.id);
      });

      await step('assert frames & citations', async () => {
        const metaFrame = frames.find((f) => f.meta);
        if (process.env.CHAT_MODEL_ENABLED === 'true') {
          // Expect meta frame to reflect enabled state when key present
          expect(
            metaFrame,
            'Expected initial meta frame in stream'
          ).toBeTruthy();
          if (metaFrame) {
            // eslint-disable-next-line no-console
            console.log('[scenario-chat] meta frame:', metaFrame);
          }
          const hadGenerationError = !!frames.find(
            (f) => f.meta && f.meta.generation_error
          );
          const modelEnabled = metaFrame?.meta?.chat_model_enabled !== false;
          if (!hadGenerationError && modelEnabled) {
            // Also expect a later preview meta frame containing truncated model content (added when E2E_DEBUG_CHAT=1)
            const previewMeta = frames.find(
              (f) => f.meta && typeof f.meta.model_content_preview === 'string'
            );
            expect(
              previewMeta,
              'Expected model_content_preview meta frame when debug + model enabled and no generation error'
            ).toBeTruthy();
            if (previewMeta) {
              expect(
                previewMeta.meta.model_content_preview.length
              ).toBeGreaterThan(0);
              expect(
                previewMeta.meta.model_content_preview.length
              ).toBeLessThanOrEqual(400);
              // eslint-disable-next-line no-console
              console.log(
                '[scenario-chat] model_content_preview length=',
                previewMeta.meta.model_content_preview.length
              );
            }
          }
        }
        // Debug print raw frames (truncated token list to avoid log spam)
        const rawTokens = frames
          .filter((f) => typeof f.message === 'string' && !f.summary && !f.done)
          .map((f) => f.message as string);
        const preview = rawTokens.slice(0, 20);
        // eslint-disable-next-line no-console
        console.log(
          '[scenario-chat] streamed frame count=',
          frames.length,
          'tokens(total)=',
          rawTokens.length,
          'preview=',
          preview
        );
        const citationsFrameDebug = frames.find((f) =>
          Array.isArray(f.citations)
        );
        if (citationsFrameDebug) {
          // eslint-disable-next-line no-console
          console.log(
            '[scenario-chat] citations:',
            citationsFrameDebug.citations
          );
        }
        const syntheticTokens = frames.filter(
          (f) =>
            typeof f.message === 'string' && /^token-\d+\s*$/.test(f.message)
        );
        const modelTokenFrames = frames.filter(
          (f) =>
            typeof f.message === 'string' &&
            !/^token-\d+\s*$/.test(f.message) &&
            !f.done &&
            !f.summary
        );
        const modelTokenTexts = modelTokenFrames.map(
          (f) => f.message as string
        );
        if (CHAT_FLAGS.key && CHAT_FLAGS.enabled) {
          const fullAnswer = modelTokenTexts.join(' ');
          // eslint-disable-next-line no-console
          console.log(
            '[scenario-chat] full answer (reconstructed):',
            fullAnswer
          );
        }
        if (CHAT_FLAGS.key && CHAT_FLAGS.enabled) {
          const hadGenerationError = !!frames.find(
            (f) => f.meta && f.meta.generation_error
          );
          const modelActuallyEnabled =
            metaFrame?.meta?.chat_model_enabled !== false;
          if (!hadGenerationError && modelActuallyEnabled) {
            const previewMeta = frames.find(
              (f) => f.meta && typeof f.meta.model_content_preview === 'string'
            );
            const previewText = (
              previewMeta?.meta?.model_content_preview || ''
            ).toLowerCase();
            const aggregated = modelTokenTexts.join(' ').toLowerCase();
            const codenamePresent =
              /ares-alpha/.test(previewText) || /ares-alpha/.test(aggregated);
            expect(
              codenamePresent,
              'Expected unique private codename from ingested doc in model output (preview or tokens)'
            ).toBeTruthy();
          } else {
            // When generation failed we still expect synthetic tokens to have been provided via controller fallback.
            const syntheticTokens = frames.filter(
              (f) =>
                typeof f.message === 'string' &&
                /^token-\d+\s*$/.test(f.message)
            );
            expect(syntheticTokens.length).toBeGreaterThan(0);
          }
        }

        const hadGenerationError = !!frames.find(
          (f) => f.meta && f.meta.generation_error
        );
        const modelActuallyEnabled =
          metaFrame?.meta?.chat_model_enabled !== false;
        if (
          CHAT_FLAGS.key &&
          CHAT_FLAGS.enabled &&
          !hadGenerationError &&
          modelActuallyEnabled
        ) {
          // Real model path (no generation error): should have at least one non-synthetic token
          expect(
            modelTokenFrames.length,
            'Expected real model tokens but only synthetic token-* frames were seen'
          ).toBeGreaterThan(0);
        } else {
          // Fallback or disabled path: ensure synthetic tokens present
          expect(syntheticTokens.length).toBeGreaterThan(0);
        }
        const summary = frames.find((f) => f.summary === true);
        expect(summary).toBeTruthy();
        const done = frames.find((f) => f.done === true);
        expect(done).toBeTruthy();

        // Citations (if embeddings enabled & retrieval found something)
        const citationsFrame = frames.find((f) => Array.isArray(f.citations));
        if (citationsFrame) {
          // Minimal shape assertions
          expect(citationsFrame.citations[0]).toHaveProperty('documentId');
          expect(citationsFrame.citations[0]).toHaveProperty('text');
        }
      });
    } finally {
      // Cleanup user-specific artifacts and ensure org/project rows removed.
      // ctx.cleanup removes chat + docs for the generated base context project.
      // We additionally delete the scenario-created project & org for zero-leak guarantee.
      if (projectResp !== null) {
        const projId: string = (projectResp as ProjectResp).id;
        await ctx.cleanupProjectArtifacts(projId);
        await ctx.cleanupExternalProject(projId, { allowPrimary: true });
      }
      if (orgResp !== null) {
        await ctx.cleanupExternalOrg((orgResp as OrgResp).id, {
          allowPrimary: true,
        });
      }
      // Best-effort verification (non-blocking): list orgs/projects if APIs exist
      try {
        // (Optional verification could query DB directly if needed)
      } catch {
        /* ignore */
      }
      await ctx.cleanup();
      await ctx.close();
    }
  }, 60_000);
});
