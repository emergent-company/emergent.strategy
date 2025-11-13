# Template Pack Merging Fix

## Problem

The extraction system was only using schemas from **ONE** template pack instead of **ALL active** template packs for a project.

### Symptoms
- User saw only 5 types in extraction prompt (Person, Feature, Product, Location, Organization) from "Extraction Demo Pack"
- But the project had 2 active template packs totaling 10 types:
  - "Extraction Demo Pack": 5 types
  - "Meeting & Decision Management": 5 types (ActionItem, Decision, Meeting, MeetingSeries, Question)
- Prompt showed incomplete schema_types array
- Full schemas with properties/descriptions were being sent, but only from first pack

### Root Cause

In `extraction-worker.service.ts`, the `loadExtractionConfig()` method had:

```sql
SELECT tp.extraction_prompts, tp.object_type_schemas, ...
FROM kb.project_template_packs ptp
JOIN kb.graph_template_packs tp ON tp.id = ptp.template_pack_id
WHERE ptp.project_id = $1 AND ptp.active = true
LIMIT 1  -- ❌ WRONG! Only gets first pack
```

The query used `LIMIT 1` which only loaded the first active template pack, ignoring all others.

## Solution

### 1. Remove LIMIT and Load All Active Packs

Changed the SQL query to fetch ALL active template packs:

```typescript
const templatePackQuery = `SELECT 
        tp.id,
        tp.name,
        tp.extraction_prompts, 
        tp.object_type_schemas,
        ptp.customizations->>'default_prompt_key' as default_prompt_key
    FROM kb.project_template_packs ptp
     JOIN kb.graph_template_packs tp ON tp.id = ptp.template_pack_id
     WHERE ptp.project_id = $1 AND ptp.active = true
     ORDER BY tp.name`;  // ✅ No LIMIT - gets all packs
```

### 2. Merge Schemas from All Packs

Added merging logic similar to `TemplatePackService.getCompiledObjectTypesForProject()`:

```typescript
// Merge extraction prompts and object schemas from ALL active template packs
const mergedExtractionPrompts: Record<string, string> = {};
const mergedObjectSchemas: Record<string, any> = {};

this.logger.log(`[loadExtractionConfig] Found ${result.rows.length} active template pack(s)`);

for (const row of result.rows) {
    const packName = row.name;
    
    // Merge extraction prompts
    const extractionPrompts = row.extraction_prompts || {};
    for (const [key, value] of Object.entries(extractionPrompts)) {
        if (typeof value === 'string') {
            mergedExtractionPrompts[key] = value;
        }
    }
    
    // Merge object schemas
    const objectSchemas = row.object_type_schemas || {};
    for (const [typeName, schema] of Object.entries(objectSchemas)) {
        if (typeof schema !== 'object' || schema === null) continue;
        
        if (mergedObjectSchemas[typeName]) {
            // Later packs override earlier ones for same type
            mergedObjectSchemas[typeName] = {
                ...mergedObjectSchemas[typeName],
                ...(schema as Record<string, any>),
                _sources: [
                    ...(mergedObjectSchemas[typeName]._sources || []),
                    { pack: packName }
                ]
            };
        } else {
            mergedObjectSchemas[typeName] = {
                ...(schema as Record<string, any>),
                _sources: [{ pack: packName }]
            };
        }
    }
}
```

### 3. Enhanced Logging

Added debug logging to track merging process:

```typescript
this.logger.log(`[loadExtractionConfig] Merged ${Object.keys(mergedObjectSchemas).length} object type(s) from ${result.rows.length} template pack(s)`);
this.logger.debug(`[loadExtractionConfig] Object types: ${Object.keys(mergedObjectSchemas).join(', ')}`);
```

### 4. Return Merged Schemas

```typescript
return { prompt: basePrompt, objectSchemas: mergedObjectSchemas };
```

## Expected Behavior After Fix

### Before Fix
```json
{
  "schema_types": [
    "Person",
    "Feature", 
    "Product",
    "Location",
    "Organization"
  ]
}
```
Only 5 types from "Extraction Demo Pack"

### After Fix
```json
{
  "schema_types": [
    "ActionItem",
    "Decision",
    "Feature",
    "Location",
    "Meeting",
    "MeetingSeries",
    "Organization",
    "Person",
    "Product",
    "Question"
  ]
}
```
All 10 types from both active template packs, with full schemas for each

## Verification Steps

1. **Check active template packs:**
   ```sql
   SELECT 
       ptp.project_id,
       gtp.name as pack_name,
       count(*) as type_count
   FROM kb.project_template_packs ptp
   JOIN kb.graph_template_packs gtp ON ptp.template_pack_id = gtp.id
   WHERE ptp.active = true
   GROUP BY ptp.project_id, gtp.name;
   ```

2. **Trigger an extraction job** and check logs for:
   ```
   [loadExtractionConfig] Found 2 active template pack(s) for project <id>
   [loadExtractionConfig] Processing template pack: Extraction Demo Pack
   [loadExtractionConfig] Processing template pack: Meeting & Decision Management
   [loadExtractionConfig] Merged 10 object type(s) from 2 template pack(s)
   [loadExtractionConfig] Object types: ActionItem, Decision, Feature, Location, Meeting, MeetingSeries, Organization, Person, Product, Question
   ```

3. **Check Vertex AI provider logs** to verify prompt includes all 10 types:
   ```
   [buildPrompt] Schemas for 10 types (ActionItem, Decision, Feature, Location, Meeting, MeetingSeries, Organization, Person, Product, Question)
   ```

## Files Modified

- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`
  - Removed `LIMIT 1` from template pack query
  - Added schema merging logic for multiple packs
  - Enhanced logging to show pack processing
  - Returns merged schemas instead of first pack only

## Related Code

The `TemplatePackService.getCompiledObjectTypesForProject()` method already had the correct implementation for merging schemas from multiple packs. The extraction worker now uses the same pattern.

## Testing

1. Ensure project has multiple active template packs
2. Create an extraction job
3. Verify logs show all packs being processed
4. Verify prompt sent to LLM includes all types from all packs
5. Verify extracted entities can be of any type from any active pack

## Prevention

When working with template packs:
- Always assume a project can have MULTIPLE active packs
- Never use `LIMIT 1` when querying active template packs
- Always merge schemas/prompts from all active packs
- Test with projects that have 2+ active packs to catch this issue

## Impact

This fix ensures that:
1. Users can activate multiple template packs and get extraction support for ALL types
2. The UI correctly shows all available types (via compiled-types endpoint)
3. The extraction backend uses all available types (via worker service)
4. Frontend and backend stay synchronized on which types are available
