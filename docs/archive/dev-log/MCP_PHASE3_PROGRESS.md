# MCP Phase 3: Data Access Tools - IN PROGRESS 🚧

**Start Date:** 2025-10-20  
**Status:** Partial completion (Specific tools done, Generic tools pending)  
**Implementation Plan:** docs/mcp-server-implementation-plan.md  
**Previous:** docs/MCP_PHASE2_COMPLETE.md

## Summary

Phase 3 is implementing data access tools for querying graph objects. The first part (SpecificDataTool with Person and Task queries) is complete and building successfully. The second part (GenericDataTool for fallback queries) is still pending.

## What Was Implemented ✅

### 1. Specific Data Tool (`apps/server/src/modules/mcp/tools/specific-data.tool.ts`)

Created injectable service with 6 MCP tools for Person and Task entities:

#### Person Tools

**1. `data_getPersons`**
- **Purpose:** List all Person objects
- **Parameters:** `limit?: number`, `cursor?: string`, `label?: string`
- **Returns:** `ToolResultDto<PersonDto[]>` with pagination
- **Implementation:** Uses `GraphService.searchObjects()` with `type='Person'`

**2. `data_getPerson`**
- **Purpose:** Get a specific Person by ID
- **Parameters:** `id: string` (UUID)
- **Returns:** `ToolResultDto<PersonDto>`
- **Implementation:** Uses `GraphService.getObject()` with type validation

#### Task Tools

**3. `data_getTasks`**
- **Purpose:** List all Task objects
- **Parameters:** `limit?: number`, `cursor?: string`, `label?: string`
- **Returns:** `ToolResultDto<TaskDto[]>` with pagination
- **Implementation:** Uses `GraphService.searchObjects()` with `type='Task'`

**4. `data_getTask`**
- **Purpose:** Get a specific Task by ID
- **Parameters:** `id: string` (UUID)
- **Returns:** `ToolResultDto<TaskDto>`
- **Implementation:** Uses `GraphService.getObject()` with type validation

#### Relationship Tools

**5. `data_getTaskAssignees`**
- **Purpose:** Get all Persons assigned to a Task
- **Parameters:** `task_id: string`, `limit?: number`
- **Returns:** `ToolResultDto<PersonDto[]>`
- **Implementation:** 
  - Uses `GraphService.listEdges(task_id, 'out', limit)`
  - Filters to `assigned_to` relationships
  - Fetches target persons via `dst_id`

**6. `data_getPersonTasks`**
- **Purpose:** Get all Tasks assigned to a Person
- **Parameters:** `person_id: string`, `limit?: number`
- **Returns:** `ToolResultDto<TaskDto[]>`
- **Implementation:**
  - Uses `GraphService.listEdges(person_id, 'in', limit)`
  - Filters to `assigned_to` relationships
  - Fetches source tasks via `src_id`

### 2. Module Registration

Updated `apps/server/src/modules/mcp/mcp.module.ts`:
- Added `SpecificDataTool` import
- Added `SpecificDataTool` to providers array
- Updated documentation to reflect Phase 3 progress

## Technical Implementation Details

### GraphService API Usage

Discovered and used the following GraphService methods:

1. **`searchObjects(opts)`** - For querying objects by type:
   ```typescript
   await this.graphService.searchObjects({
     type: 'Person',
     label: params?.label,
     limit: params?.limit || 20,
     cursor: params?.cursor,
   });
   ```
   Returns: `{ items: GraphObjectDto[]; next_cursor?: string }`

2. **`getObject(id)`** - For fetching single objects:
   ```typescript
   const obj = await this.graphService.getObject(params.id);
   ```
   Returns: `GraphObjectDto`

3. **`listEdges(objectId, direction, limit)`** - For relationship queries:
   ```typescript
   const edges = await this.graphService.listEdges(
     params.task_id,
     'out',  // or 'in' or 'both'
     params.limit || 50
   );
   ```
   Returns: `GraphRelationshipDto[]`

### Data Transformation Pattern

Discovered that `GraphObjectDto` from graph.types.ts has a different structure than our MCP DTOs:

**GraphObjectDto fields:**
- `type: string` (not `type_name`)
- `labels: string[]` (not `label: string`)
- `key?: string | null` (nullable)
- `created_at: string` (no `updated_at` field)
- `canonical_id`, `version`, `properties`

**PersonDto/TaskDto required fields:**
- `type_name!: string`
- `name!: string`
- `key!: string`
- `created_at!: string`
- `updated_at!: string`

**Transformation logic applied:**
```typescript
{
  id: obj.id,
  type_name: obj.type,                                  // Map type → type_name
  key: obj.key || '',                                   // Ensure non-null
  name: obj.labels?.[0] || obj.key || 'Unnamed',       // Use first label as name
  properties: obj.properties || {},
  created_at: obj.created_at,
  updated_at: obj.created_at,                          // No updated_at, reuse created_at
  metadata: {                                           // Pack extra fields in metadata
    labels: obj.labels || [],
    canonical_id: obj.canonical_id,
    version: obj.version,
  },
}
```

### Relationship Field Names

GraphRelationshipDto uses:
- `src_id` (not `source_id`)
- `dst_id` (not `target_id`)

## Build Verification

```bash
npm --prefix apps/server run build
# Exit code: 0 ✅
```

All TypeScript compilation errors resolved:
- ✅ Correct GraphService method signatures
- ✅ Proper field name mappings (type→type_name, labels→name)
- ✅ Null safety (key || '', labels?.[0])
- ✅ Relationship field names (src_id, dst_id)
- ✅ Pagination cursor handling

## Testing Status

### Manual Testing (TODO)
- [ ] Test data_getPersons returns person summaries with pagination
- [ ] Test data_getPerson with valid UUID
- [ ] Test data_getPerson with invalid UUID (error handling)
- [ ] Test data_getTasks returns task summaries
- [ ] Test data_getTask with valid/invalid UUID
- [ ] Test data_getTaskAssignees with task having assignees
- [ ] Test data_getTaskAssignees with task having no assignees
- [ ] Test data_getPersonTasks with person having tasks
- [ ] Test data_getPersonTasks with person having no tasks
- [ ] Verify ToolResultDto structure in all responses
- [ ] Verify schema_version metadata present
- [ ] Verify next_cursor in paginated responses

### Unit Tests (TODO - Phase 3.5)
Create `apps/server/src/modules/mcp/tools/__tests__/specific-data.tool.spec.ts`:
- Mock GraphService methods
- Test each tool independently
- Test error handling (not found, wrong type)
- Test pagination cursor logic
- Test relationship filtering

## What's Still Pending 🚧

### Phase 3 (Remaining): Generic Data Tool

**TODO:** Create `apps/server/src/modules/mcp/tools/generic-data.tool.ts`:

1. **`data_getObjectsByType`** - Fallback for any object type
   - Parameters: `type: string`, `limit?`, `cursor?`, `label?`
   - Returns: `ToolResultDto<GraphObjectDto[]>`
   - Use case: Query types not covered by specific tools

2. **`data_getObjectById`** - Fallback for any object ID
   - Parameters: `id: string`
   - Returns: `ToolResultDto<GraphObjectDto>`
   - Use case: When type is unknown

3. **`data_getRelatedObjects`** - Generic relationship traversal
   - Parameters: `object_id: string`, `relationship_type?`, `direction?`, `limit?`
   - Returns: `ToolResultDto<GraphObjectDto[]>`
   - Use case: Explore relationships without knowing schema

### Phase 3.5: Schema Versioning

Replace all placeholder versions:
```typescript
const schemaVersion = 'placeholder-version';
```

**TODO:** Implement actual schema versioning:
1. Add `getSchemaVersion()` method to shared service
2. Generate version hash from template pack `updated_at` timestamps
3. Use MD5 or similar for cache key
4. Update all tools (SchemaTool + SpecificDataTool + GenericDataTool)

## Lessons Learned

### API Discovery Pattern
1. **Check controller first** - Controllers show the high-level API surface
2. **Find service methods** - grep for method signatures in service files
3. **Read actual types** - Check graph.types.ts for field structure
4. **Test transformation** - Ensure DTO mappings handle all edge cases

### GraphObjectDto vs MCP DTOs
- Graph uses semantic plurals (`labels: string[]`)
- MCP uses singular display (`name: string`)
- Solution: Transform at boundary, pack extras in `metadata`

### Relationship Navigation
- Always use correct field names (`src_id`/`dst_id`)
- Direction matters: `'out'` for forward, `'in'` for backward
- Filter by `type` after fetching edges
- Handle missing objects gracefully (try/catch in loops)

### Error Handling Pattern
All tools use consistent error structure:
```typescript
try {
  // ... implementation
  return { success: true, data: ..., metadata: {...} };
} catch (error) {
  return { success: false, error: error instanceof Error ? error.message : '...' };
}
```

## File Changes

### New Files (1)
- `apps/server/src/modules/mcp/tools/specific-data.tool.ts` (395 lines)

### Modified Files (1)
- `apps/server/src/modules/mcp/mcp.module.ts` (+2 imports, +1 provider)

### Related Documentation
- `docs/mcp-server-implementation-plan.md` - Overall plan
- `docs/MCP_PHASE2_COMPLETE.md` - Schema tools phase
- `docs/MCP_PHASE3_PROGRESS.md` - This document

## Commit Message (When Complete)

```
feat(mcp): implement Phase 3 specific data tools (partial)

Phase 3 (Part 1): Specific Data Tools
- Add SpecificDataTool with 6 MCP tools
- Person queries: data_getPersons, data_getPerson
- Task queries: data_getTasks, data_getTask
- Relationship queries: data_getTaskAssignees, data_getPersonTasks

Implementation Details:
- Use GraphService.searchObjects() for list queries
- Use GraphService.getObject() for single object fetch
- Use GraphService.listEdges() for relationship traversal
- Transform GraphObjectDto to MCP DTOs (type→type_name, labels→name)
- Handle pagination with cursor support
- Include schema_version metadata (placeholder for now)

Technical Fixes:
- Correct field name mappings (src_id, dst_id not source_id, target_id)
- Null safety for optional fields (key || '', labels?.[0])
- No updated_at in GraphObjectDto, reuse created_at
- Pack extra fields in metadata (labels, canonical_id, version)

TODOs:
- Phase 3 Part 2: Implement GenericDataTool
- Phase 3.5: Replace placeholder schema versions
- Add unit tests for specific-data.tool.ts

Refs: docs/MCP_PHASE3_PROGRESS.md
```

## Next Steps

1. **Complete Phase 3**: Implement GenericDataTool
   - Create `tools/generic-data.tool.ts`
   - Add `data_getObjectsByType`, `data_getObjectById`, `data_getRelatedObjects`
   - Register in module
   - Test build

2. **Phase 3 Testing** (Before Phase 3.5):
   - Manual testing via MCP client
   - Create unit tests for both tools
   - End-to-end workflow tests

3. **Phase 3.5: Schema Versioning**:
   - Design version hash algorithm
   - Implement shared versioning service
   - Update all tools to use real versions
   - Add version change detection

4. **Phase 4: Authentication**:
   - Add JWT token validation
   - Add scope-based authorization guards
   - Protect all MCP tools

5. **Phase 5: AI Agent Service**:
   - Create orchestration layer
   - Add conversation context management
   - Implement agent-specific caching strategies

## Conclusion

Phase 3 (Part 1) successfully delivered specific data access tools for Person and Task entities, including relationship queries. AI agents can now:
- Query for persons and tasks with pagination
- Fetch individual entities by ID
- Traverse assigned_to relationships bidirectionally

All code compiles cleanly. Ready to proceed to Phase 3 (Part 2) - Generic Data Tool.
