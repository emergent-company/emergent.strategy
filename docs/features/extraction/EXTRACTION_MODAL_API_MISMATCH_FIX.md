# Extraction Modal API Mismatch Fix

**Date:** October 18, 2025  
**Issue:** "No Object Types Available" shown even when template packs are installed  
**Root Cause:** API response structure mismatch between frontend and backend

## Problem

User reported seeing "No Object Types Available" message in the extraction modal despite having two template packs installed (Extraction Demo Pack and Meeting & Decision Management).

### Investigation Steps

1. **Checked Database:** Confirmed template packs were installed and types existed:
   ```sql
   SELECT ptr.type, ptr.enabled, tp.name as pack_name 
   FROM kb.project_object_type_registry ptr 
   LEFT JOIN kb.graph_template_packs tp ON ptr.template_pack_id = tp.id
   WHERE ptr.project_id = '342b78f5-2904-4e1a-ae41-9c2d481a3a46'
   ```
   
   **Result:** Found 8 types across 2 packs:
   - Extraction Demo Pack: Person, Organization, Location
   - Meeting Pack: Meeting, Decision, ActionItem, MeetingSeries, Question

2. **Traced API Call:** Frontend called `/api/type-registry/projects/{projectId}`

3. **Found Mismatch:** 
   - **Backend Returns:** `TypeRegistryEntryDto[]` (array of objects)
   - **Frontend Expected:** `{ object_types: Record<string, ObjectTypeDefinition>, relationship_types: Record<string, any> }`

### Root Cause

The `apps/admin/src/api/type-registry.ts` file was created with incorrect TypeScript interfaces that didn't match the actual backend response structure.

**Backend (Correct):**
```typescript
// apps/server/src/modules/type-registry/type-registry.controller.ts
@Get('projects/:projectId')
async getProjectTypes(...): Promise<TypeRegistryEntryDto[]> {
  return this.typeRegistryService.getProjectTypes(projectId, orgId, query);
}
```

**Frontend (Wrong):**
```typescript
// apps/admin/src/api/type-registry.ts
export interface TypeRegistryResponse {
    object_types: Record<string, ObjectTypeDefinition>;  // ❌ Backend doesn't return this structure
    relationship_types: Record<string, any>;
}
```

### Why It Failed

The ExtractionConfigModal tried to process the response as:
```typescript
Object.entries(response.object_types).map(...)  // ❌ response.object_types was undefined
```

Since `response.object_types` was `undefined`, `Object.entries()` threw an error, causing the catch block to set `availableTypes = []`, which triggered the "No Object Types Available" alert.

## Solution

### 1. Fixed Type Definitions (`apps/admin/src/api/type-registry.ts`)

**Before:**
```typescript
export interface TypeRegistryResponse {
    object_types: Record<string, ObjectTypeDefinition>;
    relationship_types: Record<string, any>;
}

async getProjectTypes(projectId: string): Promise<TypeRegistryResponse> {
    return fetchJson<TypeRegistryResponse>(
        `${apiBase}/api/type-registry/projects/${projectId}`
    );
}
```

**After:**
```typescript
export interface TypeRegistryEntryDto {
    id: string;
    type: string;
    source: 'template' | 'custom' | 'discovered';
    template_pack_id?: string;
    template_pack_name?: string;
    schema_version: number;
    json_schema: any;
    ui_config: Record<string, any>;
    extraction_config: Record<string, any>;
    enabled: boolean;
    discovery_confidence?: number;
    description?: string;
    object_count?: number;
    created_at: string;
    updated_at: string;
}

async getProjectTypes(projectId: string): Promise<TypeRegistryEntryDto[]> {
    return fetchJson<TypeRegistryEntryDto[]>(
        `${apiBase}/api/type-registry/projects/${projectId}`
    );
}
```

### 2. Fixed Response Processing (`apps/admin/src/components/organisms/ExtractionConfigModal.tsx`)

**Before:**
```typescript
const response = await typeRegistryClient.getProjectTypes(projectId);

// Transform object types into EntityType format
const types: EntityType[] = Object.entries(response.object_types).map(([name, def]) => ({
    value: name,
    label: def.label || name,
    description: def.description || `Extract ${name} entities from documents`,
}));
```

**After:**
```typescript
const entries = await typeRegistryClient.getProjectTypes(projectId);

// Transform TypeRegistryEntryDto[] into EntityType format
// Only include enabled types from template packs or custom types
const types: EntityType[] = entries
    .filter(entry => entry.enabled)
    .map(entry => ({
        value: entry.type,
        label: entry.ui_config?.label || entry.type,
        description: entry.description || `Extract ${entry.type} entities from documents`,
    }));
```

## Testing

After fix, user should see:
1. **Extraction Demo Pack types:** Person, Organization, Location
2. **Meeting Pack types:** Meeting, Decision, ActionItem, MeetingSeries, Question
3. All 8 types displayed as checkboxes in the extraction modal
4. First 4 types pre-selected by default

### Verification Query

```sql
SELECT ptr.type, ptr.enabled, ptr.ui_config->>'label' as label, 
       ptr.description, tp.name as pack_name
FROM kb.project_object_type_registry ptr
LEFT JOIN kb.graph_template_packs tp ON ptr.template_pack_id = tp.id
WHERE ptr.project_id = '342b78f5-2904-4e1a-ae41-9c2d481a3a46'
  AND ptr.enabled = true
ORDER BY tp.name, ptr.type;
```

## Prevention

### Checklist for Future API Client Creation

1. ✅ **Check Backend First:** Always inspect the actual controller return type before creating frontend client
2. ✅ **Match DTOs Exactly:** Copy backend DTO interfaces to frontend (or use code generation)
3. ✅ **Test Response Shape:** Add console.log to verify response structure during development
4. ✅ **Handle Arrays vs Objects:** Be explicit about whether endpoint returns array or object
5. ✅ **Document Response Format:** Add JSDoc comments showing example response

### Recommended Approach

Use code generation to keep frontend/backend types in sync:
```bash
# Generate TypeScript types from OpenAPI spec
npm run generate:api-types
```

Or maintain shared types in a monorepo package:
```
packages/
  shared-types/
    src/
      type-registry.ts  # Import in both frontend and backend
```

## Related Files

- **Frontend API Client:** `apps/admin/src/api/type-registry.ts`
- **Frontend Modal:** `apps/admin/src/components/organisms/ExtractionConfigModal.tsx`
- **Backend Controller:** `apps/server/src/modules/type-registry/type-registry.controller.ts`
- **Backend Service:** `apps/server/src/modules/type-registry/type-registry.service.ts`
- **Backend DTOs:** `apps/server/src/modules/type-registry/dto/type-registry.dto.ts`

## Impact

- ✅ Extraction modal now shows installed template pack types
- ✅ Users can select from all available object types
- ✅ Type information (label, description) flows from backend to frontend
- ✅ Filtering works correctly (only enabled types shown)
- ✅ Default selection picks first 4 types automatically

## Lessons Learned

1. **Always verify API contracts** between frontend and backend before implementation
2. **Type safety** doesn't prevent structural mismatches—runtime testing is still needed
3. **Error handling** should log the actual error, not just silent fallback
4. **Hot reload** made debugging and fixing much faster (changes applied in < 100ms)
