import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TemplatePackService } from '../../../src/modules/template-packs/template-pack.service';
import { DatabaseService } from '../../../src/common/database/database.service';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  CreateTemplatePackDto,
  AssignTemplatePackDto,
} from '../../../src/modules/template-packs/dto/template-pack.dto';
import {
  GraphTemplatePack,
  ProjectTemplatePack,
} from '../../../src/modules/template-packs/entities';
import { vi } from 'vitest';

describe('TemplatePackService', () => {
  let service: TemplatePackService;
  let mockDb: any;
  let mockTemplatePackRepo: any;
  let mockProjectTemplatePackRepo: any;

  beforeEach(async () => {
    // Create mock database service
    mockDb = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      getClient: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: vi.fn(),
      }),
      getPool: vi.fn(() => ({
        connect: vi.fn().mockResolvedValue({
          query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
          release: vi.fn(),
        }),
      })),
    } as any;

    // Create mock TypeORM repositories
    mockTemplatePackRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockImplementation((entity) =>
        Promise.resolve({
          ...entity,
          id: 'pack-' + Math.random().toString(36).substr(2, 9),
          published_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          deprecated_at: null, // Ensure deprecated_at is null, not undefined
        })
      ),
      create: vi.fn().mockImplementation((dto) => dto),
      count: vi.fn().mockResolvedValue(0),
      createQueryBuilder: vi.fn(),
    };

    mockProjectTemplatePackRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockImplementation((entity) =>
        Promise.resolve({
          ...entity,
          installed_at: new Date(),
        })
      ),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      count: vi.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatePackService,
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
        {
          provide: getRepositoryToken(GraphTemplatePack),
          useValue: mockTemplatePackRepo,
        },
        {
          provide: getRepositoryToken(ProjectTemplatePack),
          useValue: mockProjectTemplatePackRepo,
        },
      ],
    }).compile();

    service = module.get<TemplatePackService>(TemplatePackService);

    // WORKAROUND: Manually assign the mock for methods still using DatabaseService
    // assignTemplatePackToProject, uninstallTemplatePackFromProject, and other
    // strategic SQL operations still use this.db directly
    (service as any).db = mockDb;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createTemplatePack', () => {
    it('should create a template pack successfully', async () => {
      const dto: CreateTemplatePackDto = {
        name: 'TOGAF Core',
        version: '1.0.0',
        description: 'Core TOGAF template',
        author: 'Test Author',
        object_type_schemas: {
          Requirement: {
            type: 'object',
            properties: {
              title: { type: 'string' },
            },
          },
        },
        relationship_type_schemas: {},
      };

      const now = new Date();
      const mockSaved = {
        id: 'pack-1',
        ...dto,
        published_at: now,
        created_at: now,
        updated_at: now,
        deprecated_at: null,
      };

      mockTemplatePackRepo.save.mockResolvedValueOnce(mockSaved);

      const result = await service.createTemplatePack(dto);

      expect(result).toEqual({
        ...mockSaved,
        published_at: now.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        deprecated_at: undefined, // Service converts null to undefined via optional chaining
      });
      expect(mockTemplatePackRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: dto.name,
          version: dto.version,
          description: dto.description,
          author: dto.author,
        })
      );
    });

    it('should calculate checksum if not provided', async () => {
      const dto: CreateTemplatePackDto = {
        name: 'Test Pack',
        version: '1.0.0',
        object_type_schemas: { TestType: {} },
      };

      const now = new Date();
      mockTemplatePackRepo.save.mockResolvedValueOnce({
        id: 'pack-1',
        ...dto,
        published_at: now,
        created_at: now,
        updated_at: now,
      });

      await service.createTemplatePack(dto);

      // Verify checksum was calculated and passed to save
      expect(mockTemplatePackRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          checksum: expect.stringMatching(/^[a-f0-9]{64}$/), // SHA256 hex
        })
      );
    });
  });

  describe('getTemplatePackById', () => {
    it('should return template pack if found', async () => {
      const now = new Date();
      const mockPack = {
        id: 'pack-1',
        name: 'TOGAF Core',
        version: '1.0.0',
        published_at: now,
        created_at: now,
        updated_at: now,
      };

      mockTemplatePackRepo.findOne.mockResolvedValueOnce(mockPack);

      const result = await service.getTemplatePackById('pack-1');

      expect(result).toEqual({
        ...mockPack,
        published_at: now.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      expect(mockTemplatePackRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'pack-1' },
      });
    });

    it('should throw NotFoundException if not found', async () => {
      mockTemplatePackRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.getTemplatePackById('nonexistent')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('listTemplatePacks', () => {
    it('should list template packs with pagination', async () => {
      const now = new Date();
      const mockPacks = [
        {
          id: 'pack-1',
          name: 'Pack 1',
          published_at: now,
          created_at: now,
          updated_at: now,
        },
        {
          id: 'pack-2',
          name: 'Pack 2',
          published_at: now,
          created_at: now,
          updated_at: now,
        },
      ];

      const mockQueryBuilder = {
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getCount: vi.fn().mockResolvedValue(10),
        getMany: vi.fn().mockResolvedValue(mockPacks),
      };

      mockTemplatePackRepo.createQueryBuilder = vi
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.listTemplatePacks({ page: 1, limit: 20 });

      expect(result).toEqual({
        packs: mockPacks.map((p) => ({
          ...p,
          published_at: now.toISOString(),
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        })),
        total: 10,
        page: 1,
        limit: 20,
      });
    });

    it('should filter deprecated packs by default', async () => {
      const mockQueryBuilder = {
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getCount: vi.fn().mockResolvedValue(5),
        getMany: vi.fn().mockResolvedValue([]),
      };

      mockTemplatePackRepo.createQueryBuilder = vi
        .fn()
        .mockReturnValue(mockQueryBuilder);

      await service.listTemplatePacks({ page: 1, limit: 20 });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'pack.deprecated_at IS NULL'
      );
    });

    it('should support search query', async () => {
      const mockQueryBuilder = {
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getCount: vi.fn().mockResolvedValue(2),
        getMany: vi.fn().mockResolvedValue([]),
      };

      mockTemplatePackRepo.createQueryBuilder = vi
        .fn()
        .mockReturnValue(mockQueryBuilder);

      await service.listTemplatePacks({ page: 1, limit: 20, search: 'TOGAF' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(pack.name ILIKE :search OR pack.description ILIKE :search)',
        { search: '%TOGAF%' }
      );
    });
  });

  describe('assignTemplatePackToProject', () => {
    const projectId = 'proj-1';
    const orgId = 'org-1';
    const tenantId = 'tenant-1';
    const userId = 'user-1';

    it('should assign template pack successfully', async () => {
      const dto: AssignTemplatePackDto = {
        template_pack_id: 'pack-1',
      };

      const now = new Date();
      const mockPack = {
        id: 'pack-1',
        name: 'TOGAF Core',
        version: '1.0.0',
        object_type_schemas: {
          Requirement: { type: 'object' },
          Feature: { type: 'object' },
        },
        relationship_type_schemas: {},
        ui_configs: {},
        extraction_prompts: {},
        published_at: now,
        created_at: now,
        updated_at: now,
      };

      // Mock template pack exists (via repository)
      mockTemplatePackRepo.findOne.mockResolvedValueOnce(mockPack);

      // Mock user lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: userId }],
        rowCount: 1,
      } as any);

      // Mock client for transaction
      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ set_config: orgId }], rowCount: 1 }) // set org context
          .mockResolvedValueOnce({
            rows: [{ set_config: projectId }],
            rowCount: 1,
          }) // set project context
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'assignment-1',
                organization_id: orgId,
                project_id: projectId,
                template_pack_id: 'pack-1',
                installed_by: userId,
                active: true,
                customizations: {},
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
            rowCount: 1,
          }) // insert assignment RETURNING *
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert type 1
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert type 2
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // COMMIT
        release: vi.fn(),
      };

      mockDb.getClient.mockResolvedValueOnce(mockClient);

      const result = await service.assignTemplatePackToProject(
        projectId,
        orgId,
        userId,
        dto
      );

      expect(result.success).toBe(true);
      expect(result.installed_types).toEqual(['Requirement', 'Feature']);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw ConflictException if already installed', async () => {
      const dto: AssignTemplatePackDto = {
        template_pack_id: 'pack-1',
      };

      const now = new Date();
      const mockPack = {
        id: 'pack-1',
        name: 'TOGAF',
        version: '1.0.0',
        object_type_schemas: {},
        published_at: now,
        created_at: now,
        updated_at: now,
      };

      // Mock template pack exists (via repository)
      mockTemplatePackRepo.findOne.mockResolvedValueOnce(mockPack);

      // Mock user lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }],
        rowCount: 1,
      } as any);

      // Mock existing assignment
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'existing-assignment' }],
        rowCount: 1,
      } as any);

      await expect(
        service.assignTemplatePackToProject(projectId, orgId, userId, dto)
      ).rejects.toThrow(ConflictException);
    });

    it('should skip conflicting types', async () => {
      const dto: AssignTemplatePackDto = {
        template_pack_id: 'pack-1',
      };

      const now = new Date();
      const mockPack = {
        id: 'pack-1',
        name: 'TOGAF Core',
        version: '1.0.0',
        object_type_schemas: {
          Requirement: { type: 'object' },
          Feature: { type: 'object' },
        },
        relationship_type_schemas: {},
        ui_configs: {},
        extraction_prompts: {},
        published_at: now,
        created_at: now,
        updated_at: now,
      };

      // Mock template pack exists (via repository)
      mockTemplatePackRepo.findOne.mockResolvedValueOnce(mockPack);

      // Mock user lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }],
        rowCount: 1,
      } as any);
      // Mock no existing assignment
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      // Mock existing Requirement type
      mockDb.query.mockResolvedValueOnce({
        rows: [{ type: 'Requirement' }],
        rowCount: 1,
      } as any);

      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ set_config: orgId }], rowCount: 1 }) // set org context
          .mockResolvedValueOnce({
            rows: [{ set_config: projectId }],
            rowCount: 1,
          }) // set project context
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'assignment-1',
                organization_id: orgId,
                project_id: projectId,
                template_pack_id: 'pack-1',
                installed_by: userId,
                active: true,
                customizations: {},
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
            rowCount: 1,
          }) // insert assignment RETURNING *
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Only Feature type inserted
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // COMMIT
        release: vi.fn(),
      };

      mockDb.getClient.mockResolvedValueOnce(mockClient);

      const result = await service.assignTemplatePackToProject(
        projectId,
        orgId,
        userId,
        dto
      );

      expect(result.installed_types).toEqual(['Feature']);
      expect(result.conflicts).toEqual([
        {
          type: 'Requirement',
          issue: 'Type already exists in project',
          resolution: 'skipped',
        },
      ]);
    });

    it('should respect enabledTypes customization', async () => {
      const dto: AssignTemplatePackDto = {
        template_pack_id: 'pack-1',
        customizations: {
          enabledTypes: ['Requirement'], // Only enable Requirement
        },
      };

      const now = new Date();
      const mockPack = {
        id: 'pack-1',
        name: 'TOGAF Core',
        version: '1.0.0',
        object_type_schemas: {
          Requirement: { type: 'object' },
          Feature: { type: 'object' },
          Risk: { type: 'object' },
        },
        relationship_type_schemas: {},
        ui_configs: {},
        extraction_prompts: {},
        published_at: now,
        created_at: now,
        updated_at: now,
      };

      // Mock template pack exists (via repository)
      mockTemplatePackRepo.findOne.mockResolvedValueOnce(mockPack);

      // Mock user lookup, no existing assignment, no existing types
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ set_config: orgId }], rowCount: 1 }) // set org context
          .mockResolvedValueOnce({
            rows: [{ set_config: projectId }],
            rowCount: 1,
          }) // set project context
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'assignment-1',
                organization_id: orgId,
                project_id: projectId,
                template_pack_id: 'pack-1',
                installed_by: userId,
                active: true,
                customizations: { enabledTypes: ['Requirement'] },
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
            rowCount: 1,
          }) // insert assignment RETURNING *
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Only Requirement type inserted
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // COMMIT
        release: vi.fn(),
      };

      mockDb.getClient.mockResolvedValueOnce(mockClient);

      const result = await service.assignTemplatePackToProject(
        projectId,
        orgId,
        userId,
        dto
      );

      expect(result.installed_types).toEqual(['Requirement']);
    });
  });

  describe('uninstallTemplatePackFromProject', () => {
    it('should throw BadRequestException if objects exist', async () => {
      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
          .mockResolvedValueOnce({
            rows: [{ set_config: 'org-1' }],
            rowCount: 1,
          }) // set org context
          .mockResolvedValueOnce({
            rows: [{ set_config: 'proj-1' }],
            rowCount: 1,
          }) // set project context
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'assignment-1',
                organization_id: 'org-1',
                project_id: 'proj-1',
                template_pack_id: 'pack-1',
                installed_by: 'user-1',
                active: true,
                customizations: {},
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
            rowCount: 1,
          }) // get assignment
          .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 }) // count objects (> 0)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // ROLLBACK
        release: vi.fn(),
      };

      mockDb.getClient.mockResolvedValueOnce(mockClient);

      await expect(
        service.uninstallTemplatePackFromProject(
          'assignment-1',
          'proj-1',
          'org-1'
        )
      ).rejects.toThrow(BadRequestException);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should uninstall successfully if no objects exist', async () => {
      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
          .mockResolvedValueOnce({
            rows: [{ set_config: 'org-1' }],
            rowCount: 1,
          }) // set org context
          .mockResolvedValueOnce({
            rows: [{ set_config: 'proj-1' }],
            rowCount: 1,
          }) // set project context
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'assignment-1',
                organization_id: 'org-1',
                project_id: 'proj-1',
                template_pack_id: 'pack-1',
                installed_by: 'user-1',
                active: true,
                customizations: {},
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
            rowCount: 1,
          }) // get assignment
          .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }) // count objects
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // delete type registry
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // delete assignment
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // COMMIT
        release: vi.fn(),
      };

      mockDb.getClient.mockResolvedValueOnce(mockClient);

      await service.uninstallTemplatePackFromProject(
        'assignment-1',
        'proj-1',
        'org-1'
      );

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM kb.project_object_type_registry'),
        expect.any(Array)
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM kb.project_template_packs'),
        expect.any(Array)
      );
    });
  });
});
