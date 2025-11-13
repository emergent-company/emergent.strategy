# Fix: Seed Scripts to Create Built-in Template Packs with source='system'

## Issue

The seed scripts for the three built-in template packs (TOGAF, Demo Pack, Meeting Pack) were not setting `source = 'system'` when creating the packs. This meant that if the database was reset and re-seeded, the packs would be created with `source = 'manual'` (the default), causing them to appear in the wrong UI section.

## Root Cause

The INSERT statements in the seed scripts did not include the `source` column, so PostgreSQL used the default value `'manual'` from the column definition.

## Solution

Updated all three seed scripts to explicitly set `source = 'system'` when creating the template packs:

### 1. TOGAF Template Pack

**File**: `scripts/seed-togaf-template.ts`

**Change**: Added `source` column to INSERT statement and parameter list

```typescript
// Before
INSERT INTO kb.graph_template_packs (
    name, version, description, author, license,
    documentation_url, object_type_schemas, relationship_type_schemas,
    ui_configs, extraction_prompts, sql_views
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)

// After
INSERT INTO kb.graph_template_packs (
    name, version, description, author, license,
    documentation_url, object_type_schemas, relationship_type_schemas,
    ui_configs, extraction_prompts, sql_views, source
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)

// Added parameter
'system' // Mark as built-in/system template pack
```

### 2. Extraction Demo Pack

**File**: `scripts/seed-extraction-demo.ts`

**Change**: Added `source` column to INSERT statement and parameter list

```typescript
// Before
INSERT INTO kb.graph_template_packs (
    id, name, version, description, author,
    object_type_schemas, relationship_type_schemas,
    ui_configs, extraction_prompts, published_at
) VALUES ($1, $2, $3, $4, $5, $6::jsonb, '{}'::jsonb, $7::jsonb, $8::jsonb, now())

// After
INSERT INTO kb.graph_template_packs (
    id, name, version, description, author,
    object_type_schemas, relationship_type_schemas,
    ui_configs, extraction_prompts, published_at, source
) VALUES ($1, $2, $3, $4, $5, $6::jsonb, '{}'::jsonb, $7::jsonb, $8::jsonb, now(), $9)

// Added parameter
'system' // Mark as built-in/system template pack
```

### 3. Meeting & Decision Management Pack

**File**: `apps/server/src/modules/template-packs/seeds/meeting-decision-pack.seed.ts`

**Change**: Added `source` column to INSERT statement and parameter list

```typescript
// Before
INSERT INTO kb.graph_template_packs (
    id, name, version, description, author,
    object_type_schemas, relationship_type_schemas,
    ui_configs, extraction_prompts, published_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())

// After
INSERT INTO kb.graph_template_packs (
    id, name, version, description, author,
    object_type_schemas, relationship_type_schemas,
    ui_configs, extraction_prompts, published_at, source
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10)

// Added parameter
'system' // Mark as built-in/system template pack
```

## Impact

### Future Database Setups

When the database is reset and re-seeded (e.g., fresh development environment, CI/CD pipeline):

- ✅ All three built-in packs will be created with `source = 'system'`
- ✅ They will automatically appear in the "Built-in Packs" section
- ✅ They will have the correct visual styling (info theme, blue)
- ✅ Remove button will be hidden for these packs
- ✅ They will show "Built-in" badge

### Existing Databases

For databases that already have these packs with `source = 'manual'`:

- ✅ The migration `20251020_fix_builtin_pack_sources.sql` updates existing records
- ✅ The updated migration `20251019_extend_template_packs_for_discovery.sql` prevents future issues

## Testing

To verify the fix works for fresh database setup:

1. **Reset database** (drop and recreate)
2. **Run migrations**: `npx nx run server:migrate`
3. **Run seed scripts**:
   ```bash
   npx tsx scripts/seed-extraction-demo.ts
   npx tsx scripts/seed-togaf-template.ts
   npx tsx scripts/seed-meeting-pack.ts
   ```
4. **Verify in database**:
   ```sql
   SELECT name, source FROM kb.graph_template_packs 
   WHERE name IN (
       'Extraction Demo Pack',
       'TOGAF Enterprise Architecture',
       'Meeting & Decision Management'
   );
   ```
   All should show `source = 'system'`

5. **Verify in UI**: Go to Project Settings → Template Packs
   - All three packs should appear in "Built-in Packs" section
   - Each should have "Built-in" badge and info theme

## Files Changed

- ✅ `scripts/seed-togaf-template.ts` - Added source='system' to INSERT
- ✅ `scripts/seed-extraction-demo.ts` - Added source='system' to INSERT
- ✅ `apps/server/src/modules/template-packs/seeds/meeting-decision-pack.seed.ts` - Added source='system' to INSERT

## Related Documentation

- `docs/BUILTIN_PACK_SOURCES_FIX.md` - Database migration fix for existing data
- `docs/TEMPLATE_PACK_SOURCE_FIELD_FIX.md` - Backend API fix
- `docs/TEMPLATE_PACK_GROUPING.md` - Frontend UI implementation
