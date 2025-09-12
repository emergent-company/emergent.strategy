import { describe, it, expect, vi } from 'vitest';
import { IngestionService } from '../src/modules/ingestion/ingestion.service';

const db = {
    isOnline: () => true,
    query: vi.fn(async (sql: string) => {
        if (sql.startsWith('SELECT id, org_id FROM kb.projects')) {
            return { rows: [{ id: 'proj-1', org_id: 'org-1' }], rowCount: 1 };
        }
        if (sql.startsWith('SELECT id FROM kb.documents')) {
            return { rows: [], rowCount: 0 };
        }
        if (sql.includes('INSERT INTO kb.documents')) {
            return { rows: [{ id: 'doc-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
    }),
};

const chunker = { chunk: (text: string) => [text] } as any;
const hash = { sha256: (_: string) => 'hash123' } as any;
const embeddings = { embedDocuments: vi.fn().mockResolvedValue([[0.1, 0.2]]) } as any;
const config = { embeddingsEnabled: true } as any;

describe('IngestionService', () => {
    it('ingests text and returns documentId', async () => {
        const svc = new IngestionService(db as any, chunker, hash, embeddings as any, config as any);
        const res = await svc.ingestText({ text: 'hello world', projectId: 'proj-1' });
        expect(res.documentId).toBe('doc-1');
        expect(res.chunks).toBe(1);
        expect(res.alreadyExists).toBe(false);
    });
});
