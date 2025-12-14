#!/usr/bin/env node
/**
 * Langfuse MCP Server
 *
 * Provides tools for browsing Langfuse traces and managing prompts via the Model Context Protocol.
 *
 * Tools:
 * - list_traces: List recent traces with filtering
 * - get_trace: Get full details for a specific trace
 * - list_sessions: List sessions for conversation-based debugging
 * - list_prompts: List prompts with filtering
 * - get_prompt: Get a specific prompt by name and version/label
 * - update_prompt: Create or update a prompt (creates new version)
 *
 * Configuration:
 * Reads from environment variables:
 * - LANGFUSE_HOST: Langfuse server URL (e.g., http://localhost:3011)
 * - LANGFUSE_PUBLIC_KEY: Public API key
 * - LANGFUSE_SECRET_KEY: Secret API key
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { LangfuseClient } from './langfuse-client.js';
import {
  listTraces,
  listTracesSchema,
  ListTracesInput,
} from './tools/list-traces.js';
import { getTrace, getTraceSchema } from './tools/get-trace.js';
import {
  listSessions,
  listSessionsSchema,
  ListSessionsInput,
} from './tools/list-sessions.js';
import {
  listPrompts,
  listPromptsSchema,
  ListPromptsInput,
} from './tools/list-prompts.js';
import { getPrompt, getPromptSchema } from './tools/get-prompt.js';
import { updatePrompt, updatePromptSchema } from './tools/update-prompt.js';

const server = new Server(
  {
    name: 'langfuse-mcp',
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
        name: 'list_traces',
        description:
          'List recent Langfuse traces with optional filtering by name, user, session, time range, and tags. Returns trace summaries including ID, name, timestamp, latency, and cost.',
        inputSchema: listTracesSchema,
      },
      {
        name: 'get_trace',
        description:
          'Get full details for a specific Langfuse trace including all observations (LLM calls, spans), scores, inputs, outputs, timing, and costs.',
        inputSchema: getTraceSchema,
      },
      {
        name: 'list_sessions',
        description:
          'List Langfuse sessions for browsing conversation-based traces grouped by session ID.',
        inputSchema: listSessionsSchema,
      },
      {
        name: 'list_prompts',
        description:
          'List Langfuse prompts with optional filtering by name, label, and tag. Returns prompt metadata including versions, labels, and tags.',
        inputSchema: listPromptsSchema,
      },
      {
        name: 'get_prompt',
        description:
          'Get a specific Langfuse prompt by name. Optionally specify a version number or label (defaults to "production" label). Returns full prompt content, config, and metadata.',
        inputSchema: getPromptSchema,
      },
      {
        name: 'update_prompt',
        description:
          'Create a new prompt or update an existing prompt by creating a new version. Supports text and chat prompt types. Use labels like "production" or "staging" to manage deployment.',
        inputSchema: updatePromptSchema,
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Check for Langfuse configuration
  const client = LangfuseClient.fromEnv();
  if (!client) {
    const missing = LangfuseClient.getMissingEnvVars();
    return {
      content: [
        {
          type: 'text',
          text: `Error: Missing Langfuse configuration. Please set the following environment variables: ${missing.join(
            ', '
          )}`,
        },
      ],
      isError: true,
    };
  }

  try {
    let result: string;

    switch (name) {
      case 'list_traces':
        result = await listTraces(client, (args ?? {}) as ListTracesInput);
        break;

      case 'get_trace':
        if (!args || typeof args !== 'object' || !('traceId' in args)) {
          throw new Error('traceId is required');
        }
        result = await getTrace(client, { traceId: String(args.traceId) });
        break;

      case 'list_sessions':
        result = await listSessions(client, (args ?? {}) as ListSessionsInput);
        break;

      case 'list_prompts':
        result = await listPrompts(client, (args ?? {}) as ListPromptsInput);
        break;

      case 'get_prompt':
        if (!args || typeof args !== 'object' || !('name' in args)) {
          throw new Error('name is required');
        }
        result = await getPrompt(client, {
          name: String(args.name),
          version:
            'version' in args
              ? (args.version as number | undefined)
              : undefined,
          label:
            'label' in args ? (args.label as string | undefined) : undefined,
        });
        break;

      case 'update_prompt':
        if (
          !args ||
          typeof args !== 'object' ||
          !('name' in args) ||
          !('type' in args) ||
          !('prompt' in args)
        ) {
          throw new Error('name, type, and prompt are required');
        }
        result = await updatePrompt(client, {
          name: String(args.name),
          type: args.type as 'text' | 'chat',
          prompt: args.prompt as string | { role: string; content: string }[],
          config:
            'config' in args
              ? (args.config as Record<string, unknown>)
              : undefined,
          labels:
            'labels' in args
              ? (args.labels as string[] | undefined)
              : undefined,
          tags:
            'tags' in args ? (args.tags as string[] | undefined) : undefined,
          commitMessage:
            'commitMessage' in args
              ? (args.commitMessage as string | undefined)
              : undefined,
        });
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
  console.error('Langfuse MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
