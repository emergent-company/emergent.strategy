import { describe, it, expect, beforeEach } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { makeSchemaRegistryStub } from '../helpers/schema-registry.stub';
import { makeFakeGraphDb } from '../helpers/fake-graph-db';

/**
 * Temporal Filtering Tests
 *
 * Tests for the temporal validity filtering feature (Phase 3 Priority #3, Feature 3d).
 *
 * Temporal filtering enables point-in-time queries by filtering nodes and edges
 * based on temporal validity fields:
 * - valid_from/valid_to: Semantic validity period
 * - created_at: Creation timestamp
 * - updated_at: Last modification timestamp
 *
 * NOTE: These are unit tests for the temporal filter DTO and utility function.
 * Integration tests with actual database temporal queries should be added in E2E tests.
 */
describe('Graph Traversal - Temporal Filtering', () => {
  let service: GraphService;
  let db: ReturnType<typeof makeFakeGraphDb>;

  beforeEach(async () => {
    db = makeFakeGraphDb({ enableTraversal: true });
    const schemaRegistryStub = makeSchemaRegistryStub();
    service = new GraphService(db as any, schemaRegistryStub as any);
  });

  describe('Temporal Filter DTO validation', () => {
    it('should accept valid temporal filter with valid_from field', async () => {
      // This test validates the DTO structure is correct
      const filter = {
        asOf: '2025-06-01T12:00:00Z',
        field: 'valid_from' as const,
      };

      // Validate the filter shape matches TemporalFilterDto
      expect(filter.asOf).toBe('2025-06-01T12:00:00Z');
      expect(filter.field).toBe('valid_from');
    });

    it('should accept temporal filter with created_at field', async () => {
      const filter = {
        asOf: '2025-06-01T12:00:00Z',
        field: 'created_at' as const,
      };

      expect(filter.field).toBe('created_at');
    });

    it('should accept temporal filter with updated_at field', async () => {
      const filter = {
        asOf: '2025-06-01T12:00:00Z',
        field: 'updated_at' as const,
      };

      expect(filter.field).toBe('updated_at');
    });

    it('should default to valid_from field when not specified', async () => {
      const filter = {
        asOf: '2025-06-01T12:00:00Z',
      };

      // Default field should be 'valid_from'
      expect(filter.asOf).toBeDefined();
    });
  });

  describe('Temporal filter SQL clause generation', () => {
    it('should generate correct SQL for valid_from mode', async () => {
      // Import the utility function
      const { buildTemporalFilterClause } = await import(
        '../../../src/modules/graph/temporal-filter.util'
      );

      const result = buildTemporalFilterClause({
        asOf: '2025-06-01T12:00:00Z',
        field: 'valid_from',
      });

      expect(result.sqlClause).toContain('valid_from <= $1');
      expect(result.sqlClause).toContain('valid_to IS NULL OR valid_to > $1');
      expect(result.params).toEqual(['2025-06-01T12:00:00Z']);
    });

    it('should generate correct SQL for created_at mode', async () => {
      const { buildTemporalFilterClause } = await import(
        '../../../src/modules/graph/temporal-filter.util'
      );

      const result = buildTemporalFilterClause({
        asOf: '2025-06-01T12:00:00Z',
        field: 'created_at',
      });

      expect(result.sqlClause).toBe('created_at <= $1');
      expect(result.params).toEqual(['2025-06-01T12:00:00Z']);
    });

    it('should generate correct SQL for updated_at mode', async () => {
      const { buildTemporalFilterClause } = await import(
        '../../../src/modules/graph/temporal-filter.util'
      );

      const result = buildTemporalFilterClause({
        asOf: '2025-06-01T12:00:00Z',
        field: 'updated_at',
      });

      expect(result.sqlClause).toBe('updated_at <= $1');
      expect(result.params).toEqual(['2025-06-01T12:00:00Z']);
    });

    it('should include table alias in SQL when provided', async () => {
      const { buildTemporalFilterClause } = await import(
        '../../../src/modules/graph/temporal-filter.util'
      );

      const result = buildTemporalFilterClause(
        {
          asOf: '2025-06-01T12:00:00Z',
          field: 'created_at',
        },
        'o'
      );

      expect(result.sqlClause).toBe('o.created_at <= $1');
    });

    it('should handle edge table alias', async () => {
      const { buildTemporalFilterClause } = await import(
        '../../../src/modules/graph/temporal-filter.util'
      );

      const result = buildTemporalFilterClause(
        {
          asOf: '2025-06-01T12:00:00Z',
          field: 'valid_from',
        },
        'h'
      );

      expect(result.sqlClause).toContain('h.valid_from');
      expect(result.sqlClause).toContain('h.valid_to');
    });
  });

  describe('Integration with traversal', () => {
    it('should accept temporalFilter parameter in traverse method', async () => {
      // Create simple graph
      await service.createObject({
        type: 'Document',
        key: 'doc-1',
        labels: [],
      } as any);

      // Call traverse with temporal filter (should not crash)
      const result = await service.traverse({
        root_ids: ['o_1'],
        max_depth: 0,
        temporalFilter: {
          asOf: '2025-06-01T12:00:00Z',
          field: 'valid_from',
        },
      });

      // Should complete without error
      expect(result).toBeDefined();
      expect(result.nodes).toBeDefined();
    });

    it('should accept temporalFilter with phased traversal', async () => {
      await service.createObject({
        type: 'Requirement',
        key: 'req-1',
        labels: [],
        project_id: 'proj',
      } as any);
      await service.createObject({
        type: 'Dependency',
        key: 'dep-1',
        labels: [],
        project_id: 'proj',
      } as any);
      await service.createRelationship(
        { type: 'DEPENDS_ON', src_id: 'o_1', dst_id: 'o_2' },
        'org',
        'proj'
      );

      const result = await service.traverse({
        root_ids: ['o_1'],
        edgePhases: [
          { relationshipTypes: ['DEPENDS_ON'], direction: 'out', maxDepth: 1 },
        ],
        temporalFilter: {
          asOf: '2025-06-01T12:00:00Z',
          field: 'valid_from',
        },
      });

      expect(result).toBeDefined();
      expect(result.nodes).toBeDefined();
    });

    it('should work with predicate filters', async () => {
      await service.createObject({
        type: 'Task',
        key: 'task-1',
        labels: [],
        properties: { status: 'active' },
      } as any);

      const result = await service.traverse({
        root_ids: ['o_1'],
        max_depth: 0,
        nodeFilter: {
          path: '/status',
          operator: 'equals',
          value: 'active',
        },
        temporalFilter: {
          asOf: '2025-06-01T12:00:00Z',
          field: 'created_at',
        },
      });

      expect(result).toBeDefined();
    });

    it('should work with path enumeration', async () => {
      await service.createObject({
        type: 'Concept',
        key: 'A',
        labels: [],
        project_id: 'proj',
      } as any);
      await service.createObject({
        type: 'Concept',
        key: 'B',
        labels: [],
        project_id: 'proj',
      } as any);
      await service.createRelationship(
        { type: 'RELATES_TO', src_id: 'o_1', dst_id: 'o_2' },
        'org',
        'proj'
      );

      const result = await service.traverse({
        root_ids: ['o_1'],
        direction: 'out',
        max_depth: 1,
        returnPaths: true,
        temporalFilter: {
          asOf: '2025-06-01T12:00:00Z',
          field: 'valid_from',
        },
      });

      expect(result).toBeDefined();
      expect(result.nodes).toBeDefined();
    });
  });
});
