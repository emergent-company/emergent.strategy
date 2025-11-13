# ClickUp Workspace Structure Endpoint

## Overview

This document describes the new workspace structure endpoint implemented for the ClickUp integration. This endpoint provides the hierarchical workspace structure needed for the list selection UI in the sync modal.

**Date Implemented:** October 5, 2025  
**Related Spec:** `docs/spec/22-clickup-integration.md` section 3.5.2  
**Task:** #5 - Add backend endpoint for ClickUp workspace structure

## Endpoint Details

### URL
```
GET /api/v1/integrations/clickup/structure
```

### Query Parameters
- `project_id` (required): Project ID
- `org_id` (required): Organization ID

### Authentication
Requires bearer token authentication (same as other integration endpoints).

### Response Format

```typescript
{
  workspace: {
    id: string;
    name: string;
  };
  spaces: [
    {
      id: string;
      name: string;
      archived: boolean;
      folders: [
        {
          id: string;
          name: string;
          archived: boolean;
          lists: [
            {
              id: string;
              name: string;
              task_count: number;
              archived: boolean;
            }
          ]
        }
      ];
      lists: [  // Folderless lists
        {
          id: string;
          name: string;
          task_count: number;
          archived: boolean;
        }
      ];
    }
  ];
}
```

### Example Response

```json
{
  "workspace": {
    "id": "12345",
    "name": "My Workspace"
  },
  "spaces": [
    {
      "id": "space_1",
      "name": "Development",
      "archived": false,
      "folders": [
        {
          "id": "folder_1",
          "name": "Sprint Planning",
          "archived": false,
          "lists": [
            {
              "id": "list_1",
              "name": "Backlog",
              "task_count": 45,
              "archived": false
            },
            {
              "id": "list_2",
              "name": "In Progress",
              "task_count": 12,
              "archived": false
            }
          ]
        }
      ],
      "lists": [
        {
          "id": "list_3",
          "name": "Team Tasks",
          "task_count": 8,
          "archived": false
        }
      ]
    }
  ]
}
```

## Implementation Details

### Backend Components

#### 1. ClickUpImportService.fetchWorkspaceStructure()

**File:** `apps/server/src/modules/clickup/clickup-import.service.ts`

New method that orchestrates the fetching of the workspace structure:

```typescript
async fetchWorkspaceStructure(
    workspaceId: string,
    includeArchived: boolean = false
): Promise<any>
```

**Flow:**
1. Fetch workspace metadata from ClickUp API
2. Fetch all spaces in the workspace
3. For each space:
   - Fetch folders
   - For each folder: fetch lists
   - Fetch folderless lists
4. For each list: get task count (if available in API response)
5. Return hierarchical structure

**Note on Task Counts:**
- The ClickUp API doesn't return total task counts in all responses
- We attempt to use `list.task_count` if available
- Otherwise, we fetch the first page of tasks to check if tasks exist
- This is a performance optimization to avoid fetching all tasks

#### 2. ClickUpIntegration.getWorkspaceStructure()

**File:** `apps/server/src/modules/clickup/clickup.integration.ts`

Wrapper method that calls the import service:

```typescript
async getWorkspaceStructure(): Promise<any>
```

#### 3. IntegrationsService.getClickUpWorkspaceStructure()

**File:** `apps/server/src/modules/integrations/integrations.service.ts`

Service layer method that:
1. Retrieves the ClickUp integration configuration
2. Validates the integration is enabled
3. Configures the ClickUp integration instance
4. Calls getWorkspaceStructure()

```typescript
async getClickUpWorkspaceStructure(
    projectId: string,
    orgId: string
): Promise<any>
```

#### 4. IntegrationsController.getClickUpWorkspaceStructure()

**File:** `apps/server/src/modules/integrations/integrations.controller.ts`

Controller endpoint:

```typescript
@Get('clickup/structure')
@ApiOperation({
    summary: 'Get ClickUp workspace structure',
    description: 'Fetch hierarchical workspace structure...'
})
async getClickUpWorkspaceStructure(
    @Query('project_id') projectId: string,
    @Query('org_id') orgId: string
): Promise<any>
```

### Frontend Components

#### TypeScript Types

**File:** `apps/admin/src/api/integrations.ts`

New interfaces:

```typescript
export interface ClickUpList {
    id: string;
    name: string;
    task_count: number;
    archived: boolean;
}

export interface ClickUpFolder {
    id: string;
    name: string;
    lists: ClickUpList[];
    archived: boolean;
}

export interface ClickUpSpace {
    id: string;
    name: string;
    folders: ClickUpFolder[];
    lists: ClickUpList[]; // Folderless lists
    archived: boolean;
}

export interface ClickUpWorkspaceStructure {
    workspace: {
        id: string;
        name: string;
    };
    spaces: ClickUpSpace[];
}
```

#### API Client Method

```typescript
async getClickUpWorkspaceStructure(): Promise<ClickUpWorkspaceStructure> {
    return fetchJson<ClickUpWorkspaceStructure>(`${baseUrl}/clickup/structure`);
}
```

## Usage Example

### Backend (Testing)

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3001/api/v1/integrations/clickup/structure?project_id=PROJECT_ID&org_id=ORG_ID"
```

### Frontend (React Component)

```typescript
import { useApi } from '@/hooks/useApi';
import { createIntegrationsClient } from '@/api/integrations';

function ClickUpSyncModal() {
    const { apiBase, fetchJson } = useApi();
    const [structure, setStructure] = useState<ClickUpWorkspaceStructure | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadStructure = async () => {
            setLoading(true);
            try {
                const client = createIntegrationsClient(apiBase, fetchJson, projectId, orgId);
                const data = await client.getClickUpWorkspaceStructure();
                setStructure(data);
            } catch (error) {
                console.error('Failed to load workspace structure:', error);
            } finally {
                setLoading(false);
            }
        };

        loadStructure();
    }, []);

    // Render tree with structure data...
}
```

## Error Handling

### Common Errors

| Status | Error | Cause | Resolution |
|--------|-------|-------|------------|
| 404 | Integration not found | ClickUp integration not configured for project | Configure ClickUp integration first |
| 400 | Integration is disabled | ClickUp integration exists but is disabled | Enable the integration |
| 401 | Unauthorized | Missing or invalid auth token | Provide valid bearer token |
| 500 | Failed to fetch workspace structure | ClickUp API error or rate limit | Check ClickUp API status, retry after delay |

### Error Response Format

```json
{
  "statusCode": 404,
  "message": "ClickUp integration not found in registry",
  "error": "Not Found"
}
```

## Performance Considerations

### Rate Limiting

- ClickUp API: 100 requests per minute per workspace
- Fetching structure can consume many API calls:
  - 1 call for workspaces
  - 1 call for spaces
  - N calls for folders (1 per space)
  - M calls for lists (1 per folder + 1 per space for folderless)
  - Optional: 1 call per list for task counts

**Example:** A workspace with 5 spaces, 10 folders, and 30 lists = ~46 API calls

### Optimization Strategies

1. **Caching**: Consider caching the structure for 5-10 minutes
   - Implementation: Redis with TTL
   - Key: `clickup:structure:${workspaceId}`

2. **Lazy Loading**: Fetch only top-level structure initially
   - Load folders/lists on-demand when user expands a space
   - Implementation: Additional endpoints for `/structure/space/:id/folders`

3. **Partial Updates**: Store structure in database and update incrementally
   - Use webhooks to update when structure changes

4. **Task Count Optimization**: 
   - Current: Uses list.task_count from API if available
   - Fallback: Fetches first page only to check existence
   - Future: Store task counts during full sync

## Future Enhancements

### 1. Incremental Structure Updates
```typescript
GET /api/v1/integrations/clickup/structure/changes?since=TIMESTAMP
```
Returns only structure changes since last fetch.

### 2. Lazy Loading Endpoints
```typescript
GET /api/v1/integrations/clickup/structure/space/:spaceId/folders
GET /api/v1/integrations/clickup/structure/folder/:folderId/lists
```

### 3. Search/Filter
```typescript
GET /api/v1/integrations/clickup/structure?search=keyword
```
Filter structure by name, limit depth, etc.

### 4. Cached Response Headers
```http
Cache-Control: max-age=300
ETag: "structure-hash"
```

## Testing

### Manual Testing Checklist

- [ ] Endpoint returns 404 when ClickUp integration not configured
- [ ] Endpoint returns 400 when integration is disabled
- [ ] Endpoint returns correct structure for configured workspace
- [ ] Structure includes all spaces, folders, and lists
- [ ] Task counts are present for each list
- [ ] Archived items are marked correctly
- [ ] Folderless lists are in the correct location
- [ ] Response time is acceptable (<5 seconds for typical workspace)
- [ ] Rate limiting is respected (no 429 errors)
- [ ] Frontend API client can successfully call and parse response

### Unit Test Coverage

**Backend:**
```typescript
// apps/server/src/modules/clickup/clickup-import.service.spec.ts
describe('fetchWorkspaceStructure', () => {
    it('should fetch and structure workspace hierarchy', async () => {
        // Mock ClickUp API responses
        // Assert correct structure returned
    });

    it('should handle archived items based on includeArchived flag', async () => {
        // Test with includeArchived=true and false
    });

    it('should handle API errors gracefully', async () => {
        // Mock API failures
        // Assert error handling
    });
});
```

**Frontend:**
```typescript
// apps/admin/src/api/integrations.test.ts
describe('getClickUpWorkspaceStructure', () => {
    it('should fetch structure from correct endpoint', async () => {
        // Mock fetch
        // Assert correct URL called
    });

    it('should parse response into correct types', async () => {
        // Mock response
        // Assert TypeScript types are correct
    });
});
```

## Related Documentation

- `docs/spec/22-clickup-integration.md` - Main ClickUp integration specification
- `docs/INTEGRATION_SOURCE_TRACKING.md` - Source tracking implementation
- `docs/CLICKUP_INTEGRATION_PROGRESS.md` - Overall progress tracking
- ClickUp API Documentation: https://clickup.com/api

## Changelog

### October 5, 2025
- **Initial Implementation**: Created workspace structure endpoint
- **Backend**: Added fetchWorkspaceStructure() to ClickUpImportService
- **Frontend**: Added TypeScript types and API client method
- **Status**: Complete and ready for integration with sync UI (Task #4)

## Next Steps

1. **Task #6**: Implement selective import backend logic
   - Modify sync endpoint to accept list_ids array
   - Skip full workspace traversal when specific lists provided

2. **Task #4**: Build ClickUp sync UI
   - Create WorkspaceTree component using structure data
   - Implement tri-state checkboxes
   - Add list selection state management

3. **Testing**: Add E2E tests for structure endpoint
   - Mock ClickUp API responses
   - Test error cases
   - Verify performance with large workspaces
