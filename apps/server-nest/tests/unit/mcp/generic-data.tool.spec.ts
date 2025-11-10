import { Test, TestingModule } from '@nestjs/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { GenericDataTool } from '../../../src/modules/mcp/tools/generic-data.tool';
import { GraphService } from '../../../src/modules/mcp/../graph/graph.service';
import { SchemaVersionService } from '../../../src/modules/mcp/services/schema-version.service';
import { GraphObjectDto as GraphServiceDto } from '../../../src/modules/mcp/../graph/graph.types';

describe('GenericDataTool', () => {
    let tool: GenericDataTool;
    let mockGraphService: any;
    let mockSchemaVersionService: any;

    beforeEach(async () => {
        // Create mocks
        mockGraphService = {
            searchObjects: vi.fn(),
            getObject: vi.fn(),
            listEdges: vi.fn(),
        };

        mockSchemaVersionService = {
            getSchemaVersion: vi.fn().mockResolvedValue('v1.2.3'),
        };

        // Create testing module
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GenericDataTool,
                { provide: GraphService, useValue: mockGraphService },
                { provide: SchemaVersionService, useValue: mockSchemaVersionService },
            ],
        }).compile();

        tool = module.get<GenericDataTool>(GenericDataTool);

        // Manual DI workaround to ensure mocks are used
        (tool as any).graphService = mockGraphService;
        (tool as any).schemaVersionService = mockSchemaVersionService;
    });

    describe('data_getObjectsByType', () => {
        it('should return objects of specified type with pagination', async () => {
            const mockResults: GraphServiceDto[] = [
                {
                    id: 'company-1-id',
                    type: 'Company',
                    key: 'acme-corp',
                    labels: ['Acme Corporation'],
                    properties: { industry: 'Technology' },
                    created_at: '2025-01-15T10:00:00Z',
                    canonical_id: 'company-1-canonical',
                    version: 1,
                },
                {
                    id: 'company-2-id',
                    type: 'Company',
                    key: 'globex-inc',
                    labels: ['Globex Inc'],
                    properties: { industry: 'Manufacturing' },
                    created_at: '2025-01-16T10:00:00Z',
                    canonical_id: 'company-2-canonical',
                    version: 1,
                },
            ];

            mockGraphService.searchObjects.mockResolvedValue({
                items: mockResults,
                next_cursor: 'cursor-123',
            });

            const result = await tool.data_getObjectsByType({
                type: 'Company',
                limit: 10,
            });

            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
            expect(result.data?.[0]).toMatchObject({
                id: 'company-1-id',
                type_name: 'Company',
                key: 'acme-corp',
                name: 'Acme Corporation',
                properties: { industry: 'Technology' },
            });
            expect(result.data?.[0].metadata?.labels).toEqual(['Acme Corporation']);
            expect(result.metadata?.next_cursor).toBe('cursor-123');
            expect(result.metadata?.total_returned).toBe(2);

            expect(mockGraphService.searchObjects).toHaveBeenCalledWith({
                type: 'Company',
                label: undefined,
                limit: 10,
                cursor: undefined,
            });
        });

        it('should filter objects by label when provided', async () => {
            const mockResults: GraphServiceDto[] = [
                {
                    id: 'doc-1-id',
                    type: 'Document',
                    key: 'invoice-001',
                    labels: ['invoice', 'Q1-2025'],
                    properties: { amount: 1000 },
                    created_at: '2025-01-15T10:00:00Z',
                    canonical_id: 'doc-1-canonical',
                    version: 1,
                },
            ];

            mockGraphService.searchObjects.mockResolvedValue({
                items: mockResults,
                next_cursor: undefined,
            });

            const result = await tool.data_getObjectsByType({
                type: 'Document',
                label: 'invoice',
            });

            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(1);
            expect(result.data?.[0].metadata?.labels).toContain('invoice');

            expect(mockGraphService.searchObjects).toHaveBeenCalledWith({
                type: 'Document',
                label: 'invoice',
                limit: 20, // default
                cursor: undefined,
            });
        });

        it('should use pagination cursor when provided', async () => {
            mockGraphService.searchObjects.mockResolvedValue({
                items: [],
                next_cursor: undefined,
            });

            await tool.data_getObjectsByType({
                type: 'Project',
                cursor: 'page-2-cursor',
                limit: 50,
            });

            expect(mockGraphService.searchObjects).toHaveBeenCalledWith({
                type: 'Project',
                label: undefined,
                limit: 50,
                cursor: 'page-2-cursor',
            });
        });

        it('should cap limit at 100 even if higher value requested', async () => {
            mockGraphService.searchObjects.mockResolvedValue({
                items: [],
                next_cursor: undefined,
            });

            await tool.data_getObjectsByType({
                type: 'Company',
                limit: 500, // exceeds max
            });

            expect(mockGraphService.searchObjects).toHaveBeenCalledWith(
                expect.objectContaining({ limit: 100 })
            );
        });

        it('should handle objects without labels by using key as name', async () => {
            const mockResults: GraphServiceDto[] = [
                {
                    id: 'obj-1-id',
                    type: 'CustomType',
                    key: 'custom-key-123',
                    labels: [], // No labels
                    properties: {},
                    created_at: '2025-01-15T10:00:00Z',
                    canonical_id: 'obj-1-canonical',
                    version: 1,
                },
            ];

            mockGraphService.searchObjects.mockResolvedValue({
                items: mockResults,
                next_cursor: undefined,
            });

            const result = await tool.data_getObjectsByType({
                type: 'CustomType',
            });

            expect(result.success).toBe(true);
            expect(result.data?.[0].name).toBe('custom-key-123'); // Fallback to key
            expect(result.data?.[0].metadata?.labels).toEqual([]);
        });

        it('should return empty array when no objects found', async () => {
            mockGraphService.searchObjects.mockResolvedValue({
                items: [],
                next_cursor: undefined,
            });

            const result = await tool.data_getObjectsByType({
                type: 'NonExistentType',
            });

            expect(result.success).toBe(true);
            expect(result.data).toEqual([]);
            expect(result.metadata?.total_returned).toBe(0);
        });

        it('should handle service errors gracefully', async () => {
            mockGraphService.searchObjects.mockRejectedValue(
                new Error('Database connection failed')
            );

            const result = await tool.data_getObjectsByType({
                type: 'Company',
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Database connection failed');
            expect(result.metadata?.schema_version).toBe('placeholder-version');
        });
    });

    describe('data_getObjectById', () => {
        it('should return object by ID with all properties', async () => {
            const mockObject: GraphServiceDto = {
                id: 'test-obj-id',
                type: 'Company',
                key: 'test-company',
                labels: ['Test Company Inc'],
                properties: {
                    industry: 'Tech',
                    employees: 50,
                    founded: '2020',
                },
                created_at: '2025-01-15T10:00:00Z',
                canonical_id: 'test-canonical',
                version: 2,
            };

            mockGraphService.getObject.mockResolvedValue(mockObject);

            const result = await tool.data_getObjectById({
                id: 'test-obj-id',
            });

            expect(result.success).toBe(true);
            expect(result.data).toMatchObject({
                id: 'test-obj-id',
                type_name: 'Company',
                key: 'test-company',
                name: 'Test Company Inc',
                properties: {
                    industry: 'Tech',
                    employees: 50,
                    founded: '2020',
                },
            });
            expect(result.data?.metadata?.version).toBe(2);
            expect(result.metadata?.schema_version).toBe('v1.2.3');

            expect(mockGraphService.getObject).toHaveBeenCalledWith('test-obj-id');
        });

        it('should handle objects without labels or key by using "Unnamed"', async () => {
            const mockObject: GraphServiceDto = {
                id: 'obj-without-name',
                type: 'UnknownType',
                key: '', // No key
                labels: [], // No labels
                properties: {},
                created_at: '2025-01-15T10:00:00Z',
                canonical_id: 'canonical-id',
                version: 1,
            };

            mockGraphService.getObject.mockResolvedValue(mockObject);

            const result = await tool.data_getObjectById({
                id: 'obj-without-name',
            });

            expect(result.success).toBe(true);
            expect(result.data?.name).toBe('Unnamed'); // Fallback when no labels or key
            expect(result.data?.key).toBe('');
        });

        it('should return error when object not found', async () => {
            mockGraphService.getObject.mockRejectedValue(
                new Error('Object not found')
            );

            const result = await tool.data_getObjectById({
                id: 'non-existent-id',
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Object not found');
            expect(result.metadata?.schema_version).toBe('placeholder-version');
        });

        it('should handle service errors gracefully', async () => {
            mockGraphService.getObject.mockRejectedValue(
                new Error('Internal server error')
            );

            const result = await tool.data_getObjectById({
                id: 'any-id',
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Internal server error');
        });
    });

    describe('data_getRelatedObjects', () => {
        it('should return outgoing related objects with relationship info', async () => {
            const mockEdges = [
                {
                    id: 'edge-1',
                    type: 'works_for',
                    src_id: 'person-1',
                    dst_id: 'company-1',
                },
                {
                    id: 'edge-2',
                    type: 'manages',
                    src_id: 'person-1',
                    dst_id: 'project-1',
                },
            ];

            const mockCompany: GraphServiceDto = {
                id: 'company-1',
                type: 'Company',
                key: 'acme',
                labels: ['Acme Corp'],
                properties: {},
                created_at: '2025-01-15T10:00:00Z',
                canonical_id: 'company-canonical',
                version: 1,
            };

            const mockProject: GraphServiceDto = {
                id: 'project-1',
                type: 'Project',
                key: 'proj-alpha',
                labels: ['Project Alpha'],
                properties: {},
                created_at: '2025-01-16T10:00:00Z',
                canonical_id: 'project-canonical',
                version: 1,
            };

            mockGraphService.listEdges.mockResolvedValue(mockEdges);
            mockGraphService.getObject
                .mockResolvedValueOnce(mockCompany)
                .mockResolvedValueOnce(mockProject);

            const result = await tool.data_getRelatedObjects({
                object_id: 'person-1',
                direction: 'out',
            });

            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
            expect(result.data?.[0]).toMatchObject({
                id: 'company-1',
                type_name: 'Company',
                name: 'Acme Corp',
                relationship_type: 'works_for',
                relationship_direction: 'out',
            });
            expect(result.data?.[1]).toMatchObject({
                id: 'project-1',
                type_name: 'Project',
                name: 'Project Alpha',
                relationship_type: 'manages',
                relationship_direction: 'out',
            });
            expect(result.metadata?.total_returned).toBe(2);

            expect(mockGraphService.listEdges).toHaveBeenCalledWith('person-1', 'out', 20);
        });

        it('should return incoming related objects when direction is "in"', async () => {
            const mockEdges = [
                {
                    id: 'edge-3',
                    type: 'assigned_to',
                    src_id: 'task-1',
                    dst_id: 'person-2',
                },
            ];

            const mockTask: GraphServiceDto = {
                id: 'task-1',
                type: 'Task',
                key: 'task-123',
                labels: ['Review PR'],
                properties: {},
                created_at: '2025-01-15T10:00:00Z',
                canonical_id: 'task-canonical',
                version: 1,
            };

            mockGraphService.listEdges.mockResolvedValue(mockEdges);
            mockGraphService.getObject.mockResolvedValue(mockTask);

            const result = await tool.data_getRelatedObjects({
                object_id: 'person-2',
                direction: 'in',
            });

            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(1);
            expect(result.data?.[0]).toMatchObject({
                id: 'task-1',
                type_name: 'Task',
                relationship_type: 'assigned_to',
                relationship_direction: 'in',
            });

            expect(mockGraphService.listEdges).toHaveBeenCalledWith('person-2', 'in', 20);
        });

        it('should fetch both incoming and outgoing when direction is "both"', async () => {
            const mockOutEdges = [
                {
                    id: 'edge-out',
                    type: 'depends_on',
                    src_id: 'task-1',
                    dst_id: 'task-2',
                },
            ];

            const mockInEdges = [
                {
                    id: 'edge-in',
                    type: 'blocks',
                    src_id: 'task-3',
                    dst_id: 'task-1',
                },
            ];

            const mockTask2: GraphServiceDto = {
                id: 'task-2',
                type: 'Task',
                key: 'dependency',
                labels: ['Dependency Task'],
                properties: {},
                created_at: '2025-01-15T10:00:00Z',
                canonical_id: 'task-2-canonical',
                version: 1,
            };

            const mockTask3: GraphServiceDto = {
                id: 'task-3',
                type: 'Task',
                key: 'blocking',
                labels: ['Blocking Task'],
                properties: {},
                created_at: '2025-01-16T10:00:00Z',
                canonical_id: 'task-3-canonical',
                version: 1,
            };

            mockGraphService.listEdges
                .mockResolvedValueOnce(mockOutEdges) // First call for 'out'
                .mockResolvedValueOnce(mockInEdges);  // Second call for 'in'

            mockGraphService.getObject
                .mockResolvedValueOnce(mockTask2)
                .mockResolvedValueOnce(mockTask3);

            const result = await tool.data_getRelatedObjects({
                object_id: 'task-1',
                direction: 'both', // Default
            });

            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
            expect(result.data?.[0].relationship_direction).toBe('out');
            expect(result.data?.[1].relationship_direction).toBe('in');
            expect(result.metadata?.total_edges).toBe(2);

            // Should call listEdges twice
            expect(mockGraphService.listEdges).toHaveBeenCalledTimes(2);
            expect(mockGraphService.listEdges).toHaveBeenCalledWith('task-1', 'out', 20);
            expect(mockGraphService.listEdges).toHaveBeenCalledWith('task-1', 'in', 20);
        });

        it('should filter by relationship type when specified', async () => {
            const mockEdges = [
                {
                    id: 'edge-1',
                    type: 'assigned_to',
                    src_id: 'task-1',
                    dst_id: 'person-1',
                },
                {
                    id: 'edge-2',
                    type: 'related_to',
                    src_id: 'task-1',
                    dst_id: 'person-2',
                },
            ];

            const mockPerson: GraphServiceDto = {
                id: 'person-1',
                type: 'Person',
                key: 'john-doe',
                labels: ['John Doe'],
                properties: {},
                created_at: '2025-01-15T10:00:00Z',
                canonical_id: 'person-canonical',
                version: 1,
            };

            mockGraphService.listEdges.mockResolvedValue(mockEdges);
            mockGraphService.getObject.mockResolvedValue(mockPerson);

            const result = await tool.data_getRelatedObjects({
                object_id: 'task-1',
                relationship_type: 'assigned_to',
                direction: 'out',
            });

            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(1); // Only 'assigned_to' edges
            expect(result.data?.[0].relationship_type).toBe('assigned_to');
            expect(result.metadata?.total_edges).toBe(2); // Both edges fetched
            expect(result.metadata?.filtered_edges).toBe(1); // Only 1 after filter
        });

        it('should respect custom limit for related objects', async () => {
            const mockEdges = Array.from({ length: 5 }, (_, i) => ({
                id: `edge-${i}`,
                type: 'related_to',
                src_id: 'obj-1',
                dst_id: `obj-${i + 2}`,
            }));

            mockGraphService.listEdges.mockResolvedValue(mockEdges);

            // Mock getObject to return objects for each edge
            for (let i = 0; i < 5; i++) {
                mockGraphService.getObject.mockResolvedValueOnce({
                    id: `obj-${i + 2}`,
                    type: 'Object',
                    key: `key-${i}`,
                    labels: [`Object ${i}`],
                    properties: {},
                    created_at: '2025-01-15T10:00:00Z',
                    canonical_id: `canonical-${i}`,
                    version: 1,
                });
            }

            const result = await tool.data_getRelatedObjects({
                object_id: 'obj-1',
                limit: 3,
            });

            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(3); // Limited to 3
            expect(mockGraphService.listEdges).toHaveBeenCalledWith('obj-1', 'out', 3);
            expect(mockGraphService.listEdges).toHaveBeenCalledWith('obj-1', 'in', 3);
        });

        it('should return empty array when no relationships exist', async () => {
            mockGraphService.listEdges
                .mockResolvedValueOnce([]) // out
                .mockResolvedValueOnce([]); // in

            const result = await tool.data_getRelatedObjects({
                object_id: 'isolated-object',
            });

            expect(result.success).toBe(true);
            expect(result.data).toEqual([]);
            expect(result.metadata?.total_returned).toBe(0);
            expect(result.metadata?.total_edges).toBe(0);
        });

        it('should handle service errors gracefully', async () => {
            mockGraphService.listEdges.mockRejectedValue(
                new Error('Graph traversal failed')
            );

            const result = await tool.data_getRelatedObjects({
                object_id: 'any-object',
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Graph traversal failed');
            expect(result.metadata?.schema_version).toBe('placeholder-version');
        });
    });
});
