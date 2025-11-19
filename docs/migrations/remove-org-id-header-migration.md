# API Migration Guide: Remove x-org-id Header

**Status**: ✅ Completed  
**Date**: November 18, 2025  
**Breaking Change**: Yes

## Overview

The `x-org-id` header has been removed from all API endpoints. API requests now only require the `x-project-id` header for tenant scoping. The organization ID is automatically derived from the project ID on the backend.

## What Changed

### Before (Old API)
```bash
curl -X GET https://api.example.com/api/documents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Org-ID: ed2a354d-feac-4de5-8f4a-e419822ac2ab" \
  -H "X-Project-ID: 12345678-1234-1234-1234-123456789abc"
```

### After (New API)
```bash
curl -X GET https://api.example.com/api/documents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Project-ID: 12345678-1234-1234-1234-123456789abc"
```

## Why This Change?

1. **Simpler API**: Single source of truth for tenant context
2. **Data Integrity**: Eliminates possibility of mismatched org/project pairs
3. **Better Security**: Server-side derivation prevents client manipulation
4. **Cleaner Code**: Less header parsing and validation logic

## Migration Steps

### For Frontend Applications

**1. Update API client headers**

Remove `X-Org-ID` from all API requests:

```typescript
// ❌ Old Code
const headers = {
  'Authorization': `Bearer ${token}`,
  'X-Org-ID': orgId,
  'X-Project-ID': projectId,
};

// ✅ New Code
const headers = {
  'Authorization': `Bearer ${token}`,
  'X-Project-ID': projectId,
};
```

**2. Keep org ID in UI state only**

Organization ID is still useful for display purposes, but should no longer be sent in API requests:

```typescript
// ✅ Correct Usage
const { orgId, projectId } = useActiveContext();

// Use orgId for UI display only
<span>Organization: {orgId}</span>

// Only send projectId in API calls
fetch('/api/documents', {
  headers: { 'X-Project-ID': projectId }
});
```

### For Backend Services

If you have backend services making API calls to this server:

**1. Remove x-org-id header from requests**
```javascript
// ❌ Old Code
axios.post('/api/documents', data, {
  headers: {
    'X-Org-ID': orgId,
    'X-Project-ID': projectId,
  }
});

// ✅ New Code
axios.post('/api/documents', data, {
  headers: {
    'X-Project-ID': projectId,
  }
});
```

### For Custom Controllers/Services

If you've added custom controllers or services:

**1. Remove x-org-id header extraction**
```typescript
// ❌ Old Code
@Get()
async list(@Headers('x-org-id') orgId: string, @Headers('x-project-id') projectId: string) {
  return this.service.list(orgId, projectId);
}

// ✅ New Code
@Get()
async list(@Headers('x-project-id') projectId: string) {
  return this.service.list(projectId);
}
```

**2. Update service method signatures**
```typescript
// ❌ Old Code
async list(orgId: string, projectId: string) {
  return this.db.runWithTenantContext(orgId, projectId, async () => {
    // query logic
  });
}

// ✅ New Code
async list(projectId: string) {
  return this.db.runWithTenantContext(projectId, async () => {
    // query logic
    // orgId is automatically derived from projectId
  });
}
```

**3. Update DatabaseService.runWithTenantContext() calls**
```typescript
// ❌ Old Code - 3 parameters
await this.db.runWithTenantContext(orgId, projectId, async () => {
  return await this.repo.find({ where: { projectId } });
});

// ✅ New Code - 2 parameters
await this.db.runWithTenantContext(projectId, async () => {
  return await this.repo.find({ where: { projectId } });
});
```

## Testing Your Migration

### 1. Test API Requests

Verify that API requests work without the `x-org-id` header:

```bash
# Should succeed
curl -X GET http://localhost:3002/api/documents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Project-ID: YOUR_PROJECT_ID"

# Old requests with x-org-id will work but header is ignored
curl -X GET http://localhost:3002/api/documents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Org-ID: YOUR_ORG_ID" \
  -H "X-Project-ID: YOUR_PROJECT_ID"
```

### 2. Verify RLS Policies

RLS policies now derive organization context from project ID automatically:

```sql
-- Example: Verify a project's org ID is correctly derived
SELECT id, organization_id FROM kb.projects WHERE id = 'YOUR_PROJECT_ID';
```

### 3. Run Test Suite

```bash
# Backend tests
nx run server:test

# Frontend tests  
nx run admin:test

# E2E tests
nx run server:test-e2e
```

## Rollback Plan

If you need to rollback:

1. **Backend**: Revert to commit before this migration
2. **Frontend**: Re-add `X-Org-ID` header to API requests
3. **Coordinate Deployment**: Ensure frontend and backend versions match

## Technical Details

### How Organization ID is Derived

The backend automatically derives the organization ID from the project ID using an in-memory cache:

```typescript
// In DatabaseService
async getOrgIdFromProjectId(projectId: string): Promise<string | null> {
  // Check cache first
  if (this.orgIdCache.has(projectId)) {
    return this.orgIdCache.get(projectId)!;
  }
  
  // Query database
  const result = await this.dataSource.query(
    'SELECT organization_id FROM kb.projects WHERE id = $1',
    [projectId]
  );
  
  // Cache result
  if (result.length > 0) {
    const orgId = result[0].organization_id;
    this.orgIdCache.set(projectId, orgId);
    return orgId;
  }
  
  return null;
}
```

### Cache Invalidation

The org ID cache is automatically cleared when:
- Projects are deleted
- Projects are moved between organizations (if implemented)

Manual cache clearing:
```typescript
// Clear specific project
databaseService.clearOrgIdCache('project-id');

// Clear entire cache
databaseService.clearOrgIdCache();
```

## Affected Endpoints

All endpoints that previously required `x-org-id` header now work with only `x-project-id`:

- `GET /api/documents`
- `POST /api/documents`
- `GET /api/chat/graph/search`
- `POST /api/chat/stream`
- `GET /api/graph/objects`
- `POST /api/graph/objects`
- `GET /api/extraction-jobs`
- All other project-scoped endpoints

## Support

If you encounter issues during migration:

1. Check that all API requests include `x-project-id` header
2. Verify project ID is valid and belongs to your organization
3. Review logs for any deprecation warnings
4. Consult the test files for examples of correct usage

## Related Documentation

- [OpenSpec Proposal](../../openspec/changes/remove-org-id-from-api-headers/proposal.md)
- [Authorization Model](../spec/18-authorization-model.md)
- [Database Access Spec](../../openspec/specs/database-access/)
