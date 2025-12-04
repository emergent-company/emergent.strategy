import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import {
  ChunkerService,
  ChunkerConfig,
  ChunkWithMetadata,
} from '../../common/utils/chunker.service';
import { HashService } from '../../common/utils/hash.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { AppConfigService } from '../../common/config/config.service';
import { ExtractionJobService } from '../extraction-jobs/extraction-job.service';
import { ExtractionSourceType } from '../extraction-jobs/dto/extraction-job.dto';
import { ChunkEmbeddingJobsService } from '../chunks/chunk-embedding-jobs.service';
import { Project } from '../../entities/project.entity';

export interface IngestResult {
  documentId: string;
  chunks: number;
  alreadyExists: boolean;
  extractionJobId?: string;
}

/**
 * Result for a single file in a batch upload
 */
export interface BatchFileResult {
  filename: string;
  status: 'success' | 'duplicate' | 'failed';
  documentId?: string;
  chunks?: number;
  error?: string;
}

/**
 * Summary of batch upload results
 */
export interface BatchUploadSummary {
  total: number;
  successful: number;
  duplicates: number;
  failed: number;
}

/**
 * Complete batch upload result
 */
export interface BatchUploadResult {
  summary: BatchUploadSummary;
  results: BatchFileResult[];
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  // Detect at runtime if content_hash column exists (once per process) so we can use hash-based dedup.
  private hasContentHashColumn: boolean | undefined;
  private readonly metrics = {
    contentHashDetected: 0,
    contentHashMissing: 0,
    embeddingColumnMissing: 0,
    uniqueViolationRaces: 0,
  };
  constructor(
    private readonly db: DatabaseService,
    private readonly chunker: ChunkerService,
    private readonly hash: HashService,
    private readonly embeddings: EmbeddingsService,
    private readonly config: AppConfigService,
    private readonly extractionJobService: ExtractionJobService,
    private readonly chunkEmbeddingJobs: ChunkEmbeddingJobsService,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>
  ) {}

  private async withTenantContext<T>(
    orgId: string | null | undefined,
    projectId: string | null | undefined,
    fn: () => Promise<T>
  ): Promise<T> {
    const candidate = (this.db as any)?.runWithTenantContext;
    if (typeof candidate === 'function') {
      // Updated to use new 2-parameter signature (projectId, fn)
      // orgId is now derived automatically from projectId in DatabaseService
      return candidate.call(this.db, projectId ?? null, fn);
    }

    const setContext = (this.db as any)?.setTenantContext;
    const getContext = (this.db as any)?.getCurrentTenantContext;
    let reset: (() => Promise<void>) | null = null;

    if (typeof setContext === 'function') {
      let previousOrg: string | null = null;
      let previousProject: string | null = null;
      if (typeof getContext === 'function') {
        try {
          const current = await getContext.call(this.db);
          previousOrg = current?.orgId ?? null;
          previousProject = current?.projectId ?? null;
        } catch {
          /* ignore */
        }
      }
      await setContext.call(this.db, orgId ?? null, projectId ?? null);
      reset = async () => {
        await setContext.call(
          this.db,
          previousOrg ?? null,
          previousProject ?? null
        );
      };
    }

    try {
      return await fn();
    } finally {
      if (reset) {
        try {
          await reset();
        } catch {
          /* ignore */
        }
      }
    }
  }

  async ingestUrl(
    url: string,
    orgId: string | undefined,
    projectId: string,
    chunkingConfig?: ChunkerConfig
  ): Promise<IngestResult> {
    // Early validation: avoid outbound fetch if project already deleted / invalid
    if (this.db.isOnline()) {
      const proj = await this.db.query<{ id: string; organization_id: string }>(
        'SELECT id, organization_id FROM kb.projects WHERE id = $1 LIMIT 1',
        [projectId]
      );
      if (!proj.rowCount) {
        throw new BadRequestException({
          error: {
            code: 'project-not-found',
            message: 'Project not found (ingestion)',
          },
        });
      }
      const row = proj.rows[0];
      if (orgId && row.organization_id !== orgId) {
        throw new BadRequestException({
          error: {
            code: 'org-project-mismatch',
            message: 'Provided orgId does not match project org',
          },
        });
      }
    }
    let res: Response;
    try {
      res = await fetch(url, { redirect: 'follow' });
    } catch (e) {
      throw new BadRequestException({
        error: {
          code: 'fetch-failed',
          message: `Failed to fetch URL: ${(e as Error).message}`,
        },
      });
    }
    if (!res.ok)
      throw new BadRequestException({
        error: { code: 'fetch-bad-status', message: `Status ${res.status}` },
      });
    const contentType = res.headers.get('content-type') || 'text/plain';
    const buf = Buffer.from(await res.arrayBuffer());
    let text = buf.toString('utf-8');
    if (contentType.includes('text/html')) {
      const { htmlToText } = await import('html-to-text');
      text = htmlToText(text);
    }
    return this.ingestText({
      text,
      sourceUrl: url,
      mimeType: contentType,
      orgId,
      projectId,
      chunkingConfig,
    });
  }

  /**
   * Check if auto-extraction is enabled for a project
   * Returns extraction config if enabled, null otherwise
   *
   * ✅ MIGRATED TO TYPEORM (Session 18)
   * Simple SELECT with WHERE id = projectId
   * Replaced: this.db.query('SELECT auto_extract_objects, auto_extract_config FROM kb.projects WHERE id = $1')
   * Pattern: Repository.findOne() with select fields
   */
  private async shouldAutoExtract(
    projectId: string
  ): Promise<{ enabled: boolean; config: any } | null> {
    try {
      const project = await this.projectRepository.findOne({
        where: { id: projectId },
        select: ['autoExtractObjects', 'autoExtractConfig'],
      });

      if (!project) {
        return null;
      }

      return {
        enabled: project.autoExtractObjects === true,
        config: project.autoExtractConfig || {},
      };
    } catch (e) {
      this.logger.warn(
        `Failed to check auto-extraction settings for project ${projectId}: ${
          (e as Error).message
        }`
      );
      return null;
    }
  }

  /**
   * Get project-level chunking configuration
   * Returns chunking config if set, null otherwise
   */
  private async getProjectChunkingConfig(
    projectId: string
  ): Promise<ChunkerConfig | null> {
    try {
      const project = await this.projectRepository.findOne({
        where: { id: projectId },
        select: ['chunkingConfig'],
      });

      if (!project || !project.chunkingConfig) {
        return null;
      }

      // Map stored config to ChunkerConfig format
      const storedConfig = project.chunkingConfig as {
        strategy?: string;
        maxChunkSize?: number;
        minChunkSize?: number;
      };

      return {
        strategy:
          (storedConfig.strategy as ChunkerConfig['strategy']) || 'character',
        options: {
          maxChunkSize: storedConfig.maxChunkSize,
          minChunkSize: storedConfig.minChunkSize,
        },
      };
    } catch (e) {
      this.logger.warn(
        `Failed to get chunking config for project ${projectId}: ${
          (e as Error).message
        }`
      );
      return null;
    }
  }

  /**
   * Ingest text content into a project as a document with chunks
   *
   * ⚠️ STRATEGIC SQL PRESERVED (Session 18) - CANNOT MIGRATE TO TYPEORM
   *
   * This method contains 4+ raw SQL queries that MUST remain for critical functionality:
   *
   * 1. **Runtime Feature Detection** (lines ~149-156, ~262-264):
   *    - Tests for content_hash column existence via SELECT attempt
   *    - Tests for embedding column existence during INSERT
   *    - Caches results per-process to optimize subsequent calls
   *    - TypeORM limitation: Cannot do runtime schema introspection
   *
   * 2. **Explicit Transaction Management** (lines ~183-189, ~297-305):
   *    - Uses DatabaseService.getClient() for explicit BEGIN/COMMIT/ROLLBACK
   *    - Required for atomic document + chunks creation
   *    - Rollback on duplicate detection (dedup check)
   *    - TypeORM QueryRunner cannot handle our custom client pattern
   *
   * 3. **CTE-Based INSERT Pattern** (lines ~204-218, ~240-249):
   *    - INSERT INTO documents SELECT FROM projects CTE
   *    - Validates project existence atomically during insert
   *    - Returns document ID in single query
   *    - TypeORM limitation: No direct CTE support in INSERT
   *
   * 4. **Dynamic SQL for Schema Evolution** (lines ~253-295):
   *    - Conditionally includes/excludes embedding column based on detection
   *    - Conditional UPSERT vs INSERT based on constraint detection
   *    - Handles missing columns gracefully for backward compatibility
   *    - TypeORM limitation: Cannot dynamically modify query structure
   *
   * 5. **Loop with Conditional SQL Generation** (lines ~252-295):
   *    - Inserts chunks in loop with dynamic vector literal construction
   *    - Checks vec && vec.length > 0 to avoid "vector must have at least 1 dimension"
   *    - Falls back to NULL embeddings if generation fails
   *    - TypeORM limitation: Cannot handle dynamic column inclusion in loops
   *
   * **Migration Decision**: PRESERVE ALL RAW SQL
   * - Complexity: HIGH (feature detection, transactions, CTEs, dynamic SQL)
   * - Risk: Very High (breaking production ingestion pipeline)
   * - Benefit of Migration: None (TypeORM cannot replicate this pattern)
   * - Recommendation: Keep as strategic SQL indefinitely
   *
   * **Why This Is Good Code**:
   * - Handles schema evolution gracefully (content_hash, embedding columns optional)
   * - Atomic transactions prevent partial ingestion
   * - Efficient deduplication (hash-based when available, content-based fallback)
   * - Performance optimized with feature detection caching
   * - Production-proven pattern (handles edge cases like unique violations)
   */
  async ingestText({
    text,
    sourceUrl,
    filename,
    mimeType,
    orgId,
    projectId,
    chunkingConfig,
  }: {
    text: string;
    sourceUrl?: string;
    filename?: string;
    mimeType?: string;
    orgId?: string;
    projectId: string;
    /** Optional chunking configuration (strategy and options) */
    chunkingConfig?: ChunkerConfig;
  }): Promise<IngestResult> {
    if (!text || !text.trim())
      throw new BadRequestException({
        error: { code: 'empty', message: 'Text content empty' },
      });
    if (!projectId)
      throw new BadRequestException({
        error: { code: 'project-required', message: 'projectId is required' },
      });
    // Lazy detect content_hash feature: attempt simple query referencing column; cache result.
    if (this.hasContentHashColumn === undefined && this.db.isOnline()) {
      try {
        await this.db.query('SELECT content_hash FROM kb.documents LIMIT 1');
        this.hasContentHashColumn = true;
        this.metrics.contentHashDetected++;
      } catch (e: any) {
        if (e?.code === '42703') {
          this.hasContentHashColumn = false;
          this.metrics.contentHashMissing++;
          if (process.env.E2E_DEBUG_VERBOSE === 'true') {
            this.logger.warn(
              'kb.documents.content_hash missing; using raw content equality for dedup'
            );
          }
        } else {
          // For transient errors default to hash path off this run, will retry next call.
          this.hasContentHashColumn = false;
          this.metrics.contentHashMissing++;
        }
      }
    }

    // Validate project & derive org (if not provided). If DB offline, allow ingestion but set nulls.
    let derivedOrg: string | null = null;
    if (this.db.isOnline()) {
      const projRes = await this.db.query<{
        id: string;
        organization_id: string;
      }>('SELECT id, organization_id FROM kb.projects WHERE id = $1 LIMIT 1', [
        projectId,
      ]);
      if (!projRes.rowCount || !projRes.rows.length) {
        throw new BadRequestException({
          error: {
            code: 'project-not-found',
            message: 'Project not found (ingestion)',
          },
        });
      }
      const row = projRes.rows[0];
      if (!row || !row.id) {
        throw new BadRequestException({
          error: {
            code: 'project-load-failed',
            message: 'Failed to load project metadata',
          },
        });
      }
      derivedOrg = row.organization_id;
      if (orgId && orgId !== derivedOrg) {
        throw new BadRequestException({
          error: {
            code: 'org-project-mismatch',
            message: 'Provided orgId does not match project org',
          },
        });
      }
    }
    const tenantOrgId = derivedOrg || orgId || null;

    // Determine effective chunking config: use provided config, or fall back to project defaults
    let effectiveChunkingConfig = chunkingConfig;
    if (!effectiveChunkingConfig) {
      const projectConfig = await this.getProjectChunkingConfig(projectId);
      if (projectConfig) {
        this.logger.debug(
          `Using project-level chunking config for project ${projectId}: ${JSON.stringify(
            projectConfig
          )}`
        );
        effectiveChunkingConfig = projectConfig;
      }
    }

    // Use chunkWithMetadata with effective config (project defaults or system defaults)
    let chunksWithMeta: ChunkWithMetadata[];
    if (effectiveChunkingConfig) {
      chunksWithMeta = this.chunker.chunkWithMetadata(
        text,
        effectiveChunkingConfig
      );
    } else {
      // Default to character strategy with default options
      chunksWithMeta = this.chunker.chunkWithMetadata(text);
    }

    // Extract text for embeddings
    const chunkTexts = chunksWithMeta.map((c) => c.text);

    let vectors: number[][] = [];
    if (this.config.embeddingsEnabled) {
      try {
        vectors = await this.embeddings.embedDocuments(chunkTexts);
      } catch (e) {
        this.logger.warn(
          `Embedding generation failed, proceeding with NULL embeddings: ${
            (e as Error).message
          }`
        );
        vectors = [];
      }
    }

    return this.withTenantContext(tenantOrgId, projectId, async () => {
      type ClientType = Awaited<ReturnType<DatabaseService['getClient']>>;
      const getClientCandidate = (
        this.db as DatabaseService & { getClient?: () => Promise<ClientType> }
      ).getClient;
      const client: ClientType | null =
        typeof getClientCandidate === 'function'
          ? await getClientCandidate.call(this.db)
          : null;
      const query = <T extends QueryResultRow = QueryResultRow>(
        sql: string,
        params?: any[]
      ) =>
        client ? client.query<T>(sql, params) : this.db.query<T>(sql, params);
      let documentId: string | undefined;
      let transactionActive = false;
      try {
        if (client) {
          await client.query('BEGIN');
          transactionActive = true;
        }

        if (this.hasContentHashColumn) {
          const hash = this.hash.sha256(text);
          const existing = await query<{ id: string }>(
            'SELECT id FROM kb.documents WHERE project_id = $1 AND content_hash = $2 LIMIT 1',
            [projectId, hash]
          );
          if (existing.rowCount) {
            if (transactionActive && client) {
              await client.query('ROLLBACK');
              transactionActive = false;
            }
            return {
              documentId: existing.rows[0].id,
              chunks: 0,
              alreadyExists: true,
            };
          }
          try {
            const insertDoc = await query<{ id: string }>(
              `WITH target AS (
                                SELECT p.id AS project_id
                                FROM kb.projects p
                                WHERE p.id = $1
                                LIMIT 1
                            )
                            INSERT INTO kb.documents(project_id, source_url, filename, mime_type, content, content_hash)
                            SELECT target.project_id, $2, $3, $4, $5, $6 FROM target
                            RETURNING id`,
              [
                projectId,
                sourceUrl || null,
                filename || null,
                mimeType || 'text/plain',
                text,
                hash,
              ]
            );
            if (!insertDoc.rowCount) {
              throw new BadRequestException({
                error: {
                  code: 'project-not-found',
                  message: 'Project not found (ingestion)',
                },
              });
            }
            documentId = insertDoc.rows[0]?.id;
          } catch (e: any) {
            if (e?.code === '23505') {
              this.metrics.uniqueViolationRaces++;
              const again = await query<{ id: string }>(
                'SELECT id FROM kb.documents WHERE project_id = $1 AND content_hash = $2 LIMIT 1',
                [projectId, hash]
              );
              if (again.rowCount) {
                if (transactionActive && client) {
                  await client.query('ROLLBACK');
                  transactionActive = false;
                }
                return {
                  documentId: again.rows[0].id,
                  chunks: 0,
                  alreadyExists: true,
                };
              }
              throw e;
            }
            if (e?.code === '42703') {
              this.hasContentHashColumn = false;
              this.metrics.contentHashMissing++;
            } else {
              throw e;
            }
          }
        }
        if (!documentId) {
          const existingByContent = await query<{ id: string }>(
            'SELECT id FROM kb.documents WHERE project_id = $1 AND content = $2 LIMIT 1',
            [projectId, text]
          );
          if (existingByContent.rowCount) {
            if (transactionActive && client) {
              await client.query('ROLLBACK');
              transactionActive = false;
            }
            return {
              documentId: existingByContent.rows[0].id,
              chunks: 0,
              alreadyExists: true,
            };
          }
          const insertDoc = await query<{ id: string }>(
            `WITH target AS (
                            SELECT p.id AS project_id
                            FROM kb.projects p
                            WHERE p.id = $1
                            LIMIT 1
                        )
                        INSERT INTO kb.documents(project_id, source_url, filename, mime_type, content)
                        SELECT target.project_id, $2, $3, $4, $5 FROM target
                        RETURNING id`,
            [
              projectId,
              sourceUrl || null,
              filename || null,
              mimeType || 'text/plain',
              text,
            ]
          );
          if (!insertDoc.rowCount) {
            throw new BadRequestException({
              error: {
                code: 'project-not-found',
                message: 'Project not found (ingestion)',
              },
            });
          }
          documentId = insertDoc.rows[0]?.id;
        }
        if (!documentId) {
          throw new BadRequestException({
            error: {
              code: 'document-insert-failed',
              message:
                'Failed to insert document (database offline or schema mismatch)',
            },
          });
        }

        let hasEmbeddingColumn: boolean | undefined;
        let hasMetadataColumn: boolean | undefined;
        let hasChunkUpsertConstraint = true;
        for (let i = 0; i < chunksWithMeta.length; i++) {
          const chunkData = chunksWithMeta[i];
          const vec = vectors[i];
          // Fix: Check if vec exists AND has length > 0 to avoid "vector must have at least 1 dimension" error
          const vecLiteral =
            vec && vec.length > 0
              ? '[' +
                vec
                  .map((n) => (Number.isFinite(n) ? String(n) : '0'))
                  .join(',') +
                ']'
              : null;
          // Serialize metadata as JSON for storage
          const metadataJson = JSON.stringify(chunkData.metadata);

          if (hasEmbeddingColumn === false) {
            if (hasChunkUpsertConstraint) {
              try {
                // Try with metadata column first
                if (hasMetadataColumn !== false) {
                  try {
                    await query(
                      `INSERT INTO kb.chunks(document_id, chunk_index, text, metadata)
                                       VALUES ($1,$2,$3,$4::jsonb)
                                       ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text, metadata = EXCLUDED.metadata`,
                      [documentId, i, chunkData.text, metadataJson]
                    );
                    hasMetadataColumn = true;
                  } catch (e: any) {
                    if (e?.code === '42703') {
                      // metadata column doesn't exist, fall back to without it
                      hasMetadataColumn = false;
                      await query(
                        `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                         VALUES ($1,$2,$3)
                                         ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text`,
                        [documentId, i, chunkData.text]
                      );
                    } else {
                      throw e;
                    }
                  }
                } else {
                  await query(
                    `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                     VALUES ($1,$2,$3)
                                     ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text`,
                    [documentId, i, chunkData.text]
                  );
                }
              } catch (e) {
                if ((e as any)?.code === '42P10') {
                  hasChunkUpsertConstraint = false;
                  if (hasMetadataColumn !== false) {
                    try {
                      await query(
                        `INSERT INTO kb.chunks(document_id, chunk_index, text, metadata)
                                             VALUES ($1,$2,$3,$4::jsonb)`,
                        [documentId, i, chunkData.text, metadataJson]
                      );
                      hasMetadataColumn = true;
                    } catch (e2: any) {
                      if (e2?.code === '42703') {
                        hasMetadataColumn = false;
                        await query(
                          `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                               VALUES ($1,$2,$3)`,
                          [documentId, i, chunkData.text]
                        );
                      } else {
                        throw e2;
                      }
                    }
                  } else {
                    await query(
                      `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                           VALUES ($1,$2,$3)`,
                      [documentId, i, chunkData.text]
                    );
                  }
                } else throw e;
              }
            } else {
              if (hasMetadataColumn !== false) {
                try {
                  await query(
                    `INSERT INTO kb.chunks(document_id, chunk_index, text, metadata)
                                     VALUES ($1,$2,$3,$4::jsonb)`,
                    [documentId, i, chunkData.text, metadataJson]
                  );
                  hasMetadataColumn = true;
                } catch (e: any) {
                  if (e?.code === '42703') {
                    hasMetadataColumn = false;
                    await query(
                      `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                       VALUES ($1,$2,$3)`,
                      [documentId, i, chunkData.text]
                    );
                  } else {
                    throw e;
                  }
                }
              } else {
                await query(
                  `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                   VALUES ($1,$2,$3)`,
                  [documentId, i, chunkData.text]
                );
              }
            }
            continue;
          }
          try {
            // Build the INSERT with embedding and optionally metadata
            if (hasMetadataColumn !== false) {
              if (hasChunkUpsertConstraint) {
                try {
                  await query(
                    `INSERT INTO kb.chunks(document_id, chunk_index, text, embedding, metadata)
                                   VALUES ($1,$2,$3,${
                                     vecLiteral ? '$4::vector' : 'NULL'
                                   },$${vecLiteral ? '5' : '4'}::jsonb)
                                   ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text, embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata`,
                    vecLiteral
                      ? [
                          documentId,
                          i,
                          chunkData.text,
                          vecLiteral,
                          metadataJson,
                        ]
                      : [documentId, i, chunkData.text, metadataJson]
                  );
                  hasMetadataColumn = true;
                } catch (e: any) {
                  if (e?.code === '42703') {
                    // metadata column doesn't exist
                    hasMetadataColumn = false;
                    await query(
                      `INSERT INTO kb.chunks(document_id, chunk_index, text, embedding)
                                     VALUES ($1,$2,$3,${
                                       vecLiteral ? '$4::vector' : 'NULL'
                                     })
                                     ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text, embedding = EXCLUDED.embedding`,
                      vecLiteral
                        ? [documentId, i, chunkData.text, vecLiteral]
                        : [documentId, i, chunkData.text]
                    );
                  } else {
                    throw e;
                  }
                }
              } else {
                try {
                  await query(
                    `INSERT INTO kb.chunks(document_id, chunk_index, text, embedding, metadata)
                                   VALUES ($1,$2,$3,${
                                     vecLiteral ? '$4::vector' : 'NULL'
                                   },$${vecLiteral ? '5' : '4'}::jsonb)`,
                    vecLiteral
                      ? [
                          documentId,
                          i,
                          chunkData.text,
                          vecLiteral,
                          metadataJson,
                        ]
                      : [documentId, i, chunkData.text, metadataJson]
                  );
                  hasMetadataColumn = true;
                } catch (e: any) {
                  if (e?.code === '42703') {
                    hasMetadataColumn = false;
                    await query(
                      `INSERT INTO kb.chunks(document_id, chunk_index, text, embedding)
                                     VALUES ($1,$2,$3,${
                                       vecLiteral ? '$4::vector' : 'NULL'
                                     })`,
                      vecLiteral
                        ? [documentId, i, chunkData.text, vecLiteral]
                        : [documentId, i, chunkData.text]
                    );
                  } else {
                    throw e;
                  }
                }
              }
            } else {
              // Already know metadata column doesn't exist
              if (hasChunkUpsertConstraint) {
                await query(
                  `INSERT INTO kb.chunks(document_id, chunk_index, text, embedding)
                                 VALUES ($1,$2,$3,${
                                   vecLiteral ? '$4::vector' : 'NULL'
                                 })
                                 ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text, embedding = EXCLUDED.embedding`,
                  vecLiteral
                    ? [documentId, i, chunkData.text, vecLiteral]
                    : [documentId, i, chunkData.text]
                );
              } else {
                await query(
                  `INSERT INTO kb.chunks(document_id, chunk_index, text, embedding)
                                 VALUES ($1,$2,$3,${
                                   vecLiteral ? '$4::vector' : 'NULL'
                                 })`,
                  vecLiteral
                    ? [documentId, i, chunkData.text, vecLiteral]
                    : [documentId, i, chunkData.text]
                );
              }
            }
            hasEmbeddingColumn = true;
          } catch (e) {
            if ((e as any)?.code === '42703') {
              this.metrics.embeddingColumnMissing++;
              if (process.env.E2E_DEBUG_VERBOSE === 'true') {
                this.logger.warn(
                  'kb.chunks.embedding column missing; continuing without embeddings'
                );
              }
              hasEmbeddingColumn = false;
              if (hasChunkUpsertConstraint) {
                try {
                  if (hasMetadataColumn !== false) {
                    try {
                      await query(
                        `INSERT INTO kb.chunks(document_id, chunk_index, text, metadata)
                                             VALUES ($1,$2,$3,$4::jsonb)
                                             ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text, metadata = EXCLUDED.metadata`,
                        [documentId, i, chunkData.text, metadataJson]
                      );
                      hasMetadataColumn = true;
                    } catch (e3: any) {
                      if (e3?.code === '42703') {
                        hasMetadataColumn = false;
                        await query(
                          `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                               VALUES ($1,$2,$3)
                                               ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text`,
                          [documentId, i, chunkData.text]
                        );
                      } else {
                        throw e3;
                      }
                    }
                  } else {
                    await query(
                      `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                           VALUES ($1,$2,$3)
                                           ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text`,
                      [documentId, i, chunkData.text]
                    );
                  }
                } catch (e2) {
                  if ((e2 as any)?.code === '42P10') {
                    hasChunkUpsertConstraint = false;
                    if (hasMetadataColumn !== false) {
                      try {
                        await query(
                          `INSERT INTO kb.chunks(document_id, chunk_index, text, metadata)
                                               VALUES ($1,$2,$3,$4::jsonb)`,
                          [documentId, i, chunkData.text, metadataJson]
                        );
                        hasMetadataColumn = true;
                      } catch (e4: any) {
                        if (e4?.code === '42703') {
                          hasMetadataColumn = false;
                          await query(
                            `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                                 VALUES ($1,$2,$3)`,
                            [documentId, i, chunkData.text]
                          );
                        } else {
                          throw e4;
                        }
                      }
                    } else {
                      await query(
                        `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                             VALUES ($1,$2,$3)`,
                        [documentId, i, chunkData.text]
                      );
                    }
                  } else throw e2;
                }
              } else {
                if (hasMetadataColumn !== false) {
                  try {
                    await query(
                      `INSERT INTO kb.chunks(document_id, chunk_index, text, metadata)
                                           VALUES ($1,$2,$3,$4::jsonb)`,
                      [documentId, i, chunkData.text, metadataJson]
                    );
                    hasMetadataColumn = true;
                  } catch (e3: any) {
                    if (e3?.code === '42703') {
                      hasMetadataColumn = false;
                      await query(
                        `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                             VALUES ($1,$2,$3)`,
                        [documentId, i, chunkData.text]
                      );
                    } else {
                      throw e3;
                    }
                  }
                } else {
                  await query(
                    `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                         VALUES ($1,$2,$3)`,
                    [documentId, i, chunkData.text]
                  );
                }
              }
            } else if ((e as any)?.code === '42P10') {
              hasChunkUpsertConstraint = false;
              if (hasMetadataColumn !== false) {
                try {
                  await query(
                    `INSERT INTO kb.chunks(document_id, chunk_index, text, embedding, metadata)
                                   VALUES ($1,$2,$3,${
                                     vecLiteral ? '$4::vector' : 'NULL'
                                   },$${vecLiteral ? '5' : '4'}::jsonb)`,
                    vecLiteral
                      ? [
                          documentId,
                          i,
                          chunkData.text,
                          vecLiteral,
                          metadataJson,
                        ]
                      : [documentId, i, chunkData.text, metadataJson]
                  );
                  hasMetadataColumn = true;
                } catch (e3: any) {
                  if (e3?.code === '42703') {
                    hasMetadataColumn = false;
                    await query(
                      `INSERT INTO kb.chunks(document_id, chunk_index, text, embedding)
                                     VALUES ($1,$2,$3,${
                                       vecLiteral ? '$4::vector' : 'NULL'
                                     })`,
                      vecLiteral
                        ? [documentId, i, chunkData.text, vecLiteral]
                        : [documentId, i, chunkData.text]
                    );
                  } else {
                    throw e3;
                  }
                }
              } else {
                await query(
                  `INSERT INTO kb.chunks(document_id, chunk_index, text, embedding)
                                 VALUES ($1,$2,$3,${
                                   vecLiteral ? '$4::vector' : 'NULL'
                                 })`,
                  vecLiteral
                    ? [documentId, i, chunkData.text, vecLiteral]
                    : [documentId, i, chunkData.text]
                );
              }
            } else {
              throw e;
            }
          }
        }

        if (transactionActive && client) {
          await client.query('COMMIT');
          transactionActive = false;
        }
      } catch (error) {
        if (transactionActive) {
          try {
            if (client) {
              await client.query('ROLLBACK');
            }
          } catch {
            /* ignore */
          }
          transactionActive = false;
        }
        throw error;
      } finally {
        if (client) {
          client.release();
        }
      }

      let extractionJobId: string | undefined;
      const autoExtractSettings = await this.shouldAutoExtract(projectId);

      if (autoExtractSettings?.enabled) {
        try {
          this.logger.log(
            `Auto-extraction enabled for project ${projectId}, creating extraction job for document ${documentId}`
          );

          const organizationId = tenantOrgId || '';
          const extractionJob = await this.extractionJobService.createJob({
            project_id: projectId,
            source_type: ExtractionSourceType.DOCUMENT,
            source_id: documentId!,
            source_metadata: {
              filename: filename || null,
              source_url: sourceUrl || null,
              mime_type: mimeType || 'text/plain',
              chunks: chunksWithMeta.length,
            },
            extraction_config: {
              ...autoExtractSettings.config,
              enabled_types: autoExtractSettings.config.enabled_types || null,
              min_confidence: autoExtractSettings.config.min_confidence || 0.7,
              require_review:
                autoExtractSettings.config.require_review || false,
            },
          });

          extractionJobId = extractionJob.id;
          this.logger.log(
            `Created extraction job ${extractionJobId} for document ${documentId}`
          );
        } catch (e) {
          this.logger.error(
            `Failed to create auto-extraction job for document ${documentId}: ${
              (e as Error).message
            }`,
            (e as Error).stack
          );
        }
      }

      // Queue chunk embedding jobs if embedding generation failed during sync upload
      // This enables async retry with exponential backoff
      if (
        this.config.embeddingsEnabled &&
        chunksWithMeta.length > 0 &&
        vectors.length === 0
      ) {
        try {
          // Query for chunk IDs of this document
          const chunkResult = await this.db.query<{ id: string }>(
            `SELECT id FROM kb.chunks WHERE document_id = $1`,
            [documentId]
          );
          const chunkIds = chunkResult.rows.map((r) => r.id);

          if (chunkIds.length > 0) {
            const queued = await this.chunkEmbeddingJobs.enqueueBatch(chunkIds);
            if (queued > 0) {
              this.logger.log(
                `Queued ${queued} chunk embedding jobs for document ${documentId} (async retry)`
              );
            }
          }
        } catch (e) {
          this.logger.warn(
            `Failed to queue chunk embedding jobs for document ${documentId}: ${
              (e as Error).message
            }`
          );
        }
      }

      return {
        documentId: documentId!,
        chunks: chunksWithMeta.length,
        alreadyExists: false,
        extractionJobId,
      };
    });
  }

  /**
   * Ingest multiple files in a batch with controlled concurrency.
   *
   * @param files Array of file data to ingest
   * @param orgId Optional organization ID
   * @param projectId Project ID (required)
   * @param concurrency Number of files to process in parallel (default: 3, max: 5)
   * @param chunkingConfig Optional chunking configuration to apply to all files
   * @returns BatchUploadResult with summary and individual file results
   */
  async ingestBatch({
    files,
    orgId,
    projectId,
    concurrency = 3,
    chunkingConfig,
  }: {
    files: Array<{
      text: string;
      filename: string;
      mimeType?: string;
    }>;
    orgId?: string;
    projectId: string;
    concurrency?: number;
    chunkingConfig?: ChunkerConfig;
  }): Promise<BatchUploadResult> {
    const pLimit = (await import('p-limit')).default;

    // Enforce concurrency limits
    const effectiveConcurrency = Math.min(Math.max(1, concurrency), 5);
    const limit = pLimit(effectiveConcurrency);

    const results: BatchFileResult[] = [];
    const summary: BatchUploadSummary = {
      total: files.length,
      successful: 0,
      duplicates: 0,
      failed: 0,
    };

    this.logger.log(
      `Starting batch ingestion of ${files.length} files for project ${projectId} with concurrency ${effectiveConcurrency}`
    );

    // Process files with controlled concurrency
    const promises = files.map((file, index) =>
      limit(async (): Promise<BatchFileResult> => {
        try {
          const result = await this.ingestText({
            text: file.text,
            filename: file.filename,
            mimeType: file.mimeType,
            orgId,
            projectId,
            chunkingConfig,
          });

          if (result.alreadyExists) {
            summary.duplicates++;
            return {
              filename: file.filename,
              status: 'duplicate',
              documentId: result.documentId,
            };
          }

          summary.successful++;
          return {
            filename: file.filename,
            status: 'success',
            documentId: result.documentId,
            chunks: result.chunks,
          };
        } catch (e) {
          summary.failed++;
          const errorMessage =
            e instanceof BadRequestException
              ? (e.getResponse() as any)?.error?.message ?? (e as Error).message
              : (e as Error).message;

          this.logger.warn(
            `Batch ingestion failed for file ${file.filename}: ${errorMessage}`
          );

          return {
            filename: file.filename,
            status: 'failed',
            error: errorMessage,
          };
        }
      })
    );

    // Wait for all files to complete
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    this.logger.log(
      `Batch ingestion complete: ${summary.successful} successful, ${summary.duplicates} duplicates, ${summary.failed} failed`
    );

    return {
      summary,
      results,
    };
  }
}

// For tests / diagnostics (avoid leaking mutable reference)
export function getIngestionServiceMetrics(service: IngestionService) {
  // @ts-expect-error accessing private field for controlled export; acceptable for test helper
  const m = service.metrics as Record<string, number>;
  return { ...m };
}
