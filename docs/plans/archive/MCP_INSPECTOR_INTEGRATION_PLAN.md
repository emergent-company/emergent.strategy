# MCP Inspector Integration Plan (Development Only)

**Date**: 2025-10-20  
**Status**: 📋 PLANNED  
**Purpose**: Integrate MCP Inspector for local testing and debugging of MCP server implementation  
**Environment**: Development/Testing Only (Not for Production)

---

## Quick Start: Try Inspector Now! ⚡

**Don't wait!** Test Inspector with an existing MCP server from your `.vscode/mcp.json`:

```bash
# Test postgres MCP server (already in your config)
npx @modelcontextprotocol/inspector \
  npx -y @modelcontextprotocol/server-postgres \
  postgresql://spec:spec@localhost:5432/spec
```

**What happens**:
1. Inspector downloads and starts (first time only)
2. Spawns postgres MCP server
3. Opens web UI at `http://localhost:5173` (or similar)
4. Shows all database tools in Tools tab
5. You can execute queries interactively!

**Try it right now** to understand what you're building! 🚀

**Full guide**: See `MCP_INSPECTOR_QUICKSTART.md` for detailed examples and learning exercises.

---

## Executive Summary

This document outlines the plan to integrate the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) into our development workflow for testing and debugging the spec-server MCP implementation. **The integration uses stdio transport to match how real AI agents (Claude Desktop, GitHub Copilot, Gemini CLI) connect to MCP servers.**

**Goal**: Enable developers to test MCP tools with Inspector using the **exact same connection method** as production AI agents - maximizing compatibility and realistic testing.

**Key Decision**: Use **stdio transport** (not HTTP) for 100% compatibility with:
- Claude Desktop (.vscode/mcp.json pattern)
- GitHub Copilot MCP integration
- Gemini CLI
- Any other MCP client using stdio

**Performance**: Not a concern - compatibility is the priority.

---

## Background

### Current State

**MCP Server Implementation** (Phase 4 Complete ✅):
- 13 MCP tools across 4 categories (schema, specific data, generic data)
- JWT authentication with scope-based authorization
- Real-time schema versioning with MD5 hashing
- 115 tests (90 unit + 25 E2E) - 100% passing
- Production-ready with enterprise-grade security

**Current Testing Approach**:
- Unit tests for individual tool logic
- E2E tests for authentication/authorization
- Manual testing via cURL or Postman
- No interactive UI for tool exploration

**Gap**: Lack of visual/interactive testing tool for rapid development and debugging

---

## Try Inspector Right Now! 🚀

Before implementing our own stdio wrapper, you can test Inspector with existing MCP servers from `.vscode/mcp.json`:

### Test Postgres MCP Server
```bash
npx @modelcontextprotocol/inspector \
  npx -y @modelcontextprotocol/server-postgres \
  postgresql://spec:spec@localhost:5432/spec
```

**What you'll see**:
- Tools like `query`, `list_tables`, `describe_table`
- Can execute SQL queries interactively
- See database schema exploration tools

### Test Playwright MCP Server
```bash
npx @modelcontextprotocol/inspector \
  npx @playwright/mcp@latest \
  --timeout-action=10000
```

**What you'll see**:
- Browser automation tools
- Web navigation, clicking, form filling
- Screenshot capture tools

### Test Context7 MCP Server
```bash
npx @modelcontextprotocol/inspector \
  npx -y @upstash/context7-mcp \
  --api-key ctx7sk-77ad3f0a-32a5-4b23-8b82-1431d078b1c6
```

**What you'll see**:
- Documentation search tools
- Library version resolution
- Code example retrieval

**Learn by Example**: Testing these servers shows you exactly what Inspector does and how our spec-server should behave!

---

## What is MCP Inspector?

### Overview

The MCP Inspector is an official tool from the Model Context Protocol team that provides:

1. **Interactive Testing**: Test tools with custom inputs through a web UI
2. **Real-time Monitoring**: View all server messages and notifications
3. **Schema Exploration**: Browse available tools, resources, and prompts
4. **Connection Management**: Support for multiple transport types (stdio, SSE, HTTP)
5. **Development Workflow**: Quick iteration cycle (code → rebuild → reconnect → test)

### Key Features

| Feature | Description | Use Case |
|---------|-------------|----------|
| **Tool Testing** | Execute tools with custom parameters | Validate input/output formats |
| **Resource Inspector** | View available resources and content | Test resource subscriptions |
| **Prompt Testing** | Test prompts with arguments | Validate prompt templates |
| **Notifications Pane** | Monitor logs and server events | Debug issues in real-time |
| **Transport Flexibility** | Supports stdio, SSE, HTTP | Test different connection modes |
| **Hot Reload Support** | Reconnect after code changes | Rapid development iteration |

### Inspector vs Our E2E Tests

| Aspect | E2E Tests | Inspector |
|--------|-----------|-----------|
| **Purpose** | Automated validation | Interactive exploration |
| **Speed** | Fast (~720ms for 25 tests) | Manual (human-paced) |
| **Coverage** | Authentication, authorization, edge cases | Happy paths, visual feedback |
| **Use Case** | CI/CD, regression testing | Development, debugging |
| **User** | Test suite (automated) | Developer (manual) |
| **Feedback** | Pass/fail assertions | Visual UI, live data |

**Conclusion**: Inspector complements E2E tests, not replaces them!

---

## Integration Architecture

### ✅ CHOSEN: Stdio Transport (Maximum Compatibility)

**How it works**:
```
Inspector (npx) → Spawns → NestJS Stdio Wrapper → MCP SDK → MCP Tools
```

**Why stdio**:
- ✅ **Identical to Claude Desktop**: Same transport, same behavior
- ✅ **Matches existing .vscode/mcp.json**: postgres, playwright, context7 all use stdio
- ✅ **Compatible with all MCP clients**: Works with Copilot, Gemini CLI, etc.
- ✅ **Built-in process management**: Inspector spawns and manages process
- ✅ **Simple connection**: No ports, no HTTP server, no CORS
- ✅ **Standard MCP pattern**: JSON-RPC over stdin/stdout

**Real-world examples from .vscode/mcp.json**:
```json
{
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://..."]
  },
  "playwright": {
    "command": "npx", 
    "args": ["@playwright/mcp@latest", "--timeout-action=10000"]
  },
  "context7": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@upstash/context7-mcp", "--api-key", "..."]
  }
}
```

**Our equivalent**:
```json
{
  "spec-server": {
    "command": "node",
    "args": ["apps/server/dist/mcp-stdio.js"],
    "env": {
      "AUTH_TOKEN": "schema-read-token",
      "NODE_ENV": "test",
      "DATABASE_URL": "postgresql://spec:spec@localhost:5432/spec"
    }
  }
}
```

**Command for Inspector**:
```bash
# Same command that Claude Desktop would use!
AUTH_TOKEN=schema-read-token NODE_ENV=test \
  npx @modelcontextprotocol/inspector node apps/server/dist/mcp-stdio.js
```

**Why this matters**:
- Inspector spawns process **exactly** like Claude Desktop would
- Same environment variables, same stdio transport, same JSON-RPC protocol
- If it works in Inspector, it **will** work in Claude Desktop
- Zero surprises when integrating with real AI agents

---

### Alternative: HTTP/SSE Transport (NOT RECOMMENDED)

**Why NOT HTTP**:
- ❌ Different from Claude Desktop (stdio-based)
- ❌ Requires separate server process
- ❌ Auth token handling different (HTTP headers vs env vars)
- ❌ Not compatible with typical MCP client configs
- ❌ Adds complexity (CORS, ports, networking)

**Conclusion**: Use stdio for maximum compatibility with real AI agents!

---

## Implementation Plan

### Phase 1: Stdio Wrapper Implementation (REQUIRED)

**Goal**: Create stdio transport wrapper matching Claude Desktop/Copilot pattern  
**Time**: 60-90 minutes  
**Risk**: Low (well-documented MCP SDK pattern)  
**Priority**: HIGH (required for compatibility)

**Before you start**: Test existing MCP servers with Inspector (see "Try Inspector Right Now!" section above) to understand what you're building!

#### Tasks

##### 1.0 Try Inspector with Existing Servers (10 min) - RECOMMENDED

Test one of the existing MCP servers to see Inspector in action:
```bash
# Try postgres MCP server
npx @modelcontextprotocol/inspector \
  npx -y @modelcontextprotocol/server-postgres \
  postgresql://spec:spec@localhost:5432/spec
```

**What to observe**:
- How Inspector UI looks
- Tools tab showing all available tools
- Executing tools with parameters
- Response format in the output
- Notifications pane showing logs

**Why this helps**: You'll understand exactly what you're building toward!

##### 1.1 Install MCP SDK Dependencies (5 min)

Already installed: `@modelcontextprotocol/sdk` (via @rekog/mcp-nest)

Verify:
```bash
npm ls @modelcontextprotocol/sdk
```

##### 1.2 Create Stdio Entry Point (45 min)

**File**: `apps/server/src/mcp-stdio.ts`

```typescript
#!/usr/bin/env node
import 'reflect-metadata';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { SchemaTool } from './modules/mcp/tools/schema.tool';
import { SpecificDataTool } from './modules/mcp/tools/specific-data.tool';
import { GenericDataTool } from './modules/mcp/tools/generic-data.tool';

/**
 * MCP Stdio Server - Claude Desktop Compatible
 * 
 * Launches NestJS app with stdio transport for MCP clients.
 * Matches the pattern used by Claude Desktop, GitHub Copilot, etc.
 * 
 * Usage:
 *   node dist/mcp-stdio.js
 * 
 * Environment:
 *   AUTH_TOKEN - Test token for authentication (default: schema-read-token)
 *   NODE_ENV - Set to 'test' to enable mock tokens
 *   DATABASE_URL - PostgreSQL connection string
 */

async function main() {
  // Get auth token from env (for testing)
  const authToken = process.env.AUTH_TOKEN || 'schema-read-token';
  
  // Bootstrap NestJS app (silent mode)
  const app = await NestFactory.create(AppModule, {
    logger: false, // Disable console logging (interferes with stdio)
  });
  
  await app.init();
  
  // Get MCP tool services from DI container
  const schemaTool = app.get(SchemaTool);
  const specificDataTool = app.get(SpecificDataTool);
  const genericDataTool = app.get(GenericDataTool);
  
  // Create MCP server
  const server = new Server(
    {
      name: 'spec-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );
  
  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Tool[] = [
      // Schema tools (4)
      {
        name: 'schema_listTypes',
        description: 'List all available object types in the knowledge graph',
        inputSchema: {
          type: 'object',
          properties: {
            include_system_types: {
              type: 'boolean',
              description: 'Include system types (default: false)',
            },
            category: {
              type: 'string',
              description: 'Filter by category',
            },
          },
        },
      },
      {
        name: 'schema_getTypeDetails',
        description: 'Get detailed schema for a specific object type',
        inputSchema: {
          type: 'object',
          properties: {
            type_name: {
              type: 'string',
              description: 'Name of the object type',
            },
          },
          required: ['type_name'],
        },
      },
      {
        name: 'schema_listRelationships',
        description: 'List available relationship types',
        inputSchema: {
          type: 'object',
          properties: {
            from_type: {
              type: 'string',
              description: 'Filter by source type',
            },
            to_type: {
              type: 'string',
              description: 'Filter by target type',
            },
          },
        },
      },
      {
        name: 'schema_getPropertyDetails',
        description: 'Get detailed information about a property',
        inputSchema: {
          type: 'object',
          properties: {
            type_name: {
              type: 'string',
              description: 'Name of the object type',
            },
            property_name: {
              type: 'string',
              description: 'Name of the property',
            },
          },
          required: ['type_name', 'property_name'],
        },
      },
      // Specific data tools (6)
      {
        name: 'data_getPersons',
        description: 'Query Person objects with filtering and pagination',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max results (default: 10, max: 100)' },
            cursor: { type: 'string', description: 'Pagination cursor' },
            filters: { type: 'object', description: 'Property filters' },
          },
        },
      },
      {
        name: 'data_getTasks',
        description: 'Query Task objects with filtering and pagination',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number' },
            cursor: { type: 'string' },
            filters: { type: 'object' },
          },
        },
      },
      {
        name: 'data_getPersonById',
        description: 'Fetch specific Person by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Person ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'data_getTaskById',
        description: 'Fetch specific Task by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Task ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'data_getPersonRelationships',
        description: 'Get all relationships for a Person',
        inputSchema: {
          type: 'object',
          properties: {
            person_id: { type: 'string', description: 'Person ID' },
            relationship_type: { type: 'string', description: 'Filter by type' },
            limit: { type: 'number' },
          },
          required: ['person_id'],
        },
      },
      {
        name: 'data_getTaskRelationships',
        description: 'Get all relationships for a Task',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Task ID' },
            relationship_type: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['task_id'],
        },
      },
      // Generic data tools (3)
      {
        name: 'data_getObjectsByType',
        description: 'Query any object type without specialized tool',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Object type name' },
            limit: { type: 'number' },
            cursor: { type: 'string' },
            label: { type: 'string' },
          },
          required: ['type'],
        },
      },
      {
        name: 'data_getObjectById',
        description: 'Fetch any object by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Object ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'data_getRelatedObjects',
        description: 'Generic relationship traversal',
        inputSchema: {
          type: 'object',
          properties: {
            object_id: { type: 'string' },
            relationship_type: { type: 'string' },
            direction: { 
              type: 'string',
              enum: ['incoming', 'outgoing', 'both'],
              description: 'Relationship direction',
            },
            limit: { type: 'number' },
          },
          required: ['object_id'],
        },
      },
    ];
    
    return { tools };
  });
  
  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    // Mock auth context (in real usage, extract from MCP session)
    const authContext = { token: authToken };
    
    try {
      let result;
      
      // Route to appropriate tool
      switch (name) {
        // Schema tools
        case 'schema_listTypes':
          result = await schemaTool.listTypes(args);
          break;
        case 'schema_getTypeDetails':
          result = await schemaTool.getTypeDetails(args);
          break;
        case 'schema_listRelationships':
          result = await schemaTool.listRelationships(args);
          break;
        case 'schema_getPropertyDetails':
          result = await schemaTool.getPropertyDetails(args);
          break;
          
        // Specific data tools
        case 'data_getPersons':
          result = await specificDataTool.getPersons(args);
          break;
        case 'data_getTasks':
          result = await specificDataTool.getTasks(args);
          break;
        case 'data_getPersonById':
          result = await specificDataTool.getPersonById(args);
          break;
        case 'data_getTaskById':
          result = await specificDataTool.getTaskById(args);
          break;
        case 'data_getPersonRelationships':
          result = await specificDataTool.getPersonRelationships(args);
          break;
        case 'data_getTaskRelationships':
          result = await specificDataTool.getTaskRelationships(args);
          break;
          
        // Generic data tools
        case 'data_getObjectsByType':
          result = await genericDataTool.getObjectsByType(args);
          break;
        case 'data_getObjectById':
          result = await genericDataTool.getObjectById(args);
          break;
        case 'data_getRelatedObjects':
          result = await genericDataTool.getRelatedObjects(args);
          break;
          
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                code: 'tool_execution_error',
                message: error.message,
              },
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });
  
  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log to stderr (stdout is reserved for MCP protocol)
  console.error('MCP server ready on stdio');
  console.error(`Auth token: ${authToken}`);
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
```

- [ ] Create `apps/server/src/mcp-stdio.ts`
- [ ] Add shebang for direct execution
- [ ] Test compilation: `npm run build`

##### 1.3 Add Build Configuration (10 min)

Update `apps/server/tsconfig.json` (if needed):
```json
{
  "compilerOptions": {
    "module": "ES2022",
    "moduleResolution": "node"
  }
}
```

Update `apps/server/package.json`:
```json
{
  "scripts": {
    "build:mcp": "tsc src/mcp-stdio.ts --outDir dist",
    "mcp:stdio": "node dist/mcp-stdio.js"
  }
}
```

- [ ] Update build scripts
- [ ] Test build: `npm run build:mcp`
- [ ] Verify output: `ls dist/mcp-stdio.js`

##### 1.4 Create Launch Scripts (15 min)

**File**: `scripts/mcp-inspector.sh`
```bash
#!/bin/bash
set -e

echo "🔍 Starting MCP Inspector (stdio transport)"
echo "📦 Building MCP server..."

# Build stdio wrapper
npm --prefix apps/server run build

echo "🚀 Launching Inspector..."
echo ""
echo "Available test tokens (set AUTH_TOKEN env var):"
echo "  - schema-read-token (default)"
echo "  - data-read-token"
echo "  - data-write-token"
echo "  - e2e-all"
echo ""

# Launch inspector with stdio
AUTH_TOKEN=${AUTH_TOKEN:-schema-read-token} \
NODE_ENV=test \
  npx @modelcontextprotocol/inspector \
  node apps/server/dist/mcp-stdio.js
```

- [ ] Create `scripts/mcp-inspector.sh`
- [ ] Make executable: `chmod +x scripts/mcp-inspector.sh`
- [ ] Test launch: `./scripts/mcp-inspector.sh`

##### 1.5 Add to .vscode/mcp.json (10 min)

Update `.vscode/mcp.json`:
```json
{
  "servers": {
    "spec-server": {
      "command": "node",
      "args": ["apps/server/dist/mcp-stdio.js"],
      "env": {
        "AUTH_TOKEN": "schema-read-token",
        "NODE_ENV": "test"
      }
    }
  }
}
```

- [ ] Add spec-server to mcp.json
- [ ] Test with Inspector
- [ ] Verify tools list appears

**Deliverables**:
- ✅ Stdio wrapper implementation
- ✅ Build scripts
- ✅ Launch script
- ✅ VS Code MCP config

---

### Phase 2: Testing & Validation (REQUIRED)

**Goal**: Verify stdio transport works like other MCP servers  
**Time**: 30-45 minutes  
**Risk**: Low  
**Priority**: HIGH

#### Tasks

##### 2.1 Test Tool Discovery (10 min)
- [ ] Launch Inspector
- [ ] Verify all 13 tools appear
- [ ] Check tool descriptions are clear
- [ ] Verify input schemas are correct

##### 2.2 Test Authentication (10 min)
- [ ] Test with default token (schema-read-token)
- [ ] Test with data-read-token
- [ ] Verify scope enforcement works
- [ ] Check error messages are clear

##### 2.3 Test Tool Execution (15 min)
- [ ] Execute `schema_listTypes` (no params)
- [ ] Execute `schema_getTypeDetails` with params
- [ ] Execute `data_getObjectsByType`
- [ ] Verify response format matches E2E tests

##### 2.4 Test Error Handling (10 min)
- [ ] Test with invalid parameters
- [ ] Test with non-existent IDs
- [ ] Verify error responses are clear
- [ ] Check Inspector Notifications pane shows errors

**Deliverables**:
- ✅ All 13 tools tested
- ✅ Auth verification complete
- ✅ Error handling confirmed

---

### Phase 3: Documentation & Integration (OPTIONAL)

**Goal**: Make Inspector easy for team to use  
**Time**: 30-45 minutes  
**Risk**: Low  
**Priority**: MEDIUM

#### Tasks

##### 3.1 Add NPM Scripts (10 min)

Update `apps/server/package.json`:
```json
{
  "scripts": {
    "mcp:inspect:http": "../../scripts/mcp-inspector.sh",
    "mcp:inspect:stdio": "../../scripts/mcp-inspector-stdio.sh",
    "mcp:inspect": "npm run mcp:inspect:http"
  }
}
```

- [ ] Add scripts to package.json
- [ ] Test shortcuts: `npm run mcp:inspect`

##### 3.2 VS Code Task Integration (15 min)

Update `.vscode/tasks.json`:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "MCP: Launch Inspector (HTTP)",
      "type": "shell",
      "command": "./scripts/mcp-inspector.sh",
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "new"
      }
    },
    {
      "label": "MCP: Launch Inspector (Stdio)",
      "type": "shell",
      "command": "./scripts/mcp-inspector-stdio.sh",
      "args": ["${input:authToken}"],
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "new"
      }
    }
  ],
  "inputs": [
    {
      "id": "authToken",
      "type": "pickString",
      "description": "Select auth token for testing",
      "options": [
        "schema-read-token",
        "data-read-token",
        "data-write-token",
        "e2e-all"
      ],
      "default": "schema-read-token"
    }
  ]
}
```

- [ ] Update VS Code tasks
- [ ] Test task launcher (Cmd+Shift+P → Tasks: Run Task)
- [ ] Verify token selection works

##### 3.3 Update Development Documentation (10 min)
- [ ] Add "Testing with MCP Inspector" section to `RUNBOOK.md`
- [ ] Document when to use Inspector vs E2E tests
- [ ] Add troubleshooting guide
- [ ] Include screenshots if helpful

**Deliverables**:
- ✅ NPM scripts for quick launch
- ✅ VS Code task integration
- ✅ Enhanced development documentation

---

## Testing Scenarios for Inspector

### Scenario 1: Schema Discovery Workflow

**Goal**: Explore schema structure visually

**Steps**:
1. Launch Inspector → Connect to server
2. Authorize with `schema-read-token`
3. Navigate to **Tools** tab
4. Find `schema_listTypes` tool
5. Click **Execute** (no parameters needed)
6. Verify response shows all types
7. Test `schema_getTypeDetails` with `type_name: "Person"`
8. Explore returned properties and relationships

**Expected Result**: Visual confirmation that schema tools work correctly

---

### Scenario 2: Data Query Testing

**Goal**: Test data retrieval with various filters

**Steps**:
1. Authorize with `data-read-token`
2. Navigate to **Tools** → `data_getObjectsByType`
3. Test with parameters:
   ```json
   {
     "type": "Person",
     "limit": 5
   }
   ```
4. Verify response shows Person objects
5. Test filtering:
   ```json
   {
     "type": "Task",
     "limit": 10,
     "label": "high-priority"
   }
   ```
6. Check pagination with `cursor` parameter

**Expected Result**: Confirm data tools return correct objects

---

### Scenario 3: Authentication Validation

**Goal**: Verify auth scopes work correctly

**Steps**:
1. Connect with `no-scope` token
2. Try executing `schema_listTypes`
3. **Expected**: 403 Forbidden error
4. Disconnect → Reconnect with `schema-read-token`
5. Try `schema_listTypes` again
6. **Expected**: 200 Success with data
7. Try `data_getPersons`
8. **Expected**: 403 Forbidden (needs data:read)

**Expected Result**: Auth scope enforcement works as designed

---

### Scenario 4: Error Handling

**Goal**: Test error responses for invalid inputs

**Steps**:
1. Test `schema_getTypeDetails` with invalid type:
   ```json
   { "type_name": "NonExistentType" }
   ```
2. **Expected**: Error response with clear message
3. Test `data_getObjectById` with invalid ID:
   ```json
   { "id": "invalid-uuid" }
   ```
4. **Expected**: 404 Not Found error
5. Test `data_getObjectsByType` with invalid limit:
   ```json
   { "type": "Person", "limit": 1000 }
   ```
6. **Expected**: Validation error (max 100)

**Expected Result**: All errors handled gracefully with clear messages

---

### Scenario 5: Relationship Traversal

**Goal**: Test relationship discovery and traversal

**Steps**:
1. Use `data_getPersonById` to fetch a person
2. Note the person's ID
3. Use `data_getRelatedObjects`:
   ```json
   {
     "object_id": "<person_id>",
     "direction": "outgoing"
   }
   ```
4. Verify related objects (organizations, tasks, etc.)
5. Filter by relationship type:
   ```json
   {
     "object_id": "<person_id>",
     "relationship_type": "works_for",
     "direction": "outgoing"
   }
   ```

**Expected Result**: Relationship traversal works correctly

---

### Scenario 6: Performance Monitoring

**Goal**: Observe query performance and caching

**Steps**:
1. Execute `schema_listTypes` (cold cache)
2. Note response time in **Notifications** pane
3. Execute again immediately (warm cache)
4. Compare response times
5. Check `metadata.cached_until` timestamp
6. Wait for cache expiry (5 minutes)
7. Execute again (cache expired)
8. Verify new `schema_version` if schema changed

**Expected Result**: Caching improves performance, version tracking works

---

## Documentation Structure

### New Documentation Files

#### 1. `docs/MCP_INSPECTOR_USAGE.md`

**Contents**:
- Overview of MCP Inspector
- When to use Inspector vs E2E tests
- Installation and setup
- Launch commands for HTTP and stdio
- Testing scenarios (copy from above)
- Troubleshooting guide
- Screenshots of Inspector UI

#### 2. Update `RUNBOOK.md`

**Add section**:
```markdown
## Testing MCP Tools with Inspector

For interactive testing of MCP tools during development, use the MCP Inspector:

### Quick Start
```bash
# HTTP transport (easiest)
./scripts/mcp-inspector.sh

# Stdio transport (matches Claude Desktop)
./scripts/mcp-inspector-stdio.sh schema-read-token
```

### VS Code Integration
Use Tasks: Run Task → "MCP: Launch Inspector"

See [MCP_INSPECTOR_USAGE.md](docs/MCP_INSPECTOR_USAGE.md) for detailed guide.
```

#### 3. Update `README.md`

**Add section**:
```markdown
## Development Tools

### MCP Inspector
Interactive UI for testing MCP tools:
- `npm run mcp:inspect` - Launch Inspector (HTTP mode)
- See [MCP Inspector Usage Guide](docs/MCP_INSPECTOR_USAGE.md)
```

---

## Troubleshooting Guide

### Issue 1: Stdio Process Won't Start

**Symptom**: Inspector shows "Failed to start server" or immediate exit

**Solutions**:
1. Verify wrapper is compiled: `ls apps/server/dist/mcp-stdio.js`
2. Test manually: `node apps/server/dist/mcp-stdio.js`
3. Check database connection: `psql $DATABASE_URL`
4. Ensure NODE_ENV=test (enables mock tokens)
5. Check for console.log statements (interferes with stdio)

---

### Issue 2: Tools Not Appearing

**Symptom**: All tools return 401 Unauthorized

**Solutions**:
1. Verify token is passed correctly:
   ```bash
   # HTTP
   npx @modelcontextprotocol/inspector http://localhost:3001/mcp \
     --header "Authorization: Bearer schema-read-token"
   
   # Stdio
   node dist/mcp-stdio-wrapper.js --auth-token=schema-read-token
   ```
2. Check token is valid in `auth.service.ts` MOCK_TOKENS
3. Ensure `NODE_ENV=test` or auth is in test mode

---

### Issue 3: Tools Not Showing Up

**Symptom**: Inspector shows "No tools available"

**Solutions**:
1. Check server logs for MCP module initialization errors
2. Verify MCP controller is registered
3. Check if `@Tool()` decorators are applied correctly
4. Rebuild app: `npm --prefix apps/server run build`

---

### Issue 4: Stdio Transport Not Working

**Symptom**: Inspector hangs or shows connection timeout

**Solutions**:
1. Check wrapper script is compiled: `ls apps/server/dist/mcp-stdio-wrapper.js`
2. Test wrapper manually:
   ```bash
   node apps/server/dist/mcp-stdio-wrapper.js --auth-token=schema-read-token
   ```
3. Check for console.log in wrapper (interferes with stdio)
4. Verify Node.js version (requires 20+)

---

### Issue 5: CORS Errors (HTTP)

**Symptom**: Browser console shows CORS policy error

**Solutions**:
1. Add CORS headers to NestJS app:
   ```typescript
   app.enableCors({
     origin: true, // Allow all origins in dev
     credentials: true,
   });
   ```
2. Restart server after changes
3. Check if Inspector UI is served from different port

---

## Performance Considerations

### HTTP Transport
- **Latency**: ~10-50ms per request (local network)
- **Overhead**: HTTP headers (~200 bytes per request)
- **Concurrency**: Supports multiple simultaneous connections
- **Recommended for**: Auth testing, production-like scenarios

### Stdio Transport
- **Latency**: ~1-5ms per request (IPC)
- **Overhead**: Minimal (raw JSON)
- **Concurrency**: Single connection only
- **Recommended for**: Quick iteration, matching Claude Desktop

**Conclusion**: Use stdio for speed, HTTP for realism

---

## Security Notes

### Development Only ⚠️

**IMPORTANT**: MCP Inspector is for **development/testing ONLY**, not production!

**Why**:
1. **Test tokens**: Hardcoded in `auth.service.ts` (not secure)
2. **Open access**: No network restrictions in dev mode
3. **Verbose logging**: Exposes internal implementation details
4. **No rate limiting**: Could overload server with requests

### Safe Usage Practices

✅ **DO**:
- Use Inspector on local machine only
- Test with mock data, not production data
- Use test tokens from `auth.service.ts`
- Run Inspector in separate dev environment

❌ **DON'T**:
- Deploy Inspector to production servers
- Use with real user data
- Share Inspector URLs publicly
- Expose Inspector on public network
- Use production JWT tokens with Inspector

---

## Integration Timeline

### Phase 1: Stdio Wrapper (REQUIRED)
- **Time**: 60-90 minutes
- **Dependencies**: None (uses @modelcontextprotocol/sdk already installed)
- **Risk**: Low (standard MCP pattern)
- **Value**: ⭐⭐⭐⭐⭐ Maximum compatibility

### Phase 2: Testing & Validation (REQUIRED)
- **Time**: 30-45 minutes
- **Dependencies**: Phase 1 complete
- **Risk**: Low
- **Value**: ⭐⭐⭐⭐⭐ Ensures correctness

### Phase 3: Documentation (OPTIONAL)
- **Time**: 30-45 minutes
- **Dependencies**: Phase 2 complete
- **Risk**: Low
- **Value**: ⭐⭐⭐ Improved team DX

**Total Time Estimate**: 90-135 minutes for full integration (Phases 1-2 required, Phase 3 optional)

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Stdio wrapper compiles successfully
- [ ] `node dist/mcp-stdio.js` runs without errors
- [ ] Logs show "MCP server ready on stdio"
- [ ] Can spawn from Inspector: `npx @modelcontextprotocol/inspector node dist/mcp-stdio.js`
- [ ] Inspector UI loads and connects
- [ ] All 13 tools appear in Tools tab

### Phase 2 Complete When:
- [ ] All 13 tools can be executed from Inspector
- [ ] Authentication works with test tokens
- [ ] Responses match E2E test expectations
- [ ] Error handling displays correctly in Notifications pane
- [ ] Pagination works with cursor parameter
- [ ] Can reconnect after code changes (hot reload)

### Phase 3 Complete When:
- [ ] Launch script works: `./scripts/mcp-inspector.sh`
- [ ] Added to .vscode/mcp.json
- [ ] Documentation in RUNBOOK.md complete
- [ ] Team can launch Inspector in <30 seconds

---

## Alternative Tools Considered

### 1. Postman/Insomnia
- **Pros**: HTTP client, familiar to many developers
- **Cons**: Not MCP-aware, manual JSON construction, no tool discovery
- **Verdict**: Good for HTTP testing, not MCP-specific

### 2. Custom Admin UI
- **Pros**: Tailored to our needs, integrated with existing UI
- **Cons**: Development time (1-2 weeks), maintenance burden
- **Verdict**: Overkill for development testing

### 3. Claude Desktop
- **Pros**: Production MCP client, end-to-end testing
- **Cons**: Requires Anthropic API key, slower iteration, not dev-focused
- **Verdict**: Use for final validation, not daily development

### 4. MCP Inspector (CHOSEN)
- **Pros**: Official tool, MCP-native, interactive UI, fast iteration
- **Cons**: Additional dependency, learning curve
- **Verdict**: ✅ Best fit for development testing

---

## Next Steps After Integration

### Immediate (Week 1):
1. ✅ Complete Phase 1 (HTTP transport)
2. ✅ Test all 13 tools with Inspector
3. ✅ Document common testing workflows
4. ✅ Share with team for feedback

### Short-term (Weeks 2-3):
1. Evaluate need for Phase 2 (stdio)
2. Gather developer feedback on usability
3. Create video walkthrough of Inspector usage
4. Add Inspector testing to onboarding docs

### Long-term (Month 2+):
1. Consider custom testing UI for production monitoring
2. Integrate Inspector into CI/CD for smoke tests
3. Build automated Inspector test scenarios
4. Explore Inspector plugin system for custom features

---

## Related Documentation

- **Quick Start Guide**: `docs/MCP_INSPECTOR_QUICKSTART.md` ⭐ **START HERE**
- **MCP Implementation**: `docs/MCP_IMPLEMENTATION_SUMMARY.md`
- **Phase 4 Auth**: `docs/MCP_PHASE4_AUTH_COMPLETE.md`
- **Testing Summary**: `docs/MCP_TESTING_COMPLETE.md`
- **Official Docs**: https://modelcontextprotocol.io/docs/tools/inspector
- **Inspector Repo**: https://github.com/modelcontextprotocol/inspector

---

## Appendix A: Inspector CLI Reference

### HTTP Transport
```bash
# Basic connection
npx @modelcontextprotocol/inspector http://localhost:3001/mcp

# With auth header
npx @modelcontextprotocol/inspector http://localhost:3001/mcp \
  --header "Authorization: Bearer schema-read-token"

# With custom headers
npx @modelcontextprotocol/inspector http://localhost:3001/mcp \
  --header "Authorization: Bearer data-read-token" \
  --header "X-Request-ID: test-123"
```

### Stdio Transport
```bash
# Node.js server
npx @modelcontextprotocol/inspector node path/to/server.js arg1 arg2

# Python server (via uvx)
npx @modelcontextprotocol/inspector uvx mcp-server-name args...

# With environment variables
AUTH_TOKEN=schema-read-token \
  npx @modelcontextprotocol/inspector node path/to/server.js
```

### NPM Package
```bash
# From NPM registry
npx @modelcontextprotocol/inspector npx @org/package-name args...

# From PyPI
npx @modelcontextprotocol/inspector uvx package-name args...
```

---

## Appendix B: Example Test Session Workflow

### Typical Development Session

1. **Start Development**
   ```bash
   # Terminal 1: Start dev server
   npm --prefix apps/server run start:dev
   
   # Terminal 2: Launch Inspector
   ./scripts/mcp-inspector.sh
   ```

2. **Explore Schema Tools**
   - Open Inspector UI in browser
   - Navigate to Tools tab
   - Test `schema_listTypes` (no auth required yet)
   - Authenticate with `schema-read-token`
   - Test `schema_getTypeDetails` with various types

3. **Make Code Changes**
   - Edit tool implementation in `apps/server/src/modules/mcp/`
   - Save file (auto-rebuild with watch mode)
   - Click **Reconnect** in Inspector
   - Re-test affected tools

4. **Validate Changes**
   - Test happy path scenarios
   - Test error cases (invalid inputs)
   - Check Notifications pane for errors
   - Verify response format matches expectations

5. **Run Automated Tests**
   ```bash
   # Verify changes didn't break tests
   npm --prefix apps/server run test:e2e
   ```

6. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat(mcp): improve error handling in schema tools"
   ```

**Total Time**: 5-10 minutes per iteration (vs 20-30 min without Inspector)

---

## Conclusion

Integrating the MCP Inspector with **stdio transport** will provide:

1. **100% Compatibility**: Identical to Claude Desktop, Copilot, Gemini CLI connection method
2. **Realistic Testing**: Same transport, same protocol, same behavior as production
3. **Visual Feedback**: See tool responses in real-time through Inspector UI
4. **Faster Iteration**: Test changes without writing test code or launching full AI agent
5. **Confidence**: If it works in Inspector (stdio), it **will** work in Claude Desktop

**Critical Design Choice**: 
- ✅ **Stdio transport** = Maximum compatibility with AI agents
- ❌ HTTP transport = Different from production, auth handling mismatch

**Implementation Pattern**:
```
.vscode/mcp.json (Claude Desktop) → node dist/mcp-stdio.js
MCP Inspector                     → node dist/mcp-stdio.js
                                     ↑
                              SAME COMMAND!
```

**Recommendation**: Implement stdio wrapper (Phase 1) as the **only** integration approach.

**Effort**: 60-90 minutes for stdio wrapper, 30-45 minutes for testing  
**ROI**: ⭐⭐⭐⭐⭐ - Ensures production compatibility  
**Risk**: Low - standard MCP SDK pattern used by all stdio-based servers

---

**Status**: 📋 Ready for Implementation  
**Next Action**: Create `apps/server/src/mcp-stdio.ts` following Phase 1 implementation plan  
**Owner**: Development Team  
**Priority**: HIGH (required for realistic testing before Claude Desktop integration)
