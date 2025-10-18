# Organization Identifier Cleanup Plan

## Background
- Legacy tables and DTOs use `org_id` (string/UUID) to reference organizations.
- Row-level security introduced canonical columns `organization_id` and `tenant_id` (UUID) but cleanup is incomplete.
- Several services fall back through `organization_id ?? tenant_id ?? org_id`, and some tables expose multiple columns simultaneously.
- There are no foreign key constraints from extraction job tables to `kb.orgs`, allowing drift and manual fixes.

## Goals
1. Provide a single canonical organization identifier column across the schema and codebase.
2. Enforce referential integrity back to `kb.orgs(id)`.
3. Remove legacy fallbacks (`org_id`, `tenant_id`) from runtime logic and API contracts.
4. Ensure migration is backwards compatible until data is converted and services deployed.

## Current Inventory
- **Database tables**
  - `kb.object_extraction_jobs`: columns `organization_id`, `tenant_id`; no FK; some code still selects `org_id` (deprecated shadow column exists in older dumps).
  - `kb.projects`, `kb.documents`, `kb.invites`, etc. still publish `org_id`.
- **TypeScript DTOs/services**
  - `ExtractionJobService`, `ExtractionWorkerService` map `organization_id`, `tenant_id`, `org_id` interchangeably.
  - OpenAPI docs expose `org_id` in multiple responses.
- **Tests & fixtures**
  - e2e specs insert into `org_id` columns explicitly.
  - Unit tests mock DTOs with `org_id` properties.

## Strategy Overview
We will migrate in controlled phases, preserving compatibility while progressively tightening constraints.

### Phase 0 – Prep & Tooling
- Add a lint task / script to grep for `org_id` usage to track progress.
- Document canonical naming (`organization_id`) in contributor guides.
- Communicate plan to team; schedule coordinated deployment window for constraint additions.

### Phase 1 – Code Path Normalisation
1. **Introduce helpers**
   - Add `getOrganizationId(row: WithOrgColumns)` utility returning `organization_id ?? tenant_id ?? org_id`.
   - Update services to call the helper so call sites are consistent.
2. **Update DTOs**
   - Deprecate `org_id` props in DTOs/Interfaces (mark optional, add JSDoc `@deprecated`).
   - Ensure new DTOs only emit `organization_id`.
3. **Adjust API Responses**
   - For routes still returning `org_id`, include both `organization_id` and `org_id` (alias) for transition; document in OpenAPI with `deprecated: true`.
4. **Tests**
   - Update mocks to prefer `organization_id`, leaving `org_id` only where old code still expects it.

### Phase 2 – Database Alignment
1. **Schema Audits**
   - Run `information_schema` queries (documented in script) to list tables containing `org_id`/`tenant_id` columns.
2. **Add canonical columns**
   - For each table lacking `organization_id`, add a new UUID column nullable with default from `org_id` cast.
3. **Backfill Data**
   - Migration script updates `organization_id = org_id` where null; log unknowns.
4. **Introduce FK constraints**
   - Add `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE` with `NOT VALID`, then `VALIDATE CONSTRAINT` after data fixes.
5. **Keep `org_id`**
   - Retain legacy column but mark read-only (optional: create trigger to keep parity until removal).

### Phase 3 – Application Update
1. **Switch reads/writes**
   - Update repositories/services to read/write `organization_id` exclusively.
   - Remove fallback logic once validation shows zero `org_id` references remaining.
2. **API Contract Clean-up**
   - Remove `org_id` from responses, update clients/SDKs.
   - Regenerate OpenAPI docs.
3. **Testing**
   - Run integration tests with RLS enabled to ensure contexts still apply.
   - Add regression tests verifying FK violations raise meaningful errors.

### Phase 4 – Legacy Column Removal
1. **Drop triggers/aliases** used to keep columns in sync.
2. **Delete `org_id` / `tenant_id` columns** after confirming no dependencies (migrations staged with feature flag if needed).
3. **Update documentation** (SETUP, DEV process) to remove legacy references.

## Risk Mitigation
- Ensure migrations run in a transaction per table to avoid partial state.
- Export database backup before dropping columns.
- Coordinate with analytics/reporting teams if they query `org_id`.
- Monitor error logs for FK violations post deployment.

## Milestones & Tracking
- Create Jira checklist per phase with owners.
- Add CI check failing if new `org_id` strings appear after Phase 1.
- Target completion: **Phase 1-2 within 2 sprints**, **Phase 3 within 4 sprints**, **Phase 4 after 30 days of clean telemetry**.

## Appendix
- Scripts: add `scripts/audit-org-columns.mjs` (Phase 0 action item).
- Related files: `DatabaseService.runWithTenantContext`, `ExtractionWorkerService`, `ExtractionJobService`.
- Reference docs: `.github/instructions/nestjs.instructions.md`, `SECURITY_SCOPES.md` (RLS compliance).
