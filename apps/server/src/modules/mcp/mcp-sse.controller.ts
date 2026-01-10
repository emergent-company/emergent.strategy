import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Res,
  Req,
  Headers,
  HttpException,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from '../auth/auth.service';
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
 * JSON-RPC 2.0 Response
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * MCP Protocol Constants
 */
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-11-25'];
const SERVER_INFO = {
  name: 'emergent-mcp-server',
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
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32002,
  NOT_FOUND: -32003,
};

/**
 * SSE Session data
 */
interface SseSession {
  projectId: string;
  userId?: string;
  apiTokenId?: string;
  initialized: boolean;
  res: Response;
}

/**
 * MCP SSE Controller
 *
 * Implements Model Context Protocol (MCP) server using SSE transport.
 * This allows AI agents to connect via Server-Sent Events for real-time communication.
 *
 * **Endpoints:**
 * - `GET /mcp/sse/:projectId` - SSE connection endpoint
 * - `POST /mcp/sse/:projectId/message` - Send JSON-RPC messages to the server
 *
 * **Authentication:** Bearer token via Authorization header (supports API tokens)
 */
@Controller('mcp/sse')
@ApiTags('MCP Server (SSE Transport)')
@ApiBearerAuth()
export class McpSseController {
  private sessions = new Map<string, SseSession>();

  constructor(
    private readonly authService: AuthService,
    private readonly schemaVersionService: SchemaVersionService,
    private readonly db: DatabaseService
  ) {}

  /**
   * SSE Connection Endpoint
   * Clients connect here to establish an SSE stream for receiving messages
   */
  @Get(':projectId')
  @ApiOperation({
    summary: 'MCP SSE Connection',
    description: `
Establish an SSE connection for MCP communication.

**Transport:** Server-Sent Events (SSE)
**Authentication:** Bearer token via Authorization header

After connecting, the server sends an 'endpoint' event with the message URL.
Use that URL to send JSON-RPC requests via POST.

**Example connection:**
\`\`\`
GET /mcp/sse/599c92f7-4fdb-41f8-b26b-ead42f97b1e8
Authorization: Bearer emt_abc123...
Accept: text/event-stream
\`\`\`
    `,
  })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiResponse({ status: 200, description: 'SSE stream established' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async sseConnect(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Headers('authorization') authHeader: string,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    // Validate authentication
    const user = await this.validateAuth(authHeader, projectId);
    if (!user) {
      res.status(401).json({
        error: {
          code: 'unauthorized',
          message: 'Invalid or missing authentication',
        },
      });
      return;
    }

    // Generate session ID
    const sessionId = this.generateSessionId();

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Create session
    const session: SseSession = {
      projectId,
      userId: user.id,
      apiTokenId: user.apiTokenId,
      initialized: false,
      res,
    };
    this.sessions.set(sessionId, session);

    // Send endpoint event (tells client where to POST messages)
    const messageEndpoint = `/mcp/sse/${projectId}/message?sessionId=${sessionId}`;
    this.sendSseEvent(res, 'endpoint', messageEndpoint);

    // Keep connection alive with periodic pings
    const pingInterval = setInterval(() => {
      if (!res.writableEnded) {
        this.sendSseEvent(res, 'ping', new Date().toISOString());
      }
    }, 30000);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(pingInterval);
      this.sessions.delete(sessionId);
    });
  }

  /**
   * Message Endpoint
   * Clients POST JSON-RPC messages here
   */
  @Post(':projectId/message')
  @ApiOperation({
    summary: 'Send MCP Message',
    description: `
Send a JSON-RPC 2.0 message to the MCP server.

**Protocol:** JSON-RPC 2.0
**Methods:** initialize, tools/list, tools/call

The response is sent back via the SSE stream, not as an HTTP response.
    `,
  })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiResponse({ status: 202, description: 'Message accepted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async handleMessage(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Body() request: JsonRpcRequest,
    @Headers('authorization') authHeader: string,
    @Req() req: Request
  ): Promise<{ status: string }> {
    // Get session ID from query
    const sessionId = (req.query as any).sessionId as string;
    const session = sessionId ? this.sessions.get(sessionId) : null;

    // Validate authentication
    const user = await this.validateAuth(authHeader, projectId);
    if (!user) {
      throw new HttpException(
        {
          error: {
            code: 'unauthorized',
            message: 'Invalid or missing authentication',
          },
        },
        HttpStatus.UNAUTHORIZED
      );
    }

    // Process the request
    const response = await this.processRequest(request, projectId, user);

    // If we have a session, send via SSE
    if (session && !session.res.writableEnded) {
      this.sendSseEvent(session.res, 'message', JSON.stringify(response));
    }

    // Also return the response directly (for clients that prefer HTTP response)
    return { status: 'accepted', ...response } as any;
  }

  /**
   * Process JSON-RPC request
   */
  private async processRequest(
    request: JsonRpcRequest,
    projectId: string,
    user: any
  ): Promise<JsonRpcResponse> {
    const id = request.id ?? null;

    try {
      // Validate JSON-RPC structure
      if (request.jsonrpc !== '2.0') {
        return this.errorResponse(
          id,
          ErrorCode.INVALID_REQUEST,
          'Invalid JSON-RPC version'
        );
      }

      // Route to method handler
      const result = await this.routeMethod(request, projectId, user);

      return {
        jsonrpc: '2.0',
        id: id!,
        result,
      };
    } catch (error: any) {
      return this.handleError(id, error);
    }
  }

  /**
   * Route JSON-RPC method to handler
   */
  private async routeMethod(
    request: JsonRpcRequest,
    projectId: string,
    user: any
  ): Promise<any> {
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request.params, projectId);

      case 'tools/list':
        return this.handleToolsList();

      case 'tools/call':
        return this.handleToolsCall(request.params, projectId, user);

      case 'notifications/initialized':
        // Notification - no response needed
        return { acknowledged: true };

      default:
        throw {
          code: ErrorCode.METHOD_NOT_FOUND,
          message: `Method not found: ${request.method}`,
        };
    }
  }

  /**
   * Handle initialize request
   */
  private async handleInitialize(params: any, projectId: string): Promise<any> {
    if (!params?.protocolVersion || !params?.clientInfo) {
      throw {
        code: ErrorCode.INVALID_PARAMS,
        message: 'Missing required parameters: protocolVersion, clientInfo',
      };
    }

    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(params.protocolVersion)) {
      throw {
        code: ErrorCode.INVALID_PARAMS,
        message: `Unsupported protocol version: ${params.protocolVersion}`,
        data: { supported: SUPPORTED_PROTOCOL_VERSIONS },
      };
    }

    return {
      protocolVersion: params.protocolVersion,
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: SERVER_INFO,
      projectContext: { projectId },
    };
  }

  /**
   * Handle tools/list request
   */
  private async handleToolsList(): Promise<any> {
    return {
      tools: [
        {
          name: 'schema_version',
          description: 'Get the current schema version and metadata',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'list_entity_types',
          description: 'List all available entity types with instance counts',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'query_entities',
          description: 'Query entity instances by type with pagination',
          inputSchema: {
            type: 'object',
            properties: {
              type_name: {
                type: 'string',
                description: 'Entity type to query',
              },
              limit: {
                type: 'number',
                description: 'Max results (default: 10, max: 50)',
              },
              offset: {
                type: 'number',
                description: 'Pagination offset (default: 0)',
              },
            },
            required: ['type_name'],
          },
        },
        {
          name: 'search_entities',
          description: 'Search entities by text query',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              type_name: {
                type: 'string',
                description: 'Optional type filter',
              },
              limit: {
                type: 'number',
                description: 'Max results (default: 10)',
              },
            },
            required: ['query'],
          },
        },
      ],
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolsCall(
    params: any,
    projectId: string,
    user: any
  ): Promise<any> {
    if (!params?.name) {
      throw {
        code: ErrorCode.INVALID_PARAMS,
        message: 'Missing required parameter: name',
      };
    }

    const toolName = params.name;
    const args = params.arguments || {};

    switch (toolName) {
      case 'schema_version':
        return this.executeSchemaVersion();

      case 'list_entity_types':
        return this.executeListEntityTypes(projectId);

      case 'query_entities':
        return this.executeQueryEntities(args, projectId);

      case 'search_entities':
        return this.executeSearchEntities(args, projectId);

      default:
        throw {
          code: ErrorCode.METHOD_NOT_FOUND,
          message: `Tool not found: ${toolName}`,
        };
    }
  }

  /**
   * Execute schema_version tool
   */
  private async executeSchemaVersion(): Promise<any> {
    const details = await this.schemaVersionService.getSchemaVersionDetails();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              version: details.version,
              timestamp: details.latest_update || new Date().toISOString(),
              pack_count: details.pack_count,
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
   */
  private async executeListEntityTypes(projectId: string): Promise<any> {
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

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              projectId,
              types: types.map((t: any) => ({
                name: t.name,
                description: t.description || 'No description',
                count: parseInt(t.instance_count, 10),
              })),
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
   */
  private async executeQueryEntities(
    args: any,
    projectId: string
  ): Promise<any> {
    const { type_name, limit = 10, offset = 0 } = args;

    if (!type_name) {
      throw {
        code: ErrorCode.INVALID_PARAMS,
        message: 'Missing required parameter: type_name',
      };
    }

    const safeLimit = Math.min(Math.max(1, limit), 50);
    const safeOffset = Math.max(0, offset);

    const entities = await this.db.runWithTenantContext(projectId, async () => {
      const result = await this.db.query(
        `
        SELECT 
          go.id,
          go.key,
          go.properties->>'name' as name,
          go.properties,
          go.created_at,
          go.type as type_name
        FROM kb.graph_objects go
        WHERE go.type = $1 AND go.deleted_at IS NULL
        ORDER BY go.created_at DESC
        LIMIT $2 OFFSET $3
        `,
        [type_name, safeLimit, safeOffset]
      );
      return result.rows;
    });

    const countResult = await this.db.runWithTenantContext(
      projectId,
      async () => {
        const result = await this.db.query(
          `SELECT COUNT(*) as total FROM kb.graph_objects WHERE type = $1 AND deleted_at IS NULL`,
          [type_name]
        );
        return parseInt(result.rows[0].total, 10);
      }
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              projectId,
              entities: entities.map((e: any) => ({
                id: e.id,
                key: e.key,
                name: e.name,
                type: e.type_name,
                properties: e.properties,
                created_at: e.created_at,
              })),
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
   * Execute search_entities tool
   */
  private async executeSearchEntities(
    args: any,
    projectId: string
  ): Promise<any> {
    const { query, type_name, limit = 10 } = args;

    if (!query) {
      throw {
        code: ErrorCode.INVALID_PARAMS,
        message: 'Missing required parameter: query',
      };
    }

    const safeLimit = Math.min(Math.max(1, limit), 50);

    const entities = await this.db.runWithTenantContext(projectId, async () => {
      let sql = `
        SELECT 
          go.id,
          go.key,
          go.properties->>'name' as name,
          go.properties,
          go.type as type_name
        FROM kb.graph_objects go
        WHERE go.deleted_at IS NULL
          AND (
            go.key ILIKE $1 
            OR go.properties->>'name' ILIKE $1
            OR go.properties->>'description' ILIKE $1
          )
      `;
      const params: any[] = [`%${query}%`];

      if (type_name) {
        sql += ` AND go.type = $2`;
        params.push(type_name);
      }

      sql += ` ORDER BY go.created_at DESC LIMIT $${params.length + 1}`;
      params.push(safeLimit);

      const result = await this.db.query(sql, params);
      return result.rows;
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              projectId,
              query,
              entities: entities.map((e: any) => ({
                id: e.id,
                key: e.key,
                name: e.name,
                type: e.type_name,
                properties: e.properties,
              })),
              count: entities.length,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Validate authentication token
   */
  private async validateAuth(
    authHeader: string | undefined,
    projectId: string
  ): Promise<any | null> {
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);

    try {
      // Use AuthService to validate the token (supports both JWT and API tokens)
      const user = await this.authService.validateToken(token);

      if (!user) {
        return null;
      }

      // For API tokens, verify project access
      if (user.apiTokenProjectId && user.apiTokenProjectId !== projectId) {
        return null; // Token doesn't have access to this project
      }

      return user;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Send SSE event
   */
  private sendSseEvent(res: Response, event: string, data: string): void {
    if (!res.writableEnded) {
      res.write(`event: ${event}\n`);
      res.write(`data: ${data}\n\n`);
    }
  }

  /**
   * Create error response
   */
  private errorResponse(
    id: number | string | null,
    code: number,
    message: string,
    data?: any
  ): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message, ...(data && { data }) },
    };
  }

  /**
   * Handle errors
   */
  private handleError(id: number | string | null, error: any): JsonRpcResponse {
    if (error.code && error.message) {
      return this.errorResponse(id, error.code, error.message, error.data);
    }

    console.error('MCP SSE Error:', error);
    return this.errorResponse(
      id,
      ErrorCode.INTERNAL_ERROR,
      'Internal server error',
      { message: error.message || 'Unknown error' }
    );
  }
}
