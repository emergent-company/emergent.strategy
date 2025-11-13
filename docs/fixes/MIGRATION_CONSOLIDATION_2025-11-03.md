# Migration Consolidation - 2025-11-03

## Problem
Production database schema was missing the `id uuid` column in `core.user_profiles` table, causing authentication failures. Migration 0005 was created to add this column via ALTER TABLE, but this approach had issues:
- Failed on re-runs with "relation already exists" errors
- Used ALTER statements instead of assuming clean database
- Redundant since 0001_init.sql already defined complete schema

## Solution
Consolidated migrations to work on completely empty database without ALTER statements:

### Changes Made
1. **Added UNIQUE constraint to 0001_init.sql** (line ~1939)
   - Added `user_profiles_id_unique UNIQUE (id)` constraint
   - Placed after PRIMARY KEY constraint on zitadel_user_id
   - Required because code queries `WHERE id = $1` (UserProfileService.getById, InvitesService, TemplatePackService)

2. **Removed migration 0005**
   - Deleted `apps/server/migrations/0005_add_user_profiles_id_column.sql`
   - ALTER TABLE statements no longer needed
   - 0001_init.sql now creates complete schema from scratch

### Migration Files (Final State)
- **0001_init.sql** (170,827 bytes) - Complete schema definition with all constraints
- **0002_populate_materialized_views.sql** (369 bytes) - REFRESH MATERIALIZED VIEW (idempotent)
- **0004_auth_introspection_cache.sql** (1,522 bytes) - CREATE TABLE IF NOT EXISTS (idempotent)

### User Profiles Schema (Complete)
```sql
CREATE TABLE core.user_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    zitadel_user_id text NOT NULL,
    first_name text,
    last_name text,
    display_name text,
    phone_e164 text,
    avatar_object_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Constraints
ALTER TABLE ONLY core.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (zitadel_user_id);

ALTER TABLE ONLY core.user_profiles
    ADD CONSTRAINT user_profiles_id_unique UNIQUE (id);
```

## Database Rebuild Process
User will delete production database and rebuild from scratch:

1. **Delete database** via Coolify UI
2. **Coolify rebuilds** empty PostgreSQL container
3. **NestJS automatically runs migrations** on startup:
   - 0001_init.sql creates all schemas, tables, constraints
   - 0002_populate_materialized_views.sql populates views
   - 0004_auth_introspection_cache.sql creates cache table
4. **Verify** authentication works at `/api/orgs` endpoint

## Migration Principles (Going Forward)
1. **Assume empty database** - migrations must work on fresh database
2. **No ALTER statements** - use CREATE statements with IF NOT EXISTS
3. **Idempotent** - safe to run multiple times without errors
4. **Complete schema** - 0001 should define all tables and constraints
5. **Incremental additions** - new migrations only add new tables/features

## Related Files
- `apps/server/migrations/0001_init.sql` - Main schema (updated with UNIQUE constraint)
- `apps/server/migrations/0005_add_user_profiles_id_column.sql` - Deleted (redundant)
- `apps/server/src/modules/user-profile/user-profile.service.ts` - Uses id column in queries
- `apps/server/src/modules/invites/invites.service.ts` - Queries by id
- `apps/server/src/modules/template-packs/template-pack.service.ts` - Selects id

## Commit History
- `e28bc95` - chore: consolidate migrations for clean database creation
- `cb8f90a` - Previous state with migration 0005

## Testing After Rebuild
```bash
# 1. User deletes production database via Coolify UI
# 2. Coolify rebuilds database container
# 3. Server restarts and runs migrations automatically

# 4. Test authentication
curl -H "Authorization: Bearer <token>" https://server.kucharz.net/api/orgs

# Expected: 200 OK with user's organizations
# No longer: 401 "Invalid or expired access token"
```

## Notes
- All foreign keys reference `zitadel_user_id`, not `id`
- The `id` column is used only for internal lookups by application code
- UNIQUE constraint on `id` ensures it can be used as lookup key
- Production schema was missing `id` column because it was created before migration 0001 was properly applied
