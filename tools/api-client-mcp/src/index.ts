#!/usr/bin/env node
/**
 * API Client MCP Server
 *
 * Provides tools for calling the Emergent API with automatic authentication.
 *
 * Tools:
 * - list_endpoints: List available API endpoints from the OpenAPI spec
 * - call_api: Make API requests with automatic OAuth token management
 *
 * Configuration:
 * - Reads credentials from .env and .env.local files
 * - TEST_USER_EMAIL, TEST_USER_PASSWORD: User credentials for password grant
 * - ZITADEL_ISSUER, ZITADEL_OAUTH_CLIENT_ID: Zitadel configuration
 * - SERVER_URL or SERVER_PORT: API server location
 */

import fs from 'fs';

// =============================================================================
// DEBUG LOGGING - writes to file since stderr might be captured by MCP
// =============================================================================
const DEBUG_LOG_PATH = '/tmp/api-client-mcp-debug.log';

function debugLog(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  let logLine = `[${timestamp}] ${message}`;
  if (data !== undefined) {
    logLine += ` ${JSON.stringify(data, null, 2)}`;
  }
  logLine += '\n';

  try {
    fs.appendFileSync(DEBUG_LOG_PATH, logLine);
  } catch {
    // Ignore write errors
  }

  // Also write to stderr for immediate visibility
  console.error(`[DEBUG] ${message}`);
}

// Clear previous debug log
try {
  fs.writeFileSync(
    DEBUG_LOG_PATH,
    `=== API Client MCP Debug Log ===\nStarted: ${new Date().toISOString()}\n\n`
  );
} catch {
  // Ignore
}

debugLog('Process starting', {
  pid: process.pid,
  cwd: process.cwd(),
  argv: process.argv,
  nodeVersion: process.version,
  env: {
    USE_STATIC_TOKEN: process.env.USE_STATIC_TOKEN,
    TEST_USER_EMAIL: process.env.TEST_USER_EMAIL ? '[SET]' : '[NOT SET]',
    TEST_USER_PASSWORD: process.env.TEST_USER_PASSWORD ? '[SET]' : '[NOT SET]',
    ZITADEL_ISSUER: process.env.ZITADEL_ISSUER ? '[SET]' : '[NOT SET]',
    ZITADEL_OAUTH_CLIENT_ID: process.env.ZITADEL_OAUTH_CLIENT_ID
      ? '[SET]'
      : '[NOT SET]',
  },
});

// =============================================================================
// IMPORTS - wrapped in try/catch for debugging
// =============================================================================
debugLog('Loading MCP SDK...');

let Server: typeof import('@modelcontextprotocol/sdk/server/index.js').Server;
let StdioServerTransport: typeof import('@modelcontextprotocol/sdk/server/stdio.js').StdioServerTransport;
let CallToolRequestSchema: typeof import('@modelcontextprotocol/sdk/types.js').CallToolRequestSchema;
let ListToolsRequestSchema: typeof import('@modelcontextprotocol/sdk/types.js').ListToolsRequestSchema;

try {
  const serverModule = await import(
    '@modelcontextprotocol/sdk/server/index.js'
  );
  Server = serverModule.Server;
  debugLog('Loaded server module');

  const stdioModule = await import('@modelcontextprotocol/sdk/server/stdio.js');
  StdioServerTransport = stdioModule.StdioServerTransport;
  debugLog('Loaded stdio transport module');

  const typesModule = await import('@modelcontextprotocol/sdk/types.js');
  CallToolRequestSchema = typesModule.CallToolRequestSchema;
  ListToolsRequestSchema = typesModule.ListToolsRequestSchema;
  debugLog('Loaded types module');
} catch (error) {
  debugLog('FATAL: Failed to load MCP SDK', {
    error: String(error),
    stack: (error as Error).stack,
  });
  process.exit(1);
}

debugLog('Loading local modules...');

let validateConfig: typeof import('./config.js').validateConfig;
let listEndpointsTool: typeof import('./tools/list-endpoints.js').listEndpointsTool;
let listEndpointsSchema: typeof import('./tools/list-endpoints.js').listEndpointsSchema;
let callApiTool: typeof import('./tools/call-api.js').callApiTool;
let callApiSchema: typeof import('./tools/call-api.js').callApiSchema;

type ListEndpointsInput =
  import('./tools/list-endpoints.js').ListEndpointsInput;
type CallApiInput = import('./tools/call-api.js').CallApiInput;

try {
  const configModule = await import('./config.js');
  validateConfig = configModule.validateConfig;
  debugLog('Loaded config module');

  const listEndpointsModule = await import('./tools/list-endpoints.js');
  listEndpointsTool = listEndpointsModule.listEndpointsTool;
  listEndpointsSchema = listEndpointsModule.listEndpointsSchema;
  debugLog('Loaded list-endpoints module');

  const callApiModule = await import('./tools/call-api.js');
  callApiTool = callApiModule.callApiTool;
  callApiSchema = callApiModule.callApiSchema;
  debugLog('Loaded call-api module');
} catch (error) {
  debugLog('FATAL: Failed to load local modules', {
    error: String(error),
    stack: (error as Error).stack,
  });
  process.exit(1);
}

// =============================================================================
// CONFIGURATION VALIDATION
// =============================================================================
debugLog('Validating configuration...');

const configValidation = validateConfig();
debugLog('Config validation result', configValidation);

if (!configValidation.valid) {
  debugLog('FATAL: Configuration invalid', { errors: configValidation.errors });
  console.error('Configuration errors:');
  for (const error of configValidation.errors) {
    console.error(`  - ${error}`);
  }
  console.error('\nPlease ensure all required environment variables are set.');
  process.exit(1);
}

debugLog('Configuration valid');

// =============================================================================
// SERVER SETUP
// =============================================================================
debugLog('Creating MCP server...');

const server = new Server(
  {
    name: 'api-client-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

debugLog('MCP server created');

// Register available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  debugLog('Handling ListTools request');
  const response = {
    tools: [
      {
        name: 'list_endpoints',
        description:
          'List available API endpoints from the OpenAPI specification. Use this to discover what endpoints are available before calling them. Supports filtering by path, operation ID, summary, or tags.',
        inputSchema: listEndpointsSchema,
      },
      {
        name: 'call_api',
        description:
          'Make an authenticated API request. Handles OAuth token acquisition and refresh automatically. Supports GET, POST, PUT, PATCH, DELETE methods with path parameters, query parameters, and JSON request bodies.',
        inputSchema: callApiSchema,
      },
    ],
  };
  debugLog('ListTools response ready', { toolCount: response.tools.length });
  return response;
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  debugLog('Handling CallTool request', { name, args });

  try {
    let result: string;

    switch (name) {
      case 'list_endpoints':
        result = await listEndpointsTool((args ?? {}) as ListEndpointsInput);
        break;

      case 'call_api':
        if (
          !args ||
          typeof args !== 'object' ||
          !('method' in args) ||
          !('path' in args)
        ) {
          throw new Error('method and path parameters are required');
        }
        result = await callApiTool({
          method: String(args.method),
          path: String(args.path),
          pathParams: args.pathParams as Record<string, string> | undefined,
          queryParams: args.queryParams as Record<string, string> | undefined,
          body: args.body,
        } as CallApiInput);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    debugLog('Tool call successful', { name, resultLength: result.length });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debugLog('Tool call failed', { name, error: message });
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// =============================================================================
// ERROR HANDLERS
// =============================================================================
process.on('uncaughtException', (error) => {
  debugLog('UNCAUGHT EXCEPTION', { error: String(error), stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  debugLog('UNHANDLED REJECTION', { reason: String(reason) });
});

process.on('SIGTERM', () => {
  debugLog('Received SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  debugLog('Received SIGINT');
  process.exit(0);
});

// =============================================================================
// START SERVER
// =============================================================================
debugLog('Starting server...');

async function main() {
  debugLog('Creating StdioServerTransport...');
  const transport = new StdioServerTransport();

  debugLog('Connecting server to transport...');
  await server.connect(transport);

  debugLog('Server connected and ready');
  console.error('API Client MCP server running on stdio');
}

main().catch((error) => {
  debugLog('FATAL: main() failed', {
    error: String(error),
    stack: (error as Error).stack,
  });
  console.error('Fatal error:', error);
  process.exit(1);
});
