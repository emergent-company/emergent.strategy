import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SuperadminController } from '../../../src/modules/superadmin/superadmin.controller';

function createMockRepository() {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    count: vi.fn(),
    createQueryBuilder: vi.fn(),
  };
}

function createMockQueryBuilder() {
  const qb: any = {
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    setParameter: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    getCount: vi.fn(),
    getMany: vi.fn(),
    getRawMany: vi.fn(),
    getManyAndCount: vi.fn(),
    subQuery: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    getQuery: vi.fn().mockReturnValue('subquery'),
  };
  return qb;
}

function createMockEmailTemplateService() {
  return {
    hasTemplate: vi.fn(),
    render: vi.fn(),
  };
}

describe('SuperadminController', () => {
  let controller: SuperadminController;
  let mockUserProfileRepo: ReturnType<typeof createMockRepository>;
  let mockOrgRepo: ReturnType<typeof createMockRepository>;
  let mockProjectRepo: ReturnType<typeof createMockRepository>;
  let mockOrgMembershipRepo: ReturnType<typeof createMockRepository>;
  let mockEmailJobRepo: ReturnType<typeof createMockRepository>;
  let mockEmailTemplateService: ReturnType<
    typeof createMockEmailTemplateService
  >;

  beforeEach(() => {
    mockUserProfileRepo = createMockRepository();
    mockOrgRepo = createMockRepository();
    mockProjectRepo = createMockRepository();
    mockOrgMembershipRepo = createMockRepository();
    mockEmailJobRepo = createMockRepository();
    mockEmailTemplateService = createMockEmailTemplateService();

    controller = new SuperadminController(
      mockUserProfileRepo as any,
      mockOrgRepo as any,
      mockProjectRepo as any,
      mockOrgMembershipRepo as any,
      mockEmailJobRepo as any,
      mockEmailTemplateService as any
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listUsers', () => {
    it('returns paginated list of users with default pagination', async () => {
      const mockQb = createMockQueryBuilder();
      mockUserProfileRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockQb.getCount.mockResolvedValue(2);
      mockQb.getMany.mockResolvedValue([
        {
          id: 'user-1',
          zitadelUserId: 'zitadel-1',
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
          lastActivityAt: new Date('2025-01-15'),
          createdAt: new Date('2025-01-01'),
          emails: [{ email: 'john@example.com', verified: true }],
        },
        {
          id: 'user-2',
          zitadelUserId: 'zitadel-2',
          firstName: 'Jane',
          lastName: 'Smith',
          displayName: 'Jane Smith',
          lastActivityAt: null,
          createdAt: new Date('2025-01-02'),
          emails: [{ email: 'jane@example.com', verified: false }],
        },
      ]);
      mockOrgMembershipRepo.find.mockResolvedValue([]);

      const result = await controller.listUsers({});

      expect(result.users).toHaveLength(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(false);
    });

    it('returns user with verified email as primary email', async () => {
      const mockQb = createMockQueryBuilder();
      mockUserProfileRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockQb.getCount.mockResolvedValue(1);
      mockQb.getMany.mockResolvedValue([
        {
          id: 'user-1',
          zitadelUserId: 'zitadel-1',
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
          lastActivityAt: null,
          createdAt: new Date('2025-01-01'),
          emails: [
            { email: 'unverified@example.com', verified: false },
            { email: 'verified@example.com', verified: true },
          ],
        },
      ]);
      mockOrgMembershipRepo.find.mockResolvedValue([]);

      const result = await controller.listUsers({});

      expect(result.users[0].primaryEmail).toBe('verified@example.com');
    });

    it('returns first email as primary when none verified', async () => {
      const mockQb = createMockQueryBuilder();
      mockUserProfileRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockQb.getCount.mockResolvedValue(1);
      mockQb.getMany.mockResolvedValue([
        {
          id: 'user-1',
          zitadelUserId: 'zitadel-1',
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
          lastActivityAt: null,
          createdAt: new Date('2025-01-01'),
          emails: [
            { email: 'first@example.com', verified: false },
            { email: 'second@example.com', verified: false },
          ],
        },
      ]);
      mockOrgMembershipRepo.find.mockResolvedValue([]);

      const result = await controller.listUsers({});

      expect(result.users[0].primaryEmail).toBe('first@example.com');
    });

    it('returns null primary email when user has no emails', async () => {
      const mockQb = createMockQueryBuilder();
      mockUserProfileRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockQb.getCount.mockResolvedValue(1);
      mockQb.getMany.mockResolvedValue([
        {
          id: 'user-1',
          zitadelUserId: 'zitadel-1',
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
          lastActivityAt: null,
          createdAt: new Date('2025-01-01'),
          emails: [],
        },
      ]);
      mockOrgMembershipRepo.find.mockResolvedValue([]);

      const result = await controller.listUsers({});

      expect(result.users[0].primaryEmail).toBeNull();
    });

    it('includes organization memberships for each user', async () => {
      const mockQb = createMockQueryBuilder();
      mockUserProfileRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockQb.getCount.mockResolvedValue(1);
      mockQb.getMany.mockResolvedValue([
        {
          id: 'user-1',
          zitadelUserId: 'zitadel-1',
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
          lastActivityAt: null,
          createdAt: new Date('2025-01-01'),
          emails: [],
        },
      ]);
      mockOrgMembershipRepo.find.mockResolvedValue([
        {
          userId: 'user-1',
          organizationId: 'org-1',
          role: 'owner',
          createdAt: new Date('2025-01-05'),
          organization: { name: 'Test Org' },
        },
        {
          userId: 'user-1',
          organizationId: 'org-2',
          role: 'member',
          createdAt: new Date('2025-01-10'),
          organization: { name: 'Other Org' },
        },
      ]);

      const result = await controller.listUsers({});

      expect(result.users[0].organizations).toHaveLength(2);
      expect(result.users[0].organizations[0]).toEqual({
        orgId: 'org-1',
        orgName: 'Test Org',
        role: 'owner',
        joinedAt: expect.any(Date),
      });
    });

    it('applies search filter to query', async () => {
      const mockQb = createMockQueryBuilder();
      mockUserProfileRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockQb.getCount.mockResolvedValue(0);
      mockQb.getMany.mockResolvedValue([]);
      mockOrgMembershipRepo.find.mockResolvedValue([]);

      await controller.listUsers({ search: 'john' });

      expect(mockQb.andWhere).toHaveBeenCalled();
    });

    it('applies orgId filter to query', async () => {
      const mockQb = createMockQueryBuilder();
      mockUserProfileRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockQb.getCount.mockResolvedValue(0);
      mockQb.getMany.mockResolvedValue([]);
      mockOrgMembershipRepo.find.mockResolvedValue([]);

      await controller.listUsers({ orgId: 'org-123' });

      expect(mockQb.andWhere).toHaveBeenCalled();
      expect(mockQb.setParameter).toHaveBeenCalledWith('orgId', 'org-123');
    });

    it('applies custom pagination', async () => {
      const mockQb = createMockQueryBuilder();
      mockUserProfileRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockQb.getCount.mockResolvedValue(100);
      mockQb.getMany.mockResolvedValue([]);
      mockOrgMembershipRepo.find.mockResolvedValue([]);

      const result = await controller.listUsers({ page: 3, limit: 10 });

      expect(mockQb.skip).toHaveBeenCalledWith(20);
      expect(mockQb.take).toHaveBeenCalledWith(10);
      expect(result.meta.page).toBe(3);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(10);
      expect(result.meta.hasNext).toBe(true);
      expect(result.meta.hasPrev).toBe(true);
    });
  });

  describe('listOrganizations', () => {
    it('returns paginated list of organizations with counts', async () => {
      const mockQb = createMockQueryBuilder();
      mockOrgRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockOrgRepo.count.mockResolvedValue(2);
      mockQb.getRawMany.mockResolvedValue([
        {
          id: 'org-1',
          name: 'Org One',
          createdAt: new Date('2025-01-01'),
          deletedAt: null,
          memberCount: '5',
          projectCount: '3',
        },
        {
          id: 'org-2',
          name: 'Org Two',
          createdAt: new Date('2025-01-02'),
          deletedAt: null,
          memberCount: '10',
          projectCount: '7',
        },
      ]);

      const result = await controller.listOrganizations({});

      expect(result.organizations).toHaveLength(2);
      expect(result.organizations[0]).toEqual({
        id: 'org-1',
        name: 'Org One',
        memberCount: 5,
        projectCount: 3,
        createdAt: expect.any(Date),
        deletedAt: null,
      });
      expect(result.meta.total).toBe(2);
    });

    it('parses count strings to integers', async () => {
      const mockQb = createMockQueryBuilder();
      mockOrgRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockOrgRepo.count.mockResolvedValue(1);
      mockQb.getRawMany.mockResolvedValue([
        {
          id: 'org-1',
          name: 'Test Org',
          createdAt: new Date(),
          deletedAt: null,
          memberCount: '15',
          projectCount: '8',
        },
      ]);

      const result = await controller.listOrganizations({});

      expect(result.organizations[0].memberCount).toBe(15);
      expect(result.organizations[0].projectCount).toBe(8);
    });
  });

  describe('listProjects', () => {
    it('returns paginated list of projects with document counts', async () => {
      const mockQb = createMockQueryBuilder();
      const mockCountQb = createMockQueryBuilder();
      mockProjectRepo.createQueryBuilder
        .mockReturnValueOnce(mockQb)
        .mockReturnValueOnce(mockCountQb);
      mockQb.getRawMany.mockResolvedValue([
        {
          id: 'proj-1',
          name: 'Project One',
          organizationId: 'org-1',
          organizationName: 'Test Org',
          createdAt: new Date('2025-01-01'),
          deletedAt: null,
          documentCount: '12',
        },
      ]);
      mockCountQb.getCount.mockResolvedValue(1);

      const result = await controller.listProjects({});

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0]).toEqual({
        id: 'proj-1',
        name: 'Project One',
        organizationId: 'org-1',
        organizationName: 'Test Org',
        documentCount: 12,
        createdAt: expect.any(Date),
        deletedAt: null,
      });
    });

    it('filters by organization when orgId provided', async () => {
      const mockQb = createMockQueryBuilder();
      const mockCountQb = createMockQueryBuilder();
      mockProjectRepo.createQueryBuilder
        .mockReturnValueOnce(mockQb)
        .mockReturnValueOnce(mockCountQb);
      mockQb.getRawMany.mockResolvedValue([]);
      mockCountQb.getCount.mockResolvedValue(0);

      await controller.listProjects({ orgId: 'org-123' });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'project.organizationId = :orgId',
        { orgId: 'org-123' }
      );
      expect(mockCountQb.andWhere).toHaveBeenCalledWith(
        'project.organizationId = :orgId',
        { orgId: 'org-123' }
      );
    });
  });

  describe('listEmailJobs', () => {
    it('returns paginated list of email jobs', async () => {
      const mockQb = createMockQueryBuilder();
      mockEmailJobRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockQb.getManyAndCount.mockResolvedValue([
        [
          {
            id: 'job-1',
            templateName: 'welcome',
            toEmail: 'user@example.com',
            toName: 'Test User',
            subject: 'Welcome!',
            status: 'sent',
            attempts: 1,
            maxAttempts: 3,
            lastError: null,
            createdAt: new Date('2025-01-01'),
            processedAt: new Date('2025-01-01'),
            sourceType: 'user_registration',
            sourceId: 'reg-123',
          },
        ],
        1,
      ]);

      const result = await controller.listEmailJobs({});

      expect(result.emailJobs).toHaveLength(1);
      expect(result.emailJobs[0]).toEqual({
        id: 'job-1',
        templateName: 'welcome',
        toEmail: 'user@example.com',
        toName: 'Test User',
        subject: 'Welcome!',
        status: 'sent',
        attempts: 1,
        maxAttempts: 3,
        lastError: null,
        createdAt: expect.any(Date),
        processedAt: expect.any(Date),
        sourceType: 'user_registration',
        sourceId: 'reg-123',
      });
    });

    it('filters by status when provided', async () => {
      const mockQb = createMockQueryBuilder();
      mockEmailJobRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);

      await controller.listEmailJobs({ status: 'failed' });

      expect(mockQb.andWhere).toHaveBeenCalledWith('job.status = :status', {
        status: 'failed',
      });
    });

    it('filters by recipient when provided', async () => {
      const mockQb = createMockQueryBuilder();
      mockEmailJobRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);

      await controller.listEmailJobs({ recipient: 'test@example.com' });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'job.toEmail ILIKE :recipient',
        { recipient: '%test@example.com%' }
      );
    });

    it('filters by date range when provided', async () => {
      const mockQb = createMockQueryBuilder();
      mockEmailJobRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);

      await controller.listEmailJobs({
        fromDate: '2025-01-01',
        toDate: '2025-01-31',
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'job.createdAt >= :fromDate',
        {
          fromDate: expect.any(Date),
        }
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith('job.createdAt <= :toDate', {
        toDate: expect.any(Date),
      });
    });
  });

  describe('previewEmailJob', () => {
    it('returns rendered HTML for valid email job', async () => {
      mockEmailJobRepo.findOne.mockResolvedValue({
        id: 'job-1',
        templateName: 'welcome',
        templateData: { userName: 'Test' },
        subject: 'Welcome!',
        toEmail: 'user@example.com',
        toName: 'Test User',
      });
      mockEmailTemplateService.hasTemplate.mockReturnValue(true);
      mockEmailTemplateService.render.mockReturnValue({
        html: '<html><body>Welcome Test!</body></html>',
      });

      const result = await controller.previewEmailJob('job-1');

      expect(result).toBe('<html><body>Welcome Test!</body></html>');
      expect(mockEmailTemplateService.render).toHaveBeenCalledWith('welcome', {
        userName: 'Test',
      });
    });

    it('throws NotFoundException when job not found', async () => {
      mockEmailJobRepo.findOne.mockResolvedValue(null);

      await expect(controller.previewEmailJob('non-existent')).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws NotFoundException when template not found', async () => {
      mockEmailJobRepo.findOne.mockResolvedValue({
        id: 'job-1',
        templateName: 'deleted-template',
        templateData: {},
      });
      mockEmailTemplateService.hasTemplate.mockReturnValue(false);

      await expect(controller.previewEmailJob('job-1')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('previewEmailJobJson', () => {
    it('returns preview with metadata', async () => {
      mockEmailJobRepo.findOne.mockResolvedValue({
        id: 'job-1',
        templateName: 'welcome',
        templateData: { userName: 'Test' },
        subject: 'Welcome!',
        toEmail: 'user@example.com',
        toName: 'Test User',
      });
      mockEmailTemplateService.hasTemplate.mockReturnValue(true);
      mockEmailTemplateService.render.mockReturnValue({
        html: '<html><body>Welcome Test!</body></html>',
      });

      const result = await controller.previewEmailJobJson('job-1');

      expect(result).toEqual({
        html: '<html><body>Welcome Test!</body></html>',
        subject: 'Welcome!',
        toEmail: 'user@example.com',
        toName: 'Test User',
      });
    });

    it('throws NotFoundException when job not found', async () => {
      mockEmailJobRepo.findOne.mockResolvedValue(null);

      await expect(
        controller.previewEmailJobJson('non-existent')
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when template not found', async () => {
      mockEmailJobRepo.findOne.mockResolvedValue({
        id: 'job-1',
        templateName: 'deleted-template',
        templateData: {},
      });
      mockEmailTemplateService.hasTemplate.mockReturnValue(false);

      await expect(controller.previewEmailJobJson('job-1')).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
