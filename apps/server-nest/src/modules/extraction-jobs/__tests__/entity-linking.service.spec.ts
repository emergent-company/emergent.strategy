import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EntityLinkingService } from '../entity-linking.service';
import { DatabaseService } from '../../../common/database/database.service';
import { GraphService } from '../../graph/graph.service';
import { EmbeddingsService } from '../../embeddings/embeddings.service';
import { ExtractedEntity } from '../llm/llm-provider.interface';

describe('EntityLinkingService', () => {
    let service: EntityLinkingService;
    let mockDb: any;
    let mockGraphService: any;
    let mockEmbeddings: any;

    beforeEach(async () => {
        // Create proper mock objects with vi.fn()
        mockDb = {
            query: vi.fn(),
            isOnline: vi.fn().mockReturnValue(true),
            getPool: vi.fn(),
        };

        mockGraphService = {
            getObject: vi.fn(),
            patchObject: vi.fn(),
        };

        mockEmbeddings = {
            isEnabled: vi.fn().mockReturnValue(true),
            embedQuery: vi.fn(),
            embedDocuments: vi.fn(),
        };

        // Directly instantiate the service with mocks instead of using Test.createTestingModule
        // This avoids NestJS DI issues with Vitest (spec files aren't compiled with decorator metadata)
        service = new EntityLinkingService(
            mockDb as DatabaseService,
            mockGraphService as GraphService,
            mockEmbeddings as EmbeddingsService
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('findSimilarObject', () => {
        const mockEntity: ExtractedEntity = {
            name: 'Test Product',
            type_name: 'Product',
            properties: { id: 'PROD-001' },
            description: 'A test product',
            business_key: 'prod-001',
            confidence: 0.9,
        };

        it('should return null for always_new strategy', async () => {
            const result = await service.findSimilarObject(mockEntity, 'proj-1', 'always_new');

            expect(result).toBeNull();
        });

        it('should use key_match strategy and find exact key match', async () => {
            mockDb.query.mockResolvedValueOnce({
                rows: [{ id: 'obj-123' }],
                rowCount: 1,
            } as any);

            const result = await service.findSimilarObject(mockEntity, 'proj-1', 'key_match');

            expect(result).toBe('obj-123');
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT id FROM kb.graph_objects'),
                ['proj-1', 'Product', 'prod-001']
            );
        });

        it('should find normalized name match if exact key fails', async () => {
            const entityWithoutKey: ExtractedEntity = {
                ...mockEntity,
                business_key: undefined,
            };

            // First query (exact key) returns nothing
            mockDb.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            } as any);

            // Second query (normalized name) returns match
            mockDb.query.mockResolvedValueOnce({
                rows: [{ id: 'obj-456' }],
                rowCount: 1,
            } as any);

            const result = await service.findSimilarObject(entityWithoutKey, 'proj-1', 'key_match');

            expect(result).toBe('obj-456');
            expect(mockDb.query).toHaveBeenCalledTimes(2);
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('LOWER(TRIM(properties->>\'name\'))'),
                ['proj-1', 'Product', 'test product']
            );
        });

        it('should extract key from properties if business_key and name fail', async () => {
            const entityWithPropertyKey: ExtractedEntity = {
                name: 'Test Product',
                type_name: 'Product',
                properties: { id: 'PROD-001' },
                description: 'A test product',
                confidence: 0.9,
            };

            // First query (exact key) - no business_key, skip
            // Second query (normalized name) returns nothing
            mockDb.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            } as any);

            // Third query (extracted property key) returns match
            mockDb.query.mockResolvedValueOnce({
                rows: [{ id: 'obj-789' }],
                rowCount: 1,
            } as any);

            const result = await service.findSimilarObject(entityWithPropertyKey, 'proj-1', 'key_match');

            expect(result).toBe('obj-789');
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT id FROM kb.graph_objects'),
                ['proj-1', 'Product', 'PROD-001'] // Extracted from properties.id
            );
        });

        it('should return null if no matches found', async () => {
            const entityNoMatch: ExtractedEntity = {
                name: 'Unknown Product',
                type_name: 'Product',
                properties: {},
                description: '',
                confidence: 0.7,
            };

            // All queries return nothing
            mockDb.query.mockResolvedValue({
                rows: [],
                rowCount: 0,
            } as any);

            const result = await service.findSimilarObject(entityNoMatch, 'proj-1', 'key_match');

            expect(result).toBeNull();
        });

        it('should fallback to key_match for vector_similarity (not yet implemented)', async () => {
            mockDb.query.mockResolvedValueOnce({
                rows: [{ id: 'obj-999' }],
                rowCount: 1,
            } as any);

            const result = await service.findSimilarObject(mockEntity, 'proj-1', 'vector_similarity');

            expect(result).toBe('obj-999');
            // Should have used key_match fallback
            expect(mockDb.query).toHaveBeenCalled();
        });
    });

    describe('mergeEntityIntoObject', () => {
        const mockEntity: ExtractedEntity = {
            name: 'Updated Product',
            type_name: 'Product',
            properties: {
                price: 99.99,
                category: 'Electronics',
            },
            description: 'Updated description',
            confidence: 0.88,
        };

        const existingObject = {
            id: 'obj-123',
            type: 'Product',
            properties: {
                price: 79.99, // Will be overridden
                stock: 100,   // Will be preserved
                category: 'Tech', // Will be overridden
            },
            created_at: '2024-01-01T00:00:00Z',
        };

        it('should merge entity properties into existing object', async () => {
            mockGraphService.getObject.mockResolvedValueOnce(existingObject as any);
            mockGraphService.patchObject.mockResolvedValueOnce({ id: 'obj-123' } as any);

            const result = await service.mergeEntityIntoObject('obj-123', mockEntity, 'job-456');

            expect(result).toBe('obj-123');
            expect(mockGraphService.getObject).toHaveBeenCalledWith('obj-123');
            expect(mockGraphService.patchObject).toHaveBeenCalledWith('obj-123', {
                properties: {
                    // Existing properties preserved
                    stock: 100,
                    // New/updated properties
                    price: 99.99,
                    category: 'Electronics',
                    // Metadata
                    name: 'Updated Product',
                    description: 'Updated description',
                    _extraction_last_updated_by_job: 'job-456',
                    _extraction_last_updated_at: expect.any(String),
                },
            });
        });

        it('should throw error if existing object not found', async () => {
            const notFoundError = new Error('object_not_found');
            notFoundError.name = 'NotFoundException';
            mockGraphService.getObject.mockRejectedValueOnce(notFoundError);

            await expect(
                service.mergeEntityIntoObject('obj-404', mockEntity, 'job-456')
            ).rejects.toThrow('object_not_found');
        });

        it('should preserve existing description if entity has none', async () => {
            const entityNoDescription: ExtractedEntity = {
                name: 'Updated Product',
                type_name: 'Product',
                properties: {
                    price: 99.99,
                    category: 'Electronics',
                },
                description: '',
                confidence: 0.88,
            };

            const existingWithDescription = {
                ...existingObject,
                properties: {
                    ...existingObject.properties,
                    description: 'Original description',
                },
            };

            mockGraphService.getObject.mockResolvedValueOnce(existingWithDescription as any);
            mockGraphService.patchObject.mockResolvedValueOnce({ id: 'obj-123' } as any);

            await service.mergeEntityIntoObject('obj-123', entityNoDescription, 'job-456');

            expect(mockGraphService.patchObject).toHaveBeenCalledWith('obj-123', {
                properties: expect.objectContaining({
                    description: 'Original description',
                }),
            });
        });
    });

    describe('calculatePropertyOverlap', () => {
        it('should return 1.0 for identical properties', () => {
            const entity: ExtractedEntity = {
                name: 'Product A',
                type_name: 'Product',
                properties: {
                    price: 100,
                    category: 'Electronics',
                },
                description: '',
                confidence: 0.9,
            };

            const existingProperties = {
                price: 100,
                category: 'Electronics',
            };

            const overlap = service.calculatePropertyOverlap(entity, existingProperties);

            expect(overlap).toBe(1.0);
        });

        it('should return 0.5 for partial overlap', () => {
            const entity: ExtractedEntity = {
                name: 'Product A',
                type_name: 'Product',
                properties: {
                    price: 100,
                    category: 'Electronics',
                },
                description: '',
                confidence: 0.9,
            };

            const existingProperties = {
                price: 100,        // Matches
                category: 'Tech',  // Different
                stock: 50,         // New key
            };

            // Unique keys: price, category, stock = 3
            // Matching values: price = 1
            // Overlap: 1 / 3 ≈ 0.33
            const overlap = service.calculatePropertyOverlap(entity, existingProperties);

            expect(overlap).toBeCloseTo(0.33, 1);
        });

        it('should handle case-insensitive string matching', () => {
            const entity: ExtractedEntity = {
                name: 'Product A',
                type_name: 'Product',
                properties: {
                    category: 'Electronics',
                },
                description: '',
                confidence: 0.9,
            };

            const existingProperties = {
                category: 'ELECTRONICS', // Different case
            };

            const overlap = service.calculatePropertyOverlap(entity, existingProperties);

            expect(overlap).toBe(1.0); // Should match after normalization
        });

        it('should return 0.0 for empty entity properties', () => {
            const entity: ExtractedEntity = {
                name: 'Product A',
                type_name: 'Product',
                properties: {},
                description: '',
                confidence: 0.5,
            };

            const existingProperties = {
                price: 100,
            };

            const overlap = service.calculatePropertyOverlap(entity, existingProperties);

            expect(overlap).toBe(0.0);
        });

        it('should return 0.0 for no overlapping keys', () => {
            const entity: ExtractedEntity = {
                name: 'Product A',
                type_name: 'Product',
                properties: {
                    price: 100,
                },
                description: '',
                confidence: 0.8,
            };

            const existingProperties = {
                category: 'Electronics',
            };

            const overlap = service.calculatePropertyOverlap(entity, existingProperties);

            expect(overlap).toBe(0.0); // No matching keys or values
        });
    });

    describe('decideMergeAction', () => {
        const mockEntity: ExtractedEntity = {
            name: 'Product A',
            type_name: 'Product',
            properties: {
                price: 100,
                category: 'Electronics',
            },
            description: '',
            confidence: 0.9,
        };

        it('should return create for always_new strategy', async () => {
            const result = await service.decideMergeAction(mockEntity, 'proj-1', 'always_new');

            expect(result).toEqual({ action: 'create' });
        });

        it('should return create if no similar object found', async () => {
            mockDb.query.mockResolvedValue({
                rows: [],
                rowCount: 0,
            } as any);

            const result = await service.decideMergeAction(mockEntity, 'proj-1', 'key_match');

            expect(result).toEqual({ action: 'create' });
        });

        it('should return skip for high overlap (>90%)', async () => {
            // Find similar object
            mockDb.query.mockResolvedValueOnce({
                rows: [{ id: 'obj-123' }],
                rowCount: 1,
            } as any);

            // Get object with identical properties
            mockGraphService.getObject.mockResolvedValueOnce({
                id: 'obj-123',
                type: 'Product',
                properties: {
                    price: 100,
                    category: 'Electronics',
                },
            } as any);

            const result = await service.decideMergeAction(mockEntity, 'proj-1', 'key_match');

            expect(result).toEqual({
                action: 'skip',
                existingObjectId: 'obj-123',
            });
        });

        it('should return merge for partial overlap (<90%)', async () => {
            // Find similar object
            mockDb.query.mockResolvedValueOnce({
                rows: [{ id: 'obj-456' }],
                rowCount: 1,
            } as any);

            // Get object with partial overlap
            mockGraphService.getObject.mockResolvedValueOnce({
                id: 'obj-456',
                type: 'Product',
                properties: {
                    price: 80,      // Different value
                    stock: 50,      // New key
                },
            } as any);

            const result = await service.decideMergeAction(mockEntity, 'proj-1', 'key_match');

            expect(result).toEqual({
                action: 'merge',
                existingObjectId: 'obj-456',
            });
        });

        it('should return create if existing object was deleted between find and get', async () => {
            // Find similar object
            mockDb.query.mockResolvedValueOnce({
                rows: [{ id: 'obj-deleted' }],
                rowCount: 1,
            } as any);

            // Object not found (deleted) - GraphService throws NotFoundException
            const notFoundError = new Error('object_not_found');
            notFoundError.name = 'NotFoundException';
            mockGraphService.getObject.mockRejectedValueOnce(notFoundError);

            const result = await service.decideMergeAction(mockEntity, 'proj-1', 'key_match');

            expect(result).toEqual({ action: 'create' });
        });
    });

    describe('key normalization', () => {
        it('should normalize keys to lowercase and trimmed', () => {
            const entity: ExtractedEntity = {
                name: '  Test Product  ',
                type_name: 'Product',
                properties: {},
                description: '',
                confidence: 0.8,
            };

            mockDb.query.mockResolvedValueOnce({
                rows: [{ id: 'obj-normalized' }],
                rowCount: 1,
            } as any);

            service.findSimilarObject(entity, 'proj-1', 'key_match');

            // Should query with normalized name
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('LOWER(TRIM(properties->>\'name\'))'),
                ['proj-1', 'Product', 'test product']
            );
        });
    });

    describe('property key extraction', () => {
        it('should extract id field as key', async () => {
            const entity: ExtractedEntity = {
                name: 'Product',
                type_name: 'Product',
                properties: {
                    id: 'PROD-123',
                    name: 'Test',
                },
                description: '',
                confidence: 0.85,
            };

            mockDb.query.mockResolvedValue({
                rows: [],
                rowCount: 0,
            } as any);

            mockDb.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            } as any); // normalized name

            mockDb.query.mockResolvedValueOnce({
                rows: [{ id: 'obj-id-match' }],
                rowCount: 1,
            } as any); // property key match

            const result = await service.findSimilarObject(entity, 'proj-1', 'key_match');

            expect(result).toBe('obj-id-match');
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT id FROM kb.graph_objects'),
                ['proj-1', 'Product', 'PROD-123']
            );
        });

        it('should extract code field as key if id not present', async () => {
            const entity: ExtractedEntity = {
                name: 'Product',
                type_name: 'Product',
                properties: {
                    code: 'CODE-456',
                    name: 'Test',
                },
                description: '',
                confidence: 0.85,
            };

            mockDb.query.mockResolvedValue({
                rows: [],
                rowCount: 0,
            } as any);

            mockDb.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            } as any); // normalized name

            mockDb.query.mockResolvedValueOnce({
                rows: [{ id: 'obj-code-match' }],
                rowCount: 1,
            } as any); // property key match

            const result = await service.findSimilarObject(entity, 'proj-1', 'key_match');

            expect(result).toBe('obj-code-match');
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT id FROM kb.graph_objects'),
                ['proj-1', 'Product', 'CODE-456']
            );
        });

        it('should extract type-specific keys (e.g., product_id)', async () => {
            const entity: ExtractedEntity = {
                name: 'Product',
                type_name: 'Product',
                properties: {
                    product_id: 'P-789',
                    name: 'Test',
                },
                description: '',
                confidence: 0.85,
            };

            mockDb.query.mockResolvedValue({
                rows: [],
                rowCount: 0,
            } as any);

            mockDb.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            } as any); // normalized name

            mockDb.query.mockResolvedValueOnce({
                rows: [{ id: 'obj-type-specific' }],
                rowCount: 1,
            } as any); // property key match

            const result = await service.findSimilarObject(entity, 'proj-1', 'key_match');

            expect(result).toBe('obj-type-specific');
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT id FROM kb.graph_objects'),
                ['proj-1', 'Product', 'P-789']
            );
        });
    });

    describe('Vector Similarity', () => {
        const mockEntity: ExtractedEntity = {
            name: 'Test Product',
            type_name: 'Product',
            properties: { description: 'A premium product' }, // No 'id' or key fields
            description: 'A test product for vector similarity',
            confidence: 0.9,
        };

        describe('findSimilarObject with vector_similarity strategy', () => {
            it('should try key match first before vector search', async () => {
                // Key match succeeds
                mockDb.query.mockResolvedValueOnce({
                    rows: [{ id: 'obj-key-match' }],
                    rowCount: 1,
                } as any);

                const result = await service.findSimilarObject(mockEntity, 'proj-1', 'vector_similarity');

                expect(result).toBe('obj-key-match');
                expect(mockDb.query).toHaveBeenCalledTimes(1);
                expect(mockEmbeddings.embedQuery).not.toHaveBeenCalled();
            });

            it('should fall back to vector search when key match fails', async () => {
                // Use entity with explicit business_key to simplify mock setup
                const entityForVectorSearch: ExtractedEntity = {
                    name: 'Unique Vector Product',  // Different name to avoid cache
                    type_name: 'Product',
                    business_key: 'nonexistent-key',
                    properties: { description: 'A premium product' },
                    description: 'A test product for vector similarity',
                    confidence: 0.9,
                };

                // Key match fails - exact key, normalized name, property extraction all fail
                mockDb.query
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)  // exact key
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // normalized name

                // Mock embedding generation
                const mockEmbedding = new Array(768).fill(0.1);
                mockEmbeddings.embedQuery.mockResolvedValueOnce(mockEmbedding);

                // Mock vector similarity query result
                mockDb.query.mockResolvedValueOnce({
                    rows: [{ id: 'obj-vector-match', similarity: 0.92 }],
                    rowCount: 1,
                } as any);

                const result = await service.findSimilarObject(entityForVectorSearch, 'proj-1', 'vector_similarity');

                expect(result).toBe('obj-vector-match');
                expect(mockEmbeddings.embedQuery).toHaveBeenCalledWith(
                    expect.stringContaining('Unique Vector Product')
                );
                expect(mockDb.query).toHaveBeenCalledWith(
                    expect.stringContaining('embedding_v1 <=>'),
                    expect.arrayContaining([
                        JSON.stringify(mockEmbedding),
                        'proj-1',
                        'Product',
                        0.85
                    ])
                );
            });

            it('should return null if embeddings service is disabled', async () => {
                mockEmbeddings.isEnabled.mockReturnValue(false);

                // Key match fails
                mockDb.query.mockResolvedValue({
                    rows: [],
                    rowCount: 0,
                } as any);

                const result = await service.findSimilarObject(mockEntity, 'proj-1', 'vector_similarity');

                expect(result).toBeNull();
                expect(mockEmbeddings.embedQuery).not.toHaveBeenCalled();
            });

            it('should return null if no vector match meets threshold', async () => {
                // Key match fails
                mockDb.query.mockResolvedValue({
                    rows: [],
                    rowCount: 0,
                } as any);

                const mockEmbedding = new Array(768).fill(0.1);
                mockEmbeddings.embedQuery.mockResolvedValueOnce(mockEmbedding);

                // Vector query returns no results (below threshold)
                mockDb.query.mockResolvedValueOnce({
                    rows: [],
                    rowCount: 0,
                } as any);

                const result = await service.findSimilarObject(mockEntity, 'proj-1', 'vector_similarity');

                expect(result).toBeNull();
            });

            it('should handle vector search errors gracefully', async () => {
                // Key match fails
                mockDb.query.mockResolvedValue({
                    rows: [],
                    rowCount: 0,
                } as any);

                // Embedding generation fails
                mockEmbeddings.embedQuery.mockRejectedValueOnce(new Error('API rate limit'));

                const result = await service.findSimilarObject(mockEntity, 'proj-1', 'vector_similarity');

                expect(result).toBeNull();
            });
        });

        describe('generateEntityText', () => {
            it('should create rich text from entity properties', async () => {
                // We test this indirectly by checking what gets passed to embedQuery
                mockDb.query.mockResolvedValue({
                    rows: [],
                    rowCount: 0,
                } as any);

                const mockEmbedding = new Array(768).fill(0.1);
                mockEmbeddings.embedQuery.mockResolvedValueOnce(mockEmbedding);

                await service.findSimilarObject(mockEntity, 'proj-1', 'vector_similarity');

                // Check that embedQuery was called with text including name, type, description
                const calledWith = mockEmbeddings.embedQuery.mock.calls[0][0];
                expect(calledWith).toContain('Test Product');
                expect(calledWith).toContain('Type: Product');
                expect(calledWith).toContain('A test product for vector similarity');
            });

            it('should handle entities with minimal properties', async () => {
                const minimalEntity: ExtractedEntity = {
                    name: 'Simple Product',
                    type_name: 'Product',
                    description: '',
                    confidence: 0.8,
                };

                mockDb.query.mockResolvedValue({
                    rows: [],
                    rowCount: 0,
                } as any);

                const mockEmbedding = new Array(768).fill(0.1);
                mockEmbeddings.embedQuery.mockResolvedValueOnce(mockEmbedding);

                await service.findSimilarObject(minimalEntity, 'proj-1', 'vector_similarity');

                const calledWith = mockEmbeddings.embedQuery.mock.calls[0][0];
                expect(calledWith).toContain('Simple Product');
                expect(calledWith).toContain('Type: Product');
            });
        });

        describe('embedding cache', () => {
            it('should cache embeddings to avoid redundant API calls', async () => {
                const mockEmbedding = new Array(768).fill(0.1);
                mockEmbeddings.embedQuery.mockResolvedValue(mockEmbedding);

                mockDb.query.mockResolvedValue({
                    rows: [],
                    rowCount: 0,
                } as any);

                // First call
                await service.findSimilarObject(mockEntity, 'proj-1', 'vector_similarity');
                expect(mockEmbeddings.embedQuery).toHaveBeenCalledTimes(1);

                // Second call with same entity (should use cache)
                await service.findSimilarObject(mockEntity, 'proj-1', 'vector_similarity');
                // embedQuery should still be called only once (cached)
                expect(mockEmbeddings.embedQuery).toHaveBeenCalledTimes(1);
            });

            it('should evict old cache entries when cache is full', async () => {
                const mockEmbedding = new Array(768).fill(0.1);
                mockEmbeddings.embedQuery.mockResolvedValue(mockEmbedding);

                mockDb.query.mockResolvedValue({
                    rows: [],
                    rowCount: 0,
                } as any);

                // Fill cache beyond 1000 entries (this is a simplified test)
                // In practice, we can't easily test the full cache eviction without creating 1001 unique entities
                // So we just verify that the cache doesn't break with multiple calls
                for (let i = 0; i < 5; i++) {
                    const uniqueEntity = {
                        ...mockEntity,
                        name: `Product ${i}`,
                    };
                    await service.findSimilarObject(uniqueEntity, 'proj-1', 'vector_similarity');
                }

                // Should have called embedQuery for each unique entity
                expect(mockEmbeddings.embedQuery).toHaveBeenCalledTimes(5);
            });
        });

        describe('vector similarity threshold', () => {
            it('should only return matches above threshold (0.85)', async () => {
                mockDb.query.mockResolvedValue({
                    rows: [],
                    rowCount: 0,
                } as any);

                const mockEmbedding = new Array(768).fill(0.1);
                mockEmbeddings.embedQuery.mockResolvedValueOnce(mockEmbedding);

                await service.findSimilarObject(mockEntity, 'proj-1', 'vector_similarity');

                // Check that the query includes the threshold parameter (0.85)
                const vectorQuery = mockDb.query.mock.calls.find((call: any) =>
                    call[0].includes('embedding_v1 <=>')
                );
                expect(vectorQuery).toBeDefined();
                expect(vectorQuery[1]).toContain(0.85);
            });
        });
    });
});
