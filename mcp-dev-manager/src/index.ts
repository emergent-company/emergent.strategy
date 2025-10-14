#!/usr/bin/env node

/**
 * MCP Dev Manager Server
 * 
 * A Model Context Protocol server for development process management.
 * Provides tools for running tests, managing services, and browsing logs.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { runTests } from './tools/run-tests.js';
import { manageService } from './tools/manage-service.js';
import { browseLogs } from './tools/browse-logs.js';
import { checkStatus } from './tools/check-status.js';
import { runScript, listScripts } from './tools/run-script.js';

// Validate environment
const PROJECT_ROOT = process.env.PROJECT_ROOT;
if (!PROJECT_ROOT) {
    console.error('ERROR: PROJECT_ROOT environment variable is required');
    process.exit(1);
}

// Tool definitions
const TOOLS: Tool[] = [
    {
        name: 'run_script',
        description: 'Run npm scripts defined in package.json with dev-manager: prefix. This is the PREFERRED way to run tests and builds. Use app + action pattern (e.g., app="admin", action="e2e:clickup") or full script name.',
        inputSchema: {
            type: 'object',
            properties: {
                script: {
                    type: 'string',
                    description: 'Full script name (e.g., "dev-manager:admin:e2e" or just "admin:e2e")',
                },
                app: {
                    type: 'string',
                    description: 'App name (admin, server, docker) - used with action',
                },
                action: {
                    type: 'string',
                    description: 'Action to perform (e2e, e2e:clickup, build, test, etc.) - used with app',
                },
            },
        },
    },
    {
        name: 'list_scripts',
        description: 'List all available dev-manager scripts from package.json. Use this to discover what scripts are available before running them.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'run_tests',
        description: 'DEPRECATED: Use run_script instead. Legacy tool for running tests with manual path configuration.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['npm', 'playwright', 'vitest', 'jest'],
                    description: 'Type of test runner',
                },
                command: {
                    type: 'string',
                    description: 'Test command to run (for npm type)',
                },
                spec: {
                    type: 'string',
                    description: 'Test spec file path (for playwright)',
                },
                project: {
                    type: 'string',
                    description: 'Browser project name (for playwright: chromium, firefox, webkit)',
                },
                config: {
                    type: 'string',
                    description: 'Config file path',
                },
                grep: {
                    type: 'string',
                    description: 'Filter tests by pattern',
                },
                workDir: {
                    type: 'string',
                    description: 'Working directory (relative to PROJECT_ROOT)',
                },
            },
            required: ['type'],
        },
    },
    {
        name: 'manage_service',
        description: 'Start, stop, restart, or check status of development services',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['start', 'stop', 'restart', 'status'],
                    description: 'Action to perform',
                },
                service: {
                    type: 'string',
                    enum: ['docker-compose', 'pm2', 'npm', 'custom'],
                    description: 'Service type to manage',
                },
                services: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Service names (for docker-compose)',
                },
                script: {
                    type: 'string',
                    description: 'Script name (for npm)',
                },
                command: {
                    type: 'string',
                    description: 'Custom command to run (for custom service)',
                },
                workDir: {
                    type: 'string',
                    description: 'Working directory (relative to PROJECT_ROOT)',
                },
            },
            required: ['action', 'service'],
        },
    },
    {
        name: 'browse_logs',
        description: 'View, tail, or search log files',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['tail', 'cat', 'grep', 'list'],
                    description: 'Log browsing action',
                },
                logFile: {
                    type: 'string',
                    description: 'Path to log file (relative to PROJECT_ROOT)',
                },
                lines: {
                    type: 'number',
                    description: 'Number of lines to show (for tail)',
                    default: 50,
                },
                pattern: {
                    type: 'string',
                    description: 'Search pattern (for grep)',
                },
                context: {
                    type: 'number',
                    description: 'Number of context lines (for grep)',
                    default: 3,
                },
            },
            required: ['action'],
        },
    },
    {
        name: 'check_status',
        description: 'Check the status of development services and processes',
        inputSchema: {
            type: 'object',
            properties: {
                services: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Service types to check (docker-compose, npm, etc.)',
                },
                detailed: {
                    type: 'boolean',
                    description: 'Show detailed information',
                    default: false,
                },
            },
        },
    },
];

// Create server instance
const server = new Server(
    {
        name: 'dev-manager',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
}));

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        let result;

        switch (name) {
            case 'run_script':
                result = await runScript(args as any, PROJECT_ROOT);
                break;

            case 'list_scripts':
                result = await listScripts(PROJECT_ROOT);
                break;

            case 'run_tests':
                result = await runTests(args as any, PROJECT_ROOT);
                break;

            case 'manage_service':
                result = await manageService(args as any, PROJECT_ROOT);
                break;

            case 'browse_logs':
                result = await browseLogs(args as any, PROJECT_ROOT);
                break;

            case 'check_status':
                result = await checkStatus(args as any, PROJECT_ROOT);
                break;

            default:
                throw new Error(`Unknown tool: ${name}`);
        }

        return {
            content: [
                {
                    type: 'text',
                    text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                },
            ],
        };
    } catch (error) {
        // Log error to stderr for debugging
        console.error(`Error executing tool ${name}:`, error);
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        return {
            content: [
                {
                    type: 'text',
                    text: `❌ Error: ${errorMessage}\n\n${errorStack ? `Stack trace:\n${errorStack}` : ''}`,
                },
            ],
            isError: true,
        };
    }
});

// Start server
async function main() {
    // Handle uncaught errors gracefully
    process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error);
        // Don't exit - keep server running
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled rejection at:', promise, 'reason:', reason);
        // Don't exit - keep server running
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('MCP Dev Manager server running on stdio');
}

main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
