# MCP Inspector Quick Start Guide

**Goal**: Learn how MCP Inspector works by testing existing servers

---

## What You'll Learn

By testing existing MCP servers with Inspector, you'll understand:
- How Inspector UI works (Tools tab, execution, responses)
- What a good MCP tool looks like (descriptions, parameters)
- How stdio transport works (same as Claude Desktop)
- What response format to expect
- How error handling should work

---

## Try These Examples Now!

### 1. Postgres MCP Server (Database Tools) ⭐ START HERE

**Command**:
```bash
npx @modelcontextprotocol/inspector \
  npx -y @modelcontextprotocol/server-postgres \
  postgresql://spec:spec@localhost:5432/spec
```

**What you'll see**:
- Inspector opens in browser (http://localhost:5173 or similar)
- Tools tab shows: `query`, `list_tables`, `describe_table`, etc.
- Can execute SQL queries interactively

**Try this**:
1. Click on `list_tables` tool
2. Click "Execute" (no parameters needed)
3. See list of your database tables in response
4. Try `describe_table` with parameter: `{"table_name": "users"}`

**Why this matters**: Your spec-server will work exactly the same way!

---

### 2. Playwright MCP Server (Browser Automation)

**Command**:
```bash
npx @modelcontextprotocol/inspector \
  npx @playwright/mcp@latest \
  --timeout-action=10000
```

**What you'll see**:
- Browser automation tools
- Tools like `playwright_navigate`, `playwright_click`, `playwright_screenshot`
- Can control browser through Inspector

**Try this**:
1. Look at tool descriptions (clear, actionable)
2. Check parameter schemas (well-defined types)
3. See how complex tools are documented

---

### 3. Context7 MCP Server (Documentation Search)

**Command**:
```bash
npx @modelcontextprotocol/inspector \
  npx -y @upstash/context7-mcp \
  --api-key ctx7sk-77ad3f0a-32a5-4b23-8b82-1431d078b1c6
```

**What you'll see**:
- Documentation search tools
- Library resolution tools
- Code example retrieval

**Try this**:
1. Execute `resolve-library-id` with: `{"libraryName": "react"}`
2. See how it returns library IDs
3. Use returned ID with `get-library-docs`

---

## Understanding Inspector UI

### Main Sections

1. **Connection Pane** (top)
   - Shows connection status
   - Server info (name, version)
   - Reconnect button

2. **Tools Tab** (left sidebar)
   - Lists all available tools
   - Click to see details
   - Shows parameter schemas

3. **Tool Details** (center)
   - Tool description
   - Parameter form
   - Execute button
   - Response area

4. **Notifications Pane** (bottom)
   - Server logs
   - Error messages
   - Debug info

### Typical Workflow

1. **Connect**: Inspector spawns MCP server
2. **Explore**: Browse tools in sidebar
3. **Test**: Fill parameters, click Execute
4. **Inspect**: View response JSON
5. **Iterate**: Modify parameters, re-execute
6. **Debug**: Check Notifications for errors

---

## Key Observations

### Good Tool Design (Learn from Examples)

**Clear Names**:
- ✅ `list_tables` - obvious what it does
- ❌ `get_data` - too generic

**Good Descriptions**:
- ✅ "List all tables in the database with row counts"
- ❌ "Gets tables"

**Well-Defined Parameters**:
```json
{
  "type": "object",
  "properties": {
    "table_name": {
      "type": "string",
      "description": "Name of the table to describe"
    }
  },
  "required": ["table_name"]
}
```

**Clean Responses**:
```json
{
  "success": true,
  "data": { ... },
  "metadata": { ... }
}
```

---

## How This Connects to Your Work

### The Pattern You're Implementing

```
Inspector → Spawns → node dist/mcp-stdio.js → Your 13 MCP Tools
            (stdio)
```

**Same as postgres**:
```
Inspector → Spawns → npx @modelcontextprotocol/server-postgres → Database Tools
            (stdio)
```

**Same as Claude Desktop**:
```
Claude → Spawns → node dist/mcp-stdio.js → Your 13 MCP Tools
         (stdio)
```

**Key Point**: If postgres MCP server works in Inspector, yours will too (same pattern)!

---

## Common Issues & Solutions

### Issue: Inspector Won't Start

**Solution**: 
```bash
# Clear npx cache if needed
rm -rf ~/.npm/_npx

# Try again
npx @modelcontextprotocol/inspector ...
```

### Issue: Connection Failed

**Cause**: MCP server crashed during startup

**Solution**: Check server logs in terminal (stderr output)

### Issue: Tools Not Appearing

**Cause**: Server didn't respond to `tools/list` request

**Solution**: Server must implement `ListToolsRequestSchema` handler

### Issue: Database Connection Error (Postgres Example)

**Solution**: 
```bash
# Verify database is running
psql postgresql://spec:spec@localhost:5432/spec

# Check connection string format
```

---

## Next Steps

After trying these examples:

1. ✅ You understand how Inspector works
2. ✅ You see what good MCP tools look like
3. ✅ You know the stdio transport pattern
4. ✅ Ready to implement your own stdio wrapper!

**Now proceed to**: `MCP_INSPECTOR_INTEGRATION_PLAN.md` Phase 1 - Stdio Wrapper Implementation

---

## Comparison: Before & After

### Before (Current State)
```bash
# Test your MCP tools
curl -H "Authorization: Bearer schema-read-token" \
  http://localhost:3001/mcp/schema/version

# Manual JSON construction, no UI
```

### After (With Inspector)
```bash
# Test your MCP tools (same as Claude Desktop!)
npx @modelcontextprotocol/inspector \
  node apps/server/dist/mcp-stdio.js

# Interactive UI, same transport as production
```

---

## Reference: All Your MCP Servers

From `.vscode/mcp.json`:

| Server | Transport | Test Command |
|--------|-----------|--------------|
| **postgres** | stdio | `npx @modelcontextprotocol/inspector npx -y @modelcontextprotocol/server-postgres postgresql://spec:spec@localhost:5432/spec` |
| **playwright** | stdio | `npx @modelcontextprotocol/inspector npx @playwright/mcp@latest --timeout-action=10000` |
| **context7** | stdio | `npx @modelcontextprotocol/inspector npx -y @upstash/context7-mcp --api-key ctx7sk-...` |
| **figma** | http | Not testable with Inspector (different transport) |
| **gh_grep** | http | Not testable with Inspector (different transport) |
| **react-daisyui** | sse | Not testable with Inspector (different transport) |

**Conclusion**: 3 out of 6 servers use stdio (the standard for AI agents) - that's what you're implementing!

---

**Time to Complete**: 10-15 minutes  
**Outcome**: Deep understanding of MCP Inspector and stdio transport pattern  
**Next**: Implement your own stdio wrapper following the same pattern!
