import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../../../src/modules/email/email.service';
import { EmailConfig } from '../../../src/modules/email/email.config';
import { EmailJobsService } from '../../../src/modules/email/email-jobs.service';
import { EmailTemplateService } from '../../../src/modules/email/email-template.service';

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

function createMockJobsService(
  overrides: Partial<EmailJobsService> = {}
): EmailJobsService {
  return {
    enqueue: vi.fn().mockResolvedValue({
      id: 'job-123',
      template_name: 'invitation',
      to_email: 'test@example.com',
      status: 'pending',
    }),
    getJob: vi.fn().mockResolvedValue(null),
    getJobsBySource: vi.fn().mockResolvedValue([]),
    stats: vi
      .fn()
      .mockResolvedValue({ pending: 0, processing: 0, sent: 0, failed: 0 }),
    dequeue: vi.fn().mockResolvedValue([]),
    markSent: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    recoverStaleJobs: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as EmailJobsService;
}

function createMockTemplateService(
  overrides: Partial<EmailTemplateService> = {}
): EmailTemplateService {
  return {
    hasTemplate: vi.fn().mockReturnValue(true),
    listTemplates: vi.fn().mockReturnValue(['invitation', 'notification']),
    render: vi
      .fn()
      .mockReturnValue({ html: '<html>Test</html>', text: 'Test' }),
    onModuleInit: vi.fn(),
    ...overrides,
  } as unknown as EmailTemplateService;
}

describe('EmailService', () => {
  let service: EmailService;
  let mockConfig: EmailConfig;
  let mockJobs: EmailJobsService;
  let mockTemplates: EmailTemplateService;

  beforeEach(() => {
    mockConfig = createMockConfig();
    mockJobs = createMockJobsService();
    mockTemplates = createMockTemplateService();
    service = new EmailService(mockConfig, mockJobs, mockTemplates);
  });

  describe('isEnabled', () => {
    it('returns true when email is enabled', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('returns false when email is disabled', () => {
      mockConfig = createMockConfig({ enabled: false });
      service = new EmailService(mockConfig, mockJobs, mockTemplates);
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('returns empty array when config is valid', () => {
      expect(service.validateConfig()).toEqual([]);
    });

    it('returns errors from config validation', () => {
      const errors = ['MAILGUN_API_KEY is required'];
      mockConfig = createMockConfig({
        validate: vi.fn().mockReturnValue(errors),
      });
      service = new EmailService(mockConfig, mockJobs, mockTemplates);
      expect(service.validateConfig()).toEqual(errors);
    });
  });

  describe('sendTemplatedEmail', () => {
    const validOptions = {
      templateName: 'invitation',
      toEmail: 'user@example.com',
      toName: 'Test User',
      subject: 'Welcome!',
      templateData: { name: 'Test' },
      sourceType: 'invite',
      sourceId: 'inv-123',
    };

    it('returns queued=false when email is disabled', async () => {
      mockConfig = createMockConfig({ enabled: false });
      service = new EmailService(mockConfig, mockJobs, mockTemplates);

      const result = await service.sendTemplatedEmail(validOptions);

      expect(result.queued).toBe(false);
      expect(result.error).toBe('Email sending is disabled');
      expect(mockJobs.enqueue).not.toHaveBeenCalled();
    });

    it('returns queued=false when config validation fails', async () => {
      mockConfig = createMockConfig({
        validate: vi.fn().mockReturnValue(['MAILGUN_API_KEY is required']),
      });
      service = new EmailService(mockConfig, mockJobs, mockTemplates);

      const result = await service.sendTemplatedEmail(validOptions);

      expect(result.queued).toBe(false);
      expect(result.error).toBe('MAILGUN_API_KEY is required');
      expect(mockJobs.enqueue).not.toHaveBeenCalled();
    });

    it('returns queued=false when template does not exist', async () => {
      mockTemplates = createMockTemplateService({
        hasTemplate: vi.fn().mockReturnValue(false),
      });
      service = new EmailService(mockConfig, mockJobs, mockTemplates);

      const result = await service.sendTemplatedEmail({
        ...validOptions,
        templateName: 'nonexistent',
      });

      expect(result.queued).toBe(false);
      expect(result.error).toBe("Template 'nonexistent' not found");
      expect(mockJobs.enqueue).not.toHaveBeenCalled();
    });

    it('enqueues job and returns success when all checks pass', async () => {
      const result = await service.sendTemplatedEmail(validOptions);

      expect(result.queued).toBe(true);
      expect(result.jobId).toBe('job-123');
      expect(result.error).toBeUndefined();

      expect(mockJobs.enqueue).toHaveBeenCalledWith({
        templateName: 'invitation',
        toEmail: 'user@example.com',
        toName: 'Test User',
        subject: 'Welcome!',
        templateData: { name: 'Test' },
        sourceType: 'invite',
        sourceId: 'inv-123',
      });
    });

    it('handles enqueue errors gracefully', async () => {
      mockJobs = createMockJobsService({
        enqueue: vi.fn().mockRejectedValue(new Error('Database error')),
      });
      service = new EmailService(mockConfig, mockJobs, mockTemplates);

      const result = await service.sendTemplatedEmail(validOptions);

      expect(result.queued).toBe(false);
      expect(result.error).toBe('Database error');
    });

    it('allows optional fields to be undefined', async () => {
      const minimalOptions = {
        templateName: 'invitation',
        toEmail: 'user@example.com',
        subject: 'Hello',
      };

      const result = await service.sendTemplatedEmail(minimalOptions);

      expect(result.queued).toBe(true);
      expect(mockJobs.enqueue).toHaveBeenCalledWith({
        templateName: 'invitation',
        toEmail: 'user@example.com',
        toName: undefined,
        subject: 'Hello',
        templateData: undefined,
        sourceType: undefined,
        sourceId: undefined,
      });
    });
  });

  describe('getJobStatus', () => {
    it('returns job when found', async () => {
      const mockJob = {
        id: 'job-123',
        template_name: 'invitation',
        to_email: 'test@example.com',
        status: 'sent',
      };
      mockJobs = createMockJobsService({
        getJob: vi.fn().mockResolvedValue(mockJob),
      });
      service = new EmailService(mockConfig, mockJobs, mockTemplates);

      const result = await service.getJobStatus('job-123');

      expect(result).toEqual(mockJob);
      expect(mockJobs.getJob).toHaveBeenCalledWith('job-123');
    });

    it('returns null when job not found', async () => {
      const result = await service.getJobStatus('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getJobsBySource', () => {
    it('returns jobs for the given source', async () => {
      const mockJobs2 = [
        { id: 'job-1', status: 'sent' },
        { id: 'job-2', status: 'pending' },
      ];
      mockJobs = createMockJobsService({
        getJobsBySource: vi.fn().mockResolvedValue(mockJobs2),
      });
      service = new EmailService(mockConfig, mockJobs, mockTemplates);

      const result = await service.getJobsBySource('invite', 'inv-123');

      expect(result).toEqual(mockJobs2);
      expect(mockJobs.getJobsBySource).toHaveBeenCalledWith(
        'invite',
        'inv-123'
      );
    });

    it('returns empty array when no jobs found', async () => {
      const result = await service.getJobsBySource('invite', 'inv-nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('getQueueStats', () => {
    it('returns queue statistics', async () => {
      const stats = { pending: 5, processing: 2, sent: 100, failed: 3 };
      mockJobs = createMockJobsService({
        stats: vi.fn().mockResolvedValue(stats),
      });
      service = new EmailService(mockConfig, mockJobs, mockTemplates);

      const result = await service.getQueueStats();

      expect(result).toEqual(stats);
    });
  });

  describe('listTemplates', () => {
    it('returns list of available templates', () => {
      const result = service.listTemplates();
      expect(result).toEqual(['invitation', 'notification']);
    });

    it('returns empty array when no templates', () => {
      mockTemplates = createMockTemplateService({
        listTemplates: vi.fn().mockReturnValue([]),
      });
      service = new EmailService(mockConfig, mockJobs, mockTemplates);

      const result = service.listTemplates();
      expect(result).toEqual([]);
    });
  });
});
