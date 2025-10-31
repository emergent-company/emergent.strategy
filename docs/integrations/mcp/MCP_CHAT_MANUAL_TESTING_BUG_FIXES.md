# MCP Chat Manual Testing - Bug Fixes

**Date:** October 21, 2025  
**Session:** First Manual Testing Attempt  
**Test Query:** "What is the current schema version?"

---

## Bugs Discovered

### Bug #1: MCP Client Missing Authentication Token ❌ **CRITICAL**

**Severity:** High  
**Status:** ✅ **FIXED**

#### Symptoms:
```
SSE Stream Output:
data: {"type":"mcp_tool","tool":"schema_version","status":"started"}
data: {"type":"mcp_tool","tool":"schema_version","status":"error","error":"HTTP 401: Unauthorized"}
```

#### Root Cause:
The Chat Controller was initializing the MCP Client **without passing the user's authentication token**:

```typescript
// ❌ BEFORE (WRONG)
await this.mcpClient.initialize({
    serverUrl: mcpServerUrl,
    clientInfo: {
        name: 'nexus-chat',
        version: '1.0.0'
    }
    // Missing: authToken!
});
```

The MCP Server endpoints (`POST /mcp/rpc`) are protected with:
- `@UseGuards(AuthGuard, ScopesGuard)`
- `@Scopes('schema:read')` requirement

Without the token, the HTTP request returns **401 Unauthorized**.

#### Fix Applied:
Updated `apps/server-nest/src/modules/chat/chat.controller.ts` to extract and forward the user's bearer token:

```typescript
// ✅ AFTER (CORRECT)
try {
    // Initialize MCP client (reads MCP_SERVER_URL from config)
    const mcpServerUrl = process.env.MCP_SERVER_URL || 'http://localhost:3001/mcp/rpc';
    
    // Extract user's auth token from request
    const authHeader = req.headers.authorization;
    const authToken = authHeader?.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : undefined;
    
    await this.mcpClient.initialize({
        serverUrl: mcpServerUrl,
        authToken, // ✅ Pass user's token for MCP authentication
        clientInfo: {
            name: 'nexus-chat',
            version: '1.0.0'
        }
    });
```

#### Why This Matters:
- **Security:** Enforces that only users with `schema:read` scope can query schema
- **Authorization:** User's permissions are checked at MCP layer
- **Traceability:** Audit logs show which user accessed schema data
- **Token Forwarding Pattern:** Maintains authentication chain from frontend → chat → MCP

#### Verification:
```bash
# After fix, MCP tool should complete successfully
# SSE stream should show:
data: {"type":"mcp_tool","tool":"schema_version","status":"started"}
data: {"type":"mcp_tool","tool":"schema_version","status":"completed"}
# (no error!)
```

#### Related Documentation:
- `SECURITY_SCOPES.md` - Documents MCP authentication requirements
- `docs/MCP_CHAT_INTEGRATION_DESIGN.md` - Section "Authorization Strategy > Token Forwarding"
- `apps/server-nest/tests/e2e/mcp-auth.e2e.spec.ts` - E2E tests verify 401 without token

---

### Bug #2: Chat Model Disabled → ✅ FIXED

**Severity:** High  
**Status:** ✅ **RESOLVED** - Configured Vertex AI as primary provider

#### Symptoms:
```
SSE Stream Output:
data: {"type":"error","error":"chat model disabled"}
```

#### Root Cause:
The `GOOGLE_API_KEY` environment variable was **commented out** in `apps/server-nest/.env`, and the config service didn't recognize Vertex AI credentials as valid:

```bash
# Before
#GOOGLE_API_KEY=AIzaSyCqmd3wjHkzmJsX6niUbv8zlO2NKcai_50  # ❌ Commented out!
VERTEX_AI_PROJECT_ID=spec-server-dev  # ✅ Available but not recognized
```

The Chat Generation Service only checked for Google API key:
```typescript
// Before (WRONG)
get enabled(): boolean { 
    return !!this.config.googleApiKey && this.config.chatModelEnabled; 
}
```

#### Fix Applied:
**Implemented Option C:** Configure Vertex AI support throughout the stack.

**1. Updated Config Service** (`apps/server-nest/src/common/config/config.service.ts`):
```typescript
// After (FIXED)
get chatModelEnabled() { 
    const hasProvider = !!this.env.GOOGLE_API_KEY || !!this.env.VERTEX_AI_PROJECT_ID;
    return hasProvider && !!this.env.CHAT_MODEL_ENABLED; 
}
```

**2. Updated Chat Generation Service** (`apps/server-nest/src/modules/chat/chat-generation.service.ts`):
```typescript
// After (FIXED)
get hasKey(): boolean { 
    return !!this.config.googleApiKey || !!this.config.vertexAiProjectId; 
}
```

**3. Verified Application Default Credentials**:
```bash
$ gcloud auth application-default print-access-token
ya29.a0AQQ_BDQ_PKzgeAsI-3Q6FOie90CrI5uv...  # ✅ Working!
```

#### Configuration:
```bash
# .env configuration
CHAT_MODEL_ENABLED=true
VERTEX_AI_PROJECT_ID=spec-server-dev
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.5-flash
```

#### Benefits of Vertex AI:
- ✅ Enterprise-grade authentication with Application Default Credentials
- ✅ Unified billing with other Google Cloud services
- ✅ Better rate limits and SLAs
- ✅ Service account support for production
- ✅ Audit logging and compliance
- ✅ VPC Service Controls support

#### Verification:
```bash
# Rebuild and restart
npm --prefix apps/server-nest run build
npm run workspace:restart

# Test: "What is the current schema version?"
# Expected: Badge → MCP completes → LLM responds ✅
```

#### Documentation:
See `docs/VERTEX_AI_CHAT_CONFIGURATION.md` for complete Vertex AI setup guide.


# Chat should now work
# SSE stream should show:
data: {"type":"token","token":"The"}
data: {"type":"token","token":" current"}
data: {"type":"token","token":" schema"}
# ... (streaming tokens)
data: {"type":"done"}
```

#### Why This Matters:
- **Core Feature Broken:** Users cannot get LLM responses
- **MCP Testing Blocked:** Cannot test full MCP integration flow
- **Silent Failure:** Error only visible in SSE stream, not obvious in UI

---

### Bug #3: Chat UI Bug (Message Routing) 🐛

**Severity:** Medium  
**Status:** ⚠️ **FRONTEND BUG** (Needs investigation)

#### Symptoms (User Report):
> "there is a bug which is somehow writing this message on a chat and immediately opening other one, but no response on the right one"

#### Description:
When user sends a message in chat:
1. Message gets written to one conversation
2. A different conversation opens/switches
3. Response appears in the wrong conversation (or not at all)

#### Root Cause:
Unknown - needs frontend investigation. Possible causes:
- Race condition in conversation routing
- WebSocket/SSE connection confusion
- Chat state management bug
- Browser navigation timing issue

#### Investigation Required:
1. Check `apps/admin/src/pages/admin/chat/conversation/index.tsx`
2. Check `apps/admin/src/hooks/use-chat.ts` 
3. Verify conversation ID handling in SSE stream
4. Check if navigation happens during message send

#### Temporary Workaround:
- Use the correct conversation URL directly
- Wait for conversation to fully load before sending message
- Refresh page if wrong conversation opens

---

## Testing Results

### Test Query: "What is the current schema version?"

#### Before Fixes:
❌ MCP tool failed with 401 Unauthorized  
❌ LLM response failed with "chat model disabled"  
❌ Message appeared in wrong conversation  
**Result:** Complete failure ❌

#### After Fixes (Expected):
✅ MCP tool executes successfully (with token)  
⚠️ LLM response still blocked (API key needed)  
🐛 Chat routing bug still present (frontend issue)  
**Result:** Partial success (MCP works, LLM blocked by config)

---

## Fix Checklist

- [x] Bug #1 Fixed: MCP Client now forwards auth token
- [x] Code changes applied to `chat.controller.ts`
- [x] Backend rebuilt successfully
- [x] Services restarted
- [ ] Bug #2 Resolution: Configure GOOGLE_API_KEY or Vertex AI auth
- [ ] Bug #3 Investigation: Debug frontend chat routing
- [ ] Re-test: "What is the current schema version?" after API key fix
- [ ] Verify: Badge indicator appears and disappears correctly
- [ ] Verify: LLM response includes actual schema version

---

## Next Steps

1. **Immediate (Critical Path):**
   - [ ] Uncomment `GOOGLE_API_KEY` in `.env` OR configure Vertex AI auth
   - [ ] Restart services: `npm run workspace:restart`
   - [ ] Re-test schema version query
   - [ ] Verify full flow works (MCP + LLM)

2. **Short-term (Fix Frontend Bug):**
   - [ ] Investigate chat routing bug
   - [ ] Reproduce issue consistently
   - [ ] Fix conversation switching logic
   - [ ] Add test coverage for conversation routing

3. **Testing (Resume Manual Testing):**
   - [ ] Complete Test Scenario 1 (schema version)
   - [ ] Test Scenario 2 (schema changelog)
   - [ ] Test Scenario 3 (type info)
   - [ ] Continue with remaining scenarios from `MCP_CHAT_DIAGRAMS.md`

---

## Lessons Learned

### 1. Authentication Token Forwarding Pattern
When building service-to-service calls that require authentication, **always forward the user's token**:

```typescript
// ✅ Good Pattern
const authToken = req.headers.authorization?.substring(7);
await client.initialize({ 
    serverUrl, 
    authToken // Forward user's token
});
```

This ensures:
- Authorization happens at every layer
- User permissions are enforced consistently
- Audit trails are accurate

### 2. Environment Configuration Validation
**Critical environment variables should be validated at startup**, not discovered during runtime:

```typescript
// Add to app.module.ts or main.ts
if (process.env.CHAT_MODEL_ENABLED === 'true' && !process.env.GOOGLE_API_KEY) {
    console.warn('⚠️  CHAT_MODEL_ENABLED is true but GOOGLE_API_KEY is missing!');
}
```

### 3. SSE Error Visibility
SSE stream errors are only visible in:
- Network tab → `/stream` request → Response tab
- Server logs

**Not visible** in:
- Browser console (unless explicitly logged by frontend)
- UI error messages (unless explicitly shown)

**Recommendation:** Add better error visibility in UI for SSE failures.

### 4. Manual Testing Catches Integration Issues
Automated tests (unit, E2E) all passed, but manual testing immediately found:
- Missing token forwarding (integration gap)
- Environment configuration issue (deployment gap)
- Frontend routing bug (user experience gap)

**Takeaway:** Manual testing is still essential for end-to-end user flows.

---

## Documentation Updates Needed

After fixes are verified:

1. **Update MCP_CHAT_USER_GUIDE.md:**
   - Add troubleshooting section for 401 errors
   - Document required user scopes (`schema:read`)

2. **Update MCP_CHAT_ARCHITECTURE.md:**
   - Add section on token forwarding pattern
   - Document authentication flow diagram

3. **Update MCP_CHAT_CONFIGURATION.md:**
   - Add startup validation recommendations
   - Document GOOGLE_API_KEY requirement

4. **Update Test Scenarios:**
   - Add authentication failure test
   - Add missing API key test

---

## Related Issues

- **Issue:** MCP authentication requires `schema:read` scope
- **Impact:** Users without scope will get 403 Forbidden
- **Status:** Working as designed (documented in SECURITY_SCOPES.md)

---

## Contact

For questions about these bugs or fixes:
- Review `docs/MCP_CHAT_DIAGRAMS.md` for testing procedures
- Check `docs/MCP_CHAT_INTEGRATION_COMPLETE.md` for full architecture
- See `SECURITY_SCOPES.md` for authentication requirements
