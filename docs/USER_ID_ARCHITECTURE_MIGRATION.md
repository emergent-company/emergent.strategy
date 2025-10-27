# User Authentication & ID Architecture - Migration Summary

## Current State (BEFORE Migration)

### Database Schema
```sql
-- core.user_profiles
CREATE TABLE core.user_profiles (
    subject_id TEXT PRIMARY KEY,        -- Zitadel user ID (e.g., "335517149097361411")
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    phone_e164 TEXT,
    avatar_object_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- kb.organization_memberships
CREATE TABLE kb.organization_memberships (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    subject_id TEXT NOT NULL,           -- FK to user_profiles.subject_id
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Code Expectations
**MISMATCH**: Code expects columns that don't exist!

```typescript
// user-profile.service.ts line 38
await this.db.query(
    `INSERT INTO core.user_profiles(zitadel_user_id) VALUES ($1) ...`,
    [subjectId]
);
// ❌ ERROR: Column "zitadel_user_id" does not exist

// orgs.controller.ts line 55
const userId: string | undefined = req?.user?.id;
// ❌ ERROR: req.user.id doesn't exist, only req.user.sub
```

## Target State (AFTER Migration)

### Database Schema
```sql
-- core.user_profiles
CREATE TABLE core.user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- Internal user ID
    zitadel_user_id TEXT UNIQUE NOT NULL,          -- External Zitadel ID
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    phone_e164 TEXT,
    avatar_object_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- kb.organization_memberships  
CREATE TABLE kb.organization_memberships (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    user_id UUID NOT NULL,                         -- FK to user_profiles.id
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE
);
```

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER LOGS IN VIA ZITADEL                                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. ZITADEL RETURNS JWT                                      │
│    - sub: "335517149097361411" (Zitadel user ID)           │
│    - email: "user@example.com"                             │
│    - name: "John Doe"                                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. BACKEND AUTH MIDDLEWARE                                  │
│    - Validates JWT                                          │
│    - Extracts: sub = "335517149097361411"                  │
│    - Calls: userProfileService.get(sub)                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. USER PROFILE LOOKUP/CREATE                               │
│                                                             │
│    SELECT id, zitadel_user_id, ... FROM core.user_profiles │
│    WHERE zitadel_user_id = '335517149097361411'            │
│                                                             │
│    If not found:                                            │
│    INSERT INTO core.user_profiles(zitadel_user_id)        │
│    VALUES ('335517149097361411')                           │
│    RETURNING id, zitadel_user_id, ...                      │
│                                                             │
│    Result:                                                  │
│    - id: "a1b2c3d4-..." (UUID - internal)                 │
│    - zitadel_user_id: "335517149097361411" (external)     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. REQUEST CONTEXT SET                                      │
│    req.user = {                                             │
│        id: "a1b2c3d4-..." (UUID),        ← Use everywhere  │
│        sub: "335517149097361411",         ← Only for auth   │
│        email: "user@example.com",                          │
│        ...                                                  │
│    }                                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. BUSINESS LOGIC (Orgs, Projects, etc.)                   │
│    const userId = req.user.id;  ← Always use UUID          │
│                                                             │
│    INSERT INTO kb.organization_memberships                 │
│    (organization_id, user_id, role)                        │
│    VALUES ($1, $2, 'org_admin')                            │
│                                                             │
│    ✅ user_id is UUID (FK to user_profiles.id)            │
└─────────────────────────────────────────────────────────────┘
```

## When is `zitadel_user_id` Used?

### Primary Use Case: Initial Authentication
```typescript
// When JWT arrives with Zitadel subject ID
const profile = await userProfileService.get(jwtPayload.sub);
// SELECT * FROM core.user_profiles WHERE zitadel_user_id = $1
```

### Secondary Use Case: Email Change in Zitadel
If user changes email in Zitadel:
1. Zitadel subject ID (`sub`) remains the same
2. Email claim in JWT changes
3. Backend can find user by `zitadel_user_id` and update email
4. Internal `id` (UUID) never changes

```typescript
// After email change
const updatedProfile = await userProfileService.get(jwtPayload.sub);
// Still finds user by zitadel_user_id
// Internal relationships (via user_id UUID) unaffected
```

### Use Case: Account Deletion/Cleanup
```typescript
// Deletion endpoint receives Zitadel ID from JWT
async deleteUserData(zitadelUserId: string) {
    // 1. Lookup internal UUID
    const profile = await userProfileService.get(zitadelUserId);
    if (!profile) return;
    
    // 2. Delete by internal UUID (cascades via FK)
    DELETE FROM core.user_profiles WHERE id = $1
    // All organization_memberships, project_memberships, etc. cascade
}
```

## Key Principles

### ✅ DO
- **Use `id` (UUID) everywhere** in application code
- **Use `user_id` column** in all FK relationships
- **Use `zitadel_user_id`** only for:
  - Initial auth lookups
  - User profile creation
  - Email change scenarios
  - Account deletion from auth system

### ❌ DON'T
- Don't use `zitadel_user_id` in business logic
- Don't create FK constraints on `zitadel_user_id`
- Don't pass Zitadel IDs around in controllers/services
- Don't expose Zitadel IDs in API responses (use internal `id`)

## Migration Impact

### Tables Updated
1. `core.user_profiles` - Add `id` UUID PK, rename `subject_id` → `zitadel_user_id`
2. `kb.organization_memberships` - Replace `subject_id` TEXT with `user_id` UUID
3. `kb.project_memberships` - Replace `subject_id` TEXT with `user_id` UUID
4. `core.user_emails` - Replace `subject_id` TEXT with `user_id` UUID
5. `kb.user_notification_preferences` - Replace `subject_id` TEXT with `user_id` UUID
6. `kb.notifications` - Replace `subject_id` TEXT with `user_id` UUID
7. `kb.chat_conversations` - Replace `owner_subject_id` TEXT with `owner_user_id` UUID
8. `kb.object_extraction_jobs` - Replace `subject_id` TEXT with `user_id` UUID (if exists)

### Data Preservation
- All existing user data preserved
- New UUID `id` generated for each user
- `zitadel_user_id` contains original `subject_id` value
- All membership relationships updated to use new UUID FK

### Breaking Changes
**NONE** - Code already expects the new schema! The database was lagging behind.

## Post-Migration Verification

```sql
-- 1. Check user_profiles structure
\d core.user_profiles
-- Should show: id (UUID PK), zitadel_user_id (TEXT UNIQUE)

-- 2. Check organization_memberships
\d kb.organization_memberships
-- Should show: user_id (UUID FK to user_profiles.id)

-- 3. Verify FK relationships
SELECT COUNT(*) FROM kb.organization_memberships om
JOIN core.user_profiles up ON om.user_id = up.id;
-- Should return count of all memberships (no orphans)

-- 4. Check for users with Zitadel TEXT IDs
SELECT id, zitadel_user_id FROM core.user_profiles 
WHERE zitadel_user_id NOT LIKE '%-%-%-%-%';
-- Should find real Zitadel users (non-UUID format)
```

## Summary

**Before**: Database used `subject_id` (TEXT Zitadel ID) as PK everywhere → Code expected `id`/`zitadel_user_id`  
**After**: Database uses `id` (UUID) as PK, `zitadel_user_id` (TEXT) for auth only → Code and DB aligned

**Purpose of `zitadel_user_id`**: 
1. Initial user lookup/creation during authentication
2. Handling email changes in Zitadel
3. Account deletion triggered from auth system

**Internal relationships**: Always use `user_id` UUID foreign keys to `user_profiles.id`
