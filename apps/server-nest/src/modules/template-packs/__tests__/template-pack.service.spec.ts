import { Test, TestingModule } from '@nestjs/testing';
import { TemplatePackService } from '../template-pack.service';
import { DatabaseService } from '../../../common/database/database.service';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CreateTemplatePackDto, AssignTemplatePackDto } from '../dto/template-pack.dto';

describe('TemplatePackService', () => {
    let service: TemplatePackService;
    let mockDb: jest.Mocked<DatabaseService>;

    beforeEach(async () => {
        // Create mock database service
        mockDb = {
            query: jest.fn(),
            getPool: jest.fn(() => ({
                connect: jest.fn().mockResolvedValue({
                    query: jest.fn(),
                    release: jest.fn(),
                }),
            })),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TemplatePackService,
                {
                    provide: DatabaseService,
                    useValue: mockDb,
                },
            ],
        }).compile();

        service = module.get<TemplatePackService>(TemplatePackService);
    });

    afterEach(() => {
        jest.clearAllMocks();
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

            const mockResult = {
                id: 'pack-1',
                ...dto,
                published_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            mockDb.query.mockResolvedValueOnce({
                rows: [mockResult],
                rowCount: 1,
            } as any);

            const result = await service.createTemplatePack(dto);

            expect(result).toEqual(mockResult);
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO kb.graph_template_packs'),
                expect.arrayContaining([dto.name, dto.version])
            );
        });

        it('should calculate checksum if not provided', async () => {
            const dto: CreateTemplatePackDto = {
                name: 'Test Pack',
                version: '1.0.0',
                object_type_schemas: { TestType: {} },
            };

            mockDb.query.mockResolvedValueOnce({
                rows: [{ id: 'pack-1', ...dto }],
                rowCount: 1,
            } as any);

            await service.createTemplatePack(dto);

            // Verify checksum was passed to database
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.any(String),
                expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}$/)]) // SHA256 hex
            );
        });
    });

    describe('getTemplatePackById', () => {
        it('should return template pack if found', async () => {
            const mockPack = {
                id: 'pack-1',
                name: 'TOGAF Core',
                version: '1.0.0',
            };

            mockDb.query.mockResolvedValueOnce({
                rows: [mockPack],
                rowCount: 1,
            } as any);

            const result = await service.getTemplatePackById('pack-1');

            expect(result).toEqual(mockPack);
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT * FROM kb.graph_template_packs WHERE id = $1'),
                ['pack-1']
            );
        });

        it('should throw NotFoundException if not found', async () => {
            mockDb.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            } as any);

            await expect(service.getTemplatePackById('nonexistent')).rejects.toThrow(NotFoundException);
        });
    });

    describe('listTemplatePacks', () => {
        it('should list template packs with pagination', async () => {
            const mockPacks = [
                { id: 'pack-1', name: 'Pack 1' },
                { id: 'pack-2', name: 'Pack 2' },
            ];

            // Mock count query
            mockDb.query.mockResolvedValueOnce({
                rows: [{ count: '10' }],
                rowCount: 1,
            } as any);

            // Mock data query
            mockDb.query.mockResolvedValueOnce({
                rows: mockPacks,
                rowCount: 2,
            } as any);

            const result = await service.listTemplatePacks({ page: 1, limit: 20 });

            expect(result).toEqual({
                packs: mockPacks,
                total: 10,
                page: 1,
                limit: 20,
            });
        });

        it('should filter deprecated packs by default', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 } as any);
            mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

            await service.listTemplatePacks({ page: 1, limit: 20 });

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('WHERE deprecated_at IS NULL'),
                expect.any(Array)
            );
        });

        it('should support search query', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 } as any);
            mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

            await service.listTemplatePacks({ page: 1, limit: 20, search: 'TOGAF' });

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('ILIKE'),
                expect.arrayContaining(['%TOGAF%'])
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
            };

            // Mock template pack exists
            mockDb.query.mockResolvedValueOnce({
                rows: [mockPack],
                rowCount: 1,
            } as any);

            // Mock no existing assignment
            mockDb.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            } as any);

            // Mock no existing types
            mockDb.query.mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            } as any);

            // Mock client for transaction
            const mockClient = {
                query: jest.fn()
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set org context
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set project context
                    .mockResolvedValueOnce({ rows: [{ id: 'assignment-1' }], rowCount: 1 }) // insert assignment
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert type 1
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // insert type 2
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // COMMIT
                release: jest.fn(),
            };

            (mockDb.getPool as jest.Mock).mockReturnValueOnce({
                connect: jest.fn().mockResolvedValue(mockClient),
            });

            const result = await service.assignTemplatePackToProject(
                projectId,
                orgId,
                tenantId,
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

            // Mock template pack exists
            mockDb.query.mockResolvedValueOnce({
                rows: [{ id: 'pack-1', name: 'TOGAF', version: '1.0.0', object_type_schemas: {} }],
                rowCount: 1,
            } as any);

            // Mock existing assignment
            mockDb.query.mockResolvedValueOnce({
                rows: [{ id: 'existing-assignment' }],
                rowCount: 1,
            } as any);

            await expect(
                service.assignTemplatePackToProject(projectId, orgId, tenantId, userId, dto)
            ).rejects.toThrow(ConflictException);
        });

        it('should skip conflicting types', async () => {
            const dto: AssignTemplatePackDto = {
                template_pack_id: 'pack-1',
            };

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
            };

            // Mock template pack exists
            mockDb.query.mockResolvedValueOnce({ rows: [mockPack], rowCount: 1 } as any);
            // Mock no existing assignment
            mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
            // Mock existing Requirement type
            mockDb.query.mockResolvedValueOnce({
                rows: [{ type: 'Requirement' }],
                rowCount: 1,
            } as any);

            const mockClient = {
                query: jest.fn()
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
                    .mockResolvedValueOnce({ rows: [{ id: 'assignment-1' }], rowCount: 1 })
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Only Feature type inserted
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
                release: jest.fn(),
            };

            (mockDb.getPool as jest.Mock).mockReturnValueOnce({
                connect: jest.fn().mockResolvedValue(mockClient),
            });

            const result = await service.assignTemplatePackToProject(
                projectId,
                orgId,
                tenantId,
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
            };

            mockDb.query.mockResolvedValueOnce({ rows: [mockPack], rowCount: 1 } as any);
            mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
            mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

            const mockClient = {
                query: jest.fn()
                    .mockResolvedValue({ rows: [{ id: 'assignment-1' }], rowCount: 1 }),
                release: jest.fn(),
            };

            (mockDb.getPool as jest.Mock).mockReturnValueOnce({
                connect: jest.fn().mockResolvedValue(mockClient),
            });

            const result = await service.assignTemplatePackToProject(
                projectId,
                orgId,
                tenantId,
                userId,
                dto
            );

            expect(result.installed_types).toEqual(['Requirement']);
        });
    });

    describe('uninstallTemplatePackFromProject', () => {
        it('should throw BadRequestException if objects exist', async () => {
            const mockClient = {
                query: jest.fn()
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set org context
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set project context
                    .mockResolvedValueOnce({
                        rows: [{ template_pack_id: 'pack-1' }],
                        rowCount: 1,
                    }) // get assignment
                    .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 }), // count objects
                release: jest.fn(),
            };

            (mockDb.getPool as jest.Mock).mockReturnValueOnce({
                connect: jest.fn().mockResolvedValue(mockClient),
            });

            await expect(
                service.uninstallTemplatePackFromProject('assignment-1', 'proj-1', 'org-1')
            ).rejects.toThrow(BadRequestException);

            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        });

        it('should uninstall successfully if no objects exist', async () => {
            const mockClient = {
                query: jest.fn()
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set org context
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set project context
                    .mockResolvedValueOnce({
                        rows: [{ id: 'assignment-1', template_pack_id: 'pack-1' }],
                        rowCount: 1,
                    }) // get assignment
                    .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }) // count objects
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // delete type registry
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // delete assignment
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // COMMIT
                release: jest.fn(),
            };

            (mockDb.getPool as jest.Mock).mockReturnValueOnce({
                connect: jest.fn().mockResolvedValue(mockClient),
            });

            await service.uninstallTemplatePackFromProject('assignment-1', 'proj-1', 'org-1');

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
