import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { createHash } from 'crypto';

/**
 * Result of a merge operation
 */
export interface MergeResult {
  success: boolean;
  targetObjectId: string;
  sourceObjectId: string;
  deletedSourceId: string | null;
  mergedProperties: Record<string, unknown>;
  redirectedRelationships: number;
  error?: string;
}

/**
 * Options for merge operation
 */
export interface MergeOptions {
  /** Strategy for merging properties: 'target-wins' keeps target values, 'source-wins' keeps source values */
  propertyStrategy?: 'target-wins' | 'source-wins';
  /** Whether to include merge provenance in properties */
  trackProvenance?: boolean;
  /** User ID performing the merge */
  userId?: string;
}

/**
 * Compute content hash for properties (same as graph.service.ts)
 */
function computeContentHash(properties: Record<string, unknown>): Buffer {
  const sorted = JSON.stringify(properties, Object.keys(properties).sort());
  return createHash('sha256').update(sorted).digest();
}

/**
 * Service for merging graph objects
 *
 * When merging two objects:
 * 1. Properties from source are merged into target
 * 2. Relationships pointing to source are redirected to target
 * 3. Source object is soft-deleted (tombstoned)
 */
@Injectable()
export class ObjectMergeService {
  private readonly logger = new Logger(ObjectMergeService.name);

  constructor(
    @Inject(forwardRef(() => require('./graph.service').GraphService))
    private readonly graphService: /* GraphService */ any,
    private readonly db: DatabaseService
  ) {}

  /**
   * Merge source object into target object
   *
   * @param sourceId - ID of the object to merge FROM (will be deleted)
   * @param targetId - ID of the object to merge INTO (will be updated)
   * @param options - Merge options
   */
  async mergeObjects(
    sourceId: string,
    targetId: string,
    options: MergeOptions = {}
  ): Promise<MergeResult> {
    const { propertyStrategy = 'source-wins', trackProvenance = true } =
      options;

    this.logger.log(
      `Starting merge: source=${sourceId} -> target=${targetId}, strategy=${propertyStrategy}`
    );

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      // Acquire advisory locks on both canonical IDs to prevent concurrent modifications
      // First, get the canonical IDs
      const [sourceCanonicalResult, targetCanonicalResult] = await Promise.all([
        client.query<{ canonical_id: string }>(
          'SELECT canonical_id FROM kb.graph_objects WHERE id = $1',
          [sourceId]
        ),
        client.query<{ canonical_id: string }>(
          'SELECT canonical_id FROM kb.graph_objects WHERE id = $1',
          [targetId]
        ),
      ]);

      if (!sourceCanonicalResult.rowCount) {
        throw new NotFoundException(`Source object not found: ${sourceId}`);
      }
      if (!targetCanonicalResult.rowCount) {
        throw new NotFoundException(`Target object not found: ${targetId}`);
      }

      const sourceCanonicalId = sourceCanonicalResult.rows[0].canonical_id;
      const targetCanonicalId = targetCanonicalResult.rows[0].canonical_id;

      // Acquire advisory locks in consistent order to prevent deadlocks
      const lockIds = [sourceCanonicalId, targetCanonicalId].sort();
      for (const canonicalId of lockIds) {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
          [`obj|${canonicalId}`]
        );
      }

      // Now fetch HEAD versions within the lock
      const [sourceResult, targetResult] = await Promise.all([
        client.query(
          `SELECT id, canonical_id, project_id, type, key, properties, labels, version, branch_id, status
           FROM kb.graph_objects
           WHERE canonical_id = $1 AND deleted_at IS NULL
           ORDER BY version DESC
           LIMIT 1`,
          [sourceCanonicalId]
        ),
        client.query(
          `SELECT id, canonical_id, project_id, type, key, properties, labels, version, branch_id, status
           FROM kb.graph_objects
           WHERE canonical_id = $1 AND deleted_at IS NULL
           ORDER BY version DESC
           LIMIT 1`,
          [targetCanonicalId]
        ),
      ]);

      if (!sourceResult.rowCount) {
        throw new NotFoundException(
          `Source object HEAD not found: ${sourceId}`
        );
      }
      if (!targetResult.rowCount) {
        throw new NotFoundException(
          `Target object HEAD not found: ${targetId}`
        );
      }

      const source = sourceResult.rows[0];
      const target = targetResult.rows[0];

      this.logger.log(
        `Resolved to HEAD versions: source=${source.id} (v${source.version}), target=${target.id} (v${target.version})`
      );

      // 2. Merge properties based on strategy
      const mergedProperties = this.mergeProperties(
        source.properties || {},
        target.properties || {},
        propertyStrategy
      );

      // Note: Merge provenance is tracked in kb.merge_provenance table, not in properties
      // This keeps properties clean and shows merge history only in the history view

      // 3. Update target object with merged properties - WITHIN THIS TRANSACTION
      // Mark current target version as superseded
      await client.query(
        `UPDATE kb.graph_objects SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
        [target.id]
      );

      // Compute content hash
      const hashBuffer = computeContentHash(mergedProperties);
      const hash = hashBuffer.toString('base64');

      // Insert new version of target with merged properties
      const ftsVectorSql = `to_tsvector('simple', coalesce($9,'') || ' ' || coalesce($10,'') || ' ' || coalesce($11,''))`;
      const insertedTarget = await client.query(
        `INSERT INTO kb.graph_objects(type, key, status, properties, labels, version, canonical_id, supersedes_id, project_id, branch_id, deleted_at, content_hash, fts, embedding_updated_at)
         VALUES ($1, $2, $12, $3, $4, $5, $6, $7, $8, $13, NULL, $14, ${ftsVectorSql}, NULL)
         RETURNING id`,
        [
          target.type,
          target.key,
          JSON.stringify(mergedProperties),
          target.labels ?? [],
          target.version + 1,
          target.canonical_id,
          target.id, // supersedes_id
          target.project_id,
          target.key ?? '',
          JSON.stringify(mergedProperties),
          target.type,
          target.status ?? null,
          target.branch_id ?? null,
          hash,
        ]
      );

      const newTargetId = insertedTarget.rows[0].id;

      // Record merge provenance - tracks that the new target version was created from merging source
      if (trackProvenance) {
        // Link new target to both its predecessor (target) and the merged source
        await client.query(
          `INSERT INTO kb.merge_provenance (child_version_id, parent_version_id, role)
           VALUES ($1, $2, 'target'), ($1, $3, 'source')
           ON CONFLICT DO NOTHING`,
          [newTargetId, target.id, source.id]
        );
      }

      // 4. Redirect relationships from source to target
      const redirectCount = await this.redirectRelationships(
        client,
        source.canonical_id,
        target.canonical_id,
        newTargetId,
        target.project_id
      );

      // 5. Delete (tombstone) the source object - WITHIN THIS TRANSACTION
      // Mark current source version as superseded
      await client.query(
        `UPDATE kb.graph_objects SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
        [source.id]
      );

      // Insert tombstone for source
      const sourceFtsVectorSql = `to_tsvector('simple', coalesce($9,'') || ' ' || coalesce($10,'') || ' ' || coalesce($11,''))`;
      await client.query(
        `INSERT INTO kb.graph_objects(type, key, properties, labels, version, canonical_id, supersedes_id, project_id, branch_id, deleted_at, fts, embedding_updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $12, CURRENT_TIMESTAMP, ${sourceFtsVectorSql}, NULL)`,
        [
          source.type,
          source.key,
          JSON.stringify(source.properties ?? {}),
          source.labels ?? [],
          source.version + 1,
          source.canonical_id,
          source.id, // supersedes_id
          source.project_id,
          source.key ?? '',
          JSON.stringify(source.properties ?? {}),
          source.type,
          source.branch_id ?? null,
        ]
      );

      await client.query('COMMIT');

      this.logger.log(
        `Merge complete: ${source.id} -> ${newTargetId}, redirected ${redirectCount} relationships`
      );

      return {
        success: true,
        targetObjectId: newTargetId,
        sourceObjectId: source.id,
        deletedSourceId: source.id,
        mergedProperties,
        redirectedRelationships: redirectCount,
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore rollback error */
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Merge failed: ${sourceId} -> ${targetId}: ${errorMessage}`
      );

      return {
        success: false,
        targetObjectId: targetId,
        sourceObjectId: sourceId,
        deletedSourceId: null,
        mergedProperties: {},
        redirectedRelationships: 0,
        error: errorMessage,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Merge properties from source into target (deep merge for nested objects)
   */
  private mergeProperties(
    sourceProps: Record<string, unknown>,
    targetProps: Record<string, unknown>,
    strategy: 'target-wins' | 'source-wins'
  ): Record<string, unknown> {
    const primary = strategy === 'target-wins' ? targetProps : sourceProps;
    const secondary = strategy === 'target-wins' ? sourceProps : targetProps;

    return this.deepMerge(secondary, primary);
  }

  /**
   * Deep merge two objects, with primary values taking precedence
   */
  private deepMerge(
    secondary: Record<string, unknown>,
    primary: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...secondary };

    for (const key of Object.keys(primary)) {
      const primaryValue = primary[key];
      const secondaryValue = secondary[key];

      if (
        this.isPlainObject(primaryValue) &&
        this.isPlainObject(secondaryValue)
      ) {
        // Recursively merge nested objects
        result[key] = this.deepMerge(
          secondaryValue as Record<string, unknown>,
          primaryValue as Record<string, unknown>
        );
      } else {
        // Primary value takes precedence
        result[key] = primaryValue;
      }
    }

    return result;
  }

  /**
   * Check if a value is a plain object (not null, array, or other types)
   */
  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.prototype.toString.call(value) === '[object Object]'
    );
  }

  /**
   * Redirect all relationships from source object to target object
   *
   * Creates new relationship versions pointing to target instead of source.
   */
  private async redirectRelationships(
    client: any,
    sourceCanonicalId: string,
    targetCanonicalId: string,
    targetId: string,
    projectId: string
  ): Promise<number> {
    // Find all active relationships where source object is src_id or dst_id
    // We need to handle relationships pointing to any version of the source object
    const relationships = await client.query(
      `SELECT DISTINCT ON (r.canonical_id) 
         r.id, r.type, r.src_id, r.dst_id, r.properties, r.version, r.canonical_id, r.project_id, r.branch_id
       FROM kb.graph_relationships r
       JOIN kb.graph_objects so ON so.id = r.src_id OR so.id = r.dst_id
       WHERE so.canonical_id = $1 
         AND r.deleted_at IS NULL
       ORDER BY r.canonical_id, r.version DESC`,
      [sourceCanonicalId]
    );

    if (!relationships.rowCount) {
      return 0;
    }

    let redirectCount = 0;

    for (const rel of relationships.rows) {
      // Determine which end needs to be updated
      const srcNeedsUpdate = await this.isObjectVersion(
        client,
        rel.src_id,
        sourceCanonicalId
      );
      const dstNeedsUpdate = await this.isObjectVersion(
        client,
        rel.dst_id,
        sourceCanonicalId
      );

      if (!srcNeedsUpdate && !dstNeedsUpdate) {
        continue; // Neither end points to source, skip
      }

      const newSrcId = srcNeedsUpdate ? targetId : rel.src_id;
      const newDstId = dstNeedsUpdate ? targetId : rel.dst_id;

      // Skip if this would create a self-relationship
      // Need to check canonical IDs because newSrcId/newDstId might be different row IDs
      // but represent the same logical object
      if (newSrcId === newDstId) {
        this.logger.debug(
          `Skipping relationship ${rel.id} - would create self-reference`
        );
        continue;
      }

      // Also check if the non-redirected end already points to the target's canonical
      // This happens when the relationship already connects source to target
      const srcCanonical = srcNeedsUpdate
        ? targetCanonicalId
        : await this.getCanonicalId(client, rel.src_id);
      const dstCanonical = dstNeedsUpdate
        ? targetCanonicalId
        : await this.getCanonicalId(client, rel.dst_id);

      if (srcCanonical === dstCanonical) {
        this.logger.debug(
          `Skipping relationship ${rel.id} - would create self-reference (same canonical)`
        );
        continue;
      }

      // Check if a similar relationship already exists to target
      const existingRel = await client.query(
        `SELECT id FROM kb.graph_relationships 
         WHERE project_id = $1 
           AND type = $2 
           AND src_id = $3 
           AND dst_id = $4 
           AND deleted_at IS NULL
         LIMIT 1`,
        [projectId, rel.type, newSrcId, newDstId]
      );

      if (existingRel.rowCount) {
        // Relationship already exists, just delete the old one
        await client.query(
          `UPDATE kb.graph_relationships SET deleted_at = now() WHERE id = $1`,
          [rel.id]
        );
      } else {
        // Create new version pointing to target
        await client.query(
          `INSERT INTO kb.graph_relationships 
           (project_id, branch_id, type, src_id, dst_id, properties, version, canonical_id, supersedes_id, change_summary)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            projectId,
            rel.branch_id,
            rel.type,
            newSrcId,
            newDstId,
            JSON.stringify(rel.properties ?? {}),
            rel.version + 1,
            rel.canonical_id,
            rel.id,
            JSON.stringify({
              message: 'Relationship redirected from merged object',
            }),
          ]
        );
      }

      redirectCount++;
    }

    return redirectCount;
  }

  /**
   * Check if an object ID belongs to a specific canonical object
   */
  private async isObjectVersion(
    client: any,
    objectId: string,
    canonicalId: string
  ): Promise<boolean> {
    const result = await client.query(
      `SELECT 1 FROM kb.graph_objects WHERE id = $1 AND canonical_id = $2 LIMIT 1`,
      [objectId, canonicalId]
    );
    return result.rowCount > 0;
  }

  /**
   * Get the canonical ID for an object ID
   */
  private async getCanonicalId(
    client: any,
    objectId: string
  ): Promise<string | null> {
    const result = await client.query(
      `SELECT canonical_id FROM kb.graph_objects WHERE id = $1 LIMIT 1`,
      [objectId]
    );
    return result.rowCount > 0 ? result.rows[0].canonical_id : null;
  }
}
