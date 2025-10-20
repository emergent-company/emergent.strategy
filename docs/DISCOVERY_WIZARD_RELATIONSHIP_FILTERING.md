# Discovery Wizard - Relationship Filtering

## Overview
When types are removed in Step 3 (Review Types), the relationships displayed in Step 4 (Review Relationships) are automatically filtered to only show relationships between the remaining types.

## Problem Statement
**Before the fix**: If a user deleted certain entity types in Step 3, Step 4 would still show all relationships, including those that referenced the deleted types. This created:
- Confusion: relationships pointing to non-existent types
- Data integrity issues: invalid relationships could be included in the template pack
- Poor UX: users had to manually identify and delete invalid relationships

## Solution
Implemented automatic relationship filtering when transitioning from Step 3 to Step 4.

### Implementation Details

**Location**: `/apps/admin/src/components/organisms/DiscoveryWizard/DiscoveryWizard.tsx`

**Function**: `handleTypesReviewed()`

```typescript
const handleTypesReviewed = () => {
    // Create a set of remaining type names for O(1) lookup
    const remainingTypeNames = new Set(editedTypes.map(t => t.type_name));
    
    // Filter relationships to only include valid ones
    const filteredRelationships = editedRelationships.filter(rel => {
        const sourceExists = remainingTypeNames.has(rel.source_type);
        const targetExists = remainingTypeNames.has(rel.target_type);
        return sourceExists && targetExists;
    });

    console.log('[DiscoveryWizard] Filtering relationships:');
    console.log(`  - Remaining types: ${Array.from(remainingTypeNames).join(', ')}`);
    console.log(`  - Original relationships: ${editedRelationships.length}`);
    console.log(`  - Filtered relationships: ${filteredRelationships.length}`);
    
    // Update relationships to only include valid ones
    setEditedRelationships(filteredRelationships);
    setCurrentStep(4);
};
```

## Filtering Logic

### Rules
1. A relationship is **kept** only if:
   - The `source_type` exists in the remaining types, AND
   - The `target_type` exists in the remaining types

2. A relationship is **removed** if:
   - The `source_type` was deleted, OR
   - The `target_type` was deleted

### Example Scenario

**Initial State** (15 types, 15 relationships):
```
Types:
- Meeting
- Person
- Specification
- Product
- Feature
- PullRequest
- Workflow
- ...

Relationships:
- Meeting → ATTENDED_BY → Person ✓
- Meeting → INFORMS → Specification ✓
- Product → CONTAINS → Feature ✓
- Product → TARGETS → Market ✓
- ...
```

**User Action**: Delete "Meeting" and "Product" types in Step 3

**Result in Step 4** (13 types, 8 relationships):
```
Types:
- Person ✓
- Specification ✓
- Feature ✓
- PullRequest ✓
- Workflow ✓
- Market ✓
- ...

Relationships (filtered):
- Person → REVIEWS → PullRequest ✓
- Specification → DESCRIBES → Feature ✓
- Workflow → CREATES → PullRequest ✓
- ...

Relationships (removed):
- Meeting → ATTENDED_BY → Person ✗ (Meeting deleted)
- Meeting → INFORMS → Specification ✗ (Meeting deleted)
- Product → CONTAINS → Feature ✗ (Product deleted)
- Product → TARGETS → Market ✗ (Product deleted)
```

## Performance Considerations

### Time Complexity
- Building the `remainingTypeNames` Set: **O(T)** where T = number of types
- Filtering relationships: **O(R)** where R = number of relationships
- Lookup per relationship: **O(1)** (using Set instead of Array)
- **Total: O(T + R)** - linear and efficient

### Typical Scale
- Types: 10-50 (small)
- Relationships: 10-100 (small to medium)
- **Performance impact**: Negligible (< 1ms)

## Debug Output

The console logs provide transparency about the filtering:

```
[DiscoveryWizard] Filtering relationships:
  - Remaining types: Person, Specification, Feature, PullRequest, Workflow, Market, ...
  - Original relationships: 15
  - Filtered relationships: 8
```

This helps developers and power users understand what's happening during the transition.

## User Experience Flow

### Step 3: Review Types
1. User sees list of discovered types
2. User deletes unwanted types (e.g., "Meeting", "Product")
3. User clicks "Next" button

### Transition (Automatic)
1. System extracts names of remaining types
2. System filters relationships to match remaining types
3. System updates relationship list
4. Debug logs show filtering results

### Step 4: Review Relationships
1. User sees only relationships between remaining types
2. No manual cleanup required
3. All displayed relationships are valid

## Edge Cases Handled

### 1. All Types Deleted
**Scenario**: User deletes all types in Step 3  
**Result**: Step 4 shows "No Relationships Discovered" message  
**Behavior**: Graceful degradation, no errors

### 2. No Relationships Initially
**Scenario**: Discovery found types but no relationships  
**Result**: Filter runs but has no effect (empty array remains empty)  
**Behavior**: No issues

### 3. Isolated Types
**Scenario**: User keeps types that have no relationships between them  
**Result**: Step 4 shows "No Relationships Discovered"  
**Behavior**: Expected outcome

### 4. Circular Relationships
**Scenario**: Type A → Type B → Type A (circular reference)  
**Result**: Both relationships kept if both types remain  
**Behavior**: Correctly handled

## Testing

### Unit Test Scenarios (Recommended)
```typescript
describe('handleTypesReviewed', () => {
    it('should filter out relationships with deleted source type', () => {
        // Given: 3 types, relationship from A → B
        // When: Delete type A
        // Then: Relationship A → B should be removed
    });

    it('should filter out relationships with deleted target type', () => {
        // Given: 3 types, relationship from A → B
        // When: Delete type B
        // Then: Relationship A → B should be removed
    });

    it('should keep relationships where both types remain', () => {
        // Given: 3 types (A, B, C), relationship A → B
        // When: Delete type C
        // Then: Relationship A → B should remain
    });

    it('should handle empty type list', () => {
        // Given: Relationships exist
        // When: Delete all types
        // Then: No relationships should remain
    });
});
```

### Manual Testing Steps
1. Start Discovery Wizard with a project that has documents
2. Wait for Step 3 (Review Types)
3. Note the number of types (e.g., 15 types)
4. Delete 2-3 types
5. Click "Next" to go to Step 4
6. Open browser console and check debug logs:
   - Should show "Remaining types: ..." (without deleted types)
   - Should show "Original relationships: X"
   - Should show "Filtered relationships: Y" (where Y < X)
7. Verify Step 4 only shows relationships between remaining types
8. Check that no deleted type names appear in badges

## Benefits

### Data Integrity
- Template packs only contain valid relationships
- No orphaned relationships in the database
- Consistent type/relationship graph

### User Experience
- Automatic cleanup - no manual work required
- Immediate feedback via debug logs
- Reduced cognitive load

### Developer Experience
- Clear filtering logic in one place
- Debug output for troubleshooting
- Easy to test and maintain

## Future Enhancements

### Possible Improvements
1. **Warning Message**: Show a toast/banner when relationships are filtered
   - "3 relationships were automatically removed because their types were deleted"
   
2. **Undo Support**: Allow users to go back to Step 3 and restore deleted types
   - Would require storing the original full relationship list

3. **Type Usage Preview**: In Step 3, show relationship count next to each type
   - "Person (5 relationships)"
   - Help users understand impact of deleting a type

4. **Orphan Detection**: Highlight types that have no relationships
   - Suggest deletion if not needed

5. **Bulk Operations**: "Keep only types with relationships" button
   - Automatically remove isolated types

## Related Documentation
- `/docs/DISCOVERY_WIZARD_UI_IMPROVEMENTS.md` - Overall UI improvements
- `/docs/AUTO_DISCOVERY_UI_GUIDE.md` - Complete Discovery Wizard guide
- `/apps/admin/src/components/organisms/DiscoveryWizard/DiscoveryWizard.tsx` - Main wizard component

## Changelog
- **2025-10-20**: Initial implementation of relationship filtering
