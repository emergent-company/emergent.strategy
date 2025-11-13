# Extraction Base Prompt - UI Settings Implementation

## Summary

Added configurable extraction base prompt to the Admin UI Settings page, allowing users to customize the LLM instruction template used for entity extraction without editing environment variables or restarting the server.

**Completed**: October 20, 2025

## Changes Made

### 1. Backend Configuration Schema

**File**: `apps/server/src/common/config/config.schema.ts`

- Added `EXTRACTION_BASE_PROMPT` environment variable to `EnvVariables` class
- Added to validation defaults in `validate()` function
- Marked as optional string with proper decorator

**Code**:
```typescript
@IsString()
@IsOptional()
EXTRACTION_BASE_PROMPT?: string; // Base instruction prompt for LLM entity extraction (schema-agnostic)
```

### 2. Backend Configuration Service

**File**: `apps/server/src/common/config/config.service.ts`

- Added `extractionBasePrompt` getter with built-in default
- Added comprehensive JSDoc explaining the priority: Database → Environment → Default
- Default prompt is schema-agnostic (doesn't mention specific entity types)

**Code**:
```typescript
get extractionBasePrompt(): string {
    return this.env.EXTRACTION_BASE_PROMPT || 
        `You are an expert entity extraction system. Your task is to analyze the provided document and extract structured entities according to the schema definitions that follow.

Extract entities that match the defined types. For each entity:
- Provide a clear, descriptive name
- Include all relevant properties from the schema
- Assign appropriate confidence scores (0.0-1.0)
- Identify relationships between entities

Return your response as a valid JSON array matching the expected schema format.`;
}
```

### 3. Settings Controller - Database Integration

**File**: `apps/server/src/modules/settings/settings.controller.ts`

**Changes**:
- Converted from placeholder implementation to real database-backed service
- Added `DatabaseService` injection
- Implemented GET `/settings` - List all settings
- Implemented GET `/settings/:key` - Get single setting
- Implemented PUT `/settings/:key` - Update or create setting
- Settings stored in `kb.settings` table (already exists in schema)

**API Endpoints**:
```typescript
GET    /api/settings          → List all settings
GET    /api/settings/:key     → Get single setting  
PUT    /api/settings/:key     → Update/create setting (body: { value: any })
```

### 4. Extraction Worker - Database Setting Loading

**File**: `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`

**Changes**:
- Updated `loadExtractionConfig()` method to check database first
- Queries `kb.settings` table for `extraction.basePrompt` key
- Falls back to `AppConfigService.extractionBasePrompt` if not in database
- Added error handling for database query failures
- Added log message when using database setting vs default

**Priority Flow**:
1. Database: `SELECT value FROM kb.settings WHERE key = 'extraction.basePrompt'`
2. Environment: `process.env.EXTRACTION_BASE_PROMPT`
3. Default: Built-in prompt from `AppConfigService`

**Code**:
```typescript
let basePrompt = this.config.extractionBasePrompt; // Default from config service

try {
    const settingResult = await this.db.query(
        'SELECT value FROM kb.settings WHERE key = $1',
        ['extraction.basePrompt']
    );
    if (settingResult.rows.length > 0 && settingResult.rows[0].value) {
        const value = settingResult.rows[0].value;
        basePrompt = typeof value === 'string' ? value : (value as any)?.text || (value as any)?.template || value;
        this.logger.log('Using extraction base prompt from database settings');
    }
} catch (error) {
    this.logger.warn('Failed to load extraction base prompt from database, using default', error);
}
```

### 5. Frontend Settings UI

**File**: `apps/admin/src/pages/admin/pages/settings/ai-prompts.tsx`

**Changes**:
- Added extraction base prompt default constant
- Added `useSettingString` hook for `extraction.basePrompt` key
- Added new "Entity Extraction Base Prompt" card with:
  - Icon: `lucide--scan-search`
  - Textarea for editing (h-48 height)
  - Guidance text explaining schema-agnostic nature
  - "Restore default" button
  - "Save" button with loading state
  - Error display
- Positioned BEFORE the existing System Prompt card
- Updated page description to mention extraction prompt

**UI Structure**:
```tsx
<div className="bg-base-100 mt-6 card-border card">
    <div className="gap-6 sm:gap-8 card-body">
        <div className="flex items-center gap-2">
            <Icon icon="lucide--scan-search" className="size-5" aria-hidden />
            <h2 className="font-medium text-lg">Entity Extraction Base Prompt</h2>
        </div>
        <p className="mt-1 text-xs text-base-content/70">
            Base instruction for LLM entity extraction. This should be schema-agnostic...
        </p>
        <textarea className="mt-3 sm:mt-4 w-full h-48 textarea" ... />
        <div className="flex justify-end items-center gap-3 sm:gap-4 mt-3 sm:mt-4">
            <button className="btn btn-sm btn-ghost" onClick={restore}>Restore default</button>
            <button className="btn btn-sm btn-primary" onClick={save}>Save</button>
        </div>
    </div>
</div>
```

### 6. Environment Variable Documentation

**File**: `apps/server/.env.example`

**Added**:
```bash
# Customizable base prompt for entity extraction (optional)
# If not set, uses default schema-agnostic prompt
# This should NOT mention specific entity types - those come from schemas
# EXTRACTION_BASE_PROMPT="You are an expert entity extraction system..."
```

### 7. Comprehensive Documentation

**File**: `docs/EXTRACTION_BASE_PROMPT_CONFIGURATION.md`

**Sections**:
- Overview
- Configuration priority (Database → Environment → Default)
- Default prompt text
- Configuring via Admin UI (with screenshots)
- Configuring via environment variable
- Best practices (Do's and Don'ts)
- How it works (prompt assembly flow)
- Testing changes
- Troubleshooting
- Related files
- See also links

## Testing

### Manual Testing Steps

1. **Navigate to Settings**:
   - Go to `/admin/settings/ai/prompts`
   - Verify "Entity Extraction Base Prompt" card appears

2. **Test Default Value**:
   - Initial load should show the default prompt
   - Verify it's the schema-agnostic version (no entity type names)

3. **Test Save**:
   - Edit the prompt text
   - Click "Save"
   - Refresh page - edited text should persist
   - Check database: `SELECT * FROM kb.settings WHERE key = 'extraction.basePrompt'`

4. **Test Restore Default**:
   - Click "Restore default"
   - Verify original text appears
   - Click "Save"
   - Check database - should have default value

5. **Test Extraction**:
   - Upload a document to trigger extraction
   - Check logs for: "Using extraction base prompt from database settings"
   - Verify extraction job uses the custom prompt

### Database Verification

```sql
-- Check setting exists
SELECT key, value, created_at, updated_at 
FROM kb.settings 
WHERE key = 'extraction.basePrompt';

-- Manually set (for testing)
INSERT INTO kb.settings (key, value, updated_at)
VALUES ('extraction.basePrompt', '"Custom prompt text"'::jsonb, now())
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Delete setting (fall back to default)
DELETE FROM kb.settings WHERE key = 'extraction.basePrompt';
```

### Log Verification

```bash
# Watch extraction logs
npm run workspace:logs -- server | grep -i "extraction base"

# Expected outputs:
# "Using extraction base prompt from database settings"  (when DB setting exists)
# "Using schema-based extraction with X object type(s)"  (always)
```

## Benefits

### Before
- ❌ Extraction prompt hardcoded in worker service
- ❌ Required code changes to customize prompt
- ❌ Required server restart for changes
- ❌ No visibility into what prompt is being used
- ❌ No easy way to experiment with different prompts

### After
- ✅ Extraction prompt configurable via UI
- ✅ No code changes needed
- ✅ No server restart required
- ✅ Changes take effect immediately for new extraction jobs
- ✅ Easy to test different prompts
- ✅ Default prompt is schema-agnostic
- ✅ Three-tier configuration (Database → Environment → Default)
- ✅ Full documentation with best practices

## Architecture

### Configuration Priority

```
1. Database (kb.settings table)
   ↓ (if not found)
2. Environment Variable (EXTRACTION_BASE_PROMPT)
   ↓ (if not set)
3. Default (AppConfigService.extractionBasePrompt)
```

### Data Flow

```
User edits in UI
    ↓
PUT /api/settings/extraction.basePrompt
    ↓
SettingsController.update()
    ↓
INSERT/UPDATE kb.settings table
    ↓
ExtractionWorker.loadExtractionConfig()
    ↓
SELECT FROM kb.settings (highest priority)
    ↓
LLM Provider receives basePrompt + objectSchemas
    ↓
Extraction job processes with custom prompt
```

## Related PRs/Issues

- Initial template pack enhancements (relationship counter, compiled preview, schema examples)
- Extraction prompt quality improvements (schema-based approach)
- Settings controller placeholder → real implementation

## Future Enhancements

1. **Prompt Versioning**: Track history of prompt changes
2. **Prompt Templates**: Pre-built prompts for different use cases
3. **A/B Testing**: Compare extraction quality across different prompts
4. **Prompt Validation**: Syntax checking before save
5. **Per-Project Prompts**: Allow different prompts for different projects
6. **Prompt Performance Metrics**: Track extraction quality by prompt version

## See Also

- [TEMPLATE_PACK_ENHANCEMENTS_COMPLETE.md](./TEMPLATE_PACK_ENHANCEMENTS_COMPLETE.md)
- [TEMPLATE_PACK_EXAMPLES.md](./TEMPLATE_PACK_EXAMPLES.md)
- [EXTRACTION_BASE_PROMPT_CONFIGURATION.md](./EXTRACTION_BASE_PROMPT_CONFIGURATION.md)
- [AUTO_DISCOVERY_SYSTEM_SPEC.md](./AUTO_DISCOVERY_SYSTEM_SPEC.md)
