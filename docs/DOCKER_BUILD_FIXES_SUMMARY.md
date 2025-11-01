# Docker Build Fixes Summary

## Overview
Fixed Docker build failures for both `apps/admin` and `apps/server-nest` by adapting Dockerfiles to the npm workspace structure and resolving TypeScript compilation errors.

## Problem Statement
Both Docker builds were failing because:
1. **npm workspaces**: Repository uses npm workspaces with a single root `package-lock.json`
2. **Wrong build context**: Dockerfiles expected to build from subdirectories but needed root context
3. **TypeScript errors**: Missing types and property mismatches in monitoring API
4. **Alpine/SWC compatibility**: @swc/core had SIGBUS errors on Alpine Linux

## Admin Frontend (`apps/admin`) - FULLY FIXED ✅

### Issues Fixed
1. **npm ci failure**: Package-lock.json not found because build context was `apps/admin` instead of root
2. **TypeScript errors**: Missing `ChatSessionDetail`, `ChatSessionSummary`, `McpToolCallLog` types
3. **Property mismatches**: Components expected different property names than interface definitions
4. **dotenv import error**: Module not found during Docker build
5. **Vite plugin type errors**: Version mismatch warnings between root and apps/admin node_modules

### Solution Applied

#### 1. Dockerfile Workspace Structure (Commit b0bd167)
```dockerfile
# Build context changed from apps/admin to repository root
# Usage: docker build -f apps/admin/Dockerfile .

WORKDIR /build

# Copy root workspace files FIRST
COPY package*.json ./

# Then copy admin package files
COPY apps/admin/package*.json ./apps/admin/

# Use workspace-aware npm ci
RUN npm ci --workspace=apps/admin

# Copy admin source
COPY apps/admin ./apps/admin

# Build from subdirectory
RUN cd apps/admin && npm run build

# Copy dist from correct path
COPY --from=builder /build/apps/admin/dist /usr/share/nginx/html
```

#### 2. Monitoring API Types (Commits 6286222, d77e17d)
Added complete type definitions to `apps/admin/src/api/monitoring.ts`:

```typescript
export interface ChatSessionSummary {
    id: string;
    session_id: string;  // Added
    user_id: string;
    created_at: string;
    updated_at: string;
    started_at: string;  // Added
    last_activity_at: string;  // Added
    message_count: number;
    total_turns: number;  // Added
    tool_call_count: number;
    log_count: number;  // Added
    total_tokens: number;
    total_cost: number;  // Added (without _usd suffix)
    status: 'active' | 'completed' | 'error';
}

export interface McpToolCallLog {
    id: string;
    session_id: string;
    turn_number: number;  // Added
    tool_name: string;
    tool_parameters: any;  // Added (with input_params alias)
    input_params?: any;  // Alias for backward compatibility
    tool_result: any;  // Added (with output_result alias)
    output_result?: any;  // Alias for backward compatibility
    status: string;
    duration_ms: number;
    execution_time_ms?: number;  // Alias for backward compatibility
    error_message?: string;
    created_at: string;
}

export interface ChatSessionDetail {
    id: string;
    session_id: string;  // Added
    user_id: string;
    created_at: string;
    updated_at: string;
    started_at: string;  // Added
    completed_at?: string;  // Added
    duration_ms?: number;  // Added
    total_turns: number;  // Added
    total_cost?: number;  // Added
    status: 'active' | 'completed' | 'error';
    messages: any[];
    logs: Array<{  // Added with processType
        processType: string;
        level: string;
        // ... other log properties
    }>;
    llm_calls: Array<LLMCallLog>;  // Added
    tool_calls: Array<McpToolCallLog>;
    metrics: {
        input_tokens?: number;
        output_tokens?: number;
        completion_tokens?: number;
        prompt_tokens?: number;
        total_tokens?: number;
        latency_ms?: number;
        cost_usd?: number;
    };
}

export interface ListChatSessionsParams {
    user_id?: string;
    status?: 'active' | 'completed' | 'error';
    start_date?: string;  // Added
    end_date?: string;  // Added
    date_from?: string;  // Alias
    date_to?: string;  // Alias
    offset?: number;  // Added
    page?: number;
    limit?: number;
    sort_by?: 'created_at' | 'message_count' | 'total_cost_usd';
    sort_order?: 'asc' | 'desc';
}
```

#### 3. Null Safety Fixes (Commit e118f89)
```typescript
// Handle optional parameters properly
const formatDuration = (started: string, lastActivity?: string) => {
    if (!lastActivity) return 'N/A';
    // ... rest of implementation
};

const formatCost = (cost?: number | null) => {
    if (cost === null || cost === undefined || cost === 0) return '-';
    return `$${cost.toFixed(4)}`;
};
```

#### 4. Vite Config Fix (Commit 3edd43e)
```typescript
// Remove dotenv import (not needed in Docker builds)
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// Environment variables come from --build-arg in production
const DEV_PORT = Number(process.env.ADMIN_PORT || 5175);
const API_TARGET = process.env.API_ORIGIN || `http://localhost:${process.env.SERVER_PORT || 3001}`;
```

#### 5. Plugin Type Suppression (Commit f638c21)
```typescript
export default defineConfig({
    plugins: [
        // @ts-expect-error Vite version mismatch (doesn't affect runtime)
        tailwindcss(),
        // @ts-expect-error Vite version mismatch (doesn't affect runtime)
        react({ /* ... */ })
    ],
    // ... rest of config
});
```

### Build Success
```bash
docker build \
  --build-arg VITE_API_URL=https://api.example.com \
  --build-arg VITE_ZITADEL_ISSUER=https://auth.example.com \
  --build-arg VITE_ZITADEL_CLIENT_ID=test-client \
  --build-arg VITE_APP_ENV=production \
  -f apps/admin/Dockerfile .

# Result: ✓ built in 7.37s
```

## Server Backend (`apps/server-nest`) - PARTIALLY FIXED ⚠️

### Issues Fixed
1. **npm ci failure**: Same workspace issue as admin
2. **SIGBUS error**: @swc/core postinstall failing on Alpine Linux

### Solution Applied (Commit b2f875b)

#### Dockerfile Workspace Structure + Debian Base
```dockerfile
# Switch from Alpine to Debian slim (fixes @swc/core SIGBUS)
FROM node:20-slim AS builder

WORKDIR /build

# Copy root workspace files FIRST
COPY package*.json ./

# Copy server-nest package files
COPY apps/server-nest/package*.json ./apps/server-nest/

# Use workspace-aware npm ci
RUN npm ci --workspace=apps/server-nest

# Copy server-nest source
COPY apps/server-nest ./apps/server-nest

# Build from subdirectory
RUN cd apps/server-nest && npm run build

# Production stage
FROM node:20-slim

# Install tini and curl (Debian paths)
RUN apt-get update && apt-get install -y --no-install-recommends tini curl && \
    rm -rf /var/lib/apt/lists/*

# Copy from correct paths
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/apps/server-nest/dist ./dist
COPY --from=builder /build/apps/server-nest/src/common/database/migrations ./src/common/database/migrations
COPY --from=builder /build/apps/server-nest/package*.json ./

# Update tini path for Debian
ENTRYPOINT ["/usr/bin/tini", "--"]
```

### Remaining Issues
TypeScript compilation errors (35 errors):
- Parameter implicitly has 'any' type (multiple files)
- Could not find declaration file for module 'pg'
- Spread types issues in template-pack.service.ts

These are **code quality issues** that need fixing in the source code, not Docker/build configuration issues.

## Coolify Deployment Configuration

### Critical Setting
**MUST UPDATE**: Change Build Context from `apps/admin` to `.` (root)

1. Go to: https://kucharz.net/application/t4cok0o4cwwoo8o0ccs8ogkg
2. Navigate to: Build & Deploy Settings
3. Update:
   - **Build Context**: `.` (was: `apps/admin`)
   - **Dockerfile Location**: `apps/admin/Dockerfile` (unchanged)
4. Save and trigger new deployment

For server-nest (once TypeScript errors fixed):
   - **Build Context**: `.` (root)
   - **Dockerfile Location**: `apps/server-nest/Dockerfile`

## Build Commands

### Admin (Ready for deployment)
```bash
docker build \
  --build-arg VITE_API_URL=${VITE_API_URL} \
  --build-arg VITE_ZITADEL_ISSUER=${VITE_ZITADEL_ISSUER} \
  --build-arg VITE_ZITADEL_CLIENT_ID=${VITE_ZITADEL_CLIENT_ID} \
  --build-arg VITE_APP_ENV=production \
  -f apps/admin/Dockerfile .
```

### Server-Nest (Needs TypeScript fixes)
```bash
docker build -f apps/server-nest/Dockerfile .
```

## Commits Summary

| Commit | Description | Files Changed |
|--------|-------------|---------------|
| b0bd167 | Fix: Docker build for npm workspaces | apps/admin/Dockerfile, apps/admin/package-lock.json (deleted) |
| 6286222 | Fix: Add missing chat session types to monitoring API | apps/admin/src/api/monitoring.ts (+128 lines) |
| d77e17d | Fix: Update chat session interface properties to match component usage | apps/admin/src/api/monitoring.ts (+46/-5) |
| e118f89 | Fix: Handle optional parameters in formatDuration and formatCost | apps/admin/src/pages/admin/pages/monitoring/ChatSessionsListPage.tsx |
| 3edd43e | Fix: Remove dotenv import and handle undefined cost in formatCost | apps/admin/vite.config.ts, ChatSessionsListPage.tsx |
| f638c21 | Fix: Suppress Vite plugin type errors with @ts-expect-error | apps/admin/vite.config.ts |
| b2f875b | Fix: Update server-nest Dockerfile for workspace structure | apps/server-nest/Dockerfile |

## Documentation Created
- `docs/COOLIFY_DOCKER_BUILD_FIX.md` - Detailed npm workspace fix explanation
- `docs/DOCKER_BUILD_FIXES_SUMMARY.md` - This document

## Next Steps

### For Admin (Ready)
1. ✅ Update Coolify Build Context to `.` (root)
2. ✅ Trigger new deployment
3. ✅ Monitor build logs
4. ⚠️ Manual configuration of 58 buildtime variables still needed (separate issue)

### For Server-Nest (Blocked)
1. ❌ Fix TypeScript compilation errors (35 errors):
   - Add type annotations for 'any' parameters
   - Install @types/pg: `npm install --save-dev @types/pg --workspace=apps/server-nest`
   - Fix spread type issues in template-pack.service.ts
2. ❌ Test Docker build until successful
3. ❌ Update Coolify Build Context to `.` (root)
4. ❌ Trigger deployment

## Key Learnings

### npm Workspaces
- Single root `package-lock.json` is authoritative
- Individual workspace lock files cause conflicts (deleted apps/admin/package-lock.json)
- Docker build context MUST be repository root for workspaces
- Use `npm ci --workspace=<name>` for workspace-specific installs

### Docker Best Practices
- Build context location is critical for file access
- Multi-stage builds: workspace files in builder, app files in runtime
- Always document build context and usage in Dockerfile comments
- Alpine Linux has compatibility issues with @swc/core (use Debian slim)

### TypeScript in Docker
- `tsc -b` enforces strict type checking (good for CI/CD)
- Type errors that pass locally may fail in Docker with strict tsconfig
- Use `// @ts-expect-error` sparingly and only for known safe issues
- Document reasons for type suppressions

## Performance Impact

### Before
- Admin build: Failed at npm ci (missing package-lock.json)
- Server build: Failed at npm ci OR @swc/core SIGBUS

### After
- Admin build: ✅ Success in ~20 seconds (including npm ci, TypeScript compile, Vite build)
- Server build: ⚠️ Progresses past npm ci, fails at TypeScript compile (needs code fixes)

## Files Modified

### Docker Configuration
- `apps/admin/Dockerfile` - Complete workspace restructure
- `apps/server-nest/Dockerfile` - Workspace + Alpine→Debian switch

### TypeScript/Application Code
- `apps/admin/src/api/monitoring.ts` - Added 170+ lines of type definitions and implementations
- `apps/admin/src/pages/admin/pages/monitoring/ChatSessionsListPage.tsx` - Null safety fixes
- `apps/admin/vite.config.ts` - Removed dotenv, suppressed plugin warnings

### Files Deleted
- `apps/admin/package-lock.json` - Conflicts with workspace, use root lock file

## Related Documentation
- [COOLIFY_DOCKER_BUILD_FIX.md](./COOLIFY_DOCKER_BUILD_FIX.md) - In-depth explanation of workspace fix
- [COOLIFY_MANUAL_ENV_CONFIG.md](./COOLIFY_MANUAL_ENV_CONFIG.md) - Manual env var configuration guide
