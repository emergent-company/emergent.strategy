import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service';
import { Notification } from '../../../src/entities/notification.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { vi } from 'vitest';

describe('NotificationsService - Auto-Extraction Features', () => {
  let service: NotificationsService;
  let notificationRepo: Repository<Notification>;
  let dataSource: DataSource;

  const mockNotificationRepo = {
    create: vi.fn((data) => ({ id: 'notif-123', ...data })),
    save: vi.fn((entity) =>
      Promise.resolve({ id: entity.id || 'notif-123', ...entity })
    ),
    update: vi.fn((criteria, data) => Promise.resolve({ affected: 1 })),
    createQueryBuilder: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getRawOne: vi.fn(),
    })),
  };

  const mockDataSource = {
    query: vi.fn((sql, params) =>
      Promise.resolve([
        {
          id: 'pref-123',
          subject_id: params?.[0] || 'user-123',
          category: params?.[1] || 'extraction',
          in_app_enabled: true,
          email_enabled: false,
          email_digest: false,
          force_important: false,
          force_other: false,
          auto_mark_read: false,
          auto_clear_after_days: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ])
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(Notification),
          useValue: mockNotificationRepo,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    notificationRepo = module.get<Repository<Notification>>(
      getRepositoryToken(Notification)
    );
    dataSource = module.get<DataSource>(DataSource);

    vi.clearAllMocks();
  });

  describe('create - with new fields', () => {
    it('should create notification with all new fields', async () => {
      const mockNotificationId = 'notif-123';
      const createDto = {
        subject_id: 'user-123',
        project_id: 'project-123',
        title: 'Extraction Complete',
        message: 'Objects extracted successfully',
        category: 'extraction_completed' as any,
        importance: 'other' as any,
        type: 'extraction_complete',
        severity: 'success' as any,
        related_resource_type: 'extraction_job',
        related_resource_id: 'job-123',
        read: false,
        dismissed: false,
        actions: [
          {
            label: 'View Objects',
            url: '/admin/objects?jobId=job-123',
            style: 'primary' as const,
          },
        ],
        expires_at: new Date('2025-12-31').toISOString(),
        details: { summary: { objects_created: 10 } },
      };

      mockNotificationRepo.save.mockResolvedValue({
        id: mockNotificationId,
        ...createDto,
      });

      const result = await service.create(createDto);

      expect(mockNotificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'extraction_complete',
          severity: 'success',
          relatedResourceType: 'extraction_job',
          relatedResourceId: 'job-123',
          read: false,
          dismissed: false,
          actions: createDto.actions,
          expiresAt: createDto.expires_at,
        })
      );

      expect(mockNotificationRepo.save).toHaveBeenCalled();
      expect(result?.id).toBe(mockNotificationId);
    });

    it('should handle optional new fields gracefully', async () => {
      const mockNotificationId = 'notif-124';
      const createDto = {
        subject_id: 'user-123',
        project_id: 'project-123',
        title: 'Simple Notification',
        message: 'Basic message',
        category: 'general' as any,
        importance: 'other' as any,
        // No new fields provided
      };

      mockNotificationRepo.save.mockResolvedValue({
        id: mockNotificationId,
        ...createDto,
      });

      const result = await service.create(createDto);

      expect(mockNotificationRepo.create).toHaveBeenCalled();
      expect(mockNotificationRepo.save).toHaveBeenCalled();
      expect(result?.id).toBe(mockNotificationId);
    });
  });

  describe('dismiss', () => {
    it('should mark notification as dismissed', async () => {
      const notificationId = 'notif-123';
      const userId = 'user-123';

      mockNotificationRepo.update.mockResolvedValue({ affected: 1 });

      await service.dismiss(notificationId, userId);

      expect(mockNotificationRepo.update).toHaveBeenCalledWith(
        { id: notificationId, userId: userId },
        { clearedAt: expect.any(Function) }
      );
    });

    it('should throw NotFoundException when notification not found', async () => {
      const notificationId = 'nonexistent';
      const userId = 'user-123';

      mockNotificationRepo.update.mockResolvedValue({ affected: 0 });

      await expect(service.dismiss(notificationId, userId)).rejects.toThrow(
        'Notification not found'
      );
    });
  });

  describe('getCounts', () => {
    it('should return correct counts', async () => {
      const userId = 'user-123';

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getRawOne: vi.fn().mockResolvedValue({
          unread: '5',
          dismissed: '3',
          total: '15',
        }),
      };

      mockNotificationRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getCounts(userId);

      expect(result).toEqual({
        total: 15,
        unread: 5,
        dismissed: 3,
      });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'n.userId = :userId',
        { userId }
      );
    });

    it('should handle empty notification list', async () => {
      const userId = 'user-123';

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getRawOne: vi.fn().mockResolvedValue({
          unread: '0',
          dismissed: '0',
          total: '0',
        }),
      };

      mockNotificationRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getCounts(userId);

      expect(result).toEqual({
        total: 0,
        unread: 0,
        dismissed: 0,
      });
    });
  });

  describe('notifyExtractionCompleted', () => {
    it('should create detailed success notification', async () => {
      const mockNotificationId = 'notif-125';
      const data = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        projectId: 'project-123',
        jobId: 'job-123',
        documentId: 'doc-123',
        documentName: 'requirements.pdf',
        entitiesCreated: 15,
        objectsByType: {
          Requirement: 5,
          Decision: 3,
          Feature: 7,
        },
        averageConfidence: 0.87,
        durationSeconds: 12.3,
        requiresReview: 2, // 2 objects need review
        lowConfidenceCount: 2,
      };

      mockNotificationRepo.save.mockResolvedValue({
        id: mockNotificationId,
      });

      const result = await service.notifyExtractionCompleted(data);

      expect(mockNotificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'extraction_complete',
          severity: 'warning', // Because lowConfidenceCount > 0
          title: 'Object Extraction Complete',
          relatedResourceType: 'extraction_job',
          relatedResourceId: 'job-123',
        })
      );

      const createCall = mockNotificationRepo.create.mock.calls[0][0];
      expect(createCall.message).toContain('Extracted 15 objects');
      expect(createCall.message).toContain('5 Requirement');
      expect(createCall.message).toContain('3 Decision');
      expect(createCall.message).toContain('7 Feature');
      expect(createCall.actions).toHaveLength(3);
      expect(createCall.actions[0]).toMatchObject({
        label: 'View Objects',
        url: expect.stringContaining('/admin/objects?jobId=job-123'),
        style: 'primary',
      });
      expect(createCall.actions[1]).toMatchObject({
        label: 'Review Objects',
        url: expect.stringContaining('filter=requires_review'),
        style: 'warning',
      });

      expect(mockNotificationRepo.save).toHaveBeenCalled();
      expect(result?.id).toBe(mockNotificationId);
    });

    it('should create success notification when no review required', async () => {
      const mockNotificationId = 'notif-126';
      const data = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        projectId: 'project-123',
        jobId: 'job-123',
        documentId: 'doc-123',
        documentName: 'spec.txt',
        entitiesCreated: 10,
        objectsByType: {
          Requirement: 10,
        },
        averageConfidence: 0.95,
        durationSeconds: 8.5,
        lowConfidenceCount: 0,
      };

      mockNotificationRepo.save.mockResolvedValue({
        id: mockNotificationId,
      });

      await service.notifyExtractionCompleted(data);

      expect(mockNotificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'success', // No review required
        })
      );

      const createCall = mockNotificationRepo.create.mock.calls[0][0];
      expect(createCall.message).not.toContain('require review');
    });

    it('should handle empty object extraction', async () => {
      const mockNotificationId = 'notif-127';
      const data = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        projectId: 'project-123',
        jobId: 'job-123',
        documentId: 'doc-123',
        documentName: 'empty.txt',
        entitiesCreated: 0,
        objectsByType: {},
        averageConfidence: 0,
        durationSeconds: 2.1,
        lowConfidenceCount: 0,
      };

      mockNotificationRepo.save.mockResolvedValue({
        id: mockNotificationId,
      });

      await service.notifyExtractionCompleted(data);

      const createCall = mockNotificationRepo.create.mock.calls[0][0];
      expect(createCall.message).toContain('Extracted 0 object');
    });
  });

  describe('notifyExtractionFailed', () => {
    it('should create failure notification with retry info', async () => {
      const mockNotificationId = 'notif-128';
      const data = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        projectId: 'project-123',
        jobId: 'job-123',
        documentId: 'doc-123',
        documentName: 'requirements.pdf',
        errorMessage: 'LLM API rate limit exceeded',
        retryCount: 1,
        willRetry: true,
      };

      mockNotificationRepo.save.mockResolvedValue({
        id: mockNotificationId,
      });

      const result = await service.notifyExtractionFailed(data);

      expect(mockNotificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'extraction_failed',
          severity: 'error',
          title: 'Extraction Failed: requirements.pdf',
          relatedResourceType: 'extraction_job',
          relatedResourceId: 'job-123',
        })
      );

      const createCall = mockNotificationRepo.create.mock.calls[0][0];
      expect(createCall.message).toContain('will retry automatically');
      expect(createCall.message).toContain('attempt 2/3');
      expect(createCall.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'View Job Details',
            url: expect.stringContaining('/admin/extraction/jobs/job-123'),
          }),
        ])
      );

      expect(mockNotificationRepo.save).toHaveBeenCalled();
      expect(result?.id).toBe(mockNotificationId);
    });

    it('should create final failure notification when no retry', async () => {
      const mockNotificationId = 'notif-129';
      const data = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        projectId: 'project-123',
        jobId: 'job-123',
        documentId: 'doc-123',
        documentName: 'document.pdf',
        errorMessage: 'Invalid document format',
        retryCount: 3,
        willRetry: false,
      };

      mockNotificationRepo.save.mockResolvedValue({
        id: mockNotificationId,
      });

      await service.notifyExtractionFailed(data);

      const createCall = mockNotificationRepo.create.mock.calls[0][0];
      expect(createCall.message).toContain('Extraction failed');
      expect(createCall.message).not.toContain('will retry');
      expect(createCall.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Retry Extraction',
          }),
        ])
      );
    });
  });
});
