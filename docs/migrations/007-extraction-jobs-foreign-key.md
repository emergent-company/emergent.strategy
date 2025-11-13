# Migration 007: Extraction Jobs Foreign Key Fix

**Date**: 2025-10-05  
**Status**: ✅ Applied

## Problem

The `kb.object_extraction_jobs` table was using `created_by TEXT` to store external authentication service IDs (e.g., Zitadel IDs like `"335517149097361411"`). This had several issues:

1. **No Referential Integrity**: No foreign key constraint to `core.user_profiles`
2. **Auth Provider Coupling**: Stored external IDs tightly coupled to specific auth provider
3. **Architectural Inconsistency**: All other tables (`organization_memberships`, `project_memberships`, `chat_conversations`) use `subject_id UUID` with proper foreign keys
4. **Migration Risk**: Changing auth providers would break all historical references

## Solution

Renamed `created_by` to `subject_id` with proper UUID type and foreign key constraint to `core.user_profiles(subject_id)`.

### Why This Works

The authentication system already handles the mapping:

1. **JWT arrives** with external `sub` claim (e.g., `"335517149097361411"`)
2. **Auth middleware** (`auth.service.ts`) deterministically converts it to a UUID:
   ```typescript
   const normalizedSub = isUuid ? rawSub : toUuid(rawSub);
   // toUuid uses SHA-1 hash: "335517149097361411" → "a28e2dc2-e8d5-..."
   ```
3. **Request context** receives `req.user.sub` as UUID (not external ID)
4. **Services** use this UUID for all database operations

The frontend was already sending the correct UUID (`user?.sub`), but we were storing it in a TEXT column without validation.

## Database Changes

### Schema Migration

```sql
-- Add new column with proper type and FK
ALTER TABLE kb.object_extraction_jobs
ADD COLUMN subject_id UUID REFERENCES core.user_profiles(subject_id) ON DELETE SET NULL;

-- Drop old column
ALTER TABLE kb.object_extraction_jobs
DROP COLUMN created_by;

-- Add index for query performance
CREATE INDEX idx_extraction_jobs_subject_id 
ON kb.object_extraction_jobs(subject_id) 
WHERE subject_id IS NOT NULL;
```

### Data Migration Note

Existing rows with `created_by` values cannot be reliably migrated because:
- External IDs were stored as TEXT
- No way to reverse-map external ID → internal UUID
- Most jobs are short-lived (completed/failed quickly)

**Decision**: Set `subject_id = NULL` for existing records. This is acceptable because:
- `created_by` was already optional
- Notifications won't be sent for old jobs
- New jobs will have proper referential integrity

## Code Changes

### Backend

**Files Modified**:
- `apps/server/src/modules/extraction-jobs/dto/extraction-job.dto.ts`
  - `CreateExtractionJobDto.created_by?: string` → `subject_id?: string` (UUID validation)
  - `ExtractionJobDto.created_by?: string` → `subject_id?: string`
  
- `apps/server/src/modules/extraction-jobs/extraction-job.service.ts`
  - INSERT statement uses `subject_id` column
  - `mapRowToDto` maps `row.subject_id` instead of `row.created_by`
  
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`
  - Notification checks use `job.subject_id` instead of `job.created_by`
  
- `apps/server/src/common/database/database.service.ts`
  - CREATE TABLE statement updated with FK constraint
  - Added index for `subject_id`

### Frontend

**Files Modified**:
- `apps/admin/src/api/extraction-jobs.ts`
  - `ExtractionJob.created_by?: string` → `subject_id?: string`
  - `CreateExtractionJobPayload.created_by?: string` → `subject_id?: string`
  
- `apps/admin/src/pages/admin/apps/documents/index.tsx`
  - Changed `created_by: user?.sub` → `subject_id: user?.sub`
  - Updated comment to clarify it's canonical internal user ID

## Verification

### Database Verification

```sql
-- Check foreign key exists
\d kb.object_extraction_jobs

-- Should show:
-- Foreign-key constraints:
--   "object_extraction_jobs_subject_id_fkey" 
--   FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE SET NULL
```

### Runtime Verification

1. **Create extraction job** from Documents page
2. **Verify** job appears in Extraction Jobs list
3. **Check database**:
   ```sql
   SELECT id, subject_id, created_at 
   FROM kb.object_extraction_jobs 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```
4. **Verify** `subject_id` is a valid UUID and references existing user profile

## Benefits

1. ✅ **Referential Integrity**: Enforced by PostgreSQL foreign key
2. ✅ **Auth Provider Independence**: Internal UUIDs never change
3. ✅ **Architectural Consistency**: Matches all other user references
4. ✅ **Cascade Handling**: `ON DELETE SET NULL` preserves job history
5. ✅ **Query Performance**: Indexed for common access patterns

## Related Tables

Other tables that correctly use `subject_id`:
- `core.user_profiles` - Primary source of truth
- `kb.organization_memberships` - `subject_id UUID` with FK
- `kb.project_memberships` - `subject_id UUID` with FK
- `kb.chat_conversations` - `owner_subject_id UUID` with FK

## Future Considerations

**Notifications Table**: The `kb.notifications` table also uses `user_id TEXT`. Consider similar migration:
- `user_id TEXT` → `subject_id UUID`
- Add foreign key to `core.user_profiles`
- Same benefits as extraction jobs fix

## References

- Spec: `/docs/spec/16-user-profile.md` - User profile system architecture
- Auth: `/apps/server/src/modules/auth/auth.service.ts` - JWT claim mapping
- Migration: `/apps/server/src/common/database/migrations/007-extraction-jobs-subject-id-fk.sql`
