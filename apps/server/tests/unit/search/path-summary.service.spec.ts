import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PathSummaryService } from '../../../src/modules/search/path-summary.service';
import { DatabaseService } from '../../../src/common/database/database.service';

describe('PathSummaryService', () => {
    let service: PathSummaryService;
    let mockQuery: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PathSummaryService,
                {
                    provide: DatabaseService,
                    useValue: { query: mockQuery },
                },
            ],
        }).compile();

        service = module.get<PathSummaryService>(PathSummaryService);

        // WORKAROUND: Manually assign the mock to fix DI issue
        (service as any).db = { query: mockQuery };

        // Reset mocks
        vi.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('generatePathSummaries', () => {
        it('should return empty map for empty document IDs', async () => {
            const result = await service.generatePathSummaries([]);
            expect(result.size).toBe(0);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        it('should generate path summaries for single document with relationships', async () => {
            const mockRows = [
                {
                    doc_id: 'doc-1',
                    rel_type: 'implements',
                    direction: 'out',
                    target_id: 'req-1',
                    target_type: 'requirement',
                    target_key: 'REQ-1',
                    depth: 1,
                    path_rels: ['implements'],
                },
                {
                    doc_id: 'doc-1',
                    rel_type: 'depends_on',
                    direction: 'out',
                    target_id: 'doc-2',
                    target_type: 'document',
                    target_key: 'Design Doc',
                    depth: 1,
                    path_rels: ['depends_on'],
                },
            ];

            mockQuery.mockResolvedValueOnce({ rows: mockRows, rowCount: 2 } as any);

            const result = await service.generatePathSummaries(['doc-1']);

            expect(result.size).toBe(1);
            expect(result.has('doc-1')).toBe(true);

            const pathData = result.get('doc-1')!;
            expect(pathData.documentId).toBe('doc-1');
            expect(pathData.paths).toHaveLength(2);
            expect(pathData.summary).toContain('implements');
            expect(pathData.summary).toContain('REQ-1');
            expect(pathData.summary).toContain('depends_on');
            expect(pathData.summary).toContain('Design Doc');
        });

        it('should handle multiple documents with different relationships', async () => {
            const mockRows = [
                {
                    doc_id: 'doc-1',
                    rel_type: 'implements',
                    direction: 'out',
                    target_id: 'req-1',
                    target_type: 'requirement',
                    target_key: 'REQ-1',
                    depth: 1,
                    path_rels: ['implements'],
                },
                {
                    doc_id: 'doc-2',
                    rel_type: 'links_to',
                    direction: 'in',
                    target_id: 'meeting-1',
                    target_type: 'meeting',
                    target_key: 'Sprint Planning',
                    depth: 1,
                    path_rels: ['links_to'],
                },
            ];

            mockQuery.mockResolvedValueOnce({ rows: mockRows, rowCount: 2 } as any);

            const result = await service.generatePathSummaries(['doc-1', 'doc-2']);

            expect(result.size).toBe(2);
            expect(result.has('doc-1')).toBe(true);
            expect(result.has('doc-2')).toBe(true);

            const path1 = result.get('doc-1')!;
            expect(path1.summary).toContain('implements');
            expect(path1.summary).toContain('REQ-1');

            const path2 = result.get('doc-2')!;
            expect(path2.summary).toContain('linked from');
            expect(path2.summary).toContain('Sprint Planning');
        });

        it('should handle documents with no relationships', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

            const result = await service.generatePathSummaries(['doc-orphan']);

            // Service returns empty map for documents with no relationships in query results
            expect(result.size).toBe(0);
            expect(result.has('doc-orphan')).toBe(false);
        });

        it('should limit paths to maxPaths parameter', async () => {
            const mockRows = [
                {
                    doc_id: 'doc-1',
                    rel_type: 'implements',
                    direction: 'out',
                    target_id: 'req-1',
                    target_type: 'requirement',
                    target_key: 'REQ-1',
                    depth: 1,
                    path_rels: ['implements'],
                },
                {
                    doc_id: 'doc-1',
                    rel_type: 'depends_on',
                    direction: 'out',
                    target_id: 'doc-2',
                    target_type: 'document',
                    target_key: 'Design',
                    depth: 1,
                    path_rels: ['depends_on'],
                },
                {
                    doc_id: 'doc-1',
                    rel_type: 'references',
                    direction: 'out',
                    target_id: 'doc-3',
                    target_type: 'document',
                    target_key: 'Spec',
                    depth: 1,
                    path_rels: ['references'],
                },
                {
                    doc_id: 'doc-1',
                    rel_type: 'links_to',
                    direction: 'out',
                    target_id: 'doc-4',
                    target_type: 'document',
                    target_key: 'API',
                    depth: 1,
                    path_rels: ['links_to'],
                },
            ];

            mockQuery.mockResolvedValueOnce({ rows: mockRows, rowCount: 4 } as any);

            const result = await service.generatePathSummaries(['doc-1'], { maxPaths: 2 });

            expect(result.size).toBe(1);
            const pathData = result.get('doc-1')!;
            expect(pathData.paths).toHaveLength(2);
        });

        it('should respect maxDepth parameter in query', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

            await service.generatePathSummaries(['doc-1'], { maxDepth: 3 });

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('$2'), // maxDepth parameter
                expect.arrayContaining([['doc-1'], 3]),
            );
        });

        it('should generate human-readable summaries for outgoing relationships', async () => {
            const mockRows = [
                {
                    doc_id: 'doc-1',
                    rel_type: 'implements',
                    direction: 'out',
                    target_id: 'req-1',
                    target_type: 'requirement',
                    target_key: 'REQ-1',
                    depth: 1,
                    path_rels: ['implements'],
                },
            ];

            mockQuery.mockResolvedValueOnce({ rows: mockRows, rowCount: 1 } as any);

            const result = await service.generatePathSummaries(['doc-1']);
            const pathData = result.get('doc-1')!;

            expect(pathData.summary).toContain('implements');
            expect(pathData.summary).toContain('requirement');
            expect(pathData.summary).toContain('REQ-1');
            expect(pathData.summary).not.toContain('linked from'); // Should not use incoming language
        });

        it('should generate human-readable summaries for incoming relationships', async () => {
            const mockRows = [
                {
                    doc_id: 'doc-1',
                    rel_type: 'depends_on',
                    direction: 'in',
                    target_id: 'doc-2',
                    target_type: 'document',
                    target_key: 'Architecture',
                    depth: 1,
                    path_rels: ['depends_on'],
                },
            ];

            mockQuery.mockResolvedValueOnce({ rows: mockRows, rowCount: 1 } as any);

            const result = await service.generatePathSummaries(['doc-1']);
            const pathData = result.get('doc-1')!;

            expect(pathData.summary).toContain('linked from');
            expect(pathData.summary).toContain('depends_on');
            expect(pathData.summary).toContain('Architecture');
        });

        it('should handle multi-hop paths (depth > 1)', async () => {
            const mockRows = [
                {
                    doc_id: 'doc-1',
                    rel_type: 'implements',
                    direction: 'out',
                    target_id: 'req-1',
                    target_type: 'requirement',
                    target_key: 'REQ-1',
                    depth: 1,
                    path_rels: ['implements'],
                },
                {
                    doc_id: 'doc-1',
                    rel_type: 'discussed_in',
                    direction: 'out',
                    target_id: 'meeting-1',
                    target_type: 'meeting',
                    target_key: 'Sprint Planning',
                    depth: 2,
                    path_rels: ['discussed_in'],
                },
            ];

            mockQuery.mockResolvedValueOnce({ rows: mockRows, rowCount: 2 } as any);

            const result = await service.generatePathSummaries(['doc-1']);
            const pathData = result.get('doc-1')!;

            expect(pathData.paths).toHaveLength(2);
            expect(pathData.summary).toContain('REQ-1');
            expect(pathData.summary).toContain('Sprint Planning');
        });

        it('should handle database query errors gracefully', async () => {
            mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

            // Service catches errors and returns empty map - this is correct defensive behavior
            const result = await service.generatePathSummaries(['doc-1']);
            expect(result.size).toBe(0);
        });

        it('should pass document IDs to query as-is (no deduplication)', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

            await service.generatePathSummaries(['doc-1', 'doc-1', 'doc-2', 'doc-1']);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.any(String),
                expect.arrayContaining([['doc-1', 'doc-1', 'doc-2', 'doc-1']]), // Passed as-is
            );
        });

        it('should include both paths when summary has multiple relationships', async () => {
            const mockRows = [
                {
                    doc_id: 'doc-1',
                    rel_type: 'implements',
                    direction: 'out',
                    target_id: 'req-1',
                    target_type: 'requirement',
                    target_key: 'REQ-1',
                    depth: 1,
                    path_rels: ['implements'],
                },
                {
                    doc_id: 'doc-1',
                    rel_type: 'depends_on',
                    direction: 'out',
                    target_id: 'doc-2',
                    target_type: 'document',
                    target_key: 'Design Doc',
                    depth: 1,
                    path_rels: ['depends_on'],
                },
            ];

            mockQuery.mockResolvedValueOnce({ rows: mockRows, rowCount: 2 } as any);

            const result = await service.generatePathSummaries(['doc-1']);
            const pathData = result.get('doc-1')!;

            // Should contain semicolon separator (not "and")
            expect(pathData.summary).toContain('REQ-1');
            expect(pathData.summary).toContain('Design Doc');
            expect(pathData.summary).toMatch(/REQ-1.*;.*Design Doc|Design Doc.*;.*REQ-1/);
        });
    });
});
