# Plan: Remove ClickUp SDK and Use Plain HTTP Requests

**Status**: ✅ **COMPLETED** - November 2, 2024  
**Implementation Details**: See `docs/CLICKUP_SDK_REMOVAL_COMPLETE.md`  
**Result**: All SDK methods replaced with fetch(), Docker builds successfully, ES module error fixed

## Problem Statement

The ClickUp SDK (`@api/clickup`) is causing deployment issues:
- It's an ES module (`.mjs`) being loaded by CommonJS `require()`
- TypeScript's `import()` is compiled to `require()` due to `module: "CommonJS"` in tsconfig
- The SDK is a local file dependency that complicates Docker builds
- The SDK adds unnecessary complexity and maintenance burden

## Current State Analysis

### What's Already Using Plain HTTP

✅ **Already migrated to `fetch()`:**
- `getWorkspaces()` - GET `/api/v2/team`
- `getSpaces()` - GET `/api/v2/team/:workspaceId/space`
- `getFolders()` - GET `/api/v2/space/:spaceId/folder`
- `getLists()` - GET `/api/v2/folder/:folderId/list`
- `getTasksInList()` - GET `/api/v2/list/:listId/task`

### What Still Uses SDK

❌ **Need to migrate (v2 API):**
1. `getTask()` - `this.sdk.getTask({ task_id, include_subtasks })`
2. `getTaskComments()` - `this.sdk.getTaskComments({ task_id })`
3. `getListComments()` - `this.sdk.getListComments({ list_id })`
4. `searchTasks()` - `this.sdk.getFilteredTeamTasks({ team_Id, query, page, order_by, reverse })`

❌ **Need to migrate (v3 API - Docs):**
5. `getDocs()` - `this.sdk.searchDocs({ workspaceId, next_cursor, parent_id, parent_type })`
6. `getDoc()` - `this.sdk.getDoc({ workspaceId, docId })`
7. `getDocPages()` - `this.sdk.getDocPages({ workspaceId, docId })`
8. `getPage()` - `this.sdk.getPage({ workspaceId, docId, pageId })`

## Migration Steps

### Phase 1: Replace SDK Methods with HTTP Calls (30 min)

#### 1.1 Replace v2 API Methods

**getTask()**
```typescript
// FROM: this.sdk.getTask({ task_id, include_subtasks })
// TO:
const url = new URL(`https://api.clickup.com/api/v2/task/${taskId}`);
if (includeSubtasks) {
    url.searchParams.set('include_subtasks', 'true');
}
const response = await fetch(url.toString(), {
    headers: {
        'Authorization': this.apiToken,
        'Content-Type': 'application/json',
    },
});
```

**getTaskComments()**
```typescript
// FROM: this.sdk.getTaskComments({ task_id })
// TO:
const response = await fetch(
    `https://api.clickup.com/api/v2/task/${taskId}/comment`,
    {
        headers: {
            'Authorization': this.apiToken,
            'Content-Type': 'application/json',
        },
    }
);
```

**getListComments()**
```typescript
// FROM: this.sdk.getListComments({ list_id: parseInt(listId) })
// TO:
const response = await fetch(
    `https://api.clickup.com/api/v2/list/${listId}/comment`,
    {
        headers: {
            'Authorization': this.apiToken,
            'Content-Type': 'application/json',
        },
    }
);
```

**searchTasks()**
```typescript
// FROM: this.sdk.getFilteredTeamTasks({ team_Id, query, page, order_by, reverse })
// TO:
const url = new URL(`https://api.clickup.com/api/v2/team/${workspaceId}/task`);
url.searchParams.set('query', query);
if (options.page) url.searchParams.set('page', options.page.toString());
if (options.orderBy) url.searchParams.set('order_by', options.orderBy);
if (options.reverse) url.searchParams.set('reverse', 'true');

const response = await fetch(url.toString(), {
    headers: {
        'Authorization': this.apiToken,
        'Content-Type': 'application/json',
    },
});
```

#### 1.2 Replace v3 API Methods (Docs)

**getDocs()**
```typescript
// FROM: this.sdk.searchDocs({ workspaceId, next_cursor, parent_id, parent_type })
// TO:
const url = new URL(`https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs`);
if (cursor) url.searchParams.set('cursor', cursor);
if (parentId) url.searchParams.set('parent', parentId);
if (parentType) url.searchParams.set('parent_type', parentType);

const response = await fetch(url.toString(), {
    headers: {
        'Authorization': this.apiToken,
        'Content-Type': 'application/json',
    },
});
```

**getDoc()**
```typescript
// FROM: this.sdk.getDoc({ workspaceId, docId })
// TO:
const response = await fetch(
    `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}`,
    {
        headers: {
            'Authorization': this.apiToken,
            'Content-Type': 'application/json',
        },
    }
);
```

**getDocPages()**
```typescript
// FROM: this.sdk.getDocPages({ workspaceId, docId })
// TO:
const response = await fetch(
    `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}/pages`,
    {
        headers: {
            'Authorization': this.apiToken,
            'Content-Type': 'application/json',
        },
    }
);
```

**getPage()**
```typescript
// FROM: this.sdk.getPage({ workspaceId, docId, pageId })
// TO:
const response = await fetch(
    `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}/pages/${pageId}`,
    {
        headers: {
            'Authorization': this.apiToken,
            'Content-Type': 'application/json',
        },
    }
);
```

### Phase 2: Refactor Code Structure (15 min)

#### 2.1 Remove SDK Initialization
- Delete `initializeSdk()` method
- Delete `ensureSdkLoaded()` method
- Delete `sdkInitPromise` property
- Delete `sdk` property
- Simplify `configure()` method

#### 2.2 Replace sdkCall Wrapper
- Delete `sdkCall()` helper method
- Move rate limiting and error handling directly into each method
- Or create new `httpCall()` helper that wraps fetch

#### 2.3 Update Constructor
```typescript
// FROM:
constructor() {
    this.logger = new Logger(ClickUpApiClient.name);
    this.rateLimiter = new RateLimiter();
    this.sdkInitPromise = this.initializeSdk();
}

// TO:
constructor() {
    this.logger = new Logger(ClickUpApiClient.name);
    this.rateLimiter = new RateLimiter();
}
```

#### 2.4 Update Configure Method
```typescript
// FROM:
async configure(apiToken: string): Promise<void> {
    if (!apiToken) {
        throw new Error('ClickUp API token is required');
    }
    await this.ensureSdkLoaded();
    this.apiToken = apiToken;
    this.sdk.auth(apiToken);
    this.sdk.config({ timeout: 30000 });
    this.logger.log(`ClickUp API client configured...`);
}

// TO:
configure(apiToken: string): void {
    if (!apiToken) {
        throw new Error('ClickUp API token is required');
    }
    this.apiToken = apiToken;
    this.logger.log(`ClickUp API client configured with token: ${apiToken.substring(0, 10)}...`);
}
```

### Phase 3: Clean Up Dependencies (5 min)

#### 3.1 Remove Package Dependency
```bash
# Remove from package.json dependencies
"@api/clickup": "file:.api/apis/clickup"  # DELETE THIS LINE
```

#### 3.2 Remove Local Files
```bash
rm -rf apps/server/.api
```

#### 3.3 Remove Dockerfile Symlink Logic
In `apps/server/Dockerfile`, remove:
```dockerfile
# DELETE THESE LINES:
COPY --from=builder /build/apps/server/.api ./.api
RUN mkdir -p node_modules/@api && \
    ln -sf /app/.api/apis/clickup node_modules/@api/clickup
```

#### 3.4 Update TypeScript Config
In `apps/server/tsconfig.json`:
```jsonc
"exclude": [
    "dist",
    "node_modules",
    "**/*.spec.ts",
    "**/__tests__/**",
    ".api"  // DELETE THIS LINE (no longer needed)
]
```

### Phase 4: Create HTTP Helper Method (10 min)

Add a reusable helper to reduce code duplication:

```typescript
/**
 * Helper method to make HTTP requests with rate limiting and error handling
 */
private async httpCall<T>(
    url: string,
    options: RequestInit = {},
    methodName: string
): Promise<T> {
    if (!this.apiToken) {
        throw new Error('ClickUp API client not configured. Call configure() first.');
    }

    // Wait for rate limiter
    await this.rateLimiter.waitForSlot();

    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': this.apiToken,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Log API responses for debugging (redact sensitive data)
        if (process.env.NODE_ENV !== 'production') {
            this.logger.debug(`HTTP Call: ${methodName}`);
            this.logger.debug(`Response data: ${JSON.stringify(data).substring(0, 500)}...`);
        }

        return data as T;
    } catch (error) {
        const err = error as Error;
        this.logger.error(`ClickUp API error in ${methodName}: ${err.message}`);
        throw new Error(`ClickUp API request failed: ${err.message}`);
    }
}
```

Then use it in methods:
```typescript
async getTask(taskId: string, includeSubtasks: boolean = false): Promise<ClickUpTask> {
    const url = new URL(`https://api.clickup.com/api/v2/task/${taskId}`);
    if (includeSubtasks) {
        url.searchParams.set('include_subtasks', 'true');
    }
    return this.httpCall<ClickUpTask>(url.toString(), {}, 'getTask');
}
```

### Phase 5: Testing (10 min)

#### 5.1 Local Testing
```bash
# Rebuild
npm run build:server

# Test integration (requires real API token)
CLICKUP_API_TOKEN=pk_xxx CLICKUP_WORKSPACE_ID=ws_xxx npm run test:clickup
```

#### 5.2 Docker Testing
```bash
# Rebuild Docker image
docker-compose -f docker-compose.coolify.yml build --no-cache server

# Start container
docker-compose -f docker-compose.coolify.yml up -d server

# Check logs
docker-compose -f docker-compose.coolify.yml logs -f server
```

#### 5.3 Verify Endpoints
Test each migrated endpoint with actual API calls in the integration.

### Phase 6: Deployment (5 min)

#### 6.1 Commit Changes
```bash
git add .
git commit -m "refactor: Replace ClickUp SDK with plain HTTP fetch requests

- Remove @api/clickup dependency and local SDK files
- Replace all SDK method calls with direct fetch() to ClickUp API
- Simplify client initialization (no async SDK loading)
- Remove ES module / CommonJS compatibility issues
- Remove Docker symlink complexity for @api/clickup
- Add httpCall() helper method for DRY code
- Maintain rate limiting and error handling

Fixes Docker deployment issues with ES module imports"

git push
```

#### 6.2 Monitor Coolify Deployment
- Watch build logs for successful compilation
- Check server startup logs for clean initialization
- Verify health endpoint responds
- Test ClickUp integration endpoints

## Benefits

1. ✅ **Fixes Docker Deployment** - No more ES module / CommonJS conflicts
2. ✅ **Simpler Code** - Direct API calls are more readable than SDK wrappers
3. ✅ **Easier Debugging** - Can see exact HTTP requests and responses
4. ✅ **No Version Conflicts** - SDK was causing path-to-regexp issues
5. ✅ **Reduced Dependencies** - One less package to maintain
6. ✅ **Faster Startup** - No async SDK initialization required
7. ✅ **Better Control** - Direct control over timeouts, retries, error handling
8. ✅ **Cleaner Docker Build** - No symlink hacks for local file dependencies

## Rollback Plan

If issues arise, the SDK can be re-added:
1. Restore `@api/clickup` dependency in package.json
2. Restore SDK initialization code
3. Restore `sdkCall()` wrapper method
4. Restore Dockerfile symlink logic
5. Revert to previous commit

## Estimated Time

- Phase 1 (Replace SDK Methods): 30 min
- Phase 2 (Refactor Structure): 15 min
- Phase 3 (Clean Dependencies): 5 min
- Phase 4 (HTTP Helper): 10 min
- Phase 5 (Testing): 10 min
- Phase 6 (Deployment): 5 min

**Total: ~75 minutes (1.25 hours)**

## API Documentation References

- ClickUp v2 API: https://clickup.com/api/clickupreference/operation/GetTask/
- ClickUp v3 API (Docs): https://clickup.com/api/clickupreference/operation/GetDocs/
- Rate Limits: 100 requests/minute per workspace (already implemented)

## Success Criteria

- [ ] All SDK methods replaced with fetch() calls
- [ ] SDK dependency removed from package.json
- [ ] `.api/` directory deleted
- [ ] Dockerfile simplified (no symlink logic)
- [ ] Local build succeeds: `npm run build:server`
- [ ] Docker build succeeds without errors
- [ ] Server starts cleanly in Docker (no ES module errors)
- [ ] Integration tests pass (if available)
- [ ] Coolify deployment succeeds
- [ ] Health endpoint responds
- [ ] ClickUp endpoints work in production

## Notes

- Most endpoints are already using `fetch()`, so this is completing the migration
- The SDK was only used for 8 methods out of 17 total methods
- No breaking changes to external API (only internal implementation)
- Rate limiting and error handling remain unchanged
- API token authentication works the same way (Authorization header)
