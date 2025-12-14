import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TasksService } from '../../../src/modules/tasks/tasks.service';
import { Task } from '../../../src/entities/task.entity';
import { UserProfile } from '../../../src/entities/user-profile.entity';
import { UserEmail } from '../../../src/entities/user-email.entity';
import {
  ObjectMergeService,
  MergeResult,
} from '../../../src/modules/graph/object-merge.service';
import { TaskStatus } from '../../../src/modules/tasks/dto/task.dto';
import { NotFoundException } from '@nestjs/common';

describe('TasksService', () => {
  let service: TasksService;

  // Mock task data
  const mockPendingTask: Partial<Task> = {
    id: 'task-123',
    projectId: 'project-1',
    title: 'Merge duplicate entities',
    description: 'Entity A appears to be a duplicate of Entity B',
    type: 'merge_suggestion',
    status: 'pending',
    sourceType: 'agent',
    sourceId: 'merge-agent',
    metadata: {
      sourceId: 'source-obj-1',
      targetId: 'target-obj-1',
      confidence: 0.95,
    },
    createdAt: new Date('2025-01-01'),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNotes: null,
  };

  const mockResolvedTask: Partial<Task> = {
    ...mockPendingTask,
    id: 'task-456',
    status: 'accepted',
    resolvedAt: new Date('2025-01-02'),
    resolvedBy: 'user-123',
  };

  // Helper to create a complete mock QueryBuilder
  const createMockQueryBuilder = (overrides: Record<string, unknown> = {}) => ({
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getCount: vi.fn().mockResolvedValue(0),
    getMany: vi.fn().mockResolvedValue([]),
    select: vi.fn().mockReturnThis(),
    getRawOne: vi.fn().mockResolvedValue({
      pending: '0',
      pending_other: '0',
      accepted: '0',
      rejected: '0',
      cancelled: '0',
    }),
    ...overrides,
  });

  const mockTaskRepo = {
    create: vi.fn((data) => ({ id: 'new-task-id', ...data })),
    save: vi.fn((entity) => Promise.resolve(entity)),
    findOne: vi.fn(),
    find: vi.fn(),
    count: vi.fn(),
    createQueryBuilder: vi.fn(() => createMockQueryBuilder()),
  };

  const mockUserProfileRepo = {
    find: vi.fn().mockResolvedValue([]),
  };

  const mockUserEmailRepo = {
    find: vi.fn().mockResolvedValue([]),
  };

  const mockObjectMergeService = {
    mergeObjects: vi.fn(),
  };

  const mockDataSource = {
    query: vi.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    // Clear mock call history but preserve implementations
    vi.resetAllMocks();

    // Recreate default mock implementations after reset
    mockTaskRepo.create.mockImplementation((data) => ({
      id: 'new-task-id',
      ...data,
    }));
    mockTaskRepo.save.mockImplementation((entity) => Promise.resolve(entity));
    mockUserProfileRepo.find.mockResolvedValue([]);
    mockUserEmailRepo.find.mockResolvedValue([]);
    mockDataSource.query.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getRepositoryToken(Task),
          useValue: mockTaskRepo,
        },
        {
          provide: getRepositoryToken(UserProfile),
          useValue: mockUserProfileRepo,
        },
        {
          provide: getRepositoryToken(UserEmail),
          useValue: mockUserEmailRepo,
        },
        {
          provide: ObjectMergeService,
          useValue: mockObjectMergeService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);

    // WORKAROUND: NestJS DI doesn't properly inject some services in test context
    // Manually assign the mocks to ensure they're available
    (service as any).objectMergeService = mockObjectMergeService;
    (service as any).dataSource = mockDataSource;
  });

  describe('create', () => {
    it('should create a new task', async () => {
      const createDto = {
        projectId: 'project-1',
        title: 'Test Task',
        description: 'Task description',
        type: 'merge_suggestion',
        metadata: { sourceId: 'src-1', targetId: 'tgt-1' },
      };

      mockTaskRepo.create.mockReturnValue({
        id: 'new-task-id',
        ...createDto,
        status: 'pending',
      });
      mockTaskRepo.save.mockResolvedValue({
        id: 'new-task-id',
        ...createDto,
        status: 'pending',
        createdAt: new Date(),
      });

      const result = await service.create(createDto);

      expect(result.id).toBe('new-task-id');
      expect(result.status).toBe('pending');
      expect(mockTaskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          title: 'Test Task',
          type: 'merge_suggestion',
          status: 'pending',
        })
      );
      expect(mockTaskRepo.save).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return task when found', async () => {
      mockTaskRepo.findOne.mockResolvedValue(mockPendingTask);

      const result = await service.findOne('task-123');

      expect(result.id).toBe('task-123');
      expect(mockTaskRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'task-123' },
      });
    });

    it('should throw NotFoundException when task not found', async () => {
      mockTaskRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('resolve', () => {
    describe('when accepting a merge_suggestion task', () => {
      it('should execute merge and update task status on success', async () => {
        const pendingTask = { ...mockPendingTask } as Task;
        mockTaskRepo.findOne.mockResolvedValue(pendingTask);

        const successfulMergeResult: MergeResult = {
          success: true,
          targetObjectId: 'target-obj-1',
          sourceObjectId: 'source-obj-1',
          deletedSourceId: 'source-obj-1',
          mergedProperties: { name: 'Merged Name' },
          redirectedRelationships: 3,
        };
        mockObjectMergeService.mergeObjects.mockResolvedValue(
          successfulMergeResult
        );
        mockTaskRepo.save.mockImplementation((task) => Promise.resolve(task));

        const result = await service.resolve(
          'task-123',
          'user-456',
          'accepted',
          'Approved by admin'
        );

        expect(result.task.status).toBe('accepted');
        expect(result.task.resolvedBy).toBe('user-456');
        expect(result.task.resolvedAt).toBeDefined();
        expect(result.task.resolutionNotes).toContain(
          'Merge completed: 3 relationships redirected'
        );
        expect(result.mergeResult).toBeDefined();
        expect(result.mergeResult?.success).toBe(true);

        expect(mockObjectMergeService.mergeObjects).toHaveBeenCalledWith(
          'source-obj-1',
          'target-obj-1',
          {
            propertyStrategy: 'source-wins',
            trackProvenance: true,
            userId: 'user-456',
          }
        );
      });

      it('should not update task status when merge fails', async () => {
        const pendingTask = { ...mockPendingTask } as Task;
        mockTaskRepo.findOne.mockResolvedValue(pendingTask);

        const failedMergeResult: MergeResult = {
          success: false,
          targetObjectId: 'target-obj-1',
          sourceObjectId: 'source-obj-1',
          deletedSourceId: null,
          mergedProperties: {},
          redirectedRelationships: 0,
          error: 'Source object not found',
        };
        mockObjectMergeService.mergeObjects.mockResolvedValue(
          failedMergeResult
        );
        mockTaskRepo.save.mockImplementation((task) => Promise.resolve(task));

        const result = await service.resolve(
          'task-123',
          'user-456',
          'accepted'
        );

        // Task should remain pending when merge fails
        expect(result.task.status).toBe('pending');
        expect(result.task.resolutionNotes).toContain(
          'Merge failed: Source object not found'
        );
        expect(result.mergeResult?.success).toBe(false);
      });

      it('should handle missing metadata gracefully', async () => {
        const taskWithoutMetadata = {
          ...mockPendingTask,
          metadata: {},
        } as Task;
        mockTaskRepo.findOne.mockResolvedValue(taskWithoutMetadata);
        mockTaskRepo.save.mockImplementation((task) => Promise.resolve(task));

        const result = await service.resolve(
          'task-123',
          'user-456',
          'accepted'
        );

        expect(result.task.status).toBe('pending');
        expect(result.task.resolutionNotes).toContain('Task metadata missing');
        expect(mockObjectMergeService.mergeObjects).not.toHaveBeenCalled();
      });
    });

    describe('when rejecting a task', () => {
      it('should update task status without executing merge', async () => {
        const pendingTask = { ...mockPendingTask } as Task;
        mockTaskRepo.findOne.mockResolvedValue(pendingTask);
        mockTaskRepo.save.mockImplementation((task) => Promise.resolve(task));

        const result = await service.resolve(
          'task-123',
          'user-456',
          'rejected',
          'Not a valid duplicate'
        );

        expect(result.task.status).toBe('rejected');
        expect(result.task.resolvedBy).toBe('user-456');
        expect(result.task.resolutionNotes).toBe('Not a valid duplicate');
        expect(result.mergeResult).toBeUndefined();
        expect(mockObjectMergeService.mergeObjects).not.toHaveBeenCalled();
      });
    });

    describe('when task is already resolved', () => {
      it('should return task without making changes', async () => {
        const alreadyResolved = { ...mockResolvedTask } as Task;
        mockTaskRepo.findOne.mockResolvedValue(alreadyResolved);

        const result = await service.resolve(
          'task-456',
          'another-user',
          'accepted'
        );

        expect(result.task.status).toBe('accepted');
        expect(result.task.resolvedBy).toBe('user-123'); // Original resolver
        expect(mockTaskRepo.save).not.toHaveBeenCalled();
        expect(mockObjectMergeService.mergeObjects).not.toHaveBeenCalled();
      });
    });
  });

  describe('cancel', () => {
    it('should cancel a pending task', async () => {
      const pendingTask = { ...mockPendingTask } as Task;
      mockTaskRepo.findOne.mockResolvedValue(pendingTask);
      mockTaskRepo.save.mockImplementation((task) => Promise.resolve(task));

      const result = await service.cancel(
        'task-123',
        'user-456',
        'No longer needed'
      );

      expect(result.status).toBe('cancelled');
      expect(result.resolvedBy).toBe('user-456');
      expect(result.resolutionNotes).toBe('No longer needed');
    });

    it('should not cancel an already resolved task', async () => {
      const resolvedTask = { ...mockResolvedTask } as Task;
      mockTaskRepo.findOne.mockResolvedValue(resolvedTask);

      const result = await service.cancel('task-456', 'another-user', 'reason');

      expect(result.status).toBe('accepted'); // Unchanged
      expect(mockTaskRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getForProject', () => {
    it('should return tasks with pagination', async () => {
      const tasks = [
        { ...mockPendingTask, id: 'task-1' },
        { ...mockPendingTask, id: 'task-2' },
      ] as Task[];

      const mockQb = createMockQueryBuilder({
        getCount: vi.fn().mockResolvedValue(2),
        getMany: vi.fn().mockResolvedValue(tasks),
      });
      mockTaskRepo.createQueryBuilder.mockReturnValue(mockQb);

      // Mock dataSource.query to return that all referenced objects exist
      mockDataSource.query.mockResolvedValue([
        { id: 'source-obj-1' },
        { id: 'target-obj-1' },
      ]);

      const result = await service.getForProject('project-1', {
        page: 1,
        limit: 10,
      });

      expect(result.total).toBe(2);
      expect(result.tasks).toHaveLength(2);
      expect(mockQb.skip).toHaveBeenCalledWith(0);
      expect(mockQb.take).toHaveBeenCalledWith(10);
    });

    it('should filter by status', async () => {
      const mockQb = createMockQueryBuilder();
      mockTaskRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockDataSource.query.mockResolvedValue([]);

      await service.getForProject('project-1', { status: TaskStatus.PENDING });

      expect(mockQb.andWhere).toHaveBeenCalledWith('t.status = :status', {
        status: 'pending',
      });
    });
  });

  describe('getCounts', () => {
    it('should return task counts by status', async () => {
      const mockQb = createMockQueryBuilder({
        getRawOne: vi.fn().mockResolvedValue({
          pending_other: '5',
          accepted: '10',
          rejected: '2',
          cancelled: '1',
        }),
      });
      mockTaskRepo.createQueryBuilder.mockReturnValue(mockQb);
      // Mock find for pending merge_suggestion tasks
      mockTaskRepo.find.mockResolvedValue([]);

      const result = await service.getCounts('project-1');

      expect(result.pending).toBe(5);
      expect(result.accepted).toBe(10);
      expect(result.rejected).toBe(2);
      expect(result.cancelled).toBe(1);
    });
  });

  describe('countPending', () => {
    it('should count pending tasks for a project', async () => {
      const mockQb = createMockQueryBuilder({
        getCount: vi.fn().mockResolvedValue(7),
      });
      mockTaskRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.countPending('project-1');

      expect(result).toBe(7);
    });

    it('should filter by type when provided', async () => {
      const mockQb = createMockQueryBuilder({
        getCount: vi.fn().mockResolvedValue(3),
      });
      mockTaskRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.countPending('project-1', 'merge_suggestion');

      expect(mockQb.andWhere).toHaveBeenCalledWith('t.type = :type', {
        type: 'merge_suggestion',
      });
    });
  });

  describe('countPendingByType', () => {
    it('should use simple count for non-merge_suggestion types', async () => {
      mockTaskRepo.count.mockResolvedValue(15);

      const result = await service.countPendingByType('other_type');

      expect(result).toBe(15);
      expect(mockTaskRepo.count).toHaveBeenCalledWith({
        where: { type: 'other_type', status: 'pending' },
      });
    });

    describe('for merge_suggestion type', () => {
      it('should return 0 when no pending tasks exist', async () => {
        mockTaskRepo.find.mockResolvedValue([]);

        const result = await service.countPendingByType('merge_suggestion');

        expect(result).toBe(0);
        expect(mockTaskRepo.find).toHaveBeenCalledWith({
          where: { type: 'merge_suggestion', status: 'pending' },
        });
      });

      it('should count only tasks where both source and target objects exist', async () => {
        const tasksWithObjects = [
          {
            id: 'task-1',
            type: 'merge_suggestion',
            status: 'pending',
            metadata: { sourceId: 'obj-1', targetId: 'obj-2' },
          },
          {
            id: 'task-2',
            type: 'merge_suggestion',
            status: 'pending',
            metadata: { sourceId: 'obj-3', targetId: 'obj-4' },
          },
          {
            id: 'task-3',
            type: 'merge_suggestion',
            status: 'pending',
            metadata: { sourceId: 'obj-5', targetId: 'obj-6' },
          },
        ] as unknown as Task[];

        mockTaskRepo.find.mockResolvedValue(tasksWithObjects);

        // Only obj-1, obj-2, obj-3 exist (obj-4, obj-5, obj-6 are deleted)
        mockDataSource.query.mockResolvedValue([
          { id: 'obj-1' },
          { id: 'obj-2' },
          { id: 'obj-3' },
        ]);

        const result = await service.countPendingByType('merge_suggestion');

        // task-1: both exist -> count
        // task-2: source exists, target deleted -> don't count
        // task-3: both deleted -> don't count
        expect(result).toBe(1);
      });

      it('should count task when source is missing but target exists', async () => {
        const tasks = [
          {
            id: 'task-1',
            type: 'merge_suggestion',
            status: 'pending',
            metadata: { sourceId: 'deleted-obj', targetId: 'existing-obj' },
          },
        ] as unknown as Task[];

        mockTaskRepo.find.mockResolvedValue(tasks);
        mockDataSource.query.mockResolvedValue([{ id: 'existing-obj' }]);

        const result = await service.countPendingByType('merge_suggestion');

        expect(result).toBe(0); // Source doesn't exist, so not counted
      });

      it('should count task when target is missing but source exists', async () => {
        const tasks = [
          {
            id: 'task-1',
            type: 'merge_suggestion',
            status: 'pending',
            metadata: { sourceId: 'existing-obj', targetId: 'deleted-obj' },
          },
        ] as unknown as Task[];

        mockTaskRepo.find.mockResolvedValue(tasks);
        mockDataSource.query.mockResolvedValue([{ id: 'existing-obj' }]);

        const result = await service.countPendingByType('merge_suggestion');

        expect(result).toBe(0); // Target doesn't exist, so not counted
      });

      it('should handle tasks with missing metadata gracefully', async () => {
        const tasks = [
          {
            id: 'task-1',
            type: 'merge_suggestion',
            status: 'pending',
            metadata: {},
          },
          {
            id: 'task-2',
            type: 'merge_suggestion',
            status: 'pending',
            metadata: { sourceId: 'obj-1', targetId: 'obj-2' },
          },
        ] as unknown as Task[];

        mockTaskRepo.find.mockResolvedValue(tasks);
        mockDataSource.query.mockResolvedValue([
          { id: 'obj-1' },
          { id: 'obj-2' },
        ]);

        const result = await service.countPendingByType('merge_suggestion');

        // task-1 has no metadata, sourceId and targetId are undefined -> treated as "exists" (fallback)
        // task-2 has both objects existing
        expect(result).toBe(2);
      });
    });
  });
});
