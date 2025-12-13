#!/usr/bin/env node
/**
 * Workspace MCP Server
 *
 * Provides tools for workspace health monitoring and service management
 * via the Model Context Protocol.
 *
 * Tools:
 * - get_status: Comprehensive workspace health status
 * - list_services: List configured services
 * - health_check: Check specific service or dependency health
 * - get_config: View environment configuration (masked)
 * - docker_logs: Query logs from Docker containers
 * - list_containers: List running Docker containers
 *
 * Configuration:
 * - Reads .env files from emergent-infra/ and workspace root
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  getStatusTool,
  getStatusSchema,
  GetStatusInput,
} from './tools/get-status.js';
import {
  listServicesTool,
  listServicesSchema,
  ListServicesInput,
} from './tools/list-services.js';
import {
  healthCheckTool,
  healthCheckSchema,
  HealthCheckInput,
} from './tools/health-check.js';
import {
  getConfigTool,
  getConfigSchema,
  GetConfigInput,
} from './tools/get-config.js';
import {
  dockerLogsTool,
  dockerLogsSchema,
  DockerLogsInput,
  listContainersTool,
  listContainersSchema,
  ListContainersInput,
} from './tools/docker-logs.js';

const server = new Server(
  {
    name: 'workspace-mcp',
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
        name: 'get_status',
        description:
          'Get comprehensive workspace health status including services, dependencies, API keys, and test accounts. Use this for a full health overview.',
        inputSchema: getStatusSchema,
      },
      {
        name: 'list_services',
        description:
          'List configured application services without checking health. Fast operation that returns service definitions.',
        inputSchema: listServicesSchema,
      },
      {
        name: 'health_check',
        description:
          'Check health of a specific service or dependency. Services: admin, server. Dependencies: postgres, zitadel, vertex, langfuse, langsmith.',
        inputSchema: healthCheckSchema,
      },
      {
        name: 'get_config',
        description:
          'View environment configuration for the workspace. Categories: database, auth, ai, observability, services. Secrets are masked by default.',
        inputSchema: getConfigSchema,
      },
      {
        name: 'docker_logs',
        description:
          'Get logs from Docker containers running infrastructure dependencies. Use aliases like "postgres", "zitadel", "langfuse", "redis", "clickhouse".',
        inputSchema: dockerLogsSchema,
      },
      {
        name: 'list_containers',
        description:
          'List running Docker containers with their status. Shows available containers for the docker_logs tool.',
        inputSchema: listContainersSchema,
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
      case 'get_status':
        result = await getStatusTool((args ?? {}) as GetStatusInput);
        break;

      case 'list_services':
        result = await listServicesTool((args ?? {}) as ListServicesInput);
        break;

      case 'health_check':
        if (!args || typeof args !== 'object' || !('target' in args)) {
          throw new Error('target parameter is required');
        }
        result = await healthCheckTool({
          target: String(args.target),
        } as HealthCheckInput);
        break;

      case 'get_config':
        result = await getConfigTool((args ?? {}) as GetConfigInput);
        break;

      case 'docker_logs':
        if (!args || typeof args !== 'object' || !('container' in args)) {
          throw new Error('container parameter is required');
        }
        result = await dockerLogsTool({
          container: String(args.container),
          lines: typeof args.lines === 'number' ? args.lines : undefined,
          since: typeof args.since === 'string' ? args.since : undefined,
          grep: typeof args.grep === 'string' ? args.grep : undefined,
        } as DockerLogsInput);
        break;

      case 'list_containers':
        result = await listContainersTool((args ?? {}) as ListContainersInput);
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
  console.error('Workspace MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
