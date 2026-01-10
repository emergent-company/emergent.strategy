import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import {
  DataSourceSyncJob,
  DataSourceSyncJobStatus,
  SyncJobLogEntry,
} from '../../entities/data-source-sync-job.entity';
import { DataSourceIntegration } from '../../entities/data-source-integration.entity';
import { DataSourceProviderRegistry } from './providers/provider.registry';
import { EncryptionService } from '../integrations/encryption.service';
import { EventsService } from '../events/events.service';
import { SyncOptions } from './providers/provider.interface';

/** How long a job can be "running" or "pending" before considered stale (10 minutes) */
const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * DTO for creating a sync job
 */
export interface CreateSyncJobDto {
  integrationId: string;
  projectId: string;
  triggeredBy?: string;
  triggerType?: 'manual' | 'scheduled';
  syncOptions?: SyncOptions;
  /** ID of the sync configuration used (from integration metadata.syncConfigurations) */
  configurationId?: string;
  /** Name of the configuration (stored as snapshot) */
  configurationName?: string;
}

/**
 * DTO for sync job response
 */
export interface SyncJobDto {
  id: string;
  integrationId: string;
  status: DataSourceSyncJobStatus;
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  skippedItems: number;
  currentPhase: string | null;
  statusMessage: string | null;
  documentIds: string[];
  logs: SyncJobLogEntry[];
  errorMessage: string | null;
  triggerType: 'manual' | 'scheduled';
  /** ID of the sync configuration used (null if inline options) */
  configurationId: string | null;
  /** Name snapshot of the configuration used */
  configurationName: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

/**
 * Service for managing async data source sync jobs
 */
@Injectable()
export class DataSourceSyncJobService implements OnModuleInit {
  private readonly logger = new Logger(DataSourceSyncJobService.name);

  constructor(
    @InjectRepository(DataSourceSyncJob)
    private readonly syncJobRepo: Repository<DataSourceSyncJob>,
    @InjectRepository(DataSourceIntegration)
    private readonly integrationRepo: Repository<DataSourceIntegration>,
    private readonly providerRegistry: DataSourceProviderRegistry,
    private readonly encryption: EncryptionService,
    private readonly eventsService: EventsService
  ) {}

  /**
   * On module init, recover any stale jobs from previous crashes
   */
  async onModuleInit(): Promise<void> {
    await this.recoverStaleJobs();
  }

  /**
   * Recover stale jobs that were left in running/pending state
   * This handles cases where the server crashed during a sync
   */
  async recoverStaleJobs(): Promise<number> {
    const staleThreshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);

    // Find jobs that have been running/pending for too long
    const staleJobs = await this.syncJobRepo.find({
      where: [
        {
          status: 'running',
          updatedAt: LessThan(staleThreshold),
        },
        {
          status: 'pending',
          updatedAt: LessThan(staleThreshold),
        },
      ],
    });

    if (staleJobs.length === 0) {
      return 0;
    }

    this.logger.warn(
      `Recovering ${staleJobs.length} stale sync job(s) stuck in running/pending state`
    );

    for (const job of staleJobs) {
      job.status = 'failed';
      job.completedAt = new Date();
      job.errorMessage =
        'Job was terminated unexpectedly (server restart or timeout)';
      job.statusMessage = 'Failed: Job was terminated unexpectedly';
      job.logs.push({
        timestamp: new Date().toISOString(),
        level: 'error',
        message:
          'Job marked as failed during recovery - was stuck for more than 10 minutes',
      });

      await this.syncJobRepo.save(job);

      this.logger.log(
        `Recovered stale job ${job.id} for integration ${job.integrationId}`
      );
    }

    return staleJobs.length;
  }

  /**
   * Recover stale jobs for a specific integration
   * Called before creating a new job to clear any zombie jobs
   */
  async recoverStaleJobsForIntegration(integrationId: string): Promise<number> {
    const staleThreshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);

    const staleJobs = await this.syncJobRepo.find({
      where: [
        {
          integrationId,
          status: 'running',
          updatedAt: LessThan(staleThreshold),
        },
        {
          integrationId,
          status: 'pending',
          updatedAt: LessThan(staleThreshold),
        },
      ],
    });

    for (const job of staleJobs) {
      job.status = 'failed';
      job.completedAt = new Date();
      job.errorMessage = 'Job was terminated unexpectedly';
      job.statusMessage = 'Failed: Job was terminated unexpectedly';
      job.logs.push({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Job marked as failed - was stuck for more than 10 minutes',
      });

      await this.syncJobRepo.save(job);

      this.logger.log(
        `Recovered stale job ${job.id} for integration ${integrationId}`
      );
    }

    return staleJobs.length;
  }

  /**
   * Create a new sync job and start it asynchronously
   */
  async createAndStart(dto: CreateSyncJobDto): Promise<SyncJobDto> {
    // Verify integration exists
    const integration = await this.integrationRepo.findOne({
      where: { id: dto.integrationId, projectId: dto.projectId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${dto.integrationId} not found`);
    }

    // First, recover any stale jobs for this integration
    const recoveredCount = await this.recoverStaleJobsForIntegration(
      dto.integrationId
    );
    if (recoveredCount > 0) {
      this.logger.log(
        `Recovered ${recoveredCount} stale job(s) for integration ${dto.integrationId}`
      );
    }

    // Check if there's already a running job for this integration
    const existingJob = await this.syncJobRepo.findOne({
      where: {
        integrationId: dto.integrationId,
        status: In(['running', 'pending']),
      },
    });

    if (existingJob) {
      // Return the existing job instead of creating a new one
      this.logger.log(
        `Returning existing ${existingJob.status} job ${existingJob.id} for integration ${dto.integrationId}`
      );
      return this.toDto(existingJob);
    }

    // Create the sync job
    const job = this.syncJobRepo.create({
      integrationId: dto.integrationId,
      projectId: dto.projectId,
      triggeredBy: dto.triggeredBy,
      triggerType: dto.triggerType || 'manual',
      syncOptions: dto.syncOptions || {},
      configurationId: dto.configurationId || null,
      configurationName: dto.configurationName || null,
      status: 'pending',
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: dto.configurationName
            ? `Sync job created using configuration "${dto.configurationName}"`
            : 'Sync job created',
        },
      ],
    });

    await this.syncJobRepo.save(job);

    this.logger.log(
      `Created sync job ${job.id} for integration ${dto.integrationId}`
    );

    // Start the job asynchronously (don't await)
    this.runSyncJob(job.id).catch((err) => {
      this.logger.error(
        `Sync job ${job.id} failed unexpectedly: ${err.message}`,
        err.stack
      );
    });

    return this.toDto(job);
  }

  /**
   * Get a sync job by ID
   */
  async getById(id: string, projectId: string): Promise<SyncJobDto | null> {
    const job = await this.syncJobRepo.findOne({
      where: { id, projectId },
    });

    return job ? this.toDto(job) : null;
  }

  /**
   * Get sync jobs for an integration
   */
  async getByIntegration(
    integrationId: string,
    projectId: string,
    limit = 10
  ): Promise<SyncJobDto[]> {
    const jobs = await this.syncJobRepo.find({
      where: { integrationId, projectId },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return jobs.map((j) => this.toDto(j));
  }

  /**
   * Get the latest sync job for an integration
   */
  async getLatestForIntegration(
    integrationId: string,
    projectId: string
  ): Promise<SyncJobDto | null> {
    const job = await this.syncJobRepo.findOne({
      where: { integrationId, projectId },
      order: { createdAt: 'DESC' },
    });

    return job ? this.toDto(job) : null;
  }

  /**
   * Cancel a running sync job
   */
  async cancel(id: string, projectId: string): Promise<SyncJobDto> {
    const job = await this.syncJobRepo.findOne({
      where: { id, projectId },
    });

    if (!job) {
      throw new NotFoundException(`Sync job ${id} not found`);
    }

    if (job.status !== 'pending' && job.status !== 'running') {
      // Job already completed/failed/cancelled
      return this.toDto(job);
    }

    job.status = 'cancelled';
    job.completedAt = new Date();
    job.logs.push({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: 'Sync job cancelled by user',
    });

    await this.syncJobRepo.save(job);

    // Emit event
    this.eventsService.emitUpdated('sync_job', job.id, projectId, {
      status: 'cancelled',
    });

    return this.toDto(job);
  }

  /**
   * Create a logger callback that adds logs to the job
   */
  private createJobLogger(
    job: DataSourceSyncJob
  ): (
    level: SyncJobLogEntry['level'],
    message: string,
    details?: Record<string, any>
  ) => void {
    return (level, message, details) => {
      this.addLog(job, level, message, details);
      // Also log to server logs for debugging
      if (level === 'error') {
        this.logger.error(`[Job ${job.id}] ${message}`, details);
      } else if (level === 'warn') {
        this.logger.warn(`[Job ${job.id}] ${message}`);
      } else {
        this.logger.debug(`[Job ${job.id}] ${message}`);
      }
    };
  }

  /**
   * Run a sync job (called internally)
   */
  private async runSyncJob(jobId: string): Promise<void> {
    const job = await this.syncJobRepo.findOne({ where: { id: jobId } });
    if (!job) return;

    // Check if cancelled before starting
    if (job.status === 'cancelled') return;

    // Create a logger for this job
    const jobLogger = this.createJobLogger(job);

    try {
      // Update status to running
      job.status = 'running';
      job.startedAt = new Date();
      job.currentPhase = 'initializing';
      job.statusMessage = 'Starting sync...';
      jobLogger('info', 'Sync job started', {
        integrationId: job.integrationId,
        projectId: job.projectId,
        triggerType: job.triggerType,
      });
      await this.syncJobRepo.save(job);

      this.emitProgress(job);

      // Get the integration with decrypted config
      jobLogger('debug', 'Loading integration configuration...');
      const integration = await this.integrationRepo.findOne({
        where: { id: job.integrationId },
      });

      if (!integration) {
        throw new Error('Integration not found');
      }

      jobLogger('debug', 'Integration loaded', {
        name: integration.name,
        providerType: integration.providerType,
        lastSyncedAt: integration.lastSyncedAt?.toISOString() || 'never',
      });

      let config: Record<string, any> = {};
      if (integration.configEncrypted) {
        jobLogger('debug', 'Decrypting integration configuration...');
        config = await this.encryption.decrypt(integration.configEncrypted);
        jobLogger('debug', 'Configuration decrypted successfully');
      }

      // For Google Drive, merge folder selections from sync options if provided
      // This allows manual sync to override saved folder configuration
      if (
        integration.providerType === 'google_drive' &&
        job.syncOptions?.selectedFolders
      ) {
        config = {
          ...config,
          selectedFolders: job.syncOptions.selectedFolders,
          excludedFolders: job.syncOptions.excludedFolders || [],
          folderMode: 'specific',
        };
        jobLogger(
          'debug',
          'Applied folder selection override from sync options',
          {
            selectedFolders: job.syncOptions.selectedFolders.length,
            excludedFolders: job.syncOptions.excludedFolders?.length || 0,
          }
        );
      }

      // Get the provider
      const provider = this.providerRegistry.getProvider(
        integration.providerType
      );
      if (!provider) {
        throw new Error(`Provider ${integration.providerType} not found`);
      }
      jobLogger('debug', `Using provider: ${integration.providerType}`);

      const syncOptions: SyncOptions = {
        ...job.syncOptions,
        // Pass the logger to the provider
        logger: jobLogger,
      };

      const since =
        syncOptions.incrementalOnly !== false && integration.lastSyncedAt
          ? integration.lastSyncedAt
          : new Date(0);

      jobLogger('debug', 'Sync parameters', {
        incrementalOnly: syncOptions.incrementalOnly !== false,
        since: since.toISOString(),
        limit: syncOptions.limit,
        filters: syncOptions.filters,
      });

      // Check if provider supports the new sync method (with batch loop)
      // This method handles duplicate detection internally and ensures we get
      // the requested number of NEW items, not just fetch N and skip duplicates
      if (typeof provider.sync === 'function') {
        jobLogger('info', 'Using optimized sync method with batch loop', {
          providerType: integration.providerType,
        });

        job.currentPhase = 'syncing';
        job.statusMessage = 'Syncing items...';
        await this.syncJobRepo.save(job);
        this.emitProgress(job);

        const result = await provider.sync(
          config,
          integration.projectId,
          integration.id,
          since,
          syncOptions
        );

        job.totalItems =
          result.totalImported + result.totalSkipped + result.totalFailed;
        job.processedItems = job.totalItems;
        job.successfulItems = result.totalImported;
        job.skippedItems = result.totalSkipped;
        job.failedItems = result.totalFailed;
        job.documentIds = result.documentIds;

        // Log any errors
        for (const err of result.errors) {
          jobLogger('error', `Failed to import item: ${err.itemId}`, {
            itemId: err.itemId,
            error: err.error,
          });
        }

        // Complete the job
        const duration = job.startedAt
          ? Math.round((Date.now() - job.startedAt.getTime()) / 1000)
          : 0;
        job.status = 'completed';
        job.completedAt = new Date();
        job.currentPhase = 'completed';
        job.statusMessage = `Sync completed: ${job.successfulItems} imported, ${job.skippedItems} skipped, ${job.failedItems} failed`;
        jobLogger('info', 'Sync job completed successfully', {
          duration: `${duration}s`,
          successfulItems: job.successfulItems,
          skippedItems: job.skippedItems,
          failedItems: job.failedItems,
          documentCount: result.documentIds.length,
        });
        await this.syncJobRepo.save(job);
        this.emitProgress(job);

        // Update integration's last synced timestamp
        await this.integrationRepo.update(
          { id: integration.id },
          {
            lastSyncedAt: new Date(),
            nextSyncAt:
              integration.syncMode === 'recurring' &&
              integration.syncIntervalMinutes
                ? new Date(
                    Date.now() + integration.syncIntervalMinutes * 60 * 1000
                  )
                : null,
            status: 'active',
            errorMessage: null,
            errorCount: 0,
          }
        );

        this.logger.log(
          `Sync job ${jobId} completed: ${job.successfulItems} imported`
        );
        return;
      }

      // Fallback to legacy flow: getNewItems + import
      // Phase 1: Discover items
      job.currentPhase = 'discovering';
      job.statusMessage = 'Discovering items to sync...';
      jobLogger('info', 'Phase 1: Discovering items to sync');
      await this.syncJobRepo.save(job);
      this.emitProgress(job);

      const items = await provider.getNewItems(config, since, syncOptions);

      job.totalItems = items.length;
      job.statusMessage = `Found ${items.length} items to sync`;
      jobLogger('info', `Discovery complete: found ${items.length} items`, {
        itemCount: items.length,
      });
      await this.syncJobRepo.save(job);
      this.emitProgress(job);

      if (items.length === 0) {
        job.status = 'completed';
        job.completedAt = new Date();
        job.currentPhase = 'completed';
        job.statusMessage = 'No new items to sync';
        jobLogger('info', 'Sync completed - no new items to sync');
        await this.syncJobRepo.save(job);
        this.emitProgress(job);
        return;
      }

      // Phase 2: Import items
      job.currentPhase = 'importing';
      job.statusMessage = `Importing ${items.length} items...`;
      jobLogger('info', `Phase 2: Starting import of ${items.length} items`);
      await this.syncJobRepo.save(job);
      this.emitProgress(job);

      // Import in batches to track progress
      const batchSize = 5; // Smaller batch size for better progress tracking
      const documentIds: string[] = [];
      const importTimeout = 60000; // 60 second timeout per batch

      jobLogger('debug', 'Starting batch import', {
        totalItems: items.length,
        batchSize,
        totalBatches: Math.ceil(items.length / batchSize),
      });

      for (let i = 0; i < items.length; i += batchSize) {
        // Check if cancelled
        const currentJob = await this.syncJobRepo.findOne({
          where: { id: jobId },
        });
        if (currentJob?.status === 'cancelled') {
          jobLogger('warn', 'Sync cancelled by user');
          return;
        }

        const batch = items.slice(i, Math.min(i + batchSize, items.length));
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(items.length / batchSize);

        jobLogger('info', `Processing batch ${batchNum}/${totalBatches}`, {
          batchNum,
          totalBatches,
          batchSize: batch.length,
          items: batch.map((item) => ({
            id: item.id,
            subject: item.metadata?.subject,
          })),
        });

        this.logger.log(
          `Processing batch ${batchNum}/${totalBatches} (${batch.length} items) for job ${jobId}`
        );

        try {
          // Add timeout to prevent hanging
          const result = await Promise.race([
            provider.import(
              config,
              batch,
              integration.projectId,
              integration.id
            ),
            new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `Import batch ${batchNum} timed out after ${importTimeout}ms`
                    )
                  ),
                importTimeout
              )
            ),
          ]);

          job.processedItems += batch.length;
          job.successfulItems += result.totalImported;
          job.failedItems += result.totalFailed;
          job.skippedItems += result.totalSkipped;
          documentIds.push(...result.documentIds);

          jobLogger('info', `Batch ${batchNum}/${totalBatches} completed`, {
            imported: result.totalImported,
            skipped: result.totalSkipped,
            failed: result.totalFailed,
            documentIds: result.documentIds,
          });

          this.logger.log(
            `Batch ${batchNum}/${totalBatches} completed: ${result.totalImported} imported, ${result.totalSkipped} skipped, ${result.totalFailed} failed`
          );

          // Log any errors
          for (const err of result.errors) {
            jobLogger('error', `Failed to import item: ${err.itemId}`, {
              itemId: err.itemId,
              error: err.error,
            });
          }

          job.statusMessage = `Imported ${job.processedItems}/${job.totalItems} items`;
          await this.syncJobRepo.save(job);
          this.emitProgress(job);
        } catch (err: any) {
          this.logger.error(
            `Batch ${batchNum}/${totalBatches} failed for job ${jobId}: ${err.message}`
          );
          jobLogger('error', `Batch ${batchNum} import failed`, {
            batchNum,
            error: err.message,
            stack: err.stack,
          });
          job.processedItems += batch.length;
          job.failedItems += batch.length;
          await this.syncJobRepo.save(job);
          this.emitProgress(job);
        }
      }

      // Phase 3: Complete
      const duration = job.startedAt
        ? Math.round((Date.now() - job.startedAt.getTime()) / 1000)
        : 0;
      job.status = 'completed';
      job.completedAt = new Date();
      job.currentPhase = 'completed';
      job.documentIds = documentIds;
      job.statusMessage = `Sync completed: ${job.successfulItems} imported, ${job.skippedItems} skipped, ${job.failedItems} failed`;
      jobLogger('info', 'Sync job completed successfully', {
        duration: `${duration}s`,
        successfulItems: job.successfulItems,
        skippedItems: job.skippedItems,
        failedItems: job.failedItems,
        documentCount: documentIds.length,
      });
      await this.syncJobRepo.save(job);
      this.emitProgress(job);

      // Update integration's last synced timestamp
      await this.integrationRepo.update(
        { id: integration.id },
        {
          lastSyncedAt: new Date(),
          nextSyncAt:
            integration.syncMode === 'recurring' &&
            integration.syncIntervalMinutes
              ? new Date(
                  Date.now() + integration.syncIntervalMinutes * 60 * 1000
                )
              : null,
          status: 'active',
          errorMessage: null,
          errorCount: 0,
        }
      );

      this.logger.log(
        `Sync job ${jobId} completed: ${job.successfulItems} imported`
      );
    } catch (err: any) {
      this.logger.error(`Sync job ${jobId} failed: ${err.message}`, err.stack);

      job.status = 'failed';
      job.completedAt = new Date();
      job.errorMessage = err.message;
      job.errorDetails = { stack: err.stack };
      job.statusMessage = `Sync failed: ${err.message}`;
      jobLogger('error', `Sync job failed: ${err.message}`, {
        error: err.message,
        stack: err.stack,
      });
      await this.syncJobRepo.save(job);
      this.emitProgress(job);

      // Update integration error status
      await this.integrationRepo.update(
        { id: job.integrationId },
        {
          status: 'error',
          errorMessage: err.message,
          lastErrorAt: new Date(),
          errorCount: () => 'error_count + 1',
        }
      );
    }
  }

  /**
   * Add a log entry to a job
   */
  private addLog(
    job: DataSourceSyncJob,
    level: SyncJobLogEntry['level'],
    message: string,
    details?: Record<string, any>
  ): void {
    job.logs.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
    });

    // Keep only the last 100 logs
    if (job.logs.length > 100) {
      job.logs = job.logs.slice(-100);
    }
  }

  /**
   * Emit a progress event via WebSocket
   */
  private emitProgress(job: DataSourceSyncJob): void {
    try {
      this.eventsService.emitUpdated('sync_job', job.id, job.projectId, {
        status: job.status,
        totalItems: job.totalItems,
        processedItems: job.processedItems,
        successfulItems: job.successfulItems,
        failedItems: job.failedItems,
        skippedItems: job.skippedItems,
        currentPhase: job.currentPhase,
        statusMessage: job.statusMessage,
      });
    } catch (err) {
      // Don't fail if events service is unavailable
      this.logger.debug(`Failed to emit sync progress event: ${err}`);
    }
  }

  /**
   * Convert entity to DTO
   */
  private toDto(job: DataSourceSyncJob): SyncJobDto {
    return {
      id: job.id,
      integrationId: job.integrationId,
      status: job.status,
      totalItems: job.totalItems,
      processedItems: job.processedItems,
      successfulItems: job.successfulItems,
      failedItems: job.failedItems,
      skippedItems: job.skippedItems,
      currentPhase: job.currentPhase,
      statusMessage: job.statusMessage,
      documentIds: job.documentIds,
      logs: job.logs,
      errorMessage: job.errorMessage,
      triggerType: job.triggerType,
      configurationId: job.configurationId,
      configurationName: job.configurationName,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }
}
