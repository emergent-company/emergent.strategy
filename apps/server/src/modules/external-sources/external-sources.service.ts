import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ExternalSource,
  ExternalSourceType,
  Document,
  DocumentSourceType,
} from '../../entities';
import { ExternalSourceProviderRegistry } from './external-source-provider-registry.service';
import { ExternalSourceProvider, ExternalSourceReference } from './interfaces';
import {
  ImportExternalSourceDto,
  UpdateExternalSourceDto,
  ImportResultDto,
  SyncResultDto,
  ExternalSourceResponseDto,
  ExternalSourceListDto,
} from './dto';
import { IngestionService } from '../ingestion/ingestion.service';

/**
 * Maximum retries before marking source as error
 */
const MAX_ERROR_COUNT = 5;

/**
 * Service for managing external sources
 *
 * Handles:
 * - Importing from external URLs (Google Drive, generic URLs, etc.)
 * - Deduplication by normalized URL
 * - Sync state management
 * - Document creation via ingestion pipeline
 */
@Injectable()
export class ExternalSourcesService {
  private readonly logger = new Logger(ExternalSourcesService.name);

  constructor(
    @InjectRepository(ExternalSource)
    private readonly externalSourceRepository: Repository<ExternalSource>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    private readonly providerRegistry: ExternalSourceProviderRegistry,
    private readonly ingestionService: IngestionService
  ) {}

  /**
   * Import a document from an external URL
   *
   * Flow:
   * 1. Detect provider from URL
   * 2. Parse URL into external source reference
   * 3. Check for existing source (dedup by normalized URL)
   * 4. Validate access to the source
   * 5. Fetch content and create document
   * 6. Create or update ExternalSource record
   */
  async importFromUrl(
    dto: ImportExternalSourceDto,
    projectId: string
  ): Promise<ImportResultDto> {
    const {
      url,
      syncPolicy,
      syncIntervalMinutes,
      immediate = true,
      metadata,
    } = dto;

    // 1. Detect provider
    this.logger.debug(
      `Detecting provider for URL: ${url}, registered providers: ${this.providerRegistry
        .getRegisteredTypes()
        .join(', ')}`
    );
    const provider = this.providerRegistry.detectProvider(url);
    if (!provider) {
      return {
        success: false,
        status: 'error',
        error: `No provider found for URL: ${url}`,
      };
    }
    this.logger.debug(
      `Provider detected: ${provider.providerType} (${provider.displayName})`
    );

    // 2. Parse URL
    const ref = provider.parseUrl(url);
    if (!ref) {
      return {
        success: false,
        status: 'error',
        error: `Failed to parse URL: ${url}`,
      };
    }

    this.logger.log(
      `Importing from ${provider.displayName}: ${ref.normalizedUrl}`
    );

    // 3. Check for existing source (dedup)
    const existingSource = await this.externalSourceRepository.findOne({
      where: {
        projectId,
        normalizedUrl: ref.normalizedUrl,
      },
    });

    if (existingSource) {
      this.logger.log(`Found existing source: ${existingSource.id}`);

      // If immediate, trigger sync to get latest content
      if (immediate) {
        const syncResult = await this.syncSource(existingSource.id, {
          force: false,
        });
        return {
          success: syncResult.success,
          externalSourceId: existingSource.id,
          documentId: syncResult.documentId,
          status: syncResult.updated ? 'updated' : 'duplicate',
          details: { syncResult },
        };
      }

      return {
        success: true,
        externalSourceId: existingSource.id,
        status: 'duplicate',
        details: { message: 'Source already exists' },
      };
    }

    // 4. Validate access
    const accessResult = await provider.checkAccess(ref);
    if (!accessResult.accessible) {
      return {
        success: false,
        status: 'error',
        error: `Cannot access source: ${accessResult.reason || 'unknown'}`,
      };
    }

    // 5. Create external source record
    const effectiveSyncPolicy = syncPolicy || provider.getDefaultSyncPolicy();
    const externalSource = this.externalSourceRepository.create({
      projectId,
      providerType: ref.providerType,
      externalId: ref.externalId,
      originalUrl: ref.originalUrl,
      normalizedUrl: ref.normalizedUrl,
      displayName: accessResult.metadata?.name || null,
      mimeType: accessResult.metadata?.mimeType || null,
      syncPolicy: effectiveSyncPolicy,
      syncIntervalMinutes:
        effectiveSyncPolicy === 'periodic' ? syncIntervalMinutes || 60 : null,
      status: 'active',
      providerMetadata: metadata || null,
    });

    await this.externalSourceRepository.save(externalSource);
    this.logger.log(`Created external source: ${externalSource.id}`);

    // 6. Fetch content and create document (if immediate)
    if (immediate) {
      try {
        const document = await this.fetchAndCreateDocument(
          externalSource,
          provider,
          ref,
          projectId
        );

        // Update source with sync info
        await this.externalSourceRepository.update(externalSource.id, {
          lastSyncedAt: new Date(),
          lastCheckedAt: new Date(),
          lastEtag: document.syncVersion?.toString(),
        });

        return {
          success: true,
          externalSourceId: externalSource.id,
          documentId: document.id,
          status: 'created',
        };
      } catch (error) {
        // Record error but still return success for source creation
        await this.recordError(externalSource.id, error as Error);

        return {
          success: false,
          externalSourceId: externalSource.id,
          status: 'error',
          error:
            error instanceof Error ? error.message : 'Failed to fetch content',
        };
      }
    }

    // Queue for background processing
    // TODO: Implement BullMQ job queue
    return {
      success: true,
      externalSourceId: externalSource.id,
      status: 'queued',
      details: { message: 'Queued for background processing' },
    };
  }

  /**
   * Sync an external source (check for updates and fetch if changed)
   */
  async syncSource(
    sourceId: string,
    options: { force?: boolean } = {}
  ): Promise<SyncResultDto> {
    const source = await this.externalSourceRepository.findOne({
      where: { id: sourceId },
    });

    if (!source) {
      throw new NotFoundException(`External source not found: ${sourceId}`);
    }

    if (source.status === 'disabled') {
      return {
        success: false,
        updated: false,
        error: 'Source is disabled',
      };
    }

    const provider = this.providerRegistry.getProvider(source.providerType);
    if (!provider) {
      return {
        success: false,
        updated: false,
        error: `Provider not found: ${source.providerType}`,
      };
    }

    const ref: ExternalSourceReference = {
      providerType: source.providerType,
      externalId: source.externalId,
      originalUrl: source.originalUrl,
      normalizedUrl: source.normalizedUrl,
    };

    try {
      // Check for updates (unless force)
      if (!options.force && source.lastSyncedAt) {
        const updateCheck = await provider.checkForUpdates(
          ref,
          source.lastSyncedAt,
          source.lastEtag || undefined
        );

        if (!updateCheck.hasUpdates) {
          // Update last checked time
          await this.externalSourceRepository.update(sourceId, {
            lastCheckedAt: new Date(),
          });

          return {
            success: true,
            updated: false,
          };
        }
      }

      // Fetch new content
      const document = await this.fetchAndCreateDocument(
        source,
        provider,
        ref,
        source.projectId
      );

      // Update sync state
      await this.externalSourceRepository.update(sourceId, {
        lastSyncedAt: new Date(),
        lastCheckedAt: new Date(),
        lastEtag: document.syncVersion?.toString(),
        errorCount: 0,
        lastError: null,
        lastErrorAt: null,
        status: 'active',
      });

      return {
        success: true,
        updated: true,
        documentId: document.id,
      };
    } catch (error) {
      await this.recordError(sourceId, error as Error);

      return {
        success: false,
        updated: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      };
    }
  }

  /**
   * Fetch content from provider and create document via ingestion
   */
  private async fetchAndCreateDocument(
    source: ExternalSource,
    provider: ExternalSourceProvider,
    ref: ExternalSourceReference,
    projectId: string
  ): Promise<Document> {
    // Fetch metadata
    const metadata = await provider.fetchMetadata(ref);

    // Fetch content
    const content = await provider.fetchContent(ref);

    // Determine content as text
    let text: string;
    if (typeof content.content === 'string') {
      text = content.content;
    } else {
      // For binary content, convert to string (may need better handling)
      text = content.content.toString('utf-8');
    }

    // Get current sync version
    const currentVersion = await this.getLatestSyncVersion(source.id);
    const newVersion = currentVersion + 1;

    // Create document via ingestion service
    const ingestResult = await this.ingestionService.ingestText({
      text,
      sourceUrl: ref.originalUrl,
      filename: content.filename || metadata.name,
      mimeType: content.mimeType,
      projectId,
    });

    // Update document with external source link
    await this.documentRepository.update(ingestResult.documentId, {
      sourceType: this.mapProviderTypeToDocSourceType(source.providerType),
      externalSourceId: source.id,
      syncVersion: newVersion,
    });

    // Update source display name if we got it from metadata
    if (metadata.name && !source.displayName) {
      await this.externalSourceRepository.update(source.id, {
        displayName: metadata.name,
        mimeType: metadata.mimeType,
      });
    }

    const document = await this.documentRepository.findOne({
      where: { id: ingestResult.documentId },
    });

    if (!document) {
      throw new Error('Failed to create document');
    }

    return document;
  }

  /**
   * Get the latest sync version for a source
   */
  private async getLatestSyncVersion(sourceId: string): Promise<number> {
    const result = await this.documentRepository
      .createQueryBuilder('doc')
      .select('MAX(doc.syncVersion)', 'maxVersion')
      .where('doc.externalSourceId = :sourceId', { sourceId })
      .getRawOne();

    return result?.maxVersion || 0;
  }

  /**
   * Map provider type to document source type
   */
  private mapProviderTypeToDocSourceType(
    providerType: ExternalSourceType
  ): DocumentSourceType {
    switch (providerType) {
      case 'google_drive':
        return 'google_drive';
      case 'dropbox':
        return 'dropbox';
      case 'url':
        return 'url';
      default:
        return 'external';
    }
  }

  /**
   * Record an error for a source
   */
  private async recordError(sourceId: string, error: Error): Promise<void> {
    const source = await this.externalSourceRepository.findOne({
      where: { id: sourceId },
    });

    if (!source) return;

    const newErrorCount = source.errorCount + 1;
    const newStatus =
      newErrorCount >= MAX_ERROR_COUNT ? 'error' : source.status;

    await this.externalSourceRepository.update(sourceId, {
      errorCount: newErrorCount,
      lastError: error.message,
      lastErrorAt: new Date(),
      status: newStatus,
    });

    this.logger.warn(
      `Error for source ${sourceId} (count: ${newErrorCount}): ${error.message}`
    );
  }

  /**
   * Get an external source by ID
   */
  async getById(sourceId: string): Promise<ExternalSourceResponseDto | null> {
    const source = await this.externalSourceRepository.findOne({
      where: { id: sourceId },
    });

    if (!source) {
      return null;
    }

    return this.mapToResponseDto(source);
  }

  /**
   * List external sources for a project
   */
  async list(
    projectId: string,
    options: {
      limit?: number;
      cursor?: string;
      status?: 'active' | 'error' | 'disabled';
    } = {}
  ): Promise<ExternalSourceListDto> {
    const { limit = 50, cursor, status } = options;

    const queryBuilder = this.externalSourceRepository
      .createQueryBuilder('source')
      .where('source.projectId = :projectId', { projectId })
      .orderBy('source.createdAt', 'DESC')
      .take(limit + 1);

    if (status) {
      queryBuilder.andWhere('source.status = :status', { status });
    }

    if (cursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(cursor, 'base64url').toString('utf8')
        );
        queryBuilder.andWhere(
          '(source.createdAt < :createdAt OR (source.createdAt = :createdAt AND source.id < :id))',
          { createdAt: decoded.createdAt, id: decoded.id }
        );
      } catch {
        // Invalid cursor, ignore
      }
    }

    const [sources, total] = await Promise.all([
      queryBuilder.getMany(),
      this.externalSourceRepository.count({
        where: { projectId, ...(status ? { status } : {}) },
      }),
    ]);

    const hasMore = sources.length > limit;
    const items = hasMore ? sources.slice(0, limit) : sources;

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({ createdAt: last.createdAt, id: last.id }),
        'utf8'
      ).toString('base64url');
    }

    return {
      items: await Promise.all(items.map((s) => this.mapToResponseDto(s))),
      total,
      nextCursor,
    };
  }

  /**
   * Update an external source
   */
  async update(
    sourceId: string,
    dto: UpdateExternalSourceDto
  ): Promise<ExternalSourceResponseDto> {
    const source = await this.externalSourceRepository.findOne({
      where: { id: sourceId },
    });

    if (!source) {
      throw new NotFoundException(`External source not found: ${sourceId}`);
    }

    // Apply updates directly to the entity
    if (dto.syncPolicy !== undefined) {
      source.syncPolicy = dto.syncPolicy;
    }

    if (dto.syncIntervalMinutes !== undefined) {
      source.syncIntervalMinutes = dto.syncIntervalMinutes;
    }

    if (dto.displayName !== undefined) {
      source.displayName = dto.displayName;
    }

    if (dto.status !== undefined) {
      source.status = dto.status;
      // Reset error count when re-enabling
      if (dto.status === 'active') {
        source.errorCount = 0;
        source.lastError = null;
        source.lastErrorAt = null;
      }
    }

    const updated = await this.externalSourceRepository.save(source);

    return this.mapToResponseDto(updated);
  }

  /**
   * Delete an external source
   */
  async delete(sourceId: string): Promise<void> {
    const source = await this.externalSourceRepository.findOne({
      where: { id: sourceId },
    });

    if (!source) {
      throw new NotFoundException(`External source not found: ${sourceId}`);
    }

    // Note: Documents linked to this source will have their FK set to null
    // due to ON DELETE SET NULL in the migration
    await this.externalSourceRepository.remove(source);

    this.logger.log(`Deleted external source: ${sourceId}`);
  }

  /**
   * Map entity to response DTO
   */
  private async mapToResponseDto(
    source: ExternalSource
  ): Promise<ExternalSourceResponseDto> {
    // Get document count
    const documentCount = await this.documentRepository.count({
      where: { externalSourceId: source.id },
    });

    // Get latest document ID
    const latestDoc = await this.documentRepository.findOne({
      where: { externalSourceId: source.id },
      order: { createdAt: 'DESC' },
      select: ['id'],
    });

    return {
      id: source.id,
      projectId: source.projectId,
      providerType: source.providerType,
      externalId: source.externalId,
      originalUrl: source.originalUrl,
      normalizedUrl: source.normalizedUrl,
      displayName: source.displayName,
      mimeType: source.mimeType,
      syncPolicy: source.syncPolicy,
      syncIntervalMinutes: source.syncIntervalMinutes,
      lastCheckedAt: source.lastCheckedAt,
      lastSyncedAt: source.lastSyncedAt,
      status: source.status,
      errorCount: source.errorCount,
      lastError: source.lastError,
      lastErrorAt: source.lastErrorAt,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      documentCount,
      latestDocumentId: latestDoc?.id,
    };
  }

  /**
   * Get sources that are due for periodic sync
   */
  async getSourcesDueForSync(limit = 100): Promise<ExternalSource[]> {
    const now = new Date();

    return this.externalSourceRepository
      .createQueryBuilder('source')
      .where('source.syncPolicy = :policy', { policy: 'periodic' })
      .andWhere('source.status = :status', { status: 'active' })
      .andWhere(
        "(source.lastSyncedAt IS NULL OR source.lastSyncedAt + (source.syncIntervalMinutes * INTERVAL '1 minute') <= :now)",
        { now }
      )
      .orderBy('source.lastSyncedAt', 'ASC', 'NULLS FIRST')
      .take(limit)
      .getMany();
  }

  /**
   * Get sources that need retry (have errors but not disabled)
   */
  async getSourcesForRetry(limit = 50): Promise<ExternalSource[]> {
    return this.externalSourceRepository
      .createQueryBuilder('source')
      .where('source.status = :status', { status: 'active' })
      .andWhere('source.errorCount > 0')
      .andWhere('source.errorCount < :maxErrors', {
        maxErrors: MAX_ERROR_COUNT,
      })
      .orderBy('source.lastErrorAt', 'ASC')
      .take(limit)
      .getMany();
  }
}
