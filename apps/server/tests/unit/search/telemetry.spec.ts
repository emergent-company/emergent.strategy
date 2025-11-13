import { describe, it, expect } from 'vitest';
import { SearchResponseDto } from '../../../src/modules/search/dto/search-response.dto';

describe('Search Telemetry', () => {
    describe('SearchResponseDto type', () => {
        it('should allow query_time_ms field', () => {
            const response: SearchResponseDto = {
                mode: 'lexical' as any,
                results: [],
                query_time_ms: 123.45,
            };

            expect(response.query_time_ms).toBe(123.45);
            expect(typeof response.query_time_ms).toBe('number');
        });

        it('should allow result_count field', () => {
            const response: SearchResponseDto = {
                mode: 'hybrid' as any,
                results: [
                    { id: 'chunk-1', snippet: 'test result', score: 0.9, source: 'doc-1' }
                ],
                result_count: 15,
            };

            expect(response.result_count).toBe(15);
            expect(response.results).toHaveLength(1);
        });

        it('should allow both telemetry fields together', () => {
            const response: SearchResponseDto = {
                mode: 'vector' as any,
                results: [
                    { id: 'chunk-1', snippet: 'result 1', score: 0.95, source: 'doc-1' },
                    { id: 'chunk-2', snippet: 'result 2', score: 0.85, source: 'doc-2' },
                ],
                query_time_ms: 87.25,
                result_count: 20,
            };

            expect(response.query_time_ms).toBe(87.25);
            expect(response.result_count).toBe(20);
            expect(response.results).toHaveLength(2);
        });

        it('should allow telemetry fields to be optional', () => {
            const response: SearchResponseDto = {
                mode: 'lexical' as any,
                results: [],
                // No telemetry fields - should still be valid
            };

            expect(response.query_time_ms).toBeUndefined();
            expect(response.result_count).toBeUndefined();
        });

        it('should work with warning field', () => {
            const response: SearchResponseDto = {
                mode: 'lexical' as any,
                results: [],
                warning: 'Embeddings unavailable; fell back to lexical.',
                query_time_ms: 45.12,
                result_count: 0,
            };

            expect(response.warning).toBeDefined();
            expect(response.query_time_ms).toBe(45.12);
            expect(response.result_count).toBe(0);
        });
    });

    describe('telemetry field semantics', () => {
        it('should use query_time_ms to represent milliseconds with decimal precision', () => {
            const response: SearchResponseDto = {
                mode: 'hybrid' as any,
                results: [],
                query_time_ms: 142.78, // Two decimal places for precision
            };

            expect(response.query_time_ms).toBeGreaterThan(0);
            expect(typeof response.query_time_ms).toBe('number');
        });

        it('should use result_count to represent total results found', () => {
            const response: SearchResponseDto = {
                mode: 'hybrid' as any,
                results: [
                    { id: 'chunk-1', snippet: 'result', score: 0.9, source: 'doc-1' }
                ],
                result_count: 50, // Total found (before pagination)
            };

            expect(response.result_count).toBe(50);
            expect(response.results).toHaveLength(1); // Only 1 returned due to limit
        });

        it('should handle zero values', () => {
            const response: SearchResponseDto = {
                mode: 'lexical' as any,
                results: [],
                query_time_ms: 0.5, // Very fast query
                result_count: 0, // No results
            };

            expect(response.query_time_ms).toBeGreaterThanOrEqual(0);
            expect(response.result_count).toBe(0);
        });
    });
});
