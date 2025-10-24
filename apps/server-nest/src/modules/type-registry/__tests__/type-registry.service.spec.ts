import { Test, TestingModule } from '@nestjs/testing';
import { TypeRegistryService } from '../type-registry.service';
import { DatabaseService } from '../../../common/database/database.service';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CreateObjectTypeDto, UpdateObjectTypeDto, ValidateObjectDataDto } from '../dto/type-registry.dto';
import { vi } from 'vitest';

describe('TypeRegistryService', () => {
    let service: TypeRegistryService;
    let mockDb: any;

    const mockProjectId = 'test-project-123';
    const mockOrgId = 'test-org-456';
    const mockTenantId = 'test-tenant-789';
    const mockUserId = 'test-user-000';

    const mockTypeRow = {
        id: 'type-id-123',
        organization_id: mockOrgId,
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

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TypeRegistryService,
                {
                    provide: DatabaseService,
                    useValue: mockDb,
                },
            ],
        }).compile();

        service = module.get<TypeRegistryService>(TypeRegistryService);

        // WORKAROUND: Manually assign the mock to fix DI issue
        (service as any).db = mockDb;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('getProjectTypes', () => {
        it('should return all types for a project', async () => {
            const mockTypes = [
                { ...mockTypeRow, type: 'Application', template_pack_name: null, object_count: '5' },
                { ...mockTypeRow, type: 'Service', source: 'template', template_pack_name: 'TOGAF', object_count: '10' },
            ];

            mockDb.query.mockResolvedValue({ rows: mockTypes, rowCount: 2 });

            const result = await service.getProjectTypes(mockProjectId, mockOrgId, {});

            expect(result).toHaveLength(2);
            expect(result[0].type).toBe('Application');
            expect(result[1].type).toBe('Service');
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('FROM kb.project_object_type_registry ptr'),
                [mockProjectId, mockOrgId]
            );
        });

        it('should filter by enabled types only', async () => {
            mockDb.query.mockResolvedValue({ rows: [mockTypeRow], rowCount: 1 });

            await service.getProjectTypes(mockProjectId, mockOrgId, { enabled_only: true });

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('ptr.enabled = true'),
                [mockProjectId, mockOrgId]
            );
        });

        it('should filter by source type', async () => {
            mockDb.query.mockResolvedValue({ rows: [mockTypeRow], rowCount: 1 });

            await service.getProjectTypes(mockProjectId, mockOrgId, { source: 'custom' });

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('ptr.source = $3'),
                [mockProjectId, mockOrgId, 'custom']
            );
        });
    });

    describe('getTypeByName', () => {
        it('should return a specific type by name', async () => {
            const mockWithCounts = { ...mockTypeRow, template_pack_name: 'TOGAF', object_count: '5' };
            mockDb.query.mockResolvedValue({ rows: [mockWithCounts], rowCount: 1 });

            const result = await service.getTypeByName(mockProjectId, mockOrgId, 'Application');

            expect(result.type).toBe('Application');
            expect(result.object_count).toBe('5');
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('WHERE ptr.project_id = $1'),
                [mockProjectId, mockOrgId, 'Application']
            );
        });

        it('should throw NotFoundException when type does not exist', async () => {
            mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

            await expect(
                service.getTypeByName(mockProjectId, mockOrgId, 'NonExistent')
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
            // First query: check if type exists (should return empty)
            // Second query: INSERT RETURNING
            mockDb.query
                .mockResolvedValueOnce({ rows: [], rowCount: 0 })
                .mockResolvedValueOnce({ rows: [mockTypeRow], rowCount: 1 });

            const result = await service.createCustomType(
                mockProjectId,
                mockOrgId,
                mockTenantId,
                mockUserId,
                createDto
            );

            expect(result.type).toBe('Application');
            // Check the second call (INSERT)
            expect(mockDb.query).toHaveBeenNthCalledWith(
                2, // Second call
                expect.stringContaining('INSERT INTO kb.project_object_type_registry'),
                expect.arrayContaining([mockProjectId, mockOrgId, createDto.type, 'custom'])
            );
        });

        it('should throw ConflictException when type already exists', async () => {
            mockDb.query.mockResolvedValue({ rows: [mockTypeRow], rowCount: 1 });

            const existsCheck = vi.spyOn(service, 'getTypeByName').mockResolvedValue(mockTypeRow as any);

            await expect(
                service.createCustomType(mockProjectId, mockOrgId, mockTenantId, mockUserId, createDto)
            ).rejects.toThrow(ConflictException);

            existsCheck.mockRestore();
        });

        it('should validate JSON Schema structure', async () => {
            const invalidDto = { ...createDto, json_schema: 'not-an-object' as any };

            await expect(
                service.createCustomType(mockProjectId, mockOrgId, mockTenantId, mockUserId, invalidDto)
            ).rejects.toThrow(BadRequestException);
        });

        it('should default to empty objects for optional configs', async () => {
            const minimalDto: CreateObjectTypeDto = {
                type: 'MinimalType',
                json_schema: { type: 'object' },
                source: 'custom', // Add required field
            };

            // First query: check if type exists (should return empty)
            // Second query: INSERT RETURNING
            mockDb.query
                .mockResolvedValueOnce({ rows: [], rowCount: 0 })
                .mockResolvedValueOnce({ rows: [mockTypeRow], rowCount: 1 });

            await service.createCustomType(mockProjectId, mockOrgId, mockTenantId, mockUserId, minimalDto);

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.any(String),
                expect.arrayContaining([
                    expect.objectContaining({}), // ui_config default
                    expect.objectContaining({}), // extraction_config default
                ])
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
            vi.spyOn(service, 'getTypeByName').mockResolvedValue({ ...mockTypeRow, source: 'custom' } as any);
            mockDb.query.mockResolvedValue({ rows: [mockTypeRow], rowCount: 1 });

            const result = await service.updateType(mockProjectId, mockOrgId, 'Application', updateDto);

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE kb.project_object_type_registry'),
                expect.arrayContaining([mockProjectId, mockOrgId, 'Application'])
            );
        });

        it('should prevent modifying schema of template types', async () => {
            vi.spyOn(service, 'getTypeByName').mockResolvedValue({ ...mockTypeRow, source: 'template' } as any);

            await expect(
                service.updateType(mockProjectId, mockOrgId, 'Application', updateDto)
            ).rejects.toThrow(BadRequestException);
        });

        it('should allow enabling/disabling template types', async () => {
            vi.spyOn(service, 'getTypeByName').mockResolvedValue({ ...mockTypeRow, source: 'template' } as any);
            mockDb.query.mockResolvedValue({ rows: [mockTypeRow], rowCount: 1 });

            const toggleDto: UpdateObjectTypeDto = { enabled: false };

            await expect(
                service.updateType(mockProjectId, mockOrgId, 'Application', toggleDto)
            ).resolves.toBeDefined();
        });

        it('should throw NotFoundException when type does not exist', async () => {
            vi.spyOn(service, 'getTypeByName').mockRejectedValue(new NotFoundException());

            await expect(
                service.updateType(mockProjectId, mockOrgId, 'NonExistent', updateDto)
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('deleteType', () => {
        it('should delete a custom type with no objects', async () => {
            vi.spyOn(service, 'getTypeByName').mockResolvedValue({ ...mockTypeRow, source: 'custom' } as any);
            mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 }); // No objects
            mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // Delete query

            await service.deleteType(mockProjectId, mockOrgId, 'Application');

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM kb.project_object_type_registry'),
                [mockProjectId, mockOrgId, 'Application']
            );
        });

        it('should throw BadRequestException when deleting template type', async () => {
            vi.spyOn(service, 'getTypeByName').mockResolvedValue({ ...mockTypeRow, source: 'template' } as any);

            await expect(
                service.deleteType(mockProjectId, mockOrgId, 'Application')
            ).rejects.toThrow(BadRequestException);
        });

        it('should throw BadRequestException when type has objects', async () => {
            vi.spyOn(service, 'getTypeByName').mockResolvedValue({
                ...mockTypeRow,
                source: 'custom',
                object_count: '5' // Add object_count to trigger the error
            } as any);

            await expect(
                service.deleteType(mockProjectId, mockOrgId, 'Application')
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

            const result = await service.validateObjectData(mockProjectId, mockOrgId, validateDto);

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

            const result = await service.validateObjectData(mockProjectId, mockOrgId, invalidDto);

            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors![0].message).toContain('version');
        });

        it('should throw BadRequestException when type is disabled', async () => {
            vi.spyOn(service, 'getTypeByName').mockResolvedValue({ ...mockTypeRow, enabled: false } as any);

            await expect(
                service.validateObjectData(mockProjectId, mockOrgId, validateDto)
            ).rejects.toThrow(BadRequestException);
        });

        it('should handle type with no schema defined', async () => {
            vi.spyOn(service, 'getTypeByName').mockResolvedValue({ ...mockTypeRow, json_schema: null } as any);

            const result = await service.validateObjectData(mockProjectId, mockOrgId, validateDto);

            expect(result.valid).toBe(true);
        });
    });

    describe('getTypeSchema', () => {
        it('should return JSON Schema for a type', async () => {
            vi.spyOn(service, 'getTypeByName').mockResolvedValue(mockTypeRow as any);

            const schema = await service.getTypeSchema(mockProjectId, mockOrgId, 'Application');

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
            vi.spyOn(service, 'getTypeByName').mockResolvedValue({ ...mockTypeRow, enabled: false } as any);
            mockDb.query.mockResolvedValue({ rows: [{ ...mockTypeRow, enabled: true }], rowCount: 1 });

            const result = await service.toggleType(mockProjectId, mockOrgId, 'Application', true);

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE kb.project_object_type_registry'),
                expect.arrayContaining([true, mockProjectId, mockOrgId, 'Application'])
            );
        });

        it('should disable a type', async () => {
            vi.spyOn(service, 'getTypeByName').mockResolvedValue(mockTypeRow as any);
            mockDb.query.mockResolvedValue({ rows: [{ ...mockTypeRow, enabled: false }], rowCount: 1 });

            const result = await service.toggleType(mockProjectId, mockOrgId, 'Application', false);

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

            mockDb.query.mockResolvedValue({ rows: [mockStats], rowCount: 1 });

            const result = await service.getTypeStatistics(mockProjectId, mockOrgId);

            expect(result.total_types).toBe(10);
            expect(result.enabled_types).toBe(8);
            expect(result.total_objects).toBe(150);
        });
    });
});
