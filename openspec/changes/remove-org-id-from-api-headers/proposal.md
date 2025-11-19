# Remove Organization ID from API Headers

**Change ID:** `remove-org-id-from-api-headers`  
**Status:** ✅ Implemented  
**Created:** 2025-11-18  
**Implemented:** 2025-11-18

## Why

Currently, API requests require both `x-org-id` and `x-project-id` headers for tenant scoping. This dual-header approach creates several problems:

1. **Data Integrity Risk**: Clients can send mismatched org/project pairs (e.g., project A with organization B), leading to inconsistent or invalid tenant context
2. **Validation Overhead**: Backend must validate that the provided project actually belongs to the provided organization on every request
3. **Security Concern**: Accepting org ID from client headers creates potential for authorization bypass if validation is missed
4. **Unnecessary Complexity**: The project→organization relationship is already defined in the database via foreign key
5. **API Confusion**: Developers must remember to send both headers correctly, increasing cognitive load

The project ID alone is sufficient for tenant scoping because:
- Every project has exactly one organization (enforced by `projects.organization_id` foreign key)
- The organization can always be derived from the project via database lookup or join
- Row-Level Security (RLS) policies can use project ID alone or derive org ID server-side

## What Changes

**BREAKING CHANGE**: Remove `x-org-id` header requirement from all API endpoints

### Backend Changes
- Remove `x-org-id` header reading from all controllers
- Update `DatabaseService.runWithTenantContext()` to accept only `projectId` parameter
- Derive organization ID from project ID when needed (via database lookup or join)
- Update RLS context setting to derive org from project server-side
- Simplify tenant context validation logic

### Frontend Changes
- Remove `x-org-id` from `buildHeaders()` in `useApi` hook
- Remove `activeOrgId` from API request headers (keep in UI state for display only)
- Ensure all API calls use only `x-project-id` header

### Database/RLS Changes
- Verify RLS policies work correctly with project-only scoping
- Consider adding helper function to derive org from project for RLS policies if needed

## Impact

### Affected Specs
- `database-access` - Tenant context scoping changes

### Affected Code
- **Backend Controllers** (10+ files):
  - `documents.controller.ts`
  - `chat.controller.ts`
  - `graph.controller.ts`
  - `extraction-job.controller.ts`
  - `discovery-job.controller.ts`
  - `integrations.controller.ts`
  - `mcp-server.controller.ts`
  - `template-pack.controller.ts`
  - `type-registry.controller.ts`
  - All other controllers reading `x-org-id` header

- **Backend Services**:
  - `database.service.ts` - `runWithTenantContext()` signature
  - All services calling `runWithTenantContext()`

- **Frontend**:
  - `apps/admin/src/hooks/use-api.ts` - `buildHeaders()` method
  - API client modules (if any directly set headers)

### Migration Notes
- **Breaking API Change**: Clients sending `x-org-id` will need to stop sending it
- Internal services and tests must be updated
- Frontend deployment must be synchronized with backend deployment

## Benefits

1. **Simpler API**: Single source of truth for tenant context
2. **Reduced Error Surface**: Impossible to send mismatched org/project pairs
3. **Better Security**: Server-side derivation of org from project prevents client manipulation
4. **Cleaner Code**: Less header parsing, less validation logic
5. **Easier Testing**: Test setup requires one less parameter

## Alternatives Considered

### Alternative 1: Keep both headers but validate relationship
**Rejected**: Adds validation overhead to every request; doesn't eliminate root cause of confusion

### Alternative 2: Make org-id optional and validate when present
**Rejected**: Optional parameters increase complexity and don't prevent misuse; partial solution

### Alternative 3: Require org-id and derive project from org+name
**Rejected**: Projects are the primary tenant scope in this system; reversing the relationship doesn't match the domain model

## Implementation Approach

### Phase 1: Backend Preparation
1. Add helper method to derive org ID from project ID in DatabaseService
2. Update `runWithTenantContext()` to accept only `projectId`, derive `orgId` internally
3. Add deprecation warning for `x-org-id` header (log when present but don't fail)

### Phase 2: Backend Migration
1. Update all controllers to stop reading `x-org-id` header
2. Update all service calls to pass only `projectId`
3. Verify RLS policies work correctly with new approach
4. Update tests to remove org ID from request headers

### Phase 3: Frontend Migration
1. Remove `x-org-id` from `buildHeaders()`
2. Verify all API calls still work (project ID is already required)
3. Update any API client utilities

### Phase 4: Cleanup
1. Remove deprecation warning
2. Update API documentation
3. Update OpenAPI spec

## Dependencies

- No external dependencies
- Requires database migration if RLS policies need adjustment
- Frontend and backend deployments should be coordinated

## Success Criteria

- ✅ No API endpoint reads `x-org-id` header
- ✅ All tenant context is established using project ID only
- ✅ Organization ID correctly derived from project ID when needed
- ✅ RLS policies correctly enforce access control with project-only context
- ✅ Frontend sends only `x-project-id` header
- ✅ All tests pass with updated header structure
- ✅ API documentation reflects header changes

## Risks and Mitigation

### Risk: Performance impact from additional project→org lookups
**Likelihood**: Low  
**Mitigation**: 
- Cache project→org mappings in memory with short TTL
- Use database joins when fetching related data (minimal overhead)
- Most services already load project entity for validation

### Risk: RLS policies may depend on both org and project context
**Likelihood**: Medium  
**Mitigation**: 
- Audit all RLS policies before migration
- Create database function to derive org from project for RLS if needed
- Test RLS behavior thoroughly in staging

### Risk: Breaking change disrupts external API consumers
**Likelihood**: Low  
**Mitigation**: 
- This appears to be an internal API (no public consumers identified)
- Coordinate frontend/backend deployments
- Add deprecation period with warning logs if needed

## Related Changes

- Complements recent work on RLS tenant context (fixing "disappearing documents" bug)
- Simplifies the tenant isolation pattern established in `database-access` spec
