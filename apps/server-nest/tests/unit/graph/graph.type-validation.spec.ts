/**
 * Integration tests for Type Registry validation in GraphService
 * Tests the integration of TypeRegistryService validation into graph object operations
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { DatabaseService } from '../../../src/common/database/database.service';
import { SchemaRegistryService } from '../../../src/modules/graph/schema-registry.service';
import { TypeRegistryService } from '../../../src/modules/graph/../type-registry/type-registry.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('GraphService - Type Registry Validation Integration', () => {
    let service: GraphService;
    let mockDb: any;
    let mockSchemaRegistry: any;
    let mockTypeRegistry: any;
    let mockClient: any;

    const mockProjectId = 'test-project-123';
    const mockOrgId = 'test-org-456';
    const mockObjectId = 'obj-id-789';

    beforeEach(() => {
        mockClient = {
            query: vi.fn(),
            release: vi.fn(),
        };

        mockDb = {
            query: vi.fn(),
            getClient: vi.fn().mockResolvedValue(mockClient),
            setTenantContext: vi.fn().mockResolvedValue(undefined),
        };

        mockSchemaRegistry = {
            getObjectValidator: vi.fn().mockResolvedValue(null), // No schema validator by default
        };

        mockTypeRegistry = {
            validateObjectData: vi.fn(),
        };

        // Create GraphService instance with mocked dependencies
        service = new GraphService(
            mockDb as any,
            mockSchemaRegistry as any,
            mockTypeRegistry as any
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('createObject - Type Registry Validation', () => {
        const validCreateDto: any = {
            type: 'Application',
            key: 'my-app',
            properties: {
                name: 'My Application',
                version: '1.0.0',
                status: 'active',
            },
            labels: ['production'],
            organization_id: mockOrgId,
            project_id: mockProjectId,
        };

        beforeEach(() => {
            // Mock successful object creation
            mockClient.query
                .mockResolvedValueOnce({ rowCount: 0 }) // BEGIN
                .mockResolvedValueOnce({ rowCount: 0 }) // Advisory lock
                .mockResolvedValueOnce({ rowCount: 0 }) // Existing key check
                .mockResolvedValueOnce({
                    // INSERT result
                    rowCount: 1,
                    rows: [{
                        id: mockObjectId,
                        organization_id: mockOrgId,
                        project_id: mockProjectId,
                        type: 'Application',
                        key: 'my-app',
                        properties: validCreateDto.properties,
                        labels: ['production'],
                        version: 1,
                        canonical_id: 'canonical-123',
                        created_at: new Date(),
                        embedding: null,
                    }],
                })
                .mockResolvedValueOnce({ rowCount: 0 }); // COMMIT
        });

        it('should validate against Type Registry and create object when validation passes', async () => {
            mockTypeRegistry.validateObjectData.mockResolvedValue({
                valid: true,
            });

            const result = await service.createObject(validCreateDto);

            expect(mockTypeRegistry.validateObjectData).toHaveBeenCalledWith(
                mockProjectId,
                mockOrgId,
                {
                    type: 'Application',
                    properties: validCreateDto.properties,
                }
            );
            expect(result.id).toBe(mockObjectId);
        });

        it('should throw BadRequestException when Type Registry validation fails', async () => {
            mockTypeRegistry.validateObjectData.mockResolvedValue({
                valid: false,
                errors: [
                    { path: '/name', message: 'Missing required property: name', keyword: 'required' },
                    { path: '/version', message: 'Missing required property: version', keyword: 'required' },
                ],
            });

            await expect(service.createObject(validCreateDto)).rejects.toThrow(BadRequestException);

            expect(mockTypeRegistry.validateObjectData).toHaveBeenCalled();
        });

        it('should allow creation when type is not registered in Type Registry', async () => {
            mockTypeRegistry.validateObjectData.mockRejectedValue(
                new NotFoundException('Type not found in registry')
            );

            const result = await service.createObject(validCreateDto);

            expect(result.id).toBe(mockObjectId);
            expect(mockTypeRegistry.validateObjectData).toHaveBeenCalled();
        });

        it('should propagate BadRequestException when type is disabled', async () => {
            mockTypeRegistry.validateObjectData.mockRejectedValue(
                new BadRequestException('Type is disabled: Application')
            );

            await expect(service.createObject(validCreateDto)).rejects.toThrow(
                'Type is disabled: Application'
            );
        });

        it('should skip Type Registry validation when TypeRegistry service is not available', async () => {
            const serviceWithoutTypeRegistry = new GraphService(
                mockDb,
                mockSchemaRegistry,
                undefined // No TypeRegistry
            );

            const result = await serviceWithoutTypeRegistry.createObject(validCreateDto);

            expect(mockTypeRegistry.validateObjectData).not.toHaveBeenCalled();
            expect(result.id).toBe(mockObjectId);
        });

        it('should skip Type Registry validation when project_id or org_id is missing', async () => {
            const dtoWithoutOrgProject = {
                ...validCreateDto,
                organization_id: undefined,
                project_id: undefined,
            };

            // Reset query plan to include GUC lookups before transactional steps
            mockClient.query.mockReset();
            mockClient.query
                .mockResolvedValueOnce({ rows: [{ org: null }] }) // current_setting org
                .mockResolvedValueOnce({ rows: [{ proj: null }] }) // current_setting project
                .mockResolvedValueOnce({ rowCount: 0 }) // BEGIN
                .mockResolvedValueOnce({ rowCount: 0 }) // Advisory lock
                .mockResolvedValueOnce({ rowCount: 0 }) // Existing key check
                .mockResolvedValueOnce({
                    rowCount: 1,
                    rows: [{
                        id: mockObjectId,
                        organization_id: null,
                        project_id: null,
                        type: 'Application',
                        key: 'my-app',
                        properties: validCreateDto.properties,
                        labels: ['production'],
                        version: 1,
                        canonical_id: 'canonical-123',
                        created_at: new Date(),
                        embedding: null,
                    }],
                })
                .mockResolvedValueOnce({ rowCount: 0 }); // COMMIT

            await service.createObject(dtoWithoutOrgProject);

            expect(mockTypeRegistry.validateObjectData).not.toHaveBeenCalled();
        });
    });

    describe('patchObject - Type Registry Validation', () => {
        const existingObject = {
            id: mockObjectId,
            organization_id: mockOrgId,
            project_id: mockProjectId,
            type: 'Application',
            key: 'my-app',
            properties: {
                name: 'My Application',
                version: '1.0.0',
            },
            labels: ['production'],
            version: 1,
            canonical_id: 'canonical-123',
            branch_id: null,
        };

        const patchDto: any = {
            properties: {
                status: 'inactive',
            },
        };

        beforeEach(() => {
            mockClient.query
                .mockResolvedValueOnce({ rowCount: 0 }) // BEGIN
                .mockResolvedValueOnce({ rowCount: 1, rows: [existingObject] }) // Current object
                .mockResolvedValueOnce({ rowCount: 0 }) // Advisory lock
                .mockResolvedValueOnce({ rowCount: 0 }) // Newer version check
                .mockResolvedValueOnce({
                    // INSERT new version
                    rowCount: 1,
                    rows: [{
                        ...existingObject,
                        version: 2,
                        properties: {
                            name: 'My Application',
                            version: '1.0.0',
                            status: 'inactive',
                        },
                    }],
                })
                .mockResolvedValueOnce({ rowCount: 0 }); // COMMIT
        });

        it('should validate merged properties against Type Registry when patching', async () => {
            mockTypeRegistry.validateObjectData.mockResolvedValue({
                valid: true,
            });

            await service.patchObject(mockObjectId, patchDto);

            expect(mockTypeRegistry.validateObjectData).toHaveBeenCalledWith(
                mockProjectId,
                mockOrgId,
                {
                    type: 'Application',
                    properties: {
                        name: 'My Application',
                        version: '1.0.0',
                        status: 'inactive',
                    },
                }
            );
        });

        it('should throw BadRequestException when patched properties fail Type Registry validation', async () => {
            mockTypeRegistry.validateObjectData.mockResolvedValue({
                valid: false,
                errors: [
                    { path: '/status', message: 'Invalid enum value', keyword: 'enum' },
                ],
            });

            await expect(service.patchObject(mockObjectId, patchDto)).rejects.toThrow(
                BadRequestException
            );
        });

        it('should allow patch when type is not registered', async () => {
            mockTypeRegistry.validateObjectData.mockRejectedValue(
                new NotFoundException('Type not found in registry')
            );

            await service.patchObject(mockObjectId, patchDto);

            expect(mockTypeRegistry.validateObjectData).toHaveBeenCalled();
        });

        it('should propagate BadRequestException when type is disabled during patch', async () => {
            mockTypeRegistry.validateObjectData.mockRejectedValue(
                new BadRequestException('Type is disabled: Application')
            );

            await expect(service.patchObject(mockObjectId, patchDto)).rejects.toThrow(
                'Type is disabled: Application'
            );
        });
    });

    describe('Validation Priority', () => {
        const createDto: any = {
            type: 'Application',
            properties: { name: 'Test' },
            organization_id: mockOrgId,
            project_id: mockProjectId,
        };

        beforeEach(() => {
            // Mock for createObject without key (no advisory lock or existing check)
            mockClient.query
                .mockResolvedValueOnce({ rowCount: 0 }) // BEGIN
                .mockResolvedValueOnce({
                    // INSERT result
                    rowCount: 1,
                    rows: [{
                        id: mockObjectId,
                        organization_id: mockOrgId,
                        project_id: mockProjectId,
                        type: 'Application',
                        properties: { name: 'Test' },
                        labels: [],
                        version: 1,
                        canonical_id: 'canonical-123',
                        created_at: new Date(),
                        embedding: null,
                    }],
                })
                .mockResolvedValueOnce({ rowCount: 0 }); // COMMIT
        });

        it('should run SchemaRegistry validation before Type Registry validation', async () => {
            const validationOrder: string[] = [];

            mockSchemaRegistry.getObjectValidator.mockImplementation(async () => {
                validationOrder.push('schema-registry');
                return (data: any) => {
                    validationOrder.push('schema-validator-execute');
                    return false; // Fail schema validation
                };
            });

            mockTypeRegistry.validateObjectData.mockImplementation(async () => {
                validationOrder.push('type-registry');
                return { valid: true };
            });

            await expect(service.createObject(createDto)).rejects.toThrow();

            // Schema registry should run first and fail before type registry is called
            expect(validationOrder).toEqual(['schema-registry', 'schema-validator-execute']);
            expect(mockTypeRegistry.validateObjectData).not.toHaveBeenCalled();
        });

        it('should run Type Registry validation only when SchemaRegistry passes', async () => {
            const validationOrder: string[] = [];

            mockSchemaRegistry.getObjectValidator.mockImplementation(async () => {
                validationOrder.push('schema-registry');
                return (data: any) => {
                    validationOrder.push('schema-validator-execute');
                    return true; // Pass schema validation
                };
            });

            mockTypeRegistry.validateObjectData.mockImplementation(async () => {
                validationOrder.push('type-registry');
                return { valid: true };
            });

            await service.createObject(createDto);

            expect(validationOrder).toEqual([
                'schema-registry',
                'schema-validator-execute',
                'type-registry',
            ]);
        });
    });
});
