# Monitoring API 422 Error Fix

**Date**: 2025-10-22  
**Issue**: Monitoring dashboard API call returning 422 Unprocessable Entity  
**Status**: ✅ Fixed

## Problem

The monitoring dashboard was failing with:
```
GET /api/monitoring/extraction-jobs?page=1&limit=20&sort_by=started_at&sort_order=desc
422 (Unprocessable Entity)
Error: "type must be one of the following values:"
```

## Root Cause

1. **Missing Required Parameter**: The backend `ResourceQueryDto` requires a `type` field with value `'extraction_job'`, `'chat_session'`, or `'frontend_session'`, but the frontend was not sending it.

2. **Pagination Mismatch**: The backend uses offset-based pagination (`limit` + `offset`), but the frontend was sending page-based parameters (`page` + `limit`).

## Solution

Updated `/apps/admin/src/api/monitoring.ts` in the `listExtractionJobs` method:

### Changes Made

1. **Added Required Type Parameter**:
   ```typescript
   // Required parameter: resource type
   queryParams.set('type', 'extraction_job');
   ```

2. **Converted Page-Based to Offset-Based Pagination**:
   ```typescript
   // Convert page-based to offset-based pagination
   const limit = params?.limit ?? 20;
   const page = params?.page ?? 1;
   const offset = (page - 1) * limit;
   
   queryParams.set('limit', limit.toString());
   queryParams.set('offset', offset.toString());
   ```

3. **Response Transformation**:
   ```typescript
   // Backend returns { items, total, limit, offset }
   // Convert to frontend format { items, total, page, page_size, has_more }
   const response = await fetchJson<{ items: ExtractionJobSummary[]; total: number; limit: number; offset: number }>(url);
   
   return {
       items: response.items,
       total: response.total,
       page: page,
       page_size: limit,
       has_more: offset + limit < response.total
   };
   ```

## Backend API Contract

### Request Query Parameters
```typescript
{
  type: 'extraction_job' | 'chat_session' | 'frontend_session';  // REQUIRED
  status?: string;
  date_from?: string;  // ISO 8601
  date_to?: string;    // ISO 8601
  limit?: number;      // 1-100, default 50
  offset?: number;     // default 0
}
```

### Response Format
```typescript
{
  items: ExtractionJobResourceDto[];
  total: number;
  limit: number;
  offset: number;
}
```

## Frontend API Contract (Maintained)

### Request Parameters
```typescript
{
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  source_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;        // 1-based page number (converted to offset)
  limit?: number;       // items per page
  sort_by?: 'started_at' | 'duration_ms' | 'total_cost_usd';
  sort_order?: 'asc' | 'desc';
}
```

### Response Format
```typescript
{
  items: ExtractionJobSummary[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}
```

## Testing

With Vite HMR enabled, the fix should be automatically hot-reloaded in the browser. Navigate to:
```
http://localhost:5175/admin/monitoring/dashboard
```

The dashboard should now successfully load extraction jobs without the 422 error.

## Related Files

- **Frontend API Client**: `/apps/admin/src/api/monitoring.ts`
- **Backend DTO**: `/apps/server/src/modules/monitoring/dto/resource-query.dto.ts`
- **Backend Controller**: `/apps/server/src/modules/monitoring/monitoring.controller.ts`

## Prevention

For future API endpoints:
1. Always verify required vs optional parameters in backend DTOs
2. Document pagination format (offset-based vs page-based) clearly
3. Consider adding request/response examples in OpenAPI/Swagger docs
4. Test API integration before frontend implementation
5. Use TypeScript strict mode to catch missing required fields

## Notes

- The `type` parameter is required because the backend uses the same DTO for multiple resource types (extraction jobs, chat sessions, frontend sessions)
- The pagination conversion ensures frontend components don't need to understand offset-based pagination
- Hot module replacement means no server restart needed - changes apply immediately
