import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserProfileSyncWorkerService } from '../../../src/modules/user-profile/user-profile-sync-worker.service';
import { UserProfile } from '../../../src/entities/user-profile.entity';
import { UserEmail } from '../../../src/entities/user-email.entity';
import { ZitadelService } from '../../../src/modules/auth/zitadel.service';
import { DatabaseService } from '../../../src/common/database/database.service';

describe('UserProfileSyncWorkerService', () => {
  let service: UserProfileSyncWorkerService;
  let userProfileRepository: any;
  let userEmailRepository: any;
  let zitadelService: any;
  let databaseService: any;

  beforeEach(async () => {
    // Mock repositories
    userProfileRepository = {
      createQueryBuilder: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
    };

    userEmailRepository = {
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
    };

    // Mock ZitadelService
    zitadelService = {
      isConfigured: vi.fn().mockReturnValue(true),
      getUserById: vi.fn(),
    };

    // Mock DatabaseService
    databaseService = {
      isOnline: vi.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserProfileSyncWorkerService,
        {
          provide: getRepositoryToken(UserProfile),
          useValue: userProfileRepository,
        },
        {
          provide: getRepositoryToken(UserEmail),
          useValue: userEmailRepository,
        },
        {
          provide: ZitadelService,
          useValue: zitadelService,
        },
        {
          provide: DatabaseService,
          useValue: databaseService,
        },
      ],
    }).compile();

    service = module.get<UserProfileSyncWorkerService>(
      UserProfileSyncWorkerService
    );

    // Prevent auto-start in tests
    process.env.NODE_ENV = 'test';
    process.env.ENABLE_WORKERS_IN_TESTS = 'false';
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.USER_PROFILE_SYNC_ENABLED;
    delete process.env.USER_PROFILE_SYNC_INTERVAL_MS;
    delete process.env.USER_PROFILE_SYNC_BATCH_SIZE;
  });

  describe('onModuleInit', () => {
    it('should not start if sync is disabled via config', () => {
      process.env.USER_PROFILE_SYNC_ENABLED = 'false';
      const startSpy = vi.spyOn(service, 'start');

      service.onModuleInit();

      expect(startSpy).not.toHaveBeenCalled();
    });

    it('should not start if database is offline', () => {
      databaseService.isOnline.mockReturnValue(false);
      const startSpy = vi.spyOn(service, 'start');

      service.onModuleInit();

      expect(startSpy).not.toHaveBeenCalled();
    });

    it('should not start during tests unless enabled', () => {
      process.env.NODE_ENV = 'test';
      process.env.ENABLE_WORKERS_IN_TESTS = 'false';
      const startSpy = vi.spyOn(service, 'start');

      service.onModuleInit();

      expect(startSpy).not.toHaveBeenCalled();
    });

    it('should not start if Zitadel is not configured', () => {
      zitadelService.isConfigured.mockReturnValue(false);
      const startSpy = vi.spyOn(service, 'start');

      service.onModuleInit();

      expect(startSpy).not.toHaveBeenCalled();
    });
  });

  describe('start/stop', () => {
    it('should set running flag on start', () => {
      service.start(10000);

      expect(service.stats().running).toBe(true);
    });

    it('should clear running flag on stop', async () => {
      service.start(10000);
      await service.stop();

      expect(service.stats().running).toBe(false);
    });

    it('should not start twice', () => {
      service.start(10000);
      service.start(10000); // Second call should be ignored

      expect(service.stats().running).toBe(true);
    });
  });

  describe('syncUserById', () => {
    it('should return null if user not found', async () => {
      userProfileRepository.findOne.mockResolvedValue(null);

      const result = await service.syncUserById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should sync user profile from Zitadel', async () => {
      const mockUser = {
        id: 'user-123',
        zitadelUserId: '123456789',
        firstName: null,
        lastName: null,
        displayName: null,
      };

      const mockZitadelUser = {
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
        },
        email: 'john@example.com',
        emailVerified: true,
      };

      userProfileRepository.findOne.mockResolvedValue(mockUser);
      userProfileRepository.update.mockResolvedValue({ affected: 1 });
      zitadelService.getUserById.mockResolvedValue(mockZitadelUser);
      userEmailRepository.findOne.mockResolvedValue(null); // No existing email
      userEmailRepository.create.mockReturnValue({
        userId: 'user-123',
        email: 'john@example.com',
        verified: true,
      });
      userEmailRepository.save.mockResolvedValue({
        userId: 'user-123',
        email: 'john@example.com',
        verified: true,
      });

      const result = await service.syncUserById('user-123');

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(result?.updatedFields).toContain('firstName');
      expect(result?.updatedFields).toContain('lastName');
      expect(result?.updatedFields).toContain('displayName');
      expect(result?.updatedFields).toContain('email');
    });

    it('should not overwrite existing profile fields', async () => {
      const mockUser = {
        id: 'user-123',
        zitadelUserId: '123456789',
        firstName: 'Existing',
        lastName: 'User',
        displayName: null, // Only displayName is null
      };

      const mockZitadelUser = {
        profile: {
          firstName: 'NewFirst',
          lastName: 'NewLast',
          displayName: 'New Display',
        },
        email: 'user@example.com',
        emailVerified: true,
      };

      userProfileRepository.findOne.mockResolvedValue(mockUser);
      userProfileRepository.update.mockResolvedValue({ affected: 1 });
      zitadelService.getUserById.mockResolvedValue(mockZitadelUser);
      userEmailRepository.findOne.mockResolvedValue({
        email: 'user@example.com',
      });

      const result = await service.syncUserById('user-123');

      expect(result?.success).toBe(true);
      // Should only update displayName since firstName and lastName are not null
      expect(result?.updatedFields).toContain('displayName');
      expect(result?.updatedFields).not.toContain('firstName');
      expect(result?.updatedFields).not.toContain('lastName');
    });

    it('should handle Zitadel user not found', async () => {
      const mockUser = {
        id: 'user-123',
        zitadelUserId: '123456789',
        firstName: null,
      };

      userProfileRepository.findOne.mockResolvedValue(mockUser);
      zitadelService.getUserById.mockResolvedValue(null);

      const result = await service.syncUserById('user-123');

      expect(result?.success).toBe(false);
      expect(result?.error).toBe('User not found in Zitadel');
    });

    it('should handle Zitadel API errors gracefully', async () => {
      const mockUser = {
        id: 'user-123',
        zitadelUserId: '123456789',
        firstName: null,
      };

      userProfileRepository.findOne.mockResolvedValue(mockUser);
      zitadelService.getUserById.mockRejectedValue(new Error('API timeout'));

      const result = await service.syncUserById('user-123');

      expect(result?.success).toBe(false);
      expect(result?.error).toBe('API timeout');
    });

    it('should skip email sync if email already exists for user', async () => {
      const mockUser = {
        id: 'user-123',
        zitadelUserId: '123456789',
        firstName: null,
        lastName: null,
        displayName: null,
      };

      const mockZitadelUser = {
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
        },
        email: 'john@example.com',
        emailVerified: true,
      };

      userProfileRepository.findOne.mockResolvedValue(mockUser);
      userProfileRepository.update.mockResolvedValue({ affected: 1 });
      zitadelService.getUserById.mockResolvedValue(mockZitadelUser);
      // Email already exists for this user
      userEmailRepository.findOne.mockResolvedValue({
        userId: 'user-123',
        email: 'john@example.com',
      });

      const result = await service.syncUserById('user-123');

      expect(result?.success).toBe(true);
      expect(result?.updatedFields).not.toContain('email');
      expect(userEmailRepository.save).not.toHaveBeenCalled();
    });

    it('should skip email sync if email is used by another user', async () => {
      const mockUser = {
        id: 'user-123',
        zitadelUserId: '123456789',
        firstName: null,
        lastName: null,
        displayName: null,
      };

      const mockZitadelUser = {
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
        },
        email: 'john@example.com',
        emailVerified: true,
      };

      userProfileRepository.findOne.mockResolvedValue(mockUser);
      userProfileRepository.update.mockResolvedValue({ affected: 1 });
      zitadelService.getUserById.mockResolvedValue(mockZitadelUser);
      // First call: check if user has email - no
      // Second call: check if email exists for another user - yes
      userEmailRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'other-user-456',
          email: 'john@example.com',
        });

      const result = await service.syncUserById('user-123');

      expect(result?.success).toBe(true);
      expect(result?.updatedFields).not.toContain('email');
      expect(userEmailRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('processBatch', () => {
    it('should process batch of users needing sync', async () => {
      const mockQueryBuilder = {
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([
          {
            id: 'user-1',
            zitadelUserId: '111',
            firstName: null,
            lastName: null,
            displayName: null,
          },
          {
            id: 'user-2',
            zitadelUserId: '222',
            firstName: null,
            lastName: null,
            displayName: null,
          },
        ]),
      };

      userProfileRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder
      );
      userProfileRepository.update.mockResolvedValue({ affected: 1 });
      zitadelService.getUserById.mockResolvedValue({
        profile: {
          firstName: 'Test',
          lastName: 'User',
          displayName: 'Test User',
        },
        email: 'test@example.com',
        emailVerified: true,
      });
      userEmailRepository.findOne.mockResolvedValue(null);
      userEmailRepository.create.mockReturnValue({});
      userEmailRepository.save.mockResolvedValue({});

      await service.processBatch();

      const stats = service.stats();
      expect(stats.processed).toBe(2);
      expect(stats.succeeded).toBe(2);
      expect(stats.failed).toBe(0);
      expect(stats.lastSyncAt).not.toBeNull();
    });

    it('should handle empty batch gracefully', async () => {
      const mockQueryBuilder = {
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      };

      userProfileRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder
      );

      await service.processBatch();

      const stats = service.stats();
      expect(stats.processed).toBe(0);
    });

    it('should count failures correctly', async () => {
      const mockQueryBuilder = {
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([
          {
            id: 'user-1',
            zitadelUserId: '111',
            firstName: null,
          },
        ]),
      };

      userProfileRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder
      );
      zitadelService.getUserById.mockRejectedValue(new Error('API error'));

      await service.processBatch();

      const stats = service.stats();
      expect(stats.processed).toBe(1);
      expect(stats.succeeded).toBe(0);
      expect(stats.failed).toBe(1);
    });
  });

  describe('stats', () => {
    it('should return current statistics', () => {
      const stats = service.stats();

      expect(stats).toHaveProperty('processed');
      expect(stats).toHaveProperty('succeeded');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('lastSyncAt');
      expect(stats).toHaveProperty('running');
    });

    it('should track cumulative stats across batches', async () => {
      const mockQueryBuilder = {
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'user-1', zitadelUserId: '111', firstName: null },
          ]),
      };

      userProfileRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder
      );
      userProfileRepository.update.mockResolvedValue({ affected: 1 });
      zitadelService.getUserById.mockResolvedValue({
        profile: { firstName: 'Test', lastName: 'User', displayName: 'Test' },
        email: 'test@example.com',
      });
      userEmailRepository.findOne.mockResolvedValue({
        email: 'test@example.com',
      });

      // Run first batch
      await service.processBatch();
      expect(service.stats().processed).toBe(1);

      // Run second batch
      await service.processBatch();
      expect(service.stats().processed).toBe(2);
    });
  });

  describe('findUsersNeedingSync', () => {
    it('should use correct query builder parameters', async () => {
      const mockQueryBuilder = {
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      };

      userProfileRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder
      );

      await service.processBatch();

      // Verify query builder was called correctly
      expect(userProfileRepository.createQueryBuilder).toHaveBeenCalledWith(
        'profile'
      );
      expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'profile.emails',
        'email'
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'profile.deleted_at IS NULL'
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "profile.zitadel_user_id ~ '^[0-9]+$'"
      );
    });
  });
});
