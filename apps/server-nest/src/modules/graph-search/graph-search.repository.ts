// Temporary stub repository for graph search candidates.
// TODO: Replace with real SQL queries (lexical ts_rank + vector ANN) once schema & data ready.
export interface CandidateRow {
    id: string;
    lexical_score?: number;
    vector_score?: number;
}

export class GraphSearchRepository {
    async lexicalCandidates(query: string, limit: number): Promise<CandidateRow[]> {
        // Deterministic pseudo scores based on char codes to make tests stable.
        const base = query.length || 1;
        return Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
            id: `doc-lex-${i + 1}`,
            lexical_score: (base + i) / (base + 10),
        }));
    }

    async vectorCandidates(embedding: number[], limit: number): Promise<CandidateRow[]> {
        const mag = embedding.reduce((a, b) => a + Math.abs(b), 0) || 1;
        return Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
            id: `doc-vec-${i + 1}`,
            vector_score: 1 - (i / (limit + 5)) * (mag % 0.5),
        }));
    }
}
