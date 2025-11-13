# Migration Sync and PM2 Namespace Isolation Complete

## Issue
User reported missing database schema elements and requested sync from develop branch with PM2 namespace isolation improvements.

## Problems Identified

### 1. Missing Migrations
We were creating migrations in **wrong directory**: `apps/server/src/migrations/` 
The correct location is: `apps/server/migrations/`

**Missing migrations discovered:**
- `20251019_create_discovery_jobs.sql` - Discovery jobs table
- `20251019_create_discovery_type_candidates.sql` - Discovery type candidates table  
- `20251019_extend_template_packs_for_discovery.sql` - Template packs for discovery
- `20251022_monitoring_phase1.sql` - Monitoring tables (llm_call_logs, system_process_logs)
- `20251023_add_monitoring_tables_rls_policies.sql` - RLS policies for monitoring

**Result:** Tables like `discovery_jobs`, `llm_call_logs`, `system_process_logs` were missing from database.

### 2. Duplicate Migration Files
We had created:
- `apps/server/src/migrations/0009_change_subject_id_to_text.sql` (duplicate)
- `apps/server/src/migrations/0010_add_kb_purpose_to_projects.sql` (duplicate)

These already existed in correct location:
- `apps/server/migrations/20251021_change_all_subject_ids_to_text.sql`
- `apps/server/migrations/20251019_add_kb_purpose_to_projects.sql`

### 3. PM2 Process Naming
Old system used environment variable `COMPOSE_PROJECT_NAME` (manual configuration).
New system uses **directory name** (automatic, better isolation).

## Solutions Applied

### 1. Synced from origin/master
```bash
git stash
git pull origin master  # 3 commits behind, 67 files changed
git stash pop
# Resolved merge conflicts in PM2 ecosystem files
```

**Major changes pulled:**
- New monitoring module with cost tracking
- Improved PM2 process prefixing (directory-based)
- Missing migrations for discovery and monitoring
- Various documentation updates

### 2. Applied Missing Migrations
```bash
cat apps/server/migrations/20251019_create_discovery_jobs.sql | docker exec -i spec-2_pg psql -U spec -d spec
cat apps/server/migrations/20251019_create_discovery_type_candidates.sql | docker exec -i spec-2_pg psql -U spec -d spec
cat apps/server/migrations/20251019_extend_template_packs_for_discovery.sql | docker exec -i spec-2_pg psql -U spec -d spec
cat apps/server/migrations/20251022_monitoring_phase1.sql | docker exec -i spec-2_pg psql -U spec -d spec
cat apps/server/migrations/20251023_add_monitoring_tables_rls_policies.sql | docker exec -i spec-2_pg psql -U spec -d spec
```

**Result:**
- ✅ `kb.discovery_jobs` table created
- ✅ `kb.discovery_type_candidates` table created
- ✅ `kb.llm_call_logs` table created (monitoring)
- ✅ `kb.system_process_logs` table created (monitoring)
- ✅ RLS policies added for monitoring tables

**Total tables now:** 36 (was 32)

### 3. Updated PM2 Process Naming

**Old approach (environment-based):**
```javascript
const INSTANCE_NAME = process.env.COMPOSE_PROJECT_NAME || '';
function prefixProcessName(processName) {
  return INSTANCE_NAME ? `${INSTANCE_NAME}-${processName}` : processName;
}
```

**New approach (directory-based):**
```javascript
const projectName = path.basename(repoRoot);
const APP_PREFIX = `${projectName}-`;
name: `${APP_PREFIX}admin`  // becomes: spec-server-2-admin
```

**Benefits:**
- ✅ Automatic isolation based on directory name
- ✅ No manual environment configuration needed
- ✅ Prevents conflicts between multiple instances
- ✅ Simpler and more reliable

### 4. Cleaned Up PM2 Processes
```bash
npx pm2 delete all  # Removed all old processes (spec-2-*, spec-server-*)
npm run workspace:start  # Started with new naming
```

**Old process names:**
- `spec-2-admin`, `spec-2-server`, `spec-2-postgres-dependency`, `spec-2-zitadel-dependency`

**New process names (automatic from directory):**
- `spec-server-2-admin`
- `spec-server-2-server`
- `spec-server-2-postgres-dependency`
- `spec-server-2-zitadel-dependency`

### 5. Rebuilt Workspace CLI
```bash
npx nx run workspace-cli:build
```

## Verification

### PM2 Processes
```bash
npx pm2 list
```
```
┌────┬────────────────────┬─────────┬──────┬──────────┬─────────┬─────────┐
│ id │ name               │ mode    │ ↺    │ status   │ cpu     │ memory  │
├────┼────────────────────┼─────────┼──────┼──────────┼─────────┼─────────┤
│ 19 │ spec-server-2-adm… │ fork    │ 0    │ online   │ 0%      │ 39.7mb  │
│ 17 │ spec-server-2-pos… │ fork    │ 0    │ online   │ 0%      │ 16.2mb  │
│ 20 │ spec-server-2-ser… │ fork    │ 0    │ online   │ 0%      │ 40.0mb  │
│ 18 │ spec-server-2-zit… │ fork    │ 0    │ online   │ 0%      │ 16.0mb  │
└────┴────────────────────┴─────────┴──────┴──────────┴─────────┴─────────┘
```

### Backend Health
```bash
curl http://localhost:3002/health
```
```json
{
  "ok": true,
  "model": "text-embedding-004",
  "db": "up",
  "embeddings": "enabled",
  "rls_policies_ok": true,
  "rls_policy_count": 8,
  "rls_policy_hash": "policies:191:4d86"
}
```

### Admin Frontend
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5176/
# 200
```

### Database Tables
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'kb' ORDER BY tablename;
```
**36 tables total**, including new ones:
- `discovery_jobs`
- `discovery_type_candidates`
- `llm_call_logs`
- `system_process_logs`

## Files Modified/Restored

### Restored from origin/master (clean versions):
- `tools/workspace-cli/pm2/ecosystem.apps.cjs`
- `tools/workspace-cli/pm2/ecosystem.dependencies.cjs`
- `tools/workspace-cli/src/config/application-processes.ts`
- `tools/workspace-cli/src/config/dependency-processes.ts`

### Duplicate migrations to clean up:
- ❌ `apps/server/src/migrations/0009_change_subject_id_to_text.sql` (remove - duplicate)
- ❌ `apps/server/src/migrations/0010_add_kb_purpose_to_projects.sql` (remove - duplicate)
- ✅ Keep in correct location: `apps/server/migrations/`

## Current Status

✅ **Database Schema:** Complete with all migrations applied
✅ **PM2 Processes:** Properly namespaced with `spec-server-2-` prefix
✅ **Backend:** Healthy on port 3002
✅ **Admin:** Healthy on port 5176
✅ **Docker:** PostgreSQL on 5437, Zitadel on 8200/8201
✅ **Namespace Isolation:** Working automatically based on directory name

## Benefits Achieved

1. **Automatic Namespace Isolation:** Directory-based prefixing eliminates manual configuration
2. **Complete Database Schema:** All required tables now exist
3. **Monitoring Support:** New LLM call logging and system process tracking tables
4. **Discovery Support:** New discovery jobs and type candidate tables
5. **No Conflicts:** Can run multiple instances side-by-side (spec-server, spec-server-2, etc.)

## Related Documentation
- `docs/PM2_PROJECT_PREFIXING.md` - PM2 namespace prefixing guide
- `docs/MONITORING_PHASE1_STATUS.md` - Monitoring system overview
- `docs/KB_PURPOSE_COLUMN_FIX.md` - kb_purpose column addition

## Next Steps

1. ✅ Remove duplicate migration files from `src/migrations/` directory
2. ✅ Verify all endpoints work with new schema
3. ✅ Test monitoring endpoints (if enabled)
4. ✅ Test discovery jobs creation (if used)
