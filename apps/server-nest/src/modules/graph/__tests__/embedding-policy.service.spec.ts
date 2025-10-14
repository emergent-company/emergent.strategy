import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingPolicyService } from '../embedding-policy.service';
import { DatabaseService } from '../../../common/database/database.service';
import { CreateEmbeddingPolicyDto, UpdateEmbeddingPolicyDto } from '../embedding-policy.dto';
import { EmbeddingPolicy } from '../embedding-policy.entity';

describe('EmbeddingPolicyService', () => {
    let service: EmbeddingPolicyService;
    let databaseService: DatabaseService;

    const mockDatabaseService = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmbeddingPolicyService,
                {
                    provide: DatabaseService,
                    useValue: mockDatabaseService,
                },
            ],
        }).compile();

        service = module.get<EmbeddingPolicyService>(EmbeddingPolicyService);
        databaseService = module.get<DatabaseService>(DatabaseService);

        // WORKAROUND: Manually assign the mock to fix DI issue
        (service as any).db = mockDatabaseService;

        // Reset mocks
        vi.clearAllMocks();
    });

    describe('shouldEmbed - enabled check', () => {
        it('should not embed when policy disabled', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: false,
                maxPropertySize: null,
                requiredLabels: [],
                excludedLabels: [],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const result = service.shouldEmbed('Document', { title: 'Test' }, [], policies);

            expect(result.shouldEmbed).toBe(false);
            expect(result.reason).toContain('disabled');
        });

        it('should embed when policy enabled', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: null,
                requiredLabels: [],
                excludedLabels: [],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const result = service.shouldEmbed('Document', { title: 'Test' }, [], policies);

            expect(result.shouldEmbed).toBe(true);
            expect(result.reason).toBeUndefined();
        });
    });

    describe('shouldEmbed - property size check', () => {
        it('should not embed when properties exceed size limit', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: 100,
                requiredLabels: [],
                excludedLabels: [],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const largeContent = 'x'.repeat(200);
            const result = service.shouldEmbed('Document', { content: largeContent }, [], policies);

            expect(result.shouldEmbed).toBe(false);
            expect(result.reason).toContain('size');
            expect(result.reason).toContain('exceeds');
        });

        it('should embed when properties within size limit', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: 1000,
                requiredLabels: [],
                excludedLabels: [],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const result = service.shouldEmbed('Document', { title: 'Short text' }, [], policies);

            expect(result.shouldEmbed).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should skip size check when maxPropertySize is null', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: null,
                requiredLabels: [],
                excludedLabels: [],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const largeContent = 'x'.repeat(1000000);
            const result = service.shouldEmbed('Document', { content: largeContent }, [], policies);

            expect(result.shouldEmbed).toBe(true);
            expect(result.reason).toBeUndefined();
        });
    });

    describe('shouldEmbed - required labels check', () => {
        it('should not embed when required labels missing', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: null,
                requiredLabels: ['important', 'reviewed'],
                excludedLabels: [],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const result = service.shouldEmbed('Document', { title: 'Test' }, ['important'], policies);

            expect(result.shouldEmbed).toBe(false);
            expect(result.reason).toContain('Missing required labels');
        });

        it('should embed when all required labels present', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: null,
                requiredLabels: ['important', 'reviewed'],
                excludedLabels: [],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const result = service.shouldEmbed(
                'Document',
                { title: 'Test' },
                ['important', 'reviewed', 'extra'],
                policies
            );

            expect(result.shouldEmbed).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should skip check when requiredLabels is empty', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: null,
                requiredLabels: [],
                excludedLabels: [],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const result = service.shouldEmbed('Document', { title: 'Test' }, [], policies);

            expect(result.shouldEmbed).toBe(true);
            expect(result.reason).toBeUndefined();
        });
    });

    describe('shouldEmbed - excluded labels check', () => {
        it('should not embed when excluded labels present', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: null,
                requiredLabels: [],
                excludedLabels: ['draft', 'temp'],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const result = service.shouldEmbed(
                'Document',
                { title: 'Test' },
                ['important', 'draft'],
                policies
            );

            expect(result.shouldEmbed).toBe(false);
            expect(result.reason).toContain('excluded labels');
        });

        it('should embed when no excluded labels present', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: null,
                requiredLabels: [],
                excludedLabels: ['draft', 'temp'],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const result = service.shouldEmbed(
                'Document',
                { title: 'Test' },
                ['important', 'reviewed'],
                policies
            );

            expect(result.shouldEmbed).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should skip check when excludedLabels is empty', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: null,
                requiredLabels: [],
                excludedLabels: [],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const result = service.shouldEmbed('Document', { title: 'Test' }, ['draft'], policies);

            expect(result.shouldEmbed).toBe(true);
            expect(result.reason).toBeUndefined();
        });
    });

    describe('shouldEmbed - field masking (relevantPaths)', () => {
        it('should filter properties to relevant paths', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: null,
                requiredLabels: [],
                excludedLabels: [],
                relevantPaths: ['/title', '/metadata/author'],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const properties = {
                title: 'Important Document',
                content: 'Long content that should be excluded',
                metadata: {
                    author: 'John Doe',
                    created: '2025-01-01',
                },
            };

            const result = service.shouldEmbed('Document', properties, [], policies);

            expect(result.shouldEmbed).toBe(true);
            expect(result.filteredProperties).toEqual({
                title: 'Important Document',
                metadata: {
                    author: 'John Doe',
                },
            });
        });

        it('should embed all properties when relevantPaths is empty', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: null,
                requiredLabels: [],
                excludedLabels: [],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const properties = {
                title: 'Document',
                content: 'Full content',
            };

            const result = service.shouldEmbed('Document', properties, [], policies);

            expect(result.shouldEmbed).toBe(true);
            expect(result.filteredProperties).toBeUndefined();
        });

        it('should handle deeply nested paths', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: null,
                requiredLabels: [],
                excludedLabels: [],
                relevantPaths: ['/data/nested/deep/value'],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const properties = {
                data: {
                    nested: {
                        deep: {
                            value: 'target',
                            other: 'exclude',
                        },
                    },
                },
                top: 'exclude',
            };

            const result = service.shouldEmbed('Document', properties, [], policies);

            expect(result.shouldEmbed).toBe(true);
            expect(result.filteredProperties).toEqual({
                data: {
                    nested: {
                        deep: {
                            value: 'target',
                        },
                    },
                },
            });
        });
    });

    describe('shouldEmbed - combined filters', () => {
        it('should pass when all filters satisfied', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: 1000,
                requiredLabels: ['reviewed'],
                excludedLabels: ['draft'],
                relevantPaths: ['/title'],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            const result = service.shouldEmbed(
                'Document',
                { title: 'Test Document', extra: 'data' },
                ['reviewed', 'important'],
                policies
            );

            expect(result.shouldEmbed).toBe(true);
            expect(result.filteredProperties).toEqual({ title: 'Test Document' });
        });

        it('should fail when any filter not satisfied', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Document',
                enabled: true,
                maxPropertySize: 1000,
                requiredLabels: ['reviewed'],
                excludedLabels: ['draft'],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            // Missing required label "reviewed"
            const result = service.shouldEmbed(
                'Document',
                { title: 'Test' },
                ['important'],
                policies
            );

            expect(result.shouldEmbed).toBe(false);
            expect(result.reason).toContain('Missing required labels');
        });
    });

    describe('shouldEmbed - no matching policy', () => {
        it('should allow embedding when no policy exists for type', () => {
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId: 'proj-123',
                objectType: 'Requirement',
                enabled: false,
                maxPropertySize: null,
                requiredLabels: [],
                excludedLabels: [],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            // Document type not covered by policy
            const result = service.shouldEmbed('Document', { title: 'Test' }, [], policies);

            expect(result.shouldEmbed).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should allow embedding when policies array is empty', () => {
            const result = service.shouldEmbed('Document', { title: 'Test' }, [], []);

            expect(result.shouldEmbed).toBe(true);
            expect(result.reason).toBeUndefined();
        });
    });

    describe('batchShouldEmbed', () => {
        it('should evaluate multiple objects efficiently', async () => {
            const projectId = 'proj-123';
            const policies: EmbeddingPolicy[] = [{
                id: 'policy-1',
                projectId,
                objectType: 'Document',
                enabled: true,
                maxPropertySize: 100,
                requiredLabels: [],
                excludedLabels: ['draft'],
                relevantPaths: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }];

            // Mock findByProject to return policies
            mockDatabaseService.query.mockResolvedValue({
                rows: [{
                    id: 'policy-1',
                    project_id: projectId,
                    object_type: 'Document',
                    enabled: true,
                    max_property_size: 100,
                    required_labels: [],
                    excluded_labels: ['draft'],
                    relevant_paths: [],
                    created_at: new Date(),
                    updated_at: new Date(),
                }]
            });

            const objects = [
                { type: 'Document', properties: { title: 'Doc 1' }, labels: [] },
                { type: 'Document', properties: { title: 'x'.repeat(200) }, labels: [] },
                { type: 'Document', properties: { title: 'Doc 3' }, labels: ['draft'] },
                { type: 'Requirement', properties: { text: 'Req 1' }, labels: [] },
            ];

            const results = await service.batchShouldEmbed(projectId, objects);

            expect(results).toHaveLength(4);
            expect(results[0].shouldEmbed).toBe(true); // Passes all checks
            expect(results[1].shouldEmbed).toBe(false); // Too large
            expect(results[2].shouldEmbed).toBe(false); // Has excluded label
            expect(results[3].shouldEmbed).toBe(true); // Different type, no policy
        });
    });

    describe('CRUD operations', () => {
        it('should create a new policy', async () => {
            const projectId = 'proj-123';
            const dto: CreateEmbeddingPolicyDto = {
                projectId,
                objectType: 'Document',
                enabled: true,
                maxPropertySize: 10000,
                requiredLabels: ['important'],
                excludedLabels: ['draft'],
                relevantPaths: ['/title', '/content'],
            };

            const mockRow = {
                id: 'policy-1',
                project_id: projectId,
                object_type: 'Document',
                enabled: true,
                max_property_size: 10000,
                required_labels: ['important'],
                excluded_labels: ['draft'],
                relevant_paths: ['/title', '/content'],
                created_at: new Date(),
                updated_at: new Date(),
            };

            mockDatabaseService.query.mockResolvedValue({ rows: [mockRow] });

            const result = await service.create(projectId, dto);

            expect(result).toMatchObject({
                id: 'policy-1',
                projectId,
                objectType: 'Document',
                enabled: true,
            });
            expect(mockDatabaseService.query).toHaveBeenCalledTimes(1);
        });

        it('should return all policies for a project', async () => {
            const projectId = 'proj-123';
            const mockRows = [
                {
                    id: 'policy-1',
                    project_id: projectId,
                    object_type: 'Document',
                    enabled: true,
                    max_property_size: null,
                    required_labels: [],
                    excluded_labels: [],
                    relevant_paths: [],
                    created_at: new Date(),
                    updated_at: new Date(),
                },
                {
                    id: 'policy-2',
                    project_id: projectId,
                    object_type: 'Requirement',
                    enabled: false,
                    max_property_size: 5000,
                    required_labels: ['verified'],
                    excluded_labels: [],
                    relevant_paths: [],
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            ];

            mockDatabaseService.query.mockResolvedValue({ rows: mockRows });

            const result = await service.findByProject(projectId);

            expect(result).toHaveLength(2);
            expect(result[0].objectType).toBe('Document');
            expect(result[1].objectType).toBe('Requirement');
        });

        it('should update policy fields', async () => {
            const policyId = 'policy-1';
            const projectId = 'proj-123';
            const dto: UpdateEmbeddingPolicyDto = {
                enabled: false,
                maxPropertySize: 5000,
            };

            const mockRow = {
                id: policyId,
                project_id: projectId,
                object_type: 'Document',
                enabled: false,
                max_property_size: 5000,
                required_labels: [],
                excluded_labels: [],
                relevant_paths: [],
                created_at: new Date(),
                updated_at: new Date(),
            };

            mockDatabaseService.query.mockResolvedValue({ rows: [mockRow] });

            const result = await service.update(policyId, projectId, dto);

            expect(result).not.toBeNull();
            expect(result?.enabled).toBe(false);
            expect(result?.maxPropertySize).toBe(5000);
        });

        it('should return null when updating non-existent policy', async () => {
            mockDatabaseService.query.mockResolvedValue({ rows: [] });

            const result = await service.update('invalid-id', 'proj-123', { enabled: false });

            expect(result).toBeNull();
        });

        it('should delete a policy', async () => {
            mockDatabaseService.query.mockResolvedValue({ rowCount: 1 });

            const result = await service.delete('policy-1', 'proj-123');

            expect(result).toBe(true);
        });

        it('should return false when deleting non-existent policy', async () => {
            mockDatabaseService.query.mockResolvedValue({ rowCount: 0 });

            const result = await service.delete('invalid-id', 'proj-123');

            expect(result).toBe(false);
        });
    });
});
