# Template Pack Object Types Display Fix

**Date**: 2025-10-18  
**Issue**: UI showing "0 object types" for installed template packs

## Problem

The templates settings page displayed "0 object types" for the "Extraction Demo Pack" even though it has 3 types (Person, Organization, Location) and was successfully extracting Person entities.

## Root Cause

**Backend data structure** (database):
- `kb.graph_template_packs.object_type_schemas` is a JSONB **object** with type names as keys:
  ```json
  {
    "Person": { "type": "object", "properties": {...} },
    "Organization": { "type": "object", "properties": {...} },
    "Location": { "type": "object", "properties": {...} }
  }
  ```

**Frontend expectation**:
- UI expected `template_pack.object_types` as an **array**:
  ```typescript
  pack.template_pack.object_types?.length || 0
  ```

**Mismatch**: The service returned `object_type_schemas` object directly, so `object_types` was undefined, resulting in length = 0.

## Solution

### Updated Service Method

**File**: `apps/server/src/modules/template-packs/template-pack.service.ts`

Added transformation in `getProjectTemplatePacks()` method:

```typescript
// Transform object_type_schemas object into object_types array for frontend
return result.rows.map(row => ({
    ...row,
    template_pack: {
        ...row.template_pack,
        object_types: row.template_pack.object_type_schemas 
            ? Object.keys(row.template_pack.object_type_schemas)
            : []
    }
}));
```

This extracts the keys from the `object_type_schemas` object and provides them as an `object_types` array: `["Person", "Organization", "Location"]`.

### Result

UI now correctly displays: **"3 object types"** for the Extraction Demo Pack.

## Missing Template Packs Investigation

**User Question**: "What happened to TOGAF and meeting-related packs?"

**Finding**: Only one template pack exists in the database:

```sql
SELECT name, version, description, created_at 
FROM kb.graph_template_packs;
```

Result:
- **Extraction Demo Pack v1.0.0** (created 2025-10-13)
  - Person, Organization, Location types
  - Successfully used for extraction

**Conclusion**: The TOGAF and meeting packs were never actually seeded/created in the database. They may have been:
1. Planned but not implemented
2. Part of a different environment/database
3. Mentioned in documentation but not yet created

## Current State

### Installed Packs (Project: 342b78f5-2904-4e1a-ae41-9c2d481a3a46)
- ✅ **Extraction Demo Pack v1.0.0**
  - Person (enabled)
  - Organization (enabled)
  - Location (enabled)
  - Installed: 2025-10-14

### Extraction Success
- ✅ Person entities successfully extracted from documents
- ✅ 10 Person objects created in test extraction job
- ✅ Graph database contains 24 total objects for the test project

## Next Steps (If TOGAF/Meeting Packs Needed)

To create additional template packs, add them to the database:

```sql
INSERT INTO kb.graph_template_packs (
    id, name, version, description,
    object_type_schemas, relationship_type_schemas,
    extraction_prompts, published_at
) VALUES (
    gen_random_uuid(),
    'TOGAF Architecture Pack',
    '1.0.0',
    'Enterprise architecture types based on TOGAF framework',
    '{
        "Capability": {...},
        "Application": {...},
        "Technology": {...}
    }'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    NOW()
);
```

Then install to project via API:
```bash
POST /api/template-packs/projects/{projectId}/assign
{
  "template_pack_id": "<pack-id>"
}
```

## Related Files

- Service: `apps/server/src/modules/template-packs/template-pack.service.ts` (line 284-310)
- Controller: `apps/server/src/modules/template-packs/template-pack.controller.ts` (line 128-142)
- Frontend: `apps/admin/src/pages/admin/pages/settings/project/templates.tsx` (line 240)
- Types: `apps/server/src/modules/template-packs/template-pack.types.ts`

## Testing

After server restart, refresh the templates page. It should now show:
- **"3 object types"** for Extraction Demo Pack
- Correct installed date (10/14/2025)
