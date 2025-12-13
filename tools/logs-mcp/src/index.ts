#!/usr/bin/env node
/**
 * Logs MCP Server
 *
 * Provides tools for browsing application logs via the Model Context Protocol.
 *
 * Log structure:
 * logs/
 * ├── server/
 * │   ├── server.log          # Main server log (INFO+)
 * │   ├── server.error.log    # Server errors only
 * │   ├── server.debug.log    # Debug/verbose output
 * │   ├── server.http.log     # HTTP request/response logs
 * │   ├── server.out.log      # Process stdout
 * │   └── server.error.log    # Process stderr
 * ├── admin/
 * │   ├── admin.out.log       # Vite stdout
 * │   ├── admin.error.log     # Vite stderr
 * │   ├── admin.http.log      # HTTP proxy logs
 * │   └── admin.client.log    # Browser client logs
 *
 * Tools:
 * - list_log_files: List available log files
 * - tail_log: Get last N lines from a log file
 * - search_logs: Search for patterns across log files
 * - get_errors: Get recent error entries
 *
 * Service Aliases:
 * - tail_server_logs: Tail server/server.log and server/server.error.log
 * - tail_admin_logs: Tail admin/admin.out.log, admin.error.log, admin.client.log
 * - tail_app_logs: Tail server/server.log
 * - tail_debug_logs: Tail server/server.debug.log
 * - tail_error_logs: Tail all error logs
 * - tail_http_logs: Tail HTTP logs (server and admin)
 *
 * Configuration:
 * - LOGS_DIR: Root logs directory (default: ./logs)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  listLogFilesTool,
  listLogFilesSchema,
  ListLogFilesInput,
} from './tools/list-log-files.js';
import { tailLogTool, tailLogSchema } from './tools/tail-log.js';
import { searchLogsTool, searchLogsSchema } from './tools/search-logs.js';
import {
  getErrorsTool,
  getErrorsSchema,
  GetErrorsInput,
} from './tools/get-errors.js';
import {
  aliasSchema,
  AliasInput,
  tailServerLogs,
  tailAdminLogs,
  tailAppLogs,
  tailDebugLogs,
  tailErrorLogs,
  tailHttpLogs,
} from './tools/aliases.js';

const server = new Server(
  {
    name: 'logs-mcp',
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
      // Core tools
      {
        name: 'list_log_files',
        description:
          'List all available log files in the logs directory with their sizes and modification times.',
        inputSchema: listLogFilesSchema,
      },
      {
        name: 'tail_log',
        description:
          'Get the last N lines from a specific log file. Use this for detailed inspection of any log file.',
        inputSchema: tailLogSchema,
      },
      {
        name: 'search_logs',
        description:
          'Search for a text pattern across log files. Returns matching lines with file names and line numbers.',
        inputSchema: searchLogsSchema,
      },
      {
        name: 'get_errors',
        description:
          'Get recent error entries from error log files. Filters for ERROR, FATAL, Exception patterns.',
        inputSchema: getErrorsSchema,
      },
      // Service aliases
      {
        name: 'tail_server_logs',
        description:
          'Tail server logs (server/server.log and server/server.error.log). Convenience alias for backend service logs.',
        inputSchema: aliasSchema,
      },
      {
        name: 'tail_admin_logs',
        description:
          'Tail admin logs (admin/admin.out.log, admin.error.log, admin.client.log). Convenience alias for frontend service logs.',
        inputSchema: aliasSchema,
      },
      {
        name: 'tail_app_logs',
        description:
          'Tail the main application log (server/server.log). Convenience alias for general application output.',
        inputSchema: aliasSchema,
      },
      {
        name: 'tail_debug_logs',
        description:
          'Tail the debug log (server/server.debug.log). Convenience alias for debug output.',
        inputSchema: aliasSchema,
      },
      {
        name: 'tail_error_logs',
        description:
          'Tail all error logs (server/server.error.log, admin/admin.error.log, admin/admin.client.log). Convenience alias for all error output.',
        inputSchema: aliasSchema,
      },
      {
        name: 'tail_http_logs',
        description:
          'Tail HTTP request/response logs (server/server.http.log, admin/admin.http.log). Convenience alias for HTTP traffic debugging.',
        inputSchema: aliasSchema,
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
      case 'list_log_files':
        result = await listLogFilesTool((args ?? {}) as ListLogFilesInput);
        break;

      case 'tail_log':
        if (!args || typeof args !== 'object' || !('file' in args)) {
          throw new Error('file parameter is required');
        }
        result = await tailLogTool({
          file: String(args.file),
          lines: typeof args.lines === 'number' ? args.lines : undefined,
        });
        break;

      case 'search_logs':
        if (!args || typeof args !== 'object' || !('pattern' in args)) {
          throw new Error('pattern parameter is required');
        }
        result = await searchLogsTool({
          pattern: String(args.pattern),
          files: Array.isArray(args.files) ? args.files.map(String) : undefined,
          caseSensitive:
            typeof args.caseSensitive === 'boolean'
              ? args.caseSensitive
              : undefined,
        });
        break;

      case 'get_errors':
        result = await getErrorsTool((args ?? {}) as GetErrorsInput);
        break;

      // Service aliases
      case 'tail_server_logs':
        result = await tailServerLogs((args ?? {}) as AliasInput);
        break;

      case 'tail_admin_logs':
        result = await tailAdminLogs((args ?? {}) as AliasInput);
        break;

      case 'tail_app_logs':
        result = await tailAppLogs((args ?? {}) as AliasInput);
        break;

      case 'tail_debug_logs':
        result = await tailDebugLogs((args ?? {}) as AliasInput);
        break;

      case 'tail_error_logs':
        result = await tailErrorLogs((args ?? {}) as AliasInput);
        break;

      case 'tail_http_logs':
        result = await tailHttpLogs((args ?? {}) as AliasInput);
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
  console.error('Logs MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
