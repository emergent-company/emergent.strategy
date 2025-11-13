import type { E2EContext } from '../e2e-context';
import { authHeader } from '../auth-helpers';

export interface IngestUploadResult { status: number; json: any; }

/**
 * Upload a textual file via multipart/form-data. Automatically supplies projectId and filename.
 * Accepts optional overrides for filename, contentType and userSuffix. Returns {status,json}.
 */
export async function uploadText(
  ctx: E2EContext,
  content: string,
  opts?: { filename?: string; mimeType?: string; userSuffix?: string; orgId?: string }
): Promise<IngestUploadResult> {
  const form = new FormData();
  form.append('projectId', ctx.projectId);
  if (opts?.orgId) form.append('orgId', opts.orgId);
  form.append('filename', (opts?.filename || 'upload') + '.txt');
  form.append('file', new Blob([content], { type: opts?.mimeType || 'text/plain' }), (opts?.filename || 'upload') + '.txt');
  const res = await fetch(`${ctx.baseUrl}/ingest/upload`, {
    method: 'POST',
    headers: { ...authHeader('all', opts?.userSuffix) },
    body: form as any
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/** Upload expecting an error; returns json even for non-2xx. */
export async function uploadExpectError(
  ctx: E2EContext,
  modifiers: (form: FormData) => void,
  opts?: { userSuffix?: string }
): Promise<IngestUploadResult> {
  const form = new FormData();
  form.append('projectId', ctx.projectId);
  modifiers(form);
  const res = await fetch(`${ctx.baseUrl}/ingest/upload`, {
    method: 'POST',
    headers: { ...authHeader('all', opts?.userSuffix) },
    body: form as any
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/** Ingest a remote URL. */
export async function ingestUrl(ctx: E2EContext, url: string, opts?: { userSuffix?: string }): Promise<IngestUploadResult> {
  const body = { url, projectId: ctx.projectId };
  const res = await fetch(`${ctx.baseUrl}/ingest/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader('all', opts?.userSuffix) },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/** Convenience: directly create a document bypassing ingestion (for smaller tests). */
export async function createTextDocument(ctx: E2EContext, filename: string, content: string, opts?: { userSuffix?: string }) {
  const res = await fetch(`${ctx.baseUrl}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader('all', opts?.userSuffix), 'x-project-id': ctx.projectId },
    body: JSON.stringify({ filename, content, projectId: ctx.projectId })
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
