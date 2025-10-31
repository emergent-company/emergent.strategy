# Discovery Wizard UI Improvements

## Overview
This document describes the UI improvements made to the Discovery Wizard to address React console warnings, improve the readability of the relationships display, and fix field name mismatches between backend and frontend.

## Issues Addressed

### 1. React Key Prop Warning
**Problem**: Console warning "Warning: Each child in a list should have a unique 'key' prop" when rendering example instances in Step 3 (Review Types).

**Root Cause**: The `Object.entries(example).map()` was creating `<dt>` and `<dd>` elements without a proper key on a parent wrapper element.

**Solution**:
- Added `Fragment` to the React imports from `'react'`
- Wrapped each `<dt>` and `<dd>` pair in a `<Fragment>` with a unique key: `key={exIdx}-${key}-${entryIdx}`
- This satisfies React's requirement for keys on list items while maintaining the proper DOM structure for definition lists

**Files Changed**:
- `/apps/admin/src/components/organisms/DiscoveryWizard/Step3_ReviewTypes.tsx`

### 2. Relationships Display Readability
**Problem**: Relationship display in Step 4 (Review Relationships) showed only small colored badges/dots for `from_type` and `to_type`, making it hard to read the actual type names.

**Root Cause**: The badges were using `badge-sm` class and minimal layout, causing them to appear as colored dots rather than readable labels.

**Solution**:
- Removed `badge-sm` class for larger, more readable badges
- Added "From" and "To" labels above each type badge for clarity
- Structured the layout with proper flex containers:
  - **From Type**: Gets a column layout with "FROM" label above the badge
  - **Relationship Name**: Gets more space (flex-[2]) and remains editable
  - **To Type**: Gets a column layout with "TO" label above the badge
- Added minimum widths to prevent text truncation
- Improved visual hierarchy with proper spacing

**Visual Improvements**:
```
Before:
[small-dot] → relationship_name → [small-dot]

After:
FROM                        TO
[Primary Badge]  →  relationship_name  →  [Secondary Badge]
```

**Files Changed**:
- `/apps/admin/src/components/organisms/DiscoveryWizard/Step4_ReviewRelationships.tsx`

### 3. Backend/Frontend Field Name Mismatch
**Problem**: The badges were displaying empty text because the frontend TypeScript interface expected `from_type`, `to_type`, and `relationship_name`, but the backend database stored `source_type`, `target_type`, and `relation_type`.

**Root Cause**: The discovery job data is stored directly in the database as JSONB without a DTO layer mapping field names between backend and frontend.

**Database Structure** (from LLM discovery output):
```json
{
  "source_type": "Meeting",
  "target_type": "Person",
  "relation_type": "ATTENDED_BY",
  "description": "A person attends a meeting...",
  "confidence": 1,
  "cardinality": "one-to-many"
}
```

**Frontend Expected** (original interface):
```typescript
{
  from_type: string;
  to_type: string;
  relationship_name: string;
  cardinality: '1:1' | '1:N' | 'N:1' | 'N:M';
}
```

**Solution**:
- Updated the frontend `Relationship` interface to match the backend structure:
  - `from_type` → `source_type`
  - `to_type` → `target_type`
  - `relationship_name` → `relation_type`
  - Added `description?: string` field
  - Extended cardinality to support both formats: `'one-to-many'` and `'1:N'`
- Updated Step4 component to use correct field names
- Added cardinality normalization function to handle both database format (`one-to-many`) and UI format (`1:N`)
- Added debug logging to help diagnose data issues

**Files Changed**:
- `/apps/admin/src/components/organisms/DiscoveryWizard/DiscoveryWizard.tsx` (interface)
- `/apps/admin/src/components/organisms/DiscoveryWizard/Step4_ReviewRelationships.tsx` (display logic)

### 4. Relationship Filtering Based on Type Selection
**Problem**: When types are removed in Step 3 (Review Types), Step 4 (Review Relationships) still showed all relationships, including those referencing deleted types.

**Root Cause**: The transition from Step 3 to Step 4 didn't filter relationships based on which types remained.

**Solution**:
- Updated `handleTypesReviewed()` function to filter relationships when moving from Step 3 to Step 4
- Filters out relationships where either `source_type` or `target_type` no longer exists in the remaining types
- Added debug logging to show filtering results

**Filtering Logic**:
```typescript
const handleTypesReviewed = () => {
    // Create a set of remaining type names for fast lookup
    const remainingTypeNames = new Set(editedTypes.map(t => t.type_name));
    
    // Only keep relationships where both source and target types still exist
    const filteredRelationships = editedRelationships.filter(rel => {
        const sourceExists = remainingTypeNames.has(rel.source_type);
        const targetExists = remainingTypeNames.has(rel.target_type);
        return sourceExists && targetExists;
    });
    
    setEditedRelationships(filteredRelationships);
    setCurrentStep(4);
};
```

**Example**:
- Step 3: User deletes "Meeting" and "Product" types
- Step 4: Relationships like "Meeting → ATTENDED_BY → Person" and "Product → CONTAINS → Feature" are automatically removed
- Only relationships between remaining types are shown

**Files Changed**:
- `/apps/admin/src/components/organisms/DiscoveryWizard/DiscoveryWizard.tsx`

### 5. Template Pack Summary Shows Edited Counts
**Problem**: The Template Pack Summary in Step 5 (Complete) showed the original discovered counts (e.g., "14 types, 15 relationships") instead of the actual counts being included in the pack after user edits (e.g., "3 types, 1 relationship").

**Root Cause**: Step5 was using `jobData.discovered_types` and `jobData.discovered_relationships` which contain the original LLM discovery results, not the edited arrays after user modifications in Steps 3 and 4.

**Solution**:
- Updated Step5 component to accept `includedTypes` and `includedRelationships` as props
- Display counts as "included / total" format (e.g., "3 / 14")
- Show excluded count in warning color when items were removed (e.g., "(11 excluded)")
- Updated type list to show visual indicators:
  - ✓ Green checkmark for included types
  - ✗ Red X for excluded types
  - Strikethrough and reduced opacity for excluded types
- Updated "View Discovered Types" label to show breakdown

**Visual Improvements**:

Before:
```
Entity Types: 14
Relationships: 15
View Discovered Types (14)
```

After:
```
Entity Types: 3 / 14 (11 excluded)
Relationships: 1 / 15 (14 excluded)
View Discovered Types (3 included / 14 total)
  ✓ Person (5 instances)
  ✓ Specification (8 instances)
  ✓ Feature (12 instances)
  ✗ Meeting (7 instances) [strikethrough, faded]
  ✗ Product (10 instances) [strikethrough, faded]
  ...
```

**Files Changed**:
- `/apps/admin/src/components/organisms/DiscoveryWizard/Step5_Complete.tsx`
- `/apps/admin/src/components/organisms/DiscoveryWizard/DiscoveryWizard.tsx`

## Technical Details

### Step3_ReviewTypes.tsx Changes
```tsx
// Added Fragment import
import { useState, Component, ErrorInfo, ReactNode, Fragment } from 'react';

// Wrapped dt/dd pairs in Fragment with keys
{Object.entries(example).map(([key, value], entryIdx) => (
    <Fragment key={`${exIdx}-${key}-${entryIdx}`}>
        <dt className="font-medium text-base-content/60">
            {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
        </dt>
        <dd className="text-base-content/80">
            {typeof value === 'object' && value !== null
                ? JSON.stringify(value)
                : String(value)}
        </dd>
    </Fragment>
))}
```

### Step4_ReviewRelationships.tsx Changes
```tsx
// Updated interface to match backend
export interface Relationship {
    id?: string;
    source_type: string;  // Was: from_type
    target_type: string;  // Was: to_type
    relation_type: string;  // Was: relationship_name
    description?: string;  // New optional field
    confidence: number;
    cardinality: '1:1' | '1:N' | 'N:1' | 'N:M' | 
                 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
}

// Added cardinality normalization
const normalizeCardinality = (cardinality: string): '1:1' | '1:N' | 'N:1' | 'N:M' => {
    const mapping: Record<string, '1:1' | '1:N' | 'N:1' | 'N:M'> = {
        'one-to-one': '1:1',
        'one-to-many': '1:N',
        'many-to-one': 'N:1',
        'many-to-many': 'N:M',
        '1:1': '1:1',
        '1:N': '1:N',
        'N:1': 'N:1',
        'N:M': 'N:M',
    };
    return mapping[cardinality] || '1:N';
};

// Updated display to use correct fields
{/* From Type */}
<div className="flex flex-1 items-center gap-2 min-w-[120px]">
    <div className="flex flex-col gap-1">
        <span className="text-xs text-base-content/50 uppercase">From</span>
        <span className="badge badge-primary">{rel.source_type}</span>
    </div>
</div>

{/* Relationship Name - now uses relation_type */}
<div className="flex flex-[2] items-center gap-2 min-w-0">
    {/* ... editable relationship name using rel.relation_type ... */}
</div>

{/* To Type */}
<div className="flex flex-1 items-center gap-2 min-w-[120px]">
    <Icon icon="lucide--arrow-right" className="size-4 text-base-content/50" />
    <div className="flex flex-col gap-1">
        <span className="text-xs text-base-content/50 uppercase">To</span>
        <span className="badge badge-secondary">{rel.target_type}</span>
    </div>
</div>

{/* Cardinality - with normalization */}
<select
    className="w-24 select-bordered select-sm select"
    value={normalizeCardinality(rel.cardinality)}
    onChange={(e) => updateCardinality(idx, e.target.value as '1:1' | '1:N' | 'N:1' | 'N:M')}
>
```

### Debug Logging Added
```tsx
// Debug: Log relationships data
console.log('[Step4] Relationships received:', relationships);
if (relationships.length > 0) {
    console.log('[Step4] First relationship:', relationships[0]);
}
```

### Step5_Complete.tsx Changes
```tsx
// Updated interface to accept edited arrays
interface Step5Props {
    jobData: DiscoveryJob;
    includedTypes: TypeCandidate[];      // New prop
    includedRelationships: Relationship[]; // New prop
    onClose: () => void;
    onStartNew: () => void;
}

// Calculate counts
const includedTypeCount = includedTypes.length;
const totalTypeCount = jobData.discovered_types?.length || 0;
const includedRelCount = includedRelationships.length;
const totalRelCount = jobData.discovered_relationships?.length || 0;

// Create lookup set for included types
const includedTypeNames = new Set(includedTypes.map(t => t.type_name));

// Display format with excluded count
<span className="font-medium">
    {includedTypeCount} / {totalTypeCount}
    {includedTypeCount < totalTypeCount && (
        <span className="ml-2 text-xs text-warning">
            ({totalTypeCount - includedTypeCount} excluded)
        </span>
    )}
</span>

// Type list with visual indicators
{jobData.discovered_types.map((type, idx) => {
    const isIncluded = includedTypeNames.has(type.type_name);
    return (
        <li className={`flex justify-between items-center ${
            isIncluded ? '' : 'opacity-40 line-through'
        }`}>
            <span className="flex items-center gap-2">
                {isIncluded ? (
                    <Icon icon="lucide--check-circle" className="size-4 text-success" />
                ) : (
                    <Icon icon="lucide--x-circle" className="size-4 text-error" />
                )}
                <span className="font-medium">{type.type_name}</span>
            </span>
            <span className="text-base-content/60">
                {type.frequency} instances
            </span>
        </li>
    );
})}
```

### Main Wizard Changes
```tsx
// Pass edited arrays to Step5
case 5:
    return (
        <Step5_Complete
            jobData={jobData!}
            includedTypes={editedTypes}        // Pass edited types
            includedRelationships={editedRelationships} // Pass edited relationships
            onClose={handleClose}
            onStartNew={...}
        />
    );
```

## Testing

### Build Verification
```bash
npm --prefix apps/admin run build
```
Result: ✅ All TypeScript checks pass, no errors

### Manual Testing Checklist
- [ ] Step 3: Example instances display correctly without console warnings
- [ ] Step 3: Object entries are rendered properly with unique keys
- [ ] Step 3: Can delete types by clicking the trash icon
- [ ] Step 4: From type displays clearly with "FROM" label
- [ ] Step 4: To type displays clearly with "TO" label  
- [ ] Step 4: Type badges are readable (not tiny dots)
- [ ] Step 4: Type badges show actual type names (Meeting, Person, etc.)
- [ ] Step 4: Relationship name remains editable
- [ ] Step 4: Layout adapts to different relationship name lengths
- [ ] Step 4: Only relationships between remaining types are shown
- [ ] Step 4: Deleting a type in Step 3 removes related relationships in Step 4
- [ ] Step 5: Template Pack Summary shows correct included/total counts
- [ ] Step 5: Shows "(X excluded)" when items were removed
- [ ] Step 5: "View Discovered Types" shows included/total breakdown
- [ ] Step 5: Included types have green checkmark icon
- [ ] Step 5: Excluded types have red X icon and are strikethrough/faded
- [ ] Step 5: Counts match actual selections (e.g., delete to 3 types → shows "3 / 14")
- [ ] Console: Check debug logs show correct filtering (e.g., "Original: 15, Filtered: 8")
- [ ] No React console warnings or errors

## Impact

### User Experience
- **Before**: Users saw confusing colored dots instead of type names
- **After**: Clear labeling with readable badges showing actual type names

### Developer Experience
- **Before**: Console warnings made debugging harder
- **After**: Clean console output, proper React patterns

### Maintenance
- Uses standard React `Fragment` pattern for list items
- Follows DaisyUI badge conventions for consistent styling
- Proper semantic HTML structure (definition lists, flex layouts)

## Related Documentation
- `/docs/AUTO_DISCOVERY_UI_GUIDE.md` - Overall Discovery Wizard UI guide
- `/docs/DISCOVERY_WIZARD_IMPLEMENTATION_COMPLETE.md` - Original implementation docs
- `.github/instructions/testid-conventions.instructions.md` - Testing conventions (for future test additions)

## Future Improvements
1. Consider adding tooltips with full relationship descriptions (if backend provides them)
2. Add ability to expand/collapse relationship details
3. Consider visual graph representation of type relationships
4. Add filtering/sorting capabilities for large relationship lists
