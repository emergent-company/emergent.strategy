# User Profile RLS Bypass Fix

## Problem

Production authentication was failing with misleading error:
```
Error ensuring user profile for 344995479639623684: error: column "id" does not exist
```

Despite the fact that `core.user_profiles.id` column **does exist** (confirmed via `\d core.user_profiles`).

## Root Cause

The `DatabaseService.query()` method applies Row Level Security (RLS) context when an AsyncLocalStorage tenant context exists:

```typescript
// database.service.ts lines 242-289
async query<T>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const store = this.storage.getStore();
    if (store?.orgId || store?.projectId) {
        // Sets RLS context:
        await client.query(`SET LOCAL row_security = on`);
        await client.query(`SET LOCAL app.current_organization_id = '${effectiveOrg}'`);
        await client.query(`SET LOCAL app.current_project_id = '${effectiveProject}'`);
    }
    return client.query<T>(text, params);
}
```

**The Issue**: Authentication happens **before** tenant context can be established. When `AuthService.ensureUserProfile()` calls `UserProfileService.get()`, there's no user yet, so there can be no tenant context. But if some other request context leaked into AsyncLocalStorage, RLS policies might activate inappropriately.

Additionally, `core.user_profiles` is a **core authentication table** that should **never** be subject to tenant-based RLS (unlike `kb.*` tables which contain tenant-scoped data).

## Solution

Updated `UserProfileService` to bypass `DatabaseService.query()` and use the underlying pool directly for authentication-related operations:

```typescript
// user-profile.service.ts

async get(zitadelUserId: string): Promise<UserProfileDto | null> {
    // Use pool directly to bypass tenant RLS context (core schema doesn't use RLS)
    const pool = (this.db as any).pool;
    if (!pool) return null;
    const q = await pool.query(`SELECT id, zitadel_user_id, ... FROM core.user_profiles WHERE zitadel_user_id = $1`, [zitadelUserId]);
    if (!q.rowCount) return null;
    return this.map(q.rows[0]);
}

async upsertBase(subjectId: string): Promise<void> {
    // Use pool directly to bypass tenant RLS context
    const pool = (this.db as any).pool;
    if (!pool) return;
    await pool.query(`INSERT INTO core.user_profiles(zitadel_user_id) VALUES ($1) ON CONFLICT (zitadel_user_id) DO NOTHING`, [subjectId]);
}
```

## Why This Works

- **Direct pool queries** bypass `DatabaseService.query()` and its RLS context logic
- **No `SET LOCAL` statements** are executed, so no RLS policies activate
- **core.user_profiles** is correctly treated as tenant-agnostic authentication data
- **Other methods** (`getById`, `update`) still use `this.db.query()` because they're called by authenticated controllers with valid tenant context

## Testing

After deploying this fix, authentication should succeed:

```bash
# Test with user's browser token
curl -H "Authorization: Bearer ${TOKEN}" https://spec-server.kucharz.net/api/orgs

# Should return 200 with user's organizations list, not 500 database error
```

Expected log output:
```
[AUTH] JWT verified, payload keys: iss, sub, aud, exp, iat, auth_time, amr, azp, client_id, at_hash, sid
[AUTH] Mapped claims - email: user@example.com, sub: 344995479639623684
[AUTH] User profile ensured for subject: 344995479639623684
```

## Related Files

- `apps/server/src/modules/user-profile/user-profile.service.ts` - Applied pool bypass
- `apps/server/src/modules/auth/auth.service.ts` - Calls ensureUserProfile
- `apps/server/src/common/database/database.service.ts` - RLS context logic

## Prevention

- **Core schema tables** (authentication, user profiles) should bypass tenant RLS
- **KB schema tables** (projects, documents, chunks) should use tenant RLS
- Consider creating explicit `DatabaseService.queryWithoutRLS()` method instead of accessing `pool` directly
- Add integration test that validates authentication works without tenant context

## Next Steps

1. Deploy to production (rebuild with this fix)
2. Verify authentication succeeds with user's token
3. Consider creating formal `DatabaseService.queryWithoutRLS()` method for cleaner API
4. Add test: authenticate user without any tenant context in AsyncLocalStorage
