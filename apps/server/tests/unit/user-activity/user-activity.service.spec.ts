import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserActivityService } from '../../../src/modules/user-activity/user-activity.service';
import { UserRecentItem } from '../../../src/entities/user-recent-item.entity';
import { RecordActivityDto } from '../../../src/modules/user-activity/dto/record-activity.dto';

describe('UserActivityService', () => {
  let service: UserActivityService;

  // Mock data
  const mockUserId = 'user-123';
  const mockProjectId = 'project-456';

  const mockRecentItem: Partial<UserRecentItem> = {
    id: 'item-1',
    userId: mockUserId,
    projectId: mockProjectId,
    resourceType: 'document',
    resourceId: 'doc-789',
    resourceName: 'requirements.pdf',
    resourceSubtype: 'application/pdf',
    actionType: 'viewed',
    accessedAt: new Date('2025-01-15T10:00:00Z'),
    createdAt: new Date('2025-01-15T09:00:00Z'),
  };

  const mockObjectItem: Partial<UserRecentItem> = {
    id: 'item-2',
    userId: mockUserId,
    projectId: mockProjectId,
    resourceType: 'object',
    resourceId: 'obj-123',
    resourceName: 'Authentication Service',
    resourceSubtype: 'Component',
    actionType: 'edited',
    accessedAt: new Date('2025-01-15T11:00:00Z'),
    createdAt: new Date('2025-01-15T08:00:00Z'),
  };

  // Mock QueryBuilder
  const createMockQueryBuilder = (overrides: Record<string, unknown> = {}) => ({
    insert: vi.fn().mockReturnThis(),
    into: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    orUpdate: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  });

  const mockRecentItemRepo = {
    createQueryBuilder: vi.fn(() => createMockQueryBuilder()),
    find: vi.fn(),
    delete: vi.fn(),
    query: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    // Restore default mock implementations
    mockRecentItemRepo.createQueryBuilder.mockReturnValue(
      createMockQueryBuilder()
    );
    mockRecentItemRepo.find.mockResolvedValue([]);
    mockRecentItemRepo.delete.mockResolvedValue({ affected: 1 });
    mockRecentItemRepo.query.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserActivityService,
        {
          provide: getRepositoryToken(UserRecentItem),
          useValue: mockRecentItemRepo,
        },
      ],
    }).compile();

    service = module.get<UserActivityService>(UserActivityService);
  });

  describe('recordActivity', () => {
    const validActivityDto: RecordActivityDto = {
      resourceType: 'document',
      resourceId: 'doc-789',
      resourceName: 'requirements.pdf',
      resourceSubtype: 'application/pdf',
      actionType: 'viewed',
    };

    it('should record activity with upsert', async () => {
      const mockQb = createMockQueryBuilder();
      mockRecentItemRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.recordActivity(mockUserId, mockProjectId, validActivityDto);

      expect(mockQb.insert).toHaveBeenCalled();
      expect(mockQb.into).toHaveBeenCalledWith(UserRecentItem);
      expect(mockQb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          projectId: mockProjectId,
          resourceType: 'document',
          resourceId: 'doc-789',
          resourceName: 'requirements.pdf',
          resourceSubtype: 'application/pdf',
          actionType: 'viewed',
        })
      );
      expect(mockQb.orUpdate).toHaveBeenCalledWith(
        ['resource_name', 'resource_subtype', 'action_type', 'accessed_at'],
        ['user_id', 'project_id', 'resource_type', 'resource_id']
      );
      expect(mockQb.execute).toHaveBeenCalled();
    });

    it('should skip recording when userId is missing', async () => {
      await service.recordActivity(undefined, mockProjectId, validActivityDto);

      expect(mockRecentItemRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should skip recording when projectId is missing', async () => {
      await service.recordActivity(mockUserId, undefined, validActivityDto);

      expect(mockRecentItemRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should handle null resourceName and resourceSubtype', async () => {
      const activityWithoutOptionals: RecordActivityDto = {
        resourceType: 'object',
        resourceId: 'obj-123',
        actionType: 'edited',
      };

      const mockQb = createMockQueryBuilder();
      mockRecentItemRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.recordActivity(
        mockUserId,
        mockProjectId,
        activityWithoutOptionals
      );

      expect(mockQb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceName: null,
          resourceSubtype: null,
        })
      );
    });

    it('should not throw on database error (fire-and-forget)', async () => {
      const mockQb = createMockQueryBuilder({
        execute: vi.fn().mockRejectedValue(new Error('Database error')),
      });
      mockRecentItemRepo.createQueryBuilder.mockReturnValue(mockQb);

      // Should not throw
      await expect(
        service.recordActivity(mockUserId, mockProjectId, validActivityDto)
      ).resolves.not.toThrow();
    });
  });

  describe('getRecentItems', () => {
    it('should return empty arrays when userId is missing', async () => {
      const result = await service.getRecentItems(undefined, mockProjectId);

      expect(result).toEqual({ objects: [], documents: [] });
      expect(mockRecentItemRepo.query).not.toHaveBeenCalled();
    });

    it('should return empty arrays when projectId is missing', async () => {
      const result = await service.getRecentItems(mockUserId, undefined);

      expect(result).toEqual({ objects: [], documents: [] });
      expect(mockRecentItemRepo.query).not.toHaveBeenCalled();
    });

    it('should query for both objects and documents', async () => {
      // Mock raw query results (snake_case from DB)
      const objectsRaw = [
        {
          id: 'item-2',
          user_id: mockUserId,
          project_id: mockProjectId,
          resource_type: 'object',
          resource_id: 'obj-123',
          resource_name: 'Authentication Service',
          resource_subtype: 'Component',
          action_type: 'edited',
          accessed_at: '2025-01-15T11:00:00Z',
          created_at: '2025-01-15T08:00:00Z',
        },
      ];

      const documentsRaw = [
        {
          id: 'item-1',
          user_id: mockUserId,
          project_id: mockProjectId,
          resource_type: 'document',
          resource_id: 'doc-789',
          resource_name: 'requirements.pdf',
          resource_subtype: 'application/pdf',
          action_type: 'viewed',
          accessed_at: '2025-01-15T10:00:00Z',
          created_at: '2025-01-15T09:00:00Z',
        },
      ];

      mockRecentItemRepo.query
        .mockResolvedValueOnce(objectsRaw)
        .mockResolvedValueOnce(documentsRaw);

      const result = await service.getRecentItems(mockUserId, mockProjectId);

      // Verify two queries were made
      expect(mockRecentItemRepo.query).toHaveBeenCalledTimes(2);

      // Verify objects query includes INNER JOIN with graph_objects
      expect(mockRecentItemRepo.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INNER JOIN kb.graph_objects'),
        [mockUserId, mockProjectId, 10]
      );

      // Verify documents query includes INNER JOIN with documents
      expect(mockRecentItemRepo.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INNER JOIN kb.documents'),
        [mockUserId, mockProjectId, 10]
      );

      // Verify result structure
      expect(result.objects).toHaveLength(1);
      expect(result.documents).toHaveLength(1);
      expect(result.objects[0]).toEqual({
        id: 'item-2',
        resourceType: 'object',
        resourceId: 'obj-123',
        resourceName: 'Authentication Service',
        resourceSubtype: 'Component',
        actionType: 'edited',
        accessedAt: expect.any(Date),
      });
      expect(result.documents[0]).toEqual({
        id: 'item-1',
        resourceType: 'document',
        resourceId: 'doc-789',
        resourceName: 'requirements.pdf',
        resourceSubtype: 'application/pdf',
        actionType: 'viewed',
        accessedAt: expect.any(Date),
      });
    });

    it('should propagate database errors', async () => {
      mockRecentItemRepo.query.mockRejectedValue(new Error('Query failed'));

      await expect(
        service.getRecentItems(mockUserId, mockProjectId)
      ).rejects.toThrow('Query failed');
    });
  });

  describe('getRecentItemsByType', () => {
    it('should return empty array when userId is missing', async () => {
      const result = await service.getRecentItemsByType(
        undefined,
        mockProjectId,
        'document'
      );

      expect(result).toEqual([]);
      expect(mockRecentItemRepo.find).not.toHaveBeenCalled();
    });

    it('should return empty array when projectId is missing', async () => {
      const result = await service.getRecentItemsByType(
        mockUserId,
        undefined,
        'document'
      );

      expect(result).toEqual([]);
      expect(mockRecentItemRepo.find).not.toHaveBeenCalled();
    });

    it('should query for documents only', async () => {
      mockRecentItemRepo.find.mockResolvedValue([
        mockRecentItem as UserRecentItem,
      ]);

      const result = await service.getRecentItemsByType(
        mockUserId,
        mockProjectId,
        'document'
      );

      expect(mockRecentItemRepo.find).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          projectId: mockProjectId,
          resourceType: 'document',
        },
        order: { accessedAt: 'DESC' },
        take: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].resourceType).toBe('document');
    });

    it('should query for objects only', async () => {
      mockRecentItemRepo.find.mockResolvedValue([
        mockObjectItem as UserRecentItem,
      ]);

      const result = await service.getRecentItemsByType(
        mockUserId,
        mockProjectId,
        'object'
      );

      expect(mockRecentItemRepo.find).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          projectId: mockProjectId,
          resourceType: 'object',
        },
        order: { accessedAt: 'DESC' },
        take: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].resourceType).toBe('object');
    });
  });

  describe('removeRecentItem', () => {
    it('should skip removal when userId is missing', async () => {
      await service.removeRecentItem(
        undefined,
        mockProjectId,
        'document',
        'doc-789'
      );

      expect(mockRecentItemRepo.delete).not.toHaveBeenCalled();
    });

    it('should skip removal when projectId is missing', async () => {
      await service.removeRecentItem(
        mockUserId,
        undefined,
        'document',
        'doc-789'
      );

      expect(mockRecentItemRepo.delete).not.toHaveBeenCalled();
    });

    it('should delete specific item', async () => {
      await service.removeRecentItem(
        mockUserId,
        mockProjectId,
        'document',
        'doc-789'
      );

      expect(mockRecentItemRepo.delete).toHaveBeenCalledWith({
        userId: mockUserId,
        projectId: mockProjectId,
        resourceType: 'document',
        resourceId: 'doc-789',
      });
    });

    it('should propagate database errors', async () => {
      mockRecentItemRepo.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(
        service.removeRecentItem(
          mockUserId,
          mockProjectId,
          'document',
          'doc-789'
        )
      ).rejects.toThrow('Delete failed');
    });
  });

  describe('clearAllRecentItems', () => {
    it('should skip clearing when userId is missing', async () => {
      await service.clearAllRecentItems(undefined, mockProjectId);

      expect(mockRecentItemRepo.delete).not.toHaveBeenCalled();
    });

    it('should skip clearing when projectId is missing', async () => {
      await service.clearAllRecentItems(mockUserId, undefined);

      expect(mockRecentItemRepo.delete).not.toHaveBeenCalled();
    });

    it('should delete all items for user in project', async () => {
      await service.clearAllRecentItems(mockUserId, mockProjectId);

      expect(mockRecentItemRepo.delete).toHaveBeenCalledWith({
        userId: mockUserId,
        projectId: mockProjectId,
      });
    });

    it('should propagate database errors', async () => {
      mockRecentItemRepo.delete.mockRejectedValue(new Error('Clear failed'));

      await expect(
        service.clearAllRecentItems(mockUserId, mockProjectId)
      ).rejects.toThrow('Clear failed');
    });
  });
});
