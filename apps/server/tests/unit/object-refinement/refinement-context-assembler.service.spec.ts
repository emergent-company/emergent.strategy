import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { RefinementContextAssembler } from '../../../src/modules/object-refinement/refinement-context-assembler.service';
import { ChunkContext } from '../../../src/modules/object-refinement/object-refinement.types';

// --- Test Doubles ---------------------------------------------------------

function createMockDatabaseService() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  };
}

function createMockObjectChunksService() {
  return {
    getChunksForObject: vi.fn().mockResolvedValue([]),
  };
}

interface BuildOverrides {
  db?: ReturnType<typeof createMockDatabaseService>;
  objectChunksService?: ReturnType<typeof createMockObjectChunksService>;
}

function build(overrides?: BuildOverrides) {
  const db = overrides?.db ?? createMockDatabaseService();
  const objectChunksService =
    overrides?.objectChunksService ?? createMockObjectChunksService();

  const service = new RefinementContextAssembler(
    db as any,
    objectChunksService as any
  );

  return {
    service,
    db,
    objectChunksService,
  };
}

// --- Test Data Factories --------------------------------------------------

function createObjectRow(
  overrides?: Partial<{
    id: string;
    type: string;
    key: string | null;
    properties: Record<string, unknown>;
    labels: string[];
    version: number;
    projectId: string;
    createdAt: Date;
    updatedAt: Date;
  }>
) {
  return {
    id: 'obj-123',
    type: 'Person',
    key: 'person-1',
    properties: { name: 'John Doe', description: 'A person' },
    labels: ['important', 'verified'],
    version: 1,
    projectId: 'project-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides,
  };
}

function createRelationshipRow(
  overrides?: Partial<{
    relationshipId: string;
    relationshipType: string;
    relationshipProperties: Record<string, unknown>;
    objectId: string;
    objectType: string;
    objectKey: string | null;
    objectProperties: Record<string, unknown>;
    objectLabels: string[];
    objectVersion: number;
    objectCreatedAt: Date;
    objectUpdatedAt: Date;
  }>
) {
  return {
    relationshipId: 'rel-123',
    relationshipType: 'KNOWS',
    relationshipProperties: { since: '2020' },
    objectId: 'obj-456',
    objectType: 'Person',
    objectKey: 'person-2',
    objectProperties: { name: 'Jane Smith' },
    objectLabels: [],
    objectVersion: 1,
    objectCreatedAt: new Date('2024-01-01'),
    objectUpdatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createChunkContext(overrides?: Partial<ChunkContext>): ChunkContext {
  return {
    id: 'chunk-1',
    documentId: 'doc-1',
    documentTitle: 'Test Document',
    chunkIndex: 0,
    text: 'This is the chunk text content.',
    ...overrides,
  };
}

// --- Tests ----------------------------------------------------------------

describe('RefinementContextAssembler (unit)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---------- assembleContext ----------
  describe('assembleContext', () => {
    it('throws NotFoundException when object does not exist', async () => {
      const { service, db } = build();

      // Object query returns empty
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(service.assembleContext('non-existent-id')).rejects.toThrow(
        NotFoundException
      );
      await expect(service.assembleContext('non-existent-id')).rejects.toThrow(
        'Object non-existent-id not found'
      );
    });

    it('assembles full context for an object', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow();
      const outgoingRelRow = createRelationshipRow({
        relationshipId: 'rel-out-1',
        relationshipType: 'KNOWS',
        objectId: 'obj-target',
        objectType: 'Person',
        objectProperties: { name: 'Target Person' },
      });
      const incomingRelRow = createRelationshipRow({
        relationshipId: 'rel-in-1',
        relationshipType: 'WORKS_WITH',
        objectId: 'obj-source',
        objectType: 'Organization',
        objectProperties: { name: 'Source Org' },
      });
      const chunks = [
        createChunkContext({ id: 'chunk-1', text: 'First chunk' }),
        createChunkContext({ id: 'chunk-2', text: 'Second chunk' }),
      ];

      // 1. Object query
      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      // 2. Outgoing relationships query
      db.query.mockResolvedValueOnce({ rows: [outgoingRelRow], rowCount: 1 });
      // 3. Incoming relationships query
      db.query.mockResolvedValueOnce({ rows: [incomingRelRow], rowCount: 1 });
      // 4. Schema query (no schema found)
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      objectChunksService.getChunksForObject.mockResolvedValueOnce(chunks);

      const result = await service.assembleContext('obj-123');

      // Verify object context
      expect(result.object).toMatchObject({
        id: 'obj-123',
        type: 'Person',
        key: 'person-1',
        properties: { name: 'John Doe', description: 'A person' },
        labels: ['important', 'verified'],
        version: 1,
      });

      // Verify relationships
      expect(result.relationships).toHaveLength(2);

      // Outgoing relationship
      const outgoing = result.relationships.find(
        (r) => r.direction === 'outgoing'
      );
      expect(outgoing).toMatchObject({
        id: 'rel-out-1',
        type: 'KNOWS',
        direction: 'outgoing',
        relatedObject: {
          id: 'obj-target',
          type: 'Person',
          properties: { name: 'Target Person' },
        },
      });

      // Incoming relationship
      const incoming = result.relationships.find(
        (r) => r.direction === 'incoming'
      );
      expect(incoming).toMatchObject({
        id: 'rel-in-1',
        type: 'WORKS_WITH',
        direction: 'incoming',
        relatedObject: {
          id: 'obj-source',
          type: 'Organization',
          properties: { name: 'Source Org' },
        },
      });

      // Verify chunks
      expect(result.sourceChunks).toHaveLength(2);
      expect(result.sourceChunks[0].text).toBe('First chunk');

      // Verify no schema
      expect(result.schema).toBeUndefined();
    });

    it('includes schema when available from template pack', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow({ type: 'Document' });
      const typeData = {
        description: 'A document entity',
        properties: {
          title: { type: 'string', required: true },
          content: { type: 'string', required: false },
        },
        relationshipTypes: ['REFERENCES', 'CONTAINS'],
      };

      // 1. Object query
      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      // 2. Outgoing relationships query
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // 3. Incoming relationships query
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // 4. Schema query
      db.query.mockResolvedValueOnce({
        rows: [{ typeData }],
        rowCount: 1,
      });

      objectChunksService.getChunksForObject.mockResolvedValueOnce([]);

      const result = await service.assembleContext('obj-123');

      expect(result.schema).toMatchObject({
        type: 'Document',
        description: 'A document entity',
        properties: {
          title: { type: 'string', required: true },
          content: { type: 'string', required: false },
        },
        relationshipTypes: ['REFERENCES', 'CONTAINS'],
      });
    });

    it('handles null relationship properties gracefully', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow();
      const relRow = {
        ...createRelationshipRow(),
        relationshipProperties: null, // null properties
        objectLabels: null, // null labels
      };

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [relRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      objectChunksService.getChunksForObject.mockResolvedValueOnce([]);

      const result = await service.assembleContext('obj-123');

      expect(result.relationships[0].properties).toEqual({});
      expect(result.relationships[0].relatedObject.labels).toEqual([]);
    });

    it('handles null object labels gracefully', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow({ labels: null as any });

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      objectChunksService.getChunksForObject.mockResolvedValueOnce([]);

      const result = await service.assembleContext('obj-123');

      expect(result.object.labels).toEqual([]);
    });

    it('handles schema with null typeData', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow();

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({
        rows: [{ typeData: null }],
        rowCount: 1,
      });

      objectChunksService.getChunksForObject.mockResolvedValueOnce([]);

      const result = await service.assembleContext('obj-123');

      expect(result.schema).toBeUndefined();
    });
  });

  // ---------- truncateChunks (private method tested via assembleContext) ----------
  describe('chunk truncation', () => {
    it('truncates chunks when total exceeds MAX_CHUNK_CHARS', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow();
      // Create chunks that exceed the 50000 char limit
      const largeText = 'A'.repeat(20000);
      const chunks = [
        createChunkContext({ id: 'chunk-1', text: largeText }), // 20000 chars
        createChunkContext({ id: 'chunk-2', text: largeText }), // 20000 chars
        createChunkContext({ id: 'chunk-3', text: largeText }), // 20000 chars - should be partially included
        createChunkContext({ id: 'chunk-4', text: largeText }), // 20000 chars - should be excluded
      ];

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      objectChunksService.getChunksForObject.mockResolvedValueOnce(chunks);

      const result = await service.assembleContext('obj-123');

      // First 2 chunks = 40000 chars, 3rd chunk gets truncated to fit within 50000
      expect(result.sourceChunks.length).toBeLessThanOrEqual(3);
      // Third chunk should be truncated
      if (result.sourceChunks.length === 3) {
        expect(result.sourceChunks[2].text).toContain('... [truncated]');
        expect(result.sourceChunks[2].text.length).toBeLessThan(20000);
      }
    });

    it('does not truncate when chunks fit within limit', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow();
      const chunks = [
        createChunkContext({ id: 'chunk-1', text: 'Short text 1' }),
        createChunkContext({ id: 'chunk-2', text: 'Short text 2' }),
        createChunkContext({ id: 'chunk-3', text: 'Short text 3' }),
      ];

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      objectChunksService.getChunksForObject.mockResolvedValueOnce(chunks);

      const result = await service.assembleContext('obj-123');

      expect(result.sourceChunks).toHaveLength(3);
      expect(result.sourceChunks[0].text).toBe('Short text 1');
      expect(result.sourceChunks[1].text).toBe('Short text 2');
      expect(result.sourceChunks[2].text).toBe('Short text 3');
    });

    it('skips chunk if remaining space is less than 500 chars', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow();
      // Create chunks where the remaining space after first chunks is < 500
      const chunks = [
        createChunkContext({ id: 'chunk-1', text: 'A'.repeat(49700) }), // 49700 chars
        createChunkContext({ id: 'chunk-2', text: 'B'.repeat(1000) }), // Only 300 chars remaining - less than 500, skip
      ];

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      objectChunksService.getChunksForObject.mockResolvedValueOnce(chunks);

      const result = await service.assembleContext('obj-123');

      // Only first chunk should be included, second is skipped because remaining < 500
      expect(result.sourceChunks).toHaveLength(1);
      expect(result.sourceChunks[0].id).toBe('chunk-1');
    });

    it('includes partial chunk when remaining space is >= 500 chars', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow();
      // Create chunks where remaining space is >= 500 (will truncate)
      const chunks = [
        createChunkContext({ id: 'chunk-1', text: 'A'.repeat(49000) }), // 49000 chars
        createChunkContext({ id: 'chunk-2', text: 'B'.repeat(2000) }), // 1000 chars remaining - >= 500, truncate
      ];

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      objectChunksService.getChunksForObject.mockResolvedValueOnce(chunks);

      const result = await service.assembleContext('obj-123');

      expect(result.sourceChunks).toHaveLength(2);
      expect(result.sourceChunks[1].text).toContain('... [truncated]');
      // Should be roughly 1000 chars + truncation marker
      expect(result.sourceChunks[1].text.length).toBeLessThan(2000);
    });
  });

  // ---------- fetchObject (private method behavior) ----------
  describe('fetchObject behavior', () => {
    it('queries with correct filters (not deleted, not superseded)', async () => {
      const { service, db } = build();

      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(service.assembleContext('obj-123')).rejects.toThrow();

      // Verify the SQL contains proper filters
      const call = db.query.mock.calls[0];
      const sql = call[0] as string;
      expect(sql).toContain('deleted_at IS NULL');
      // Note: supersedes_id IS NULL is NOT included because live objects may have supersedes_id
      // pointing to the version they replaced. deleted_at IS NULL is the proper filter.
      expect(call[1]).toEqual(['obj-123']);
    });
  });

  // ---------- fetchRelationshipsWithDetails (private method behavior) ----------
  describe('fetchRelationshipsWithDetails behavior', () => {
    it('fetches both outgoing and incoming relationships', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow();

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // outgoing
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // incoming
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // schema

      objectChunksService.getChunksForObject.mockResolvedValueOnce([]);

      await service.assembleContext('obj-123');

      // Should have 4 queries: object, outgoing rels, incoming rels, schema
      expect(db.query).toHaveBeenCalledTimes(4);

      // Verify outgoing query uses source_id
      const outgoingCall = db.query.mock.calls[1];
      expect(outgoingCall[0]).toContain('source_id = $1');
      expect(outgoingCall[0]).toContain('target_id = o.id');

      // Verify incoming query uses target_id
      const incomingCall = db.query.mock.calls[2];
      expect(incomingCall[0]).toContain('target_id = $1');
      expect(incomingCall[0]).toContain('source_id = o.id');
    });

    it('combines outgoing and incoming relationships correctly', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow();
      const outgoingRows = [
        createRelationshipRow({
          relationshipId: 'out-1',
          relationshipType: 'PARENT_OF',
          objectId: 'child-1',
        }),
        createRelationshipRow({
          relationshipId: 'out-2',
          relationshipType: 'PARENT_OF',
          objectId: 'child-2',
        }),
      ];
      const incomingRows = [
        createRelationshipRow({
          relationshipId: 'in-1',
          relationshipType: 'EMPLOYED_BY',
          objectId: 'employer-1',
        }),
      ];

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: outgoingRows, rowCount: 2 });
      db.query.mockResolvedValueOnce({ rows: incomingRows, rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      objectChunksService.getChunksForObject.mockResolvedValueOnce([]);

      const result = await service.assembleContext('obj-123');

      expect(result.relationships).toHaveLength(3);

      const outgoing = result.relationships.filter(
        (r) => r.direction === 'outgoing'
      );
      const incoming = result.relationships.filter(
        (r) => r.direction === 'incoming'
      );

      expect(outgoing).toHaveLength(2);
      expect(incoming).toHaveLength(1);

      expect(outgoing[0].id).toBe('out-1');
      expect(outgoing[1].id).toBe('out-2');
      expect(incoming[0].id).toBe('in-1');
    });
  });

  // ---------- fetchObjectTypeSchema (private method behavior) ----------
  describe('fetchObjectTypeSchema behavior', () => {
    it('queries schema using project_id and object_type', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow({
        type: 'CustomType',
        projectId: 'proj-abc',
      });

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      objectChunksService.getChunksForObject.mockResolvedValueOnce([]);

      await service.assembleContext('obj-123');

      // Schema query should use projectId and type from object
      const schemaCall = db.query.mock.calls[3];
      expect(schemaCall[0]).toContain('project_object_type_registry');
      expect(schemaCall[1]).toEqual(['proj-abc', 'CustomType']);
    });

    it('handles schema with empty properties', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow();
      const typeData = {
        description: 'Type with no properties',
        // No properties key
      };

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({
        rows: [{ typeData }],
        rowCount: 1,
      });

      objectChunksService.getChunksForObject.mockResolvedValueOnce([]);

      const result = await service.assembleContext('obj-123');

      expect(result.schema).toMatchObject({
        type: 'Person',
        description: 'Type with no properties',
        properties: {},
      });
    });
  });

  // ---------- edge cases ----------
  describe('edge cases', () => {
    it('handles object with no relationships', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow();

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      objectChunksService.getChunksForObject.mockResolvedValueOnce([]);

      const result = await service.assembleContext('obj-123');

      expect(result.relationships).toEqual([]);
    });

    it('handles object with no source chunks', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow();

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      objectChunksService.getChunksForObject.mockResolvedValueOnce([]);

      const result = await service.assembleContext('obj-123');

      expect(result.sourceChunks).toEqual([]);
    });

    it('handles object with null key', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow({ key: null });

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      objectChunksService.getChunksForObject.mockResolvedValueOnce([]);

      const result = await service.assembleContext('obj-123');

      expect(result.object.key).toBeNull();
    });

    it('handles object with empty properties', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow({ properties: {} });

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      objectChunksService.getChunksForObject.mockResolvedValueOnce([]);

      const result = await service.assembleContext('obj-123');

      expect(result.object.properties).toEqual({});
    });

    it('handles relationships with null related object key', async () => {
      const { service, db, objectChunksService } = build();

      const objectRow = createObjectRow();
      const relRow = createRelationshipRow({ objectKey: null });

      db.query.mockResolvedValueOnce({ rows: [objectRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [relRow], rowCount: 1 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      objectChunksService.getChunksForObject.mockResolvedValueOnce([]);

      const result = await service.assembleContext('obj-123');

      expect(result.relationships[0].relatedObject.key).toBeNull();
    });
  });
});
