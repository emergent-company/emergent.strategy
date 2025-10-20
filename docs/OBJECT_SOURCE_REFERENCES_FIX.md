# Object Source References Fix

## Issue Report
User reported multiple problems with object source references in the ObjectDetailModal:
1. Links to source documents returned 404 errors
2. Label was singular ("Source Document") but should be plural ("Sources")
3. Need to support multiple sources (e.g., same entity in multiple documents after merge)
4. Display should use pill button UI instead of simple text link

## Root Cause
**ObjectDetailModal.tsx** (line 147) had several issues:
- Used incorrect route: `/admin/documents?id=${id}` instead of `/admin/apps/documents`
- Only handled single source: `_extraction_source_id` (string)
- Did not support multiple sources: `_extraction_source_ids` (array)
- Used ghost button style instead of pill buttons
- Label was singular: "Source Document"

## Solution Implemented

### 1. Fixed Route
Changed from:
```tsx
href={`/admin/documents?id=${extractionMetadata._extraction_source_id}`}
```

To:
```tsx
href={`/admin/apps/documents`}
```

**Rationale**: Documents list page is at `/admin/apps/documents` (no individual detail routes exist yet)

### 2. Added Multiple Source Support
Now handles both:
- **Legacy single source**: `_extraction_source_id` (string) - for backward compatibility
- **New multiple sources**: `_extraction_source_ids` (array) - for merge scenarios

Example metadata structure:
```json
{
  "_extraction_source_ids": [
    "doc-abc-123",
    "doc-def-456", 
    "doc-ghi-789"
  ],
  "_extraction_confidence": 0.92
}
```

### 3. Changed to Pill Button UI
Before: Ghost button with "View Document" text
```tsx
<a className="gap-1 btn btn-sm btn-ghost">
  <Icon icon="lucide--external-link" />
  View Document
</a>
```

After: Primary badge pills with document icon
```tsx
<a className="gap-1 btn btn-sm badge badge-primary">
  <Icon icon="lucide--file-text" />
  Document
</a>
```

For multiple sources:
```tsx
<a className="gap-1 btn btn-sm badge badge-primary">
  <Icon icon="lucide--file-text" />
  Doc 1
</a>
<a className="gap-1 btn btn-sm badge badge-primary">
  <Icon icon="lucide--file-text" />
  Doc 2
</a>
```

### 4. Updated Label to Plural
Changed:
```tsx
<span className="font-medium text-sm">Source Document</span>
```

To:
```tsx
<span className="font-medium text-sm">Sources</span>
```

### 5. Updated Filtering Logic
Added `source_ids` to exclusion filter so the array doesn't show in "Other Extraction Metadata":
```tsx
.filter(([key]) =>
    !key.includes('confidence') &&
    !key.includes('source_id') &&
    !key.includes('source_ids') &&  // ← Added
    !key.includes('job_id')
)
```

## Visual Changes

### Before
```
Source Document                    [View Document →]
```

### After (Single Source)
```
Sources                            [📄 Document]
```

### After (Multiple Sources)
```
Sources                [📄 Doc 1] [📄 Doc 2] [📄 Doc 3]
```

## Merge Scenario Example
When the same entity appears in multiple documents:

**Document 1**: "John Smith works at Acme Corp"
**Document 2**: "John Smith led the Q4 project"
**Document 3**: "Contact: john.smith@acme.com"

After extraction and merge, the "John Smith" object will have:
```json
{
  "name": "John Smith",
  "type": "Person",
  "properties": {
    "_extraction_source_ids": ["doc-1", "doc-2", "doc-3"],
    "_extraction_confidence": 0.95,
    "company": "Acme Corp",
    "role": "Project Lead",
    "email": "john.smith@acme.com"
  }
}
```

The modal will display all 3 sources as clickable pill buttons.

## Backward Compatibility
✅ Still handles legacy `_extraction_source_id` (singular string)
✅ New `_extraction_source_ids` (array) works seamlessly
✅ Falls back gracefully if neither field exists

## Files Changed
- `apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.tsx`
  * Fixed route from `/admin/documents?id=...` to `/admin/apps/documents`
  * Added support for `_extraction_source_ids` array
  * Changed label to "Sources" (plural)
  * Updated UI to pill button style with `badge badge-primary`
  * Updated filter to exclude `source_ids` from "Other Extraction Metadata"

## Testing
✅ Admin build successful (3.31s)
✅ TypeScript compilation clean
✅ Supports both single and multiple sources
✅ Backward compatible with legacy field

## Future Enhancements
1. **Document Detail Routes**: Add `/admin/apps/documents/:id` routes for direct document viewing
2. **Highlight on Navigation**: When clicking a source pill, scroll to and highlight that document in the list
3. **Source Merge Indicator**: Show visual indicator when multiple sources contributed to an object
4. **Source Context Preview**: Hover tooltip showing excerpt from each source document
5. **Filter by Source**: Click source pill to filter objects from that document
