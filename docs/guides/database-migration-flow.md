# Database Migration Flow - Complete Guide

**Date**: November 7, 2025  
**Purpose**: Document the unified migration system and schema validation

---

## Overview

The database schema is managed by a **unified migration system** that ensures:
- ✅ All schemas, tables, and functions are created from migrations
- ✅ Migrations are tracked in `public.schema_migrations` table
- ✅ Application won't start with incomplete schema
- ✅ Startup validation provides second layer of safety

---

## Migration System Architecture

### Single Source of Truth

**Migration Runner**: `scripts/run-migrations.ts`
- Runs all `.sql` files from `apps/server/migrations/`
- Tracks applied migrations in `public.schema_migrations`
- Executes in transactions (rollback on failure)
- Used by BOTH manual runs and application startup

**No Duplication**: DatabaseService calls the same script
- Located: `apps/server/src/common/database/database.service.ts`
- Calls: `scripts/run-migrations.ts` via exec
- Throws error if migrations fail → app won't start

---

## Fresh Database Flow (New Deployment)

### Step-by-Step

**1. Docker Container Starts**
```bash
docker compose -f docker/docker-compose.yml up -d
```

**Runs**: `docker/init.sql`
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- That's it! Minimal init, migrations handle the rest
```

**2. Application Starts**
```bash
npm run workspace:start
```

**Sequence**:
```
Dependencies start (postgres, zitadel)
  ↓
Startup validation waits for DB
  ↓
Services start (admin, server)
  ↓
Server app initializes (NestJS)
  ↓
DatabaseService.onModuleInit()
  ↓
Calls scripts/run-migrations.ts
  ↓
Migration 0001_init.sql runs:
  - CREATE SCHEMA core, kb
  - CREATE TABLE (45 tables including):
    • kb.documents
    • kb.chunks
    • kb.object_extraction_jobs
    • kb.graph_embedding_jobs
    • kb.auth_introspection_cache
    • kb.tags
    • kb.graph_objects
    • kb.graph_relationships
    • core.user_profiles
    • core.user_emails
    • ... 37 more tables
  - CREATE FUNCTION
  - CREATE INDEX
  - Tracks in schema_migrations
  ↓
Migration 0002_populate_materialized_views.sql runs
  ↓
Migration 0004_auth_introspection_cache.sql runs
  ↓
All migrations tracked in schema_migrations
  ↓
App continues startup
  ↓
API listening on port 3002
```

**Result**: Complete schema created and tracked ✅

---

## Startup Validation (Second Safety Layer)

**When**: After dependencies start, before services start

**What it checks**:
1. **Database Schema** (5 retries × 5s = 25s max wait)
   - All 8 critical tables exist
   - Column counts match expectations
   - Migration tracking table exists
   
2. **Zitadel Configuration** (6 retries × 5s = 30s max wait)
   - Zitadel is reachable
   - OAuth client ID is configured
   - OAuth app exists (warning only)

**Example output**:
```
🔍 Validating configuration...
  ✓ Database schema validated
  ⏳ Zitadel not ready, waiting 5s (attempt 1/6)...
  ✓ Zitadel is reachable and ready
  ✓ OAuth configuration validated
✅ All validations passed
```

**If validation fails**:
```
❌ PRECHECK_DATABASE_SCHEMA_INVALID
Services will NOT start
```

---

## Two Layers of Protection

### Layer 1: Migration Runner (App Startup)

**When**: Application module initialization  
**What**: Runs `scripts/run-migrations.ts`  
**If fails**: App throws error and exits  
**Protects**: Schema creation/updates

### Layer 2: Startup Validation (Workspace Start)

**When**: After dependencies start, before services start  
**What**: Validates complete schema exists  
**If fails**: Workspace start stops, services don't start  
**Protects**: Against manual DB changes, migration tracking issues

### Why Both?

**Migration Runner**:
- Creates schema on fresh database
- Updates schema when new migrations added
- First line of defense

**Startup Validation**:
- Catches if migrations were skipped (SKIP_MIGRATIONS=1)
- Catches if someone manually changed database
- Catches if migration tracking is broken
- Safety net for production

---

## Critical Schema Objects

### Tables (8 critical)

All must exist for app to start:

1. **kb.documents** (8 columns) - Document storage
2. **kb.chunks** (7 columns) - Text chunks with embeddings
3. **kb.object_extraction_jobs** (31 columns) - Extraction job queue
4. **kb.graph_embedding_jobs** (11 columns) - Embedding job queue
5. **kb.auth_introspection_cache** (4 columns) - OAuth token cache
6. **kb.tags** (8 columns) - Tag management
7. **kb.graph_objects** (30 columns) - Extracted graph objects
8. **kb.graph_relationships** (18 columns) - Object relationships

### Functions (2 critical)

1. **kb.update_tsv()** - Full-text search trigger
2. **kb.refresh_revision_counts()** - Refresh materialized view

---

## Commands

### Validate Schema
```bash
npm run db:validate
```

**Output if valid**:
```
✓ VALIDATION PASSED
8/8 tables exist
2/2 functions exist
3/3 migrations tracked
```

**Output if invalid**:
```
✗ VALIDATION FAILED
Missing critical table: kb.tags
Recommendation: Run npm run db:fix
```

### Fix Schema
```bash
npm run db:fix
```

**What it does**:
1. Detects missing tables/functions
2. Extracts CREATE statements from `0001_init.sql`
3. Creates only what's missing
4. Validates schema is complete

**Output**:
```
Creating kb.tags...
✓ Created kb.tags
✓ Schema is now valid!
```

### Manual Migration
```bash
npm run db:migrate
```

**What it does**:
- Runs all pending migrations
- Tracks in `schema_migrations` table
- Fails loudly if errors occur

---

## Error Scenarios & Solutions

### Scenario 1: Missing Tables on Startup

**Error**:
```
❌ PRECHECK_DATABASE_SCHEMA_INVALID
Missing critical table: kb.tags
```

**Solution**:
```bash
npm run db:fix
npm run workspace:start
```

### Scenario 2: Migration Fails on App Startup

**Error**:
```
[DatabaseService] ✗ Database migrations failed
Application cannot start with incomplete database schema
```

**Solution**:
```bash
# Check what's wrong
npm run db:migrate

# Review error, fix schema conflict, then
npm run db:fix
```

### Scenario 3: Schema Drift (Manual DB Changes)

**Error**:
```
✗ VALIDATION FAILED
Table kb.custom_table exists but not in migrations (extra)
```

**Solution**:
Either add table to migration or remove from database

---

## Migration Best Practices

### 1. Always Idempotent

✅ **DO**:
```sql
CREATE SCHEMA IF NOT EXISTS kb;
CREATE TABLE IF NOT EXISTS kb.my_table (...);
CREATE INDEX IF NOT EXISTS idx_name ON kb.my_table(col);
CREATE OR REPLACE FUNCTION kb.my_func() ...
```

❌ **DON'T**:
```sql
CREATE SCHEMA kb;  -- Fails if exists
CREATE TABLE kb.my_table (...);  -- Fails if exists
```

### 2. Test Migrations Can Run Twice

```bash
npm run db:migrate  # First run
npm run db:migrate  # Second run - should succeed with "All migrations up to date"
```

### 3. Docker Init is Minimal

**docker/init.sql** should ONLY create:
- PostgreSQL extensions (vector, pgcrypto)
- Zitadel database/user (via 01-init-zitadel.sh)

**Don't create** schemas or tables in Docker init - let migrations handle it!

---

## For Fresh Production Deployment

```bash
# 1. Start Docker
docker compose up -d

# 2. Verify database is ready
docker compose ps

# 3. Run migrations (app will also run them, but good to verify)
npm run db:migrate

# 4. Validate schema
npm run db:validate
# Output: ✓ VALIDATION PASSED

# 5. Start application
npm run workspace:start
# → Migrations run automatically
# → Validation checks schema
# → Services start
```

---

## Troubleshooting

### Migrations Won't Run

**Check**:
1. Is `SKIP_MIGRATIONS=1` set? (Remove it)
2. Are migrations already tracked? (`SELECT * FROM public.schema_migrations`)
3. Is there a schema conflict? (Drop schema and recreate fresh)

### Validation Fails But Schema Looks Complete

**Check**:
1. Column counts match? (`\d+ kb.table_name` in psql)
2. Are functions present? (`\df kb.*` in psql)
3. Is migration tracking correct? (`SELECT * FROM public.schema_migrations`)

### App Starts But Features Don't Work

**Check**:
1. Run: `npm run db:validate` to see what's missing
2. Check server logs for "offline mode" or "migration failed"
3. Run: `npm run db:fix` to repair

---

## Summary

**Unified Migration System**:
- ✅ Single migration runner (`scripts/run-migrations.ts`)
- ✅ Used by both manual runs and app startup
- ✅ Proper migration tracking
- ✅ Fails loudly when issues occur

**Startup Validation**:
- ✅ Validates complete schema before services start
- ✅ All 8 tables critical
- ✅ All 2 functions critical
- ✅ Blocks startup if anything missing

**Result**: Application will never start with incomplete database schema!
