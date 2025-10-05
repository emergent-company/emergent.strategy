import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { DatabaseService } from '../database/database.service';

describe('NotificationsService - Auto-Extraction Features', () => {
    let service: NotificationsService;
    let databaseService: DatabaseService;

    const mockDatabaseService = {
        query: jest.fn(),
        insert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NotificationsService,
                {
                    provide: DatabaseService,
                    useValue: mockDatabaseService,
                },
            ],
        }).compile();

        service = module.get<NotificationsService>(NotificationsService);
        databaseService = module.get<DatabaseService>(DatabaseService);

        jest.clearAllMocks();
    });

    describe('create - with new fields', () => {
        it('should create notification with all new fields', async () => {
            const mockNotificationId = 'notif-123';
            const createDto = {
                user_id: 'user-123',
                org_id: 'org-123',
                title: 'Extraction Complete',
                message: 'Objects extracted successfully',
                type: 'extraction_complete',
                severity: 'success',
                related_resource_type: 'extraction_job',
                related_resource_id: 'job-123',
                read: false,
                dismissed: false,
                actions: [
                    {
                        label: 'View Objects',
                        url: '/admin/objects?jobId=job-123',
                        style: 'primary',
                    },
                ],
                expires_at: new Date('2025-12-31'),
                details: { summary: { objects_created: 10 } },
            };

            mockDatabaseService.insert.mockResolvedValue([{ id: mockNotificationId }]);

            const result = await service.create(createDto);

            expect(mockDatabaseService.insert).toHaveBeenCalledWith(
                'kb.notifications',
                expect.objectContaining({
                    type: 'extraction_complete',
                    severity: 'success',
                    related_resource_type: 'extraction_job',
                    related_resource_id: 'job-123',
                    read: false,
                    dismissed: false,
                    actions: createDto.actions,
                    expires_at: createDto.expires_at,
                }),
            );

            expect(result.id).toBe(mockNotificationId);
        });

        it('should handle optional new fields gracefully', async () => {
            const mockNotificationId = 'notif-124';
            const createDto = {
                user_id: 'user-123',
                org_id: 'org-123',
                title: 'Simple Notification',
                message: 'Basic message',
                // No new fields provided
            };

            mockDatabaseService.insert.mockResolvedValue([{ id: mockNotificationId }]);

            const result = await service.create(createDto);

            expect(mockDatabaseService.insert).toHaveBeenCalledWith(
                'kb.notifications',
                expect.not.objectContaining({
                    type: expect.anything(),
                    severity: expect.anything(),
                    actions: expect.anything(),
                }),
            );

            expect(result.id).toBe(mockNotificationId);
        });
    });

    describe('dismiss', () => {
        it('should mark notification as dismissed', async () => {
            const notificationId = 'notif-123';
            const userId = 'user-123';

            mockDatabaseService.update.mockResolvedValue([
                { id: notificationId, dismissed: true },
            ]);

            const result = await service.dismiss(notificationId, userId);

            expect(mockDatabaseService.update).toHaveBeenCalledWith(
                'kb.notifications',
                { id: notificationId, user_id: userId },
                expect.objectContaining({
                    dismissed: true,
                    dismissed_at: expect.any(Date),
                }),
            );

            expect(result.dismissed).toBe(true);
        });

        it('should throw NotFoundException when notification not found', async () => {
            const notificationId = 'nonexistent';
            const userId = 'user-123';

            mockDatabaseService.update.mockResolvedValue([]);

            await expect(service.dismiss(notificationId, userId)).rejects.toThrow(
                'Notification not found',
            );
        });
    });

    describe('getCounts', () => {
        it('should return correct counts', async () => {
            const userId = 'user-123';

            mockDatabaseService.query.mockResolvedValue([
                {
                    total: '15',
                    unread: '5',
                    dismissed: '3',
                },
            ]);

            const result = await service.getCounts(userId);

            expect(result).toEqual({
                total: 15,
                unread: 5,
                dismissed: 3,
            });

            expect(mockDatabaseService.query).toHaveBeenCalledWith(
                expect.stringContaining('COUNT(*) as total'),
                [userId],
            );
        });

        it('should handle empty notification list', async () => {
            const userId = 'user-123';

            mockDatabaseService.query.mockResolvedValue([
                {
                    total: '0',
                    unread: '0',
                    dismissed: '0',
                },
            ]);

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
                orgId: 'org-123',
                jobId: 'job-123',
                documentId: 'doc-123',
                documentName: 'requirements.pdf',
                objectsByType: {
                    Requirement: 5,
                    Decision: 3,
                    Feature: 7,
                },
                averageConfidence: 0.87,
                durationSeconds: 12.3,
                lowConfidenceCount: 2,
            };

            mockDatabaseService.insert.mockResolvedValue([{ id: mockNotificationId }]);

            const result = await service.notifyExtractionCompleted(data);

            expect(mockDatabaseService.insert).toHaveBeenCalledWith(
                'kb.notifications',
                expect.objectContaining({
                    type: 'extraction_complete',
                    severity: 'warning', // Because lowConfidenceCount > 0
                    title: 'Object Extraction Complete',
                    message: expect.stringContaining('Extracted 15 objects'),
                    message: expect.stringContaining('5 Requirements'),
                    message: expect.stringContaining('3 Decisions'),
                    message: expect.stringContaining('7 Features'),
                    message: expect.stringContaining('2 objects require review'),
                    related_resource_type: 'extraction_job',
                    related_resource_id: 'job-123',
                    actions: expect.arrayContaining([
                        expect.objectContaining({
                            label: 'View Objects',
                            url: expect.stringContaining('/admin/objects?jobId=job-123'),
                            style: 'primary',
                        }),
                        expect.objectContaining({
                            label: 'Review Objects',
                            url: expect.stringContaining('filter=requires_review'),
                            style: 'warning',
                        }),
                        expect.objectContaining({
                            label: 'View Job Details',
                            url: expect.stringContaining('/admin/extraction/jobs/job-123'),
                            style: 'secondary',
                        }),
                    ]),
                    details: expect.objectContaining({
                        summary: expect.objectContaining({
                            objects_created: 15,
                            objects_by_type: data.objectsByType,
                            average_confidence: 0.87,
                            duration_seconds: 12.3,
                            requires_review: 2,
                        }),
                    }),
                }),
            );

            expect(result.id).toBe(mockNotificationId);
        });

        it('should create success notification when no review required', async () => {
            const mockNotificationId = 'notif-126';
            const data = {
                userId: 'user-123',
                orgId: 'org-123',
                jobId: 'job-123',
                documentId: 'doc-123',
                documentName: 'spec.txt',
                objectsByType: {
                    Requirement: 10,
                },
                averageConfidence: 0.95,
                durationSeconds: 8.5,
                lowConfidenceCount: 0,
            };

            mockDatabaseService.insert.mockResolvedValue([{ id: mockNotificationId }]);

            await service.notifyExtractionCompleted(data);

            expect(mockDatabaseService.insert).toHaveBeenCalledWith(
                'kb.notifications',
                expect.objectContaining({
                    severity: 'success', // No review required
                    message: expect.not.stringContaining('require review'),
                }),
            );
        });

        it('should handle empty object extraction', async () => {
            const mockNotificationId = 'notif-127';
            const data = {
                userId: 'user-123',
                orgId: 'org-123',
                jobId: 'job-123',
                documentId: 'doc-123',
                documentName: 'empty.txt',
                objectsByType: {},
                averageConfidence: 0,
                durationSeconds: 2.1,
                lowConfidenceCount: 0,
            };

            mockDatabaseService.insert.mockResolvedValue([{ id: mockNotificationId }]);

            await service.notifyExtractionCompleted(data);

            expect(mockDatabaseService.insert).toHaveBeenCalledWith(
                'kb.notifications',
                expect.objectContaining({
                    message: expect.stringContaining('Extracted 0 objects'),
                }),
            );
        });
    });

    describe('notifyExtractionFailed', () => {
        it('should create failure notification with retry info', async () => {
            const mockNotificationId = 'notif-128';
            const data = {
                userId: 'user-123',
                orgId: 'org-123',
                jobId: 'job-123',
                documentId: 'doc-123',
                documentName: 'requirements.pdf',
                errorMessage: 'LLM API rate limit exceeded',
                retryCount: 1,
                willRetry: true,
            };

            mockDatabaseService.insert.mockResolvedValue([{ id: mockNotificationId }]);

            const result = await service.notifyExtractionFailed(data);

            expect(mockDatabaseService.insert).toHaveBeenCalledWith(
                'kb.notifications',
                expect.objectContaining({
                    type: 'extraction_failed',
                    severity: 'error',
                    title: 'Extraction Failed: requirements.pdf',
                    message: expect.stringContaining('will retry automatically'),
                    message: expect.stringContaining('attempt 2/3'),
                    related_resource_type: 'extraction_job',
                    related_resource_id: 'job-123',
                    actions: expect.arrayContaining([
                        expect.objectContaining({
                            label: 'View Job Details',
                            url: expect.stringContaining('/admin/extraction/jobs/job-123'),
                        }),
                    ]),
                    details: expect.objectContaining({
                        error: expect.objectContaining({
                            message: 'LLM API rate limit exceeded',
                            retry_count: 1,
                            will_retry: true,
                        }),
                    }),
                }),
            );

            expect(result.id).toBe(mockNotificationId);
        });

        it('should create final failure notification when no retry', async () => {
            const mockNotificationId = 'notif-129';
            const data = {
                userId: 'user-123',
                orgId: 'org-123',
                jobId: 'job-123',
                documentId: 'doc-123',
                documentName: 'document.pdf',
                errorMessage: 'Invalid document format',
                retryCount: 3,
                willRetry: false,
            };

            mockDatabaseService.insert.mockResolvedValue([{ id: mockNotificationId }]);

            await service.notifyExtractionFailed(data);

            expect(mockDatabaseService.insert).toHaveBeenCalledWith(
                'kb.notifications',
                expect.objectContaining({
                    message: expect.stringContaining('failed permanently'),
                    message: expect.not.stringContaining('will retry'),
                    details: expect.objectContaining({
                        error: expect.objectContaining({
                            will_retry: false,
                        }),
                    }),
                }),
            );
        });
    });
});
