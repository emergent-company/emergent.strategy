import { uploadText } from './ingestion';
import type { E2EContext } from '../e2e-context';

export interface DocSpec { name: string; content: string; }

/** Ingest multiple text documents, returning their statuses + ids if present. */
export async function ingestDocs(ctx: E2EContext, docs: DocSpec[], opts?: { userSuffix?: string }) {
    const results = [] as Array<{ name: string; status: number; documentId?: string; chunks?: number }>;
    for (const d of docs) {
        const r = await uploadText(ctx, d.content, { filename: d.name, userSuffix: opts?.userSuffix });
        results.push({ name: d.name, status: r.status, documentId: r.json.documentId || r.json.id, chunks: r.json.chunks });
    }
    return results;
}

/** Simple unique token generator for tests. */
export function testToken(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
