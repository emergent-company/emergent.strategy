# Fix: Built-in Template Packs Source Field Update

## Issue

TOGAF and other built-in template packs were appearing in the "User Created & Discovered Packs" section instead of the "Built-in Packs" section, even after the backend was updated to return the `source` field.

## Root Cause

The original migration `20251019_extend_template_packs_for_discovery.sql` had a condition `AND source IS NULL` in the UPDATE statement:

```sql
UPDATE kb.graph_template_packs
SET source = 'system'
WHERE name IN (...)
    AND source IS NULL;  -- ← This was the problem
```

However, when the `source` column was added with `ALTER TABLE ... ADD COLUMN source TEXT DEFAULT 'manual'`, all existing rows (including TOGAF, Demo Pack, and Meeting packs) were automatically set to `'manual'` (the default value). Therefore, the UPDATE with `AND source IS NULL` never matched any rows, and the built-in packs remained with `source = 'manual'`.

## Solution

Created a fix migration `20251020_fix_builtin_pack_sources.sql` that updates the source without the NULL condition:

```sql
UPDATE kb.graph_template_packs
SET source = 'system'
WHERE name IN (
    'Extraction Demo Pack',
    'TOGAF Enterprise Architecture',
    'Meeting & Decision Management'
)
AND source != 'system'; -- Only update if not already system
```

## Verification

Before fix:
```sql
SELECT name, source FROM kb.graph_template_packs WHERE name LIKE '%TOGAF%';
-- Result: { "name": "TOGAF Enterprise Architecture", "source": "manual" }
```

After fix:
```sql
SELECT name, source FROM kb.graph_template_packs;
-- Results:
-- { "name": "Extraction Demo Pack", "source": "system" }
-- { "name": "Meeting & Decision Management", "source": "system" }
-- { "name": "TOGAF Enterprise Architecture", "source": "system" }
```

## Impact

- ✅ TOGAF now appears in "Built-in Packs" section (info theme, blue)
- ✅ Demo Pack now appears in "Built-in Packs" section
- ✅ Meeting & Decision Management now appears in "Built-in Packs" section
- ✅ All three packs show "Built-in" badge
- ✅ Remove button is hidden for these packs in installed section

## Testing Steps

1. Go to Project Settings → Template Packs page
2. If TOGAF, Demo Pack, or Meeting pack are installed, remove them
3. Refresh the page
4. Verify all three packs appear under "Built-in Packs" section (with shield icon, info theme)
5. Verify they have "Built-in" badge
6. Install one of them
7. Verify in installed section:
   - Pack shows "Built-in" badge
   - Remove button is hidden
   - Enable/Disable button still works

## Files Changed

- `apps/server/migrations/20251020_fix_builtin_pack_sources.sql` (new migration)

## Related Documentation

- `docs/TEMPLATE_PACK_SOURCE_FIELD_FIX.md` (backend API fix)
- `docs/TEMPLATE_PACK_GROUPING.md` (UI implementation)
