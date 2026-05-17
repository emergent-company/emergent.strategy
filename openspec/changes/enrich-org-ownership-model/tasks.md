## 1. Database Migration

- [x] 1.1 Create migration `017_enrich_orgs.sql`: add `org_number TEXT`, `country TEXT NOT NULL DEFAULT 'NO'`, `website TEXT`, `logo_url TEXT`, `twentyfirst_id INTEGER` to `orgs` table
- [x] 1.2 Add unique index on `orgs(twentyfirst_id)` WHERE `twentyfirst_id IS NOT NULL`
- [x] 1.3 Add unique index on `orgs(org_number, country)` WHERE `org_number != '' AND deleted_at IS NULL`
- [x] 1.4 Backfill `workspaces.org_id`: insert Default org if any NULL rows exist, UPDATE all NULL rows, ALTER COLUMN SET NOT NULL
- [x] 1.5 Write goose Down migration to reverse all changes

## 2. Domain Model Updates

- [x] 2.1 Add `OrgNumber`, `Country`, `Website`, `LogoURL`, `TwentyfirstID` fields to `domain.Org` struct in `internal/domain/models.go`
- [x] 2.2 Change `Workspace.OrgID` from `*uuid.UUID` to `uuid.UUID` (non-nullable)
- [x] 2.3 Update `workspace.CreateWorkspace` to accept `orgID uuid.UUID` parameter (required)

## 3. Org Service Enhancements

- [x] 3.1 Add `GetByName(ctx, name string)` method — case-insensitive lookup
- [x] 3.2 Add `GetOrCreate(ctx, name string, callerID uuid.UUID)` method — find by name or create with auto-slug
- [x] 3.3 Update `Create` to accept optional enrichment fields (org_number, country, website)
- [x] 3.4 Add `Update(ctx, org *Org)` method for editing org metadata
- [x] 3.5 Write tests for new methods

## 4. Workspace Service Updates

- [x] 4.1 Update `CreateWorkspace` signature: `orgID uuid.UUID` parameter (required, no pointer)
- [x] 4.2 Remove `SetOrgID` method (no longer needed — org_id is set at creation)
- [x] 4.3 Update all callers of `CreateWorkspace` to pass org_id
- [x] 4.4 Update workspace tests

## 5. CLI Import Updates

- [x] 5.1 Add `--org` flag to import config (string: org name or UUID)
- [x] 5.2 Add `--org-number` and `--country` flags for org enrichment
- [x] 5.3 Extract `north_star.organization` from parsed artifacts as fallback org name
- [x] 5.4 Implement org resolution chain: `--org` flag > `north_star.organization` > workspace `github_owner`
- [x] 5.5 Call `orgSvc.GetOrCreate()` with resolved name, pass result to `CreateWorkspace`
- [x] 5.6 Wire org service in `cmd_import.go`

## 6. MCP Tool Updates

- [x] 6.1 Add required `org_id` parameter to `create_workspace` tool
- [x] 6.2 Remove auto-pick-first-org logic from `create_workspace` handler
- [x] 6.3 Add `assign_workspace_to_org` tool in `register_org_tools.go`
- [x] 6.4 Add optional `org_number`, `country`, `website` params to `create_org` tool
- [x] 6.5 Add `update_org` tool for editing org metadata
- [x] 6.6 Update `import_instance` tool description to clarify it creates an empty instance

## 7. Dev Mode Startup

- [x] 7.1 Call `orgSvc.EnsureDevOrg(ctx, devUserID)` in `cmd_serve.go` dev user seeding
- [x] 7.2 After dev org creation, adopt orphan workspaces: `UPDATE workspaces SET org_id = ? WHERE org_id IS NULL`
- [x] 7.3 Test dev startup flow with existing database

## 8. Web UI Updates

- [x] 8.1 Update `loadInstanceSummaries` to include org name (join through workspace -> org)
- [x] 8.2 Update `InstanceSummary` struct to include `OrgName` and `OrgID`
- [x] 8.3 Update `BuildSidebarGroups` to group strategies by org
- [x] 8.4 Update sidebar template to render org sections with strategy links underneath
- [x] 8.5 Update global dashboard to show org names on instance cards

## 9. Tests and Validation

- [x] 9.1 Run full test suite — confirm no regressions from model changes
- [x] 9.2 Run lint — confirm no new blocking findings
- [x] 9.3 Test CLI import with `--org` flag against a local EPF instance
- [x] 9.4 Test dev mode startup with fresh database (org auto-created)
- [x] 9.5 Test dev mode startup with existing database (orphan workspaces adopted)
