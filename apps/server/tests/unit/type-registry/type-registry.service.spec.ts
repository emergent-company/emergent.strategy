import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TypeRegistryService } from '../../../src/modules/type-registry/type-registry.service';
import { DatabaseService } from '../../../src/common/database/database.service';
import { ProjectObjectTypeRegistry } from '../../../src/entities/project-object-type-registry.entity';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  CreateObjectTypeDto,
  UpdateObjectTypeDto,
  ValidateObjectDataDto,
} from '../../../src/modules/type-registry/dto/type-registry.dto';
import { vi } from 'vitest';

describe('TypeRegistryService', () => {
  let service: TypeRegistryService;
  let mockDb: any;
  let mockRepository: any;
  let mockDataSource: any;

  const mockProjectId = 'test-project-123';
  const mockOrgId = 'test-org-456';
  const mockTenantId = 'test-tenant-789';
  const mockUserId = 'test-user-000';

  const mockTypeRow = {
    id: 'type-id-123',
    project_id: mockProjectId,
    type: 'Application',
    source: 'custom' as const,
    template_pack_id: null,
    schema_version: 1,
    json_schema: {
      type: 'object',
      required: ['name', 'version'],
      properties: {
        name: { type: 'string' },
        version: { type: 'string' },
        status: { type: 'string', enum: ['active', 'inactive'] },
      },
    },
    ui_config: { icon: 'app', color: 'blue' },
    extraction_config: { priority: 'high' },
    enabled: true,
    discovery_confidence: null,
    description: 'Application type',
    created_at: new Date('2024-01-01'),
    modified_at: new Date('2024-01-01'),
    created_by: mockUserId,
    modified_by: mockUserId,
  };

  beforeEach(async () => {
    mockDb = {
      query: vi.fn(),
      transaction: vi.fn(),
    } as any;

    // Create mock repository (declare outside for accessibility)
    mockRepository = {
      findOne: vi.fn(),
      find: vi.fn(),
      save: vi.fn().mockImplementation((entity) =>
        Promise.resolve({
          id: 'test-id',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          ...entity,
        })
      ),
      create: vi.fn().mockImplementation((dto) => dto),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      increment: vi.fn().mockResolvedValue({ affected: 1 }),
      delete: vi.fn(),
      createQueryBuilder: vi.fn(),
    };

    // Create mock DataSource - needs to handle both org lookup and main queries
    mockDataSource = {
      query: vi.fn().mockImplementation((sql: string, params: any[]) => {
        // Handle org lookup query
        if (sql.includes('SELECT organization_id FROM kb.projects')) {
          return Promise.resolve([{ organization_id: mockOrgId }]);
        }
        // Default to mockDb.query for other queries
        return mockDb.query(sql, params);
      }),
      createQueryRunner: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TypeRegistryService,
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
        {
          provide: getRepositoryToken(ProjectObjectTypeRegistry),
          useValue: mockRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<TypeRegistryService>(TypeRegistryService);

    // WORKAROUND: Manually assign the mocks to fix DI issue
    (service as any).db = mockDb;
    (service as any).dataSource = mockDataSource;
    (service as any).typeRegistryRepo = mockRepository;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getProjectTypes', () => {
    it('should return all types for a project', async () => {
      const mockTypes = [
        {
          ...mockTypeRow,
          type: 'Application',
          template_pack_name: null,
          object_count: '5',
        },
        {
          ...mockTypeRow,
          type: 'Service',
          source: 'template',
          template_pack_name: 'TOGAF',
          object_count: '10',
        },
      ];

      mockDb.query.mockResolvedValue(mockTypes);

      const result = await service.getProjectTypes(mockProjectId, {});

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('Application');
      expect(result[1].type).toBe('Service');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM kb.project_object_type_registry ptr'),
        [mockProjectId]
      );
    });

    it('should filter by enabled types only', async () => {
      mockDb.query.mockResolvedValue([mockTypeRow]);

      await service.getProjectTypes(mockProjectId, {
        enabled_only: true,
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ptr.enabled = true'),
        [mockProjectId]
      );
    });

    it('should filter by source type', async () => {
      mockDb.query.mockResolvedValue([mockTypeRow]);

      await service.getProjectTypes(mockProjectId, {
        source: 'custom',
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ptr.source = $2'),
        [mockProjectId, 'custom']
      );
    });
  });

  describe('getTypeByName', () => {
    it('should return a specific type by name', async () => {
      const mockWithCounts = {
        ...mockTypeRow,
        template_pack_name: 'TOGAF',
        object_count: '5',
      };
      mockDb.query.mockResolvedValue([mockWithCounts]);

      const result = await service.getTypeByName(mockProjectId, 'Application');

      expect(result.type).toBe('Application');
      expect(result.object_count).toBe('5');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ptr.project_id = $1'),
        [mockProjectId, 'Application']
      );
    });

    it('should throw NotFoundException when type does not exist', async () => {
      mockDb.query.mockResolvedValue([]);

      await expect(
        service.getTypeByName(mockProjectId, 'NonExistent')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createCustomType', () => {
    const createDto: CreateObjectTypeDto = {
      type: 'CustomApp',
      source: 'custom',
      json_schema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
        },
      },
      ui_config: { icon: 'custom' },
      extraction_config: {},
      enabled: true,
      description: 'Custom application type',
    };

    it('should create a new custom type', async () => {
      // Mock findOne to return null (type doesn't exist)
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.createCustomType(
        mockProjectId,
        mockOrgId,
        mockUserId,
        createDto
      );

      expect(result.type).toBe('CustomApp');
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { projectId: mockProjectId, typeName: createDto.type },
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException when type already exists', async () => {
      // Mock findOne to return existing type (conflict scenario)
      mockRepository.findOne.mockResolvedValue(mockTypeRow);

      await expect(
        service.createCustomType(
          mockProjectId,
          mockOrgId,
          mockUserId,
          createDto
        )
      ).rejects.toThrow(ConflictException);
    });

    it('should validate JSON Schema structure', async () => {
      const invalidDto = { ...createDto, json_schema: 'not-an-object' as any };

      await expect(
        service.createCustomType(
          mockProjectId,
          mockOrgId,
          mockUserId,
          invalidDto
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should default to empty objects for optional configs', async () => {
      const minimalDto: CreateObjectTypeDto = {
        type: 'MinimalType',
        json_schema: { type: 'object' },
        source: 'custom', // Add required field
      };

      // Mock findOne to return null (type doesn't exist)
      mockRepository.findOne.mockResolvedValue(null);

      await service.createCustomType(
        mockProjectId,
        mockOrgId,
        mockUserId,
        minimalDto
      );

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          uiConfig: {},
          extractionConfig: {},
        })
      );
    });
  });

  describe('updateType', () => {
    const updateDto: UpdateObjectTypeDto = {
      json_schema: {
        type: 'object',
        required: ['name', 'version', 'owner'],
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          owner: { type: 'string' },
        },
      },
      description: 'Updated description',
      enabled: false,
    };

    it('should update a custom type', async () => {
      vi.spyOn(service, 'getTypeByName')
        .mockResolvedValueOnce({ ...mockTypeRow, source: 'custom' } as any)
        .mockResolvedValueOnce(mockTypeRow as any); // Second call for return
      mockRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.updateType(
        mockProjectId,
        'Application',
        updateDto
      );

      expect(mockRepository.update).toHaveBeenCalledWith(
        { projectId: mockProjectId, typeName: 'Application' },
        expect.objectContaining({
          jsonSchema: updateDto.json_schema,
          description: updateDto.description,
          enabled: updateDto.enabled,
        })
      );
    });

    it('should prevent modifying schema of template types', async () => {
      vi.spyOn(service, 'getTypeByName').mockResolvedValue({
        ...mockTypeRow,
        source: 'template',
      } as any);

      await expect(
        service.updateType(mockProjectId, 'Application', updateDto)
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow enabling/disabling template types', async () => {
      vi.spyOn(service, 'getTypeByName')
        .mockResolvedValueOnce({ ...mockTypeRow, source: 'template' } as any)
        .mockResolvedValueOnce(mockTypeRow as any); // Second call for return
      mockRepository.update.mockResolvedValue({ affected: 1 });

      const toggleDto: UpdateObjectTypeDto = { enabled: false };

      await expect(
        service.updateType(mockProjectId, 'Application', toggleDto)
      ).resolves.toBeDefined();
    });

    it('should throw NotFoundException when type does not exist', async () => {
      vi.spyOn(service, 'getTypeByName').mockRejectedValue(
        new NotFoundException()
      );

      await expect(
        service.updateType(mockProjectId, 'NonExistent', updateDto)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteType', () => {
    it('should delete a custom type with no objects', async () => {
      vi.spyOn(service, 'getTypeByName').mockResolvedValue({
        ...mockTypeRow,
        source: 'custom',
        object_count: '0',
      } as any);
      mockRepository.delete.mockResolvedValue({ affected: 1, raw: [] });

      await service.deleteType(mockProjectId, 'Application');

      expect(mockRepository.delete).toHaveBeenCalledWith({
        projectId: mockProjectId,
        typeName: 'Application',
      });
    });

    it('should throw BadRequestException when deleting template type', async () => {
      vi.spyOn(service, 'getTypeByName').mockResolvedValue({
        ...mockTypeRow,
        source: 'template',
      } as any);

      await expect(
        service.deleteType(mockProjectId, 'Application')
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when type has objects', async () => {
      vi.spyOn(service, 'getTypeByName').mockResolvedValue({
        ...mockTypeRow,
        source: 'custom',
        object_count: '5', // Add object_count to trigger the error
      } as any);

      await expect(
        service.deleteType(mockProjectId, 'Application')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateObjectData', () => {
    const validateDto: ValidateObjectDataDto = {
      type: 'Application',
      properties: {
        name: 'My App',
        version: '1.0.0',
        status: 'active',
      },
    };

    it('should validate data against type schema - valid data', async () => {
      vi.spyOn(service, 'getTypeByName').mockResolvedValue(mockTypeRow as any);

      const result = await service.validateObjectData(
        mockProjectId,
        validateDto
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate data against type schema - missing required fields', async () => {
      vi.spyOn(service, 'getTypeByName').mockResolvedValue(mockTypeRow as any);

      const invalidDto: ValidateObjectDataDto = {
        type: 'Application',
        properties: {
          name: 'My App',
          // missing 'version'
        },
      };

      const result = await service.validateObjectData(
        mockProjectId,
        invalidDto
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('version');
    });

    it('should throw BadRequestException when type is disabled', async () => {
      vi.spyOn(service, 'getTypeByName').mockResolvedValue({
        ...mockTypeRow,
        enabled: false,
      } as any);

      await expect(
        service.validateObjectData(mockProjectId, validateDto)
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle type with no schema defined', async () => {
      vi.spyOn(service, 'getTypeByName').mockResolvedValue({
        ...mockTypeRow,
        json_schema: null,
      } as any);

      const result = await service.validateObjectData(
        mockProjectId,
        validateDto
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('getTypeSchema', () => {
    it('should return JSON Schema for a type', async () => {
      vi.spyOn(service, 'getTypeByName').mockResolvedValue(mockTypeRow as any);

      const schema = await service.getTypeSchema(mockProjectId, 'Application');

      expect(schema).toEqual({
        type: mockTypeRow.type,
        json_schema: mockTypeRow.json_schema,
        ui_schema: mockTypeRow.ui_config,
        validation_rules: {
          required: mockTypeRow.json_schema.required,
          properties: mockTypeRow.json_schema.properties,
        },
      });
    });
  });

  describe('toggleType', () => {
    it('should enable a type', async () => {
      vi.spyOn(service, 'getTypeByName')
        .mockResolvedValueOnce({ ...mockTypeRow, enabled: false } as any)
        .mockResolvedValueOnce({ ...mockTypeRow, enabled: true } as any);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.toggleType(
        mockProjectId,
        'Application',
        true
      );

      expect(mockRepository.update).toHaveBeenCalledWith(
        { projectId: mockProjectId, typeName: 'Application' },
        { enabled: true }
      );
    });

    it('should disable a type', async () => {
      vi.spyOn(service, 'getTypeByName')
        .mockResolvedValueOnce(mockTypeRow as any)
        .mockResolvedValueOnce({ ...mockTypeRow, enabled: false } as any);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.toggleType(
        mockProjectId,
        'Application',
        false
      );

      expect(result.enabled).toBe(false);
    });
  });

  describe('getTypeStatistics', () => {
    it('should return project-level statistics', async () => {
      const mockStats = {
        total_types: '10',
        enabled_types: '8',
        template_types: '5',
        custom_types: '3',
        discovered_types: '2',
        total_objects: '150',
        types_with_objects: '7',
      };

      mockDb.query.mockResolvedValue([mockStats]);

      const result = await service.getTypeStatistics(mockProjectId);

      expect(result.total_types).toBe(10);
      expect(result.enabled_types).toBe(8);
      expect(result.total_objects).toBe(150);
    });
  });
});
