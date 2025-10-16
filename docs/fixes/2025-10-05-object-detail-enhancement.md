# Object Detail Enhancement - Extraction Metadata Display

**Date**: 2025-10-05  
**Status**: ✅ Complete  
**Issue**: Extracted objects showing in table but missing metadata when clicked

## Problem

When viewing extracted objects in the Objects page (`/admin/objects`), clicking on an object only logged it to console. The object had rich extraction metadata in its properties (like `_extraction_confidence`, `_extraction_source_id`, `_extraction_job_id`), but there was no UI to display this information to users.

**Example Object Data**:
```json
{
    "id": "d7dae6b6-adc7-48c8-8fa7-0c3e14cde2ca",
    "type": "Risk",
    "properties": {
        "name": "Uncertainty of AI success",
        "_extraction_job_id": "651f2808-b808-4fd0-baf7-b39d50a93f31",
        "_extraction_source": "document",
        "_extraction_source_id": "8cefb6b7-b5a7-4011-9209-e31f4587d964",
        "_extraction_confidence": 0.936111111111111,
        "_extraction_llm_confidence": 0.9
    }
}
```

Users had no way to:
- View the extraction confidence score
- Navigate to the source document
- Navigate to the extraction job
- See other extraction metadata
- Distinguish extracted objects from manually created ones in the table

## Solution

Created a comprehensive object detail modal and enhanced the table view to show extraction metadata.

### 1. ObjectDetailModal Component (NEW)

**File**: `apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.tsx`

**Features**:
- **Extraction Metadata Section**: Dedicated section showing all `_extraction_*` properties
  - Confidence score with color-coded progress bar:
    - Green (≥80%): High confidence
    - Yellow (60-79%): Medium confidence
    - Red (<60%): Low confidence - requires review
  - Clickable link to source document
  - Clickable link to extraction job
  - Other extraction metadata (source type, LLM confidence)

- **Properties Section**: Shows all regular object properties
  - Arrays displayed as badges
  - Nested objects displayed as formatted JSON
  - Proper formatting of property names (snake_case → Title Case)

- **System Information Section**: Shows object ID and last updated timestamp

- **Action Buttons**: Edit, View Graph, Delete (placeholders for future implementation)

**Type Safety**: Strongly typed with proper handling of `unknown` types from properties

### 2. Enhanced ObjectBrowser Table (UPDATED)

**File**: `apps/admin/src/components/organisms/ObjectBrowser/ObjectBrowser.tsx`

**Changes**:
- Added "Confidence" column to table
- For extracted objects:
  - Shows confidence percentage with color coding
  - Shows mini progress bar
  - Adds sparkle icon (✨) next to object name
- For non-extracted objects:
  - Shows "—" in confidence column

**Visual Indicators**:
```
Name                          | Type | Source   | Confidence | Updated    | Rel
Uncertainty of AI success ✨  | Risk | document | 94% [████] | 2025-10-05 | 3
User Authentication System    | Feat | github   | —          | 2025-10-01 | 12
```

### 3. Objects Page Integration (UPDATED)

**File**: `apps/admin/src/pages/admin/pages/objects/index.tsx`

**Changes**:
- Import ObjectDetailModal component
- Add state for selected object and modal visibility
- Update `handleObjectClick` to open modal instead of just logging
- Add `handleModalClose` with delayed state clear to prevent flicker
- Render ObjectDetailModal at bottom of page

### 4. Storybook Stories (NEW)

**File**: `apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.stories.tsx`

**Stories**:
- `ExtractedObject`: Default view with full extraction metadata
- `ManualObject`: Object without extraction metadata
- `MinimalObject`: Sparse data handling
- `HighConfidence`: >80% confidence (green)
- `MediumConfidence`: 60-80% confidence (yellow)
- `LowConfidence`: <60% confidence (red)
- `WithArrayProperties`: Array display as badges
- `WithNestedProperties`: Nested object display as JSON
- `Closed`: Modal closed state
- `NoObject`: No object selected

## Files Created

1. `apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.tsx` (295 lines)
2. `apps/admin/src/components/organisms/ObjectDetailModal/index.ts` (barrel export)
3. `apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.stories.tsx` (235 lines)
4. `docs/fixes/2025-10-05-object-detail-enhancement.md` (this file)

## Files Modified

1. `apps/admin/src/pages/admin/pages/objects/index.tsx`
   - Added modal state management
   - Added ObjectDetailModal integration
   - Updated click handler

2. `apps/admin/src/components/organisms/ObjectBrowser/ObjectBrowser.tsx`
   - Added "Confidence" column to table header
   - Added extraction metadata rendering in table rows
   - Added sparkle icon for extracted objects
   - Added color-coded confidence indicators

## User Experience Flow

### Before
1. User navigates to `/admin/objects`
2. User sees list of objects in table
3. User clicks on object
4. **Nothing happens** (just console.log)
5. User has no way to see extraction metadata

### After
1. User navigates to `/admin/objects`
2. User sees list of objects with confidence scores visible in table
3. Extracted objects have ✨ icon next to name
4. User clicks on object
5. **Modal opens** showing full details:
   - Extraction metadata prominently displayed
   - Confidence score with visual progress bar
   - Links to source document and extraction job
   - All object properties organized and formatted
6. User can click links to navigate to related resources
7. User closes modal to return to table

## Design Decisions

### Why Separate Extraction Metadata?

Extraction metadata is fundamentally different from regular properties:
- It's **system-generated**, not user content
- It's **quality indicators** (confidence scores)
- It's **navigation aids** (links to jobs/documents)
- It's **temporary** (may be removed after verification)

By separating it visually, we:
- Make quality assessment obvious
- Prevent confusion with actual object data
- Enable quick confidence checking
- Provide clear navigation paths

### Why Color-Code Confidence?

Confidence thresholds aligned with extraction settings:
- **High (≥80%)**: Generally trustworthy, minimal review needed
- **Medium (60-79%)**: Needs review, likely mostly correct
- **Low (<60%)**: Requires careful review, may have issues

Color coding provides instant visual feedback about data quality.

### Why Show in Table?

Users often need to:
- Scan many objects quickly
- Filter by confidence level
- Identify extracted vs manual objects
- Prioritize review work

Table view enables batch operations and quick scanning without opening each object.

## TypeScript Type Safety

All new code is strongly typed:

```typescript
// Proper type checking for extraction metadata
if (typeof extractionMetadata._extraction_confidence === 'number') {
    // Only access as number if type guard passes
}

if (typeof extractionMetadata._extraction_source_id === 'string') {
    // Only render link if string type confirmed
}

// Type-safe unknown property handling
const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
}
```

## Build Verification

✅ **Build Status**: Success
```bash
npm --prefix apps/admin run build
# ✓ built in 1.63s
# No TypeScript errors
# No linting errors
```

## Testing Recommendations

### Manual Testing

1. **View Extracted Object**:
   - Navigate to `/admin/objects`
   - Look for objects with ✨ sparkle icon
   - Click on an extracted object
   - Verify modal shows extraction metadata section
   - Check confidence score color matches value
   - Click "View Document" link → should navigate to document
   - Click "View Job" link → should navigate to extraction job

2. **View Manual Object**:
   - Find object without ✨ icon
   - Click on it
   - Verify no extraction metadata section appears
   - Verify properties section still renders correctly

3. **Test Different Confidence Levels**:
   - High confidence (>80%): Should show green progress bar
   - Medium (60-80%): Should show yellow progress bar
   - Low (<60%): Should show red progress bar

4. **Test Table View**:
   - Verify "Confidence" column appears
   - Verify extracted objects show percentage + progress bar
   - Verify non-extracted objects show "—"
   - Verify sparkle icons appear next to extracted object names

5. **Test Modal Interactions**:
   - Open modal
   - Click backdrop → should close
   - Click X button → should close
   - Click "Close" button → should close
   - Verify no flicker when closing (300ms delay prevents this)

### Storybook Testing

```bash
npm run storybook
# Navigate to: Organisms → ObjectDetailModal
```

Test all stories:
- ✅ ExtractedObject - Default view
- ✅ ManualObject - No extraction data
- ✅ MinimalObject - Sparse properties
- ✅ HighConfidence - Green indicator
- ✅ MediumConfidence - Yellow indicator
- ✅ LowConfidence - Red indicator
- ✅ WithArrayProperties - Badge display
- ✅ WithNestedProperties - JSON display

### Edge Cases to Test

1. **Empty Properties**: Object with no properties
2. **Very Long Property Values**: Truncation/wrapping behavior
3. **Many Relationships**: Large relationship count display
4. **Recent Update**: Timestamp formatting
5. **Missing Extraction Fields**: Partial extraction metadata

## Future Enhancements

### Short Term

1. **Implement Action Buttons**:
   - Edit → Open edit form
   - View Graph → Navigate to graph view with object centered
   - Delete → Confirmation modal + delete API call

2. **Add Keyboard Shortcuts**:
   - `Esc` to close modal
   - `→/←` to navigate between objects
   - `E` to edit
   - `G` to view graph

3. **Add Export Functionality**:
   - Export single object as JSON
   - Copy object ID to clipboard
   - Copy properties as formatted text

### Medium Term

1. **Enhance Extraction Metadata**:
   - Show extraction timestamp
   - Show model used for extraction
   - Show prompt used (from debug info)
   - Link to similar objects from same job

2. **Add Inline Editing**:
   - Edit properties directly in modal
   - Save without leaving modal
   - Validation feedback

3. **Add Relationship Preview**:
   - Show related objects list
   - Click to navigate to related object
   - Visualize relationship graph

### Long Term

1. **Version History**:
   - Show object change history
   - Compare versions
   - Revert to previous version

2. **Comments & Annotations**:
   - Add notes to objects
   - Tag for review
   - Assign to team members

3. **Bulk Operations**:
   - Select multiple objects in table
   - Bulk edit properties
   - Bulk delete
   - Bulk export

## Related Documentation

- [Extraction System Overview](../spec/05-ingestion-workflows.md)
- [Gemini Extraction Fixes](./2025-10-05-gemini-extraction-fixes.md)
- [Graph Data Model](../spec/04-data-model.md)
- [Object Browser Component](../../apps/admin/src/components/organisms/ObjectBrowser/README.md) (if exists)

---

**Status**: ✅ Complete and ready for user testing  
**Build**: ✅ Passing  
**Type Check**: ✅ Passing  
**Storybook**: ✅ Stories created  

**Next Steps**: User should test by clicking on extracted objects in the Objects page to see the new modal with full metadata display.
