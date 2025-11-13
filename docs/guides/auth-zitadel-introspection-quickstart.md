# Zitadel Token Introspection - Quick Start Guide

**Date**: October 31, 2025  
**Status**: Implementation Ready  
**Related**: [Full Implementation Plan](../architecture/auth-zitadel-introspection-implementation-plan.md)

---

## Overview

This guide provides a quick overview of implementing Zitadel token introspection in spec-server-2. For detailed implementation steps, see the full implementation plan.

---

## What's Being Added

### 🆕 New Services
- **PostgresCacheService** - Cache introspection results in PostgreSQL
- **CacheCleanupService** - Automatically clean expired cache entries
- **ZitadelService** - OAuth2 client for service account authentication
- **ZitadelIntrospectionService** - Token introspection with caching
- **RolesGuard** - Role-based authorization guard

### 📊 New Database Table
```sql
kb.auth_introspection_cache (
    token_hash VARCHAR(128) PRIMARY KEY,
    introspection_data JSONB,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
```

### 🔧 Enhanced Services
- **AuthService** - Integrated introspection (with JWT fallback)
- **AuthUser interface** - Added `roles` and `organizationId`

---

## Quick Implementation Steps

### 1. Database Migration

```bash
# Run the migration
psql $DATABASE_URL < apps/server/migrations/0004_auth_introspection_cache.sql
```

### 2. Copy Services

Copy these files from huma-blueprint-ui to spec-server-2:

```bash
# Cache services
cp /path/to/huma/apps/api/src/auth/postgres-cache.service.ts \
   apps/server/src/modules/auth/

cp /path/to/huma/apps/api/src/auth/cache-cleanup.service.ts \
   apps/server/src/modules/auth/

# Zitadel services
cp /path/to/huma/apps/api/src/auth/zitadel.service.ts \
   apps/server/src/modules/auth/

cp /path/to/huma/apps/api/src/auth/zitadel-introspection.service.ts \
   apps/server/src/modules/auth/

# Role authorization
cp /path/to/huma/apps/api/src/auth/roles.decorator.ts \
   apps/server/src/modules/auth/

cp /path/to/huma/apps/api/src/auth/roles.guard.ts \
   apps/server/src/modules/auth/
```

### 3. Update AuthService

Add introspection to the `validateToken` method:

```typescript
// After line 91 in auth.service.ts
// NEW: Try Zitadel introspection first (if configured)
if (this.introspectionService && process.env.ZITADEL_DOMAIN) {
    try {
        const introspectionResult = await this.introspectionService.introspect(token);
        if (introspectionResult && introspectionResult.active) {
            const user = await this.ensureUserProfile(
                introspectionResult.sub || '',
                introspectionResult.email,
                introspectionResult.scopes || []
            );
            
            if (user && introspectionResult.roles) {
                user.roles = introspectionResult.roles;
                user.organizationId = introspectionResult.organizationId;
            }
            
            return user;
        }
    } catch (e) {
        Logger.warn(`Token introspection failed, falling back to JWT: ${(e as Error).message}`, 'AuthService');
    }
}
```

Update AuthUser interface (line 5):

```typescript
export interface AuthUser {
    id: string;
    sub: string;
    email?: string;
    scopes?: string[];
    roles?: string[];  // NEW
    organizationId?: string;  // NEW
    _debugClaimKeys?: string[];
    _debugScopeSource?: string;
}
```

### 4. Update Auth Module

Add new services to `auth.module.ts`:

```typescript
import { RolesGuard } from './roles.guard';
import { ZitadelService } from './zitadel.service';
import { ZitadelIntrospectionService } from './zitadel-introspection.service';
import { PostgresCacheService } from './postgres-cache.service';
import { CacheCleanupService } from './cache-cleanup.service';

@Module({
    providers: [
        // Existing providers...
        RolesGuard,
        ZitadelService,
        ZitadelIntrospectionService,
        PostgresCacheService,
        CacheCleanupService,
    ],
    exports: [
        // Existing exports...
        RolesGuard,
        ZitadelService,
    ],
})
export class AuthModule {}
```

### 5. Environment Variables

Add to `.env`:

```bash
# Zitadel Configuration
ZITADEL_DOMAIN=your-instance.zitadel.cloud
ZITADEL_MAIN_ORG_ID=your-org-id
ZITADEL_CLIENT_JWT_PATH=/path/to/service-account-key.json

# Cache Configuration
INTROSPECTION_CACHE_TTL=300  # 5 minutes
CACHE_CLEANUP_INTERVAL=900   # 15 minutes
```

### 6. Test

```bash
# Start the server
npm run dev

# Test with mock token (development)
curl -H "Authorization: Bearer e2e-all" http://localhost:3002/api/orgs

# Test with real Zitadel token
curl -H "Authorization: Bearer <real-token>" http://localhost:3002/api/orgs
```

---

## Using @Roles() Decorator

### Example Controller

```typescript
import { Controller, Get, Post, UseGuards, Delete } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('documents')
@UseGuards(AuthGuard, RolesGuard)
export class DocumentsController {
    @Get()
    @Roles('org_admin', 'project_admin', 'project_user')
    async list() {
        // Anyone with any of these roles can access
    }

    @Post()
    @Roles('org_admin', 'project_admin')
    async create() {
        // Only admins can create
    }

    @Delete(':id')
    @Roles('org_admin')
    async delete() {
        // Only org admins can delete
    }
}
```

### Backwards Compatible

Keep using `@Scopes()` alongside `@Roles()`:

```typescript
// Old way (still works)
@Get()
@Scopes(MOCK_SCOPES.documentsRead)
async list() { }

// New way
@Get()
@Roles('org_admin', 'project_user')
async list() { }

// Both (AND logic)
@Get()
@Scopes(MOCK_SCOPES.documentsRead)
@Roles('org_admin')
async list() { }
```

---

## Architecture Flow

### Before (JWT Only)
```
Request → AuthGuard → JWT Verify → User Profile → ScopesGuard → Controller
```

### After (Introspection + Cache)
```
Request → AuthGuard → Check Cache → [Cache Hit] → User Profile → RolesGuard → Controller
                           ↓
                      [Cache Miss]
                           ↓
                  Zitadel Introspection → Cache Result → User Profile → RolesGuard → Controller
                           ↓
                    [Introspection Fails]
                           ↓
                      JWT Verify (Fallback) → User Profile → RolesGuard → Controller
```

---

## Performance Expectations

### Cache Performance
- **Cold Start**: ~200ms (introspection call)
- **Warm Cache**: <50ms (database lookup)
- **Cache Hit Rate**: 80-95% (after warmup)
- **Memory Overhead**: ~5MB

### Database Impact
- **Query**: Single indexed lookup (`token_hash`)
- **Cleanup**: Runs every 15 minutes by default
- **Storage**: ~1KB per cached token

---

## Monitoring

### Check Cache Stats

```sql
-- Current cache entries
SELECT COUNT(*) as total,
       COUNT(*) FILTER (WHERE expires_at > NOW()) as active,
       COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired
FROM kb.auth_introspection_cache;

-- Recent cache entries
SELECT token_hash, created_at, expires_at
FROM kb.auth_introspection_cache
ORDER BY created_at DESC
LIMIT 10;
```

### Application Logs

Look for these log messages:

```
✅ [ZitadelService] Zitadel service initialized successfully
✅ [CacheCleanupService] Starting cache cleanup service (interval: 900s)
✅ [PostgresCacheService] Cached introspection result (expires: ...)
✅ [ZitadelIntrospectionService] Using cached introspection result
✅ [CacheCleanupService] Cleaned up X expired cache entries
```

---

## Troubleshooting

### "Zitadel service account key not loaded"

**Solution**: Check that `ZITADEL_CLIENT_JWT` or `ZITADEL_CLIENT_JWT_PATH` is set correctly.

```bash
# Verify file exists
ls -la $ZITADEL_CLIENT_JWT_PATH

# Verify file is valid JSON
cat $ZITADEL_CLIENT_JWT_PATH | jq .
```

### "Introspection request failed (401)"

**Solution**: Service account token expired or invalid.

```bash
# Check Zitadel domain is correct
echo $ZITADEL_DOMAIN

# Verify service account has introspection permission
# Go to Zitadel Console → Service Accounts → Verify permissions
```

### Cache Not Working

**Solution**: Check database connection and table exists.

```sql
-- Verify table exists
\d kb.auth_introspection_cache

-- Check if cache is being written
SELECT COUNT(*) FROM kb.auth_introspection_cache;
```

### Mock Tokens Not Working

**Solution**: Enable mock tokens in development.

```bash
# Add to .env
AUTH_TEST_STATIC_TOKENS=1
```

---

## Testing Checklist

- [ ] Database migration applied successfully
- [ ] App starts without errors
- [ ] Mock tokens work in development (`e2e-all`, `with-scope`, etc.)
- [ ] Real Zitadel tokens work via introspection
- [ ] Cache is populating (check database)
- [ ] Cache cleanup service is running (check logs)
- [ ] Role guards enforce permissions correctly
- [ ] JWT fallback works when introspection fails

---

## Next Steps

1. **Run Tests**: `nx test server`
2. **Run E2E Tests**: `nx test-e2e server`
3. **Check Coverage**: Ensure all new code has tests
4. **Update Documentation**: Document any project-specific roles
5. **Deploy to Staging**: Test with real production tokens

---

## Resources

- **Full Plan**: [auth-zitadel-introspection-implementation-plan.md](../architecture/auth-zitadel-introspection-implementation-plan.md)
- **Reference Implementation**: huma-blueprint-ui (apps/api/src/auth/)
- **Zitadel Docs**: https://zitadel.com/docs
- **Existing Auth**: `apps/server/src/modules/auth/`

---

**Ready to implement!** Follow the full implementation plan for detailed steps and code examples.
