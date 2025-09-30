import { describe, it, expect } from 'vitest';
import { GraphSearchService } from '../graph-search.service';
import { GraphSearchRepository } from '../graph-search.repository';
import { EmbeddingService } from '../embedding.service';
import { GraphSearchRequestDto } from '../dto/graph-search-request.dto';

class TestRepo extends GraphSearchRepository {
    async lexicalCandidates(query: string, limit: number) {
        return [
            { id: 'docA', lexical_score: 0.4 },
            { id: 'docB', lexical_score: 0.6 },
        ];
    }
    async vectorCandidates(_embedding: number[], limit: number) {
        return [
            { id: 'docA', vector_score: 0.9 },
            { id: 'docC', vector_score: 0.8 },
        ];
    }
}

describe('GraphSearchService fusion', () => {
    const service = new GraphSearchService(new TestRepo(), new EmbeddingService());

    it('fuses lexical and vector channels producing ranked items', async () => {
        const req: GraphSearchRequestDto = { query: 'hello world', limit: 10 } as any;
        const res = await service.search(req, { debug: false, scopes: [] });
        expect(res.items.length).toBeGreaterThan(0);
        // Ensure rank assignment
        const ranks = res.items.map(i => i.rank);
        expect(new Set(ranks).size).toBe(ranks.length);
        // Confirm presence of combined candidate ids
        const ids = res.items.map(i => i.object_id);
        expect(ids).toContain('docA');
        expect(ids).toContain('docB');
        expect(ids).toContain('docC');
    });

    it('returns warning for empty query', async () => {
        const req: GraphSearchRequestDto = { query: ' ' } as any;
        const res = await service.search(req, { debug: false, scopes: [] });
        expect(res.meta.warnings).toContain('empty_query');
        expect(res.items.length).toBe(0);
    });
});
