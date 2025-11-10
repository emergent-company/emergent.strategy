import { Test, TestingModule } from '@nestjs/testing';
import { SchemaTool } from '../../../src/modules/mcp/tools/schema.tool';
import { TemplatePackService } from '../../../src/modules/mcp/../template-packs/template-pack.service';
import { SchemaVersionService } from '../../../src/modules/mcp/services/schema-version.service';
import { vi } from 'vitest';

describe('SchemaTool', () => {
    let tool: SchemaTool;
    let mockTemplatePackService: any;
    let mockSchemaVersionService: any;

    beforeEach(async () => {
        // Create mock services
        mockTemplatePackService = {
            listTemplatePacks: vi.fn(),
            getTemplatePackById: vi.fn(),
        };

        mockSchemaVersionService = {
            getSchemaVersion: vi.fn().mockResolvedValue('test-version-123'),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SchemaTool,
                {
                    provide: TemplatePackService,
                    useValue: mockTemplatePackService,
                },
                {
                    provide: SchemaVersionService,
                    useValue: mockSchemaVersionService,
                },
            ],
        }).compile();

        tool = module.get<SchemaTool>(SchemaTool);

        // WORKAROUND: Manually assign mocks to fix DI issue
        (tool as any).templatePackService = mockTemplatePackService;
        (tool as any).schemaVersionService = mockSchemaVersionService;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('schema_getTemplatePacks', () => {
        it('should return list of template pack summaries', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    name: 'Core Pack',
                    version: '1.0.0',
                    description: 'Core object types',
                    object_type_schemas: {
                        Person: { properties: { name: {} } },
                        Organization: { properties: { name: {} } },
                    },
                    relationship_type_schemas: {
                        works_for: { sourceType: 'Person', targetType: 'Organization' },
                    },
                },
                {
                    id: 'pack-2',
                    name: 'Project Pack',
                    version: '2.0.0',
                    description: 'Project management types',
                    object_type_schemas: {
                        Project: { properties: { title: {} } },
                        Task: { properties: { title: {} } },
                    },
                    relationship_type_schemas: {
                        belongs_to: { sourceType: 'Task', targetType: 'Project' },
                        assigned_to: { sourceType: 'Task', targetType: 'Person' },
                    },
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 2,
            });

            // Act
            const result = await tool.getTemplatePacks();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);

            expect(result.data![0]).toEqual({
                id: 'pack-1',
                name: 'Core Pack',
                version: '1.0.0',
                description: 'Core object types',
                object_type_count: 2,
                relationship_type_count: 1,
            });

            expect(result.data![1]).toEqual({
                id: 'pack-2',
                name: 'Project Pack',
                version: '2.0.0',
                description: 'Project management types',
                object_type_count: 2,
                relationship_type_count: 2,
            });

            expect(result.metadata?.schema_version).toBe('test-version-123');
            expect(result.metadata?.count).toBe(2);
            expect(result.metadata?.cached_until).toBeDefined();
            expect(mockTemplatePackService.listTemplatePacks).toHaveBeenCalledWith({
                limit: 100,
                page: 1,
            });
        });

        it('should handle empty packs list', async () => {
            // Arrange
            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: [],
                total: 0,
            });

            // Act
            const result = await tool.getTemplatePacks();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(0);
            expect(result.metadata?.count).toBe(0);
        });

        it('should handle packs without descriptions', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    name: 'Core Pack',
                    version: '1.0.0',
                    // No description field
                    object_type_schemas: {},
                    relationship_type_schemas: {},
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 1,
            });

            // Act
            const result = await tool.getTemplatePacks();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data![0].description).toBe('No description available');
        });

        it('should handle packs without schemas', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    name: 'Empty Pack',
                    version: '1.0.0',
                    // No object_type_schemas or relationship_type_schemas
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 1,
            });

            // Act
            const result = await tool.getTemplatePacks();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data![0].object_type_count).toBe(0);
            expect(result.data![0].relationship_type_count).toBe(0);
        });

        it('should return error when service fails', async () => {
            // Arrange
            mockTemplatePackService.listTemplatePacks.mockRejectedValue(
                new Error('Database connection failed')
            );

            // Act
            const result = await tool.getTemplatePacks();

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Database connection failed');
        });
    });

    describe('schema_getTemplatePackDetails', () => {
        it('should return complete pack details', async () => {
            // Arrange
            const mockPack = {
                id: 'core',
                name: 'Core Pack',
                version: '1.0.0',
                description: 'Core object types',
                created_at: '2025-01-01T00:00:00Z',
                updated_at: '2025-01-15T00:00:00Z',
                object_type_schemas: {
                    Person: {
                        label: 'Person',
                        description: 'An individual person',
                        properties: {
                            name: { type: 'string' },
                            email: { type: 'string' },
                        },
                        required: ['name'],
                        display: { name_property: 'name' },
                    },
                },
                relationship_type_schemas: {
                    works_for: {
                        label: 'Works For',
                        description: 'Employment relationship',
                        sourceType: 'Person',
                        targetType: 'Organization',
                        cardinality: 'many-to-one',
                        properties: { role: { type: 'string' } },
                    },
                },
            };

            mockTemplatePackService.getTemplatePackById.mockResolvedValue(mockPack);

            // Act
            const result = await tool.getTemplatePackDetails({ pack_id: 'core' });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('core');
            expect(result.data?.name).toBe('Core Pack');
            expect(result.data?.object_types).toHaveLength(1);
            expect(result.data?.relationship_types).toHaveLength(1);

            expect(result.data?.object_types[0]).toEqual({
                name: 'Person',
                label: 'Person',
                description: 'An individual person',
                properties: {
                    name: { type: 'string' },
                    email: { type: 'string' },
                },
                required: ['name'],
                display: { name_property: 'name' },
            });

            expect(result.data?.relationship_types[0]).toEqual({
                name: 'works_for',
                label: 'Works For',
                description: 'Employment relationship',
                source_type: 'Person',
                target_type: 'Organization',
                cardinality: 'many-to-one',
                properties: { role: { type: 'string' } },
            });

            expect(result.metadata?.schema_version).toBe('test-version-123');
            expect(mockTemplatePackService.getTemplatePackById).toHaveBeenCalledWith('core');
        });

        it('should return error when pack not found', async () => {
            // Arrange
            mockTemplatePackService.getTemplatePackById.mockResolvedValue(null);

            // Act
            const result = await tool.getTemplatePackDetails({ pack_id: 'nonexistent' });

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Template pack not found: nonexistent');
        });

        it('should handle pack with empty schemas', async () => {
            // Arrange
            const mockPack = {
                id: 'empty',
                name: 'Empty Pack',
                version: '1.0.0',
                created_at: '2025-01-01T00:00:00Z',
                updated_at: '2025-01-15T00:00:00Z',
                // No schemas
            };

            mockTemplatePackService.getTemplatePackById.mockResolvedValue(mockPack);

            // Act
            const result = await tool.getTemplatePackDetails({ pack_id: 'empty' });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data?.object_types).toHaveLength(0);
            expect(result.data?.relationship_types).toHaveLength(0);
        });

        it('should use fallback values for missing labels', async () => {
            // Arrange
            const mockPack = {
                id: 'test',
                name: 'Test Pack',
                version: '1.0.0',
                created_at: '2025-01-01T00:00:00Z',
                updated_at: '2025-01-15T00:00:00Z',
                object_type_schemas: {
                    Task: {
                        // No label, description
                        properties: { title: {} },
                    },
                },
                relationship_type_schemas: {
                    related_to: {
                        // No label, description
                        sourceType: 'Task',
                        targetType: 'Task',
                    },
                },
            };

            mockTemplatePackService.getTemplatePackById.mockResolvedValue(mockPack);

            // Act
            const result = await tool.getTemplatePackDetails({ pack_id: 'test' });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data?.object_types[0].label).toBe('Task');
            expect(result.data?.object_types[0].description).toBe('');
            expect(result.data?.relationship_types[0].label).toBe('related_to');
            expect(result.data?.relationship_types[0].description).toBe('');
        });

        it('should return error when service fails', async () => {
            // Arrange
            mockTemplatePackService.getTemplatePackById.mockRejectedValue(
                new Error('Database error')
            );

            // Act
            const result = await tool.getTemplatePackDetails({ pack_id: 'core' });

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Database error');
        });
    });

    describe('schema_getObjectTypes', () => {
        it('should return all object types from all packs', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    object_type_schemas: {
                        Person: {
                            label: 'Person',
                            description: 'A person',
                            properties: { name: {} },
                            required: ['name'],
                        },
                        Organization: {
                            label: 'Organization',
                            description: 'An organization',
                            properties: { name: {} },
                        },
                    },
                },
                {
                    id: 'pack-2',
                    object_type_schemas: {
                        Task: {
                            label: 'Task',
                            description: 'A task',
                            properties: { title: {} },
                        },
                    },
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 2,
            });

            // Act
            const result = await tool.getObjectTypes();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(3);
            expect(result.data?.map(t => t.name)).toEqual(['Person', 'Organization', 'Task']);
            expect(result.metadata?.count).toBe(3);
            expect(result.metadata?.schema_version).toBe('test-version-123');
        });

        it('should filter by pack_id when provided', async () => {
            // Arrange
            const mockPack = {
                id: 'pack-1',
                object_type_schemas: {
                    Person: {
                        label: 'Person',
                        properties: { name: {} },
                    },
                },
            };

            mockTemplatePackService.getTemplatePackById.mockResolvedValue(mockPack);

            // Act
            const result = await tool.getObjectTypes({ pack_id: 'pack-1' });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(1);
            expect(result.data![0].name).toBe('Person');
            expect(mockTemplatePackService.getTemplatePackById).toHaveBeenCalledWith('pack-1');
        });

        it('should return empty array when filtered pack not found', async () => {
            // Arrange
            mockTemplatePackService.getTemplatePackById.mockResolvedValue(null);

            // Act
            const result = await tool.getObjectTypes({ pack_id: 'nonexistent' });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(0);
        });

        it('should handle packs with no object types', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    // No object_type_schemas
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 1,
            });

            // Act
            const result = await tool.getObjectTypes();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(0);
        });

        it('should return error when service fails', async () => {
            // Arrange
            mockTemplatePackService.listTemplatePacks.mockRejectedValue(
                new Error('Service error')
            );

            // Act
            const result = await tool.getObjectTypes();

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Service error');
        });
    });

    describe('schema_getRelationshipTypes', () => {
        it('should return all relationship types from all packs', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    relationship_type_schemas: {
                        works_for: {
                            label: 'Works For',
                            sourceType: 'Person',
                            targetType: 'Organization',
                            cardinality: 'many-to-one',
                        },
                        manages: {
                            label: 'Manages',
                            sourceType: 'Person',
                            targetType: 'Person',
                            cardinality: 'one-to-many',
                        },
                    },
                },
                {
                    id: 'pack-2',
                    relationship_type_schemas: {
                        assigned_to: {
                            label: 'Assigned To',
                            sourceType: 'Task',
                            targetType: 'Person',
                        },
                    },
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 2,
            });

            // Act
            const result = await tool.getRelationshipTypes();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(3);
            expect(result.data?.map(r => r.name)).toEqual(['works_for', 'manages', 'assigned_to']);
            expect(result.metadata?.count).toBe(3);
            expect(result.metadata?.schema_version).toBe('test-version-123');
        });

        it('should filter by pack_id when provided', async () => {
            // Arrange
            const mockPack = {
                id: 'pack-1',
                relationship_type_schemas: {
                    works_for: {
                        label: 'Works For',
                        sourceType: 'Person',
                        targetType: 'Organization',
                    },
                },
            };

            mockTemplatePackService.getTemplatePackById.mockResolvedValue(mockPack);

            // Act
            const result = await tool.getRelationshipTypes({ pack_id: 'pack-1' });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(1);
            expect(result.data![0].name).toBe('works_for');
            expect(mockTemplatePackService.getTemplatePackById).toHaveBeenCalledWith('pack-1');
        });

        it('should filter by source_type when provided', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    relationship_type_schemas: {
                        works_for: {
                            sourceType: 'Person',
                            targetType: 'Organization',
                        },
                        manages: {
                            sourceType: 'Person',
                            targetType: 'Person',
                        },
                        assigned_to: {
                            sourceType: 'Task',
                            targetType: 'Person',
                        },
                    },
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 1,
            });

            // Act
            const result = await tool.getRelationshipTypes({ source_type: 'Person' });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
            expect(result.data?.map(r => r.name)).toEqual(['works_for', 'manages']);
        });

        it('should filter by target_type when provided', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    relationship_type_schemas: {
                        works_for: {
                            sourceType: 'Person',
                            targetType: 'Organization',
                        },
                        assigned_to: {
                            sourceType: 'Task',
                            targetType: 'Person',
                        },
                        manages: {
                            sourceType: 'Person',
                            targetType: 'Person',
                        },
                    },
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 1,
            });

            // Act
            const result = await tool.getRelationshipTypes({ target_type: 'Person' });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
            expect(result.data?.map(r => r.name)).toEqual(['assigned_to', 'manages']);
        });

        it('should filter by both source_type and target_type', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    relationship_type_schemas: {
                        works_for: {
                            sourceType: 'Person',
                            targetType: 'Organization',
                        },
                        manages: {
                            sourceType: 'Person',
                            targetType: 'Person',
                        },
                        assigned_to: {
                            sourceType: 'Task',
                            targetType: 'Person',
                        },
                    },
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 1,
            });

            // Act
            const result = await tool.getRelationshipTypes({
                source_type: 'Person',
                target_type: 'Person',
            });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(1);
            expect(result.data![0].name).toBe('manages');
        });

        it('should return empty array when no relationships match filters', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    relationship_type_schemas: {
                        works_for: {
                            sourceType: 'Person',
                            targetType: 'Organization',
                        },
                    },
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 1,
            });

            // Act
            const result = await tool.getRelationshipTypes({ source_type: 'Task' });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(0);
        });

        it('should handle packs with no relationship types', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    // No relationship_type_schemas
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 1,
            });

            // Act
            const result = await tool.getRelationshipTypes();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(0);
        });

        it('should return error when service fails', async () => {
            // Arrange
            mockTemplatePackService.listTemplatePacks.mockRejectedValue(
                new Error('Service error')
            );

            // Act
            const result = await tool.getRelationshipTypes();

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Service error');
        });
    });
});
