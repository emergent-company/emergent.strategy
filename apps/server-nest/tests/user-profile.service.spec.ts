import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserProfileService } from '../src/modules/user-profile/user-profile.service';
import { DatabaseService } from '../src/common/database/database.service';

// ========== Pattern 5 Level 3 Infrastructure ==========

function createMockRepository(methods = {}) {
    return {
        findOne: vi.fn().mockResolvedValue(null),
        find: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
        create: vi.fn().mockImplementation((entity) => entity),
        delete: vi.fn().mockResolvedValue({ affected: 0 }),
        upsert: vi.fn().mockResolvedValue({ affected: 1 }),
        ...methods
    };
}

class FakeDb extends DatabaseService {
    constructor() {
        super({} as any);
    }
    isOnline(): boolean {
        return true;
    }
    async runWithTenantContext<T>(
        tenantId: string,
        projectId: string | null,
        callback: () => Promise<T>
    ): Promise<T> {
        return callback();
    }
}

// ========== Tests ==========

describe('UserProfileService', () => {
    let userProfileRepo: any;
    let userEmailRepo: any;
    let db: DatabaseService;
    let service: UserProfileService;

    beforeEach(() => {
        userProfileRepo = createMockRepository();
        userEmailRepo = createMockRepository();
        db = new FakeDb();
        service = new UserProfileService(userProfileRepo, userEmailRepo, db);
    });

    it('get() returns null when profile missing (by zitadelUserId)', async () => {
        userProfileRepo.findOne = vi.fn().mockResolvedValue(null);
        const res = await service.get('zitadel-123');
        expect(res).toBeNull();
        expect(userProfileRepo.findOne).toHaveBeenCalledWith({
            where: { zitadelUserId: 'zitadel-123' }
        });
    });

    it('get() maps row when profile exists (by zitadelUserId)', async () => {
        const mockProfile = {
            id: 'uuid-1',
            zitadelUserId: 'zitadel-123',
            firstName: 'A',
            lastName: 'B',
            displayName: 'C',
            phoneE164: '+1',
            avatarObjectKey: 'k'
        };
        userProfileRepo.findOne = vi.fn().mockResolvedValue(mockProfile);
        const res = await service.get('zitadel-123');
        expect(res).toEqual({
            id: 'uuid-1',
            subjectId: 'zitadel-123',  // Legacy field for backwards compat
            zitadelUserId: 'zitadel-123',
            firstName: 'A',
            lastName: 'B',
            displayName: 'C',
            phoneE164: '+1',
            avatarObjectKey: 'k'
        });
    });

    it('getById() returns null when profile missing (by UUID)', async () => {
        userProfileRepo.findOne = vi.fn().mockResolvedValue(null);
        const res = await service.getById('uuid-1');
        expect(res).toBeNull();
        expect(userProfileRepo.findOne).toHaveBeenCalledWith({
            where: { id: 'uuid-1' }
        });
    });

    it('getById() maps row when profile exists (by UUID)', async () => {
        const mockProfile = {
            id: 'uuid-1',
            zitadelUserId: 'zitadel-123',
            firstName: 'A',
            lastName: 'B',
            displayName: 'C',
            phoneE164: '+1',
            avatarObjectKey: 'k'
        };
        userProfileRepo.findOne = vi.fn().mockResolvedValue(mockProfile);
        const res = await service.getById('uuid-1');
        expect(res).toEqual({
            id: 'uuid-1',
            subjectId: 'zitadel-123',  // Legacy field for backwards compat
            zitadelUserId: 'zitadel-123',
            firstName: 'A',
            lastName: 'B',
            displayName: 'C',
            phoneE164: '+1',
            avatarObjectKey: 'k'
        });
    });

    it('upsertBase inserts (idempotent ignore conflicts)', async () => {
        userProfileRepo.upsert = vi.fn().mockResolvedValue({ affected: 1 });
        await service.upsertBase('zitadel-123');
        expect(userProfileRepo.upsert).toHaveBeenCalledWith(
            { zitadelUserId: 'zitadel-123' },
            ['zitadelUserId']
        );
    });

    it('update returns existing when patch empty (uses getById)', async () => {
        const mockProfile = {
            id: 'uuid-1',
            zitadelUserId: 'zitadel-123',
            firstName: null,
            lastName: null,
            displayName: null,
            phoneE164: null,
            avatarObjectKey: null
        };
        userProfileRepo.findOne = vi.fn().mockResolvedValue(mockProfile);
        userProfileRepo.save = vi.fn().mockResolvedValue(mockProfile);

        const res = await service.update('uuid-1', {});
        expect(res).toEqual({
            id: 'uuid-1',
            subjectId: 'zitadel-123',  // Legacy field for backwards compat
            zitadelUserId: 'zitadel-123',
            firstName: null,
            lastName: null,
            displayName: null,
            phoneE164: null,
            avatarObjectKey: null
        });
    });

    it('update throws not_found when no existing', async () => {
        userProfileRepo.findOne = vi.fn().mockResolvedValue(null);
        await expect(service.update('missing-uuid', {})).rejects.toThrow('not_found');
    });

    it('update applies patch with snake_case conversion', async () => {
        const mockProfile = {
            id: 'uuid-1',
            zitadelUserId: 'zitadel-123',
            firstName: 'Old',
            lastName: 'Name',
            displayName: 'Old Display',
            phoneE164: '+1',
            avatarObjectKey: 'k'
        };
        const updatedProfile = {
            ...mockProfile,
            firstName: 'Jane',
            displayName: 'JD'
        };

        userProfileRepo.findOne = vi.fn().mockResolvedValue(mockProfile);
        userProfileRepo.save = vi.fn().mockResolvedValue(updatedProfile);

        const res = await service.update('uuid-1', { firstName: 'Jane', displayName: 'JD' });
        expect(res.firstName).toBe('Jane');
        expect(res.displayName).toBe('JD');
        expect(userProfileRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            firstName: 'Jane',
            displayName: 'JD'
        }));
    });

    it('listAlternativeEmails returns mapped rows', async () => {
        const mockEmails = [
            { email: 'a@example.com', verified: true, createdAt: new Date('2024-01-01T00:00:00Z') },
            { email: 'b@example.com', verified: false, createdAt: new Date('2024-01-02T00:00:00Z') }
        ];
        userEmailRepo.find = vi.fn().mockResolvedValue(mockEmails);

        const rows = await service.listAlternativeEmails('uuid-1');
        expect(rows).toEqual([
            { email: 'a@example.com', verified: true, createdAt: '2024-01-01T00:00:00.000Z' },
            { email: 'b@example.com', verified: false, createdAt: '2024-01-02T00:00:00.000Z' },
        ]);
        expect(userEmailRepo.find).toHaveBeenCalledWith({
            where: { userId: 'uuid-1' },
            order: { createdAt: 'ASC' }
        });
    });

    it('addAlternativeEmail trims + lowercases and returns inserted row', async () => {
        // Check for duplicate first (returns null = no duplicate)
        userEmailRepo.findOne = vi.fn().mockResolvedValue(null);

        const mockSavedEmail = {
            email: 'new@example.com',
            verified: false,
            createdAt: new Date('2024-02-01T00:00:00Z')
        };
        userEmailRepo.create = vi.fn().mockReturnValue(mockSavedEmail);
        userEmailRepo.save = vi.fn().mockResolvedValue(mockSavedEmail);

        const res = await service.addAlternativeEmail('uuid-1', '  NEW@Example.com ');
        expect(res).toEqual({
            email: 'new@example.com',
            verified: false,
            createdAt: '2024-02-01T00:00:00.000Z'
        });

        // Verify email was normalized
        expect(userEmailRepo.create).toHaveBeenCalledWith({
            userId: 'uuid-1',
            email: 'new@example.com',
            verified: false
        });
    });

    it('deleteAlternativeEmail normalizes email', async () => {
        userEmailRepo.delete = vi.fn().mockResolvedValue({ affected: 1 });
        const res = await service.deleteAlternativeEmail('uuid-1', ' Test@Example.COM  ');
        expect(res).toEqual({ status: 'deleted' });
        expect(userEmailRepo.delete).toHaveBeenCalledWith({
            userId: 'uuid-1',
            email: 'test@example.com'
        });
    });
});
