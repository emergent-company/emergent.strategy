import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../common/config/config.service';

/**
 * MCP Client Configuration
 */
export interface McpClientConfig {
  serverUrl: string; // e.g., 'http://localhost:3001/mcp/rpc'
  authToken?: string; // Bearer token for authentication
  clientInfo: {
    name: string; // e.g., 'nexus-chat'
    version: string; // e.g., '1.0.0'
  };
}

/**
 * MCP Tool Definition
 */
export interface McpTool {
  name: string; // Tool identifier (e.g., 'schema_version')
  description: string; // Human-readable description
  inputSchema: {
    // JSON Schema for input validation
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * MCP Tool Result
 */
export interface McpToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    uri?: string;
  }>;
}

/**
 * JSON-RPC 2.0 Request
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: any;
}

/**
 * JSON-RPC 2.0 Response
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * JSON-RPC 2.0 Notification (no response)
 */
interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

/**
 * MCP Error
 */
export class McpError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: any
  ) {
    super(message);
    this.name = 'McpError';
  }
}

/**
 * MCP Client Service
 *
 * Implements Model Context Protocol (MCP) client for consuming MCP servers.
 *
 * **Purpose:**
 * - Connect to MCP servers (local or remote)
 * - Discover available tools via tools/list
 * - Execute tools via tools/call
 * - Handle JSON-RPC 2.0 protocol
 * - Manage connection lifecycle (initialize, capability negotiation)
 *
 * **Usage:**
 * ```typescript
 * const client = new McpClientService(config);
 * await client.initialize({
 *   serverUrl: 'http://localhost:3001/mcp/rpc',
 *   authToken: userToken,
 *   clientInfo: { name: 'nexus-chat', version: '1.0.0' }
 * });
 *
 * const tools = await client.listTools();
 * const result = await client.callTool('schema_version', {});
 * ```
 *
 * **Protocol:**
 * - JSON-RPC 2.0 over HTTP POST
 * - Lifecycle: initialize → notifications/initialized → tools/list → tools/call
 * - Error handling: McpError with JSON-RPC error codes
 *
 * **Thread Safety:**
 * - Not thread-safe: Create new instance per request
 * - Do not share instances across concurrent requests
 *
 * @see https://modelcontextprotocol.io/docs/learn/architecture
 */
@Injectable()
export class McpClientService {
  private readonly logger = new Logger(McpClientService.name);
  private requestIdCounter = 0;
  private initialized = false;
  private serverCapabilities: any = null;
  private config?: McpClientConfig;

  constructor(private readonly appConfig: AppConfigService) {}

  /**
   * Initialize connection to MCP server
   *
   * Performs MCP lifecycle management:
   * 1. Send initialize request with protocol version and capabilities
   * 2. Receive server capabilities
   * 3. Send notifications/initialized notification
   *
   * @param config - Client configuration (server URL, auth token, client info)
   * @throws McpError - If initialization fails or protocol version mismatch
   *
   * @example
   * ```typescript
   * await client.initialize({
   *   serverUrl: 'http://localhost:3001/mcp/rpc',
   *   authToken: 'eyJhbGc...',
   *   clientInfo: { name: 'nexus-chat', version: '1.0.0' }
   * });
   * ```
   */
  async initialize(config: McpClientConfig): Promise<void> {
    this.config = config;

    this.logger.debug(`Initializing MCP client for ${config.serverUrl}`);

    try {
      // Step 1: Send initialize request
      const response = await this.sendRequest('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {
          sampling: {}, // We support sampling/complete (future)
        },
        clientInfo: config.clientInfo,
      });

      // Step 2: Store server capabilities
      this.serverCapabilities = response.capabilities;
      this.initialized = true;

      this.logger.debug(
        `MCP client initialized. Server: ${
          response.serverInfo?.name || 'unknown'
        }, ` + `Capabilities: ${JSON.stringify(response.capabilities)}`
      );

      // Step 3: Send initialized notification
      await this.sendNotification('notifications/initialized');

      this.logger.debug('Sent notifications/initialized');
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to initialize MCP client: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * List available tools from MCP server
   *
   * Calls tools/list method to discover available tools.
   *
   * @returns Array of tool definitions with names, descriptions, and input schemas
   * @throws McpError - If not initialized or request fails
   *
   * @example
   * ```typescript
   * const tools = await client.listTools();
   * console.log(tools.map(t => t.name)); // ['schema_version', 'schema_changelog', ...]
   * ```
   */
  async listTools(): Promise<McpTool[]> {
    if (!this.initialized) {
      throw new McpError(
        -32600,
        'MCP client not initialized. Call initialize() first.',
        { hint: 'Call initialize() before listing tools' }
      );
    }

    this.logger.debug('Listing tools from MCP server');

    const response = await this.sendRequest('tools/list');

    this.logger.debug(`Found ${response.tools?.length || 0} tools`);

    return response.tools || [];
  }

  /**
   * Execute a tool on the MCP server
   *
   * Calls tools/call method to execute a tool with arguments.
   *
   * @param toolName - Tool identifier (e.g., 'schema_version')
   * @param toolArguments - Tool arguments matching the tool's inputSchema
   * @returns Tool result with content array
   * @throws McpError - If not initialized, tool not found, or execution fails
   *
   * @example
   * ```typescript
   * const result = await client.callTool('schema_version', {});
   * console.log(result.content[0].text); // '{"version": "abc123", ...}'
   *
   * const changelog = await client.callTool('schema_changelog', {
   *   since: '2025-10-15',
   *   limit: 5
   * });
   * ```
   */
  async callTool(
    toolName: string,
    toolArguments: Record<string, any> = {}
  ): Promise<McpToolResult> {
    if (!this.initialized) {
      throw new McpError(
        -32600,
        'MCP client not initialized. Call initialize() first.',
        { hint: 'Call initialize() before calling tools' }
      );
    }

    this.logger.debug(
      `Calling tool: ${toolName} with args: ${JSON.stringify(toolArguments)}`
    );

    const response = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: toolArguments,
    });

    this.logger.debug(`Tool ${toolName} executed successfully`);

    return response;
  }

  /**
   * Send JSON-RPC 2.0 request to MCP server
   *
   * @param method - RPC method name
   * @param params - Method parameters
   * @returns Response result
   * @throws McpError - If request fails or server returns error
   */
  private async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.config) {
      throw new McpError(-32600, 'Client not configured');
    }

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.nextRequestId(),
      method,
      ...(params && { params }),
    };

    this.logger.debug(
      `Sending JSON-RPC request: ${method} (id: ${request.id})`
    );

    try {
      const response = await fetch(this.config.serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.authToken && {
            Authorization: `Bearer ${this.config.authToken}`,
          }),
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new McpError(
          -32603,
          `HTTP ${response.status}: ${response.statusText}`,
          { status: response.status, statusText: response.statusText }
        );
      }

      const json: JsonRpcResponse = await response.json();

      // Check for JSON-RPC error
      if (json.error) {
        throw new McpError(
          json.error.code,
          json.error.message,
          json.error.data
        );
      }

      return json.result;
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }

      // Network or parsing error
      const err = error as Error;
      throw new McpError(-32603, `Request failed: ${err.message}`, {
        originalError: err.message,
      });
    }
  }

  /**
   * Send JSON-RPC 2.0 notification (no response expected)
   *
   * @param method - Notification method name
   * @param params - Method parameters
   */
  private async sendNotification(method: string, params?: any): Promise<void> {
    if (!this.config) {
      throw new McpError(-32600, 'Client not configured');
    }

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params && { params }),
    };

    this.logger.debug(`Sending JSON-RPC notification: ${method}`);

    try {
      await fetch(this.config.serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.authToken && {
            Authorization: `Bearer ${this.config.authToken}`,
          }),
        },
        body: JSON.stringify(notification),
      });

      // Notifications don't expect a response, so we don't check result
    } catch (error) {
      // Log but don't throw - notifications are fire-and-forget
      const err = error as Error;
      this.logger.warn(`Failed to send notification ${method}: ${err.message}`);
    }
  }

  /**
   * Generate next request ID
   *
   * @returns Unique incrementing request ID
   */
  private nextRequestId(): number {
    return ++this.requestIdCounter;
  }

  /**
   * Check if client is initialized
   *
   * @returns True if initialized, false otherwise
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get server capabilities (after initialization)
   *
   * @returns Server capabilities object or null if not initialized
   */
  getServerCapabilities(): any {
    return this.serverCapabilities;
  }

  /**
   * Reset client state
   *
   * Call this to reset the client for a new connection.
   * Useful for connection pooling or retries.
   */
  reset(): void {
    this.initialized = false;
    this.serverCapabilities = null;
    this.requestIdCounter = 0;
    this.config = undefined;
    this.logger.debug('MCP client reset');
  }
}
