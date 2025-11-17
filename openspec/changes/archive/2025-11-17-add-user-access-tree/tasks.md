## Implementation Tasks

### 1. Backend - Access Tree Endpoint

- [ ] 1.1 Create `UserAccessDto` and `OrgWithProjectsDto` in `apps/server/src/modules/user/dto/`
- [ ] 1.2 Create `UserAccessService` with `getAccessTree(userId: string)` method in `apps/server/src/modules/user/user-access.service.ts`
- [ ] 1.3 Implement optimized queries: one for org memberships with org details, one for project memberships with project details
- [ ] 1.4 Aggregate results into hierarchical structure (projects nested under orgs)
- [ ] 1.5 Add `GET /user/orgs-and-projects` endpoint to `UserController` (or create new controller)
- [ ] 1.6 Apply `@UseGuards(AuthGuard)` - no scope required, just authentication
- [ ] 1.7 Add OpenAPI documentation with response schema and examples
- [ ] 1.8 Write unit tests for UserAccessService (mock repositories)
- [ ] 1.9 Write E2E test for endpoint with multiple orgs/projects and different roles

### 2. Frontend - Hook Refactoring

- [ ] 2.1 Create `useAccessTree()` hook in `apps/admin/src/hooks/use-access-tree.ts`
- [ ] 2.2 Fetch from `GET /user/orgs-and-projects` endpoint
- [ ] 2.3 Return `{ orgs, projects, roles, loading, error }` with flattened project list
- [ ] 2.4 Update `useOrganizations()` to use access tree as data source (maintain backward compatibility)
- [ ] 2.5 Update `useProjects()` to use access tree as data source (maintain backward compatibility)
- [ ] 2.6 Add role lookup helpers: `getOrgRole(orgId)`, `getProjectRole(projectId)`

### 3. Frontend - Guard Simplification

- [ ] 3.1 Refactor `SetupGuard` to use `useAccessTree()` instead of separate hooks
- [ ] 3.2 Reduce validation logic - single loading state, single error state
- [ ] 3.3 Simplify auto-selection logic (no separate org/project validation loops)
- [ ] 3.4 Remove duplicate localStorage validation from `OrgAndProjectGate`
- [ ] 3.5 Update `OrgAndProjectGateRedirect` to use access tree
- [ ] 3.6 Test guard behavior with empty tree, single org, multiple orgs/projects

### 4. Testing & Validation

- [ ] 4.1 Run backend tests: `nx run server:test`
- [ ] 4.2 Run backend E2E tests: `nx run server:test-e2e`
- [ ] 4.3 Run frontend tests: `nx run admin:test`
- [ ] 4.4 Manual test: Create org/project flow with new hook
- [ ] 4.5 Manual test: Multi-org/project navigation with role display
- [ ] 4.6 Manual test: Empty state (no orgs) and single org/project state
- [ ] 4.7 Verify performance: Check network tab - 1 request instead of 2
- [ ] 4.8 Verify no localStorage race conditions on page refresh

### 5. Documentation

- [ ] 5.1 Update API documentation in OpenAPI spec
- [ ] 5.2 Add JSDoc comments to new service and DTOs
- [ ] 5.3 Document breaking changes (none - additive only)
- [ ] 5.4 Update frontend hook documentation with role access examples

## Dependencies

- Task 2 depends on Task 1 (backend must be complete before frontend integration)
- Task 3 depends on Task 2 (guards depend on hooks)
- Task 4 runs after all implementation tasks

## Parallelizable Work

- Tasks 1.8 and 1.9 can run in parallel (unit and E2E tests)
- Tasks 2.4 and 2.5 can run in parallel (updating both hooks)
- Tasks 3.1 and 3.5 can run in parallel (both guards can be updated simultaneously)
