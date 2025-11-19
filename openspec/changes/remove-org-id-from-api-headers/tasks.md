## 1. Backend Preparation

- [ ] 1.1 Add `getOrgIdFromProjectId(projectId)` helper method to `DatabaseService`
- [ ] 1.2 Update `DatabaseService.runWithTenantContext()` signature to accept only `projectId` (breaking change)
- [ ] 1.3 Update `runWithTenantContext()` implementation to derive `orgId` from `projectId` internally
- [ ] 1.4 Add unit tests for org derivation logic

## 2. Backend Service Layer Updates

- [ ] 2.1 Update `DocumentsService` calls to `runWithTenantContext()` (remove orgId parameter)
- [ ] 2.2 Update `GraphService` calls to `runWithTenantContext()` (remove orgId parameter)
- [ ] 2.3 Update `ExtractionJobService` calls to `runWithTenantContext()` (remove orgId parameter)
- [ ] 2.4 Update `IngestionService` calls to `runWithTenantContext()` (remove orgId parameter)
- [ ] 2.5 Update `ProjectsService` calls to `runWithTenantContext()` (remove orgId parameter)
- [ ] 2.6 Update `MCPToolSelectorService` calls to `runWithTenantContext()` (remove orgId parameter)
- [ ] 2.7 Update `ExtractionWorkerService` calls to `runWithTenantContext()` (remove orgId parameter)

## 3. Backend Controller Updates

- [ ] 3.1 Update `DocumentsController` - remove all `x-org-id` header reads
- [ ] 3.2 Update `ChatController` - remove all `x-org-id` header reads
- [ ] 3.3 Update `GraphController` - remove all `x-org-id` header reads
- [ ] 3.4 Update `TagController` - remove all `x-org-id` header reads
- [ ] 3.5 Update `ProductVersionController` - remove all `x-org-id` header reads
- [ ] 3.6 Update `ExtractionJobController` - remove all `x-org-id` header reads
- [ ] 3.7 Update `DiscoveryJobController` - remove all `x-org-id` header reads
- [ ] 3.8 Update `IntegrationsController` - remove all `x-org-id` header reads
- [ ] 3.9 Update `MCPServerController` - remove all `x-org-id` header reads
- [ ] 3.10 Update `TemplatePackController` - remove all `x-org-id` header reads
- [ ] 3.11 Update `TypeRegistryController` - remove all `x-org-id` header reads
- [ ] 3.12 Update `MonitoringController` - remove all `x-org-id` header reads
- [ ] 3.13 Update `HttpExceptionFilter` - remove `x-org-id` from error context if present

## 4. Database and RLS Verification

- [ ] 4.1 Audit all RLS policies to verify they work with project-only context
- [ ] 4.2 Create database helper function `kb.get_org_from_project(project_id)` if needed by RLS
- [ ] 4.3 Test RLS policies with project-only context in development environment
- [ ] 4.4 Update RLS policies if needed to use derived org ID

## 5. Frontend Updates

- [ ] 5.1 Update `buildHeaders()` in `use-api.ts` to remove `x-org-id`
- [ ] 5.2 Verify `activeOrgId` is still used for UI display purposes (don't remove from config)
- [ ] 5.3 Check all direct `fetch()` calls for hardcoded `x-org-id` headers
- [ ] 5.4 Update API client utilities if any exist

## 6. Testing Updates

- [ ] 6.1 Update backend unit tests to remove `x-org-id` from mock requests
- [ ] 6.2 Update backend E2E tests to remove `x-org-id` from API calls
- [ ] 6.3 Update frontend E2E tests to verify API calls work without `x-org-id`
- [ ] 6.4 Add integration test verifying org is correctly derived from project
- [ ] 6.5 Add test for RLS policies with project-only context

## 7. Documentation and OpenAPI

- [ ] 7.1 Update OpenAPI spec to remove `x-org-id` parameter from all endpoints
- [ ] 7.2 Regenerate OpenAPI specification (`npm run gen:openapi`)
- [ ] 7.3 Update OpenAPI golden scope contract tests
- [ ] 7.4 Update OpenAPI regression hash
- [ ] 7.5 Update OpenAPI snapshot for E2E tests
- [ ] 7.6 Update API documentation/README files mentioning headers

## 8. Verification and Deployment

- [ ] 8.1 Run all unit tests (`nx run server:test` and `nx run admin:test`)
- [ ] 8.2 Run all E2E tests (`nx run server:test-e2e` and `nx run admin:e2e`)
- [ ] 8.3 Manual testing: Create/read/update/delete operations across all modules
- [ ] 8.4 Manual testing: Verify RLS correctly filters data by project
- [ ] 8.5 Manual testing: Verify org-scoped operations (if any) still work
- [ ] 8.6 Build verification: `npm run build` succeeds
- [ ] 8.7 Lint verification: `nx run server:lint` and `nx run admin:lint` pass
- [ ] 8.8 Deploy backend and frontend together (coordinated deployment)
- [ ] 8.9 Monitor logs for errors after deployment
- [ ] 8.10 Verify production functionality across all tenant-scoped operations
