# Universal Tagging System Implementation

**Date**: 2025-01-19  
**Status**: In Progress  
**Request**: User wants comprehensive tagging system with meta properties, filtering, and LLM integration

## Overview

Transform tags from type-specific schema properties to universal meta properties available on ALL graph objects, with UI filtering and LLM-guided tag standardization.

## Requirements

### 1. Meta Property Approach ✅ STARTED
- **Goal**: Make tags available on ALL object types automatically (not defined in schemas)
- **Storage**: Store tags in `properties.tags` array in the JSONB column
- **Benefit**: Any object can be tagged without modifying type schemas

### 2. Schema Cleanup ✅ COMPLETED
- **Task**: Remove tags property from all 5 object type schemas in meeting-decision-pack.seed.ts
- **Object Types Modified**:
  1. Meeting (line ~100)
  2. MeetingSeries (line ~139)
  3. Decision (line ~211)
  4. ActionItem (line ~264)
  5. Question (line ~323)
- **Status**: All tags properties removed, build successful

### 3. UI Filtering 🔄 TODO
- **Location**: `apps/admin/src/components/organisms/ObjectBrowser/ObjectBrowser.tsx`
- **Task**: Add tag filter dropdown/selector (similar to existing type filter)
- **Features**:
  - Multi-select tag filter
  - Show tag counts
  - Clear individual/all tags
  - Active filter badges
  - Filter objects by selected tags

### 4. Backend Tag Aggregation 🔄 TODO
- **Location**: `apps/server/src/modules/graph/graph.service.ts` or similar
- **Task**: Create method to query all distinct tags across objects
- **SQL Query**:
  ```sql
  SELECT DISTINCT jsonb_array_elements_text(properties->'tags') as tag 
  FROM kb.graph_objects 
  WHERE properties ? 'tags'
  AND properties->'tags' IS NOT NULL
  ORDER BY tag;
  ```
- **Purpose**: Get list of existing tags to pass to extraction process

### 5. Extraction Integration 🔄 TODO
- **Location**: `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`
- **Task**: Query all existing tags before starting extraction job
- **Flow**:
  1. Query distinct tags from database
  2. Pass tags list to `llmProvider.extractEntities()` as parameter
  3. Store tags in `properties.tags` when creating objects

### 6. LLM Prompt Enhancement 🔄 TODO
- **Location**: `apps/server/src/modules/llm/providers/vertex-ai.provider.ts`
- **Task**: Modify `buildPrompt()` to include available tags list
- **Instruction**: Add to prompt:
  ```
  Available tags: [tag1, tag2, tag3, ...]
  
  When assigning tags to entities:
  1. PREFER using tags from the available list above
  2. Only create new tags if existing ones don't fit semantically
  3. Keep tag names consistent (lowercase, hyphenated)
  4. Aim for 2-5 relevant tags per entity
  ```
- **Benefit**: Standardize tags across extractions, prevent tag sprawl

## Database Schema

### Current Structure
```sql
-- kb.graph_objects table
CREATE TABLE kb.graph_objects (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  project_id uuid NOT NULL,
  type text NOT NULL,
  key text NOT NULL,
  properties jsonb NOT NULL,  -- ← Tags stored here
  ...
);
```

### Properties JSONB Structure (Proposed)
```json
{
  // Type-specific properties
  "title": "Weekly Team Meeting",
  "date": "2025-01-19T10:00:00Z",
  "attendees": ["Alice", "Bob"],
  
  // Universal meta property
  "tags": ["team-sync", "weekly", "engineering"]
}
```

### Alternative: Nested Meta Structure
```json
{
  // Type-specific properties
  "title": "Weekly Team Meeting",
  
  // Meta namespace (future extensibility)
  "meta": {
    "tags": ["team-sync", "weekly", "engineering"],
    "custom_fields": {},
    "audit": {}
  }
}
```

**Decision**: Start with flat `properties.tags` for simplicity, migrate to `properties.meta.tags` if we add other meta properties.

## ObjectBrowser Component Analysis

### Current Filtering Structure
- **Type Filter**: Dropdown with checkboxes, show counts, clear all
- **Implementation Pattern**:
  - State: `selectedTypes` (string array)
  - Handler: `handleTypeToggle()` adds/removes types
  - Dropdown: Label trigger with `dropdown-open` class control
  - Content: Always rendered, visibility controlled by class
  - Active filters: Badge pills with X icons

### Proposed Tag Filter (Parallel Structure)
- **State**: `selectedTags: string[]`
- **Props**: `availableTags?: string[]` (passed from parent)
- **Handler**: `handleTagToggle()` adds/removes tags
- **Callback**: `onTagFilterChange?: (tags: string[]) => void`
- **UI**: Dropdown next to type filter with same pattern
- **Filtering Logic**: Update `filteredObjects` to check both type AND tags

### Example Filter Logic
```typescript
const filteredObjects = objects.filter(obj => {
  // Apply type filter
  if (selectedTypes.length > 0 && !selectedTypes.includes(obj.type)) {
    return false;
  }
  
  // Apply tag filter
  if (selectedTags.length > 0) {
    const objTags = (obj.properties?.tags as string[] | undefined) || [];
    // Object must have at least one selected tag
    const hasMatchingTag = selectedTags.some(tag => objTags.includes(tag));
    if (!hasMatchingTag) {
      return false;
    }
  }
  
  // Apply search filter
  if (searchQuery && !obj.name.toLowerCase().includes(searchQuery.toLowerCase())) {
    return false;
  }
  
  return true;
});
```

## Implementation Steps

### Phase 1: Seed File Cleanup ✅ COMPLETED
- [x] Remove tags from Meeting schema
- [x] Remove tags from MeetingSeries schema
- [x] Remove tags from Decision schema
- [x] Remove tags from ActionItem schema
- [x] Remove tags from Question schema
- [x] Verify compilation

### Phase 2: Backend Tag Service
- [ ] Create `getAllTags()` method in graph service
- [ ] Add endpoint to get distinct tags: `GET /api/graph/tags`
- [ ] Test query performance with large datasets
- [ ] Add caching for tag list (invalidate on object create/update)

### Phase 3: Frontend Tag Filtering
- [ ] Add `availableTags` prop to ObjectBrowser
- [ ] Add `selectedTags` state
- [ ] Create tag filter dropdown UI (clone type filter pattern)
- [ ] Update `filteredObjects` logic to include tag filtering
- [ ] Add active tag filter badges
- [ ] Add `onTagFilterChange` callback
- [ ] Update parent page to fetch and pass available tags

### Phase 4: Extraction Integration
- [ ] Modify extraction-worker to query tags before extraction
- [ ] Update `extractEntities()` signature to accept tags parameter
- [ ] Store tags in `properties.tags` when creating graph objects
- [ ] Test with sample extraction job

### Phase 5: LLM Prompt Enhancement
- [ ] Update `buildPrompt()` to include tags list
- [ ] Add tag preference instructions to prompt
- [ ] Test LLM tag reuse vs creation behavior
- [ ] Adjust prompt wording based on results

### Phase 6: Testing & Refinement
- [ ] Test UI filtering with multiple tags
- [ ] Test extraction with existing tags
- [ ] Verify tag standardization (LLM prefers existing tags)
- [ ] Add tag management UI (rename, merge, delete tags)
- [ ] Document tag naming conventions

## Tag Naming Conventions (Proposed)

To maintain consistency across the system:

1. **Lowercase**: All tags should be lowercase (`meeting`, not `Meeting`)
2. **Hyphenated**: Use hyphens for multi-word tags (`team-sync`, not `team_sync` or `teamSync`)
3. **Descriptive**: Use clear, descriptive terms (`weekly-standup` vs `meeting1`)
4. **Hierarchical (Optional)**: Consider namespacing (`eng:backend`, `product:roadmap`)
5. **Singular vs Plural**: Use singular form (`decision`, not `decisions`)

## Benefits

### User Benefits
1. **Universal Tagging**: Any object type can be tagged without code changes
2. **Consistent Tags**: LLM reuses existing tags, preventing proliferation
3. **Better Organization**: Filter and group objects by tags across types
4. **Flexible Categorization**: Add new tags without schema migrations

### Technical Benefits
1. **Schema Independence**: Tags not tied to specific object types
2. **Easy Migration**: Existing tagged objects compatible (tags in properties)
3. **Extensible**: Can add other meta properties (labels, annotations, etc.)
4. **Query-able**: JSONB indexes support fast tag queries

## SQL Queries Reference

### Get All Distinct Tags
```sql
SELECT DISTINCT jsonb_array_elements_text(properties->'tags') as tag 
FROM kb.graph_objects 
WHERE properties ? 'tags'
AND properties->'tags' IS NOT NULL
ORDER BY tag;
```

### Get Tag Counts
```sql
SELECT 
  jsonb_array_elements_text(properties->'tags') as tag,
  COUNT(*) as count
FROM kb.graph_objects 
WHERE properties ? 'tags'
GROUP BY tag
ORDER BY count DESC;
```

### Find Objects with Specific Tag
```sql
SELECT id, type, properties->>'name' as name, properties->'tags' as tags
FROM kb.graph_objects
WHERE properties->'tags' ? 'team-sync';
```

### Find Objects with Multiple Tags (AND)
```sql
SELECT id, type, properties->>'name' as name, properties->'tags' as tags
FROM kb.graph_objects
WHERE properties->'tags' ?& ARRAY['team-sync', 'weekly'];
```

### Find Objects with Any of Multiple Tags (OR)
```sql
SELECT id, type, properties->>'name' as name, properties->'tags' as tags
FROM kb.graph_objects
WHERE properties->'tags' ?| ARRAY['team-sync', 'weekly'];
```

## Testing Checklist

### Unit Tests
- [ ] Tag aggregation service returns distinct tags
- [ ] Tag filtering logic works with single tag
- [ ] Tag filtering logic works with multiple tags (OR)
- [ ] Empty tag array handled correctly
- [ ] Objects without tags property handled

### Integration Tests
- [ ] Extract job creates objects with tags from LLM
- [ ] Tags stored correctly in properties.tags
- [ ] Tag list passed to LLM includes all existing tags
- [ ] LLM prefers existing tags over creating new ones

### E2E Tests
- [ ] User can filter objects by single tag
- [ ] User can filter objects by multiple tags
- [ ] Tag counts display correctly in dropdown
- [ ] Active tag filters show as badges
- [ ] Clearing tag filter restores all objects

## Future Enhancements

### Tag Management UI
- Rename tag across all objects
- Merge similar tags
- Delete unused tags
- Tag usage statistics

### Tag Hierarchy
- Parent-child tag relationships
- Namespace tags (`product:feature`, `eng:backend`)
- Tag inheritance

### Tag Suggestions
- Auto-suggest tags while typing
- Most popular tags
- Recently used tags
- Context-aware suggestions

### Tag Analytics
- Most used tags
- Tag trends over time
- Tag co-occurrence (tags used together)

## Related Files

### Modified
- `apps/server/src/modules/template-packs/seeds/meeting-decision-pack.seed.ts` - Removed 5 tags properties

### To Modify
- `apps/admin/src/components/organisms/ObjectBrowser/ObjectBrowser.tsx` - Add tag filtering
- `apps/admin/src/pages/admin/pages/objects/index.tsx` - Pass available tags to ObjectBrowser
- `apps/server/src/modules/graph/graph.service.ts` - Add getAllTags() method
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` - Query and pass tags to LLM
- `apps/server/src/modules/llm/providers/vertex-ai.provider.ts` - Include tags in prompt

## Session Notes

### 2025-01-19 - Initial Implementation
- ✅ Removed all 5 tags properties from meeting-decision-pack.seed.ts
- ✅ Build verified successful
- 🔄 Next: Implement tag aggregation query and ObjectBrowser filtering
