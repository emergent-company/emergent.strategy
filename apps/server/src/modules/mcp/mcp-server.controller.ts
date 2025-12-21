import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { SchemaVersionService } from './services/schema-version.service';
import { DatabaseService } from '../../common/database/database.service';

/**
 * JSON-RPC 2.0 Request
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: any;
}

/**
 * JSON-RPC 2.0 Response (Success)
 */
interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: number | string;
  result: any;
}

/**
 * JSON-RPC 2.0 Response (Error)
 */
interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  error: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * JSON-RPC 2.0 Notification (no response expected)
 */
interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

/**
 * MCP Protocol Constants
 */
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-11-25'];
const LATEST_PROTOCOL_VERSION = '2025-11-25';
const SERVER_INFO = {
  name: 'nexus-mcp-server',
  version: '1.0.0',
};

/**
 * JSON-RPC 2.0 Error Codes
 */
const ErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom errors
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32002,
  NOT_FOUND: -32003,
};

/**
 * MCP Server Controller
 *
 * Implements Model Context Protocol (MCP) server using JSON-RPC 2.0.
 *
 * **Supported Methods:**
 * - `initialize` - Lifecycle management, capability negotiation
 * - `tools/list` - List available tools
 * - `tools/call` - Execute a tool
 *
 * **Supported Tools:**
 * - `schema_version` - Get current schema version and metadata
 * - `schema_changelog` - Get schema changes since a version/date
 * - `type_info` - Get information about object types
 * - `list_entity_types` - List all available entity types with instance counts
 * - `query_entities` - Query entity instances by type with pagination
 *
 * **Protocol:** JSON-RPC 2.0 over HTTP POST
 * **Transport:** HTTP (POST requests to /mcp/rpc)
 * **Authentication:** Bearer token via Authorization header
 * **Authorization:** Requires schema:read scope for schema tools
 */
/**
 * Session data stored per client token
 */
interface McpSession {
  initialized: boolean;
  projectId?: string;
}

/**
 * Session data stored per client token
 */
interface McpSession {
  initialized: boolean;
  projectId?: string;
}

@Controller('mcp')
@ApiTags('MCP Server (JSON-RPC 2.0)')
@ApiBearerAuth()
export class McpServerController {
  private sessions = new Map<string, McpSession>(); // Track sessions by token

  constructor(
    private readonly schemaVersionService: SchemaVersionService,
    private readonly db: DatabaseService
  ) {}

  /**
   * Get or create session for a token
   */
  private getSession(token: string): McpSession {
    if (!this.sessions.has(token)) {
      this.sessions.set(token, { initialized: false });
    }
    return this.sessions.get(token)!;
  }

  /**
   * Get project ID from session or request headers
   * Priority: 1. Session (from initialize), 2. X-Project-Id header
   */
  private getProjectId(req: Request): string | undefined {
    const token = this.extractToken(req);
    if (token) {
      const session = this.getSession(token);
      if (session.projectId) {
        return session.projectId;
      }
    }
    return req.headers['x-project-id'] as string | undefined;
  }

  @Post('rpc')
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('schema:read')
  @ApiOperation({
    summary: 'MCP JSON-RPC 2.0 Endpoint',
    description: `
Model Context Protocol (MCP) server endpoint.

**Protocol:** JSON-RPC 2.0
**Methods:** initialize, tools/list, tools/call
**Tools:** schema_version, schema_changelog, type_info, list_entity_types, query_entities

**Project Context:**
Project-specific tools (list_entity_types, query_entities) require a project ID.
You can provide it either:
1. In the initialize params: \`"project_id": "uuid"\`
2. Via X-Project-Id header

**Example Initialize Request (with project):**
\`\`\`json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": {
      "name": "example-client",
      "version": "1.0.0"
    },
    "project_id": "1e37ab78-f4af-4e61-9b71-5e263139525b"
  }
}
\`\`\`

**Example tools/list Request:**
\`\`\`json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
\`\`\`

**Example tools/call Request:**
\`\`\`json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "schema_version",
    "arguments": {}
  }
}
\`\`\`
        `,
  })
  @ApiBody({
    description: 'JSON-RPC 2.0 request',
    schema: {
      type: 'object',
      required: ['jsonrpc', 'method'],
      properties: {
        jsonrpc: {
          type: 'string',
          enum: ['2.0'],
          description: 'JSON-RPC version',
        },
        id: {
          oneOf: [{ type: 'number' }, { type: 'string' }],
          description: 'Request ID (omit for notifications)',
        },
        method: {
          type: 'string',
          enum: [
            'initialize',
            'tools/list',
            'tools/call',
            'notifications/initialized',
          ],
          description: 'RPC method name',
        },
        params: {
          type: 'object',
          description: 'Method parameters',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'JSON-RPC 2.0 response',
    schema: {
      oneOf: [
        {
          // Success response
          type: 'object',
          required: ['jsonrpc', 'id', 'result'],
          properties: {
            jsonrpc: { type: 'string', enum: ['2.0'] },
            id: { oneOf: [{ type: 'number' }, { type: 'string' }] },
            result: { type: 'object' },
          },
        },
        {
          // Error response
          type: 'object',
          required: ['jsonrpc', 'id', 'error'],
          properties: {
            jsonrpc: { type: 'string', enum: ['2.0'] },
            id: {
              oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }],
            },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'number' },
                message: { type: 'string' },
                data: { type: 'object' },
              },
            },
          },
        },
      ],
    },
  })
  async handleRpc(
    @Body() request: JsonRpcRequest | JsonRpcNotification,
    @Req() req: Request
  ): Promise<JsonRpcResponse | void> {
    // Handle notifications (no response expected)
    if (!('id' in request)) {
      await this.handleNotification(request as JsonRpcNotification, req);
      return; // No response for notifications
    }

    const rpcRequest = request as JsonRpcRequest;

    try {
      // Validate JSON-RPC 2.0 structure
      if (rpcRequest.jsonrpc !== '2.0') {
        return this.errorResponse(
          rpcRequest.id || null,
          ErrorCode.INVALID_REQUEST,
          'Invalid JSON-RPC version. Must be "2.0"'
        );
      }

      // Route to method handler
      const result = await this.routeMethod(rpcRequest, req);

      return {
        jsonrpc: '2.0',
        id: rpcRequest.id!,
        result,
      };
    } catch (error) {
      // Handle errors and return JSON-RPC error response
      return this.handleError(rpcRequest.id || null, error, req);
    }
  }

  /**
   * Route JSON-RPC method to appropriate handler
   */
  private async routeMethod(
    request: JsonRpcRequest,
    req: Request
  ): Promise<any> {
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request.params, req);

      case 'tools/list':
        return this.handleToolsList(req);

      case 'tools/call':
        return this.handleToolsCall(request.params, req);

      default:
        throw {
          code: ErrorCode.METHOD_NOT_FOUND,
          message: `Method not found: ${request.method}`,
          data: {
            method: request.method,
            supported_methods: ['initialize', 'tools/list', 'tools/call'],
          },
        };
    }
  }

  /**
   * Handle notifications (no response)
   */
  private async handleNotification(
    notification: JsonRpcNotification,
    req: Request
  ): Promise<void> {
    switch (notification.method) {
      case 'notifications/initialized':
        // Client signals it's ready after initialize
        // Mark client as initialized (session already created in handleInitialize)
        const token = this.extractToken(req);
        if (token) {
          const session = this.getSession(token);
          session.initialized = true;
        }
        break;

      default:
        // Unknown notification - ignore (per JSON-RPC 2.0 spec)
        break;
    }
  }

  /**
   * Handle initialize request
   * MCP lifecycle management - capability negotiation
   * Accepts optional project_id to scope all subsequent calls
   */
  private async handleInitialize(params: any, req: Request): Promise<any> {
    // Validate required params
    if (!params || !params.protocolVersion || !params.clientInfo) {
      throw {
        code: ErrorCode.INVALID_PARAMS,
        message: 'Missing required parameters: protocolVersion, clientInfo',
        data: {
          required: ['protocolVersion', 'clientInfo'],
          received: Object.keys(params || {}),
        },
      };
    }

    // Validate protocol version
    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(params.protocolVersion)) {
      throw {
        code: ErrorCode.INVALID_PARAMS,
        message: `Unsupported protocol version: ${params.protocolVersion}`,
        data: {
          requested: params.protocolVersion,
          supported: SUPPORTED_PROTOCOL_VERSIONS,
        },
      };
    }

    // Store session with optional project_id
    const token = this.extractToken(req);
    if (token) {
      const session = this.getSession(token);
      session.initialized = true;

      // Store project_id if provided in params or header
      if (params.project_id) {
        session.projectId = params.project_id;
      } else if (req.headers['x-project-id']) {
        session.projectId = req.headers['x-project-id'] as string;
      }
    }

    return {
      protocolVersion: params.protocolVersion, // Echo back the client's version
      capabilities: {
        tools: {
          listChanged: false, // We don't send tool list change notifications yet
        },
      },
      serverInfo: SERVER_INFO,
      // Include project context in response if set
      ...(token &&
        this.getSession(token).projectId && {
          projectContext: {
            projectId: this.getSession(token).projectId,
          },
        }),
    };
  }

  /**
   * Handle tools/list request
   * Returns available tools
   */
  private async handleToolsList(req: Request): Promise<any> {
    // Check if client is initialized
    const token = this.extractToken(req);
    if (!token || !this.getSession(token).initialized) {
      throw {
        code: ErrorCode.INVALID_REQUEST,
        message: 'Client must call initialize before tools/list',
        data: {
          hint: 'Call initialize method first to establish session',
        },
      };
    }

    // Check schema:read scope
    this.checkScope(req, 'schema:read');

    return {
      tools: [
        {
          name: 'schema_version',
          description:
            'Get the current schema version and metadata. Returns version hash, timestamp, total types, and relationships.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'schema_changelog',
          description:
            'Get schema changes since a specific version or date. Returns list of changes with timestamps and descriptions.',
          inputSchema: {
            type: 'object',
            properties: {
              since: {
                type: 'string',
                description:
                  'Version number (e.g., "1.2.0") or ISO date (e.g., "2025-10-15T00:00:00Z")',
              },
              limit: {
                type: 'number',
                description:
                  'Maximum number of changes to return (default: 10, max: 100)',
                minimum: 1,
                maximum: 100,
              },
            },
            required: [],
          },
        },
        {
          name: 'type_info',
          description:
            'Get information about available object types in the schema. Can return all types or details for a specific type.',
          inputSchema: {
            type: 'object',
            properties: {
              type_name: {
                type: 'string',
                description:
                  'Specific type name to get details for (optional). If omitted, returns all types.',
              },
            },
            required: [],
          },
        },
        {
          name: 'list_entity_types',
          description:
            'List all available entity types in the knowledge graph with instance counts. Helps discover what entities can be queried.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'query_entities',
          description:
            'Query entity instances by type with pagination and filtering. Returns actual entity data from the knowledge graph.',
          inputSchema: {
            type: 'object',
            properties: {
              type_name: {
                type: 'string',
                description:
                  'Entity type to query (e.g., "Decision", "Project", "Document")',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 10, max: 50)',
                minimum: 1,
                maximum: 50,
                default: 10,
              },
              offset: {
                type: 'number',
                description: 'Pagination offset for results (default: 0)',
                minimum: 0,
                default: 0,
              },
              sort_by: {
                type: 'string',
                description: 'Field to sort by (default: "created_at")',
                enum: ['created_at', 'updated_at', 'name'],
                default: 'created_at',
              },
              sort_order: {
                type: 'string',
                description: 'Sort direction (default: "desc")',
                enum: ['asc', 'desc'],
                default: 'desc',
              },
            },
            required: ['type_name'],
          },
        },
      ],
    };
  }

  /**
   * Handle tools/call request
   * Execute a tool
   */
  private async handleToolsCall(params: any, req: Request): Promise<any> {
    // Check if client is initialized
    const token = this.extractToken(req);
    if (!token || !this.getSession(token).initialized) {
      throw {
        code: ErrorCode.INVALID_REQUEST,
        message: 'Client must call initialize before tools/call',
        data: {
          hint: 'Call initialize method first to establish session',
        },
      };
    }

    // Validate params
    if (!params || !params.name) {
      throw {
        code: ErrorCode.INVALID_PARAMS,
        message: 'Missing required parameter: name',
        data: {
          required: ['name'],
          received: Object.keys(params || {}),
        },
      };
    }

    // Check schema:read scope
    this.checkScope(req, 'schema:read');

    // Route to tool handler
    const toolName = params.name;
    const toolArguments = params.arguments || {};

    switch (toolName) {
      case 'schema_version':
        return this.executeSchemaVersion();

      case 'schema_changelog':
        return this.executeSchemaChangelog(toolArguments);

      case 'type_info':
        return this.executeTypeInfo(toolArguments);

      case 'list_entity_types':
        return this.executeListEntityTypes(req);

      case 'query_entities':
        return this.executeQueryEntities(toolArguments, req);

      default:
        throw {
          code: ErrorCode.METHOD_NOT_FOUND,
          message: `Tool not found: ${toolName}`,
          data: {
            tool: toolName,
            available_tools: [
              'schema_version',
              'schema_changelog',
              'type_info',
              'list_entity_types',
              'query_entities',
            ],
          },
        };
    }
  }

  /**
   * Execute schema_version tool
   */
  private async executeSchemaVersion(): Promise<any> {
    const details = await this.schemaVersionService.getSchemaVersionDetails();

    const result = {
      version: details.version,
      timestamp: details.latest_update || new Date().toISOString(),
      pack_count: details.pack_count,
      cache_hint_ttl: 300,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * Execute schema_changelog tool
   */
  private async executeSchemaChangelog(args: any): Promise<any> {
    // TODO: Implement changelog retrieval in SchemaVersionService
    // For now, return empty changelog
    const limit = Math.min(args.limit || 10, 100);

    const changes: any[] = [
      // Placeholder - will be implemented when SchemaVersionService has changelog support
    ];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              since: args.since || 'beginning',
              limit,
              changes,
              note: 'Changelog retrieval not yet implemented',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Execute type_info tool
   */
  private async executeTypeInfo(args: any): Promise<any> {
    // TODO: Implement type info retrieval
    // For now, return placeholder
    const typeName = args.type_name;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              type_name: typeName || 'all',
              note: 'Type info retrieval not yet implemented',
              hint: 'Will return object type definitions, relationships, and properties',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Execute list_entity_types tool
   * Returns all available entity types with instance counts
   */
  private async executeListEntityTypes(req: Request): Promise<any> {
    // Check data:read scope
    this.checkScope(req, 'data:read');

    const projectId = this.getProjectId(req);

    if (!projectId) {
      throw {
        code: ErrorCode.INVALID_PARAMS,
        message:
          'Project ID is required. Provide project_id in initialize params or X-Project-Id header.',
        data: {
          hint: 'Call initialize with project_id parameter or set X-Project-Id header',
        },
      };
    }

    // Query type registry for available types
    const types = await this.db.runWithTenantContext(projectId, async () => {
      const result = await this.db.query(`
                SELECT 
                    tr.type_name as name,
                    tr.description,
                    COUNT(go.id) as instance_count
                FROM kb.project_object_type_registry tr
                LEFT JOIN kb.graph_objects go ON go.type = tr.type_name AND go.deleted_at IS NULL
                WHERE tr.enabled = true
                GROUP BY tr.type_name, tr.description
                ORDER BY tr.type_name
            `);
      return result.rows;
    });

    const formattedTypes = types.map((t: any) => ({
      name: t.name,
      description: t.description || 'No description',
      count: parseInt(t.instance_count, 10),
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              projectId,
              types: formattedTypes,
              total: formattedTypes.length,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Execute query_entities tool
   * Query entity instances by type with pagination
   */
  private async executeQueryEntities(args: any, req: Request): Promise<any> {
    // Check data:read scope
    this.checkScope(req, 'data:read');

    const projectId = this.getProjectId(req);

    if (!projectId) {
      throw {
        code: ErrorCode.INVALID_PARAMS,
        message:
          'Project ID is required. Provide project_id in initialize params or X-Project-Id header.',
        data: {
          hint: 'Call initialize with project_id parameter or set X-Project-Id header',
        },
      };
    }

    // Validate and extract parameters
    const {
      type_name,
      limit = 10,
      offset = 0,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = args;

    // Validate required parameter
    if (!type_name) {
      throw {
        code: ErrorCode.INVALID_PARAMS,
        message: 'Missing required parameter: type_name',
        data: {
          required: ['type_name'],
          received: Object.keys(args),
        },
      };
    }

    // Validate limits
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const safeOffset = Math.max(0, offset);

    // Validate sort parameters
    const allowedSortFields = ['created_at', 'updated_at', 'name'];
    const allowedSortOrders = ['asc', 'desc'];
    const safeSortBy = allowedSortFields.includes(sort_by)
      ? sort_by
      : 'created_at';
    const safeSortOrder = allowedSortOrders.includes(sort_order?.toLowerCase())
      ? sort_order.toUpperCase()
      : 'DESC';

    // Query entities
    const entities = await this.db.runWithTenantContext(projectId, async () => {
      const result = await this.db.query(
        `
                SELECT 
                    go.id,
                    go.key,
                    go.properties->>'name' as name,
                    go.properties,
                    go.created_at,
                    go.updated_at,
                    go.type as type_name,
                    tr.description as type_description
                FROM kb.graph_objects go
                LEFT JOIN kb.project_object_type_registry tr ON tr.type_name = go.type
                WHERE go.type = $1
                  AND go.deleted_at IS NULL
                ORDER BY go.${safeSortBy} ${safeSortOrder}
                LIMIT $2 OFFSET $3
            `,
        [type_name, safeLimit, safeOffset]
      );

      return result.rows;
    });

    // Get total count
    const countResult = await this.db.runWithTenantContext(
      projectId,
      async () => {
        const result = await this.db.query(
          `
                SELECT COUNT(*) as total
                FROM kb.graph_objects go
                WHERE go.type = $1
                  AND go.deleted_at IS NULL
            `,
          [type_name]
        );

        return parseInt(result.rows[0].total, 10);
      }
    );

    const formattedEntities = entities.map((e: any) => ({
      id: e.id,
      key: e.key,
      name: e.name,
      type: e.type_name,
      properties: e.properties,
      created_at: e.created_at,
      updated_at: e.updated_at,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              projectId,
              entities: formattedEntities,
              pagination: {
                total: countResult,
                limit: safeLimit,
                offset: safeOffset,
                has_more: safeOffset + safeLimit < countResult,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Extract bearer token from request
   */
  private extractToken(req: Request): string | null {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Check if user has required scope
   * Throws error if scope is missing
   */
  private checkScope(req: Request, requiredScope: string): void {
    // Respect SCOPES_DISABLED environment variable (same as ScopesGuard)
    const scopesDisabled = process.env.SCOPES_DISABLED === '1';
    if (scopesDisabled) {
      return; // Bypass scope check when disabled
    }

    // Note: ScopesGuard already validates scopes at the controller level
    // This is an additional check for clarity in MCP context
    const user = (req as any).user;
    if (!user || !user.scopes || !user.scopes.includes(requiredScope)) {
      throw {
        code: ErrorCode.FORBIDDEN,
        message: `Missing required scope: ${requiredScope}`,
        data: {
          required_scope: requiredScope,
          user_scopes: user?.scopes || [],
        },
      };
    }
  }

  /**
   * Create JSON-RPC 2.0 error response
   */
  private errorResponse(
    id: number | string | null,
    code: number,
    message: string,
    data?: any
  ): JsonRpcErrorResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        ...(data && { data }),
      },
    };
  }

  /**
   * Handle errors and convert to JSON-RPC error response
   */
  private handleError(
    id: number | string | null,
    error: any,
    req: Request
  ): JsonRpcErrorResponse {
    // Custom JSON-RPC error (thrown by our handlers)
    if (error.code && error.message) {
      return this.errorResponse(id, error.code, error.message, error.data);
    }

    // NestJS HTTP exceptions
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const response = error.getResponse();

      switch (status) {
        case HttpStatus.UNAUTHORIZED:
          return this.errorResponse(
            id,
            ErrorCode.UNAUTHORIZED,
            'Unauthorized - missing or invalid bearer token',
            { hint: 'Include valid Authorization: Bearer <token> header' }
          );

        case HttpStatus.FORBIDDEN:
          return this.errorResponse(
            id,
            ErrorCode.FORBIDDEN,
            'Forbidden - insufficient permissions',
            typeof response === 'object' ? response : {}
          );

        default:
          return this.errorResponse(
            id,
            ErrorCode.INTERNAL_ERROR,
            'Internal server error',
            {
              status,
              message:
                typeof response === 'string' ? response : 'Unknown error',
            }
          );
      }
    }

    // Unknown error
    console.error('MCP Server Error:', error);
    return this.errorResponse(
      id,
      ErrorCode.INTERNAL_ERROR,
      'Internal server error',
      { message: error.message || 'Unknown error occurred' }
    );
  }
}
