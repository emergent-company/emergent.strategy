import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DocumentParsingWorkerService } from '../../../src/modules/document-parsing/document-parsing-worker.service';
import { DocumentParsingJobService } from '../../../src/modules/document-parsing/document-parsing-job.service';
import { KreuzbergClientService } from '../../../src/modules/document-parsing/kreuzberg-client.service';
import { StorageService } from '../../../src/modules/storage/storage.service';
import { AppConfigService } from '../../../src/common/config/config.service';
import { DocumentParsingJob } from '../../../src/entities/document-parsing-job.entity';

// Mock factories
function createMockConfig(
  overrides: Partial<AppConfigService> = {}
): AppConfigService {
  return {
    documentParsingWorkerEnabled: true,
    storageEnabled: true,
    documentParsingWorkerPollIntervalMs: 5000,
    documentParsingWorkerBatchSize: 5,
    ...overrides,
  } as unknown as AppConfigService;
}

function createMockStorageService(
  overrides: Partial<StorageService> = {}
): StorageService {
  return {
    download: vi.fn().mockResolvedValue(Buffer.from('test content')),
    uploadDocument: vi.fn().mockResolvedValue({
      key: 'test-key',
      bucket: 'documents',
      storageUrl: 'documents/test-key',
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as StorageService;
}

function createMockJobService(
  overrides: Partial<DocumentParsingJobService> = {}
): DocumentParsingJobService {
  return {
    dequeueJobs: vi.fn().mockResolvedValue([]),
    markCompleted: vi.fn().mockResolvedValue({}),
    markFailed: vi.fn().mockResolvedValue({}),
    findOrphanedJobs: vi.fn().mockResolvedValue([]),
    resetOrphanedJobs: vi.fn().mockResolvedValue(0),
    updateStatus: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as DocumentParsingJobService;
}

function createMockKreuzbergClient(
  overrides: Partial<KreuzbergClientService> = {}
): KreuzbergClientService {
  return {
    isEnabled: true,
    extractText: vi.fn().mockResolvedValue({
      content: 'Extracted text from document',
      metadata: { page_count: 5 },
      tables: [],
      images: [],
    }),
    healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
    ...overrides,
  } as unknown as KreuzbergClientService;
}

function createMockJob(
  overrides: Partial<DocumentParsingJob> = {}
): DocumentParsingJob {
  return {
    id: 'job-123',
    organizationId: 'org-123',
    projectId: 'proj-123',
    sourceType: 'upload',
    sourceFilename: 'test.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 1000,
    storageKey: 'proj-123/org-123/uuid-test.pdf',
    documentId: null,
    extractionJobId: null,
    metadata: {},
    status: 'processing',
    parsedContent: null,
    errorMessage: null,
    retryCount: 0,
    maxRetries: 3,
    nextRetryAt: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DocumentParsingJob;
}

describe('DocumentParsingWorkerService', () => {
  let service: DocumentParsingWorkerService;
  let mockConfig: AppConfigService;
  let mockStorage: StorageService;
  let mockJobService: DocumentParsingJobService;
  let mockKreuzbergClient: KreuzbergClientService;

  beforeEach(() => {
    vi.useFakeTimers();
    mockConfig = createMockConfig();
    mockStorage = createMockStorageService();
    mockJobService = createMockJobService();
    mockKreuzbergClient = createMockKreuzbergClient();

    service = new DocumentParsingWorkerService(
      mockConfig,
      mockStorage,
      mockJobService,
      mockKreuzbergClient
    );
  });

  afterEach(async () => {
    // Stop the worker if it was started
    await service.stop();
    vi.useRealTimers();
  });

  describe('onModuleInit', () => {
    it('starts worker when enabled and storage configured', async () => {
      await service.onModuleInit();

      // Should have recovered orphaned jobs
      expect(mockJobService.findOrphanedJobs).toHaveBeenCalledWith(10);

      // Verify worker is running via metrics
      const metrics = service.getMetrics();
      expect(metrics.running).toBe(true);
    });

    it('skips when DOCUMENT_PARSING_WORKER_ENABLED=false', async () => {
      mockConfig = createMockConfig({ documentParsingWorkerEnabled: false });
      service = new DocumentParsingWorkerService(
        mockConfig,
        mockStorage,
        mockJobService,
        mockKreuzbergClient
      );

      await service.onModuleInit();

      expect(mockJobService.findOrphanedJobs).not.toHaveBeenCalled();
      expect(service.getMetrics().running).toBe(false);
    });

    it('skips when storage not configured', async () => {
      mockConfig = createMockConfig({ storageEnabled: false });
      service = new DocumentParsingWorkerService(
        mockConfig,
        mockStorage,
        mockJobService,
        mockKreuzbergClient
      );

      await service.onModuleInit();

      expect(mockJobService.findOrphanedJobs).not.toHaveBeenCalled();
      expect(service.getMetrics().running).toBe(false);
    });
  });

  describe('recoverOrphanedJobs', () => {
    it('resets orphaned processing jobs on startup', async () => {
      const orphanedJobs = [
        createMockJob({ id: 'orphan-1' }),
        createMockJob({ id: 'orphan-2' }),
      ];

      mockJobService = createMockJobService({
        findOrphanedJobs: vi.fn().mockResolvedValue(orphanedJobs),
        resetOrphanedJobs: vi.fn().mockResolvedValue(2),
      });
      service = new DocumentParsingWorkerService(
        mockConfig,
        mockStorage,
        mockJobService,
        mockKreuzbergClient
      );

      await service.onModuleInit();

      expect(mockJobService.resetOrphanedJobs).toHaveBeenCalledWith([
        'orphan-1',
        'orphan-2',
      ]);
    });

    it('handles no orphaned jobs gracefully', async () => {
      mockJobService = createMockJobService({
        findOrphanedJobs: vi.fn().mockResolvedValue([]),
      });
      service = new DocumentParsingWorkerService(
        mockConfig,
        mockStorage,
        mockJobService,
        mockKreuzbergClient
      );

      await service.onModuleInit();

      expect(mockJobService.resetOrphanedJobs).not.toHaveBeenCalled();
    });
  });

  describe('processBatch', () => {
    it('claims and processes pending jobs', async () => {
      const jobs = [createMockJob()];
      mockJobService = createMockJobService({
        dequeueJobs: vi.fn().mockResolvedValue(jobs),
      });
      service = new DocumentParsingWorkerService(
        mockConfig,
        mockStorage,
        mockJobService,
        mockKreuzbergClient
      );

      await service.processBatch();

      expect(mockJobService.dequeueJobs).toHaveBeenCalledWith(5);
      expect(mockStorage.download).toHaveBeenCalledWith(
        'proj-123/org-123/uuid-test.pdf'
      );
      expect(mockKreuzbergClient.extractText).toHaveBeenCalled();
      expect(mockJobService.markCompleted).toHaveBeenCalled();
    });

    it('does nothing when no jobs available', async () => {
      await service.processBatch();

      expect(mockStorage.download).not.toHaveBeenCalled();
      expect(mockKreuzbergClient.extractText).not.toHaveBeenCalled();
    });
  });

  describe('processJob - routing logic', () => {
    it('routes plain text files to direct storage (bypasses Kreuzberg)', async () => {
      const plainTextJob = createMockJob({
        mimeType: 'text/plain',
        sourceFilename: 'readme.txt',
      });
      mockJobService = createMockJobService({
        dequeueJobs: vi.fn().mockResolvedValue([plainTextJob]),
      });
      mockStorage = createMockStorageService({
        download: vi.fn().mockResolvedValue(Buffer.from('Plain text content')),
      });
      service = new DocumentParsingWorkerService(
        mockConfig,
        mockStorage,
        mockJobService,
        mockKreuzbergClient
      );

      await service.processBatch();

      // Should NOT call Kreuzberg for plain text
      expect(mockKreuzbergClient.extractText).not.toHaveBeenCalled();

      // Should mark completed with direct extraction method
      expect(mockJobService.markCompleted).toHaveBeenCalledWith(
        plainTextJob.id,
        expect.objectContaining({
          parsedContent: 'Plain text content',
          metadata: expect.objectContaining({
            extractionMethod: 'direct',
          }),
        })
      );
    });

    it('routes markdown files to direct storage', async () => {
      const mdJob = createMockJob({
        mimeType: 'text/markdown',
        sourceFilename: 'doc.md',
      });
      mockJobService = createMockJobService({
        dequeueJobs: vi.fn().mockResolvedValue([mdJob]),
      });
      service = new DocumentParsingWorkerService(
        mockConfig,
        mockStorage,
        mockJobService,
        mockKreuzbergClient
      );

      await service.processBatch();

      expect(mockKreuzbergClient.extractText).not.toHaveBeenCalled();
    });

    it('routes binary files (PDF) to Kreuzberg', async () => {
      const pdfJob = createMockJob({
        mimeType: 'application/pdf',
        sourceFilename: 'document.pdf',
      });
      mockJobService = createMockJobService({
        dequeueJobs: vi.fn().mockResolvedValue([pdfJob]),
      });
      service = new DocumentParsingWorkerService(
        mockConfig,
        mockStorage,
        mockJobService,
        mockKreuzbergClient
      );

      await service.processBatch();

      expect(mockKreuzbergClient.extractText).toHaveBeenCalledWith(
        expect.any(Buffer),
        'document.pdf',
        'application/pdf'
      );
      expect(mockJobService.markCompleted).toHaveBeenCalledWith(
        pdfJob.id,
        expect.objectContaining({
          metadata: expect.objectContaining({
            extractionMethod: 'kreuzberg',
          }),
        })
      );
    });

    it('routes image files (for OCR) to Kreuzberg', async () => {
      const imageJob = createMockJob({
        mimeType: 'image/png',
        sourceFilename: 'scan.png',
      });
      mockJobService = createMockJobService({
        dequeueJobs: vi.fn().mockResolvedValue([imageJob]),
      });
      service = new DocumentParsingWorkerService(
        mockConfig,
        mockStorage,
        mockJobService,
        mockKreuzbergClient
      );

      await service.processBatch();

      expect(mockKreuzbergClient.extractText).toHaveBeenCalled();
    });
  });

  describe('processJob - error handling', () => {
    it('marks job failed when storage key is missing', async () => {
      const jobWithoutKey = createMockJob({ storageKey: null });
      mockJobService = createMockJobService({
        dequeueJobs: vi.fn().mockResolvedValue([jobWithoutKey]),
      });
      service = new DocumentParsingWorkerService(
        mockConfig,
        mockStorage,
        mockJobService,
        mockKreuzbergClient
      );

      await service.processBatch();

      expect(mockJobService.markFailed).toHaveBeenCalledWith(
        jobWithoutKey.id,
        expect.any(Error)
      );
    });

    it('marks job failed when download fails', async () => {
      const job = createMockJob();
      mockJobService = createMockJobService({
        dequeueJobs: vi.fn().mockResolvedValue([job]),
      });
      mockStorage = createMockStorageService({
        download: vi.fn().mockRejectedValue(new Error('File not found')),
      });
      service = new DocumentParsingWorkerService(
        mockConfig,
        mockStorage,
        mockJobService,
        mockKreuzbergClient
      );

      await service.processBatch();

      expect(mockJobService.markFailed).toHaveBeenCalledWith(
        job.id,
        expect.any(Error)
      );
    });

    it('marks job failed when Kreuzberg extraction fails', async () => {
      const job = createMockJob();
      mockJobService = createMockJobService({
        dequeueJobs: vi.fn().mockResolvedValue([job]),
      });
      mockKreuzbergClient = createMockKreuzbergClient({
        extractText: vi.fn().mockRejectedValue(new Error('Extraction timeout')),
      });
      service = new DocumentParsingWorkerService(
        mockConfig,
        mockStorage,
        mockJobService,
        mockKreuzbergClient
      );

      await service.processBatch();

      expect(mockJobService.markFailed).toHaveBeenCalledWith(
        job.id,
        expect.any(Error)
      );
    });
  });

  describe('getMetrics', () => {
    it('returns worker metrics', async () => {
      const job = createMockJob();
      mockJobService = createMockJobService({
        dequeueJobs: vi.fn().mockResolvedValue([job]),
      });
      service = new DocumentParsingWorkerService(
        mockConfig,
        mockStorage,
        mockJobService,
        mockKreuzbergClient
      );

      await service.processBatch();

      const metrics = service.getMetrics();
      expect(metrics.processedCount).toBe(1);
      expect(metrics.successCount).toBe(1);
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successRate).toBe(1.0);
    });

    it('tracks failure count correctly', async () => {
      const job = createMockJob({ storageKey: null }); // Will fail
      mockJobService = createMockJobService({
        dequeueJobs: vi.fn().mockResolvedValue([job]),
      });
      service = new DocumentParsingWorkerService(
        mockConfig,
        mockStorage,
        mockJobService,
        mockKreuzbergClient
      );

      await service.processBatch();

      const metrics = service.getMetrics();
      expect(metrics.processedCount).toBe(1);
      expect(metrics.successCount).toBe(0);
      expect(metrics.failureCount).toBe(1);
      expect(metrics.successRate).toBe(0);
    });
  });

  describe('start/stop', () => {
    it('start creates polling timer', async () => {
      service.start(1000);

      const metrics = service.getMetrics();
      expect(metrics.running).toBe(true);
    });

    it('stop clears polling timer', async () => {
      service.start(1000);
      await service.stop();

      const metrics = service.getMetrics();
      expect(metrics.running).toBe(false);
    });

    it('warns when start called twice', async () => {
      service.start(1000);
      service.start(1000); // Should warn but not throw

      const metrics = service.getMetrics();
      expect(metrics.running).toBe(true);
    });
  });
});
