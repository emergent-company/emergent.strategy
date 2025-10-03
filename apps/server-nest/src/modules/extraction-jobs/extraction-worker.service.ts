import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../../common/config/config.service';
import { DatabaseService } from '../../common/database/database.service';
import { ExtractionJobService } from './extraction-job.service';
import { LLMProviderFactory } from './llm/llm-provider.factory';
import { RateLimiterService } from './rate-limiter.service';
import { ConfidenceScorerService } from './confidence-scorer.service';
import { EntityLinkingService } from './entity-linking.service';
import { GraphService } from '../graph/graph.service';
import { DocumentsService } from '../documents/documents.service';
import { ExtractionJobDto } from './dto/extraction-job.dto';

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
        private readonly llmFactory: LLMProviderFactory,
        private readonly rateLimiter: RateLimiterService,
        private readonly confidenceScorer: ConfidenceScorerService,
        private readonly entityLinking: EntityLinkingService,
        private readonly graphService: GraphService,
        private readonly documentsService: DocumentsService,
    ) { }

    onModuleInit() {
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

        this.start();
    }

    onModuleDestroy() {
        this.stop();
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

        try {
            // 1. Load document content
            const documentContent = await this.loadDocumentContent(job);
            if (!documentContent) {
                throw new Error('Failed to load document content');
            }

            // 2. Load extraction prompt from template pack
            const extractionPrompt = await this.loadExtractionPrompt(job);
            if (!extractionPrompt) {
                throw new Error('No extraction prompt configured for this project');
            }

            // 3. Wait for rate limit capacity
            const estimatedTokens = this.estimateTokens(documentContent, extractionPrompt);
            const allowed = await this.rateLimiter.waitForCapacity(estimatedTokens, 60000);

            if (!allowed) {
                throw new Error('Rate limit exceeded, job will retry later');
            }

            // 4. Call LLM provider to extract entities
            const llmProvider = this.llmFactory.getProvider();
            const allowedTypes = this.extractAllowedTypes(job);

            const extractionResult = await llmProvider.extractEntities(
                documentContent,
                extractionPrompt,
                allowedTypes
            );

            // 5. Report actual token usage
            if (extractionResult.usage) {
                this.rateLimiter.reportActualUsage(
                    estimatedTokens,
                    extractionResult.usage.total_tokens
                );
            }

            // 6. Create graph objects from extracted entities
            const createdObjectIds: string[] = [];
            const reviewRequiredObjectIds: string[] = [];
            const rejectedCount = { value: 0 };
            const strategy = this.config.extractionEntityLinkingStrategy;

            // Get confidence thresholds
            const minThreshold = this.config.extractionConfidenceThresholdMin;
            const reviewThreshold = this.config.extractionConfidenceThresholdReview;
            const autoThreshold = this.config.extractionConfidenceThresholdAuto;

            for (const entity of extractionResult.entities) {
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
                        rejectedCount.value++;
                        this.logger.debug(
                            `Rejected entity ${entity.name}: confidence ${finalConfidence.toFixed(3)} ` +
                            `below minimum threshold ${minThreshold}`
                        );
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
                        continue;
                    }

                    // linkingDecision.action === 'create' - create new object
                    if (linkingDecision.action === 'create') {
                        // Determine labels based on quality decision
                        const labels: string[] = [];
                        if (qualityDecision === 'review') {
                            labels.push('requires_review');
                        }

                        const graphObject = await this.graphService.createObject({
                            org_id: job.org_id,
                            project_id: job.project_id,
                            type: entity.type_name,
                            key: entity.business_key || undefined,
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

                        this.logger.debug(
                            `Created object ${graphObject.id}: ${entity.type_name} - ${entity.name} ` +
                            `(confidence: ${finalConfidence.toFixed(3)}, decision: ${qualityDecision})`
                        );
                    }
                } catch (error) {
                    this.logger.warn(`Failed to create object for entity ${entity.name}`, error);
                    // Continue processing other entities
                }
            }

            // 7. Mark job as completed or requires_review
            const requiresReview = reviewRequiredObjectIds.length > 0;

            if (requiresReview) {
                // Job needs human review
                await this.jobService.markCompleted(job.id, {
                    created_objects: createdObjectIds,
                    discovered_types: extractionResult.discovered_types,
                    successful_items: extractionResult.entities.length - rejectedCount.value,
                    total_items: extractionResult.entities.length,
                    rejected_items: rejectedCount.value,
                    review_required_count: reviewRequiredObjectIds.length,
                }, 'requires_review');

                this.logger.log(
                    `Extraction job ${job.id} requires review: ` +
                    `${reviewRequiredObjectIds.length} objects need human validation, ` +
                    `${rejectedCount.value} rejected`
                );
            } else {
                // Job completed successfully
                await this.jobService.markCompleted(job.id, {
                    created_objects: createdObjectIds,
                    discovered_types: extractionResult.discovered_types,
                    successful_items: extractionResult.entities.length - rejectedCount.value,
                    total_items: extractionResult.entities.length,
                    rejected_items: rejectedCount.value,
                });
            }

            const duration = Date.now() - startTime;
            this.logger.log(
                `Completed extraction job ${job.id}: ` +
                `${createdObjectIds.length} objects created, ` +
                `${rejectedCount.value} rejected, ` +
                `${reviewRequiredObjectIds.length} need review, ` +
                `${extractionResult.discovered_types?.length || 0} types discovered, ` +
                `${duration}ms`
            );

            this.processedCount++;
            this.successCount++;

        } catch (error) {
            this.logger.error(`Extraction job ${job.id} failed`, error);

            await this.jobService.markFailed(
                job.id,
                error instanceof Error ? error.message : 'Unknown error',
                {
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                }
            );

            this.processedCount++;
            this.failureCount++;
        }
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
     * Load extraction prompt from project's template pack
     */
    private async loadExtractionPrompt(job: ExtractionJobDto): Promise<string | null> {
        // Get project's assigned template pack
        const result = await this.db.query<{
            extraction_prompts: any;
            default_prompt_key: string | null;
        }>(
            `SELECT tp.extraction_prompts, ptp.config->>'default_prompt_key' as default_prompt_key
             FROM kb.project_template_packs ptp
             JOIN kb.graph_template_packs tp ON tp.id = ptp.template_pack_id
             WHERE ptp.project_id = $1 AND ptp.enabled = true
             LIMIT 1`,
            [job.project_id]
        );

        if (!result.rowCount) {
            return null;
        }

        const extractionPrompts = result.rows[0].extraction_prompts || {};
        const defaultKey = result.rows[0].default_prompt_key || 'default';

        // Allow job config to override prompt key
        const promptKey = job.extraction_config?.prompt_key || defaultKey;
        const prompt = extractionPrompts[promptKey];

        if (!prompt) {
            this.logger.warn(`No extraction prompt found for key: ${promptKey}`);
            return null;
        }

        return prompt;
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
}
