import { describe, it, expect, vi } from 'vitest';
import { SearchService } from '../src/modules/search/search.service';
import { SearchMode } from '../src/modules/search/dto/search-query.dto';

function makeDb(rows: any[]) {
    return { query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }) } as any;
}

const embeddings = {
    embedQuery: vi.fn().mockResolvedValue(Array(768).fill(0.01)),
};
const configEnabled = { embeddingsEnabled: true } as any;
const configDisabled = { embeddingsEnabled: false } as any;

describe('SearchService', () => {
    it('falls back to lexical when embeddings disabled', async () => {
        const db = makeDb([{ id: '1', document_id: 'd1', chunk_index: 0, text: 'hello world' }]);
        const svc = new SearchService(db, embeddings as any, configDisabled);
        const res = await svc.search('hello', 10, SearchMode.HYBRID);
        expect(res.mode).toBe(SearchMode.LEXICAL);
        expect(res.warning).toBeTruthy();
    });

    it('vector mode uses embedding ordering', async () => {
        const db = makeDb([{ id: '1', document_id: 'd1', chunk_index: 0, text: 'abc' }]);
        const svc = new SearchService(db, embeddings as any, configEnabled);
        const res = await svc.search('abc', 5, SearchMode.VECTOR);
        expect(res.mode).toBe(SearchMode.VECTOR);
        expect(res.results.length).toBe(1);
    });

    it('hybrid mode performs RRF fusion (SQL shape + result passthrough)', async () => {
        // Arrange: mock db.query to inspect SQL and simulate fused score ordering.
        const mockRows = [
            { id: 'a', document_id: 'dA', chunk_index: 0, text: 'both signals snippet' },
            { id: 'b', document_id: 'dB', chunk_index: 0, text: 'lexical only snippet' },
            { id: 'c', document_id: 'dC', chunk_index: 0, text: 'semantic only snippet' },
        ];
        const db = {
            query: vi.fn().mockImplementation((sql: string, params: any[]) => {
                // Basic assertions about SQL structure for RRF fusion path
                if (/UNION ALL/.test(sql) && /ROW_NUMBER\(\) OVER \(ORDER BY c\.embedding/.test(sql)) {
                    expect(/SELECT id, document_id, chunk_index, text, SUM\(rrf\) AS score/.test(sql)).toBe(true);
                    expect(/GROUP BY id, document_id, chunk_index, text/.test(sql)).toBe(true);
                }
                return Promise.resolve({ rows: mockRows, rowCount: mockRows.length });
            })
        } as any;
        const svc = new SearchService(db, embeddings as any, configEnabled);
        const res = await svc.search('hybrid fusion', 10, SearchMode.HYBRID);
        expect(res.mode).toBe(SearchMode.HYBRID);
        // Returned rows should be exactly what db.query provided (service does not reorder after SQL)
        expect(res.results.map(r => r.id)).toEqual(['a', 'b', 'c']);
        // Ensure embedding was requested
        expect(embeddings.embedQuery).toHaveBeenCalledWith('hybrid fusion');
        // Ensure db.query was called once for hybrid path (after initial embedding only)
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('falls back to lexical when embedding call throws (warning includes error)', async () => {
        const failingEmbeddings = { embedQuery: vi.fn().mockRejectedValue(new Error('boom')) };
        const db = makeDb([{ id: 'lex1', document_id: 'dL', chunk_index: 0, text: 'lexical fallback text' }]);
        const svc = new SearchService(db, failingEmbeddings as any, configEnabled);
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
        const svc = new SearchService(db, embeddings as any, configDisabled); // embeddings disabled => lexical path
        await svc.search('something', 500, SearchMode.LEXICAL);
        expect(db.query).toHaveBeenCalledTimes(1);
        const params = db.query.mock.calls[0][1];
        expect(params[1]).toBe(50);
    });

    it('clamps low/invalid limit to 1 (lexical path)', async () => {
        const db = makeDb([]);
        const svc = new SearchService(db, embeddings as any, configDisabled);
        await svc.search('anything', 0, SearchMode.LEXICAL);
        let params = db.query.mock.calls[0][1];
        expect(params[1]).toBe(1);
        db.query.mockClear();
        await svc.search('anything', -10, SearchMode.LEXICAL);
        params = db.query.mock.calls[0][1];
        expect(params[1]).toBe(1);
    });
});
