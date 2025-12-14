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

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { validateConfig } from './config.js';
import {
  listEndpointsTool,
  listEndpointsSchema,
  ListEndpointsInput,
} from './tools/list-endpoints.js';
import { callApiTool, callApiSchema, CallApiInput } from './tools/call-api.js';

// Validate configuration on startup
const configValidation = validateConfig();
if (!configValidation.valid) {
  console.error('Configuration errors:');
  for (const error of configValidation.errors) {
    console.error(`  - ${error}`);
  }
  console.error('\nPlease ensure all required environment variables are set.');
  process.exit(1);
}

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

// Register available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
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
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

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

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('API Client MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
