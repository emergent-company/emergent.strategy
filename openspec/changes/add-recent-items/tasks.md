# Tasks: Add Recent Items Page

## 1. Database Schema

- [ ] 1.1 Create TypeORM entity `src/entities/user-recent-item.entity.ts`

  - Fields: id, user_id, project_id, resource_type, resource_id, resource_name, resource_subtype, action_type, accessed_at, created_at
  - Indexes: (user_id, project_id, accessed_at), (user_id, project_id, resource_type, resource_id) UNIQUE

- [ ] 1.2 Create TypeORM migration for `kb.user_recent_items` table

  - Run: `nx run server:typeorm migration:generate -- -n AddUserRecentItems`
  - Verify migration creates correct indexes and constraints

- [ ] 1.3 Run migration and verify table structure
  - Run: `nx run server:typeorm migration:run`
  - Verify: `SELECT * FROM information_schema.tables WHERE table_name = 'user_recent_items'`

## 2. Backend Service

- [ ] 2.1 Create user-activity module structure

  - `src/modules/user-activity/user-activity.module.ts`
  - `src/modules/user-activity/user-activity.service.ts`
  - `src/modules/user-activity/user-activity.controller.ts`
  - `src/modules/user-activity/dto/record-activity.dto.ts`
  - `src/modules/user-activity/dto/recent-items-query.dto.ts`

- [ ] 2.2 Implement UserActivityService

  - `recordActivity(userId, projectId, resourceType, resourceId, resourceName, resourceSubtype, actionType)` - UPSERT with async fire-and-forget
  - `getRecentItems(userId, projectId, resourceType?, limit)` - Query recent items
  - `pruneOldRecords(userId, projectId, maxItems)` - Keep only N most recent

- [ ] 2.3 Implement UserActivityController

  - `POST /user-activity/record` - Record new activity (protected, uses @Scopes)
  - `GET /user-activity/recent` - Get recent items (protected, uses @Scopes)
  - Add Swagger documentation with @ApiOperation, @ApiResponse

- [ ] 2.4 Add new scope `activity:write` and `activity:read` (or reuse existing scopes)

  - Update auth configuration if new scopes are needed
  - Or use existing `documents:read`, `graph:read` for retrieval

- [ ] 2.5 Register module in AppModule
  - Add UserActivityModule to imports

## 3. Activity Recording Integration

- [ ] 3.1 Add activity recording to DocumentsController

  - Record on `GET /documents/:id` (viewed)
  - Record on `PATCH /documents/:id` and `POST /documents` with file (edited)
  - Use fire-and-forget pattern (don't await)

- [ ] 3.2 Add activity recording to GraphController

  - Record on `GET /graph/objects/:id` (viewed)
  - Record on `PATCH /graph/objects/:id` and `POST /graph/objects` (edited)
  - Use fire-and-forget pattern

- [ ] 3.3 Create helper method for non-blocking recording
  - Wrap in setImmediate or process.nextTick
  - Log errors without failing main request

## 4. Frontend - Utility Functions

- [ ] 4.1 Create relative time formatting utility

  - `src/lib/format-relative-time.ts`
  - Use `Intl.RelativeTimeFormat` for browser-native i18n
  - Implement thresholds: just now, minutes, hours, yesterday, days, formatted date

- [ ] 4.2 Add unit tests for formatting utility
  - Test all time thresholds
  - Test edge cases (exactly 1 hour, exactly 24 hours, etc.)

## 5. Frontend - API Client

- [ ] 5.1 Create user-activity API client

  - `src/api/user-activity.ts`
  - `recordActivity(resourceType, resourceId, actionType)` - POST
  - `getRecentItems(resourceType?, limit?)` - GET

- [ ] 5.2 Add activity recording hooks to existing pages
  - Documents page: Call recordActivity on document detail open
  - Objects page: Call recordActivity on object modal open
  - Use fire-and-forget (no await on the API call)

## 6. Frontend - Recent Items Page

- [ ] 6.1 Create Recent Items page component

  - `src/pages/admin/recent/index.tsx`
  - Two separate tables: "Recent Objects" (first/top), "Recent Documents" (second/below)
  - Fixed at 10 items per table - no pagination needed

- [ ] 6.2 Implement Recent Objects table

  - Use DataTable component
  - Columns matching Objects page: Name, Type, Status, Relationships, Last Accessed
  - "Last Accessed" shows relative time + action badge (viewed/edited)

- [ ] 6.3 Implement Recent Documents table

  - Use DataTable component
  - Columns matching Documents page: Name, Type (mime), Chunks, Extraction Status, Last Accessed
  - "Last Accessed" shows relative time + action badge (viewed/edited)

- [ ] 6.4 Implement empty state

  - Per-table empty state when no items of that type
  - Full page empty state if no recent activity at all
  - Friendly message: "No recent items. Start browsing documents and objects to see them here."

- [ ] 6.5 Implement row click navigation

  - Objects: Open ObjectDetailModal with object ID
  - Documents: Navigate to `/admin/apps/documents?id=<docId>` or open in panel

- [ ] 6.6 Handle deleted items gracefully

  - Show row with visual indicator (muted/strikethrough)
  - On click, show toast "This item no longer exists"

- [ ] 6.7 Add loading states
  - Skeleton loaders while fetching
  - Error state with retry button

## 7. Frontend - Navigation

- [ ] 7.1 Add route for Recent Items page

  - Update `src/router/register.tsx`
  - Add `/admin/recent` route pointing to new page

- [ ] 7.2 Add sidebar navigation link
  - Update `src/pages/admin/layout.tsx` or sidebar component
  - Add "Recent" link with clock icon near Documents/Objects

## 8. Testing

- [ ] 8.1 Backend unit tests for UserActivityService

  - Test recordActivity UPSERT logic
  - Test getRecentItems with various filters
  - Test pruneOldRecords limit enforcement

- [ ] 8.2 Backend E2E tests for user-activity endpoints

  - Test POST /user-activity/record
  - Test GET /user-activity/recent with filters
  - Test authorization (requires valid token)

- [ ] 8.3 Frontend unit tests for Recent Items page

  - Test rendering with mock data
  - Test empty state
  - Test click handlers

- [ ] 8.4 Frontend E2E tests (Playwright)
  - Navigate to /admin/recent
  - Verify tables are displayed
  - Click row and verify navigation/modal

## 9. Documentation

- [ ] 9.1 Add API documentation in Swagger

  - Document new endpoints with examples
  - Document query parameters and response schema

- [ ] 9.2 Update CHANGELOG.md
  - Add entry for new Recent Items feature

## Dependencies and Parallelization

**Phase 1 (Parallelizable):**

- Tasks 1.1-1.3 (Database) - Required first
- Tasks 4.1-4.2 (Utility) - No dependencies

**Phase 2 (After Phase 1):**

- Tasks 2.1-2.5 (Backend Service) - Requires database
- Tasks 5.1-5.2 (API Client) - No backend dependency for interface

**Phase 3 (After Phase 2):**

- Tasks 3.1-3.3 (Recording Integration) - Requires backend service
- Tasks 6.1-6.5 (Page) - Requires API client

**Phase 4 (After Phase 3):**

- Tasks 7.1-7.2 (Navigation) - Requires page component
- Tasks 8.1-8.4 (Testing) - Requires all implementation

**Phase 5 (Final):**

- Task 9.1-9.2 (Documentation) - After all code complete
