# Database Schema Validation Script - Implementation Plan

**Date**: November 7, 2025  
**Purpose**: Create a script to verify database schema matches migrations and detect drift

---

## Problem Analysis

### What Happened?

1. **Docker Init Script** (`docker/init.sql`) created a basic schema:
   - Created `kb` schema
   - Created `kb.documents` and `kb.chunks` tables
   - Created basic indexes

2. **Full Migrations** (`apps/server/migrations/0001_init.sql`) contain:
   - Same `kb` schema creation (not idempotent - `CREATE SCHEMA kb` without `IF NOT EXISTS`)
   - 31 columns in `kb.object_extraction_jobs`
   - Full `kb.graph_embedding_jobs` table
   - Many other tables and functions

3. **Migration Runner** (`scripts/run-migrations.ts`):
   - Tried to run `0001_init.sql`
   - Failed because `CREATE SCHEMA kb` already exists
   - **Transaction rolled back** - no tables from 0001 were created
   - Migration was NOT tracked in `schema_migrations` table
   - Result: Partial schema (only Docker init script ran)

4. **Application Started**:
   - Expected tables like `object_extraction_jobs` with 31 columns
   - Found only `documents` and `chunks` tables
   - Returned 500 errors

### Would Re-running Migrations Have Fixed It?

**NO** - Here's why:

1. The migration `0001_init.sql` contains `CREATE SCHEMA kb;` (line ~1)
2. This schema already exists (from Docker init)
3. Migration fails immediately on first statement
4. Transaction rolls back - **NOTHING from the migration is applied**
5. The migration is NOT marked as completed in `schema_migrations`
6. Re-running would fail the same way

### The Real Issues

1. **Non-idempotent migrations**: `CREATE SCHEMA kb` should be `CREATE SCHEMA IF NOT EXISTS kb`
2. **Docker init creates partial schema**: Should either:
   - Create nothing (let migrations do everything), OR
   - Create complete schema (make Docker init = migration 0001)
3. **No schema validation**: App doesn't verify schema matches expectations before starting
4. **Silent failures**: Migration failures don't prevent app from starting

---

## Solution: Database Schema Validation Script

### Purpose

Create a script that:
1. **Validates** the current database schema matches what the application expects
2. **Detects drift** between actual schema and migration definitions
3. **Reports missing/extra** tables, columns, indexes, constraints
4. **Can auto-fix** by applying missing migrations or statements
5. **Runs as part of** startup/healthcheck to catch issues early

### Script Features

#### Mode 1: Validate (Read-only)
```bash
npm run db:validate
# or
tsx scripts/validate-schema.ts
```

**Output**:
```
[VALIDATE] Database Schema Validation
═══════════════════════════════════════

[1/5] Checking migration tracking...
  ✓ schema_migrations table exists
  ✓ 3 migrations recorded as applied
  ✗ Migration 0001_init is NOT marked as applied but should be

[2/5] Checking required tables...
  ✓ kb.documents (expected: 8 columns, actual: 8 columns)
  ✓ kb.chunks (expected: 6 columns, actual: 6 columns)
  ✓ kb.object_extraction_jobs (expected: 31 columns, actual: 31 columns)
  ✓ kb.graph_embedding_jobs (expected: 11 columns, actual: 11 columns)
  ✗ kb.tags - TABLE MISSING
  ✗ kb.objects - TABLE MISSING

[3/5] Checking required functions...
  ✗ kb.refresh_revision_counts() - FUNCTION MISSING
  ✓ kb.update_tsv() exists

[4/5] Checking indexes...
  ✓ All required indexes exist

[5/5] Checking constraints...
  ✓ All required constraints exist

═══════════════════════════════════════
Summary:
  ✓ 4/6 tables exist
  ✗ 2 tables missing
  ✗ 1 function missing
  ✗ 1 migration tracking issue

RESULT: Schema validation FAILED
Run 'npm run db:fix' to apply fixes
```

#### Mode 2: Fix (Apply Corrections)
```bash
npm run db:fix
# or
tsx scripts/validate-schema.ts --fix
```

**Actions**:
- Marks migrations as applied if schema exists
- Creates missing tables from migration SQL
- Creates missing functions
- Applies missing indexes/constraints

#### Mode 3: Diff (Show Differences)
```bash
npm run db:diff
# or
tsx scripts/validate-schema.ts --diff
```

**Shows**:
- Tables in DB but not in migrations (extras)
- Tables in migrations but not in DB (missing)
- Column differences per table
- Migration status mismatches

---

## Script Architecture

### File Structure
```
scripts/
  validate-schema.ts          # Main validation script
  lib/
    schema-validator.ts       # Core validation logic
    schema-definitions.ts     # Expected schema (from migrations)
    migration-parser.ts       # Parse SQL migrations to extract schema
```

### Core Components

#### 1. Schema Definitions Extractor
**Purpose**: Parse migration SQL files to build expected schema

```typescript
interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  constraints: ConstraintDefinition[];
  indexes: IndexDefinition[];
}

interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
}

function extractSchemaFromMigrations(migrationsDir: string): SchemaDefinition {
  // Parse all .sql files
  // Extract CREATE TABLE, CREATE INDEX, CREATE FUNCTION statements
  // Build expected schema object
}
```

#### 2. Schema Introspector
**Purpose**: Query actual database schema

```typescript
async function introspectDatabase(client: Client): Promise<SchemaDefinition> {
  // Query information_schema.tables
  // Query information_schema.columns
  // Query pg_indexes
  // Query pg_constraint
  // Query pg_proc for functions
  // Return actual schema object
}
```

#### 3. Schema Comparator
**Purpose**: Compare expected vs actual

```typescript
interface SchemaDiff {
  missingTables: string[];
  extraTables: string[];
  tableDiffs: TableDiff[];
  missingFunctions: string[];
  migrationIssues: MigrationIssue[];
}

function compareSchemas(expected: SchemaDefinition, actual: SchemaDefinition): SchemaDiff {
  // Compare tables, columns, types
  // Check indexes and constraints
  // Identify missing/extra elements
}
```

#### 4. Auto-Fixer
**Purpose**: Apply fixes to bring schema up to date

```typescript
async function fixSchema(client: Client, diff: SchemaDiff, options: FixOptions): Promise<void> {
  // Mark migrations as applied if schema exists
  // Create missing tables (extract CREATE TABLE from migration)
  // Add missing columns (ALTER TABLE ADD COLUMN)
  // Create missing indexes
  // Create missing functions
  // All in transactions for safety
}
```

---

## Implementation Approach

### Option A: Simple Approach (Recommended for MVP)

**Strategy**: Re-run migrations with idempotent SQL

**Changes needed**:
1. Make `0001_init.sql` idempotent:
   - Change `CREATE SCHEMA kb` → `CREATE SCHEMA IF NOT EXISTS kb`
   - Change `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`
   - Add `CREATE OR REPLACE FUNCTION` where applicable

2. Update migration runner to handle partial application:
   - Skip `CREATE SCHEMA` if it fails with "already exists"
   - Continue with rest of migration
   - Or: Use `--single-transaction=false` approach

3. Simple validation script:
   ```bash
   # Just verify migrations are marked as applied
   # Check critical tables exist
   # Report if schema is out of sync
   ```

**Pros**:
- Quick to implement
- Leverages existing migrations
- Easy to maintain

**Cons**:
- Requires updating all existing migrations
- Doesn't detect schema drift (extra columns, etc.)

### Option B: Comprehensive Approach (Full Solution)

**Strategy**: Parse migrations and validate complete schema

**Implementation**:
1. **Migration Parser**:
   - Parse SQL files to extract schema definitions
   - Build expected schema object
   - Handle CREATE TABLE, ALTER TABLE, CREATE INDEX, etc.

2. **Schema Introspector**:
   - Query information_schema and pg_catalog
   - Get actual database state

3. **Diff Generator**:
   - Compare expected vs actual
   - Report all differences

4. **Auto-Fixer**:
   - Generate fix SQL from migrations
   - Apply fixes in transactions
   - Update migration tracking

**Pros**:
- Complete validation
- Detects drift
- Can auto-fix issues
- Production-ready

**Cons**:
- More complex to implement
- Requires SQL parser
- Needs comprehensive testing

### Option C: Hybrid Approach (Pragmatic)

**Strategy**: Make migrations idempotent + simple validation

**Implementation**:
1. **Update migrations** to be idempotent (one-time effort)
2. **Simple validator** that:
   - Checks critical tables exist
   - Counts columns (basic validation)
   - Verifies migration tracking is correct
   - Can re-run migrations safely

3. **Migration fixer**:
   - If validation fails, re-run all migrations
   - Since migrations are idempotent, this is safe
   - Track which migrations applied successfully

**Pros**:
- Best of both worlds
- Idempotent migrations are good practice
- Simple validation is fast
- Can always re-run migrations to fix

**Cons**:
- Still requires updating existing migrations

---

## Recommended Implementation: Option C (Hybrid)

### Phase 1: Make Migrations Idempotent

**File**: Update `apps/server/migrations/0001_init.sql`

**Changes**:
```sql
-- BEFORE
CREATE SCHEMA kb;

-- AFTER
CREATE SCHEMA IF NOT EXISTS kb;

-- BEFORE
CREATE TABLE kb.documents (...);

-- AFTER
CREATE TABLE IF NOT EXISTS kb.documents (...);
```

**Also update**:
- `CREATE INDEX` → `CREATE INDEX IF NOT EXISTS`
- `CREATE FUNCTION` → `CREATE OR REPLACE FUNCTION`
- Use `ALTER TABLE ADD COLUMN IF NOT EXISTS` for column additions

### Phase 2: Create Validation Script

**File**: `scripts/validate-schema.ts`

```typescript
/**
 * Quick schema validation
 * Checks:
 * 1. Critical tables exist with expected column counts
 * 2. Migrations are tracked correctly
 * 3. Functions exist
 */

interface TableCheck {
  schema: string;
  table: string;
  minColumns: number; // At least this many columns
  critical: boolean;  // App won't start without it
}

const CRITICAL_TABLES: TableCheck[] = [
  { schema: 'kb', table: 'documents', minColumns: 8, critical: true },
  { schema: 'kb', table: 'chunks', minColumns: 6, critical: true },
  { schema: 'kb', table: 'object_extraction_jobs', minColumns: 30, critical: true },
  { schema: 'kb', table: 'graph_embedding_jobs', minColumns: 10, critical: true },
  { schema: 'kb', table: 'auth_introspection_cache', minColumns: 3, critical: true },
];

async function validateSchema(client: Client): Promise<ValidationResult> {
  // Check each critical table
  // Query: SELECT COUNT(*) FROM information_schema.columns WHERE ...
  // Return status for each
}

async function fixSchema(client: Client): Promise<void> {
  // Re-run all migrations (now idempotent)
  // They'll skip what exists, create what's missing
}
```

**Usage**:
```bash
# Validate only
npm run db:validate

# Validate and fix
npm run db:validate --fix

# Or direct
tsx scripts/validate-schema.ts
tsx scripts/validate-schema.ts --fix
```

### Phase 3: Integrate with Startup

**Add to `apps/server/src/main.ts`**:

```typescript
// Before starting server
if (process.env.NODE_ENV !== 'production' || process.env.VALIDATE_SCHEMA === 'true') {
  await validateDatabaseSchema();
}
```

Or run as separate command:
```bash
npm run db:validate && npm run workspace:start
```

---

## Answering Your Question

### Would Re-running Migrations Have Solved the Problem?

**NO** - Because:

1. ✅ **Migration tracking table is empty** (`schema_migrations` has 0 rows)
2. ❌ **Migration 0001_init.sql is NOT idempotent**:
   - Line 1: `CREATE SCHEMA kb;` (fails if exists)
   - Transaction rolls back
   - Nothing gets created
   - Migration not marked as applied

3. ❌ **Re-running would fail the same way**:
   ```
   [migrate] Applying: 0001_init.sql...
   [migrate] ❌ Failed: error: schema "kb" already exists
   ```

4. ✅ **What actually fixed it**:
   - We manually created the tables with full schema
   - Bypassed the migration system
   - Direct SQL execution (no transaction wrapping the schema creation)

### What WOULD Have Solved It

**Option 1**: Delete the `kb` schema entirely, then re-run migrations:
```sql
DROP SCHEMA IF EXISTS kb CASCADE;
-- Then run: npm run migrate
```

**Option 2**: Make migrations idempotent first, then re-run:
```sql
-- Update 0001_init.sql
CREATE SCHEMA IF NOT EXISTS kb;
-- Then run: npm run migrate
```

**Option 3**: Mark migration as applied if schema exists:
```sql
-- If kb schema exists with expected tables
INSERT INTO public.schema_migrations (version, filename)
VALUES ('0001_init', '0001_init.sql');
-- Then migrations 0002, 0004 can run
```

---

## Recommended Solution

### Short-term Fix (Already Done ✅)

- Manually created missing tables
- Server now works

### Long-term Solution (Implement These)

1. **Make migrations idempotent** (Phase 1)
   - Update `0001_init.sql` to use `IF NOT EXISTS`
   - Update all migrations to be re-runnable

2. **Create validation script** (Phase 2)
   - Quick check: critical tables exist with expected columns
   - Can re-run migrations to fix (now safe because idempotent)

3. **Update Docker init** (Phase 3 - Optional)
   - Either: Remove `docker/init.sql` entirely (let migrations do everything)
   - Or: Make `docker/init.sql` identical to `0001_init.sql`
   - Ensures consistency between Docker init and migrations

4. **Add startup validation** (Phase 4)
   - Server checks schema on startup
   - Fails fast with clear error if tables missing
   - Optional auto-fix in development mode

---

## Validation Script Specification

### Script: `scripts/validate-schema.ts`

**Commands**:
```bash
npm run db:validate           # Check only, exit 1 if issues
npm run db:validate --fix     # Check and auto-fix
npm run db:validate --verbose # Show all tables/columns
npm run db:validate --diff    # Show schema diff
```

**What It Checks**:

1. **Migration Tracking Consistency**
   - Are all migrations in `schema_migrations` table?
   - Are there migrations marked as applied but files don't exist?
   - Are there migration files not marked as applied?

2. **Critical Tables Existence**
   - Does each critical table exist?
   - Does it have at least the minimum number of columns?
   - Can it be queried (basic SELECT works)?

3. **Column Validation** (optional, verbose mode)
   - For each table, check columns match migration
   - Check data types match
   - Check nullable/default values

4. **Function Validation** (optional)
   - Check required functions exist
   - Verify function signatures

**Exit Codes**:
- `0` - Schema is valid
- `1` - Schema has issues (missing tables/columns)
- `2` - Cannot connect to database
- `3` - Migrations are inconsistent

**Fix Mode** (`--fix`):
- Re-run all migrations (safe if idempotent)
- Mark migrations as applied if schema exists
- Create missing tables/functions

---

## Implementation Tasks

### Task 1: Make Migrations Idempotent
- [ ] Update `0001_init.sql`:
  - `CREATE SCHEMA IF NOT EXISTS kb`
  - `CREATE TABLE IF NOT EXISTS`
  - `CREATE OR REPLACE FUNCTION`
- [ ] Update `0002_populate_materialized_views.sql`
- [ ] Update `0004_auth_introspection_cache.sql`
- [ ] Test: Drop schema, run migrations, run again (should succeed)

### Task 2: Create Validation Script
- [ ] Create `scripts/validate-schema.ts`
- [ ] Implement table existence checks
- [ ] Implement column count validation
- [ ] Add migration tracking verification
- [ ] Add `--fix` mode
- [ ] Add `--verbose` and `--diff` modes

### Task 3: Add NPM Scripts
- [ ] Add `"db:validate": "tsx scripts/validate-schema.ts"`
- [ ] Add `"db:fix": "tsx scripts/validate-schema.ts --fix"`
- [ ] Add `"db:diff": "tsx scripts/validate-schema.ts --diff"`

### Task 4: Integration
- [ ] Add validation to preflight checks (optional)
- [ ] Add to CI/CD pipeline
- [ ] Document in README
- [ ] Add to `QUICK_START_DEV.md`

---

## Expected Schema (From Migrations)

### Critical Tables (Must Exist for App to Function)

1. **kb.documents** (8 columns)
2. **kb.chunks** (6 columns + tsv)
3. **kb.object_extraction_jobs** (31 columns)
4. **kb.graph_embedding_jobs** (11 columns)
5. **kb.auth_introspection_cache** (3 columns)

### Optional Tables (App degrades gracefully if missing)

1. **kb.tags** - TagCleanupWorkerService will log errors but app works
2. **kb.objects** - Might be created by application code
3. **kb.relationships** - Might be created by application code

### Required Functions

1. **kb.update_tsv()** - Updates tsvector for full-text search
2. **kb.refresh_revision_counts()** - Updates materialized view (optional)

---

## Example Validation Output

### Healthy Database
```
[VALIDATE] Database Schema Validation
✓ All checks passed
✓ 5/5 critical tables exist
✓ 3/3 migrations tracked
✓ Schema matches migrations

Database is ready for application use.
```

### Problematic Database (What We Had)
```
[VALIDATE] Database Schema Validation
✗ Validation failed

Missing Tables:
  - kb.object_extraction_jobs (critical)
  - kb.graph_embedding_jobs (critical)
  - kb.tags (optional)

Migration Tracking Issues:
  - 0001_init.sql: NOT tracked but schema partially exists
  
Recommended action:
  Run: npm run db:fix
  Or: Drop schema and re-run migrations
```

---

## Testing Plan

### Test Scenarios

1. **Fresh Database**
   - Drop all schemas
   - Run validation → should report everything missing
   - Run `--fix` → should apply all migrations
   - Run validation → should pass

2. **Partial Schema** (Our Issue)
   - Docker init ran, migrations didn't
   - Run validation → should detect missing tables
   - Run `--fix` → should complete schema
   - Run validation → should pass

3. **Schema Drift**
   - Add extra column manually
   - Run validation → should detect extra column (optional)
   - Remove required column
   - Run validation → should fail

4. **Migration Tracking Drift**
   - Delete row from schema_migrations but keep table
   - Run validation → should detect inconsistency
   - Run `--fix` → should mark migration as applied

---

## Benefits

1. **Catch Issues Early**: Before app starts and users see 500 errors
2. **Clear Diagnostics**: Know exactly what's missing/wrong
3. **Auto-Fix**: Can repair schema automatically in development
4. **CI/CD Integration**: Verify schema in deployment pipeline
5. **Documentation**: Script serves as schema documentation
6. **Prevent Drift**: Catch when manual DB changes diverge from migrations

---

## Migration Best Practices (Going Forward)

### Always Use Idempotent SQL

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

### Test Migrations Can Run Multiple Times

```bash
npm run migrate  # First run
npm run migrate  # Second run - should succeed with no changes
```

### Keep Docker Init Minimal

**Option 1** (Recommended): Let migrations do everything
```sql
-- docker/init.sql
-- Just create extensions, nothing else
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Migrations will create kb schema and tables
```

**Option 2**: Docker init = first migration
```bash
# Copy migration to docker init
cp apps/server/migrations/0001_init.sql docker/init.sql
# Mark migration as applied automatically on first run
```

---

## Conclusion

The problem would NOT have been solved by re-running migrations because:
- Migration 0001 is not idempotent
- It fails on `CREATE SCHEMA kb` (already exists)
- Transaction rolls back, nothing gets created

**The solution is**:
1. Make migrations idempotent (one-time fix)
2. Create validation script to detect these issues
3. Use `npm run db:fix` to auto-repair by re-running migrations

This ensures the problem never happens again and provides clear diagnostics when it does.
