# Tasks: Add Superadmin Panel

## 1. Database Schema

- [x] 1.1 Create migration for `core.superadmins` table
- [x] 1.2 Add `last_activity_at` column to `core.user_profiles`
- [x] 1.3 Create `Superadmin` entity (`apps/server/src/entities/superadmin.entity.ts`)
- [x] 1.4 Update `UserProfile` entity with `lastActivityAt` field
- [x] 1.5 Create seed script for initial superadmin (CLI command)

## 2. Backend: Superadmin Module

- [x] 2.1 Create `SuperadminModule` (`apps/server/src/modules/superadmin/`)
- [x] 2.2 Implement `SuperadminService` with methods:
  - `isSuperadmin(userId: string): Promise<boolean>`
  - `getSuperadmins(): Promise<Superadmin[]>`
- [x] 2.3 Create `SuperadminGuard` (`apps/server/src/modules/superadmin/superadmin.guard.ts`)
- [x] 2.4 Create `@Superadmin()` decorator for route protection
- [x] 2.5 Write unit tests for SuperadminService
- [x] 2.6 Write unit tests for SuperadminGuard

## 3. Backend: Activity Tracking

- [x] 3.1 Create `ActivityTrackingMiddleware` (`apps/server/src/modules/superadmin/activity-tracking.middleware.ts`)
- [x] 3.2 Implement debounced activity update logic (60s TTL)
- [x] 3.3 Register middleware in SuperadminModule for authenticated routes
- [x] 3.4 Write unit tests for ActivityTrackingMiddleware

## 4. Backend: View-As Impersonation

- [x] 4.1 Create `ViewAsMiddleware` for `X-View-As-User-ID` header processing
- [x] 4.2 Extend request type with `viewAsUser` and `superadminUser` properties
- [x] 4.3 Update audit logging to include both actors when view-as is active
- [x] 4.4 Add `_viewAs` metadata to responses when impersonating (via ViewAsResponseInterceptor)
- [x] 4.5 Write integration tests for view-as flow

## 5. Backend: Superadmin API Endpoints

- [x] 5.1 Create `SuperadminController` with base route `/superadmin`
- [x] 5.2 Implement `GET /superadmin/users` endpoint
  - Pagination, search by name/email, filter by org
  - Include `lastActivityAt`, org memberships
- [x] 5.3 Implement `GET /superadmin/organizations` endpoint
  - All orgs with member counts, project counts
- [x] 5.4 Implement `GET /superadmin/projects` endpoint
  - Filter by org, include document counts
- [x] 5.5 Implement `GET /superadmin/email-jobs` endpoint
  - Filter by status, recipient, date range
  - Pagination support
- [x] 5.6 Implement `GET /superadmin/email-jobs/:id/preview` endpoint
  - Render template with stored data
  - Return HTML content type
- [x] 5.7 Create DTOs for all endpoints
- [x] 5.8 Add OpenAPI decorators and documentation
- [x] 5.9 Write E2E tests for all superadmin endpoints

## 6. Frontend: Superadmin Layout

- [x] 6.1 Create superadmin route group (`/admin/superadmin/*`)
- [x] 6.2 Create `SuperadminLayout` component with navigation
- [x] 6.3 Add superadmin link to main nav (visible only to superadmins)
- [x] 6.4 Create `useSuperadmin()` hook to check superadmin status

## 7. Frontend: User Management

- [x] 7.1 Create `SuperadminUsersPage` (`apps/admin/src/pages/admin/superadmin/users.tsx`)
- [x] 7.2 Implement user table with columns:
  - Name, Email, Last Activity, Org Memberships, Actions
- [x] 7.3 Add search input for name/email filtering
- [x] 7.4 Add org filter dropdown
- [x] 7.5 Add pagination controls
- [x] 7.6 Add "View As" action button per user row

## 8. Frontend: Org/Project Browser

- [x] 8.1 Create `SuperadminOrgsPage` (`apps/admin/src/pages/admin/superadmin/organizations.tsx`)
- [x] 8.2 Implement org table with member/project counts
- [x] 8.3 Add drill-down to projects within org
- [x] 8.4 Create `SuperadminProjectsPage` for all projects view
- [x] 8.5 Add ability to "jump to" project as superadmin

## 9. Frontend: Email History

- [x] 9.1 Create `SuperadminEmailsPage` (`apps/admin/src/pages/admin/superadmin/emails.tsx`)
- [x] 9.2 Implement email jobs table with columns:
  - Recipient, Subject, Template, Status, Sent At
- [x] 9.3 Add status filter (pending, sent, failed)
- [x] 9.4 Add date range filter
- [x] 9.5 Add search by recipient email
- [x] 9.6 Create preview modal with rendered HTML (sandboxed iframe)

## 10. Frontend: View-As UI

- [x] 10.1 Create `ViewAsBanner` component (persistent top bar when impersonating)
- [x] 10.2 Display impersonated user name and "Exit" button
- [x] 10.3 Create `ViewAsContext` to manage impersonation state
- [x] 10.4 Update API client to inject `X-View-As-User-ID` header when active
- [x] 10.5 Add visual indicator on all pages when viewing-as

## 11. Testing

- [x] 11.1 Write E2E tests: Superadmin can access all orgs/projects
- [x] 11.2 Write E2E tests: Non-superadmin cannot access superadmin routes
- [x] 11.3 Write E2E tests: View-as shows correct user context
- [x] 11.4 Write E2E tests: Activity tracking updates timestamp
- [x] 11.5 Write E2E tests: Email preview renders correctly
- [x] 11.6 Write unit tests for frontend superadmin hooks

## 12. Documentation

- [x] 12.1 Update `docs/spec/18-authorization-model.md` with superadmin role
- [x] 12.2 Create `docs/guides/SUPERADMIN_GUIDE.md` for operators
- [x] 12.3 Document CLI command for granting superadmin
- [x] 12.4 Update OpenAPI spec with new endpoints
