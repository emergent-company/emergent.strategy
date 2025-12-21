import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailJobsService } from '../../../src/modules/email/email-jobs.service';
import { EmailConfig } from '../../../src/modules/email/email.config';

// Mock factories
function createMockConfig(overrides: Partial<EmailConfig> = {}): EmailConfig {
  return {
    enabled: true,
    mailgunApiKey: 'test-api-key',
    mailgunDomain: 'mg.test.com',
    mailgunApiUrl: 'https://api.mailgun.net',
    fromEmail: 'noreply@test.com',
    fromName: 'Test App',
    workerIntervalMs: 10000,
    workerBatchSize: 5,
    maxRetries: 3,
    retryDelaySec: 60,
    validate: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as EmailConfig;
}

function createMockRepository(methods = {}) {
  return {
    create: vi.fn().mockImplementation((entity) => ({
      id: 'job-123',
      createdAt: new Date(),
      processedAt: null,
      nextRetryAt: new Date(),
      ...entity,
    })),
    save: vi.fn().mockImplementation((entity) =>
      Promise.resolve({
        id: 'job-123',
        createdAt: new Date(),
        processedAt: null,
        nextRetryAt: new Date(),
        ...entity,
      })
    ),
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    count: vi.fn().mockResolvedValue(0),
    ...methods,
  };
}

function createMockDataSource(methods = {}) {
  return {
    query: vi.fn().mockResolvedValue([]),
    ...methods,
  };
}

function createMockDatabaseService(methods = {}) {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    ...methods,
  };
}

describe('EmailJobsService', () => {
  let service: EmailJobsService;
  let mockRepo: ReturnType<typeof createMockRepository>;
  let mockDataSource: ReturnType<typeof createMockDataSource>;
  let mockDb: ReturnType<typeof createMockDatabaseService>;
  let mockConfig: EmailConfig;

  beforeEach(() => {
    mockRepo = createMockRepository();
    mockDataSource = createMockDataSource();
    mockDb = createMockDatabaseService();
    mockConfig = createMockConfig();
    service = new EmailJobsService(
      mockRepo as any,
      mockDataSource as any,
      mockDb as any,
      mockConfig
    );
  });

  describe('enqueue', () => {
    it('creates a new job with pending status', async () => {
      const options = {
        templateName: 'invitation',
        toEmail: 'user@example.com',
        toName: 'Test User',
        subject: 'Welcome!',
        templateData: { name: 'Test' },
        sourceType: 'invite',
        sourceId: 'inv-123',
      };

      const result = await service.enqueue(options);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          templateName: 'invitation',
          toEmail: 'user@example.com',
          toName: 'Test User',
          subject: 'Welcome!',
          templateData: { name: 'Test' },
          status: 'pending',
          attempts: 0,
          maxAttempts: 3, // From config
          sourceType: 'invite',
          sourceId: 'inv-123',
        })
      );
      expect(mockRepo.save).toHaveBeenCalled();
      expect(result.id).toBe('job-123');
      expect(result.status).toBe('pending');
    });

    it('uses config maxRetries as default maxAttempts', async () => {
      const options = {
        templateName: 'test',
        toEmail: 'user@example.com',
        subject: 'Test',
      };

      await service.enqueue(options);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          maxAttempts: 3, // From mockConfig.maxRetries
        })
      );
    });

    it('allows custom maxAttempts to override config', async () => {
      const options = {
        templateName: 'test',
        toEmail: 'user@example.com',
        subject: 'Test',
        maxAttempts: 5,
      };

      await service.enqueue(options);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          maxAttempts: 5,
        })
      );
    });

    it('sets null values for optional fields when not provided', async () => {
      const options = {
        templateName: 'test',
        toEmail: 'user@example.com',
        subject: 'Test',
      };

      await service.enqueue(options);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          toName: null,
          templateData: {},
          sourceType: null,
          sourceId: null,
        })
      );
    });

    it('sets nextRetryAt to current time for immediate processing', async () => {
      const options = {
        templateName: 'test',
        toEmail: 'user@example.com',
        subject: 'Test',
      };

      await service.enqueue(options);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          nextRetryAt: expect.any(Date),
        })
      );
    });
  });

  describe('dequeue', () => {
    it('uses raw SQL with FOR UPDATE SKIP LOCKED', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          template_name: 'invitation',
          to_email: 'test@example.com',
          to_name: null,
          subject: 'Test',
          template_data: {},
          status: 'processing',
          attempts: 1,
          max_attempts: 3,
          last_error: null,
          mailgun_message_id: null,
          created_at: '2024-01-01T00:00:00Z',
          processed_at: null,
          next_retry_at: null,
          source_type: null,
          source_id: null,
        },
      ];
      mockDb.query = vi.fn().mockResolvedValue({ rows: mockJobs });

      const result = await service.dequeue();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE SKIP LOCKED'),
        [5] // Default batch size from config
      );
      expect(result).toEqual(mockJobs);
    });

    it('uses custom batch size when provided', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [] });

      await service.dequeue(10);

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), [10]);
    });

    it('returns empty array when no jobs available', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [] });

      const result = await service.dequeue();

      expect(result).toEqual([]);
    });
  });

  describe('markSent', () => {
    it('updates job status to sent with messageId', async () => {
      await service.markSent('job-123', 'msg-abc');

      expect(mockRepo.update).toHaveBeenCalledWith('job-123', {
        status: 'sent',
        mailgunMessageId: 'msg-abc',
        processedAt: expect.any(Date),
        lastError: null,
      });
    });
  });

  describe('markFailed', () => {
    it('requeues job for retry when attempts < maxAttempts', async () => {
      mockRepo.findOne = vi.fn().mockResolvedValue({
        id: 'job-123',
        attempts: 1,
        maxAttempts: 3,
      });

      const error = new Error('SMTP error');
      await service.markFailed('job-123', error);

      // Should use raw SQL to set status back to pending with retry delay
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status='pending'"),
        expect.arrayContaining(['job-123', 'SMTP error'])
      );
    });

    it('calculates exponential backoff delay', async () => {
      mockRepo.findOne = vi.fn().mockResolvedValue({
        id: 'job-123',
        attempts: 2, // Second attempt
        maxAttempts: 5,
      });

      await service.markFailed('job-123', new Error('Failed'));

      // Backoff = retryDelaySec * attempts^2 = 60 * 2^2 = 240 seconds
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['240']) // Third param is delay in seconds
      );
    });

    it('caps backoff at 1 hour (3600 seconds)', async () => {
      mockRepo.findOne = vi.fn().mockResolvedValue({
        id: 'job-123',
        attempts: 10, // High attempt count
        maxAttempts: 20,
      });

      await service.markFailed('job-123', new Error('Failed'));

      // Should be capped at 3600, not 60 * 10^2 = 6000
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['3600'])
      );
    });

    it('marks job as permanently failed when maxAttempts reached', async () => {
      mockRepo.findOne = vi.fn().mockResolvedValue({
        id: 'job-123',
        attempts: 3,
        maxAttempts: 3,
      });

      const error = new Error('Permanent failure');
      await service.markFailed('job-123', error);

      expect(mockRepo.update).toHaveBeenCalledWith('job-123', {
        status: 'failed',
        lastError: 'Permanent failure',
        processedAt: expect.any(Date),
      });
    });

    it('truncates error message to 1000 characters', async () => {
      mockRepo.findOne = vi.fn().mockResolvedValue({
        id: 'job-123',
        attempts: 3,
        maxAttempts: 3,
      });

      const longError = new Error('x'.repeat(2000));
      await service.markFailed('job-123', longError);

      expect(mockRepo.update).toHaveBeenCalledWith('job-123', {
        status: 'failed',
        lastError: 'x'.repeat(1000),
        processedAt: expect.any(Date),
      });
    });

    it('handles job not found gracefully', async () => {
      mockRepo.findOne = vi.fn().mockResolvedValue(null);

      // Should not throw
      await expect(
        service.markFailed('nonexistent', new Error('test'))
      ).resolves.toBeUndefined();

      // Should not call update
      expect(mockRepo.update).not.toHaveBeenCalled();
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('recoverStaleJobs', () => {
    it('recovers jobs stuck in processing for too long', async () => {
      mockDataSource.query = vi
        .fn()
        .mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }]);

      const count = await service.recoverStaleJobs(15);

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'processing'"),
        ['15']
      );
      expect(count).toBe(2);
    });

    it('uses default threshold of 10 minutes', async () => {
      mockDataSource.query = vi.fn().mockResolvedValue([]);

      await service.recoverStaleJobs();

      expect(mockDataSource.query).toHaveBeenCalledWith(expect.any(String), [
        '10',
      ]);
    });

    it('returns 0 when no stale jobs found', async () => {
      mockDataSource.query = vi.fn().mockResolvedValue([]);

      const count = await service.recoverStaleJobs();

      expect(count).toBe(0);
    });
  });

  describe('getJob', () => {
    it('returns job when found', async () => {
      const mockJob = {
        id: 'job-123',
        templateName: 'invitation',
        toEmail: 'test@example.com',
        toName: 'Test',
        subject: 'Welcome',
        templateData: { name: 'Test' },
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        mailgunMessageId: null,
        createdAt: new Date('2024-01-01'),
        processedAt: null,
        nextRetryAt: new Date('2024-01-01'),
        sourceType: 'invite',
        sourceId: 'inv-123',
      };
      mockRepo.findOne = vi.fn().mockResolvedValue(mockJob);

      const result = await service.getJob('job-123');

      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'job-123' },
      });
      expect(result).toMatchObject({
        id: 'job-123',
        template_name: 'invitation',
        to_email: 'test@example.com',
        status: 'pending',
      });
    });

    it('returns null when job not found', async () => {
      mockRepo.findOne = vi.fn().mockResolvedValue(null);

      const result = await service.getJob('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getJobsBySource', () => {
    it('returns jobs matching source type and id', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          templateName: 'invitation',
          toEmail: 'user1@example.com',
          toName: null,
          subject: 'Test',
          templateData: {},
          status: 'sent',
          attempts: 1,
          maxAttempts: 3,
          lastError: null,
          mailgunMessageId: 'msg-1',
          createdAt: new Date('2024-01-02'),
          processedAt: new Date('2024-01-02'),
          nextRetryAt: null,
          sourceType: 'invite',
          sourceId: 'inv-123',
        },
        {
          id: 'job-2',
          templateName: 'invitation',
          toEmail: 'user2@example.com',
          toName: null,
          subject: 'Test',
          templateData: {},
          status: 'pending',
          attempts: 0,
          maxAttempts: 3,
          lastError: null,
          mailgunMessageId: null,
          createdAt: new Date('2024-01-01'),
          processedAt: null,
          nextRetryAt: new Date('2024-01-01'),
          sourceType: 'invite',
          sourceId: 'inv-123',
        },
      ];
      mockRepo.find = vi.fn().mockResolvedValue(mockJobs);

      const result = await service.getJobsBySource('invite', 'inv-123');

      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { sourceType: 'invite', sourceId: 'inv-123' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].source_type).toBe('invite');
      expect(result[0].source_id).toBe('inv-123');
    });

    it('returns empty array when no jobs match', async () => {
      mockRepo.find = vi.fn().mockResolvedValue([]);

      const result = await service.getJobsBySource('invite', 'nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('stats', () => {
    it('returns counts for all job statuses', async () => {
      mockRepo.count = vi
        .fn()
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(2) // processing
        .mockResolvedValueOnce(100) // sent
        .mockResolvedValueOnce(3); // failed

      const result = await service.stats();

      expect(result).toEqual({
        pending: 5,
        processing: 2,
        sent: 100,
        failed: 3,
      });

      expect(mockRepo.count).toHaveBeenCalledWith({
        where: { status: 'pending' },
      });
      expect(mockRepo.count).toHaveBeenCalledWith({
        where: { status: 'processing' },
      });
      expect(mockRepo.count).toHaveBeenCalledWith({
        where: { status: 'sent' },
      });
      expect(mockRepo.count).toHaveBeenCalledWith({
        where: { status: 'failed' },
      });
    });
  });
});
