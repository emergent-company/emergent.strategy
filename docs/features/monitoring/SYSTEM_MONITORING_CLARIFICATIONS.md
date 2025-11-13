# System Monitoring Dashboard - Clarifications & Updates

**Date**: October 22, 2025  
**Status**: Plan Updated, Ready for Implementation

## What Changed

### 1. Renamed from "Superadmin" to "System Monitoring"
- **Old Name**: Superadmin Dashboard (implied new role)
- **New Name**: System Monitoring Dashboard (admin feature)
- **Reason**: No new role needed - this is a monitoring feature for existing admins

### 2. Authorization Model Clarified
- **No New Role**: Uses existing `org_admin` and `project_admin` roles
- **No New Scopes**: Leverages existing scopes (`extraction:read`, `chat:use`, etc.)
- **Standard Guards**: Same `@UseGuards(AuthGuard, ScopesGuard)` pattern as other endpoints
- **Access Level**:
  - `org_admin`: See all monitoring data for their organization
  - `project_admin`: See monitoring data for their projects only

### 3. Database Schema Location
- **Decision**: All new tables in existing `kb` schema
- **No Separate Schema**: Keeps monitoring data alongside application data
- **Tables to Create**:
  - `kb.system_process_logs` - General process logging
  - `kb.llm_call_logs` - LLM request/response with cost tracking
  - `kb.mcp_tool_calls` - MCP tool execution for chat
  - `kb.frontend_logs` - Client-side error capture

### 4. Logging Architecture
- **Async Logging**: Acceptable - won't block main flows
- **Queue-Based**: Will use BullMQ/Redis if performance issues arise
- **Log Everything**: No PII redaction for now (debug-first approach)
- **Cost Calculation**: Hardcoded pricing table in code (`llm-pricing.config.ts`)

### 5. MVP Scope (Phase 1 Only)
- **Focus**: Extraction jobs monitoring only
- **What's Included**:
  - Job list with status/progress
  - Job detail view with logs
  - LLM call tracking with cost
  - Process event logging
- **What's Deferred**:
  - Chat session monitoring (Phase 2)
  - Frontend error tracking (Phase 3)
  - Analytics dashboard (Phase 4)

## Frontend Changes Made

### File Renames
```bash
apps/admin/src/pages/admin/superadmin/
  → apps/admin/src/pages/admin/monitoring/
```

### Route Updates
- **Old**: `/admin/superadmin/dashboard`
- **New**: `/admin/monitoring/dashboard`

### Sidebar Navigation
- **Section Title**: "System Monitoring" (was "Superadmin")
- **Icon**: `lucide--activity` (was `lucide--shield`)
- **Menu Items**: Currently just "Dashboard", more will be added per phase

## Backend Structure

### New Module: `MonitoringModule`
```
apps/server/src/modules/monitoring/
├── monitoring.module.ts          # Module registration, exports MonitoringLoggerService
├── monitoring.controller.ts      # API endpoints (GET resources, logs, etc.)
├── monitoring.service.ts         # Query business logic
├── monitoring-logger.service.ts  # Write service (injected into other modules)
├── config/
│   └── llm-pricing.config.ts    # Model pricing for cost calculation
├── dto/
│   ├── resource-query.dto.ts
│   ├── resource-detail.dto.ts
│   ├── log-entry.dto.ts
│   └── frontend-log.dto.ts
└── entities/
    ├── system-process-log.entity.ts
    ├── llm-call-log.entity.ts
    ├── mcp-tool-call.entity.ts
    └── frontend-log.entity.ts
```

### API Endpoints (Phase 1)
```
GET  /api/admin/monitoring/resources?type=extraction_job&limit=50&offset=0
GET  /api/admin/monitoring/resources/extraction_job/:id
GET  /api/admin/monitoring/resources/extraction_job/:id/logs?level=info
GET  /api/admin/monitoring/resources/extraction_job/:id/llm-calls
POST /api/admin/monitoring/client-logs  (Phase 3)
```

### Integration Points
`MonitoringLoggerService` will be injected into:
- `ExtractionJobService` - Log job lifecycle events
- `VertexAIProvider` - Log LLM calls with cost
- `ChatService` - Log chat sessions (Phase 2)
- `McpClientService` - Log tool calls (Phase 2)

## Key Decisions Summary

| Question | Decision |
|----------|----------|
| New role needed? | ❌ No - use existing `org_admin` / `project_admin` |
| New scopes needed? | ❌ No - reuse `extraction:read`, `chat:use`, etc. |
| Separate schema? | ❌ No - add tables to `kb` schema |
| Async logging OK? | ✅ Yes - acceptable for performance |
| MVP scope? | ✅ Extraction jobs only (Phase 1) |
| Log PII? | ✅ Yes - log everything for debugging |
| Cost calculation? | ✅ Hardcoded config file, updated monthly |

## Next Steps

1. **Create Database Migration** (Phase 1)
   - Tables: `kb.system_process_logs`, `kb.llm_call_logs`
   - Migration file: `apps/server/migrations/YYYYMMDD_monitoring_phase1.sql`

2. **Implement Backend** (Phase 1)
   - Create `MonitoringModule` structure
   - Implement `MonitoringLoggerService`
   - Inject into `ExtractionJobService` and `VertexAIProvider`
   - Create API endpoints

3. **Build Frontend Components** (Phase 1)
   - `ResourceTable` (reusable)
   - `DetailsSidePanel` (reusable)
   - `JobDetailsView` (specific)
   - Jobs list page at `/admin/monitoring/jobs`

4. **Test** (Phase 1)
   - Run extraction job
   - Verify logs captured in DB
   - Verify UI displays job details
   - Verify LLM costs calculated correctly

## Documentation Updated
- ✅ `docs/SUPERADMIN_DASHBOARD_PLAN.md` - Comprehensive rewrite
- ✅ `apps/admin/src/pages/admin/layout.tsx` - Sidebar updated
- ✅ `apps/admin/src/router/register.tsx` - Routes updated
- ✅ `apps/admin/src/pages/admin/monitoring/dashboard/index.tsx` - Page content updated

## Questions Resolved
1. ✅ **Authorization**: No new role, use existing admin roles
2. ✅ **Schema**: Add to `kb` schema, not separate
3. ✅ **Performance**: Async logging acceptable
4. ✅ **Scope**: Start with jobs only (MVP)
5. ✅ **Privacy**: Log everything for now

---

**Ready to implement Phase 1!** 🚀
