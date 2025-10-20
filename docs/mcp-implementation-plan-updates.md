# MCP Implementation Plan Updates - Hybrid Tools & Caching Strategy

**Date**: 2025-01-18
**Status**: Plan updated with approved design decisions

## Summary

The MCP implementation plan has been updated to incorporate:
1. **Hybrid Tool Approach**: Specific discoverable tools + generic fallbacks
2. **Schema Versioning**: Hash-based version tracking for cache invalidation
3. **Caching Strategy**: Multi-layered approach (version checks + TTL + optional WebSocket)

## Changes Made

### 1. Goals & Success Criteria (Updated)

Added two new goals:
- Use hybrid tool approach: Specific tools (getPersons, getTasks) + generic fallbacks
- Implement schema caching: Version-based cache invalidation

Added success criteria:
- Tool discoverability: Agents find common types in tool list without schema queries
- Cache invalidation: Agents detect schema changes within 60 seconds

### 2. Phase 3: Renamed & Restructured

**Old**: "Phase 3: Data Access Tools"
**New**: "Phase 3: Specific Data Tools - Hybrid Approach"

Added design decision note:
> We use a hybrid approach: specific tools for common types (Person, Task) and generic fallbacks for unknown types. See `docs/mcp-tools-design-comparison.md` for analysis.

### 3. Specific Data Tools Implementation

**Changed from Generic Tool**:
```typescript
// OLD: Single generic method
data.getObjectsByType(type_name, filters, limit, offset)

// NEW: 10+ specific methods
getPersons(department?, role?, skills?, limit?, offset?)
getPerson(person_id)
getTasks(status?, priority?, assignee_id?, due_before?, limit?, offset?)
getTask(task_id)
getTaskAssignees(task_id)
getPersonTasks(person_id, status?)
getTaskDependencies(task_id)
getPersonManager(person_id)
```

**Benefits**:
- **Discoverability**: Agents see "getPersons" and "getTasks" in tool list
- **Type Safety**: Parameters are strongly typed (status: 'todo' | 'in_progress' | 'done' | 'blocked')
- **Query Efficiency**: Reduces from 2+N calls to 2 calls (schema + data)

### 4. Generic Fallback Tools (Retained)

**Purpose**: Handle edge cases and custom types
```typescript
data.getObjectsByType(type_name, filters?, limit?, offset?)
data.getObject(type_name, object_id)
data.getRelatedObjects(object_id, relationship_type, direction?)
```

**When to use**:
- Future custom object types added by users
- Unknown types not covered by specific tools
- Development/debugging workflows
- Backward compatibility

### 5. NEW Phase 3.5: Schema Versioning & Caching

Added comprehensive versioning infrastructure:

**Database Schema**:
- `kb.template_pack_versions` - Track all schema versions
- `kb.template_pack_current` - Track active versions per pack

**New Endpoints**:
- `GET /mcp/schema/version` - Returns hash of current schema state
- `GET /mcp/schema/changelog` - Returns schema change history

**TemplatePackService Updates**:
- `getSchemaVersion()` - Generate SHA-256 hash of all pack versions
- `updateTemplatePack()` - Track version history on schema changes
- `hashSchema()` - Normalize and hash schema definitions

**Tool Response Metadata**:
All tools now include:
```typescript
{
  success: true,
  data: [...],
  metadata: {
    schema_version: "a1b2c3d4e5f6g7h8",  // For cache validation
    cached_until: 1705590000000,         // 5 min TTL hint
  }
}
```

### 6. NEW Section 9: Caching Strategy Configuration

**Agent-Side Caching Logic**:
```typescript
class McpClient {
  async getTools(packId: string): Promise<Tool[]> {
    // 1. Check schema version
    const serverVersion = await this.getSchemaVersion();
    
    // 2. Use cache if version matches and TTL not expired
    if (this.schemaVersion === serverVersion) {
      const cached = this.toolsCache.get(packId);
      if (cached && !expired(cached)) {
        return cached.tools;
      }
    }
    
    // 3. Fetch fresh if version changed or expired
    const tools = await this.fetchTools(packId);
    this.updateCache(packId, tools, serverVersion);
    return tools;
  }
}
```

**Cache Invalidation Triggers**:
1. **Version Check**: Agent periodically checks `/mcp/schema/version`
2. **TTL Expiration**: Default 5 minutes, configurable
3. **WebSocket Notification** (optional): Real-time schema change events

**Configuration Variables**:
```env
MCP_SCHEMA_CACHE_TTL=300                   # 5 minutes (agent cache)
MCP_SCHEMA_VERSION_CHECK_INTERVAL=60       # Check every 60 seconds
MCP_SCHEMA_ENABLE_NOTIFICATIONS=false      # WebSocket (future)
MCP_SCHEMA_CACHE_CONTROL=public, max-age=300
MCP_SCHEMA_ETAG_ENABLED=true
```

**HTTP Cache Headers**:
- `Cache-Control: public, max-age=300` - Browser/proxy caching
- `ETag: "schema-version-hash"` - Conditional requests (304 Not Modified)
- `Last-Modified: timestamp` - Additional validation

### 7. Updated Open Questions

**Removed** (now answered):
- ❌ "Caching: Should schema data be cached? For how long?"
- ❌ "Versioning: How should we handle API versioning for MCP tools?"

**Added**:
- ✅ "WebSocket Notifications: Should we implement real-time schema change notifications in Phase 1 or defer to Phase 2?"

### 8. Updated Tool Catalog (Appendix)

**Before**: Single table with 5 generic tools
**After**: Four organized sections:

1. **Schema Tools** (with versioning metadata)
2. **Versioning Endpoints** (new)
3. **Specific Data Tools** (10+ methods, recommended)
4. **Generic Data Tools** (fallback)

**Tool Selection Strategy** added:
1. First Choice: Use specific tools (better discoverability)
2. Fallback: Use generic tools for custom types
3. Future: Add more specific tools as patterns emerge

### 9. Updated References Section

Added internal design documents:
- `mcp-tools-design-comparison.md` - Hybrid approach analysis
- `mcp-schema-caching-and-changes.md` - Versioning strategy
- `mcp-tools-example-person-task.md` - Concrete examples

## Design Rationale

### Why Hybrid Approach?

**Problem with Generic Only**:
- Agents don't see "Person" or "Task" in tool list
- Requires 2+N calls: schema → types → objects
- String-based type names prone to errors

**Problem with Specific Only**:
- Can't handle future custom types
- Rigid for extensibility
- Breaks if specific tools are removed

**Hybrid Solution**:
- ✅ Specific tools for common types (getPersons, getTasks)
- ✅ Generic fallbacks for edge cases
- ✅ Best discoverability + flexibility

### Why Version-Based Caching?

**Problem**:
- Agents cache schemas and tools
- Schema changes aren't detected
- Stale cache leads to errors

**Solution**:
- Hash of all pack versions = schema version
- Agents check version periodically
- Version mismatch = invalidate cache
- TTL prevents indefinite stale cache
- Optional WebSocket for real-time updates

**Benefits**:
- ✅ Agents know when to refresh
- ✅ No manual cache clearing
- ✅ Works across multiple agents
- ✅ Configurable trade-offs (TTL vs polling)

## Implementation Impact

### Testing Requirements Added

**Phase 3 Testing**:
- [ ] Test specific tools with type-safe filters
- [ ] Test relationship traversal (getTaskAssignees, etc.)
- [ ] Test generic fallback for custom types
- [ ] Test hybrid fallback behavior

**Phase 3.5 Testing**:
- [ ] Test schema version generation (hash consistency)
- [ ] Test version changes on schema updates
- [ ] Test changelog tracking
- [ ] Test cache TTL behavior
- [ ] Test version-based cache invalidation
- [ ] Document agent caching best practices

### Module Updates

**McpModule** now exports:
- `SchemaTool` (with version metadata)
- `SpecificDataTool` (10+ methods)
- `GenericDataTool` (fallback methods)

**TemplatePackService** gains:
- `getSchemaVersion()` method
- `getSchemaLastUpdated()` method
- `getSchemaChangelog()` method
- Version tracking in `updateTemplatePack()`

**New Controller**: `McpController`
- `GET /mcp/schema/version`
- `GET /mcp/schema/changelog`

## Migration Path

1. **Phase 1**: Continue as planned (foundation)
2. **Phase 2**: Add schema versioning (database tables)
3. **Phase 3**: Implement specific tools (Person, Task)
4. **Phase 3.5**: Add versioning endpoints and caching
5. **Phase 4+**: Continue as planned

**No Breaking Changes**: Generic tools remain available as fallbacks

## Success Metrics

Added metrics:
- **Tool discoverability**: Agents successfully use specific tools without schema queries
- **Cache hit rate**: 80%+ of requests use cached schemas (within TTL)
- **Cache invalidation latency**: < 60 seconds from schema change to agent update

## Next Actions

1. **Review updated plan** with team
2. **Validate** hybrid approach with prototype
3. **Test** version hashing strategy
4. **Begin Phase 1** with updated module structure
5. **Monitor** tool usage patterns to identify candidates for specific tools

## Related Documents

- `docs/mcp-server-implementation-plan.md` - **Updated main plan**
- `docs/mcp-tools-design-comparison.md` - Tool design analysis
- `docs/mcp-schema-caching-and-changes.md` - Caching strategy
- `docs/mcp-tools-example-person-task.md` - Usage examples
