import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { AppConfigService } from '../../common/config/config.service';
import { StorageService } from '../storage/storage.service';
import { DocumentParsingJobService } from './document-parsing-job.service';
import { KreuzbergClientService } from './kreuzberg-client.service';
import { EmailFileParserService } from './email-file-parser.service';
import { DocumentParsingJob } from '../../entities/document-parsing-job.entity';
import { shouldUseKreuzberg, isEmailFile } from './interfaces';
import { DocumentsService } from '../documents/documents.service';
import { sanitizeForPostgresWithStats } from '../../common/utils';

/**
 * Background worker service for processing document parsing jobs.
 *
 * Follows the pattern from ExtractionWorkerService:
 * - Polls for pending jobs at configurable intervals
 * - Processes jobs in batches
 * - Handles retry logic with exponential backoff
 * - Recovers orphaned jobs on startup
 *
 * Job processing flow:
 * 1. Dequeue pending/retry_pending jobs
 * 2. For each job:
 *    a. Download the file from storage
 *    b. Determine if Kreuzberg is needed (binary) or direct storage (plain text)
 *    c. If Kreuzberg: send to Kreuzberg service for extraction
 *    d. If plain text: read content directly
 *    e. Store parsed content and update document record
 *    f. Mark job as completed or failed
 */
@Injectable()
export class DocumentParsingWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DocumentParsingWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private currentBatch: Promise<void> | null = null;

  // In-memory metrics (reset on restart)
  private processedCount = 0;
  private successCount = 0;
  private failureCount = 0;

  constructor(
    private readonly config: AppConfigService,
    private readonly storage: StorageService,
    private readonly jobService: DocumentParsingJobService,
    private readonly kreuzbergClient: KreuzbergClientService,
    private readonly emailFileParser: EmailFileParserService,
    @Inject(forwardRef(() => DocumentsService))
    private readonly documentsService: DocumentsService
  ) {}

  async onModuleInit() {
    // Check if worker should be enabled
    if (!this.config.documentParsingWorkerEnabled) {
      this.logger.log(
        'Document parsing worker disabled (DOCUMENT_PARSING_WORKER_ENABLED=false)'
      );
      return;
    }

    if (!this.config.storageEnabled) {
      this.logger.warn(
        'Document parsing worker disabled: storage not configured'
      );
      return;
    }

    // Recover orphaned jobs from previous server crash/restart
    await this.recoverOrphanedJobs();

    // Start the polling loop
    this.start();
  }

  async onModuleDestroy() {
    await this.stop();
  }

  /**
   * Recover orphaned jobs that were stuck in 'processing' status.
   * Jobs are considered orphaned if they've been processing for more than 10 minutes.
   */
  private async recoverOrphanedJobs(): Promise<void> {
    try {
      const orphanThresholdMinutes = 10;
      const orphanedJobs = await this.jobService.findOrphanedJobs(
        orphanThresholdMinutes
      );

      if (orphanedJobs.length === 0) {
        this.logger.log('No orphaned document parsing jobs found');
        return;
      }

      const jobIds = orphanedJobs.map((j) => j.id);
      const resetCount = await this.jobService.resetOrphanedJobs(jobIds);

      this.logger.warn(
        `Recovered ${resetCount} orphaned document parsing jobs (threshold: ${orphanThresholdMinutes} min)`
      );
    } catch (error) {
      this.logger.error('Failed to recover orphaned jobs', error);
      // Don't throw - allow worker to start anyway
    }
  }

  /**
   * Start the polling loop.
   */
  start(intervalMs?: number) {
    if (this.timer) {
      this.logger.warn('Document parsing worker already started');
      return;
    }

    const pollInterval =
      intervalMs ?? this.config.documentParsingWorkerPollIntervalMs;
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
      `Document parsing worker started (interval=${pollInterval}ms, batch=${this.config.documentParsingWorkerBatchSize})`
    );
  }

  /**
   * Stop the polling loop.
   */
  async stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = false;

    // Wait for current batch to finish
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

    this.logger.log(
      `Document parsing worker stopped (processed=${this.processedCount}, success=${this.successCount}, failures=${this.failureCount})`
    );
  }

  /**
   * Process a batch of pending jobs.
   * Public for testing purposes.
   */
  async processBatch(): Promise<void> {
    const batchSize = this.config.documentParsingWorkerBatchSize;
    const jobs = await this.jobService.dequeueJobs(batchSize);

    if (jobs.length === 0) {
      return;
    }

    this.logger.log(`Processing batch of ${jobs.length} document parsing jobs`);

    for (const job of jobs) {
      await this.processJob(job);
    }
  }

  /**
   * Process a single document parsing job.
   */
  private async processJob(job: DocumentParsingJob): Promise<void> {
    const startTime = Date.now();
    this.processedCount++;

    this.logger.log(
      `Processing document parsing job ${job.id} (file: ${
        job.sourceFilename
      }, type: ${job.mimeType}, documentId: ${job.documentId || 'none'})`
    );

    // If document exists, mark it as processing
    if (job.documentId) {
      await this.documentsService.markConversionProcessing(job.documentId);
    }

    try {
      // Validate job has storage key
      if (!job.storageKey) {
        throw new Error('Job has no storage key - cannot download file');
      }

      // Download file from storage
      const fileBuffer = await this.downloadFile(job.storageKey);

      // Determine processing path: email > kreuzberg > plain text
      const isEmail = isEmailFile(job.mimeType, job.sourceFilename);
      const useKreuzberg =
        !isEmail && shouldUseKreuzberg(job.mimeType, job.sourceFilename);
      let parsedContent: string;
      let metadata: Record<string, any> = {};
      let emailAttachments: Array<{
        filename: string;
        contentType: string;
        size: number;
        content: Buffer;
      }> = [];
      let emailSourceType = false;

      if (isEmail) {
        // Email file (.eml or .msg) - use our native parser for full metadata extraction
        const emailResult = await this.emailFileParser.parseEmailFile(
          fileBuffer,
          job.mimeType,
          job.sourceFilename
        );

        // Build content in same format as Gmail/IMAP integration
        parsedContent = this.emailFileParser.buildEmailContent(emailResult);
        metadata = {
          extractionMethod: 'email_native',
          ...this.emailFileParser.buildEmailMetadata(emailResult, {
            provider: 'upload',
          }),
        };

        // Store attachments for later processing
        if (emailResult.attachments && emailResult.attachments.length > 0) {
          emailAttachments = emailResult.attachments;
        }

        emailSourceType = true;

        this.logger.debug(
          `Parsed email: "${emailResult.subject}", ${emailAttachments.length} attachments`
        );
      } else if (useKreuzberg) {
        // Binary document - use Kreuzberg for extraction
        const result = await this.kreuzbergClient.extractText(
          fileBuffer,
          job.sourceFilename ?? 'document',
          job.mimeType ?? 'application/octet-stream'
        );

        parsedContent = result.content;
        metadata = {
          extractionMethod: 'kreuzberg',
          pageCount: result.metadata?.page_count,
          title: result.metadata?.title,
          author: result.metadata?.author,
          tablesExtracted: result.tables?.length ?? 0,
          imagesExtracted: result.images?.length ?? 0,
        };

        // Store tables as JSON in metadata if present
        if (result.tables && result.tables.length > 0) {
          metadata.tables = result.tables;
        }

        // TODO: Store images as artifacts if present
        // This would require DocumentArtifact entity and storage operations
      } else {
        // Plain text - read directly
        parsedContent = fileBuffer.toString('utf-8');
        metadata = {
          extractionMethod: 'direct',
        };
      }

      // Sanitize content for PostgreSQL - remove null bytes, control characters,
      // and fix invalid Unicode escape sequences that cause database errors
      const sanitizeResult = sanitizeForPostgresWithStats(parsedContent);
      parsedContent = sanitizeResult.text;
      if (sanitizeResult.modified) {
        this.logger.debug(
          `Sanitized content for job ${job.id}: removed ${sanitizeResult.removedCount} invalid characters (${sanitizeResult.originalLength} -> ${sanitizeResult.finalLength})`
        );
        metadata.contentSanitized = true;
        metadata.originalCharacterCount = sanitizeResult.originalLength;
        metadata.sanitizedCharacterCount = sanitizeResult.removedCount;
      }

      // Generate content hash for deduplication
      const contentHash = require('crypto')
        .createHash('sha256')
        .update(parsedContent)
        .digest('hex');

      // Mark job as completed
      await this.jobService.markCompleted(job.id, {
        parsedContent,
        metadata: {
          ...metadata,
          processingTimeMs: Date.now() - startTime,
          originalFilename: job.sourceFilename,
          originalMimeType: job.mimeType,
          originalSizeBytes: job.fileSizeBytes,
        },
        documentId: job.documentId ?? undefined,
      });

      // Document-first architecture: If document already exists, update it
      if (job.documentId) {
        // Update existing document with conversion result
        await this.documentsService.updateConversionStatus(
          job.documentId,
          'completed',
          {
            content: parsedContent,
            contentHash,
            metadata: {
              ...metadata,
              processingTimeMs: Date.now() - startTime,
              originalMimeType: job.mimeType,
              originalFilename: job.sourceFilename,
              originalSizeBytes: job.fileSizeBytes,
            },
          }
        );

        // For email files, update sourceType and filename (use subject as filename)
        if (emailSourceType) {
          await this.documentsService.updateDocumentForEmail(job.documentId, {
            sourceType: 'email',
            filename: metadata.subject || '(No Subject)',
          });
        }

        // Create chunks from the parsed content
        try {
          const chunkResult = await this.documentsService.recreateChunks(
            job.documentId
          );
          this.logger.log(
            `Document ${job.documentId} updated: ${chunkResult.summary.newChunks} chunks created`
          );

          // Update job metadata with chunk info
          await this.jobService.updateStatus(job.id, 'completed', {
            metadata: {
              ...metadata,
              chunksCreated: chunkResult.summary.newChunks,
              chunkingStrategy: chunkResult.summary.strategy,
            },
          });
        } catch (chunkError) {
          this.logger.error(
            `Failed to create chunks for document ${job.documentId}: ${
              (chunkError as Error).message
            }`
          );
          // Don't fail - document has content, just no chunks yet
        }

        // Process email attachments as child documents
        if (emailSourceType && emailAttachments.length > 0) {
          await this.processEmailAttachments(
            job,
            job.documentId,
            emailAttachments
          );
        }

        this.logger.log(
          `Document ${job.documentId} conversion completed (${parsedContent.length} chars)`
        );
      } else {
        // Legacy path: Create document from parsed content (backward compatibility)
        // This handles jobs created before document-first architecture
        try {
          const docResult = await this.documentsService.createFromParsingJob({
            projectId: job.projectId,
            organizationId: job.organizationId,
            storageKey: job.storageKey!,
            filename: job.sourceFilename ?? 'document',
            mimeType: job.mimeType ?? 'application/octet-stream',
            fileSizeBytes: Number(job.fileSizeBytes ?? 0),
            parsedContent,
            metadata,
          });

          // Update job with document reference
          await this.jobService.updateStatus(job.id, 'completed', {
            documentId: docResult.documentId,
            metadata: {
              ...metadata,
              documentCreated: true,
              chunksCreated: docResult.chunksCreated,
              embeddingJobsQueued: docResult.embeddingJobsQueued,
            },
          });

          this.logger.log(
            `Created document ${docResult.documentId} from parsing job ${job.id} ` +
              `(${docResult.chunksCreated} chunks, ${docResult.embeddingJobsQueued} embedding jobs)`
          );
        } catch (docError) {
          // Log error but don't fail the job - parsing succeeded
          this.logger.error(
            `Failed to create document from parsing job ${job.id}: ${
              (docError as Error).message
            }`,
            (docError as Error).stack
          );
        }
      }

      this.successCount++;
      const durationMs = Date.now() - startTime;

      this.logger.log(
        `Document parsing job ${job.id} completed in ${durationMs}ms ` +
          `(method: ${metadata.extractionMethod}, ${parsedContent.length} chars)`
      );
    } catch (error) {
      this.failureCount++;
      const durationMs = Date.now() - startTime;

      this.logger.error(
        `Document parsing job ${job.id} failed after ${durationMs}ms: ${
          (error as Error).message
        }`,
        (error as Error).stack
      );

      // Update document conversion status to failed (if document exists)
      if (job.documentId) {
        try {
          // Get user-friendly error message from KreuzbergError if available
          const userMessage =
            (error as any).userMessage || (error as Error).message;
          await this.documentsService.updateConversionStatus(
            job.documentId,
            'failed',
            {
              error: userMessage,
              metadata: {
                technicalError: (error as Error).message,
                errorStack: (error as Error).stack,
                failedAt: new Date().toISOString(),
                processingTimeMs: durationMs,
              },
            }
          );
        } catch (updateError) {
          this.logger.error(
            `Failed to update document ${job.documentId} status: ${
              (updateError as Error).message
            }`
          );
        }
      }

      await this.jobService.markFailed(job.id, error as Error);
    }
  }

  /**
   * Download a file from storage.
   */
  private async downloadFile(storageKey: string): Promise<Buffer> {
    this.logger.debug(`Downloading file: ${storageKey}`);

    try {
      const buffer = await this.storage.download(storageKey);
      this.logger.debug(
        `Downloaded file: ${storageKey} (${buffer.length} bytes)`
      );
      return buffer;
    } catch (error) {
      throw new Error(
        `Failed to download file from storage: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get worker metrics.
   */
  getMetrics(): {
    running: boolean;
    processedCount: number;
    successCount: number;
    failureCount: number;
    successRate: number;
  } {
    return {
      running: this.running,
      processedCount: this.processedCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      successRate:
        this.processedCount > 0 ? this.successCount / this.processedCount : 1.0,
    };
  }

  /**
   * Process email attachments as child documents.
   *
   * Each attachment is uploaded to storage and a new parsing job is created.
   * Child documents reference the parent email document via parentDocumentId.
   */
  private async processEmailAttachments(
    parentJob: DocumentParsingJob,
    parentDocumentId: string,
    attachments: Array<{
      filename: string;
      contentType: string;
      size: number;
      content: Buffer;
    }>
  ): Promise<void> {
    this.logger.log(
      `Processing ${attachments.length} email attachments for document ${parentDocumentId}`
    );

    let successCount = 0;
    let failCount = 0;

    for (const attachment of attachments) {
      try {
        // Skip inline images and very small files (likely signatures)
        if (attachment.size < 100) {
          this.logger.debug(
            `Skipping tiny attachment: ${attachment.filename} (${attachment.size} bytes)`
          );
          continue;
        }

        // Upload attachment to storage
        const uploadResult = await this.storage.uploadDocument(
          attachment.content,
          {
            orgId: parentJob.organizationId,
            projectId: parentJob.projectId,
            filename: attachment.filename,
            contentType: attachment.contentType,
          }
        );

        // Create child document via DocumentsService
        const result = await this.documentsService.createFromEmailAttachment({
          projectId: parentJob.projectId,
          organizationId: parentJob.organizationId,
          parentDocumentId,
          storageKey: uploadResult.key,
          filename: attachment.filename,
          mimeType: attachment.contentType,
          fileSizeBytes: attachment.size,
        });

        // Create parsing job for the attachment (so it gets processed)
        await this.jobService.createJob({
          organizationId: parentJob.organizationId,
          projectId: parentJob.projectId,
          sourceType: 'upload',
          sourceFilename: attachment.filename,
          mimeType: attachment.contentType,
          fileSizeBytes: attachment.size,
          storageKey: uploadResult.key,
          documentId: result.documentId,
        });

        this.logger.debug(
          `Created child document ${result.documentId} with parsing job for attachment ${attachment.filename}`
        );

        successCount++;
      } catch (error) {
        this.logger.error(
          `Failed to process attachment ${attachment.filename}: ${
            (error as Error).message
          }`
        );
        failCount++;
      }
    }

    this.logger.log(
      `Email attachment processing complete: ${successCount} succeeded, ${failCount} failed`
    );
  }
}
