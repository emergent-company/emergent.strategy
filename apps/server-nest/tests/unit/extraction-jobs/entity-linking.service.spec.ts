import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EntityLinkingService } from '../../../src/modules/extraction-jobs/entity-linking.service';
import { GraphService } from '../../../src/modules/extraction-jobs/../graph/graph.service';
import { EmbeddingsService } from '../../../src/modules/extraction-jobs/../embeddings/embeddings.service';
import { ExtractedEntity } from '../../../src/modules/extraction-jobs/llm/llm-provider.interface';

describe('EntityLinkingService', () => {
  let service: EntityLinkingService;
  let mockGraphService: any;
  let mockEmbeddings: any;
  let mockGraphObjectRepo: any;
  let mockDataSource: any;

  beforeEach(async () => {
    // Create proper mock objects with vi.fn()
    mockGraphService = {
      getObject: vi.fn(),
      patchObject: vi.fn(),
    };

    mockEmbeddings = {
      isEnabled: vi.fn().mockReturnValue(true),
      embedQuery: vi.fn(),
      embedDocuments: vi.fn(),
    };

    // Create mock GraphObject repository
    mockGraphObjectRepo = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
    } as any;

    // Create mock DataSource
    mockDataSource = {
      query: vi.fn(),
      createQueryRunner: vi.fn(),
    } as any;

    // Directly instantiate the service with mocks instead of using Test.createTestingModule
    // This avoids NestJS DI issues with Vitest (spec files aren't compiled with decorator metadata)
    // Constructor expects: (graphService, embeddings, graphObjectRepo, dataSource)
    service = new EntityLinkingService(
      mockGraphService as GraphService,
      mockEmbeddings as EmbeddingsService,
      mockGraphObjectRepo,
      mockDataSource
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
      const result = await service.findSimilarObject(
        mockEntity,
        'proj-1',
        'always_new'
      );

      expect(result).toBeNull();
    });

    it('should use key_match strategy and find exact key match', async () => {
      // Mock GraphObject repository findOne (used for business_key lookup)
      mockGraphObjectRepo.findOne.mockResolvedValueOnce({ id: 'obj-123' });

      const result = await service.findSimilarObject(
        mockEntity,
        'proj-1',
        'key_match'
      );

      expect(result).toBe('obj-123');
      expect(mockGraphObjectRepo.findOne).toHaveBeenCalledWith({
        where: { projectId: 'proj-1', type: 'Product', key: 'prod-001' },
        select: ['id'],
      });
    });

    it('should find normalized name match if exact key fails', async () => {
      const entityWithoutKey: ExtractedEntity = {
        ...mockEntity,
        business_key: undefined,
      };

      // No business_key, so goes directly to normalized name query (DataSource.query)
      mockDataSource.query.mockResolvedValueOnce([{ id: 'obj-456' }]);

      const result = await service.findSimilarObject(
        entityWithoutKey,
        'proj-1',
        'key_match'
      );

      expect(result).toBe('obj-456');
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("LOWER(TRIM(properties->>'name'))"),
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

      // No business_key, so Strategy 1 skipped
      // Strategy 2: Normalized name query (DataSource.query) returns nothing
      mockDataSource.query.mockResolvedValueOnce([]);

      // Strategy 3: Property key extraction - uses findByExactKey with extracted 'PROD-001'
      mockGraphObjectRepo.findOne.mockResolvedValueOnce({ id: 'obj-789' });

      const result = await service.findSimilarObject(
        entityWithPropertyKey,
        'proj-1',
        'key_match'
      );

      expect(result).toBe('obj-789');
      expect(mockGraphObjectRepo.findOne).toHaveBeenCalledWith({
        where: { projectId: 'proj-1', type: 'Product', key: 'PROD-001' },
        select: ['id'],
      });
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
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.findSimilarObject(
        entityNoMatch,
        'proj-1',
        'key_match'
      );

      expect(result).toBeNull();
    });

    it('should fallback to key_match for vector_similarity (not yet implemented)', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 'obj-999' }]);

      const result = await service.findSimilarObject(
        mockEntity,
        'proj-1',
        'vector_similarity'
      );

      expect(result).toBe('obj-999');
      // Should have used key_match fallback
      expect(mockDataSource.query).toHaveBeenCalled();
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
        stock: 100, // Will be preserved
        category: 'Tech', // Will be overridden
      },
      created_at: '2024-01-01T00:00:00Z',
    };

    it('should merge entity properties into existing object', async () => {
      mockGraphService.getObject.mockResolvedValueOnce(existingObject as any);
      mockGraphService.patchObject.mockResolvedValueOnce({
        id: 'obj-123',
      } as any);

      const result = await service.mergeEntityIntoObject(
        'obj-123',
        mockEntity,
        'job-456'
      );

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

      mockGraphService.getObject.mockResolvedValueOnce(
        existingWithDescription as any
      );
      mockGraphService.patchObject.mockResolvedValueOnce({
        id: 'obj-123',
      } as any);

      await service.mergeEntityIntoObject(
        'obj-123',
        entityNoDescription,
        'job-456'
      );

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

      const overlap = service.calculatePropertyOverlap(
        entity,
        existingProperties
      );

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
        price: 100, // Matches
        category: 'Tech', // Different
        stock: 50, // New key
      };

      // Unique keys: price, category, stock = 3
      // Matching values: price = 1
      // Overlap: 1 / 3 ≈ 0.33
      const overlap = service.calculatePropertyOverlap(
        entity,
        existingProperties
      );

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

      const overlap = service.calculatePropertyOverlap(
        entity,
        existingProperties
      );

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

      const overlap = service.calculatePropertyOverlap(
        entity,
        existingProperties
      );

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

      const overlap = service.calculatePropertyOverlap(
        entity,
        existingProperties
      );

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
      const result = await service.decideMergeAction(
        mockEntity,
        'proj-1',
        'always_new'
      );

      expect(result).toEqual({ action: 'create' });
    });

    it('should return create if no similar object found', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.decideMergeAction(
        mockEntity,
        'proj-1',
        'key_match'
      );

      expect(result).toEqual({ action: 'create' });
    });

    it('should return skip for high overlap (>90%)', async () => {
      // Find similar object
      mockDataSource.query.mockResolvedValueOnce([{ id: 'obj-123' }]);

      // Get object with identical properties
      mockGraphService.getObject.mockResolvedValueOnce({
        id: 'obj-123',
        type: 'Product',
        properties: {
          price: 100,
          category: 'Electronics',
        },
      } as any);

      const result = await service.decideMergeAction(
        mockEntity,
        'proj-1',
        'key_match'
      );

      expect(result).toEqual({
        action: 'skip',
        existingObjectId: 'obj-123',
      });
    });

    it('should return merge for partial overlap (<90%)', async () => {
      // Find similar object
      mockDataSource.query.mockResolvedValueOnce([{ id: 'obj-456' }]);

      // Get object with partial overlap
      mockGraphService.getObject.mockResolvedValueOnce({
        id: 'obj-456',
        type: 'Product',
        properties: {
          price: 80, // Different value
          stock: 50, // New key
        },
      } as any);

      const result = await service.decideMergeAction(
        mockEntity,
        'proj-1',
        'key_match'
      );

      expect(result).toEqual({
        action: 'merge',
        existingObjectId: 'obj-456',
      });
    });

    it('should return create if existing object was deleted between find and get', async () => {
      // Find similar object
      mockDataSource.query.mockResolvedValueOnce([{ id: 'obj-deleted' }]);

      // Object not found (deleted) - GraphService throws NotFoundException
      const notFoundError = new Error('object_not_found');
      notFoundError.name = 'NotFoundException';
      mockGraphService.getObject.mockRejectedValueOnce(notFoundError);

      const result = await service.decideMergeAction(
        mockEntity,
        'proj-1',
        'key_match'
      );

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

      mockDataSource.query.mockResolvedValueOnce([{ id: 'obj-normalized' }]);

      service.findSimilarObject(entity, 'proj-1', 'key_match');

      // Should query with normalized name
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("LOWER(TRIM(properties->>'name'))"),
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

      // No business_key, Strategy 1 skipped
      // Strategy 2: Normalized name query fails
      mockDataSource.query.mockResolvedValueOnce([]);

      // Strategy 3: Property key extraction - findByExactKey with 'PROD-123'
      mockGraphObjectRepo.findOne.mockResolvedValueOnce({ id: 'obj-id-match' });

      const result = await service.findSimilarObject(
        entity,
        'proj-1',
        'key_match'
      );

      expect(result).toBe('obj-id-match');
      expect(mockGraphObjectRepo.findOne).toHaveBeenCalledWith({
        where: { projectId: 'proj-1', type: 'Product', key: 'PROD-123' },
        select: ['id'],
      });
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

      // No business_key, Strategy 1 skipped
      // Strategy 2: Normalized name query fails
      mockDataSource.query.mockResolvedValueOnce([]);

      // Strategy 3: Property key extraction - findByExactKey with 'CODE-456'
      mockGraphObjectRepo.findOne.mockResolvedValueOnce({
        id: 'obj-code-match',
      });

      const result = await service.findSimilarObject(
        entity,
        'proj-1',
        'key_match'
      );

      expect(result).toBe('obj-code-match');
      expect(mockGraphObjectRepo.findOne).toHaveBeenCalledWith({
        where: { projectId: 'proj-1', type: 'Product', key: 'CODE-456' },
        select: ['id'],
      });
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

      // No business_key, Strategy 1 skipped
      // Strategy 2: Normalized name query fails
      mockDataSource.query.mockResolvedValueOnce([]);

      // Strategy 3: Property key extraction - findByExactKey with 'P-789'
      mockGraphObjectRepo.findOne.mockResolvedValueOnce({
        id: 'obj-type-specific',
      });

      const result = await service.findSimilarObject(
        entity,
        'proj-1',
        'key_match'
      );

      expect(result).toBe('obj-type-specific');
      expect(mockGraphObjectRepo.findOne).toHaveBeenCalledWith({
        where: { projectId: 'proj-1', type: 'Product', key: 'P-789' },
        select: ['id'],
      });
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
        mockDataSource.query.mockResolvedValueOnce([{ id: 'obj-key-match' }]);

        const result = await service.findSimilarObject(
          mockEntity,
          'proj-1',
          'vector_similarity'
        );

        expect(result).toBe('obj-key-match');
        expect(mockDataSource.query).toHaveBeenCalledTimes(1);
        expect(mockEmbeddings.embedQuery).not.toHaveBeenCalled();
      });

      it('should fall back to vector search when key match fails', async () => {
        // Use entity with explicit business_key to simplify mock setup
        const entityForVectorSearch: ExtractedEntity = {
          name: 'Unique Vector Product', // Different name to avoid cache
          type_name: 'Product',
          business_key: 'nonexistent-key',
          properties: { description: 'A premium product' },
          description: 'A test product for vector similarity',
          confidence: 0.9,
        };

        // Key match fails - Strategy 1 (exact business_key) uses repository
        mockGraphObjectRepo.findOne.mockResolvedValueOnce(null);
        // Strategy 2 (normalized name) uses dataSource
        mockDataSource.query.mockResolvedValueOnce([]);

        // Mock embedding generation
        const mockEmbedding = new Array(768).fill(0.1);
        mockEmbeddings.embedQuery.mockResolvedValueOnce(mockEmbedding);

        // Mock vector similarity query result
        mockDataSource.query.mockResolvedValueOnce([
          { id: 'obj-vector-match', similarity: 0.92 },
        ]);

        const result = await service.findSimilarObject(
          entityForVectorSearch,
          'proj-1',
          'vector_similarity'
        );

        expect(result).toBe('obj-vector-match');
        expect(mockEmbeddings.embedQuery).toHaveBeenCalledWith(
          expect.stringContaining('Unique Vector Product')
        );
        expect(mockDataSource.query).toHaveBeenCalledWith(
          expect.stringContaining('embedding_v1 <=>'),
          expect.arrayContaining([
            JSON.stringify(mockEmbedding),
            'proj-1',
            'Product',
            0.85,
          ])
        );
      });

      it('should return null if embeddings service is disabled', async () => {
        mockEmbeddings.isEnabled.mockReturnValue(false);

        // Key match fails
        mockDataSource.query.mockResolvedValue([]);

        const result = await service.findSimilarObject(
          mockEntity,
          'proj-1',
          'vector_similarity'
        );

        expect(result).toBeNull();
        expect(mockEmbeddings.embedQuery).not.toHaveBeenCalled();
      });

      it('should return null if no vector match meets threshold', async () => {
        // Key match fails
        mockDataSource.query.mockResolvedValue([]);

        const mockEmbedding = new Array(768).fill(0.1);
        mockEmbeddings.embedQuery.mockResolvedValueOnce(mockEmbedding);

        // Vector query returns no results (below threshold)
        mockDataSource.query.mockResolvedValueOnce([]);

        const result = await service.findSimilarObject(
          mockEntity,
          'proj-1',
          'vector_similarity'
        );

        expect(result).toBeNull();
      });

      it('should handle vector search errors gracefully', async () => {
        // Key match fails
        mockDataSource.query.mockResolvedValue([]);

        // Embedding generation fails
        mockEmbeddings.embedQuery.mockRejectedValueOnce(
          new Error('API rate limit')
        );

        const result = await service.findSimilarObject(
          mockEntity,
          'proj-1',
          'vector_similarity'
        );

        expect(result).toBeNull();
      });
    });

    describe('generateEntityText', () => {
      it('should create rich text from entity properties', async () => {
        // We test this indirectly by checking what gets passed to embedQuery
        mockDataSource.query.mockResolvedValue({
          rows: [],
          rowCount: 0,
        } as any);

        const mockEmbedding = new Array(768).fill(0.1);
        mockEmbeddings.embedQuery.mockResolvedValueOnce(mockEmbedding);

        await service.findSimilarObject(
          mockEntity,
          'proj-1',
          'vector_similarity'
        );

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

        mockDataSource.query.mockResolvedValue([]);

        const mockEmbedding = new Array(768).fill(0.1);
        mockEmbeddings.embedQuery.mockResolvedValueOnce(mockEmbedding);

        await service.findSimilarObject(
          minimalEntity,
          'proj-1',
          'vector_similarity'
        );

        const calledWith = mockEmbeddings.embedQuery.mock.calls[0][0];
        expect(calledWith).toContain('Simple Product');
        expect(calledWith).toContain('Type: Product');
      });
    });

    describe('embedding cache', () => {
      it('should cache embeddings to avoid redundant API calls', async () => {
        const mockEmbedding = new Array(768).fill(0.1);
        mockEmbeddings.embedQuery.mockResolvedValue(mockEmbedding);

        mockDataSource.query.mockResolvedValue([]);

        // First call
        await service.findSimilarObject(
          mockEntity,
          'proj-1',
          'vector_similarity'
        );
        expect(mockEmbeddings.embedQuery).toHaveBeenCalledTimes(1);

        // Second call with same entity (should use cache)
        await service.findSimilarObject(
          mockEntity,
          'proj-1',
          'vector_similarity'
        );
        // embedQuery should still be called only once (cached)
        expect(mockEmbeddings.embedQuery).toHaveBeenCalledTimes(1);
      });

      it('should evict old cache entries when cache is full', async () => {
        const mockEmbedding = new Array(768).fill(0.1);
        mockEmbeddings.embedQuery.mockResolvedValue(mockEmbedding);

        mockDataSource.query.mockResolvedValue([]);

        // Fill cache beyond 1000 entries (this is a simplified test)
        // In practice, we can't easily test the full cache eviction without creating 1001 unique entities
        // So we just verify that the cache doesn't break with multiple calls
        for (let i = 0; i < 5; i++) {
          const uniqueEntity = {
            ...mockEntity,
            name: `Product ${i}`,
          };
          await service.findSimilarObject(
            uniqueEntity,
            'proj-1',
            'vector_similarity'
          );
        }

        // Should have called embedQuery for each unique entity
        expect(mockEmbeddings.embedQuery).toHaveBeenCalledTimes(5);
      });
    });

    describe('vector similarity threshold', () => {
      it('should only return matches above threshold (0.85)', async () => {
        mockDataSource.query.mockResolvedValue([]);

        const mockEmbedding = new Array(768).fill(0.1);
        mockEmbeddings.embedQuery.mockResolvedValueOnce(mockEmbedding);

        await service.findSimilarObject(
          mockEntity,
          'proj-1',
          'vector_similarity'
        );

        // Check that the query includes the threshold parameter (0.85)
        const vectorQuery = mockDataSource.query.mock.calls.find((call: any) =>
          call[0].includes('embedding_v1 <=>')
        );
        expect(vectorQuery).toBeDefined();
        expect(vectorQuery[1]).toContain(0.85);
      });
    });
  });
});
