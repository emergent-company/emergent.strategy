# KB Purpose Column Fix

## Issue
After fixing the UUID type mismatch (migration 0009), user encountered new 500 errors when creating organizations:

```
error: column "kb_purpose" does not exist
    at ProjectsService.list (projects.service.ts:37:25)
    at DocumentsService.list (documents.service.ts:47:?)
```

**Error Details:**
- Error code: 42703 (PostgreSQL undefined column)
- Position: 26 (in SQL query)
- HTTP endpoints failing:
  - GET /api/projects?limit=500&orgId=...
  - GET /api/documents

## Root Cause
The code was selecting `kb_purpose` from the `kb.projects` table, but this column didn't exist in the database schema. The column is meant to store a description of the project's knowledge base purpose.

**Code references:**
- `apps/server/src/modules/projects/projects.service.ts` line 38
- `apps/server/src/modules/projects/projects.service.ts` line 44

**SQL queries:**
```sql
SELECT id, name, org_id, kb_purpose FROM kb.projects WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2
SELECT id, name, org_id, kb_purpose FROM kb.projects ORDER BY created_at DESC LIMIT $1
```

## Solution
Created migration `0010_add_kb_purpose_to_projects.sql` to add the missing column:

```sql
ALTER TABLE kb.projects
ADD COLUMN kb_purpose TEXT;

COMMENT ON COLUMN kb.projects.kb_purpose IS 'Description of the project''s knowledge base purpose and intended use';
```

## Verification
Before migration:
```
 column_name |        data_type         | is_nullable 
-------------+--------------------------+-------------
 id          | uuid                     | NO
 org_id      | uuid                     | NO
 name        | text                     | NO
 created_at  | timestamp with time zone | NO
 updated_at  | timestamp with time zone | NO
(5 rows)
```

After migration:
```
 column_name |        data_type         | is_nullable 
-------------+--------------------------+-------------
 id          | uuid                     | NO
 org_id      | uuid                     | NO
 name        | text                     | NO
 created_at  | timestamp with time zone | NO
 updated_at  | timestamp with time zone | NO
 kb_purpose  | text                     | YES
(6 rows)
```

## Applied
```bash
cat apps/server/src/migrations/0010_add_kb_purpose_to_projects.sql | docker exec -i spec-2_pg psql -U spec -d spec
# ALTER TABLE
# COMMENT
```

Backend restarted via PM2:
```bash
npm run workspace:restart -- --app server
```

## Result
- ✅ Migration 0010 applied successfully
- ✅ Column `kb_purpose` added to `kb.projects` table (TEXT, nullable)
- ✅ Backend restarted and healthy
- ✅ No more "column does not exist" errors
- ✅ User can now create organizations and projects

## Files Modified
- **NEW:** `apps/server/src/migrations/0010_add_kb_purpose_to_projects.sql`

## Related Migrations
- Migration 0009: Changed `subject_id` from UUID to TEXT (fixed Zitadel numeric user IDs)
- Migration 0010: Added `kb_purpose` column to projects (this fix)

## Notes
- The `kb_purpose` column is optional (nullable) to allow existing projects without a purpose
- New projects can optionally specify their knowledge base purpose
- The column has a comment explaining its purpose for future database maintainers
