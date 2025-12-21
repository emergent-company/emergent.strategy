import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserProfileService } from '../../../src/modules/user-profile/user-profile.service';

// ========== Pattern 5 Level 3 Infrastructure ==========

function createMockRepository(methods = {}) {
  return {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
    create: vi.fn().mockImplementation((entity) => entity),
    delete: vi.fn().mockResolvedValue({ affected: 0 }),
    upsert: vi.fn().mockResolvedValue({ affected: 1 }),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    count: vi.fn().mockResolvedValue(0),
    ...methods,
  };
}

function createMockEmailService() {
  return {
    sendWelcomeEmail: vi.fn().mockResolvedValue({ queued: true }),
  };
}

function createMockZitadelService() {
  return {
    deactivateUser: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockDataSource() {
  // Create a mock transaction manager that mimics TypeORM's EntityManager
  const createMockManager = () => ({
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    delete: vi.fn().mockResolvedValue({ affected: 0 }),
    save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
  });

  return {
    transaction: vi.fn().mockImplementation(async (callback) => {
      const manager = createMockManager();
      return callback(manager);
    }),
    // Expose the manager creator for test customization
    _createMockManager: createMockManager,
  };
}

// ========== Tests ==========

describe('UserProfileService', () => {
  let userProfileRepo: any;
  let userEmailRepo: any;
  let orgRepo: any;
  let projectRepo: any;
  let orgMembershipRepo: any;
  let projectMembershipRepo: any;
  let emailService: any;
  let zitadelService: any;
  let dataSource: any;
  let service: UserProfileService;

  beforeEach(() => {
    userProfileRepo = createMockRepository();
    userEmailRepo = createMockRepository();
    orgRepo = createMockRepository();
    projectRepo = createMockRepository();
    orgMembershipRepo = createMockRepository();
    projectMembershipRepo = createMockRepository();
    emailService = createMockEmailService();
    zitadelService = createMockZitadelService();
    dataSource = createMockDataSource();

    service = new UserProfileService(
      userProfileRepo,
      userEmailRepo,
      orgRepo,
      projectRepo,
      orgMembershipRepo,
      projectMembershipRepo,
      emailService,
      zitadelService,
      dataSource
    );
  });

  it('get() returns null when profile missing (by zitadelUserId)', async () => {
    userProfileRepo.findOne = vi.fn().mockResolvedValue(null);
    const res = await service.get('zitadel-123');
    expect(res).toBeNull();
    expect(userProfileRepo.findOne).toHaveBeenCalledWith({
      where: { zitadelUserId: 'zitadel-123' },
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
      avatarObjectKey: 'k',
    };
    userProfileRepo.findOne = vi.fn().mockResolvedValue(mockProfile);
    const res = await service.get('zitadel-123');
    expect(res).toEqual({
      id: 'uuid-1',
      subjectId: 'zitadel-123', // Legacy field for backwards compat
      zitadelUserId: 'zitadel-123',
      firstName: 'A',
      lastName: 'B',
      displayName: 'C',
      phoneE164: '+1',
      avatarObjectKey: 'k',
    });
  });

  it('getById() returns null when profile missing (by UUID)', async () => {
    userProfileRepo.findOne = vi.fn().mockResolvedValue(null);
    const res = await service.getById('uuid-1');
    expect(res).toBeNull();
    expect(userProfileRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'uuid-1' },
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
      avatarObjectKey: 'k',
    };
    userProfileRepo.findOne = vi.fn().mockResolvedValue(mockProfile);
    const res = await service.getById('uuid-1');
    expect(res).toEqual({
      id: 'uuid-1',
      subjectId: 'zitadel-123', // Legacy field for backwards compat
      zitadelUserId: 'zitadel-123',
      firstName: 'A',
      lastName: 'B',
      displayName: 'C',
      phoneE164: '+1',
      avatarObjectKey: 'k',
    });
  });

  it('upsertBase creates new profile when not found', async () => {
    // No existing profile (active or deleted)
    userProfileRepo.findOne = vi.fn().mockResolvedValue(null);
    userProfileRepo.save = vi.fn().mockResolvedValue({
      id: 'new-uuid',
      zitadelUserId: 'zitadel-123',
      welcomeEmailSentAt: null,
    });

    await service.upsertBase('zitadel-123');

    // Should have checked for active profile first, then deleted profile
    expect(userProfileRepo.findOne).toHaveBeenCalledTimes(2);

    // First call: check for active profile
    expect(userProfileRepo.findOne).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ zitadelUserId: 'zitadel-123' }),
      })
    );

    // Should create new profile via save
    expect(userProfileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        zitadelUserId: 'zitadel-123',
      })
    );
  });

  it('upsertBase does not create when active profile exists', async () => {
    const existingProfile = {
      id: 'existing-uuid',
      zitadelUserId: 'zitadel-123',
      welcomeEmailSentAt: new Date(), // Already sent welcome email
    };
    userProfileRepo.findOne = vi.fn().mockResolvedValue(existingProfile);

    await service.upsertBase('zitadel-123');

    // Should only check for active profile, not create
    expect(userProfileRepo.findOne).toHaveBeenCalledTimes(1);
    expect(userProfileRepo.save).not.toHaveBeenCalled();
  });

  it('update returns existing when patch empty (uses getById)', async () => {
    const mockProfile = {
      id: 'uuid-1',
      zitadelUserId: 'zitadel-123',
      firstName: null,
      lastName: null,
      displayName: null,
      phoneE164: null,
      avatarObjectKey: null,
    };
    userProfileRepo.findOne = vi.fn().mockResolvedValue(mockProfile);
    userProfileRepo.save = vi.fn().mockResolvedValue(mockProfile);

    const res = await service.update('uuid-1', {});
    expect(res).toEqual({
      id: 'uuid-1',
      subjectId: 'zitadel-123', // Legacy field for backwards compat
      zitadelUserId: 'zitadel-123',
      firstName: null,
      lastName: null,
      displayName: null,
      phoneE164: null,
      avatarObjectKey: null,
    });
  });

  it('update throws not_found when no existing', async () => {
    userProfileRepo.findOne = vi.fn().mockResolvedValue(null);
    await expect(service.update('missing-uuid', {})).rejects.toThrow(
      'not_found'
    );
  });

  it('update applies patch with snake_case conversion', async () => {
    const mockProfile = {
      id: 'uuid-1',
      zitadelUserId: 'zitadel-123',
      firstName: 'Old',
      lastName: 'Name',
      displayName: 'Old Display',
      phoneE164: '+1',
      avatarObjectKey: 'k',
    };
    const updatedProfile = {
      ...mockProfile,
      firstName: 'Jane',
      displayName: 'JD',
    };

    userProfileRepo.findOne = vi.fn().mockResolvedValue(mockProfile);
    userProfileRepo.save = vi.fn().mockResolvedValue(updatedProfile);

    const res = await service.update('uuid-1', {
      firstName: 'Jane',
      displayName: 'JD',
    });
    expect(res.firstName).toBe('Jane');
    expect(res.displayName).toBe('JD');
    expect(userProfileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Jane',
        displayName: 'JD',
      })
    );
  });

  it('listAlternativeEmails returns mapped rows', async () => {
    const mockEmails = [
      {
        email: 'a@example.com',
        verified: true,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
      {
        email: 'b@example.com',
        verified: false,
        createdAt: new Date('2024-01-02T00:00:00Z'),
      },
    ];
    userEmailRepo.find = vi.fn().mockResolvedValue(mockEmails);

    const rows = await service.listAlternativeEmails('uuid-1');
    expect(rows).toEqual([
      {
        email: 'a@example.com',
        verified: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        email: 'b@example.com',
        verified: false,
        createdAt: '2024-01-02T00:00:00.000Z',
      },
    ]);
    expect(userEmailRepo.find).toHaveBeenCalledWith({
      where: { userId: 'uuid-1' },
      order: { createdAt: 'ASC' },
    });
  });

  it('addAlternativeEmail trims + lowercases and returns inserted row', async () => {
    // Check for duplicate first (returns null = no duplicate)
    userEmailRepo.findOne = vi.fn().mockResolvedValue(null);

    const mockSavedEmail = {
      email: 'new@example.com',
      verified: false,
      createdAt: new Date('2024-02-01T00:00:00Z'),
    };
    userEmailRepo.create = vi.fn().mockReturnValue(mockSavedEmail);
    userEmailRepo.save = vi.fn().mockResolvedValue(mockSavedEmail);

    const res = await service.addAlternativeEmail(
      'uuid-1',
      '  NEW@Example.com '
    );
    expect(res).toEqual({
      email: 'new@example.com',
      verified: false,
      createdAt: '2024-02-01T00:00:00.000Z',
    });

    // Verify email was normalized
    expect(userEmailRepo.create).toHaveBeenCalledWith({
      userId: 'uuid-1',
      email: 'new@example.com',
      verified: false,
    });
  });

  it('deleteAlternativeEmail normalizes email', async () => {
    userEmailRepo.delete = vi.fn().mockResolvedValue({ affected: 1 });
    const res = await service.deleteAlternativeEmail(
      'uuid-1',
      ' Test@Example.COM  '
    );
    expect(res).toEqual({ status: 'deleted' });
    expect(userEmailRepo.delete).toHaveBeenCalledWith({
      userId: 'uuid-1',
      email: 'test@example.com',
    });
  });

  // ========== softDeleteAccount Tests ==========

  describe('softDeleteAccount', () => {
    const mockUserId = 'user-uuid-1';
    const mockZitadelUserId = 'zitadel-123';

    it('throws error when user not found', async () => {
      userProfileRepo.findOne = vi.fn().mockResolvedValue(null);

      await expect(service.softDeleteAccount(mockUserId)).rejects.toThrow(
        'User not found or already deleted'
      );
    });

    it('throws error when user already deleted', async () => {
      userProfileRepo.findOne = vi.fn().mockResolvedValue(null); // IsNull() filter excludes deleted users

      await expect(service.softDeleteAccount(mockUserId)).rejects.toThrow(
        'User not found or already deleted'
      );
    });

    it('soft-deletes user with no orgs (removes memberships only)', async () => {
      const mockProfile = {
        id: mockUserId,
        zitadelUserId: mockZitadelUserId,
        deletedAt: null,
      };
      userProfileRepo.findOne = vi.fn().mockResolvedValue(mockProfile);

      // Mock transaction manager
      const mockManager = {
        find: vi.fn().mockResolvedValue([]), // No org memberships
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn().mockResolvedValue({ affected: 1 }),
        delete: vi.fn().mockResolvedValue({ affected: 0 }),
      };
      dataSource.transaction = vi.fn().mockImplementation(async (callback) => {
        return callback(mockManager);
      });

      const result = await service.softDeleteAccount(mockUserId);

      expect(result).toEqual({
        deletedOrgs: [],
        deletedProjects: [],
        removedMemberships: 0,
      });

      // Should have soft-deleted user profile
      expect(mockManager.update).toHaveBeenCalledWith(
        expect.anything(), // UserProfile class
        mockUserId,
        expect.objectContaining({
          deletedAt: expect.any(Date),
          deletedBy: mockUserId,
        })
      );

      // Should have deactivated Zitadel user
      expect(zitadelService.deactivateUser).toHaveBeenCalledWith(
        mockZitadelUserId
      );
    });

    it('soft-deletes sole-owned orgs and their projects', async () => {
      const mockProfile = {
        id: mockUserId,
        zitadelUserId: mockZitadelUserId,
        deletedAt: null,
      };
      userProfileRepo.findOne = vi.fn().mockResolvedValue(mockProfile);

      const mockOrgId = 'org-uuid-1';
      const mockProjectId = 'project-uuid-1';

      // Mock transaction manager with specific behavior
      const mockManager = {
        find: vi.fn().mockImplementation((entity, options) => {
          // First call: find owner memberships
          if (options?.where?.role === 'owner') {
            return [
              { userId: mockUserId, organizationId: mockOrgId, role: 'owner' },
            ];
          }
          // Second call: find projects in org
          if (options?.where?.organizationId === mockOrgId) {
            return [
              { id: mockProjectId, organizationId: mockOrgId, deletedAt: null },
            ];
          }
          return [];
        }),
        count: vi.fn().mockResolvedValue(1), // User is sole owner (count = 1)
        update: vi.fn().mockResolvedValue({ affected: 1 }),
        delete: vi
          .fn()
          .mockResolvedValueOnce({ affected: 1 }) // org memberships
          .mockResolvedValueOnce({ affected: 2 }), // project memberships
      };
      dataSource.transaction = vi.fn().mockImplementation(async (callback) => {
        return callback(mockManager);
      });

      const result = await service.softDeleteAccount(mockUserId);

      expect(result).toEqual({
        deletedOrgs: [mockOrgId],
        deletedProjects: [mockProjectId],
        removedMemberships: 3, // 1 org + 2 project memberships
      });

      // Verify project was soft-deleted
      expect(mockManager.update).toHaveBeenCalledWith(
        expect.anything(), // Project class
        mockProjectId,
        expect.objectContaining({
          deletedAt: expect.any(Date),
          deletedBy: mockUserId,
        })
      );

      // Verify org was soft-deleted
      expect(mockManager.update).toHaveBeenCalledWith(
        expect.anything(), // Org class
        mockOrgId,
        expect.objectContaining({
          deletedAt: expect.any(Date),
          deletedBy: mockUserId,
        })
      );
    });

    it('does not delete org when user is not sole owner', async () => {
      const mockProfile = {
        id: mockUserId,
        zitadelUserId: mockZitadelUserId,
        deletedAt: null,
      };
      userProfileRepo.findOne = vi.fn().mockResolvedValue(mockProfile);

      const mockOrgId = 'org-uuid-1';

      // Mock transaction manager
      const mockManager = {
        find: vi.fn().mockImplementation((entity, options) => {
          if (options?.where?.role === 'owner') {
            return [
              { userId: mockUserId, organizationId: mockOrgId, role: 'owner' },
            ];
          }
          return [];
        }),
        count: vi.fn().mockResolvedValue(2), // 2 owners = not sole owner
        update: vi.fn().mockResolvedValue({ affected: 1 }),
        delete: vi
          .fn()
          .mockResolvedValueOnce({ affected: 1 }) // org memberships
          .mockResolvedValueOnce({ affected: 0 }), // project memberships
      };
      dataSource.transaction = vi.fn().mockImplementation(async (callback) => {
        return callback(mockManager);
      });

      const result = await service.softDeleteAccount(mockUserId);

      expect(result).toEqual({
        deletedOrgs: [], // Org NOT deleted
        deletedProjects: [],
        removedMemberships: 1, // Only membership removed
      });

      // Verify org was NOT soft-deleted (only user profile update should happen)
      const updateCalls = mockManager.update.mock.calls;
      const orgUpdateCalls = updateCalls.filter(
        (call: any[]) => call[1] === mockOrgId
      );
      expect(orgUpdateCalls.length).toBe(0);
    });

    it('continues if Zitadel deactivation fails', async () => {
      const mockProfile = {
        id: mockUserId,
        zitadelUserId: mockZitadelUserId,
        deletedAt: null,
      };
      userProfileRepo.findOne = vi.fn().mockResolvedValue(mockProfile);

      // Mock transaction manager
      const mockManager = {
        find: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn().mockResolvedValue({ affected: 1 }),
        delete: vi.fn().mockResolvedValue({ affected: 0 }),
      };
      dataSource.transaction = vi.fn().mockImplementation(async (callback) => {
        return callback(mockManager);
      });

      // Make Zitadel deactivation fail
      zitadelService.deactivateUser = vi
        .fn()
        .mockRejectedValue(new Error('Zitadel API error'));

      // Should NOT throw - local deletion takes precedence
      const result = await service.softDeleteAccount(mockUserId);

      expect(result).toEqual({
        deletedOrgs: [],
        deletedProjects: [],
        removedMemberships: 0,
      });

      // Zitadel was called but failed
      expect(zitadelService.deactivateUser).toHaveBeenCalledWith(
        mockZitadelUserId
      );

      // User profile was still soft-deleted
      expect(mockManager.update).toHaveBeenCalledWith(
        expect.anything(),
        mockUserId,
        expect.objectContaining({
          deletedAt: expect.any(Date),
          deletedBy: mockUserId,
        })
      );
    });

    it('handles user without Zitadel ID', async () => {
      const mockProfile = {
        id: mockUserId,
        zitadelUserId: null, // No Zitadel ID
        deletedAt: null,
      };
      userProfileRepo.findOne = vi.fn().mockResolvedValue(mockProfile);

      // Mock transaction manager
      const mockManager = {
        find: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn().mockResolvedValue({ affected: 1 }),
        delete: vi.fn().mockResolvedValue({ affected: 0 }),
      };
      dataSource.transaction = vi.fn().mockImplementation(async (callback) => {
        return callback(mockManager);
      });

      const result = await service.softDeleteAccount(mockUserId);

      expect(result).toEqual({
        deletedOrgs: [],
        deletedProjects: [],
        removedMemberships: 0,
      });

      // Zitadel should NOT be called
      expect(zitadelService.deactivateUser).not.toHaveBeenCalled();
    });

    it('removes memberships from multiple orgs (mixed ownership)', async () => {
      const mockProfile = {
        id: mockUserId,
        zitadelUserId: mockZitadelUserId,
        deletedAt: null,
      };
      userProfileRepo.findOne = vi.fn().mockResolvedValue(mockProfile);

      const soleOwnedOrgId = 'org-sole-owned';
      const sharedOrgId = 'org-shared';
      const projectInSoleOwnedOrg = 'project-1';

      let findCallCount = 0;
      let countCallCount = 0;

      // Mock transaction manager with complex scenario
      const mockManager = {
        find: vi.fn().mockImplementation((entity, options) => {
          findCallCount++;
          // First call: find owner memberships (user owns 2 orgs)
          if (options?.where?.role === 'owner' && findCallCount === 1) {
            return [
              {
                userId: mockUserId,
                organizationId: soleOwnedOrgId,
                role: 'owner',
              },
              {
                userId: mockUserId,
                organizationId: sharedOrgId,
                role: 'owner',
              },
            ];
          }
          // Find projects in sole-owned org
          if (options?.where?.organizationId === soleOwnedOrgId) {
            return [
              {
                id: projectInSoleOwnedOrg,
                organizationId: soleOwnedOrgId,
                deletedAt: null,
              },
            ];
          }
          // Find projects in shared org (not called because not sole owner)
          return [];
        }),
        count: vi.fn().mockImplementation((entity, options) => {
          countCallCount++;
          // First count: sole-owned org has 1 owner
          if (options?.where?.organizationId === soleOwnedOrgId) {
            return 1;
          }
          // Second count: shared org has 2 owners
          if (options?.where?.organizationId === sharedOrgId) {
            return 2;
          }
          return 0;
        }),
        update: vi.fn().mockResolvedValue({ affected: 1 }),
        delete: vi
          .fn()
          .mockResolvedValueOnce({ affected: 2 }) // 2 org memberships
          .mockResolvedValueOnce({ affected: 3 }), // 3 project memberships
      };
      dataSource.transaction = vi.fn().mockImplementation(async (callback) => {
        return callback(mockManager);
      });

      const result = await service.softDeleteAccount(mockUserId);

      expect(result).toEqual({
        deletedOrgs: [soleOwnedOrgId], // Only sole-owned org deleted
        deletedProjects: [projectInSoleOwnedOrg],
        removedMemberships: 5, // 2 org + 3 project memberships
      });
    });
  });
});
