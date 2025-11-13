# Auto-Extraction Dynamic Object Types Fix

**Date:** 2025-10-20  
**Issue:** UI showed hardcoded entity types (ActionItem, Decision, Meeting, etc.) instead of dynamically loading from active template pack schemas

## Problem

The Auto-Extraction Settings page (`apps/admin/src/pages/admin/pages/settings/project/auto-extraction.tsx`) had a hardcoded array of object types:

```typescript
const OBJECT_TYPES = [
    { value: 'Requirement', label: 'Requirements', description: '...' },
    { value: 'Decision', label: 'Decisions', description: '...' },
    { value: 'Feature', label: 'Features', description: '...' },
    // ... etc
];
```

This created a disconnect between:
- **UI**: Showing hardcoded types (ActionItem, Decision, Meeting, MeetingSeries, etc.)
- **Backend**: Actually extracting types from template pack (Person, Feature, Product, Location, Organization)

## Root Cause

1. The UI was not querying the backend for available object types
2. The hardcoded list did not reflect the actual schemas in the project's active template pack
3. Users saw a type picker that didn't match what extraction would actually use

## Solution

### Backend Endpoint (Already Existed)

The backend already had the perfect endpoint:

```
GET /api/template-packs/projects/:projectId/compiled-types
```

This endpoint:
- Merges all object type schemas from active template packs for the project
- Returns a record of type definitions with properties, descriptions, etc.
- Is implemented in `TemplatePackService.getCompiledObjectTypesForProject()`

### Frontend Changes

Modified **two components** to use the same dynamic endpoint:

#### 1. Auto-Extraction Settings Page (`auto-extraction.tsx`)

1. **Remove hardcoded types**: Deleted the static `OBJECT_TYPES` array

2. **Add dynamic state**: 
   ```typescript
   const [availableObjectTypes, setAvailableObjectTypes] = useState<ObjectTypeOption[]>([]);
   const [loadingTypes, setLoadingTypes] = useState(false);
   ```

3. **Fetch from API**:
   ```typescript
   const loadAvailableObjectTypes = async () => {
       const compiledTypes = await fetchJson<Record<string, any>>(
           `${apiBase}/api/template-packs/projects/${config.activeProjectId}/compiled-types`
       );
       
       // Transform into UI options
       const typeOptions: ObjectTypeOption[] = Object.entries(compiledTypes).map(
           ([typeName, schema]) => ({
               value: typeName,
               label: typeName + 's',
               description: schema.description || `${typeName} entities from your documents`
           })
       );
       
       setAvailableObjectTypes(typeOptions);
   };
   ```

4. **Load on mount**: Called `loadAvailableObjectTypes()` in useEffect when project changes

5. **Update UI rendering**: 
   - Show loading spinner while fetching types
   - Show helpful message if no template packs are installed
   - Render dynamic type checkboxes from `availableObjectTypes`

#### 2. Extraction Config Modal (`ExtractionConfigModal.tsx`)

1. **Remove type registry dependency**: Removed `createTypeRegistryClient` import

2. **Use template pack endpoint**: Changed from type registry API to template packs API:
   ```typescript
   // OLD: Used type registry
   const typeRegistryClient = createTypeRegistryClient(apiBase, fetchJson as any);
   const entries = await typeRegistryClient.getProjectTypes(projectId);
   
   // NEW: Uses template packs (same as settings page)
   const compiledTypes = await fetchJson<Record<string, any>>(
       `${apiBase}/api/template-packs/projects/${projectId}/compiled-types`
   );
   ```

3. **Consistent transformation**: Uses the same logic to transform schemas into UI options

## Benefits

1. **Accuracy**: UI now shows exactly what types will be extracted
2. **Flexibility**: When template packs change, UI automatically reflects new types
3. **User Experience**: No confusion about which types are actually available
4. **Consistency**: Frontend and backend are synchronized via single source of truth (database)

## Testing

### Verify Both Components Show Template Pack Types

#### 1. Auto-Extraction Settings Page

1. Navigate to **Settings > Project > Auto-Extraction** 
   ```
   http://localhost:5175/admin/settings/project/auto-extraction
   ```

2. Enable auto-extraction

3. Check the "Object Types to Extract" section:
   - Should see types from your active template pack (e.g., Person, Feature, Product, Location, Organization)
   - Should NOT see hardcoded types (ActionItem, Decision, Meeting, MeetingSeries, Question)
   - Brief loading spinner while fetching

#### 2. Extraction Config Modal

1. Navigate to any document in the admin UI

2. Click the "Extract" button to open extraction modal

3. Verify the entity type checkboxes:
   - Should show types from your template pack (Person, Feature, Product, Location, Organization)
   - Should NOT show ActionItem, Decision, Meeting, etc.
   - Should match exactly what appears in the settings page

4. Select some types and start extraction

5. Verify extraction logs show only the selected types

### Test Edge Cases

1. **No template packs installed**: Both components should show warning message suggesting Auto-Discovery
2. **Loading state**: Brief spinner in both components while fetching types
3. **Multiple template packs**: Should show merged types from all active packs in both components
4. **API endpoint verification**:
   ```bash
   # Replace with your actual project ID
   curl http://localhost:3001/template-packs/projects/YOUR_PROJECT_ID/compiled-types
   ```
   Should return schemas matching what both UI components display

### Verify Extraction Flow

1. **From Settings Page**:
   - Select Person and Organization types
   - Save settings
   - Upload a document
   - Check logs - should extract Person and Organization only

2. **From Extraction Modal**:
   - Open a document
   - Click Extract
   - Select Feature and Location types
   - Start extraction
   - Verify only Feature and Location are extracted

3. **Consistency Check**:
   - Types shown in settings page should match extraction modal
   - Types in UI should match extraction logs
   - All should reflect active template pack configuration

## Related Files

- `apps/admin/src/pages/admin/pages/settings/project/auto-extraction.tsx` - Settings page (modified)
- `apps/admin/src/components/organisms/ExtractionConfigModal.tsx` - Extraction modal (modified)
- `apps/server/src/modules/template-packs/template-pack.controller.ts` - API endpoint
- `apps/server/src/modules/template-packs/template-pack.service.ts` - Service logic
- `apps/server/src/modules/extraction-jobs/llm/vertex-ai.provider.ts` - Uses schemas for extraction

## Migration Notes

### For Users

No action required. Both the Settings page and Extraction modal will automatically show your actual template pack types:
- Refresh your browser after server restart
- Visit Auto-Extraction Settings page to see updated types
- Open extraction modal from any document to verify updated types

### For Developers

- The `OBJECT_TYPES` constant has been removed from auto-extraction.tsx
- The type registry import has been removed from ExtractionConfigModal.tsx  
- Both components now use the same API endpoint: `/api/template-packs/projects/:projectId/compiled-types`
- Object types are loaded dynamically on component mount
- If you need entity types in other components, use the same endpoint for consistency
- If adding new extraction-related features, use the `/compiled-types` endpoint for type information
- Type descriptions come from template pack schemas; ensure schemas include helpful descriptions

## Future Enhancements

1. **Real-time updates**: Refresh types when template packs are installed/uninstalled
2. **Type details modal**: Show full schema when clicking a type
3. **Type search/filter**: For projects with many object types
4. **Type grouping**: Group related types (e.g., "People", "Documents", "Events")
5. **Usage statistics**: Show how many of each type have been extracted

## Debugging

If types don't appear:

1. Check browser console for API errors
2. Verify project has active template packs:
   ```sql
   SELECT * FROM kb.project_template_packs 
   WHERE project_id = '<your-project-id>' AND active = true;
   ```
3. Verify template pack has schemas:
   ```sql
   SELECT name, object_type_schemas 
   FROM kb.graph_template_packs 
   WHERE id IN (SELECT template_pack_id FROM kb.project_template_packs WHERE project_id = '<your-project-id>');
   ```
4. Test endpoint directly:
   ```bash
   curl -H "Authorization: Bearer <token>" \
        -H "X-Org-ID: <org-id>" \
        -H "X-Project-ID: <project-id>" \
        http://localhost:3001/template-packs/projects/<project-id>/compiled-types
   ```

## Summary

This fix ensures the Auto-Extraction Settings UI dynamically reflects the actual object types available from installed template packs, eliminating confusion and keeping frontend/backend synchronized.
