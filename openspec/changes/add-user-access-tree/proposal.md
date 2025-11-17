# Change: Add User Access Tree Endpoint

## Why

Currently, the frontend makes separate API calls to fetch organizations (`GET /orgs`) and projects (`GET /projects?orgId=X`), then manages complex state validation logic across multiple hooks and guard components (`SetupGuard`, `OrgAndProjectGate`, `useOrganizations`, `useProjects`). This creates:

- **N+1 query patterns**: Frontend must fetch orgs, then fetch projects for each org
- **State synchronization complexity**: Multiple hooks manage overlapping concerns (loading states, error handling, localStorage validation)
- **Guard/gate duplication**: `SetupGuard` (160 lines) and `OrgAndProjectGate` (200 lines) both validate org/project existence and handle auto-selection
- **Missing role information**: Frontend has no visibility into user's role within projects, requiring additional authorization checks

A single endpoint returning the complete access tree (orgs + nested projects + roles) simplifies frontend architecture and reduces round-trips.

## What Changes

- Add `GET /user/orgs-and-projects` endpoint returning hierarchical access tree
- Include user's role in each organization and project
- Simplify frontend guards to consume single tree response
- Keep existing `GET /orgs` and `GET /projects` endpoints for backward compatibility (non-breaking)
- Update frontend hooks to use tree endpoint as primary data source

## Impact

**Affected specs:**

- `user-access` (NEW) - Define access tree endpoint and response structure
- `authorization` (MODIFIED) - Document role-based membership queries

**Affected code:**

- Backend: `apps/server/src/modules/user/` (new controller/service)
- Frontend:
  - `apps/admin/src/hooks/use-organizations.ts` (simplified)
  - `apps/admin/src/hooks/use-projects.ts` (simplified)
  - `apps/admin/src/components/guards/SetupGuard.tsx` (simplified)
  - `apps/admin/src/components/organisms/OrgAndProjectGate/index.tsx` (simplified)

**Benefits:**

- Reduce API calls from 2 to 1 on initial load
- Eliminate localStorage validation race conditions (single source of truth)
- Reduce frontend guard logic by ~60% (consolidate validation)
- Enable role-based UI rendering without additional queries
- Improve performance with single optimized database query
