import { Test, TestingModule } from '@nestjs/testing';
import { McpClientService, McpError } from '../../../src/modules/chat/mcp-client.service';
import { AppConfigService } from '../../../src/common/config/config.service';
import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest';

// Mock global fetch
global.fetch = vi.fn();

describe('McpClientService', () => {
    let service: McpClientService;
    let mockFetch: any;

    const mockConfig = {
        serverUrl: 'http://localhost:3001/mcp/rpc',
        authToken: 'test-token-123',
        clientInfo: {
            name: 'nexus-chat',
            version: '1.0.0'
        }
    };

    beforeEach(async () => {
        mockFetch = global.fetch as any;
        vi.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                McpClientService,
                {
                    provide: AppConfigService,
                    useValue: {
                        // Mock config service (not used by client yet)
                    }
                }
            ],
        }).compile();

        service = module.get<McpClientService>(McpClientService);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('initialize', () => {
        it('should send initialize request and handle response', async () => {
            // Mock successful initialize response
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 1,
                    result: {
                        protocolVersion: '2025-06-18',
                        capabilities: {
                            tools: { listChanged: false }
                        },
                        serverInfo: {
                            name: 'nexus-mcp-server',
                            version: '1.0.0'
                        }
                    }
                })
            });

            // Mock notifications/initialized response (no response expected)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 1,
                    result: {
                        protocolVersion: '2025-06-18',
                        capabilities: {
                            tools: { listChanged: false }
                        },
                        serverInfo: {
                            name: 'nexus-mcp-server',
                            version: '1.0.0'
                        }
                    }
                })
            }).mockResolvedValueOnce({
                ok: true,
                json: async () => ({})
            });

            await service.initialize(mockConfig);

            expect(service.isInitialized()).toBe(true);
            expect(service.getServerCapabilities()).toEqual({
                tools: { listChanged: false }
            });

            // Check initialize request
            expect(mockFetch).toHaveBeenNthCalledWith(1, mockConfig.serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${mockConfig.authToken}`
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {
                        protocolVersion: '2025-06-18',
                        capabilities: {
                            sampling: {}
                        },
                        clientInfo: mockConfig.clientInfo
                    }
                })
            });

            // Check notifications/initialized notification
            expect(mockFetch).toHaveBeenNthCalledWith(2, mockConfig.serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${mockConfig.authToken}`
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'notifications/initialized'
                })
            });
        });

        it('should throw on HTTP error', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized'
            });

            await expect(service.initialize(mockConfig)).rejects.toThrow(McpError);
            await expect(service.initialize(mockConfig)).rejects.toMatchObject({
                code: -32603,
                message: 'HTTP 401: Unauthorized'
            });
        });

        it('should throw on JSON-RPC error', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 1,
                    error: {
                        code: -32600,
                        message: 'Invalid request',
                        data: { hint: 'Protocol version not supported' }
                    }
                })
            });

            await expect(service.initialize(mockConfig)).rejects.toThrow(McpError);
            await expect(service.initialize(mockConfig)).rejects.toMatchObject({
                code: -32600,
                message: 'Invalid request',
                data: { hint: 'Protocol version not supported' }
            });
        });

        it('should throw on network error', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            await expect(service.initialize(mockConfig)).rejects.toThrow(McpError);
            await expect(service.initialize(mockConfig)).rejects.toMatchObject({
                code: -32603,
                message: 'Request failed: Network error'
            });
        });
    });

    describe('listTools', () => {
        beforeEach(async () => {
            // Initialize first
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 1,
                    result: {
                        protocolVersion: '2025-06-18',
                        capabilities: { tools: { listChanged: false } },
                        serverInfo: { name: 'test', version: '1.0.0' }
                    }
                })
            }).mockResolvedValueOnce({
                ok: true,
                json: async () => ({})
            });

            await service.initialize(mockConfig);
            mockFetch.mockClear();
        });

        it('should list tools successfully', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 2,
                    result: {
                        tools: [
                            {
                                name: 'schema_version',
                                description: 'Get current schema version',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                    required: []
                                }
                            },
                            {
                                name: 'schema_changelog',
                                description: 'Get schema changes',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        since: { type: 'string' }
                                    },
                                    required: []
                                }
                            }
                        ]
                    }
                })
            });

            const tools = await service.listTools();

            expect(tools).toHaveLength(2);
            expect(tools[0].name).toBe('schema_version');
            expect(tools[1].name).toBe('schema_changelog');

            expect(mockFetch).toHaveBeenCalledWith(mockConfig.serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${mockConfig.authToken}`
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'tools/list'
                })
            });
        });

        it('should throw if not initialized', async () => {
            const newService = new McpClientService(
                {} as AppConfigService
            );

            await expect(newService.listTools()).rejects.toThrow(McpError);
            await expect(newService.listTools()).rejects.toMatchObject({
                code: -32600,
                message: 'MCP client not initialized. Call initialize() first.'
            });
        });
    });

    describe('callTool', () => {
        beforeEach(async () => {
            // Initialize first
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 1,
                    result: {
                        protocolVersion: '2025-06-18',
                        capabilities: { tools: { listChanged: false } },
                        serverInfo: { name: 'test', version: '1.0.0' }
                    }
                })
            }).mockResolvedValueOnce({
                ok: true,
                json: async () => ({})
            });

            await service.initialize(mockConfig);
            mockFetch.mockClear();
        });

        it('should call tool successfully', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 2,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    version: 'abc123',
                                    timestamp: '2025-10-18T00:00:00Z',
                                    pack_count: 5
                                })
                            }
                        ]
                    }
                })
            });

            const result = await service.callTool('schema_version', {});

            expect(result.content).toHaveLength(1);
            expect(result.content[0].type).toBe('text');
            expect(result.content[0].text).toContain('abc123');

            expect(mockFetch).toHaveBeenCalledWith(mockConfig.serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${mockConfig.authToken}`
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'tools/call',
                    params: {
                        name: 'schema_version',
                        arguments: {}
                    }
                })
            });
        });

        it('should call tool with arguments', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 2,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify([
                                    { date: '2025-10-15', change: 'Added Location type' }
                                ])
                            }
                        ]
                    }
                })
            });

            const result = await service.callTool('schema_changelog', {
                since: '2025-10-15',
                limit: 5
            });

            expect(result.content).toHaveLength(1);

            expect(mockFetch).toHaveBeenCalledWith(mockConfig.serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${mockConfig.authToken}`
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'tools/call',
                    params: {
                        name: 'schema_changelog',
                        arguments: {
                            since: '2025-10-15',
                            limit: 5
                        }
                    }
                })
            });
        });

        it('should throw if not initialized', async () => {
            const newService = new McpClientService(
                {} as AppConfigService
            );

            await expect(newService.callTool('schema_version', {})).rejects.toThrow(McpError);
            await expect(newService.callTool('schema_version', {})).rejects.toMatchObject({
                code: -32600,
                message: 'MCP client not initialized. Call initialize() first.'
            });
        });

        it('should handle tool execution errors', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 2,
                    error: {
                        code: -32001,
                        message: 'Tool not found',
                        data: { toolName: 'invalid_tool' }
                    }
                })
            });

            await expect(service.callTool('invalid_tool', {})).rejects.toThrow(McpError);
            await expect(service.callTool('invalid_tool', {})).rejects.toMatchObject({
                code: -32001,
                message: 'Tool not found'
            });
        });
    });

    describe('reset', () => {
        it('should reset client state', async () => {
            // Initialize first
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 1,
                    result: {
                        protocolVersion: '2025-06-18',
                        capabilities: { tools: { listChanged: false } },
                        serverInfo: { name: 'test', version: '1.0.0' }
                    }
                })
            }).mockResolvedValueOnce({
                ok: true,
                json: async () => ({})
            });

            await service.initialize(mockConfig);

            expect(service.isInitialized()).toBe(true);
            expect(service.getServerCapabilities()).toBeTruthy();

            service.reset();

            expect(service.isInitialized()).toBe(false);
            expect(service.getServerCapabilities()).toBeNull();
        });

        it('should allow re-initialization after reset', async () => {
            // First initialization
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 1,
                    result: {
                        protocolVersion: '2025-06-18',
                        capabilities: { tools: { listChanged: false } },
                        serverInfo: { name: 'test', version: '1.0.0' }
                    }
                })
            }).mockResolvedValueOnce({
                ok: true,
                json: async () => ({})
            });

            await service.initialize(mockConfig);

            service.reset();

            // Second initialization
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 1,
                    result: {
                        protocolVersion: '2025-06-18',
                        capabilities: { tools: { listChanged: false } },
                        serverInfo: { name: 'test', version: '1.0.0' }
                    }
                })
            }).mockResolvedValueOnce({
                ok: true,
                json: async () => ({})
            });

            await service.initialize(mockConfig);

            expect(service.isInitialized()).toBe(true);
        });
    });

    describe('request ID generation', () => {
        it('should increment request IDs', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 1,
                    result: {}
                })
            });

            // Initialize (id=1)
            await service.initialize(mockConfig);

            // First request after initialize (id=2)
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 2,
                    result: { tools: [] }
                })
            });

            await service.listTools();

            // Second request (id=3)
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 3,
                    result: { content: [] }
                })
            });

            await service.callTool('test', {});

            // Verify IDs incremented
            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining('"id":1')
                })
            );

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining('"id":2')
                })
            );

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining('"id":3')
                })
            );
        });
    });
});
