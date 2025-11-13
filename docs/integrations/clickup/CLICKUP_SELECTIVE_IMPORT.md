# ClickUp Selective Import Feature

## Overview

This document describes the selective import feature for the ClickUp integration. This feature allows users to import tasks from specific ClickUp lists instead of syncing the entire workspace, providing more granular control and faster sync times.

**Date Implemented:** October 5, 2025  
**Related Spec:** `docs/spec/22-clickup-integration.md` section 3.5  
**Task:** #6 - Update sync endpoint for selective import

## Feature Description

### Before (Full Workspace Sync)
- Imports entire workspace hierarchy: all spaces → all folders → all lists → all tasks
- Can take significant time for large workspaces
- Consumes many API calls (potential rate limiting)
- No control over what gets imported

### After (Selective Import)
- Users can select specific lists from a hierarchical tree UI
- Only selected lists and their tasks are imported
- Significantly faster for targeted imports
- Reduced API calls and rate limiting concerns
- Full workspace sync still available as default

## API Usage

### Endpoint
```
POST /api/v1/integrations/clickup/sync
```

### Request Body (Full Sync - Default)
```json
{
  "includeArchived": false,
  "batchSize": 100
}
```

### Request Body (Selective Sync)
```json
{
  "list_ids": ["list_1", "list_2", "list_3"],
  "includeArchived": false,
  "batchSize": 100
}
```

### Query Parameters
- `project_id` (required): Project ID
- `org_id` (required): Organization ID

### Configuration Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `list_ids` | `string[]` | `undefined` | Specific list IDs to import. If omitted or empty, full workspace sync is performed. |
| `includeArchived` | `boolean` | `false` | Whether to include archived/completed tasks |
| `batchSize` | `number` | `100` | Maximum tasks to import per list (for limiting large imports) |

### Response Format

```typescript
{
  success: boolean;
  totalImported: number;
  totalFailed: number;
  durationMs: number;
  breakdown: {
    lists: { imported: number; failed: number; skipped: number };
    tasks: { imported: number; failed: number; skipped: number };
    // spaces and folders will be 0 for selective import
  };
  completedAt: string; // ISO timestamp
}
```

### Example Response (Selective Import)

```json
{
  "success": true,
  "totalImported": 147,
  "totalFailed": 2,
  "durationMs": 8432,
  "breakdown": {
    "spaces": { "imported": 0, "failed": 0, "skipped": 0 },
    "folders": { "imported": 0, "failed": 0, "skipped": 0 },
    "lists": { "imported": 3, "failed": 0, "skipped": 0 },
    "tasks": { "imported": 144, "failed": 2, "skipped": 0 }
  },
  "completedAt": "2025-10-05T10:30:45.123Z"
}
```

## Implementation Details

### Backend Components

#### 1. ImportConfig Interface Update

**File:** `apps/server/src/modules/integrations/base-integration.ts`

Added `list_ids` parameter:

```typescript
export interface ImportConfig {
    includeArchived?: boolean;
    batchSize?: number;
    background?: boolean;
    resourceTypes?: string[];
    dateRange?: { start?: Date; end?: Date };
    list_ids?: string[]; // NEW: for selective import
}
```

#### 2. ClickUpImportService.runFullImport() - Detection Logic

**File:** `apps/server/src/modules/clickup/clickup-import.service.ts`

Added conditional branching:

```typescript
// Check if selective import (specific list IDs provided)
if (config.list_ids && config.list_ids.length > 0) {
    this.logger.log(`Selective import: ${config.list_ids.length} lists specified`);
    await this.importSpecificLists(
        config.list_ids,
        projectId,
        orgId,
        integrationId,
        config,
        breakdown
    );
    totalImported = breakdown['lists'].imported + breakdown['tasks'].imported;
    totalFailed = breakdown['lists'].failed + breakdown['tasks'].failed;
} else {
    // Full import: Import each space and its contents
    // ... existing full import logic ...
}
```

#### 3. ClickUpImportService.importSpecificLists() - New Method

**File:** `apps/server/src/modules/clickup/clickup-import.service.ts`

Optimized import path:

```typescript
private async importSpecificLists(
    listIds: string[],
    projectId: string,
    orgId: string,
    integrationId: string,
    config: ImportConfig,
    breakdown: Record<string, any>
): Promise<void>
```

**Flow:**
1. For each list ID:
   - Fetch first page of tasks (to get list metadata)
   - Extract list info from first task's `task.list` property
   - If no tasks, create minimal list object
   - Store list in database
   - Fetch all task pages (with pagination)
   - Store each task in database
2. Respect `batchSize` limit if specified
3. Handle errors gracefully per list

**Key Design Decision:**
- ClickUp API doesn't provide a direct "get list by ID" endpoint
- We fetch tasks first and extract list metadata from task responses
- Fallback to minimal list object if no tasks exist in the list

### Frontend Components

#### TypeScript Types Update

**File:** `apps/admin/src/api/integrations.ts`

Enhanced `TriggerSyncConfig`:

```typescript
export interface TriggerSyncConfig {
    full_sync?: boolean;
    source_types?: string[];
    list_ids?: string[]; // NEW
    includeArchived?: boolean; // NEW
    batchSize?: number; // NEW
}
```

#### Usage Example (React Component)

```typescript
import { useApi } from '@/hooks/useApi';
import { createIntegrationsClient } from '@/api/integrations';

function ClickUpSyncModal() {
    const { apiBase, fetchJson } = useApi();
    const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
    const [syncing, setSyncing] = useState(false);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const client = createIntegrationsClient(apiBase, fetchJson, projectId, orgId);
            const result = await client.triggerSync('clickup', {
                list_ids: selectedListIds,
                includeArchived: false,
                batchSize: 100
            });
            
            console.log(`Sync completed: ${result.totalImported} items imported`);
        } catch (error) {
            console.error('Sync failed:', error);
        } finally {
            setSyncing(false);
        }
    };

    // ... tree selection UI ...
}
```

## Performance Comparison

### Full Workspace Sync

**Scenario:** Workspace with 5 spaces, 10 folders, 30 lists, 1000 tasks

| Operation | API Calls | Duration |
|-----------|-----------|----------|
| Fetch workspaces | 1 | ~200ms |
| Fetch spaces | 1 | ~300ms |
| Fetch folders | 5 | ~1.5s |
| Fetch lists | 15 | ~4.5s |
| Fetch tasks (paginated) | ~100 | ~30s |
| **Total** | **~122 calls** | **~36s** |

### Selective Import (3 Lists)

**Scenario:** Import only 3 specific lists (100 tasks each)

| Operation | API Calls | Duration |
|-----------|-----------|----------|
| Fetch tasks (list 1) | ~10 | ~3s |
| Fetch tasks (list 2) | ~10 | ~3s |
| Fetch tasks (list 3) | ~10 | ~3s |
| **Total** | **~30 calls** | **~9s** |

**Improvement:** ~75% fewer API calls, ~75% faster

## Rate Limiting Considerations

### ClickUp API Limits
- **100 requests per minute** per workspace
- Selective import helps stay under limit
- Full workspace sync of large workspaces may hit limit

### Handling Rate Limits

The implementation includes built-in rate limiting:
- `ClickUpApiClient.rateLimiter` tracks requests
- Automatically waits when approaching limit
- Retries on 429 (rate limit exceeded) errors

**Example:** Importing 3 lists uses ~30 API calls, well under the 100/min limit. Full sync could use 100+ calls and require waiting.

## Error Handling

### Per-List Error Isolation

If one list fails during selective import, others continue:

```typescript
for (const listId of listIds) {
    try {
        // Import list and tasks
    } catch (error) {
        this.logger.error(`Failed to import list ${listId}`);
        breakdown['lists'].failed++;
        // Continue with next list
    }
}
```

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| List not found | Invalid list ID | Verify list exists in ClickUp |
| Permission denied | User lacks access to list | Check ClickUp permissions |
| Rate limit exceeded | Too many requests | Wait and retry, or reduce batch size |
| Task import failed | Malformed task data | Logged but doesn't stop import |

## Testing

### Manual Testing Checklist

**Full Sync (Baseline):**
- [ ] Full sync without list_ids imports all lists
- [ ] Full sync respects includeArchived flag
- [ ] Full sync breakdown includes all entity types

**Selective Sync:**
- [ ] Selective sync with 1 list imports only that list
- [ ] Selective sync with multiple lists imports all specified
- [ ] Invalid list IDs are handled gracefully (logged, continue)
- [ ] Empty list_ids array triggers full sync
- [ ] Selective sync breakdown shows 0 spaces/folders
- [ ] batchSize limit is respected per list

**Edge Cases:**
- [ ] List with no tasks (should still import list metadata)
- [ ] List with 1000+ tasks (pagination works correctly)
- [ ] Mix of accessible and inaccessible lists
- [ ] Duplicate list IDs in array (handled correctly)

### Unit Test Coverage

**Backend:**
```typescript
// apps/server/src/modules/clickup/clickup-import.service.spec.ts

describe('runFullImport with selective import', () => {
    it('should use full import when list_ids not provided', async () => {
        // config without list_ids
        // Assert full import path taken
    });

    it('should use selective import when list_ids provided', async () => {
        // config with list_ids
        // Assert importSpecificLists called
    });
});

describe('importSpecificLists', () => {
    it('should import only specified lists', async () => {
        // Mock API responses for 3 lists
        // Assert only those lists imported
    });

    it('should extract list metadata from tasks', async () => {
        // Mock task response with list metadata
        // Assert correct list info extracted
    });

    it('should handle lists with no tasks', async () => {
        // Mock empty task response
        // Assert minimal list object created
    });

    it('should respect batchSize limit', async () => {
        // config.batchSize = 50
        // Mock list with 100 tasks
        // Assert only 50 tasks imported
    });
});
```

**Frontend:**
```typescript
// apps/admin/src/api/integrations.test.ts

describe('triggerSync with selective import', () => {
    it('should send list_ids in request body', async () => {
        // Mock fetch
        // Call triggerSync with list_ids
        // Assert request body includes list_ids
    });
});
```

## UI Integration

### Workflow (Task #4 - To Be Implemented)

1. **User Opens Sync Modal**
   - Clicks "Sync Now" on ClickUp integration card

2. **Modal Fetches Workspace Structure**
   - Calls `GET /api/v1/integrations/clickup/structure`
   - Displays hierarchical tree (spaces → folders → lists)

3. **User Selects Lists**
   - Checkboxes for each list (with task counts)
   - Tri-state checkboxes for parent nodes
   - "Select All" / "Deselect All" buttons

4. **User Configures Import Options**
   - Include archived tasks: checkbox
   - Batch size: number input (default 100)
   - Run in background: toggle

5. **User Triggers Sync**
   - Clicks "Start Import" button
   - Modal shows progress (if foreground)
   - Or redirects with success message (if background)

6. **System Performs Selective Import**
   - Extracts selected list IDs from tree state
   - Calls `POST /api/v1/integrations/clickup/sync` with `list_ids`
   - Backend uses optimized selective import path

### Example Tree State

```typescript
{
  "space_1": {
    "checked": "partial", // some children selected
    "folder_1": {
      "checked": "all", // all children selected
      "list_1": { "checked": true },
      "list_2": { "checked": true }
    },
    "folder_2": {
      "checked": "none", // no children selected
      "list_3": { "checked": false }
    }
  }
}

// Extracted list IDs: ["list_1", "list_2"]
```

## Future Enhancements

### 1. Incremental Sync (Use Date Range)
```typescript
{
  list_ids: ["list_1", "list_2"],
  dateRange: {
    start: "2025-10-01T00:00:00Z"
  }
}
```
Only import tasks modified after the specified date.

### 2. Background Job Status
```typescript
POST /sync → { job_id: "abc123", status: "queued" }
GET /sync/abc123/status → { status: "running", progress: 45% }
```

### 3. Webhooks for Selective Lists
Register webhooks only for selected lists instead of entire workspace.

### 4. Persistent List Selection
Save user's last list selection as "sync profile" for quick re-sync.

### 5. Smart Defaults
Auto-select lists with recent activity or high task counts.

## Backwards Compatibility

✅ **Fully backwards compatible**
- Existing full sync behavior unchanged (when `list_ids` omitted)
- All existing API contracts maintained
- New parameters are optional
- No breaking changes to database schema

## Security Considerations

### Authorization
- List IDs are validated against user's ClickUp access
- If user lacks permission to a list, ClickUp API returns 403
- Error is logged but doesn't stop import of other lists

### Input Validation
- `list_ids` must be array of strings
- Each list ID validated against ClickUp ID format
- Empty array or null triggers full sync (safe default)

## Migration Notes

### Existing Integrations
No migration required. Existing ClickUp integrations will continue using full sync by default.

### Opt-In Feature
Users must explicitly provide `list_ids` in sync config to use selective import.

## Performance Monitoring

### Metrics to Track
- Average duration: full sync vs selective sync
- API calls per sync type
- Success rate by sync type
- Rate limit hits by sync type

### Recommended Alerting
- Alert if selective sync takes >30s (may indicate API issues)
- Alert if >10% of list imports fail
- Alert on repeated rate limit hits (may need batching)

## Related Documentation

- `docs/spec/22-clickup-integration.md` - Main ClickUp integration specification
- `docs/CLICKUP_WORKSPACE_STRUCTURE_ENDPOINT.md` - Structure endpoint for tree UI
- `docs/INTEGRATION_SOURCE_TRACKING.md` - Source tracking implementation
- `docs/CLICKUP_INTEGRATION_PROGRESS.md` - Overall progress tracking

## Changelog

### October 5, 2025
- **Initial Implementation**: Added selective import support
- **Backend**: Added `list_ids` to ImportConfig, implemented importSpecificLists()
- **Frontend**: Enhanced TriggerSyncConfig with list_ids, includeArchived, batchSize
- **Documentation**: Created this comprehensive guide
- **Status**: Complete and ready for UI integration (Task #4)

## Next Steps

1. **Task #4**: Build ClickUp Sync UI
   - Create WorkspaceTree component
   - Implement list selection state management
   - Build sync configuration form
   - Add progress tracking UI

2. **Testing**: Add comprehensive tests
   - Unit tests for importSpecificLists
   - Integration tests for selective sync endpoint
   - E2E tests for full sync flow

3. **Performance**: Add caching
   - Cache workspace structure for 5-10 minutes
   - Implement Redis for distributed cache
