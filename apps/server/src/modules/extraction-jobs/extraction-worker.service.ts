import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { trace, SpanStatusCode, Tracer } from '@opentelemetry/api';
import { AppConfigService } from '../../common/config/config.service';
import { DatabaseService } from '../../common/database/database.service';
import { ExtractionJobService } from './extraction-job.service';
import { ExtractionLoggerService } from './extraction-logger.service';
import { LLMProviderFactory } from './llm/llm-provider.factory';
import { RateLimiterService } from './rate-limiter.service';
import { ConfidenceScorerService } from './confidence-scorer.service';
import { EntityLinkingService } from './entity-linking.service';
import { GraphService } from '../graph/graph.service';
import { GraphVectorSearchService } from '../graph/graph-vector-search.service';
import { DocumentsService } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ExtractionJobDto } from './dto/extraction-job.dto';
import type {
  ExtractionResult,
  ExistingEntityContext,
} from './llm/llm-provider.interface';
import { TemplatePackService } from '../template-packs/template-pack.service';
import { MonitoringLoggerService } from '../monitoring/monitoring-logger.service';
import { LangfuseService } from '../langfuse/langfuse.service';
import { VerificationService } from '../verification/verification.service';
import type { LangfuseSpanClient } from 'langfuse-node';
import {
  ChunkerService,
  ChunkerConfig,
} from '../../common/utils/chunker.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { ExtractionContextService } from './extraction-context.service';
import { ObjectChunksService } from '../object-refinement/object-chunks.service';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

type TimelineEventStatus = 'success' | 'error' | 'info' | 'warning';

interface TimelineEvent {
  step: string;
  status: TimelineEventStatus;
  timestamp: string;
  duration_ms?: number;
  message?: string;
  metadata?: Record<string, any>;
}

type EntityOutcome = 'created' | 'merged' | 'skipped' | 'rejected' | 'failed';

interface BuildDebugInfoArgs {
  job: ExtractionJobDto;
  startTime: number;
  durationMs: number;
  timeline: TimelineEvent[];
  providerName: string;
  extractionResult?: ExtractionResult | null;
  outcomeCounts?: Record<EntityOutcome, number>;
  createdObjectIds?: string[];
  rejectedCount?: number;
  reviewRequiredCount?: number;
  errorMessage?: string;
  organizationId?: string | null;
  /** Confidence thresholds used for this extraction */
  thresholds?: {
    min: number;
    review: number;
    autoAccept: number;
    /** Whether thresholds came from job config vs server defaults */
    source: {
      min: 'job_config' | 'server_default';
      review: 'job_config' | 'server_default';
      autoAccept: 'job_config' | 'server_default';
    };
  };
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Extraction Worker Service
 *
 * Background worker that:
 * 1. Polls for pending extraction jobs
 * 2. Loads source documents/content
 * 3. Calls LLM provider to extract entities
 * 4. Creates graph objects from extracted entities
 * 5. Updates job status with results
 *
 * Follows the same pattern as EmbeddingWorkerService.
 */
@Injectable()
export class ExtractionWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExtractionWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private currentBatch: Promise<void> | null = null;

  // In-memory metrics (reset on restart)
  private processedCount = 0;
  private successCount = 0;
  private failureCount = 0;

  // OpenTelemetry tracer for creating parent spans
  private readonly tracer: Tracer = trace.getTracer('extraction-worker');

  constructor(
    private readonly config: AppConfigService,
    private readonly db: DatabaseService,
    private readonly jobService: ExtractionJobService,
    private readonly extractionLogger: ExtractionLoggerService,
    private readonly llmFactory: LLMProviderFactory,
    private readonly rateLimiter: RateLimiterService,
    private readonly confidenceScorer: ConfidenceScorerService,
    private readonly entityLinking: EntityLinkingService,
    private readonly graphService: GraphService,
    private readonly documentsService: DocumentsService,
    private readonly notificationsService: NotificationsService,
    private readonly templatePacks: TemplatePackService,
    private readonly monitoringLogger: MonitoringLoggerService,
    private readonly langfuseService: LangfuseService,
    private readonly chunkerService: ChunkerService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly vectorSearchService: GraphVectorSearchService,
    private readonly extractionContextService: ExtractionContextService,
    private readonly verificationService: VerificationService,
    private readonly objectChunksService: ObjectChunksService
  ) {}

  /**
   * Counter for step indexing within a job
   * Reset for each job processing
   */
  private stepCounter = 0;

  /**
   * Get organization ID from the job's project
   * Since organization_id has been removed from extraction jobs,
   * we derive it from the project relationship
   */
  private async getOrganizationId(
    job: ExtractionJobDto
  ): Promise<string | null> {
    if (!job.project_id) {
      return null;
    }

    try {
      const result = await this.db.query<{ organization_id: string }>(
        'SELECT organization_id FROM kb.projects WHERE id = $1',
        [job.project_id]
      );
      return result.rows[0]?.organization_id ?? null;
    } catch (error) {
      this.logger.error(
        `Failed to fetch organization ID for project ${
          job.project_id
        }: ${toErrorMessage(error)}`
      );
      return null;
    }
  }

  /**
   * Get project-level extraction configuration.
   * Returns the extractionConfig from the project, or null if not set.
   * Also includes entity_similarity_threshold from auto_extract_config.
   */
  private async getProjectExtractionConfig(projectId: string): Promise<{
    chunkSize?: number;
    method?: 'function_calling' | 'responseSchema';
    timeoutSeconds?: number;
    entitySimilarityThreshold?: number;
  } | null> {
    try {
      const result = await this.db.query<{
        extraction_config: any;
        auto_extract_config: any;
      }>(
        'SELECT extraction_config, auto_extract_config FROM kb.projects WHERE id = $1',
        [projectId]
      );
      const row = result.rows[0];
      if (!row) return null;

      // Merge extraction_config with entity_similarity_threshold from auto_extract_config
      const config = row.extraction_config ?? {};
      const autoExtractConfig = row.auto_extract_config ?? {};

      return {
        ...config,
        entitySimilarityThreshold:
          autoExtractConfig.entity_similarity_threshold,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to fetch extraction config for project ${projectId}: ${toErrorMessage(
          error
        )}`
      );
      return null;
    }
  }

  async onModuleInit() {
    // Only start if extraction worker is enabled and DB is online
    if (!this.db.isOnline()) {
      this.logger.warn(
        'Database offline at worker init; extraction worker idle.'
      );
      return;
    }

    if (!this.config.extractionWorkerEnabled) {
      this.logger.log(
        'Extraction worker disabled (EXTRACTION_WORKER_ENABLED=false)'
      );
      return;
    }

    if (!this.llmFactory.isAvailable()) {
      this.logger.warn(
        'Extraction worker disabled: no LLM provider configured (set GCP_PROJECT_ID)'
      );
      return;
    }

    // Recover orphaned jobs from previous server crash/restart
    await this.recoverOrphanedJobs();

    this.start();
  }

  async onModuleDestroy() {
    await this.stop();
  }

  /**
   * Recover orphaned jobs that were stuck in 'running' status due to server restart
   *
   * Jobs are considered orphaned if:
   * - Status is 'running'
   * - Updated more than 5 minutes ago (likely interrupted)
   *
   * These jobs are reset to 'queued' so they can be retried.
   */
  private async recoverOrphanedJobs(): Promise<void> {
    try {
      const orphanThresholdMinutes = 5;

      // Phase 6: organization_id removed from object_extraction_jobs table
      // We now derive organization_id from project_id via projects table join
      const result = await this.db.query<{
        id: string;
        source_type: string;
        started_at: string | null;
        project_id: string | null;
      }>(
        `SELECT id,
                        source_type,
                        started_at,
                        project_id
                 FROM kb.object_extraction_jobs
                 WHERE status = 'running'
                   AND updated_at < NOW() - INTERVAL '${orphanThresholdMinutes} minutes'`
      );

      if (!result.rowCount) {
        this.logger.log('No orphaned extraction jobs found - all clear');
        return;
      }

      const recovered: string[] = [];

      for (const row of result.rows) {
        const projectId = row.project_id ?? null;

        // Derive organization_id from project for tenant context
        let orgId: string | null = null;
        if (projectId) {
          const orgResult = await this.db.query<{ organization_id: string }>(
            'SELECT organization_id FROM kb.projects WHERE id = $1',
            [projectId]
          );
          orgId = orgResult.rows[0]?.organization_id ?? null;
        }

        if (!orgId || !projectId) {
          this.logger.warn(
            `Skipping orphaned job ${row.id} (${row.source_type}) - missing organization/project context (org=${orgId}, project=${projectId})`
          );
          continue;
        }

        try {
          const updateResult = await this.db.runWithTenantContext(
            projectId,
            async () =>
              this.db.query<{ id: string }>(
                `UPDATE kb.object_extraction_jobs
                             SET status = 'queued',
                                 started_at = NULL,
                                 updated_at = NOW(),
                                 error_message = CASE
                                  WHEN error_message ILIKE '%has been reset to queued.%' THEN error_message
                                      ELSE COALESCE(error_message || E'\n\n', '') ||
                                          'Job was interrupted by server restart and has been reset to queued.'
                                 END
                             WHERE id = $1
                               AND status = 'running'
                             RETURNING id`,
                [row.id]
              )
          );

          if (updateResult.rowCount && updateResult.rowCount > 0) {
            recovered.push(row.id);
            const startedAt = row.started_at
              ? ` (started ${row.started_at})`
              : '';
            this.logger.warn(
              `Recovered orphaned extraction job ${row.id} (${row.source_type})${startedAt}`
            );
          } else {
            this.logger.warn(
              `Recover attempt skipped job ${row.id} (${row.source_type}) - no rows updated`
            );
          }
        } catch (error) {
          this.logger.error(`Failed to recover orphaned job ${row.id}`, error);
        }
      }

      if (recovered.length > 0) {
        this.logger.warn(
          `Recovered ${
            recovered.length
          } orphaned extraction job(s) from 'running' to 'queued': ${recovered.join(
            ', '
          )}`
        );
      } else {
        this.logger.log(
          'No orphaned extraction jobs required updates - all clear'
        );
      }
    } catch (error) {
      this.logger.error('Failed to recover orphaned jobs', error);
      // Don't throw - allow worker to start anyway
    }
  }

  /**
   * Start the polling loop
   */
  start(intervalMs?: number) {
    if (this.timer) {
      this.logger.warn('Worker already started');
      return;
    }

    const pollInterval =
      intervalMs || this.config.extractionWorkerPollIntervalMs;
    this.running = true;

    const tick = async () => {
      if (!this.running) return;

      try {
        this.currentBatch = this.processBatch();
        await this.currentBatch;
      } catch (error) {
        this.logger.error('processBatch failed', error);
      } finally {
        this.currentBatch = null;
      }

      this.timer = setTimeout(tick, pollInterval);
    };

    this.timer = setTimeout(tick, pollInterval);
    this.logger.log(
      `Extraction worker started (interval=${pollInterval}ms, batch=${this.config.extractionWorkerBatchSize})`
    );
  }

  /**
   * Stop the polling loop
   */
  async stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = false;

    // Wait for current batch to finish to avoid orphaned promises
    if (this.currentBatch) {
      this.logger.debug(
        'Waiting for current batch to complete before stopping...'
      );
      try {
        await this.currentBatch;
      } catch (error) {
        this.logger.warn('Current batch failed during shutdown', error);
      }
    }

    this.logger.log('Extraction worker stopped');
  }

  /**
   * Process a batch of pending extraction jobs
   *
   * Public for testing purposes
   */
  async processBatch() {
    return this.tracer.startActiveSpan(
      'extraction-worker.processBatch',
      async (batchSpan) => {
        try {
          const batchSize = this.config.extractionWorkerBatchSize;
          const jobs = await this.jobService.dequeueJobs(batchSize);

          batchSpan.setAttribute('batch.config_size', batchSize);
          batchSpan.setAttribute('batch.actual_size', jobs.length);

          if (jobs.length === 0) {
            batchSpan.setAttribute('batch.empty', true);
            batchSpan.setStatus({ code: SpanStatusCode.OK });
            return;
          }

          this.logger.log(`Processing batch of ${jobs.length} extraction jobs`);

          for (const job of jobs) {
            await this.processJob(job);
          }

          batchSpan.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          batchSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message,
          });
          batchSpan.recordException(err);
          throw error;
        } finally {
          batchSpan.end();
        }
      }
    );
  }

  /**
   * Process a single extraction job
   */
  private async processJob(job: ExtractionJobDto) {
    return this.tracer.startActiveSpan(
      'extraction-worker.processJob',
      {
        attributes: {
          'job.id': job.id,
          'job.source_type': job.source_type,
          'job.source_id': job.source_id || '',
          'job.project_id': job.project_id,
        },
      },
      async (jobSpan) => {
        const startTime = Date.now();
        this.logger.log(
          `Processing extraction job ${job.id} (source: ${job.source_type})`
        );

        // Fetch organization_id once for reuse throughout the method
        const organizationId = await this.getOrganizationId(job);

        // Get confidence thresholds early
        // - minThreshold: Below this, entities are rejected
        // - reviewThreshold: Between min and auto, entities are "draft" status (needs review)
        // - autoThreshold: At or above this, entities are "accepted" status
        //
        // IMPORTANT: The UI's confidence_threshold serves as BOTH the minimum rejection threshold
        // AND the review threshold. Entities below this are REJECTED, not just marked for review.
        // The UI's auto_accept_threshold is the threshold for auto-accepting as final.
        const minThresholdFromConfig =
          job.extraction_config?.min_threshold !== undefined;
        const draftThresholdFromConfig =
          job.extraction_config?.confidence_threshold !== undefined;
        const autoThresholdFromConfig =
          job.extraction_config?.auto_accept_threshold !== undefined;

        // Minimum threshold for rejection:
        // 1. Use explicit min_threshold if provided
        // 2. Otherwise, use confidence_threshold from job config (user's expectation is this rejects low-confidence)
        // 3. Fall back to server default (EXTRACTION_CONFIDENCE_THRESHOLD_MIN)
        const minThreshold = minThresholdFromConfig
          ? job.extraction_config.min_threshold
          : draftThresholdFromConfig
          ? job.extraction_config.confidence_threshold
          : this.config.extractionConfidenceThresholdMin;

        // Draft threshold - entities below this get extra review marking
        // This comes from the UI's "confidence_threshold" slider
        const reviewThreshold = draftThresholdFromConfig
          ? job.extraction_config.confidence_threshold
          : this.config.extractionConfidenceThresholdReview;

        // Auto-accept threshold - at or above this, entities are marked "accepted"
        const autoThreshold = autoThresholdFromConfig
          ? job.extraction_config.auto_accept_threshold
          : this.config.extractionConfidenceThresholdAuto;

        // Build thresholds object for debug info
        // Note: min threshold can come from explicit min_threshold OR confidence_threshold
        const minSourceIsJobConfig =
          minThresholdFromConfig || draftThresholdFromConfig;
        const thresholdsInfo = {
          min: minThreshold,
          review: reviewThreshold,
          autoAccept: autoThreshold,
          source: {
            min: (minSourceIsJobConfig ? 'job_config' : 'server_default') as
              | 'job_config'
              | 'server_default',
            review: (draftThresholdFromConfig
              ? 'job_config'
              : 'server_default') as 'job_config' | 'server_default',
            autoAccept: (autoThresholdFromConfig
              ? 'job_config'
              : 'server_default') as 'job_config' | 'server_default',
          },
        };

        this.logger.log(
          `Extraction thresholds for job ${job.id}: ` +
            `min=${(minThreshold * 100).toFixed(0)}% (${
              thresholdsInfo.source.min
            }), ` +
            `review=${(reviewThreshold * 100).toFixed(0)}% (${
              thresholdsInfo.source.review
            }), ` +
            `autoAccept=${(autoThreshold * 100).toFixed(0)}% (${
              thresholdsInfo.source.autoAccept
            })`
        );

        // Create LangFuse trace
        const traceId = this.langfuseService.createJobTrace(
          job.id,
          {
            name: `Extraction Job ${job.id}`,
            source_type: job.source_type,
            project_id: job.project_id,
            organization_id: organizationId,
          },
          undefined, // environment (use default)
          'extraction' // traceType for filtering
        );

        // Log to monitoring system
        await this.monitoringLogger.logProcessEvent({
          processId: job.id,
          processType: 'extraction_job',
          level: 'info',
          message: 'Extraction job started',
          projectId: job.project_id,
          metadata: {
            source_type: job.source_type,
            source_id: job.source_id,
          },
          langfuseTraceId: traceId || undefined,
        });

        // Reset step counter for this job
        this.stepCounter = 0;

        // Log the start of the job with its configuration
        await this.extractionLogger.logStep({
          extractionJobId: job.id,
          stepIndex: this.stepCounter++,
          operationType: 'validation',
          operationName: 'job_started',
          status: 'completed',
          inputData: {
            source_type: job.source_type,
            source_id: job.source_id,
            project_id: job.project_id,
          },
        });

        const timeline: TimelineEvent[] = [];
        let providerName = this.llmFactory.getProviderName();
        let extractionResult: ExtractionResult | null = null;

        const pushTimelineEvent = (
          step: string,
          status: TimelineEventStatus,
          details?: {
            message?: string;
            metadata?: Record<string, any>;
            durationMs?: number;
          }
        ) => {
          const event: TimelineEvent = {
            step,
            status,
            timestamp: new Date().toISOString(),
          };

          if (details?.durationMs !== undefined) {
            event.duration_ms = Math.max(details.durationMs, 0);
          }

          if (details?.message) {
            event.message = details.message;
          }

          if (details?.metadata && Object.keys(details.metadata).length > 0) {
            event.metadata = details.metadata;
          }

          timeline.push(event);

          const durationText =
            details?.durationMs !== undefined
              ? ` duration=${details.durationMs}ms`
              : '';
          const messageText = details?.message
            ? ` message=${details.message}`
            : '';
          const metadataText =
            details?.metadata && Object.keys(details.metadata).length > 0
              ? ` metadata=${JSON.stringify(details.metadata)}`
              : '';

          this.logger.debug(
            `[TIMELINE] Job ${job.id} step=${step} status=${status}${durationText}${messageText}${metadataText}`
          );
        };

        /**
         * Map to track active spans by step name for hierarchical nesting
         */
        const activeSpans = new Map<string, LangfuseSpanClient | null>();

        /**
         * Begin a timeline step with optional Langfuse span tracking.
         * Returns a function to complete the step.
         */
        const beginTimelineStep = (
          step: string,
          metadata?: Record<string, any>
        ): ((
          status: TimelineEventStatus,
          details?: { message?: string; metadata?: Record<string, any> }
        ) => void) & { spanId?: string } => {
          const startedAt = Date.now();

          // Create Langfuse span for this step
          const span = traceId
            ? this.langfuseService.createSpan(traceId, step, metadata)
            : null;

          // Store the span for potential child observations
          activeSpans.set(step, span);

          const endStep = (
            status: TimelineEventStatus,
            details?: { message?: string; metadata?: Record<string, any> }
          ) => {
            // Push timeline event
            pushTimelineEvent(step, status, {
              durationMs: Date.now() - startedAt,
              message: details?.message,
              metadata: {
                ...(metadata ?? {}),
                ...(details?.metadata ?? {}),
              },
            });

            // End Langfuse span
            if (span) {
              this.langfuseService.endSpan(
                span,
                details?.metadata,
                status === 'error' ? 'error' : 'success',
                details?.message
              );
            }

            // Remove from active spans
            activeSpans.delete(step);
          };

          // Attach span ID as property for accessing in llm_extract step
          (endStep as any).spanId = span?.id;

          return endStep as ((
            status: TimelineEventStatus,
            details?: { message?: string; metadata?: Record<string, any> }
          ) => void) & { spanId?: string };
        };

        pushTimelineEvent('job_started', 'info', {
          metadata: {
            source_type: job.source_type,
            project_id: job.project_id,
          },
        });

        try {
          // 1. Load document content and ensure chunks + embeddings exist
          const documentStep = beginTimelineStep('load_document', {
            source_id: job.source_id ?? null,
            source_type: job.source_type,
          });

          let documentContent: string | null = null;
          let documentChunks: string[] = [];
          let documentChunkIds: string[] = [];

          // For document sources, ensure chunks and embeddings are ready
          if (job.source_type === 'document' && job.source_id) {
            const readyResult = await this.ensureDocumentReady(
              job.source_id,
              job.project_id
            ).catch((error) => {
              const message = toErrorMessage(error);
              documentStep('error', { message });
              throw error;
            });

            if (!readyResult.success || !readyResult.content) {
              const message = 'Failed to prepare document (chunks/embeddings)';
              documentStep('error', { message });
              throw new Error(message);
            }

            documentContent = readyResult.content;
            documentChunks = readyResult.chunkTexts;
            documentChunkIds = readyResult.chunkIds;

            // Log chunk/embedding preparation details
            documentStep('success', {
              metadata: {
                character_count: documentContent.length,
                chunks_created: readyResult.chunksCreated,
                chunk_count: readyResult.chunkCount,
                embeddings_generated: readyResult.embeddingsGenerated,
              },
            });

            // Add timeline event for chunk/embedding preparation if chunks were created
            if (
              readyResult.chunksCreated ||
              readyResult.embeddingsGenerated > 0
            ) {
              pushTimelineEvent('ensure_chunks_embeddings', 'success', {
                metadata: {
                  chunks_created: readyResult.chunksCreated,
                  chunk_count: readyResult.chunkCount,
                  embeddings_generated: readyResult.embeddingsGenerated,
                },
              });
            }
          } else {
            // For non-document sources (manual, api), use the original method
            documentContent = await this.loadDocumentContent(job).catch(
              (error) => {
                const message = toErrorMessage(error);
                documentStep('error', { message });
                throw error;
              }
            );

            if (!documentContent) {
              const message = 'Failed to load document content';
              documentStep('error', { message });
              throw new Error(message);
            }

            // Create chunks on-the-fly for non-document sources
            // This ensures the relationship builder always has semantic chunks to work with
            const chunksWithMeta = this.chunkerService.chunkWithMetadata(
              documentContent,
              { strategy: 'paragraph' } // Use paragraph strategy for semantic boundaries
            );
            documentChunks = chunksWithMeta.map((c) => c.text);

            documentStep('success', {
              metadata: {
                character_count: documentContent.length,
                chunks_created: documentChunks.length,
              },
            });
          }

          // 2. Load extraction config (prompt + schemas) from template pack
          const promptStep = beginTimelineStep('load_prompt', {
            template_pack_strategy: this.config.extractionEntityLinkingStrategy,
          });

          const extractionConfig = await this.loadExtractionConfig(job).catch(
            (error: Error) => {
              const message = toErrorMessage(error);
              promptStep('error', { message });
              throw error;
            }
          );

          // Check if we have object schemas - the actual extraction prompt is built
          // by buildToolExtractionPrompt() in the LLM provider using these schemas.
          // The basePrompt is optional and just provides additional context.
          if (Object.keys(extractionConfig.objectSchemas).length === 0) {
            const message =
              'No extraction schemas configured for this project. Install a template pack with object type schemas.';
            promptStep('error', { message });
            throw new Error(message);
          }

          // Base prompt is optional - buildToolExtractionPrompt provides the core instructions
          const extractionPrompt = extractionConfig.prompt || '';
          const objectSchemas = extractionConfig.objectSchemas;
          const relationshipSchemas = extractionConfig.relationshipSchemas;

          promptStep('success', {
            metadata: {
              base_prompt_length: extractionPrompt.length,
              base_prompt_configured: extractionPrompt.length > 0,
              schema_count: Object.keys(objectSchemas).length,
              schema_types: Object.keys(objectSchemas),
              relationship_schema_count:
                Object.keys(relationshipSchemas).length,
              relationship_types: Object.keys(relationshipSchemas),
            },
          });

          // 3. Wait for rate limit capacity
          const estimatedTokens = this.estimateTokens(
            documentContent,
            extractionPrompt
          );
          const rateLimitStep = beginTimelineStep('rate_limit', {
            estimated_tokens: estimatedTokens,
          });

          const allowed = await this.rateLimiter.waitForCapacity(
            estimatedTokens,
            60000
          );

          if (!allowed) {
            const message = 'Rate limit exceeded, job will retry later';
            rateLimitStep('warning', {
              message,
            });
            throw new Error(message);
          }

          rateLimitStep('success', {
            metadata: {
              estimated_tokens: estimatedTokens,
            },
          });

          // 4. Call LLM provider to extract entities
          const resolveProviderStep = beginTimelineStep('resolve_llm_provider');
          const llmProvider = (() => {
            try {
              const provider = this.llmFactory.getProvider();
              providerName = provider.getName();
              resolveProviderStep('success', {
                metadata: { provider: providerName },
              });
              return provider;
            } catch (error) {
              const message = toErrorMessage(error);
              resolveProviderStep('error', { message });
              throw error;
            }
          })();

          // Derive allowed types from job config or fall back to template pack schema keys
          // This ensures LLM only extracts entity types defined in the template pack
          const allowedTypes = this.extractAllowedTypes(job, objectSchemas);

          // Fetch available tags for LLM to prefer existing tags
          const fetchTagsStep = beginTimelineStep('fetch_available_tags');
          let availableTags: string[] = [];
          try {
            const ctx = {
              orgId: organizationId,
              projectId: job.project_id,
            };
            availableTags = await this.graphService.getAllTags(ctx);
            fetchTagsStep('success', {
              metadata: { tags_count: availableTags.length },
            });
            this.logger.debug(
              `Fetched ${availableTags.length} available tags for extraction`
            );
          } catch (error) {
            const message = toErrorMessage(error);
            fetchTagsStep('warning', { message });
            this.logger.warn(
              `Failed to fetch available tags, proceeding without: ${message}`
            );
            // Don't throw - continue extraction without tags
          }

          // Load relevant existing entities using vector search for context-aware extraction
          // This helps the LLM recognize existing entities and avoid duplicates
          const loadContextStep = beginTimelineStep('load_existing_context');
          let existingEntities: ExistingEntityContext[] = [];
          try {
            const contextResult =
              await this.extractionContextService.loadRelevantEntities(
                documentContent,
                {
                  projectId: job.project_id,
                  entityTypes: allowedTypes,
                  limitPerType: 30, // Top 30 most similar per type
                  similarityThreshold: 0.5, // Only include if >50% similar
                  includeAllIfBelowCount: 50, // Load all if type has <50 entities
                }
              );

            existingEntities = contextResult.allEntities;

            loadContextStep('success', {
              metadata: {
                entities_loaded: existingEntities.length,
                search_method: contextResult.searchMethod,
                type_breakdown: contextResult.stats.typeBreakdown,
                avg_similarity:
                  contextResult.stats.averageSimilarity?.toFixed(2),
                duration_ms: contextResult.stats.searchDurationMs,
              },
            });

            this.logger.log(
              `Loaded ${existingEntities.length} existing entities as context (method: ${contextResult.searchMethod})`
            );
          } catch (error) {
            const message = toErrorMessage(error);
            loadContextStep('warning', { message });
            this.logger.warn(
              `Failed to load existing entity context, proceeding without: ${message}`
            );
            // Don't throw - continue extraction without existing entity context
          }

          const llmStep = beginTimelineStep('llm_extract', {
            provider: providerName,
            allowed_types: allowedTypes ?? null,
          });

          // Track LLM call timing for detailed logs
          const llmCallStartTime = Date.now();

          // Load project-level extraction config for timeout/chunk size settings
          const projectExtractionConfig = await this.getProjectExtractionConfig(
            job.project_id
          );

          // Create queued log entry for LLM call
          const llmLogId = await this.extractionLogger.logStep({
            extractionJobId: job.id,
            stepIndex: this.stepCounter++,
            operationType: 'llm_call',
            operationName: 'extract_entities',
            status: 'queued',
            inputData: {
              prompt: extractionPrompt,
              document_content: documentContent,
              content_length: documentContent.length,
              allowed_types: allowedTypes,
              schema_types: Object.keys(objectSchemas),
              available_tags: availableTags,
            },
            metadata: {
              provider: providerName,
              model: this.config.vertexAiModel,
            },
          });

          try {
            // Get extraction settings from job config (overrides) or project config (defaults)
            // Priority: job.extraction_config > projectExtractionConfig > server defaults
            const extractionMethod = (job.extraction_config
              ?.extraction_method || projectExtractionConfig?.method) as
              | 'responseSchema'
              | 'function_calling'
              | undefined;

            // Convert project timeout from seconds to milliseconds
            const timeoutMs = projectExtractionConfig?.timeoutSeconds
              ? projectExtractionConfig.timeoutSeconds * 1000
              : undefined;

            // Get batch size from project config (chunkSize is in chars)
            const batchSizeChars = projectExtractionConfig?.chunkSize;

            // Get entity similarity threshold from project config
            const similarityThreshold =
              projectExtractionConfig?.entitySimilarityThreshold;

            const result = await llmProvider.extractEntities(
              documentContent,
              extractionPrompt,
              {
                objectSchemas,
                relationshipSchemas,
                allowedTypes,
                availableTags,
                existingEntities: [], // Empty - deduplication via merge suggestions
                documentChunks,
                extractionMethod, // Pass per-job or project extraction method override
                timeoutMs, // Pass per-project timeout (converted from seconds to ms)
                batchSizeChars, // Pass per-project chunk size
                similarityThreshold, // Pass per-project entity similarity threshold
                context: {
                  jobId: job.id,
                  projectId: job.project_id,
                  traceId: traceId || undefined,
                  parentObservationId: (llmStep as any).spanId,
                },
              }
            );

            const llmCalls = Array.isArray(result.raw_response?.llm_calls)
              ? result.raw_response.llm_calls
              : null;

            const allCallsFailed =
              !!llmCalls &&
              llmCalls.length > 0 &&
              llmCalls.every((call: any) => call?.status === 'error');

            if (allCallsFailed) {
              const firstError = llmCalls.find((call: any) => call?.error) as
                | { error?: string; message?: string }
                | undefined;
              const errorMessage =
                firstError?.error ||
                firstError?.message ||
                'All LLM extraction calls failed';

              const fatalError = new Error(errorMessage);
              (
                fatalError as Error & { llmStepMetadata?: Record<string, any> }
              ).llmStepMetadata = {
                failed_calls: llmCalls.length,
              };
              throw fatalError;
            }

            extractionResult = result;

            // Update log entry with success
            await this.extractionLogger.updateLogStep(llmLogId, {
              status: 'completed',
              outputData: {
                entities_count: result.entities.length,
                entities: result.entities.map((e) => ({
                  type: e.type_name,
                  name: e.name,
                  properties: e.properties,
                })),
                discovered_types: result.discovered_types,
                raw_response: result.raw_response, // Full LLM response for inspection
                provider: providerName,
                model: this.config.vertexAiModel,
                prompt_tokens: result.usage?.prompt_tokens,
                completion_tokens: result.usage?.completion_tokens,
              },
              durationMs: Date.now() - llmCallStartTime,
              tokensUsed: result.usage?.total_tokens ?? undefined,
            });

            llmStep('success', {
              metadata: {
                entities: result.entities.length,
                discovered_types: result.discovered_types?.length ?? 0,
              },
            });
          } catch (error) {
            const message = toErrorMessage(error);
            const errorWithMeta = error as Error & {
              llmStepMetadata?: Record<string, any>;
              responseMetadata?: any;
            };
            const metadata = errorWithMeta.llmStepMetadata;
            const responseMetadata = errorWithMeta.responseMetadata;

            // Update log entry with error
            await this.extractionLogger.updateLogStep(llmLogId, {
              status: 'failed',
              errorMessage: message,
              errorStack: (error as Error).stack,
              durationMs: Date.now() - llmCallStartTime,
              outputData: responseMetadata
                ? {
                    llm_response_preview: responseMetadata.rawTextPreview,
                    response_length: responseMetadata.responseLength,
                    finish_reason: responseMetadata.finishReason,
                    extracted_json_preview:
                      responseMetadata.extractedJsonPreview,
                    parse_error: responseMetadata.parseError,
                    provider: providerName,
                  }
                : { provider: providerName },
            });

            llmStep('error', {
              message,
              metadata,
            });
            throw error;
          }

          // 5. Report actual token usage
          if (extractionResult && extractionResult.usage) {
            this.rateLimiter.reportActualUsage(
              estimatedTokens,
              extractionResult.usage.total_tokens
            );
            pushTimelineEvent('rate_limit_usage_reported', 'info', {
              metadata: {
                estimated_tokens: estimatedTokens,
                actual_tokens: extractionResult.usage.total_tokens,
              },
            });
          }

          if (!extractionResult) {
            throw new Error('LLM extraction produced no result');
          }

          // 5.5 Verify extracted entities against source text (3-tier cascade)
          // When using LangGraph pipeline, verification is already done in the pipeline nodes,
          // so we skip the separate verification step and use the pre-computed confidence.
          const isLangGraphPipeline =
            this.llmFactory.getPipelineMode() === 'langgraph';
          const verificationEnabled = this.config.extractionVerificationEnabled;
          const verificationResults = new Map<
            string,
            { verified: boolean; confidence: number; tier: number }
          >();

          // Only run separate verification for single_pass pipeline
          if (
            !isLangGraphPipeline &&
            verificationEnabled &&
            extractionResult.entities.length > 0
          ) {
            const verifyStep = beginTimelineStep('verification', {
              entity_count: extractionResult.entities.length,
            });

            try {
              // Check verification service health
              const health = await this.verificationService.checkHealth();
              this.logger.log(
                `Verification health: ${health.message} (T1: ${health.tier1Available}, T2: ${health.tier2Available}, T3: ${health.tier3Available})`
              );

              // Run batch verification
              const verifyRequest = {
                sourceText: documentContent,
                entities: extractionResult.entities.map((e) => ({
                  id: e.name, // Use name as ID for now
                  name: e.name,
                  type: e.type_name,
                  properties: e.properties as Record<
                    string,
                    string | number | boolean | null | undefined
                  >,
                })),
                jobId: job.id,
              };

              const verifyResponse = await this.verificationService.verifyBatch(
                verifyRequest
              );

              // Build lookup map for verification results
              for (const result of verifyResponse.results) {
                verificationResults.set(
                  result.entityName.toLowerCase().trim(),
                  {
                    verified: result.entityVerified,
                    confidence: result.overallConfidence,
                    tier: result.entityVerificationTier,
                  }
                );
              }

              this.logger.log(
                `Verification complete: ${verifyResponse.summary.verified} verified, ` +
                  `${verifyResponse.summary.rejected} rejected, ${verifyResponse.summary.uncertain} uncertain ` +
                  `(${verifyResponse.processingTimeMs}ms)`
              );

              verifyStep('success', {
                message: `Verified ${extractionResult.entities.length} entities`,
                metadata: {
                  verified: verifyResponse.summary.verified,
                  rejected: verifyResponse.summary.rejected,
                  uncertain: verifyResponse.summary.uncertain,
                  tier_usage: verifyResponse.summary.tierUsage,
                  processing_time_ms: verifyResponse.processingTimeMs,
                },
              });
            } catch (verifyError) {
              this.logger.warn(
                `Verification failed, continuing without verification: ${toErrorMessage(
                  verifyError
                )}`
              );
              verifyStep('warning', {
                message: `Verification failed: ${toErrorMessage(verifyError)}`,
              });
            }
          }

          const totalEntities = extractionResult.entities.length;
          let processedEntities = 0;
          let lastLoggedPercent = -1;

          const outcomeCounts: Record<EntityOutcome, number> = {
            created: 0,
            merged: 0,
            skipped: 0,
            rejected: 0,
            failed: 0,
          };

          // Track skip/fail reasons for better observability (similar to relationshipSkipReasons)
          const entitySkipReasons: Record<string, number> = {
            low_confidence: 0,
            entity_linking_skip: 0,
            duplicate_skip_strategy: 0,
            merge_failure_fallback: 0,
          };

          const entityFailReasons: Record<string, number> = {
            validation_error: 0,
            database_error: 0,
            unknown_error: 0,
          };

          // Detailed per-entity results for tracing (similar to relationshipDetails)
          const entityDetails: Array<{
            name: string;
            type: string;
            status: 'created' | 'merged' | 'skipped' | 'rejected' | 'failed';
            reason?: string;
            object_id?: string;
            confidence?: number;
            error?: string;
          }> = [];

          let rejectedCount = 0;

          const recordProgress = async (progressOutcome: EntityOutcome) => {
            if (totalEntities === 0) {
              return;
            }

            processedEntities += 1;
            outcomeCounts[progressOutcome] += 1;

            try {
              await this.jobService.updateProgress(
                job.id,
                processedEntities,
                totalEntities
              );
            } catch (progressUpdateError) {
              this.logger.warn(
                `Failed to update progress for job ${job.id} at ${processedEntities}/${totalEntities}`,
                progressUpdateError as Error
              );
            }

            const percentComplete = Math.round(
              (processedEntities / totalEntities) * 100
            );
            const shouldLogProgress =
              totalEntities <= 10 ||
              processedEntities === 1 ||
              processedEntities === totalEntities ||
              percentComplete >= lastLoggedPercent + 10;

            if (shouldLogProgress) {
              lastLoggedPercent = percentComplete;
              this.logger.log(
                `[PROGRESS] Job ${job.id}: ${processedEntities}/${totalEntities} (${percentComplete}%) entities processed (outcome=${progressOutcome})`
              );
            }
          };

          if (totalEntities > 0) {
            try {
              await this.jobService.updateProgress(job.id, 0, totalEntities);
              this.logger.log(
                `[PROGRESS] Job ${
                  job.id
                }: initialized progress tracking for ${totalEntities} entity${
                  totalEntities === 1 ? '' : 'ies'
                }`
              );
              pushTimelineEvent('progress_initialized', 'success', {
                metadata: {
                  total_entities: totalEntities,
                },
              });
            } catch (progressInitError) {
              this.logger.warn(
                `Failed to initialize progress tracking for job ${job.id}`,
                progressInitError as Error
              );
              pushTimelineEvent('progress_initialized', 'warning', {
                message: toErrorMessage(progressInitError),
              });
            }
          } else {
            this.logger.log(
              `Extraction job ${job.id} produced no entities to process`
            );
            pushTimelineEvent('progress_skipped', 'info', {
              message: 'No entities returned from extraction',
            });
          }

          // 6. Create graph objects from extracted entities
          const createdObjectIds: string[] = [];
          const reviewRequiredObjectIds: string[] = [];
          const strategy = this.config.extractionEntityLinkingStrategy;

          // Build batchEntityMap DURING object creation to ensure relationships
          // use the newly created object IDs, not older objects with similar names
          const batchEntityMap = new Map<string, string>();

          // Helper function to add entity name variants to the map
          const addToBatchEntityMap = (
            entityName: string,
            objectId: string
          ) => {
            // Add exact normalized name
            const normalizedName = entityName.toLowerCase().trim();
            if (!batchEntityMap.has(normalizedName)) {
              batchEntityMap.set(normalizedName, objectId);
            }
            // Also add without common prefixes/articles for fuzzy matching
            const withoutArticles = normalizedName
              .replace(/^(the|a|an)\s+/i, '')
              .trim();
            if (
              withoutArticles !== normalizedName &&
              !batchEntityMap.has(withoutArticles)
            ) {
              batchEntityMap.set(withoutArticles, objectId);
            }
          };

          const graphStep = beginTimelineStep('create_entities', {
            strategy,
          });

          for (const entity of extractionResult.entities) {
            let outcome:
              | 'created'
              | 'merged'
              | 'skipped'
              | 'rejected'
              | 'failed' = 'skipped';

            try {
              // Calculate confidence score
              // For LangGraph pipeline: use the pre-computed verification confidence
              // For single_pass pipeline: use multi-factor algorithm + verification adjustment
              let finalConfidence: number;

              if (isLangGraphPipeline && entity.confidence !== undefined) {
                // LangGraph pipeline already computed verification-weighted confidence:
                // 40% name + 30% description + 30% properties
                finalConfidence = entity.confidence;
                this.logger.debug(
                  `Entity ${
                    entity.name
                  }: using LangGraph verification confidence=${finalConfidence.toFixed(
                    3
                  )} ` + `(status: ${entity.verification_status || 'N/A'})`
                );
              } else {
                // Single_pass pipeline: use multi-factor algorithm
                const calculatedConfidence =
                  this.confidenceScorer.calculateConfidence(
                    entity,
                    allowedTypes
                  );

                // Check verification results if available (single_pass only)
                const normalizedEntityName = entity.name.toLowerCase().trim();
                const verificationResult =
                  verificationResults.get(normalizedEntityName);

                // Apply verification adjustment to confidence
                // - Verified entities get a confidence boost (up to 10%)
                // - Rejected by verification get a penalty (up to 30%)
                // - Uncertain entities keep original confidence
                let verificationAdjustment = 0;
                if (verificationResult) {
                  if (verificationResult.verified) {
                    // Boost confidence based on verification confidence (max 10%)
                    verificationAdjustment = Math.min(
                      0.1,
                      verificationResult.confidence * 0.1
                    );
                    this.logger.debug(
                      `Entity "${entity.name}" verified (Tier ${
                        verificationResult.tier
                      }): +${(verificationAdjustment * 100).toFixed(1)}%`
                    );
                  } else if (verificationResult.confidence < 0.3) {
                    // Penalize low-confidence verification failures (max 30%)
                    verificationAdjustment = -Math.min(
                      0.3,
                      (0.3 - verificationResult.confidence) * 0.5
                    );
                    this.logger.debug(
                      `Entity "${entity.name}" verification failed (Tier ${
                        verificationResult.tier
                      }): ${(verificationAdjustment * 100).toFixed(1)}%`
                    );
                  }
                }

                // Apply verification adjustment and clamp to [0, 1]
                finalConfidence = Math.max(
                  0,
                  Math.min(1, calculatedConfidence + verificationAdjustment)
                );

                this.logger.debug(
                  `Entity ${
                    entity.name
                  }: calculated confidence=${finalConfidence.toFixed(3)} ` +
                    `(LLM: ${entity.confidence?.toFixed(3) || 'N/A'})`
                );
              }

              // Apply quality thresholds
              const qualityDecision = this.applyQualityThresholds(
                finalConfidence,
                minThreshold,
                reviewThreshold,
                autoThreshold
              );

              if (qualityDecision === 'reject') {
                rejectedCount += 1;
                this.logger.debug(
                  `Rejected entity ${
                    entity.name
                  }: confidence ${finalConfidence.toFixed(3)} ` +
                    `below minimum threshold ${minThreshold}`
                );
                outcome = 'rejected';
                entitySkipReasons.low_confidence++;
                entityDetails.push({
                  name: entity.name,
                  type: entity.type_name,
                  status: 'rejected',
                  reason: 'low_confidence',
                  confidence: finalConfidence,
                });
                await recordProgress(outcome);
                continue; // Skip this entity
              }

              // Apply entity linking strategy
              const linkingDecision =
                await this.entityLinking.decideMergeAction(
                  entity,
                  job.project_id,
                  strategy as 'key_match' | 'vector_similarity' | 'always_new'
                );

              if (linkingDecision.action === 'skip') {
                // Object already exists with high similarity, skip creation
                this.logger.debug(
                  `Skipped entity ${entity.name}: already exists as ${linkingDecision.existingObjectId}`
                );
                // Still add to map so relationships can reference this entity
                if (linkingDecision.existingObjectId) {
                  addToBatchEntityMap(
                    entity.name,
                    linkingDecision.existingObjectId
                  );
                }
                outcome = 'skipped';
                entitySkipReasons.entity_linking_skip++;
                entityDetails.push({
                  name: entity.name,
                  type: entity.type_name,
                  status: 'skipped',
                  reason: 'entity_linking_skip',
                  object_id: linkingDecision.existingObjectId,
                });
                await recordProgress(outcome);
                continue;
              }

              if (linkingDecision.action === 'merge') {
                // Merge entity into existing object
                await this.entityLinking.mergeEntityIntoObject(
                  linkingDecision.existingObjectId!,
                  entity,
                  job.id
                );

                createdObjectIds.push(linkingDecision.existingObjectId!);

                // Add to batchEntityMap for relationship resolution
                addToBatchEntityMap(
                  entity.name,
                  linkingDecision.existingObjectId!
                );

                if (qualityDecision === 'review') {
                  reviewRequiredObjectIds.push(
                    linkingDecision.existingObjectId!
                  );
                }

                this.logger.debug(
                  `Merged entity ${entity.name} into existing object ${linkingDecision.existingObjectId} ` +
                    `(confidence: ${finalConfidence.toFixed(
                      3
                    )}, decision: ${qualityDecision})`
                );
                outcome = 'merged';
                await recordProgress(outcome);
                continue;
              }

              // linkingDecision.action === 'create' - create new object
              if (linkingDecision.action === 'create') {
                // Determine labels based on quality decision
                const labels: string[] = [];
                if (qualityDecision === 'review') {
                  labels.push('requires_review');
                }

                // Determine status based on confidence and auto-accept threshold
                // High confidence (>= autoThreshold) → status='accepted' (will be embedded)
                // Low confidence (< autoThreshold) → status='draft' (will NOT be embedded)
                const status =
                  finalConfidence >= autoThreshold ? 'accepted' : 'draft';

                // NOTE: We no longer generate or check for duplicate keys.
                // The `key` column is nullable and non-unique.
                // Deduplication is handled by a separate merge process.
                // The `id` (auto-generated UUID) is the unique identifier.

                // Track object creation start time
                const objectCreationStartTime = Date.now();

                const graphObject = await this.graphService.createObject({
                  org_id: organizationId ?? undefined,
                  project_id: job.project_id,
                  type: entity.type_name,
                  key: undefined, // Key is no longer required - deduplication handled separately
                  status: status,
                  properties: {
                    name: entity.name,
                    description: entity.description,
                    ...entity.properties,
                    _extraction_confidence: finalConfidence,
                    _extraction_llm_confidence: entity.confidence,
                    _extraction_source: job.source_type,
                    _extraction_source_id: job.source_id,
                    _extraction_job_id: job.id,
                  },
                  labels,
                });

                createdObjectIds.push(graphObject.id);

                // Add to batchEntityMap for relationship resolution
                addToBatchEntityMap(entity.name, graphObject.id);

                if (qualityDecision === 'review') {
                  reviewRequiredObjectIds.push(graphObject.id);
                }

                // Log successful object creation (combined input + output)
                await this.extractionLogger.logStep({
                  extractionJobId: job.id,
                  stepIndex: this.stepCounter++,
                  operationType: 'object_creation',
                  operationName: 'create_graph_object',
                  status: 'completed',
                  inputData: {
                    entity_type: entity.type_name,
                    entity_name: entity.name,
                    entity_description: entity.description,
                    entity_properties: entity.properties,
                    confidence: finalConfidence,
                    quality_decision: qualityDecision,
                  },
                  outputData: {
                    object_id: graphObject.id,
                    entity_name: entity.name,
                    entity_type: entity.type_name,
                    quality_decision: qualityDecision,
                    requires_review: qualityDecision === 'review',
                  },
                  durationMs: Date.now() - objectCreationStartTime,
                  metadata: {
                    project_id: job.project_id,
                    confidence: finalConfidence,
                  },
                });

                this.logger.debug(
                  `Created object ${graphObject.id}: ${entity.type_name} - ${entity.name} ` +
                    `(confidence: ${finalConfidence.toFixed(
                      3
                    )}, decision: ${qualityDecision})`
                );
                outcome = 'created';
              }
            } catch (error) {
              outcome = 'failed';
              const err =
                error instanceof Error ? error : new Error(String(error));

              // Extract detailed error information from BadRequestException
              let errorDetails: Record<string, any> | undefined;
              if (error instanceof BadRequestException) {
                const response = error.getResponse();
                if (typeof response === 'object' && response !== null) {
                  errorDetails = {
                    code: (response as any).code,
                    errors: (response as any).errors,
                    entity_properties: entity.properties,
                  };
                }
              }

              // Log object creation error with full context
              await this.extractionLogger.logStep({
                extractionJobId: job.id,
                stepIndex: this.stepCounter++,
                operationType: 'error',
                operationName: 'create_graph_object',
                status: 'failed',
                errorMessage: err.message,
                errorStack: err.stack,
                errorDetails,
                metadata: {
                  entity_name: entity.name,
                  entity_type: entity.type_name,
                  entity_properties: entity.properties,
                  entity_description: entity.description,
                },
              });

              this.logger.error(
                `Failed to create object for entity ${entity.name} (${entity.type_name}): ${err.message}`,
                err.stack
              );
              // Continue processing other entities
            }

            await recordProgress(outcome);
          }

          // 6b. batchEntityMap was populated during object creation above
          // Log the map size for debugging
          this.logger.debug(
            `BatchEntityMap populated during creation with ${batchEntityMap.size} entity mappings`
          );

          // 6c. Process extracted relationships
          let relationshipsCreated = 0;
          let relationshipsSkipped = 0;
          let relationshipsFailed = 0;
          // Track skip reasons for better observability
          const relationshipSkipReasons: Record<string, number> = {
            source_not_resolved: 0,
            target_not_resolved: 0,
            duplicate: 0,
            rejected_verification: 0,
          };
          // Detailed per-relationship results for tracing
          const relationshipDetails: Array<{
            type: string;
            source: string;
            target: string;
            status: 'created' | 'skipped' | 'failed';
            reason?: string;
            source_id?: string;
            target_id?: string;
          }> = [];

          if (
            extractionResult.relationships &&
            extractionResult.relationships.length > 0
          ) {
            const relStep = beginTimelineStep('create_relationships', {
              total_relationships: extractionResult.relationships.length,
            });

            for (const rel of extractionResult.relationships) {
              try {
                // Resolve source entity ID
                const sourceId = await this.resolveEntityReference(
                  rel.source,
                  batchEntityMap,
                  job.project_id
                );

                // Resolve target entity ID
                const targetId = await this.resolveEntityReference(
                  rel.target,
                  batchEntityMap,
                  job.project_id
                );

                if (!sourceId) {
                  this.logger.warn(
                    `[Relationship] Could not resolve source entity: ${
                      rel.source.name || rel.source.id
                    } for relationship type ${rel.relationship_type}`
                  );
                  relationshipsSkipped++;
                  relationshipSkipReasons.source_not_resolved++;
                  relationshipDetails.push({
                    type: rel.relationship_type,
                    source: rel.source.name || rel.source.id || 'unknown',
                    target: rel.target.name || rel.target.id || 'unknown',
                    status: 'skipped',
                    reason: `source_not_resolved: "${
                      rel.source.name || rel.source.id
                    }" not found in batch or database`,
                  });
                  continue;
                }

                if (!targetId) {
                  this.logger.warn(
                    `[Relationship] Could not resolve target entity: ${
                      rel.target.name || rel.target.id
                    } for relationship type ${rel.relationship_type}`
                  );
                  relationshipsSkipped++;
                  relationshipSkipReasons.target_not_resolved++;
                  relationshipDetails.push({
                    type: rel.relationship_type,
                    source: rel.source.name || rel.source.id || 'unknown',
                    target: rel.target.name || rel.target.id || 'unknown',
                    status: 'skipped',
                    reason: `target_not_resolved: "${
                      rel.target.name || rel.target.id
                    }" not found in batch or database`,
                    source_id: sourceId,
                  });
                  continue;
                }

                // Check verification status for LangGraph pipeline
                // Skip rejected relationships (confidence below threshold)
                if (rel.verification_status === 'rejected') {
                  this.logger.debug(
                    `[Relationship] Skipping rejected relationship: ${rel.relationship_type} ` +
                      `(${rel.source.name || rel.source.id} → ${
                        rel.target.name || rel.target.id
                      }) ` +
                      `confidence=${rel.confidence?.toFixed(3) || 'N/A'}`
                  );
                  relationshipsSkipped++;
                  relationshipSkipReasons.rejected_verification++;
                  relationshipDetails.push({
                    type: rel.relationship_type,
                    source: rel.source.name || rel.source.id || 'unknown',
                    target: rel.target.name || rel.target.id || 'unknown',
                    status: 'skipped',
                    reason: `rejected_verification: confidence ${(
                      (rel.confidence || 0) * 100
                    ).toFixed(1)}% below threshold`,
                    source_id: sourceId,
                    target_id: targetId,
                  });
                  continue;
                }

                // Validate against relationship schema if available
                if (
                  relationshipSchemas &&
                  relationshipSchemas[rel.relationship_type]
                ) {
                  const schema = relationshipSchemas[rel.relationship_type];
                  // Could add source/target type validation here
                  // For now, we just log that the relationship type is valid
                  this.logger.debug(
                    `[Relationship] Type ${rel.relationship_type} is valid per schema`
                  );
                }

                // Create the relationship
                await this.graphService.createRelationship(
                  {
                    type: rel.relationship_type,
                    src_id: sourceId,
                    dst_id: targetId,
                    properties: {
                      description: rel.description,
                      _extraction_confidence: rel.confidence,
                      _extraction_job_id: job.id,
                      _extraction_source: 'llm',
                    },
                  },
                  organizationId ?? '',
                  job.project_id
                );

                relationshipsCreated++;
                relationshipDetails.push({
                  type: rel.relationship_type,
                  source: rel.source.name || rel.source.id || 'unknown',
                  target: rel.target.name || rel.target.id || 'unknown',
                  status: 'created',
                  source_id: sourceId,
                  target_id: targetId,
                });
                this.logger.debug(
                  `[Relationship] Created ${rel.relationship_type}: ${sourceId} → ${targetId}`
                );
              } catch (relError) {
                const relErr =
                  relError instanceof Error
                    ? relError
                    : new Error(String(relError));

                // Handle duplicate relationship gracefully
                if (
                  relErr.message.includes('duplicate') ||
                  relErr.message.includes('unique')
                ) {
                  this.logger.debug(
                    `[Relationship] Skipped duplicate: ${rel.relationship_type}`
                  );
                  relationshipsSkipped++;
                  relationshipSkipReasons.duplicate++;
                  relationshipDetails.push({
                    type: rel.relationship_type,
                    source: rel.source.name || rel.source.id || 'unknown',
                    target: rel.target.name || rel.target.id || 'unknown',
                    status: 'skipped',
                    reason: 'duplicate: relationship already exists',
                  });
                } else {
                  this.logger.warn(
                    `[Relationship] Failed to create ${rel.relationship_type}: ${relErr.message}`
                  );
                  relationshipsFailed++;
                  relationshipDetails.push({
                    type: rel.relationship_type,
                    source: rel.source.name || rel.source.id || 'unknown',
                    target: rel.target.name || rel.target.id || 'unknown',
                    status: 'failed',
                    reason: `error: ${relErr.message}`,
                  });
                }
              }
            }

            relStep('success', {
              metadata: {
                created: relationshipsCreated,
                skipped: relationshipsSkipped,
                failed: relationshipsFailed,
                skip_reasons: relationshipSkipReasons,
                relationship_details: relationshipDetails,
              },
            });

            this.logger.log(
              `Relationships: ${relationshipsCreated} created, ${relationshipsSkipped} skipped (${relationshipSkipReasons.source_not_resolved} source unresolved, ${relationshipSkipReasons.target_not_resolved} target unresolved, ${relationshipSkipReasons.duplicate} duplicates), ${relationshipsFailed} failed`
            );
          }

          graphStep('success', {
            metadata: {
              created: outcomeCounts.created,
              merged: outcomeCounts.merged,
              skipped: outcomeCounts.skipped,
              rejected: outcomeCounts.rejected,
              failed: outcomeCounts.failed,
              review_required: reviewRequiredObjectIds.length,
              relationships_created: relationshipsCreated,
              relationships_skipped: relationshipsSkipped,
              relationships_failed: relationshipsFailed,
              relationship_skip_reasons: relationshipSkipReasons,
              relationship_details: relationshipDetails,
            },
          });

          // 6d. Link created objects to source document chunks for provenance
          if (documentChunkIds.length > 0 && createdObjectIds.length > 0) {
            const chunkLinkStep = beginTimelineStep('link_object_chunks', {
              chunk_count: documentChunkIds.length,
              object_count: createdObjectIds.length,
            });

            try {
              let totalLinked = 0;
              for (const objectId of createdObjectIds) {
                const linkedCount =
                  await this.objectChunksService.bulkLinkChunks(
                    objectId,
                    documentChunkIds,
                    job.id,
                    0.8
                  );
                totalLinked += linkedCount;
              }

              chunkLinkStep('success', {
                metadata: {
                  objects_linked: createdObjectIds.length,
                  chunks_per_object: documentChunkIds.length,
                  total_links_created: totalLinked,
                },
              });

              this.logger.log(
                `Object-chunk linking: ${totalLinked} links created for ${createdObjectIds.length} objects from ${documentChunkIds.length} chunks`
              );
            } catch (chunkLinkError) {
              const message = toErrorMessage(chunkLinkError);
              chunkLinkStep('warning', { message });
              this.logger.warn(
                `Failed to link chunks to objects (non-fatal): ${message}`
              );
            }
          }

          // 7. Mark job as completed or requires_review
          const requiresReview = reviewRequiredObjectIds.length > 0;
          const duration = Date.now() - startTime;
          const debugInfo = this.buildDebugInfo({
            job,
            startTime,
            durationMs: duration,
            timeline,
            providerName,
            extractionResult,
            outcomeCounts,
            createdObjectIds,
            rejectedCount,
            reviewRequiredCount: reviewRequiredObjectIds.length,
            organizationId,
            thresholds: thresholdsInfo,
          });

          if (requiresReview) {
            // Job needs human review
            await this.jobService.markCompleted(
              job.id,
              {
                created_objects: createdObjectIds,
                discovered_types: extractionResult.discovered_types,
                successful_items:
                  extractionResult.entities.length - rejectedCount,
                total_items: extractionResult.entities.length,
                rejected_items: rejectedCount,
                review_required_count: reviewRequiredObjectIds.length,
                debug_info: debugInfo,
              },
              'requires_review'
            );

            this.logger.log(
              `Extraction job ${job.id} requires review: ` +
                `${reviewRequiredObjectIds.length} objects need human validation, ` +
                `${rejectedCount} rejected`
            );

            // Create notification about extraction completion (with review needed)
            await this.createCompletionNotification(job, {
              createdObjectIds,
              objectsByType: this.countObjectsByType(
                extractionResult.entities,
                createdObjectIds
              ),
              averageConfidence: this.calculateAverageConfidence(
                extractionResult.entities
              ),
              durationSeconds: (Date.now() - startTime) / 1000,
              requiresReview: reviewRequiredObjectIds.length,
              lowConfidenceCount: reviewRequiredObjectIds.length,
            });
          } else {
            // Job completed successfully
            await this.jobService.markCompleted(job.id, {
              created_objects: createdObjectIds,
              discovered_types: extractionResult.discovered_types,
              successful_items:
                extractionResult.entities.length - rejectedCount,
              total_items: extractionResult.entities.length,
              rejected_items: rejectedCount,
              debug_info: debugInfo,
            });

            // Create notification about successful extraction
            await this.createCompletionNotification(job, {
              createdObjectIds,
              objectsByType: this.countObjectsByType(
                extractionResult.entities,
                createdObjectIds
              ),
              averageConfidence: this.calculateAverageConfidence(
                extractionResult.entities
              ),
              durationSeconds: (Date.now() - startTime) / 1000,
            });
          }

          this.logger.log(
            `Completed extraction job ${job.id}: ` +
              `${createdObjectIds.length} objects created, ` +
              `${rejectedCount} rejected, ` +
              `${reviewRequiredObjectIds.length} need review, ` +
              `${
                extractionResult.discovered_types?.length || 0
              } types discovered, ` +
              `${duration}ms`
          );

          // Log completion to monitoring system
          await this.monitoringLogger.logProcessEvent({
            processId: job.id,
            processType: 'extraction_job',
            level: 'info',
            message: 'Extraction job completed successfully',
            projectId: job.project_id,
            metadata: {
              created_objects: createdObjectIds.length,
              rejected: rejectedCount,
              review_required: reviewRequiredObjectIds.length,
              discovered_types: extractionResult.discovered_types?.length || 0,
              duration_ms: duration,
            },
          });

          pushTimelineEvent('job_completed', 'success', {
            durationMs: duration,
            metadata: {
              created_objects: createdObjectIds.length,
              rejected: rejectedCount,
              review_required: reviewRequiredObjectIds.length,
            },
          });

          this.processedCount++;
          this.successCount++;

          if (traceId) {
            await this.langfuseService.finalizeTrace(traceId, 'success', {
              entities_count: extractionResult.entities.length,
              relationships_count: extractionResult.relationships?.length || 0,
              discovered_types_count:
                extractionResult.discovered_types?.length || 0,
              duration_ms: duration,
            });
          }

          // Set OTEL span status for success
          jobSpan.setAttribute(
            'job.entities_count',
            extractionResult.entities.length
          );
          jobSpan.setAttribute(
            'job.relationships_count',
            extractionResult.relationships?.length || 0
          );
          jobSpan.setAttribute('job.created_objects', createdObjectIds.length);
          jobSpan.setAttribute('job.rejected_count', rejectedCount);
          jobSpan.setAttribute(
            'job.review_required',
            reviewRequiredObjectIds.length
          );
          jobSpan.setAttribute('job.duration_ms', duration);
          jobSpan.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          this.logger.error(`Extraction job ${job.id} failed`, error);

          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          const willRetry = await this.willRetryJob(job.id);

          // Log failure to monitoring system
          await this.monitoringLogger.logProcessEvent({
            processId: job.id,
            processType: 'extraction_job',
            level: 'error',
            message: `Extraction job failed: ${errorMessage}`,
            projectId: job.project_id,
            metadata: {
              error: errorMessage,
              will_retry: willRetry,
              duration_ms: Date.now() - startTime,
            },
          });

          pushTimelineEvent('job_failed', 'error', {
            message: errorMessage,
            metadata: {
              will_retry: willRetry,
            },
            durationMs: Date.now() - startTime,
          });

          const debugInfo = this.buildDebugInfo({
            job,
            startTime,
            durationMs: Date.now() - startTime,
            timeline,
            providerName,
            extractionResult,
            errorMessage,
            organizationId,
            thresholds: thresholdsInfo,
          });

          await this.jobService.markFailed(
            job.id,
            errorMessage,
            {
              error: errorMessage,
              stack: error instanceof Error ? error.stack : undefined,
            },
            debugInfo
          );

          // Create failure notification
          await this.createFailureNotification(job, {
            errorMessage,
            willRetry,
          });

          if (traceId) {
            await this.langfuseService.finalizeTrace(traceId, 'error', {
              error: errorMessage,
              entities_count: extractionResult?.entities?.length || 0,
              relationships_count: extractionResult?.relationships?.length || 0,
              discovered_types_count:
                extractionResult?.discovered_types?.length || 0,
              duration_ms: Date.now() - startTime,
            });
          }

          // Set OTEL span status for error
          const err = error instanceof Error ? error : new Error(String(error));
          jobSpan.setAttribute('job.duration_ms', Date.now() - startTime);
          jobSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message,
          });
          jobSpan.recordException(err);

          this.processedCount++;
          this.failureCount++;
        } finally {
          jobSpan.end();
        }
      }
    );
  }

  private buildDebugInfo(args: BuildDebugInfoArgs): Record<string, any> {
    const {
      job,
      startTime,
      durationMs,
      timeline,
      providerName,
      extractionResult,
      outcomeCounts,
      createdObjectIds,
      rejectedCount,
      reviewRequiredCount,
      errorMessage,
      organizationId,
    } = args;

    const debugInfo: Record<string, any> =
      extractionResult?.raw_response &&
      typeof extractionResult.raw_response === 'object'
        ? { ...extractionResult.raw_response }
        : {};

    if (
      extractionResult?.raw_response !== undefined &&
      typeof extractionResult.raw_response !== 'object'
    ) {
      debugInfo.raw_response = extractionResult.raw_response;
    }

    debugInfo.timeline = timeline;
    debugInfo.provider = providerName;
    debugInfo.job_id = job.id;
    debugInfo.project_id = job.project_id;
    debugInfo.organization_id = organizationId;
    debugInfo.job_started_at = new Date(startTime).toISOString();
    debugInfo.job_completed_at = new Date(startTime + durationMs).toISOString();
    debugInfo.job_duration_ms = durationMs;

    if (typeof debugInfo.total_entities !== 'number' && extractionResult) {
      debugInfo.total_entities = extractionResult.entities.length;
    }

    if (
      typeof debugInfo.types_processed !== 'number' &&
      extractionResult?.discovered_types
    ) {
      debugInfo.types_processed = extractionResult.discovered_types.length;
    }

    if (extractionResult?.usage) {
      debugInfo.usage = extractionResult.usage;
    }

    if (outcomeCounts) {
      debugInfo.entity_outcomes = outcomeCounts;
    }

    if (createdObjectIds) {
      debugInfo.created_object_count = createdObjectIds.length;
    }

    if (typeof rejectedCount === 'number') {
      debugInfo.rejected_count = rejectedCount;
    }

    if (typeof reviewRequiredCount === 'number') {
      debugInfo.review_required_count = reviewRequiredCount;
    }

    if (errorMessage) {
      debugInfo.error_message = errorMessage;
    }

    // Add threshold information for debugging
    if (args.thresholds) {
      debugInfo.confidence_thresholds = {
        min_threshold: args.thresholds.min,
        review_threshold: args.thresholds.review,
        auto_accept_threshold: args.thresholds.autoAccept,
        threshold_sources: args.thresholds.source,
        interpretation: {
          rejected: `confidence < ${(args.thresholds.min * 100).toFixed(0)}%`,
          draft: `${(args.thresholds.min * 100).toFixed(0)}% <= confidence < ${(
            args.thresholds.autoAccept * 100
          ).toFixed(0)}%`,
          accepted: `confidence >= ${(args.thresholds.autoAccept * 100).toFixed(
            0
          )}%`,
        },
      };
    }

    return debugInfo;
  }

  /**
   * Load document content from various sources
   */
  private async loadDocumentContent(
    job: ExtractionJobDto
  ): Promise<string | null> {
    switch (job.source_type) {
      case 'document':
        if (!job.source_id) {
          throw new Error('Document source requires source_id');
        }
        return this.loadDocumentById(job.source_id);

      case 'manual':
        // Direct text in source_metadata
        return job.source_metadata?.text || null;

      case 'api':
      case 'bulk_import':
        // Future: Handle other source types
        throw new Error(`Source type not yet implemented: ${job.source_type}`);

      default:
        throw new Error(`Unsupported source type: ${job.source_type}`);
    }
  }

  /**
   * Load document by ID from kb.documents
   * MIGRATED: Now uses DocumentsService.get() - content is already included
   */
  private async loadDocumentById(documentId: string): Promise<string | null> {
    const doc = await this.documentsService.get(documentId);
    if (!doc) {
      return null;
    }

    // Return content directly from DocumentsService result
    return doc.content || null;
  }

  /**
   * Check if chunks exist for a document
   * Returns the count of chunks and whether they have embeddings
   */
  private async getChunkStatus(documentId: string): Promise<{
    count: number;
    withEmbeddings: number;
    withoutEmbeddings: number;
  }> {
    const result = await this.db.query<{
      total: number;
      with_embeddings: number;
    }>(
      `SELECT 
         COUNT(*)::int as total,
         COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END)::int as with_embeddings
       FROM kb.chunks 
       WHERE document_id = $1`,
      [documentId]
    );

    const total = result.rows[0]?.total ?? 0;
    const withEmbeddings = result.rows[0]?.with_embeddings ?? 0;

    return {
      count: total,
      withEmbeddings,
      withoutEmbeddings: total - withEmbeddings,
    };
  }

  /**
   * Get project-level chunking configuration
   * Returns chunking config if set, null otherwise
   */
  private async getProjectChunkingConfig(
    projectId: string
  ): Promise<ChunkerConfig | null> {
    try {
      const result = await this.db.query<{ chunking_config: any }>(
        'SELECT chunking_config FROM kb.projects WHERE id = $1',
        [projectId]
      );

      const storedConfig = result.rows[0]?.chunking_config;
      if (!storedConfig) {
        return null;
      }

      return {
        strategy:
          (storedConfig.strategy as ChunkerConfig['strategy']) || 'character',
        options: {
          maxChunkSize: storedConfig.maxChunkSize,
          minChunkSize: storedConfig.minChunkSize,
        },
      };
    } catch (error) {
      this.logger.warn(
        `Failed to get chunking config for project ${projectId}: ${toErrorMessage(
          error
        )}`
      );
      return null;
    }
  }

  /**
   * Ensure chunks exist for a document
   * If chunks don't exist, creates them from document content
   * Returns the chunk texts for further processing
   */
  private async ensureChunksExist(
    documentId: string,
    projectId: string,
    content: string
  ): Promise<{ chunkIds: string[]; chunkTexts: string[]; created: boolean }> {
    const status = await this.getChunkStatus(documentId);

    if (status.count > 0) {
      // Chunks already exist, load their texts
      const chunks = await this.db.query<{ id: string; text: string }>(
        `SELECT id, text FROM kb.chunks WHERE document_id = $1 ORDER BY chunk_index ASC`,
        [documentId]
      );
      return {
        chunkIds: chunks.rows.map((c) => c.id),
        chunkTexts: chunks.rows.map((c) => c.text),
        created: false,
      };
    }

    // No chunks exist - need to create them
    this.logger.log(
      `Creating chunks for document ${documentId} (no existing chunks found)`
    );

    // Get project chunking config or use defaults
    const chunkingConfig = await this.getProjectChunkingConfig(projectId);

    // Chunk the content
    const chunksWithMeta = chunkingConfig
      ? this.chunkerService.chunkWithMetadata(content, chunkingConfig)
      : this.chunkerService.chunkWithMetadata(content);

    // Insert chunks into database
    const chunkIds: string[] = [];
    const chunkTexts: string[] = [];

    for (let i = 0; i < chunksWithMeta.length; i++) {
      const chunkData = chunksWithMeta[i];
      const metadataJson = JSON.stringify(chunkData.metadata);

      const insertResult = await this.db.query<{ id: string }>(
        `INSERT INTO kb.chunks(document_id, chunk_index, text, metadata)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (document_id, chunk_index) DO UPDATE 
         SET text = EXCLUDED.text, metadata = EXCLUDED.metadata
         RETURNING id`,
        [documentId, i, chunkData.text, metadataJson]
      );

      if (insertResult.rows[0]?.id) {
        chunkIds.push(insertResult.rows[0].id);
        chunkTexts.push(chunkData.text);
      }
    }

    this.logger.log(
      `Created ${chunkIds.length} chunks for document ${documentId}`
    );

    return { chunkIds, chunkTexts, created: true };
  }

  /**
   * Ensure embeddings exist for chunks
   * If embeddings are missing, generates them using the embeddings service
   */
  private async ensureEmbeddingsExist(
    documentId: string,
    chunkTexts: string[]
  ): Promise<{ generated: number; skipped: number }> {
    if (!this.config.embeddingsEnabled) {
      this.logger.debug('Embeddings disabled, skipping embedding generation');
      return { generated: 0, skipped: chunkTexts.length };
    }

    // Find chunks without embeddings
    const chunksWithoutEmbeddings = await this.db.query<{
      id: string;
      chunk_index: number;
      text: string;
    }>(
      `SELECT id, chunk_index, text 
       FROM kb.chunks 
       WHERE document_id = $1 AND embedding IS NULL
       ORDER BY chunk_index ASC`,
      [documentId]
    );

    if (chunksWithoutEmbeddings.rowCount === 0) {
      this.logger.debug(
        `All chunks for document ${documentId} have embeddings`
      );
      return { generated: 0, skipped: chunkTexts.length };
    }

    this.logger.log(
      `Generating embeddings for ${chunksWithoutEmbeddings.rowCount} chunks of document ${documentId}`
    );

    // Generate embeddings for chunks without them
    const textsToEmbed = chunksWithoutEmbeddings.rows.map((c) => c.text);

    try {
      const vectors = await this.embeddingsService.embedDocuments(textsToEmbed);

      // Update chunks with embeddings
      for (let i = 0; i < chunksWithoutEmbeddings.rows.length; i++) {
        const chunk = chunksWithoutEmbeddings.rows[i];
        const vec = vectors[i];

        if (vec && vec.length > 0) {
          const vecLiteral =
            '[' +
            vec.map((n) => (Number.isFinite(n) ? String(n) : '0')).join(',') +
            ']';

          await this.db.query(
            `UPDATE kb.chunks SET embedding = $1::vector WHERE id = $2`,
            [vecLiteral, chunk.id]
          );
        }
      }

      this.logger.log(
        `Generated embeddings for ${vectors.length} chunks of document ${documentId}`
      );
      return {
        generated: vectors.length,
        skipped: chunkTexts.length - vectors.length,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate embeddings for document ${documentId}: ${toErrorMessage(
          error
        )}`
      );
      return { generated: 0, skipped: chunkTexts.length };
    }
  }

  /**
   * Ensure document has chunks and embeddings before extraction
   * This is the main entry point for the chunk dependency flow
   */
  private async ensureDocumentReady(
    documentId: string,
    projectId: string
  ): Promise<{
    success: boolean;
    content: string | null;
    chunkIds: string[];
    chunkTexts: string[];
    chunksCreated: boolean;
    chunkCount: number;
    embeddingsGenerated: number;
  }> {
    // First, load document content
    const content = await this.loadDocumentById(documentId);
    if (!content) {
      return {
        success: false,
        content: null,
        chunkIds: [],
        chunkTexts: [],
        chunksCreated: false,
        chunkCount: 0,
        embeddingsGenerated: 0,
      };
    }

    // Ensure chunks exist
    const chunkResult = await this.ensureChunksExist(
      documentId,
      projectId,
      content
    );

    // Ensure embeddings exist
    const embeddingResult = await this.ensureEmbeddingsExist(
      documentId,
      chunkResult.chunkTexts
    );

    return {
      success: true,
      content,
      chunkIds: chunkResult.chunkIds,
      chunkTexts: chunkResult.chunkTexts,
      chunksCreated: chunkResult.created,
      chunkCount: chunkResult.chunkIds.length,
      embeddingsGenerated: embeddingResult.generated,
    };
  }

  /**
   * Load extraction configuration from project's template pack
   * Returns both the extraction prompt and object type schemas
   */
  /**
   * Load extraction configuration for a job
   * MIGRATED: Session 20 - Delegates to TemplatePackService.getProjectTemplatePacks()
   */
  private async loadExtractionConfig(job: ExtractionJobDto): Promise<{
    prompt: string | null;
    objectSchemas: Record<string, any>;
    relationshipSchemas: Record<string, any>;
  }> {
    const organizationId = await this.getOrganizationId(job);
    if (!organizationId) {
      this.logger.warn(`Missing organization ID for job ${job.id}`);
      return { prompt: null, objectSchemas: {}, relationshipSchemas: {} };
    }

    // Get project's assigned template packs using TemplatePackService
    let templatePacks;
    try {
      this.logger.debug(
        `[loadExtractionConfig] Fetching template packs for project: ${job.project_id}`
      );
      templatePacks = await this.templatePacks.getProjectTemplatePacks(
        job.project_id
      );

      // Filter to only active template packs
      templatePacks = templatePacks.filter((pack) => pack.active);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `[loadExtractionConfig] Failed to fetch template packs: ${err.message}`,
        err.stack
      );
      throw err;
    }

    if (templatePacks.length === 0) {
      this.logger.warn(
        `No active template pack found for project ${job.project_id}`
      );

      const defaultTemplatePackId = this.config.extractionDefaultTemplatePackId;
      if (!defaultTemplatePackId) {
        this.logger.warn(
          'No default extraction template pack configured; skipping auto-install'
        );
        return { prompt: null, objectSchemas: {}, relationshipSchemas: {} };
      }

      if (!organizationId) {
        this.logger.warn(
          `Cannot auto-install default template pack ${defaultTemplatePackId}: missing organization ID on job ${job.id}`
        );
        return { prompt: null, objectSchemas: {}, relationshipSchemas: {} };
      }

      const userId =
        job.subject_id ||
        (job as unknown as { created_by?: string }).created_by ||
        SYSTEM_USER_ID;

      this.logger.debug(
        `[loadExtractionPrompt] Auto-install params: projectId=${job.project_id}, orgId=${organizationId}, userId=${userId}, templatePackId=${defaultTemplatePackId}`
      );

      try {
        this.logger.log(
          `Auto-installing default template pack ${defaultTemplatePackId} for project ${job.project_id}`
        );
        await this.templatePacks.assignTemplatePackToProject(
          job.project_id,
          organizationId,
          userId,
          { template_pack_id: defaultTemplatePackId }
        );
      } catch (error) {
        if (error instanceof ConflictException) {
          this.logger.log(
            `Default template pack ${defaultTemplatePackId} already installed for project ${job.project_id}`
          );
        } else {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.warn(
            `Failed to auto-install default template pack ${defaultTemplatePackId} for project ${job.project_id}`,
            err
          );
          return { prompt: null, objectSchemas: {}, relationshipSchemas: {} };
        }
      }

      // Re-fetch after installation
      templatePacks = await this.templatePacks.getProjectTemplatePacks(
        job.project_id
      );
      templatePacks = templatePacks.filter((pack) => pack.active);

      if (templatePacks.length === 0) {
        this.logger.warn(
          `Default template pack ${defaultTemplatePackId} available but prompts still missing for project ${job.project_id}`
        );
        return { prompt: null, objectSchemas: {}, relationshipSchemas: {} };
      }
    }

    // Merge extraction prompts, object schemas, and relationship schemas from ALL active template packs
    const mergedExtractionPrompts: Record<string, string> = {};
    const mergedObjectSchemas: Record<string, any> = {};
    const mergedRelationshipSchemas: Record<string, any> = {};
    let firstDefaultPromptKey: string | null = null;

    this.logger.log(
      `[loadExtractionConfig] Found ${templatePacks.length} active template pack(s) for project ${job.project_id}`
    );

    for (const packAssignment of templatePacks) {
      const pack = packAssignment.template_pack;
      const packName = pack.name;
      this.logger.debug(
        `[loadExtractionConfig] Processing template pack: ${packName}`
      );

      // Merge extraction prompts
      const extractionPrompts = pack.extraction_prompts || {};
      for (const [key, value] of Object.entries(extractionPrompts)) {
        if (typeof value === 'string') {
          mergedExtractionPrompts[key] = value;
          this.logger.debug(
            `[loadExtractionConfig] Added extraction prompt key: ${key} from ${packName}`
          );
        }
      }

      // Merge object schemas
      const objectSchemas = pack.object_type_schemas || {};
      for (const [typeName, schema] of Object.entries(objectSchemas)) {
        if (typeof schema !== 'object' || schema === null) {
          this.logger.warn(
            `[loadExtractionConfig] Invalid schema for type ${typeName} in ${packName}, skipping`
          );
          continue;
        }

        if (mergedObjectSchemas[typeName]) {
          // Later packs override earlier ones for same type
          this.logger.debug(
            `[loadExtractionConfig] Merging schema for type: ${typeName} (from ${packName})`
          );
          mergedObjectSchemas[typeName] = {
            ...mergedObjectSchemas[typeName],
            ...(schema as Record<string, any>),
            _sources: [
              ...(mergedObjectSchemas[typeName]._sources || []),
              { pack: packName },
            ],
          };
        } else {
          this.logger.debug(
            `[loadExtractionConfig] Adding schema for type: ${typeName} (from ${packName})`
          );
          mergedObjectSchemas[typeName] = {
            ...(schema as Record<string, any>),
            _sources: [{ pack: packName }],
          };
        }
      }

      // Merge relationship type schemas
      const relationshipSchemas = pack.relationship_type_schemas || {};
      for (const [typeName, schema] of Object.entries(relationshipSchemas)) {
        if (typeof schema !== 'object' || schema === null) {
          this.logger.warn(
            `[loadExtractionConfig] Invalid relationship schema for type ${typeName} in ${packName}, skipping`
          );
          continue;
        }

        if (mergedRelationshipSchemas[typeName]) {
          // Later packs override earlier ones for same type
          this.logger.debug(
            `[loadExtractionConfig] Merging relationship schema for type: ${typeName} (from ${packName})`
          );
          mergedRelationshipSchemas[typeName] = {
            ...mergedRelationshipSchemas[typeName],
            ...(schema as Record<string, any>),
            _sources: [
              ...(mergedRelationshipSchemas[typeName]._sources || []),
              { pack: packName },
            ],
          };
        } else {
          this.logger.debug(
            `[loadExtractionConfig] Adding relationship schema for type: ${typeName} (from ${packName})`
          );
          mergedRelationshipSchemas[typeName] = {
            ...(schema as Record<string, any>),
            _sources: [{ pack: packName }],
          };
        }
      }

      // Use the first default_prompt_key we encounter from customizations
      // Note: customizations structure doesn't include default_prompt_key in type definition
      // but may be present in database - use type assertion
      const customizations = packAssignment.customizations as any;
      const defaultPromptKey = customizations?.default_prompt_key;
      if (!firstDefaultPromptKey && defaultPromptKey) {
        firstDefaultPromptKey = defaultPromptKey;
      }
    }

    this.logger.log(
      `[loadExtractionConfig] Merged ${
        Object.keys(mergedObjectSchemas).length
      } object type(s) and ${
        Object.keys(mergedRelationshipSchemas).length
      } relationship type(s) from ${templatePacks.length} template pack(s)`
    );
    this.logger.debug(
      `[loadExtractionConfig] Object types: ${Object.keys(
        mergedObjectSchemas
      ).join(', ')}`
    );
    if (Object.keys(mergedRelationshipSchemas).length > 0) {
      this.logger.debug(
        `[loadExtractionConfig] Relationship types: ${Object.keys(
          mergedRelationshipSchemas
        ).join(', ')}`
      );
    }

    // Load base extraction prompt from database settings or fall back to environment/default
    // Priority: 1. Database (kb.settings) -> 2. Environment variable -> 3. Default
    let basePrompt = this.config.extractionBasePrompt; // Default from config service

    try {
      const settingResult = await this.db.query(
        'SELECT value FROM kb.settings WHERE key = $1',
        ['extraction.basePrompt']
      );
      if (settingResult.rows.length > 0 && settingResult.rows[0].value) {
        const value = settingResult.rows[0].value;
        // The value is stored as JSONB, extract the string
        basePrompt =
          typeof value === 'string'
            ? value
            : (value as any)?.text || (value as any)?.template || value;
        this.logger.log('Using extraction base prompt from database settings');
      }
    } catch (error) {
      this.logger.warn(
        'Failed to load extraction base prompt from database, using default',
        error
      );
    }

    this.logger.log(
      `Using schema-based extraction with ${
        Object.keys(mergedObjectSchemas).length
      } object type(s) and ${
        Object.keys(mergedRelationshipSchemas).length
      } relationship type(s)`
    );
    return {
      prompt: basePrompt,
      objectSchemas: mergedObjectSchemas,
      relationshipSchemas: mergedRelationshipSchemas,
    };
  }

  /**
   * Estimate token count for rate limiting
   *
   * Simple heuristic: ~4 characters per token
   */
  private estimateTokens(
    documentContent: string,
    extractionPrompt: string
  ): number {
    const totalChars = documentContent.length + extractionPrompt.length;
    const estimatedTokens = Math.ceil(totalChars / 4);

    // Add buffer for response tokens (assume ~30% of input)
    const withResponseBuffer = Math.ceil(estimatedTokens * 1.3);

    return withResponseBuffer;
  }

  /**
   * Extract allowed types from job configuration or derive from template pack schemas.
   *
   * Priority:
   * 1. Job's extraction_config.target_types (explicitly configured by user)
   * 2. Template pack's object schema keys (automatically derived)
   *
   * This ensures the LLM only extracts entity types that are defined in the
   * project's template pack, preventing invalid types like "Concept" when
   * the template pack only defines types like "Person", "Place", etc.
   *
   * @param job - The extraction job
   * @param objectSchemas - Object schemas from template pack (optional fallback)
   * @returns Array of allowed type names, or undefined if no constraints
   */
  private extractAllowedTypes(
    job: ExtractionJobDto,
    objectSchemas?: Record<string, any>
  ): string[] | undefined {
    // 1. Check if job has explicit target_types configured
    const explicitTypes = job.extraction_config?.target_types;
    if (explicitTypes && explicitTypes.length > 0) {
      this.logger.debug(
        `[extractAllowedTypes] Using explicit target_types from job config: ${explicitTypes.join(
          ', '
        )}`
      );
      return explicitTypes;
    }

    // 2. Fall back to template pack schema keys if available
    if (objectSchemas && Object.keys(objectSchemas).length > 0) {
      // Filter out internal keys (those starting with _) and get type names
      const schemaTypes = Object.keys(objectSchemas).filter(
        (key) => !key.startsWith('_')
      );
      if (schemaTypes.length > 0) {
        this.logger.debug(
          `[extractAllowedTypes] Using template pack schema types: ${schemaTypes.join(
            ', '
          )}`
        );
        return schemaTypes;
      }
    }

    // 3. No constraints - allow any type (not recommended but backward compatible)
    this.logger.warn(
      `[extractAllowedTypes] No allowed types configured for job ${job.id}. ` +
        `LLM may extract arbitrary entity types. Consider installing a template pack.`
    );
    return undefined;
  }

  /**
   * Apply quality thresholds to determine entity fate
   *
   * Returns:
   * - 'reject': Confidence below minimum threshold
   * - 'review': Confidence between review and auto thresholds
   * - 'auto': Confidence above auto threshold
   *
   * @param confidence - Calculated confidence score (0.0-1.0)
   * @param minThreshold - Minimum acceptable confidence
   * @param reviewThreshold - Threshold for requiring review
   * @param autoThreshold - Threshold for auto-creation
   * @returns Quality decision: 'reject' | 'review' | 'auto'
   */
  private applyQualityThresholds(
    confidence: number,
    minThreshold: number,
    reviewThreshold: number,
    autoThreshold: number
  ): 'reject' | 'review' | 'auto' {
    if (confidence < minThreshold) {
      return 'reject';
    }

    if (confidence < autoThreshold) {
      // Between min and auto thresholds
      // If also below review threshold, mark for review
      if (confidence < reviewThreshold) {
        return 'review';
      }
      // Between review and auto: still mark for review to be safe
      return 'review';
    }

    // Above auto threshold: high confidence, auto-create
    return 'auto';
  }

  /**
   * Get worker statistics
   */
  stats() {
    return {
      processed: this.processedCount,
      succeeded: this.successCount,
      failed: this.failureCount,
      rateLimiter: this.rateLimiter.getStatus(),
    };
  }

  /**
   * Create completion notification for user
   */
  private async createCompletionNotification(
    job: ExtractionJobDto,
    params: {
      createdObjectIds: string[];
      objectsByType: Record<string, number>;
      averageConfidence: number;
      durationSeconds: number;
      requiresReview?: number;
      lowConfidenceCount?: number;
    }
  ): Promise<void> {
    try {
      // Skip notification if job has no creator (e.g., system-generated jobs)
      if (!job.subject_id) {
        this.logger.debug(
          `Skipping notification for job ${job.id} - no user context`
        );
        return;
      }

      const organizationId = await this.getOrganizationId(job);
      if (!organizationId) {
        this.logger.warn(
          `Skipping completion notification for job ${job.id} - missing organization context`
        );
        return;
      }

      // Get document name from source metadata
      const documentName =
        job.source_metadata?.filename ||
        job.source_metadata?.source_url ||
        `Document ${job.source_id}`;

      await this.notificationsService.notifyExtractionCompleted({
        userId: job.subject_id,
        projectId: job.project_id,
        documentId: job.source_id || '',
        documentName,
        jobId: job.id,
        entitiesCreated: params.createdObjectIds.length,
        requiresReview: params.requiresReview,
        objectsByType: params.objectsByType,
        averageConfidence: params.averageConfidence,
        durationSeconds: params.durationSeconds,
        lowConfidenceCount: params.lowConfidenceCount,
      });

      this.logger.log(`Created completion notification for job ${job.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to create completion notification for job ${job.id}`,
        error
      );
      // Don't throw - notification failure shouldn't fail the job
    }
  }

  /**
   * Create failure notification for user
   */
  private async createFailureNotification(
    job: ExtractionJobDto,
    params: {
      errorMessage: string;
      willRetry: boolean;
    }
  ): Promise<void> {
    try {
      // Skip notification if job has no creator (e.g., system-generated jobs)
      if (!job.subject_id) {
        this.logger.debug(
          `Skipping failure notification for job ${job.id} - no user context`
        );
        return;
      }

      const organizationId = await this.getOrganizationId(job);
      if (!organizationId) {
        this.logger.warn(
          `Skipping failure notification for job ${job.id} - missing organization context`
        );
        return;
      }

      const documentName =
        job.source_metadata?.filename ||
        job.source_metadata?.source_url ||
        `Document ${job.source_id}`;

      // Get retry count from job
      const retryCount = await this.getJobRetryCount(job.id);

      await this.notificationsService.notifyExtractionFailed({
        userId: job.subject_id,
        projectId: job.project_id,
        documentId: job.source_id || '',
        documentName,
        jobId: job.id,
        errorMessage: params.errorMessage,
        retryCount,
        willRetry: params.willRetry,
      });

      this.logger.log(`Created failure notification for job ${job.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to create failure notification for job ${job.id}`,
        error
      );
    }
  }

  /**
   * Count objects by type from extraction result
   */
  private countObjectsByType(
    entities: any[],
    createdObjectIds: string[]
  ): Record<string, number> {
    const counts: Record<string, number> = {};

    // Only count entities that were actually created
    const createdSet = new Set(createdObjectIds);

    for (const entity of entities) {
      // Check if this entity was created (has ID in createdObjectIds)
      // This is a simplification - in reality we'd need to track which entity maps to which object ID
      const typeName = entity.type || 'Unknown';
      counts[typeName] = (counts[typeName] || 0) + 1;
    }

    return counts;
  }

  /**
   * Calculate average confidence from extracted entities
   */
  private calculateAverageConfidence(entities: any[]): number {
    if (entities.length === 0) return 0;

    const totalConfidence = entities.reduce((sum, entity) => {
      return sum + (entity.confidence || 0);
    }, 0);

    return totalConfidence / entities.length;
  }

  /**
   * Check if job will be retried based on current retry count
   */
  private async willRetryJob(jobId: string): Promise<boolean> {
    const retryCount = await this.getJobRetryCount(jobId);
    const maxRetries = 3;
    return retryCount < maxRetries;
  }

  /**
   * Get current retry count for a job
   * MIGRATED: Session 20 - Delegates to ExtractionJobService
   */
  private async getJobRetryCount(jobId: string): Promise<number> {
    return this.jobService.getRetryCount(jobId);
  }

  /**
   * Generate a valid key from an entity name
   * Required because graph_objects.key is NOT NULL
   *
   * @param name - The entity name (e.g., "Sweden", "John Doe")
   * @param typeName - The entity type (e.g., "Location", "Person")
   * @returns A normalized key suitable for graph_objects.key column
   */
  private generateKeyFromName(name: string, typeName: string): string {
    // Normalize: lowercase, replace spaces/special chars with hyphens
    const normalized = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
      .substring(0, 64); // Respect max key length

    // Add type prefix to avoid collisions across types
    const typePrefix = typeName.toLowerCase().substring(0, 16);

    // Generate short hash suffix to handle potential duplicates
    const hash = require('crypto')
      .createHash('md5')
      .update(`${typeName}:${name}`)
      .digest('hex')
      .substring(0, 8);

    return `${typePrefix}-${normalized}-${hash}`.substring(0, 128);
  }

  /**
   * Resolve an entity reference to a UUID.
   *
   * Resolution order:
   * 1. If ref.id is provided, validate it exists and return it
   * 2. If ref.name is provided, look up in batchEntityMap first
   * 3. Fall back to database lookup by name
   *
   * @param ref - Entity reference with name and/or id
   * @param batchEntityMap - Map of entity names (lowercase) to UUIDs from current extraction
   * @param projectId - Project ID for database lookups
   * @returns UUID of the resolved entity, or null if not found
   */
  private async resolveEntityReference(
    ref: { name?: string; id?: string },
    batchEntityMap: Map<string, string>,
    projectId: string
  ): Promise<string | null> {
    // 1. If ID is provided, validate and return
    if (ref.id) {
      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(ref.id)) {
        this.logger.warn(
          `[resolveEntityReference] Invalid UUID format: ${ref.id}`
        );
        return null;
      }

      // Verify it exists in database
      try {
        const result = await this.db.runWithTenantContext(projectId, async () =>
          this.db.query<{ id: string }>(
            `SELECT id FROM kb.graph_objects
             WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
             LIMIT 1`,
            [ref.id, projectId]
          )
        );

        if (result.rowCount && result.rowCount > 0) {
          return ref.id;
        }
        this.logger.warn(
          `[resolveEntityReference] Entity not found by ID: ${ref.id}`
        );
        return null;
      } catch {
        return null;
      }
    }

    // 2. If name is provided, try batch map first
    if (ref.name) {
      const normalizedName = ref.name.toLowerCase().trim();

      // Check batch map (entities from current extraction)
      if (batchEntityMap.has(normalizedName)) {
        return batchEntityMap.get(normalizedName)!;
      }

      // 3. Fall back to database lookup by name
      try {
        const result = await this.db.runWithTenantContext(projectId, async () =>
          this.db.query<{ id: string }>(
            `SELECT id FROM kb.graph_objects
             WHERE project_id = $1
               AND branch_id IS NULL
               AND deleted_at IS NULL
               AND properties->>'name' ILIKE $2
             ORDER BY created_at DESC
             LIMIT 1`,
            [projectId, ref.name]
          )
        );

        if (result.rowCount && result.rowCount > 0) {
          // Cache for future lookups
          batchEntityMap.set(normalizedName, result.rows[0].id);
          return result.rows[0].id;
        }
      } catch (error) {
        this.logger.debug(
          `[resolveEntityReference] DB lookup failed for name: ${ref.name}`
        );
      }
    }

    return null;
  }

  /**
   * Find existing entities similar to a document's chunks using vector search.
   *
   * This method:
   * 1. Gets the document's chunk embeddings
   * 2. Searches for existing graph objects with similar embeddings
   * 3. Returns unique entities as context for the LLM
   *
   * @param documentId - The document being processed
   * @param projectId - The project to search within
   * @param limit - Maximum number of entities to return (default 30)
   * @param maxDistance - Maximum cosine distance threshold (default 0.5)
   */
  private async findSimilarExistingEntities(
    documentId: string,
    projectId: string,
    limit: number = 30,
    maxDistance: number = 0.5
  ): Promise<ExistingEntityContext[]> {
    try {
      // 1. Get chunk embeddings for the document
      const chunkResult = await this.db.query<{
        id: string;
        embedding: string | number[];
      }>(
        `SELECT id, embedding 
         FROM kb.chunks 
         WHERE document_id = $1 AND embedding IS NOT NULL
         LIMIT 5`, // Use first 5 chunks for efficiency
        [documentId]
      );

      if (!chunkResult.rowCount || chunkResult.rowCount === 0) {
        this.logger.debug(
          `[findSimilarEntities] No embeddings found for document ${documentId}`
        );
        return [];
      }

      // 2. Search for similar entities using each chunk embedding
      const seenIds = new Set<string>();
      const results: ExistingEntityContext[] = [];

      for (const chunk of chunkResult.rows) {
        // Parse embedding if it's a string
        let embedding: number[];
        if (typeof chunk.embedding === 'string') {
          // Handle pgvector string format: "[1,2,3,...]" - already valid JSON
          embedding = JSON.parse(chunk.embedding);
        } else if (Array.isArray(chunk.embedding)) {
          embedding = chunk.embedding;
        } else {
          // pgvector may return a typed array or other format
          this.logger.warn(
            `[findSimilarEntities] Unexpected embedding type: ${typeof chunk.embedding}`
          );
          continue;
        }

        this.logger.debug(
          `[findSimilarEntities] Chunk ${chunk.id}: embedding dim=${
            embedding.length
          }, first few values=[${embedding.slice(0, 3).join(',')}]`
        );

        // Search for similar objects
        const searchResults = await this.vectorSearchService.searchByVector(
          embedding,
          {
            projectId,
            limit: Math.ceil(limit / chunkResult.rowCount), // Distribute limit across chunks
            maxDistance,
          }
        );

        this.logger.debug(
          `[findSimilarEntities] Vector search returned ${searchResults.length} results`
        );

        // 3. Fetch entity details with properties and relationships for each result
        for (const result of searchResults) {
          if (seenIds.has(result.id)) continue;
          seenIds.add(result.id);

          // Fetch entity details with full properties
          const entityResult = await this.db.query<{
            id: string;
            type: string;
            properties: Record<string, any>;
          }>(
            `SELECT id, type, properties 
             FROM kb.graph_objects 
             WHERE id = $1 AND deleted_at IS NULL`,
            [result.id]
          );

          if (entityResult.rowCount && entityResult.rowCount > 0) {
            const entity = entityResult.rows[0];

            // Fetch relationships (one level deep) - both outgoing and incoming
            // Note: graph_relationships uses src_id/dst_id column names
            const relationshipsResult = await this.db.query<{
              rel_type: string;
              direction: 'outgoing' | 'incoming';
              related_name: string;
              related_type: string;
            }>(
              `SELECT 
                 r.type as rel_type,
                 CASE WHEN r.src_id = $1 THEN 'outgoing' ELSE 'incoming' END as direction,
                 COALESCE(go.properties->>'name', go.key) as related_name,
                 go.type as related_type
               FROM kb.graph_relationships r
               JOIN kb.graph_objects go ON (
                 CASE WHEN r.src_id = $1 THEN r.dst_id ELSE r.src_id END = go.id
               )
               WHERE (r.src_id = $1 OR r.dst_id = $1)
                 AND r.deleted_at IS NULL
                 AND go.deleted_at IS NULL
               LIMIT 10`,
              [result.id]
            );

            const relationships = relationshipsResult.rows.map((r) => ({
              type: r.rel_type,
              direction: r.direction,
              related_entity_name: r.related_name,
              related_entity_type: r.related_type,
            }));

            // Extract name and description, filter out internal properties (those starting with _)
            const { name, description, ...rawOtherProperties } =
              entity.properties || {};

            // Filter out internal/metadata properties (prefixed with _)
            const filteredProperties = Object.fromEntries(
              Object.entries(rawOtherProperties).filter(
                ([key]) => !key.startsWith('_')
              )
            );

            results.push({
              id: entity.id,
              name: name || `Unnamed ${entity.type}`,
              type_name: entity.type,
              description: description,
              properties:
                Object.keys(filteredProperties).length > 0
                  ? filteredProperties
                  : undefined,
              relationships:
                relationships.length > 0 ? relationships : undefined,
            });
          }

          // Stop if we have enough
          if (results.length >= limit) break;
        }

        if (results.length >= limit) break;
      }

      this.logger.debug(
        `[findSimilarEntities] Found ${results.length} similar entities for document ${documentId}`
      );

      return results;
    } catch (error) {
      this.logger.warn(
        `[findSimilarEntities] Error finding similar entities: ${
          (error as Error).message
        }`
      );
      return [];
    }
  }
}
