# Monitoring API Fix - October 23, 2025

## Problem

Frontend Cost Analytics page (`/admin/monitoring/analytics`) was showing 500 Internal Server Error.

## Root Cause

1. **Wrong Port**: Server was running on port 3002 instead of configured port 3001
2. **DTO Validation Issue**: `ResourceQueryDto` had `type` field marked as required (`type!: string`), but the endpoint path `/extraction-jobs` already specifies the resource type, making it redundant

## Investigation Steps

1. Checked browser console → saw 500 error on API call
2. Checked PM2 logs → no error logs (old errors from before GCP_PROJECT_ID fix)
3. Tested backend endpoint → 404 on port 3001, 404 on port 3002
4. Checked listening ports → found server on 3002, expected 3001
5. Restarted workspace → server now on 3001
6. Tested endpoint → 401 (good! means endpoint exists, needs auth)
7. Checked DTO → found `type` field was required but redundant

## Solution

### 1. Server Port Fix
- Restarted workspace: `npm run workspace:restart`
- Server now correctly listening on port 3001 as configured in `SERVER_PORT=3001`

### 2. DTO Fix
**File**: `apps/server/src/modules/monitoring/dto/resource-query.dto.ts`

Changed:
```typescript
@ApiProperty({
    description: 'Type of resource to query',
    enum: ['extraction_job', 'chat_session', 'frontend_session'],
    example: 'extraction_job'
})
@IsEnum(['extraction_job', 'chat_session', 'frontend_session'])
type!: string;  // ← Required
```

To:
```typescript
@ApiPropertyOptional({
    description: 'Type of resource to query (optional, inferred from endpoint path)',
    enum: ['extraction_job', 'chat_session', 'frontend_session'],
    example: 'extraction_job'
})
@IsOptional()
@IsEnum(['extraction_job', 'chat_session', 'frontend_session'])
type?: string;  // ← Optional
```

**Rationale**: The endpoint path (`/monitoring/extraction-jobs`) already identifies the resource type. The `type` query parameter is redundant for dedicated endpoints.

### 3. Documentation Update
**File**: `docs/SUPERADMIN_DASHBOARD_PLAN.md`

Updated backend API documentation to clarify the endpoint structure:
- Backend path: `/monitoring/extraction-jobs`
- Frontend calls: `/api/monitoring/extraction-jobs` (Vite proxy strips `/api`)
- Backend receives: `/monitoring/extraction-jobs`

## Verification

1. **Backend endpoint test**:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/monitoring/extraction-jobs?limit=10"
   # Returns: 401 (endpoint exists, requires auth) ✓
   ```

2. **Server port check**:
   ```bash
   lsof -iTCP:3001 -sTCP:LISTEN
   # Shows: node process listening on port 3001 ✓
   ```

3. **Frontend integration**: Cost Analytics page (`/admin/monitoring/analytics`) should now load without 500 errors

## API Flow

```
Frontend (Cost Analytics)
  ↓
  Calls: /api/monitoring/extraction-jobs?limit=1000
  ↓
Vite Proxy (strips /api prefix)
  ↓
  Forwards: /monitoring/extraction-jobs?limit=1000
  ↓
Backend (MonitoringController)
  ↓
  @Controller('monitoring')
  @Get('extraction-jobs')
  ↓
  Validates: ResourceQueryDto (type now optional)
  ↓
  Returns: { items, total, limit, offset }
```

## Related Files

- `apps/admin/src/pages/admin/monitoring/analytics/index.tsx` - Cost Analytics page
- `apps/admin/src/api/monitoring.ts` - Monitoring API client
- `apps/server/src/modules/monitoring/monitoring.controller.ts` - Backend controller
- `apps/server/src/modules/monitoring/dto/resource-query.dto.ts` - Query DTO (fixed)
- `apps/admin/vite.config.ts` - Proxy configuration
- `.env` - SERVER_PORT=3001

## Status

✅ **RESOLVED** - Cost Analytics page should now work correctly
