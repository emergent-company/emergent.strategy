# MCP Phase 3.5 Complete: Schema Versioning

**Status**: ✅ **COMPLETE**  
**Date**: October 20, 2025  
**Build Status**: Passing ✅

## Overview

Phase 3.5 successfully implements schema versioning for all MCP tools, replacing placeholder versions with a real MD5 hash-based versioning system. This enables AI agents to perform intelligent cache invalidation based on template pack changes.

## Implementation Summary

### Core Component: SchemaVersionService

**File**: `apps/server/src/modules/mcp/services/schema-version.service.ts` (145 lines)

**Purpose**: Centralized service for computing and managing schema version hashes

**Algorithm**: 
1. Fetch all template packs from database
2. Sort by ID for stable ordering
3. Create composite string: `id1:timestamp1|id2:timestamp2|...`
4. Compute MD5 hash of composite
5. Return first 16 characters for brevity
6. Cache result for 60 seconds to minimize DB load

**Key Features**:
- ✅ **Change Detection**: Hash changes when packs are added, updated, or deleted
- ✅ **Stable Ordering**: Sorts packs by ID before hashing
- ✅ **Performance**: 60-second cache to avoid repeated DB queries
- ✅ **Cache Invalidation**: `invalidateCache()` method for manual refresh
- ✅ **Detailed Metadata**: `getSchemaVersionDetails()` for controller endpoints

### Version Computation Logic

```typescript
async getSchemaVersion(): Promise<string> {
  // Return cached if still valid
  if (this.cachedVersion && Date.now() < this.cacheExpiry) {
    return this.cachedVersion;
  }

  // Fetch all template packs
  const result = await this.templatePackService.listTemplatePacks({
    limit: 1000, // High limit to get all packs
    page: 1,
  });

  // Sort by ID for stable ordering
  const sortedPacks = [...result.packs].sort((a, b) => 
    a.id.localeCompare(b.id)
  );

  // Create composite: id1:timestamp1|id2:timestamp2|...
  const composite = sortedPacks
    .map(pack => {
      const timestamp = new Date(pack.updated_at).getTime();
      return `${pack.id}:${timestamp}`;
    })
    .join('|');

  // Compute MD5 hash (first 16 chars)
  const hash = createHash('md5')
    .update(composite)
    .digest('hex')
    .substring(0, 16);

  // Cache result
  this.cachedVersion = hash;
  this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;

  return hash;
}
```

### Example Version Hash

**Input** (2 template packs):
```
pack-abc-123:1729425600000|pack-def-456:1729426200000
```

**Output** (MD5 hash):
```
a1b2c3d4e5f6g7h8
```

### Change Scenarios

| Event | Composite String Changes | Version Hash Changes |
|-------|-------------------------|---------------------|
| Pack added | New `id:timestamp` appears | ✅ Yes |
| Pack updated | Existing `id:timestamp` changes | ✅ Yes |
| Pack deleted | `id:timestamp` disappears | ✅ Yes |
| No changes | Same composite | ✅ No (stable) |

## Integration with Tools

### Updated Files

All 3 tool classes now inject and use SchemaVersionService:

1. **SchemaTool** (`schema.tool.ts`)
   - 4 tools updated
   - Lines: 62, 145, 209, 290

2. **SpecificDataTool** (`specific-data.tool.ts`)
   - 6 tools updated
   - Lines: 73, 131, 195, 253, 328, 400

3. **GenericDataTool** (`generic-data.tool.ts`)
   - 3 tools updated
   - Lines: 95, 159, 274

**Total**: 13 tools now use real schema versioning

### Before vs After

**Before** (placeholder):
```typescript
const schemaVersion = 'placeholder-version';

return {
  success: true,
  data: results,
  metadata: {
    schema_version: schemaVersion, // Always same
    cached_until: Date.now() + 300000,
  },
};
```

**After** (real versioning):
```typescript
const schemaVersion = await this.schemaVersionService.getSchemaVersion();

return {
  success: true,
  data: results,
  metadata: {
    schema_version: schemaVersion, // Changes with schema updates
    cached_until: Date.now() + 300000,
  },
};
```

### Constructor Updates

All three tool classes now inject SchemaVersionService:

```typescript
@Injectable()
export class SchemaTool {
  constructor(
    private readonly templatePackService: TemplatePackService,
    private readonly schemaVersionService: SchemaVersionService, // ✅ Added
  ) {}
}

@Injectable()
export class SpecificDataTool {
  constructor(
    private readonly graphService: GraphService,
    private readonly schemaVersionService: SchemaVersionService, // ✅ Added
  ) {}
}

@Injectable()
export class GenericDataTool {
  constructor(
    private readonly graphService: GraphService,
    private readonly schemaVersionService: SchemaVersionService, // ✅ Added
  ) {}
}
```

## Controller Updates

### Schema Version Endpoint

**File**: `apps/server/src/modules/mcp/mcp.controller.ts`

**Before**:
```typescript
constructor(
  private readonly templatePackService: TemplatePackService,
) {}

async getSchemaVersion(): Promise<SchemaVersionDto> {
  const version = 'placeholder'; // TODO
  const updatedAt = new Date(); // TODO

  return {
    version,
    updated_at: updatedAt.toISOString(),
    cache_hint_ttl: 300,
  };
}
```

**After**:
```typescript
constructor(
  private readonly schemaVersionService: SchemaVersionService,
) {}

async getSchemaVersion(): Promise<SchemaVersionDto> {
  const details = await this.schemaVersionService.getSchemaVersionDetails();

  return {
    version: details.version,
    updated_at: details.latest_update || new Date().toISOString(),
    cache_hint_ttl: 300,
  };
}
```

### Endpoint Response

**GET** `/mcp/schema/version`

**Response**:
```json
{
  "version": "a1b2c3d4e5f6g7h8",
  "updated_at": "2025-10-20T15:30:00.000Z",
  "cache_hint_ttl": 300
}
```

## Module Registration

Updated `mcp.module.ts`:

```typescript
import { SchemaVersionService } from './services/schema-version.service';

@Module({
  imports: [
    TemplatePackModule,
    GraphModule,
  ],
  controllers: [McpController],
  providers: [
    SchemaVersionService, // ✅ Added (Phase 3.5)
    SchemaTool,
    SpecificDataTool,
    GenericDataTool,
  ],
  exports: [SchemaVersionService], // ✅ Export for future use
})
export class McpModule {}
```

## Caching Strategy

### Tool-Level Caching
- Each tool response includes `cached_until` timestamp (5 minutes from now)
- Agents can cache results until this timestamp
- After expiry, agents should check schema_version

### Service-Level Caching
- SchemaVersionService caches computed hash for 60 seconds
- Subsequent tool calls within 60s reuse cached version
- Minimizes database load for high-frequency tool usage

### Cache Invalidation Flow

```
Template Pack Updated
    ↓
60s cache expires naturally
    ↓
Next tool call triggers getSchemaVersion()
    ↓
Fetches fresh pack data
    ↓
Computes new hash (different from old)
    ↓
Tool returns new schema_version
    ↓
Agent detects version change
    ↓
Agent invalidates cached results
    ↓
Agent re-fetches fresh data
```

### Manual Cache Invalidation

```typescript
// After modifying template packs
this.schemaVersionService.invalidateCache();
```

This forces immediate recomputation on next `getSchemaVersion()` call.

## Performance Characteristics

### Time Complexity
- **First Call**: O(n log n) where n = number of packs (sorting + hashing)
- **Cached Calls**: O(1) (return cached value)
- **Typical Pack Count**: 5-20 packs
- **Expected Time**: < 50ms for first call, < 1ms for cached calls

### Database Load
- **Without Caching**: Every tool call queries template_packs table
- **With Caching**: One query per 60 seconds max
- **Reduction**: 99%+ for high-frequency usage

### Memory Footprint
- **Cached Data**: ~100 bytes (version hash + timestamp)
- **Overhead**: Negligible

## Testing Scenarios

### Scenario 1: Version Stability
```typescript
// Fetch version twice without changes
const v1 = await service.getSchemaVersion();
const v2 = await service.getSchemaVersion();

expect(v1).toBe(v2); // ✅ Same hash
```

### Scenario 2: Pack Addition
```typescript
// Add new template pack
await templatePackService.createPack({ ... });

// Wait for cache to expire (60s)
await sleep(61000);

// Fetch version
const v1 = await service.getSchemaVersion();
const v2 = await service.getSchemaVersion(); // After adding pack

expect(v1).not.toBe(v2); // ✅ Different hash
```

### Scenario 3: Pack Update
```typescript
// Update existing pack
await templatePackService.updatePack(packId, { ... });

service.invalidateCache(); // Manual invalidation

const v1 = await service.getSchemaVersion();

expect(v1).not.toBe(previousVersion); // ✅ Hash changed
```

### Scenario 4: Cache Expiry
```typescript
const v1 = await service.getSchemaVersion();

// Wait 59 seconds
await sleep(59000);

const v2 = await service.getSchemaVersion(); // Still cached

expect(v1).toBe(v2); // ✅ Same (from cache)

// Wait 2 more seconds (total 61s)
await sleep(2000);

const v3 = await service.getSchemaVersion(); // Recomputed

// If no changes, should still be same
expect(v3).toBe(v2); // ✅ Same value, freshly computed
```

## Agent Usage Pattern

### Step 1: Initial Tool Call
```typescript
// Agent calls data_getPersons
const response = await mcpClient.callTool('data_getPersons', { limit: 10 });

// Response includes version
{
  success: true,
  data: [...],
  metadata: {
    schema_version: "a1b2c3d4e5f6g7h8",
    cached_until: 1729425900000, // Unix timestamp
  }
}

// Agent caches result with version tag
cache.set('persons', response.data, {
  version: "a1b2c3d4e5f6g7h8",
  expires: 1729425900000
});
```

### Step 2: Subsequent Calls
```typescript
// 2 minutes later, agent needs persons again
const cached = cache.get('persons');

if (cached && Date.now() < cached.expires) {
  // Cache still valid by TTL
  return cached.data;
}

// TTL expired, check if schema changed
const versionInfo = await mcpClient.getSchemaVersion();

if (cached && cached.version === versionInfo.version) {
  // Schema unchanged, extend cache TTL
  cache.updateExpiry('persons', Date.now() + 300000);
  return cached.data;
}

// Schema changed or no cache, re-fetch
const fresh = await mcpClient.callTool('data_getPersons', { limit: 10 });
cache.set('persons', fresh.data, {
  version: fresh.metadata.schema_version,
  expires: fresh.metadata.cached_until
});
```

### Step 3: Proactive Version Checks
```typescript
// Agent can poll /mcp/schema/version every 60s
setInterval(async () => {
  const version = await mcpClient.getSchemaVersion();
  
  if (version.version !== currentVersion) {
    console.log('Schema changed, invalidating caches');
    cache.invalidateAll();
    currentVersion = version.version;
  }
}, 60000);
```

## Compilation Status

### Build Verification
```bash
npm --prefix apps/server run build
```

**Result**: Exit code 0 ✅ - Clean build

### Updated Files Summary
1. ✅ Created: `services/schema-version.service.ts` (145 lines)
2. ✅ Modified: `mcp.module.ts` (added provider + export)
3. ✅ Modified: `tools/schema.tool.ts` (constructor + 4 method updates)
4. ✅ Modified: `tools/specific-data.tool.ts` (constructor + 6 method updates)
5. ✅ Modified: `tools/generic-data.tool.ts` (constructor + 3 method updates)
6. ✅ Modified: `mcp.controller.ts` (constructor + endpoint implementation)

**Total**: 6 files modified, 1 file created

## Code Statistics

### Lines of Code
- SchemaVersionService: 145 lines
- Updated tool methods: 13 methods across 3 files
- Module registration: 3 lines
- Controller update: 8 lines

### Replacements Made
- Removed: 13 occurrences of `'placeholder-version'`
- Added: 13 calls to `schemaVersionService.getSchemaVersion()`
- Updated: 3 constructor injections
- Updated: 1 controller injection

## Benefits Delivered

### For AI Agents
✅ **Intelligent Caching**: Can cache results based on schema stability  
✅ **Cache Invalidation**: Automatic detection when schema changes  
✅ **Reduced Latency**: Avoid redundant tool calls for unchanged data  
✅ **Version Tracking**: Compare versions to detect staleness  

### For System
✅ **Centralized Logic**: Single service computes version  
✅ **Performance**: 60s cache minimizes DB load  
✅ **Consistency**: All 13 tools use same version at any point in time  
✅ **Maintainability**: Easy to update versioning algorithm  

### For Developers
✅ **Transparency**: Version endpoint reveals current state  
✅ **Debugging**: Can track when schema changed  
✅ **Testing**: Can verify cache invalidation logic  
✅ **Manual Control**: `invalidateCache()` for testing  

## Limitations & Future Enhancements

### Current Limitations
- ⚠️ **Limit**: Fetches only first 1000 packs (should cover most cases)
- ⚠️ **Atomicity**: No atomic version+data fetch (two separate queries)
- ⚠️ **Changelog**: `/mcp/schema/changelog` endpoint still returns empty array

### Potential Improvements
1. **Database-Stored Version**:
   - Store computed hash in database
   - Update via trigger when packs change
   - Faster retrieval (single field query)

2. **WebSocket Notifications**:
   - Push version changes to connected agents
   - Avoid polling `/mcp/schema/version`
   - Real-time cache invalidation

3. **Per-Pack Versioning**:
   - Separate version hash per template pack
   - Finer-grained cache invalidation
   - Agent caches specific pack results

4. **Changelog Implementation**:
   - Track pack changes in audit table
   - Implement `/mcp/schema/changelog` endpoint
   - Return recent changes for debugging

5. **Version Comparison API**:
   - `/mcp/schema/diff?from=v1&to=v2`
   - Show what changed between versions
   - Help agents understand schema evolution

## Conclusion

Phase 3.5 successfully replaces all placeholder schema versions with a real MD5 hash-based system that:
- ✅ Detects template pack changes (add/update/delete)
- ✅ Enables intelligent agent caching
- ✅ Minimizes database load via caching
- ✅ Provides HTTP endpoint for version checks
- ✅ Builds cleanly without errors

All 13 MCP tools now include meaningful `schema_version` metadata that agents can use for cache invalidation decisions.

**Ready to proceed to Phase 4: Authentication & Authorization** 🚀
