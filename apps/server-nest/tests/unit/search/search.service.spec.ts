import { describe, it, expect, vi } from 'vitest';
import { SearchService } from '../../../src/modules/search/search.service';
import { SearchMode } from '../../../src/modules/search/dto/search-query.dto';

function makeDb(rows: any[]) {
    return { query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }) } as any;
}

const embeddings = {
    embedQuery: vi.fn().mockResolvedValue(Array(768).fill(0.01)),
};
const configEnabled = { embeddingsEnabled: true } as any;
const configDisabled = { embeddingsEnabled: false } as any;

// Mock PathSummaryService (4th constructor parameter)
const mockPathSummary = {
    getPathSummaries: vi.fn().mockResolvedValue(new Map()),
} as any;

describe('SearchService', () => {
    it('falls back to lexical when embeddings disabled', async () => {
        const db = makeDb([{ id: '1', document_id: 'd1', chunk_index: 0, text: 'hello world' }]);
        const svc = new SearchService(db, embeddings as any, configDisabled, mockPathSummary);
        const res = await svc.search('hello', 10, SearchMode.HYBRID);
        expect(res.mode).toBe(SearchMode.LEXICAL);
        expect(res.warning).toBeTruthy();
    });

    it('vector mode uses embedding ordering', async () => {
        const db = makeDb([{ id: '1', document_id: 'd1', chunk_index: 0, text: 'abc' }]);
        const svc = new SearchService(db, embeddings as any, configEnabled, mockPathSummary);
        const res = await svc.search('abc', 5, SearchMode.VECTOR);
        expect(res.mode).toBe(SearchMode.VECTOR);
        expect(res.results.length).toBe(1);
    });

    it('hybrid mode performs RRF fusion (SQL shape + result passthrough)', async () => {
        // Arrange: mock db.query to return lexical and vector results separately
        // Hybrid mode now uses two queries: one for lexical (ts_rank), one for vector (cosine distance)
        const lexicalRows = [
            { id: 'a', document_id: 'dA', chunk_index: 0, text: 'both signals snippet', score: 0.8 },
            { id: 'b', document_id: 'dB', chunk_index: 0, text: 'lexical only snippet', score: 0.6 },
        ];
        const vectorRows = [
            { id: 'a', document_id: 'dA', chunk_index: 0, text: 'both signals snippet', score: 0.9 },
            { id: 'c', document_id: 'dC', chunk_index: 0, text: 'semantic only snippet', score: 0.7 },
        ];
        const db = {
            query: vi.fn()
                .mockResolvedValueOnce({ rows: lexicalRows, rowCount: lexicalRows.length }) // First call: lexical
                .mockResolvedValueOnce({ rows: vectorRows, rowCount: vectorRows.length })   // Second call: vector
        } as any;
        const svc = new SearchService(db, embeddings as any, configEnabled, mockPathSummary);
        const res = await svc.search('hybrid fusion', 10, SearchMode.HYBRID);
        expect(res.mode).toBe(SearchMode.HYBRID);
        // Results should be fused and sorted by normalized scores
        expect(res.results.length).toBeGreaterThan(0);
        expect(res.results.every(r => ['a', 'b', 'c'].includes(r.id))).toBe(true);
        // Ensure embedding was requested
        expect(embeddings.embedQuery).toHaveBeenCalledWith('hybrid fusion');
        // Hybrid mode now calls db.query twice: once for lexical, once for vector
        expect(db.query).toHaveBeenCalledTimes(2);
    });

    it('falls back to lexical when embedding call throws (warning includes error)', async () => {
        const failingEmbeddings = { embedQuery: vi.fn().mockRejectedValue(new Error('boom')) };
        const db = makeDb([{ id: 'lex1', document_id: 'dL', chunk_index: 0, text: 'lexical fallback text' }]);
        const svc = new SearchService(db, failingEmbeddings as any, configEnabled, mockPathSummary);
        const res = await svc.search('query causing embed fail', 5, SearchMode.VECTOR);
        expect(res.mode).toBe(SearchMode.LEXICAL);
        expect(res.results.length).toBe(1);
        expect(res.warning).toContain('boom');
        expect(failingEmbeddings.embedQuery).toHaveBeenCalledTimes(1);
        // db.query called twice: first attempt lexical fallback path only once because embed fails before vector query
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('clamps high limit to 50 (lexical path)', async () => {
        const db = makeDb([]);
        const svc = new SearchService(db, embeddings as any, configDisabled, mockPathSummary); // embeddings disabled => lexical path
        await svc.search('something', 500, SearchMode.LEXICAL);
        expect(db.query).toHaveBeenCalledTimes(1);
        const params = db.query.mock.calls[0][1];
        expect(params[1]).toBe(50);
    });

    it('clamps low/invalid limit to 1 (lexical path)', async () => {
        const db = makeDb([]);
        const svc = new SearchService(db, embeddings as any, configDisabled, mockPathSummary);
        await svc.search('anything', 0, SearchMode.LEXICAL);
        let params = db.query.mock.calls[0][1];
        expect(params[1]).toBe(1);
        db.query.mockClear();
        await svc.search('anything', -10, SearchMode.LEXICAL);
        params = db.query.mock.calls[0][1];
        expect(params[1]).toBe(1);
    });
});
