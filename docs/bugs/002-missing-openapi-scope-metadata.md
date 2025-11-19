# Bug: Missing OpenAPI Scope Metadata (x-required-scopes)

**Date**: 2024-11-19  
**Status**: 🔍 Documented (Not Fixed)  
**Severity**: Low  
**Type**: Documentation / OpenAPI Metadata  

## Summary

49 secured API endpoints are missing `x-required-scopes` metadata in the OpenAPI specification because they lack method-level `@Scopes()` decorators.

## Problem

### Test Failure
```
❌ tests/e2e/openapi.scopes-completeness.e2e.spec.ts
Error: Secured operations missing x-required-scopes: (49 endpoints)
```

### Root Cause

Endpoints use controller-level or method-level authentication guards (`@UseGuards(AuthGuard, ScopesGuard)`) but don't declare their required scopes using the `@Scopes()` decorator.

**Example** (`apps/server/src/modules/user-profile/user-profile.controller.ts`):
```typescript
@Controller('user/profile')
@UseGuards(AuthGuard, ScopesGuard)  // ← Guards present
export class UserProfileController {
  @Get()
  // ❌ Missing @Scopes('profile:read') decorator
  async getSelf(@Req() req: any) {
    // ...
  }
}
```

The OpenAPI generation script (`apps/server/src/openapi-generate.ts`) extracts scopes from `@Scopes()` decorator metadata using Reflect API. Without the decorator, it cannot add `x-required-scopes` to the OpenAPI spec.

## Affected Endpoints (49 total)

### Auth Module
- `GET /auth/me` - `AuthController.me`
- `GET /auth/test-passport` - `AuthController.testPassport`

### User Profile Module  
- `GET /user/profile` - `UserProfileController.getSelf`
- `PUT /user/profile` - `UserProfileController.updateSelf`
- `GET /user/profile/emails` - `UserProfileController.listEmails`
- `POST /user/profile/emails` - `UserProfileController.addEmail`
- `DELETE /user/profile/emails/:email` - `UserProfileController.removeEmail`

### User Module
- `GET /user/orgs-and-projects` - `UserController.getOrgsAndProjects`
- `DELETE /user/account` - `UserController.deleteAccount`
- `DELETE /user/test-cleanup` - `UserController.testCleanup`

### Organizations Module
- `GET /orgs` - `OrgsController.list`

### Settings Module
- `GET /settings` - `SettingsController.list`
- `GET /settings/:key` - `SettingsController.getOne`
- `PUT /settings/:key` - `SettingsController.update`

### Extraction Jobs Module (13 endpoints)
- `POST /admin/extraction-jobs` - `ExtractionJobController.createJob`
- `GET /admin/extraction-jobs/projects/:projectId` - `ExtractionJobController.listJobs`
- `GET /admin/extraction-jobs/:jobId` - `ExtractionJobController.getJob`
- `PATCH /admin/extraction-jobs/:jobId` - `ExtractionJobController.updateJob`
- `DELETE /admin/extraction-jobs/:jobId` - `ExtractionJobController.deleteJob`
- `POST /admin/extraction-jobs/:jobId/retry` - `ExtractionJobController.retryJob`
- `POST /admin/extraction-jobs/:jobId/cancel` - `ExtractionJobController.cancelJob`
- `POST /admin/extraction-jobs/projects/:projectId/bulk-cancel` - `ExtractionJobController.bulkCancelJobs`
- `DELETE /admin/extraction-jobs/projects/:projectId/bulk-delete` - `ExtractionJobController.bulkDeleteJobs`
- `POST /admin/extraction-jobs/projects/:projectId/bulk-retry` - `ExtractionJobController.bulkRetryJobs`
- `GET /admin/extraction-jobs/projects/:projectId/statistics` - `ExtractionJobController.getStatistics`
- `GET /admin/extraction-jobs/_debug/available-models` - `ExtractionJobController.listAvailableModels`
- `GET /admin/extraction-jobs/:jobId/logs` - `ExtractionJobController.getExtractionLogs`

### Extraction Job Details Module (4 endpoints)
- `GET /admin/extraction-jobs/jobs` - `listExtractionJobs`
- `GET /admin/extraction-jobs/:jobId/detail` - `getExtractionJobDetail`  
- `GET /admin/extraction-jobs/:jobId/execution-logs` - `getExtractionJobLogs`
- `GET /admin/extraction-jobs/:jobId/llm-calls` - `getExtractionJobLLMCalls`

### Notifications Module (8 endpoints)
- `GET /notifications` - `NotificationsController.getNotifications`
- `DELETE /notifications/clear-all` - `NotificationsController.clearAll`
- `GET /notifications/unread-counts` - `NotificationsController.getUnreadCounts`
- `GET /notifications/stats` - `NotificationsController.getStats`
- `PATCH /notifications/:id/mark-read` - `NotificationsController.markRead`
- `PATCH /notifications/:id/mark-unread` - `NotificationsController.markUnread`
- `DELETE /notifications/:id/dismiss` - `NotificationsController.dismiss`
- `DELETE /notifications/:id/clear` - `NotificationsController.clear`
- `PATCH /notifications/:id/unclear` - `NotificationsController.unclear`
- `POST /notifications/:id/snooze` - `NotificationsController.snooze`
- `DELETE /notifications/:id/unsnooze` - `NotificationsController.unsnooze`

### Graph Search Module
- `POST /graph/search` - `GraphSearchController.search`

### Integrations Module (9 endpoints)
- `GET /integrations/_available` - `IntegrationsController.listAvailableIntegrations`
- `GET /integrations` - `IntegrationsController.listIntegrations`
- `POST /integrations` - `IntegrationsController.createIntegration`
- `GET /integrations/:id` - `IntegrationsController.getIntegration`
- `PATCH /integrations/:id` - `IntegrationsController.updateIntegration`
- `DELETE /integrations/:id` - `IntegrationsController.deleteIntegration`
- `GET /integrations/:id/public` - `IntegrationsController.getPublicIntegrationInfo`
- `POST /integrations/:id/test-connection` - `IntegrationsController.testConnection`
- `POST /integrations/:id/trigger-sync-stream` - `IntegrationsController.triggerSyncStream`
- `POST /integrations/:id/trigger-sync` - `IntegrationsController.triggerSync`

### ClickUp Module (3 endpoints)
- `GET /integrations/clickup/workspace-structure` - `ClickUpController.getClickUpWorkspaceStructure`
- `GET /integrations/clickup/space/:spaceId` - `ClickUpController.getClickUpSpace`
- `GET /integrations/clickup/folder/:folderId` - `ClickUpController.getClickUpFolder`

### MCP Module (3 endpoints)
- `GET /mcp/schema/version` - `McpServerController.getSchemaVersion`
- `GET /mcp/schema/changelog` - `McpServerController.getSchemaChangelog`
- `POST /mcp/rpc` - `McpServerController.handleRpc`

## Impact

### Security Impact
**Low** - Endpoints ARE still protected by authentication and authorization guards at runtime. The scopes are enforced by `ScopesGuard` even without the decorator.

### Documentation Impact
**Medium** - OpenAPI spec is incomplete. Consumers cannot discover required scopes from the API documentation.

### Testing Impact
**Low** - One E2E test fails, but it's a metadata validation test, not a functional test.

## Recommended Fix

Add `@Scopes(...)` decorators to all affected endpoints based on their access patterns:

### Scope Assignment Guidelines

| Endpoint Pattern | Suggested Scope | Rationale |
|---|---|---|
| User profile read | `profile:read` or `user:read` | Self-service user data |
| User profile write | `profile:write` or `user:write` | Self-service mutations |
| Organization list | `org:read` | Organization visibility |
| Extraction jobs | `extraction:read`, `extraction:write` | Already used in codebase |
| Notifications | `notifications:read`, `notifications:write` | Already documented |
| Integrations | `integrations:read`, `integrations:write` | Integration management |
| MCP endpoints | `schema:read`, `data:read`, `mcp:admin` | Already documented in SECURITY_SCOPES.md |

### Example Fix

**Before:**
```typescript
@Controller('user/profile')
@UseGuards(AuthGuard, ScopesGuard)
export class UserProfileController {
  @Get()
  async getSelf(@Req() req: any) { ... }
}
```

**After:**
```typescript
@Controller('user/profile')
@UseGuards(AuthGuard, ScopesGuard)
export class UserProfileController {
  @Get()
  @Scopes('profile:read')  // ← Add decorator
  async getSelf(@Req() req: any) { ... }
}
```

## Steps to Fix

1. **Define scope model** - Document all required scopes in `SECURITY_SCOPES.md`
2. **Add @Scopes() decorators** - Add to all 49 affected endpoints
3. **Regenerate OpenAPI** - Run `npm --prefix apps/server run gen:openapi`
4. **Update test tokens** - Ensure E2E test tokens include all scopes
5. **Verify** - Run `nx run server:test-e2e -- --testPathPattern=openapi.scopes-completeness`

## Why Not Fix Now?

This fix requires:
- **Scope model decisions** - Need product/security review of scope granularity
- **Breaking changes** - Adding scopes may break existing API consumers
- **Comprehensive testing** - All 49 endpoints need E2E test verification
- **Token updates** - May require Zitadel configuration updates

**Estimated effort**: 2-4 hours (not including scope model design)

## Workaround

The test can be temporarily skipped or updated to allow endpoints without scopes if they're intentionally public or using implicit scopes.

## Related Files

- `apps/server/src/openapi-generate.ts` - OpenAPI scope extraction
- `apps/server/src/modules/auth/scopes.decorator.ts` - Scopes decorator
- `apps/server/src/modules/auth/scopes.guard.ts` - Runtime scope enforcement
- `apps/server/tests/e2e/openapi.scopes-completeness.e2e.spec.ts` - Failing test
- `SECURITY_SCOPES.md` - Scope documentation

## References

- [NestJS Custom Decorators](https://docs.nestjs.com/custom-decorators)
- [OpenAPI Security Requirements](https://swagger.io/specification/#security-requirement-object)
