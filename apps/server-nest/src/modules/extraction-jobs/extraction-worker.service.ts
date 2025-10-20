import { ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../../common/config/config.service';
import { DatabaseService } from '../../common/database/database.service';
import { ExtractionJobService } from './extraction-job.service';
import { ExtractionLoggerService } from './extraction-logger.service';
import { LLMProviderFactory } from './llm/llm-provider.factory';
import { RateLimiterService } from './rate-limiter.service';
import { ConfidenceScorerService } from './confidence-scorer.service';
import { EntityLinkingService } from './entity-linking.service';
import { GraphService } from '../graph/graph.service';
import { DocumentsService } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ExtractionJobDto } from './dto/extraction-job.dto';
import type { ExtractionResult } from './llm/llm-provider.interface';
import { TemplatePackService } from '../template-packs/template-pack.service';

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
}

const toErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

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

    // In-memory metrics (reset on restart)
    private processedCount = 0;
    private successCount = 0;
    private failureCount = 0;

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
    ) { }

    /**
     * Counter for step indexing within a job
     * Reset for each job processing
     */
    private stepCounter = 0;

    private getOrganizationId(job: ExtractionJobDto): string | null {
        return job.organization_id ?? job.org_id ?? null;
    }

    async onModuleInit() {
        // Only start if extraction worker is enabled and DB is online
        if (!this.db.isOnline()) {
            this.logger.warn('Database offline at worker init; extraction worker idle.');
            return;
        }

        if (!this.config.extractionWorkerEnabled) {
            this.logger.log('Extraction worker disabled (EXTRACTION_WORKER_ENABLED=false)');
            return;
        }

        if (!this.llmFactory.isAvailable()) {
            this.logger.warn('Extraction worker disabled: no LLM provider configured (set VERTEX_AI_PROJECT_ID)');
            return;
        }

        // Recover orphaned jobs from previous server crash/restart
        await this.recoverOrphanedJobs();

        this.start();
    }

    onModuleDestroy() {
        this.stop();
    }

    /**
     * Recover orphaned jobs that were stuck in 'running' status due to server restart
     * 
     * Jobs are considered orphaned if:
     * - Status is 'running'
     * - Updated more than 5 minutes ago (likely interrupted)
     * 
     * These jobs are reset to 'pending' so they can be retried.
     */
    private async recoverOrphanedJobs(): Promise<void> {
        try {
            const orphanThresholdMinutes = 5;

            const result = await this.db.query<{
                id: string;
                source_type: string;
                started_at: string | null;
                organization_id: string | null;
                tenant_id: string | null;
                project_id: string | null;
            }>(
                `SELECT id,
                        source_type,
                        started_at,
                        organization_id,
                        tenant_id,
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
                const orgId = row.organization_id ?? row.tenant_id ?? null;
                const projectId = row.project_id ?? null;

                if (!orgId || !projectId) {
                    this.logger.warn(
                        `Skipping orphaned job ${row.id} (${row.source_type}) - missing organization/project context (org=${orgId}, tenant=${row.tenant_id}, project=${projectId})`
                    );
                    continue;
                }

                try {
                    const updateResult = await this.db.runWithTenantContext(orgId, projectId, async () =>
                        this.db.query<{ id: string }>(
                            `UPDATE kb.object_extraction_jobs
                             SET status = 'pending',
                                 started_at = NULL,
                                 updated_at = NOW(),
                                 error_message = CASE
                                     WHEN error_message ILIKE '%has been reset to pending.%' THEN error_message
                                     ELSE COALESCE(error_message || E'\n\n', '') ||
                                         'Job was interrupted by server restart and has been reset to pending.'
                                 END
                             WHERE id = $1
                               AND status = 'running'
                             RETURNING id`,
                            [row.id]
                        )
                    );

                    if (updateResult.rowCount && updateResult.rowCount > 0) {
                        recovered.push(row.id);
                        const startedAt = row.started_at ? ` (started ${row.started_at})` : '';
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
                    `Recovered ${recovered.length} orphaned extraction job(s) from 'running' to 'pending': ${recovered.join(', ')}`
                );
            } else {
                this.logger.log('No orphaned extraction jobs required updates - all clear');
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

        const pollInterval = intervalMs || this.config.extractionWorkerPollIntervalMs;
        this.running = true;

        const tick = async () => {
            if (!this.running) return;

            try {
                await this.processBatch();
            } catch (error) {
                this.logger.error('processBatch failed', error);
            }

            this.timer = setTimeout(tick, pollInterval);
        };

        this.timer = setTimeout(tick, pollInterval);
        this.logger.log(`Extraction worker started (interval=${pollInterval}ms, batch=${this.config.extractionWorkerBatchSize})`);
    }

    /**
     * Stop the polling loop
     */
    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.running = false;
        this.logger.log('Extraction worker stopped');
    }

    /**
     * Process a batch of pending extraction jobs
     * 
     * Public for testing purposes
     */
    async processBatch() {
        const batchSize = this.config.extractionWorkerBatchSize;
        const jobs = await this.jobService.dequeueJobs(batchSize);

        if (jobs.length === 0) {
            return;
        }

        this.logger.log(`Processing batch of ${jobs.length} extraction jobs`);

        for (const job of jobs) {
            await this.processJob(job);
        }
    }

    /**
     * Process a single extraction job
     */
    private async processJob(job: ExtractionJobDto) {
        const startTime = Date.now();
        this.logger.log(`Processing extraction job ${job.id} (source: ${job.source_type})`);

        // Reset step counter for this job
        this.stepCounter = 0;

        // Log the start of the job with its configuration
        void this.extractionLogger.logStep({
            extractionJobId: job.id,
            stepIndex: this.stepCounter++,
            operationType: 'chunk_processing',
            operationName: 'job_started',
            inputData: job,
        });

        // Log the start of the job with its configuration
        this.extractionLogger.logStep({
            extractionJobId: job.id,
            stepIndex: this.stepCounter++,
            operationType: 'chunk_processing',
            operationName: 'job_started',
            inputData: job,
        });

        // Log the start of the job with its configuration
        await this.extractionLogger.logStep({
            extractionJobId: job.id,
            stepIndex: this.stepCounter++,
            operationType: 'chunk_processing',
            operationName: 'job_started',
            inputData: job,
        });

        // Log the start of the job with its configuration
        await this.extractionLogger.logStep({
            extractionJobId: job.id,
            stepIndex: this.stepCounter++,
            operationType: 'chunk_processing',
            operationName: 'job_started',
            inputData: job,
        });

        const timeline: TimelineEvent[] = [];
        let providerName = this.llmFactory.getProviderName();
        let extractionResult: ExtractionResult | null = null;

        const pushTimelineEvent = (
            step: string,
            status: TimelineEventStatus,
            details?: { message?: string; metadata?: Record<string, any>; durationMs?: number }
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

            const durationText = details?.durationMs !== undefined ? ` duration=${details.durationMs}ms` : '';
            const messageText = details?.message ? ` message=${details.message}` : '';
            const metadataText = details?.metadata && Object.keys(details.metadata).length > 0
                ? ` metadata=${JSON.stringify(details.metadata)}`
                : '';

            this.logger.debug(
                `[TIMELINE] Job ${job.id} step=${step} status=${status}${durationText}${messageText}${metadataText}`
            );
        };

        const beginTimelineStep = (
            step: string,
            metadata?: Record<string, any>
        ) => {
            const startedAt = Date.now();
            return (
                status: TimelineEventStatus,
                details?: { message?: string; metadata?: Record<string, any> }
            ) => {
                pushTimelineEvent(step, status, {
                    durationMs: Date.now() - startedAt,
                    message: details?.message,
                    metadata: {
                        ...(metadata ?? {}),
                        ...(details?.metadata ?? {}),
                    },
                });
            };
        };

        pushTimelineEvent('job_started', 'info', {
            metadata: {
                source_type: job.source_type,
                project_id: job.project_id,
                organization_id: job.organization_id ?? job.org_id ?? null,
            },
        });

        try {
            // Log the start of the job with its configuration
            await this.extractionLogger.logStep({
                extractionJobId: job.id,
                stepIndex: this.stepCounter++,
                operationType: 'chunk_processing',
                operationName: 'job_started',
                inputData: job,
            });

            // 1. Load document content
            const documentStep = beginTimelineStep('load_document', {
                source_id: job.source_id ?? null,
                source_type: job.source_type,
            });

            const documentContent = await this.loadDocumentContent(job).catch((error) => {
                const message = toErrorMessage(error);
                documentStep('error', { message });
                throw error;
            });

            if (!documentContent) {
                const message = 'Failed to load document content';
                documentStep('error', { message });
                throw new Error(message);
            }

            documentStep('success', {
                metadata: {
                    character_count: documentContent.length,
                },
            });

            // 2. Load extraction config (prompt + schemas) from template pack
            const promptStep = beginTimelineStep('load_prompt', {
                template_pack_strategy: this.config.extractionEntityLinkingStrategy,
            });

            const extractionConfig = await this.loadExtractionConfig(job).catch((error: Error) => {
                const message = toErrorMessage(error);
                promptStep('error', { message });
                throw error;
            });

            if (!extractionConfig.prompt) {
                const message = 'No extraction prompt configured for this project';
                promptStep('error', { message });
                throw new Error(message);
            }

            const extractionPrompt = extractionConfig.prompt;
            const objectSchemas = extractionConfig.objectSchemas;

            promptStep('success', {
                metadata: {
                    prompt_length: extractionPrompt.length,
                    schema_count: Object.keys(objectSchemas).length,
                },
            });

            // 3. Wait for rate limit capacity
            const estimatedTokens = this.estimateTokens(documentContent, extractionPrompt);
            const rateLimitStep = beginTimelineStep('rate_limit', {
                estimated_tokens: estimatedTokens,
            });

            const allowed = await this.rateLimiter.waitForCapacity(estimatedTokens, 60000);

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
            const allowedTypes = this.extractAllowedTypes(job);

            const llmStep = beginTimelineStep('llm_extract', {
                provider: providerName,
                allowed_types: allowedTypes ?? null,
            });

            // Track LLM call timing for detailed logs
            const llmCallStartTime = Date.now();

            try {
                // Log LLM call input (prompt, content preview, config)
                await this.extractionLogger.logStep({
                    extractionJobId: job.id,
                    stepIndex: this.stepCounter++,
                    operationType: 'llm_call',
                    operationName: 'extract_entities',
                    inputData: {
                        prompt: extractionPrompt,
                        content_preview: documentContent.substring(0, 500) + (documentContent.length > 500 ? '...' : ''),
                        content_length: documentContent.length,
                        allowed_types: allowedTypes,
                        schema_types: Object.keys(objectSchemas),
                    },
                    metadata: {
                        provider: providerName,
                        model: this.config.vertexAiModel, // Current model used
                    },
                }); const result = await llmProvider.extractEntities(
                    documentContent,
                    extractionPrompt,
                    objectSchemas,
                    allowedTypes
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
                    const errorMessage = firstError?.error || firstError?.message || 'All LLM extraction calls failed';

                    const fatalError = new Error(errorMessage);
                    (fatalError as Error & { llmStepMetadata?: Record<string, any> }).llmStepMetadata = {
                        failed_calls: llmCalls.length,
                    };
                    throw fatalError;
                }

                extractionResult = result;

                // Log LLM call output (entities, response, tokens)
                await this.extractionLogger.logStep({
                    extractionJobId: job.id,
                    stepIndex: this.stepCounter++,
                    operationType: 'llm_call',
                    operationName: 'extract_entities',
                    status: 'success',
                    outputData: {
                        entities_count: result.entities.length,
                        entities: result.entities.map(e => ({
                            type: e.type_name,
                            name: e.name,
                            properties: e.properties,
                        })),
                        discovered_types: result.discovered_types,
                        raw_response: result.raw_response, // Full LLM response for inspection
                    },
                    durationMs: Date.now() - llmCallStartTime,
                    tokensUsed: result.usage?.total_tokens ?? undefined,
                    metadata: {
                        provider: providerName,
                        prompt_tokens: result.usage?.prompt_tokens,
                        completion_tokens: result.usage?.completion_tokens,
                    },
                });

                llmStep('success', {
                    metadata: {
                        entities: result.entities.length,
                        discovered_types: result.discovered_types?.length ?? 0,
                    },
                });
            } catch (error) {
                const message = toErrorMessage(error);
                const metadata = (error as Error & { llmStepMetadata?: Record<string, any> })?.llmStepMetadata;

                // Log LLM call error
                await this.extractionLogger.logStep({
                    extractionJobId: job.id,
                    stepIndex: this.stepCounter++,
                    operationType: 'error',
                    operationName: 'extract_entities',
                    status: 'error',
                    errorMessage: message,
                    errorStack: (error as Error).stack,
                    durationMs: Date.now() - llmCallStartTime,
                    metadata: {
                        provider: providerName,
                        ...metadata,
                    },
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

            let rejectedCount = 0;

            const recordProgress = async (progressOutcome: EntityOutcome) => {
                if (totalEntities === 0) {
                    return;
                }

                processedEntities += 1;
                outcomeCounts[progressOutcome] += 1;

                try {
                    await this.jobService.updateProgress(job.id, processedEntities, totalEntities);
                } catch (progressUpdateError) {
                    this.logger.warn(
                        `Failed to update progress for job ${job.id} at ${processedEntities}/${totalEntities}`,
                        progressUpdateError as Error
                    );
                }

                const percentComplete = Math.round((processedEntities / totalEntities) * 100);
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
                        `[PROGRESS] Job ${job.id}: initialized progress tracking for ${totalEntities} entity${totalEntities === 1 ? '' : 'ies'}`
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
                this.logger.log(`Extraction job ${job.id} produced no entities to process`);
                pushTimelineEvent('progress_skipped', 'info', {
                    message: 'No entities returned from extraction',
                });
            }

            // 6. Create graph objects from extracted entities
            const createdObjectIds: string[] = [];
            const reviewRequiredObjectIds: string[] = [];
            const strategy = this.config.extractionEntityLinkingStrategy;

            // Get confidence thresholds
            const minThreshold = this.config.extractionConfidenceThresholdMin;
            const reviewThreshold = this.config.extractionConfidenceThresholdReview;
            const autoThreshold = this.config.extractionConfidenceThresholdAuto;

            const graphStep = beginTimelineStep('graph_upsert', {
                strategy,
            });

            for (const entity of extractionResult.entities) {
                let outcome: 'created' | 'merged' | 'skipped' | 'rejected' | 'failed' = 'skipped';

                try {
                    // Calculate confidence score using multi-factor algorithm
                    const calculatedConfidence = this.confidenceScorer.calculateConfidence(entity, allowedTypes);

                    // Use calculated confidence (overrides LLM-provided confidence if present)
                    const finalConfidence = calculatedConfidence;

                    this.logger.debug(
                        `Entity ${entity.name}: calculated confidence=${finalConfidence.toFixed(3)} ` +
                        `(LLM: ${entity.confidence?.toFixed(3) || 'N/A'})`
                    );

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
                            `Rejected entity ${entity.name}: confidence ${finalConfidence.toFixed(3)} ` +
                            `below minimum threshold ${minThreshold}`
                        );
                        outcome = 'rejected';
                        await recordProgress(outcome);
                        continue; // Skip this entity
                    }

                    // Apply entity linking strategy
                    const linkingDecision = await this.entityLinking.decideMergeAction(
                        entity,
                        job.project_id,
                        strategy as 'key_match' | 'vector_similarity' | 'always_new'
                    );

                    if (linkingDecision.action === 'skip') {
                        // Object already exists with high similarity, skip creation
                        this.logger.debug(
                            `Skipped entity ${entity.name}: already exists as ${linkingDecision.existingObjectId}`
                        );
                        outcome = 'skipped';
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

                        if (qualityDecision === 'review') {
                            reviewRequiredObjectIds.push(linkingDecision.existingObjectId!);
                        }

                        this.logger.debug(
                            `Merged entity ${entity.name} into existing object ${linkingDecision.existingObjectId} ` +
                            `(confidence: ${finalConfidence.toFixed(3)}, decision: ${qualityDecision})`
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

                        // Generate a valid key if business_key is missing
                        // graph_objects.key is NOT NULL so we must provide a value
                        const objectKey = entity.business_key || this.generateKeyFromName(entity.name, entity.type_name);

                        // Log object creation input
                        const objectCreationStartTime = Date.now();
                        await this.extractionLogger.logStep({
                            extractionJobId: job.id,
                            stepIndex: this.stepCounter++,
                            operationType: 'object_creation',
                            operationName: 'create_graph_object',
                            inputData: {
                                entity_type: entity.type_name,
                                entity_name: entity.name,
                                entity_key: objectKey,
                                entity_description: entity.description,
                                entity_properties: entity.properties,
                                confidence: finalConfidence,
                                quality_decision: qualityDecision,
                            },
                            metadata: {
                                org_id: job.org_id,
                                project_id: job.project_id,
                            },
                        });

                        const graphObject = await this.graphService.createObject({
                            org_id: job.org_id,
                            project_id: job.project_id,
                            type: entity.type_name,
                            key: objectKey,
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

                        if (qualityDecision === 'review') {
                            reviewRequiredObjectIds.push(graphObject.id);
                        }

                        // Log successful object creation
                        await this.extractionLogger.logStep({
                            extractionJobId: job.id,
                            stepIndex: this.stepCounter++,
                            operationType: 'object_creation',
                            operationName: 'create_graph_object',
                            status: 'success',
                            outputData: {
                                object_id: graphObject.id,
                                entity_name: entity.name,
                                entity_type: entity.type_name,
                                quality_decision: qualityDecision,
                                requires_review: qualityDecision === 'review',
                            },
                            durationMs: Date.now() - objectCreationStartTime,
                            metadata: {
                                confidence: finalConfidence,
                            },
                        });

                        this.logger.debug(
                            `Created object ${graphObject.id}: ${entity.type_name} - ${entity.name} ` +
                            `(confidence: ${finalConfidence.toFixed(3)}, decision: ${qualityDecision})`
                        );
                        outcome = 'created';
                    }
                } catch (error) {
                    outcome = 'failed';
                    const err = error instanceof Error ? error : new Error(String(error));

                    // Log object creation error
                    await this.extractionLogger.logStep({
                        extractionJobId: job.id,
                        stepIndex: this.stepCounter++,
                        operationType: 'error',
                        operationName: 'create_graph_object',
                        status: 'error',
                        errorMessage: err.message,
                        errorStack: err.stack,
                        metadata: {
                            entity_name: entity.name,
                            entity_type: entity.type_name,
                        },
                    });

                    this.logger.error(
                        `Failed to create object for entity ${entity.name}: ${err.message}`,
                        err.stack
                    );
                    // Continue processing other entities
                }

                await recordProgress(outcome);
            }

            graphStep('success', {
                metadata: {
                    created: outcomeCounts.created,
                    merged: outcomeCounts.merged,
                    skipped: outcomeCounts.skipped,
                    rejected: outcomeCounts.rejected,
                    failed: outcomeCounts.failed,
                    review_required: reviewRequiredObjectIds.length,
                },
            });

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
            });

            if (requiresReview) {
                // Job needs human review
                await this.jobService.markCompleted(job.id, {
                    created_objects: createdObjectIds,
                    discovered_types: extractionResult.discovered_types,
                    successful_items: extractionResult.entities.length - rejectedCount,
                    total_items: extractionResult.entities.length,
                    rejected_items: rejectedCount,
                    review_required_count: reviewRequiredObjectIds.length,
                    debug_info: debugInfo,
                }, 'requires_review');

                this.logger.log(
                    `Extraction job ${job.id} requires review: ` +
                    `${reviewRequiredObjectIds.length} objects need human validation, ` +
                    `${rejectedCount} rejected`
                );

                // Create notification about extraction completion (with review needed)
                await this.createCompletionNotification(job, {
                    createdObjectIds,
                    objectsByType: this.countObjectsByType(extractionResult.entities, createdObjectIds),
                    averageConfidence: this.calculateAverageConfidence(extractionResult.entities),
                    durationSeconds: (Date.now() - startTime) / 1000,
                    requiresReview: reviewRequiredObjectIds.length,
                    lowConfidenceCount: reviewRequiredObjectIds.length,
                });
            } else {
                // Job completed successfully
                await this.jobService.markCompleted(job.id, {
                    created_objects: createdObjectIds,
                    discovered_types: extractionResult.discovered_types,
                    successful_items: extractionResult.entities.length - rejectedCount,
                    total_items: extractionResult.entities.length,
                    rejected_items: rejectedCount,
                    debug_info: debugInfo,
                });

                // Create notification about successful extraction
                await this.createCompletionNotification(job, {
                    createdObjectIds,
                    objectsByType: this.countObjectsByType(extractionResult.entities, createdObjectIds),
                    averageConfidence: this.calculateAverageConfidence(extractionResult.entities),
                    durationSeconds: (Date.now() - startTime) / 1000,
                });
            }

            this.logger.log(
                `Completed extraction job ${job.id}: ` +
                `${createdObjectIds.length} objects created, ` +
                `${rejectedCount} rejected, ` +
                `${reviewRequiredObjectIds.length} need review, ` +
                `${extractionResult.discovered_types?.length || 0} types discovered, ` +
                `${duration}ms`
            );

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

        } catch (error) {
            this.logger.error(`Extraction job ${job.id} failed`, error);

            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const willRetry = await this.willRetryJob(job.id);

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

            this.processedCount++;
            this.failureCount++;
        }
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
        } = args;

        const debugInfo: Record<string, any> =
            extractionResult?.raw_response && typeof extractionResult.raw_response === 'object'
                ? { ...extractionResult.raw_response }
                : {};

        if (extractionResult?.raw_response !== undefined && typeof extractionResult.raw_response !== 'object') {
            debugInfo.raw_response = extractionResult.raw_response;
        }

        debugInfo.timeline = timeline;
        debugInfo.provider = providerName;
        debugInfo.job_id = job.id;
        debugInfo.project_id = job.project_id;
        debugInfo.organization_id = job.organization_id ?? job.org_id ?? null;
        debugInfo.job_started_at = new Date(startTime).toISOString();
        debugInfo.job_completed_at = new Date(startTime + durationMs).toISOString();
        debugInfo.job_duration_ms = durationMs;

        if (typeof debugInfo.total_entities !== 'number' && extractionResult) {
            debugInfo.total_entities = extractionResult.entities.length;
        }

        if (typeof debugInfo.types_processed !== 'number' && extractionResult?.discovered_types) {
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

        return debugInfo;
    }

    /**
     * Load document content from various sources
     */
    private async loadDocumentContent(job: ExtractionJobDto): Promise<string | null> {
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
     */
    private async loadDocumentById(documentId: string): Promise<string | null> {
        const doc = await this.documentsService.get(documentId);
        if (!doc) {
            return null;
        }

        // Load document content from kb.documents table
        const result = await this.db.query<{ content: string }>(
            `SELECT content FROM kb.documents WHERE id = $1`,
            [documentId]
        );

        if (!result.rowCount) {
            return null;
        }

        return result.rows[0].content || null;
    }

    /**
     * Load extraction configuration from project's template pack
     * Returns both the extraction prompt and object type schemas
     */
    private async loadExtractionConfig(job: ExtractionJobDto): Promise<{
        prompt: string | null;
        objectSchemas: Record<string, any>;
    }> {
        const templatePackQuery = `SELECT 
                tp.extraction_prompts, 
                tp.object_type_schemas,
                ptp.customizations->>'default_prompt_key' as default_prompt_key
            FROM kb.project_template_packs ptp
             JOIN kb.graph_template_packs tp ON tp.id = ptp.template_pack_id
             WHERE ptp.project_id = $1 AND ptp.active = true
             LIMIT 1`;

        // Get project's assigned template pack
        let result;
        try {
            this.logger.debug(`[loadExtractionConfig] Querying template pack for project: ${job.project_id}`);
            result = await this.db.query<{
                extraction_prompts: any;
                object_type_schemas: any;
                default_prompt_key: string | null;
            }>(templatePackQuery, [job.project_id]);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`[loadExtractionConfig] Query failed: ${err.message}`, err.stack);
            throw err;
        } if (!result.rowCount) {
            this.logger.warn(`No active template pack found for project ${job.project_id}`);

            const defaultTemplatePackId = this.config.extractionDefaultTemplatePackId;
            if (!defaultTemplatePackId) {
                this.logger.warn('No default extraction template pack configured; skipping auto-install');
                return { prompt: null, objectSchemas: {} };
            }

            const organizationId = this.getOrganizationId(job);
            if (!organizationId) {
                this.logger.warn(
                    `Cannot auto-install default template pack ${defaultTemplatePackId}: missing organization ID on job ${job.id}`
                );
                return { prompt: null, objectSchemas: {} };
            }

            const tenantId = (job as unknown as { tenant_id?: string }).tenant_id ?? organizationId;
            const userId = job.subject_id || (job as unknown as { created_by?: string }).created_by || SYSTEM_USER_ID;

            this.logger.debug(`[loadExtractionPrompt] Auto-install params: projectId=${job.project_id}, orgId=${organizationId}, tenantId=${tenantId}, userId=${userId}, templatePackId=${defaultTemplatePackId}`);

            try {
                this.logger.log(
                    `Auto-installing default template pack ${defaultTemplatePackId} for project ${job.project_id}`
                );
                await this.templatePacks.assignTemplatePackToProject(
                    job.project_id,
                    organizationId,
                    tenantId,
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
                    return { prompt: null, objectSchemas: {} };
                }
            }

            result = await this.db.query(templatePackQuery, [job.project_id]);

            if (!result.rowCount) {
                this.logger.warn(
                    `Default template pack ${defaultTemplatePackId} available but prompts still missing for project ${job.project_id}`
                );
                return { prompt: null, objectSchemas: {} };
            }
        }

        const extractionPrompts = result.rows[0].extraction_prompts || {};
        const objectSchemas = result.rows[0].object_type_schemas || {};
        const defaultPromptKey = result.rows[0].default_prompt_key;

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
                basePrompt = typeof value === 'string' ? value : (value as any)?.text || (value as any)?.template || value;
                this.logger.log('Using extraction base prompt from database settings');
            }
        } catch (error) {
            this.logger.warn('Failed to load extraction base prompt from database, using default', error);
        }

        this.logger.log(`Using schema-based extraction with ${Object.keys(objectSchemas).length} object type(s)`);
        return { prompt: basePrompt, objectSchemas };
    }

    /**
     * Estimate token count for rate limiting
     * 
     * Simple heuristic: ~4 characters per token
     */
    private estimateTokens(documentContent: string, extractionPrompt: string): number {
        const totalChars = documentContent.length + extractionPrompt.length;
        const estimatedTokens = Math.ceil(totalChars / 4);

        // Add buffer for response tokens (assume ~30% of input)
        const withResponseBuffer = Math.ceil(estimatedTokens * 1.3);

        return withResponseBuffer;
    }

    /**
     * Extract allowed types from job configuration
     */
    private extractAllowedTypes(job: ExtractionJobDto): string[] | undefined {
        return job.extraction_config?.target_types;
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
                this.logger.debug(`Skipping notification for job ${job.id} - no user context`);
                return;
            }

            const organizationId = this.getOrganizationId(job);
            if (!organizationId) {
                this.logger.warn(
                    `Skipping completion notification for job ${job.id} - missing organization context`
                );
                return;
            }

            // Get document name from source metadata
            const documentName = job.source_metadata?.filename ||
                job.source_metadata?.source_url ||
                `Document ${job.source_id}`;

            await this.notificationsService.notifyExtractionCompleted({
                userId: job.subject_id,
                tenantId: organizationId,
                organizationId,
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
            this.logger.error(`Failed to create completion notification for job ${job.id}`, error);
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
                this.logger.debug(`Skipping failure notification for job ${job.id} - no user context`);
                return;
            }

            const organizationId = this.getOrganizationId(job);
            if (!organizationId) {
                this.logger.warn(
                    `Skipping failure notification for job ${job.id} - missing organization context`
                );
                return;
            }

            const documentName = job.source_metadata?.filename ||
                job.source_metadata?.source_url ||
                `Document ${job.source_id}`;

            // Get retry count from job
            const retryCount = await this.getJobRetryCount(job.id);

            await this.notificationsService.notifyExtractionFailed({
                userId: job.subject_id,
                tenantId: organizationId,
                organizationId,
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
            this.logger.error(`Failed to create failure notification for job ${job.id}`, error);
        }
    }

    /**
     * Count objects by type from extraction result
     */
    private countObjectsByType(entities: any[], createdObjectIds: string[]): Record<string, number> {
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
     */
    private async getJobRetryCount(jobId: string): Promise<number> {
        try {
            const result = await this.db.query<{ retry_count: number }>(
                'SELECT retry_count FROM kb.object_extraction_jobs WHERE id = $1',
                [jobId]
            );

            return result.rows[0]?.retry_count || 0;
        } catch (error) {
            this.logger.warn(`Failed to get retry count for job ${jobId}`, error);
            return 0;
        }
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
            .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
            .replace(/^-+|-+$/g, '')      // Remove leading/trailing hyphens
            .substring(0, 64);             // Respect max key length

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
}
