# Discovery Pack Save Implementation

## Overview

Implemented the complete backend-to-frontend flow for saving discovery results as template packs. Users can now finalize their discoveries and save them as either new template packs or extensions to existing packs.

## Backend Implementation

### 1. New Controller Endpoint

**File**: `apps/server/src/modules/discovery-jobs/discovery-job.controller.ts`

**Endpoint**: `POST /api/discovery-jobs/:jobId/finalize`

**Headers**:
- `X-Org-ID`: Organization ID
- `X-Project-ID`: Project ID

**Request Body**:
```typescript
{
  packName: string;
  mode: 'create' | 'extend';
  existingPackId?: string;  // Required when mode='extend'
  includedTypes: Array<{
    type_name: string;
    description: string;
    properties: Record<string, any>;
    required_properties: string[];
    example_instances: any[];
    frequency: number;
  }>;
  includedRelationships: Array<{
    source_type: string;
    target_type: string;
    relation_type: string;
    description: string;
    cardinality: string;
  }>;
}
```

**Response**:
```typescript
{
  template_pack_id: string;
  message: string;
}
```

**Scopes**: `discovery:write`

### 2. Service Method

**File**: `apps/server/src/modules/discovery-jobs/discovery-job.service.ts`

**Method**: `finalizeDiscoveryAndCreatePack()`

**Features**:
- Converts discovery types to template pack schema format
- Generates UI configs (icons, colors) for each type
- Converts relationships to template pack relationship schemas
- **Create Mode**: Creates new template pack in `kb.graph_template_packs`
- **Extend Mode**: Merges new types/relationships into existing pack
- Updates discovery job with `template_pack_id` and sets status to `completed`
- Logs all operations for debugging

**Schema Conversion**:

Discovery Type → Template Pack Schema:
```typescript
{
  type: 'object',
  required: type.required_properties || [],
  properties: type.properties || {}
}
```

UI Config Generation:
```typescript
{
  icon: suggestIconForType(type_name),  // Based on name heuristics
  color: generateColorForType(type_name),  // Hash-based color
  displayName: type_name,
  description: type.description
}
```

Relationship Schema:
```typescript
{
  sourceTypes: [source_type],
  targetTypes: [target_type],
  cardinality: cardinality,
  description: description
}
```

### 3. Database Operations

**Create Mode**:
```sql
INSERT INTO kb.graph_template_packs (
    name, version, description, author,
    object_type_schemas, relationship_type_schemas, ui_configs,
    source, discovery_job_id, pending_review
) VALUES (
    packName,
    '1.0.0',
    'Discovery pack with X types and Y relationships',
    'Auto-Discovery System',
    objectTypeSchemas::jsonb,
    relationshipTypeSchemas::jsonb,
    uiConfigs::jsonb,
    'discovered',
    jobId,
    false  -- Ready to use immediately
)
RETURNING id
```

**Extend Mode**:
```sql
-- 1. Fetch existing pack
SELECT object_type_schemas, relationship_type_schemas, ui_configs 
FROM kb.graph_template_packs 
WHERE id = existingPackId

-- 2. Merge schemas (done in application code)
-- 3. Update pack
UPDATE kb.graph_template_packs 
SET object_type_schemas = merged_schemas,
    relationship_type_schemas = merged_rel_schemas,
    ui_configs = merged_ui_configs,
    updated_at = now()
WHERE id = existingPackId
```

**Update Discovery Job**:
```sql
UPDATE kb.discovery_jobs 
SET template_pack_id = newPackId,
    status = 'completed',
    completed_at = now(),
    updated_at = now()
WHERE id = jobId
```

## Frontend Implementation

### 1. Updated Component: Step5_Complete

**File**: `apps/admin/src/components/organisms/DiscoveryWizard/Step5_Complete.tsx`

**New State**:
```typescript
const [saving, setSaving] = useState(false);
const [saved, setSaved] = useState(false);
const [error, setError] = useState<string | null>(null);
const [savedPackId, setSavedPackId] = useState<string | null>(null);
```

**Save Handler**:
```typescript
const handleSavePack = async () => {
    const response = await fetchJson<{ template_pack_id: string; message: string }>(
        `${apiBase}/api/discovery-jobs/${jobData.id}/finalize`,
        {
            method: 'POST',
            body: JSON.stringify({
                packName: packConfig.packName,
                mode: packConfig.mode,
                existingPackId: packConfig.existingPackId,
                includedTypes: includedTypes,
                includedRelationships: includedRelationships
            })
        }
    );
    
    setSavedPackId(response.template_pack_id);
    setSaved(true);
};
```

### 2. UI Changes

**Before Save**:
- Icon: Package icon (blue)
- Title: "Discovery Complete!"
- Message: "Review your discovery results and save as a template pack."
- Button: "Save Template Pack" (primary button)

**After Save**:
- Icon: Checkmark circle (green)
- Title: "Template Pack Saved!"
- Message: "Your template pack has been successfully created and is ready to use."
- Success Banner: Shows saved pack ID and success message
- No save button (already saved)

**Summary Card**:
- Pack Name: User-provided name
- Action: "Create New Pack" or "Extend Pack (id...)"
- Pack ID: Displayed after successful save (truncated for readability)
- Entity Types: X / Y (Z excluded)
- Relationships: X / Y (Z excluded)

**Next Steps Card** (Conditional):

Before Save:
```
Ready to Save
• Review the types and relationships above
• Click "Save Template Pack" to create your pack
• The pack will be saved to: New Pack / Existing Pack
```

After Save:
```
Next Steps
• Install the pack in your project settings to use the types
• Start creating instances of your discovered entity types
• Run additional discoveries to expand your knowledge graph
```

### 3. Button States

**Save Button**:
- Default: "Save Template Pack" with save icon
- Loading: "Saving Pack..." with spinner
- Hidden after successful save

**Other Buttons** (always visible):
- "Start New Discovery": Resets wizard to Step 1
- "Close": Closes wizard modal

### 4. Error Handling

Display error alert if:
- Pack config is missing
- API call fails
- Network error occurs

Error shown in red alert box with error icon and message.

## Complete Flow

### User Journey

1. **Configure Discovery** (Step 1)
   - User provides KB purpose and selects documents
   - Clicks "Start Discovery"

2. **Analysis Running** (Step 2)
   - Shows progress indicator
   - Waits for LLM analysis to complete

3. **Review Types** (Step 3)
   - User sees discovered entity types
   - Can delete unwanted types
   - Clicks "Continue"

4. **Review Relationships** (Step 4)
   - User sees discovered relationships
   - Relationships auto-filtered if types were deleted
   - Can delete unwanted relationships
   - Clicks "Continue"

5. **Configure Pack** (Step 4.5)
   - User chooses mode: Create New or Extend Existing
   - **Create**: Enters custom pack name
   - **Extend**: Selects pack from list, name auto-filled
   - Clicks "Continue"

6. **Save Pack** (Step 5)
   - User reviews final summary
   - Sees pack name, mode, type/relationship counts
   - Clicks "Save Template Pack"
   - Shows loading spinner
   - On success: Shows green success state with pack ID
   - User can start new discovery or close

### Data Flow

```
Frontend (Step 5) 
    ↓
POST /api/discovery-jobs/{jobId}/finalize
    ↓
DiscoveryJobController.finalizeDiscovery()
    ↓
DiscoveryJobService.finalizeDiscoveryAndCreatePack()
    ↓
    ├─ Convert types → object_type_schemas
    ├─ Generate UI configs (icons, colors)
    ├─ Convert relationships → relationship_type_schemas
    ↓
    ├─ CREATE MODE:
    │   └─ INSERT INTO kb.graph_template_packs
    ↓
    ├─ EXTEND MODE:
    │   ├─ SELECT existing pack
    │   ├─ Merge schemas
    │   └─ UPDATE kb.graph_template_packs
    ↓
UPDATE kb.discovery_jobs (set template_pack_id, status=completed)
    ↓
Return { template_pack_id, message }
    ↓
Frontend: Display success with pack ID
```

## Testing

### Manual Testing Steps

1. Start a discovery job
2. Wait for completion
3. Review and edit types/relationships
4. Configure pack (try both create and extend modes)
5. Save pack
6. Verify:
   - Loading state appears
   - Success message shows
   - Pack ID is displayed
   - Can start new discovery
   - Database has new pack record

### API Testing

**Create New Pack**:
```bash
curl -X POST http://localhost:3001/api/discovery-jobs/{jobId}/finalize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -H "X-Org-ID: {orgId}" \
  -H "X-Project-ID: {projectId}" \
  -d '{
    "packName": "Test Discovery Pack",
    "mode": "create",
    "includedTypes": [...],
    "includedRelationships": [...]
  }'
```

**Extend Existing Pack**:
```bash
curl -X POST http://localhost:3001/api/discovery-jobs/{jobId}/finalize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -H "X-Org-ID: {orgId}" \
  -H "X-Project-ID: {projectId}" \
  -d '{
    "packName": "Extended Pack",
    "mode": "extend",
    "existingPackId": "{packId}",
    "includedTypes": [...],
    "includedRelationships": [...]
  }'
```

### Database Verification

```sql
-- Check created pack
SELECT id, name, version, description, author, source, discovery_job_id
FROM kb.graph_template_packs
WHERE discovery_job_id = '{jobId}';

-- Check discovery job updated
SELECT id, status, template_pack_id, completed_at
FROM kb.discovery_jobs
WHERE id = '{jobId}';
```

## Security

- **Scope**: Requires `discovery:write` scope
- **Tenant Isolation**: Uses `X-Org-ID` and `X-Project-ID` headers
- **RLS**: Template packs stored globally, discovery jobs are tenant-scoped
- **Validation**: Validates pack config, type arrays, relationship arrays

## Performance Considerations

- **Schema Merging**: For extend mode, merges schemas in-memory (fast for typical pack sizes)
- **Icon/Color Generation**: Uses simple heuristics, no external calls
- **Single Transaction**: All DB operations in service method (could be wrapped in transaction if needed)
- **JSON Serialization**: PostgreSQL handles JSONB efficiently

## Future Enhancements

1. **Pack Details Page**: Create `/admin/template-packs/:id` route
2. **Pack Installation UI**: One-click install from completion screen
3. **Version Management**: Allow versioning when extending packs
4. **Pack Validation**: Validate schemas before saving
5. **Conflict Resolution**: Handle overlapping type names in extend mode
6. **Pack Metadata**: Add tags, categories, visibility settings
7. **Preview Mode**: Show pack preview before saving
8. **Rollback**: Allow reverting extended packs

## Troubleshooting

### Pack Not Saving

- Check browser console for errors
- Verify API endpoint is reachable
- Check auth token is valid
- Verify org/project headers are set

### 404 Error

- Ensure discovery job ID is valid
- Check job exists in `kb.discovery_jobs`
- Verify user has access to job's project

### Schema Errors

- Validate types have required fields
- Check relationships reference existing types
- Ensure cardinality is valid value

## Related Files

**Backend**:
- `apps/server/src/modules/discovery-jobs/discovery-job.controller.ts`
- `apps/server/src/modules/discovery-jobs/discovery-job.service.ts`

**Frontend**:
- `apps/admin/src/components/organisms/DiscoveryWizard/Step5_Complete.tsx`
- `apps/admin/src/components/organisms/DiscoveryWizard/Step4_5_ConfigurePack.tsx`
- `apps/admin/src/components/organisms/DiscoveryWizard/DiscoveryWizard.tsx`

**Documentation**:
- `docs/DISCOVERY_PACK_CONFIGURATION.md`
- `docs/DISCOVERY_WIZARD_FLOW.md`
