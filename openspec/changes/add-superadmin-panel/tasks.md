# Tasks: Add Superadmin Panel

## 1. Database Schema

- [ ] 1.1 Create migration for `core.superadmins` table
- [ ] 1.2 Add `last_activity_at` column to `core.user_profiles`
- [ ] 1.3 Create `Superadmin` entity (`apps/server/src/entities/superadmin.entity.ts`)
- [ ] 1.4 Update `UserProfile` entity with `lastActivityAt` field
- [ ] 1.5 Create seed script for initial superadmin (CLI command)

## 2. Backend: Superadmin Module

- [ ] 2.1 Create `SuperadminModule` (`apps/server/src/modules/superadmin/`)
- [ ] 2.2 Implement `SuperadminService` with methods:
  - `isSuperadmin(userId: string): Promise<boolean>`
  - `getSuperadmins(): Promise<Superadmin[]>`
- [ ] 2.3 Create `SuperadminGuard` (`apps/server/src/common/guards/superadmin.guard.ts`)
- [ ] 2.4 Create `@Superadmin()` decorator for route protection
- [ ] 2.5 Write unit tests for SuperadminService
- [ ] 2.6 Write unit tests for SuperadminGuard

## 3. Backend: Activity Tracking

- [ ] 3.1 Create `ActivityTrackingMiddleware` (`apps/server/src/common/middleware/`)
- [ ] 3.2 Implement debounced activity update logic (60s TTL)
- [ ] 3.3 Register middleware in AppModule for authenticated routes
- [ ] 3.4 Write unit tests for ActivityTrackingMiddleware

## 4. Backend: View-As Impersonation

- [ ] 4.1 Create `ViewAsMiddleware` for `X-View-As-User-ID` header processing
- [ ] 4.2 Extend request type with `viewAsUser` and `superadminUser` properties
- [ ] 4.3 Update audit logging to include both actors when view-as is active
- [ ] 4.4 Add `_viewAs` metadata to responses when impersonating
- [ ] 4.5 Write integration tests for view-as flow

## 5. Backend: Superadmin API Endpoints

- [ ] 5.1 Create `SuperadminController` with base route `/superadmin`
- [ ] 5.2 Implement `GET /superadmin/users` endpoint
  - Pagination, search by name/email, filter by org
  - Include `lastActivityAt`, org memberships
- [ ] 5.3 Implement `GET /superadmin/organizations` endpoint
  - All orgs with member counts, project counts
- [ ] 5.4 Implement `GET /superadmin/projects` endpoint
  - Filter by org, include document counts
- [ ] 5.5 Implement `GET /superadmin/email-jobs` endpoint
  - Filter by status, recipient, date range
  - Pagination support
- [ ] 5.6 Implement `GET /superadmin/email-jobs/:id/preview` endpoint
  - Render template with stored data
  - Return HTML content type
- [ ] 5.7 Create DTOs for all endpoints
- [ ] 5.8 Add OpenAPI decorators and documentation
- [ ] 5.9 Write E2E tests for all superadmin endpoints

## 6. Frontend: Superadmin Layout

- [ ] 6.1 Create superadmin route group (`/admin/superadmin/*`)
- [ ] 6.2 Create `SuperadminLayout` component with navigation
- [ ] 6.3 Add superadmin link to main nav (visible only to superadmins)
- [ ] 6.4 Create `useSuperadmin()` hook to check superadmin status

## 7. Frontend: User Management

- [ ] 7.1 Create `SuperadminUsersPage` (`apps/admin/src/pages/admin/superadmin/users.tsx`)
- [ ] 7.2 Implement user table with columns:
  - Name, Email, Last Activity, Org Memberships, Actions
- [ ] 7.3 Add search input for name/email filtering
- [ ] 7.4 Add org filter dropdown
- [ ] 7.5 Add pagination controls
- [ ] 7.6 Add "View As" action button per user row

## 8. Frontend: Org/Project Browser

- [ ] 8.1 Create `SuperadminOrgsPage` (`apps/admin/src/pages/admin/superadmin/organizations.tsx`)
- [ ] 8.2 Implement org table with member/project counts
- [ ] 8.3 Add drill-down to projects within org
- [ ] 8.4 Create `SuperadminProjectsPage` for all projects view
- [ ] 8.5 Add ability to "jump to" project as superadmin

## 9. Frontend: Email History

- [ ] 9.1 Create `SuperadminEmailsPage` (`apps/admin/src/pages/admin/superadmin/emails.tsx`)
- [ ] 9.2 Implement email jobs table with columns:
  - Recipient, Subject, Template, Status, Sent At
- [ ] 9.3 Add status filter (pending, sent, failed)
- [ ] 9.4 Add date range filter
- [ ] 9.5 Add search by recipient email
- [ ] 9.6 Create preview modal with rendered HTML (sandboxed iframe)

## 10. Frontend: View-As UI

- [ ] 10.1 Create `ViewAsBanner` component (persistent top bar when impersonating)
- [ ] 10.2 Display impersonated user name and "Exit" button
- [ ] 10.3 Create `ViewAsContext` to manage impersonation state
- [ ] 10.4 Update API client to inject `X-View-As-User-ID` header when active
- [ ] 10.5 Add visual indicator on all pages when viewing-as

## 11. Testing

- [ ] 11.1 Write E2E tests: Superadmin can access all orgs/projects
- [ ] 11.2 Write E2E tests: Non-superadmin cannot access superadmin routes
- [ ] 11.3 Write E2E tests: View-as shows correct user context
- [ ] 11.4 Write E2E tests: Activity tracking updates timestamp
- [ ] 11.5 Write E2E tests: Email preview renders correctly
- [ ] 11.6 Write unit tests for frontend superadmin hooks

## 12. Documentation

- [ ] 12.1 Update `docs/spec/18-authorization-model.md` with superadmin role
- [ ] 12.2 Create `docs/guides/SUPERADMIN_GUIDE.md` for operators
- [ ] 12.3 Document CLI command for granting superadmin
- [ ] 12.4 Update OpenAPI spec with new endpoints
