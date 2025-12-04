import type { E2EContext } from '../e2e-context';
import { authHeader } from '../auth-helpers';

export interface IngestUploadResult {
  status: number;
  json: any;
}

/**
 * Upload a textual file via multipart/form-data. Automatically supplies projectId and filename.
 * Accepts optional overrides for filename, contentType and userSuffix. Returns {status,json}.
 */
export async function uploadText(
  ctx: E2EContext,
  content: string,
  opts?: {
    filename?: string;
    mimeType?: string;
    userSuffix?: string;
    orgId?: string;
  }
): Promise<IngestUploadResult> {
  const form = new FormData();
  form.append('projectId', ctx.projectId);
  if (opts?.orgId) form.append('orgId', opts.orgId);
  form.append('filename', (opts?.filename || 'upload') + '.txt');
  form.append(
    'file',
    new Blob([content], { type: opts?.mimeType || 'text/plain' }),
    (opts?.filename || 'upload') + '.txt'
  );
  const res = await fetch(`${ctx.baseUrl}/ingest/upload`, {
    method: 'POST',
    headers: { ...authHeader('all', opts?.userSuffix) },
    body: form as any,
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
    body: form as any,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/** Ingest a remote URL. */
export async function ingestUrl(
  ctx: E2EContext,
  url: string,
  opts?: { userSuffix?: string }
): Promise<IngestUploadResult> {
  const body = { url, projectId: ctx.projectId };
  const res = await fetch(`${ctx.baseUrl}/ingest/url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader('all', opts?.userSuffix),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/** Convenience: directly create a document bypassing ingestion (for smaller tests). */
export async function createTextDocument(
  ctx: E2EContext,
  filename: string,
  content: string,
  opts?: { userSuffix?: string }
) {
  const res = await fetch(`${ctx.baseUrl}/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader('all', opts?.userSuffix),
      'x-project-id': ctx.projectId,
    },
    body: JSON.stringify({ filename, content, projectId: ctx.projectId }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export interface BatchUploadFile {
  content: string;
  filename: string;
  mimeType?: string;
}

export interface BatchUploadResult {
  status: number;
  json: {
    summary?: {
      total: number;
      successful: number;
      duplicates: number;
      failed: number;
    };
    results?: Array<{
      filename: string;
      status: string;
      documentId?: string;
      chunks?: number;
      error?: string;
    }>;
    error?: { code: string; message: string };
  };
}

/**
 * Upload multiple files via multipart/form-data to the batch upload endpoint.
 * Returns { status, json } with the batch result.
 */
export async function uploadBatch(
  ctx: E2EContext,
  files: BatchUploadFile[],
  opts?: { userSuffix?: string; orgId?: string }
): Promise<BatchUploadResult> {
  const form = new FormData();
  form.append('projectId', ctx.projectId);
  if (opts?.orgId) form.append('orgId', opts.orgId);

  for (const file of files) {
    form.append(
      'files',
      new Blob([file.content], { type: file.mimeType || 'text/plain' }),
      file.filename
    );
  }

  const res = await fetch(`${ctx.baseUrl}/ingest/upload-batch`, {
    method: 'POST',
    headers: { ...authHeader('all', opts?.userSuffix) },
    body: form as any,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/**
 * Upload batch expecting an error; allows custom form modification.
 */
export async function uploadBatchExpectError(
  ctx: E2EContext,
  modifiers: (form: FormData) => void,
  opts?: { userSuffix?: string }
): Promise<BatchUploadResult> {
  const form = new FormData();
  form.append('projectId', ctx.projectId);
  modifiers(form);
  const res = await fetch(`${ctx.baseUrl}/ingest/upload-batch`, {
    method: 'POST',
    headers: { ...authHeader('all', opts?.userSuffix) },
    body: form as any,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
