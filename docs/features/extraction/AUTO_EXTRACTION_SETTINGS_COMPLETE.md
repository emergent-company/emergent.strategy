# Auto-Extraction Settings - Complete Implementation

## Overview
This document describes the complete implementation of auto-extraction settings control, including backend API support and frontend UI.

**Date**: 2025-10-22  
**Status**: ✅ Complete

## Problem Summary
1. **Auto-extraction was enabled by default** - All uploaded documents automatically triggered extraction jobs
2. **No UI control** - Users couldn't toggle auto-extraction on/off
3. **No configuration options** - Users couldn't customize extraction behavior (object types, confidence thresholds, etc.)

## Solution Summary
1. ✅ Changed database schema to set `auto_extract_objects = false` by default (opt-in)
2. ✅ Created migration to disable auto-extraction for all existing projects
3. ✅ Added backend support for updating auto-extraction settings via PATCH endpoint
4. ✅ Frontend settings page already existed and now fully functional

## Implementation Details

### 1. Database Schema Changes

#### Migration 0005 (Modified)
**File**: `apps/server/migrations/0005_auto_extraction_and_notifications.sql`

**Change**: Changed default from `true` to `false`
```sql
-- BEFORE:
ADD COLUMN IF NOT EXISTS auto_extract_objects BOOLEAN NOT NULL DEFAULT true,

-- AFTER:
ADD COLUMN IF NOT EXISTS auto_extract_objects BOOLEAN NOT NULL DEFAULT false,
```

**Impact**: All NEW projects created after this change will have auto-extraction disabled by default.

#### Migration 0006 (New)
**File**: `apps/server/migrations/0006_disable_auto_extract_by_default.sql`

**Purpose**: Update all EXISTING projects to disable auto-extraction
```sql
-- Update all existing projects to disable auto-extraction
UPDATE kb.projects
SET auto_extract_objects = false
WHERE auto_extract_objects = true;

COMMENT ON COLUMN kb.projects.auto_extract_objects IS 
  'When true, automatically create extraction jobs when documents are uploaded to this project. Default: false (opt-in)';
```

**Migration Status**: ✅ Applied successfully (2025-10-22)
```
✓ Applied in 784ms
Total applied: 22 migrations
```

**Verification**: All projects now have `auto_extract_objects = false`
```sql
SELECT COUNT(*) FROM kb.projects WHERE auto_extract_objects = true;
-- Result: 0 (no projects have auto-extraction enabled)
```

### 2. Backend API Changes

#### UpdateProjectDto (Enhanced)
**File**: `apps/server/src/modules/projects/dto/project.dto.ts`

**Added Fields**:
```typescript
@ApiProperty({
    example: false,
    description: 'Enable/disable automatic extraction of objects from uploaded documents',
    required: false
})
@IsOptional()
@IsBoolean()
auto_extract_objects?: boolean;

@ApiProperty({
    example: {
        enabled_types: ['Requirement', 'Decision', 'Feature'],
        min_confidence: 0.7,
        duplicate_strategy: 'skip',
        require_review: true,
        notify_on_complete: true,
        notification_channels: ['inbox']
    },
    description: 'Configuration for automatic extraction',
    required: false
})
@IsOptional()
@IsObject()
auto_extract_config?: any;
```

#### ProjectDto (Enhanced)
**File**: `apps/server/src/modules/projects/dto/project.dto.ts`

**Added Response Fields**:
```typescript
@ApiProperty({
    example: false,
    description: 'When true, automatically create extraction jobs when documents are uploaded',
    required: false
})
auto_extract_objects?: boolean;

@ApiProperty({
    example: {
        enabled_types: ['Requirement', 'Decision', 'Feature'],
        min_confidence: 0.7,
        duplicate_strategy: 'skip',
        require_review: true,
        notify_on_complete: true,
        notification_channels: ['inbox']
    },
    description: 'Configuration for automatic extraction jobs',
    required: false
})
auto_extract_config?: any;
```

#### ProjectsService.update() (Enhanced)
**File**: `apps/server/src/modules/projects/projects.service.ts`

**Added Support for New Fields**:
```typescript
async update(projectId: string, updates: { 
    name?: string; 
    kb_purpose?: string; 
    chat_prompt_template?: string;
    auto_extract_objects?: boolean;       // NEW
    auto_extract_config?: any;            // NEW
}): Promise<ProjectDto | null> {
    // ... existing code ...
    
    if (updates.auto_extract_objects !== undefined) {
        fields.push(`auto_extract_objects = $${paramIndex++}`);
        values.push(updates.auto_extract_objects);
    }

    if (updates.auto_extract_config !== undefined) {
        fields.push(`auto_extract_config = $${paramIndex++}`);
        values.push(JSON.stringify(updates.auto_extract_config));
    }
    
    // ... SQL UPDATE with new fields in RETURNING clause ...
}
```

#### ProjectsService.getById() (Enhanced)
**File**: `apps/server/src/modules/projects/projects.service.ts`

**Added Fields to Response**:
```typescript
async getById(id: string): Promise<ProjectDto | null> {
    const res = await this.db.query<ProjectRow>(
        `SELECT id, name, org_id, kb_purpose, chat_prompt_template, 
                auto_extract_objects, auto_extract_config 
         FROM kb.projects WHERE id = $1`,
        [id]
    );
    
    // ... return with new fields ...
    return {
        id: r.id,
        name: r.name,
        orgId: r.org_id,
        kb_purpose: r.kb_purpose,
        chat_prompt_template: r.chat_prompt_template,
        auto_extract_objects: r.auto_extract_objects,     // NEW
        auto_extract_config: r.auto_extract_config         // NEW
    };
}
```

#### ProjectRow Interface (Updated)
**File**: `apps/server/src/modules/projects/projects.service.ts`

```typescript
interface ProjectRow { 
    id: string; 
    name: string; 
    org_id: string; 
    kb_purpose?: string; 
    chat_prompt_template?: string; 
    auto_extract_objects?: boolean;    // NEW
    auto_extract_config?: any;         // NEW
    created_at?: string; 
    updated_at?: string; 
}
```

### 3. API Endpoint

**Endpoint**: `PATCH /api/projects/:id`  
**Method**: PATCH  
**Auth**: Required (Bearer token)  
**Scope**: `project:write`

**Request Body** (all fields optional):
```json
{
  "auto_extract_objects": true,
  "auto_extract_config": {
    "enabled_types": ["Requirement", "Decision", "Feature", "Task"],
    "min_confidence": 0.7,
    "duplicate_strategy": "skip",
    "require_review": true,
    "notify_on_complete": true,
    "notification_channels": ["inbox", "email"]
  }
}
```

**Response**:
```json
{
  "id": "uuid",
  "name": "Project Name",
  "orgId": "uuid",
  "kb_purpose": "...",
  "chat_prompt_template": "...",
  "auto_extract_objects": true,
  "auto_extract_config": {
    "enabled_types": ["Requirement", "Decision", "Feature", "Task"],
    "min_confidence": 0.7,
    "duplicate_strategy": "skip",
    "require_review": true,
    "notify_on_complete": true,
    "notification_channels": ["inbox", "email"]
  }
}
```

### 4. Frontend Implementation

#### Settings Page (Already Implemented)
**File**: `apps/admin/src/pages/admin/pages/settings/project/auto-extraction.tsx`  
**Route**: `/admin/settings/project/auto-extraction`

**Features**:
1. **Master Toggle**: Enable/disable auto-extraction
2. **Object Type Selection**: Multi-select dropdown for object types from installed template packs
3. **Confidence Threshold**: Slider (0.0 - 1.0) for minimum extraction confidence
4. **Duplicate Strategy**: Radio buttons (Skip / Merge)
5. **Review Requirement**: Checkbox for requiring human review before applying
6. **Notifications**: Checkbox + channel selection (In-App / Email)
7. **Save Button**: Persists changes via PATCH endpoint
8. **Success/Error Messages**: User feedback on save operations
9. **Change Detection**: Save button disabled if no changes made
10. **Discovery Wizard Integration**: Link to auto-discovery wizard

**Integration**:
The settings page calls the PATCH endpoint we just enhanced:
```typescript
const updatedProject = await fetchJson<Project>(
    `${apiBase}/api/projects/${config.activeProjectId}`,
    {
        method: 'PATCH',
        body: {
            auto_extract_objects: autoExtractEnabled,
            auto_extract_config: {
                enabled_types: enabledTypes,
                min_confidence: minConfidence,
                duplicate_strategy: duplicateStrategy,
                require_review: requireReview,
                notify_on_complete: notifyOnComplete,
                notification_channels: notificationChannels,
            },
        },
    }
);
```

## Configuration Options

### auto_extract_config Structure
```typescript
{
    // Object types to extract (null = all available types from template packs)
    enabled_types: string[] | null,
    
    // Minimum confidence threshold (0.0 - 1.0)
    min_confidence: number,
    
    // How to handle duplicate objects
    duplicate_strategy: 'skip' | 'merge',
    
    // Require human review before objects are committed
    require_review: boolean,
    
    // Send notification when extraction completes
    notify_on_complete: boolean,
    
    // Notification delivery channels
    notification_channels: ('inbox' | 'email')[]
}
```

### Default Configuration
```typescript
{
    enabled_types: ['Requirement', 'Decision', 'Feature', 'Task'],
    min_confidence: 0.7,
    duplicate_strategy: 'skip',
    require_review: true,
    notify_on_complete: true,
    notification_channels: ['inbox']
}
```

## Testing

### Backend Tests
1. **PATCH /api/projects/:id with auto_extract_objects**
   ```bash
   curl -X PATCH http://localhost:3001/api/projects/{project_id} \
     -H "Authorization: Bearer {token}" \
     -H "Content-Type: application/json" \
     -d '{"auto_extract_objects": true}'
   ```

2. **GET /api/projects/:id returns new fields**
   ```bash
   curl http://localhost:3001/api/projects/{project_id} \
     -H "Authorization: Bearer {token}"
   ```

### Frontend Tests
1. Navigate to `/admin/settings/project/auto-extraction`
2. Toggle "Enable Auto-Extraction" switch
3. Configure extraction settings
4. Click "Save Settings"
5. Verify success message
6. Reload page and verify settings persisted

### Integration Test
1. Enable auto-extraction with specific object types
2. Upload a document via `/admin/apps/documents`
3. Verify extraction job is created automatically
4. Check extraction results in `/admin/apps/extraction-jobs`

## Behavioral Changes

### Before (Incorrect Behavior)
- ❌ Auto-extraction enabled by default for all projects
- ❌ Every document upload triggered extraction job
- ❌ No way to disable except database manual edit
- ❌ Configuration existed but couldn't be changed via UI

### After (Correct Behavior)
- ✅ Auto-extraction **disabled** by default (opt-in)
- ✅ Users explicitly enable via settings page
- ✅ Full control over extraction configuration
- ✅ Per-project granular settings

## Related Components

### Backend
- `IngestionService.shouldAutoExtract()` - Checks project settings before creating extraction jobs
- `ExtractionJobService.createJob()` - Creates extraction jobs with configured settings
- `ExtractionWorkerService.processJob()` - Executes extraction using configured parameters

### Frontend
- `apps/admin/src/pages/admin/pages/settings/project/auto-extraction.tsx` - Settings UI
- `apps/admin/src/components/organisms/DiscoveryWizard` - Auto-discovery wizard (separate flow)
- `apps/admin/src/pages/admin/apps/extraction-jobs/` - View extraction job results

## Documentation
- `docs/spec/38-project-settings-ui.md` - Project settings specification
- `docs/AUTO_DISCOVERY_*.md` - Auto-discovery system docs
- `docs/AUTO_EXTRACTION_DYNAMIC_TYPES.md` - Dynamic type extraction docs

## Checklist

- [x] Updated database schema (migration 0005)
- [x] Created migration to update existing projects (migration 0006)
- [x] Applied migrations successfully
- [x] Added auto_extract_objects to UpdateProjectDto
- [x] Added auto_extract_config to UpdateProjectDto
- [x] Added validation decorators (@IsBoolean, @IsObject)
- [x] Updated ProjectsService.update() to handle new fields
- [x] Updated ProjectsService.getById() to return new fields
- [x] Updated ProjectRow interface
- [x] Added fields to ProjectDto response
- [x] Frontend settings page already implemented
- [x] Restarted server to pick up changes
- [x] Verified all projects have auto_extract_objects = false
- [x] Documented implementation

## Next Steps

The auto-extraction settings are now complete and functional. Users can:
1. Navigate to **Settings → Project → Auto-Extraction**
2. Toggle auto-extraction on/off
3. Configure extraction behavior (object types, confidence, review, notifications)
4. Save settings and have them persist across sessions

The remaining request is to **add extraction status indicators to the documents table** (green/orange/blue dots with hover details).
