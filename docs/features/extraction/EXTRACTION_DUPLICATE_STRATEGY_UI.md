# Duplicate Handling Strategy UI Integration

## Overview

Added user interface controls to allow users to select between 'skip' and 'merge' strategies when configuring extraction jobs. This gives users control over how duplicate entities are handled during extraction.

## Locations

### 1. Extraction Config Modal (Manual Extraction)

**File:** `apps/admin/src/components/organisms/ExtractionConfigModal.tsx`

**Location:** Between "Entity Linking Strategy" and "Options" sections

**UI Component:** Radio button group with two options
- **Skip (Default)** - Skip duplicate entities - faster, prevents duplicates
- **Merge (Recommended)** - Merge new data into existing entities - enriches over time

**Features:**
- Dynamic help text that explains the selected strategy
- Info icon with contextual description
- Integrated seamlessly with existing modal design
- Default selection: 'skip' for backward compatibility

**Interface Update:**
```typescript
export interface ExtractionConfig {
    entity_types: string[];
    confidence_threshold: number;
    entity_linking_strategy: 'strict' | 'fuzzy' | 'none';
    duplicate_strategy?: 'skip' | 'merge';  // ← NEW
    require_review: boolean;
    send_notification: boolean;
}
```

### 2. Auto-Extraction Settings Page

**File:** `apps/admin/src/pages/admin/pages/settings/project/auto-extraction.tsx`

**Location:** Between "Confidence Threshold" and "Additional Settings" sections

**UI Component:** Card with radio button group
- Icon: `lucide--copy` 
- Section title: "Duplicate Handling Strategy"
- Two radio options matching the modal design

**Features:**
- Prominent card layout consistent with other settings sections
- Detailed descriptions for each strategy
- Color-coded help box that changes based on selection
- Persists to `auto_extract_config.duplicate_strategy` in project settings

**State Management:**
```typescript
const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'merge'>(DEFAULT_CONFIG.duplicate_strategy);
```

**Persistence:**
```typescript
const DEFAULT_CONFIG = {
    enabled_types: [...],
    min_confidence: 0.7,
    duplicate_strategy: 'skip' as 'skip' | 'merge',  // ← NEW
    require_review: true,
    notify_on_complete: true,
    notification_channels: ['inbox'],
};
```

### 3. Project Type Definition Update

**File:** `apps/admin/src/hooks/use-projects.ts`

**Changes:**
```typescript
export type Project = {
    id: string;
    name: string;
    // ... other fields
    auto_extract_config?: {
        enabled_types?: string[];
        min_confidence?: number;
        duplicate_strategy?: 'skip' | 'merge';  // ← NEW
        require_review?: boolean;
        notify_on_complete?: boolean;
        notification_channels?: string[];
    };
};
```

## User Experience Flow

### Manual Extraction (Documents Page)

1. User clicks "Extract" button on a document
2. Extraction Config Modal opens
3. User scrolls to "Duplicate Handling Strategy" section
4. User selects between:
   - **Skip**: "Prevents duplicate entities by skipping ones that already exist"
   - **Merge**: "Updates existing entities with new properties and increases confidence scores"
5. Help text updates to explain the selected strategy
6. User clicks "Start Extraction"
7. Extraction job uses the selected strategy

### Auto-Extraction Settings

1. User navigates to Settings → Project → Auto-Extraction
2. Enables auto-extraction toggle
3. Configures object types and confidence threshold
4. Scrolls to "Duplicate Handling Strategy" section
5. Selects strategy (default: 'skip')
6. Help box updates with context-appropriate explanation:
   - **Skip**: "Prevents duplicate entities by skipping ones that already exist. Faster for bulk imports."
   - **Merge**: "Updates existing entities with new properties and increases confidence scores. Entities get richer as more documents are processed."
7. Clicks "Save Settings"
8. All future auto-extractions use the selected strategy

## Visual Design

### Extraction Config Modal Section

```
┌─────────────────────────────────────────────────────────────┐
│ Duplicate Handling Strategy                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ○ Skip (Default)                                            │
│    Skip duplicate entities - faster, prevents duplicates    │
│                                                              │
│  ● Merge (Recommended)                                       │
│    Merge new data into existing entities - enriches over    │
│    time                                                      │
│                                                              │
│  ℹ️ Updates existing entities with new properties and        │
│     increases confidence scores                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Auto-Extraction Settings Card

```
┌─────────────────────────────────────────────────────────────┐
│ 📋 Duplicate Handling Strategy                              │
├─────────────────────────────────────────────────────────────┤
│ Choose how to handle entities that have already been        │
│ extracted from other documents                               │
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ○ Skip Duplicates                                       │ │
│ │   Skip duplicate entities - faster, prevents           │ │
│ │   duplicates (default)                                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ● Merge into Existing                                   │ │
│ │   Merge new data into existing entities - enriches      │ │
│ │   over time, tracks all sources                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ℹ️ Updates existing entities with new properties and     │ │
│ │   increases confidence scores. Entities get richer as   │ │
│ │   more documents are processed.                         │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Consistency Patterns

Both UI locations follow the same design patterns:

1. **Radio Buttons**: Used for mutually exclusive strategy selection
2. **Labels**: "Skip (Default)" / "Skip Duplicates" and "Merge (Recommended)" / "Merge into Existing"
3. **Descriptions**: Short, action-oriented explanations
4. **Help Text**: Dynamic context box with info icon
5. **Default**: 'skip' for backward compatibility and safety
6. **Recommended**: 'merge' labeled as recommended for entity enrichment use cases

## Integration Points

### Frontend → Backend

When creating an extraction job (manual or auto), the frontend now sends:

```typescript
{
    source_type: 'document',
    source_id: documentId,
    extraction_config: {
        entity_types: [...],
        confidence_threshold: 0.7,
        entity_linking_strategy: 'fuzzy',
        duplicate_strategy: 'merge',  // ← User selection
        require_review: false,
        send_notification: true
    }
}
```

### Project Settings

When saving auto-extraction settings, the frontend sends:

```typescript
PATCH /api/projects/{projectId}
{
    auto_extract_objects: true,
    auto_extract_config: {
        enabled_types: [...],
        min_confidence: 0.7,
        duplicate_strategy: 'skip',  // ← User selection
        require_review: true,
        notify_on_complete: true,
        notification_channels: ['inbox']
    }
}
```

## Backend Processing

The backend extraction worker reads `job.extraction_config.duplicate_strategy` and:

1. **If 'skip'** (or undefined): 
   - Catches `object_key_exists` error
   - Logs warning in timeline
   - Continues processing remaining entities
   - Outcome: 'skipped'

2. **If 'merge'**:
   - Catches `object_key_exists` error  
   - Queries existing object by key
   - Merges properties with max confidence
   - Combines labels (deduplicated)
   - Tracks all extraction sources
   - Creates new version via `patchObject`
   - Logs merge details in timeline
   - Outcome: 'merged'

## Testing Checklist

### Manual Extraction Modal

- [ ] Modal opens correctly
- [ ] Duplicate strategy section is visible
- [ ] Default selection is 'skip'
- [ ] Clicking 'merge' updates help text
- [ ] Clicking 'skip' updates help text
- [ ] Selected strategy is included in extraction job payload
- [ ] Extraction job respects the selected strategy

### Auto-Extraction Settings

- [ ] Settings page loads correctly
- [ ] Duplicate strategy card is visible when auto-extraction is enabled
- [ ] Default selection is 'skip'
- [ ] Radio buttons update state correctly
- [ ] Help box changes based on selection
- [ ] "Save Settings" button enables when strategy changes
- [ ] Settings persist after save
- [ ] Settings load correctly on page refresh
- [ ] Reset to defaults sets strategy to 'skip'

### Integration

- [ ] Manual extraction uses selected strategy
- [ ] Auto-extraction uses project settings strategy
- [ ] Backend logs show correct strategy being used
- [ ] Timeline shows "skipped" for skip strategy
- [ ] Timeline shows "merged" for merge strategy
- [ ] Object versions increment on merge
- [ ] Properties accumulate correctly on merge

## Accessibility

- **Radio buttons**: Properly grouped with `name` attribute
- **Labels**: Clickable, associated with radio inputs
- **Help text**: Visible to screen readers
- **Icons**: Decorative, not critical for understanding
- **Keyboard**: All controls accessible via keyboard
- **Focus**: Visible focus indicators maintained

## Mobile Responsiveness

- Radio button groups stack vertically on mobile
- Card layouts adjust to narrow viewports
- Text remains readable at small sizes
- Touch targets are adequately sized (48px minimum)

## Documentation

- **User Docs**: Should explain when to use skip vs merge
- **Developer Docs**: This file + backend implementation docs
- **Migration Guide**: Projects created before this feature default to 'skip'

## Performance Impact

- **UI**: Negligible - single state variable + 2 radio buttons
- **Network**: +1 field in JSON payload (~20 bytes)
- **Backend**: See `docs/EXTRACTION_MERGE_STRATEGY.md` for processing overhead

## Future Enhancements

1. **Per-Type Strategy**: Allow different strategies for different entity types
2. **Conflict Resolution UI**: Show preview of merge conflicts before confirming
3. **Merge History**: Show what changed during each merge
4. **Batch Preview**: Show estimated duplicates before starting extraction
5. **Strategy Recommendations**: AI-suggested strategy based on project patterns

## Related Documentation

- `docs/EXTRACTION_DUPLICATE_KEY_HANDLING.md` - Backend skip strategy implementation
- `docs/EXTRACTION_MERGE_STRATEGY.md` - Backend merge strategy implementation
- `docs/EXTRACTION_IMPROVEMENTS_SESSION_OCT_20_2025.md` - Session summary

## Summary

Successfully added user-facing controls for duplicate handling strategy in two key locations:
1. Manual extraction modal (per-job configuration)
2. Auto-extraction settings page (project-level defaults)

Users can now choose between:
- **Skip** (safe default) - Fast, prevents duplicates
- **Merge** (recommended for enrichment) - Accumulates data over time

The UI is consistent, accessible, and provides clear guidance on when to use each strategy.
