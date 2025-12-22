import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SuperadminService } from '../../../src/modules/superadmin/superadmin.service';
import { Superadmin } from '../../../src/entities/superadmin.entity';

function createMockRepository() {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
  };
}

describe('SuperadminService', () => {
  let service: SuperadminService;
  let mockRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    mockRepo = createMockRepository();
    service = new SuperadminService(mockRepo as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isSuperadmin', () => {
    it('returns true when user has active superadmin grant', async () => {
      const mockGrant: Partial<Superadmin> = {
        userId: 'user-123',
        revokedAt: null,
        grantedAt: new Date(),
      };
      mockRepo.findOne.mockResolvedValue(mockGrant);

      const result = await service.isSuperadmin('user-123');

      expect(result).toBe(true);
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          revokedAt: expect.anything(),
        },
      });
    });

    it('returns false when user has no superadmin grant', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.isSuperadmin('user-456');

      expect(result).toBe(false);
    });

    it('returns false when superadmin grant is revoked', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.isSuperadmin('user-789');

      expect(result).toBe(false);
    });

    describe('caching behavior', () => {
      it('caches positive result for subsequent calls', async () => {
        mockRepo.findOne.mockResolvedValue({
          userId: 'user-123',
          revokedAt: null,
        });

        await service.isSuperadmin('user-123');
        expect(mockRepo.findOne).toHaveBeenCalledTimes(1);

        const result = await service.isSuperadmin('user-123');
        expect(result).toBe(true);
        expect(mockRepo.findOne).toHaveBeenCalledTimes(1);
      });

      it('caches negative result for subsequent calls', async () => {
        mockRepo.findOne.mockResolvedValue(null);

        await service.isSuperadmin('user-not-admin');
        expect(mockRepo.findOne).toHaveBeenCalledTimes(1);

        const result = await service.isSuperadmin('user-not-admin');
        expect(result).toBe(false);
        expect(mockRepo.findOne).toHaveBeenCalledTimes(1);
      });

      it('cache expires after TTL', async () => {
        vi.useFakeTimers();

        mockRepo.findOne.mockResolvedValue({
          userId: 'user-123',
          revokedAt: null,
        });

        await service.isSuperadmin('user-123');
        expect(mockRepo.findOne).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(61_000);

        await service.isSuperadmin('user-123');
        expect(mockRepo.findOne).toHaveBeenCalledTimes(2);

        vi.useRealTimers();
      });

      it('different users have separate cache entries', async () => {
        mockRepo.findOne
          .mockResolvedValueOnce({ userId: 'user-a', revokedAt: null })
          .mockResolvedValueOnce(null);

        const resultA = await service.isSuperadmin('user-a');
        const resultB = await service.isSuperadmin('user-b');

        expect(resultA).toBe(true);
        expect(resultB).toBe(false);
        expect(mockRepo.findOne).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('getSuperadmins', () => {
    it('returns all active superadmin grants with relations', async () => {
      const mockGrants: Partial<Superadmin>[] = [
        {
          userId: 'user-1',
          revokedAt: null,
          grantedAt: new Date('2025-01-01'),
          user: { id: 'user-1', displayName: 'Admin One' } as any,
          grantedByUser: null,
        },
        {
          userId: 'user-2',
          revokedAt: null,
          grantedAt: new Date('2025-02-01'),
          user: { id: 'user-2', displayName: 'Admin Two' } as any,
          grantedByUser: { id: 'user-1', displayName: 'Admin One' } as any,
        },
      ];
      mockRepo.find.mockResolvedValue(mockGrants);

      const result = await service.getSuperadmins();

      expect(result).toHaveLength(2);
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: {
          revokedAt: expect.anything(),
        },
        relations: ['user', 'grantedByUser'],
        order: {
          grantedAt: 'DESC',
        },
      });
    });

    it('returns empty array when no superadmins exist', async () => {
      mockRepo.find.mockResolvedValue([]);

      const result = await service.getSuperadmins();

      expect(result).toEqual([]);
    });
  });

  describe('getSuperadminGrant', () => {
    it('returns grant with relations for active superadmin', async () => {
      const mockGrant: Partial<Superadmin> = {
        userId: 'user-123',
        revokedAt: null,
        grantedAt: new Date(),
        user: { id: 'user-123', displayName: 'Test Admin' } as any,
        grantedByUser: null,
      };
      mockRepo.findOne.mockResolvedValue(mockGrant);

      const result = await service.getSuperadminGrant('user-123');

      expect(result).toEqual(mockGrant);
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          revokedAt: expect.anything(),
        },
        relations: ['user', 'grantedByUser'],
      });
    });

    it('returns null for non-superadmin user', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.getSuperadminGrant('user-456');

      expect(result).toBeNull();
    });
  });

  describe('cache management', () => {
    it('clearCache removes specific user from cache', async () => {
      mockRepo.findOne.mockResolvedValue({
        userId: 'user-123',
        revokedAt: null,
      });

      await service.isSuperadmin('user-123');
      expect(mockRepo.findOne).toHaveBeenCalledTimes(1);

      service.clearCache('user-123');

      await service.isSuperadmin('user-123');
      expect(mockRepo.findOne).toHaveBeenCalledTimes(2);
    });

    it('clearAllCache removes all cached entries', async () => {
      mockRepo.findOne.mockResolvedValue({ userId: 'user-a', revokedAt: null });

      await service.isSuperadmin('user-a');
      await service.isSuperadmin('user-b');

      service.clearAllCache();

      await service.isSuperadmin('user-a');
      await service.isSuperadmin('user-b');
      expect(mockRepo.findOne).toHaveBeenCalledTimes(4);
    });
  });
});
