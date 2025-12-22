# Change: Add Superadmin Panel

## Why

Platform operators need a way to oversee all organizations, projects, and users across the system without being explicitly added to each org/project. Current roles (org_admin, project_admin, project_user) are org/project-scoped, leaving no system-wide administrative capability. Additionally, operators need to diagnose user issues by viewing the platform from a user's perspective and review email delivery history.

## What Changes

### New System Role: Superadmin

- **BREAKING**: Introduces a new `superadmin` role that exists outside the org/project hierarchy
- New `core.superadmins` table to track superadmin grants with audit trail
- New `SuperadminGuard` that checks superadmin status before org/project membership

### User Activity Tracking

- Add `last_activity_at` column to `core.user_profiles`
- Activity tracking middleware updates timestamp on authenticated requests (debounced)
- Enables "last seen" display in superadmin user table

### View-As Impersonation

- New header `X-View-As-User-ID` for superadmin requests
- Backend resolves user context for the impersonated user
- All actions logged as superadmin (audit trail preserved)
- Frontend shows "Viewing as [User]" banner with exit option

### Superadmin Dashboard UI

- New route namespace: `/admin/superadmin/*`
- User management table (all users, search, filter, last activity)
- Organization/project browser (all orgs, all projects, navigate hierarchy)
- Email history with rendered preview (from existing `kb.email_jobs` table)

### API Endpoints

- `GET /superadmin/users` - List all users with activity timestamps
- `GET /superadmin/organizations` - List all organizations
- `GET /superadmin/projects` - List all projects (filterable by org)
- `GET /superadmin/email-jobs` - List email history with search/filter
- `GET /superadmin/email-jobs/:id/preview` - Rendered email preview

## Impact

- **Affected specs**:
  - `authentication` (modified: add view-as impersonation)
  - `superadmin-access` (new capability)
  - `user-activity-tracking` (new capability)
- **Affected code**:
  - `apps/server/src/entities/user-profile.entity.ts` - add `last_activity_at`
  - `apps/server/src/entities/` - new `superadmin.entity.ts`
  - `apps/server/src/modules/` - new `superadmin/` module
  - `apps/server/src/common/guards/` - new `SuperadminGuard`
  - `apps/server/src/common/middleware/` - activity tracking middleware
  - `apps/admin/src/pages/admin/superadmin/` - new dashboard pages
  - Database migrations for schema changes

## Security Considerations

- Superadmin grants require audit trail (who granted, when)
- View-as impersonation logged with clear audit markers
- Superadmin cannot be self-granted via API (requires direct DB or CLI)
- All superadmin actions tagged in logs for compliance review
