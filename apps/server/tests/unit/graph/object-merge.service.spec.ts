import { describe, it, expect, beforeEach } from 'vitest';
import { ObjectMergeService } from '../../../src/modules/graph/object-merge.service';
import { DatabaseService } from '../../../src/common/database/database.service';
import { GraphService } from '../../../src/modules/graph/graph.service';

/**
 * Mock database client for testing ObjectMergeService
 * Simulates PostgreSQL responses for the queries used by the service
 */
class MockDatabaseClient {
  objects: Map<string, any> = new Map();
  relationships: any[] = [];
  queries: { sql: string; params: any[] }[] = [];
  insertedObjectId = 'new-target-id';

  constructor(initialData?: { objects?: any[]; relationships?: any[] }) {
    if (initialData?.objects) {
      for (const obj of initialData.objects) {
        this.objects.set(obj.id, obj);
      }
    }
    if (initialData?.relationships) {
      this.relationships = [...initialData.relationships];
    }
  }

  async query(sql: string, params: any[] = []): Promise<any> {
    this.queries.push({ sql, params });
    const normalizedSql = sql.replace(/\s+/g, ' ').toLowerCase().trim();

    // BEGIN/COMMIT/ROLLBACK
    if (
      normalizedSql === 'begin' ||
      normalizedSql === 'commit' ||
      normalizedSql === 'rollback'
    ) {
      return { rows: [], rowCount: 0 };
    }

    // Advisory lock (no-op in mock)
    if (normalizedSql.includes('pg_advisory_xact_lock')) {
      return { rows: [], rowCount: 0 };
    }

    // SELECT canonical_id from graph_objects WHERE id = $1
    if (
      normalizedSql.includes('select canonical_id from kb.graph_objects') &&
      normalizedSql.includes('where id = $1')
    ) {
      const id = params[0];
      const obj = this.objects.get(id);
      if (obj) {
        return { rows: [{ canonical_id: obj.canonical_id }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // SELECT to check if object belongs to canonical (isObjectVersion query)
    // MUST be checked BEFORE the generic graph_objects query
    if (
      normalizedSql.includes('select 1 from kb.graph_objects') &&
      normalizedSql.includes('id = $1') &&
      normalizedSql.includes('canonical_id = $2')
    ) {
      const [objectId, canonicalId] = params;
      const obj = this.objects.get(objectId);
      const matches = obj && obj.canonical_id === canonicalId;
      if (matches) {
        return { rows: [{ '?column?': 1 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // SELECT HEAD version by canonical_id (for fetching source/target after lock)
    if (
      normalizedSql.includes('from kb.graph_objects') &&
      normalizedSql.includes('where canonical_id = $1') &&
      normalizedSql.includes('deleted_at is null') &&
      normalizedSql.includes('order by version desc')
    ) {
      const canonicalId = params[0];
      // Find all objects with this canonical_id, return the one with highest version
      let headObj: any = null;
      for (const obj of this.objects.values()) {
        if (obj.canonical_id === canonicalId && !obj.deleted_at) {
          if (!headObj || obj.version > headObj.version) {
            headObj = obj;
          }
        }
      }
      if (headObj) {
        return { rows: [headObj], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // SELECT from graph_objects (generic fetch by id)
    if (
      normalizedSql.includes('from kb.graph_objects') &&
      normalizedSql.includes('where id = $1') &&
      !normalizedSql.includes('canonical_id = $2')
    ) {
      const id = params[0];
      const obj = this.objects.get(id);
      if (obj && !obj.deleted_at) {
        return { rows: [obj], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // UPDATE to mark object version as superseded (deleted_at = now())
    if (
      normalizedSql.includes('update kb.graph_objects set deleted_at') &&
      normalizedSql.includes('where id = $1')
    ) {
      const id = params[0];
      const obj = this.objects.get(id);
      if (obj) {
        obj.deleted_at = new Date().toISOString();
      }
      return { rows: [], rowCount: 1 };
    }

    // INSERT new object version (for target update or source tombstone)
    if (
      normalizedSql.includes('insert into kb.graph_objects') &&
      normalizedSql.includes('returning id')
    ) {
      // Return a new ID for the inserted object
      return { rows: [{ id: this.insertedObjectId }], rowCount: 1 };
    }

    // INSERT source tombstone (no RETURNING)
    if (
      normalizedSql.includes('insert into kb.graph_objects') &&
      normalizedSql.includes('current_timestamp')
    ) {
      return { rows: [], rowCount: 1 };
    }

    // SELECT relationships for source object by canonical_id (JOIN query)
    if (
      normalizedSql.includes('from kb.graph_relationships') &&
      normalizedSql.includes('join kb.graph_objects') &&
      normalizedSql.includes('so.canonical_id = $1')
    ) {
      const canonicalId = params[0];
      const rels = this.relationships.filter((r) => {
        const srcObj = this.objects.get(r.src_id);
        const dstObj = this.objects.get(r.dst_id);
        return (
          (srcObj?.canonical_id === canonicalId ||
            dstObj?.canonical_id === canonicalId) &&
          !r.deleted_at
        );
      });
      return { rows: rels, rowCount: rels.length };
    }

    // SELECT existing relationship to target
    if (
      normalizedSql.includes('select id from kb.graph_relationships') &&
      normalizedSql.includes('project_id = $1') &&
      normalizedSql.includes('type = $2')
    ) {
      const [projectId, type, srcId, dstId] = params;
      const existing = this.relationships.find(
        (r) =>
          r.project_id === projectId &&
          r.type === type &&
          r.src_id === srcId &&
          r.dst_id === dstId &&
          !r.deleted_at
      );
      if (existing) {
        return { rows: [{ id: existing.id }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // UPDATE to soft delete relationship
    if (
      normalizedSql.includes('update kb.graph_relationships set deleted_at')
    ) {
      const relId = params[0];
      const rel = this.relationships.find((r) => r.id === relId);
      if (rel) {
        rel.deleted_at = new Date().toISOString();
      }
      return { rows: [], rowCount: 1 };
    }

    // INSERT new relationship version
    if (normalizedSql.includes('insert into kb.graph_relationships')) {
      const newRel = {
        id: `rel_new_${this.relationships.length}`,
        project_id: params[0],
        branch_id: params[1],
        type: params[2],
        src_id: params[3],
        dst_id: params[4],
        properties: params[5],
        version: params[6],
        canonical_id: params[7],
        supersedes_id: params[8],
        change_summary: params[9],
      };
      this.relationships.push(newRel);
      return { rows: [newRel], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }

  release(): void {
    // No-op for mock
  }
}

/**
 * Mock DatabaseService
 */
class MockDatabaseService implements Partial<DatabaseService> {
  client: MockDatabaseClient;

  constructor(initialData?: { objects?: any[]; relationships?: any[] }) {
    this.client = new MockDatabaseClient(initialData);
  }

  async getClient(): Promise<any> {
    return this.client;
  }
}

/**
 * Mock GraphService
 */
class MockGraphService implements Partial<GraphService> {
  patchObjectCalls: { id: string; patch: any }[] = [];
  deleteObjectCalls: string[] = [];
  patchObjectResult: any = {};
  deleteObjectResult: any = {};

  async patchObject(id: string, patch: any): Promise<any> {
    this.patchObjectCalls.push({ id, patch });
    return { id, ...this.patchObjectResult };
  }

  async deleteObject(id: string): Promise<any> {
    this.deleteObjectCalls.push(id);
    return { id, ...this.deleteObjectResult };
  }
}

describe('ObjectMergeService', () => {
  let service: ObjectMergeService;
  let mockDb: MockDatabaseService;
  let mockGraphService: MockGraphService;

  const createTestObjects = () => ({
    source: {
      id: 'source-obj-1',
      canonical_id: 'canonical-source-1',
      project_id: 'project-1',
      type: 'Entity',
      key: 'source-key',
      properties: {
        name: 'Source Name',
        description: 'Source description',
        sourceOnly: 'value1',
      },
      labels: ['entity'],
      version: 1,
    },
    target: {
      id: 'target-obj-1',
      canonical_id: 'canonical-target-1',
      project_id: 'project-1',
      type: 'Entity',
      key: 'target-key',
      properties: { name: 'Target Name', targetOnly: 'value2' },
      labels: ['entity'],
      version: 1,
    },
  });

  beforeEach(() => {
    mockGraphService = new MockGraphService();
    const testObjects = createTestObjects();
    mockDb = new MockDatabaseService({
      objects: [testObjects.source, testObjects.target],
      relationships: [],
    });

    // Constructor expects: (graphService, db)
    service = new ObjectMergeService(
      mockGraphService as unknown as GraphService,
      mockDb as unknown as DatabaseService
    );
  });

  describe('mergeObjects', () => {
    it('merges source properties into target with source-wins strategy (default)', async () => {
      const result = await service.mergeObjects('source-obj-1', 'target-obj-1');

      expect(result.success).toBe(true);
      expect(result.sourceObjectId).toBe('source-obj-1');
      // New implementation returns the new version's ID
      expect(result.targetObjectId).toBe('new-target-id');
      expect(result.deletedSourceId).toBe('source-obj-1');

      // Verify properties merged with source-wins
      expect(result.mergedProperties.name).toBe('Source Name'); // source wins
      expect(result.mergedProperties.description).toBe('Source description');
      expect(result.mergedProperties.sourceOnly).toBe('value1');
      expect(result.mergedProperties.targetOnly).toBe('value2');

      // Verify direct SQL operations were executed (no GraphService calls)
      const insertQueries = mockDb.client.queries.filter((q) =>
        q.sql.toLowerCase().includes('insert into kb.graph_objects')
      );
      expect(insertQueries.length).toBeGreaterThanOrEqual(1);
    });

    it('merges with target-wins strategy', async () => {
      const result = await service.mergeObjects(
        'source-obj-1',
        'target-obj-1',
        {
          propertyStrategy: 'target-wins',
        }
      );

      expect(result.success).toBe(true);

      // Verify properties merged with target-wins
      expect(result.mergedProperties.name).toBe('Target Name'); // target wins
      expect(result.mergedProperties.description).toBe('Source description'); // only in source
      expect(result.mergedProperties.sourceOnly).toBe('value1');
      expect(result.mergedProperties.targetOnly).toBe('value2');
    });

    it('tracks merge provenance when enabled (default)', async () => {
      const result = await service.mergeObjects(
        'source-obj-1',
        'target-obj-1',
        {
          userId: 'test-user-123',
        }
      );

      expect(result.success).toBe(true);
      const mergedProps = result.mergedProperties as Record<string, unknown>;
      expect(mergedProps._mergeHistory).toBeDefined();
      expect(Array.isArray(mergedProps._mergeHistory)).toBe(true);
      const historyArray = mergedProps._mergeHistory as Array<
        Record<string, unknown>
      >;
      expect(historyArray).toHaveLength(1);

      const history = historyArray[0];
      expect(history.mergedFrom).toBe('source-obj-1');
      expect(history.mergedFromKey).toBe('source-key');
      expect(history.mergedBy).toBe('test-user-123');
      expect(history.mergedAt).toBeDefined();
    });

    it('does not track provenance when disabled', async () => {
      const result = await service.mergeObjects(
        'source-obj-1',
        'target-obj-1',
        {
          trackProvenance: false,
        }
      );

      expect(result.success).toBe(true);
      expect(result.mergedProperties._mergeHistory).toBeUndefined();
    });

    it('appends to existing merge history', async () => {
      // Set up an object with existing merge history
      const sourceWithHistory = {
        id: 'source-with-history',
        canonical_id: 'canonical-source-hist',
        project_id: 'project-1',
        type: 'Entity',
        key: 'source-hist-key',
        properties: {
          name: 'Source',
          _mergeHistory: [
            {
              mergedFrom: 'old-obj-1',
              mergedAt: '2024-01-01',
              mergedBy: 'old-user',
            },
          ],
        },
        labels: [],
        version: 1,
      };

      mockDb.client.objects.set(sourceWithHistory.id, sourceWithHistory);

      const result = await service.mergeObjects(
        'source-with-history',
        'target-obj-1'
      );

      expect(result.success).toBe(true);
      const mergedProps = result.mergedProperties as Record<string, unknown>;
      const historyArray = mergedProps._mergeHistory as Array<
        Record<string, unknown>
      >;
      expect(historyArray).toHaveLength(2);
      expect(historyArray[0].mergedFrom).toBe('old-obj-1');
      expect(historyArray[1].mergedFrom).toBe('source-with-history');
    });

    it('returns error when source object not found', async () => {
      const result = await service.mergeObjects(
        'nonexistent-source',
        'target-obj-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Source object not found');
      expect(result.deletedSourceId).toBeNull();
      expect(result.redirectedRelationships).toBe(0);
    });

    it('returns error when target object not found', async () => {
      const result = await service.mergeObjects(
        'source-obj-1',
        'nonexistent-target'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Target object not found');
      expect(result.deletedSourceId).toBeNull();
    });

    it('rolls back transaction on error', async () => {
      // Make the INSERT query throw an error by temporarily breaking the mock
      const originalQuery = mockDb.client.query.bind(mockDb.client);
      mockDb.client.query = async (sql: string, params: any[] = []) => {
        const normalizedSql = sql.replace(/\s+/g, ' ').toLowerCase().trim();
        // Fail on the first INSERT into graph_objects (the target update)
        if (
          normalizedSql.includes('insert into kb.graph_objects') &&
          normalizedSql.includes('returning id')
        ) {
          throw new Error('Insert failed');
        }
        return originalQuery(sql, params);
      };

      const result = await service.mergeObjects('source-obj-1', 'target-obj-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insert failed');

      // Verify rollback was called
      const rollbackCalls = mockDb.client.queries.filter((q) =>
        q.sql.toLowerCase().includes('rollback')
      );
      expect(rollbackCalls.length).toBeGreaterThan(0);
    });
  });

  describe('relationship redirection', () => {
    it('redirects relationships from source to target', async () => {
      // Add a relationship pointing to source
      const rel = {
        id: 'rel-1',
        canonical_id: 'canonical-rel-1',
        project_id: 'project-1',
        branch_id: null,
        type: 'RELATES_TO',
        src_id: 'other-obj',
        dst_id: 'source-obj-1',
        properties: {},
        version: 1,
      };
      mockDb.client.relationships.push(rel);

      // Add the other object
      mockDb.client.objects.set('other-obj', {
        id: 'other-obj',
        canonical_id: 'canonical-other',
        project_id: 'project-1',
      });

      const result = await service.mergeObjects('source-obj-1', 'target-obj-1');

      expect(result.success).toBe(true);
      expect(result.redirectedRelationships).toBe(1);
    });

    it('skips self-referential relationships', async () => {
      // Add a relationship where redirecting would create self-reference
      const rel = {
        id: 'rel-self',
        canonical_id: 'canonical-rel-self',
        project_id: 'project-1',
        branch_id: null,
        type: 'RELATES_TO',
        src_id: 'target-obj-1',
        dst_id: 'source-obj-1', // Would become target -> target
        properties: {},
        version: 1,
      };
      mockDb.client.relationships.push(rel);

      const result = await service.mergeObjects('source-obj-1', 'target-obj-1');

      expect(result.success).toBe(true);
      // Self-referential should be skipped
      expect(result.redirectedRelationships).toBe(0);
    });

    it('handles no relationships to redirect', async () => {
      const result = await service.mergeObjects('source-obj-1', 'target-obj-1');

      expect(result.success).toBe(true);
      expect(result.redirectedRelationships).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles objects with empty properties', async () => {
      const emptySource = {
        id: 'empty-source',
        canonical_id: 'canonical-empty-source',
        project_id: 'project-1',
        type: 'Entity',
        key: 'empty-key',
        properties: null,
        labels: [],
        version: 1,
      };
      mockDb.client.objects.set(emptySource.id, emptySource);

      const result = await service.mergeObjects('empty-source', 'target-obj-1');

      expect(result.success).toBe(true);
      // Should use target properties since source is empty
      expect(result.mergedProperties.name).toBe('Target Name');
    });

    it('handles both objects with empty properties', async () => {
      const emptySource = {
        id: 'empty-source',
        canonical_id: 'canonical-empty-source',
        project_id: 'project-1',
        type: 'Entity',
        key: 'empty-key',
        properties: null,
        labels: [],
        version: 1,
      };
      const emptyTarget = {
        id: 'empty-target',
        canonical_id: 'canonical-empty-target',
        project_id: 'project-1',
        type: 'Entity',
        key: 'empty-target-key',
        properties: undefined,
        labels: [],
        version: 1,
      };
      mockDb.client.objects.set(emptySource.id, emptySource);
      mockDb.client.objects.set(emptyTarget.id, emptyTarget);

      const result = await service.mergeObjects('empty-source', 'empty-target');

      expect(result.success).toBe(true);
      // Merged properties should be empty object with provenance
      expect(result.mergedProperties._mergeHistory).toBeDefined();
    });
  });
});
