# MCP Inspector Integration Plan (Development Only)

**Date**: 2025-10-20  
**Status**: 📋 PLANNED  
**Purpose**: Integrate MCP Inspector for local testing and debugging of MCP server implementation  
**Environment**: Development/Testing Only (Not for Production)

---

## Executive Summary

This document outlines the plan to integrate the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) into our development workflow for testing and debugging the spec-server MCP implementation. The Inspector provides an interactive UI for exploring tools, testing parameters, and monitoring server responses.

**Goal**: Enable developers to test and validate MCP tools locally without requiring Claude Desktop or other AI agent clients.

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

### Option 1: Stdio Transport (RECOMMENDED)

**How it works**:
```
Inspector (npx) → Spawns → NestJS App (stdio mode) → MCP Protocol → Tools
```

**Advantages**:
- ✅ Simple setup (no HTTP server required)
- ✅ Matches Claude Desktop transport
- ✅ Built-in process management
- ✅ No port conflicts

**Disadvantages**:
- ⚠️ Requires creating stdio transport wrapper
- ⚠️ Auth tokens need special handling
- ⚠️ Limited to single session

**Command**:
```bash
npx @modelcontextprotocol/inspector node path/to/stdio-wrapper.js --auth-token=schema-read-token
```

---

### Option 2: HTTP/SSE Transport (ALTERNATIVE)

**How it works**:
```
Inspector (web UI) → HTTP/SSE → NestJS HTTP Server → MCP Controller → Tools
```

**Advantages**:
- ✅ Works with existing HTTP server
- ✅ No wrapper needed
- ✅ Matches production transport
- ✅ Can test auth headers naturally

**Disadvantages**:
- ⚠️ Requires server to be running separately
- ⚠️ Need to configure HTTP transport in Inspector
- ⚠️ More complex connection setup

**Command**:
```bash
# Terminal 1: Start server
npm --prefix apps/server-nest run start:dev

# Terminal 2: Start inspector
npx @modelcontextprotocol/inspector http://localhost:3001/mcp
```

---

### Option 3: NPM Package Transport (NOT RECOMMENDED)

**Why not recommended**:
- ❌ Our server is not published as NPM package
- ❌ Would require packaging just for testing
- ❌ Adds unnecessary complexity
- ❌ Harder to test local changes

---

## Recommended Approach: Hybrid Strategy

Use **both transports** for different scenarios:

### Development Flow:
1. **Quick iteration** → Use **stdio** (fast reconnects)
2. **Auth testing** → Use **HTTP** (real auth headers)
3. **Final validation** → Use **HTTP** (production-like)

---

## Implementation Plan

### Phase 1: HTTP Transport Integration (EASIEST - START HERE)

**Goal**: Get Inspector working with existing HTTP server  
**Time**: 30-45 minutes  
**Risk**: Low

#### Tasks

##### 1.1 Verify HTTP Transport Compatibility (15 min)
- [ ] Check if current MCP endpoints support SSE
- [ ] Test connection from Inspector to running server
- [ ] Verify CORS headers if needed

##### 1.2 Create Inspector Launch Script (10 min)
```bash
# scripts/mcp-inspector.sh
#!/bin/bash

# Ensure server is running
echo "🔍 Starting MCP Inspector..."
echo "📡 Connecting to http://localhost:3001/mcp"
echo ""
echo "Available test tokens:"
echo "  - schema-read-token (schema:read)"
echo "  - data-read-token (schema:read, data:read)"
echo "  - data-write-token (all data scopes)"
echo "  - e2e-all (all scopes)"
echo ""

# Launch inspector
npx @modelcontextprotocol/inspector http://localhost:3001/mcp \
  --header "Authorization: Bearer schema-read-token"
```

- [ ] Create script at `scripts/mcp-inspector.sh`
- [ ] Make executable: `chmod +x scripts/mcp-inspector.sh`
- [ ] Test launch

##### 1.3 Document Usage (10 min)
- [ ] Add section to `README.md` or `RUNBOOK.md`
- [ ] Document available test tokens
- [ ] Add troubleshooting tips

##### 1.4 Validate All Tools (10 min)
- [ ] Test `schema_listTypes` with Inspector
- [ ] Test `schema_getTypeDetails` with parameters
- [ ] Test `data_getObjectsByType` with filters
- [ ] Verify error handling for invalid inputs

**Deliverables**:
- ✅ Launch script
- ✅ Documentation in RUNBOOK.md
- ✅ Validated tool testing workflow

---

### Phase 2: Stdio Transport Integration (OPTIONAL - MORE REALISTIC)

**Goal**: Test with stdio transport (matches Claude Desktop)  
**Time**: 1-2 hours  
**Risk**: Medium (requires new code)

#### Tasks

##### 2.1 Create Stdio Wrapper (60 min)

**File**: `apps/server-nest/src/mcp-stdio-wrapper.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { McpModule } from './modules/mcp/mcp.module';

/**
 * MCP Inspector Stdio Wrapper
 * 
 * Launches NestJS app with stdio transport for MCP Inspector testing.
 * Usage: node dist/mcp-stdio-wrapper.js --auth-token=<token>
 */
async function bootstrap() {
  // Parse auth token from CLI args
  const args = process.argv.slice(2);
  const tokenArg = args.find(arg => arg.startsWith('--auth-token='));
  const authToken = tokenArg?.split('=')[1] || 'schema-read-token';

  // Create app
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'], // Reduce noise in stdio
  });

  // Get MCP service
  const mcpService = app.get(McpModule);

  // Set up stdio transport
  process.stdin.on('data', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      // Add auth context from CLI token
      const context = { authToken };
      
      // Route to MCP service
      const response = await mcpService.handleMessage(message, context);
      
      // Write response to stdout
      process.stdout.write(JSON.stringify(response) + '\n');
    } catch (error) {
      // Error handling
      const errorResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: error.message,
        },
        id: null,
      };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
    }
  });

  // Handle process termination
  process.on('SIGINT', async () => {
    await app.close();
    process.exit(0);
  });

  console.error('MCP Server ready on stdio (token: ' + authToken + ')');
}

bootstrap();
```

- [ ] Create wrapper file
- [ ] Add build step to compile wrapper
- [ ] Test with Inspector

##### 2.2 Update Launch Script (15 min)

```bash
# scripts/mcp-inspector-stdio.sh
#!/bin/bash

TOKEN=${1:-schema-read-token}

echo "🔍 Starting MCP Inspector (stdio mode)..."
echo "🔑 Using token: $TOKEN"
echo ""

# Build wrapper if needed
npm --prefix apps/server-nest run build

# Launch inspector with stdio transport
npx @modelcontextprotocol/inspector \
  node apps/server-nest/dist/mcp-stdio-wrapper.js \
  --auth-token=$TOKEN
```

- [ ] Create stdio launch script
- [ ] Make executable
- [ ] Document in RUNBOOK.md

##### 2.3 Validate Stdio Transport (15 min)
- [ ] Test connection from Inspector
- [ ] Verify tool invocations work
- [ ] Test authentication with different tokens
- [ ] Compare with HTTP transport results

**Deliverables**:
- ✅ Stdio wrapper implementation
- ✅ Stdio launch script
- ✅ Documentation for both transports

---

### Phase 3: Development Workflow Integration (OPTIONAL)

**Goal**: Streamline Inspector usage in daily development  
**Time**: 30-45 minutes  
**Risk**: Low

#### Tasks

##### 3.1 Add NPM Scripts (10 min)

Update `apps/server-nest/package.json`:
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

### Issue 1: Connection Failed (HTTP)

**Symptom**: Inspector shows "Connection failed" error

**Solutions**:
1. Ensure server is running: `npm --prefix apps/server-nest run start:dev`
2. Check server logs for errors
3. Verify port 3001 is accessible: `curl http://localhost:3001/health`
4. Check firewall/network settings

---

### Issue 2: Authentication Errors

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
4. Rebuild app: `npm --prefix apps/server-nest run build`

---

### Issue 4: Stdio Transport Not Working

**Symptom**: Inspector hangs or shows connection timeout

**Solutions**:
1. Check wrapper script is compiled: `ls apps/server-nest/dist/mcp-stdio-wrapper.js`
2. Test wrapper manually:
   ```bash
   node apps/server-nest/dist/mcp-stdio-wrapper.js --auth-token=schema-read-token
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

### Phase 1: HTTP Transport (RECOMMENDED START)
- **Time**: 30-45 minutes
- **Dependencies**: None (uses existing HTTP server)
- **Risk**: Low
- **Value**: Immediate testing capability

### Phase 2: Stdio Transport (OPTIONAL)
- **Time**: 1-2 hours
- **Dependencies**: Phase 1 complete
- **Risk**: Medium (new code)
- **Value**: More realistic Claude Desktop testing

### Phase 3: Workflow Integration (OPTIONAL)
- **Time**: 30-45 minutes
- **Dependencies**: Phase 1 or 2 complete
- **Risk**: Low
- **Value**: Improved developer experience

**Total Time Estimate**: 2-3.5 hours for complete integration

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Inspector connects to HTTP server
- [ ] Can authenticate with test tokens
- [ ] All 13 tools visible in Inspector UI
- [ ] Can execute tools with parameters
- [ ] Errors display correctly in Notifications pane
- [ ] Launch script documented in RUNBOOK.md

### Phase 2 Complete When:
- [ ] Stdio wrapper compiles and runs
- [ ] Inspector connects via stdio transport
- [ ] Tool invocations work same as HTTP
- [ ] Auth tokens passed correctly via CLI
- [ ] Both transports documented

### Phase 3 Complete When:
- [ ] NPM scripts work: `npm run mcp:inspect`
- [ ] VS Code tasks integrate Inspector
- [ ] Documentation updated with workflow guide
- [ ] Team can use Inspector without guidance

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
   npm --prefix apps/server-nest run start:dev
   
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
   - Edit tool implementation in `apps/server-nest/src/modules/mcp/`
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
   npm --prefix apps/server-nest run test:e2e
   ```

6. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat(mcp): improve error handling in schema tools"
   ```

**Total Time**: 5-10 minutes per iteration (vs 20-30 min without Inspector)

---

## Conclusion

Integrating the MCP Inspector will significantly improve our development workflow by providing:

1. **Visual Feedback**: See tool responses in real-time
2. **Faster Iteration**: Test changes without writing test code
3. **Better Debugging**: Monitor logs and messages interactively
4. **Easier Onboarding**: New developers can explore tools visually
5. **Validation**: Confirm tools work before AI agent testing

**Recommendation**: Start with **Phase 1 (HTTP Transport)** for immediate value, then evaluate Phase 2/3 based on team feedback.

**Effort**: 30-45 minutes for Phase 1, 2-3.5 hours for all phases  
**ROI**: High - improves daily development workflow  
**Risk**: Low - isolated to development environment

---

**Status**: 📋 Ready for Implementation  
**Next Action**: Create PR with Phase 1 implementation (HTTP transport + launch script)  
**Owner**: Development Team  
**Priority**: Medium (Nice-to-have for improved DX)
