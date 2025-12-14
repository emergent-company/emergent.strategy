import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { ObjectChunksService } from './object-chunks.service';
import {
  RefinementContext,
  ObjectContext,
  RelationshipContext,
  ObjectTypeSchema,
} from './object-refinement.types';

/**
 * Service for assembling rich context for object refinement
 *
 * Gathers:
 * - Object details with all properties
 * - All relationships (incoming and outgoing) with full target/source details
 * - Source chunks via object_chunks join
 * - Object type schema from template pack
 */
@Injectable()
export class RefinementContextAssembler {
  private readonly logger = new Logger(RefinementContextAssembler.name);

  /** Maximum total characters for chunk text to avoid token overflow */
  private readonly MAX_CHUNK_CHARS = 50000;

  constructor(
    private readonly db: DatabaseService,
    private readonly objectChunksService: ObjectChunksService
  ) {}

  /**
   * Assemble full context for an object
   */
  async assembleContext(objectId: string): Promise<RefinementContext> {
    // 1. Fetch the main object
    const object = await this.fetchObject(objectId);
    if (!object) {
      throw new NotFoundException(`Object ${objectId} not found`);
    }

    // 2. Fetch all relationships with full object details
    const relationships = await this.fetchRelationshipsWithDetails(objectId);

    // 3. Fetch source chunks
    const sourceChunks = await this.objectChunksService.getChunksForObject(
      objectId
    );

    // 4. Truncate chunks if needed to stay within token limits
    const truncatedChunks = this.truncateChunks(sourceChunks);

    // 5. Fetch schema for the object type (if available)
    const schema = await this.fetchObjectTypeSchema(
      object.type,
      object.projectId
    );

    return {
      object,
      relationships,
      sourceChunks: truncatedChunks,
      schema,
    };
  }

  /**
   * Fetch object details
   */
  private async fetchObject(
    objectId: string
  ): Promise<(ObjectContext & { projectId: string }) | null> {
    const sql = `
      SELECT 
        id, type, key, properties, labels, version,
        project_id as "projectId",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM kb.graph_objects
      WHERE id = $1
        AND deleted_at IS NULL
    `;

    const result = await this.db.query<{
      id: string;
      type: string;
      key: string | null;
      properties: Record<string, unknown>;
      labels: string[];
      version: number;
      projectId: string;
      createdAt: Date;
      updatedAt: Date;
    }>(sql, [objectId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      type: row.type,
      key: row.key,
      properties: row.properties,
      labels: row.labels || [],
      version: row.version,
      projectId: row.projectId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Fetch all relationships (incoming and outgoing) with full related object details
   */
  private async fetchRelationshipsWithDetails(
    objectId: string
  ): Promise<RelationshipContext[]> {
    // Outgoing relationships (this object is source)
    const outgoingSql = `
      SELECT 
        r.id as "relationshipId",
        r.type as "relationshipType",
        r.properties as "relationshipProperties",
        o.id as "objectId",
        o.type as "objectType",
        o.key as "objectKey",
        o.properties as "objectProperties",
        o.labels as "objectLabels",
        o.version as "objectVersion",
        o.created_at as "objectCreatedAt",
        o.updated_at as "objectUpdatedAt"
      FROM kb.graph_relationships r
      JOIN kb.graph_objects o ON r.dst_id = o.id
      WHERE r.src_id = $1
        AND r.deleted_at IS NULL
        AND o.deleted_at IS NULL
      ORDER BY r.type, o.type, o.properties->>'name'
    `;

    const outgoingResult = await this.db.query<{
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
    }>(outgoingSql, [objectId]);

    // Incoming relationships (this object is target)
    const incomingSql = `
      SELECT 
        r.id as "relationshipId",
        r.type as "relationshipType",
        r.properties as "relationshipProperties",
        o.id as "objectId",
        o.type as "objectType",
        o.key as "objectKey",
        o.properties as "objectProperties",
        o.labels as "objectLabels",
        o.version as "objectVersion",
        o.created_at as "objectCreatedAt",
        o.updated_at as "objectUpdatedAt"
      FROM kb.graph_relationships r
      JOIN kb.graph_objects o ON r.src_id = o.id
      WHERE r.dst_id = $1
        AND r.deleted_at IS NULL
        AND o.deleted_at IS NULL
      ORDER BY r.type, o.type, o.properties->>'name'
    `;

    const incomingResult = await this.db.query<{
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
    }>(incomingSql, [objectId]);

    const relationships: RelationshipContext[] = [];

    // Map outgoing relationships
    for (const row of outgoingResult.rows) {
      relationships.push({
        id: row.relationshipId,
        type: row.relationshipType,
        direction: 'outgoing',
        properties: row.relationshipProperties || {},
        relatedObject: {
          id: row.objectId,
          type: row.objectType,
          key: row.objectKey,
          properties: row.objectProperties,
          labels: row.objectLabels || [],
          version: row.objectVersion,
          createdAt: row.objectCreatedAt,
          updatedAt: row.objectUpdatedAt,
        },
      });
    }

    // Map incoming relationships
    for (const row of incomingResult.rows) {
      relationships.push({
        id: row.relationshipId,
        type: row.relationshipType,
        direction: 'incoming',
        properties: row.relationshipProperties || {},
        relatedObject: {
          id: row.objectId,
          type: row.objectType,
          key: row.objectKey,
          properties: row.objectProperties,
          labels: row.objectLabels || [],
          version: row.objectVersion,
          createdAt: row.objectCreatedAt,
          updatedAt: row.objectUpdatedAt,
        },
      });
    }

    return relationships;
  }

  /**
   * Truncate chunks to stay within token limits
   */
  private truncateChunks<T extends { text: string }>(chunks: T[]): T[] {
    let totalChars = 0;
    const result: T[] = [];

    for (const chunk of chunks) {
      if (totalChars + chunk.text.length > this.MAX_CHUNK_CHARS) {
        // Truncate this chunk if needed
        const remaining = this.MAX_CHUNK_CHARS - totalChars;
        if (remaining > 500) {
          // Only include if we can fit meaningful content
          result.push({
            ...chunk,
            text: chunk.text.substring(0, remaining) + '... [truncated]',
          });
        }
        break;
      }
      result.push(chunk);
      totalChars += chunk.text.length;
    }

    if (result.length < chunks.length) {
      this.logger.debug(
        `Truncated chunks from ${chunks.length} to ${result.length} to stay within ${this.MAX_CHUNK_CHARS} chars`
      );
    }

    return result;
  }

  /**
   * Fetch object type schema from template pack
   */
  private async fetchObjectTypeSchema(
    objectType: string,
    projectId: string
  ): Promise<ObjectTypeSchema | undefined> {
    // Query the project's object type registry for the schema
    const sql = `
      SELECT 
        otr.type_name as "typeName",
        otr.description,
        otr.json_schema as "jsonSchema"
      FROM kb.project_object_type_registry otr
      WHERE otr.project_id = $1
        AND otr.type_name = $2
    `;

    const result = await this.db.query<{
      typeName: string;
      description: string | null;
      jsonSchema: Record<string, unknown> | null;
    }>(sql, [projectId, objectType]);

    if (result.rows.length === 0) return undefined;

    const row = result.rows[0];
    const jsonSchema = row.jsonSchema;

    // Map to ObjectTypeSchema
    return {
      type: objectType,
      description:
        row.description || (jsonSchema?.description as string | undefined),
      properties: (jsonSchema?.properties as Record<string, unknown>) || {},
      relationshipTypes: undefined, // Not stored in this table
    } as ObjectTypeSchema;
  }
}
