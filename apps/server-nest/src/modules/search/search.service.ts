import { Injectable } from '@nestjs/common';
import { SearchMode } from './dto/search-query.dto';

interface SearchResultItem {
    id: string;
    snippet: string;
    score: number;
    source?: string;
}

@Injectable()
export class SearchService {
    async search(query: string, limit: number, mode: SearchMode): Promise<SearchResultItem[]> {
        // TODO: integrate real hybrid search (vector + lexical fusion) parity with Express implementation
        return Array.from({ length: Math.min(limit, 5) }).map((_, i) => ({
            id: `mock-${i + 1}`,
            snippet: `Result snippet for "${query}" (#${i + 1}, mode=${mode})`,
            score: 1 - i * 0.05,
            source: 'mock',
        }));
    }
}
