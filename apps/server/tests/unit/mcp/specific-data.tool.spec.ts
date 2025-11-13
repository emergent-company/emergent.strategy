import { Test, TestingModule } from '@nestjs/testing';
import { SpecificDataTool } from '../../../src/modules/mcp/tools/specific-data.tool';
import { GraphService } from '../../../src/modules/mcp/../graph/graph.service';
import { SchemaVersionService } from '../../../src/modules/mcp/services/schema-version.service';
import { vi } from 'vitest';

describe('SpecificDataTool', () => {
    let tool: SpecificDataTool;
    let mockGraphService: any;
    let mockSchemaVersionService: any;

    beforeEach(async () => {
        // Create mock services
        mockGraphService = {
            searchObjects: vi.fn(),
            getObject: vi.fn(),
            listEdges: vi.fn(),
        };

        mockSchemaVersionService = {
            getSchemaVersion: vi.fn().mockResolvedValue('test-version-abc'),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SpecificDataTool,
                {
                    provide: GraphService,
                    useValue: mockGraphService,
                },
                {
                    provide: SchemaVersionService,
                    useValue: mockSchemaVersionService,
                },
            ],
        }).compile();

        tool = module.get<SpecificDataTool>(SpecificDataTool);

        // WORKAROUND: Manually assign mocks to fix DI issue
        (tool as any).graphService = mockGraphService;
        (tool as any).schemaVersionService = mockSchemaVersionService;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('data_getPersons', () => {
        it('should return list of persons with default pagination', async () => {
            // Arrange
            const mockPersons = [
                {
                    id: '11111111-1111-1111-1111-111111111111',
                    type: 'Person',
                    key: 'john-doe',
                    labels: ['John Doe'],
                    properties: { email: 'john@example.com', role: 'Developer' },
                    created_at: '2025-01-01T00:00:00Z',
                    canonical_id: 'person-john',
                    version: 1,
                },
                {
                    id: '22222222-2222-2222-2222-222222222222',
                    type: 'Person',
                    key: 'jane-smith',
                    labels: ['Jane Smith'],
                    properties: { email: 'jane@example.com', role: 'Designer' },
                    created_at: '2025-01-02T00:00:00Z',
                    canonical_id: 'person-jane',
                    version: 1,
                },
            ];

            mockGraphService.searchObjects.mockResolvedValue({
                items: mockPersons,
                next_cursor: null,
            });

            // Act
            const result = await tool.getPersons();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);

            expect(result.data![0]).toEqual({
                id: '11111111-1111-1111-1111-111111111111',
                type_name: 'Person',
                key: 'john-doe',
                name: 'John Doe',
                properties: { email: 'john@example.com', role: 'Developer' },
                created_at: '2025-01-01T00:00:00Z',
                updated_at: '2025-01-01T00:00:00Z',
                metadata: {
                    labels: ['John Doe'],
                    canonical_id: 'person-john',
                    version: 1,
                },
            });

            expect(result.metadata?.schema_version).toBe('test-version-abc');
            expect(result.metadata?.count).toBe(2);
            expect(result.metadata?.next_cursor).toBeNull();
            expect(result.metadata?.cached_until).toBeDefined();

            expect(mockGraphService.searchObjects).toHaveBeenCalledWith({
                type: 'Person',
                label: undefined,
                limit: 20,
                cursor: undefined,
            });
        });

        it('should support pagination with limit and cursor', async () => {
            // Arrange
            mockGraphService.searchObjects.mockResolvedValue({
                items: [],
                next_cursor: 'cursor-abc123',
            });

            // Act
            const result = await tool.getPersons({
                limit: 50,
                cursor: 'prev-cursor',
            });

            // Assert
            expect(result.success).toBe(true);
            expect(result.metadata?.next_cursor).toBe('cursor-abc123');
            expect(mockGraphService.searchObjects).toHaveBeenCalledWith({
                type: 'Person',
                label: undefined,
                limit: 50,
                cursor: 'prev-cursor',
            });
        });

        it('should filter by label', async () => {
            // Arrange
            const mockPersons = [
                {
                    id: '11111111-1111-1111-1111-111111111111',
                    type: 'Person',
                    key: 'john-doe',
                    labels: ['John Doe'],
                    properties: {},
                    created_at: '2025-01-01T00:00:00Z',
                    canonical_id: 'person-john',
                    version: 1,
                },
            ];

            mockGraphService.searchObjects.mockResolvedValue({
                items: mockPersons,
                next_cursor: null,
            });

            // Act
            const result = await tool.getPersons({ label: 'John' });

            // Assert
            expect(result.success).toBe(true);
            expect(mockGraphService.searchObjects).toHaveBeenCalledWith({
                type: 'Person',
                label: 'John',
                limit: 20,
                cursor: undefined,
            });
        });

        it('should handle empty results', async () => {
            // Arrange
            mockGraphService.searchObjects.mockResolvedValue({
                items: [],
                next_cursor: null,
            });

            // Act
            const result = await tool.getPersons();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(0);
            expect(result.metadata?.count).toBe(0);
        });

        it('should handle persons without labels', async () => {
            // Arrange
            const mockPersons = [
                {
                    id: '11111111-1111-1111-1111-111111111111',
                    type: 'Person',
                    key: 'person-001',
                    // No labels array
                    properties: {},
                    created_at: '2025-01-01T00:00:00Z',
                    canonical_id: 'person-001',
                    version: 1,
                },
            ];

            mockGraphService.searchObjects.mockResolvedValue({
                items: mockPersons,
                next_cursor: null,
            });

            // Act
            const result = await tool.getPersons();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data![0].name).toBe('person-001'); // Falls back to key
            expect(result.data![0].metadata?.labels).toEqual([]);
        });

        it('should return error when service fails', async () => {
            // Arrange
            mockGraphService.searchObjects.mockRejectedValue(
                new Error('Database connection failed')
            );

            // Act
            const result = await tool.getPersons();

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Database connection failed');
        });
    });

    describe('data_getPerson', () => {
        it('should return person by ID', async () => {
            // Arrange
            const mockPerson = {
                id: '11111111-1111-1111-1111-111111111111',
                type: 'Person',
                key: 'john-doe',
                labels: ['John Doe'],
                properties: { email: 'john@example.com' },
                created_at: '2025-01-01T00:00:00Z',
                canonical_id: 'person-john',
                version: 1,
            };

            mockGraphService.getObject.mockResolvedValue(mockPerson);

            // Act
            const result = await tool.getPerson({
                id: '11111111-1111-1111-1111-111111111111',
            });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('11111111-1111-1111-1111-111111111111');
            expect(result.data?.type_name).toBe('Person');
            expect(result.data?.name).toBe('John Doe');
            expect(result.metadata?.schema_version).toBe('test-version-abc');
            expect(mockGraphService.getObject).toHaveBeenCalledWith(
                '11111111-1111-1111-1111-111111111111'
            );
        });

        it('should return error when object is not a Person', async () => {
            // Arrange
            const mockTask = {
                id: '11111111-1111-1111-1111-111111111111',
                type: 'Task',
                key: 'task-001',
                labels: ['Task 1'],
                properties: {},
                created_at: '2025-01-01T00:00:00Z',
                canonical_id: 'task-001',
                version: 1,
            };

            mockGraphService.getObject.mockResolvedValue(mockTask);

            // Act
            const result = await tool.getPerson({
                id: '11111111-1111-1111-1111-111111111111',
            });

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe(
                'Object 11111111-1111-1111-1111-111111111111 is not a Person (type: Task)'
            );
        });

        it('should return error when object not found', async () => {
            // Arrange
            mockGraphService.getObject.mockRejectedValue(
                new Error('Object not found')
            );

            // Act
            const result = await tool.getPerson({
                id: '99999999-9999-9999-9999-999999999999',
            });

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Object not found');
        });

        it('should handle person without labels or key', async () => {
            // Arrange
            const mockPerson = {
                id: '11111111-1111-1111-1111-111111111111',
                type: 'Person',
                // No key, no labels
                properties: {},
                created_at: '2025-01-01T00:00:00Z',
                canonical_id: 'person-unknown',
                version: 1,
            };

            mockGraphService.getObject.mockResolvedValue(mockPerson);

            // Act
            const result = await tool.getPerson({
                id: '11111111-1111-1111-1111-111111111111',
            });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data?.name).toBe('Unnamed'); // Fallback to 'Unnamed'
            expect(result.data?.key).toBe('');
        });
    });

    describe('data_getTasks', () => {
        it('should return list of tasks with default pagination', async () => {
            // Arrange
            const mockTasks = [
                {
                    id: '33333333-3333-3333-3333-333333333333',
                    type: 'Task',
                    key: 'task-001',
                    labels: ['Implement feature X'],
                    properties: { status: 'in_progress', priority: 'high' },
                    created_at: '2025-01-05T00:00:00Z',
                    canonical_id: 'task-001',
                    version: 1,
                },
                {
                    id: '44444444-4444-4444-4444-444444444444',
                    type: 'Task',
                    key: 'task-002',
                    labels: ['Fix bug Y'],
                    properties: { status: 'todo', priority: 'medium' },
                    created_at: '2025-01-06T00:00:00Z',
                    canonical_id: 'task-002',
                    version: 1,
                },
            ];

            mockGraphService.searchObjects.mockResolvedValue({
                items: mockTasks,
                next_cursor: null,
            });

            // Act
            const result = await tool.getTasks();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);

            expect(result.data![0]).toEqual({
                id: '33333333-3333-3333-3333-333333333333',
                type_name: 'Task',
                key: 'task-001',
                name: 'Implement feature X',
                properties: { status: 'in_progress', priority: 'high' },
                created_at: '2025-01-05T00:00:00Z',
                updated_at: '2025-01-05T00:00:00Z',
                metadata: {
                    labels: ['Implement feature X'],
                    canonical_id: 'task-001',
                    version: 1,
                },
            });

            expect(result.metadata?.schema_version).toBe('test-version-abc');
            expect(result.metadata?.count).toBe(2);
            expect(mockGraphService.searchObjects).toHaveBeenCalledWith({
                type: 'Task',
                label: undefined,
                limit: 20,
                cursor: undefined,
            });
        });

        it('should support pagination with limit and cursor', async () => {
            // Arrange
            mockGraphService.searchObjects.mockResolvedValue({
                items: [],
                next_cursor: 'cursor-xyz789',
            });

            // Act
            const result = await tool.getTasks({
                limit: 100,
                cursor: 'prev-cursor',
            });

            // Assert
            expect(result.success).toBe(true);
            expect(result.metadata?.next_cursor).toBe('cursor-xyz789');
            expect(mockGraphService.searchObjects).toHaveBeenCalledWith({
                type: 'Task',
                label: undefined,
                limit: 100,
                cursor: 'prev-cursor',
            });
        });

        it('should filter by label', async () => {
            // Arrange
            mockGraphService.searchObjects.mockResolvedValue({
                items: [],
                next_cursor: null,
            });

            // Act
            const result = await tool.getTasks({ label: 'bug' });

            // Assert
            expect(result.success).toBe(true);
            expect(mockGraphService.searchObjects).toHaveBeenCalledWith({
                type: 'Task',
                label: 'bug',
                limit: 20,
                cursor: undefined,
            });
        });

        it('should handle empty results', async () => {
            // Arrange
            mockGraphService.searchObjects.mockResolvedValue({
                items: [],
                next_cursor: null,
            });

            // Act
            const result = await tool.getTasks();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(0);
            expect(result.metadata?.count).toBe(0);
        });

        it('should return error when service fails', async () => {
            // Arrange
            mockGraphService.searchObjects.mockRejectedValue(
                new Error('Query timeout')
            );

            // Act
            const result = await tool.getTasks();

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Query timeout');
        });
    });

    describe('data_getTask', () => {
        it('should return task by ID', async () => {
            // Arrange
            const mockTask = {
                id: '33333333-3333-3333-3333-333333333333',
                type: 'Task',
                key: 'task-001',
                labels: ['Implement feature X'],
                properties: { status: 'done' },
                created_at: '2025-01-05T00:00:00Z',
                canonical_id: 'task-001',
                version: 2,
            };

            mockGraphService.getObject.mockResolvedValue(mockTask);

            // Act
            const result = await tool.getTask({
                id: '33333333-3333-3333-3333-333333333333',
            });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('33333333-3333-3333-3333-333333333333');
            expect(result.data?.type_name).toBe('Task');
            expect(result.data?.name).toBe('Implement feature X');
            expect(result.data?.metadata?.version).toBe(2);
            expect(result.metadata?.schema_version).toBe('test-version-abc');
            expect(mockGraphService.getObject).toHaveBeenCalledWith(
                '33333333-3333-3333-3333-333333333333'
            );
        });

        it('should return error when object is not a Task', async () => {
            // Arrange
            const mockPerson = {
                id: '33333333-3333-3333-3333-333333333333',
                type: 'Person',
                key: 'john-doe',
                labels: ['John'],
                properties: {},
                created_at: '2025-01-01T00:00:00Z',
                canonical_id: 'person-john',
                version: 1,
            };

            mockGraphService.getObject.mockResolvedValue(mockPerson);

            // Act
            const result = await tool.getTask({
                id: '33333333-3333-3333-3333-333333333333',
            });

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe(
                'Object 33333333-3333-3333-3333-333333333333 is not a Task (type: Person)'
            );
        });

        it('should return error when object not found', async () => {
            // Arrange
            mockGraphService.getObject.mockRejectedValue(
                new Error('Not found')
            );

            // Act
            const result = await tool.getTask({
                id: '99999999-9999-9999-9999-999999999999',
            });

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Not found');
        });
    });

    describe('data_getTaskAssignees', () => {
        it('should return persons assigned to task', async () => {
            // Arrange
            const mockEdges = [
                {
                    id: 'edge-1',
                    type: 'assigned_to',
                    src_id: '33333333-3333-3333-3333-333333333333',
                    dst_id: '11111111-1111-1111-1111-111111111111',
                },
                {
                    id: 'edge-2',
                    type: 'assigned_to',
                    src_id: '33333333-3333-3333-3333-333333333333',
                    dst_id: '22222222-2222-2222-2222-222222222222',
                },
            ];

            const mockPersons = [
                {
                    id: '11111111-1111-1111-1111-111111111111',
                    type: 'Person',
                    key: 'john-doe',
                    labels: ['John Doe'],
                    properties: {},
                    created_at: '2025-01-01T00:00:00Z',
                    canonical_id: 'person-john',
                    version: 1,
                },
                {
                    id: '22222222-2222-2222-2222-222222222222',
                    type: 'Person',
                    key: 'jane-smith',
                    labels: ['Jane Smith'],
                    properties: {},
                    created_at: '2025-01-02T00:00:00Z',
                    canonical_id: 'person-jane',
                    version: 1,
                },
            ];

            mockGraphService.listEdges.mockResolvedValue(mockEdges);
            mockGraphService.getObject
                .mockResolvedValueOnce(mockPersons[0])
                .mockResolvedValueOnce(mockPersons[1]);

            // Act
            const result = await tool.getTaskAssignees({
                task_id: '33333333-3333-3333-3333-333333333333',
            });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
            expect(result.data?.map(p => p.name)).toEqual(['John Doe', 'Jane Smith']);
            expect(result.metadata?.count).toBe(2);
            expect(result.metadata?.schema_version).toBe('test-version-abc');
            expect(mockGraphService.listEdges).toHaveBeenCalledWith(
                '33333333-3333-3333-3333-333333333333',
                'out',
                50
            );
        });

        it('should filter to only assigned_to relationships', async () => {
            // Arrange
            const mockEdges = [
                {
                    id: 'edge-1',
                    type: 'assigned_to',
                    src_id: '33333333-3333-3333-3333-333333333333',
                    dst_id: '11111111-1111-1111-1111-111111111111',
                },
                {
                    id: 'edge-2',
                    type: 'related_to',
                    src_id: '33333333-3333-3333-3333-333333333333',
                    dst_id: '22222222-2222-2222-2222-222222222222',
                },
            ];

            const mockPerson = {
                id: '11111111-1111-1111-1111-111111111111',
                type: 'Person',
                key: 'john-doe',
                labels: ['John Doe'],
                properties: {},
                created_at: '2025-01-01T00:00:00Z',
                canonical_id: 'person-john',
                version: 1,
            };

            mockGraphService.listEdges.mockResolvedValue(mockEdges);
            mockGraphService.getObject.mockResolvedValue(mockPerson);

            // Act
            const result = await tool.getTaskAssignees({
                task_id: '33333333-3333-3333-3333-333333333333',
            });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(1);
            expect(result.data![0].name).toBe('John Doe');
            expect(mockGraphService.getObject).toHaveBeenCalledTimes(1);
        });

        it('should skip deleted or non-Person targets', async () => {
            // Arrange
            const mockEdges = [
                {
                    id: 'edge-1',
                    type: 'assigned_to',
                    src_id: '33333333-3333-3333-3333-333333333333',
                    dst_id: '11111111-1111-1111-1111-111111111111',
                },
                {
                    id: 'edge-2',
                    type: 'assigned_to',
                    src_id: '33333333-3333-3333-3333-333333333333',
                    dst_id: '99999999-9999-9999-9999-999999999999', // Deleted
                },
            ];

            const mockPerson = {
                id: '11111111-1111-1111-1111-111111111111',
                type: 'Person',
                key: 'john-doe',
                labels: ['John Doe'],
                properties: {},
                created_at: '2025-01-01T00:00:00Z',
                canonical_id: 'person-john',
                version: 1,
            };

            mockGraphService.listEdges.mockResolvedValue(mockEdges);
            mockGraphService.getObject
                .mockResolvedValueOnce(mockPerson)
                .mockRejectedValueOnce(new Error('Not found'));

            // Act
            const result = await tool.getTaskAssignees({
                task_id: '33333333-3333-3333-3333-333333333333',
            });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(1);
            expect(result.data![0].name).toBe('John Doe');
        });

        it('should support custom limit', async () => {
            // Arrange
            mockGraphService.listEdges.mockResolvedValue([]);

            // Act
            const result = await tool.getTaskAssignees({
                task_id: '33333333-3333-3333-3333-333333333333',
                limit: 100,
            });

            // Assert
            expect(result.success).toBe(true);
            expect(mockGraphService.listEdges).toHaveBeenCalledWith(
                '33333333-3333-3333-3333-333333333333',
                'out',
                100
            );
        });

        it('should handle empty assignees', async () => {
            // Arrange
            mockGraphService.listEdges.mockResolvedValue([]);

            // Act
            const result = await tool.getTaskAssignees({
                task_id: '33333333-3333-3333-3333-333333333333',
            });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(0);
            expect(result.metadata?.count).toBe(0);
        });

        it('should return error when service fails', async () => {
            // Arrange
            mockGraphService.listEdges.mockRejectedValue(
                new Error('Graph query failed')
            );

            // Act
            const result = await tool.getTaskAssignees({
                task_id: '33333333-3333-3333-3333-333333333333',
            });

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Graph query failed');
        });
    });

    describe('data_getPersonTasks', () => {
        it('should return tasks assigned to person', async () => {
            // Arrange
            const mockEdges = [
                {
                    id: 'edge-1',
                    type: 'assigned_to',
                    src_id: '33333333-3333-3333-3333-333333333333',
                    dst_id: '11111111-1111-1111-1111-111111111111',
                },
                {
                    id: 'edge-2',
                    type: 'assigned_to',
                    src_id: '44444444-4444-4444-4444-444444444444',
                    dst_id: '11111111-1111-1111-1111-111111111111',
                },
            ];

            const mockTasks = [
                {
                    id: '33333333-3333-3333-3333-333333333333',
                    type: 'Task',
                    key: 'task-001',
                    labels: ['Task 1'],
                    properties: {},
                    created_at: '2025-01-05T00:00:00Z',
                    canonical_id: 'task-001',
                    version: 1,
                },
                {
                    id: '44444444-4444-4444-4444-444444444444',
                    type: 'Task',
                    key: 'task-002',
                    labels: ['Task 2'],
                    properties: {},
                    created_at: '2025-01-06T00:00:00Z',
                    canonical_id: 'task-002',
                    version: 1,
                },
            ];

            mockGraphService.listEdges.mockResolvedValue(mockEdges);
            mockGraphService.getObject
                .mockResolvedValueOnce(mockTasks[0])
                .mockResolvedValueOnce(mockTasks[1]);

            // Act
            const result = await tool.getPersonTasks({
                person_id: '11111111-1111-1111-1111-111111111111',
            });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
            expect(result.data?.map(t => t.name)).toEqual(['Task 1', 'Task 2']);
            expect(result.metadata?.count).toBe(2);
            expect(result.metadata?.schema_version).toBe('test-version-abc');
            expect(mockGraphService.listEdges).toHaveBeenCalledWith(
                '11111111-1111-1111-1111-111111111111',
                'in',
                50
            );
        });

        it('should filter to only assigned_to relationships', async () => {
            // Arrange
            const mockEdges = [
                {
                    id: 'edge-1',
                    type: 'assigned_to',
                    src_id: '33333333-3333-3333-3333-333333333333',
                    dst_id: '11111111-1111-1111-1111-111111111111',
                },
                {
                    id: 'edge-2',
                    type: 'created_by',
                    src_id: '44444444-4444-4444-4444-444444444444',
                    dst_id: '11111111-1111-1111-1111-111111111111',
                },
            ];

            const mockTask = {
                id: '33333333-3333-3333-3333-333333333333',
                type: 'Task',
                key: 'task-001',
                labels: ['Task 1'],
                properties: {},
                created_at: '2025-01-05T00:00:00Z',
                canonical_id: 'task-001',
                version: 1,
            };

            mockGraphService.listEdges.mockResolvedValue(mockEdges);
            mockGraphService.getObject.mockResolvedValue(mockTask);

            // Act
            const result = await tool.getPersonTasks({
                person_id: '11111111-1111-1111-1111-111111111111',
            });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(1);
            expect(result.data![0].name).toBe('Task 1');
            expect(mockGraphService.getObject).toHaveBeenCalledTimes(1);
        });

        it('should skip deleted or non-Task sources', async () => {
            // Arrange
            const mockEdges = [
                {
                    id: 'edge-1',
                    type: 'assigned_to',
                    src_id: '33333333-3333-3333-3333-333333333333',
                    dst_id: '11111111-1111-1111-1111-111111111111',
                },
                {
                    id: 'edge-2',
                    type: 'assigned_to',
                    src_id: '99999999-9999-9999-9999-999999999999', // Deleted
                    dst_id: '11111111-1111-1111-1111-111111111111',
                },
            ];

            const mockTask = {
                id: '33333333-3333-3333-3333-333333333333',
                type: 'Task',
                key: 'task-001',
                labels: ['Task 1'],
                properties: {},
                created_at: '2025-01-05T00:00:00Z',
                canonical_id: 'task-001',
                version: 1,
            };

            mockGraphService.listEdges.mockResolvedValue(mockEdges);
            mockGraphService.getObject
                .mockResolvedValueOnce(mockTask)
                .mockRejectedValueOnce(new Error('Not found'));

            // Act
            const result = await tool.getPersonTasks({
                person_id: '11111111-1111-1111-1111-111111111111',
            });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(1);
            expect(result.data![0].name).toBe('Task 1');
        });

        it('should support custom limit', async () => {
            // Arrange
            mockGraphService.listEdges.mockResolvedValue([]);

            // Act
            const result = await tool.getPersonTasks({
                person_id: '11111111-1111-1111-1111-111111111111',
                limit: 100,
            });

            // Assert
            expect(result.success).toBe(true);
            expect(mockGraphService.listEdges).toHaveBeenCalledWith(
                '11111111-1111-1111-1111-111111111111',
                'in',
                100
            );
        });

        it('should handle empty tasks', async () => {
            // Arrange
            mockGraphService.listEdges.mockResolvedValue([]);

            // Act
            const result = await tool.getPersonTasks({
                person_id: '11111111-1111-1111-1111-111111111111',
            });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(0);
            expect(result.metadata?.count).toBe(0);
        });

        it('should return error when service fails', async () => {
            // Arrange
            mockGraphService.listEdges.mockRejectedValue(
                new Error('Graph traversal failed')
            );

            // Act
            const result = await tool.getPersonTasks({
                person_id: '11111111-1111-1111-1111-111111111111',
            });

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Graph traversal failed');
        });
    });
});
