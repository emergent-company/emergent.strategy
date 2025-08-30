import { query } from './db.js';
import { simpleChunk } from './chunk.js';
import { makeEmbeddings } from './embeddings.js';
import { htmlToText } from 'html-to-text';
import fetch from 'node-fetch';
import { createHash } from 'crypto';

export async function ingestUrl(url: string, ctx?: { orgId?: string | null; projectId?: string | null }) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    const buf = await res.arrayBuffer();
    let text = '';
    if (contentType.includes('text/html')) {
        text = htmlToText(Buffer.from(buf).toString('utf-8'));
    } else {
        text = Buffer.from(buf).toString('utf-8');
    }
    return ingestText({ text, source_url: url, mime_type: contentType }, ctx);
}

export async function ingestText(
    { text, source_url, filename, mime_type }: { text: string; source_url?: string; filename?: string; mime_type?: string },
    ctx?: { orgId?: string | null; projectId?: string | null }
) {
    const contentHash = createHash('sha256').update(text || '').digest('hex');
    const existing = await query<{ id: string }>(
        'SELECT id FROM kb.documents WHERE content_hash = $1 AND project_id IS NOT DISTINCT FROM $2',
        [contentHash, ctx?.projectId || null]
    );
    if (existing.rowCount && existing.rowCount > 0) {
        return { documentId: existing.rows[0].id, chunks: 0, alreadyExists: true };
    }
    const { rows: drows } = await query<{ id: string }>(
        `INSERT INTO kb.documents(org_id, project_id, source_url, filename, mime_type, content, content_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
        [ctx?.orgId || null, ctx?.projectId || null, source_url || null, filename || null, mime_type || 'text/plain', text, contentHash]
    );
    const documentId = drows[0].id;

    const chunks = simpleChunk(text);
    const embed = makeEmbeddings();
    const vectors = await embed.embedDocuments(chunks);

    for (let i = 0; i < chunks.length; i++) {
        const vecLiteral = '[' + vectors[i].map((n) => (Number.isFinite(n) ? String(n) : '0')).join(',') + ']';
        await query(
            `INSERT INTO kb.chunks(document_id, chunk_index, text, embedding)
       VALUES ($1,$2,$3,$4::vector)
       ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text, embedding = EXCLUDED.embedding`,
            [documentId, i, chunks[i], vecLiteral]
        );
    }

    return { documentId, chunks: chunks.length, alreadyExists: false };
}
