# Fix: Template Pack Source Field Missing in Available Packs API

## Issue

When a built-in template pack (e.g., TOGAF) was removed from installed packs, it appeared in the "User Created & Discovered Packs" section instead of the "Built-in Packs" section.

## Root Cause

The `getAvailableTemplatesForProject` service method was not including the `source` field in the response DTO, even though the database query selected all columns including `source`.

## Changes Made

### 1. Updated DTO Interface

**File**: `apps/server/src/modules/template-packs/dto/template-pack.dto.ts`

Added `source` field to `AvailableTemplateDto`:

```typescript
export interface AvailableTemplateDto {
    // ... existing fields
    source?: 'manual' | 'discovered' | 'imported' | 'system';
    // ... rest of fields
}
```

### 2. Updated TypeScript Type

**File**: `apps/server/src/modules/template-packs/template-pack.types.ts`

Added `source`, `discovery_job_id`, and `pending_review` fields to `TemplatePackRow`:

```typescript
export interface TemplatePackRow {
    // ... existing fields
    source?: 'manual' | 'discovered' | 'imported' | 'system';
    discovery_job_id?: string;
    pending_review?: boolean;
    // ... rest of fields
}
```

### 3. Updated Service Method

**File**: `apps/server/src/modules/template-packs/template-pack.service.ts`

Added `source` mapping in `getAvailableTemplatesForProject` method:

```typescript
// Build response
return packsResult.rows.map(pack => ({
    id: pack.id,
    name: pack.name,
    version: pack.version,
    description: pack.description,
    author: pack.author,
    source: pack.source,  // ← Added this line
    object_types: Object.entries(pack.object_type_schemas).map(...),
    // ... rest of mapping
}));
```

## Impact

- ✅ Built-in packs (TOGAF, Demo, Meeting) now correctly appear in "Built-in Packs" section when not installed
- ✅ User-created packs appear in "User Created & Discovered Packs" section
- ✅ Discovered packs (from auto-discovery) appear in "User Created & Discovered Packs" section
- ✅ Frontend grouping logic works correctly: `pack.source === 'system'` filters built-in packs

## Testing

1. Remove TOGAF pack from installed packs
2. Check that it appears in "Built-in Packs" section (not "User Created & Discovered Packs")
3. Verify it has the "Built-in" badge
4. Verify it still uses info theme (blue) instead of primary theme

## Related Files

- Backend DTO: `apps/server/src/modules/template-packs/dto/template-pack.dto.ts`
- Backend Types: `apps/server/src/modules/template-packs/template-pack.types.ts`
- Backend Service: `apps/server/src/modules/template-packs/template-pack.service.ts`
- Frontend Page: `apps/admin/src/pages/admin/pages/settings/project/templates.tsx`
- Migration: `apps/server/migrations/20251019_extend_template_packs_for_discovery.sql`
