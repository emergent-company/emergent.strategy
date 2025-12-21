import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InvitesService } from '../../../src/modules/invites/invites.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// Repository mock factory
function createMockRepository(methods = {}) {
  return {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
    create: vi.fn().mockImplementation((entity) => entity),
    delete: vi.fn().mockResolvedValue({ affected: 0 }),
    ...methods,
  };
}

// FakeDataSource class
class FakeDataSource {
  private handlers: Array<{
    text: RegExp;
    respond: (text: string, params: any[]) => any;
  }> = [];

  constructor(
    handlers: Array<{
      text: RegExp;
      respond: (text: string, params: any[]) => any;
    }> = []
  ) {
    this.handlers = handlers;
  }

  query(text: string, params?: any[]) {
    const h = this.handlers.find((h) => h.text.test(text));
    if (!h) return Promise.resolve([]);
    return h.respond(text, params || []);
  }

  createQueryRunner() {
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      rollbackTransaction: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
      manager: {
        findOne: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue({}),
        query: vi.fn().mockResolvedValue([]),
      },
    };
  }
}

// Mock ZitadelService
const createMockZitadelService = () =>
  ({
    isConfigured: vi.fn(() => false),
    getUserByEmail: vi.fn(),
    createUser: vi.fn(),
    updateUserMetadata: vi.fn(),
    sendSetPasswordNotification: vi.fn(),
    grantProjectRole: vi.fn(),
    introspect: vi.fn(),
    getAccessToken: vi.fn(),
    getUserProjectRoles: vi.fn(),
  } as any);

// Mock EmailService
const createMockEmailService = () =>
  ({
    isEnabled: vi.fn(() => false),
    sendTemplatedEmail: vi.fn().mockResolvedValue({ jobId: 'mock-job-id' }),
    getJobStatus: vi.fn(),
    getJobsBySource: vi.fn(),
    getQueueStats: vi.fn(),
    listTemplates: vi.fn(),
  } as any);

describe('InvitesService', () => {
  let inviteRepo: any;
  let userProfileRepo: any;
  let userEmailRepo: any;
  let projectMembershipRepo: any;
  let orgMembershipRepo: any;
  let projectRepo: any;
  let orgRepo: any;
  let dataSource: FakeDataSource;
  let zitadel: any;
  let emailService: any;
  let service: InvitesService;

  beforeEach(() => {
    inviteRepo = createMockRepository();
    userProfileRepo = createMockRepository();
    userEmailRepo = createMockRepository();
    projectMembershipRepo = createMockRepository();
    orgMembershipRepo = createMockRepository();
    projectRepo = createMockRepository();
    orgRepo = createMockRepository();
    dataSource = new FakeDataSource([]);
    zitadel = createMockZitadelService();
    emailService = createMockEmailService();
    service = new InvitesService(
      inviteRepo,
      userProfileRepo,
      userEmailRepo,
      projectMembershipRepo,
      orgMembershipRepo,
      projectRepo,
      orgRepo,
      dataSource as any,
      zitadel,
      emailService
    );
  });

  it('creates invite with normalized email', async () => {
    const mockInvite = {
      id: 'i1',
      organizationId: 'org1',
      projectId: null,
      email: 'user@example.com',
      role: 'org_admin',
      status: 'pending',
      token: 'tkn',
    };

    inviteRepo.create = vi.fn().mockReturnValue(mockInvite);
    inviteRepo.save = vi.fn().mockResolvedValue(mockInvite);

    const res = await service.create(
      'org1',
      'org_admin',
      'User@Example.COM',
      null
    );

    expect(res).toMatchObject({
      id: 'i1',
      email: 'user@example.com',
      role: 'org_admin',
      status: 'pending',
    });
    expect(inviteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com', // Lowercased
      })
    );
  });

  it('rejects invalid email', async () => {
    await expect(
      service.create('org1', 'org_admin', 'bad-email', null)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts org_admin invite and creates membership', async () => {
    const pendingInvite = {
      id: 'i1',
      organizationId: 'org1',
      projectId: null,
      email: 'user@example.com',
      role: 'org_admin',
      status: 'pending',
      token: 'tok',
    };

    inviteRepo.findOne = vi.fn().mockResolvedValue(pendingInvite);
    userProfileRepo.findOne = vi
      .fn()
      .mockResolvedValue({ zitadelUserId: 'zitadel-user-1' });

    const res = await service.accept('tok', 'user1');

    expect(res.status).toBe('accepted');
  });

  it('accepts project invite and inserts project membership', async () => {
    const projectInvite = {
      id: 'i2',
      organizationId: 'org1',
      projectId: 'proj1',
      email: 'user@example.com',
      role: 'project_user',
      status: 'pending',
      token: 'tok2',
    };

    inviteRepo.findOne = vi.fn().mockResolvedValue(projectInvite);
    userProfileRepo.findOne = vi
      .fn()
      .mockResolvedValue({ zitadelUserId: 'zitadel-user-2' });

    const res = await service.accept('tok2', 'user2');

    expect(res.status).toBe('accepted');
  });

  it('rejects unsupported non-admin org invite without project', async () => {
    const invalidInvite = {
      id: 'i3',
      organizationId: 'org1',
      projectId: null,
      email: 'user@example.com',
      role: 'project_user', // project_user without projectId
      status: 'pending',
      token: 'tok3',
    };

    inviteRepo.findOne = vi.fn().mockResolvedValue(invalidInvite);

    await expect(service.accept('tok3', 'user1')).rejects.toThrowError(
      BadRequestException
    );
  });

  it('rejects not found invite', async () => {
    inviteRepo.findOne = vi.fn().mockResolvedValue(null);

    await expect(
      service.accept('no-such-token', 'user1')
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects already accepted invite', async () => {
    const acceptedInvite = {
      id: 'i4',
      organizationId: 'org1',
      projectId: null,
      email: 'user@example.com',
      role: 'org_admin',
      status: 'accepted', // Already accepted
      token: 'tok4',
    };

    inviteRepo.findOne = vi.fn().mockResolvedValue(acceptedInvite);

    await expect(service.accept('tok4', 'user1')).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});

describe('InvitesService - createWithUser (Zitadel Integration)', () => {
  let inviteRepo: any;
  let userProfileRepo: any;
  let userEmailRepo: any;
  let projectMembershipRepo: any;
  let orgMembershipRepo: any;
  let projectRepo: any;
  let orgRepo: any;
  let dataSource: FakeDataSource;
  let zitadel: any;
  let emailService: any;
  let service: InvitesService;

  beforeEach(() => {
    inviteRepo = createMockRepository();
    userProfileRepo = createMockRepository();
    userEmailRepo = createMockRepository();
    projectMembershipRepo = createMockRepository();
    orgMembershipRepo = createMockRepository();
    projectRepo = createMockRepository();
    orgRepo = createMockRepository();
    dataSource = new FakeDataSource([]);
    zitadel = createMockZitadelService();
    emailService = createMockEmailService();
    service = new InvitesService(
      inviteRepo,
      userProfileRepo,
      userEmailRepo,
      projectMembershipRepo,
      orgMembershipRepo,
      projectRepo,
      orgRepo,
      dataSource as any,
      zitadel,
      emailService
    );
  });

  describe('creating invitation with new user', () => {
    it('should create Zitadel user if not exists', async () => {
      // Mock: User doesn't exist yet
      zitadel.getUserByEmail.mockResolvedValue(null);
      zitadel.createUser.mockResolvedValue('zitadel-user-123');
      zitadel.updateUserMetadata.mockResolvedValue(undefined);
      zitadel.sendSetPasswordNotification.mockResolvedValue(undefined);

      const mockInvite = {
        id: expect.any(String),
        email: 'newuser@example.com',
        role: 'project_user',
        organizationId: 'org-123',
      };
      inviteRepo.create = vi.fn().mockReturnValue(mockInvite);
      inviteRepo.save = vi.fn().mockResolvedValue(mockInvite);

      const result = await service.createWithUser({
        email: 'newuser@example.com',
        firstName: 'New',
        lastName: 'User',
        organizationId: 'org-123',
        role: 'project_user',
        invitedByUserId: 'inviter-uuid',
      });

      // Verify Zitadel user was created
      expect(zitadel.getUserByEmail).toHaveBeenCalledWith(
        'newuser@example.com'
      );
      expect(zitadel.createUser).toHaveBeenCalledWith(
        'newuser@example.com',
        'New',
        'User'
      );
      expect(result.zitadelUserId).toBe('zitadel-user-123');
      expect(result.email).toBe('newuser@example.com');

      // Verify metadata was stored
      expect(zitadel.updateUserMetadata).toHaveBeenCalledWith(
        'zitadel-user-123',
        expect.objectContaining({
          'spec-server-invite': expect.objectContaining({
            role: 'project_user',
            organizationId: 'org-123',
            invitedByUserId: 'inviter-uuid',
          }),
        })
      );

      // Verify password notification was sent
      expect(zitadel.sendSetPasswordNotification).toHaveBeenCalledWith(
        'zitadel-user-123',
        expect.any(String) // inviteId
      );

      // Verify database save was called
      expect(inviteRepo.save).toHaveBeenCalled();
    });

    it('should use existing Zitadel user if found', async () => {
      // Mock: User already exists
      zitadel.getUserByEmail.mockResolvedValue({
        id: 'existing-zitadel-456',
        email: 'existing@example.com',
      });
      zitadel.updateUserMetadata.mockResolvedValue(undefined);
      zitadel.sendSetPasswordNotification.mockResolvedValue(undefined);

      const mockInvite = {
        id: expect.any(String),
        email: 'existing@example.com',
        role: 'project_admin',
      };
      inviteRepo.create = vi.fn().mockReturnValue(mockInvite);
      inviteRepo.save = vi.fn().mockResolvedValue(mockInvite);

      const result = await service.createWithUser({
        email: 'existing@example.com',
        firstName: 'Existing',
        lastName: 'User',
        projectId: 'proj-789',
        role: 'project_admin',
        invitedByUserId: 'inviter-uuid',
      });

      // Verify existing user was used (createUser NOT called)
      expect(zitadel.getUserByEmail).toHaveBeenCalledWith(
        'existing@example.com'
      );
      expect(zitadel.createUser).not.toHaveBeenCalled();
      expect(result.zitadelUserId).toBe('existing-zitadel-456');
    });

    it('should normalize email to lowercase', async () => {
      zitadel.getUserByEmail.mockResolvedValue(null);
      zitadel.createUser.mockResolvedValue('zitadel-user-789');
      zitadel.updateUserMetadata.mockResolvedValue(undefined);
      zitadel.sendSetPasswordNotification.mockResolvedValue(undefined);

      let savedEmail: string | undefined;
      inviteRepo.create = vi.fn().mockImplementation((entity) => {
        savedEmail = entity.email;
        return { ...entity, id: 'inv-1' };
      });
      inviteRepo.save = vi
        .fn()
        .mockResolvedValue({ email: 'mixedcase@example.com' });

      const result = await service.createWithUser({
        email: 'MixedCase@Example.COM',
        firstName: 'Test',
        lastName: 'User',
        organizationId: 'org-123',
        role: 'org_admin',
        invitedByUserId: 'inviter-uuid',
      });

      expect(result.email).toBe('mixedcase@example.com');
      expect(savedEmail).toBe('mixedcase@example.com');
    });

    it('should store invitation metadata in Zitadel', async () => {
      zitadel.getUserByEmail.mockResolvedValue(null);
      zitadel.createUser.mockResolvedValue('zitadel-user-999');
      zitadel.updateUserMetadata.mockResolvedValue(undefined);
      zitadel.sendSetPasswordNotification.mockResolvedValue(undefined);

      const mockInvite = { id: 'inv-1', email: 'metauser@example.com' };
      inviteRepo.create = vi.fn().mockReturnValue(mockInvite);
      inviteRepo.save = vi.fn().mockResolvedValue(mockInvite);

      await service.createWithUser({
        email: 'metauser@example.com',
        firstName: 'Meta',
        lastName: 'User',
        organizationId: 'org-456',
        projectId: 'proj-789',
        role: 'project_user',
        invitedByUserId: 'inviter-uuid',
      });

      // Verify metadata structure
      const metadataCall = zitadel.updateUserMetadata.mock.calls[0];
      expect(metadataCall[0]).toBe('zitadel-user-999');
      expect(metadataCall[1]['spec-server-invite']).toMatchObject({
        role: 'project_user',
        organizationId: 'org-456',
        projectId: 'proj-789',
        invitedByUserId: 'inviter-uuid',
      });
      expect(metadataCall[1]['spec-server-invite'].inviteId).toBeDefined();
      expect(metadataCall[1]['spec-server-invite'].invitedAt).toBeDefined();
    });

    it('should create database invitation record', async () => {
      zitadel.getUserByEmail.mockResolvedValue(null);
      zitadel.createUser.mockResolvedValue('zitadel-user-111');
      zitadel.updateUserMetadata.mockResolvedValue(undefined);
      zitadel.sendSetPasswordNotification.mockResolvedValue(undefined);

      let createdEntity: any;
      inviteRepo.create = vi.fn().mockImplementation((entity) => {
        createdEntity = entity;
        return { ...entity, id: 'inv-1' };
      });
      inviteRepo.save = vi.fn().mockResolvedValue({ id: 'inv-1' });

      await service.createWithUser({
        email: 'dbuser@example.com',
        firstName: 'DB',
        lastName: 'User',
        organizationId: 'org-123',
        role: 'org_admin',
        invitedByUserId: 'inviter-uuid',
      });

      // Verify repository create was called with correct data
      expect(inviteRepo.create).toHaveBeenCalled();
      expect(createdEntity.email).toBe('dbuser@example.com');
      expect(createdEntity.organizationId).toBe('org-123');
      expect(createdEntity.role).toBe('org_admin');
      expect(inviteRepo.save).toHaveBeenCalled();
    });

    it('should reject if neither organizationId nor projectId provided', async () => {
      await expect(
        service.createWithUser({
          email: 'nocontext@example.com',
          firstName: 'No',
          lastName: 'Context',
          role: 'project_user',
          invitedByUserId: 'inviter-uuid',
        })
      ).rejects.toThrow('Either organizationId or projectId must be provided');
    });

    it('should reject invalid email format', async () => {
      await expect(
        service.createWithUser({
          email: 'not-an-email',
          firstName: 'Invalid',
          lastName: 'Email',
          organizationId: 'org-123',
          role: 'project_user',
          invitedByUserId: 'inviter-uuid',
        })
      ).rejects.toThrow('Invalid email format');
    });
  });

  describe('accepting invitation with Zitadel role grant', () => {
    it('should grant role in Zitadel when accepting project invite', async () => {
      // Setup: Project invite
      const projectInvite = {
        id: 'invite-123',
        organizationId: 'org-123',
        projectId: 'proj-456',
        email: 'acceptor@example.com',
        role: 'project_user',
        status: 'pending',
        token: 'accept-token',
      };
      inviteRepo.findOne = vi.fn().mockResolvedValue(projectInvite);
      userProfileRepo.findOne = vi
        .fn()
        .mockResolvedValue({ zitadelUserId: 'zitadel-acceptor-789' });

      // Mock: Zitadel configured
      zitadel.isConfigured.mockReturnValue(true);
      zitadel.grantProjectRole.mockResolvedValue(undefined);

      // Set ZITADEL_PROJECT_ID for test
      process.env.ZITADEL_PROJECT_ID = 'zitadel-proj-999';

      await service.accept('accept-token', 'user-uuid-123');

      // Verify role was granted in Zitadel
      expect(zitadel.grantProjectRole).toHaveBeenCalledWith(
        'zitadel-acceptor-789',
        'zitadel-proj-999',
        'project_user'
      );

      // Cleanup
      delete process.env.ZITADEL_PROJECT_ID;
    });

    it('should continue even if Zitadel role grant fails', async () => {
      // Setup: Project invite
      const projectInvite = {
        id: 'invite-456',
        organizationId: 'org-123',
        projectId: 'proj-789',
        email: 'graceful@example.com',
        role: 'project_admin',
        status: 'pending',
        token: 'graceful-token',
      };
      inviteRepo.findOne = vi.fn().mockResolvedValue(projectInvite);
      userProfileRepo.findOne = vi
        .fn()
        .mockResolvedValue({ zitadelUserId: 'zitadel-graceful-111' });

      // Mock: Zitadel configured but grant fails
      zitadel.isConfigured.mockReturnValue(true);
      zitadel.grantProjectRole.mockRejectedValue(
        new Error('Zitadel API error')
      );

      process.env.ZITADEL_PROJECT_ID = 'zitadel-proj-999';

      // Should not throw - graceful degradation
      const result = await service.accept('graceful-token', 'user-uuid-456');
      expect(result).toEqual({ status: 'accepted' });

      // Cleanup
      delete process.env.ZITADEL_PROJECT_ID;
    });

    it('should skip Zitadel grant if not configured', async () => {
      // Setup: Project invite
      const projectInvite = {
        id: 'invite-789',
        organizationId: 'org-123',
        projectId: 'proj-999',
        email: 'noconfig@example.com',
        role: 'project_user',
        status: 'pending',
        token: 'noconfig-token',
      };
      inviteRepo.findOne = vi.fn().mockResolvedValue(projectInvite);
      userProfileRepo.findOne = vi
        .fn()
        .mockResolvedValue({ zitadelUserId: 'zitadel-noconfig-222' });

      // Mock: Zitadel not configured
      zitadel.isConfigured.mockReturnValue(false);

      await service.accept('noconfig-token', 'user-uuid-789');

      // Verify role grant was NOT attempted
      expect(zitadel.grantProjectRole).not.toHaveBeenCalled();
    });
  });
});
